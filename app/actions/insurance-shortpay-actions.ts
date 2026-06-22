'use server';

/**
 * Short-pay / disallowance disposition and the configurable denial-reason library.
 * Each disallowed amount captured at receipt time becomes a ClaimShortPay
 * (PendingReview) that the desk dispositions as ToRecover, WriteOff or Resubmit.
 * WriteOff posts the disallowance-expense journal.
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { postShortPayWriteOffToGL } from './insurance-gl-actions';

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    v !== null && typeof v === 'object' && v.constructor?.name === 'Decimal' ? Number(v) : v
  ));
}

const DEFAULT_DENIAL_REASONS: Array<{ code: string; description: string; category: string; is_recoverable: boolean }> = [
  { code: 'TARIFF_DIFF', description: 'Tariff / rate difference vs agreed package', category: 'TariffDiff', is_recoverable: false },
  { code: 'NON_PAYABLE', description: 'Non-payable / non-medical items', category: 'NonPayable', is_recoverable: false },
  { code: 'DOC_DEFICIENCY', description: 'Documentation deficiency', category: 'Documentation', is_recoverable: true },
  { code: 'SUB_LIMIT', description: 'Policy sub-limit / capping', category: 'SubLimit', is_recoverable: false },
  { code: 'COPAY', description: 'Co-payment as per policy', category: 'Copay', is_recoverable: false },
  { code: 'PRE_EXISTING', description: 'Pre-existing disease exclusion', category: 'PreExisting', is_recoverable: false },
  { code: 'ROOM_RENT_CAP', description: 'Room-rent capping / proportionate deduction', category: 'SubLimit', is_recoverable: false },
  { code: 'OTHER', description: 'Other disallowance', category: 'Other', is_recoverable: true },
];

// Seed the default denial-reason library for an org (idempotent).
export async function seedDefaultDenialReasons() {
  const { db, organizationId } = await requireTenantContext();
  let created = 0;
  for (const r of DEFAULT_DENIAL_REASONS) {
    const exists = await db.denialReason.findFirst({ where: { organizationId, code: r.code }, select: { code: true } });
    if (exists) continue;
    await db.denialReason.create({ data: { ...r, is_active: true, organizationId } });
    created++;
  }
  return { success: true, created };
}

export async function listDenialReasons() {
  const { db, organizationId } = await requireTenantContext();
  const reasons = await db.denialReason.findMany({ where: { organizationId, is_active: true }, orderBy: { code: 'asc' } });
  return { success: true, data: serialize(reasons) };
}

export async function listShortPays(filters?: { disposition?: string; invoice_id?: number }) {
  const { db, organizationId } = await requireTenantContext();
  const where: any = { organizationId };
  if (filters?.disposition) where.disposition = filters.disposition;
  if (filters?.invoice_id) where.invoice_id = filters.invoice_id;
  const rows = await db.claimShortPay.findMany({
    where,
    include: { invoice: { select: { invoice_number: true, patient_id: true } } },
    orderBy: { created_at: 'desc' },
    take: 500,
  });
  return { success: true, data: serialize(rows) };
}

/**
 * Disposition a short-pay. WriteOff posts the disallowance-expense GL journal and
 * relieves the receivable. ToRecover keeps it as receivable (a follow-up).
 * Resubmit links to a fresh claim cycle (the claim is flagged for resubmission).
 */
export async function dispositionShortPay(input: {
  short_pay_id: number;
  disposition: 'ToRecover' | 'WriteOff' | 'Resubmit';
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    const sp = await db.claimShortPay.findFirst({ where: { id: input.short_pay_id, organizationId } });
    if (!sp) return { success: false, error: 'Short-pay not found' };
    if (sp.disposition !== 'PendingReview') return { success: false, error: `Already dispositioned as ${sp.disposition}` };

    await db.claimShortPay.update({
      where: { id: sp.id },
      data: {
        disposition: input.disposition,
        resolved_by: session?.username || session?.name || null,
        resolved_at: new Date(),
      },
    });

    // If resubmitting, increment the linked claim's resubmission_count + flag status.
    if (input.disposition === 'Resubmit' && sp.claim_id) {
      await db.insurance_claims.update({
        where: { id: sp.claim_id },
        data: { resubmission_count: { increment: 1 }, status: 'Submitted', appeal_status: 'Appealed' },
      }).catch(() => {});
    }

    await db.system_audit_logs.create({
      data: {
        user_id: session?.id, username: session?.username || session?.name, role: session?.role,
        action: 'shortpay_dispositioned', module: 'finance', entity_type: 'claim_short_pay',
        entity_id: String(sp.id), details: JSON.stringify({ disposition: input.disposition, amount: Number(sp.amount) }),
        organizationId,
      },
    });

    let glResult: any = null;
    if (input.disposition === 'WriteOff') {
      glResult = await postShortPayWriteOffToGL(sp.id);
    }

    revalidatePath('/admin/finance/tpa-insurance');
    return { success: true, gl: glResult };
  } catch (error: any) {
    console.error('dispositionShortPay error:', error);
    return { success: false, error: error.message };
  }
}
