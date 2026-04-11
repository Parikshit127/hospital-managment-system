"use server";

import { requireTenantContext } from "@/backend/tenant";
import { logAudit } from "@/app/lib/audit";
import { revalidatePath } from "next/cache";
import { getPatientBalances } from '@/app/actions/balance-actions';


function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) =>
      typeof value === "object" &&
      value !== null &&
      value.constructor?.name === "Decimal"
        ? Number(value)
        : value,
    ),
  );
}


export async function getWardsWithBeds() {
  try {
    const { db } = await requireTenantContext();
    const wards = await db.wards.findMany({
      include: {
        beds: {
          orderBy: { bed_id: "asc" },
        },
      },
      orderBy: { ward_name: "asc" },
    });

    const wardData = wards.map((ward: any) => ({
      id: ward.ward_id,
      ward_id: ward.ward_id,
      ward_name: ward.ward_name,
      ward_type: ward.ward_type,
      cost_per_day: Number(ward.cost_per_day || 0),
      nursing_charge: Number(ward.nursing_charge || 0),
      beds: ward.beds.map((b: any) => ({
        bed_id: b.bed_id,
        bed_type: b.bed_type,
        status: b.status,
        ward_id: b.ward_id,
      })),
      totalBeds: ward.beds.length,
      available: ward.beds.filter((b: any) => b.status === "Available").length,
      occupied: ward.beds.filter((b: any) => b.status === "Occupied").length,
      maintenance: ward.beds.filter((b: any) => b.status === "Maintenance").length,
      reserved: ward.beds.filter((b: any) => b.status === "Reserved").length,
      cleaning: ward.beds.filter((b: any) => b.status === "Cleaning").length,
      isolation: ward.beds.filter((b: any) => b.status === "Isolation").length,
      blocked: ward.beds.filter((b: any) => b.status === "Blocked").length,
    }));

    return { success: true, data: wardData };
  } catch (error: any) {
    console.error("getWardsWithBeds error:", error);
    return { success: false, error: error.message };
  }
}

export async function getAllBeds() {
  try {
    const { db } = await requireTenantContext();
    const beds = await db.beds.findMany({
      include: {
        wards: true,
        admissions: {
          where: { status: "Admitted" },
          include: {
            patient: {
              select: { full_name: true, patient_id: true, phone: true },
            },
          },
        },
      },
      orderBy: { bed_id: "asc" },
    });

    return { success: true, data: serialize(beds) };
  } catch (error: any) {
    console.error("getAllBeds error:", error);
    return { success: false, error: error.message };
  }
}


export async function updateBedStatus(bedId: string, newStatus: string) {
  try {
    const { db } = await requireTenantContext();
    const validStatuses = [
      "Available",
      "Occupied",
      "Maintenance",
      "Reserved",
      "Cleaning",
      "Isolation",
      "Blocked",
    ];
    if (!validStatuses.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      };
    }

    const bed = await db.beds.update({
      where: { bed_id: bedId },
      data: { status: newStatus },
    });

    await db.system_audit_logs.create({
      data: {
        action: "UPDATE_BED_STATUS",
        module: "ipd",
        entity_type: "bed",
        entity_id: bedId,
        details: JSON.stringify({ newStatus }),
      },
    });

    return { success: true, data: bed };
  } catch (error: any) {
    console.error("updateBedStatus error:", error);
    return { success: false, error: error.message };
  }
}


export async function admitPatientIPD(data: {
  patient_id: string;
  bed_id: string;
  ward_id: number;
  diagnosis: string;
  doctor_name: string;
  deposit_amount?: number;
  deposit_payment_method?: string;
  estimate_id?: number;
  admission_type?: string;
  line_of_treatment?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    
    
    const admission = await db.$transaction(async (tx: any) => {
        // Atomic update: only update if it is 'Available'
        const updatedBed = await tx.beds.updateMany({
            where: { bed_id: data.bed_id, status: "Available", organizationId },
            data: { status: "Occupied" }
        });

        if (updatedBed.count === 0) {
            throw new Error("Bed is no longer available or does not exist for admission");
        }

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
        const ipdId = `IPD-${dateStr}-${seq}`;

        // Create admission
        const newAdmission = await tx.admissions.create({
            data: {
                admission_id: ipdId,
                patient_id: data.patient_id,
                bed_id: data.bed_id,
                ward_id: data.ward_id,
                status: "Admitted",
                diagnosis: data.diagnosis,
                doctor_name: data.doctor_name,
                organizationId
            },
        });

        // Create IPD invoice
        // Re-use dateStr and seq or generate new ones for invoice if preferred, but generating new seq:
        const invoiceSeq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");

        const newInvoice = await tx.invoices.create({
            data: {
                invoice_number: `INV-${dateStr}-${invoiceSeq}`,
                patient_id: data.patient_id,
                admission_id: newAdmission.admission_id,
                invoice_type: "IPD",
                status: "Draft",
                estimate_id: data.estimate_id || null,
                organizationId
            },
        });

        // Collect deposit if provided
        if (data.deposit_amount && data.deposit_amount > 0) {
            const depDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const depSeq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
            await tx.patientDeposit.create({
                data: {
                    deposit_number: `DEP-${depDateStr}-${depSeq}`,
                    patient_id: data.patient_id,
                    admission_id: newAdmission.admission_id,
                    amount: data.deposit_amount,
                    payment_method: data.deposit_payment_method || "Cash",
                    status: "Active",
                    organizationId,
                },
            });
        }

        await tx.system_audit_logs.create({
            data: {
                action: "ADMIT_PATIENT_IPD",
                module: "ipd",
                entity_type: "admission",
                entity_id: newAdmission.admission_id,
                details: JSON.stringify({
                    patient_id: data.patient_id,
                    bed_id: data.bed_id,
                    doctor: data.doctor_name,
                }),
                organizationId
            },
        });

        return newAdmission;
    });

    return { success: true, data: admission };
  } catch (error: any) {
    console.error("admitPatientIPD error:", error);
    return { success: false, error: error.message };
  }
}

// Get all current admissions (IPD Dashboard)
export async function getIPDAdmissions(statusFilter?: string) {
  try {
    const { db } = await requireTenantContext();
    const where: any = {};
    if (statusFilter) where.status = statusFilter;

    const admissions = await db.admissions.findMany({
      where,
      include: {
        patient: {
          select: {
            full_name: true,
            patient_id: true,
            age: true,
            gender: true,
            phone: true,
          },
        },
        bed: { include: { wards: true } },
        ward: true,
        medical_notes: { orderBy: { created_at: "desc" }, take: 3 },
      },
      orderBy: { admission_date: "desc" },
    });

    const patientIds = Array.from(new Set(admissions.map((a: any) => a.patient_id).filter(Boolean))) as string[];
    const balances = await getPatientBalances(patientIds);

    const enriched = admissions.map((a: any) => {
      const daysAdmitted = Math.ceil(
        (new Date().getTime() - new Date(a.admission_date).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return {
        ...a,
        daysAdmitted,
        wardName: a.ward?.ward_name || a.bed?.wards?.ward_name || "N/A",
        wardType: a.ward?.ward_type || a.bed?.wards?.ward_type || "General",
        costPerDay: Number(
          a.ward?.cost_per_day || a.bed?.wards?.cost_per_day || 0,
        ),
        estimatedRoomCharge:
          daysAdmitted *
          Number(a.ward?.cost_per_day || a.bed?.wards?.cost_per_day || 0),
        totalBalance: balances[a.patient_id]?.totalBalance || 0,
      };
    });

    return { success: true, data: serialize(enriched) };
  } catch (error: any) {
    console.error("getIPDAdmissions error:", error);
    return { success: false, error: error.message };
  }
}

// Search IPD admissions by patient phone and return assigned doctor details
export async function findAssignedDoctorByPatientPhone(phoneQuery: string) {
  try {
    const { db } = await requireTenantContext();
    const q = (phoneQuery || "").trim();
    const digitQuery = q.replace(/\D/g, "");

    if (q.length < 3 && digitQuery.length < 3) {
      return {
        success: true,
        data: { admissions: [], patients: [], doctors: [] },
      };
    }

    // Search only CURRENT admissions so results match the IPD dashboard context.
    const admissions = await db.admissions.findMany({
      where: { status: "Admitted" },
      include: {
        patient: { select: { full_name: true, patient_id: true, phone: true } },
        ward: { select: { ward_name: true } },
      },
      orderBy: { admission_date: "desc" },
      take: 500,
    });

    // Also resolve doctors by phone/name/username so search can work with doctor inputs.
    const matchedDoctors = await db.user.findMany({
      where: {
        role: "doctor",
        OR: [
          ...(q
            ? [
                { phone: { contains: q } },
                { username: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ]
            : []),
          ...(digitQuery ? [{ phone: { contains: digitQuery } }] : []),
        ],
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        specialty: true,
      },
      take: 100,
    });

    const doctorKeys = new Set(
      matchedDoctors
        .flatMap((d: any) => [
          String(d.username || "").toLowerCase(),
          String(d.name || "").toLowerCase(),
        ])
        .filter(Boolean),
    );

    const queryLast10 = digitQuery.length >= 10 ? digitQuery.slice(-10) : "";

    const scored = admissions
      .map((a: any) => {
        const phoneRaw = String(a?.patient?.phone || "");
        const phoneDigits = phoneRaw.replace(/\D/g, "");
        const phoneLast10 =
          phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
        const doctorNameRaw = String(a?.doctor_name || "");
        const doctorName = doctorNameRaw.toLowerCase();

        let score = -1;

        // Strongest match: exact 10-digit mobile match.
        if (queryLast10 && phoneLast10 === queryLast10) {
          score = 100;
        } else if (digitQuery && phoneDigits === digitQuery) {
          score = 90;
        } else if (digitQuery && phoneDigits.includes(digitQuery)) {
          score = 70;
        } else if (q && phoneRaw.toLowerCase().includes(q.toLowerCase())) {
          score = 50;
        } else if (doctorKeys.has(doctorName)) {
          score = 80;
        } else if (q && doctorName.includes(q.toLowerCase())) {
          score = 60;
        }

        return { a, score };
      })
      .filter((x: any) => x.score >= 0)
      .sort(
        (x: any, y: any) =>
          y.score - x.score ||
          new Date(y.a.admission_date).getTime() -
            new Date(x.a.admission_date).getTime(),
      )
      .slice(0, 20);

    const admissionsData = scored.map(({ a }: any) => ({
      admission_id: a.admission_id,
      status: a.status,
      doctor_name: a.doctor_name || "-",
      admission_date: a.admission_date,
      patient_name: a.patient?.full_name || "Unknown",
      patient_id: a.patient?.patient_id || "-",
      phone: a.patient?.phone || "-",
      ward_name: a.ward?.ward_name || "-",
      bed_id: a.bed_id || "-",
    }));

    const seenPatientIds = new Set<string>();
    const patientsData = admissionsData
      .filter((row: any) => {
        const key = String(row.patient_id || "");
        if (!key || seenPatientIds.has(key)) return false;
        seenPatientIds.add(key);
        return true;
      })
      .map((row: any) => ({
        patient_id: row.patient_id,
        patient_name: row.patient_name,
        phone: row.phone,
        current_doctor: row.doctor_name,
        status: row.status,
      }));

    const doctorsData = matchedDoctors.map((d: any) => ({
      doctor_id: d.id,
      username: d.username,
      doctor_name: d.name || d.username,
      phone: d.phone || "-",
      specialty: d.specialty || "-",
    }));

    return {
      success: true,
      data: serialize({
        admissions: admissionsData,
        patients: patientsData,
        doctors: doctorsData,
      }),
    };
  } catch (error: any) {
    console.error("findAssignedDoctorByPatientPhone error:", error);
    return {
      success: false,
      error: error.message || "Failed to search by phone",
      data: { admissions: [], patients: [], doctors: [] },
    };
  }
}

// Get single admission detail
export async function getAdmissionDetail(admissionId: string) {
  try {
    const { db } = await requireTenantContext();
    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
      include: {
        patient: true,
        bed: { include: { wards: true } },
        ward: true,
        medical_notes: { orderBy: { created_at: "desc" } },
        summaries: true,
        invoices: {
          include: { items: true, payments: true },
        },
      },
    });

    if (!admission) return { success: false, error: "Admission not found" };

    return { success: true, data: serialize(admission) };
  } catch (error: any) {
    console.error("getAdmissionDetail error:", error);
    return { success: false, error: error.message };
  }
}

// Add daily charges (room + nursing) to an admission's invoice
export async function accrueIPDDailyCharges(admissionId: string) {
  try {
    const { db } = await requireTenantContext();
    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
      include: { ward: true, bed: { include: { wards: true } } },
    });

    if (!admission) return { success: false, error: "Admission not found" };

    const ward = admission.ward || admission.bed?.wards;
    if (!ward) return { success: false, error: "Ward info not found" };

    // Find the IPD invoice
    let invoice = await db.invoices.findFirst({
      where: { admission_id: admissionId, status: { not: "Cancelled" } },
    });

    if (!invoice) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
      invoice = await db.invoices.create({
        data: {
          invoice_number: `INV-${dateStr}-${seq}`,
          patient_id: admission.patient_id,
          admission_id: admissionId,
          invoice_type: "IPD",
          status: "Draft",
        },
      });
    }

    const bedPricingTier = admission.bed?.pricing_tier || 'Base';
    let multiplier = 1;
    if (bedPricingTier === 'Premium') multiplier = 1.5;
    if (bedPricingTier === 'Critical') multiplier = 2.0;

    const baseRoomRate = Number(ward.cost_per_day || 0);
    const roomRate = baseRoomRate * multiplier;
    
    // Nursing rate is also scaled or remains flat based on hospital policy. Let's scale it.
    const nursingRate = Number(ward.nursing_charge || 0) * multiplier;
    const today = new Date().toLocaleDateString("en-IN");

    // Determine room GST: 0% if <=5000/day, 5% if >5000/day
    const roomTaxRate = roomRate > 5000 ? 5 : 0;
    const roomTaxAmount = roomRate * roomTaxRate / 100;

    // Add room charge
    if (roomRate > 0) {
      await db.invoice_items.create({
        data: {
          invoice_id: invoice.id,
          department: "Room",
          description: `${ward.ward_name} - Room Charge (${today})`,
          quantity: 1,
          unit_price: roomRate,
          total_price: roomRate,
          discount: 0,
          net_price: roomRate,
          tax_rate: roomTaxRate,
          tax_amount: roomTaxAmount,
          hsn_sac_code: roomRate > 5000 ? '9963' : '9993',
          service_category: 'Room',
        },
      });
    }

    // Add nursing charge
    if (nursingRate > 0) {
      await db.invoice_items.create({
        data: {
          invoice_id: invoice.id,
          department: "Nursing",
          description: `Nursing Charge (${today})`,
          quantity: 1,
          unit_price: nursingRate,
          total_price: nursingRate,
          discount: 0,
          net_price: nursingRate,
          tax_rate: 0,
          tax_amount: 0,
          hsn_sac_code: '9993',
          service_category: 'Nursing',
        },
      });
    }

    // Recalculate totals
    const items = await db.invoice_items.findMany({
      where: { invoice_id: invoice.id },
    });
    const totalItems = items.reduce(
      (sum: any, item: any) => sum + Number(item.net_price),
      0,
    );
    const totalTax = items.reduce(
      (sum: any, item: any) => sum + Number(item.tax_amount || 0),
      0,
    );
    const netAmount = totalItems + totalTax;
    const paid = Number(invoice.paid_amount || 0);

    await db.invoices.update({
      where: { id: invoice.id },
      data: {
        total_amount: totalItems,
        total_tax: totalTax,
        net_amount: netAmount,
        cgst_amount: totalTax / 2,
        sgst_amount: totalTax / 2,
        balance_due: netAmount - paid,
      },
    });

    await logAudit({
      action: "IPD_DAILY_CHARGES_ACCRUED",
      module: "IPD",
      entity_type: "admission",
      entity_id: admissionId,
      details: JSON.stringify({ roomRate, nursingRate, invoiceId: invoice.id }),
    });

    return {
      success: true,
      data: { roomRate, nursingRate, invoiceId: invoice.id },
    };
  } catch (error: any) {
    console.error("accrueIPDDailyCharges error:", error);
    return { success: false, error: error.message };
  }
}

// Discharge a patient from IPD
export async function dischargePatientIPD(admissionId: string, notes?: string) {
  try {
    const { db } = await requireTenantContext();
    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
      include: { patient: true, ward: true, bed: { include: { wards: true } } },
    });

    if (!admission) return { success: false, error: "Admission not found" };

    // Calculate total room charges
    const ward = admission.ward || admission.bed?.wards;
    const daysAdmitted = Math.max(
      1,
      Math.ceil(
        (new Date().getTime() - new Date(admission.admission_date).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    // Update admission status
    await db.admissions.update({
      where: { admission_id: admissionId },
      data: {
        status: "Discharged",
        discharge_date: new Date(),
      },
    });

    // Free the bed (set to Cleaning first)
    if (admission.bed_id) {
      await db.beds.update({
        where: { bed_id: admission.bed_id },
        data: { status: "Cleaning" },
      });
    }

    // Finalize invoice
    const invoice = await db.invoices.findFirst({
      where: { admission_id: admissionId, status: { not: "Cancelled" } },
    });

    if (invoice) {
      await db.invoices.update({
        where: { id: invoice.id },
        data: {
          status: Number(invoice.balance_due) <= 0 ? "Paid" : "Final",
          finalized_at: new Date(),
        },
      });
    }

    // Create discharge summary
    await db.discharge_summaries.create({
      data: {
        admission_id: admissionId,
        patient_name: admission.patient?.full_name,
        generated_summary: `<h2>Discharge Summary</h2>
                    <p><strong>Patient:</strong> ${admission.patient?.full_name}</p>
                    <p><strong>Diagnosis:</strong> ${admission.diagnosis || "N/A"}</p>
                    <p><strong>Doctor:</strong> ${admission.doctor_name || "N/A"}</p>
                    <p><strong>Duration:</strong> ${daysAdmitted} day(s)</p>
                    <p><strong>Ward:</strong> ${ward?.ward_name || "N/A"}</p>
                    <p><strong>Notes:</strong> ${notes || "N/A"}</p>`,
      },
    });

    await db.system_audit_logs.create({
      data: {
        action: "DISCHARGE_IPD",
        module: "ipd",
        entity_type: "admission",
        entity_id: admissionId,
        details: JSON.stringify({
          patient_id: admission.patient_id,
          daysAdmitted,
          bedFreed: admission.bed_id,
        }),
      },
    });

    return { success: true, data: { daysAdmitted, bedId: admission.bed_id } };
  } catch (error: any) {
    console.error("dischargePatientIPD error:", error);
    return { success: false, error: error.message };
  }
}

// Add medical note during admission
export async function addMedicalNote(
  admissionId: string,
  noteType: string,
  details: string,
) {
  try {
    const { db } = await requireTenantContext();
    const note = await db.medical_notes.create({
      data: {
        admission_id: admissionId,
        note_type: noteType,
        details,
      },
    });

    await logAudit({
      action: "MEDICAL_NOTE_ADDED",
      module: "IPD",
      entity_type: "medical_note",
      entity_id: admissionId,
      details: JSON.stringify({ noteType }),
    });

    return { success: true, data: note };
  } catch (error: any) {
    console.error("addMedicalNote error:", error);
    return { success: false, error: error.message };
  }
}

// Get IPD Stats
export async function getIPDStats() {
  try {
    const { db, session } = await requireTenantContext();
    const [
      totalAdmitted,
      totalDischarged,
      totalBeds,
      availableBeds,
      occupiedBeds,
    ] = await Promise.all([
      db.admissions.count({ where: { status: "Admitted" } }),
      db.admissions.count({ where: { status: "Discharged" } }),
      db.beds.count(),
      db.beds.count({ where: { status: "Available" } }),
      db.beds.count({ where: { status: "Occupied" } }),
    ]);

    return {
      success: true,
      data: {
        totalAdmitted,
        totalDischarged,
        totalBeds,
        availableBeds,
        occupiedBeds,
        occupancyRate:
          totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        role: session.role,
      },
    };
  } catch (error: any) {
    console.error("getIPDStats error:", error);
    return { success: false, error: error.message };
  }
}

// Search patients for admission
export async function searchPatientsForAdmission(query: string) {
  try {
    const { db } = await requireTenantContext();
    const patients = await db.oPD_REG.findMany({
      where: {
        OR: [
          { full_name: { contains: query } },
          { patient_id: { contains: query } },
          { phone: { contains: query } },
        ],
      },
      take: 10,
    });

    return { success: true, data: serialize(patients) };
  } catch (error: any) {
    console.error("searchPatientsForAdmission error:", error);
    return { success: false, error: error.message };
  }
}

// ============================================
// PHASE 1.5 NEW IPD ACTIONS
// ============================================

export async function transferPatient(data: {
  admission_id: string;
  to_bed_id: string;
  reason: string;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    await db.$transaction(async (tx: any) => {
      const admission = await tx.admissions.findUnique({
        where: { admission_id: data.admission_id },
      });

      if (!admission || admission.status !== "Admitted") {
        throw new Error("Valid active admission not found");
      }

      const fromBedId = admission.bed_id;

      // Mark old bed cleaning
      if (fromBedId) {
        await tx.beds.update({
          where: { bed_id: fromBedId },
          data: { status: "Cleaning" },
        });
      }

      // Check new bed
      const toBed = await tx.beds.findUnique({
        where: { bed_id: data.to_bed_id },
      });
      if (!toBed || toBed.status !== "Available") {
        throw new Error("Destination bed is not available");
      }

      // Update new bed
      await tx.beds.update({
        where: { bed_id: data.to_bed_id },
        data: { status: "Occupied" },
      });

      // Update admission
      await tx.admissions.update({
        where: { admission_id: data.admission_id },
        data: { bed_id: data.to_bed_id, ward_id: toBed.ward_id },
      });

      // Create Transfer Record
      await tx.bedTransfer.create({
        data: {
          admission_id: data.admission_id,
          from_bed_id: fromBedId || "",
          to_bed_id: data.to_bed_id,
          reason: data.reason,
          transferred_by: session.id, // Ensure your schema uses string or Int
          organizationId,
        },
      });
    });

    revalidatePath("/ipd");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function assignDietPlan(data: {
  admission_id: string;
  diet_type: string;
  instructions: string;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    // Deactivate previous
    await db.dietPlan.updateMany({
      where: { admission_id: data.admission_id, is_active: true },
      data: { is_active: false },
    });

    await db.dietPlan.create({
      data: {
        admission_id: data.admission_id,
        diet_type: data.diet_type,
        instructions: data.instructions,
        is_active: true,
        created_by: session.id,
        organizationId,
      },
    });

    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function recordWardRound(data: {
  admission_id: string;
  // Legacy free-text
  observations?: string;
  plan_changes?: string;
  // SOAP structured
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  icd_codes?: any[];
  orders_placed?: any[];
  round_type?: string;
  next_review_in_hours?: number;
  escalation_required?: boolean;
  visit_fee?: number;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    const visitFee = data.visit_fee || 0;
    const roundType = data.round_type ?? 'Attending';

    const round = await db.wardRound.create({
      data: {
        admission_id: data.admission_id,
        doctor_id: session.id,
        observations: data.observations ?? data.subjective,
        plan_changes: data.plan_changes ?? data.plan,
        subjective: data.subjective,
        objective: data.objective,
        assessment: data.assessment,
        plan: data.plan,
        icd_codes: data.icd_codes ?? undefined,
        orders_placed: data.orders_placed ?? undefined,
        round_type: roundType,
        next_review_in_hours: data.next_review_in_hours,
        escalation_required: data.escalation_required ?? false,
        visit_fee: visitFee,
        charge_posted: visitFee > 0,
        organizationId,
      },
    });

    // Post doctor visit charge to IPD bill if fee > 0
    if (visitFee > 0) {
      const { postChargeToIpdBill } = await import('./ipd-finance-actions');
      await postChargeToIpdBill({
        admission_id: data.admission_id,
        source_module: 'ward_round',
        source_ref_id: String(round.id),
        description: `Doctor Visit - ${roundType} Round`,
        quantity: 1,
        unit_price: visitFee,
        service_category: 'DoctorVisit',
        hsn_sac_code: '9993',
        tax_rate: 0,
      });
    }

    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getNursingTasks(wardId?: number) {
  try {
    const { db } = await requireTenantContext();

    let whereClause: any = { status: "Pending" };

    if (wardId) {
      // Need to join via admissions
      const admissions = await db.admissions.findMany({
        where: { ward_id: wardId, status: "Admitted" },
        select: { admission_id: true },
      });
      const adIds = admissions.map((a: any) => a.admission_id);
      whereClause.admission_id = { in: adIds };
    }

    const tasks = await db.nursingTask.findMany({
      where: whereClause,
      include: {
        admission: {
          select: {
            patient_id: true,
            bed_id: true,
            patient: { select: { full_name: true } },
          },
        },
      },
      orderBy: { scheduled_at: "asc" },
    });

    return { success: true, data: serialize(tasks) };
  } catch (error: any) {
    return { success: false, data: [] };
  }
}

export async function completeNursingTask(taskId: number, notes?: string) {
  try {
    const { db } = await requireTenantContext();

    const updateData: any = { status: "Completed", completed_at: new Date() };
    if (notes) updateData.description = notes;

    await db.nursingTask.update({
      where: { id: taskId },
      data: updateData,
    });

    revalidatePath("/ipd/nursing-station");
    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to complete task" };
  }
}

export async function getIPDCensus() {
  try {
    const { db } = await requireTenantContext();

    const wards = await db.wards.findMany({
      include: { beds: true },
    });

    const census = wards.map((w: any) => {
      const total = w.beds.length;
      const occupied = w.beds.filter(
        (b: any) => b.status === "Occupied",
      ).length;
      const available = w.beds.filter(
        (b: any) => b.status === "Available",
      ).length;
      return {
        ward_name: w.ward_name,
        total,
        occupied,
        available,
        occupancy_rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
      };
    });

    return { success: true, data: serialize(census) };
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function getAdmissionFullDetails(admissionId: string) {
  try {
    const { db } = await requireTenantContext();
    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
      include: {
        patient: true,
        bed: { include: { wards: true } },
        medical_notes: { orderBy: { created_at: "desc" } },
        diet_plans: { orderBy: { created_at: "desc" } },
        ward_rounds: { orderBy: { created_at: "desc" } },
        bed_transfers: { orderBy: { created_at: "desc" } },
        nursing_tasks: { orderBy: { scheduled_at: "asc" } },
      },
    });

    if (!admission) return { success: false, error: "Not found" };

    return { success: true, data: serialize(admission) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Change the assigned doctor for an admission
export async function changeAdmissionDoctor(
  admissionId: string,
  newDoctorName: string,
) {
  try {
    const { db } = await requireTenantContext();

    const trimmed = (newDoctorName || "").trim();
    if (!trimmed) {
      return { success: false, error: "Doctor name cannot be empty" };
    }

    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
    });

    if (!admission) {
      return { success: false, error: "Admission not found" };
    }

    const oldDoctorName = admission.doctor_name || "N/A";

    await db.admissions.update({
      where: { admission_id: admissionId },
      data: { doctor_name: trimmed },
    });

    await logAudit({
      action: "CHANGE_ADMISSION_DOCTOR",
      module: "IPD",
      entity_type: "admission",
      entity_id: admissionId,
      details: JSON.stringify({ oldDoctorName, newDoctorName: trimmed }),
    });

    revalidatePath(`/ipd/admission/${admissionId}`);
    return { success: true, data: { oldDoctorName, newDoctorName: trimmed } };
  } catch (error: any) {
    console.error("changeAdmissionDoctor error:", error);
    return { success: false, error: error.message };
  }
}

export async function createNursingTask(data: {
  admission_id: string;
  task_type: string;
  description: string;
  scheduled_at: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    await db.nursingTask.create({
      data: {
        admission_id: data.admission_id,
        task_type: data.task_type,
        description: data.description,
        scheduled_at: new Date(data.scheduled_at),
        status: "Pending",
        organizationId,
      },
    });
    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed" };
  }
}

export async function admitEmergency(data: {
  patient_id: string;
  bed_id: string;
  ward_id: number;
  chief_complaint: string;
  doctor_name?: string;
  attending_doctor_id?: string;
  deposit_amount?: number;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();

    // 1. Get bed details for room rate
    const bed = await db.beds.findUnique({
      where: { bed_id: data.bed_id },
      include: { wards: true },
    });
    if (!bed) return { success: false, error: 'Bed not found' };
    if (bed.status !== 'Available') return { success: false, error: 'Bed is not available' };

    // 2. Get patient
    const patient = await db.oPD_REG.findUnique({ where: { patient_id: data.patient_id } });
    if (!patient) return { success: false, error: 'Patient not found' };

    const result = await db.$transaction(async (tx: any) => {
      // 3. Create admission
      const admission = await tx.admissions.create({
        data: {
          patient_id: data.patient_id,
          bed_id: data.bed_id,
          ward_id: data.ward_id,
          status: 'Admitted',
          diagnosis: data.chief_complaint,
          doctor_name: data.doctor_name,
          attending_doctor_id: data.attending_doctor_id,
          admission_category: 'Emergency',
          admission_source: 'Emergency',
          organizationId,
        },
      });

      // 4. Mark bed Occupied
      await tx.beds.update({
        where: { bed_id: data.bed_id },
        data: { status: 'Occupied' },
      });

      // 5. Create invoice
      const invCount = await tx.invoices.count({ where: { organizationId } });
      const invoice = await tx.invoices.create({
        data: {
          patient_id: data.patient_id,
          admission_id: admission.admission_id,
          invoice_number: `IPD-EMRG-${String(invCount + 1).padStart(5, '0')}`,
          invoice_type: 'IPD',
          status: 'Active',
          total_amount: 0,
          net_amount: 0,
          organizationId,
        },
      });

      // 6. Collect emergency deposit if provided
      if (data.deposit_amount && data.deposit_amount > 0) {
        await tx.patientDeposit.create({
          data: {
            patient_id: data.patient_id,
            admission_id: admission.admission_id,
            amount: data.deposit_amount,
            payment_method: 'Cash',
            deposit_type: 'Emergency',
            collected_by: session.id,
            organizationId,
          },
        });
      }

      return { admission, invoice };
    });

    revalidatePath('/ipd');
    return { success: true, data: { admission_id: result.admission.admission_id } };
  } catch (error: any) {
    console.error('admitEmergency error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateAdmissionDiagnosis(data: {
  admission_id: string;
  primary_diagnosis_icd?: string;
  secondary_diagnoses?: string[];
  discharge_type?: string;
  discharge_disposition?: string;
  patient_class?: string;
  isolation_type?: string;
}) {
  try {
    const { db } = await requireTenantContext();
    await db.admissions.update({
      where: { admission_id: data.admission_id },
      data: {
        primary_diagnosis_icd: data.primary_diagnosis_icd,
        secondary_diagnoses: data.secondary_diagnoses ?? undefined,
        discharge_type: data.discharge_type,
        discharge_disposition: data.discharge_disposition,
        patient_class: data.patient_class,
        isolation_type: data.isolation_type,
      },
    });
    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function allocateBedByRules(data: {
  patient_id: string;
  patient_class?: string;    // General | SemiPrivate | Private | Suite | ICU
  isolation_type?: string;   // None | Contact | Droplet | Airborne | Reverse
  gender?: string;
  ward_preference?: number;  // preferred ward_id
  require_oxygen?: boolean;
  require_monitor?: boolean;
}) {
  try {
    const { db } = await requireTenantContext();

    // Get all available beds with ward info
    const availableBeds = await db.beds.findMany({
      where: { status: 'Available' },
      include: { wards: true },
      orderBy: { bed_id: 'asc' },
    });

    if (availableBeds.length === 0) {
      return { success: false, error: 'No available beds' };
    }

    // Score each bed — higher = better match
    const scored = availableBeds.map((bed: any) => {
      let score = 0;

      // Rule 1: Isolation requirement — must be isolation room
      const needsIsolation = data.isolation_type && data.isolation_type !== 'None';
      if (needsIsolation && bed.is_isolation) score += 100;
      if (needsIsolation && !bed.is_isolation) score -= 1000; // disqualify

      // Rule 2: Patient class → ward type match
      const classToWardType: Record<string, string[]> = {
        ICU: ['ICU', 'MICU', 'SICU'],
        NICU: ['NICU'],
        PICU: ['PICU'],
        Suite: ['Suite', 'Private'],
        Private: ['Private', 'SemiPrivate'],
        SemiPrivate: ['SemiPrivate', 'General'],
        General: ['General'],
      };
      const preferredWardTypes = classToWardType[data.patient_class ?? 'General'] ?? ['General'];
      if (preferredWardTypes.some((t: string) => bed.wards?.ward_type?.includes(t))) score += 50;

      // Rule 3: Doctor/ward preference
      if (data.ward_preference && bed.ward_id === data.ward_preference) score += 30;

      // Rule 4: Equipment requirements
      if (data.require_oxygen && bed.is_oxygen_port) score += 20;
      if (data.require_monitor && bed.is_monitor_equipped) score += 20;

      // Rule 5: Not isolation bed for non-isolation patient (preserve isolation beds)
      if (!needsIsolation && bed.is_isolation) score -= 10;

      return { bed, score };
    });

    // Filter disqualified beds, sort by score desc
    const eligible = scored
      .filter((s: any) => s.score > -500)
      .sort((a: any, b: any) => b.score - a.score);

    if (eligible.length === 0) {
      return { success: false, error: 'No suitable bed found matching patient requirements' };
    }

    const best = eligible[0].bed;
    return {
      success: true,
      data: {
        bed_id: best.bed_id,
        ward_id: best.ward_id,
        ward_name: best.wards?.ward_name,
        ward_type: best.wards?.ward_type,
        is_isolation: best.is_isolation,
        score: eligible[0].score,
        alternatives: eligible.slice(1, 5).map((e: any) => ({
          bed_id: e.bed.bed_id,
          ward_name: e.bed.wards?.ward_name,
          score: e.score,
        })),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
