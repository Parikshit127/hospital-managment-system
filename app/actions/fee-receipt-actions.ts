"use server";

import type { Prisma } from "@prisma/client";
import { requireRoleAndTenant, requireTenantContext } from "@/backend/tenant";
import { revalidatePath } from "next/cache";
import { generateInvoiceNumber as genInvNum, generateReceiptNumber as genRcpNum } from '@/app/lib/sequence-generator';
import { formatDoctorName } from '@/app/lib/format-name';

function extractVoidReason(notes?: string | null) {
    if (!notes) return null;
    const match = notes.match(/VOID:\s*(.+)$/im);
    return match?.[1]?.trim() || null;
}

export async function searchPatientsForReceipt(query: string) {
    try {
        if (!query || query.length < 2) return { success: true, data: [] };
        const { db, organizationId } = await requireTenantContext();

        const patients = await db.oPD_REG.findMany({
            where: {
                organizationId,
                OR: [
                    { full_name: { contains: query, mode: "insensitive" } },
                    { phone: { contains: query, mode: "insensitive" } },
                    { patient_id: { contains: query, mode: "insensitive" } },
                ]
            },
            take: 10,
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
            }
        });

        return { success: true, data: patients };
    } catch (error) {
        console.error("Failed to search patients:", error);
        return { success: false, data: [] };
    }
}

export async function getAvailableServicesList() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const dbDoctors = await db.user.findMany({
            where: { role: "doctor", organizationId },
            select: { id: true, name: true, specialty: true, consultation_fee: true, follow_up_fee: true }
        });

        const dbCheckups = await db.lab_test_inventory.findMany({
            where: { organizationId },
            select: { id: true, test_name: true, price: true }
        });

        const dbMedicines = await db.pharmacy_medicine_master.findMany({
            where: { organizationId },
            select: { id: true, brand_name: true, price_per_unit: true }
        });

        const services: { label: string; price: number; type: string; doctor_id?: string; fee_type?: string }[] = [];

        dbDoctors.forEach((doc: any) => {
            if (doc.consultation_fee) {
                services.push({
                    label: `Consultation - ${formatDoctorName(doc.name)} (${doc.specialty || "Gen"})`,
                    price: Number(doc.consultation_fee),
                    type: "Doctors",
                    doctor_id: doc.id,
                    fee_type: "consultation",
                });
            }
            if (doc.follow_up_fee) {
                services.push({
                    label: `Follow-up - ${formatDoctorName(doc.name)} (${doc.specialty || "Gen"})`,
                    price: Number(doc.follow_up_fee),
                    type: "Doctors",
                    doctor_id: doc.id,
                    fee_type: "follow_up",
                });
            }
        });

        dbCheckups.forEach((chk: any) => {
            services.push({
                label: chk.test_name,
                price: Number(chk.price),
                type: "Checkups"
            });
        });

        dbMedicines.forEach((med: any) => {
            services.push({
                label: med.brand_name,
                price: Number(med.price_per_unit),
                type: "Pharmacy"
            });
        });

        return { success: true, data: services };

    } catch (error) {
        console.error("Failed to fetch available services:", error);
        return { success: false, data: [] };
    }
}

export interface FeeReceiptItemInput {
    description: string;
    amount: number;
    quantity: number;
    discount?: number;
}

export interface SaveFeeReceiptInput {
    patient_id: string;
    patient_name: string;
    patient_phone?: string;
    payment_method: string;
    items: FeeReceiptItemInput[];
    notes?: string;
    receipt_date?: string;
}

export async function saveFeeReceipt(payload: SaveFeeReceiptInput) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const name = (payload.patient_name || "").trim();
        if (!name) return { success: false, error: "Patient name is required." };

        const cleanItems = (payload.items || [])
            .map(i => ({
                description: (i.description || "").trim() || "Misc Fee",
                amount: Number(i.amount) || 0,
                quantity: Math.max(1, Number(i.quantity) || 1),
                discount: Math.max(0, Number(i.discount) || 0),
            }))
            .filter(i => i.amount > 0);

        if (cleanItems.length === 0) {
            return { success: false, error: "Add at least one line item with a non-zero amount." };
        }

        const grossAmount = cleanItems.reduce((s, i) => s + i.amount * i.quantity, 0);
        const totalDiscount = cleanItems.reduce((s, i) => s + (i.discount || 0), 0);
        const netAmount = Math.max(0, grossAmount - totalDiscount);

        let pid = payload.patient_id;
        if (!pid) {
            const phone = (payload.patient_phone || "").replace(/\D/g, "");
            const stubId = `WLK-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
            const walkin = await db.oPD_REG.create({
                data: {
                    patient_id: stubId,
                    full_name: name,
                    phone: phone || "0000000000",
                    organizationId,
                }
            });
            pid = walkin.patient_id;
        }

        const invoiceNo = await genInvNum(organizationId, 'OPD_FEE', false, db);
        const receiptNo = await genRcpNum(organizationId, db);
        const createdAt = payload.receipt_date ? new Date(payload.receipt_date) : undefined;

        // Load doctors, checkups, medicines to recognize categories and fill departments/doctor fields
        const [dbDoctors, dbCheckups, dbMedicines] = await Promise.all([
            db.user.findMany({
                where: { role: "doctor", organizationId },
                select: { id: true, name: true, specialty: true }
            }),
            db.lab_test_inventory.findMany({
                where: { organizationId },
                select: { test_name: true }
            }),
            db.pharmacy_medicine_master.findMany({
                where: { organizationId },
                select: { brand_name: true }
            })
        ]);

        let resolvedDoctorId: string | null = null;
        let resolvedDoctorName: string | null = null;

        const mappedItems = cleanItems.map(item => {
            let department = "General";
            let serviceCategory: string | null = null;

            const lowerDesc = item.description.toLowerCase();
            const doctorMatch = dbDoctors.find((doc: any) => {
                const formatted = formatDoctorName(doc.name).toLowerCase();
                const rawName = doc.name.toLowerCase();
                return lowerDesc.includes(formatted) || lowerDesc.includes(rawName);
            });

            if (doctorMatch) {
                resolvedDoctorId = doctorMatch.id;
                resolvedDoctorName = formatDoctorName(doctorMatch.name);
                department = doctorMatch.specialty || "General";
                serviceCategory = "consultation";
            } else if (dbCheckups.some((c: any) => c.test_name.toLowerCase() === lowerDesc)) {
                department = "Laboratory";
                serviceCategory = "lab";
            } else if (dbMedicines.some((m: any) => m.brand_name.toLowerCase() === lowerDesc)) {
                department = "Pharmacy";
                serviceCategory = "pharmacy";
            } else {
                // Fallbacks based on keywords in description
                if (lowerDesc.includes("consult") || lowerDesc.includes("opd consult") || lowerDesc.includes("follow-up")) {
                    serviceCategory = "consultation";
                } else if (lowerDesc.includes("test") || lowerDesc.includes("lab") || lowerDesc.includes("pathology") || lowerDesc.includes("blood")) {
                    department = "Laboratory";
                    serviceCategory = "lab";
                } else if (lowerDesc.includes("medicine") || lowerDesc.includes("pharmacy") || lowerDesc.includes("syrup") || lowerDesc.includes("tablet")) {
                    department = "Pharmacy";
                    serviceCategory = "pharmacy";
                }
            }

            return {
                department,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.amount,
                total_price: item.amount * item.quantity,
                discount: item.discount || 0,
                net_price: item.amount * item.quantity - (item.discount || 0),
                service_category: serviceCategory,
                organizationId
            };
        });

        const invoice = await db.invoices.create({
            data: {
                invoice_number: invoiceNo,
                patient_id: pid,
                invoice_type: "OPD_FEE",
                total_amount: grossAmount,
                total_discount: totalDiscount,
                net_amount: netAmount,
                paid_amount: netAmount,
                balance_due: 0,
                status: "Paid",
                notes: payload.notes?.trim() || null,
                organizationId,
                doctor_id: resolvedDoctorId || null,
                doctor_name: resolvedDoctorName || null,
                ...(createdAt ? { created_at: createdAt } : {}),
                items: {
                    create: mappedItems
                },
                payments: {
                    create: {
                        receipt_number: receiptNo,
                        amount: netAmount,
                        payment_method: payload.payment_method,
                        payment_type: "Full",
                        status: "Completed",
                        notes: payload.notes?.trim() || null,
                        organizationId,
                        ...(createdAt ? { created_at: createdAt } : {}),
                    }
                }
            }
        });

        revalidatePath("/billing/fee-receipt");
        revalidatePath("/reception/history");
        return {
            success: true,
            invoice_id: invoice.id,
            invoice_number: invoiceNo,
            receipt_number: receiptNo,
            patient_id: pid,
        };
    } catch (error: any) {
        console.error("Failed to save receipt:", error);
        return { success: false, error: error?.message || "Failed to generate receipt records." };
    }
}

export interface ListFeeReceiptsFilter {
    search?: string;
    from?: string;
    to?: string;
    payment_method?: string;
    status?: string;
    page?: number;
    limit?: number;
}

export async function listFeeReceipts(filter: ListFeeReceiptsFilter = {}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const page = Math.max(1, filter.page || 1);
        const limit = Math.min(100, Math.max(5, filter.limit || 25));

        const where: any = {
            organizationId,
            invoice_type: "OPD_FEE",
            is_archived: false,
        };

        if (filter.status) where.status = filter.status;

        if (filter.from || filter.to) {
            where.created_at = {};
            if (filter.from) where.created_at.gte = new Date(filter.from);
            if (filter.to) {
                const end = new Date(filter.to);
                end.setHours(23, 59, 59, 999);
                where.created_at.lte = end;
            }
        }

        if (filter.search?.trim()) {
            const q = filter.search.trim();
            where.OR = [
                { invoice_number: { contains: q, mode: "insensitive" } },
                { patient_id: { contains: q, mode: "insensitive" } },
                { payments: { some: { receipt_number: { contains: q, mode: "insensitive" } } } },
            ];
        }

        const [total, rows] = await Promise.all([
            db.invoices.count({ where }),
            db.invoices.findMany({
                where,
                orderBy: { created_at: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    invoice_number: true,
                    patient_id: true,
                    total_amount: true,
                    total_discount: true,
                    net_amount: true,
                    paid_amount: true,
                    status: true,
                    notes: true,
                    created_at: true,
                    payments: {
                        select: {
                            receipt_number: true,
                            payment_method: true,
                            amount: true,
                            status: true,
                        },
                        orderBy: { created_at: "asc" },
                        take: 1,
                    },
                }
            })
        ]);

        const patientIds = Array.from(new Set(rows.map((r: any) => r.patient_id)));
        const patients: { patient_id: string; full_name: string; phone: string | null }[] = patientIds.length
            ? await db.oPD_REG.findMany({
                where: { patient_id: { in: patientIds }, organizationId },
                select: { patient_id: true, full_name: true, phone: true }
            })
            : [];
        const pMap = new Map(patients.map((p) => [p.patient_id, p]));

        const filtered = rows
            .map((r: any) => {
                const p = pMap.get(r.patient_id);
                const pay = r.payments[0];
                return {
                    invoice_id: r.id,
                    invoice_number: r.invoice_number,
                    receipt_number: pay?.receipt_number || null,
                    void_reason: extractVoidReason(r.notes),
                    patient_id: r.patient_id,
                    patient_name: p?.full_name || "(Unknown)",
                    patient_phone: p?.phone || "",
                    total_amount: Number(r.total_amount),
                    total_discount: Number(r.total_discount),
                    net_amount: Number(r.net_amount),
                    paid_amount: Number(r.paid_amount),
                    payment_method: pay?.payment_method || "—",
                    status: r.status,
                    notes: r.notes,
                    created_at: r.created_at.toISOString(),
                };
            })
            .filter((r: any) => {
                if (filter.payment_method && r.payment_method !== filter.payment_method) return false;
                if (filter.search?.trim()) {
                    const q = filter.search.trim().toLowerCase();
                    return (
                        r.invoice_number.toLowerCase().includes(q) ||
                        r.patient_id.toLowerCase().includes(q) ||
                        r.patient_name.toLowerCase().includes(q) ||
                        r.patient_phone.toLowerCase().includes(q) ||
                        (r.receipt_number || "").toLowerCase().includes(q)
                    );
                }
                return true;
            });

        return {
            success: true,
            data: filtered,
            meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    } catch (error) {
        console.error("Failed to list fee receipts:", error);
        return { success: false, data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 1 } };
    }
}

export async function getFeeReceiptDetail(invoiceId: number) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const inv = await db.invoices.findFirst({
            where: { id: invoiceId, organizationId, invoice_type: "OPD_FEE" },
            include: {
                items: true,
                payments: { orderBy: { created_at: "asc" } },
            }
        });
        if (!inv) return { success: false, error: "Receipt not found." };

        const patient = await db.oPD_REG.findFirst({
            where: { patient_id: inv.patient_id, organizationId },
            select: { patient_id: true, full_name: true, phone: true, age: true, gender: true }
        });

        const pay = inv.payments[0];
        return {
            success: true,
            data: {
                invoice_id: inv.id,
                invoice_number: inv.invoice_number,
                receipt_number: pay?.receipt_number || null,
                void_reason: extractVoidReason(inv.notes),
                patient_id: inv.patient_id,
                patient_name: patient?.full_name || "(Unknown)",
                patient_phone: patient?.phone || "",
                patient_age: patient?.age || null,
                patient_gender: patient?.gender || null,
                total_amount: Number(inv.total_amount),
                total_discount: Number(inv.total_discount),
                net_amount: Number(inv.net_amount),
                paid_amount: Number(inv.paid_amount),
                status: inv.status,
                notes: inv.notes,
                created_at: inv.created_at.toISOString(),
                payment_method: pay?.payment_method || "—",
                items: inv.items.map((it: any) => ({
                    description: it.description,
                    quantity: it.quantity,
                    unit_price: Number(it.unit_price),
                    discount: Number(it.discount),
                    net_price: Number(it.net_price),
                })),
            }
        };
    } catch (error: any) {
        console.error("Failed to fetch receipt:", error);
        return { success: false, error: error?.message || "Failed to fetch receipt." };
    }
}

export async function voidFeeReceipt(invoiceId: number, reason: string) {
    try {
        const trimmed = (reason || "").trim();
        if (!trimmed) return { success: false, error: "Reason is required before deleting a receipt." };

        const { db, organizationId } = await requireRoleAndTenant(['admin', 'finance']);
        const inv = await db.invoices.findFirst({
            where: { id: invoiceId, organizationId, invoice_type: "OPD_FEE" }
        });
        if (!inv) return { success: false, error: "Receipt not found." };
        if (inv.status === "Voided" || inv.status === "Cancelled") {
            return { success: false, error: "Receipt already voided." };
        }

        await db.$transaction([
            db.invoices.update({
                where: { id: inv.id },
                data: {
                    status: "Voided",
                    notes: [inv.notes?.trim(), `VOID: ${trimmed}`].filter(Boolean).join("\n"),
                }
            }),
            db.payments.updateMany({
                where: { invoice_id: inv.id },
                data: { status: "Cancelled" }
            })
        ]);

        revalidatePath("/billing/fee-receipt");
        return { success: true };
    } catch (error: any) {
        console.error("Failed to void receipt:", error);
        return { success: false, error: error?.message || "Failed to void receipt." };
    }
}

export interface UpdateFeeReceiptInput {
    patient_id: string;
    patient_name: string;
    patient_phone?: string;
    payment_method: string;
    items: FeeReceiptItemInput[];
    notes?: string;
    receipt_date?: string;
}

export async function updateFeeReceipt(invoiceId: number, payload: UpdateFeeReceiptInput) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(['admin', 'finance']);

        const existing = await db.invoices.findFirst({
            where: { id: invoiceId, organizationId, invoice_type: 'OPD_FEE' },
            include: {
                payments: { orderBy: { created_at: 'asc' } },
                items: true,
            },
        });
        if (!existing) return { success: false, error: 'Receipt not found.' };
        if (existing.status === 'Voided' || existing.status === 'Cancelled') {
            return { success: false, error: 'Voided receipts cannot be edited.' };
        }

        const name = (payload.patient_name || '').trim();
        if (!name) return { success: false, error: 'Patient name is required.' };

        const cleanItems = (payload.items || [])
            .map(i => ({
                description: (i.description || '').trim() || 'Misc Fee',
                amount: Number(i.amount) || 0,
                quantity: Math.max(1, Number(i.quantity) || 1),
                discount: Math.max(0, Number(i.discount) || 0),
            }))
            .filter(i => i.amount > 0);

        if (cleanItems.length === 0) {
            return { success: false, error: 'Add at least one line item with a non-zero amount.' };
        }

        const grossAmount = cleanItems.reduce((s, i) => s + i.amount * i.quantity, 0);
        const totalDiscount = cleanItems.reduce((s, i) => s + (i.discount || 0), 0);
        const netAmount = Math.max(0, grossAmount - totalDiscount);
        const createdAt = payload.receipt_date ? new Date(payload.receipt_date) : undefined;

        await db.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.oPD_REG.updateMany({
                where: { patient_id: existing.patient_id, organizationId },
                data: {
                    full_name: name,
                    phone: (payload.patient_phone || '').trim() || null,
                },
            });

            await tx.invoice_items.deleteMany({ where: { invoice_id: existing.id } });
            await tx.invoice_items.createMany({
                data: cleanItems.map((item) => ({
                    invoice_id: existing.id,
                    department: 'General',
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.amount,
                    total_price: item.amount * item.quantity,
                    discount: item.discount || 0,
                    net_price: item.amount * item.quantity - (item.discount || 0),
                    service_category: null,
                    organizationId,
                })),
            });

            await tx.invoices.update({
                where: { id: existing.id },
                data: {
                    total_amount: grossAmount,
                    total_discount: totalDiscount,
                    net_amount: netAmount,
                    paid_amount: netAmount,
                    balance_due: 0,
                    notes: payload.notes?.trim() || null,
                    ...(createdAt ? { created_at: createdAt } : {}),
                },
            });

            const primaryPayment = existing.payments[0];
            if (primaryPayment) {
                await tx.payments.update({
                    where: { id: primaryPayment.id },
                    data: {
                        amount: netAmount,
                        payment_method: payload.payment_method,
                        notes: payload.notes?.trim() || null,
                        ...(createdAt ? { created_at: createdAt } : {}),
                    },
                });
                if (existing.payments.length > 1) {
                    await tx.payments.deleteMany({
                        where: {
                            invoice_id: existing.id,
                            id: { not: primaryPayment.id },
                        },
                    });
                }
            } else {
                await tx.payments.create({
                    data: {
                        receipt_number: await genRcpNum(organizationId, tx),
                        invoice_id: existing.id,
                        amount: netAmount,
                        payment_method: payload.payment_method,
                        payment_type: 'Full',
                        status: 'Completed',
                        notes: payload.notes?.trim() || null,
                        organizationId,
                        ...(createdAt ? { created_at: createdAt } : {}),
                    },
                });
            }
        });

        revalidatePath('/billing/fee-receipt');
        revalidatePath('/reception/history');
        return { success: true };
    } catch (error: any) {
        console.error('Failed to update receipt:', error);
        return { success: false, error: error?.message || 'Failed to update receipt.' };
    }
}
