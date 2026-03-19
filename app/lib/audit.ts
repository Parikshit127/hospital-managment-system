import { prisma } from '@/backend/db'
import { getSession, getPatientSession } from '@/app/lib/session'
import { headers } from 'next/headers'

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

export async function logAudit({
    action,
    module,
    entity_type,
    entity_id,
    details,
}: {
    action: string
    module: string
    entity_type?: string
    entity_id?: string
    details?: string
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
                details: details ?? null,
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
