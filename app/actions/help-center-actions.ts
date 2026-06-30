'use server';

import { requireTenantContext } from '@/backend/tenant';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

// ========================================
// CREATE TICKET
// ========================================

interface CreateTicketInput {
    title: string;
    description: string;
    priority: TicketPriority;
    branchId: string;
}

export async function createTicket(input: CreateTicketInput) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const ticket = await db.ticket.create({
            data: {
                title: input.title,
                description: input.description,
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
// FETCH TICKETS SCOPED TO A FACILITY (Branch)
// ========================================

export async function getTicketsByFacility(branchId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const data = await db.ticket.findMany({
            where: { branch_id: branchId, organizationId },
            orderBy: { created_at: 'desc' },
            include: {
                user: { select: { id: true, name: true, username: true } },
                branch: { select: { id: true, branch_name: true } },
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

        revalidatePath('/help-center');
        return { success: true, data: ticket };
    } catch (error) {
        console.error('Update Ticket Status Error:', error);
        return { success: false, data: null };
    }
}
