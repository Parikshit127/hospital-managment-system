import crypto from 'crypto';
import { prisma } from '@/backend/db';

const PREFIX = 'enc:v1:';

const SECRET_FIELDS = [
    'razorpay_key_secret',
    'smtp_pass',
    'whatsapp_api_token',
    'whatsapp_webhook_verify_token',
    'whatsapp_app_secret',
    'openai_key',
    'sms_api_key',
    'tally_password',
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];

export const INTEGRATION_SECRET_FIELDS = new Set<string>(SECRET_FIELDS);

export type OrganizationIntegrationRuntimeConfig = Record<string, unknown> & {
    enable_razorpay?: boolean | null;
    enable_whatsapp?: boolean | null;
    enable_ai_triage?: boolean | null;
    razorpay_key_id?: string | null;
    razorpay_key_secret?: string | null;
    whatsapp_api_token?: string | null;
    openai_key?: string | null;
    sms_gateway_url?: string | null;
    sms_api_key?: string | null;
    sms_sender_id?: string | null;
    sender_phone_number?: string | null;
};

function getEncryptionKey() {
    const secret = process.env.CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('CONFIG_ENCRYPTION_KEY or JWT_SECRET is required for credential encryption');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string | null | undefined) {
    if (!value) return value ?? null;
    if (value.startsWith(PREFIX)) return value;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

export function decryptSecret(value: string | null | undefined) {
    if (!value) return value ?? null;
    if (!value.startsWith(PREFIX)) return value;

    const payload = Buffer.from(value.slice(PREFIX.length), 'base64url');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function maskSecret(value: string | null | undefined) {
    if (!value) return '';
    const plain = decryptSecret(value) || '';
    if (plain.length <= 8) return '********';
    return `${plain.slice(0, 4)}${'*'.repeat(Math.min(plain.length - 8, 16))}${plain.slice(-4)}`;
}

export async function getOrganizationIntegrationConfig(organizationId: string) {
    const config = await prisma.organizationConfig.findUnique({
        where: { organizationId },
    });

    if (!config) return null;

    const decrypted: OrganizationIntegrationRuntimeConfig = { ...config };
    for (const field of SECRET_FIELDS) {
        const value = typeof decrypted[field] === 'string' ? decrypted[field] : null;
        decrypted[field] = decryptSecret(value);
    }

    return decrypted;
}

export async function getRazorpayCredentials(organizationId: string) {
    const config = await getOrganizationIntegrationConfig(organizationId);
    const keyId = config?.enable_razorpay && config?.razorpay_key_id
        ? config.razorpay_key_id
        : process.env.RAZORPAY_KEY_ID;
    const keySecret = config?.enable_razorpay && config?.razorpay_key_secret
        ? config.razorpay_key_secret
        : process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay is not configured for this organization.');
    }

    return { keyId, keySecret };
}

export async function getWhatsAppCredentials(organizationId?: string) {
    const config = organizationId
        ? await getOrganizationIntegrationConfig(organizationId)
        : null;

    return {
        baseUrl: process.env.COMBIRDS_BASE_URL || 'https://backend.aisensy.com/campaign/t1/api',
        apiKey: config?.enable_whatsapp && config?.whatsapp_api_token
            ? config.whatsapp_api_token
            : process.env.AISENSY_API_KEY || '',
    };
}

export async function getOpenAIKey(organizationId?: string) {
    const config = organizationId
        ? await getOrganizationIntegrationConfig(organizationId)
        : null;

    return config?.enable_ai_triage && config?.openai_key
        ? config.openai_key
        : process.env.OPENAI_API_KEY || null;
}
