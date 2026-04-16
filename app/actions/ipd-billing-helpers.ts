'use server';

import { requireTenantContext } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

function formatIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function extractDayKey(description: string | null | undefined): string {
    if (!description) return '';
    const m = description.match(/\[(\d{4}-\d{2}-\d{2})\]/);
    return m ? m[1] : description;
}

/**
 * Doctor autocomplete for the admission page. Returns active doctors matching
 * `query` by name / username / specialty. Empty query returns the first `limit` doctors.
 */
export async function searchDoctorsForIPD(query: string, limit: number = 10) {
    try {
        const { db } = await requireTenantContext();
        const q = (query || '').trim();
        const where: any = { role: 'doctor', is_active: true };
        if (q) {
            where.OR = [
                { name: { contains: q } },
                { username: { contains: q } },
                { specialty: { contains: q } },
            ];
        }
        const doctors = await db.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                username: true,
                specialty: true,
                consultation_fee: true,
            },
            orderBy: { name: 'asc' },
            take: limit,
        });
        return {
            success: true as const,
            data: doctors.map((d: any) => ({
                id: d.id,
                name: d.name || d.username || 'Unknown',
                username: d.username,
                specialty: d.specialty || null,
                consultation_fee: d.consultation_fee != null ? Number(d.consultation_fee) : null,
            })),
        };
    } catch (error: any) {
        return { success: false as const, error: error.message };
    }
}

/**
 * Service master picker for the IPD manual-charge form. Reads from charge_catalog.
 */
export async function getIPDServiceCatalog(
    query?: string,
    category?: string,
    limit: number = 30,
) {
    try {
        const { db } = await requireTenantContext();
        const q = (query || '').trim();
        const where: any = { is_active: true };
        if (category) where.category = category;
        if (q) {
            where.OR = [
                { item_name: { contains: q } },
                { item_code: { contains: q } },
            ];
        }
        const items = await db.charge_catalog.findMany({
            where,
            orderBy: { item_name: 'asc' },
            take: limit,
        });
        return { success: true as const, data: serialize(items) };
    } catch (error: any) {
        return { success: false as const, error: error.message };
    }
}

/**
 * Idempotent per-day accrual of Room + Nursing charges for an active IPD admission.
 * For each calendar day from admission_date to today (inclusive) the invoice is
 * guaranteed to have one Room row and one Nursing row tagged with the ISO day.
 * Safe to call on every page load — reruns are no-ops once today's rows exist.
 */
export async function ensureIPDRoomChargesAccrued(admissionId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { ward: true, bed: { include: { wards: true } } },
        });
        if (!admission) return { success: false as const, error: 'Admission not found' };
        if (admission.status !== 'Admitted') {
            return { success: true as const, data: { skipped: true, reason: 'Not admitted', added: 0 } };
        }

        const ward = admission.ward || admission.bed?.wards;
        if (!ward) {
            return { success: false as const, error: 'Ward info not found — assign a bed first' };
        }

        const bedTier = admission.bed?.pricing_tier || 'Base';
        const multiplier = bedTier === 'Premium' ? 1.5 : bedTier === 'Critical' ? 2.0 : 1.0;
        const roomRate = Number(ward.cost_per_day || 0) * multiplier;
        const nursingRate = Number(ward.nursing_charge || 0) * multiplier;

        if (roomRate <= 0 && nursingRate <= 0) {
            return {
                success: false as const,
                error: `Ward "${ward.ward_name}" has no cost_per_day or nursing_charge configured`,
            };
        }

        // Locate or create the active IPD invoice
        let invoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        });
        if (!invoice) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
            invoice = await db.invoices.create({
                data: {
                    invoice_number: `INV-${dateStr}-${seq}`,
                    patient_id: admission.patient_id,
                    admission_id: admissionId,
                    invoice_type: 'IPD',
                    status: 'Draft',
                    organizationId,
                },
            });
        }

        // Determine day span: admission day → today (inclusive)
        const admitDate = new Date(admission.admission_date);
        admitDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const totalDays = Math.max(
            1,
            Math.floor((today.getTime() - admitDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        );

        // Fetch existing Room + Nursing items to de-dupe by ISO day
        const existing = await db.invoice_items.findMany({
            where: {
                invoice_id: invoice.id,
                service_category: { in: ['Room', 'Nursing'] },
            },
            select: { service_category: true, description: true },
        });

        const existingRoomKeys = new Set(
            existing
                .filter((e: any) => e.service_category === 'Room')
                .map((e: any) => extractDayKey(e.description)),
        );
        const existingNursingKeys = new Set(
            existing
                .filter((e: any) => e.service_category === 'Nursing')
                .map((e: any) => extractDayKey(e.description)),
        );

        const roomTaxRate = roomRate > 5000 ? 5 : 0;
        const rowsToInsert: any[] = [];

        for (let i = 0; i < totalDays; i++) {
            const day = new Date(admitDate);
            day.setDate(admitDate.getDate() + i);
            const key = formatIsoDate(day);

            if (roomRate > 0 && !existingRoomKeys.has(key)) {
                const taxAmount = (roomRate * roomTaxRate) / 100;
                rowsToInsert.push({
                    invoice_id: invoice.id,
                    department: 'Room',
                    description: `${ward.ward_name} - Room Charge [${key}]`,
                    quantity: 1,
                    unit_price: roomRate,
                    total_price: roomRate,
                    discount: 0,
                    net_price: roomRate,
                    tax_rate: roomTaxRate,
                    tax_amount: taxAmount,
                    hsn_sac_code: roomRate > 5000 ? '9963' : '9993',
                    service_category: 'Room',
                    organizationId,
                });
            }

            if (nursingRate > 0 && !existingNursingKeys.has(key)) {
                rowsToInsert.push({
                    invoice_id: invoice.id,
                    department: 'Nursing',
                    description: `Nursing Charge [${key}]`,
                    quantity: 1,
                    unit_price: nursingRate,
                    total_price: nursingRate,
                    discount: 0,
                    net_price: nursingRate,
                    tax_rate: 0,
                    tax_amount: 0,
                    hsn_sac_code: '9993',
                    service_category: 'Nursing',
                    organizationId,
                });
            }
        }

        if (rowsToInsert.length === 0) {
            return {
                success: true as const,
                data: { invoice_id: invoice.id, added: 0, totalDays, roomRate, nursingRate },
            };
        }

        await db.$transaction(rowsToInsert.map((d) => db.invoice_items.create({ data: d })));

        // Recalculate invoice totals
        const items = await db.invoice_items.findMany({ where: { invoice_id: invoice.id } });
        const totalDiscount = items.reduce((s: number, it: any) => s + Number(it.discount || 0), 0);
        const totalTax = items.reduce((s: number, it: any) => s + Number(it.tax_amount || 0), 0);
        const totalPrice = items.reduce((s: number, it: any) => s + Number(it.total_price || 0), 0);
        const totalNet = items.reduce((s: number, it: any) => s + Number(it.net_price || 0), 0);
        const netAmount = totalNet + totalTax;
        const paid = Number(invoice.paid_amount || 0);

        await db.invoices.update({
            where: { id: invoice.id },
            data: {
                total_amount: totalPrice,
                total_discount: totalDiscount,
                total_tax: totalTax,
                net_amount: netAmount,
                cgst_amount: totalTax / 2,
                sgst_amount: totalTax / 2,
                balance_due: netAmount - paid,
            },
        });

        await logAudit({
            action: 'IPD_ROOM_CHARGES_ACCRUED',
            module: 'IPD',
            entity_type: 'admission',
            entity_id: admissionId,
            details: JSON.stringify({
                added: rowsToInsert.length,
                totalDays,
                roomRate,
                nursingRate,
                invoiceId: invoice.id,
            }),
        });

        return {
            success: true as const,
            data: {
                invoice_id: invoice.id,
                added: rowsToInsert.length,
                totalDays,
                roomRate,
                nursingRate,
            },
        };
    } catch (error: any) {
        console.error('ensureIPDRoomChargesAccrued error:', error);
        return { success: false as const, error: error.message };
    }
}

/**
 * Seed default IPD master data (wards, beds, charge_catalog) for a tenant when empty.
 * Idempotent per-category: skips any table that already has rows.
 */
export async function ensureIPDDemoMasterData() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const result: { wards: number; beds: number; services: number } = {
            wards: 0,
            beds: 0,
            services: 0,
        };

        // Seed wards if empty
        const wardCount = await db.wards.count({ where: { organizationId } });
        if (wardCount === 0) {
            const defaults = [
                { ward_name: 'General Ward', ward_type: 'General', cost_per_day: 500, nursing_charge: 150 },
                { ward_name: 'Semi-Private', ward_type: 'Semi', cost_per_day: 1500, nursing_charge: 300 },
                { ward_name: 'Private Room', ward_type: 'Private', cost_per_day: 3000, nursing_charge: 500 },
                { ward_name: 'Deluxe Suite', ward_type: 'Suite', cost_per_day: 6000, nursing_charge: 1000 },
                { ward_name: 'ICU', ward_type: 'ICU', cost_per_day: 5000, nursing_charge: 1500 },
                { ward_name: 'NICU', ward_type: 'NICU', cost_per_day: 6000, nursing_charge: 1800 },
                { ward_name: 'Maternity', ward_type: 'Maternity', cost_per_day: 1500, nursing_charge: 400 },
                { ward_name: 'Isolation', ward_type: 'Isolation', cost_per_day: 4000, nursing_charge: 1200 },
            ];
            await db.$transaction(
                defaults.map((w) =>
                    db.wards.create({ data: { ...w, is_active: true, organizationId } }),
                ),
            );
            result.wards = defaults.length;
        }

        // Seed beds if empty
        const bedCount = await db.beds.count({ where: { organizationId } });
        if (bedCount === 0) {
            const allWards = await db.wards.findMany({
                where: { organizationId, is_active: true },
            });
            const bedRows: any[] = [];
            for (const w of allWards) {
                const perWard = w.ward_type === 'ICU' || w.ward_type === 'NICU' ? 6 : 10;
                const prefix = (w.ward_name || 'BED')
                    .replace(/\s+/g, '')
                    .toUpperCase()
                    .slice(0, 6);
                const tier =
                    w.ward_type === 'ICU' || w.ward_type === 'NICU'
                        ? 'Critical'
                        : w.ward_type === 'Suite' || w.ward_type === 'Private'
                            ? 'Premium'
                            : 'Base';
                for (let i = 1; i <= perWard; i++) {
                    bedRows.push({
                        bed_id: `BED-${prefix}-${String(i).padStart(2, '0')}`,
                        ward_id: w.ward_id,
                        status: 'Available',
                        bed_category: w.ward_type,
                        pricing_tier: tier,
                        organizationId,
                    });
                }
            }
            if (bedRows.length > 0) {
                await db.$transaction(bedRows.map((d) => db.beds.create({ data: d })));
                result.beds = bedRows.length;
            }
        }

        // Seed charge_catalog defaults if empty
        const svcCount = await db.charge_catalog.count({ where: { organizationId } });
        if (svcCount === 0) {
            const defaults = [
                { category: 'Consultation', item_code: 'CONS-GEN', item_name: 'General Consultation', default_price: 500, department: 'OPD', service_category: 'Consultation', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Consultation', item_code: 'CONS-SPEC', item_name: 'Specialist Consultation', default_price: 1000, department: 'OPD', service_category: 'Consultation', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'DoctorVisit', item_code: 'VISIT-ROUND', item_name: 'Doctor Round Visit', default_price: 300, department: 'IPD', service_category: 'DoctorVisit', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'DoctorVisit', item_code: 'VISIT-EMERG', item_name: 'Emergency Doctor Visit', default_price: 800, department: 'IPD', service_category: 'DoctorVisit', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Procedure', item_code: 'PROC-MINOR', item_name: 'Minor Procedure', default_price: 2000, department: 'IPD', service_category: 'Procedure', hsn_sac_code: '9993', tax_rate: 5 },
                { category: 'Procedure', item_code: 'PROC-MAJOR', item_name: 'Major Procedure', default_price: 10000, department: 'IPD', service_category: 'Procedure', hsn_sac_code: '9993', tax_rate: 5 },
                { category: 'Procedure', item_code: 'PROC-DRESS', item_name: 'Dressing Change', default_price: 200, department: 'IPD', service_category: 'Procedure', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Procedure', item_code: 'PROC-IV', item_name: 'IV Line Insertion', default_price: 250, department: 'IPD', service_category: 'Procedure', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Procedure', item_code: 'PROC-CATH', item_name: 'Urinary Catheterization', default_price: 800, department: 'IPD', service_category: 'Procedure', hsn_sac_code: '9993', tax_rate: 5 },
                { category: 'Procedure', item_code: 'PROC-OXY', item_name: 'Oxygen Therapy (per hour)', default_price: 150, department: 'IPD', service_category: 'Procedure', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Nursing', item_code: 'NURS-INJ', item_name: 'Injection Administration', default_price: 100, department: 'IPD', service_category: 'Nursing', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Nursing', item_code: 'NURS-NEB', item_name: 'Nebulization', default_price: 200, department: 'IPD', service_category: 'Nursing', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Lab', item_code: 'LAB-CBC', item_name: 'Complete Blood Count', default_price: 400, department: 'LAB', service_category: 'Lab', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Lab', item_code: 'LAB-LFT', item_name: 'Liver Function Test', default_price: 800, department: 'LAB', service_category: 'Lab', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Lab', item_code: 'LAB-RFT', item_name: 'Renal Function Test', default_price: 800, department: 'LAB', service_category: 'Lab', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Lab', item_code: 'LAB-HBA1C', item_name: 'HbA1c', default_price: 600, department: 'LAB', service_category: 'Lab', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Radiology', item_code: 'RAD-XRAY', item_name: 'X-Ray (Single View)', default_price: 500, department: 'RAD', service_category: 'Radiology', hsn_sac_code: '9993', tax_rate: 5 },
                { category: 'Radiology', item_code: 'RAD-USG', item_name: 'Ultrasound', default_price: 1500, department: 'RAD', service_category: 'Radiology', hsn_sac_code: '9993', tax_rate: 5 },
                { category: 'Radiology', item_code: 'RAD-CT', item_name: 'CT Scan', default_price: 6000, department: 'RAD', service_category: 'Radiology', hsn_sac_code: '9993', tax_rate: 5 },
                { category: 'Radiology', item_code: 'RAD-MRI', item_name: 'MRI Scan', default_price: 12000, department: 'RAD', service_category: 'Radiology', hsn_sac_code: '9993', tax_rate: 5 },
                { category: 'Pharmacy', item_code: 'PHARM-MED', item_name: 'Medicine Pack', default_price: 300, department: 'PHARMACY', service_category: 'Pharmacy', hsn_sac_code: '3004', tax_rate: 12 },
                { category: 'Miscellaneous', item_code: 'MISC-REG', item_name: 'Registration Fee', default_price: 100, department: 'OPD', service_category: 'Miscellaneous', hsn_sac_code: '9993', tax_rate: 0 },
                { category: 'Miscellaneous', item_code: 'MISC-AMB', item_name: 'Ambulance Service', default_price: 1500, department: 'IPD', service_category: 'Miscellaneous', hsn_sac_code: '9993', tax_rate: 0 },
            ];
            await db.$transaction(
                defaults.map((s) =>
                    db.charge_catalog.create({ data: { ...s, is_active: true, organizationId } }),
                ),
            );
            result.services = defaults.length;
        }

        return { success: true as const, data: result };
    } catch (error: any) {
        console.error('ensureIPDDemoMasterData error:', error);
        return { success: false as const, error: error.message };
    }
}
