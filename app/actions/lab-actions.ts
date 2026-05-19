'use server';

import { requireTenantContext } from '@/backend/tenant';
import { getTodayRange, getOrgTimezone } from '@/app/lib/timezone';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { notifyPatient } from '@/app/lib/notify-patient';
import { getPatientBalances } from '@/app/actions/balance-actions';
import { postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';

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

export async function uploadResult(barcode: string, resultValue: string, remarks: string, isCritical?: boolean) {
    try {
        const { db } = await requireTenantContext();

        // Determine if result is critical based on flag or remarks keywords
        const criticalKeywords = ['critical', 'panic', 'urgent', 'stat', 'life-threatening', 'dangerously']
        const autoDetectCritical = criticalKeywords.some(k =>
            remarks?.toLowerCase().includes(k) || resultValue?.toLowerCase().includes(k)
        )
        const markCritical = isCritical || autoDetectCritical

        // 1. Update Local DB
        const order = await db.lab_orders.update({
            where: { barcode: barcode },
            data: {
                status: 'Completed',
                result_value: resultValue,
                technician_remarks: remarks,
                ...(markCritical ? { is_critical: true, critical_notified_at: new Date() } : {}),
            },
        });

        await logAudit({
            action: 'LAB_RESULT_ENTERED',
            module: 'Lab',
            entity_type: 'lab_order',
            entity_id: barcode,
            details: JSON.stringify({ resultValue, remarks, isCritical: markCritical }),
        });

        // 2. Notify patient (email + WhatsApp, non-blocking)
        const patient = await db.oPD_REG.findFirst({
            where: { patient_id: order.patient_id },
            select: { phone: true, email: true, full_name: true }
        });
        if (patient) {
            notifyPatient(
                { email: patient.email, phone: patient.phone },
                { type: 'lab_report', patientName: patient.full_name, testName: order.test_type },
            ).catch(err => console.warn('[Notify] Lab report notification failed:', err));
        }

        // 3. CRITICAL RESULT: Notify the ordering doctor immediately
        if (markCritical && order.doctor_id) {
            try {
                const doctor = await db.user.findUnique({
                    where: { id: order.doctor_id },
                    select: { name: true, phone: true, email: true },
                });

                if (doctor) {
                    // Create in-app notification for doctor
                    await db.notification.create({
                        data: {
                            user_id: order.doctor_id,
                            title: '🚨 Critical Lab Result',
                            message: `CRITICAL result for patient ${order.patient_id}: ${order.test_type} — ${resultValue}. ${remarks ? `Remarks: ${remarks}` : ''}`,
                            type: 'critical_lab',
                            is_read: false,
                            entity_type: 'lab_order',
                            entity_id: barcode,
                        },
                    }).catch(() => {/* notification table may not exist in all orgs */});

                    // WhatsApp alert to doctor
                    const { sendWhatsAppMessage, formatPhoneNumber } = await import('@/app/lib/whatsapp');
                    if (doctor.phone) {
                        sendWhatsAppMessage({
                            to: formatPhoneNumber(doctor.phone),
                            message: `🚨 *CRITICAL LAB RESULT*\n\nDoctor: ${doctor.name}\nPatient ID: ${order.patient_id}\nTest: ${order.test_type}\nResult: *${resultValue}*\n${remarks ? `Remarks: ${remarks}` : ''}\n\nImmediate review required.`,
                        }).catch(err => console.warn('[WhatsApp] Critical lab doctor alert failed:', err));
                    }

                    await logAudit({
                        action: 'CRITICAL_RESULT_DOCTOR_NOTIFIED',
                        module: 'Lab',
                        entity_type: 'lab_order',
                        entity_id: barcode,
                        details: `Doctor ${doctor.name} notified of critical result`,
                    });
                }
            } catch (notifyErr) {
                console.error('[Critical Lab] Doctor notification failed:', notifyErr);
            }
        }

        // IPD Integration: Post charge to IPD bill if patient has active admission
        const activeAdmission = await db.admissions.findFirst({
            where: { patient_id: order.patient_id, status: 'Admitted' },
        });

        if (activeAdmission) {
            const testInfo = await db.lab_test_inventory.findFirst({
                where: { test_name: order.test_type },
            });

            await postChargeToIpdBill({
                admission_id: activeAdmission.admission_id,
                source_module: 'lab',
                source_ref_id: barcode,
                description: `Lab: ${order.test_type}`,
                quantity: 1,
                unit_price: testInfo?.price || 0,
                tax_rate: testInfo?.tax_rate || 0,
                hsn_sac_code: testInfo?.hsn_sac_code || '998931',
                service_category: 'Lab',
            });
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

// ========================================
// TEST CATALOG (lab_test_inventory)
// ========================================

export async function getTestCatalog() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const tests = await db.lab_test_inventory.findMany({
            where: { organizationId },
            orderBy: { test_name: 'asc' },
        });
        return { success: true, data: JSON.parse(JSON.stringify(tests)) };
    } catch (error) {
        console.error('Get Test Catalog Error:', error);
        return { success: false, data: [] };
    }
}

export async function addTestTocatalog(data: {
    test_name: string;
    test_code?: string;
    price: number;
    category?: string;
    sample_type?: string;
    unit?: string;
    normal_range_min?: number;
    normal_range_max?: number;
    tax_rate?: number;
    turnaround_time?: string;
    requires_prescription?: boolean;
    critical_value_low?: number;
    critical_value_high?: number;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const test = await db.lab_test_inventory.create({
            data: {
                test_name: data.test_name,
                test_code: data.test_code || null,
                price: data.price,
                category: data.category || null,
                sample_type: data.sample_type || null,
                unit: data.unit || null,
                normal_range_min: data.normal_range_min ?? null,
                normal_range_max: data.normal_range_max ?? null,
                tax_rate: data.tax_rate ?? 0,
                turnaround_time: data.turnaround_time || null,
                requires_prescription: data.requires_prescription ?? false,
                critical_value_low: data.critical_value_low ?? null,
                critical_value_high: data.critical_value_high ?? null,
                is_available: true,
                organizationId,
            },
        });
        revalidatePath('/lab/tests');
        revalidatePath('/admin/lab');
        return { success: true, data: JSON.parse(JSON.stringify(test)) };
    } catch (error: any) {
        if (error?.code === 'P2002') return { success: false, error: 'Test name already exists' };
        console.error('Add Test Error:', error);
        return { success: false, error: 'Failed to add test' };
    }
}

export async function updateTestInCatalog(id: number, data: {
    test_name?: string;
    test_code?: string;
    price?: number;
    category?: string;
    sample_type?: string;
    unit?: string;
    normal_range_min?: number | null;
    normal_range_max?: number | null;
    tax_rate?: number;
    turnaround_time?: string | null;
    is_available?: boolean;
    requires_prescription?: boolean;
    critical_value_low?: number | null;
    critical_value_high?: number | null;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        await db.lab_test_inventory.update({
            where: { id, organizationId },
            data,
        });
        revalidatePath('/lab/tests');
        return { success: true };
    } catch (error) {
        console.error('Update Test Error:', error);
        return { success: false, error: 'Failed to update test' };
    }
}

export async function deleteTestFromCatalog(id: number) {
    try {
        const { db, organizationId } = await requireTenantContext();
        await db.lab_test_inventory.delete({ where: { id, organizationId } });
        revalidatePath('/lab/tests');
        return { success: true };
    } catch (error) {
        console.error('Delete Test Error:', error);
        return { success: false, error: 'Failed to delete test' };
    }
}

export async function toggleTestAvailability(id: number, is_available: boolean) {
    try {
        const { db, organizationId } = await requireTenantContext();
        await db.lab_test_inventory.update({
            where: { id, organizationId },
            data: { is_available },
        });
        revalidatePath('/lab/tests');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to toggle availability' };
    }
}
