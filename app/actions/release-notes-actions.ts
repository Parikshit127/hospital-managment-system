'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// ========================================
// CREATE RELEASE NOTE
// ========================================

export async function createReleaseNote(title: string, content: string, version: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const note = await db.releaseNote.create({
            data: {
                title,
                content,
                version,
                organizationId,
            },
        });

        revalidatePath('/release-notes');
        return { success: true, data: note };
    } catch (error) {
        console.error('Create Release Note Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// GET RELEASE NOTES (current organization)
// ========================================

export async function getReleaseNotes() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const data = await db.releaseNote.findMany({
            where: { organizationId },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data };
    } catch (error) {
        console.error('Get Release Notes Error:', error);
        return { success: false, data: [] };
    }
}
