"use server";

import { getTenantPrisma, prisma } from "@/backend/db";
import { getPatientSession } from "../login/actions";
import { revalidatePath } from "next/cache";
import { getOrCreateDailySlots } from "@/app/actions/doctor-actions";

export async function getAvailableDoctors() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };

        const db = getTenantPrisma(session.organization_id);

        const doctors = await db.user.findMany({
            where: { role: 'doctor', is_active: true },
            select: { id: true, name: true, specialty: true },
        });

        if (doctors.length === 0) return { success: true, data: [] };

        // Fetch fees via raw query to bypass stale Prisma client issues
        let doctorFeesMap: Record<string, number> = {};
        try {
            // Fetch all doctor fees - simpler and avoids IN clause issues with stale clients/Postgres
            const rawData: any[] = await prisma.$queryRaw`SELECT id, consultation_fee FROM users WHERE role = 'doctor'`;
            rawData.forEach(row => {
                doctorFeesMap[row.id] = Number(row.consultation_fee) || 0;
            });
        } catch (err) {
            console.error('Raw fees fetch error in list:', err);
        }

        return {
            success: true,
            data: doctors.map((d: any) => ({
                id: d.id,
                name: d.name,
                specialty: d.specialty || "General",
                fee: doctorFeesMap[d.id] ?? 0
            })),
        };
    } catch (error) {
        console.error("Get doctors error:", error);
        return { success: false, data: [] };
    }
}

export async function getAvailableSlots(doctorId: string, dateStr: string) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };

        // Use the centralized auto-slot generator (same as doctor panel & reception)
        const result = await getOrCreateDailySlots(doctorId, dateStr, {
            organizationId: session.organization_id,
        });
        if (!result.success) return { success: false, data: [] };

        return {
            success: true,
            data: (result.data as any[]).map((s: any) => ({
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                is_available: s.is_available && !s.is_booked,
            })),
        };
    } catch (error) {
        console.error("Get slots error:", error);
        return { success: false, data: [] };
    }
}

export async function bookAppointment(
    slotId: string,
    doctorId: string,
    dateStr: string,
    reason: string,
) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: "Not authenticated" };

        const db = getTenantPrisma(session.organization_id);

        // Get the doctor info
        const doctor = await db.user.findUnique({ where: { id: doctorId } });
        if (!doctor) return { success: false, error: "Doctor not found" };

        // Fallback: If consultation_fee is missing from the client model but exists in DB (stale Prisma client)
        let doctorFee = (doctor as any).consultation_fee;
        if (doctorFee === undefined) {
            try {
                const rawDr: any[] = await prisma.$queryRaw`SELECT consultation_fee FROM users WHERE id = ${doctorId}`;
                if (rawDr?.[0]) {
                    doctorFee = rawDr[0].consultation_fee;
                }
            } catch (err) {
                console.error('Raw fee fetch error:', err);
            }
        }
        doctorFee = Number(doctorFee) || 0;

        const appointmentDate = new Date(dateStr);

        // If it's a real slot, fetch its start_time and set the correct appointment time
        if (!slotId.startsWith("default-")) {
            const slot = await db.appointmentSlot.findUnique({
                where: { id: slotId },
            });
            if (slot?.start_time) {
                const [h, m] = slot.start_time.split(":").map(Number);
                appointmentDate.setHours(h, m, 0, 0);
            }
            await db.appointmentSlot.update({
                where: { id: slotId },
                data: { is_booked: true, booked_by: session.id },
            });
        }

        // Create the appointment
        const apptId = `APT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        await db.$transaction(async (tx: any) => {
            // Create the appointment
            await tx.appointments.create({
                data: {
                    appointment_id: apptId,
                    patient_id: session.id,
                    doctor_id: doctorId,
                    doctor_name: doctor.name,
                    department: doctor.specialty || 'General',
                    appointment_date: appointmentDate,
                    status: 'Scheduled',
                    reason_for_visit: reason || undefined,
                },
            });

            // If doctor has a fee, create Invoice & Payment
            const fee = doctorFee;
            if (fee > 0) {
                const invNum = `INV-${Date.now().toString().slice(-6)}`;
                const recNum = `REC-${Date.now().toString().slice(-6)}`;

                await tx.invoices.create({
                    data: {
                        invoice_number: invNum,
                        patient_id: session.id,
                        invoice_type: 'OPD',
                        total_amount: fee,
                        net_amount: fee,
                        paid_amount: fee,
                        balance_due: 0,
                        status: 'Paid',
                        organizationId: session.organization_id,
                        items: {
                            create: [{
                                department: doctor.specialty || 'OPD',
                                description: `Consultation Fee - Dr. ${doctor.name}`,
                                quantity: 1,
                                unit_price: fee,
                                total_price: fee,
                                net_price: fee,
                                organizationId: session.organization_id
                            }]
                        },
                        payments: {
                            create: [{
                                receipt_number: recNum,
                                amount: fee,
                                payment_method: 'Online',
                                payment_type: 'Consultation',
                                status: 'Completed',
                                organizationId: session.organization_id
                            }]
                        }
                    }
                });
            }
        });

        revalidatePath("/patient/appointments");
        revalidatePath("/patient/dashboard");

        return { success: true, data: { appointmentId: apptId } };
    } catch (error) {
        console.error("Book appointment error:", error);
        return { success: false, error: "Booking failed" };
    }
}

export async function getMyAppointments() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };

        const db = getTenantPrisma(session.organization_id);

        const appointments = await db.appointments.findMany({
            where: { patient_id: session.id },
            orderBy: { appointment_date: "desc" },
        });

        return { success: true, data: appointments };
    } catch (error) {
        console.error("Get appointments error:", error);
        return { success: false, data: [] };
    }
}

export async function cancelMyAppointment(
    appointmentId: string,
    reason: string,
) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: "Not authenticated" };
        const db = getTenantPrisma(session.organization_id);

        const appointment = await db.appointments.findFirst({
            where: { appointment_id: appointmentId, patient_id: session.id },
        });
        if (!appointment) return { success: false, error: "Appointment not found" };

        await db.appointments.update({
            where: { id: appointment.id },
            data: { status: "Cancelled", cancellation_reason: reason },
        });

        revalidatePath("/patient/appointments");
        return { success: true };
    } catch (error) {
        console.error("Cancel error:", error);
        return { success: false, error: "Failed to cancel" };
    }
}

export async function getDepartmentsForBooking() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };
        const db = getTenantPrisma(session.organization_id);

        const doctors = await db.user.findMany({
            where: { role: "doctor", is_active: true },
            select: { specialty: true },
            distinct: ["specialty"],
        });

        return {
            success: true,
            data: doctors.map((d: any) => d.specialty).filter(Boolean),
        };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function updatePatientProfile(data: {
    phone: string;
    email: string;
    address: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
}) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: "Not authenticated" };

        const db = getTenantPrisma(session.organization_id);

        await db.OPD_REG.update({
            where: { patient_id: session.id },
            data: {
                phone: data.phone || null,
                email: data.email || null,
                address: data.address || null,
                emergency_contact_name: data.emergency_contact_name || null,
                emergency_contact_phone: data.emergency_contact_phone || null,
            },
        });

        revalidatePath("/patient/profile");
        revalidatePath("/patient/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Update profile error:", error);
        return { success: false, error: "Failed to update profile" };
    }
}

export async function changePatientPassword(
    currentPassword: string,
    newPassword: string,
) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: "Not authenticated" };

        const db = getTenantPrisma(session.organization_id);
        const bcrypt = await import("bcryptjs");

        const patient = await db.OPD_REG.findUnique({
            where: { patient_id: session.id },
            select: { password: true },
        });

        if (!patient || !patient.password) {
            return {
                success: false,
                error: "Account not configured for password login",
            };
        }

        const isValid = await bcrypt.compare(currentPassword, patient.password);
        if (!isValid) {
            return { success: false, error: "Current password is incorrect" };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.OPD_REG.update({
            where: { patient_id: session.id },
            data: { password: hashedPassword },
        });

        return { success: true };
    } catch (error) {
        console.error("Change password error:", error);
        return { success: false, error: "Failed to change password" };
    }
}
