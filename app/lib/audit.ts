import { prisma } from '@/app/lib/db'
import { cookies } from 'next/headers'

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
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        const session = sessionCookie ? JSON.parse(sessionCookie.value) : null

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
            }
        })
    } catch (err) {
        // Audit log failure should NEVER crash the main operation
        console.error('[AUDIT LOG FAILED]', err)
    }
}
