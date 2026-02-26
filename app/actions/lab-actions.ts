'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { sendLabReportReady } from '@/app/lib/whatsapp';

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
        const patientIds = Array.from(new Set(orders.map((o: any) => o.patient_id)));
        const patients = await db.oPD_REG.findMany({
            where: { patient_id: { in: patientIds } },
            select: { patient_id: true, full_name: true }
        });

        const patientMap = new Map(patients.map((p: any) => [p.patient_id, p.full_name]));

        const enrichedOrders = orders.map((order: any) => ({
            order_id: order.barcode,
            patient_name: patientMap.get(order.patient_id) || 'Unknown',
            test_type: order.test_type,
            doctor_name: order.doctor_id,
            status: order.status,
            result_value: order.result_value,
            created_at: order.created_at
        }));

        return { success: true, data: enrichedOrders };
    } catch (error) {
        console.error('Lab Orders Fetch Error:', error);
        return { success: false, data: [] };
    }
}

export async function getLabStats() {
    try {
        const { db } = await requireTenantContext();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [pendingCount, completedToday] = await Promise.all([
            db.lab_orders.count({
                where: { status: { in: ['Pending', 'Processing'] } }
            }),
            db.lab_orders.count({
                where: { status: 'Completed', created_at: { gte: today } }
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
                // technician_remarks: remarks // Add to schema if needed, for now just result_value
            },
        });


        await logAudit({
            action: 'LAB_RESULT_ENTERED',
            module: 'Lab',
            entity_type: 'lab_order',
            entity_id: barcode,
            details: JSON.stringify({ resultValue, remarks }),
        });

        // Send WhatsApp notification (non-blocking)
        const patient = await db.oPD_REG.findFirst({ where: { patient_id: order.patient_id }, select: { phone: true, full_name: true } });
        if (patient?.phone) {
            sendLabReportReady(patient.phone, patient.full_name, order.test_type).catch(err =>
                console.warn('[WhatsApp] Failed to send lab report notification:', err)
            );
        }

        revalidatePath('/lab/technician');
        return { success: true };
    } catch (error) {
        console.error('Upload Error:', error);
        return { success: false, error: 'Failed to upload result' };
    }
}
