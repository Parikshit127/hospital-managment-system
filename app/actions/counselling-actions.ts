'use server';
import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

function genSessionNumber(): string {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  return `COUN-${d}-${Math.floor(Math.random()*9000+1000)}`;
}

export async function createCounsellingSession(data: {
  patientId: string; sessionType: string; counsellorName?: string;
  scheduledAt?: string; notes?: string; financialEstimate?: number; depositAdvised?: number;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const session = await (db.counsellingSession as any).create({
      data: {
        organizationId, patient_id: data.patientId,
        session_number: genSessionNumber(), session_type: data.sessionType,
        counsellor_name: data.counsellorName || null,
        scheduled_at: data.scheduledAt ? new Date(data.scheduledAt) : null,
        notes: data.notes || null,
        financial_estimate: data.financialEstimate || null,
        deposit_advised: data.depositAdvised || null,
      },
    });
    revalidatePath('/counselling');
    return { success: true, data: session };
  } catch (e) { return { success: false, error: 'Failed to create session' }; }
}

export async function getCounsellingSessions(status?: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const where: any = { organizationId };
    if (status) where.status = status;
    const sessions = await (db.counsellingSession as any).findMany({
      where, orderBy: { created_at: 'desc' }, take: 100,
    });
    return { success: true, data: sessions };
  } catch (e) { return { success: false, data: [] }; }
}

export async function updateCounsellingStatus(id: string, status: string, outcome?: string) {
  try {
    const { db } = await requireTenantContext();
    const data: any = { status, updated_at: new Date() };
    if (status === 'Completed') data.completed_at = new Date();
    if (outcome) data.outcome = outcome;
    await (db.counsellingSession as any).update({ where: { id }, data });
    revalidatePath('/counselling');
    return { success: true };
  } catch (e) { return { success: false, error: 'Failed to update' }; }
}
