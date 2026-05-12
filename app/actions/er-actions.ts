"use server";

import { requireTenantContext } from "@/backend/tenant";
import { logAudit } from "@/app/lib/audit";
import { revalidatePath } from "next/cache";

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

async function nextERNumber(db: any, organizationId: string): Promise<string> {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `ER-${yyyymmdd}-`;
  const count = await db.eRRegistration.count({
    where: { organizationId, er_number: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

async function nextMLCNumber(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `MLC-${year}-`;
  const count = await db.mLCRecord.count({
    where: { mlc_number: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

// ESI (Emergency Severity Index): 1=resuscitation, 2=emergent, 3=urgent, 4=less urgent, 5=non-urgent
function esiToColor(level: string): string {
  switch (level) {
    case "1":
      return "Red";
    case "2":
      return "Orange";
    case "3":
      return "Yellow";
    case "4":
      return "Green";
    case "5":
      return "Blue";
    default:
      return "Green";
  }
}

// ============================================
// Registration
// ============================================

export async function registerERPatient(input: {
  patient_id?: string | null;
  patient_name: string;
  is_unknown?: boolean;
  age_estimate?: string | null;
  gender?: string | null;
  brought_by?: string | null;
  arrival_mode?: string | null;
  chief_complaint: string;
  is_mlc?: boolean;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const er_number = await nextERNumber(db, organizationId);

    const reg = await db.eRRegistration.create({
      data: {
        organizationId,
        er_number,
        patient_id: input.patient_id ?? null,
        patient_name: input.patient_name,
        is_unknown: input.is_unknown ?? false,
        age_estimate: input.age_estimate ?? null,
        gender: input.gender ?? null,
        brought_by: input.brought_by ?? null,
        arrival_mode: input.arrival_mode ?? null,
        chief_complaint: input.chief_complaint,
        is_mlc: input.is_mlc ?? false,
        status: "Triaged",
      },
    });

    await logAudit({
      action: "ER_REGISTER",
      module: "er",
      entity_type: "ERRegistration",
      entity_id: reg.id,
      details: `${er_number} ${input.is_unknown ? "(unknown)" : input.patient_name}`,
    });

    revalidatePath("/er/dashboard");
    return { success: true, data: serialize(reg) };
  } catch (error: any) {
    console.error("registerERPatient error:", error);
    return { success: false, error: error?.message };
  }
}

export async function registerUnknownPatient(input: {
  age_estimate?: string | null;
  gender?: "Male" | "Female" | "Unknown";
  brought_by?: string | null;
  arrival_mode?: string | null;
  chief_complaint: string;
  is_mlc?: boolean;
}) {
  const label = `Unknown ${input.gender ?? "Person"} ${input.age_estimate ? `~${input.age_estimate}` : ""}`.trim();
  return registerERPatient({
    patient_name: label,
    is_unknown: true,
    age_estimate: input.age_estimate ?? null,
    gender: input.gender ?? null,
    brought_by: input.brought_by ?? null,
    arrival_mode: input.arrival_mode ?? null,
    chief_complaint: input.chief_complaint,
    is_mlc: input.is_mlc ?? false,
  });
}

export async function bulkRegisterER(
  rows: Array<{
    patient_name: string;
    chief_complaint: string;
    is_unknown?: boolean;
    age_estimate?: string | null;
    gender?: string | null;
    triage_level?: string | null;
    brought_by?: string | null;
  }>,
) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const created: string[] = [];
    for (const r of rows) {
      const er_number = await nextERNumber(db, organizationId);
      const reg = await db.eRRegistration.create({
        data: {
          organizationId,
          er_number,
          patient_name: r.patient_name,
          is_unknown: r.is_unknown ?? false,
          age_estimate: r.age_estimate ?? null,
          gender: r.gender ?? null,
          brought_by: r.brought_by ?? "Mass Casualty",
          chief_complaint: r.chief_complaint,
          triage_level: r.triage_level ?? null,
          triage_color: r.triage_level ? esiToColor(r.triage_level) : null,
          status: "Triaged",
        },
      });
      created.push(reg.id);
    }

    await logAudit({
      action: "ER_BULK_REGISTER",
      module: "er",
      details: `Mass casualty intake: ${created.length} records`,
    });

    revalidatePath("/er/dashboard");
    return { success: true, data: { count: created.length, ids: created } };
  } catch (error: any) {
    console.error("bulkRegisterER error:", error);
    return { success: false, error: error?.message };
  }
}

// ============================================
// Triage
// ============================================

export async function triageERPatient(input: {
  er_registration_id: string;
  triage_level: "1" | "2" | "3" | "4" | "5";
  triage_nurse_id: string;
  bed_id?: string | null;
}) {
  try {
    const { db } = await requireTenantContext();
    const triage_color = esiToColor(input.triage_level);
    const updated = await db.eRRegistration.update({
      where: { id: input.er_registration_id },
      data: {
        triage_level: input.triage_level,
        triage_color,
        triage_nurse_id: input.triage_nurse_id,
        triage_time: new Date(),
        bed_id: input.bed_id ?? null,
        status: "UnderTreatment",
      },
    });
    await logAudit({
      action: "ER_TRIAGE",
      module: "er",
      entity_type: "ERRegistration",
      entity_id: input.er_registration_id,
      details: `ESI ${input.triage_level} (${triage_color})`,
    });
    revalidatePath("/er/dashboard");
    revalidatePath("/er/tracking-board");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Dashboard / Tracking Board
// ============================================

export async function getERDashboard() {
  try {
    const { db, organizationId } = await requireTenantContext();

    const active = await db.eRRegistration.findMany({
      where: {
        organizationId,
        status: { in: ["Triaged", "UnderTreatment", "Observation"] },
      },
      include: {
        er_vitals: { orderBy: { recorded_at: "desc" }, take: 1 },
        mlc_record: true,
      },
      orderBy: [{ triage_level: "asc" }, { arrival_time: "asc" }],
    });

    const byLevel: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const r of active) {
      const level = r.triage_level || "5";
      byLevel[level] = (byLevel[level] || 0) + 1;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayCount, mlcCount] = await Promise.all([
      db.eRRegistration.count({
        where: { organizationId, arrival_time: { gte: todayStart } },
      }),
      db.eRRegistration.count({
        where: { organizationId, is_mlc: true, arrival_time: { gte: todayStart } },
      }),
    ]);

    return {
      success: true,
      data: {
        active: serialize(active),
        by_triage_level: byLevel,
        today_count: todayCount,
        today_mlc_count: mlcCount,
      },
    };
  } catch (error: any) {
    console.error("getERDashboard error:", error);
    return { success: false, data: null };
  }
}

export async function getERTrackingBoard() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const active = await db.eRRegistration.findMany({
      where: {
        organizationId,
        status: { in: ["Triaged", "UnderTreatment", "Observation"] },
      },
      include: {
        er_vitals: { orderBy: { recorded_at: "desc" }, take: 1 },
      },
      orderBy: [{ triage_level: "asc" }, { arrival_time: "asc" }],
    });
    return { success: true, data: serialize(active) };
  } catch (error: any) {
    return { success: false, data: [] };
  }
}

export async function getERPatient(id: string) {
  try {
    const { db } = await requireTenantContext();
    const reg = await db.eRRegistration.findUnique({
      where: { id },
      include: {
        er_vitals: { orderBy: { recorded_at: "desc" } },
        er_orders: { orderBy: { ordered_at: "desc" } },
        er_notes: { orderBy: { created_at: "desc" } },
        mlc_record: true,
      },
    });
    if (!reg) return { success: false, error: "Not found" };
    return { success: true, data: serialize(reg) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// MLC
// ============================================

export async function createMLCRecord(input: {
  er_registration_id: string;
  case_type: string;
  police_station?: string | null;
  fir_number?: string | null;
  io_name?: string | null;
  io_contact?: string | null;
  brought_by_name?: string | null;
  brought_by_relation?: string | null;
  brought_by_id_proof?: string | null;
  injury_description?: string | null;
  injury_time?: string | null;
  alcohol_involved?: boolean;
}) {
  try {
    const { db } = await requireTenantContext();
    const mlc_number = await nextMLCNumber(db);

    const mlc = await db.mLCRecord.upsert({
      where: { er_registration_id: input.er_registration_id },
      create: {
        er_registration_id: input.er_registration_id,
        mlc_number,
        case_type: input.case_type,
        police_station: input.police_station ?? null,
        fir_number: input.fir_number ?? null,
        io_name: input.io_name ?? null,
        io_contact: input.io_contact ?? null,
        brought_by_name: input.brought_by_name ?? null,
        brought_by_relation: input.brought_by_relation ?? null,
        brought_by_id_proof: input.brought_by_id_proof ?? null,
        injury_description: input.injury_description ?? null,
        injury_time: input.injury_time ? new Date(input.injury_time) : null,
        alcohol_involved: input.alcohol_involved ?? false,
      },
      update: {
        case_type: input.case_type,
        police_station: input.police_station ?? null,
        fir_number: input.fir_number ?? null,
        io_name: input.io_name ?? null,
        io_contact: input.io_contact ?? null,
        brought_by_name: input.brought_by_name ?? null,
        brought_by_relation: input.brought_by_relation ?? null,
        brought_by_id_proof: input.brought_by_id_proof ?? null,
        injury_description: input.injury_description ?? null,
        injury_time: input.injury_time ? new Date(input.injury_time) : null,
        alcohol_involved: input.alcohol_involved ?? false,
      },
    });

    await db.eRRegistration.update({
      where: { id: input.er_registration_id },
      data: { is_mlc: true },
    });

    await logAudit({
      action: "CREATE_MLC",
      module: "er",
      entity_type: "MLCRecord",
      entity_id: mlc.id,
      details: `${mlc_number} ${input.case_type}`,
    });

    revalidatePath("/er/dashboard");
    return { success: true, data: serialize(mlc) };
  } catch (error: any) {
    console.error("createMLCRecord error:", error);
    return { success: false, error: error?.message };
  }
}

export async function markPoliceInformed(mlcId: string) {
  try {
    const { db } = await requireTenantContext();
    const updated = await db.mLCRecord.update({
      where: { id: mlcId },
      data: { police_informed: true, police_informed_at: new Date() },
    });
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Vitals (with GCS auto-calculation)
// ============================================

export async function recordERVitals(input: {
  er_registration_id: string;
  recorded_by: string;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  heart_rate?: number | null;
  respiratory_rate?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  gcs_eye?: number | null;
  gcs_verbal?: number | null;
  gcs_motor?: number | null;
  pain_scale?: number | null;
  blood_sugar?: number | null;
}) {
  try {
    const { db } = await requireTenantContext();
    const e = input.gcs_eye ?? 0;
    const v = input.gcs_verbal ?? 0;
    const m = input.gcs_motor ?? 0;
    const gcs_total = e + v + m > 0 ? e + v + m : null;

    const v_row = await db.eRVitals.create({
      data: {
        er_registration_id: input.er_registration_id,
        recorded_by: input.recorded_by,
        bp_systolic: input.bp_systolic ?? null,
        bp_diastolic: input.bp_diastolic ?? null,
        heart_rate: input.heart_rate ?? null,
        respiratory_rate: input.respiratory_rate ?? null,
        temperature: input.temperature ?? null,
        spo2: input.spo2 ?? null,
        gcs_eye: input.gcs_eye ?? null,
        gcs_verbal: input.gcs_verbal ?? null,
        gcs_motor: input.gcs_motor ?? null,
        gcs_total,
        pain_scale: input.pain_scale ?? null,
        blood_sugar: input.blood_sugar ?? null,
      },
    });
    revalidatePath(`/er/patient/${input.er_registration_id}`);
    return { success: true, data: serialize(v_row) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Orders
// ============================================

export async function createEROrder(input: {
  er_registration_id: string;
  order_type: "Lab" | "Radiology" | "Medication" | "Procedure" | "Blood";
  order_details: string;
  priority?: "Stat" | "Urgent" | "Routine";
  ordered_by: string;
}) {
  try {
    const { db } = await requireTenantContext();
    const order = await db.eROrder.create({
      data: {
        er_registration_id: input.er_registration_id,
        order_type: input.order_type,
        order_details: input.order_details,
        priority: input.priority ?? "Stat",
        ordered_by: input.ordered_by,
        status: "Ordered",
      },
    });
    revalidatePath(`/er/patient/${input.er_registration_id}`);
    return { success: true, data: serialize(order) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function updateEROrderStatus(
  orderId: string,
  status: "InProgress" | "Completed" | "Cancelled",
) {
  try {
    const { db } = await requireTenantContext();
    const order = await db.eROrder.update({
      where: { id: orderId },
      data: {
        status,
        completed_at: status === "Completed" ? new Date() : null,
      },
    });
    return { success: true, data: serialize(order) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Notes
// ============================================

export async function saveERNote(input: {
  er_registration_id: string;
  note_type: "Assessment" | "Procedure" | "Progress" | "Discharge";
  content: string;
  created_by: string;
}) {
  try {
    const { db } = await requireTenantContext();
    const note = await db.eRNote.create({
      data: {
        er_registration_id: input.er_registration_id,
        note_type: input.note_type,
        content: input.content,
        created_by: input.created_by,
      },
    });
    revalidatePath(`/er/patient/${input.er_registration_id}`);
    return { success: true, data: serialize(note) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Disposition / Transfer / Discharge
// ============================================

export async function transferERtoIP(input: {
  er_registration_id: string;
  admission_id: string;
}) {
  try {
    const { db } = await requireTenantContext();
    const reg = await db.eRRegistration.update({
      where: { id: input.er_registration_id },
      data: {
        admission_id: input.admission_id,
        disposition: "Admitted",
        disposition_time: new Date(),
        status: "AdmittedToIP",
      },
    });
    await logAudit({
      action: "ER_TO_IP_TRANSFER",
      module: "er",
      entity_type: "ERRegistration",
      entity_id: input.er_registration_id,
      details: `Admission ${input.admission_id}`,
    });
    revalidatePath("/er/dashboard");
    revalidatePath("/ipd");
    return { success: true, data: serialize(reg) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function dischargeERPatient(input: {
  er_registration_id: string;
  disposition: "Discharged" | "LAMA" | "Death" | "Transferred" | "Referred";
}) {
  try {
    const { db } = await requireTenantContext();
    const statusMap: Record<string, string> = {
      Discharged: "Discharged",
      LAMA: "LAMA",
      Death: "Death",
      Transferred: "Referred",
      Referred: "Referred",
    };
    const reg = await db.eRRegistration.update({
      where: { id: input.er_registration_id },
      data: {
        disposition: input.disposition,
        disposition_time: new Date(),
        status: statusMap[input.disposition] ?? "Discharged",
      },
    });
    await logAudit({
      action: "ER_DISCHARGE",
      module: "er",
      entity_type: "ERRegistration",
      entity_id: input.er_registration_id,
      details: input.disposition,
    });
    revalidatePath("/er/dashboard");
    return { success: true, data: serialize(reg) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ============================================
// Stats
// ============================================

export async function getERStats(days = 30) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [total, byDisp, byTriageRaw, withTriage] = await Promise.all([
      db.eRRegistration.count({
        where: { organizationId, arrival_time: { gte: since } },
      }),
      db.eRRegistration.groupBy({
        by: ["disposition"],
        where: { organizationId, arrival_time: { gte: since }, disposition: { not: null } },
        _count: { id: true },
      }),
      db.eRRegistration.groupBy({
        by: ["triage_level"],
        where: {
          organizationId,
          arrival_time: { gte: since },
          triage_level: { not: null },
        },
        _count: { id: true },
      }),
      db.eRRegistration.findMany({
        where: {
          organizationId,
          arrival_time: { gte: since },
          triage_time: { not: null },
        },
        select: { arrival_time: true, triage_time: true },
      }),
    ]);

    const triageTATs = withTriage.map((r: { arrival_time: Date; triage_time: Date | null }) => {
      const t = r.triage_time as Date;
      return (t.getTime() - r.arrival_time.getTime()) / 60000;
    });
    const avg_triage_tat_mins =
      triageTATs.length > 0
        ? Math.round(triageTATs.reduce((a: number, b: number) => a + b, 0) / triageTATs.length)
        : 0;

    return {
      success: true,
      data: {
        total,
        disposition_breakdown: byDisp.map((d: { disposition: string | null; _count: { id: number } }) => ({
          disposition: d.disposition,
          count: d._count.id,
        })),
        triage_breakdown: byTriageRaw.map((t: { triage_level: string | null; _count: { id: number } }) => ({
          triage_level: t.triage_level,
          color: t.triage_level ? esiToColor(t.triage_level) : "Unknown",
          count: t._count.id,
        })),
        avg_triage_tat_mins,
      },
    };
  } catch (error: any) {
    console.error("getERStats error:", error);
    return { success: false, data: null };
  }
}
