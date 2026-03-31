"use server";

import { requireTenantContext } from "@/backend/tenant";
import { revalidatePath } from "next/cache";

export async function getFinanceConfig() {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Fetch doctors
        const dbDoctors = await db.user.findMany({
            where: { role: "doctor", organizationId },
            select: { id: true, name: true, specialty: true, consultation_fee: true }
        });

        // Fetch lab tests (checkups)
        const dbCheckups = await db.lab_test_inventory.findMany({
            where: { organizationId },
            select: { id: true, test_name: true, price: true, category: true }
        });

        // Fetch medicines
        const dbMedicines = await db.pharmacy_medicine_master.findMany({
            where: { organizationId },
            select: { id: true, brand_name: true, generic_name: true, price_per_unit: true }
        });

        return {
            success: true,
            data: {
                doctors: dbDoctors.map((d: any) => ({
                    id: d.id, // String UUID
                    name: d.name || "",
                    dept: d.specialty || "",
                    first: d.consultation_fee?.toString() || "0",
                    follow: (Math.round((d.consultation_fee || 0) * 0.75)).toString(), // default
                    emer: (Math.round((d.consultation_fee || 0) * 1.5)).toString() // default
                })),
                checkups: dbCheckups.map((c: any) => ({
                    id: c.id, // Int ID
                    name: c.test_name || "",
                    code: c.category || "",
                    price: c.price?.toString() || "0"
                })),
                medicines: dbMedicines.map((m: any) => ({
                    id: m.id, // Int ID
                    name: m.brand_name || "",
                    comp: m.generic_name || "",
                    price: m.price_per_unit?.toString() || "0"
                }))
            }
        };
    } catch (error) {
        console.error("Failed to fetch finance config:", error);
        return { success: false, data: { doctors: [], checkups: [], medicines: [] } };
    }
}

export async function saveFinanceConfig(payload: {
    doctors: any[];
    checkups: any[];
    medicines: any[];
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Save Doctors
        for (const doc of payload.doctors) {
            if (typeof doc.id === "string") {
                await db.user.update({
                    where: { id: doc.id },
                    data: { consultation_fee: Number(doc.first) || 0 }
                });
            }
        }

        // Save Checkups
        for (const chk of payload.checkups) {
            if (typeof chk.id === "number") {
                // Existing
                await db.lab_test_inventory.update({
                    where: { id: chk.id },
                    data: {
                        test_name: chk.name,
                        price: Number(chk.price) || 0,
                        category: chk.code
                    }
                });
            } else {
                // New
                await db.lab_test_inventory.create({
                    data: {
                        test_name: chk.name,
                        price: Number(chk.price) || 0,
                        category: chk.code,
                        organizationId
                    }
                });
            }
        }

        // Save Medicines
        for (const med of payload.medicines) {
            if (typeof med.id === "number") {
                // Existing
                await db.pharmacy_medicine_master.update({
                    where: { id: med.id },
                    data: {
                        brand_name: med.name,
                        generic_name: med.comp,
                        price_per_unit: Number(med.price) || 0
                    }
                });
            } else {
                // New
                await db.pharmacy_medicine_master.create({
                    data: {
                        brand_name: med.name,
                        generic_name: med.comp,
                        price_per_unit: Number(med.price) || 0,
                        min_threshold: 10,
                        organizationId
                    }
                });
            }
        }

        revalidatePath("/reception/finance");
        return { success: true };
    } catch (error) {
        console.error("Failed to save finance config:", error);
        return { success: false, error: "Failed to save data" };
    }
}
