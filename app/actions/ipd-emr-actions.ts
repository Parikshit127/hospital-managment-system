'use server';

/**
 * GAP 6 — 14-Tab IPD EMR Case Sheet
 * GAP 7 — 24-Hour Case Sheet View
 * GAP 15 — Doctor Visit Counting vs. Package Billing Logic
 * GAP 16 — Referral Order as a Generating Entity
 */

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { dosingHours, MAR_HORIZON_DAYS } from '@/app/lib/medication-safety';

// ── GAP 6: Clinical Orders ─────────────────────────────────────────────────

export async function createClinicalOrder(data: {
    admission_id: string;
    patient_id: string;
    doctor_id: string;
    order_type: 'lab' | 'radiology' | 'procedure' | 'consultation';
    order_details: Record<string, unknown>;
    priority?: 'stat' | 'urgent' | 'routine';
}) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const order = await (db as any).clinicalOrder.create({
            data: {
                admission_id: data.admission_id,
                patient_id: data.patient_id,
                doctor_id: data.doctor_id,
                order_type: data.order_type,
                order_details: data.order_details,
                priority: data.priority || 'routine',
                status: 'pending',
                organizationId,
            },
        });

        revalidatePath(`/ipd/ward-rounds`);
        return { success: true, data: JSON.parse(JSON.stringify(order)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create clinical order';
        return { success: false, error: msg };
    }
}

export async function getClinicalOrders(admissionId: string) {
    const { db, organizationId } = await requireTenantContext();

    const orders = await (db as any).clinicalOrder.findMany({
        where: { admission_id: admissionId, organizationId },
        orderBy: { ordered_at: 'desc' },
    });

    return { success: true, data: JSON.parse(JSON.stringify(orders)) };
}

export async function updateClinicalOrderStatus(orderId: string, status: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db as any).clinicalOrder.update({
            where: { id: orderId, organizationId },
            data: {
                status,
                completed_at: status === 'completed' ? new Date() : null,
            },
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update order';
        return { success: false, error: msg };
    }
}

// ── GAP 6: Physician Orders ────────────────────────────────────────────────

export async function createPhysicianOrder(data: {
    admission_id: string;
    patient_id: string;
    doctor_id: string;
    order_category: 'medication' | 'diet' | 'activity' | 'monitoring' | 'other';
    order_text: string;
    frequency?: string;
    duration?: string;
}) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const order = await (db as any).physicianOrder.create({
            data: {
                admission_id: data.admission_id,
                patient_id: data.patient_id,
                doctor_id: data.doctor_id,
                order_category: data.order_category,
                order_text: data.order_text,
                frequency: data.frequency || null,
                duration: data.duration || null,
                status: 'active',
                organizationId,
            },
        });

        return { success: true, data: JSON.parse(JSON.stringify(order)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create physician order';
        return { success: false, error: msg };
    }
}

export async function getPhysicianOrders(admissionId: string) {
    const { db, organizationId } = await requireTenantContext();

    const orders = await (db as any).physicianOrder.findMany({
        where: { admission_id: admissionId, organizationId, status: 'active' },
        orderBy: { ordered_at: 'desc' },
    });

    return { success: true, data: JSON.parse(JSON.stringify(orders)) };
}

export async function discontinuePhysicianOrder(orderId: string, reason?: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db as any).physicianOrder.update({
            where: { id: orderId, organizationId },
            data: { status: 'discontinued', discontinued_at: new Date() },
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to discontinue order';
        return { success: false, error: msg };
    }
}

// ── GAP 6: Active Medications ──────────────────────────────────────────────

/**
 * Write the scheduled doses for one active medication.
 *
 * Previously an order with no end date was scheduled for three days and capped
 * at seven. Nothing extended it and nothing warned anyone, so on day four the
 * chart for a still-active drug simply went empty — the doses were not "missed",
 * they never existed. topUpMedicationSchedules() below keeps the window rolling;
 * this function is idempotent so it can be called again safely.
 */
export async function scheduleMedicationAdministrations(dbOrTx: any, activeMed: any, organizationId: string) {
    const frequency = (activeMed.frequency || 'OD').toUpperCase();
    const dosage = activeMed.dosage || '1';
    const route = activeMed.route || 'Oral';
    const admissionId = activeMed.admission_id;
    const name = activeMed.medication_name;

    const startDate = new Date(activeMed.start_date || new Date());
    const horizon = new Date(Date.now() + MAR_HORIZON_DAYS * 24 * 60 * 60 * 1000);
    // An explicit end date is honoured exactly; an open-ended order is filled to
    // the rolling horizon rather than being silently truncated.
    const finalEndDate = activeMed.end_date ? new Date(activeMed.end_date) : horizon;

    const { hours, isPrn } = dosingHours(frequency);

    // A PRN drug is given on demand, not on a clock: one row is enough.
    const now = new Date();
    const rows: any[] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= finalEndDate) {
        for (const hr of hours) {
            const scheduledTime = new Date(current);
            scheduledTime.setHours(hr % 24, 0, 0, 0);
            if (hr >= 24) scheduledTime.setDate(scheduledTime.getDate() + 1);
            if (scheduledTime < now) continue;
            rows.push({
                admission_id: admissionId,
                medication_name: name,
                dose: dosage,
                route,
                scheduled_time: scheduledTime,
                status: 'Scheduled',
                organizationId,
                frequency,
                is_prn: isPrn,
            });
        }
        if (isPrn) break;
        current.setDate(current.getDate() + 1);
    }

    if (!rows.length) return 0;

    // Skip times already on the chart so repeated top-ups never duplicate a dose.
    const existing = await dbOrTx.medicationAdministration.findMany({
        where: {
            admission_id: admissionId,
            medication_name: name,
            scheduled_time: { gte: now },
        },
        select: { scheduled_time: true },
    });
    const taken = new Set(existing.map((e: any) => new Date(e.scheduled_time).getTime()));
    const fresh = rows.filter(r => !taken.has(r.scheduled_time.getTime()));
    if (!fresh.length) return 0;

    await dbOrTx.medicationAdministration.createMany({ data: fresh });
    return fresh.length;
}

/**
 * Keep the medication chart populated for every active drug on a currently
 * admitted patient. Called when an eMAR is opened, so the window rolls forward
 * on its own instead of relying on a scheduled job that may not be installed.
 *
 * Cheap when there is nothing to do: scheduleMedicationAdministrations() skips
 * times already present, so a repeat call writes nothing.
 */
export async function topUpMedicationSchedules(admissionId?: string) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const meds = await (db as any).activeMedication.findMany({
            where: {
                organizationId,
                status: 'active',
                ...(admissionId ? { admission_id: admissionId } : {}),
            },
        });
        if (!meds.length) return { success: true, added: 0 };

        // Only for patients still in a bed — a discharged chart must not refill.
        const admissions = await db.admissions.findMany({
            where: { admission_id: { in: [...new Set(meds.map((m: any) => m.admission_id))] }, status: 'Admitted' },
            select: { admission_id: true },
        });
        const admitted = new Set(admissions.map((a: any) => a.admission_id));

        let added = 0;
        for (const m of meds) {
            if (!admitted.has(m.admission_id)) continue;
            if (m.end_date && new Date(m.end_date) < new Date()) continue;
            added += await scheduleMedicationAdministrations(db, m, organizationId);
        }
        return { success: true, added };
    } catch (error) {
        console.error('topUpMedicationSchedules error:', error);
        return { success: false, added: 0 };
    }
}

/**
 * Close out a patient's medication chart at discharge.
 *
 * Discharge previously left the chart untouched: active medications stayed
 * "active" and every future dose stayed "Scheduled". The audit discharged a
 * patient with nine doses still queued for the following three days, and the
 * eMAR's All view continued to list them — from the next morning they would
 * have reappeared as due for someone who had gone home.
 */
export async function stopMedicationsOnDischarge(dbOrTx: any, admissionId: string, reason = 'Discharged') {
    const now = new Date();

    const cancelled = await dbOrTx.medicationAdministration.updateMany({
        where: { admission_id: admissionId, status: 'Scheduled', scheduled_time: { gte: now } },
        data: { status: 'Cancelled', not_given_reason: reason },
    });

    const stopped = await dbOrTx.activeMedication.updateMany({
        where: { admission_id: admissionId, status: 'active' },
        data: { status: 'stopped', end_date: now, discontinuation_reason: reason },
    });

    return { dosesCancelled: cancelled.count, medicationsStopped: stopped.count };
}

export async function addActiveMedication(data: {
    admission_id: string;
    patient_id: string;
    medication_name: string;
    dosage: string;
    route: string;
    frequency: string;
    prescribed_by: string;
    end_date?: string;
}) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const med = await db.$transaction(async (tx: any) => {
            const m = await (tx as any).activeMedication.create({
                data: {
                    admission_id: data.admission_id,
                    patient_id: data.patient_id,
                    medication_name: data.medication_name,
                    dosage: data.dosage,
                    route: data.route,
                    frequency: data.frequency,
                    prescribed_by: data.prescribed_by,
                    end_date: data.end_date ? new Date(data.end_date) : null,
                    status: 'active',
                    organizationId,
                },
            });
            await scheduleMedicationAdministrations(tx, m, organizationId);
            return m;
        });

        return { success: true, data: JSON.parse(JSON.stringify(med)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to add medication';
        return { success: false, error: msg };
    }
}

export async function getActiveMedications(admissionId: string) {
    const { db, organizationId } = await requireTenantContext();

    const meds = await (db as any).activeMedication.findMany({
        where: { admission_id: admissionId, organizationId, status: 'active' },
        orderBy: { start_date: 'desc' },
    });

    return { success: true, data: JSON.parse(JSON.stringify(meds)) };
}

export async function discontinueMedication(medId: string, reason: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        await (db as any).activeMedication.update({
            where: { id: medId, organizationId },
            data: {
                status: 'discontinued',
                end_date: new Date(),
                discontinuation_reason: reason,
            },
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to discontinue medication';
        return { success: false, error: msg };
    }
}

// ── GAP 7: 24-Hour Case Sheet View ────────────────────────────────────────

export async function get24HourCaseSheet(admissionId: string, date?: string) {
    const { db, organizationId } = await requireTenantContext();

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    try {
        const admission = await db.admissions.findFirst({
            where: { admission_id: admissionId, organizationId },
            include: {
                patient: {
                    select: { patient_id: true, full_name: true, age: true, gender: true, blood_group: true },
                },
            },
        });

        if (!admission) return { success: false, error: 'Admission not found' };

        const patientId = admission.patient_id;

        // Fetch all activities for the day in parallel
        const [vitals, wardRounds, medications, labOrders, nursingTasks, dietPlans, clinicalOrders, physicianOrders] =
            await Promise.all([
                db.iPDVitals.findMany({
                    where: { admission_id: admissionId, organizationId, recorded_at: { gte: startOfDay, lte: endOfDay } },
                    orderBy: { recorded_at: 'asc' },
                }),
                db.wardRound.findMany({
                    where: { admission_id: admissionId, organizationId, created_at: { gte: startOfDay, lte: endOfDay } },
                    orderBy: { created_at: 'asc' },
                }),
                (db as any).activeMedication.findMany({
                    where: { admission_id: admissionId, organizationId, start_date: { gte: startOfDay, lte: endOfDay } },
                    orderBy: { start_date: 'asc' },
                }),
                db.lab_orders.findMany({
                    where: { patient_id: patientId, organizationId, created_at: { gte: startOfDay, lte: endOfDay } },
                    orderBy: { created_at: 'asc' },
                }),
                db.nursingTask.findMany({
                    where: { admission_id: admissionId, organizationId, scheduled_at: { gte: startOfDay, lte: endOfDay } },
                    orderBy: { scheduled_at: 'asc' },
                }),
                db.dietPlan.findMany({
                    where: { admission_id: admissionId, organizationId },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                }),
                (db as any).clinicalOrder.findMany({
                    where: { admission_id: admissionId, organizationId, ordered_at: { gte: startOfDay, lte: endOfDay } },
                    orderBy: { ordered_at: 'asc' },
                }),
                (db as any).physicianOrder.findMany({
                    where: { admission_id: admissionId, organizationId, ordered_at: { gte: startOfDay, lte: endOfDay } },
                    orderBy: { ordered_at: 'asc' },
                }),
            ]);

        // Build unified timeline
        type TimelineEntry = {
            time: string;
            type: string;
            data: unknown;
        };
        const timeline: TimelineEntry[] = [];

        const addToTimeline = (items: unknown[], type: string, timeField: string) => {
            for (const item of items) {
                timeline.push({
                    time: (item as Record<string, unknown>)[timeField] as string,
                    type,
                    data: item,
                });
            }
        };

        addToTimeline(vitals, 'vitals', 'recorded_at');
        addToTimeline(wardRounds, 'ward_round', 'created_at');
        addToTimeline(medications, 'medication', 'start_date');
        addToTimeline(labOrders, 'lab_order', 'created_at');
        addToTimeline(nursingTasks, 'nursing_task', 'scheduled_at');
        addToTimeline(clinicalOrders, 'clinical_order', 'ordered_at');
        addToTimeline(physicianOrders, 'physician_order', 'ordered_at');

        timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        return {
            success: true,
            data: {
                admission: JSON.parse(JSON.stringify(admission)),
                date: targetDate.toISOString().split('T')[0],
                timeline: JSON.parse(JSON.stringify(timeline)),
                nursingTasks: JSON.parse(JSON.stringify(nursingTasks)),
                summary: {
                    vitals_count: vitals.length,
                    ward_rounds_count: wardRounds.length,
                    medications_count: medications.length,
                    lab_orders_count: labOrders.length,
                    nursing_tasks_count: nursingTasks.length,
                    diet_plan: dietPlans[0] ? JSON.parse(JSON.stringify(dietPlans[0])) : null,
                },
            },
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to fetch 24-hour case sheet';
        return { success: false, error: msg };
    }
}

// ── GAP 15: Visit Count vs Package Billing ────────────────────────────────

export async function checkVisitBillability(admissionId: string, doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    try {
        // Count all ward rounds (doctor visits) for this admission
        const totalVisits = await db.wardRound.count({
            where: { admission_id: admissionId, organizationId },
        });

        // Get active package for this admission
        const admissionPackage = await db.iPD_REG ? null : await (db as any).ipdAdmissionPackage?.findFirst({
            where: { admission_id: admissionId, organizationId },
            include: { package: true },
        });

        // Get package details to check included visits
        let includedVisits = 0;
        let packageName = null;

        if (admissionPackage) {
            const pkg = admissionPackage.package;
            // Package inclusions stored in JSON — check for visit_count field
            const inclusions = pkg.inclusions as Record<string, unknown> | null;
            includedVisits = (inclusions?.visit_count as number) || 0;
            packageName = admissionPackage.applied_package_name || pkg.package_name;
        }

        const billableVisits = Math.max(0, totalVisits - includedVisits);
        const isBillable = billableVisits > 0;

        return {
            success: true,
            data: {
                total_visits: totalVisits,
                included_in_package: includedVisits,
                billable_visits: billableVisits,
                is_billable: isBillable,
                package_name: packageName,
                message: isBillable
                    ? `${billableVisits} visit(s) are billable (${totalVisits} total - ${includedVisits} included in package)`
                    : `All ${totalVisits} visit(s) are covered by package`,
            },
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to check visit billability';
        return { success: false, error: msg };
    }
}

// ── GAP 16: Referral Orders ────────────────────────────────────────────────

export async function createReferralOrder(data: {
    patient_id: string;
    admission_id?: string;
    referred_by: string;
    referred_to: string;
    department?: string;
    location?: string;
    reason: string;
    priority?: 'stat' | 'urgent' | 'routine';
    notes?: string;
}) {
    const { db, organizationId } = await requireTenantContext();

    try {
        const referral = await (db as any).referralOrder.create({
            data: {
                patient_id: data.patient_id,
                admission_id: data.admission_id || null,
                referred_by: data.referred_by,
                referred_to: data.referred_to,
                department: data.department || null,
                location: data.location || null,
                reason: data.reason,
                priority: data.priority || 'routine',
                notes: data.notes || null,
                status: 'pending',
                organizationId,
            },
        });

        // Notify referred-to doctor if they're internal
        try {
            const referredDoctor = await (db.user.findFirst as any)({
                where: { id: data.referred_to, organizationId },
            });

            if (referredDoctor) {
                await db.notification.create({
                    data: {
                        organizationId,
                        user_id: data.referred_to,
                        title: '📋 New Referral Order',
                        body: `You have a new ${data.priority || 'routine'} referral for patient ${data.patient_id}. Reason: ${data.reason}`,
                        type: data.priority === 'stat' ? 'critical' : 'info',
                    },
                });
            }
        } catch {
            // Non-blocking — referral still created
        }

        revalidatePath('/ipd/ward-rounds');
        return { success: true, data: JSON.parse(JSON.stringify(referral)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create referral order';
        return { success: false, error: msg };
    }
}

export async function getReferralOrders(patientId: string, admissionId?: string) {
    const { db, organizationId } = await requireTenantContext();

    const where: Record<string, unknown> = { patient_id: patientId, organizationId };
    if (admissionId) where.admission_id = admissionId;

    const referrals = await (db as any).referralOrder.findMany({
        where,
        orderBy: { referred_at: 'desc' },
    });

    return { success: true, data: JSON.parse(JSON.stringify(referrals)) };
}

export async function updateReferralStatus(referralId: string, status: 'accepted' | 'completed' | 'cancelled') {
    const { db, organizationId } = await requireTenantContext();

    try {
        const updateData: Record<string, unknown> = { status };
        if (status === 'accepted') updateData.accepted_at = new Date();
        if (status === 'completed') updateData.completed_at = new Date();

        await (db as any).referralOrder.update({
            where: { id: referralId, organizationId },
            data: updateData,
        });

        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update referral';
        return { success: false, error: msg };
    }
}

export async function getDashboardReferrals(doctorId: string) {
    const { db, organizationId } = await requireTenantContext();

    const [incoming, outgoing] = await Promise.all([
        (db as any).referralOrder.findMany({
            where: { referred_to: doctorId, organizationId, status: { in: ['pending', 'accepted'] } },
            orderBy: { referred_at: 'desc' },
            take: 20,
        }),
        (db as any).referralOrder.findMany({
            where: { referred_by: doctorId, organizationId },
            orderBy: { referred_at: 'desc' },
            take: 20,
        }),
    ]);

    return {
        success: true,
        data: {
            incoming: JSON.parse(JSON.stringify(incoming)),
            outgoing: JSON.parse(JSON.stringify(outgoing)),
        },
    };
}
