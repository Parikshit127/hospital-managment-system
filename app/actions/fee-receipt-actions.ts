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

        // 1. Doctors (Consultation + Follow-up)
        const dbDoctors = await db.user.findMany({
            where: { role: "doctor", organizationId },
            select: { id: true, name: true, specialty: true, consultation_fee: true, follow_up_fee: true }
        });

        // 2. Checkups
        const dbCheckups = await db.lab_test_inventory.findMany({
            where: { organizationId },
            select: { id: true, test_name: true, price: true }
        });

        // 3. Medicines
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

export async function saveFeeReceipt(payload: {
    patient_id: string;
    patient_name: string;
    payment_method: string;
    total_amount: number;
    items: { description: string; amount: number; quantity: number }[];
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // If no patient_id was selected (manual entry), Create a stub patient or get Generic
        let pid = payload.patient_id;
        if (!pid) {
            // Find or create 'Walk-in' patient
            let walkin = await db.oPD_REG.findFirst({ where: { phone: "0000000000", organizationId } });
            if (!walkin) {
                const count = await db.oPD_REG.count();
                const uniqueId = "WLK-" + Date.now().toString().slice(-6);
                walkin = await db.oPD_REG.create({
                    data: {
                        patient_id: uniqueId,
                        full_name: payload.patient_name || "Walk-in Patient",
                        phone: "0000000000",
                        organizationId
                    }
                });
            }
            pid = walkin.patient_id;
        }

        const invoiceNo = `INV-${Date.now().toString().slice(-8)}`;
        const receiptNo = `REC-${Date.now().toString().slice(-8)}`;

        const invoice = await db.invoices.create({
            data: {
                invoice_number: invoiceNo,
                patient_id: pid,
                invoice_type: "OPD_FEE",
                total_amount: payload.total_amount,
                net_amount: payload.total_amount,
                paid_amount: payload.total_amount,
                balance_due: 0,
                status: "Completed",
                organizationId,
                items: {
                    create: payload.items.map(item => ({
                        department: "General",
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.amount,
                        total_price: item.amount * item.quantity,
                        net_price: item.amount * item.quantity,
                        organizationId
                    }))
                },
                payments: {
                    create: {
                        receipt_number: receiptNo,
                        amount: payload.total_amount,
                        payment_method: payload.payment_method,
                        payment_type: "Full",
                        status: "Completed",
                        organizationId
                    }
                }
            }
        });

        revalidatePath("/reception/history");
        return { success: true, invoice_number: invoiceNo, receipt_number: receiptNo };
    } catch (error) {
        console.error("Failed to save receipt:", error);
        return { success: false, error: "Failed to generate receipt records." };
    }
}
