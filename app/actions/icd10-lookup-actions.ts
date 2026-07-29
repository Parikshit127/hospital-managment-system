'use server';

/**
 * GAP 10 — ICD-10 / SNOMED CT Lookup Integration
 * Provides ICD-10 autocomplete with code validation and coded diagnosis entry.
 * Uses existing searchICD10 from lib/icd10.ts + local master table.
 */

import { requireTenantContext } from '@/backend/tenant';
import { searchICD10 } from '@/app/lib/icd10';

export async function searchICD10Codes(query: string) {
    if (!query || query.length < 2) {
        return { success: true, data: [] };
    }

    try {
        // First try external API
        const externalResults = await searchICD10(query);

        // Also search local master if available
        const { db, organizationId } = await requireTenantContext();
        const localResults = await (db as any).iCD10Master?.findMany({
            where: {
                is_active: true,
                OR: [
                    { code: { contains: query, mode: 'insensitive' } },
                    { description: { contains: query, mode: 'insensitive' } },
                ],
            },
            take: 10,
        }).catch(() => []);

        // Merge and deduplicate
        const combined = [...externalResults, ...(localResults || [])];
        const unique = Array.from(
            new Map(combined.map((item: { code: string }) => [item.code, item])).values()
        );

        return { success: true, data: unique.slice(0, 15) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to search ICD-10';
        return { success: false, error: msg };
    }
}

export async function validateICD10Code(code: string) {
    try {
        // Check external API first
        const results = await searchICD10(code);
        const exactMatch = results.find((r: { code: string }) => r.code.toUpperCase() === code.toUpperCase());

        if (exactMatch) {
            return { success: true, valid: true, data: exactMatch };
        }

        // Check local master
        const { db } = await requireTenantContext();
        const local = await (db as any).iCD10Master?.findFirst({
            where: { code: { equals: code, mode: 'insensitive' }, is_active: true },
        }).catch(() => null);

        if (local) {
            return { success: true, valid: true, data: { code: local.code, name: local.description } };
        }

        return { success: true, valid: false, message: 'ICD-10 code not found' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to validate ICD-10 code';
        return { success: false, error: msg };
    }
}

export async function addICD10ToMaster(code: string, description: string, category?: string) {
    const { db } = await requireTenantContext();

    try {
        const icd = await (db as any).iCD10Master.create({
            data: {
                code: code.toUpperCase(),
                description,
                category: category || null,
                is_active: true,
            },
        });

        return { success: true, data: JSON.parse(JSON.stringify(icd)) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to add ICD-10 to master';
        return { success: false, error: msg };
    }
}

export async function bulkImportICD10(codes: Array<{ code: string; description: string; category?: string }>) {
    const { db } = await requireTenantContext();

    try {
        const data = codes.map((c) => ({
            code: c.code.toUpperCase(),
            description: c.description,
            category: c.category || null,
            is_active: true,
        }));

        await (db as any).iCD10Master.createMany({
            data,
            skipDuplicates: true,
        });

        return { success: true, imported: data.length };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to bulk import ICD-10';
        return { success: false, error: msg };
    }
}

export async function getICD10Master(limit = 100) {
    const { db } = await requireTenantContext();

    const codes = await (db as any).iCD10Master.findMany({
        where: { is_active: true },
        orderBy: { code: 'asc' },
        take: limit,
    });

    return { success: true, data: JSON.parse(JSON.stringify(codes)) };
}
