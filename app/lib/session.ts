import { cookies } from 'next/headers'

export interface SessionData {
    id: string
    username: string
    role: string
    name: string
    specialty: string | null
    hospital_id: string | null
}

const DEFAULT_HOSPITAL_ID = 'avani-default'

export async function getSession(): Promise<SessionData | null> {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')
        if (!sessionCookie) return null

        const session = JSON.parse(sessionCookie.value)
        return {
            id: session.id || '',
            username: session.username || '',
            role: session.role || '',
            name: session.name || '',
            specialty: session.specialty || null,
            hospital_id: session.hospital_id || DEFAULT_HOSPITAL_ID,
        }
    } catch {
        return null
    }
}

export function getDefaultHospitalId(): string {
    return DEFAULT_HOSPITAL_ID
}
