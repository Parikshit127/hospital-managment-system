/**
 * Find admissions with duplicate Room/Nursing line items for the same day.
 * Group by (invoice_id, service_category, date-key extracted from description).
 *
 * Usage:
 *   npx tsx scripts/check-duplicate-charges.ts
 *
 * Output: list of duplicates with admission_id, patient_id, day, count.
 * Read-only — does not modify any data.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function extractDayKey(description: string | null | undefined): string {
    if (!description) return '';
    let m = description.match(/\[(\d{4}-\d{2}-\d{2})\]/);
    if (m) return m[1];
    m = description.match(/\((\d{1,2})\/(\d{1,2})\/(\d{2,4})\)/);
    if (m) {
        const d = m[1].padStart(2, '0');
        const mo = m[2].padStart(2, '0');
        const y = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${y}-${mo}-${d}`;
    }
    m = description.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    return description; // unparseable — treated as its own key, won't false-positive
}

async function main() {
    console.log('🔎 Scanning for duplicate Room/Nursing charges...\n');

    const items = await prisma.invoice_items.findMany({
        where: { service_category: { in: ['Room', 'Nursing'] } },
        select: {
            id: true,
            invoice_id: true,
            service_category: true,
            description: true,
            unit_price: true,
            ref_id: true,
            created_at: true,
            invoice: {
                select: {
                    invoice_number: true,
                    admission_id: true,
                    patient_id: true,
                    patient: { select: { full_name: true } },
                },
            },
        },
        orderBy: { created_at: 'asc' },
    });

    // Bucket by (invoice_id, service_category, day-key)
    type Bucket = {
        invoice_id: number;
        invoice_number: string;
        admission_id: string | null;
        patient_name: string;
        category: string;
        day_key: string;
        rows: { id: number; description: string; ref_id: string | null; unit_price: any }[];
    };
    const buckets = new Map<string, Bucket>();

    for (const it of items) {
        const dayKey = extractDayKey(it.description);
        const key = `${it.invoice_id}|${it.service_category}|${dayKey}`;
        if (!buckets.has(key)) {
            buckets.set(key, {
                invoice_id: it.invoice_id,
                invoice_number: it.invoice?.invoice_number || '-',
                admission_id: it.invoice?.admission_id ?? null,
                patient_name: it.invoice?.patient?.full_name || '-',
                category: it.service_category || '?',
                day_key: dayKey,
                rows: [],
            });
        }
        buckets.get(key)!.rows.push({
            id: it.id,
            description: it.description,
            ref_id: it.ref_id,
            unit_price: it.unit_price,
        });
    }

    const dupes = [...buckets.values()].filter((b) => b.rows.length > 1);

    if (dupes.length === 0) {
        console.log('✅ No duplicate Room/Nursing rows found. Clean.');
    } else {
        console.log(`⚠️  Found ${dupes.length} duplicate group(s):\n`);
        for (const b of dupes) {
            console.log(`  Admission: ${b.admission_id ?? '(no admission)'}`);
            console.log(`  Patient:   ${b.patient_name}`);
            console.log(`  Invoice:   ${b.invoice_number} (id=${b.invoice_id})`);
            console.log(`  Category:  ${b.category}  Day: ${b.day_key}  Rows: ${b.rows.length}`);
            for (const r of b.rows) {
                console.log(`    - item_id=${r.id}  ref=${r.ref_id ?? '-'}  ₹${Number(r.unit_price)}  | ${r.description}`);
            }
            console.log('');
        }
        console.log(`\nTotal duplicate rows: ${dupes.reduce((s, b) => s + b.rows.length - 1, 0)}`);
        console.log('To clean these manually, identify the older/extra rows and delete via Prisma.');
        console.log('Going forward, the dedup fix in commit ensures no NEW duplicates are created.');
    }
}

main()
    .catch((e) => {
        console.error('ERR:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
