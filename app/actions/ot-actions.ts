"use server";

import { requireTenantContext } from "@/backend/tenant";
import { prisma } from "@/backend/db";
import { logAudit } from "@/app/lib/audit";
import { revalidatePath } from "next/cache";
import { postChargeToIpdBill } from "@/app/actions/ipd-finance-actions";

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

async function nextRequestNumber(
  db: any,
  organizationId: string,
): Promise<string> {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `SR-${yyyymmdd}-`;
  const count = await db.surgeryRequest.count({
    where: {
      organizationId,
      request_number: { startsWith: prefix },
    },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

// ============================================
// Surgery Requests
// ============================================

export async function createSurgeryRequest(input: {
  patient_id: string;
  admission_id?: string | null;
  appointment_id?: string | null;
  requesting_doctor_id: string;
  surgery_master_id?: string | null;
  surgery_name: string;
  surgery_category?: string | null;
  urgency?: "Elective" | "Urgent" | "Emergency";
  clinical_notes?: string | null;
  diagnosis?: string | null;
  icd_codes?: string[] | null;
  requested_date?: string | Date | null;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const request_number = await nextRequestNumber(db, organizationId);

    const created = await db.surgeryRequest.create({
      data: {
        organizationId,
        request_number,
        patient_id: input.patient_id,
        admission_id: input.admission_id ?? null,
        appointment_id: input.appointment_id ?? null,
        requesting_doctor_id: input.requesting_doctor_id,
        surgery_master_id: input.surgery_master_id ?? null,
        surgery_name: input.surgery_name,
        surgery_category: input.surgery_category ?? null,
        urgency: input.urgency ?? "Elective",
        clinical_notes: input.clinical_notes ?? null,
        diagnosis: input.diagnosis ?? null,
        icd_codes: input.icd_codes ?? undefined,
        requested_date: input.requested_date ? new Date(input.requested_date) : null,
        status: "Requested",
      },
    });

    await logAudit({
      action: "CREATE_SURGERY_REQUEST",
      module: "ot",
      entity_type: "SurgeryRequest",
      entity_id: created.id,
      details: `Surgery request ${request_number} for ${input.surgery_name}`,
    });

    revalidatePath("/ot/requests");
    return { success: true, data: serialize(created) };
  } catch (error: any) {
    console.error("createSurgeryRequest error:", error);
    return { success: false, error: error?.message ?? "Failed to create surgery request" };
  }
}

export async function approveSurgeryRequest(
  requestId: string,
  approverName: string,
) {
  try {
    const { db } = await requireTenantContext();
    const updated = await db.surgeryRequest.update({
      where: { id: requestId },
      data: {
        status: "Approved",
        approved_by: approverName,
        approved_at: new Date(),
      },
    });
    await logAudit({
      action: "APPROVE_SURGERY_REQUEST",
      module: "ot",
      entity_type: "SurgeryRequest",
      entity_id: requestId,
      details: `Approved by ${approverName}`,
    });
    revalidatePath("/ot/requests");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    console.error("approveSurgeryRequest error:", error);
    return { success: false, error: error?.message };
  }
}

export async function rejectSurgeryRequest(requestId: string, reason: string) {
  try {
    const { db } = await requireTenantContext();
    const updated = await db.surgeryRequest.update({
      where: { id: requestId },
      data: { status: "Cancelled", cancelled_reason: reason },
    });
    await logAudit({
      action: "REJECT_SURGERY_REQUEST",
      module: "ot",
      entity_type: "SurgeryRequest",
      entity_id: requestId,
      details: reason,
    });
    revalidatePath("/ot/requests");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    console.error("rejectSurgeryRequest error:", error);
    return { success: false, error: error?.message };
  }
}

export async function cancelSurgery(requestId: string, reason: string) {
  return rejectSurgeryRequest(requestId, reason);
}

export async function listSurgeryRequests(filter?: { status?: string }) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const requests = await db.surgeryRequest.findMany({
      where: {
        organizationId,
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: {
        schedule: { include: { ot_room: true } },
        pac: true,
        checklist: true,
        team: true,
        billing: true,
        consumables: true,
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
    return { success: true, data: serialize(requests) };
  } catch (error: any) {
    console.error("listSurgeryRequests error:", error);
    return { success: false, data: [] };
  }
}

export async function getSurgeryRequest(id: string) {
  try {
    const { db } = await requireTenantContext();
    const req = await db.surgeryRequest.findUnique({
      where: { id },
      include: {
        schedule: { include: { ot_room: true } },
        pac: true,
        checklist: true,
        team: true,
        billing: true,
        consumables: true,
        notes: { orderBy: { created_at: "desc" } },
      },
    });
    if (!req) return { success: false, error: "Not found" };
    return { success: true, data: serialize(req) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// OT Scheduling
// ============================================

export async function scheduleSurgery(input: {
  surgery_request_id: string;
  ot_room_id: string;
  scheduled_date: string | Date;
  start_time: string;
  end_time: string;
  team?: Array<{
    role: string;
    doctor_id?: string | null;
    staff_name: string;
    specialty?: string | null;
  }>;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const scheduledDate = new Date(input.scheduled_date);

    // Conflict check: same OT room overlapping window
    const overlap = await db.oTSchedule.findFirst({
      where: {
        organizationId,
        ot_room_id: input.ot_room_id,
        scheduled_date: {
          gte: new Date(scheduledDate.setHours(0, 0, 0, 0)),
          lte: new Date(scheduledDate.setHours(23, 59, 59, 999)),
        },
        status: { in: ["Scheduled", "InProgress"] },
        AND: [
          { start_time: { lt: input.end_time } },
          { end_time: { gt: input.start_time } },
        ],
      },
    });
    if (overlap) {
      return {
        success: false,
        error: `OT room conflict at ${overlap.start_time}–${overlap.end_time}`,
      };
    }

    const schedule = await db.oTSchedule.upsert({
      where: { surgery_request_id: input.surgery_request_id },
      create: {
        organizationId,
        surgery_request_id: input.surgery_request_id,
        ot_room_id: input.ot_room_id,
        scheduled_date: new Date(input.scheduled_date),
        start_time: input.start_time,
        end_time: input.end_time,
        status: "Scheduled",
      },
      update: {
        ot_room_id: input.ot_room_id,
        scheduled_date: new Date(input.scheduled_date),
        start_time: input.start_time,
        end_time: input.end_time,
        status: "Scheduled",
      },
    });

    // Replace team if provided
    if (input.team && input.team.length > 0) {
      await db.surgeryTeamMember.deleteMany({
        where: { surgery_request_id: input.surgery_request_id },
      });
      await db.surgeryTeamMember.createMany({
        data: input.team.map((t) => ({
          surgery_request_id: input.surgery_request_id,
          role: t.role,
          doctor_id: t.doctor_id ?? null,
          staff_name: t.staff_name,
          specialty: t.specialty ?? null,
        })),
      });
    }

    await db.surgeryRequest.update({
      where: { id: input.surgery_request_id },
      data: { status: "Scheduled" },
    });

    await logAudit({
      action: "SCHEDULE_SURGERY",
      module: "ot",
      entity_type: "OTSchedule",
      entity_id: schedule.id,
      details: `Scheduled in room ${input.ot_room_id} ${input.start_time}-${input.end_time}`,
    });

    revalidatePath("/ot/calendar");
    revalidatePath("/ot/worklist");
    return { success: true, data: serialize(schedule) };
  } catch (error: any) {
    console.error("scheduleSurgery error:", error);
    return { success: false, error: error?.message };
  }
}

export async function rescheduleSurgery(input: {
  surgery_request_id: string;
  ot_room_id: string;
  scheduled_date: string | Date;
  start_time: string;
  end_time: string;
}) {
  return scheduleSurgery(input);
}

export async function getOTCalendar(dateStr: string, ot_room_id?: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const day = new Date(dateStr);
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(day);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    const [rooms, schedules] = await Promise.all([
      db.oTRoom.findMany({
        where: { organizationId, is_active: true },
        orderBy: { room_name: "asc" },
      }),
      db.oTSchedule.findMany({
        where: {
          organizationId,
          scheduled_date: { gte: dayStart, lte: weekEnd },
          ...(ot_room_id ? { ot_room_id } : {}),
        },
        include: {
          ot_room: true,
          surgery: { include: { team: true } },
        },
        orderBy: [{ scheduled_date: "asc" }, { start_time: "asc" }],
      }),
    ]);

    return {
      success: true,
      data: { rooms: serialize(rooms), schedules: serialize(schedules) },
    };
  } catch (error: any) {
    console.error("getOTCalendar error:", error);
    return { success: false, data: { rooms: [], schedules: [] } };
  }
}

export async function getOTWorklist(dateStr?: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const target = dateStr ? new Date(dateStr) : new Date();
    const dayStart = new Date(target);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(target);
    dayEnd.setHours(23, 59, 59, 999);

    const schedules = await db.oTSchedule.findMany({
      where: {
        organizationId,
        scheduled_date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        ot_room: true,
        surgery: { include: { pac: true, checklist: true, team: true } },
      },
      orderBy: { start_time: "asc" },
    });
    return { success: true, data: serialize(schedules) };
  } catch (error: any) {
    console.error("getOTWorklist error:", error);
    return { success: false, data: [] };
  }
}

// ============================================
// PAC Clearance
// ============================================

export async function savePACClearance(input: {
  surgery_request_id: string;
  anesthetist_id?: string | null;
  anesthetist_name?: string | null;
  asa_grade?: string | null;
  anesthesia_type?: string | null;
  airway_assessment?: Record<string, unknown> | null;
  pre_op_investigations?: Record<string, unknown> | null;
  fitness_status: "Pending" | "Fit" | "Unfit" | "ConditionallyFit";
  conditions?: string | null;
  notes?: string | null;
}) {
  try {
    const { db } = await requireTenantContext();
    const cleared = input.fitness_status === "Fit" || input.fitness_status === "ConditionallyFit";

    const pac = await db.pACClearance.upsert({
      where: { surgery_request_id: input.surgery_request_id },
      create: {
        surgery_request_id: input.surgery_request_id,
        anesthetist_id: input.anesthetist_id ?? null,
        anesthetist_name: input.anesthetist_name ?? null,
        asa_grade: input.asa_grade ?? null,
        anesthesia_type: input.anesthesia_type ?? null,
        airway_assessment: (input.airway_assessment as any) ?? undefined,
        pre_op_investigations: (input.pre_op_investigations as any) ?? undefined,
        fitness_status: input.fitness_status,
        conditions: input.conditions ?? null,
        notes: input.notes ?? null,
        cleared_at: cleared ? new Date() : null,
      },
      update: {
        anesthetist_id: input.anesthetist_id ?? null,
        anesthetist_name: input.anesthetist_name ?? null,
        asa_grade: input.asa_grade ?? null,
        anesthesia_type: input.anesthesia_type ?? null,
        airway_assessment: (input.airway_assessment as any) ?? undefined,
        pre_op_investigations: (input.pre_op_investigations as any) ?? undefined,
        fitness_status: input.fitness_status,
        conditions: input.conditions ?? null,
        notes: input.notes ?? null,
        cleared_at: cleared ? new Date() : null,
      },
    });

    if (cleared) {
      await db.surgeryRequest.update({
        where: { id: input.surgery_request_id },
        data: { status: "PAC_Cleared" },
      });
    } else {
      await db.surgeryRequest.update({
        where: { id: input.surgery_request_id },
        data: { status: "PAC_Pending" },
      });
    }

    await logAudit({
      action: "SAVE_PAC_CLEARANCE",
      module: "ot",
      entity_type: "PACClearance",
      entity_id: pac.id,
      details: `Fitness: ${input.fitness_status}`,
    });

    revalidatePath("/ot/pac");
    return { success: true, data: serialize(pac) };
  } catch (error: any) {
    console.error("savePACClearance error:", error);
    return { success: false, error: error?.message };
  }
}

// ============================================
// WHO Surgical Safety Checklist
// ============================================

export async function saveOTChecklist(input: {
  surgery_request_id: string;
  phase: "sign_in" | "time_out" | "sign_out";
  data: Record<string, unknown>;
  signed_by: string;
}) {
  try {
    const { db } = await requireTenantContext();
    const now = new Date();
    const fieldData: Record<string, unknown> = {};
    fieldData[input.phase] = input.data as any;
    fieldData[`${input.phase}_by`] = input.signed_by;
    fieldData[`${input.phase}_at`] = now;

    const checklist = await db.oTChecklist.upsert({
      where: { surgery_request_id: input.surgery_request_id },
      create: { surgery_request_id: input.surgery_request_id, ...(fieldData as any) },
      update: fieldData as any,
    });

    // If all 3 WHO phases (sign_in / time_out / sign_out) are now signed,
    // auto-advance the surgery request to "Ready" so OT manager can see
    // it's cleared for theatre start. Subsequent recordWheelIn / startSurgery
    // will move it through InProgress → Completed.
    const allSigned = !!(checklist as any).sign_in_at &&
      !!(checklist as any).time_out_at &&
      !!(checklist as any).sign_out_at;
    if (allSigned) {
      const current = await db.surgeryRequest.findUnique({
        where: { id: input.surgery_request_id },
        select: { status: true },
      });
      // Only auto-advance from earlier states — don't overwrite InProgress / Completed
      const advanceableStates = ['PAC_Cleared', 'PAC_Pending', 'Scheduled'];
      if (current && advanceableStates.includes(current.status)) {
        await db.surgeryRequest.update({
          where: { id: input.surgery_request_id },
          data: { status: 'Ready' },
        });
      }
    }

    await logAudit({
      action: "SAVE_OT_CHECKLIST",
      module: "ot",
      entity_type: "OTChecklist",
      entity_id: checklist.id,
      details: `${input.phase} signed by ${input.signed_by}${allSigned ? ' — surgery now READY' : ''}`,
    });

    revalidatePath(`/ot/checklist/${input.surgery_request_id}`);
    revalidatePath(`/ot/worklist`);
    return { success: true, data: serialize(checklist), now_ready: allSigned };
  } catch (error: any) {
    console.error("saveOTChecklist error:", error);
    return { success: false, error: error?.message };
  }
}

// ============================================
// Surgery Lifecycle / Wheel-in/out
// ============================================

export async function recordWheelIn(surgery_request_id: string) {
  try {
    const { db } = await requireTenantContext();
    const sched = await db.oTSchedule.update({
      where: { surgery_request_id },
      data: { wheel_in_time: new Date(), status: "InProgress" },
    });
    await db.surgeryRequest.update({
      where: { id: surgery_request_id },
      data: { status: "InProgress" },
    });
    await logAudit({
      action: "WHEEL_IN",
      module: "ot",
      entity_type: "OTSchedule",
      entity_id: sched.id,
    });
    revalidatePath("/ot/worklist");
    return { success: true, data: serialize(sched) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function recordWheelOut(surgery_request_id: string) {
  try {
    const { db } = await requireTenantContext();
    const sched = await db.oTSchedule.update({
      where: { surgery_request_id },
      data: { wheel_out_time: new Date() },
    });
    await logAudit({
      action: "WHEEL_OUT",
      module: "ot",
      entity_type: "OTSchedule",
      entity_id: sched.id,
    });
    revalidatePath("/ot/worklist");
    return { success: true, data: serialize(sched) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function startSurgery(surgery_request_id: string) {
  try {
    const { db } = await requireTenantContext();
    const sched = await db.oTSchedule.update({
      where: { surgery_request_id },
      data: { actual_start: new Date(), status: "InProgress" },
    });
    await db.surgeryRequest.update({
      where: { id: surgery_request_id },
      data: { status: "InProgress" },
    });
    await logAudit({
      action: "START_SURGERY",
      module: "ot",
      entity_type: "OTSchedule",
      entity_id: sched.id,
    });
    revalidatePath("/ot/worklist");
    return { success: true, data: serialize(sched) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function completeSurgery(surgery_request_id: string) {
  try {
    const { db } = await requireTenantContext();
    const sched = await db.oTSchedule.update({
      where: { surgery_request_id },
      data: { actual_end: new Date(), status: "Completed" },
    });
    await db.surgeryRequest.update({
      where: { id: surgery_request_id },
      data: { status: "Completed" },
    });
    await logAudit({
      action: "COMPLETE_SURGERY",
      module: "ot",
      entity_type: "OTSchedule",
      entity_id: sched.id,
    });
    revalidatePath("/ot/worklist");
    return { success: true, data: serialize(sched) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Notes & Consumables
// ============================================

export async function saveSurgeryNote(input: {
  surgery_request_id: string;
  note_type: "Pre-Op" | "Intra-Op" | "Post-Op" | "Anesthesia";
  content: string;
  findings?: string | null;
  complications?: string | null;
  blood_loss_ml?: number | null;
  duration_mins?: number | null;
  created_by: string;
}) {
  try {
    const { db } = await requireTenantContext();
    const note = await db.surgeryNote.create({
      data: {
        surgery_request_id: input.surgery_request_id,
        note_type: input.note_type,
        content: input.content,
        findings: input.findings ?? null,
        complications: input.complications ?? null,
        blood_loss_ml: input.blood_loss_ml ?? null,
        duration_mins: input.duration_mins ?? null,
        created_by: input.created_by,
      },
    });
    revalidatePath(`/ot/notes/${input.surgery_request_id}`);
    return { success: true, data: serialize(note) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function addSurgeryConsumable(input: {
  surgery_request_id: string;
  item_name: string;
  item_code?: string | null;
  quantity?: number;
  unit_price?: number | null;
  is_implant?: boolean;
  batch_no?: string | null;
  serial_no?: string | null;
}) {
  try {
    const { db } = await requireTenantContext();
    const item = await db.surgeryConsumable.create({
      data: {
        surgery_request_id: input.surgery_request_id,
        item_name: input.item_name,
        item_code: input.item_code ?? null,
        quantity: input.quantity ?? 1,
        unit_price: input.unit_price ?? null,
        is_implant: input.is_implant ?? false,
        batch_no: input.batch_no ?? null,
        serial_no: input.serial_no ?? null,
      },
    });
    return { success: true, data: serialize(item) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Billing
// ============================================

export async function updateSurgeryBillFees(
  surgery_request_id: string,
  fees: {
    surgeon_fee: number;
    anesthesia_fee: number;
    ot_charges: number;
  },
) {
  try {
    const { db } = await requireTenantContext();
    const existing = await db.surgeryBilling.findUnique({ where: { surgery_request_id } });
    const consumable_total = Number(existing?.consumable_total ?? 0);
    const implant_total = Number(existing?.implant_total ?? 0);
    const total_amount =
      fees.surgeon_fee + fees.anesthesia_fee + fees.ot_charges + consumable_total + implant_total;

    const billing = await db.surgeryBilling.upsert({
      where: { surgery_request_id },
      create: {
        surgery_request_id,
        surgeon_fee: fees.surgeon_fee,
        anesthesia_fee: fees.anesthesia_fee,
        ot_charges: fees.ot_charges,
        consumable_total,
        implant_total,
        total_amount,
      },
      update: {
        surgeon_fee: fees.surgeon_fee,
        anesthesia_fee: fees.anesthesia_fee,
        ot_charges: fees.ot_charges,
        total_amount,
      },
    });

    await logAudit({
      action: "UPDATE_SURGERY_BILL_FEES",
      module: "ot",
      entity_type: "SurgeryBilling",
      entity_id: billing.id,
      details: `Fees updated — surgeon: ${fees.surgeon_fee}, anesthesia: ${fees.anesthesia_fee}, OT: ${fees.ot_charges}`,
    });

    revalidatePath("/ot/billing");
    return { success: true, data: serialize(billing) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function generateSurgeryBill(surgery_request_id: string) {
  try {
    const { db } = await requireTenantContext();
    const req = await db.surgeryRequest.findUnique({
      where: { id: surgery_request_id },
      include: {
        consumables: true,
      },
    });
    if (!req) return { success: false, error: "Surgery request not found" };

    let surgeon_fee = 0;
    let anesthesia_fee = 0;
    let ot_charges = 0;
    if (req.surgery_master_id) {
      const master = await db.surgeryMaster.findUnique({
        where: { id: req.surgery_master_id },
      });
      const components = (master?.billing_components as any) ?? {};
      surgeon_fee = Number(components.surgeon_fee ?? 0);
      anesthesia_fee = Number(components.anesthesia_fee ?? 0);
      ot_charges = Number(components.ot_charges ?? 0);
    }

    let consumable_total = 0;
    let implant_total = 0;
    for (const c of req.consumables) {
      const line = Number(c.unit_price ?? 0) * (c.quantity ?? 1);
      if (c.is_implant) implant_total += line;
      else consumable_total += line;
    }
    const total_amount =
      surgeon_fee + anesthesia_fee + ot_charges + consumable_total + implant_total;

    const billing = await db.surgeryBilling.upsert({
      where: { surgery_request_id },
      create: {
        surgery_request_id,
        surgeon_fee,
        anesthesia_fee,
        ot_charges,
        consumable_total,
        implant_total,
        total_amount,
      },
      update: {
        surgeon_fee,
        anesthesia_fee,
        ot_charges,
        consumable_total,
        implant_total,
        total_amount,
      },
    });

    await logAudit({
      action: "GENERATE_SURGERY_BILL",
      module: "ot",
      entity_type: "SurgeryBilling",
      entity_id: billing.id,
      details: `Total ${total_amount}`,
    });

    revalidatePath("/ot/billing");
    return { success: true, data: serialize(billing) };
  } catch (error: any) {
    console.error("generateSurgeryBill error:", error);
    return { success: false, error: error?.message };
  }
}

/**
 * Post OT surgery charges to the patient's active IPD invoice.
 *
 * Previously this only flipped `posted_to_ipd = true` without actually
 * creating any invoice line items — silent revenue loss at discharge.
 *
 * Now: creates one invoice_item per charge component (surgeon fee, anesthesia,
 * OT room) plus one row per consumable / implant, via the standard
 * postChargeToIpdBill helper. Implants are tagged separately (per spec
 * exclusion: implants are NEVER covered by IPD packages).
 *
 * Idempotent on the SurgeryBilling.posted_to_ipd flag — won't double-post.
 */
export async function postSurgeryChargesToIPD(surgery_request_id: string) {
  try {
    const { db } = await requireTenantContext();
    const req = await db.surgeryRequest.findUnique({
      where: { id: surgery_request_id },
      include: {
        billing: true,
        consumables: true,
      },
    });
    if (!req?.admission_id) {
      return { success: false, error: "Surgery is not linked to an admission" };
    }
    if (!req.billing) {
      return { success: false, error: "No billing generated yet — click Generate Bill first" };
    }
    if (req.billing.posted_to_ipd) {
      return { success: false, error: "Already posted to IPD" };
    }

    const admissionId = req.admission_id;
    const billingId = String(req.billing.id);
    const surgeryName = req.surgery_name || 'Surgery';

    // 1. Surgeon fee
    if (Number(req.billing.surgeon_fee) > 0) {
      await postChargeToIpdBill({
        admission_id: admissionId,
        source_module: 'ot',
        source_ref_id: `OT-${billingId}-surgeon`,
        description: `${surgeryName} — Surgeon Fee`,
        quantity: 1,
        unit_price: Number(req.billing.surgeon_fee),
        service_category: 'Procedure',
        hsn_sac_code: '9993',
      });
    }

    // 2. Anesthesia fee
    if (Number(req.billing.anesthesia_fee) > 0) {
      await postChargeToIpdBill({
        admission_id: admissionId,
        source_module: 'ot',
        source_ref_id: `OT-${billingId}-anesthesia`,
        description: `${surgeryName} — Anesthesia Fee`,
        quantity: 1,
        unit_price: Number(req.billing.anesthesia_fee),
        service_category: 'Procedure',
        hsn_sac_code: '9993',
      });
    }

    // 3. OT room charges
    if (Number(req.billing.ot_charges) > 0) {
      await postChargeToIpdBill({
        admission_id: admissionId,
        source_module: 'ot',
        source_ref_id: `OT-${billingId}-room`,
        description: `${surgeryName} — OT Room Charges`,
        quantity: 1,
        unit_price: Number(req.billing.ot_charges),
        service_category: 'Procedure',
        hsn_sac_code: '9993',
      });
    }

    // 4. Each consumable / implant (line-by-line for transparency)
    //    Implants get a clear "(Implant)" suffix so they're easy to spot — and
    //    they're correctly excluded from any IPD package coverage per spec.
    for (const c of (req.consumables || [])) {
      const isImplant = !!(c as any).is_implant;
      const lineLabel = `${surgeryName} — ${c.item_name}${isImplant ? ' (Implant)' : ''}` +
        (c.batch_no ? ` [Batch ${c.batch_no}]` : '');
      await postChargeToIpdBill({
        admission_id: admissionId,
        source_module: 'ot',
        source_ref_id: `OT-${billingId}-cons-${c.id}`,
        description: lineLabel,
        quantity: Number(c.quantity || 1),
        unit_price: Number(c.unit_price || 0),
        service_category: isImplant ? 'Implant' : 'Consumable',
        hsn_sac_code: '9993',
      });
    }

    // 5. Mark posted + capture link to the IPD invoice for the SurgeryBilling row
    //    (find the active IPD invoice for this admission)
    const invoice = await db.invoices.findFirst({
      where: { admission_id: admissionId, status: { not: 'Cancelled' } },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });

    await db.surgeryBilling.update({
      where: { surgery_request_id },
      data: {
        posted_to_ipd: true,
        invoice_id: invoice?.id ?? null,
      },
    });

    await logAudit({
      action: "POST_SURGERY_CHARGES_TO_IPD",
      module: "ot",
      entity_type: "SurgeryBilling",
      entity_id: req.billing.id,
      details: `Posted ${req.billing.total_amount} to admission ${admissionId}; invoice_id=${invoice?.id ?? 'n/a'}; consumables=${(req.consumables || []).length}`,
    });

    revalidatePath("/ot/billing");
    revalidatePath("/ipd/billing");
    revalidatePath(`/ipd/admission/${admissionId}`);
    return {
      success: true,
      data: {
        admission_id: admissionId,
        invoice_id: invoice?.id ?? null,
        total: Number(req.billing.total_amount),
        lines_posted: 3 + (req.consumables || []).length,
      },
    };
  } catch (error: any) {
    console.error('postSurgeryChargesToIPD error:', error);
    return { success: false, error: error?.message };
  }
}

// ============================================
// Stats & Master Data
// ============================================

export async function getOTStats(days = 30) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalRequests, completed, cancelled, schedules] = await Promise.all([
      db.surgeryRequest.count({
        where: { organizationId, created_at: { gte: since } },
      }),
      db.surgeryRequest.count({
        where: { organizationId, status: "Completed", created_at: { gte: since } },
      }),
      db.surgeryRequest.count({
        where: { organizationId, status: "Cancelled", created_at: { gte: since } },
      }),
      db.oTSchedule.findMany({
        where: {
          organizationId,
          scheduled_date: { gte: since },
          status: "Completed",
          actual_start: { not: null },
          actual_end: { not: null },
        },
        select: { actual_start: true, actual_end: true, ot_room_id: true },
      }),
    ]);

    const durations = schedules.map((s: { actual_start: Date | null; actual_end: Date | null }) => {
      const start = s.actual_start as Date;
      const end = s.actual_end as Date;
      return (end.getTime() - start.getTime()) / 60000;
    });
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
        : 0;

    const rooms = await db.oTRoom.count({
      where: { organizationId, is_active: true },
    });

    return {
      success: true,
      data: {
        total_requests: totalRequests,
        completed,
        cancelled,
        avg_duration_mins: avgDuration,
        active_rooms: rooms,
        cancellation_rate: totalRequests > 0 ? Math.round((cancelled / totalRequests) * 100) : 0,
      },
    };
  } catch (error: any) {
    console.error("getOTStats error:", error);
    return { success: false, data: null };
  }
}

export async function listOTRooms() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const rooms = await db.oTRoom.findMany({
      where: { organizationId },
      orderBy: { room_name: "asc" },
    });
    return { success: true, data: serialize(rooms) };
  } catch (error: any) {
    return { success: false, data: [] };
  }
}

export async function createOTRoom(input: {
  room_name: string;
  room_type: string;
  floor?: string | null;
  wing?: string | null;
  equipment?: string[] | null;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const room = await db.oTRoom.create({
      data: {
        organizationId,
        room_name: input.room_name,
        room_type: input.room_type,
        floor: input.floor ?? null,
        wing: input.wing ?? null,
        equipment: input.equipment ?? undefined,
      },
    });
    revalidatePath("/admin/ot-setup");
    return { success: true, data: serialize(room) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function updateOTRoom(
  id: string,
  input: Partial<{
    room_name: string;
    room_type: string;
    floor: string | null;
    wing: string | null;
    equipment: string[] | null;
    is_active: boolean;
  }>,
) {
  try {
    const { db } = await requireTenantContext();
    const room = await db.oTRoom.update({
      where: { id },
      data: {
        ...input,
        equipment: input.equipment === undefined ? undefined : (input.equipment as any),
      },
    });
    revalidatePath("/admin/ot-setup");
    return { success: true, data: serialize(room) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function listSurgeryMasters() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const masters = await db.surgeryMaster.findMany({
      where: { organizationId, is_active: true },
      orderBy: { surgery_name: "asc" },
    });
    return { success: true, data: serialize(masters) };
  } catch (error: any) {
    return { success: false, data: [] };
  }
}

export async function createSurgeryMaster(input: {
  surgery_code: string;
  surgery_name: string;
  category: string;
  sub_category?: string | null;
  default_duration_mins?: number;
  ot_room_type?: string | null;
  requires_icu?: boolean;
  billing_components?: Record<string, number> | null;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const master = await db.surgeryMaster.create({
      data: {
        organizationId,
        surgery_code: input.surgery_code,
        surgery_name: input.surgery_name,
        category: input.category,
        sub_category: input.sub_category ?? null,
        default_duration_mins: input.default_duration_mins ?? 60,
        ot_room_type: input.ot_room_type ?? null,
        requires_icu: input.requires_icu ?? false,
        billing_components: (input.billing_components as any) ?? undefined,
      },
    });
    revalidatePath("/admin/ot-setup");
    return { success: true, data: serialize(master) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function getOTDashboard() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [todaySchedules, pendingRequests, inProgress, activeRooms] = await Promise.all([
      db.oTSchedule.findMany({
        where: {
          organizationId,
          scheduled_date: { gte: todayStart, lte: todayEnd },
        },
        include: {
          ot_room: true,
          surgery: { include: { pac: true } },
        },
        orderBy: { start_time: "asc" },
      }),
      db.surgeryRequest.count({
        where: { organizationId, status: "Requested" },
      }),
      db.surgeryRequest.count({
        where: { organizationId, status: "InProgress" },
      }),
      db.oTRoom.count({
        where: { organizationId, is_active: true },
      }),
    ]);

    return {
      success: true,
      data: {
        today_schedules: serialize(todaySchedules),
        pending_requests: pendingRequests,
        in_progress: inProgress,
        active_rooms: activeRooms,
      },
    };
  } catch (error: any) {
    console.error("getOTDashboard error:", error);
    return { success: false, data: null };
  }
}
