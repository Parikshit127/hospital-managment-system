/**
 * Which molecules are controlled, so the formulary can be flagged.
 *
 * The controlled-drug rules across this codebase — the narcotic register, the
 * dispensing controls in pharmacy-actions, and the two-nurse check at the
 * bedside — all read pharmacy_medicine_master.is_narcotic and drug_schedule.
 * Not one drug in either organisation's formulary is flagged: 6,571 lines in
 * one, 6,631 in the other, zero narcotics, zero scheduled. Every one of those
 * rules is therefore inert. A safety rule that cannot fire is worse than no
 * rule, because it looks like protection.
 *
 * This is the candidate list a pharmacist reviews and applies. It is
 * deliberately not applied automatically: flagging is a pharmacy decision and
 * a wrong flag is friction on every dose.
 *
 * Indian schedules, which is what the formulary uses:
 *   NDPS — narcotics and psychotropics under the NDPS Act. Register + two-person
 *          check at administration.
 *   X    — psychotropics needing a duplicate prescription retained two years.
 *          Two-person check applies.
 *   H1   — record-keeping schedule, largely antibiotic stewardship and
 *          anti-TB. A register entry, NOT a bedside co-signature: demanding a
 *          second nurse for meropenem would be friction with no safety gain.
 */

export type ControlledClass = 'NDPS' | 'X' | 'H1';

export type ControlledMolecule = {
    /** Lower-case fragment matched against brand_name and generic_name. */
    molecule: string;
    schedule: ControlledClass;
    /** True for NDPS narcotics, which set is_narcotic as well as the schedule. */
    narcotic: boolean;
    note?: string;
};

export const CONTROLLED_MOLECULES: ControlledMolecule[] = [
    // ── NDPS narcotics ──────────────────────────────────────────────────────
    { molecule: 'morphine', schedule: 'NDPS', narcotic: true },
    { molecule: 'fentanyl', schedule: 'NDPS', narcotic: true },
    { molecule: 'pethidine', schedule: 'NDPS', narcotic: true },
    { molecule: 'meperidine', schedule: 'NDPS', narcotic: true },
    { molecule: 'methadone', schedule: 'NDPS', narcotic: true },
    { molecule: 'oxycodone', schedule: 'NDPS', narcotic: true },
    { molecule: 'hydromorphone', schedule: 'NDPS', narcotic: true },
    { molecule: 'buprenorphine', schedule: 'NDPS', narcotic: true },
    { molecule: 'codeine', schedule: 'NDPS', narcotic: true },
    { molecule: 'dihydrocodeine', schedule: 'NDPS', narcotic: true },
    { molecule: 'pentazocine', schedule: 'NDPS', narcotic: true },
    { molecule: 'tapentadol', schedule: 'NDPS', narcotic: true },
    { molecule: 'remifentanil', schedule: 'NDPS', narcotic: true },
    { molecule: 'sufentanil', schedule: 'NDPS', narcotic: true },
    { molecule: 'ketamine', schedule: 'NDPS', narcotic: true, note: 'Schedule X in India; controlled' },

    // ── Schedule X psychotropics ────────────────────────────────────────────
    { molecule: 'alprazolam', schedule: 'X', narcotic: false },
    { molecule: 'diazepam', schedule: 'X', narcotic: false },
    { molecule: 'lorazepam', schedule: 'X', narcotic: false },
    { molecule: 'clonazepam', schedule: 'X', narcotic: false },
    { molecule: 'nitrazepam', schedule: 'X', narcotic: false },
    { molecule: 'midazolam', schedule: 'X', narcotic: false },
    { molecule: 'chlordiazepoxide', schedule: 'X', narcotic: false },
    { molecule: 'phenobarbital', schedule: 'X', narcotic: false },
    { molecule: 'phenobarbitone', schedule: 'X', narcotic: false },
    { molecule: 'barbital', schedule: 'X', narcotic: false },
    { molecule: 'methylphenidate', schedule: 'X', narcotic: false },
    { molecule: 'zolpidem', schedule: 'X', narcotic: false },
    { molecule: 'zopiclone', schedule: 'X', narcotic: false },
    { molecule: 'nimetazepam', schedule: 'X', narcotic: false },

    // ── Schedule H1: register entry only, no bedside co-signature ───────────
    { molecule: 'tramadol', schedule: 'H1', narcotic: false, note: 'H1 in India' },
    { molecule: 'meropenem', schedule: 'H1', narcotic: false },
    { molecule: 'imipenem', schedule: 'H1', narcotic: false },
    { molecule: 'ertapenem', schedule: 'H1', narcotic: false },
    { molecule: 'moxifloxacin', schedule: 'H1', narcotic: false },
    { molecule: 'levofloxacin', schedule: 'H1', narcotic: false },
    { molecule: 'linezolid', schedule: 'H1', narcotic: false },
    { molecule: 'colistin', schedule: 'H1', narcotic: false },
    { molecule: 'vancomycin', schedule: 'H1', narcotic: false },
    { molecule: 'rifampicin', schedule: 'H1', narcotic: false },
    { molecule: 'isoniazid', schedule: 'H1', narcotic: false },
    { molecule: 'ethambutol', schedule: 'H1', narcotic: false },
    { molecule: 'pyrazinamide', schedule: 'H1', narcotic: false },
];

/**
 * Schedules that require a second person at the bedside.
 *
 * NDPS and X only. H1 is a record-keeping schedule — including it would demand
 * a co-signature for every dose of meropenem, which is friction with no safety
 * gain and is exactly how staff learn to click through warnings.
 */
export const WITNESS_REQUIRED_SCHEDULES = ['NDPS', 'X'];

/** Schedules that belong in the controlled register, which is a wider set. */
export const REGISTER_SCHEDULES = ['NDPS', 'X', 'H1', 'H'];

/** The controlled molecule a drug name corresponds to, if any. */
export function matchControlled(...names: (string | null | undefined)[]): ControlledMolecule | null {
    const hay = names.filter(Boolean).join(' ').toLowerCase();
    if (!hay.trim()) return null;
    // Longest molecule first, so "dihydrocodeine" is not reported as "codeine".
    const ordered = [...CONTROLLED_MOLECULES].sort((a, b) => b.molecule.length - a.molecule.length);
    return ordered.find((m) => hay.includes(m.molecule)) ?? null;
}
