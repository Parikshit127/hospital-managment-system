'use server';

/**
 * The doctor's half of a NEWS escalation.
 *
 * Raising the alert was never the problem — the ward could see the score. What
 * was missing was any obligation to answer it: no acknowledgement, so the nurse
 * could not tell whether anyone had looked, and no consequence for silence.
 */

import { requireTenantContext, denyUnlessRole, CLINICAL_ROLES } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { parseInstructions } from '@/app/lib/escalation-policy';

/** Escalations still waiting on someone, newest first. */
export async function getOpenEscalations(options?: { mine?: boolean }) {
    try {
        const { db, session } = await requireTenantContext();

        const where: Record<string, unknown> = { status: 'awaiting' };
        // A doctor sees what was sent to them; managers and nurses see the ward.
        if (options?.mine && session.role === 'doctor') where.target_doctor_id = session.id;

        const rows = await db.nEWSEscalation.findMany({
            where,
            orderBy: [{ band: 'asc' }, { raised_at: 'asc' }],
            take: 100,
        });
        if (!rows.length) return { success: true, data: [] };

        // Stitch the patient in rather than an include per row.
        const admissions = await db.admissions.findMany({
            where: { admission_id: { in: [...new Set(rows.map((r: any) => r.admission_id))] } },
            include: { patient: { select: { full_name: true } }, ward: { select: { ward_name: true } } },
        });
        const byId = Object.fromEntries(admissions.map((a: any) => [a.admission_id, a]));

        const now = Date.now();
        const data = rows.map((r: any) => ({
            ...r,
            patientName: byId[r.admission_id]?.patient?.full_name ?? r.patient_id,
            wardName: byId[r.admission_id]?.ward?.ward_name ?? '',
            bedId: byId[r.admission_id]?.bed_id ?? '',
            overdue: new Date(r.due_at).getTime() < now,
            minutesWaiting: Math.max(0, Math.round((now - new Date(r.raised_at).getTime()) / 60000)),
        }));

        return { success: true, data: JSON.parse(JSON.stringify(data)) };
    } catch (error) {
        console.error('getOpenEscalations error:', error);
        return { success: false, data: [] };
    }
}

/**
 * Acknowledge an escalation, and tell the ward what to do about it.
 *
 * The instructions are the point. An acknowledgement on its own only proves
 * someone looked; each line becomes a nursing task so the response is work the
 * ward can see and close, not a sentence in a notification nobody re-reads.
 */
export async function acknowledgeEscalation(id: string, instructions: string) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.PRESCRIBE, 'acknowledge a clinical escalation');
    if (denied) return denied;

    try {
        const { db, organizationId, session } = await requireTenantContext();

        const esc = await db.nEWSEscalation.findUnique({ where: { id } });
        if (!esc) return { success: false, error: 'That escalation no longer exists.' };
        if (esc.status !== 'awaiting') {
            return { success: false, error: 'That escalation has already been answered.' };
        }

        const lines = parseInstructions(instructions);
        if (!lines.length) {
            return {
                success: false,
                error: 'Say what the ward should do. An acknowledgement with no instruction leaves the nurse where she started.',
            };
        }

        await db.nEWSEscalation.update({
            where: { id },
            data: {
                status: 'acknowledged',
                acknowledged_at: new Date(),
                acknowledged_by: session.id,
                instructions: lines.join('\n'),
            },
        });

        // Each instruction becomes work, assigned to nobody so any nurse on the
        // ward can claim it.
        for (const line of lines) {
            await db.nursingTask.create({
                data: {
                    admission_id: esc.admission_id,
                    task_type: 'Doctor instruction',
                    description: `${line} — ${session.name || 'doctor'}, after NEWS ${esc.news_score}`,
                    scheduled_at: new Date(),
                    status: 'Pending',
                    priority: esc.band === 'emergency' ? 'stat' : 'urgent',
                    source_type: 'news_escalation',
                    source_id: esc.id,
                    organizationId,
                },
            });
        }

        // Tell the ward it has been answered. This is what the nurse was
        // missing: previously she had no way to know anyone had looked.
        const admission = await db.admissions.findUnique({
            where: { admission_id: esc.admission_id },
            select: { ward_id: true, patient: { select: { full_name: true } } },
        });
        const nurses = await db.user.findMany({
            where: {
                organizationId, is_active: true, role: 'nurse',
                ...(admission?.ward_id
                    ? { OR: [{ assigned_ward_id: admission.ward_id }, { assigned_ward_id: null }] }
                    : {}),
            },
            select: { id: true },
        });
        if (nurses.length) {
            await db.notification.createMany({
                data: nurses.map((n: { id: string }) => ({
                    organizationId,
                    user_id: n.id,
                    title: `${session.name || 'The doctor'} answered — NEWS ${esc.news_score}`,
                    body: `${admission?.patient?.full_name ?? esc.patient_id}: ${lines.join('; ')}. ${lines.length} task(s) raised.`,
                    type: 'info',
                    link: '/nurse/tasks',
                })),
            });
        }

        revalidatePath('/doctor/escalations');
        revalidatePath('/nurse/tasks');
        return { success: true, data: { tasksCreated: lines.length } };
    } catch (error) {
        console.error('acknowledgeEscalation error:', error);
        return { success: false, error: 'Failed to acknowledge' };
    }
}

/** Close an escalation once the patient has been reviewed and is settled. */
export async function closeEscalation(id: string, note?: string) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'close a clinical escalation');
    if (denied) return denied;

    try {
        const { db, session } = await requireTenantContext();
        const closed = await db.nEWSEscalation.updateMany({
            where: { id, status: { not: 'closed' } },
            data: {
                status: 'closed',
                closed_at: new Date(),
                closed_by: session.id,
                instructions: note ? note : undefined,
            },
        });
        if (!closed.count) return { success: false, error: 'That escalation is already closed.' };

        revalidatePath('/doctor/escalations');
        return { success: true };
    } catch (error) {
        console.error('closeEscalation error:', error);
        return { success: false, error: 'Failed to close' };
    }
}
