import { prisma } from '@/backend/db'
import { getSession } from '@/app/lib/session'

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
                organizationId: session?.organization_id ?? null,
            }
        })
    } catch (err) {
        // Audit log failure should NEVER crash the main operation
        console.error('[AUDIT LOG FAILED]', err)
    }
}
