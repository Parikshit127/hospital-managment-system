"use server";

import { requireTenantContext } from "@/backend/tenant";
import { revalidatePath } from "next/cache";

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
                    label: `Consultation - Dr. ${doc.name} (${doc.specialty || "Gen"})`,
                    price: Number(doc.consultation_fee),
                    type: "Doctors",
                    doctor_id: doc.id,
                    fee_type: "consultation",
                });
            }
            if (doc.follow_up_fee) {
                services.push({
                    label: `Follow-up - Dr. ${doc.name} (${doc.specialty || "Gen"})`,
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

        const invoiceNo = `INV-${Date.now().toString().slice(-8)}`;
        const receiptNo = `REC-${Date.now().toString().slice(-8)}`;
        const createdAt = payload.receipt_date ? new Date(payload.receipt_date) : undefined;

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
                ...(createdAt ? { created_at: createdAt } : {}),
                items: {
                    create: cleanItems.map(item => ({
                        department: "General",
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.amount,
                        total_price: item.amount * item.quantity,
                        discount: item.discount || 0,
                        net_price: item.amount * item.quantity - (item.discount || 0),
                        organizationId
                    }))
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
        const { db, organizationId } = await requireTenantContext();
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
                    notes: (inv.notes ? inv.notes + "\n" : "") + `VOID: ${reason || "no reason given"}`,
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
