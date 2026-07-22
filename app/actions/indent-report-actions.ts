'use server';

/**
 * Indent (requisition) register for pharmacy.
 *
 * Nurses raise indents from the ward and pharmacy actions them under IP Orders,
 * but there was no way to look back over them — no register, no ageing, no way
 * to answer "which indents are still pending" or "what did ward X consume last
 * month". This is that report.
 */

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(v: T): T {
    return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? Number(val) : val)));
}

export type IndentReportFilters = {
    from?: string;
    to?: string;
    status?: string;
    search?: string;
};

export async function getIndentReport(filters?: IndentReportFilters) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const where: any = { organizationId };

        if (filters?.status) where.status = filters.status;

        if (filters?.from || filters?.to) {
            where.created_at = {};
            if (filters.from) where.created_at.gte = new Date(filters.from);
            // `to` is a date-only input — include the whole day.
            if (filters.to) where.created_at.lte = new Date(new Date(filters.to).setHours(23, 59, 59, 999));
        }

        const search = (filters?.search || '').trim();
        if (search) {
            where.OR = [
                { indent_number: { contains: search, mode: 'insensitive' } },
                { patient_id: { contains: search, mode: 'insensitive' } },
                { requested_by_name: { contains: search, mode: 'insensitive' } },
            ];
        }

        const orders = await db.pharmacy_orders.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 500,
            include: {
                items: {
                    select: {
                        medicine_name: true,
                        quantity_requested: true,
                        quantity_dispensed: true,
                        status: true,
                        total_price: true,
                    },
                },
            },
        });

        // Patient names live on OPD_REG and there is no relation from the order,
        // so resolve them in one query rather than per row.
        const patientIds = Array.from(new Set(orders.map((o: any) => o.patient_id).filter(Boolean)));
        const patients = patientIds.length
            ? await db.oPD_REG.findMany({
                where: { patient_id: { in: patientIds as string[] }, organizationId },
                select: { patient_id: true, full_name: true },
            })
            : [];
        const nameById = new Map(patients.map((p: any) => [p.patient_id, p.full_name]));

        const rows = orders.map((o: any) => {
            const requested = o.items.reduce((s: number, i: any) => s + Number(i.quantity_requested || 0), 0);
            const dispensed = o.items.reduce((s: number, i: any) => s + Number(i.quantity_dispensed || 0), 0);
            const value = o.items.reduce((s: number, i: any) => s + Number(i.total_price || 0), 0);
            // Ageing is what makes a pending indent actionable — a 3-day-old
            // unactioned requisition is a ward waiting on medicine.
            const ageHours = Math.max(0, Math.round((Date.now() - new Date(o.created_at).getTime()) / 36e5));

            return {
                id: o.id,
                indent_number: o.indent_number || `IND-${o.id}`,
                created_at: o.created_at,
                patient_id: o.patient_id,
                patient_name: nameById.get(o.patient_id) || null,
                admission_id: o.admission_id,
                is_ipd: Boolean(o.is_ipd_linked),
                requested_by: o.requested_by_name || '—',
                status: o.status,
                verified_by: o.verified_by,
                verified_at: o.verified_at,
                line_count: o.items.length,
                qty_requested: requested,
                qty_dispensed: dispensed,
                qty_short: Math.max(0, requested - dispensed),
                value,
                age_hours: ageHours,
                items: o.items,
            };
        });

        const summary = {
            total: rows.length,
            pending: rows.filter((r: any) => String(r.status).toLowerCase() === 'pending').length,
            completed: rows.filter((r: any) => ['completed', 'dispensed', 'paid'].includes(String(r.status).toLowerCase())).length,
            short_supplied: rows.filter((r: any) => r.qty_short > 0).length,
            total_value: rows.reduce((s: number, r: any) => s + r.value, 0),
        };

        return { success: true, data: serialize({ rows, summary }) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
