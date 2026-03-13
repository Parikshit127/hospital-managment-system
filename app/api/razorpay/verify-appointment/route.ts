import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import razorpay from "@/app/lib/razorpay";
import { getPatientSession } from "@/app/patient/login/actions";
import { getTenantPrisma } from "@/backend/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getPatientSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      slotId,
      doctorId,
      date,
      reason,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: "Invalid payment details" },
        { status: 400 },
      );
    }

    // Verify Razorpay signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(sign)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { success: false, error: "Payment verification failed" },
        { status: 400 },
      );
    }

    const db = getTenantPrisma(session.organization_id);

    try {
      // Validate order belongs to this patient and selected doctor.
      const order = await razorpay.orders.fetch(razorpay_order_id);
      const notes: any = (order as any)?.notes || {};
      if (
        String(notes.patient_id || "") !== String(session.id) ||
        String(notes.doctor_id || "") !== String(doctorId) ||
        String(notes.organization_id || "") !== String(session.organization_id)
      ) {
        return NextResponse.json(
          { success: false, error: "Order validation failed" },
          { status: 400 },
        );
      }

      // Get doctor info
      const doctor = await db.user.findUnique({
        where: { id: doctorId },
        select: { id: true, name: true, specialty: true },
      });

      if (!doctor) {
        throw new Error("Doctor not found");
      }

      // Set appointment date with proper time
      const appointmentDate = new Date(date);

      // If slot was selected, try to get its time
      if (slotId && !slotId.startsWith("default-")) {
        try {
          const slot = await db.appointmentSlot.findUnique({
            where: { id: slotId },
          });
          if (slot?.start_time) {
            const [h, m] = slot.start_time.split(":").map(Number);
            appointmentDate.setHours(h, m, 0, 0);
          }
        } catch (e) {
          // Slot lookup failed, use default time
          console.error("Slot lookup error:", e);
        }
      }

      // Create the appointment
      const apptId = `APT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const appointment = await db.appointments.create({
        data: {
          appointment_id: apptId,
          patient_id: session.id,
          doctor_id: doctorId,
          doctor_name: doctor.name,
          department: doctor.specialty || "General",
          appointment_date: appointmentDate,
          status: "Scheduled",
          reason_for_visit: reason || undefined,
          organizationId: session.organization_id,
        },
      });

      // Mark slot as booked if applicable
      if (slotId && !slotId.startsWith("default-")) {
        try {
          await db.appointmentSlot.update({
            where: { id: slotId },
            data: { is_booked: true, booked_by: session.id },
          });
        } catch (e) {
          console.error("Slot update error:", e);
        }
      }

      return NextResponse.json({
        success: true,
        appointmentId: apptId,
        message: "Appointment booked successfully!",
      });
    } catch (dbError: any) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        { success: false, error: "Failed to create appointment" },
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error("Appointment verification error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Verification failed" },
      { status: 500 },
    );
  }
}
