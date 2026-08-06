'use server';

import { requireTenantContext } from '@/backend/tenant';
import { getTodayRange, getOrgTimezone } from '@/app/lib/timezone';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { notifyPatient } from '@/app/lib/notify-patient';
import { getPatientBalances } from '@/app/actions/balance-actions';
import { postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';
import { computeLabFlag, parseLeadingNumber } from '@/app/lib/lab/flag';

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

        // Reference range for this test (matched by test_type = catalog test_name),
        // used to show the range + auto-flag the entered value.
        const testInfo = await db.lab_test_inventory.findFirst({
            where: { test_name: order.test_type },
            select: {
                normal_range_min: true, normal_range_max: true,
                critical_value_low: true, critical_value_high: true, unit: true,
            },
        });

        const tracking = await db.labSampleTracking.findUnique({
            where: { barcode },
            select: { status: true, collected_at: true, received_at: true, processed_at: true, completed_at: true, notes: true },
        });

        return {
            success: true,
            data: {
                ...order,
                patient_name: patient?.full_name || 'Unknown',
                patient_phone: patient?.phone,
                testInfo: testInfo || null,
                tracking: tracking || null,
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

        const [pendingCount, completedToday, criticalCount] = await Promise.all([
            db.lab_orders.count({
                where: { status: { in: ['Pending', 'Processing'] } }
            }),
            db.lab_orders.count({
                where: { status: 'Completed', created_at: { gte: todayStart } }
            }),
            db.lab_orders.count({
                where: { is_critical: true, status: { not: 'Completed' } }
            }),
        ]);

        return { success: true, pendingCount, completedToday, criticalCount };
    } catch (error) {
        return { success: false, pendingCount: 0, completedToday: 0, criticalCount: 0 };
    }
}

/**
 * Notify the ordering doctor of a critical lab result (in-app + WhatsApp).
 * Shared by uploadResult() and flagCriticalResult() so a critical is alerted the
 * moment it is flagged, not only on completion. Non-throwing.
 */
async function notifyCriticalResult(
    db: any,
    order: { doctor_id: string | null; patient_id: string; test_type: string; barcode: string },
    resultValue: string,
    remarks: string,
) {
    if (!order.doctor_id) return;
    try {
        const doctor = await db.user.findUnique({
            where: { id: order.doctor_id },
            select: { name: true, phone: true, email: true },
        });
        if (!doctor) return;

        // In-app notification for the doctor
        await db.notification.create({
            data: {
                user_id: order.doctor_id,
                title: '🚨 Critical Lab Result',
                message: `CRITICAL result for patient ${order.patient_id}: ${order.test_type} — ${resultValue}. ${remarks ? `Remarks: ${remarks}` : ''}`,
                type: 'critical_lab',
                is_read: false,
                entity_type: 'lab_order',
                entity_id: order.barcode,
            },
        }).catch(() => {/* notification table may not exist in all orgs */});

        // WhatsApp alert to the doctor
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
            entity_id: order.barcode,
            details: `Doctor ${doctor.name} notified of critical result`,
        });
    } catch (notifyErr) {
        console.error('[Critical Lab] Doctor notification failed:', notifyErr);
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

        // Auto-detect critical from the numeric value vs the catalog's critical limits
        let numericCritical = false;
        const existingOrder = await db.lab_orders.findUnique({ where: { barcode }, select: { test_type: true } });
        const numeric = parseLeadingNumber(resultValue);
        if (existingOrder && numeric != null) {
            const testInfo = await db.lab_test_inventory.findFirst({
                where: { test_name: existingOrder.test_type },
                select: { normal_range_min: true, normal_range_max: true, critical_value_low: true, critical_value_high: true },
            });
            if (testInfo) {
                numericCritical = computeLabFlag(numeric, testInfo)?.level === 'critical';
            }
        }

        const markCritical = isCritical || autoDetectCritical || numericCritical

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

        // Stamp completion time for accurate TAT (no-migration: sample-tracking table).
        // Find-then-update/create mirrors updateSampleStatus so the tenant client
        // auto-injects organizationId on create.
        try {
            const existingTracking = await db.labSampleTracking.findUnique({ where: { barcode } });
            if (existingTracking) {
                await db.labSampleTracking.update({ where: { barcode }, data: { status: 'Completed', completed_at: new Date() } });
            } else {
                await db.labSampleTracking.create({ data: { barcode, status: 'Completed', collected_at: order.created_at, completed_at: new Date() } });
            }
        } catch (e) {
            console.warn('[Lab] tracking completed_at stamp failed:', e);
        }

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

        // 3. CRITICAL RESULT: notify the ordering doctor immediately (shared helper)
        if (markCritical) {
            await notifyCriticalResult(db, order, resultValue, remarks);
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

        // TAT: real elapsed minutes from order creation to completion, using the
        // completion timestamp captured on the sample-tracking record (not "now").
        const completedOrders = await db.lab_orders.findMany({
            where: { status: 'Completed', created_at: { gte: todayStart } },
            select: { barcode: true, created_at: true },
        });

        let avgTAT = 0;
        if (completedOrders.length > 0) {
            const tracking = await db.labSampleTracking.findMany({
                where: {
                    barcode: { in: completedOrders.map((o: any) => o.barcode) },
                    completed_at: { not: null },
                },
                select: { barcode: true, completed_at: true },
            });
            const doneAt = new Map<string, Date>();
            for (const t of tracking as any[]) {
                if (t.completed_at) doneAt.set(t.barcode, new Date(t.completed_at));
            }
            const durations = completedOrders
                .map((o: any) => {
                    const done = doneAt.get(o.barcode);
                    if (!done) return null;
                    return (done.getTime() - new Date(o.created_at).getTime()) / (1000 * 60);
                })
                .filter((d: number | null): d is number => d != null && d >= 0);
            if (durations.length > 0) {
                avgTAT = Math.round(durations.reduce((s: number, d: number) => s + d, 0) / durations.length);
            }
        }

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

        const order = await db.lab_orders.update({
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

        // Alert the ordering doctor immediately (previously only fired on completion)
        await notifyCriticalResult(db, order, order.result_value || 'Pending — flagged critical', order.technician_remarks || '');

        revalidatePath('/lab/worklist');
        revalidatePath('/lab/technician');
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
    hsn_sac_code?: string;
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
                hsn_sac_code: data.hsn_sac_code || null,
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
    hsn_sac_code?: string | null;
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

// ========================================
// LAB PANELS (test bundles / profiles)
// ========================================

export async function getLabPanels() {
    try {
        const { db } = await requireTenantContext();
        const panels = await db.labPanel.findMany({
            orderBy: { panel_name: 'asc' },
            include: { panel_tests: { orderBy: { sort_order: 'asc' } } },
        });
        return { success: true, data: JSON.parse(JSON.stringify(panels)) };
    } catch (error) {
        console.error('Get Lab Panels Error:', error);
        return { success: false, data: [] };
    }
}

export async function createLabPanel(data: {
    panel_name: string;
    panel_code?: string;
    panel_price: number;
    testIds: number[];
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const tests = await db.lab_test_inventory.findMany({
            where: { id: { in: data.testIds }, organizationId },
            select: { id: true, test_name: true },
        });
        if (tests.length === 0) return { success: false, error: 'Select at least one test' };

        const panel = await db.labPanel.create({
            data: {
                panel_name: data.panel_name,
                panel_code: data.panel_code || null,
                panel_price: data.panel_price,
                organizationId,
                panel_tests: {
                    create: tests.map((t: any, i: number) => ({ test_id: t.id, test_name: t.test_name, sort_order: i })),
                },
            },
        });
        revalidatePath('/lab/panels');
        return { success: true, data: JSON.parse(JSON.stringify(panel)) };
    } catch (error: any) {
        if (error?.code === 'P2002') return { success: false, error: 'Panel name already exists' };
        console.error('Create Lab Panel Error:', error);
        return { success: false, error: 'Failed to create panel' };
    }
}

export async function updateLabPanel(id: number, data: {
    panel_name?: string;
    panel_code?: string;
    panel_price?: number;
    is_active?: boolean;
    testIds?: number[];
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        await db.labPanel.update({
            where: { id },
            data: {
                ...(data.panel_name !== undefined ? { panel_name: data.panel_name } : {}),
                ...(data.panel_code !== undefined ? { panel_code: data.panel_code || null } : {}),
                ...(data.panel_price !== undefined ? { panel_price: data.panel_price } : {}),
                ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
            },
        });
        if (data.testIds) {
            const tests = await db.lab_test_inventory.findMany({
                where: { id: { in: data.testIds }, organizationId },
                select: { id: true, test_name: true },
            });
            await db.labPanelTest.deleteMany({ where: { panel_id: id } });
            if (tests.length > 0) {
                await db.labPanelTest.createMany({
                    data: tests.map((t: any, i: number) => ({ panel_id: id, test_id: t.id, test_name: t.test_name, sort_order: i })),
                });
            }
        }
        revalidatePath('/lab/panels');
        return { success: true };
    } catch (error: any) {
        if (error?.code === 'P2002') return { success: false, error: 'Panel name already exists' };
        console.error('Update Lab Panel Error:', error);
        return { success: false, error: 'Failed to update panel' };
    }
}

export async function deleteLabPanel(id: number) {
    try {
        const { db } = await requireTenantContext();
        await db.labPanel.delete({ where: { id } });
        revalidatePath('/lab/panels');
        return { success: true };
    } catch (error) {
        console.error('Delete Lab Panel Error:', error);
        return { success: false, error: 'Failed to delete panel' };
    }
}

/**
 * Order a whole panel for a patient: creates one lab_orders row per panel test.
 * Sequential awaits so lab_orders.count() reflects each just-created row
 * (mirrors orderLabTest) — no barcode collision within the loop.
 */
export async function orderLabPanel(data: { patient_id: string; doctor_id?: string; panel_id: number }) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const panel = await db.labPanel.findUnique({
            where: { id: data.panel_id },
            include: { panel_tests: { orderBy: { sort_order: 'asc' } } },
        });
        if (!panel || panel.panel_tests.length === 0) {
            return { success: false, error: 'Panel not found or has no tests' };
        }

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const barcodes: string[] = [];
        for (const pt of panel.panel_tests) {
            const count = await db.lab_orders.count();
            const barcode = `LAB-${dateStr}-${String(count + 1).padStart(4, '0')}`;
            await db.lab_orders.create({
                data: {
                    barcode,
                    patient_id: data.patient_id,
                    doctor_id: data.doctor_id || 'LAB',
                    test_type: pt.test_name,
                    status: 'Pending',
                    assigned_technician_id: 'Lab Tech',
                    organizationId,
                },
            });
            barcodes.push(barcode);
        }

        await logAudit({
            action: 'LAB_PANEL_ORDERED',
            module: 'Lab',
            entity_type: 'lab_panel',
            entity_id: String(data.panel_id),
            details: JSON.stringify({ patient_id: data.patient_id, panel: panel.panel_name, barcodes }),
        });

        revalidatePath('/lab/worklist');
        revalidatePath('/lab/technician');
        return { success: true, barcodes, count: barcodes.length };
    } catch (error) {
        console.error('Order Lab Panel Error:', error);
        return { success: false, error: 'Failed to order panel' };
    }
}

// ========================================
// SAMPLE ACCESSIONING (collect / reject-recollect)
// ========================================

export async function markSampleCollected(barcode: string) {
    try {
        const { db } = await requireTenantContext();
        const now = new Date();
        const existing = await db.labSampleTracking.findUnique({ where: { barcode } });
        if (existing) {
            await db.labSampleTracking.update({
                where: { barcode },
                data: {
                    collected_at: existing.collected_at || now,
                    status: existing.status === 'Rejected' ? 'Collected' : existing.status,
                },
            });
        } else {
            await db.labSampleTracking.create({ data: { barcode, status: 'Collected', collected_at: now } });
        }
        await logAudit({ action: 'LAB_SAMPLE_COLLECTED', module: 'Lab', entity_type: 'lab_order', entity_id: barcode, details: 'Sample collected' });
        revalidatePath('/lab/worklist');
        return { success: true };
    } catch (error) {
        console.error('Mark Collected Error:', error);
        return { success: false, error: 'Failed to mark sample collected' };
    }
}

export async function rejectSample(barcode: string, reason: string) {
    try {
        const { db } = await requireTenantContext();
        const now = new Date();
        const noteLine = `Rejected (${now.toISOString().slice(0, 10)}): ${reason}`;
        const existing = await db.labSampleTracking.findUnique({ where: { barcode } });
        if (existing) {
            await db.labSampleTracking.update({
                where: { barcode },
                data: { status: 'Rejected', notes: existing.notes ? `${existing.notes}\n${noteLine}` : noteLine },
            });
        } else {
            await db.labSampleTracking.create({ data: { barcode, status: 'Rejected', notes: noteLine, collected_at: now } });
        }
        // Send the order back to Pending so it reappears for recollection.
        await db.lab_orders.update({ where: { barcode }, data: { status: 'Pending' } });
        await logAudit({ action: 'LAB_SAMPLE_REJECTED', module: 'Lab', entity_type: 'lab_order', entity_id: barcode, details: reason });
        revalidatePath('/lab/worklist');
        revalidatePath('/lab/technician');
        return { success: true };
    } catch (error) {
        console.error('Reject Sample Error:', error);
        return { success: false, error: 'Failed to reject sample' };
    }
}

// ========================================
// CRITICAL-VALUE CALLBACK LOG (recorded in the audit log — no schema change)
// ========================================

export async function logCriticalCallback(data: {
    barcode: string;
    notified_name: string;
    notified_role?: string;
    read_back_confirmed: boolean;
    remarks?: string;
}) {
    try {
        await requireTenantContext();
        await logAudit({
            action: 'CRITICAL_VALUE_CALLBACK',
            module: 'Lab',
            entity_type: 'lab_order',
            entity_id: data.barcode,
            details: JSON.stringify({
                notified_name: data.notified_name,
                notified_role: data.notified_role || '',
                read_back_confirmed: !!data.read_back_confirmed,
                remarks: data.remarks || '',
            }),
        });
        revalidatePath('/lab/critical-log');
        return { success: true };
    } catch (error) {
        console.error('Log Critical Callback Error:', error);
        return { success: false, error: 'Failed to log callback' };
    }
}

export async function getCriticalCallbacks() {
    try {
        const { db } = await requireTenantContext();
        const rows = await db.system_audit_logs.findMany({
            where: { action: 'CRITICAL_VALUE_CALLBACK', module: 'Lab' },
            orderBy: { created_at: 'desc' },
            take: 200,
        });
        const data = rows.map((r: any) => {
            let parsed: any = {};
            try { parsed = r.details ? JSON.parse(r.details) : {}; } catch { parsed = {}; }
            return {
                id: r.id,
                barcode: r.entity_id,
                logged_by: r.username || 'unknown',
                created_at: r.created_at,
                notified_name: parsed.notified_name || '',
                notified_role: parsed.notified_role || '',
                read_back_confirmed: !!parsed.read_back_confirmed,
                remarks: parsed.remarks || '',
            };
        });
        return { success: true, data: JSON.parse(JSON.stringify(data)) };
    } catch (error) {
        console.error('Get Critical Callbacks Error:', error);
        return { success: false, data: [] };
    }
}
