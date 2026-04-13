'use server';

import { requireTenantContext } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';
import { createJournalEntry } from './gl-actions';


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
    service_id?: string;
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

        // Look up master service if service_id provided
        let masterService: any = null;
        if (data.service_id) {
            masterService = await db.ipdServiceMaster.findFirst({
                where: { id: parseInt(data.service_id) },
            });
        }

        // Use master values when available, else fall back to client-provided values
        const description = masterService ? masterService.service_name : data.description;
        const unitPrice = masterService ? Number(masterService.default_rate) : data.unit_price;
        const taxRate = masterService ? Number(masterService.tax_rate || 0) : (data.tax_rate || 0);
        const serviceCategory = masterService ? masterService.service_category : (data.service_category || null);
        const hsnSacCode = masterService ? (masterService.hsn_sac_code || null) : (data.hsn_sac_code || null);
        const refId = data.service_id || data.source_ref_id || null;

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
        const total_price = data.quantity * unitPrice;
        const net_price = total_price - discount;
        const tax_amount = net_price * taxRate / 100;

        // Create invoice item with GST
        const item = await db.invoice_items.create({
            data: {
                invoice_id: invoice.id,
                department: serviceCategory || data.source_module,
                description,
                quantity: data.quantity,
                unit_price: unitPrice,
                total_price,
                discount,
                net_price,
                tax_rate: taxRate,
                tax_amount,
                hsn_sac_code: hsnSacCode,
                service_category: serviceCategory,
                ref_id: refId,
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
                source_ref_id: refId,
                description,
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

// ============================================
// DISCHARGE SETTLEMENT
// ============================================

export async function settleAndDischarge(data: {
    admission_id: string;
    apply_deposits: boolean;
    discount_amount?: number;
    discount_reason?: string;
    approved_by?: string;
    splits?: Array<{
        amount: number;
        payment_method: string;
        reference?: string;
    }>;
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: data.admission_id },
            include: { patient: true, ward: true, bed: { include: { wards: true } } },
        });
        if (!admission) return { success: false, error: 'Admission not found' };
        if (admission.status === 'Discharged') return { success: false, error: 'Patient already discharged' };

        // 1. Accrue remaining daily charges (room + nursing)
        const ward = admission.ward || admission.bed?.wards;
        const daysAdmitted = Math.max(1, Math.ceil(
            (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
        ));

        // Check if room charges already posted - count existing room charge postings
        const existingRoomPostings = await db.ipdChargePosting.count({
            where: { admission_id: data.admission_id, source_module: 'room' },
        });

        if (existingRoomPostings < daysAdmitted && ward) {
            const roomDaysToPost = daysAdmitted - existingRoomPostings;
            const roomRate = Number(ward.cost_per_day || 0);
            const nursingRate = Number(ward.nursing_charge || 0);

            if (roomRate > 0 && roomDaysToPost > 0) {
                await postChargeToIpdBill({
                    admission_id: data.admission_id,
                    source_module: 'room',
                    description: `Room Charges (${roomDaysToPost}d x ₹${roomRate})`,
                    quantity: roomDaysToPost,
                    unit_price: roomRate,
                    service_category: 'Room',
                    hsn_sac_code: '996311',
                });
            }
            if (nursingRate > 0 && roomDaysToPost > 0) {
                await postChargeToIpdBill({
                    admission_id: data.admission_id,
                    source_module: 'nursing',
                    description: `Nursing Charges (${roomDaysToPost}d x ₹${nursingRate})`,
                    quantity: roomDaysToPost,
                    unit_price: nursingRate,
                    service_category: 'Nursing',
                    hsn_sac_code: '999312',
                });
            }
        }

        // Find the invoice
        let invoice = await db.invoices.findFirst({
            where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
        });
        if (!invoice) return { success: false, error: 'No active invoice found' };

        // 2. Apply discount if specified
        if (data.discount_amount && data.discount_amount > 0) {
            // Add negative line item for discount
            await db.invoice_items.create({
                data: {
                    invoice_id: invoice.id,
                    department: 'Discount',
                    description: data.discount_reason || 'Discharge Discount',
                    quantity: 1,
                    unit_price: 0,
                    total_price: 0,
                    discount: data.discount_amount,
                    net_price: -data.discount_amount,
                    organizationId,
                },
            });

            // Update invoice with approved_by if discount given
            if (data.approved_by) {
                await db.invoices.update({
                    where: { id: invoice.id },
                    data: { approved_by: data.approved_by, approved_at: new Date() },
                });
            }

            await recalculateInvoiceWithGst(invoice.id);
            // Re-fetch after recalculation
            invoice = await db.invoices.findUnique({ where: { id: invoice.id } });
            if (!invoice) return { success: false, error: 'Invoice lost after recalculation' };
        }

        // 3. Apply deposits if requested
        if (data.apply_deposits) {
            const deposits = await db.patientDeposit.findMany({
                where: { patient_id: admission.patient_id, status: 'Active' },
            });

            for (const deposit of deposits) {
                const available = Number(deposit.amount) - Number(deposit.applied_amount) - Number(deposit.refunded_amount);
                if (available <= 0) continue;

                const currentInvoice = await db.invoices.findUnique({ where: { id: invoice.id } });
                const currentBalance = Number(currentInvoice?.balance_due || 0);
                if (currentBalance <= 0) break;

                const applyAmount = Math.min(available, currentBalance);

                // Create deposit payment
                await db.payments.create({
                    data: {
                        receipt_number: `RCP-DEP-${Date.now()}-${deposit.id}`,
                        invoice_id: invoice.id,
                        amount: applyAmount,
                        payment_method: 'Deposit',
                        payment_type: 'Settlement',
                        status: 'Completed',
                        notes: `Applied from deposit ${deposit.deposit_number}`,
                        organizationId,
                    },
                });

                const newApplied = Number(deposit.applied_amount) + applyAmount;
                await db.patientDeposit.update({
                    where: { id: deposit.id },
                    data: {
                        applied_to_invoice: invoice.id,
                        applied_amount: newApplied,
                        status: newApplied >= Number(deposit.amount) ? 'Applied' : 'Active',
                    },
                });
            }

            // Recalculate after deposits
            const allPayments = await db.payments.findMany({
                where: { invoice_id: invoice.id, status: 'Completed' },
            });
            const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
            const netAmount = Number(invoice.net_amount || 0);
            const balance = netAmount - totalPaid;

            await db.invoices.update({
                where: { id: invoice.id },
                data: {
                    paid_amount: totalPaid,
                    balance_due: balance > 0 ? balance : 0,
                    status: balance <= 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : invoice.status,
                },
            });
        }

        // 4. Record split payment for remaining balance
        if (data.splits && data.splits.length > 0) {
            const transactionGroupId = `TXN-DSC-${Date.now()}`;

            for (const split of data.splits) {
                if (split.amount <= 0) continue;
                await db.payments.create({
                    data: {
                        receipt_number: `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        invoice_id: invoice.id,
                        amount: split.amount,
                        payment_method: split.payment_method,
                        payment_type: 'Settlement',
                        transaction_group_id: transactionGroupId,
                        reference: split.reference || null,
                        status: 'Completed',
                        notes: 'Discharge settlement',
                        organizationId,
                    },
                });
            }

            // Recalculate after final payment
            const allPayments = await db.payments.findMany({
                where: { invoice_id: invoice.id, status: 'Completed' },
            });
            const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
            const netAmount = Number(invoice.net_amount || 0);
            const balance = netAmount - totalPaid;

            await db.invoices.update({
                where: { id: invoice.id },
                data: {
                    paid_amount: totalPaid,
                    balance_due: balance > 0 ? balance : 0,
                    status: balance <= 0 ? 'Paid' : 'Partial',
                },
            });
        }

        // 5. Finalize invoice
        await db.invoices.update({
            where: { id: invoice.id },
            data: { status: 'Paid', finalized_at: new Date() },
        });

        // 6. Discharge patient
        await db.admissions.update({
            where: { admission_id: data.admission_id },
            data: { status: 'Discharged', discharge_date: new Date() },
        });

        // 7. Free the bed
        if (admission.bed_id) {
            await db.beds.update({
                where: { bed_id: admission.bed_id },
                data: { status: 'Cleaning' },
            });
        }

        // 8. Audit log
        await db.system_audit_logs.create({
            data: {
                action: 'DISCHARGE_SETTLEMENT',
                module: 'ipd',
                entity_type: 'admission',
                entity_id: data.admission_id,
                details: JSON.stringify({
                    invoice_id: invoice.id,
                    discount: data.discount_amount || 0,
                    settled_by: session.username,
                }),
                organizationId,
            },
        });

        // 9. Generate final bill data
        const finalBill = await generateInterimBill(data.admission_id);

        return {
            success: true,
            data: serialize({
                admission_id: data.admission_id,
                invoice_id: invoice.id,
                discharge_date: new Date(),
                bill: finalBill.success ? finalBill.data : null,
            }),
        };
    } catch (error: any) {
        console.error('settleAndDischarge error:', error);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNT APPROVAL WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

export async function requestDiscount(data: {
  invoice_id: number;
  discount_amount: number;
  discount_percentage: number;
  reason: string;
}) {
  try {
    const { db } = await requireTenantContext();

    const invoice = await db.invoices.findUnique({
      where: { id: data.invoice_id },
      select: { net_amount: true, total_discount: true },
    });
    if (!invoice) return { success: false, error: 'Invoice not found' };

    // Determine required approval level
    const pct = data.discount_percentage;
    let approval_level = 'auto';
    if (pct > 15) approval_level = 'cfo';
    else if (pct > 5) approval_level = 'manager';

    // For auto-approved discounts (≤5%), apply immediately
    if (approval_level === 'auto') {
      await db.invoices.update({
        where: { id: data.invoice_id },
        data: {
          total_discount: (Number(invoice.total_discount) || 0) + data.discount_amount,
          net_amount: Number(invoice.net_amount) - data.discount_amount,
        },
      });
      await logAudit({
        action: 'discount_applied',
        module: 'ipd',
        entity_type: 'invoice',
        entity_id: String(data.invoice_id),
        details: JSON.stringify({ amount: data.discount_amount, percentage: data.discount_percentage, reason: data.reason, auto_approved: true }),
      });
      return { success: true, data: { status: 'auto_approved' } };
    }

    // For manager/CFO, create a pending approval note in invoice notes
    await logAudit({
      action: 'discount_requested',
      module: 'ipd',
      entity_type: 'invoice',
      entity_id: String(data.invoice_id),
      details: JSON.stringify({ amount: data.discount_amount, percentage: data.discount_percentage, reason: data.reason, approval_level }),
    });

    return {
      success: true,
      data: {
        status: 'pending_approval',
        approval_level,
        message: approval_level === 'cfo'
          ? 'Discount >15% requires CFO approval'
          : 'Discount >5% requires manager approval',
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function applyApprovedDiscount(data: {
  invoice_id: number;
  discount_amount: number;
  approved_by: string;
  approval_notes?: string;
}) {
  try {
    const { db } = await requireTenantContext();

    const invoice = await db.invoices.findUnique({
      where: { id: data.invoice_id },
      select: { net_amount: true, total_discount: true },
    });
    if (!invoice) return { success: false, error: 'Invoice not found' };

    await db.invoices.update({
      where: { id: data.invoice_id },
      data: {
        total_discount: (Number(invoice.total_discount) || 0) + data.discount_amount,
        net_amount: Number(invoice.net_amount) - data.discount_amount,
      },
    });

    await logAudit({
      action: 'discount_approved_applied',
      module: 'ipd',
      entity_type: 'invoice',
      entity_id: String(data.invoice_id),
      details: JSON.stringify({ amount: data.discount_amount, approved_by: data.approved_by, notes: data.approval_notes }),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GL JOURNAL (Double-Entry Stub)
// ─────────────────────────────────────────────────────────────────────────────

interface GLEntry {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  narration: string;
  reference_id: string;
  reference_type: string;
}
  // TODO: Replace audit log approach with createJournalEntry from gl-actions.ts
  // Requires account code mapping to GL account IDs


export async function postToGL(entries: GLEntry[]) {
  // Validate double-entry: total debits must equal total credits
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return { success: false, error: `GL imbalance: debits ${totalDebit} ≠ credits ${totalCredit}` };
  }

  try {
    // Store as audit log entries until a full GL model is built
    for (const entry of entries) {
      await logAudit({
        action: 'gl_journal_entry',
        module: 'gl',
        entity_type: entry.reference_type,
        entity_id: entry.reference_id,
        details: JSON.stringify({
          account_code: entry.account_code,
          account_name: entry.account_name,
          debit: entry.debit,
          credit: entry.credit,
          narration: entry.narration,
        }),
      });
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Hook: auto-post GL when a charge is posted to IPD bill
export async function postChargeToGL(data: {
  admission_id: string;
  amount: number;
  tax_amount: number;
  description: string;
  source_module: string;
  ref_id: string;
}) {
  return postToGL([
    {
      account_code: '1100',
      account_name: 'Patient Receivables',
      debit: data.amount + data.tax_amount,
      credit: 0,
      narration: `IPD Charge: ${data.description}`,
      reference_id: data.ref_id,
      reference_type: `ipd_charge_${data.source_module}`,
    },
    {
      account_code: data.source_module === 'room' ? '4100' : data.source_module === 'lab' ? '4200' : data.source_module === 'pharmacy' ? '4300' : '4900',
      account_name: data.source_module === 'room' ? 'Room Revenue' : data.source_module === 'lab' ? 'Lab Revenue' : data.source_module === 'pharmacy' ? 'Pharmacy Revenue' : 'Other Revenue',
      debit: 0,
      credit: data.amount,
      narration: `IPD Revenue: ${data.description}`,
      reference_id: data.ref_id,
      reference_type: `ipd_charge_${data.source_module}`,
    },
    ...(data.tax_amount > 0 ? [{
      account_code: '2200',
      account_name: 'GST Payable',
      debit: 0,
      credit: data.tax_amount,
      narration: `GST on ${data.description}`,
      reference_id: data.ref_id,
      reference_type: `ipd_gst_${data.source_module}`,
    }] : []),
  ]);
}
