'use server';

/**
 * GAP 11 — Drug Interaction / CDS Checking
 * Drug-drug interactions, drug-allergy contraindications, and
 * drug-medical-history contraindications when prescribing.
 * Uses existing drug-safety.ts lib + allergy cross-reference.
 */

import { requireTenantContext } from '@/backend/tenant';
import { checkDrugInteractions, checkContraindications } from '@/app/lib/drug-safety';

export async function checkPrescriptionSafety(
    patientId: string,
    newDrugs: string[],
    existingDrugs?: string[]
) {
    const { db, organizationId } = await requireTenantContext();

    try {
        // 1. Get patient allergies
        const allergies = await db.patientAllergy.findMany({
            where: { patient_id: patientId, organizationId, status: 'active' },
            select: { allergen_name: true, allergen_type: true, severity: true, reaction: true },
        });

        const allergenNames = allergies.map((a: { allergen_name: string }) => a.allergen_name);

        // 2. Get active medications for this patient (if admitted)
        const activeMeds = await (db as any).activeMedication?.findMany({
            where: { patient_id: patientId, organizationId, status: 'active' },
            select: { medication_name: true },
        }).catch(() => []);

        const currentMedNames = [
            ...(existingDrugs || []),
            ...(activeMeds || []).map((m: { medication_name: string }) => m.medication_name),
        ];

        // 3. All drugs to check interactions between
        const allDrugs = [...newDrugs, ...currentMedNames];

        // 4. Check drug-drug interactions
        const interactionResult = await checkDrugInteractions(allDrugs);

        // 5. Check drug-allergy contraindications
        const contraindicationResult = checkContraindications(newDrugs, allergenNames);

        // 6. Check against chronic conditions (medical history)
        const patient = await (db.oPD_REG.findFirst as any)({
            where: { patient_id: patientId, organizationId },
            select: { chronic_conditions: true },
        });

        const chronicWarnings: string[] = [];
        if (patient?.chronic_conditions) {
            const conditions = patient.chronic_conditions.toLowerCase();
            for (const drug of newDrugs) {
                const drugLower = drug.toLowerCase();
                if (conditions.includes('renal') && ['nsaid', 'ibuprofen', 'naproxen', 'metformin'].some(d => drugLower.includes(d))) {
                    chronicWarnings.push(`⚠️ Renal impairment: Use ${drug} with caution. Monitor kidney function.`);
                }
                if (conditions.includes('liver') && ['paracetamol', 'acetaminophen', 'statins'].some(d => drugLower.includes(d))) {
                    chronicWarnings.push(`⚠️ Hepatic impairment: Use ${drug} with caution. Monitor liver function.`);
                }
                if (conditions.includes('diabetes') && ['corticosteroid', 'prednisolone', 'dexamethasone'].some(d => drugLower.includes(d))) {
                    chronicWarnings.push(`⚠️ Diabetes: ${drug} may raise blood glucose. Monitor closely.`);
                }
            }
        }

        const hasAnyAlert =
            interactionResult.hasInteractions ||
            contraindicationResult.hasContraindications ||
            chronicWarnings.length > 0;

        return {
            success: true,
            data: {
                has_alerts: hasAnyAlert,
                drug_interactions: {
                    found: interactionResult.hasInteractions,
                    alerts: interactionResult.interactions,
                    source: interactionResult.source,
                },
                allergy_contraindications: {
                    found: contraindicationResult.hasContraindications,
                    alerts: contraindicationResult.contraindications,
                    patient_allergies: allergies,
                },
                chronic_condition_warnings: {
                    found: chronicWarnings.length > 0,
                    alerts: chronicWarnings,
                },
                summary: hasAnyAlert
                    ? `⚠️ ${interactionResult.interactions.length + contraindicationResult.contraindications.length + chronicWarnings.length} safety alert(s) found`
                    : '✅ No drug safety alerts found',
            },
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to check prescription safety';
        return { success: false, error: msg };
    }
}

export async function checkSingleDrugAllergy(patientId: string, drugName: string) {
    const { db, organizationId } = await requireTenantContext();

    const drugAllergies = await db.patientAllergy.findMany({
        where: {
            patient_id: patientId,
            organizationId,
            allergen_type: 'drug',
            status: 'active',
        },
    });

    const match = drugAllergies.find(
        (a: { allergen_name: string; severity: string; reaction: string | null }) =>
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
