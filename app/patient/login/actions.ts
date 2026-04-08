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
import { logPatientAudit } from '@/app/lib/audit';

// --- Login rate limiting (in-memory) ---
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const failedAttempts = new Map<string, { count: number; lockedUntil: number | null }>();

function checkRateLimit(patientId: string): { blocked: boolean; remainingMs?: number } {
    const entry = failedAttempts.get(patientId);
    if (!entry) return { blocked: false };

    if (entry.lockedUntil) {
        if (Date.now() < entry.lockedUntil) {
            return { blocked: true, remainingMs: entry.lockedUntil - Date.now() };
        }
        // Lockout expired — reset
        failedAttempts.delete(patientId);
        return { blocked: false };
    }
    return { blocked: false };
}

function recordFailedAttempt(patientId: string): void {
    const entry = failedAttempts.get(patientId) || { count: 0, lockedUntil: null };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
        entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    failedAttempts.set(patientId, entry);
}

function clearFailedAttempts(patientId: string): void {
    failedAttempts.delete(patientId);
}

export async function getPatientSession(): Promise<PatientSessionData | null> {
    return getPatientSessionFromCookie();
}

export async function patientLogin(prevState: any, formData: FormData) {
    const patientId = formData.get('patientId') as string;
    const password = formData.get('password') as string;

    if (!patientId || !password) {
        return { success: false, error: 'Patient ID / Email and password are required' };
    }

    const isEmail = patientId.includes('@');
    const rateLimitKey = patientId.toLowerCase();

    // Rate limiting check
    const rateCheck = checkRateLimit(rateLimitKey);
    if (rateCheck.blocked) {
        const minutes = Math.ceil((rateCheck.remainingMs || 0) / 60000);
        logPatientAudit({
            action: 'PATIENT_LOGIN_RATE_LIMITED',
            entity_type: 'patient',
            entity_id: patientId,
            details: `Account locked for ${minutes} more minute(s)`,
        });
        return {
            success: false,
            error: `Too many failed attempts. Please try again in ${minutes} minute(s).`,
        };
    }

    try {
        const patient = await prisma.oPD_REG.findFirst({
            where: isEmail
                ? { email: { equals: patientId, mode: 'insensitive' } }
                : { patient_id: patientId },
            include: { organization: true },
        });

        if (!patient || !patient.password) {
            recordFailedAttempt(rateLimitKey);
            logPatientAudit({
                action: 'PATIENT_LOGIN_FAILED',
                entity_type: 'patient',
                entity_id: patientId,
                details: 'Invalid credentials or no password set',
            });
            return { success: false, error: 'Invalid Patient ID / Email or Password' };
        }

        const isValid = await bcrypt.compare(password, patient.password);

        if (!isValid) {
            recordFailedAttempt(rateLimitKey);
            logPatientAudit({
                action: 'PATIENT_LOGIN_FAILED',
                entity_type: 'patient',
                entity_id: patientId,
                details: 'Invalid password',
            });
            return { success: false, error: 'Invalid Patient ID / Email or Password' };
        }

        clearFailedAttempts(rateLimitKey);

        const sessionData: PatientSessionData = {
            id: patient.patient_id,
            name: patient.full_name,
            phone: patient.phone,
            role: 'patient',
            organization_id: patient.organizationId,
            organization_name: patient.organization.name,
        };

        await createPatientSession(sessionData);

        logPatientAudit({
            action: 'PATIENT_LOGIN',
            entity_type: 'patient',
            entity_id: patient.patient_id,
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
    // Log before clearing session
    logPatientAudit({ action: 'PATIENT_LOGOUT' });

    const cookieStore = await cookies();
    cookieStore.delete('patient_session');
    cookieStore.delete('patient_last_activity');
    redirect('/patient/login');
}
