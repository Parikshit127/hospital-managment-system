/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ─── MIS Daily Rollup Cron Worker ────────────────────────────────────────────
 * Route  : GET /api/cron/mis-rollup
 * Vercel : schedule "30 18 * * *" (UTC) = 00:00 IST — runs at midnight local
 *
 * What it does
 * ─────────────
 * For each active organization, aggregates "yesterday"'s billing and pharmacy
 * data from the live transactional tables and UPSERTS it into the two rollup
 * tables:
 *   • mis_daily_billing_rollups  (unique: orgId + report_date + department + payer_type)
 *   • mis_daily_pharmacy_rollups (unique: orgId + report_date + order_type)
 *
 * The rollup tables are then consumed by the MIS reports when date_range > 7 days
 * to avoid full-table scans across millions of invoice/pharmacy_order rows.
 *
 * Schema truth (verified against prisma/schema.prisma):
 *   invoices          : total_amount(Decimal), billing_patient_type(String), status(String),
 *                       doctor_id(String?), created_at(DateTime), organizationId
 *   payments          : amount(Decimal), invoice_id(Int), status(String), organizationId
 *   users             : department(String?), specialty(String?)
 *   pharmacy_orders   : total_amount(Float), is_ipd_linked(Boolean), status(String),
 *                       created_at(DateTime), organizationId
 *   pharmacy_returns  : quantity(Int), unit_cost(Float?), return_type(String),
 *                       original_invoice_id(Int?), created_at(DateTime), organizationId
 *   Organization      : id(String), is_active(Boolean)
 *   OrganizationConfig: timezone(String, default "Asia/Kolkata")
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/backend/db';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the [startOfDay, endOfDay] UTC boundaries for "yesterday" in the
 * org's configured timezone.
 *
 * Node.js's Intl.DateTimeFormat provides a reliable way to determine the UTC
 * offset for any IANA timezone name at a specific point in time (handles DST).
 */
function getYesterdayBoundaries(timezone: string): { dayStart: Date; dayEnd: Date; reportDate: Date } {
  const now = new Date();

  // Build a formatter that gives us the local date parts in the org's timezone
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Today's date string in tz, e.g. "2026-06-15"
  const todayStr = fmt.format(now);
  const [year, month, day] = todayStr.split('-').map(Number);

  // Construct midnight of "today" in the target timezone by building an ISO string
  // and parsing it — but we need the UTC equivalent. We do this by finding the
  // UTC offset at that moment using the reliable getTimezoneOffset-equivalent trick.
  const todayMidnightLocal = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);

  // We need the actual UTC time that corresponds to 00:00:00 in the target tz.
  // Strategy: use the offset computed from the difference between the UTC date
  // string and the localised date string at a reference point.
  const utcOffsetMs = getUTCOffsetMs(timezone, now);

  // midnight today in tz = UTC midnight - utcOffsetMs? No. Correct is:
  // local midnight UTC equivalent = UTC time where (UTC + utcOffsetMs) = local midnight.
  // local midnight = today 00:00 tz
  // UTC equiv of local midnight today = today 00:00 tz - utcOffsetMs
  const todayMidnightUTC = new Date(
    Date.UTC(year, month - 1, day) - utcOffsetMs
  );

  const yesterdayStartUTC = new Date(todayMidnightUTC.getTime() - 86_400_000); // -1 day
  const yesterdayEndUTC = new Date(todayMidnightUTC.getTime() - 1);            // 1ms before today midnight

  // report_date: the calendar date of yesterday in the org's timezone
  const reportDate = new Date(yesterdayStartUTC.getTime() + utcOffsetMs);
  // Normalize to a date-only value — use midnight UTC of that day
  const [ry, rm, rd] = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })
    .format(reportDate)
    .split('-')
    .map(Number);
  const reportDateOnly = new Date(Date.UTC(ry, rm - 1, rd));

  return {
    dayStart: yesterdayStartUTC,
    dayEnd: yesterdayEndUTC,
    reportDate: reportDateOnly,
  };
}

/**
 * Returns the UTC offset in milliseconds for a given timezone at a reference time.
 * Positive values mean the timezone is ahead of UTC (e.g. IST = +5:30 = +19_800_000).
 */
function getUTCOffsetMs(timezone: string, refDate: Date): number {
  // The trick: format the date in UTC and in the target tz, parse both, diff them.
  const utcStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(refDate);

  const tzStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(refDate);

  const utcParsed = new Date(utcStr.replace(',', '').replace(' ', 'T') + 'Z');
  const tzParsed = new Date(tzStr.replace(',', '').replace(' ', 'T') + 'Z');

  return tzParsed.getTime() - utcParsed.getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rollup aggregation functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates yesterday's billing data into mis_daily_billing_rollups.
 *
 * Grouped by: department (from users.department/specialty) + payer_type (billing_patient_type).
 * total_collected reads from the payments table joined to invoices for the same day
 * (payments are typically recorded same day, so we filter by payments.created_at on the
 * same day to avoid double-counting advance payments from other days).
 *
 * Uses raw UPSERT (INSERT ... ON CONFLICT DO UPDATE) for idempotent runs.
 */
async function upsertBillingRollup(
  orgId: string,
  dayStart: Date,
  dayEnd: Date,
  reportDate: Date
): Promise<number> {
  // Step 1: Run the aggregation query against live tables
  const rows = await prisma.$queryRaw<{
    department: string;
    payer_type: string;
    total_billed: number;
    total_collected: number;
    invoice_count: number;
  }[]>`
    SELECT
      COALESCE(u.department, u.specialty, 'Unknown') AS department,
      COALESCE(i.billing_patient_type, 'cash')        AS payer_type,
      SUM(i.total_amount)                             AS total_billed,
      COALESCE(SUM(p.paid_on_day), 0)                AS total_collected,
      COUNT(DISTINCT i.id)                            AS invoice_count
    FROM invoices i
    LEFT JOIN "users" u ON i.doctor_id = u.id
    LEFT JOIN LATERAL (
      -- Sum only payments created within yesterday's window to avoid
      -- attributing advance/backdate payments to the wrong rollup day.
      SELECT COALESCE(SUM(py.amount), 0) AS paid_on_day
      FROM payments py
      WHERE py.invoice_id = i.id
        AND py."organizationId" = ${orgId}
        AND py.status != 'Refunded'
        AND py.created_at >= ${dayStart}
        AND py.created_at <= ${dayEnd}
    ) p ON true
    WHERE i."organizationId" = ${orgId}
      AND i.status != 'Cancelled'
      AND i.created_at >= ${dayStart}
      AND i.created_at <= ${dayEnd}
    GROUP BY
      COALESCE(u.department, u.specialty, 'Unknown'),
      COALESCE(i.billing_patient_type, 'cash')
  `;

  if (rows.length === 0) return 0;

  // Step 2: UPSERT each aggregated row — idempotent on the unique constraint
  // (organizationId, report_date, department, payer_type)
  for (const row of rows) {
    await prisma.$executeRaw`
      INSERT INTO "mis_daily_billing_rollups"
        ("id", "organizationId", "report_date", "department", "payer_type",
         "total_billed", "total_collected", "invoice_count", "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), ${orgId}, ${reportDate}, ${row.department}, ${row.payer_type},
         ${Number(row.total_billed)}, ${Number(row.total_collected)}, ${Number(row.invoice_count)},
         NOW(), NOW())
      ON CONFLICT ("organizationId", "report_date", "department", "payer_type")
      DO UPDATE SET
        "total_billed"    = EXCLUDED."total_billed",
        "total_collected" = EXCLUDED."total_collected",
        "invoice_count"   = EXCLUDED."invoice_count",
        "updated_at"      = NOW()
    `;
  }

  return rows.length;
}

/**
 * Aggregates yesterday's pharmacy data into mis_daily_pharmacy_rollups.
 *
 * Grouped by: order_type ('IP' | 'OP') based on pharmacy_orders.is_ipd_linked.
 * return_amount from pharmacy_returns with return_type='patient_return' created on same day.
 * net_amount = total_amount - return_amount.
 *
 * Uses raw UPSERT for idempotent runs.
 */
async function upsertPharmacyRollup(
  orgId: string,
  dayStart: Date,
  dayEnd: Date,
  reportDate: Date
): Promise<number> {
  // Orders aggregation
  const orderRows = await prisma.$queryRaw<{
    order_type: string;
    total_amount: number;
    order_count: number;
  }[]>`
    SELECT
      CASE WHEN po.is_ipd_linked = true THEN 'IP' ELSE 'OP' END AS order_type,
      SUM(po.total_amount)                                        AS total_amount,
      COUNT(po.id)                                                AS order_count
    FROM "pharmacy_orders" po
    WHERE po."organizationId" = ${orgId}
      AND po.created_at >= ${dayStart}
      AND po.created_at <= ${dayEnd}
    GROUP BY po.is_ipd_linked
  `;

  // Returns aggregation — pharmacy_returns doesn't have is_ipd_linked directly.
  // We join back to the original invoice to determine IP vs OP:
  //   if original_invoice_id IS NOT NULL and invoice.admission_id IS NOT NULL → IP return
  //   else → OP return
  // return_type = 'patient_return' only (supplier_return etc. are not patient-facing revenue).
  const returnRows = await prisma.$queryRaw<{
    order_type: string;
    return_amount: number;
  }[]>`
    SELECT
      CASE WHEN inv.admission_id IS NOT NULL THEN 'IP' ELSE 'OP' END AS order_type,
      SUM(pr.quantity * COALESCE(pr.unit_cost, 0))                    AS return_amount
    FROM "pharmacy_returns" pr
    LEFT JOIN "invoices" inv ON pr.original_invoice_id = inv.id
    WHERE pr."organizationId" = ${orgId}
      AND pr.return_type = 'patient_return'
      AND pr.created_at >= ${dayStart}
      AND pr.created_at <= ${dayEnd}
    GROUP BY CASE WHEN inv.admission_id IS NOT NULL THEN 'IP' ELSE 'OP' END
  `;

  // Merge into a keyed map: order_type → aggregated values
  const resultMap: Record<string, { total_amount: number; return_amount: number; order_count: number }> = {};

  for (const r of orderRows) {
    resultMap[r.order_type] = {
      total_amount: Number(r.total_amount),
      return_amount: 0,
      order_count: Number(r.order_count),
    };
  }
  for (const r of returnRows) {
    if (!resultMap[r.order_type]) {
      resultMap[r.order_type] = { total_amount: 0, return_amount: 0, order_count: 0 };
    }
    resultMap[r.order_type].return_amount = Number(r.return_amount);
  }

  const types = Object.keys(resultMap);
  if (types.length === 0) return 0;

  for (const orderType of types) {
    const { total_amount, return_amount, order_count } = resultMap[orderType];
    const net_amount = total_amount - return_amount;

    await prisma.$executeRaw`
      INSERT INTO "mis_daily_pharmacy_rollups"
        ("id", "organizationId", "report_date", "order_type",
         "total_amount", "return_amount", "net_amount", "order_count",
         "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), ${orgId}, ${reportDate}, ${orderType},
         ${total_amount}, ${return_amount}, ${net_amount}, ${order_count},
         NOW(), NOW())
      ON CONFLICT ("organizationId", "report_date", "order_type")
      DO UPDATE SET
        "total_amount"  = EXCLUDED."total_amount",
        "return_amount" = EXCLUDED."return_amount",
        "net_amount"    = EXCLUDED."net_amount",
        "order_count"   = EXCLUDED."order_count",
        "updated_at"    = NOW()
    `;
  }

  return types.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Load all active organizations with their timezone config ───────────
    const orgs = await prisma.organization.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        config: { select: { timezone: true } },
      },
    });

    if (orgs.length === 0) {
      return NextResponse.json({ success: true, processed: 0, orgs: [] });
    }

    // ── 3. Process each org ───────────────────────────────────────────────────
    const results: Array<{
      orgId: string;
      orgName: string;
      reportDate: string;
      billing_rows: number;
      pharmacy_rows: number;
      error?: string;
    }> = [];

    for (const org of orgs) {
      const timezone = org.config?.timezone ?? 'Asia/Kolkata';

      try {
        const { dayStart, dayEnd, reportDate } = getYesterdayBoundaries(timezone);

        const [billingRows, pharmacyRows] = await Promise.all([
          upsertBillingRollup(org.id, dayStart, dayEnd, reportDate),
          upsertPharmacyRollup(org.id, dayStart, dayEnd, reportDate),
        ]);

        results.push({
          orgId: org.id,
          orgName: org.name,
          reportDate: reportDate.toISOString().split('T')[0],
          billing_rows: billingRows,
          pharmacy_rows: pharmacyRows,
        });

        console.log(
          `[MIS-ROLLUP] ✓ ${org.name} | date=${reportDate.toISOString().split('T')[0]} | billing=${billingRows} | pharmacy=${pharmacyRows}`
        );
      } catch (orgError: any) {
        console.error(`[MIS-ROLLUP] ✗ ${org.name} (${org.id}):`, orgError.message);
        results.push({
          orgId: org.id,
          orgName: org.name,
          reportDate: 'error',
          billing_rows: 0,
          pharmacy_rows: 0,
          error: orgError.message,
        });
      }
    }

    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;

    return NextResponse.json({
      success: true,
      processed: orgs.length,
      succeeded: successCount,
      failed: failCount,
      orgs: results,
    });
  } catch (error: any) {
    console.error('[MIS-ROLLUP FATAL]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
