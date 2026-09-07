import { prisma } from '@/backend/db'
import { getSession, getPatientSession } from '@/app/lib/session'
import { headers } from 'next/headers'
import { diffObjects } from '@/app/lib/audit-diff'

/**
 * Builds the `details` column value for logAudit()/logCriticalAction().
 *
 * When `before`/`after` are supplied, the diff is computed and stored as
 * `{ summary?, changes? }` JSON — the contract the audit UI renders against.
 * `changes` is omitted entirely when there is nothing to diff (no before/after
 * given, or before/after are identical), in which case behavior falls back to
 * the plain `details` string exactly as before — existing callers that only
 * pass `details` are unaffected.
 */
function buildAuditDetails({
    details,
    before,
    after,
    summary,
}: {
    details?: string
    before?: Record<string, any>
    after?: Record<string, any>
    summary?: string
}): string | null {
    const hasBeforeAfter = before !== undefined || after !== undefined
    if (!hasBeforeAfter && summary === undefined) {
        return details ?? null
    }

    const changes = hasBeforeAfter ? diffObjects(before, after) : []
    const payload: { summary?: string; changes?: { field: string; from: any; to: any }[] } = {}
    if (summary !== undefined) payload.summary = summary
    if (changes.length > 0) payload.changes = changes

    // Nothing structured ended up in the payload (e.g. before === after) —
    // fall back to the plain details string for backward compatibility.
    if (payload.summary === undefined && payload.changes === undefined) {
        return details ?? null
    }

    return JSON.stringify(payload)
}

async function getClientIP(): Promise<string | null> {
    try {
        const hdrs = await headers()
        return hdrs.get('x-forwarded-for')?.split(',')[0]?.trim()
            || hdrs.get('x-real-ip')
            || null
    } catch {
        return null
    }
}

/**
 * Audit logger for authentication events (login, logout, MFA, failed attempts).
 * Separate from logAudit so auth events are always captured even before a full session exists.
 */
export async function logAuthEvent({
    action,
    userId,
    username,
    role,
    organizationId,
    details,
    success: eventSuccess = true,
}: {
    action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'MFA_SUCCESS' | 'MFA_FAILED' | 'SESSION_TIMEOUT' | 'PASSWORD_RESET'
    userId?: string
    username?: string
    role?: string
    organizationId?: string
    details?: string
    success?: boolean
}) {
    try {
        const ip = await getClientIP()
        await prisma.system_audit_logs.create({
            data: {
                user_id: userId ?? 'anonymous',
                username: username ?? 'unknown',
                role: role ?? 'unknown',
                action,
                module: 'Auth',
                entity_type: 'session',
                entity_id: null,
                details: details ?? null,
                ip_address: ip,
                organizationId: organizationId ?? null,
            }
        })
    } catch (err) {
        console.error('[AUTH AUDIT LOG FAILED]', err)
    }
}

/**
 * Audit logger for critical/sensitive actions that require immediate attention.
 * Logs the action and optionally triggers an alert.
 */
export async function logCriticalAction({
    action,
    module,
    entity_type,
    entity_id,
    details,
    before,
    after,
    summary,
}: {
    action: string
    module: string
    entity_type?: string
    entity_id?: string
    details?: string
    /** Record state before the mutation, for field-level "what changed" diffing. */
    before?: Record<string, any>
    /** Record state after the mutation, for field-level "what changed" diffing. */
    after?: Record<string, any>
    /** Optional short human-readable summary stored alongside the diff. */
    summary?: string
}) {
    try {
        const session = await getSession()
        const ip = await getClientIP()

        await prisma.system_audit_logs.create({
            data: {
                user_id: session?.id ? String(session.id) : 'system',
                username: session?.username ?? 'unknown',
                role: session?.role ?? 'unknown',
                action: `CRITICAL:${action}`,
                module,
                entity_type: entity_type ?? null,
                entity_id: entity_id ?? null,
                details: buildAuditDetails({ details, before, after, summary }),
                ip_address: ip,
                organizationId: session?.organization_id ?? null,
            }
        })
    } catch (err) {
        console.error('[CRITICAL AUDIT LOG FAILED]', err)
    }
}

export async function logAudit({
    action,
    module,
    entity_type,
    entity_id,
    details,
    before,
    after,
    summary,
}: {
    action: string
    module: string
    entity_type?: string
    entity_id?: string
    details?: string
    /** Record state before the mutation, for field-level "what changed" diffing. */
    before?: Record<string, any>
    /** Record state after the mutation, for field-level "what changed" diffing. */
    after?: Record<string, any>
    /** Optional short human-readable summary stored alongside the diff. */
    summary?: string
}) {
    try {
        const session = await getSession()
        const ip = await getClientIP()

        await prisma.system_audit_logs.create({
            data: {
                user_id: session?.id ? String(session.id) : 'system',
                username: session?.username ?? 'unknown',
                role: session?.role ?? 'unknown',
                action,
                module,
                entity_type: entity_type ?? null,
                entity_id: entity_id ?? null,
                details: buildAuditDetails({ details, before, after, summary }),
                ip_address: ip,
                organizationId: session?.organization_id ?? null,
            }
        })
    } catch (err) {
        // Audit log failure should NEVER crash the main operation
        console.error('[AUDIT LOG FAILED]', err)
    }
}

/**
 * Audit logger for patient portal actions.
 * Uses patient session instead of staff session.
 * Never throws — audit failure must not break the main operation.
 */
export async function logPatientAudit({
    action,
    entity_type,
    entity_id,
    details,
}: {
    action: string
    entity_type?: string
    entity_id?: string
    details?: string
}) {
    try {
        const session = await getPatientSession()
        const ip = await getClientIP()

        await prisma.system_audit_logs.create({
            data: {
                user_id: session?.id ?? 'unknown-patient',
                username: session?.name ?? 'unknown',
                role: 'patient',
                action,
                module: 'PatientPortal',
                entity_type: entity_type ?? null,
                entity_id: entity_id ?? null,
                details: details ?? null,
                ip_address: ip,
                organizationId: session?.organization_id ?? null,
            }
        })
    } catch (err) {
        console.error('[PATIENT AUDIT LOG FAILED]', err)
    }
}
