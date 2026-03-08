'use server';

import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
    createPatientSession,
    getPatientSession as getPatientSessionFromCookie,
    type PatientSessionData,
} from '@/app/lib/session';

export async function getPatientSession(): Promise<PatientSessionData | null> {
    return getPatientSessionFromCookie();
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

        await createPatientSession(sessionData);
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
