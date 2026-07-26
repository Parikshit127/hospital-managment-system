/**
 * Drug-class cross-reactivity, for the allergy check.
 *
 * The allergy matcher compares text. That catches "Penicillin" against
 * "Penicillin V 250mg" and misses the case that actually kills people: a
 * patient documented as allergic to penicillin, prescribed **amoxicillin**.
 * Amoxicillin is a penicillin, but the word "penicillin" does not appear in it,
 * so a text match sees two unrelated drugs and says nothing.
 *
 * Names only — this is a name-matching aid, not a formulary. It errs toward
 * flagging: a false positive costs one override with a typed reason, a false
 * negative can cause anaphylaxis.
 */

/** Members of each class, by generic name fragment (lower case). */
export const DRUG_CLASSES: Record<string, string[]> = {
    penicillin: [
        'penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'cloxacillin',
        'flucloxacillin', 'dicloxacillin', 'piperacillin', 'ticarcillin',
        'benzylpenicillin', 'benzathine', 'phenoxymethylpenicillin',
        'augmentin', 'amoxyclav', 'amoxiclav', 'co-amoxiclav', 'clavulan',
    ],
    cephalosporin: [
        'cephalosporin', 'cefalosporin',
        'cephalexin', 'cefalexin', 'cefazolin', 'cephazolin', 'cefuroxime',
        'ceftriaxone', 'cefotaxime', 'ceftazidime', 'cefixime', 'cefpodoxime',
        'cefepime', 'cefdinir', 'cefaclor', 'ceftaroline', 'cefoperazone',
    ],
    carbapenem: ['meropenem', 'imipenem', 'ertapenem', 'doripenem'],
    sulfonamide: [
        // 'sulfa' and 'sulpha' are how the allergy is usually written on a chart,
        // and neither is a substring of any full drug name — without them the
        // commonest sulfonamide allergy in the notes matches nothing.
        'sulfa', 'sulpha',
        'sulfamethoxazole', 'cotrimoxazole', 'co-trimoxazole', 'septran',
        'sulfadiazine', 'sulfasalazine', 'sulphamethoxazole',
    ],
    nsaid: [
        'nsaid', 'nsaids',
        'ibuprofen', 'diclofenac', 'aceclofenac', 'naproxen', 'aspirin',
        'acetylsalicylic', 'ketorolac', 'indomethacin', 'etoricoxib',
        'celecoxib', 'nimesulide', 'mefenamic', 'piroxicam', 'flurbiprofen',
    ],
    macrolide: ['erythromycin', 'azithromycin', 'clarithromycin', 'roxithromycin'],
    quinolone: [
        'quinolone', 'fluoroquinolone',
        'ciprofloxacin', 'levofloxacin', 'ofloxacin', 'norfloxacin',
        'moxifloxacin', 'gatifloxacin', 'sparfloxacin',
    ],
    aminoglycoside: ['gentamicin', 'amikacin', 'tobramycin', 'streptomycin', 'neomycin', 'netilmicin'],
    tetracycline: ['tetracycline', 'doxycycline', 'minocycline', 'tigecycline'],
    opioid: [
        'opioid', 'opiate',
        'morphine', 'codeine', 'tramadol', 'fentanyl', 'pethidine', 'meperidine',
        'oxycodone', 'buprenorphine', 'hydromorphone', 'methadone', 'tapentadol',
    ],
    statin: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
    ace_inhibitor: ['enalapril', 'lisinopril', 'ramipril', 'captopril', 'perindopril', 'trandolapril'],
    anticonvulsant: ['phenytoin', 'carbamazepine', 'oxcarbazepine', 'lamotrigine', 'phenobarbital', 'valproate'],
    heparin: ['heparin', 'enoxaparin', 'dalteparin', 'fondaparinux', 'nadroparin'],
    contrast_iodine: ['iohexol', 'iopamidol', 'ioversol', 'iodixanol', 'iodinated'],
};

/**
 * Classes that cross-react with each other.
 *
 * Penicillin/cephalosporin is the clinically important one — the shared
 * beta-lactam ring means a documented penicillin allergy is a reason to think
 * before giving a cephalosporin or a carbapenem, even though true
 * cross-reactivity is low.
 */
const CROSS_REACTIVE: Array<[string, string]> = [
    ['penicillin', 'cephalosporin'],
    ['penicillin', 'carbapenem'],
    ['cephalosporin', 'carbapenem'],
];

/** Every class a drug name belongs to. */
export function classesOf(name: string): string[] {
    const n = String(name || '').toLowerCase();
    if (!n.trim()) return [];
    const hits: string[] = [];
    for (const [cls, members] of Object.entries(DRUG_CLASSES)) {
        if (members.some((m) => n.includes(m))) hits.push(cls);
    }
    return hits;
}

function crossReacts(a: string, b: string): boolean {
    return CROSS_REACTIVE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Do an allergen and a drug share a class, or two classes known to cross-react?
 * Returns a human-readable explanation, or null when there is no relationship.
 */
export function classRelation(allergenName: string, drugName: string): string | null {
    const allergenClasses = classesOf(allergenName);
    const drugClasses = classesOf(drugName);
    if (!allergenClasses.length || !drugClasses.length) return null;

    for (const a of allergenClasses) {
        for (const d of drugClasses) {
            if (a === d) return `both are ${a.replace(/_/g, ' ')} drugs`;
        }
    }
    for (const a of allergenClasses) {
        for (const d of drugClasses) {
            if (crossReacts(a, d)) {
                return `${d.replace(/_/g, ' ')} drugs can cross-react with ${a.replace(/_/g, ' ')} allergy`;
            }
        }
    }
    return null;
}
