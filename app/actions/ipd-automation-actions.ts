'use server';

import { requireTenantContext } from '@/backend/tenant';
import { accrueIPDDailyCharges } from '@/app/actions/ipd-actions';

// ─────────────────────────────────────────────────────────────────────────────
// DEPOSIT CONSUMPTION ALERT
// Called after every charge posting — checks how much deposit is consumed
// ─────────────────────────────────────────────────────────────────────────────

export async function checkDepositConsumption(admissionId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Get the admission's active invoice total
        const invoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
            select: { total_amount: true, net_amount: true },
        });

        // Get all active deposits for this patient via admission
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { patient_id: true },
        });

        const deposits = await db.patientDeposit.findMany({
            where: {
                organizationId,
                patient_id: admission?.patient_id ?? '',
                status: 'Active',
            },
        });

        const totalDeposit = deposits.reduce((s: number, d: any) => s + Number(d.amount), 0);
        const totalCharged = Number(invoice?.net_amount ?? invoice?.total_amount ?? 0);

        if (totalDeposit === 0) return { success: true, percentage: 0, alert_level: 'none' };

        const percentage = Math.round((totalCharged / totalDeposit) * 100);

        let alert_level: 'none' | 'info' | 'warning' | 'critical' | 'blocked' = 'none';
        if (percentage >= 100) alert_level = 'blocked';
        else if (percentage >= 90) alert_level = 'critical';
        else if (percentage >= 80) alert_level = 'warning';
        else if (percentage >= 70) alert_level = 'info';

        const recommended_enhancement = alert_level !== 'none'
            ? Math.max(0, Math.round(totalCharged * 1.3 - totalDeposit))
            : 0;

        return {
            success: true,
            percentage,
            alert_level,
            total_charged: totalCharged,
            total_deposit: totalDeposit,
            recommended_enhancement_amount: recommended_enhancement,
        };
    } catch (error: any) {
        console.error('checkDepositConsumption error:', error);
        return { success: false, percentage: 0, alert_level: 'none' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL DEPOSIT ALERTS FOR ACTIVE ADMISSIONS
// Used on IPD dashboard / manager view
// ─────────────────────────────────────────────────────────────────────────────

export async function getDepositAlerts() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const admissions = await db.admissions.findMany({
            where: { organizationId, status: 'Admitted' },
            include: {
                patient: { select: { full_name: true } },
                invoices: { where: { status: { not: 'Cancelled' } }, select: { net_amount: true, total_amount: true } },
            },
        });

        const alerts = [];
        for (const a of admissions) {
            const totalCharged = a.invoices.reduce((s: number, inv: any) =>
                s + Number(inv.net_amount ?? inv.total_amount ?? 0), 0);

            const deposits = await db.patientDeposit.findMany({
                where: { organizationId, patient_id: a.patient_id, status: 'Active' },
            });
            const totalDeposit = deposits.reduce((s: number, d: any) => s + Number(d.amount), 0);

            if (totalDeposit === 0) continue;

            const percentage = Math.round((totalCharged / totalDeposit) * 100);
            if (percentage >= 70) {
                alerts.push({
                    admission_id: a.admission_id,
                    patient_name: a.patient?.full_name ?? 'Unknown',
                    patient_id: a.patient_id,
                    percentage,
                    total_charged: totalCharged,
                    total_deposit: totalDeposit,
                    alert_level: percentage >= 100 ? 'blocked' : percentage >= 90 ? 'critical' : percentage >= 80 ? 'warning' : 'info',
                });
            }
        }

        alerts.sort((a, b) => b.percentage - a.percentage);
        return { success: true, data: alerts };
    } catch (error: any) {
        console.error('getDepositAlerts error:', error);
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EDD (EXPECTED DISCHARGE DATE) REMINDERS
// Returns patients with EDD = tomorrow
// ─────────────────────────────────────────────────────────────────────────────

export async function getEDDReminders() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfter = new Date(tomorrow);
        dayAfter.setHours(23, 59, 59, 999);

        const admissions = await db.admissions.findMany({
            where: {
                organizationId,
                status: 'Admitted',
                expected_discharge_date: { gte: tomorrow, lte: dayAfter },
            },
            include: { patient: { select: { full_name: true } }, ward: true, bed: true },
        });

        return {
            success: true,
            data: JSON.parse(JSON.stringify(admissions.map((a: any) => ({
                admission_id: a.admission_id,
                patient_name: a.patient?.full_name ?? 'Unknown',
                ward: a.ward?.ward_name,
                bed: a.bed_id,
                doctor: a.doctor_name,
                edd: a.expected_discharge_date,
                fit_for_discharge: !!a.fit_for_discharge_at,
            })))),
        };
    } catch (error: any) {
        console.error('getEDDReminders error:', error);
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERDUE ADMISSIONS (past EDD, still admitted)
// ─────────────────────────────────────────────────────────────────────────────

export async function getOverdueAdmissions() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const now = new Date();
        const admissions = await db.admissions.findMany({
            where: {
                organizationId,
                status: 'Admitted',
                expected_discharge_date: { lt: now },
            },
            include: { patient: { select: { full_name: true } }, ward: true },
        });

        return {
            success: true,
            data: JSON.parse(JSON.stringify(admissions.map((a: any) => ({
                admission_id: a.admission_id,
                patient_name: a.patient?.full_name ?? 'Unknown',
                ward: a.ward?.ward_name,
                doctor: a.doctor_name,
                edd: a.expected_discharge_date,
                overdue_days: Math.floor((now.getTime() - new Date(a.expected_discharge_date).getTime()) / 86400000),
            })))),
        };
    } catch (error: any) {
        return { success: false, data: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BED CLEANING SLA CHECK
// ─────────────────────────────────────────────────────────────────────────────

export async function getBedCleaningSLAStatus() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const cleaningBeds = await db.beds.findMany({
            where: { organizationId, status: 'Cleaning' },
            include: { wards: true },
        });

        const now = Date.now();
        const SLA_MINUTES = 45; // default SLA

        const result = cleaningBeds.map((b: any) => {
            const startedAt = b.cleaning_started_at ? new Date(b.cleaning_started_at).getTime() : null;
            const elapsedMinutes = startedAt ? Math.floor((now - startedAt) / 60000) : null;
            const breached = elapsedMinutes !== null && elapsedMinutes > SLA_MINUTES;

            return {
                bed_id: b.bed_id,
                ward_name: b.wards?.ward_name ?? 'Unknown',
                cleaning_started_at: b.cleaning_started_at,
                elapsed_minutes: elapsedMinutes,
                sla_minutes: SLA_MINUTES,
                breached,
                last_occupied_by: b.last_occupied_by,
            };
        });

        return { success: true, data: result };
    } catch (error: any) {
        return { success: false, data: [] };
    }
}

export async function startBedCleaning(bedId: string) {
    try {
        const { db } = await requireTenantContext();
        await db.beds.update({
            where: { bed_id: bedId },
            data: { cleaning_started_at: new Date(), status: 'Cleaning' },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function completeBedCleaning(bedId: string) {
    try {
        const { db } = await requireTenantContext();
        await db.beds.update({
            where: { bed_id: bedId },
            data: { cleaning_completed_at: new Date(), status: 'Available' },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BED CLEANING SLA ESCALATION
// Finds all beds breaching SLA, logs escalation to audit trail.
// Called by cron every 15 minutes.
// ─────────────────────────────────────────────────────────────────────────────

const SLA_MINUTES = 45;

export async function escalateBedCleaningSLA() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const cleaningBeds = await db.beds.findMany({
            where: { organizationId, status: 'Cleaning' },
            include: { wards: true },
        });

        const now = Date.now();
        let escalated = 0;

        for (const bed of cleaningBeds) {
            if (!bed.cleaning_started_at) continue;
            const elapsedMinutes = Math.floor((now - new Date(bed.cleaning_started_at).getTime()) / 60000);
            if (elapsedMinutes <= SLA_MINUTES) continue;

            // Log escalation to audit trail
            await db.system_audit_logs.create({
                data: {
                    user_id: 'system',
                    username: 'cron',
                    role: 'system',
                    action: 'BED_CLEANING_SLA_BREACH',
                    module: 'IPD',
                    entity_type: 'bed',
                    entity_id: bed.bed_id,
                    details: JSON.stringify({
                        bed_id: bed.bed_id,
                        ward: bed.wards?.ward_name ?? 'Unknown',
                        cleaning_started_at: bed.cleaning_started_at,
                        elapsed_minutes: elapsedMinutes,
                        sla_minutes: SLA_MINUTES,
                    }),
                    ip_address: null,
                    organizationId,
                    created_at: new Date(),
                },
            });

            escalated++;
        }

        return {
            success: true,
            checked: cleaningBeds.length,
            escalated,
        };
    } catch (error: any) {
        console.error('escalateBedCleaningSLA error:', error);
        return { success: false, error: error.message };
    }
}
