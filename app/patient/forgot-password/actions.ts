'use server';

import { getTenantPrisma, prisma } from '@/backend/db';
import { generateOTP, hashOTP, verifyOTPHash, getOTPExpiry, MAX_OTP_PER_HOUR } from '@/app/lib/otp';
import { sendWhatsAppMessage } from '@/app/lib/whatsapp';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/;

/** Log password reset audit event (no session available, so log directly) */
async function logResetAudit(action: string, patientId: string, orgId?: string) {
    try {
        const hdrs = await headers();
        const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;
        await prisma.system_audit_logs.create({
            data: {
                user_id: patientId,
                username: patientId,
                role: 'patient',
                action,
                module: 'PatientPortal',
                entity_type: 'password_reset',
                entity_id: patientId,
                ip_address: ip,
                organizationId: orgId || null,
            },
        });
    } catch (err) {
        console.error('[RESET AUDIT FAILED]', err);
    }
}

/**
 * Step 1: Request OTP — validate patient ID + phone, then send OTP
 */
export async function requestPasswordResetOTP(patientId: string, phone: string) {
    if (!patientId || !phone) {
        return { success: false, error: 'Patient ID and phone number are required.' };
    }

    // Normalize phone: strip spaces, dashes, +91 prefix
    const normalizedPhone = phone.replace(/[\s\-]/g, '').replace(/^\+91/, '').slice(-10);

    if (!/^\d{10}$/.test(normalizedPhone)) {
        return { success: false, error: 'Please enter a valid 10-digit phone number.' };
    }

    try {
        // We need to find the patient across organizations since we don't know which org
        // In production, you'd scope this by org domain or subdomain
        // For now, search by patient_id which is globally unique (UHID format)
        const { PrismaClient } = await import('@prisma/client');
        const globalDb = new PrismaClient();

        try {
            const patient = await globalDb.oPD_REG.findUnique({
                where: { patient_id: patientId },
                select: { patient_id: true, phone: true, full_name: true, organizationId: true, password: true },
            });

            if (!patient) {
                return { success: false, error: 'No patient found with this ID.' };
            }

            if (!patient.password) {
                return { success: false, error: 'Password not set up yet. Please use the setup link sent during registration.' };
            }

            // Verify phone matches (last 10 digits)
            const patientPhone = (patient.phone || '').replace(/[\s\-]/g, '').replace(/^\+91/, '').slice(-10);
            if (patientPhone !== normalizedPhone) {
                return { success: false, error: 'Phone number does not match our records for this Patient ID.' };
            }

            const db = getTenantPrisma(patient.organizationId);

            // Rate limiting: max 3 OTPs per hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentOTPs = await db.passwordResetOTP.count({
                where: {
                    patient_id: patientId,
                    created_at: { gte: oneHourAgo },
                },
            });

            if (recentOTPs >= MAX_OTP_PER_HOUR) {
                return { success: false, error: 'Too many OTP requests. Please try again after an hour.' };
            }

            // Generate and store OTP
            const otp = generateOTP();
            const otpHash = hashOTP(otp);
            const expiresAt = getOTPExpiry();

            await db.passwordResetOTP.create({
                data: {
                    patient_id: patientId,
                    otp_hash: otpHash,
                    phone: normalizedPhone,
                    expires_at: expiresAt,
                    organizationId: patient.organizationId,
                },
            });

            // Send OTP via WhatsApp
            const message = `Your password reset OTP for Patient Portal is: ${otp}\n\nThis code expires in 5 minutes. Do not share this with anyone.`;
            await sendWhatsAppMessage({ to: `91${normalizedPhone}`, message });

            logResetAudit('PASSWORD_RESET_OTP_REQUESTED', patientId, patient.organizationId);

            return {
                success: true,
                message: 'OTP sent to your registered phone number.',
                organizationId: patient.organizationId,
            };
        } finally {
            await globalDb.$disconnect();
        }
    } catch (error) {
        console.error('Request OTP Error:', error);
        return { success: false, error: 'Failed to send OTP. Please try again.' };
    }
}

/**
 * Step 2: Verify OTP
 */
export async function verifyPasswordResetOTP(patientId: string, otp: string, organizationId: string) {
    if (!patientId || !otp || !organizationId) {
        return { success: false, error: 'Missing required fields.' };
    }

    if (!/^\d{6}$/.test(otp)) {
        return { success: false, error: 'OTP must be a 6-digit number.' };
    }

    try {
        const db = getTenantPrisma(organizationId);

        // Find the most recent unused OTP for this patient
        const otpRecord = await db.passwordResetOTP.findFirst({
            where: {
                patient_id: patientId,
                is_used: false,
                expires_at: { gte: new Date() },
            },
            orderBy: { created_at: 'desc' },
        });

        if (!otpRecord) {
            return { success: false, error: 'OTP expired or not found. Please request a new one.' };
        }

        // Limit verification attempts
        if (otpRecord.attempts >= 5) {
            // Mark as used to prevent further attempts
            await db.passwordResetOTP.update({
                where: { id: otpRecord.id },
                data: { is_used: true },
            });
            return { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' };
        }

        // Verify OTP
        if (!verifyOTPHash(otp, otpRecord.otp_hash)) {
            // Increment attempts
            await db.passwordResetOTP.update({
                where: { id: otpRecord.id },
                data: { attempts: { increment: 1 } },
            });
            return { success: false, error: `Incorrect OTP. ${4 - otpRecord.attempts} attempts remaining.` };
        }

        // Mark as verified (but not yet used — used after password is set)
        return { success: true, otpId: otpRecord.id };
    } catch (error) {
        console.error('Verify OTP Error:', error);
        return { success: false, error: 'Verification failed. Please try again.' };
    }
}

/**
 * Step 3: Reset password
 */
export async function resetPatientPassword(
    patientId: string,
    otpId: number,
    newPassword: string,
    organizationId: string
) {
    if (!patientId || !otpId || !newPassword || !organizationId) {
        return { success: false, error: 'Missing required fields.' };
    }

    if (!PASSWORD_POLICY.test(newPassword)) {
        return { success: false, error: 'Password must be 8–64 characters with uppercase, lowercase, number, and special character.' };
    }

    try {
        const db = getTenantPrisma(organizationId);

        // Verify the OTP record is valid and not yet used
        const otpRecord = await db.passwordResetOTP.findFirst({
            where: {
                id: otpId,
                patient_id: patientId,
                is_used: false,
                expires_at: { gte: new Date() },
            },
        });

        if (!otpRecord) {
            return { success: false, error: 'Reset session expired. Please start over.' };
        }

        // Hash and update password
        const passwordHash = await bcrypt.hash(newPassword, 12);

        await db.oPD_REG.update({
            where: { patient_id: patientId },
            data: { password: passwordHash },
        });

        // Mark OTP as used
        await db.passwordResetOTP.update({
            where: { id: otpId },
            data: { is_used: true },
        });

        // Invalidate all other unused OTPs for this patient
        await db.passwordResetOTP.updateMany({
            where: {
                patient_id: patientId,
                is_used: false,
            },
            data: { is_used: true },
        });

        logResetAudit('PASSWORD_RESET_COMPLETED', patientId, organizationId);

        return { success: true, message: 'Password reset successful. You can now log in with your new password.' };
    } catch (error) {
        console.error('Reset Password Error:', error);
        return { success: false, error: 'Failed to reset password. Please try again.' };
    }
}
