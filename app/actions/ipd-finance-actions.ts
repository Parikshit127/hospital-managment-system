'use server';

import { requireTenantContext } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';
import { createJournalEntry } from './gl-actions';
import { accrueIPDDailyCharges } from '@/app/actions/ipd-actions';
import { getPackageGSTRate, getRoomGSTRate } from '@/app/lib/gst';
import { generateInvoiceNumber as genInvNum } from '@/app/lib/sequence-generator';
import { isBillClosedForCharges, BILL_FINALIZED_INTENT_MSG, isPrivilegedBillingRole } from '@/app/lib/bill-status';
import {
    CHARGE_DISPOSITION,
    type ChargeDisposition,
    ADMISSION_PACKAGE_STATUS,
    PACKAGE_SERVICE_CATEGORY,
    LEGACY_PACKAGE_ADJUSTMENT_CATEGORY,
    PACKAGE_ABSORBED_EXPENSE_CATEGORY,
    PACKAGE_ABSORBED_EXPENSE_CODE,
    packageAbsorbExpenseRef,
    parseExclusions,
    matchExclusion,
    isPlainServiceItem,
    roundMoney,
} from '@/app/lib/package-billing';


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
// TWO-LEDGER PACKAGE BILLING — INTERNAL HELPERS
// (see IPD_PACKAGE_BILLING_DESIGN.md)
// ============================================

function generatePackageExpenseNumber() {
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `EXP-PKG-${String(Date.now()).slice(-8)}-${rand}`;
}

/** The admission's currently active (non-broken, non-closed) package, if any. */
async function getActiveAdmissionPackage(client: any, admissionId: string) {
    return client.ipdAdmissionPackage.findFirst({
        where: { admission_id: admissionId, status: ADMISSION_PACKAGE_STATUS.ACTIVE },
        include: { package: true },
        orderBy: { created_at: 'desc' },
    });
}

/**
 * Rebuild the rolling "Package Absorbed Cost" expense for an admission package
 * from the consumption ledger. Idempotent; safe to call after every change.
 * Runs on the provided client so it can participate in a transaction.
 */
async function upsertPackageAbsorbedExpenseTx(
    tx: any,
    organizationId: string,
    admissionId: string,
    admPkg: { id: number; package?: { package_name?: string } | null },
) {
    const consumed = await tx.ipdChargePosting.findMany({
        where: { admission_package_id: admPkg.id, disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED },
    });

    const total = roundMoney(consumed.reduce((s: number, p: any) => s + Number(p.amount), 0));
    const byCategory: Record<string, number> = {};
    for (const p of consumed) {
        const cat = p.service_category || p.source_module || 'Other';
        byCategory[cat] = roundMoney((byCategory[cat] || 0) + Number(p.amount));
    }

    const referenceNo = packageAbsorbExpenseRef(admissionId);
    const existing = await tx.expense.findFirst({
        where: { organizationId, reference_no: referenceNo },
    });

    if (total <= 0) {
        if (existing) {
            await tx.expense.delete({ where: { id: existing.id } });
        }
        await tx.ipdAdmissionPackage.update({
            where: { id: admPkg.id },
            data: { expense_id: null },
        });
        return null;
    }

    let category = await tx.expenseCategory.findFirst({
        where: { organizationId, name: PACKAGE_ABSORBED_EXPENSE_CATEGORY },
    });
    if (!category) {
        category = await tx.expenseCategory.create({
            data: { name: PACKAGE_ABSORBED_EXPENSE_CATEGORY, code: PACKAGE_ABSORBED_EXPENSE_CODE, organizationId },
        });
    }

    const description = `Package absorbed cost — ${admPkg.package?.package_name || 'Package'} (Admission ${admissionId})`;
    const notes = JSON.stringify({
        type: 'package_absorbed_cost',
        admission_id: admissionId,
        package_name: admPkg.package?.package_name || null,
        breakdown: byCategory,
    });

    let expenseId: number;
    if (existing) {
        await tx.expense.update({
            where: { id: existing.id },
            data: { amount: total, total_amount: total, description, notes },
        });
        expenseId = existing.id;
    } else {
        const created = await tx.expense.create({
            data: {
                expense_number: generatePackageExpenseNumber(),
                category_id: category.id,
                description,
                amount: total,
                total_amount: total,
                status: 'Approved',
                reference_no: referenceNo,
                notes,
                organizationId,
            },
        });
        expenseId = created.id;
    }

    await tx.ipdAdmissionPackage.update({
        where: { id: admPkg.id },
        data: { expense_id: expenseId },
    });
    return expenseId;
}

/** Pre-mutation snapshot so any package migration on an invoice is fully auditable. */
async function createInvoiceSnapshotTx(
    tx: any,
    organizationId: string,
    session: any,
    invoice: any,
    items: any[],
    changeSummary: string,
) {
    await tx.invoice_snapshots.create({
        data: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number || 'Draft',
            version_number: Number(invoice.version || 0),
            snapshot_data: {
                invoice: {
                    total_amount: Number(invoice.total_amount || 0),
                    total_discount: Number(invoice.total_discount || 0),
                    total_tax: Number(invoice.total_tax || 0),
                    net_amount: Number(invoice.net_amount || 0),
                    paid_amount: Number(invoice.paid_amount || 0),
                    balance_due: Number(invoice.balance_due || 0),
                    status: invoice.status,
                },
                items: items.map((it: any) => ({
                    id: it.id,
                    department: it.department,
                    description: it.description,
                    quantity: Number(it.quantity),
                    unit_price: Number(it.unit_price),
                    discount: Number(it.discount),
                    net_price: Number(it.net_price),
                    tax_rate: Number(it.tax_rate || 0),
                    tax_amount: Number(it.tax_amount || 0),
                    service_category: it.service_category,
                    created_at: it.created_at,
                })),
            },
            changed_by: session?.username || session?.email || null,
            change_summary: changeSummary,
            organizationId,
        },
    });
}

function getPackageTaxRate(pkg: { description?: string | null }) {
    let packageCategory: string | null = null;
    try {
        const meta = pkg.description ? JSON.parse(pkg.description) : null;
        if (meta && typeof meta === 'object' && 'category' in meta) {
            packageCategory = String(meta.category);
        }
    } catch {
        packageCategory = null;
    }
    return getPackageGSTRate(packageCategory);
}

async function findPackageInvoiceItem(client: any, admissionPackageId: number, invoiceId?: number | null) {
    const where: any = {
        ref_id: String(admissionPackageId),
        OR: [
            { service_category: PACKAGE_SERVICE_CATEGORY },
            { department: PACKAGE_SERVICE_CATEGORY },
        ],
    };
    if (invoiceId) where.invoice_id = invoiceId;

    let item = await client.invoice_items.findFirst({ where, orderBy: { id: 'desc' } });
    if (item) return item;

    const posting = await client.ipdChargePosting.findFirst({
        where: {
            source_module: 'package',
            source_ref_id: String(admissionPackageId),
            invoice_item_id: { not: null },
        },
        orderBy: { id: 'desc' },
    });
    if (!posting?.invoice_item_id) return null;
    return client.invoice_items.findUnique({ where: { id: posting.invoice_item_id } });
}

async function ensurePackageInvoiceLineTx(
    client: any,
    organizationId: string,
    session: any,
    admissionId: string,
    admPkg: { id: number; applied_amount: any; package?: any },
) {
    let invoice = await client.invoices.findFirst({
        where: { admission_id: admissionId, status: { not: 'Cancelled' } },
    });

    if (invoice && isBillClosedForCharges(invoice)) {
        return { success: false as const, error: BILL_FINALIZED_INTENT_MSG };
    }

    if (!invoice) {
        const admission = await client.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { patient_id: true },
        });
        if (!admission) return { success: false as const, error: 'Admission not found' };

        invoice = await client.invoices.create({
            data: {
                invoice_number: null,
                patient_id: admission.patient_id,
                admission_id: admissionId,
                invoice_type: 'IPD',
                status: 'Draft',
                organizationId,
            },
        });
    }

    const existing = await findPackageInvoiceItem(client, admPkg.id, invoice.id);
    if (existing) return { success: true as const, invoice, item: existing, created: false };

    const amount = Number(admPkg.applied_amount || 0);
    const taxRate = getPackageTaxRate(admPkg.package || {});
    const taxAmount = roundMoney(amount * taxRate / 100);

    const item = await client.invoice_items.create({
        data: {
            invoice_id: invoice.id,
            department: PACKAGE_SERVICE_CATEGORY,
            description: `Package: ${admPkg.package?.package_name || 'IPD Package'}`,
            quantity: 1,
            unit_price: amount,
            total_price: amount,
            discount: 0,
            net_price: amount,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            hsn_sac_code: null,
            service_category: PACKAGE_SERVICE_CATEGORY,
            ref_id: String(admPkg.id),
            organizationId,
        },
    });

    const postingAmount = roundMoney(amount + taxAmount);
    const updated = await client.ipdChargePosting.updateMany({
        where: {
            admission_id: admissionId,
            source_module: 'package',
            source_ref_id: String(admPkg.id),
        },
        data: {
            invoice_item_id: item.id,
            description: item.description,
            amount: postingAmount,
            disposition: CHARGE_DISPOSITION.BILLED,
            service_category: PACKAGE_SERVICE_CATEGORY,
            quantity: 1,
            unit_price: amount,
            tax_rate: taxRate,
        },
    });

    if (updated.count === 0) {
        await client.ipdChargePosting.create({
            data: {
                admission_id: admissionId,
                invoice_item_id: item.id,
                source_module: 'package',
                source_ref_id: String(admPkg.id),
                description: item.description,
                amount: postingAmount,
                posted_by: session?.id || null,
                posted_at: new Date(),
                organizationId,
                disposition: CHARGE_DISPOSITION.BILLED,
                service_category: PACKAGE_SERVICE_CATEGORY,
                quantity: 1,
                unit_price: amount,
                tax_rate: taxRate,
            },
        });
    }

    await recalculateInvoiceWithGstTx(client, invoice.id);
    return { success: true as const, invoice, item, created: true };
}

/**
 * Move every plain billed service line of a Draft invoice into the package
 * consumption ledger (exclusion-matched lines stay billed as extras), and drop
 * legacy "Package Adjustment" lines. Historical postings keep their posted_at —
 * nothing is re-dated. Caller is responsible for the invoice being Draft and
 * unlocked, for recalculating totals, and for running inside a transaction.
 */
async function absorbBilledItemsIntoPackageTx(
    tx: any,
    organizationId: string,
    session: any,
    invoice: { id: number },
    admissionId: string,
    admPkg: { id: number; package?: any },
) {
    const items = await tx.invoice_items.findMany({ where: { invoice_id: invoice.id } });
    const exclusions = parseExclusions(admPkg.package?.exclusions);

    let absorbedCount = 0;
    let absorbedAmount = 0;
    let extrasCount = 0;

    for (const item of items) {
        if (!isPlainServiceItem(item)) continue;

        const match = matchExclusion(exclusions, {
            service_id: item.ref_id,
            service_category: item.service_category || item.department,
            description: item.description,
        });

        const postingBase = {
            admission_package_id: admPkg.id,
            service_category: item.service_category || item.department || null,
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
            tax_rate: Number(item.tax_rate) || 0,
        };

        if (match.matched) {
            // Excluded from the package — stays billed over it.
            const flagged = await tx.ipdChargePosting.updateMany({
                where: { invoice_item_id: item.id },
                data: { disposition: CHARGE_DISPOSITION.BILLABLE_EXTRA, ...postingBase },
            });
            if (flagged.count === 0) {
                // Item predates posting-audit coverage — create its ledger row now.
                await tx.ipdChargePosting.create({
                    data: {
                        admission_id: admissionId,
                        invoice_item_id: item.id,
                        source_module: 'billing',
                        source_ref_id: item.ref_id || null,
                        description: item.description,
                        amount: roundMoney(Number(item.net_price || 0) + Number(item.tax_amount || 0)),
                        posted_by: session?.id || null,
                        posted_at: item.created_at,
                        organizationId,
                        disposition: CHARGE_DISPOSITION.BILLABLE_EXTRA,
                        ...postingBase,
                    },
                });
            }
            extrasCount++;
            continue;
        }

        const gross = roundMoney(Number(item.net_price || 0) + Number(item.tax_amount || 0));
        const updated = await tx.ipdChargePosting.updateMany({
            where: { invoice_item_id: item.id },
            data: {
                disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED,
                invoice_item_id: null,
                ...postingBase,
            },
        });
        if (updated.count === 0) {
            // Item predates posting-audit coverage — create its ledger row now,
            // preserving the item's original date (no re-dating).
            await tx.ipdChargePosting.create({
                data: {
                    admission_id: admissionId,
                    invoice_item_id: null,
                    source_module: 'billing',
                    source_ref_id: item.ref_id || null,
                    description: item.description,
                    amount: gross,
                    posted_by: session?.id || null,
                    posted_at: item.created_at,
                    organizationId,
                    disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED,
                    ...postingBase,
                },
            });
        }
        await tx.invoice_items.delete({ where: { id: item.id } });
        absorbedCount++;
        absorbedAmount = roundMoney(absorbedAmount + gross);
    }

    // Legacy negative-adjustment lines from the old settle flow are superseded.
    await tx.invoice_items.deleteMany({
        where: { invoice_id: invoice.id, service_category: LEGACY_PACKAGE_ADJUSTMENT_CATEGORY },
    });

    return { absorbedCount, absorbedAmount, extrasCount };
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
    posted_at?: Date;
    /**
     * Two-ledger package billing: explicit routing chosen by the user.
     * Omit for automatic resolution (exclusion-aware). Ignored when the
     * admission has no active package.
     */
    disposition_override?: 'package_consumed' | 'billable_extra';
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // Rules 4 & 5: once the patient is discharged or the bill is finalized/locked,
        // no department (pharmacy, nursing, lab, OT, package, manual) may post new charges.
        const admissionRec = await db.admissions.findUnique({
            where: { admission_id: data.admission_id },
            select: { status: true },
        });
        if (!admissionRec) return { success: false, error: 'Admission not found' };
        if (admissionRec.status === 'Discharged') {
            return { success: false, error: BILL_FINALIZED_INTENT_MSG };
        }
        const activeInvoice = await db.invoices.findFirst({
            where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
            select: { status: true, is_locked: true },
        });
        if (isBillClosedForCharges(activeInvoice)) {
            return { success: false, error: BILL_FINALIZED_INTENT_MSG };
        }

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

        const isManual = data.source_module === 'manual' || data.source_module === 'billing';
        const isPharm = serviceCategory?.toLowerCase() === 'pharmacy' || data.service_category?.toLowerCase() === 'pharmacy';
        if (isPharm && isManual && session?.role !== 'pharmacist') {
            return { success: false, error: 'Only a pharmacist can add pharmacy items to an IPD bill.' };
        }

        // ── Two-ledger package routing ───────────────────────────────────────
        // With an active package, a charge is either consumed under the package
        // (absorbed — never reaches the invoice/claim) or billed over it as a
        // package exclusion. The package line itself is always billed.
        const activePkg = data.source_module === 'package'
            ? null
            : await getActiveAdmissionPackage(db, data.admission_id);

        let disposition: ChargeDisposition = CHARGE_DISPOSITION.BILLED;
        let exclusionNote: string | null = null;
        if (activePkg) {
            if (data.disposition_override === CHARGE_DISPOSITION.PACKAGE_CONSUMED
                || data.disposition_override === CHARGE_DISPOSITION.BILLABLE_EXTRA) {
                disposition = data.disposition_override;
            } else {
                const match = matchExclusion(parseExclusions(activePkg.package?.exclusions), {
                    service_id: data.service_id,
                    service_category: serviceCategory,
                    description,
                });
                disposition = match.matched
                    ? CHARGE_DISPOSITION.BILLABLE_EXTRA
                    : CHARGE_DISPOSITION.PACKAGE_CONSUMED;
                exclusionNote = match.note || match.rule || null;
            }
        }

        if (disposition === CHARGE_DISPOSITION.PACKAGE_CONSUMED && activePkg) {
            // Absorbed under the package: post to the consumption ledger only.
            // The invoice — and therefore the patient/TPA claim — is untouched.
            const discount = data.discount || 0;
            const total_price = data.quantity * unitPrice;
            const net_price = total_price - discount;
            const tax_amount = net_price * taxRate / 100;
            const now = new Date();
            const isBackdated = !!data.posted_at && Math.abs(now.getTime() - data.posted_at.getTime()) > 60 * 1000;

            const posting = await db.$transaction(async (tx: any) => {
                const p = await tx.ipdChargePosting.create({
                    data: {
                        admission_id: data.admission_id,
                        invoice_item_id: null,
                        source_module: data.source_module,
                        source_ref_id: refId,
                        description,
                        amount: roundMoney(net_price + tax_amount),
                        posted_by: data.posted_by || session.id,
                        posted_at: data.posted_at || now,
                        is_backdated: isBackdated,
                        organizationId,
                        disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED,
                        admission_package_id: activePkg.id,
                        service_category: serviceCategory || data.source_module,
                        quantity: data.quantity,
                        unit_price: unitPrice,
                        tax_rate: taxRate,
                    },
                });
                await upsertPackageAbsorbedExpenseTx(tx, organizationId, data.admission_id, activePkg);
                return p;
            });

            return {
                success: true,
                data: serialize({
                    item_id: null,
                    invoice_id: null,
                    posting_id: posting.id,
                    disposition,
                    absorbed_under_package: activePkg.package?.package_name || true,
                }),
            };
        }

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

            invoice = await db.invoices.create({
                data: {
                    // Numberless draft — number assigned at finalization (ongoing IPD series).
                    invoice_number: null,
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
                ...(data.posted_at ? { created_at: data.posted_at } : {}),
            },
        });

        // Recalculate invoice totals with GST
        await recalculateInvoiceWithGst(invoice.id);

        // Create charge posting audit
        const now = new Date();
        const isBackdated = !!data.posted_at && Math.abs(now.getTime() - data.posted_at.getTime()) > 60 * 1000;
        await db.ipdChargePosting.create({
            data: {
                admission_id: data.admission_id,
                invoice_item_id: item.id,
                source_module: data.source_module,
                source_ref_id: refId,
                description,
                amount: net_price + tax_amount,
                posted_by: data.posted_by || session.id,
                posted_at: data.posted_at || now,
                is_backdated: isBackdated,
                organizationId,
                disposition,
                admission_package_id: disposition === CHARGE_DISPOSITION.BILLABLE_EXTRA ? activePkg?.id ?? null : null,
                service_category: serviceCategory || data.source_module,
                quantity: data.quantity,
                unit_price: unitPrice,
                tax_rate: taxRate,
            },
        });

        return {
            success: true,
            data: serialize({
                item_id: item.id,
                invoice_id: invoice.id,
                disposition,
                exclusion_note: exclusionNote,
            }),
        };
    } catch (error: any) {
        console.error('postChargeToIpdBill error:', error);
        return { success: false, error: error.message };
    }
}

// Recalculate invoice totals including GST
async function recalculateInvoiceWithGst(invoiceId: number) {
    const { db } = await requireTenantContext();
    await recalculateInvoiceWithGstTx(db, invoiceId);
}

// Transaction-capable variant — pass a tx client to keep the recalculation
// atomic with the mutations that made it necessary.
async function recalculateInvoiceWithGstTx(db: any, invoiceId: number) {
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

        // Only one active package per admission (multi-package is a V2 concern).
        const existing = await db.ipdAdmissionPackage.findFirst({
            where: { admission_id: admissionId, status: ADMISSION_PACKAGE_STATUS.ACTIVE },
        });
        if (existing) return { success: false, error: 'A package is already applied to this admission' };

        // The package can only be applied while the bill is still open.
        const openInvoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        });
        if (isBillClosedForCharges(openInvoice)) {
            return { success: false, error: BILL_FINALIZED_INTENT_MSG };
        }

        // Create admission package record
        const admPkg = await db.ipdAdmissionPackage.create({
            data: {
                admission_id: admissionId,
                package_id: packageId,
                applied_amount: pkg.total_amount,
                applied_by: session.id,
                status: ADMISSION_PACKAGE_STATUS.ACTIVE,
                organizationId,
            },
        });

        // Determine GST rate from package category. Cosmetic / plastic surgery = 18%,
        // all other clinical packages are exempt under healthcare exemption.
        const packageTaxRate = getPackageTaxRate(pkg);

        // Post as a single line item to the IPD bill
        const packageLine = await postChargeToIpdBill({
            admission_id: admissionId,
            source_module: 'package',
            source_ref_id: String(admPkg.id),
            description: `Package: ${pkg.package_name}`,
            quantity: 1,
            unit_price: Number(pkg.total_amount),
            tax_rate: packageTaxRate,
            service_category: PACKAGE_SERVICE_CATEGORY,
        });
        if (!packageLine.success) {
            // Roll the package record back so we never leave a half-applied package.
            await db.ipdAdmissionPackage.delete({ where: { id: admPkg.id } });
            return { success: false, error: packageLine.error || 'Failed to post package line' };
        }

        // Mid-stay application: services already billed on the open Draft invoice
        // move into the package consumption ledger (exclusions stay billed as
        // extras). Their original posting dates are preserved — nothing is
        // re-dated, and locked/final invoices are never touched.
        let migration = { absorbedCount: 0, absorbedAmount: 0, extrasCount: 0 };
        const invoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
            include: { items: true },
        });
        if (invoice && invoice.status === 'Draft' && !invoice.is_locked
            && invoice.items.some((i: any) => isPlainServiceItem(i))) {
            const admPkgFull = { ...admPkg, package: pkg };
            migration = await db.$transaction(async (tx: any) => {
                await createInvoiceSnapshotTx(
                    tx, organizationId, session, invoice, invoice.items,
                    `Package "${pkg.package_name}" applied — billed services moved to package consumption`,
                );
                const result = await absorbBilledItemsIntoPackageTx(
                    tx, organizationId, session, invoice, admissionId, admPkgFull,
                );
                await recalculateInvoiceWithGstTx(tx, invoice.id);
                await upsertPackageAbsorbedExpenseTx(tx, organizationId, admissionId, admPkgFull);
                return result;
            });
        }

        await logAudit({
            action: 'APPLY_IPD_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_admission_package',
            entity_id: String(admPkg.id),
            details: JSON.stringify({
                package_name: pkg.package_name,
                amount: Number(pkg.total_amount),
                migrated_to_consumption: migration.absorbedCount,
                migrated_amount: migration.absorbedAmount,
                kept_as_billable_extras: migration.extrasCount,
            }),
        });

        return { success: true, data: serialize({ ...admPkg, migration }) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Remove the package from an admission's bill. Because the package line is
// re-created by the posting-time reconciler while the package is ACTIVE, simply
// deleting the invoice line does nothing — the package must be broken open.
// This finds the active package and breaks it open (reverts to itemized billing).
export async function removeAdmissionPackage(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const admPkg = await db.ipdAdmissionPackage.findFirst({
            where: { admission_id: admissionId, status: ADMISSION_PACKAGE_STATUS.ACTIVE },
        });
        if (!admPkg) return { success: false, error: 'No active package on this admission' };
        return await breakOpenPackage(admPkg.id);
    } catch (error: any) {
        return { success: false, error: error?.message || 'Failed to remove package' };
    }
}

// Break open = the patient exits the package and billing reverts to itemized:
// every consumed service returns to the bill as a real line item (at its
// original recorded qty/rate/tax and original posting date), the package line
// is removed, and the absorbed-cost expense is dissolved.
export async function breakOpenPackage(admissionPackageId: number) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const admPkg = await db.ipdAdmissionPackage.findUnique({
            where: { id: admissionPackageId },
            include: { package: true },
        });
        if (!admPkg) return { success: false, error: 'Package application not found' };
        if (admPkg.status !== ADMISSION_PACKAGE_STATUS.ACTIVE) {
            return { success: false, error: `Package is not active (status: ${admPkg.status})` };
        }

        const invoice = await db.invoices.findFirst({
            where: { admission_id: admPkg.admission_id, status: { not: 'Cancelled' } },
            include: { items: true },
        });
        if (!invoice) return { success: false, error: 'No IPD invoice found for this admission' };
        if (invoice.is_locked || invoice.status !== 'Draft') {
            return { success: false, error: 'The bill is finalized/locked — the package can no longer be broken open.' };
        }

        const summary = await db.$transaction(async (tx: any) => {
            await createInvoiceSnapshotTx(
                tx, organizationId, session, invoice, invoice.items,
                `Package "${admPkg.package?.package_name || ''}" broken open — reverting to itemized billing`,
            );

            // 1) Re-bill every consumed service as a real invoice line.
            const consumed = await tx.ipdChargePosting.findMany({
                where: { admission_package_id: admPkg.id, disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED },
            });
            let restoredAmount = 0;
            for (const p of consumed) {
                const quantity = Number(p.quantity) || 1;
                const unitPrice = Number(p.unit_price) || 0;
                const taxRate = Number(p.tax_rate) || 0;
                const totalPrice = quantity * unitPrice;
                // Postings created before qty/rate were tracked fall back to amount.
                const netPrice = totalPrice > 0 ? totalPrice : Number(p.amount) / (1 + taxRate / 100);
                const taxAmount = netPrice * taxRate / 100;

                const item = await tx.invoice_items.create({
                    data: {
                        invoice_id: invoice.id,
                        department: p.service_category || p.source_module,
                        description: p.description,
                        quantity,
                        unit_price: unitPrice > 0 ? unitPrice : netPrice,
                        total_price: netPrice,
                        discount: 0,
                        net_price: netPrice,
                        tax_rate: taxRate,
                        tax_amount: taxAmount,
                        service_category: p.service_category,
                        ref_id: p.source_ref_id,
                        organizationId,
                        created_at: p.posted_at, // keep the original service date
                    },
                });
                await tx.ipdChargePosting.update({
                    where: { id: p.id },
                    data: { disposition: CHARGE_DISPOSITION.BILLED, invoice_item_id: item.id },
                });
                restoredAmount = roundMoney(restoredAmount + netPrice + taxAmount);
            }

            // 2) Extras lose their "over the package" meaning — they are plain billed lines now.
            await tx.ipdChargePosting.updateMany({
                where: { admission_package_id: admPkg.id, disposition: CHARGE_DISPOSITION.BILLABLE_EXTRA },
                data: { disposition: CHARGE_DISPOSITION.BILLED },
            });

            // 3) Remove the package line itself (invoice item + its posting).
            const pkgPostings = await tx.ipdChargePosting.findMany({
                where: {
                    admission_id: admPkg.admission_id,
                    source_module: 'package',
                    source_ref_id: String(admPkg.id),
                },
            });
            for (const pp of pkgPostings) {
                if (pp.invoice_item_id) {
                    await tx.invoice_items.deleteMany({ where: { id: pp.invoice_item_id } });
                }
                await tx.ipdChargePosting.delete({ where: { id: pp.id } });
            }

            // 4) Legacy adjustment lines (old settle flow) are superseded.
            await tx.invoice_items.deleteMany({
                where: { invoice_id: invoice.id, service_category: LEGACY_PACKAGE_ADJUSTMENT_CATEGORY },
            });

            // 5) Dissolve the rolling absorbed-cost expense (no consumption left).
            await upsertPackageAbsorbedExpenseTx(tx, organizationId, admPkg.admission_id, admPkg);

            await tx.ipdAdmissionPackage.update({
                where: { id: admPkg.id },
                data: {
                    status: ADMISSION_PACKAGE_STATUS.BROKEN_OPEN,
                    is_broken_open: true,
                    broken_at: new Date(),
                },
            });

            await recalculateInvoiceWithGstTx(tx, invoice.id);
            return { restored_lines: consumed.length, restored_amount: restoredAmount };
        });

        await logAudit({
            action: 'BREAK_OPEN_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_admission_package',
            entity_id: String(admissionPackageId),
            details: JSON.stringify(summary),
        });

        return { success: true, data: serialize({ id: admPkg.id, ...summary }) };
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
            orderBy: { created_at: 'desc' },
        });

        if (!admPkg) return { success: true, data: null };

        const postings = await db.ipdChargePosting.findMany({
            where: { admission_package_id: admPkg.id },
            orderBy: { posted_at: 'asc' },
        });

        const consumedItems = postings.filter((p: any) => p.disposition === CHARGE_DISPOSITION.PACKAGE_CONSUMED);
        const extraItems = postings.filter((p: any) => p.disposition === CHARGE_DISPOSITION.BILLABLE_EXTRA);

        const consumed = roundMoney(consumedItems.reduce((s: number, p: any) => s + Number(p.amount), 0));
        const extrasBilled = roundMoney(extraItems.reduce((s: number, p: any) => s + Number(p.amount), 0));
        const packageAmount = Number(admPkg.applied_amount);

        const consumedByCategory: Record<string, number> = {};
        for (const p of consumedItems) {
            const cat = p.service_category || p.source_module || 'Other';
            consumedByCategory[cat] = roundMoney((consumedByCategory[cat] || 0) + Number(p.amount));
        }

        const mapItem = (p: any) => ({
            id: p.id,
            description: p.description,
            service_category: p.service_category || p.source_module,
            source_module: p.source_module,
            amount: Number(p.amount),
            quantity: Number(p.quantity) || 1,
            posted_at: p.posted_at,
        });

        return {
            success: true,
            data: serialize({
                admission_package_id: admPkg.id,
                package_name: admPkg.package?.package_name,
                package_amount: packageAmount,
                status: admPkg.status,
                is_broken_open: admPkg.is_broken_open,
                consumed,
                consumed_by_category: consumedByCategory,
                consumed_items: consumedItems.map(mapItem),
                extras_billed: extrasBilled,
                extra_items: extraItems.map(mapItem),
                remaining: roundMoney(packageAmount - consumed),
                utilization_pct: packageAmount > 0 ? roundMoney((consumed / packageAmount) * 100) : 0,
            }),
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Change the applied package amount for an active admission package.
 * Updates both the `ipdAdmissionPackage.applied_amount` and the corresponding
 * invoice line item, then recalculates invoice totals.
 */
export async function updateAdmissionPackageAmount(admissionPackageId: number, newAmount: number) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        if (newAmount <= 0) return { success: false, error: 'Amount must be greater than zero' };

        const admPkg = await db.ipdAdmissionPackage.findUnique({
            where: { id: admissionPackageId },
            include: { package: true },
        });
        if (!admPkg || admPkg.organizationId !== organizationId) {
            return { success: false, error: 'Admission package not found' };
        }
        if (admPkg.status !== ADMISSION_PACKAGE_STATUS.ACTIVE) {
            return { success: false, error: 'Can only edit an active package' };
        }

        const invoice = await db.invoices.findFirst({
            where: { admission_id: admPkg.admission_id, status: { not: 'Cancelled' } },
        });
        if (isBillClosedForCharges(invoice)) {
            return { success: false, error: BILL_FINALIZED_INTENT_MSG };
        }

        // Find the invoice line item posted for this package. invoice_items has
        // no source_module column; the package marker is service_category/ref_id.
        let packageItem = await findPackageInvoiceItem(db, admissionPackageId, invoice?.id);

        if (!packageItem) {
            const repaired = await db.$transaction(async (tx: any) => {
                const result = await ensurePackageInvoiceLineTx(
                    tx,
                    organizationId,
                    session,
                    admPkg.admission_id,
                    admPkg,
                );
                if (!result.success) return result;
                return { success: true as const, item: result.item };
            });
            if (!repaired.success) return { success: false, error: repaired.error };
            packageItem = repaired.item;
        }

        if (packageItem) {
            const taxRate = Number(packageItem.tax_rate || 0);
            const taxAmount = roundMoney(newAmount * taxRate / 100);
            await db.$transaction(async (tx: any) => {
                await tx.ipdAdmissionPackage.update({
                    where: { id: admissionPackageId },
                    data: { applied_amount: newAmount },
                });
                await tx.invoice_items.update({
                    where: { id: packageItem.id },
                    data: {
                        unit_price: newAmount,
                        total_price: newAmount,
                        net_price: newAmount,
                        tax_amount: taxAmount,
                    },
                });
                await tx.ipdChargePosting.updateMany({
                    where: {
                        admission_id: admPkg.admission_id,
                        source_module: 'package',
                        source_ref_id: String(admissionPackageId),
                    },
                    data: {
                        invoice_item_id: packageItem.id,
                        amount: roundMoney(newAmount + taxAmount),
                        unit_price: newAmount,
                        tax_rate: taxRate,
                        service_category: PACKAGE_SERVICE_CATEGORY,
                        quantity: 1,
                        disposition: CHARGE_DISPOSITION.BILLED,
                    },
                });
                await recalculateInvoiceWithGstTx(tx, packageItem.invoice_id);
            });
        }

        await logAudit({
            action: 'UPDATE_ADMISSION_PACKAGE_AMOUNT',
            module: 'ipd',
            entity_type: 'ipd_admission_package',
            entity_id: String(admissionPackageId),
            details: JSON.stringify({
                package_name: admPkg.package?.package_name,
                old_amount: Number(admPkg.applied_amount),
                new_amount: newAmount,
                updated_by: session.id,
            }),
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Reclassify a charge between "consumed under the package" and "billable over
 * the package". Billing-supervisor action (admin/finance): ward staff pick the
 * disposition at posting time; corrections afterwards are privileged + audited.
 */
export async function reclassifyChargeDisposition(
    postingId: number,
    target: 'package_consumed' | 'billable_extra',
) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        if (!isPrivilegedBillingRole(session?.role)) {
            return { success: false, error: 'Only admin/finance can reclassify package charges.' };
        }
        if (target !== CHARGE_DISPOSITION.PACKAGE_CONSUMED && target !== CHARGE_DISPOSITION.BILLABLE_EXTRA) {
            return { success: false, error: 'Invalid target disposition' };
        }

        const posting = await db.ipdChargePosting.findUnique({ where: { id: postingId } });
        if (!posting) return { success: false, error: 'Charge posting not found' };
        if (!posting.admission_package_id) {
            return { success: false, error: 'This charge is not linked to a package' };
        }
        if (posting.disposition === target) return { success: false, error: 'Charge already has this disposition' };
        if (posting.disposition !== CHARGE_DISPOSITION.PACKAGE_CONSUMED
            && posting.disposition !== CHARGE_DISPOSITION.BILLABLE_EXTRA) {
            return { success: false, error: `Charge disposition '${posting.disposition}' cannot be reclassified` };
        }

        const admPkg = await db.ipdAdmissionPackage.findUnique({
            where: { id: posting.admission_package_id },
            include: { package: true },
        });
        if (!admPkg || admPkg.status !== ADMISSION_PACKAGE_STATUS.ACTIVE) {
            return { success: false, error: 'The package is no longer active' };
        }

        const invoice = await db.invoices.findFirst({
            where: { admission_id: posting.admission_id, status: { not: 'Cancelled' } },
        });
        if (!invoice) return { success: false, error: 'No IPD invoice found for this admission' };
        if (invoice.is_locked || invoice.status !== 'Draft') {
            return { success: false, error: 'The bill is finalized/locked — charges can no longer be reclassified.' };
        }

        await db.$transaction(async (tx: any) => {
            if (target === CHARGE_DISPOSITION.BILLABLE_EXTRA) {
                // Consumed → billed over the package: create the invoice line.
                const quantity = Number(posting.quantity) || 1;
                const unitPrice = Number(posting.unit_price) || 0;
                const taxRate = Number(posting.tax_rate) || 0;
                const totalPrice = quantity * unitPrice;
                const netPrice = totalPrice > 0 ? totalPrice : Number(posting.amount) / (1 + taxRate / 100);
                const taxAmount = netPrice * taxRate / 100;

                const item = await tx.invoice_items.create({
                    data: {
                        invoice_id: invoice.id,
                        department: posting.service_category || posting.source_module,
                        description: posting.description,
                        quantity,
                        unit_price: unitPrice > 0 ? unitPrice : netPrice,
                        total_price: netPrice,
                        discount: 0,
                        net_price: netPrice,
                        tax_rate: taxRate,
                        tax_amount: taxAmount,
                        service_category: posting.service_category,
                        ref_id: posting.source_ref_id,
                        organizationId,
                        created_at: posting.posted_at, // keep the original service date
                    },
                });
                await tx.ipdChargePosting.update({
                    where: { id: posting.id },
                    data: { disposition: CHARGE_DISPOSITION.BILLABLE_EXTRA, invoice_item_id: item.id },
                });
            } else {
                // Billed extra → consumed: remove the invoice line, keep the ledger row.
                if (posting.invoice_item_id) {
                    await tx.invoice_items.deleteMany({ where: { id: posting.invoice_item_id } });
                }
                await tx.ipdChargePosting.update({
                    where: { id: posting.id },
                    data: { disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED, invoice_item_id: null },
                });
            }
            await recalculateInvoiceWithGstTx(tx, invoice.id);
            await upsertPackageAbsorbedExpenseTx(tx, organizationId, posting.admission_id, admPkg);
        });

        await logAudit({
            action: 'RECLASSIFY_PACKAGE_CHARGE',
            module: 'ipd',
            entity_type: 'ipd_charge_posting',
            entity_id: String(postingId),
            details: JSON.stringify({
                description: posting.description,
                amount: Number(posting.amount),
                from: posting.disposition,
                to: target,
            }),
        });

        return { success: true, data: serialize({ posting_id: postingId, disposition: target }) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Reconcile a package admission's billing (repair / legacy-migration tool).
//
// With the two-ledger model, charges posted while a package is active go
// straight to the consumption ledger, so the invoice never needs settling.
// This tool exists for admissions that predate the model (service lines and/or
// a legacy negative "Package Adjustment" line still on the invoice) or where a
// department posted around the router. It moves stray billed service lines into
// consumption (exclusions stay billed as extras), removes legacy adjustment
// lines, and rebuilds the rolling absorbed-cost expense. Idempotent.
//
// Only Draft, unlocked invoices are touched — finalized/locked bills are never
// modified, which keeps historical billing untouched.
async function reconcilePackageBillingInternal(
    db: any,
    organizationId: string,
    session: any,
    admissionId: string,
) {
    const admPkg = await getActiveAdmissionPackage(db, admissionId);
    if (!admPkg) return { success: false as const, error: 'No active package on this admission' };

    const ensured = await db.$transaction(async (tx: any) => (
        ensurePackageInvoiceLineTx(tx, organizationId, session, admissionId, admPkg)
    ));
    if (!ensured.success) return ensured;

    const invoice = await db.invoices.findFirst({
        where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        include: { items: true },
    });
    if (!invoice) return { success: false as const, error: 'No IPD invoice found for this admission' };
    if (invoice.is_locked || invoice.status !== 'Draft') {
        return {
            success: false as const,
            error: 'The bill is finalized/locked — reconciliation would alter a closed bill, so it is not allowed.',
        };
    }

    const result = await db.$transaction(async (tx: any) => {
        await createInvoiceSnapshotTx(
            tx, organizationId, session, invoice, invoice.items,
            'Package billing reconciliation — billed services moved to package consumption',
        );
        const migration = await absorbBilledItemsIntoPackageTx(
            tx, organizationId, session, invoice, admissionId, admPkg,
        );
        await recalculateInvoiceWithGstTx(tx, invoice.id);
        await upsertPackageAbsorbedExpenseTx(tx, organizationId, admissionId, admPkg);
        return migration;
    });

    await logAudit({
        action: 'RECONCILE_PACKAGE_BILLING',
        module: 'ipd',
        entity_type: 'admission',
        entity_id: admissionId,
        details: JSON.stringify(result),
    });

    return { success: true as const, data: result };
}

export async function reconcilePackageBilling(admissionId: string) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        if (!isPrivilegedBillingRole(session?.role)) {
            return { success: false, error: 'Only admin/finance can reconcile package billing.' };
        }
        const result = await reconcilePackageBillingInternal(db, organizationId, session, admissionId);
        if (!result.success) return result;
        return { success: true, data: serialize(result.data) };
    } catch (error: any) {
        console.error('reconcilePackageBilling error:', error?.message || error);
        return { success: false, error: error?.message || 'Failed to reconcile package billing' };
    }
}

// Read-only view of the CONSUMPTION ledger for a package admission: every
// charge that was absorbed under the package (disposition = package_consumed)
// and therefore NOT put on the patient/TPA bill. Used by the billing counter to
// let staff see what the hospital absorbed, with a category breakup. Never
// mutates anything.
export async function getAbsorbedCharges(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const admPkg = await db.ipdAdmissionPackage.findFirst({
            where: { admission_id: admissionId },
            include: { package: true },
        });

        const postings = await db.ipdChargePosting.findMany({
            where: { admission_id: admissionId, disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED },
            orderBy: { posted_at: 'desc' },
        });

        const items = postings.map((p: any) => ({
            id: p.id,
            description: p.description,
            category: p.service_category || p.source_module || 'Other',
            quantity: Number(p.quantity || 1),
            unit_price: Number(p.unit_price || 0),
            amount: Number(p.amount || 0),
            posted_at: p.posted_at,
        }));

        const total = items.reduce((s: number, i: any) => s + i.amount, 0);
        const byCategory: Record<string, number> = {};
        for (const i of items) byCategory[i.category] = (byCategory[i.category] || 0) + i.amount;

        return {
            success: true,
            data: serialize({
                package_name: admPkg?.package?.package_name || null,
                package_amount: admPkg ? Number(admPkg.applied_amount) : 0,
                total,
                byCategory,
                items,
                count: items.length,
            }),
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** @deprecated Superseded by automatic posting-time routing; kept for compatibility. Calls reconcilePackageBilling. */
export async function settlePackageBilling(admissionId: string) {
    return reconcilePackageBilling(admissionId);
}

// ============================================
// INTERIM BILL
// ============================================

export async function generateInterimBill(admissionId: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: {
                patient: true,
                ward: true,
                bed: { include: { wards: true } },
            },
        });
        if (!admission) return { success: false, error: 'Admission not found' };

        // Auto-accrual disabled — room/nursing charges are added manually
        // if (admission.status === 'Admitted') {
        //     await accrueIPDDailyCharges(admissionId);
        // }

        const activeAdmPkg = await getActiveAdmissionPackage(db, admissionId);
        if (activeAdmPkg && admission.status === 'Admitted') {
            const ensured = await db.$transaction(async (tx: any) => (
                ensurePackageInvoiceLineTx(tx, organizationId, session, admissionId, activeAdmPkg)
            ));
            if (!ensured.success) return ensured;
        }

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

        // Get deposits — for this admission OR patient-level deposits (admission_id null)
        // so deposits collected without an admission link are still available to apply.
        const deposits = await db.patientDeposit.findMany({
            where: {
                status: 'Active',
                OR: [
                    { admission_id: admission.admission_id },
                    { patient_id: admission.patient_id, admission_id: null },
                ],
            },
            orderBy: { created_at: 'asc' },
        });

        const ward = admission.ward || admission.bed?.wards;
        const daysAdmitted = Math.max(1, Math.ceil(
            (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
        ));

        return {
            success: true,
            data: serialize({
                type: admission.status === 'Discharged' ? 'FINAL' : 'INTERIM',
                admission: {
                    admission_id: admission.admission_id,
                    patient_name: admission.patient?.full_name,
                    patient_id: admission.patient_id,
                    patient_type: admission.patient?.patient_type,
                    doctor_name: admission.doctor_name,
                    ward_name: ward?.ward_name || 'N/A',
                    bed_id: admission.bed_id,
                    admission_date: admission.admission_date,
                    discharge_date: admission.discharge_date,
                    status: admission.status,
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
                    // Billing type so the settlement screen can offer a TPA-approved
                    // amount input for insurance/TPA patients.
                    billing_patient_type: invoice.billing_patient_type,
                    tpa_payable: Number(invoice.tpa_payable || 0),
                    tpa_settled_amount: Number(invoice.tpa_settled_amount || 0),
                    tpa_provider_id: invoice.tpa_provider_id,
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
                    id: d.id,
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
            where: {
                ...(dateFilter.gte || dateFilter.lte ? { posted_at: dateFilter } : {}),
                // Two-ledger package billing: consumed charges are hospital cost
                // absorption, not revenue — revenue is the package (+ extras).
                disposition: { not: CHARGE_DISPOSITION.PACKAGE_CONSUMED },
            },
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

// Departmental activity absorbed under packages (the complement of revenue-by-
// category for package admissions) — sourced from the consumption ledger.
export async function getPackageConsumptionByCategory(fromDate?: Date, toDate?: Date) {
    try {
        const { db } = await requireTenantContext();

        const dateFilter: any = {};
        if (fromDate) dateFilter.gte = fromDate;
        if (toDate) dateFilter.lte = toDate;

        const postings = await db.ipdChargePosting.findMany({
            where: {
                disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED,
                ...(dateFilter.gte || dateFilter.lte ? { posted_at: dateFilter } : {}),
            },
        });

        const grouped: Record<string, { count: number; total: number }> = {};
        for (const p of postings) {
            const key = p.service_category || p.source_module || 'Other';
            if (!grouped[key]) grouped[key] = { count: 0, total: 0 };
            grouped[key].count++;
            grouped[key].total = roundMoney(grouped[key].total + Number(p.amount));
        }

        return {
            success: true,
            data: serialize(Object.entries(grouped).map(([category, g]) => ({
                category,
                count: g.count,
                total: g.total,
            }))),
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Package profitability: package price vs services consumed under it.
// The report that tells the hospital which packages are priced wrong.
export async function getPackageMarginReport(fromDate?: Date, toDate?: Date) {
    try {
        const { db } = await requireTenantContext();

        const dateFilter: any = {};
        if (fromDate) dateFilter.gte = fromDate;
        if (toDate) dateFilter.lte = toDate;

        const admPkgs = await db.ipdAdmissionPackage.findMany({
            where: dateFilter.gte || dateFilter.lte ? { created_at: dateFilter } : {},
            include: {
                package: { select: { package_name: true, package_code: true } },
                consumptions: true,
            },
            orderBy: { created_at: 'desc' },
            take: 500,
        });

        const rows = admPkgs.map((ap: any) => {
            const consumed = roundMoney(
                (ap.consumptions || [])
                    .filter((p: any) => p.disposition === CHARGE_DISPOSITION.PACKAGE_CONSUMED)
                    .reduce((s: number, p: any) => s + Number(p.amount), 0),
            );
            const extras = roundMoney(
                (ap.consumptions || [])
                    .filter((p: any) => p.disposition === CHARGE_DISPOSITION.BILLABLE_EXTRA)
                    .reduce((s: number, p: any) => s + Number(p.amount), 0),
            );
            const packageAmount = Number(ap.applied_amount);
            const margin = roundMoney(packageAmount - consumed);
            return {
                admission_id: ap.admission_id,
                package_name: ap.package?.package_name,
                package_code: ap.package?.package_code,
                status: ap.status,
                applied_at: ap.created_at,
                package_amount: packageAmount,
                consumed,
                extras_billed: extras,
                margin,
                margin_pct: packageAmount > 0 ? roundMoney((margin / packageAmount) * 100) : 0,
            };
        });

        const summary = {
            packages: rows.length,
            total_package_revenue: roundMoney(rows.reduce((s: number, r: any) => s + r.package_amount, 0)),
            total_consumed: roundMoney(rows.reduce((s: number, r: any) => s + r.consumed, 0)),
            total_margin: roundMoney(rows.reduce((s: number, r: any) => s + r.margin, 0)),
            loss_making: rows.filter((r: any) => r.margin < 0).length,
        };

        return { success: true, data: serialize({ summary, rows }) };
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
                status: { in: ['Draft', 'Final'] },
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
    tpa_approved_amount?: number;
    discount_amount?: number;
    discount_reason?: string;
    approved_by?: string;
    splits?: Array<{
        amount: number;
        payment_method: string;
        reference?: string;
    }>;
    discharge_date?: Date | string;
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: data.admission_id },
            include: { patient: true, ward: true, bed: { include: { wards: true } } },
        });
        if (!admission) return { success: false, error: 'Admission not found' };
        if (admission.status === 'Discharged') return { success: false, error: 'Patient already discharged' };

        // Auto room/nursing charges disabled — charges are added manually
        // const ward = admission.ward || admission.bed?.wards;
        // const daysAdmitted = Math.max(1, Math.ceil(
        //     (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
        // ));

        // Find the invoice
        let invoice = await db.invoices.findFirst({
            where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
        });
        if (!invoice) return { success: false, error: 'No active invoice found' };

        // 1.5 ── Package billing gate ────────────────────────────────────────
        // A package admission may never finalize with billed service lines that
        // should have been absorbed (that would inflate the patient/TPA claim).
        // If strays exist (legacy admissions, pre-router charges), reconcile
        // them now — deterministic, idempotent and audited. If the bill is
        // already locked and dirty, block instead of silently altering it.
        const activeAdmPkg = await getActiveAdmissionPackage(db, data.admission_id);
        if (activeAdmPkg) {
            const ensured = await db.$transaction(async (tx: any) => (
                ensurePackageInvoiceLineTx(tx, organizationId, session, data.admission_id, activeAdmPkg)
            ));
            if (!ensured.success) return ensured;
            invoice = await db.invoices.findFirst({
                where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
            });
            if (!invoice) return { success: false, error: 'No active invoice found after package bill repair' };

            const invItems = await db.invoice_items.findMany({ where: { invoice_id: invoice.id } });
            const extraItemIds = new Set(
                (await db.ipdChargePosting.findMany({
                    where: { admission_id: data.admission_id, disposition: CHARGE_DISPOSITION.BILLABLE_EXTRA },
                    select: { invoice_item_id: true },
                })).map((p: any) => p.invoice_item_id).filter(Boolean),
            );
            const strays = invItems.filter((i: any) => isPlainServiceItem(i) && !extraItemIds.has(i.id));
            const legacyAdjustments = invItems.filter(
                (i: any) => String(i.service_category || '') === LEGACY_PACKAGE_ADJUSTMENT_CATEGORY,
            );
            if (strays.length > 0 || legacyAdjustments.length > 0) {
                const reconciled = await reconcilePackageBillingInternal(db, organizationId, session, data.admission_id);
                if (!reconciled.success) {
                    return {
                        success: false,
                        error: `Package billing is not clean (${strays.length} billed service line(s) pending absorption) and could not be auto-reconciled: ${reconciled.error}`,
                    };
                }
                // Re-fetch — totals changed.
                invoice = await db.invoices.findFirst({
                    where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
                });
                if (!invoice) return { success: false, error: 'No active invoice found after package reconciliation' };
            }
        }

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

        // 3. Apply deposits if requested — this admission's deposits + patient-level deposits
        if (data.apply_deposits) {
            const deposits = await db.patientDeposit.findMany({
                where: {
                    status: 'Active',
                    OR: [
                        { admission_id: admission.admission_id },
                        { patient_id: admission.patient_id, admission_id: null },
                    ],
                },
                orderBy: { created_at: 'asc' },
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
                        // Keep the original deposit collection date on the receipt,
                        // not the date it was applied to the bill.
                        created_at: deposit.created_at,
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
                },
            });
        }

        // 3.5 TPA / insurance APPROVED amount = the insurer's sanctioned share.
        // This is NOT money received yet — it stays as an outstanding balance (a
        // receivable from the TPA) and is settled later when the payment actually
        // arrives (record a payment against the invoice then). So here we only
        // record the expected amount on the invoice; the patient pays just their
        // co-pay via the splits below, leaving the TPA share outstanding.
        const tpaApproved = Math.max(0, Number(data.tpa_approved_amount) || 0);
        if (tpaApproved > 0) {
            await db.invoices.update({
                where: { id: invoice.id },
                data: {
                    tpa_payable: tpaApproved,
                    tpa_claim_status: 'approved',
                    tpa_approved_amount: tpaApproved,
                    tpa_approved_at: new Date(),
                },
            });

            await db.system_audit_logs.create({
                data: {
                    action: 'tpa_claim_approved',
                    module: 'finance',
                    entity_type: 'invoice',
                    entity_id: String(invoice.id),
                    details: JSON.stringify({
                        invoice_id: invoice.id,
                        tpa_approved_amount: tpaApproved,
                        tpa_provider_id: invoice.tpa_provider_id,
                        by: session.username,
                    }),
                    organizationId,
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
                },
            });
        }

        // 5. Finalize invoice — set correct status based on actual payments
        const finalInvoice = await db.invoices.findUnique({ where: { id: invoice.id } });
        const finalPaid = Number(finalInvoice?.paid_amount || 0);
        const finalNet = Number(finalInvoice?.net_amount || 0);
        const finalBalance = Number(finalInvoice?.balance_due || 0);

        // Discharge always finalises the bill. Payment state lives in
        // paid_amount / balance_due, not status.
        // Rule 1/3: assign the bill number at finalization (once), continuing the
        // ongoing IPD series in invoice_number. Drafts are numberless.
        const billNumber = finalInvoice?.invoice_number
            || await genInvNum(organizationId, 'IPD', true, db);
        await db.invoices.update({
            where: { id: invoice.id },
            data: { status: 'Final', finalized_at: new Date(), invoice_number: billNumber },
        });

        // Close the package lifecycle with the bill — after this, the posting
        // router can never route anything to this package again.
        await db.ipdAdmissionPackage.updateMany({
            where: { admission_id: data.admission_id, status: ADMISSION_PACKAGE_STATUS.ACTIVE },
            data: { status: ADMISSION_PACKAGE_STATUS.CLOSED, closed_at: new Date() },
        });

        // Referral + doctor commission accrue on the collected IPD bill (best-effort)
        try {
            const { recomputeInvoiceCommission } = await import('@/app/lib/referral-commission');
            await recomputeInvoiceCommission(db, organizationId, invoice.id);
            const { recomputeInvoiceDoctorCommission } = await import('@/app/lib/doctor-commission');
            await recomputeInvoiceDoctorCommission(db, organizationId, invoice.id);
        } catch (e) {
            console.error('referral commission recompute failed (ipd):', e);
        }

        const dischargeDate = data.discharge_date ? new Date(data.discharge_date) : new Date();

        // 6. Discharge patient
        await db.admissions.update({
            where: { admission_id: data.admission_id },
            data: { status: 'Discharged', discharge_date: dischargeDate },
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
                    outstanding_balance: finalBalance,
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
                discharge_date: dischargeDate,
                remaining_balance: finalBalance,
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
