'use server';

import { requireTenantContext } from '@/backend/tenant';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

// Bucket the ticket attachments are uploaded to (see RaiseTicketForm.tsx).
const ATTACHMENTS_BUCKET = 'ticket_attachments';

// The DB may store either a bare storage path (e.g. "1699-abc.png") or a full
// Supabase URL. Supabase's createSignedUrl expects the RELATIVE path within the
// bucket, so normalize to that here.
function toStoragePath(fileUrl: string): string {
    // Full storage URL: .../object/(public|sign|authenticated)/<bucket>/<path>
    const apiMatch = fileUrl.match(/\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+?)(?:\?|$)/);
    if (apiMatch) return decodeURIComponent(apiMatch[1]);

    // Any other URL that still contains the bucket segment: strip up to it.
    const marker = `/${ATTACHMENTS_BUCKET}/`;
    const idx = fileUrl.indexOf(marker);
    if (idx !== -1) return decodeURIComponent(fileUrl.slice(idx + marker.length).split('?')[0]);

    // Otherwise assume it is already a relative path.
    return fileUrl.replace(/^\/+/, '').split('?')[0];
}

// Human-readable labels for ticket statuses (used in user-facing messages).
const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
    [TicketStatus.Open]: 'Open',
    [TicketStatus.InProgress]: 'In Progress',
    [TicketStatus.Resolved]: 'Resolved',
};

// ========================================
// CREATE TICKET
// ========================================

interface CreateTicketInput {
    title: string;
    description: string;
    priority: TicketPriority;
    branchId: string;
    module?: string;
}

export async function createTicket(input: CreateTicketInput) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const ticket = await db.ticket.create({
            data: {
                title: input.title,
                description: input.description,
                module: input.module ?? null,
                priority: input.priority,
                status: TicketStatus.Open,
                user_id: session.id,
                branch_id: input.branchId,
                organizationId,
            },
        });

        revalidatePath('/help-center');
        return { success: true, data: ticket };
    } catch (error) {
        console.error('Create Ticket Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// SAVE TICKET ATTACHMENT
// (called after the client uploads the file to Supabase storage)
// ========================================

interface SaveTicketAttachmentInput {
    ticketId: string;
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
}

export async function saveTicketAttachment(input: SaveTicketAttachmentInput) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Tenant safety: only allow attaching to a ticket in the caller's org.
        const ticket = await db.ticket.findFirst({
            where: { id: input.ticketId, organizationId },
            select: { id: true },
        });

        if (!ticket) {
            return { success: false, data: null };
        }

        const attachment = await db.ticketAttachment.create({
            data: {
                ticket_id: input.ticketId,
                file_url: input.fileUrl,
                file_name: input.fileName,
                file_size: input.fileSize,
                mime_type: input.mimeType,
            },
        });

        revalidatePath('/help-center');
        revalidatePath('/admin/support');
        return { success: true, data: attachment };
    } catch (error) {
        console.error('Save Ticket Attachment Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// GENERATE SIGNED URL FOR AN ATTACHMENT
// (private bucket -> reads require a signed URL)
// ========================================

export async function getAttachmentSignedUrl(fileUrl: string) {
    try {
        // Require an authenticated tenant session (admin support portal).
        await requireTenantContext();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        // Service role bypasses storage RLS server-side (the app uses its own
        // JWT auth, not Supabase Auth, so the anon role has no RLS grant here).
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            console.error(
                'Get Attachment Signed URL Error: missing env',
                JSON.stringify({
                    hasUrl: Boolean(supabaseUrl),
                    hasServiceKey: Boolean(serviceKey),
                }),
            );
            return { success: false, signedUrl: null };
        }

        const path = toStoragePath(fileUrl);
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data, error } = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .createSignedUrl(path, 60 * 60);

        if (error || !data?.signedUrl) {
            console.error(
                'Get Attachment Signed URL Error:',
                error?.message ?? 'no signedUrl returned',
                '| bucket:', ATTACHMENTS_BUCKET,
                '| path:', path,
                '| original:', fileUrl,
            );
            return { success: false, signedUrl: null };
        }

        return { success: true, signedUrl: data.signedUrl };
    } catch (error) {
        console.error('Get Attachment Signed URL Error (unexpected):', error);
        return { success: false, signedUrl: null };
    }
}

// ========================================
// FETCH TICKETS SCOPED TO A FACILITY (Branch)
// ========================================

export async function getTicketsByFacility(branchId: string) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const data = await db.ticket.findMany({
            where: { branch_id: branchId, organizationId, user_id: session.id },
            orderBy: { created_at: 'desc' },
            include: {
                user: { select: { id: true, name: true, username: true } },
                branch: { select: { id: true, branch_name: true } },
                attachments: true,
            },
        });

        return { success: true, data };
    } catch (error) {
        console.error('Get Tickets By Facility Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// UPDATE TICKET STATUS
// ========================================

export async function updateTicketStatus(ticketId: string, status: TicketStatus) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const ticket = await db.ticket.update({
            where: { id: ticketId, organizationId },
            data: { status },
        });

        // Notify the ticket's creator of the status change. Isolated so a
        // notification failure does not undo the successful status update.
        try {
            await db.notification.create({
                data: {
                    user_id: ticket.user_id,
                    ticket_id: ticket.id,
                    title: 'Ticket Status Updated',
                    body: `Your ticket #${ticket.id} is now ${TICKET_STATUS_LABELS[status]}`,
                    organizationId,
                },
            });
        } catch (notifyError) {
            console.error('Ticket Status Notification Error:', notifyError);
        }

        revalidatePath('/help-center');
        revalidatePath('/admin/support');
        return { success: true, data: ticket };
    } catch (error) {
        console.error('Update Ticket Status Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// FETCH ALL TICKETS FOR ORGANIZATION
// ========================================

export async function getAllTickets() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const data = await db.ticket.findMany({
            where: { organizationId },
            orderBy: { created_at: 'desc' },
            include: {
                user: { select: { id: true, name: true, username: true } },
                branch: { select: { id: true, branch_name: true } },
                attachments: true,
            },
        });

        return { success: true, data };
    } catch (error) {
        console.error('Get All Tickets Error:', error);
        return { success: false, data: [] };
    }
}

