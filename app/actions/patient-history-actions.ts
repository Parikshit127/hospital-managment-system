"use server";

import { requireTenantContext } from "@/backend/tenant";

export async function getRecentPatientHistory(searchQuery?: string, dateFrom?: string, dateTo?: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const dateFilter = dateFrom || dateTo ? {
            created_at: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
            }
        } : {};

        // Use Prisma's relation to fetch Invoices, their Line Items, and their Patient directly
        const invoices = await db.invoices.findMany({
            where: {
                organizationId,
                invoice_type: "OPD_FEE",
                ...dateFilter,
                // If search query is provided, search inside the related `patient` table
                ...(searchQuery && searchQuery.trim().length > 0 ? {
                    patient: {
                        OR: [
                            { full_name: { contains: searchQuery, mode: "insensitive" } },
                            { phone: { contains: searchQuery, mode: "insensitive" } },
                            { patient_id: { contains: searchQuery, mode: "insensitive" } }
                        ]
                    }
                } : {})
            },
            orderBy: { created_at: 'desc' },
            take: 50,
            include: {
                items: true,
                patient: true // Automatically gets the OPD_REG patient! No complex arrays needed.
            }
        });

        if (!invoices || invoices.length === 0) {
            return { success: true, data: [] };
        }

        // Format the results safely ensuring Prisma Decimals are mapped to standard Numbers
        const historyData = invoices.map((inv: any) => {
            return {
                id: inv.id,
                date: (inv.created_at || new Date()).toISOString(),
                invoice_number: inv.invoice_number,
                patient: {
                    id: inv.patient_id,
                    name: inv.patient?.full_name || "Unknown Patient",
                    phone: inv.patient?.phone || "No Phone"
                },
                total_amount: Number(inv.total_amount) || 0,
                status: inv.status || "Unknown",
                services: inv.items ? inv.items.map((it: any) => it.description) : []
            };
        });

        return { success: true, data: historyData };

    } catch (error) {
        console.error("Failed to fetch simple patient history:", error);
        return { success: false, data: [] };
    }
}
