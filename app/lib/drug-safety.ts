// ============================================================
// LOCAL DRUG INTERACTION DATABASE
// Common high-risk interactions that must always be checked
// regardless of external API availability.
// ============================================================
const LOCAL_INTERACTIONS: Array<{
    drugs: string[]
    severity: 'HIGH' | 'MODERATE'
    message: string
}> = [
    { drugs: ['warfarin', 'aspirin'], severity: 'HIGH', message: 'Warfarin + Aspirin: Significantly increased bleeding risk. Monitor INR closely.' },
    { drugs: ['warfarin', 'ibuprofen'], severity: 'HIGH', message: 'Warfarin + Ibuprofen: Increased bleeding risk. Avoid combination.' },
    { drugs: ['warfarin', 'naproxen'], severity: 'HIGH', message: 'Warfarin + Naproxen: Increased anticoagulant effect and bleeding risk.' },
    { drugs: ['metformin', 'alcohol'], severity: 'HIGH', message: 'Metformin + Alcohol: Risk of lactic acidosis. Avoid alcohol.' },
    { drugs: ['ssri', 'tramadol'], severity: 'HIGH', message: 'SSRI + Tramadol: Risk of serotonin syndrome. Avoid combination.' },
    { drugs: ['fluoxetine', 'tramadol'], severity: 'HIGH', message: 'Fluoxetine + Tramadol: Serotonin syndrome risk. Avoid.' },
    { drugs: ['sertraline', 'tramadol'], severity: 'HIGH', message: 'Sertraline + Tramadol: Serotonin syndrome risk. Avoid.' },
    { drugs: ['maoi', 'ssri'], severity: 'HIGH', message: 'MAOI + SSRI: Potentially fatal serotonin syndrome. Contraindicated.' },
    { drugs: ['digoxin', 'amiodarone'], severity: 'HIGH', message: 'Digoxin + Amiodarone: Digoxin toxicity risk. Reduce digoxin dose.' },
    { drugs: ['simvastatin', 'amiodarone'], severity: 'HIGH', message: 'Simvastatin + Amiodarone: Myopathy/rhabdomyolysis risk. Limit simvastatin dose.' },
    { drugs: ['methotrexate', 'nsaid'], severity: 'HIGH', message: 'Methotrexate + NSAIDs: Methotrexate toxicity risk. Avoid combination.' },
    { drugs: ['methotrexate', 'ibuprofen'], severity: 'HIGH', message: 'Methotrexate + Ibuprofen: Methotrexate toxicity. Avoid.' },
    { drugs: ['lithium', 'ibuprofen'], severity: 'HIGH', message: 'Lithium + Ibuprofen: Lithium toxicity risk. Monitor levels.' },
    { drugs: ['lithium', 'naproxen'], severity: 'HIGH', message: 'Lithium + Naproxen: Lithium toxicity risk. Monitor levels.' },
    { drugs: ['clopidogrel', 'omeprazole'], severity: 'MODERATE', message: 'Clopidogrel + Omeprazole: Reduced antiplatelet effect. Consider alternative PPI.' },
    { drugs: ['amlodipine', 'simvastatin'], severity: 'MODERATE', message: 'Amlodipine + Simvastatin: Increased simvastatin exposure. Limit simvastatin to 20mg.' },
    { drugs: ['ciprofloxacin', 'antacid'], severity: 'MODERATE', message: 'Ciprofloxacin + Antacids: Reduced ciprofloxacin absorption. Separate by 2 hours.' },
    { drugs: ['atorvastatin', 'clarithromycin'], severity: 'HIGH', message: 'Atorvastatin + Clarithromycin: Myopathy risk. Suspend statin during antibiotic course.' },
    { drugs: ['sildenafil', 'nitrate'], severity: 'HIGH', message: 'Sildenafil + Nitrates: Severe hypotension. Contraindicated.' },
    { drugs: ['tadalafil', 'nitrate'], severity: 'HIGH', message: 'Tadalafil + Nitrates: Severe hypotension. Contraindicated.' },
]

function checkLocalInteractions(drugNames: string[]): string[] {
    const normalised = drugNames.map(d => d.toLowerCase().trim())
    const found: string[] = []

    for (const rule of LOCAL_INTERACTIONS) {
        const matched = rule.drugs.filter(d =>
            normalised.some(n => n.includes(d) || d.includes(n))
        )
        if (matched.length >= 2) {
            found.push(`[${rule.severity}] ${rule.message}`)
        }
    }

    return found
}

export async function checkDrugInteractions(drugNames: string[]): Promise<{
    hasInteractions: boolean
    interactions: string[]
    source: 'local' | 'fda' | 'combined'
}> {
    if (drugNames.length < 2) return { hasInteractions: false, interactions: [], source: 'local' }

    // Always run local check first — it's instant and reliable
    const localInteractions = checkLocalInteractions(drugNames)

    // Try FDA API with a short timeout — don't block on it
    let fdaInteractions: string[] = []
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000) // 3s timeout

        const query = drugNames.slice(0, 4).join('+AND+')
        const res = await fetch(
            `https://api.fda.gov/drug/label.json?search=drug_interactions:${encodeURIComponent(query)}&limit=3`,
            { signal: controller.signal, next: { revalidate: 3600 } }
        )
        clearTimeout(timeout)

        if (res.ok) {
            const data = await res.json()
            if (data.results?.length > 0) {
                fdaInteractions = data.results
                    .map((r: any) => r.drug_interactions?.[0])
                    .filter(Boolean)
                    .map((text: string) => text.length > 300 ? text.slice(0, 300) + '...' : text)
                    .slice(0, 2)
            }
        }
    } catch {
        // FDA API unavailable — local check is the fallback
    }

    const allInteractions = [...localInteractions, ...fdaInteractions]
    const source = localInteractions.length > 0 && fdaInteractions.length > 0
        ? 'combined'
        : fdaInteractions.length > 0 ? 'fda' : 'local'

    return {
        hasInteractions: allInteractions.length > 0,
        interactions: allInteractions,
        source,
    }
}

/**
 * Check if any of the prescribed drugs are contraindicated for the patient
 * based on their known allergies.
 */
export function checkContraindications(
    drugNames: string[],
    patientAllergies: string[]
): { hasContraindications: boolean; contraindications: string[] } {
    if (!patientAllergies || patientAllergies.length === 0) {
        return { hasContraindications: false, contraindications: [] }
    }

    const normalisedAllergies = patientAllergies.map(a => a.toLowerCase().trim())
    const normalisedDrugs = drugNames.map(d => d.toLowerCase().trim())

    const contraindications: string[] = []

    for (const drug of normalisedDrugs) {
        for (const allergy of normalisedAllergies) {
            if (drug.includes(allergy) || allergy.includes(drug)) {
                contraindications.push(
                    `⚠️ ALLERGY ALERT: Patient is allergic to "${allergy}" — "${drug}" may be contraindicated.`
                )
            }
        }
    }

    // Cross-reactivity checks (e.g., penicillin allergy → cephalosporins)
    const crossReactivity: Array<{ allergen: string; related: string[]; warning: string }> = [
        {
            allergen: 'penicillin',
            related: ['amoxicillin', 'ampicillin', 'cephalosporin', 'cefazolin', 'ceftriaxone'],
            warning: 'Penicillin allergy: Cross-reactivity possible with cephalosporins (~1-2%). Use with caution.',
        },
        {
            allergen: 'sulfa',
            related: ['sulfamethoxazole', 'trimethoprim', 'furosemide', 'hydrochlorothiazide'],
            warning: 'Sulfa allergy: Cross-reactivity possible with sulfonamide-containing drugs.',
        },
        {
            allergen: 'aspirin',
            related: ['ibuprofen', 'naproxen', 'diclofenac', 'celecoxib'],
            warning: 'Aspirin allergy/intolerance: Cross-reactivity with other NSAIDs possible.',
        },
    ]

    for (const rule of crossReactivity) {
        const hasAllergen = normalisedAllergies.some(a => a.includes(rule.allergen))
        if (hasAllergen) {
            const crossMatches = normalisedDrugs.filter(d =>
                rule.related.some(r => d.includes(r) || r.includes(d))
            )
            if (crossMatches.length > 0) {
                contraindications.push(`[CROSS-REACTIVITY] ${rule.warning}`)
            }
        }
    }

    return {
        hasContraindications: contraindications.length > 0,
        contraindications,
    }
}
