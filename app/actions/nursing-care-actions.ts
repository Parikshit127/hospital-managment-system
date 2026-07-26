'use server';

/**
 * Nursing care records: care plans, fluid balance, wound care, invasive devices,
 * transfusion, clinical incidents, patient education and shift assignment.
 *
 * Conventions carried over from the rest of the nursing module:
 *   - authority is checked here, not only in the route guard;
 *   - the acting user comes from the session, never from an argument;
 *   - failures are returned in the { success, error } shape the screens expect.
 */

import { requireTenantContext, denyUnlessRole, CLINICAL_ROLES } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { checkTransfusionPreconditions } from '@/app/lib/medication-safety';

// ── Care plans (ADPIE) ──────────────────────────────────────────────────────

export async function createCarePlan(data: {
    admission_id: string;
    assessment: string;
    diagnosis: string;
    goal: string;
    target_date?: string;
    interventions?: string[];
    priority?: 'routine' | 'high';
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'open a care plan');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const plan = await db.nursingCarePlan.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                assessment: data.assessment,
                diagnosis: data.diagnosis,
                goal: data.goal,
                target_date: data.target_date ? new Date(data.target_date) : null,
                interventions: data.interventions?.filter(Boolean) ?? [],
                evaluations: [],
                priority: data.priority ?? 'routine',
                opened_by: session.id,
            },
        });

        // A plan nobody acts on is a document, not care. Each intervention
        // becomes ward work so it appears on the task list like any other order.
        for (const item of data.interventions?.filter(Boolean) ?? []) {
            await db.nursingTask.create({
                data: {
                    admission_id: data.admission_id,
                    task_type: 'Care Plan',
                    description: item,
                    scheduled_at: new Date(),
                    status: 'Pending',
                    priority: data.priority === 'high' ? 'urgent' : 'routine',
                    source_type: 'care_plan',
                    source_id: plan.id,
                    organizationId,
                },
            });
        }

        revalidatePath('/ipd/care-plans');
        revalidatePath('/nurse/tasks');
        return { success: true, data: JSON.parse(JSON.stringify(plan)) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create care plan' };
    }
}

export async function getCarePlans(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const plans = await db.nursingCarePlan.findMany({
            where: { admission_id: admissionId },
            orderBy: [{ status: 'asc' }, { opened_at: 'desc' }],
        });
        return { success: true, data: JSON.parse(JSON.stringify(plans)) };
    } catch {
        return { success: false, data: [] };
    }
}

/** Append an evaluation — the E in ADPIE, which is what makes a plan live. */
export async function evaluateCarePlan(planId: string, note: string, outcome: 'progressing' | 'met' | 'not_met') {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'evaluate a care plan');
    if (denied) return denied;
    if (!note.trim()) return { success: false, error: 'An evaluation note is required.' };
    try {
        const { db, session } = await requireTenantContext();
        const plan = await db.nursingCarePlan.findUnique({ where: { id: planId } });
        if (!plan) return { success: false, error: 'Care plan not found' };

        const evaluations = Array.isArray(plan.evaluations) ? plan.evaluations : [];
        evaluations.push({ at: new Date().toISOString(), by: session.id, outcome, note: note.trim() });

        await db.nursingCarePlan.update({
            where: { id: planId },
            data: {
                evaluations,
                ...(outcome === 'met'
                    ? { status: 'met', closed_by: session.id, closed_at: new Date(), closure_note: note.trim() }
                    : {}),
            },
        });
        revalidatePath('/ipd/care-plans');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to evaluate' };
    }
}

// ── Fluid balance ───────────────────────────────────────────────────────────

/** Which shift a time falls in, so a balance can be struck per shift. */
function shiftFor(d: Date): string {
    const h = d.getHours();
    if (h >= 7 && h < 15) return 'morning';
    if (h >= 15 && h < 22) return 'evening';
    return 'night';
}

export async function recordFluid(data: {
    admission_id: string;
    direction: 'intake' | 'output';
    route: string;
    volume_ml: number;
    description?: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'chart fluid balance');
    if (denied) return denied;
    if (!Number.isFinite(data.volume_ml) || data.volume_ml <= 0) {
        return { success: false, error: 'Volume must be a positive number of millilitres.' };
    }
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const now = new Date();
        await db.fluidBalanceEntry.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                direction: data.direction,
                route: data.route,
                volume_ml: Math.round(data.volume_ml),
                description: data.description?.trim() || null,
                recorded_at: now,
                shift: shiftFor(now),
                recorded_by: session.id,
            },
        });
        revalidatePath('/ipd/fluid-balance');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to record' };
    }
}

/** Entries plus the running balance for a given day, and per shift within it. */
export async function getFluidBalance(admissionId: string, dateISO?: string) {
    try {
        const { db } = await requireTenantContext();
        const day = dateISO ? new Date(dateISO) : new Date();
        const start = new Date(day); start.setHours(0, 0, 0, 0);
        const end = new Date(day); end.setHours(23, 59, 59, 999);

        const entries = await db.fluidBalanceEntry.findMany({
            where: { admission_id: admissionId, recorded_at: { gte: start, lte: end } },
            orderBy: { recorded_at: 'asc' },
        });

        const sum = (rows: typeof entries, dir: string) =>
            rows.filter((e: { direction: string }) => e.direction === dir)
                .reduce((t: number, e: { volume_ml: number }) => t + e.volume_ml, 0);

        const shifts = ['morning', 'evening', 'night'].map(s => {
            const rows = entries.filter((e: { shift: string | null }) => e.shift === s);
            const intake = sum(rows, 'intake');
            const output = sum(rows, 'output');
            return { shift: s, intake, output, balance: intake - output };
        });

        const intake = sum(entries, 'intake');
        const output = sum(entries, 'output');

        return {
            success: true,
            data: {
                entries: JSON.parse(JSON.stringify(entries)),
                totals: { intake, output, balance: intake - output },
                shifts,
            },
        };
    } catch {
        return { success: false, data: null };
    }
}

// ── Wound care ──────────────────────────────────────────────────────────────

export async function recordWoundCare(data: {
    admission_id: string;
    wound_type: string;
    location: string;
    stage?: string;
    length_cm?: number;
    width_cm?: number;
    depth_cm?: number;
    appearance?: string;
    exudate?: string;
    dressing_used?: string;
    pain_score?: number;
    intervention?: string;
    next_review_at?: string;
    status?: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record wound care');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const record = await db.woundCareRecord.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                wound_type: data.wound_type,
                location: data.location,
                stage: data.stage || null,
                measurements: (data.length_cm || data.width_cm || data.depth_cm)
                    ? { length_cm: data.length_cm ?? null, width_cm: data.width_cm ?? null, depth_cm: data.depth_cm ?? null }
                    : undefined,
                appearance: data.appearance || null,
                exudate: data.exudate || null,
                dressing_used: data.dressing_used || null,
                pain_score: data.pain_score ?? null,
                intervention: data.intervention || null,
                next_review_at: data.next_review_at ? new Date(data.next_review_at) : null,
                status: data.status || 'open',
                assessed_by: session.id,
            },
        });

        // A dressing due on a date only happens if somebody is told to do it.
        if (data.next_review_at) {
            await db.nursingTask.create({
                data: {
                    admission_id: data.admission_id,
                    task_type: 'Wound Care',
                    description: `Review / redress ${data.wound_type} at ${data.location}`,
                    scheduled_at: new Date(data.next_review_at),
                    status: 'Pending',
                    priority: 'routine',
                    source_type: 'wound_care',
                    source_id: record.id,
                    organizationId,
                },
            });
        }

        revalidatePath('/ipd/wound-care');
        return { success: true, data: JSON.parse(JSON.stringify(record)) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to record' };
    }
}

export async function getWoundCare(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const records = await db.woundCareRecord.findMany({
            where: { admission_id: admissionId },
            orderBy: { assessed_at: 'desc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(records)) };
    } catch {
        return { success: false, data: [] };
    }
}

// ── Invasive devices ────────────────────────────────────────────────────────

/** Default review windows, in days, for the common devices. */
const DEVICE_REVIEW_DAYS: Record<string, number> = {
    'Peripheral IV cannula': 3,
    'Central line': 7,
    'Urinary catheter': 14,
    'NG tube': 7,
    'Arterial line': 7,
    'Drain': 3,
};

export async function insertDevice(data: {
    admission_id: string;
    device_type: string;
    site: string;
    size?: string;
    inserted_at?: string;
    due_at?: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record a device insertion');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const insertedAt = data.inserted_at ? new Date(data.inserted_at) : new Date();
        const dueDays = DEVICE_REVIEW_DAYS[data.device_type];
        const dueAt = data.due_at
            ? new Date(data.due_at)
            : dueDays
                ? new Date(insertedAt.getTime() + dueDays * 86400000)
                : null;

        const device = await db.patientDevice.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                device_type: data.device_type,
                site: data.site,
                size: data.size || null,
                inserted_at: insertedAt,
                inserted_by: session.id,
                due_at: dueAt,
                status: 'in_situ',
            },
        });

        // The review date is the point of recording it — raise the task now.
        if (dueAt) {
            await db.nursingTask.create({
                data: {
                    admission_id: data.admission_id,
                    task_type: 'Device Review',
                    description: `${data.device_type} at ${data.site} due for review or re-site`,
                    scheduled_at: dueAt,
                    status: 'Pending',
                    priority: 'routine',
                    source_type: 'device',
                    source_id: device.id,
                    organizationId,
                },
            });
        }

        revalidatePath('/ipd/devices');
        return { success: true, data: JSON.parse(JSON.stringify(device)) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to record device' };
    }
}

export async function removeDevice(deviceId: string, reason: string) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record a device removal');
    if (denied) return denied;
    if (!reason.trim()) return { success: false, error: 'A removal reason is required.' };
    try {
        const { db, session } = await requireTenantContext();
        await db.patientDevice.update({
            where: { id: deviceId },
            data: { status: 'removed', removed_at: new Date(), removed_by: session.id, removal_reason: reason.trim() },
        });
        // Close any outstanding review task for this device.
        await db.nursingTask.updateMany({
            where: { source_type: 'device', source_id: deviceId, status: 'Pending' },
            data: { status: 'Completed', completed_at: new Date(), completed_by: session.id },
        });
        revalidatePath('/ipd/devices');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to remove device' };
    }
}

export async function getDevices(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const devices = await db.patientDevice.findMany({
            where: { admission_id: admissionId },
            orderBy: [{ status: 'asc' }, { inserted_at: 'desc' }],
        });
        const now = Date.now();
        return {
            success: true,
            data: JSON.parse(JSON.stringify(devices.map((d: { due_at: Date | null; status: string }) => ({
                ...d,
                overdue: d.status === 'in_situ' && !!d.due_at && new Date(d.due_at).getTime() < now,
                device_days: null,
            })))),
        };
    } catch {
        return { success: false, data: [] };
    }
}

// ── Clinical incidents ──────────────────────────────────────────────────────

export async function reportIncident(data: {
    admission_id?: string;
    patient_id?: string;
    incident_type: string;
    severity: string;
    occurred_at: string;
    location?: string;
    description: string;
    immediate_action?: string;
    patient_informed?: boolean;
}) {
    // Anyone clinical may report; reporting must never be gated by seniority.
    const denied = await denyUnlessRole(
        [...CLINICAL_ROLES.CHART, 'pharmacist', 'lab_technician', 'receptionist'],
        'report an incident',
    );
    if (denied) return denied;
    if (!data.description?.trim()) return { success: false, error: 'A description is required.' };
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const incident = await db.clinicalIncident.create({
            data: {
                organizationId,
                admission_id: data.admission_id || null,
                patient_id: data.patient_id || null,
                incident_type: data.incident_type,
                severity: data.severity,
                occurred_at: new Date(data.occurred_at),
                location: data.location || null,
                description: data.description.trim(),
                immediate_action: data.immediate_action?.trim() || null,
                patient_informed: data.patient_informed ?? false,
                reported_by: session.id,
            },
        });

        // Anything above "no harm" should reach a manager rather than waiting to
        // be noticed on a list.
        if (['moderate', 'major', 'catastrophic'].includes(data.severity)) {
            const managers = await db.user.findMany({
                where: { organizationId, is_active: true, role: { in: ['admin', 'ipd_manager'] } },
                select: { id: true },
            });
            if (managers.length) {
                await db.notification.createMany({
                    data: managers.map((m: { id: string }) => ({
                        organizationId,
                        user_id: m.id,
                        title: `${data.severity.toUpperCase()} incident reported: ${data.incident_type}`,
                        body: data.description.trim().slice(0, 240),
                        type: 'error',
                    })),
                });
            }
        }

        revalidatePath('/ipd/incidents');
        return { success: true, data: JSON.parse(JSON.stringify(incident)) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to report incident' };
    }
}

export async function getIncidents(filter?: { status?: string; admission_id?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: Record<string, unknown> = {};
        if (filter?.status) where.status = filter.status;
        if (filter?.admission_id) where.admission_id = filter.admission_id;
        const incidents = await db.clinicalIncident.findMany({
            where,
            orderBy: { occurred_at: 'desc' },
            take: 200,
        });
        return { success: true, data: JSON.parse(JSON.stringify(incidents)) };
    } catch {
        return { success: false, data: [] };
    }
}

export async function reviewIncident(id: string, data: {
    review_notes?: string;
    root_cause?: string;
    preventive_action?: string;
    close?: boolean;
}) {
    const denied = await denyUnlessRole(['admin', 'ipd_manager'], 'review an incident');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const updated = await db.clinicalIncident.update({
            where: { id },
            data: {
                review_notes: data.review_notes?.trim() || undefined,
                root_cause: data.root_cause?.trim() || undefined,
                preventive_action: data.preventive_action?.trim() || undefined,
                status: data.close ? 'closed' : 'under review',
                ...(data.close ? { closed_by: session.id, closed_at: new Date() } : {}),
            },
        });

        // Close the loop with whoever reported it. Reporting a fall and never
        // hearing anything back is precisely how a reporting culture dies —
        // staff stop bothering. Best-effort; never fails the review.
        try {
            if (updated.reported_by && updated.reported_by !== session.id) {
                await db.notification.createMany({
                    data: [{
                        organizationId,
                        user_id: updated.reported_by,
                        title: data.close
                            ? `Incident closed — ${updated.incident_type}`
                            : `Incident reviewed — ${updated.incident_type}`,
                        body: data.close
                            ? `${session.name || 'The IPD manager'} reviewed and closed the ${updated.incident_type.toLowerCase()} you reported.`
                                + (data.preventive_action?.trim() ? ` What changes: ${data.preventive_action.trim()}` : '')
                            : `${session.name || 'The IPD manager'} is reviewing the ${updated.incident_type.toLowerCase()} you reported.`
                                + (data.review_notes?.trim() ? ` Note: ${data.review_notes.trim()}` : ''),
                        type: 'info',
                        link: '/ipd/incidents',
                    }],
                });
            }
        } catch (e) {
            console.error('incident review notification failed:', e);
        }

        revalidatePath('/ipd/incidents');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update incident' };
    }
}

// ── Patient education ───────────────────────────────────────────────────────

export async function recordEducation(data: {
    admission_id: string;
    topic: string;
    content: string;
    method?: string;
    audience?: string;
    language?: string;
    understanding?: string;
    is_discharge_teaching?: boolean;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record patient education');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();
        await db.patientEducationRecord.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                topic: data.topic,
                content: data.content,
                method: data.method || null,
                audience: data.audience || 'patient',
                language: data.language || null,
                understanding: data.understanding || null,
                repeat_required: data.understanding === 'needs repeat',
                taught_by: session.id,
                is_discharge_teaching: data.is_discharge_teaching ?? false,
            },
        });
        revalidatePath('/ipd/education');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to record' };
    }
}

export async function getEducationRecords(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const records = await db.patientEducationRecord.findMany({
            where: { admission_id: admissionId },
            orderBy: { taught_at: 'desc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(records)) };
    } catch {
        return { success: false, data: [] };
    }
}

// ── Transfusion ─────────────────────────────────────────────────────────────

export async function startTransfusion(data: {
    admission_id: string;
    component: string;
    unit_number: string;
    blood_group: string;
    crossmatch_ref?: string;
    consent_taken: boolean;
    witness_id: string;
    volume_ml?: number;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.ADMINISTER, 'start a transfusion');
    if (denied) return denied;

    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Consent and a genuine two-person bedside check, both legal requirements.
        const guard = checkTransfusionPreconditions(data, session.id);
        if (guard.error) return { success: false, error: guard.error };

        const record = await db.transfusionRecord.create({
            data: {
                admission_id: data.admission_id,
                organizationId,
                component: data.component,
                unit_number: data.unit_number,
                blood_group: data.blood_group,
                crossmatch_ref: data.crossmatch_ref || null,
                consent_taken: true,
                consent_by: session.id,
                checked_by: session.id,
                witness_id: data.witness_id,
                started_at: new Date(),
                volume_ml: data.volume_ml ?? null,
                observations: [],
                status: 'in_progress',
            },
        });

        // Observations are due at 15 and 30 minutes; both become ward tasks.
        for (const mins of [15, 30]) {
            await db.nursingTask.create({
                data: {
                    admission_id: data.admission_id,
                    task_type: 'Transfusion Observation',
                    description: `${mins}-minute observations for ${data.component} unit ${data.unit_number}`,
                    scheduled_at: new Date(Date.now() + mins * 60000),
                    status: 'Pending',
                    priority: 'urgent',
                    source_type: 'transfusion',
                    source_id: record.id,
                    organizationId,
                },
            });
        }

        revalidatePath('/ipd/transfusion');
        return { success: true, data: JSON.parse(JSON.stringify(record)) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to start transfusion' };
    }
}

export async function addTransfusionObservation(id: string, obs: {
    minute: number;
    temperature?: number;
    pulse?: number;
    bp?: string;
    note?: string;
    reaction?: boolean;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record transfusion observations');
    if (denied) return denied;
    try {
        const { db, session } = await requireTenantContext();
        const rec = await db.transfusionRecord.findUnique({ where: { id } });
        if (!rec) return { success: false, error: 'Transfusion record not found' };

        const observations = Array.isArray(rec.observations) ? rec.observations : [];
        observations.push({ ...obs, at: new Date().toISOString(), by: session.id });

        await db.transfusionRecord.update({
            where: { id },
            data: {
                observations,
                ...(obs.reaction
                    ? { reaction_occurred: true, status: 'stopped', reaction_details: obs.note || 'Reaction observed' }
                    : {}),
            },
        });
        revalidatePath('/ipd/transfusion');
        return { success: true, stopped: !!obs.reaction };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to record observation' };
    }
}

export async function getTransfusions(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const records = await db.transfusionRecord.findMany({
            where: { admission_id: admissionId },
            orderBy: { started_at: 'desc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(records)) };
    } catch {
        return { success: false, data: [] };
    }
}

// ── Shift assignment ────────────────────────────────────────────────────────

export async function assignShift(data: {
    nurse_id: string;
    ward_id: number;
    shift_date: string;
    shift_type: string;
    admission_ids: string[];
}) {
    const denied = await denyUnlessRole(['admin', 'ipd_manager'], 'assign a shift');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Simple acuity: a patient scoring NEWS >= 5 counts double.
        const admissions = await db.admissions.findMany({
            where: { admission_id: { in: data.admission_ids } },
            select: { news_score_latest: true },
        });
        const acuity = admissions.reduce(
            (t: number, a: { news_score_latest: number | null }) => t + ((a.news_score_latest ?? 0) >= 5 ? 2 : 1),
            0,
        );

        await db.nurseShiftAssignment.create({
            data: {
                organizationId,
                nurse_id: data.nurse_id,
                ward_id: data.ward_id,
                shift_date: new Date(data.shift_date),
                shift_type: data.shift_type,
                admission_ids: data.admission_ids,
                acuity_total: acuity,
                assigned_by: session.id,
            },
        });
        revalidatePath('/ipd/shift-assignments');
        return { success: true, acuity };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to assign shift' };
    }
}

export async function getShiftAssignments(wardId: number, dateISO?: string) {
    try {
        const { db } = await requireTenantContext();
        const day = dateISO ? new Date(dateISO) : new Date();
        const start = new Date(day); start.setHours(0, 0, 0, 0);
        const end = new Date(day); end.setHours(23, 59, 59, 999);

        const rows = await db.nurseShiftAssignment.findMany({
            where: { ward_id: wardId, shift_date: { gte: start, lte: end } },
            orderBy: { shift_type: 'asc' },
        });

        const nurseIds = [...new Set(rows.map((r: { nurse_id: string }) => r.nurse_id))];
        const nurses = nurseIds.length
            ? await db.user.findMany({ where: { id: { in: nurseIds } }, select: { id: true, name: true, username: true } })
            : [];
        const nameOf = Object.fromEntries(nurses.map((u: { id: string; name: string | null; username: string }) => [u.id, u.name || u.username]));

        return {
            success: true,
            data: JSON.parse(JSON.stringify(rows.map((r: { nurse_id: string }) => ({
                ...r,
                nurse_name: nameOf[r.nurse_id] ?? r.nurse_id,
            })))),
        };
    } catch {
        return { success: false, data: [] };
    }
}
