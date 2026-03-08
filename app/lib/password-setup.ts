import crypto from 'crypto';
import { prisma } from '@/backend/db';

const PASSWORD_SETUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function getAppBaseUrl(): string {
    return process.env.APP_BASE_URL || 'http://localhost:3000';
}

export async function createPatientPasswordSetupToken(params: {
    patientId: string;
    organizationId: string;
}) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_SETUP_TOKEN_TTL_MS);

    await prisma.$transaction(async (tx) => {
        await tx.patientPasswordSetupToken.updateMany({
            where: {
                patient_id: params.patientId,
                organizationId: params.organizationId,
                used_at: null,
            },
            data: { used_at: new Date() },
        });

        await tx.patientPasswordSetupToken.create({
            data: {
                token_hash: tokenHash,
                patient_id: params.patientId,
                organizationId: params.organizationId,
                expires_at: expiresAt,
            },
        });
    });

    const baseUrl = getAppBaseUrl();
    const setupLink = `${baseUrl}/patient/setup-password?token=${rawToken}`;

    return {
        token: rawToken,
        setupLink,
        expiresAt,
    };
}

export async function consumePatientPasswordSetupToken(rawToken: string) {
    const tokenHash = hashToken(rawToken);

    const tokenRecord = await prisma.patientPasswordSetupToken.findUnique({
        where: { token_hash: tokenHash },
    });

    if (!tokenRecord) {
        return { success: false as const, error: 'Invalid setup token' };
    }

    if (tokenRecord.used_at) {
        return { success: false as const, error: 'Setup token already used' };
    }

    if (tokenRecord.expires_at < new Date()) {
        return { success: false as const, error: 'Setup token expired' };
    }

    return { success: true as const, tokenRecord };
}

