'use server';

import { requireTenantContext } from '@/backend/tenant';
import { searchICD10 } from '@/app/lib/icd10';

// ── Types ──────────────────────────────────────────────────────────────────

export type SoapSubjective = {
    chief_complaint?: string;
    hpi?: string;
    social_history?: string;
    family_history?: string;
    ros?: Record<string, string>;
};

export type SoapDiagnosis = {
    diagnosis_text: string;
    icd10_code?: string;
    icd10_description?: string;
    type: 'primary' | 'secondary' | 'rule_out';
    status: 'confirmed' | 'provisional' | 'rule_out';
};

export type SoapPlan = {
    medications?: string[];
    lab_orders?: string[];
    procedures?: string[];
    referrals?: string[];
    follow_up?: string;
    instructions?: string;
};

export type EncounterInput = {
    patient_id: string;
    appointment_id?: string;
    doctor_id: string;
    subjective?: SoapSubjective;
    objective?: Record<string, unknown>;
    assessment?: SoapDiagnosis[];
    plan?: SoapPlan;
    allergies_reviewed?: boolean;
};

// ── Encounters ─────────────────────────────────────────────────────────────

export async function createEncounter(data: EncounterInput) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const encounter = await db.clinicalEncounter.create({
            data: {
                organizationId,
                patient_id: data.patient_id,
                appointment_id: data.appointment_id || null,
                doctor_id: data.doctor_id,
                subjective: (data.subjective as object) ?? {},
                objective: (data.objective as object) ?? {},
                assessment: (data.assessment as object[]) ?? [],
                plan: (data.plan as object) ?? {},
                allergies_reviewed: data.allergies_reviewed ?? false,
                status: 'in_progress',
            },
        });
        return { success: true, data: encounter };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create encounter';
        return { success: false, error: msg };
    }
}

export async function updateEncounter(id: string, data: Partial<EncounterInput>) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const updateData: Record<string, unknown> = {};
        if (data.subjective !== undefined) updateData.subjective = data.subjective;
        if (data.objective !== undefined) updateData.objective = data.objective;
        if (data.assessment !== undefined) updateData.assessment = data.assessment;
        if (data.plan !== undefined) updateData.plan = data.plan;
        if (data.allergies_reviewed !== undefined) updateData.allergies_reviewed = data.allergies_reviewed;

        await db.clinicalEncounter.update({
            where: { id, organizationId },
            data: updateData,
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update encounter';
        return { success: false, error: msg };
    }
}

export async function signEncounter(id: string, doctorId: string) {
    const { db, organizationId } = await requireTenantContext();
    try {
        await db.clinicalEncounter.update({
            where: { id, organizationId },
            data: { status: 'completed', signed_at: new Date(), signed_by: doctorId },
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to sign encounter';
        return { success: false, error: msg };
    }
}

export async function getPatientEncounters(patientId: string, limit = 20) {
    const { db, organizationId } = await requireTenantContext();
    const encounters = await db.clinicalEncounter.findMany({
        where: { patient_id: patientId, organizationId },
        orderBy: { encounter_date: 'desc' },
        take: limit,
    });
    return { success: true, data: JSON.parse(JSON.stringify(encounters)) };
}

export async function getOrCreateEncounterForAppointment(appointmentId: string, patientId: string, doctorId: string) {
    const { db, organizationId } = await requireTenantContext();
    const existing = await db.clinicalEncounter.findFirst({
        where: { appointment_id: appointmentId, organizationId },
    });
    if (existing) return { success: true, data: JSON.parse(JSON.stringify(existing)), created: false };

    const encounter = await db.clinicalEncounter.create({
        data: {
            organizationId,
            patient_id: patientId,
            appointment_id: appointmentId,
            doctor_id: doctorId,
            subjective: {},
            objective: {},
            assessment: [],
            plan: {},
            status: 'in_progress',
        },
    });
    return { success: true, data: JSON.parse(JSON.stringify(encounter)), created: true };
}

// ── ICD-10 Search (wraps existing lib) ────────────────────────────────────

export async function searchICD10Codes(query: string) {
    const results = await searchICD10(query);
    return { success: true, data: results };
}

// ── Patient Allergies ─────────────────────────────────────────────────────

export async function getPatientAllergies(patientId: string) {
    const { db, organizationId } = await requireTenantContext();
    const allergies = await db.patientAllergy.findMany({
        where: { patient_id: patientId, organizationId, status: 'active' },
        orderBy: { severity: 'asc' },
    });
    return { success: true, data: JSON.parse(JSON.stringify(allergies)) };
}

export async function addPatientAllergy(data: {
    patient_id: string;
    allergen_name: string;
    allergen_type: string;
    reaction?: string;
    severity: string;
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const allergy = await db.patientAllergy.create({
            data: {
                organizationId,
                patient_id: data.patient_id,
                allergen_name: data.allergen_name,
                allergen_type: data.allergen_type,
                reaction: data.reaction || null,
                severity: data.severity,
                status: 'active',
            },
        });
        return { success: true, data: allergy };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to add allergy';
        return { success: false, error: msg };
    }
}

export async function resolveAllergy(id: string) {
    const { db, organizationId } = await requireTenantContext();
    try {
        await db.patientAllergy.update({
            where: { id, organizationId },
            data: { status: 'resolved' },
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to resolve allergy';
        return { success: false, error: msg };
    }
}

export async function checkDrugAllergyInteraction(patientId: string, drugName: string) {
    const { db, organizationId } = await requireTenantContext();
    const drugAllergies = await db.patientAllergy.findMany({
        where: {
            patient_id: patientId,
            organizationId,
            allergen_type: 'drug',
            status: 'active',
        },
    });

    const match = drugAllergies.find((a: { allergen_name: string; severity: string; reaction: string | null }) =>
        drugName.toLowerCase().includes(a.allergen_name.toLowerCase()) ||
        a.allergen_name.toLowerCase().includes(drugName.toLowerCase())
    );

    if (match) {
        return {
            success: true,
            alert: {
                allergen: match.allergen_name,
                severity: match.severity,
                reaction: match.reaction,
            },
        };
    }
    return { success: true, alert: null };
}

// ── Vitals ─────────────────────────────────────────────────────────────────

export async function recordVitals(data: {
    patient_id: string;
    appointment_id?: string;
    encounter_id?: string;
    blood_pressure?: string;
    heart_rate?: number;
    temperature?: number;
    oxygen_sat?: number;
    respiratory_rate?: number;
    weight?: number;
    height?: number;
    blood_sugar?: number;
    pain_scale?: number;
    recorded_by?: string;
}) {
    const { db, organizationId } = await requireTenantContext();
    try {
        const vitals = await db.vital_signs.create({
            data: {
                patient_id: data.patient_id,
                appointment_id: data.appointment_id || null,
                encounter_id: data.encounter_id || null,
                blood_pressure: data.blood_pressure || null,
                heart_rate: data.heart_rate || null,
                temperature: data.temperature || null,
                oxygen_sat: data.oxygen_sat || null,
                respiratory_rate: data.respiratory_rate || null,
                weight: data.weight || null,
                height: data.height || null,
                blood_sugar: data.blood_sugar || null,
                pain_scale: data.pain_scale ?? null,
                recorded_by: data.recorded_by || null,
                organizationId,
            },
        });
        return { success: true, data: JSON.parse(JSON.stringify(vitals)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to record vitals';
        return { success: false, error: msg };
    }
}

export async function getVitalsHistory(patientId: string, limit = 10) {
    const { db, organizationId } = await requireTenantContext();
    const vitals = await db.vital_signs.findMany({
        where: { patient_id: patientId, organizationId },
        orderBy: { created_at: 'desc' },
        take: limit,
    });
    return { success: true, data: JSON.parse(JSON.stringify(vitals)) };
}
