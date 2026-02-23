'use server';

import { prisma } from '@/app/lib/db';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

const MFA_REQUIRED_ROLES = ['admin', 'doctor', 'finance'];

// Check if a role requires MFA
export async function isMfaRequiredRole(role: string): Promise<boolean> {
    return MFA_REQUIRED_ROLES.includes(role);
}

// Generate TOTP secret and QR code for setup
export async function setupMFA(userId: string) {
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return { success: false, error: 'User not found' };

        const secret = speakeasy.generateSecret({
            name: `Avani Hospital (${user.username})`,
            issuer: 'Avani Hospital OS',
        });

        // Generate backup codes
        const backupCodes = Array.from({ length: 10 }, () =>
            crypto.randomBytes(4).toString('hex').toUpperCase()
        );

        // Store secret (not yet enabled until verified)
        await prisma.user_mfa.upsert({
            where: { user_id: userId },
            update: {
                secret: secret.base32,
                backup_codes: JSON.stringify(backupCodes),
                enabled: false,
            },
            create: {
                user_id: userId,
                secret: secret.base32,
                backup_codes: JSON.stringify(backupCodes),
                enabled: false,
            },
        });

        // Generate QR code as data URL
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

        return {
            success: true,
            qrCode: qrCodeUrl,
            secret: secret.base32,
            backupCodes,
        };
    } catch (error: any) {
        console.error('setupMFA error:', error);
        return { success: false, error: error.message };
    }
}

// Verify first TOTP code during setup and enable MFA
export async function enableMFA(userId: string, token: string) {
    try {
        const mfaRecord = await prisma.user_mfa.findUnique({ where: { user_id: userId } });
        if (!mfaRecord) return { success: false, error: 'MFA not set up' };

        const verified = speakeasy.totp.verify({
            secret: mfaRecord.secret,
            encoding: 'base32',
            token,
            window: 1,
        });

        if (!verified) return { success: false, error: 'Invalid code. Try again.' };

        await prisma.user_mfa.update({
            where: { user_id: userId },
            data: { enabled: true },
        });

        await prisma.system_audit_logs.create({
            data: {
                action: 'MFA_ENABLED',
                module: 'auth',
                entity_type: 'user',
                entity_id: userId,
            },
        });

        return { success: true };
    } catch (error: any) {
        console.error('enableMFA error:', error);
        return { success: false, error: error.message };
    }
}

// Verify TOTP code during login
export async function verifyMFA(userId: string, token: string) {
    try {
        const mfaRecord = await prisma.user_mfa.findUnique({ where: { user_id: userId } });
        if (!mfaRecord || !mfaRecord.enabled) {
            return { success: true }; // MFA not enabled, pass through
        }

        // Check TOTP code
        const verified = speakeasy.totp.verify({
            secret: mfaRecord.secret,
            encoding: 'base32',
            token,
            window: 1,
        });

        if (verified) return { success: true };

        // Check backup codes
        const backupCodes: string[] = JSON.parse(mfaRecord.backup_codes || '[]');
        const idx = backupCodes.indexOf(token.toUpperCase());
        if (idx >= 0) {
            backupCodes.splice(idx, 1);
            await prisma.user_mfa.update({
                where: { user_id: userId },
                data: { backup_codes: JSON.stringify(backupCodes) },
            });

            await prisma.system_audit_logs.create({
                data: {
                    action: 'MFA_BACKUP_CODE_USED',
                    module: 'auth',
                    entity_type: 'user',
                    entity_id: userId,
                    details: JSON.stringify({ remaining: backupCodes.length }),
                },
            });

            return { success: true };
        }

        return { success: false, error: 'Invalid verification code' };
    } catch (error: any) {
        console.error('verifyMFA error:', error);
        return { success: false, error: error.message };
    }
}

// Check if user has MFA enabled
export async function getMFAStatus(userId: string) {
    try {
        const mfaRecord = await prisma.user_mfa.findUnique({ where: { user_id: userId } });
        return {
            success: true,
            enabled: mfaRecord?.enabled || false,
            hasSetup: !!mfaRecord,
        };
    } catch (error: any) {
        console.error('getMFAStatus error:', error);
        return { success: false, enabled: false, hasSetup: false };
    }
}

// Disable MFA for a user (admin action)
export async function disableMFA(userId: string) {
    try {
        await prisma.user_mfa.deleteMany({ where: { user_id: userId } });

        await prisma.system_audit_logs.create({
            data: {
                action: 'MFA_DISABLED',
                module: 'auth',
                entity_type: 'user',
                entity_id: userId,
            },
        });

        return { success: true };
    } catch (error: any) {
        console.error('disableMFA error:', error);
        return { success: false, error: error.message };
    }
}
