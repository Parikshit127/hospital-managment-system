'use server';

import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export interface PatientSessionData {
    id: string;
    name: string;
    phone: string | null;
    role: 'patient';
    organization_id: string;
    organization_name: string;
}

export async function getPatientSession(): Promise<PatientSessionData | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('patient_session')?.value;
        if (!token) return null;

        // Support legacy JSON cookies during migration
        if (token.startsWith('{')) {
            const data = JSON.parse(token);
            return {
                id: data.id,
                name: data.name,
                phone: null,
                role: 'patient',
                organization_id: data.organization_id || 'org-avani-default',
                organization_name: data.organization_name || 'Hospital',
            };
        }

        const { payload } = await jwtVerify(token, JWT_SECRET);
        return {
            id: (payload.id as string) || '',
            name: (payload.name as string) || '',
            phone: (payload.phone as string) || null,
            role: 'patient',
            organization_id: (payload.organization_id as string) || '',
            organization_name: (payload.organization_name as string) || '',
        };
    } catch {
        return null;
    }
}

export async function patientLogin(prevState: any, formData: FormData) {
    const patientId = formData.get('patientId') as string;
    const password = formData.get('password') as string;

    if (!patientId || !password) {
        return { success: false, error: 'Patient ID and password are required' };
    }

    try {
        const patient = await prisma.oPD_REG.findUnique({
            where: { patient_id: patientId },
            include: { organization: true },
        });

        if (!patient || !patient.password) {
            return { success: false, error: 'Invalid Patient ID or Password' };
        }

        const isValid = await bcrypt.compare(password, patient.password);

        if (!isValid) {
            return { success: false, error: 'Invalid Patient ID or Password' };
        }

        // Create JWT patient session
        const sessionData: PatientSessionData = {
            id: patient.patient_id,
            name: patient.full_name,
            phone: patient.phone,
            role: 'patient',
            organization_id: patient.organizationId,
            organization_name: patient.organization.name,
        };

        const token = await new SignJWT(sessionData as unknown as Record<string, unknown>)
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('7d')
            .setIssuedAt()
            .sign(JWT_SECRET);

        const cookieStore = await cookies();
        cookieStore.set('patient_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error;
        }
        console.error('Patient Login error:', error);
        return { success: false, error: 'Internal server error' };
    }

    redirect('/patient/dashboard');
}

export async function patientLogout() {
    const cookieStore = await cookies();
    cookieStore.delete('patient_session');
    redirect('/patient/login');
}
