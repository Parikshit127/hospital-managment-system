"use server";

import { requireTenantContext } from "@/backend/tenant";
import { getTenantPrisma } from "@/backend/db";
import { revalidatePath } from "next/cache";
import { searchICD10 } from "@/app/lib/icd10";
import { sendPrescriptionEmail, sendAdmissionEmail } from "@/backend/email";

export async function getPatientQueue(options?: {
  doctor_id?: string;
  doctor_name?: string;
  doctor_username?: string;
  specialty?: string;
  view?: "my" | "all";
  dateRange?: "today" | "upcoming" | "all";
  includeAllStatuses?: boolean;
}) {
  try {
    const { db } = await requireTenantContext();

    const where: any = {};

    // Keep existing behavior by default, but allow callers to request all statuses.
    if (!options?.includeAllStatuses) {
      where.status = {
        in: ["Pending", "Scheduled", "Checked In", "In Progress", "Admitted"],
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Default range remains "today" to avoid regressions in existing views.
    const range = options?.dateRange || "today";
    if (range === "today") {
      where.appointment_date = {
        gte: todayStart,
        lte: todayEnd,
      };
    } else if (range === "upcoming") {
      where.appointment_date = {
        gte: todayStart,
      };
    }

    // Filter by doctor if "My Patients" view.
    // Use strict doctor_id matching when available to avoid leaking other doctors' patients.
    if (options?.view === "my") {
      if (options?.doctor_id) {
        where.AND = [...(where.AND || []), { doctor_id: options.doctor_id }];
      } else {
        const fallbackFilters: any[] = [];

        if (options?.doctor_name) {
          fallbackFilters.push({
            doctor_name: { equals: options.doctor_name, mode: "insensitive" },
          });
        }
        if (options?.doctor_username) {
          fallbackFilters.push({
            doctor_name: {
              equals: options.doctor_username,
              mode: "insensitive",
            },
          });
        }

        if (fallbackFilters.length > 0) {
          where.AND = [...(where.AND || []), { OR: fallbackFilters }];
        } else {
          // Safety: never return unscoped data for "my" view.
          return { success: true, data: [] };
        }
      }
    }

    // Filter by specialty only for non-my views.
    if (options?.specialty && options?.view !== "my") {
      where.department = options.specialty;
    }

    const appointments = await db.appointments.findMany({
      where,
      include: {
        patient: true,
      },
      orderBy: { appointment_date: "asc" },
    });

    const queue = appointments.map((appt: any) => ({
      ...appt.patient,
      age: appt.patient.age,
      gender: appt.patient.gender,
      phone: appt.patient.phone,
      status: appt.status,
      appointment_id: appt.appointment_id,
      internal_id: appt.id,
      digital_id: appt.patient.patient_id,
      doctor_id: appt.doctor_id,
      doctor_name: appt.doctor_name,
      reason_for_visit: appt.reason_for_visit,
      appointment_date: appt.appointment_date,
    }));

    return { success: true, data: queue };
  } catch (error) {
    console.error("Queue Fetch Error:", error);
    return { success: false, data: [] };
  }
}

export async function getDoctorsList() {
  try {
    const { db } = await requireTenantContext();

    const doctors = await db.user.findMany({
      where: { role: "doctor" },
      select: { id: true, name: true, specialty: true, username: true },
      orderBy: { name: "asc" },
    });
    return { success: true, data: doctors };
  } catch (error) {
    console.error("Doctors List Error:", error);
    return { success: false, data: [] };
  }
}

export async function admitPatient(
  patientId: string,
  doctorName: string,
  diagnosis: string,
) {
  try {
    const { db, organizationId } = await requireTenantContext();

    // 1. Create Admission Record
    const admission = await db.admissions.create({
      data: {
        patient_id: patientId,
        doctor_name: doctorName,
        diagnosis: diagnosis,
        status: "Admitted",
        admission_date: new Date(),
        organizationId,
      },
    });

    // 2. Update Appointment Status to 'Admitted'
    // We find the latest appointment for this patient today
    // Or just let the UI handle the status update via updateAppointmentStatus?
    // Better to do it here to ensure consistency.
    // But we don't have appointment_id passed here.
    // We will trust the UI/Logic to update appointment status separately or we can query it.
    // For now, returning success. The UI calls updateStatus separately usually or we should add it.

    const patient = await db.oPD_REG.findUnique({
      where: { patient_id: patientId },
    });
    if (patient && patient.email) {
      await sendAdmissionEmail(
        patient.email,
        patient.full_name,
        "Pending Ward Assignment",
        doctorName,
      );
    }

    revalidatePath("/doctor/dashboard");
    return { success: true, admission_id: admission.admission_id };
  } catch (error) {
    console.error("Admission Error:", error);
    return { success: false, error: "Admission failed" };
  }
}

export async function getPatientHistory(patientId: string) {
  try {
    const { db } = await requireTenantContext();

    const history = await db.clinical_EHR.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
    });
    return { success: true, data: history };
  } catch (error) {
    console.error("History Fetch Error:", error);
    return { success: false, data: [] };
  }
}

export async function saveMedicalNote(data: {
  admission_id: string;
  note_type: string;
  details: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();

    let finalAdmissionId = data.admission_id;

    // Handle Lookup if UI doesn't have admission_id
    if (data.admission_id.startsWith("LOOKUP_BY_PATIENT:")) {
      const patientId = data.admission_id.split(":")[1];
      // Find latest active admission
      const admission = await db.admissions.findFirst({
        where: {
          patient_id: patientId,
          status: "Admitted",
        },
        orderBy: { admission_date: "desc" },
      });

      if (!admission) {
        return {
          success: false,
          error: "No active admission found for this patient",
        };
      }
      finalAdmissionId = admission.admission_id;
    }

    // @ts-ignore
    await db.medical_notes.create({
      data: {
        admission_id: finalAdmissionId,
        note_type: data.note_type,
        details: data.details,
        organizationId,
      },
    });
    revalidatePath("/doctor/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Medical Note Save Error:", error);
    return { success: false, error: "Failed to save medical note" };
  }
}

export async function saveClinicalNotes(data: any) {
  try {
    const { db, organizationId } = await requireTenantContext();

    // 1. Save to Local DB (Clinical_EHR)
    // Schema: appointment_id (PK), patient_id, doctor_notes, diagnosis
    // Note: Prisma create needs unique ID. appointment_id is PK.
    // We use upsert to handle re-saves for same appointment

    await db.clinical_EHR.upsert({
      where: { appointment_id: data.appointment_id },
      update: {
        doctor_notes: data.notes,
        diagnosis: data.diagnosis,
        doctor_name: data.doctor_name,
      },
      create: {
        appointment_id: data.appointment_id, // PK
        patient_id: data.patient_id,
        doctor_notes: data.notes,
        diagnosis: data.diagnosis,
        doctor_name: data.doctor_name,
        organizationId,
      },
    });

    // 2. Send email prescription
    const patient = await db.oPD_REG.findUnique({
      where: { patient_id: data.patient_id },
    });
    if (patient && patient.email) {
      const summaryHtml = `
                <h3 style="margin-top:0;">Diagnosis: ${data.diagnosis || "Pending"}</h3>
                <div>${data.notes ? data.notes.replace(/\\n/g, "<br/>") : "No additional notes provided."}</div>
            `;
      await sendPrescriptionEmail(
        patient.email,
        patient.full_name,
        data.doctor_name,
        summaryHtml,
      );
    }

    revalidatePath("/doctor/dashboard");
    return { success: true };
  } catch (error) {
    console.error("EHR Save Error:", error);
    return { success: false, error: "Failed to save notes" };
  }
}

export async function orderLabTest(data: any) {
  console.log("--- orderLabTest Started ---");
  console.log("Data:", data);
  try {
    const { db, organizationId } = await requireTenantContext();

    // Generate barcode locally
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await db.lab_orders.count();
    const seq = String(count + 1).padStart(4, "0");
    const barcode = `LAB-${dateStr}-${seq}`;
    const technician = "Lab Tech"; // Generic assignment

    await db.lab_orders.create({
      data: {
        barcode: barcode,
        patient_id: data.patient_id,
        doctor_id: data.doctor_id,
        test_type: data.test_type,
        status: "Pending",
        assigned_technician_id: technician,
        organizationId,
      },
    });

    revalidatePath("/lab/technician");
    revalidatePath("/doctor/dashboard");

    return { success: true, barcode, technician };
  } catch (error) {
    console.error("Lab Order Error:", error);
    return { success: false, error: "Failed to create lab order via DB" };
  }
}

export async function getPatientLabOrders(patientId: string) {
  try {
    const { db } = await requireTenantContext();

    const orders = await db.lab_orders.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
    });
    return { success: true, data: orders };
  } catch (error) {
    console.error("Get Lab Orders Error:", error);
    return { success: false, data: [] };
  }
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: string,
) {
  try {
    const { db } = await requireTenantContext();

    // appointmentId is string (APP-...), schema uses 'appointment_id' as unique string,
    // internal 'id' is Int.
    // So we update where appointment_id matches.

    await db.appointments.update({
      where: { appointment_id: appointmentId },
      data: { status: status },
    });
    revalidatePath("/doctor/dashboard");
    revalidatePath("/doctor/schedule");
    return { success: true };
  } catch (error) {
    console.error("Update Status Error:", error);
    return { success: false, error: "Failed to update status" };
  }
}

export async function getMedicineList() {
  try {
    const { db } = await requireTenantContext();

    const medicines = await db.pharmacy_medicine_master.findMany({
      orderBy: { brand_name: "asc" },
    });
    return { success: true, data: medicines };
  } catch (error) {
    console.error("Get Medicine List Error:", error);
    return { success: false, data: [] };
  }
}

export async function createPharmacyOrder(
  patientId: string,
  doctorId: string,
  items: { name: string; qty: number }[],
) {
  console.log("--- createPharmacyOrder Started ---");
  console.log("Patient:", patientId, "Doctor:", doctorId);
  console.log("Items:", items);
  try {
    const { db, organizationId } = await requireTenantContext();

    // 1. Create Local Order (Pending)
    const order = await db.pharmacy_orders.create({
      data: {
        patient_id: patientId,
        doctor_id: doctorId,
        status: "Pending",
        total_items_requested: items.length,
        organizationId,
        items: {
          create: items.map((i: any) => ({
            medicine_name: i.name,
            quantity_requested: i.qty,
            status: "Pending",
          })),
        },
      },
      include: { items: true },
    });

    revalidatePath("/doctor/dashboard");
    revalidatePath("/pharmacy/billing");

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Create Pharmacy Order Error:", error);
    return { success: false, error: "Failed to create pharmacy order" };
  }
}

// ICD-10 code lookup for diagnosis
export async function lookupICD10(query: string) {
  try {
    const results = await searchICD10(query);
    return { success: true, data: results };
  } catch (error: any) {
    console.error("ICD-10 lookup error:", error);
    return { success: true, data: [] };
  }
}

// ========================================
// AI SOAP NOTE ASSISTANT
// ========================================

export async function generateAISOAPNote(rawText: string, patientId: string) {
  try {
    const { db } = await requireTenantContext();
    const { generateSOAPNote } = await import("@/app/lib/ai-service");

    const patient = await db.oPD_REG.findUnique({
      where: { patient_id: patientId },
    });
    const lastVisit = await db.clinical_EHR.findFirst({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
    });

    const vitals = await db.vital_signs.findFirst({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
    });

    const vitalsMap: Record<string, string> = {};
    if (vitals) {
      if (vitals.blood_pressure) vitalsMap["BP"] = vitals.blood_pressure;
      if (vitals.heart_rate) vitalsMap["HR"] = `${vitals.heart_rate} bpm`;
      if (vitals.temperature) vitalsMap["Temp"] = `${vitals.temperature}°C`;
      if (vitals.oxygen_sat) vitalsMap["SpO2"] = `${vitals.oxygen_sat}%`;
      if (vitals.respiratory_rate)
        vitalsMap["RR"] = `${vitals.respiratory_rate}/min`;
    }

    const result = await generateSOAPNote(rawText, {
      name: patient?.full_name || "Unknown",
      age: patient?.age ? Number(patient.age) : undefined,
      gender: patient?.gender || undefined,
      chiefComplaint: lastVisit?.diagnosis || undefined,
      vitals: Object.keys(vitalsMap).length > 0 ? vitalsMap : undefined,
      history: lastVisit?.doctor_notes?.substring(0, 500) || undefined,
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error("AI SOAP generation error:", error);
    return { success: false, error: error.message || "AI service unavailable" };
  }
}

export async function autoSuggestICD10(diagnosisText: string) {
  try {
    const { autoCodeICD10 } = await import("@/app/lib/ai-service");
    const results = await autoCodeICD10(diagnosisText);
    return { success: true, data: results };
  } catch (error: any) {
    console.error("AI ICD-10 suggestion error:", error);
    return { success: false, data: [] };
  }
}

export async function getAIPreConsultBrief(patientId: string) {
  try {
    const { db } = await requireTenantContext();
    const { generatePreConsultBrief } = await import("@/app/lib/ai-service");

    const patient = await db.oPD_REG.findUnique({
      where: { patient_id: patientId },
    });
    if (!patient) return { success: false, error: "Patient not found" };

    const recentVisits = await db.clinical_EHR.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
      take: 3,
    });

    const pendingLabs = await db.lab_orders.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
      take: 5,
    });

    const brief = await generatePreConsultBrief({
      name: patient.full_name,
      age: patient.age ? Number(patient.age) : undefined,
      gender: patient.gender || undefined,
      recentVisits: recentVisits.map((v: any) => ({
        date: new Date(v.created_at).toLocaleDateString(),
        diagnosis: v.diagnosis || "Unspecified",
        notes: v.doctor_notes || "",
      })),
      pendingLabs: pendingLabs.map((l: any) => ({
        testType: l.test_type,
        status: l.status,
        result: l.result_value || undefined,
      })),
      currentMeds: [],
    });

    return { success: true, data: brief };
  } catch (error: any) {
    console.error("AI Pre-consult brief error:", error);
    return { success: false, error: error.message || "AI service unavailable" };
  }
}

export async function transcribeVoiceNote(formData: FormData) {
  try {
    const { transcribeAudio } = await import("@/app/lib/ai-service");
    const audioFile = formData.get("audio") as File;
    if (!audioFile) return { success: false, error: "No audio file provided" };

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const text = await transcribeAudio(
      buffer,
      audioFile.name || "recording.webm",
    );
    return { success: true, data: text };
  } catch (error: any) {
    console.error("Voice transcription error:", error);
    return { success: false, error: error.message || "Transcription failed" };
  }
}

// ========================================
// DOCTOR SCHEDULE MANAGEMENT
// ========================================

export async function getDoctorSchedule(
  doctorId: string,
  startDate: string,
  endDate: string,
) {
  try {
    const { db } = await requireTenantContext();

    const slots = await db.appointmentSlot.findMany({
      where: {
        doctor_id: doctorId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: [{ date: "asc" }, { start_time: "asc" }],
    });

    return { success: true, data: slots };
  } catch (error) {
    console.error("Get Doctor Schedule Error:", error);
    return { success: false, data: [] };
  }
}

// Auto-generate 30-min slots for a doctor on a given date if none exist
export async function getOrCreateDailySlots(
  doctorId: string,
  dateStr: string,
  options?: { organizationId?: string },
) {
  try {
    let orgId = options?.organizationId;
    let db;
    if (orgId) {
      db = getTenantPrisma(orgId);
    } else {
      const ctx = await requireTenantContext();
      db = ctx.db;
      orgId = ctx.session.organization_id;
    }

    const dayStart = new Date(dateStr);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateStr);
    dayEnd.setHours(23, 59, 59, 999);

    // Check if slots already exist for this doctor+date
    const existingSlots = await db.appointmentSlot.findMany({
      where: {
        doctor_id: doctorId,
        date: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { start_time: "asc" },
    });

    if (existingSlots.length > 0) {
      return { success: true, data: existingSlots };
    }

    // Auto-generate 20-min slots from 09:00 to 17:00
    const SLOT_DURATION = 20;
    const START_HOUR = 9;
    const END_HOUR = 17;
    const slots: any[] = [];
    const startMin = START_HOUR * 60;
    const endMin = END_HOUR * 60;

    for (
      let min = startMin;
      min + SLOT_DURATION <= endMin;
      min += SLOT_DURATION
    ) {
      const slotStart = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      const slotEndMin = min + SLOT_DURATION;
      const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, "0")}:${String(slotEndMin % 60).padStart(2, "0")}`;

      slots.push({
        doctor_id: doctorId,
        date: new Date(dateStr),
        start_time: slotStart,
        end_time: slotEnd,
        slot_type: "scheduled",
        is_available: true,
        is_booked: false,
        organizationId: orgId,
      });
    }

    if (slots.length > 0) {
      await db.appointmentSlot.createMany({ data: slots });
    }

    // Fetch and return the newly created slots
    const newSlots = await db.appointmentSlot.findMany({
      where: {
        doctor_id: doctorId,
        date: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { start_time: "asc" },
    });

    return { success: true, data: newSlots };
  } catch (error) {
    console.error("getOrCreateDailySlots Error:", error);
    return { success: false, data: [] };
  }
}

export async function updateDoctorAvailability(data: {
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isAvailable: boolean;
}) {
  try {
    const { db } = await requireTenantContext();

    if (!data.isAvailable) {
      // Block time: mark existing slots as blocked
      const dayStart = new Date(data.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(data.date);
      dayEnd.setHours(23, 59, 59, 999);

      await db.appointmentSlot.updateMany({
        where: {
          doctor_id: data.doctorId,
          date: { gte: dayStart, lte: dayEnd },
          is_booked: false,
        },
        data: { is_available: false, slot_type: "blocked" },
      });
    } else {
      // Delete any existing unbooked slots for this date to prevent duplicates
      const dayStart = new Date(data.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(data.date);
      dayEnd.setHours(23, 59, 59, 999);

      await db.appointmentSlot.deleteMany({
        where: {
          doctor_id: data.doctorId,
          date: { gte: dayStart, lte: dayEnd },
          is_booked: false,
        },
      });

      // Create available slots
      const slots: any[] = [];
      const [startH, startM] = data.startTime.split(":").map(Number);
      const [endH, endM] = data.endTime.split(":").map(Number);
      const dayStartMin = startH * 60 + startM;
      const dayEndMin = endH * 60 + endM;

      for (
        let min = dayStartMin;
        min + data.slotDuration <= dayEndMin;
        min += data.slotDuration
      ) {
        const slotStart = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
        const slotEndMin = min + data.slotDuration;
        const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, "0")}:${String(slotEndMin % 60).padStart(2, "0")}`;

        slots.push({
          doctor_id: data.doctorId,
          date: new Date(data.date),
          start_time: slotStart,
          end_time: slotEnd,
          slot_type: "scheduled",
          is_available: true,
          is_booked: false,
        });
      }

      if (slots.length > 0) {
        await db.appointmentSlot.createMany({ data: slots });
      }
    }

    revalidatePath("/doctor/schedule");
    return { success: true };
  } catch (error) {
    console.error("Update Availability Error:", error);
    return { success: false, error: "Failed to update availability" };
  }
}

export async function toggleSlotAvailability(
  slotId: string,
  isAvailable: boolean,
) {
  try {
    const { db } = await requireTenantContext();
    await db.appointmentSlot.update({
      where: { id: slotId },
      data: {
        is_available: isAvailable,
        slot_type: isAvailable ? "scheduled" : "blocked",
      },
    });
    return { success: true };
  } catch (err) {
    console.error("Toggle slot error:", err);
    return { success: false };
  }
}

// ========================================
// PATIENT TIMELINE
// ========================================

export async function getPatientTimeline(patientId: string) {
  try {
    const { db } = await requireTenantContext();

    const [
      patient,
      appointments,
      clinicalNotes,
      labOrders,
      admissions,
      vitals,
      pharmacyOrders,
      followUps,
    ] = await Promise.all([
      db.oPD_REG.findUnique({ where: { patient_id: patientId } }),
      db.appointments.findMany({
        where: { patient_id: patientId },
        orderBy: { appointment_date: "desc" },
      }),
      db.clinical_EHR.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),
      db.lab_orders.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),
      db.admissions.findMany({
        where: { patient_id: patientId },
        orderBy: { admission_date: "desc" },
        include: { medical_notes: true },
      }),
      db.vital_signs.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
        take: 20,
      }),
      db.pharmacy_orders.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
        include: { items: true },
      }),
      db.followUp.findMany({
        where: { patient_id: patientId },
        orderBy: { scheduled_date: "desc" },
      }),
    ]);

    // Build timeline entries
    const timeline: any[] = [];

    appointments.forEach((a: any) =>
      timeline.push({
        type: "appointment",
        date: a.appointment_date,
        data: {
          id: a.appointment_id,
          doctor: a.doctor_name,
          dept: a.department,
          status: a.status,
          reason: a.reason_for_visit,
        },
      }),
    );

    clinicalNotes.forEach((n: any) =>
      timeline.push({
        type: "clinical_note",
        date: n.created_at,
        data: {
          id: n.appointment_id,
          diagnosis: n.diagnosis,
          notes: n.doctor_notes,
          doctor: n.doctor_name,
        },
      }),
    );

    labOrders.forEach((l: any) =>
      timeline.push({
        type: "lab_order",
        date: l.created_at,
        data: {
          barcode: l.barcode,
          test: l.test_type,
          status: l.status,
          result: l.result_value,
        },
      }),
    );

    admissions.forEach((a: any) =>
      timeline.push({
        type: "admission",
        date: a.admission_date,
        data: {
          id: a.admission_id,
          diagnosis: a.diagnosis,
          doctor: a.doctor_name,
          status: a.status,
          discharge: a.discharge_date,
        },
      }),
    );

    pharmacyOrders.forEach((p: any) =>
      timeline.push({
        type: "prescription",
        date: p.created_at,
        data: {
          id: p.id,
          status: p.status,
          items: p.items?.map((i: any) => i.medicine_name).join(", "),
        },
      }),
    );

    followUps.forEach((f: any) =>
      timeline.push({
        type: "follow_up",
        date: f.scheduled_date,
        data: {
          id: f.id,
          doctor_id: f.doctor_id,
          status: f.status,
          notes: f.notes,
          created_at: f.created_at,
        },
      }),
    );

    // Sort by date desc
    timeline.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return { success: true, data: { patient, timeline, vitals } };
  } catch (error) {
    console.error("Patient Timeline Error:", error);
    return { success: false, data: null };
  }
}

// ========================================
// PRESCRIPTION TEMPLATES
// ========================================

export async function getTemplates(doctorId: string, type?: string) {
  try {
    const { db } = await requireTenantContext();

    const where: any = { doctor_id: doctorId };
    if (type) where.type = type;

    const templates = await db.prescriptionTemplate.findMany({
      where,
      orderBy: { updated_at: "desc" },
    });

    return {
      success: true,
      data: templates.map((t: any) => ({
        id: t.id,
        title: t.name,
        type: t.type,
        contentPreview: t.content,
        used: 0,
        lastUpdated: t.updated_at.toLocaleDateString(),
      })),
    };
  } catch (error) {
    console.error("Get Templates Error:", error);
    return { success: false, data: [] };
  }
}

export async function saveTemplate(data: {
  id?: string;
  doctorId: string;
  title: string;
  type: string;
  content: string;
}) {
  try {
    const { db } = await requireTenantContext();

    if (data.id) {
      await db.prescriptionTemplate.update({
        where: { id: data.id },
        data: { name: data.title, type: data.type, content: data.content },
      });
    } else {
      await db.prescriptionTemplate.create({
        data: {
          doctor_id: data.doctorId,
          name: data.title,
          type: data.type,
          content: data.content,
        },
      });
    }

    revalidatePath("/doctor/templates");
    return { success: true };
  } catch (error) {
    console.error("Save Template Error:", error);
    return { success: false, error: "Failed to save template" };
  }
}

export async function deleteTemplate(id: string) {
  try {
    const { db } = await requireTenantContext();
    await db.prescriptionTemplate.delete({ where: { id } });
    revalidatePath("/doctor/templates");
    return { success: true };
  } catch (error) {
    console.error("Delete Template Error:", error);
    return { success: false, error: "Failed to delete template" };
  }
}

// ========================================
// FOLLOW-UPS
// ========================================

export async function scheduleFollowUp(data: {
  patientId: string;
  doctorId: string;
  scheduledDate: string;
  notes?: string;
}) {
  try {
    const { db } = await requireTenantContext();

    await db.followUp.create({
      data: {
        patient_id: data.patientId,
        doctor_id: data.doctorId,
        scheduled_date: new Date(data.scheduledDate),
        notes: data.notes,
        status: "Pending",
      },
    });

    revalidatePath("/doctor/follow-ups");
    return { success: true };
  } catch (error) {
    console.error("Schedule Follow-Up Error:", error);
    return { success: false, error: "Failed to schedule follow-up" };
  }
}

export async function getFollowUpsDue(
  doctorId: string,
  filter?: "today" | "week" | "overdue" | "all",
) {
  try {
    const { db } = await requireTenantContext();

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const where: any = { doctor_id: doctorId };

    if (filter === "today") {
      where.scheduled_date = { gte: todayStart, lte: todayEnd };
      where.status = "Pending";
    } else if (filter === "week") {
      where.scheduled_date = { gte: todayStart, lte: weekEnd };
      where.status = "Pending";
    } else if (filter === "overdue") {
      where.scheduled_date = { lt: todayStart };
      where.status = "Pending";
    } else {
      // all
    }

    const followUps = await db.followUp.findMany({
      where,
      orderBy: { scheduled_date: "asc" },
    });

    // Enrich with patient names
    const patientIds = [...new Set(followUps.map((f: any) => f.patient_id))];
    const patients = await db.oPD_REG.findMany({
      where: { patient_id: { in: patientIds } },
      select: { patient_id: true, full_name: true, phone: true },
    });
    const patientMap = Object.fromEntries(
      patients.map((p: any) => [p.patient_id, p]),
    );

    const enriched = followUps.map((f: any) => ({
      ...f,
      patientName: patientMap[f.patient_id]?.full_name || "Unknown",
      patientPhone: patientMap[f.patient_id]?.phone || null,
    }));

    return { success: true, data: enriched };
  } catch (error) {
    console.error("Get Follow-Ups Error:", error);
    return { success: false, data: [] };
  }
}

export async function updateFollowUpStatus(id: string, status: string) {
  try {
    const { db } = await requireTenantContext();
    await db.followUp.update({ where: { id }, data: { status } });
    revalidatePath("/doctor/follow-ups");
    return { success: true };
  } catch (error) {
    console.error("Update Follow-Up Error:", error);
    return { success: false, error: "Failed to update" };
  }
}

export async function getPatientFollowUps(
  patientId: string,
  doctorId?: string,
) {
  try {
    const { db } = await requireTenantContext();
    const where: any = { patient_id: patientId };

    if (doctorId) {
      where.doctor_id = doctorId;
    }

    const followUps = await db.followUp.findMany({
      where,
      orderBy: { scheduled_date: "desc" },
    });

    return { success: true, data: followUps };
  } catch (error) {
    console.error("Get Patient Follow-Ups Error:", error);
    return {
      success: false,
      data: [],
      error: "Failed to fetch patient follow-ups",
    };
  }
}
