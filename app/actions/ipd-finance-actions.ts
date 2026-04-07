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

function generateEstimateNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `EST-${dateStr}-${seq}`;
}

// ============================================
// GST HELPERS
// ============================================

export async function getGstSummary(invoiceId: number) {
    try {
        const { db } = await requireTenantContext();
        const items = await db.invoice_items.findMany({
            where: { invoice_id: invoiceId },
        });

        const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
        const isInterState = invoice?.is_inter_state || false;

        // Group by tax rate
        const taxGroups: Record<string, { taxableAmount: number; taxRate: number; taxAmount: number; hsnSac: string }> = {};

        for (const item of items) {
            const rate = Number(item.tax_rate || 0);
            const key = `${rate}`;
            if (!taxGroups[key]) {
                taxGroups[key] = { taxableAmount: 0, taxRate: rate, taxAmount: 0, hsnSac: item.hsn_sac_code || '' };
            }
            taxGroups[key].taxableAmount += Number(item.net_price || 0);
            taxGroups[key].taxAmount += Number(item.tax_amount || 0);
        }

        const rows = Object.values(taxGroups).map(g => ({
            hsn_sac: g.hsnSac,
            taxable_amount: g.taxableAmount,
            tax_rate: g.taxRate,
            cgst: isInterState ? 0 : g.taxAmount / 2,
            sgst: isInterState ? 0 : g.taxAmount / 2,
            igst: isInterState ? g.taxAmount : 0,
            total_tax: g.taxAmount,
        }));

        return {
            success: true,
            data: serialize({
                rows,
                total_taxable: rows.reduce((s, r) => s + r.taxable_amount, 0),
                total_cgst: rows.reduce((s, r) => s + r.cgst, 0),
                total_sgst: rows.reduce((s, r) => s + r.sgst, 0),
                total_igst: rows.reduce((s, r) => s + r.igst, 0),
                total_tax: rows.reduce((s, r) => s + r.total_tax, 0),
                is_inter_state: isInterState,
            }),
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// PRE-ADMISSION ESTIMATES
// ============================================

export async function createIpdEstimate(data: {
    patient_id: string;
    diagnosis?: string;
    expected_los_days: number;
    room_category?: string;
    package_id?: number;
    items: Array<{ description: string; qty: number; rate: number; amount: number }>;
    notes?: string;
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const totalEstimate = data.items.reduce((sum, item) => sum + item.amount, 0);
        const depositRequired = Math.ceil(totalEstimate * 0.5); // 50% deposit

        const estimate = await db.ipdEstimate.create({
            data: {
                estimate_number: generateEstimateNumber(),
                patient_id: data.patient_id,
                diagnosis: data.diagnosis || null,
                expected_los_days: data.expected_los_days,
                room_category: data.room_category || null,
                package_id: data.package_id || null,
                items: data.items,
                total_estimate: totalEstimate,
                deposit_required: depositRequired,
                status: 'Draft',
                valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                notes: data.notes || null,
                created_by: session.id,
                organizationId,
            },
        });

        await logAudit({
            action: 'CREATE_IPD_ESTIMATE',
            module: 'ipd',
            entity_type: 'ipd_estimate',
            entity_id: estimate.estimate_number,
            details: JSON.stringify({ patient_id: data.patient_id, total: totalEstimate }),
        });

        return { success: true, data: serialize(estimate) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getEstimate(estimateId: number) {
    try {
        const { db } = await requireTenantContext();
        const estimate = await db.ipdEstimate.findUnique({ where: { id: estimateId } });
        if (!estimate) return { success: false, error: 'Estimate not found' };
        return { success: true, data: serialize(estimate) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPatientEstimates(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const estimates = await db.ipdEstimate.findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data: serialize(estimates) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function shareEstimate(estimateId: number) {
    try {
        const { db } = await requireTenantContext();
        const estimate = await db.ipdEstimate.update({
            where: { id: estimateId },
            data: { status: 'Shared' },
        });
        return { success: true, data: serialize(estimate) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// CHARGE POSTING TO IPD BILL
// ============================================

export async function postChargeToIpdBill(data: {
    admission_id: string;
    source_module: string;
    source_ref_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount?: number;
    tax_rate?: number;
    hsn_sac_code?: string;
    service_category?: string;
    posted_by?: string;
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // Find the active IPD invoice
        let invoice = await db.invoices.findFirst({
            where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
        });

        if (!invoice) {
            // Create one if missing
            const admission = await db.admissions.findUnique({
                where: { admission_id: data.admission_id },
            });
            if (!admission) return { success: false, error: 'Admission not found' };

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
            invoice = await db.invoices.create({
                data: {
                    invoice_number: `INV-${dateStr}-${seq}`,
                    patient_id: admission.patient_id,
                    admission_id: data.admission_id,
                    invoice_type: 'IPD',
                    status: 'Draft',
                    organizationId,
                },
            });
        }

        const discount = data.discount || 0;
        const total_price = data.quantity * data.unit_price;
        const net_price = total_price - discount;
        const taxRate = data.tax_rate || 0;
        const tax_amount = net_price * taxRate / 100;

        // Create invoice item with GST
        const item = await db.invoice_items.create({
            data: {
                invoice_id: invoice.id,
                department: data.service_category || data.source_module,
                description: data.description,
                quantity: data.quantity,
                unit_price: data.unit_price,
                total_price,
                discount,
                net_price,
                tax_rate: taxRate,
                tax_amount,
                hsn_sac_code: data.hsn_sac_code || null,
                service_category: data.service_category || null,
                ref_id: data.source_ref_id || null,
                organizationId,
            },
        });

        // Recalculate invoice totals with GST
        await recalculateInvoiceWithGst(invoice.id);

        // Create charge posting audit
        await db.ipdChargePosting.create({
            data: {
                admission_id: data.admission_id,
                invoice_item_id: item.id,
                source_module: data.source_module,
                source_ref_id: data.source_ref_id || null,
                description: data.description,
                amount: net_price + tax_amount,
                posted_by: data.posted_by || session.id,
                organizationId,
            },
        });

        return { success: true, data: serialize({ item_id: item.id, invoice_id: invoice.id }) };
    } catch (error: any) {
        console.error('postChargeToIpdBill error:', error);
        return { success: false, error: error.message };
    }
}

// Recalculate invoice totals including GST
async function recalculateInvoiceWithGst(invoiceId: number) {
    const { db } = await requireTenantContext();

    const items = await db.invoice_items.findMany({
        where: { invoice_id: invoiceId },
    });

    const total_amount = items.reduce((sum: number, item: any) => sum + Number(item.total_price), 0);
    const total_discount = items.reduce((sum: number, item: any) => sum + Number(item.discount), 0);
    const net_items = items.reduce((sum: number, item: any) => sum + Number(item.net_price), 0);
    const total_tax = items.reduce((sum: number, item: any) => sum + Number(item.tax_amount || 0), 0);

    const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
    const isInterState = invoice?.is_inter_state || false;
    const paid_amount = Number(invoice?.paid_amount || 0);
    const net_amount = net_items + total_tax;
    const balance_due = net_amount - paid_amount;

    await db.invoices.update({
        where: { id: invoiceId },
        data: {
            total_amount,
            total_discount,
            net_amount,
            total_tax,
            cgst_amount: isInterState ? 0 : total_tax / 2,
            sgst_amount: isInterState ? 0 : total_tax / 2,
            igst_amount: isInterState ? total_tax : 0,
            balance_due: balance_due > 0 ? balance_due : 0,
            status: balance_due <= 0 && net_amount > 0 ? 'Paid' : invoice?.status,
        },
    });
}

// ============================================
// PACKAGE BILLING
// ============================================

export async function applyPackageToAdmission(admissionId: string, packageId: number) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const pkg = await db.ipdPackage.findUnique({ where: { id: packageId } });
        if (!pkg) return { success: false, error: 'Package not found' };

        // Check if package already applied
        const existing = await db.ipdAdmissionPackage.findFirst({
            where: { admission_id: admissionId, is_broken_open: false },
        });
        if (existing) return { success: false, error: 'A package is already applied to this admission' };

        // Create admission package record
        const admPkg = await db.ipdAdmissionPackage.create({
            data: {
                admission_id: admissionId,
                package_id: packageId,
                applied_amount: pkg.total_amount,
                applied_by: session.id,
                organizationId,
            },
        });

        // Post as a single line item to the IPD bill
        await postChargeToIpdBill({
            admission_id: admissionId,
            source_module: 'package',
            source_ref_id: String(admPkg.id),
            description: `Package: ${pkg.package_name}`,
            quantity: 1,
            unit_price: Number(pkg.total_amount),
            service_category: 'Package',
        });

        await logAudit({
            action: 'APPLY_IPD_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_admission_package',
            entity_id: String(admPkg.id),
            details: JSON.stringify({ package_name: pkg.package_name, amount: Number(pkg.total_amount) }),
        });

        return { success: true, data: serialize(admPkg) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function breakOpenPackage(admissionPackageId: number) {
    try {
        const { db } = await requireTenantContext();

        const admPkg = await db.ipdAdmissionPackage.update({
            where: { id: admissionPackageId },
            data: { is_broken_open: true, broken_at: new Date() },
        });

        await logAudit({
            action: 'BREAK_OPEN_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_admission_package',
            entity_id: String(admissionPackageId),
        });

        return { success: true, data: serialize(admPkg) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPackageUtilization(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const admPkg = await db.ipdAdmissionPackage.findFirst({
            where: { admission_id: admissionId },
            include: { package: true },
        });

        if (!admPkg) return { success: true, data: null };

        // Get all charge postings for this admission
        const postings = await db.ipdChargePosting.findMany({
            where: { admission_id: admissionId, source_module: { not: 'package' } },
        });

        const consumedAmount = postings.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

        return {
            success: true,
            data: serialize({
                package_name: admPkg.package?.package_name,
                package_amount: Number(admPkg.applied_amount),
                consumed: consumedAmount,
                remaining: Number(admPkg.applied_amount) - consumedAmount,
                is_broken_open: admPkg.is_broken_open,
            }),
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// INTERIM BILL
// ============================================

export async function generateInterimBill(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: {
                patient: true,
                ward: true,
                bed: { include: { wards: true } },
            },
        });
        if (!admission) return { success: false, error: 'Admission not found' };

        // Find the IPD invoice
        const invoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
            include: {
                items: { orderBy: { created_at: 'asc' } },
                payments: { orderBy: { created_at: 'desc' } },
            },
        });
        if (!invoice) return { success: false, error: 'No active invoice found' };

        // Get GST summary
        const gstResult = await getGstSummary(invoice.id);
        const gstSummary = gstResult.success ? gstResult.data : null;

        // Get deposits
        const deposits = await db.patientDeposit.findMany({
            where: { patient_id: admission.patient_id, status: 'Active' },
        });

        const ward = admission.ward || admission.bed?.wards;
        const daysAdmitted = Math.max(1, Math.ceil(
            (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
        ));

        return {
            success: true,
            data: serialize({
                type: 'INTERIM',
                admission: {
                    admission_id: admission.admission_id,
                    patient_name: admission.patient?.full_name,
                    patient_id: admission.patient_id,
                    doctor_name: admission.doctor_name,
                    ward_name: ward?.ward_name || 'N/A',
                    bed_id: admission.bed_id,
                    admission_date: admission.admission_date,
                    days_admitted: daysAdmitted,
                    diagnosis: admission.diagnosis,
                },
                invoice: {
                    id: invoice.id,
                    invoice_number: invoice.invoice_number,
                    total_amount: Number(invoice.total_amount),
                    total_discount: Number(invoice.total_discount),
                    total_tax: Number(invoice.total_tax),
                    net_amount: Number(invoice.net_amount),
                    paid_amount: Number(invoice.paid_amount),
                    balance_due: Number(invoice.balance_due),
                },
                items: invoice.items.map((item: any) => ({
                    id: item.id,
                    department: item.department,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: Number(item.unit_price),
                    discount: Number(item.discount),
                    net_price: Number(item.net_price),
                    tax_rate: Number(item.tax_rate || 0),
                    tax_amount: Number(item.tax_amount || 0),
                    hsn_sac_code: item.hsn_sac_code,
                    service_category: item.service_category,
                    created_at: item.created_at,
                })),
                payments: invoice.payments.map((p: any) => ({
                    receipt_number: p.receipt_number,
                    amount: Number(p.amount),
                    payment_method: p.payment_method,
                    payment_type: p.payment_type,
                    status: p.status,
                    created_at: p.created_at,
                })),
                deposits: deposits.map((d: any) => ({
                    deposit_number: d.deposit_number,
                    amount: Number(d.amount),
                    applied_amount: Number(d.applied_amount),
                    available: Number(d.amount) - Number(d.applied_amount) - Number(d.refunded_amount),
                    status: d.status,
                })),
                gst_summary: gstSummary,
            }),
        };
    } catch (error: any) {
        console.error('generateInterimBill error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// IPD FINANCE REPORTS
// ============================================

export async function getIpdRevenueByCategory(fromDate?: Date, toDate?: Date) {
    try {
        const { db } = await requireTenantContext();

        const dateFilter: any = {};
        if (fromDate) dateFilter.gte = fromDate;
        if (toDate) dateFilter.lte = toDate;

        const postings = await db.ipdChargePosting.findMany({
            where: dateFilter.gte || dateFilter.lte ? { posted_at: dateFilter } : {},
            orderBy: { posted_at: 'desc' },
        });

        // Group by source_module
        const grouped: Record<string, { count: number; total: number }> = {};
        for (const p of postings) {
            const key = p.source_module;
            if (!grouped[key]) grouped[key] = { count: 0, total: 0 };
            grouped[key].count++;
            grouped[key].total += Number(p.amount);
        }

        const categories = Object.entries(grouped).map(([category, data]) => ({
            category,
            count: data.count,
            total: data.total,
        }));

        return { success: true, data: serialize(categories) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getIpdOutstanding() {
    try {
        const { db } = await requireTenantContext();

        const invoices = await db.invoices.findMany({
            where: {
                invoice_type: 'IPD',
                status: { in: ['Draft', 'Final', 'Partial'] },
                balance_due: { gt: 0 },
            },
            include: {
                patient: { select: { full_name: true, phone: true } },
                admission: { select: { admission_id: true, doctor_name: true, admission_date: true, status: true } },
            },
            orderBy: { created_at: 'asc' },
        });

        const now = new Date();
        const enriched = invoices.map((inv: any) => {
            const ageDays = Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / (1000 * 60 * 60 * 24));
            return {
                invoice_id: inv.id,
                invoice_number: inv.invoice_number,
                patient_name: inv.patient?.full_name || 'Unknown',
                patient_phone: inv.patient?.phone || '-',
                admission_id: inv.admission?.admission_id,
                doctor_name: inv.admission?.doctor_name || '-',
                admission_status: inv.admission?.status || '-',
                net_amount: Number(inv.net_amount),
                paid_amount: Number(inv.paid_amount),
                balance_due: Number(inv.balance_due),
                age_days: ageDays,
                aging_bucket: ageDays <= 30 ? '0-30' : ageDays <= 60 ? '31-60' : '60+',
                status: inv.status,
            };
        });

        return { success: true, data: serialize(enriched) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getChargePostingLog(admissionId?: string, date?: Date) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        if (admissionId) where.admission_id = admissionId;
        if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            where.posted_at = { gte: start, lte: end };
        }

        const postings = await db.ipdChargePosting.findMany({
            where,
            orderBy: { posted_at: 'desc' },
            take: 200,
        });

        return { success: true, data: serialize(postings) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
