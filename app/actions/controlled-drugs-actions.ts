'use server';

/**
 * Flagging the formulary's controlled drugs.
 *
 * Every controlled-drug rule in the system reads is_narcotic / drug_schedule on
 * pharmacy_medicine_master: the narcotic register, the dispensing controls in
 * pharmacy-actions, and the two-nurse check at the bedside. Neither
 * organisation has a single flagged line, so all of them are inert.
 *
 * This proposes matches from a curated molecule list and applies only what a
 * pharmacist confirms. Deliberately not automatic — a wrong flag is friction on
 * every dose of that drug, and a missed one is a controlled drug given without
 * a second check.
 */

import { requireTenantContext, denyUnlessRole } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { matchControlled } from '@/app/lib/controlled-substances';

const MANAGE_ROLES = ['admin', 'pharmacist'];

/**
 * Formulary lines that look controlled, with what they would be set to.
 *
 * Scans names in JS rather than issuing one query per molecule: 40+ molecules
 * against a 6,500-line formulary would otherwise be 40 round trips.
 */
export async function getControlledDrugCandidates() {
    const denied = await denyUnlessRole(MANAGE_ROLES, 'review controlled drugs');
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        const meds = await db.pharmacy_medicine_master.findMany({
            select: {
                id: true, brand_name: true, generic_name: true,
                is_narcotic: true, drug_schedule: true,
            },
        });

        const candidates: Array<Record<string, unknown>> = [];
        let alreadyFlagged = 0;

        for (const m of meds) {
            const hit = matchControlled(m.brand_name, m.generic_name);
            const isFlagged = m.is_narcotic || !!m.drug_schedule;
            if (isFlagged) alreadyFlagged++;
            if (!hit) continue;

            const upToDate =
                m.is_narcotic === hit.narcotic &&
                String(m.drug_schedule || '').toUpperCase() === hit.schedule;
            if (upToDate) continue;

            candidates.push({
                id: m.id,
                brand_name: m.brand_name,
                generic_name: m.generic_name,
                current_narcotic: m.is_narcotic,
                current_schedule: m.drug_schedule,
                molecule: hit.molecule,
                suggested_schedule: hit.schedule,
                suggested_narcotic: hit.narcotic,
                note: hit.note ?? null,
            });
        }

        candidates.sort((a, b) =>
            String(a.suggested_schedule).localeCompare(String(b.suggested_schedule)) ||
            String(a.molecule).localeCompare(String(b.molecule)));

        return {
            success: true,
            data: {
                candidates,
                formularySize: meds.length,
                alreadyFlagged,
            },
        };
    } catch (error) {
        console.error('getControlledDrugCandidates error:', error);
        return { success: false, error: 'Failed to scan the formulary' };
    }
}

/** Apply the flags a pharmacist has confirmed. */
export async function applyControlledDrugFlags(
    items: Array<{ id: number; schedule: string; narcotic: boolean }>,
) {
    const denied = await denyUnlessRole(MANAGE_ROLES, 'change controlled-drug flags');
    if (denied) return denied;

    if (!items?.length) return { success: false, error: 'Nothing selected.' };

    try {
        const { db, session } = await requireTenantContext();

        let updated = 0;
        for (const item of items) {
            // updateMany, not update: the tenant extension scopes the where
            // clause, so a formulary line from another hospital simply matches
            // nothing instead of being written to.
            const res = await db.pharmacy_medicine_master.updateMany({
                where: { id: item.id },
                data: { is_narcotic: item.narcotic, drug_schedule: item.schedule },
            });
            updated += res.count;
        }

        // Who changed a controlled-drug flag is itself auditable.
        await db.system_audit_logs.create({
            data: {
                action: 'CONTROLLED_DRUG_FLAGS_UPDATED',
                // Required on this model. Omitting it made the write throw into
                // the catch below, so the change was applied and never recorded.
                module: 'pharmacy',
                entity_type: 'pharmacy_medicine_master',
                entity_id: String(items[0]?.id ?? ''),
                user_id: session.id,
                username: session.username,
                role: session.role,
                details: JSON.stringify({
                    count: updated,
                    by: session.name || session.username,
                    items: items.slice(0, 50),
                }),
            },
        }).catch((e: unknown) => {
            // Never fail the update on an audit write, but do not lose it either.
            console.error('controlled-drug audit write failed:', e);
        });

        revalidatePath('/pharmacy/controlled-drugs');
        revalidatePath('/pharmacy/narcotics');
        return { success: true, data: { updated } };
    } catch (error) {
        console.error('applyControlledDrugFlags error:', error);
        return { success: false, error: 'Failed to apply flags' };
    }
}

/** What is currently flagged, so the list can be reviewed and corrected. */
export async function getFlaggedControlledDrugs() {
    const denied = await denyUnlessRole(MANAGE_ROLES, 'review controlled drugs');
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();
        const rows = await db.pharmacy_medicine_master.findMany({
            where: { OR: [{ is_narcotic: true }, { drug_schedule: { not: null } }] },
            select: { id: true, brand_name: true, generic_name: true, is_narcotic: true, drug_schedule: true },
            orderBy: { brand_name: 'asc' },
            take: 500,
        });
        return { success: true, data: rows };
    } catch (error) {
        console.error('getFlaggedControlledDrugs error:', error);
        return { success: false, error: 'Failed to load flagged drugs' };
    }
}
