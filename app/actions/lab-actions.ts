'use server';

import { requireTenantContext } from '@/backend/tenant';
import { getTodayRange, getOrgTimezone } from '@/app/lib/timezone';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { notifyPatient } from '@/app/lib/notify-patient';
import { getPatientBalances } from '@/app/actions/balance-actions';

export async function getLabOrders(statusFilter: 'Pending' | 'Completed' | 'All' = 'Pending') {
    try {
        const { db } = await requireTenantContext();

        const whereClause: any = {};
        if (statusFilter === 'Pending') {
            whereClause.status = { in: ['Pending', 'Processing'] };
        } else if (statusFilter === 'Completed') {
            whereClause.status = 'Completed';
        }

        const orders = await db.lab_orders.findMany({
            where: whereClause,
            orderBy: { created_at: 'desc' },
        });

        // Enrich with Patient Names
        const patientIds = Array.from(new Set(orders.map((o: any) => o.patient_id))) as string[];
        const patients = await db.oPD_REG.findMany({
            where: { patient_id: { in: patientIds } },
            select: { patient_id: true, full_name: true }
        });

        const balances = await getPatientBalances(patientIds);
        const patientMap = new Map(patients.map((p: any) => [p.patient_id, p.full_name]));

        const enrichedOrders = orders.map((order: any) => ({
            order_id: order.barcode,
            patient_id: order.patient_id,
            patient_name: patientMap.get(order.patient_id) || 'Unknown',
            test_type: order.test_type,
            doctor_name: order.doctor_id,
            status: order.status,
            result_value: order.result_value,
            created_at: order.created_at,
            labBalance: balances[order.patient_id]?.labBalance || 0
        }));

        return { success: true, data: enrichedOrders };
    } catch (error) {
        console.error('Lab Orders Fetch Error:', error);
        return { success: false, data: [] };
    }
}

export async function getLabOrderDetails(barcode: string) {
    try {
        const { db } = await requireTenantContext();

        const order = await db.lab_orders.findUnique({
            where: { barcode }
        });

        if (!order) return { success: false, error: 'Order not found' };

        const patient = await db.oPD_REG.findUnique({
            where: { patient_id: order.patient_id },
            select: { full_name: true, phone: true }
        });

        return {
            success: true,
            data: {
                ...order,
                patient_name: patient?.full_name || 'Unknown',
                patient_phone: patient?.phone
            }
        };
    } catch (error) {
        console.error('Fetch Order Detail Error:', error);
        return { success: false, error: 'Failed to fetch details' };
    }
}

export async function getLabStats() {
    try {
        const { db } = await requireTenantContext();

        const tz = await getOrgTimezone();
        const { start: todayStart } = getTodayRange(tz);

        const [pendingCount, completedToday] = await Promise.all([
            db.lab_orders.count({
                where: { status: { in: ['Pending', 'Processing'] } }
            }),
            db.lab_orders.count({
                where: { status: 'Completed', created_at: { gte: todayStart } }
            }),
        ]);

        return { success: true, pendingCount, completedToday };
    } catch (error) {
        return { success: false, pendingCount: 0, completedToday: 0 };
    }
}

export async function uploadResult(barcode: string, resultValue: string, remarks: string) {
    try {
        const { db } = await requireTenantContext();

        // 1. Update Local DB
        const order = await db.lab_orders.update({
            where: { barcode: barcode },
            data: {
                status: 'Completed',
                result_value: resultValue,
                technician_remarks: remarks,
            },
        });


        await logAudit({
            action: 'LAB_RESULT_ENTERED',
            module: 'Lab',
            entity_type: 'lab_order',
            entity_id: barcode,
            details: JSON.stringify({ resultValue, remarks }),
        });

        // Send notification (email + WhatsApp, non-blocking)
        const patient = await db.oPD_REG.findFirst({ where: { patient_id: order.patient_id }, select: { phone: true, email: true, full_name: true } });
        if (patient) {
            notifyPatient(
                { email: patient.email, phone: patient.phone },
                { type: 'lab_report', patientName: patient.full_name, testName: order.test_type },
            ).catch(err => console.warn('[Notify] Lab report notification failed:', err));
        }

        revalidatePath('/lab/technician');
        revalidatePath('/lab/worklist');
        return { success: true };
    } catch (error) {
        console.error('Upload Error:', error);
        return { success: false, error: 'Failed to upload result' };
    }
}

// ========================================
// LAB DASHBOARD STATS
// ========================================

export async function getLabDashboardStats() {
    try {
        const { db } = await requireTenantContext();

        const tz = await getOrgTimezone();
        const { start: todayStart, end: todayEnd } = getTodayRange(tz);

        const [
            pendingCount, processingCount, completedToday, totalToday,
            criticalCount, totalAll
        ] = await Promise.all([
            db.lab_orders.count({ where: { status: 'Pending' } }),
            db.lab_orders.count({ where: { status: 'Processing' } }),
            db.lab_orders.count({ where: { status: 'Completed', created_at: { gte: todayStart } } }),
            db.lab_orders.count({ where: { created_at: { gte: todayStart } } }),
            db.lab_orders.count({ where: { is_critical: true, status: { not: 'Completed' } } }),
            db.lab_orders.count(),
        ]);

        // TAT calculation: average time from creation to completion for today's completed orders
        const completedOrders = await db.lab_orders.findMany({
            where: { status: 'Completed', created_at: { gte: todayStart } },
            select: { created_at: true },
        });

        // Approximate TAT (since we don't have completed_at on lab_orders, use current time as estimate)
        const avgTAT = completedOrders.length > 0 ? Math.round(
            completedOrders.reduce((sum: number, o: any) => {
                return sum + (Date.now() - new Date(o.created_at).getTime()) / (1000 * 60);
            }, 0) / completedOrders.length
        ) : 0;

        return {
            success: true,
            data: { pendingCount, processingCount, completedToday, totalToday, criticalCount, totalAll, avgTAT },
        };
    } catch (error) {
        console.error('Lab Dashboard Stats Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// SAMPLE TRACKING
// ========================================

export async function updateSampleStatus(barcode: string, status: string, notes?: string) {
    try {
        const { db } = await requireTenantContext();

        const updateData: any = { status };
        if (notes) updateData.notes = notes;

        const now = new Date();
        if (status === 'Received') updateData.received_at = now;
        else if (status === 'Processing') updateData.processed_at = now;
        else if (status === 'Completed') updateData.completed_at = now;

        // Try to update sample tracking record, create if doesn't exist
        const existing = await db.labSampleTracking.findUnique({ where: { barcode } });
        if (existing) {
            await db.labSampleTracking.update({ where: { barcode }, data: updateData });
        } else {
            await db.labSampleTracking.create({
                data: { barcode, status, notes, collected_at: now },
            });
        }

        // Also update lab_orders status
        await db.lab_orders.update({
            where: { barcode },
            data: { status },
        });

        revalidatePath('/lab/worklist');
        revalidatePath('/lab/technician');
        return { success: true };
    } catch (error) {
        console.error('Update Sample Status Error:', error);
        return { success: false, error: 'Failed to update status' };
    }
}

export async function flagCriticalResult(barcode: string) {
    try {
        const { db } = await requireTenantContext();

        await db.lab_orders.update({
            where: { barcode },
            data: { is_critical: true, critical_notified_at: new Date() },
        });

        await logAudit({
            action: 'CRITICAL_RESULT_FLAGGED',
            module: 'Lab',
            entity_type: 'lab_order',
            entity_id: barcode,
            details: 'Critical result flagged for immediate attention',
        });

        revalidatePath('/lab/worklist');
        return { success: true };
    } catch (error) {
        console.error('Flag Critical Error:', error);
        return { success: false, error: 'Failed to flag critical result' };
    }
}

// ========================================
// LAB INVENTORY (REAGENTS)
// ========================================

export async function getLabInventory() {
    try {
        const { db } = await requireTenantContext();

        const inventory = await db.labReagentInventory.findMany({
            orderBy: { reagent_name: 'asc' },
        });

        return { success: true, data: inventory };
    } catch (error) {
        console.error('Lab Inventory Error:', error);
        return { success: false, data: [] };
    }
}

export async function updateLabInventory(id: number, data: {
    reagent_name?: string;
    current_stock?: number;
    unit?: string;
    min_threshold?: number;
    expiry_date?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const updateData: any = { ...data };
        if (data.expiry_date) updateData.expiry_date = new Date(data.expiry_date);

        await db.labReagentInventory.update({ where: { id }, data: updateData });
        revalidatePath('/lab/inventory');
        return { success: true };
    } catch (error) {
        console.error('Update Lab Inventory Error:', error);
        return { success: false, error: 'Failed to update' };
    }
}

export async function addLabReagent(data: {
    reagent_name: string;
    current_stock: number;
    unit: string;
    min_threshold: number;
    expiry_date?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        await db.labReagentInventory.create({
            data: {
                reagent_name: data.reagent_name,
                current_stock: data.current_stock,
                unit: data.unit,
                min_threshold: data.min_threshold,
                expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
            },
        });

        revalidatePath('/lab/inventory');
        return { success: true };
    } catch (error) {
        console.error('Add Reagent Error:', error);
        return { success: false, error: 'Failed to add reagent' };
    }
}

// ========================================
// LAB REPORTS
// ========================================

export async function getLabTATReport(days: number = 7) {
    try {
        const { db } = await requireTenantContext();

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const orders = await db.lab_orders.findMany({
            where: { created_at: { gte: startDate } },
            orderBy: { created_at: 'asc' },
        });

        // Group by date
        const dailyStats: Record<string, { total: number; completed: number; pending: number }> = {};
        const testCounts: Record<string, number> = {};

        for (const order of orders) {
            const date = new Date(order.created_at).toISOString().split('T')[0];
            if (!dailyStats[date]) dailyStats[date] = { total: 0, completed: 0, pending: 0 };
            dailyStats[date].total++;
            if (order.status === 'Completed') dailyStats[date].completed++;
            else dailyStats[date].pending++;

            testCounts[order.test_type] = (testCounts[order.test_type] || 0) + 1;
        }

        return {
            success: true,
            data: {
                dailyStats: Object.entries(dailyStats).map(([date, stats]) => ({ date, ...stats })),
                testCounts: Object.entries(testCounts).map(([test, count]) => ({ test, count })).sort((a, b) => b.count - a.count),
                totalOrders: orders.length,
            },
        };
    } catch (error) {
        console.error('Lab TAT Report Error:', error);
        return { success: false, data: null };
    }
}
