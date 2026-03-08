'use server';

import * as bcrypt from 'bcryptjs';
import { prisma } from '@/backend/db';
import { consumePatientPasswordSetupToken } from '@/app/lib/password-setup';

type SetupState = {
    success: boolean;
    error?: string;
};

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/;

export async function setPatientPortalPassword(_prevState: SetupState, formData: FormData): Promise<SetupState> {
    const token = String(formData.get('token') || '').trim();
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (!token) {
        return { success: false, error: 'Missing password setup token' };
    }

    if (!PASSWORD_POLICY.test(password)) {
        return {
            success: false,
            error: 'Password must be 8+ chars with uppercase, lowercase, number, and special character',
        };
    }

    if (password !== confirmPassword) {
        return { success: false, error: 'Passwords do not match' };
    }

    const tokenResult = await consumePatientPasswordSetupToken(token);
    if (!tokenResult.success) {
        return { success: false, error: tokenResult.error };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
        await tx.oPD_REG.updateMany({
            where: {
                patient_id: tokenResult.tokenRecord.patient_id,
                organizationId: tokenResult.tokenRecord.organizationId,
            },
            data: {
                password: passwordHash,
            },
        });

        await tx.patientPasswordSetupToken.update({
            where: { token_hash: tokenResult.tokenRecord.token_hash },
            data: { used_at: new Date() },
        });

        await tx.system_audit_logs.create({
            data: {
                user_id: tokenResult.tokenRecord.patient_id,
                username: tokenResult.tokenRecord.patient_id,
                role: 'patient',
                action: 'PATIENT_PASSWORD_SET',
                module: 'auth',
                entity_type: 'patient',
                entity_id: tokenResult.tokenRecord.patient_id,
                organizationId: tokenResult.tokenRecord.organizationId,
            },
        });
    });

    return { success: true };
}

