'use server';

import { requireTenantContext } from '@/backend/tenant';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

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

