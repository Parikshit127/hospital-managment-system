'use server';

import { requireTenantContext, requireRoleAndTenant, ForbiddenError, AuthError } from '@/backend/tenant';
import { BroadcastAudience, BroadcastStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { deliverBroadcast } from '@/app/lib/broadcast-delivery';
import { logAudit } from '@/app/lib/audit';

// Private bucket holding uploaded release docs (PDF/Markdown). Uses the same
// signed-URL pattern as ticket attachments; must be provisioned like the
// ticket-attachments bucket (private + RLS).
const RELEASE_BUCKET = 'release_docs';

function toStoragePath(fileUrl: string): string {
    const apiMatch = fileUrl.match(/\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+?)(?:\?|$)/);
    if (apiMatch) return decodeURIComponent(apiMatch[1]);
    const marker = `/${RELEASE_BUCKET}/`;
    const idx = fileUrl.indexOf(marker);
    if (idx !== -1) return decodeURIComponent(fileUrl.slice(idx + marker.length).split('?')[0]);
    return fileUrl.replace(/^\/+/, '').split('?')[0];
}

interface CreateReleaseNoteInput {
    title: string;
    content: string;
    version: string;
    // Optional uploaded doc (client uploads to Supabase storage first, then
    // passes the returned path — reuse of the Phase 3 signed-URL upload pattern).
    fileUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
}

/**
 * Create a release note (draft). Admin role only.
 */
export async function createReleaseNote(input: CreateReleaseNoteInput) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(['admin']);

        if (!input.title?.trim() || !input.version?.trim()) {
            return { success: false, data: null, error: 'Title and version are required' };
        }

        const note = await db.releaseNote.create({
            data: {
                title: input.title.trim(),
                content: input.content ?? '',
                version: input.version.trim(),
                file_url: input.fileUrl ?? null,
                file_name: input.fileName ?? null,
                mime_type: input.mimeType ?? null,
                created_by: session.id,
                organizationId,
            },
        });

        await logAudit({
            action: 'release_note.created',
            module: 'Notifications',
            entity_type: 'ReleaseNote',
            entity_id: note.id,
            details: `Release ${note.version} "${note.title}" drafted`,
        });

        revalidatePath('/admin/release-notes');
        return { success: true, data: note };
    } catch (error) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, data: null, error: 'Not authorized' };
        }
        console.error('Create Release Note Error:', error);
        return { success: false, data: null, error: 'Internal error' };
    }
}

/**
 * Publish a release note. Admin role only. Publishing marks it published and
 * automatically fires an ALL_FACILITIES broadcast (default audience).
 */
export async function publishReleaseNote(releaseNoteId: string) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(['admin']);

        const note = await db.releaseNote.findFirst({
            where: { id: releaseNoteId, organizationId },
        });
        if (!note) {
            return { success: false, error: 'Release note not found' };
        }
        if (note.is_published) {
            return { success: false, error: 'Release note is already published' };
        }

        await db.releaseNote.update({
            where: { id: releaseNoteId },
            data: { is_published: true, published_at: new Date() },
        });

        // Publishing fires a broadcast to ALL facilities by default.
        const broadcast = await db.broadcast.create({
            data: {
                title: `New Release: ${note.version}`,
                body: note.title,
                audience: BroadcastAudience.ALL_FACILITIES,
                status: BroadcastStatus.SENT,
                sent_at: new Date(),
                release_note_id: note.id,
                created_by: session.id,
                organizationId,
            },
        });
        const recipients = await deliverBroadcast(db, broadcast);

        await logAudit({
            action: 'release_note.published',
            module: 'Notifications',
            entity_type: 'ReleaseNote',
            entity_id: note.id,
            details: `Release ${note.version} published; broadcast to ${recipients} recipient(s)`,
        });

        revalidatePath('/admin/release-notes');
        return { success: true, data: { id: note.id, broadcastId: broadcast.id, recipients } };
    } catch (error) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, error: 'Not authorized' };
        }
        console.error('Publish Release Note Error:', error);
        return { success: false, error: 'Internal error' };
    }
}

/**
 * Published release notes, visible to any authenticated user in the org.
 */
export async function getReleaseNotes() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const data = await db.releaseNote.findMany({
            where: { organizationId, is_published: true },
            orderBy: { published_at: 'desc' },
        });
        return { success: true, data };
    } catch (error) {
        console.error('Get Release Notes Error:', error);
        return { success: false, data: [] };
    }
}

/**
 * All release notes incl. drafts — admin only.
 */
export async function getAllReleaseNotes() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(['admin']);
        const data = await db.releaseNote.findMany({
            where: { organizationId },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data };
    } catch (error) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, data: [] };
        }
        console.error('Get All Release Notes Error:', error);
        return { success: false, data: [] };
    }
}

/**
 * Signed URL to view/download an uploaded release doc (private bucket).
 */
export async function getReleaseNoteSignedUrl(fileUrl: string) {
    try {
        await requireTenantContext();
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
            console.error('Release Note Signed URL Error: missing Supabase env');
            return { success: false, signedUrl: null };
        }
        const supabase = createClient(url, serviceKey);
        const { data, error } = await supabase.storage
            .from(RELEASE_BUCKET)
            .createSignedUrl(toStoragePath(fileUrl), 60 * 60);
        if (error || !data?.signedUrl) {
            console.error('Release Note Signed URL Error:', error?.message);
            return { success: false, signedUrl: null };
        }
        return { success: true, signedUrl: data.signedUrl };
    } catch (error) {
        console.error('Release Note Signed URL Error:', error);
        return { success: false, signedUrl: null };
    }
}
