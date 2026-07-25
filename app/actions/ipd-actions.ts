"use server";

import { requireTenantContext, denyUnlessRole, CLINICAL_ROLES } from "@/backend/tenant";
import { logAudit } from "@/app/lib/audit";
import { revalidatePath } from "next/cache";
import { getPatientBalances } from '@/app/actions/balance-actions';
import { getRoomGSTRate } from '@/app/lib/gst';
import { generateInvoiceNumber as genInvNum, generateReceiptNumber as genRcpNum, generateDepositNumber as genDepNum } from '@/app/lib/sequence-generator';
import { isBillClosedForCharges } from '@/app/lib/bill-status';
import { stopMedicationsOnDischarge } from '@/app/actions/ipd-emr-actions';
import { evaluateDischargeReadiness, readinessSummary } from '@/app/lib/discharge-readiness';


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

function parseCancellationReason(details?: string | null): string | null {
  if (!details) return null;

  try {
    const parsed = JSON.parse(details);
    return typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a typed-in doctor name to that doctor's user account.
 *
 * admissions stores the doctor twice: doctor_name (free text, printed on the bill)
 * and attending_doctor_id (the link to the account). Only the text was ever written,
 * so attending_doctor_id was NULL on every admission — which silently emptied the
 * Doctor Portal (it filters on the link, not the name) and disabled the IPD fallback
 * that attributes a bill to its attending doctor when invoices.doctor_id is unset.
 *
 * Matching ignores title, case and punctuation ("DR. Yogesh Taneja " -> yogeshtaneja)
 * and prefers an active, non-merged account when duplicates normalise the same.
 * Returns null when nothing matches — the name is still stored, so behaviour is never
 * worse than before.
 */
async function resolveAttendingDoctorId(
    db: any,
    organizationId: string,
    doctorName: string | null | undefined,
): Promise<string | null> {
    const norm = (s: unknown) =>
        String(s ?? '')
            .toLowerCase()
            .replace(/\[merged\]/g, '')
            .replace(/\b(dr|doctor|prof|mr|mrs|ms)\b\.?/g, '')
            .replace(/[^a-z0-9]/g, '');

    const key = norm(doctorName);
    if (!key) return null;

    const doctors = await db.user.findMany({
        where: { organizationId, role: 'doctor' },
        select: { id: true, name: true, username: true, is_active: true },
    });

    const hits = doctors.filter((d: any) => norm(d.name || d.username) === key);
    if (!hits.length) return null;
    const preferred =
        hits.find((d: any) => d.is_active && !/^\s*\[MERGED\]/i.test(d.name || '')) ??
        hits.find((d: any) => d.is_active) ??
        hits[0];
    return preferred?.id ?? null;
}

async function getAdmissionCancellationReasons(db: any, admissionIds: string[]) {
  const reasons = new Map<string, string>();
  if (admissionIds.length === 0) return reasons;

  const logs = await db.system_audit_logs.findMany({
    where: {
      action: "CANCEL_ADMISSION",
      entity_type: "admission",
      entity_id: { in: admissionIds },
    },
    orderBy: { created_at: "desc" },
    select: { entity_id: true, details: true },
  });

  logs.forEach((log: any) => {
    if (!log.entity_id || reasons.has(log.entity_id)) return;
    const reason = parseCancellationReason(log.details);
    if (reason) reasons.set(log.entity_id, reason);
  });

  return reasons;
}


export async function getWardsWithBeds() {
  try {
    const { db } = await requireTenantContext();
    // The stale-bed release used to run inline here, on every read, because
    // nothing else was calling it. It is now scheduled hourly across all
    // organizations (/api/ipd/bed-cleaning-sla), so paying for a write sweep on
    // the critical path of every bed-matrix load is no longer justified.
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
    // Stale-bed release runs on the hourly schedule, not on every read.
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


/**
 * Check if a patient currently has an active (non-discharged) IPD admission.
 * Used by the admit modal to surface a duplicate-admission warning BEFORE
 * the user tries to submit — much better UX than letting the backend reject.
 */
export async function checkActiveAdmission(patientId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const existing = await db.admissions.findFirst({
      where: {
        patient_id: patientId,
        status: "Admitted",
        organizationId,
      },
      select: {
        admission_id: true,
        admission_date: true,
        diagnosis: true,
        doctor_name: true,
        ward: { select: { ward_name: true } },
        bed: { select: { bed_id: true } },
      },
    });
    return { success: true as const, data: existing };
  } catch (error: any) {
    console.error("checkActiveAdmission error:", error);
    return { success: false as const, error: error.message };
  }
}

export async function admitPatientIPD(data: {
  patient_id: string;
  bed_id: string;
  ward_id: number;
  diagnosis?: string;
  doctor_name: string;
  deposit_amount?: number;
  deposit_payment_method?: string;
  estimate_id?: number;
  admission_type?: string;
  line_of_treatment?: string;
  admission_date?: string;
  // Payer type (selected at admission, persisted onto the patient record)
  patient_type?: string;
  corporate_id?: string;
  employee_id?: string;
  corporate_card_number?: string;
  tpa_provider_id?: string;
  insurance_policy_number?: string;
  insurance_validity_start?: string;
  insurance_validity_end?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();

    // Parse optional admission_date (datetime-local string, treated as IST).
    // Bounds: not before 1y ago, not more than 7d in the future — guards
    // against typos like 2025 → 2020 or stray century-off entries.
    let admissionDate: Date | undefined;
    if (data.admission_date) {
      const parsed = new Date(data.admission_date + ':00+05:30');
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, error: 'Invalid admission date' };
      }
      const now = Date.now();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (parsed.getTime() < now - oneYearMs) {
        return { success: false, error: 'Admission date cannot be more than 1 year in the past' };
      }
      if (parsed.getTime() > now + sevenDaysMs) {
        return { success: false, error: 'Admission date cannot be more than 7 days in the future' };
      }
      admissionDate = parsed;
    }
    
    
    const admission = await db.$transaction(async (tx: any) => {
        // Check if patient is already admitted
        const existingAdmission = await tx.admissions.findFirst({
            where: {
                patient_id: data.patient_id,
                status: "Admitted",
                organizationId,
            },
        });

        if (existingAdmission) {
            throw new Error(`Patient is already admitted (${existingAdmission.admission_id}). Please discharge them first.`);
        }

        // Atomic update: only update if it is 'Available'
        const updatedBed = await tx.beds.updateMany({
            where: { bed_id: data.bed_id, status: "Available", organizationId },
            data: { status: "Occupied" }
        });

        if (updatedBed.count === 0) {
            throw new Error("Bed is no longer available or does not exist for admission");
        }

        // Sequential admission ID: AXT/ADM/26-27/001
        const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { code: true } });
        const orgCode = org?.code || 'HOS';
        const now = new Date();
        const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fy = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
        const admPrefix = `${orgCode}-ADM-${fy}-`;
        const lastAdm = await tx.admissions.findFirst({
            where: { admission_id: { startsWith: admPrefix }, organizationId },
            orderBy: { admission_id: 'desc' },
            select: { admission_id: true },
        });
        let admSeq = 1;
        if (lastAdm) {
            const parts = lastAdm.admission_id.split('-');
            admSeq = (parseInt(parts[parts.length - 1]) || 0) + 1;
        }
        const ipdId = `${admPrefix}${String(admSeq).padStart(3, '0')}`;

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
                // Link the doctor's ACCOUNT too, not just their name — the Doctor
                // Portal and the IPD commission fallback both key off this.
                attending_doctor_id: await resolveAttendingDoctorId(tx, organizationId, data.doctor_name),
                admission_type: data.admission_type,
                line_of_treatment: data.line_of_treatment,
                ...(admissionDate && { admission_date: admissionDate }),
                organizationId
            },
        });

        // Persist payer type onto the patient record (mirrors register-patient.ts).
        // Cash (or omitted) changes nothing about payer.
        if (data.patient_type && data.patient_type !== 'cash') {
            if (data.patient_type === 'corporate') {
                await tx.oPD_REG.update({
                    where: { patient_id: data.patient_id, organizationId },
                    data: {
                        patient_type: 'corporate',
                        corporate_id: data.corporate_id || null,
                        corporate_card_number: data.corporate_card_number || null,
                        employee_id: data.employee_id || null,
                    },
                });
            } else if (data.patient_type === 'tpa_insurance') {
                await tx.oPD_REG.update({
                    where: { patient_id: data.patient_id, organizationId },
                    data: {
                        patient_type: 'tpa_insurance',
                    },
                });

                // Create insurance_policy record for TPA patients (mirrors register-patient.ts)
                if (data.tpa_provider_id && data.insurance_policy_number) {
                    const providerId = parseInt(data.tpa_provider_id, 10);
                    if (!isNaN(providerId)) {
                        await tx.insurance_policies.upsert({
                            where: { policy_number: data.insurance_policy_number },
                            create: {
                                patient_id: data.patient_id,
                                provider_id: providerId,
                                policy_number: data.insurance_policy_number,
                                valid_from: data.insurance_validity_start ? new Date(data.insurance_validity_start) : null,
                                valid_until: data.insurance_validity_end ? new Date(data.insurance_validity_end) : null,
                                status: 'Active',
                                organizationId,
                            },
                            update: {
                                provider_id: providerId,
                                valid_from: data.insurance_validity_start ? new Date(data.insurance_validity_start) : null,
                                valid_until: data.insurance_validity_end ? new Date(data.insurance_validity_end) : null,
                                status: 'Active',
                            },
                        });
                    }
                }
            }
        }

        // Start the 2-hour initial nursing assessment clock.
        //
        // The alert machinery already existed — NursingAssessmentAlert, the
        // overdue sweep at /api/cron/assessment-alerts, and the alerts screen —
        // but the only function that creates an alert had no caller anywhere, so
        // no alert was ever raised, the table held zero rows, and the screen and
        // the cron job swept nothing. Admission is when the clock should start.
        await tx.nursingAssessmentAlert.create({
            data: {
                admission_id: newAdmission.admission_id,
                patient_id: data.patient_id,
                arrival_in_unit_at: new Date(),
                assessment_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
                organizationId,
            },
        });

        // ...and the task that actually performs it, so it appears as ward work
        // rather than only as a countdown on a screen nobody has open.
        await tx.nursingTask.create({
            data: {
                admission_id: newAdmission.admission_id,
                task_type: 'Initial Assessment',
                description: 'Complete the initial nursing assessment (due within 2 hours of arrival)',
                scheduled_at: new Date(),
                status: 'Pending',
                priority: 'urgent',
                source_type: 'admission',
                source_id: newAdmission.admission_id,
                organizationId,
            },
        });

        // Create IPD invoice
        const newInvoice = await tx.invoices.create({
            data: {
                // Numberless draft — number assigned at finalization (ongoing IPD series).
                invoice_number: null,
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
            await tx.patientDeposit.create({
                data: {
                    deposit_number: await genDepNum(organizationId, tx),
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
                    admission_date: admissionDate
                        ? admissionDate.toISOString()
                        : newAdmission.admission_date.toISOString(),
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
    const { db, organizationId } = await requireTenantContext();
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
            patient_type: true,
            pan_number: true,
            govt_id_type: true,
            govt_id_number: true,
          },
        },
        bed: { include: { wards: true } },
        ward: true,
        medical_notes: { orderBy: { created_at: "desc" }, take: 3 },
      },
      orderBy: { admission_date: "desc" },
      // Safety bound: 'Admitted' is naturally small, but 'All'/'Discharged' grows
      // without limit. Cap at the 1000 most-recent admissions so this list can
      // never load the entire history into memory (a cause of slow loads / restarts).
      take: 1000,
    });

    const patientIds = Array.from(new Set(admissions.map((a: any) => a.patient_id).filter(Boolean))) as string[];
    const cancelledAdmissionIds = admissions
      .filter((a: any) => a.status === "Cancelled")
      .map((a: any) => a.admission_id);
    const [balances, cancellationReasons] = await Promise.all([
      getPatientBalances(patientIds),
      getAdmissionCancellationReasons(db, cancelledAdmissionIds),
    ]);

    // Find all admissions that have postings, lab orders, or pharmacy orders
    const activeAdmissions = admissions.filter((a: any) => a.status === 'Admitted');
    const activeAdmittedIds = activeAdmissions.map((a: any) => a.admission_id);
    const activePatientIds = Array.from(new Set(activeAdmissions.map((a: any) => a.patient_id))) as string[];
    
    const [chargePostings, labOrders, pharmacyOrders, invoiceItems] = await Promise.all([
        db.ipdChargePosting.findMany({
            where: { admission_id: { in: activeAdmittedIds } },
            select: { admission_id: true }
        }),
        db.lab_orders.findMany({
            where: {
                patient_id: { in: activePatientIds },
                organizationId
            },
            select: { patient_id: true, created_at: true }
        }),
        db.pharmacy_orders.findMany({
            where: { admission_id: { in: activeAdmittedIds } },
            select: { admission_id: true }
        }),
        db.invoice_items.findMany({
            where: { invoice: { admission_id: { in: activeAdmittedIds } } },
            select: { invoice: { select: { admission_id: true } } }
        })
    ]);

    const admissionIdsWithCharges = new Set<string>();
    chargePostings.forEach((c: any) => admissionIdsWithCharges.add(c.admission_id));
    pharmacyOrders.forEach((p: any) => admissionIdsWithCharges.add(p.admission_id));
    invoiceItems.forEach((i: any) => {
        if (i.invoice?.admission_id) {
            admissionIdsWithCharges.add(i.invoice.admission_id);
        }
    });

    // Check lab orders created after admission date
    for (const adm of activeAdmissions) {
        const hasLab = labOrders.some((l: any) => 
            l.patient_id === adm.patient_id && 
            new Date(l.created_at).getTime() >= new Date(adm.admission_date).getTime()
        );
        if (hasLab) {
            admissionIdsWithCharges.add(adm.admission_id);
        }
    }

    const enriched = admissions.map((a: any) => {
      // Length of stay: count to the discharge date once discharged, not to now.
      // Measuring against now() kept the counter ticking forever after discharge,
      // so a 4-day stay from three months ago reported ~95 days. Only ever visible
      // on lists that include discharged rows, which the doctor portal now does.
      const stayEnd = a.discharge_date ? new Date(a.discharge_date) : new Date();
      const daysAdmitted = Math.max(1, Math.ceil(
        (stayEnd.getTime() - new Date(a.admission_date).getTime()) /
          (1000 * 60 * 60 * 24),
      ));
      
      const hasCharges = admissionIdsWithCharges.has(a.admission_id);
      const isWithin8Hours = (new Date().getTime() - new Date(a.admission_date).getTime()) < 8 * 60 * 60 * 1000;
      const canCancel = a.status === "Admitted" && !hasCharges && isWithin8Hours;

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
        cancellation_reason: a.cancellation_reason || cancellationReasons.get(a.admission_id) || null,
        cancellation_date: a.cancellation_date || null,
        cancelled_by: a.cancelled_by || null,
        canCancel,
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
                { phone: { contains: q, mode: 'insensitive' } },
                { username: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ]
            : []),
          ...(digitQuery ? [{ phone: { contains: digitQuery, mode: 'insensitive' as const } }] : []),
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

    const cancellationReasons = await getAdmissionCancellationReasons(
      db,
      admission.status === "Cancelled" ? [admission.admission_id] : [],
    );

    return {
      success: true,
      data: serialize({
        ...admission,
        cancellation_reason:
          cancellationReasons.get(admission.admission_id) || null,
      }),
    };
  } catch (error: any) {
    console.error("getAdmissionDetail error:", error);
    return { success: false, error: error.message };
  }
}

// Add daily charges (room + nursing) to an admission's invoice
export async function accrueIPDDailyCharges(admissionId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
      include: { ward: true, bed: { include: { wards: true } } },
    });

    if (!admission) return { success: false, error: "Admission not found" };

    // Rules 4 & 5: stop accruing room/nursing charges once the patient is discharged.
    if (admission.status === 'Discharged') {
      return { success: false, error: "Admission is discharged; no further charges are accrued." };
    }

    const ward = admission.ward || admission.bed?.wards;
    if (!ward) return { success: false, error: "Ward info not found" };

    // Find the IPD invoice
    let invoice = await db.invoices.findFirst({
      where: { admission_id: admissionId, status: { not: "Cancelled" } },
    });

    // Don't accrue onto a finalized/locked bill.
    if (isBillClosedForCharges(invoice)) {
      return { success: false, error: "Bill is finalized; no further charges are accrued." };
    }

    if (!invoice) {
      invoice = await db.invoices.create({
        data: {
          // Numberless draft — number assigned at finalization (ongoing IPD series).
          invoice_number: null,
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
    // Two forms of "today":
    //   today      → human-readable, used in description suffix for backwards-compat
    //   isoToday   → strict YYYY-MM-DD, used inside square brackets so both this
    //                function AND ensureIPDRoomChargesAccrued share the same
    //                de-dupe key (avoids double-billing across the two paths)
    const today = new Date().toLocaleDateString("en-IN");
    const isoToday = new Date().toISOString().slice(0, 10);

    // If an active (non-broken-open) IPD package covers today, skip Room+Nursing
    // accrual — both are included in the package price (per pricelist inclusions).
    const activePkg = await db.ipdAdmissionPackage.findFirst({
      where: { admission_id: admissionId, is_broken_open: false },
      include: { package: { select: { validity_days: true } } },
    });
    let packageCoversToday = false;
    if (activePkg) {
      const validityDays = activePkg.package.validity_days || 7;
      const admitDateMidnight = new Date(admission.admission_date);
      admitDateMidnight.setHours(0, 0, 0, 0);
      const coveredUntil = new Date(admitDateMidnight);
      coveredUntil.setDate(admitDateMidnight.getDate() + validityDays - 1);
      coveredUntil.setHours(23, 59, 59, 999);
      const now = new Date();
      packageCoversToday = now <= coveredUntil;
    }

    // Determine room GST: ICU/CCU/NICU exempt regardless of rate;
    // other wards 5% if rent > ₹5,000/day (CBIC 03/2022).
    const roomTaxRate = getRoomGSTRate(ward.ward_type, roomRate);
    const roomTaxAmount = roomRate * roomTaxRate / 100;

    // Add room charge (skipped while inside package coverage)
    if (roomRate > 0 && !packageCoversToday) {
      const roomRef = `room_${admissionId}_${isoToday}`;
      // De-dupe by BOTH ref_id AND description containing today's ISO date.
      // This matches the de-dupe key used by ensureIPDRoomChargesAccrued
      // (which writes "Ward Name - Room Charge [YYYY-MM-DD]") so the two
      // functions never double-bill the same day.
      const existingRoom = await db.invoice_items.findFirst({
        where: {
          invoice_id: invoice.id,
          service_category: 'Room',
          OR: [
            { ref_id: roomRef },
            { description: { contains: `[${isoToday}]` } },
          ],
        },
      });

      if (!existingRoom) {
        await db.invoice_items.create({
          data: {
            invoice_id: invoice.id,
            department: "Room",
            description: `${ward.ward_name} - Room Charge [${isoToday}]`,
            quantity: 1,
            unit_price: roomRate,
            total_price: roomRate,
            discount: 0,
            net_price: roomRate,
            tax_rate: roomTaxRate,
            tax_amount: roomTaxAmount,
            hsn_sac_code: roomRate > 5000 ? '9963' : '9993',
            service_category: 'Room',
            ref_id: roomRef,
            organizationId,
          },
        });
      }
    }

    // Add nursing charge (skipped while inside package coverage)
    if (nursingRate > 0 && !packageCoversToday) {
      const nursingRef = `nursing_${admissionId}_${isoToday}`;
      const existingNursing = await db.invoice_items.findFirst({
        where: {
          invoice_id: invoice.id,
          service_category: 'Nursing',
          OR: [
            { ref_id: nursingRef },
            { description: { contains: `[${isoToday}]` } },
          ],
        },
      });

      if (!existingNursing) {
        await db.invoice_items.create({
          data: {
            invoice_id: invoice.id,
            department: "Nursing",
            description: `Nursing Charge [${isoToday}]`,
            quantity: 1,
            unit_price: nursingRate,
            total_price: nursingRate,
            discount: 0,
            net_price: nursingRate,
            tax_rate: 0,
            tax_amount: 0,
            hsn_sac_code: '9993',
            service_category: 'Nursing',
            ref_id: nursingRef,
            organizationId,
          },
        });
      }
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
export async function dischargePatientIPD(
  admissionId: string,
  notes?: string,
  dischargeDate?: string,
  /** Set when a clinician has reviewed the blockers and accepts the risk. */
  overrideReason?: string,
) {
  const denied = await denyUnlessRole(CLINICAL_ROLES.DISCHARGE, 'discharge a patient');
  if (denied) return denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
      include: { patient: true, ward: true, bed: { include: { wards: true } } },
    });

    if (!admission) return { success: false, error: "Admission not found" };

    // Clinical gate. Nothing checked this before: the audit discharged a patient
    // with a NEWS of 11, nine queued doses and no assessment, unchallenged.
    const readiness = await evaluateDischargeReadiness(db, admissionId);
    if (!readiness.canDischarge && !overrideReason?.trim()) {
      return {
        success: false,
        error: readinessSummary(readiness),
        readiness,
        requiresOverride: true,
      };
    }

    // Resolve discharge date — caller may pass a datetime-local string (IST).
    let resolvedDischarge = new Date();
    if (dischargeDate) {
      const parsed = new Date(dischargeDate + ':00+05:30');
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, error: 'Invalid discharge date' };
      }
      resolvedDischarge = parsed;
    }
    if (resolvedDischarge.getTime() > Date.now() + 60_000) {
      return { success: false, error: 'Discharge date cannot be in the future.' };
    }
    if (resolvedDischarge.getTime() < new Date(admission.admission_date).getTime()) {
      return { success: false, error: 'Discharge date must be on or after the admission date.' };
    }

    // Calculate total room charges
    const ward = admission.ward || admission.bed?.wards;
    const daysAdmitted = Math.max(
      1,
      Math.ceil(
        (resolvedDischarge.getTime() - new Date(admission.admission_date).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    // Update admission status
    await db.admissions.update({
      where: { admission_id: admissionId },
      data: {
        status: "Discharged",
        discharge_date: resolvedDischarge,
      },
    });

    // Close the medication chart. Without this, future doses stay "Scheduled"
    // and reappear on the ward eMAR as due for a patient who has gone home.
    const medsClosed = await stopMedicationsOnDischarge(db, admissionId);

    // Free the bed (set to Cleaning first). cleaning_started_at MUST be stamped —
    // autoReleaseStaleCleaningBeds() keys off it, so a bed left without one never
    // returns to the pool and is silently lost from inventory.
    if (admission.bed_id) {
      await db.beds.update({
        where: { bed_id: admission.bed_id },
        data: { status: "Cleaning", cleaning_started_at: new Date(), cleaning_completed_at: null },
      });
    }

    // Finalize invoice
    const invoice = await db.invoices.findFirst({
      where: { admission_id: admissionId, status: { not: "Cancelled" } },
    });

    if (invoice) {
      // Rule 1/3: assign the bill number at finalization (once), continuing the
      // ongoing IPD series in invoice_number. Drafts are numberless.
      const billNumber = invoice.invoice_number
        || await genInvNum(organizationId, 'IPD', true, db);
      await db.invoices.update({
        where: { id: invoice.id },
        data: {
          status: "Final",
          finalized_at: new Date(),
          invoice_number: billNumber,
        },
      });
    }

    const fmtIst = (d: Date) =>
      new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    // Create discharge summary
    await db.discharge_summaries.create({
      data: {
        admission_id: admissionId,
        patient_name: admission.patient?.full_name,
        generated_summary: `<h2>Discharge Summary</h2>
                    <p><strong>Patient:</strong> ${admission.patient?.full_name}</p>
                    <p><strong>Diagnosis:</strong> ${admission.diagnosis || "N/A"}</p>
                    <p><strong>Doctor:</strong> ${admission.doctor_name || "N/A"}</p>
                    <p><strong>Admitted:</strong> ${fmtIst(admission.admission_date)}</p>
                    <p><strong>Discharged:</strong> ${fmtIst(resolvedDischarge)}</p>
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
        user_id: session.id,
        username: session.username,
        role: session.role,
        details: JSON.stringify({
          patient_id: admission.patient_id,
          daysAdmitted,
          bedFreed: admission.bed_id,
          discharge_date: resolvedDischarge.toISOString(),
          doses_cancelled: medsClosed.dosesCancelled,
          medications_stopped: medsClosed.medicationsStopped,
          // What was outstanding at the moment of discharge, so the decision is
          // reconstructable later rather than being an undocumented judgement.
          outstanding: readiness.warnings.map(w => `${w.label}: ${w.detail}`),
          blockers_overridden: readiness.blockers.map(b => `${b.label}: ${b.detail}`),
          override_reason: overrideReason?.trim() || null,
        }),
      },
    });

    return { success: true, data: { daysAdmitted, bedId: admission.bed_id } };
  } catch (error: any) {
    console.error("dischargePatientIPD error:", error);
    return { success: false, error: error.message };
  }
}

// Reverse a discharge — bring a Discharged patient back to Admitted. Admin/Finance only.
export async function undischargeAdmission(admissionId: string, reason?: string) {
  try {
    const { db, session } = await requireTenantContext();
    if (!["admin", "finance"].includes(session.role)) {
      return { success: false, error: "Only Admin or Finance can undischarge a patient." };
    }

    const admission = await db.admissions.findUnique({ where: { admission_id: admissionId } });
    if (!admission) return { success: false, error: "Admission not found" };
    // Semi-discharged (Admitted + discharge_date set) also needs a reversal path:
    // authoring the discharge summary locks the Draft bill (see saveDischargeSummary),
    // but the patient never actually left the bed, so there is nothing to re-occupy —
    // only the discharge date/lock need clearing.
    const semiDischarged = admission.status === "Admitted" && !!admission.discharge_date;
    if (admission.status !== "Discharged" && !semiDischarged) {
      return { success: false, error: `Patient is not discharged (current status: ${admission.status}).` };
    }

    // Re-occupy the original bed only if it is still free; if another patient now holds
    // it, re-admit without a bed and tell the caller to reassign one. Only relevant for
    // a full discharge — a semi-discharged patient's bed was never released.
    let bedNote = "";
    if (admission.status === "Discharged" && admission.bed_id) {
      const heldByOther = await db.admissions.findFirst({
        where: { bed_id: admission.bed_id, status: "Admitted", NOT: { admission_id: admissionId } },
        select: { admission_id: true },
      });
      if (heldByOther) {
        bedNote = `Bed ${admission.bed_id} is now occupied by another patient — re-admitted without a bed. Assign a bed via IPD → Transfer.`;
      } else {
        await db.beds.update({ where: { bed_id: admission.bed_id }, data: { status: "Occupied" } });
      }
    }

    // Reopen the admission.
    await db.admissions.update({
      where: { admission_id: admissionId },
      data: {
        status: "Admitted",
        discharge_date: null,
        discharge_type: null,
        fit_for_discharge_at: null,
        fit_for_discharge_by: null,
      },
    });

    // Reopen billing so charges can continue (payments are preserved): un-finalize
    // any Final bill AND clear any hard lock (e.g. from finalizeAndLockInvoice)
    // on the draft. Semi-discharge itself no longer locks the bill, so this is
    // a no-op in that case — kept for the full-discharge-then-undischarge path.
    await db.invoices.updateMany({
      where: { admission_id: admissionId, status: "Final" },
      data: { status: "Draft", finalized_at: null },
    });
    await db.invoices.updateMany({
      where: { admission_id: admissionId },
      data: { is_locked: false, locked_at: null, locked_by: null },
    });

    await db.system_audit_logs.create({
      data: {
        action: "UNDISCHARGE_IPD",
        module: "ipd",
        entity_type: "admission",
        entity_id: admissionId,
        details: JSON.stringify({
          patient_id: admission.patient_id,
          by_role: session.role,
          reason: reason || null,
          bedNote: bedNote || null,
          reversed_from: semiDischarged ? "SemiDischarged" : "Discharged",
        }),
      },
    });

    revalidatePath(`/ipd/admission/${admissionId}`);
    revalidatePath("/ipd");
    return { success: true, data: { bedNote } };
  } catch (error: any) {
    console.error("undischargeAdmission error:", error);
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
          { full_name: { contains: query, mode: 'insensitive' } },
          { patient_id: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
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

      if (!admission || !["Admitted", "Discharged"].includes(admission.status)) {
        throw new Error("Valid admitted or discharged admission not found");
      }

      const fromBedId = admission.bed_id;
      const isActiveAdmission = admission.status === "Admitted";

      // Live transfers affect bed occupancy; discharged records are historical corrections.
      if (isActiveAdmission && fromBedId) {
        await tx.beds.update({
          where: { bed_id: fromBedId },
          data: { status: "Cleaning", cleaning_started_at: new Date(), cleaning_completed_at: null },
        });
      }

      // Check new bed
      const toBed = await tx.beds.findUnique({
        where: { bed_id: data.to_bed_id },
      });
      if (!toBed || toBed.status !== "Available") {
        throw new Error("Destination bed is not available");
      }

      if (isActiveAdmission) {
        await tx.beds.update({
          where: { bed_id: data.to_bed_id },
          data: { status: "Occupied" },
        });
      }

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
          reason: data.reason || (isActiveAdmission ? null : "Post-discharge ward/bed correction"),
          transferred_by: session.id, // Ensure your schema uses string or Int
          organizationId,
        },
      });
    });

    revalidatePath("/ipd");
    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function assignDietPlan(data: {
  admission_id: string;
  diet_type: string;
  instructions: string;
  calorie_target?: number;
  protein_target?: number;
  fluid_restriction_ml?: number;
  religious_restrictions?: string;
  texture_modification?: string;
  feeding_route?: string;
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
        ...(data.calorie_target !== undefined && { calorie_target: data.calorie_target }),
        ...(data.protein_target !== undefined && { protein_target: data.protein_target }),
        ...(data.fluid_restriction_ml !== undefined && { fluid_restriction_ml: data.fluid_restriction_ml }),
        ...(data.religious_restrictions !== undefined && { religious_restrictions: data.religious_restrictions }),
        ...(data.texture_modification !== undefined && { texture_modification: data.texture_modification }),
        ...(data.feeding_route !== undefined && { feeding_route: data.feeding_route }),
      },
    });

    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function safeUpdateAdmission(admissionId: string, currentVersion: number, updateData: Record<string, any>) {
  try {
    const { db } = await requireTenantContext();

    // Attempt update with version check
    const result = await db.admissions.updateMany({
      where: {
        admission_id: admissionId,
        version: currentVersion,
      },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      // Version mismatch — someone else updated first
      return {
        success: false,
        error: 'This record was updated by another user. Please refresh and try again.',
        conflict: true,
      };
    }

    revalidatePath(`/ipd/admission/${admissionId}`);
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
    const { db, session } = await requireTenantContext();
    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
      include: {
        patient: {
          include: {
            corporate: { select: { company_name: true, company_code: true } },
            insurance_policies: {
              where: { status: "Active" },
              orderBy: { created_at: "desc" },
              take: 1,
              select: {
                policy_number: true,
                plan_name: true,
                provider: { select: { id: true, provider_name: true } },
              },
            },
          },
        },
        bed: { include: { wards: true } },
        medical_notes: { orderBy: { created_at: "desc" } },
        diet_plans: { orderBy: { created_at: "desc" } },
        ward_rounds: { orderBy: { created_at: "desc" } },
        bed_transfers: { orderBy: { created_at: "desc" } },
        nursing_tasks: { orderBy: { scheduled_at: "asc" } },
      },
    });

    if (!admission) return { success: false, error: "Not found" };

    const cancellationReasons = await getAdmissionCancellationReasons(
      db,
      admission.status === "Cancelled" ? [admission.admission_id] : [],
    );

    return {
      success: true,
      data: serialize({
        ...admission,
        cancellation_reason:
          cancellationReasons.get(admission.admission_id) || null,
        viewer_role: session.role,
      }),
    };
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

    // Re-resolve the link as well, so changing the doctor moves the patient in the
    // Doctor Portal instead of leaving them with the previous doctor (or nobody).
    await db.admissions.update({
      where: { admission_id: admissionId },
      data: {
        doctor_name: trimmed,
        attending_doctor_id: await resolveAttendingDoctorId(db, admission.organizationId, trimmed),
      },
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
  patient_id?: string;
  bed_id: string;
  ward_id: number;
  chief_complaint: string;
  doctor_name?: string;
  attending_doctor_id?: string;
  deposit_amount?: number;
  // Unknown patient fields
  unknown_patient?: boolean;
  unknown_name?: string;
  unknown_age?: string;
  unknown_gender?: string;
  unknown_phone?: string;
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

    // 2. Resolve patient — auto-create a temporary record for unknown/unregistered patients
    let resolvedPatientId = data.patient_id?.trim() ?? '';
    let patient = resolvedPatientId
      ? await db.oPD_REG.findUnique({ where: { patient_id: resolvedPatientId } })
      : null;

    if (!patient) {
      // Generate an emergency patient ID
      const timestamp = Date.now().toString(36).toUpperCase();
      resolvedPatientId = `EMRG-${timestamp}`;

      patient = await db.oPD_REG.create({
        data: {
          patient_id: resolvedPatientId,
          full_name: data.unknown_name?.trim() || 'Unknown Patient',
          age: data.unknown_age?.trim() || null,
          gender: data.unknown_gender?.trim() || null,
          phone: data.unknown_phone?.trim() || null,
          registration_remarks: `Auto-created via Emergency Admission on ${new Date().toISOString()}`,
          organizationId,
        },
      });
    }

    const result = await db.$transaction(async (tx: any) => {
      // 3. Generate sequential admission ID
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { code: true } });
      const orgCode = org?.code || 'HOS';
      const now = new Date();
      const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const fy = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
      const emgPrefix = `${orgCode}-ADM-${fy}-`;
      const lastAdm = await tx.admissions.findFirst({
          where: { admission_id: { startsWith: emgPrefix }, organizationId },
          orderBy: { admission_id: 'desc' },
          select: { admission_id: true },
      });
      let emgSeq = 1;
      if (lastAdm) {
          const parts = lastAdm.admission_id.split('-');
          emgSeq = (parseInt(parts[parts.length - 1]) || 0) + 1;
      }
      const emgAdmId = `${emgPrefix}${String(emgSeq).padStart(3, '0')}`;

      // Create admission
      const admission = await tx.admissions.create({
        data: {
          admission_id: emgAdmId,
          patient_id: resolvedPatientId,
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
          patient_id: resolvedPatientId,
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
            patient_id: resolvedPatientId,
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
    return { success: true, data: { admission_id: result.admission.admission_id, patient_id: resolvedPatientId } };
  } catch (error: any) {
    console.error('admitEmergency error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateAdmissionDiagnosis(data: {
  admission_id: string;
  diagnosis?: string;
  primary_diagnosis_icd?: string;
  secondary_diagnoses?: string[];
  discharge_type?: string;
  discharge_disposition?: string;
  patient_class?: string;
  isolation_type?: string;
}) {
  try {
    const { db } = await requireTenantContext();
    const admission = await db.admissions.update({
      where: { admission_id: data.admission_id },
      data: {
        ...(data.diagnosis !== undefined && { diagnosis: data.diagnosis || null }),
        primary_diagnosis_icd: data.primary_diagnosis_icd,
        secondary_diagnoses: data.secondary_diagnoses ?? undefined,
        discharge_type: data.discharge_type,
        discharge_disposition: data.discharge_disposition,
        patient_class: data.patient_class,
        isolation_type: data.isolation_type,
      },
      select: { patient_id: true },
    });
    revalidatePath(`/ipd/admission/${data.admission_id}`);
    if (admission.patient_id) {
      revalidatePath(`/admin/patients/${admission.patient_id}`);
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateAdmissionBasicDetails(data: {
  admission_id: string;
  diagnosis?: string;
  admission_type?: string;
  line_of_treatment?: string;
  admission_date?: string;
  discharge_date?: string;
}) {
  try {
    const { db, session } = await requireTenantContext();
    const allowedRoles = ['receptionist', 'reception', 'admin', 'finance', 'superadmin'];
    const role = String(session.role || '').toLowerCase();
    if (!allowedRoles.includes(role)) {
      return { success: false, error: 'Only Reception, Admin, or Finance can update admission details.' };
    }

    const existing = await db.admissions.findUnique({
      where: { admission_id: data.admission_id },
      select: { admission_date: true, discharge_date: true, status: true },
    });
    if (!existing) return { success: false, error: 'Admission not found' };

    let nextAdmissionDate: Date | undefined;
    let nextDischargeDate: Date | undefined | null;

    if (data.admission_date) {
      const parsed = new Date(data.admission_date + ':00+05:30');
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, error: 'Invalid admission date' };
      }
      nextAdmissionDate = parsed;
    }

    if (data.discharge_date !== undefined) {
      if (data.discharge_date === '') {
        nextDischargeDate = null;
      } else {
        const parsed = new Date(data.discharge_date + ':00+05:30');
        if (Number.isNaN(parsed.getTime())) {
          return { success: false, error: 'Invalid discharge date' };
        }
        nextDischargeDate = parsed;
      }
    }

    // Resolve final values for cross-field validation
    const finalAdmission = nextAdmissionDate ?? new Date(existing.admission_date);
    const finalDischarge =
      nextDischargeDate === undefined ? existing.discharge_date : nextDischargeDate;

    if (finalDischarge) {
      const now = new Date();
      if (finalDischarge.getTime() > now.getTime() + 60_000) {
        return { success: false, error: 'Discharge date cannot be in the future.' };
      }
      if (finalDischarge.getTime() < finalAdmission.getTime()) {
        return { success: false, error: 'Discharge date must be on or after the admission date.' };
      }
    }

    await db.admissions.update({
      where: { admission_id: data.admission_id },
      data: {
        ...(data.diagnosis !== undefined && { diagnosis: data.diagnosis || null }),
        ...(data.admission_type !== undefined && { admission_type: data.admission_type || null }),
        ...(data.line_of_treatment !== undefined && { line_of_treatment: data.line_of_treatment || null }),
        ...(nextAdmissionDate && { admission_date: nextAdmissionDate }),
        ...(nextDischargeDate !== undefined && { discharge_date: nextDischargeDate }),
      },
    });

    if (nextAdmissionDate &&
        existing.admission_date.getTime() !== nextAdmissionDate.getTime()) {
      await db.system_audit_logs.create({
        data: {
          action: 'EDIT_ADMISSION_DATE',
          module: 'ipd',
          entity_type: 'admission',
          entity_id: data.admission_id,
          details: JSON.stringify({
            old: existing.admission_date.toISOString(),
            new: nextAdmissionDate.toISOString(),
            by_role: role,
          }),
        },
      });
    }

    if (nextDischargeDate !== undefined) {
      const oldIso = existing.discharge_date?.toISOString() ?? null;
      const newIso = nextDischargeDate?.toISOString() ?? null;
      if (oldIso !== newIso) {
        await db.system_audit_logs.create({
          data: {
            action: 'EDIT_DISCHARGE_DATE',
            module: 'ipd',
            entity_type: 'admission',
            entity_id: data.admission_id,
            details: JSON.stringify({
              old: oldIso,
              new: newIso,
              by_role: role,
            }),
          },
        });
      }
    }

    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Change a patient's billing category (Cash / Corporate / TPA-Insurance) from
 * the IPD chart, after admission — e.g. a patient admitted as cash later
 * produces a corporate ID card or insurance policy at the desk.
 *
 * Mirrors the payer-type handling in admitPatientIPD (corporate/TPA record
 * creation) and the corporate-name resolution in reception-actions.updatePatient
 * (find-or-create CorporateMaster by name), but is admission-page-aware: it
 * revalidates the IPD chart path instead of the patient-detail admin path.
 *
 * For 'tpa_insurance', provider_id + policy_number are optional — if omitted,
 * the flag flips but no policy is created (staff can add one later from the
 * TPA Profile tab). If provided, an insurance_policies row is upserted so the
 * TPA tab and billing pick it up immediately.
 */
export async function updateAdmissionPatientCategory(data: {
  admission_id: string;
  patient_type: 'cash' | 'corporate' | 'tpa_insurance';
  // Corporate
  corporate_name?: string;
  corporate_card_number?: string;
  employee_id?: string;
  // TPA / Insurance
  tpa_provider_id?: string;
  insurance_policy_number?: string;
  insurance_validity_start?: string;
  insurance_validity_end?: string;
}) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    const allowedRoles = ['receptionist', 'reception', 'admin', 'finance', 'superadmin'];
    const role = String(session.role || '').toLowerCase();
    if (!allowedRoles.includes(role)) {
      return { success: false, error: 'Only Reception, Admin, or Finance can change the patient category.' };
    }

    if (!['cash', 'corporate', 'tpa_insurance'].includes(data.patient_type)) {
      return { success: false, error: 'Invalid patient category.' };
    }

    const admission = await db.admissions.findUnique({
      where: { admission_id: data.admission_id },
      select: { patient_id: true, patient: { select: { patient_type: true } } },
    });
    if (!admission) return { success: false, error: 'Admission not found' };

    const oldPatientType = admission.patient.patient_type || 'cash';
    const patientId = admission.patient_id;

    await db.$transaction(async (tx: any) => {
      if (data.patient_type === 'cash') {
        await tx.oPD_REG.update({
          where: { patient_id: patientId, organizationId },
          data: { patient_type: 'cash' },
        });
        return;
      }

      if (data.patient_type === 'corporate') {
        // Resolve corporate_name to a CorporateMaster (find existing by name,
        // else create) — mirrors reception-actions.updatePatient.
        let corporateId: string | null = null;
        const rawName = (data.corporate_name ?? '').trim();
        if (rawName) {
          let corp = await tx.corporateMaster.findFirst({
            where: { organizationId, company_name: { equals: rawName, mode: 'insensitive' } },
            select: { id: true },
          });
          if (!corp) {
            const base = rawName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CORP';
            let code = base, n = 1;
            while (await tx.corporateMaster.findFirst({ where: { organizationId, company_code: code }, select: { id: true } })) {
              code = `${base}${n++}`;
            }
            corp = await tx.corporateMaster.create({
              data: { organizationId, company_name: rawName, company_code: code, credit_limit: 0, discount_percentage: 0, payment_terms_days: 30, covered_services: [] },
              select: { id: true },
            });
          }
          corporateId = corp.id;
        }

        await tx.oPD_REG.update({
          where: { patient_id: patientId, organizationId },
          data: {
            patient_type: 'corporate',
            corporate_id: corporateId,
            corporate_card_number: data.corporate_card_number?.trim() || null,
            employee_id: data.employee_id?.trim() || null,
          },
        });
        return;
      }

      // tpa_insurance
      await tx.oPD_REG.update({
        where: { patient_id: patientId, organizationId },
        data: { patient_type: 'tpa_insurance' },
      });

      if (data.tpa_provider_id && data.insurance_policy_number) {
        const providerId = parseInt(data.tpa_provider_id, 10);
        if (!isNaN(providerId)) {
          await tx.insurance_policies.upsert({
            where: { policy_number: data.insurance_policy_number },
            create: {
              patient_id: patientId,
              provider_id: providerId,
              policy_number: data.insurance_policy_number,
              valid_from: data.insurance_validity_start ? new Date(data.insurance_validity_start) : null,
              valid_until: data.insurance_validity_end ? new Date(data.insurance_validity_end) : null,
              status: 'Active',
              organizationId,
            },
            update: {
              provider_id: providerId,
              valid_from: data.insurance_validity_start ? new Date(data.insurance_validity_start) : null,
              valid_until: data.insurance_validity_end ? new Date(data.insurance_validity_end) : null,
              status: 'Active',
            },
          });
        }
      }
    });

    if (oldPatientType !== data.patient_type) {
      await db.system_audit_logs.create({
        data: {
          action: 'CHANGE_PATIENT_CATEGORY',
          module: 'ipd',
          entity_type: 'admission',
          entity_id: data.admission_id,
          details: JSON.stringify({ old: oldPatientType, new: data.patient_type, by_role: role }),
          organizationId,
        },
      });
    }

    revalidatePath(`/ipd/admission/${data.admission_id}`);
    revalidatePath(`/reception/ipd/${data.admission_id}`);
    revalidatePath(`/admin/patients/${patientId}`);
    return { success: true };
  } catch (error: any) {
    console.error('updateAdmissionPatientCategory error:', error);
    return { success: false, error: error.message || 'Failed to update patient category' };
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

// ============================================
// MARK BED AS AVAILABLE (after cleaning)
// ============================================
export async function markBedAvailable(bedId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const bed = await db.beds.findUnique({ where: { bed_id: bedId } });
    if (!bed) return { success: false, error: 'Bed not found' };
    if (bed.status !== 'Cleaning') return { success: false, error: 'Bed is not in Cleaning status' };

    await db.beds.update({
      where: { bed_id: bedId },
      data: { status: 'Available' },
    });

    await db.system_audit_logs.create({
      data: {
        action: 'BED_MARKED_AVAILABLE',
        module: 'ipd',
        entity_type: 'bed',
        entity_id: bedId,
        details: JSON.stringify({ bedId, markedAt: new Date() }),
        organizationId,
      },
    });

    revalidatePath('/ipd/bed-matrix');
    return { success: true };
  } catch (error: any) {
    console.error('markBedAvailable error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// CANCEL ADMISSION
// ============================================
export async function cancelAdmission(admissionId: string, reason: string, cancellationDate?: string | Date, forceCancel?: boolean) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    const cancellationReason = (reason || '').trim();
    const cancelDate = cancellationDate ? new Date(cancellationDate) : new Date();
    const cancelledBy = session.username || session.name || 'system';

    // Force-cancel is admin-only (server-side enforcement)
    if (forceCancel && session.role !== 'admin') {
      return { success: false, error: 'Force-cancel is restricted to admin users only.' };
    }

    if (!cancellationReason) {
      return { success: false, error: 'Cancellation reason is required.' };
    }
    if (cancellationReason.length < 3) {
      return { success: false, error: 'Cancellation reason must be at least 3 characters.' };
    }

    const admission = await db.admissions.findUnique({
      where: { admission_id: admissionId },
    });

    if (!admission) return { success: false, error: 'Admission not found' };
    if (admission.status !== 'Admitted') return { success: false, error: 'Only active admissions can be cancelled' };

    // Enforce 8 hours limit check — skipped when forceCancel (admin override)
    if (!forceCancel) {
      const now = new Date();
      const admissionDate = new Date(admission.admission_date);
      const hoursDiff = (now.getTime() - admissionDate.getTime()) / (1000 * 60 * 60);
      if (hoursDiff > 8) {
        return { success: false, error: 'Cannot cancel admission because it was created more than 8 hours ago. Use force-cancel for admin override.' };
      }
    }

    // Enforce charges check — when forceCancel, cascade-cancel instead of blocking
    const [hasCharges, hasLab, hasPharmacy, hasInvoiceItems] = await Promise.all([
      db.ipdChargePosting.findFirst({ where: { admission_id: admissionId } }),
      db.lab_orders.findFirst({
        where: {
          patient_id: admission.patient_id,
          organizationId,
          created_at: { gte: admission.admission_date }
        }
      }),
      db.pharmacy_orders.findFirst({ where: { admission_id: admissionId } }),
      db.invoice_items.findFirst({ where: { invoice: { admission_id: admissionId } } })
    ]);

    if ((hasCharges || hasLab || hasPharmacy || hasInvoiceItems) && !forceCancel) {
      return { success: false, error: 'Cannot cancel admission because charges or orders have already been added. Use force-cancel for admin override.' };
    }

    await db.$transaction(async (tx: any) => {
      // Force-cancel: cascade-cancel/delete associated data first
      if (forceCancel && (hasCharges || hasLab || hasPharmacy || hasInvoiceItems)) {
        // IpdChargePosting has no status column — delete the rows
        await tx.ipdChargePosting.deleteMany({
          where: { admission_id: admissionId },
        });
        await tx.pharmacy_orders.updateMany({
          where: { admission_id: admissionId },
          data: { status: 'Cancelled' },
        });
        await tx.ipdAdmissionPackage.updateMany({
          where: { admission_id: admissionId },
          data: { status: 'Cancelled' },
        });
      }

      // 1. Mark admission as Cancelled
      await tx.admissions.update({
        where: { admission_id: admissionId },
        data: {
          status: 'Cancelled',
          discharge_date: cancelDate,
          discharge_type: 'Cancelled',
          cancellation_reason: cancellationReason,
          cancellation_date: cancelDate,
          cancelled_by: cancelledBy,
        },
      });

      // 2. Free the bed back to Available
      if (admission.bed_id) {
        await tx.beds.update({
          where: { bed_id: admission.bed_id },
          data: { status: 'Available' },
        });
      }

      // 3. Cancel any active invoices for this admission
      await tx.invoices.updateMany({
        where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        data: { status: 'Cancelled' },
      });

      // 4. Audit log
      await tx.system_audit_logs.create({
        data: {
          action: forceCancel ? 'FORCE_CANCEL_ADMISSION' : 'CANCEL_ADMISSION',
          module: 'ipd',
          entity_type: 'admission',
          entity_id: admissionId,
          details: JSON.stringify({
            reason: cancellationReason,
            bed_id: admission.bed_id,
            force: !!forceCancel,
            had_charges: !!(hasCharges || hasLab || hasPharmacy || hasInvoiceItems),
          }),
          organizationId,
        },
      });
    });

    revalidatePath('/ipd/admissions-hub');
    revalidatePath('/ipd');
    revalidatePath('/admin/ipd');
    revalidatePath('/ipd/bed-matrix');
    return { success: true };
  } catch (error: any) {
    console.error('cancelAdmission error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Everything the IPD dashboard needs, in one round trip.
 *
 * Same problem as the admin dashboard: the page wrapped four server actions in
 * Promise.all, which Next serialises into four sequential POSTs. Bundling lets
 * the queries run concurrently on the server.
 *
 * Parts are settled independently so one failing panel does not blank the page.
 */
export async function getIPDDashboardBundle(statusFilter?: string) {
  const settle = async <T>(p: Promise<T>): Promise<T | null> => {
    try { return await p; } catch (e) { console.error('IPD bundle part failed:', e); return null; }
  };

  const [stats, wards, beds, admissions] = await Promise.all([
    settle(getIPDStats()),
    settle(getWardsWithBeds()),
    settle(getAllBeds()),
    settle(getIPDAdmissions(statusFilter)),
  ]);

  return { success: true, data: { stats, wards, beds, admissions } };
}
