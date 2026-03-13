import { NextRequest, NextResponse } from "next/server";
import razorpay from "@/app/lib/razorpay";
import { getPatientSession } from "@/app/patient/login/actions";
import { getTenantPrisma } from "@/backend/db";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = Number(value as any);
  return Number.isFinite(num) ? num : 0;
}

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
    const { doctorId, appointmentDate } = body;

    if (!doctorId || !appointmentDate) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const db = getTenantPrisma(session.organization_id);

    // Check if doctor exists
    const doctor = await db.user.findUnique({
      where: { id: doctorId },
      select: { id: true, name: true, specialty: true },
    });
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: "Doctor not found" },
        { status: 404 },
      );
    }

    const specialty = doctor.specialty || "General";

    // Prefer backend-configured consultation amount from charge catalog.
    const deptConsultationItem = await db.charge_catalog.findFirst({
      where: {
        is_active: true,
        department: { equals: specialty, mode: "insensitive" },
        OR: [
          { category: { contains: "consult", mode: "insensitive" } },
          { category: { contains: "opd", mode: "insensitive" } },
          { item_name: { contains: "consult", mode: "insensitive" } },
          { item_name: { contains: "opd", mode: "insensitive" } },
          { item_code: { contains: "consult", mode: "insensitive" } },
          { item_code: { contains: "opd", mode: "insensitive" } },
        ],
      },
      orderBy: { id: "asc" },
    });

    const genericConsultationItem = deptConsultationItem
      ? null
      : await db.charge_catalog.findFirst({
          where: {
            is_active: true,
            OR: [
              { category: { contains: "consult", mode: "insensitive" } },
              { category: { contains: "opd", mode: "insensitive" } },
              { item_name: { contains: "consult", mode: "insensitive" } },
              { item_name: { contains: "opd", mode: "insensitive" } },
              { item_code: { contains: "consult", mode: "insensitive" } },
              { item_code: { contains: "opd", mode: "insensitive" } },
            ],
          },
          orderBy: { id: "asc" },
        });

    const consultationFee =
      toNumber(deptConsultationItem?.default_price) ||
      toNumber(genericConsultationItem?.default_price) ||
      500;

    // Calculate GST (18%)
    const gst = Math.round(consultationFee * 0.18);
    const totalAmount = consultationFee + gst;

    // Razorpay expects amount in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(totalAmount * 100);

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `apt_${session.id}_${Date.now()}`,
      notes: {
        patient_id: session.id,
        doctor_id: doctorId,
        doctor_name: doctor.name,
        appointment_date: appointmentDate,
        organization_id: session.organization_id,
        consultation_fee: String(consultationFee),
        gst: String(gst),
      },
    });

    return NextResponse.json({
      success: true,
      order_id: order.id,
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      consultation_fee: consultationFee,
      gst,
      total_amount: totalAmount,
      specialty,
    });
  } catch (error: any) {
    console.error("Appointment order creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create payment order",
      },
      { status: 500 },
    );
  }
}
