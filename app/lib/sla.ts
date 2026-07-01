import { TicketPriority, TicketStatus } from '@prisma/client';

/**
 * SLA breach detection for support tickets.
 *
 * NOTE ON THE DATA MODEL: the Ticket model currently has no `first_responded_at`
 * or `resolved_at` columns — only `created_at`, `updated_at`, `priority`, and
 * `status`. We therefore derive SLA state from `status`:
 *   - A ticket still in `Open` has not received a first response yet.
 *   - A ticket not in `Resolved` is still unresolved.
 * This is sufficient to flag CURRENTLY breaching open/unresolved tickets against
 * the clock. If exact response/resolution times are needed later (e.g. to catch
 * a ticket that was responded to LATE), add nullable `first_responded_at` /
 * `resolved_at` columns and compare those instead of "now".
 */

// A target is either an absolute duration, a number of business days, or none.
export type SlaTarget =
    | { kind: 'duration'; ms: number }
    | { kind: 'businessDays'; days: number }
    | { kind: 'bestEffort' };

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;

export const SLA_POLICY: Record<TicketPriority, { response: SlaTarget; resolution: SlaTarget }> = {
    [TicketPriority.Critical]: {
        response: { kind: 'duration', ms: 30 * MINUTES },
        resolution: { kind: 'duration', ms: 4 * HOURS },
    },
    [TicketPriority.High]: {
        response: { kind: 'duration', ms: 2 * HOURS },
        resolution: { kind: 'businessDays', days: 1 },
    },
    [TicketPriority.Medium]: {
        response: { kind: 'businessDays', days: 1 },
        resolution: { kind: 'businessDays', days: 3 },
    },
    [TicketPriority.Low]: {
        response: { kind: 'businessDays', days: 2 },
        resolution: { kind: 'bestEffort' },
    },
};

/** Add N business days (skipping Sat/Sun) to a date, preserving time-of-day. */
export function addBusinessDays(from: Date, days: number): Date {
    const result = new Date(from.getTime());
    let remaining = days;
    while (remaining > 0) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay(); // 0 = Sun, 6 = Sat
        if (day !== 0 && day !== 6) remaining -= 1;
    }
    return result;
}

/** Resolve a target into an absolute deadline, or null for best-effort. */
export function deadlineFor(createdAt: Date, target: SlaTarget): Date | null {
    switch (target.kind) {
        case 'duration':
            return new Date(createdAt.getTime() + target.ms);
        case 'businessDays':
            return addBusinessDays(createdAt, target.days);
        case 'bestEffort':
            return null;
    }
}

export interface SlaTicketInput {
    priority: TicketPriority;
    status: TicketStatus;
    created_at: Date;
}

export interface SlaEvaluation {
    responseDeadline: Date | null;
    resolutionDeadline: Date | null;
    responseBreached: boolean;
    resolutionBreached: boolean;
    breached: boolean;
    responseOverdueMinutes: number;
    resolutionOverdueMinutes: number;
}

const overdueMinutes = (deadline: Date | null, now: Date): number =>
    deadline && now > deadline ? Math.floor((now.getTime() - deadline.getTime()) / MINUTES) : 0;

/** Evaluate a single ticket against its SLA policy at time `now`. */
export function evaluateTicketSla(ticket: SlaTicketInput, now: Date): SlaEvaluation {
    const policy = SLA_POLICY[ticket.priority];
    const responseDeadline = deadlineFor(ticket.created_at, policy.response);
    const resolutionDeadline = deadlineFor(ticket.created_at, policy.resolution);

    // Derived from status (see file header note).
    const awaitingFirstResponse = ticket.status === TicketStatus.Open;
    const isResolved = ticket.status === TicketStatus.Resolved;

    const responseBreached = awaitingFirstResponse && !!responseDeadline && now > responseDeadline;
    const resolutionBreached = !isResolved && !!resolutionDeadline && now > resolutionDeadline;

    return {
        responseDeadline,
        resolutionDeadline,
        responseBreached,
        resolutionBreached,
        breached: responseBreached || resolutionBreached,
        responseOverdueMinutes: responseBreached ? overdueMinutes(responseDeadline, now) : 0,
        resolutionOverdueMinutes: resolutionBreached ? overdueMinutes(resolutionDeadline, now) : 0,
    };
}
