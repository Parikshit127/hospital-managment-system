'use server';

import nodemailer from 'nodemailer';
import { requireRoleAndTenant } from '@/backend/tenant';
import {
    INTEGRATION_SECRET_FIELDS,
    encryptSecret,
    maskSecret,
    decryptSecret,
} from '@/app/lib/secure-config';

const ADMIN_ROLES = ['admin', 'superadmin'];
type IntegrationConfig = Record<string, string | boolean | Date | null | undefined>;
type IntegrationUpdate = Record<string, string | boolean | null | undefined>;

const ALLOWED_FIELDS = new Set([
    'enable_whatsapp',
    'enable_razorpay',
    'enable_ai_triage',
    'razorpay_key_id',
    'razorpay_key_secret',
    'smtp_host',
    'smtp_user',
    'smtp_pass',
    'whatsapp_api_token',
    'whatsapp_phone_id',
    'whatsapp_webhook_verify_token',
    'whatsapp_app_secret',
    'openai_key',
]);

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unexpected integration error';
}

function asString(value: IntegrationConfig[string]) {
    return typeof value === 'string' ? value : '';
}

function redactConfig(config: IntegrationConfig) {
    const redacted = { ...config };
    for (const field of INTEGRATION_SECRET_FIELDS) {
        redacted[field] = redacted[field] ? maskSecret(asString(redacted[field])) : '';
        redacted[`${field}_configured`] = Boolean(config[field]);
    }
    return redacted;
}

function sanitizeUpdate(data: IntegrationUpdate) {
    const update: IntegrationUpdate = {};

    for (const [key, rawValue] of Object.entries(data)) {
        if (!ALLOWED_FIELDS.has(key)) continue;

        if (typeof rawValue === 'boolean') {
            update[key] = rawValue;
            continue;
        }

        const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
        if (INTEGRATION_SECRET_FIELDS.has(key)) {
            if (!value || /^\*+$/.test(value) || /^.{0,4}\*+.{0,4}$/.test(value)) {
                continue;
            }
            update[key] = encryptSecret(value);
        } else {
            update[key] = value || null;
        }
    }

    return update;
}

export async function getAdminIntegrationSettings() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(ADMIN_ROLES);
        const config = await db.organizationConfig.upsert({
            where: { organizationId },
            update: {},
            create: { organizationId },
        });

        return {
            success: true,
            data: {
                ...redactConfig(config),
                production: getProductionReadinessSnapshot(),
            },
        };
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error) };
    }
}

export async function updateAdminIntegrationSettings(data: IntegrationUpdate) {
    try {
        const { db, organizationId, session } = await requireRoleAndTenant(ADMIN_ROLES);
        const update = sanitizeUpdate(data);

        if (Object.keys(update).length === 0) {
            return { success: true, data: null };
        }

        const config = await db.organizationConfig.upsert({
            where: { organizationId },
            update,
            create: { organizationId, ...update },
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'UPDATE_INTEGRATION_SETTINGS',
                module: 'admin',
                entity_type: 'organization_config',
                entity_id: organizationId,
                details: JSON.stringify({ fields: Object.keys(update) }),
                organizationId,
            },
        });

        return { success: true, data: redactConfig(config) };
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error) };
    }
}

export async function testAdminIntegrationConnection(integrationKey: string) {
    try {
        const { db, organizationId, session } = await requireRoleAndTenant(ADMIN_ROLES);
        const config = await db.organizationConfig.findUnique({ where: { organizationId } });
        if (!config) return { success: false, error: 'Integration configuration was not found.' };

        const plain: IntegrationConfig = { ...config };
        for (const field of INTEGRATION_SECRET_FIELDS) {
            plain[field] = decryptSecret(asString(plain[field]));
        }

        const result = await runIntegrationTest(integrationKey, plain);

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'TEST_INTEGRATION_CONNECTION',
                module: 'admin',
                entity_type: 'integration',
                entity_id: integrationKey,
                details: JSON.stringify({ ok: result.success, message: result.message || result.error }),
                organizationId,
            },
        });

        return result;
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error) };
    }
}

async function runIntegrationTest(integrationKey: string, config: IntegrationConfig) {
    if (integrationKey === 'smtp') {
        const host = asString(config.smtp_host);
        const user = asString(config.smtp_user);
        const pass = asString(config.smtp_pass);
        if (!host || !user || !pass) {
            return { success: false, error: 'SMTP host, username, and password are required.' };
        }
        const transporter = nodemailer.createTransport({
            host,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user, pass },
        });
        await transporter.verify();
        return { success: true, message: 'SMTP login verified.' };
    }

    if (integrationKey === 'razorpay') {
        const keyId = asString(config.razorpay_key_id);
        const keySecret = asString(config.razorpay_key_secret);
        if (!keyId || !keySecret) {
            return { success: false, error: 'Razorpay key ID and secret are required.' };
        }
        const res = await fetch('https://api.razorpay.com/v1/orders?count=1', {
            headers: {
                Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            },
            cache: 'no-store',
        });
        if (!res.ok) return { success: false, error: `Razorpay rejected the credentials (${res.status}).` };
        return { success: true, message: 'Razorpay credentials accepted.' };
    }

    if (integrationKey === 'openai') {
        const openaiKey = asString(config.openai_key);
        if (!openaiKey) return { success: false, error: 'OpenAI API key is required.' };
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${openaiKey}` },
            cache: 'no-store',
        });
        if (!res.ok) return { success: false, error: `OpenAI rejected the key (${res.status}).` };
        return { success: true, message: 'OpenAI API key accepted.' };
    }

    if (integrationKey === 'whatsapp') {
        if (!asString(config.whatsapp_phone_id) || !asString(config.whatsapp_api_token)) {
            return { success: false, error: 'WhatsApp phone ID and API token are required.' };
        }
        return { success: true, message: 'WhatsApp credentials are stored. Send a live message to fully verify templates.' };
    }

    if (integrationKey === 'supabase') {
        const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter((key) => !process.env[key]);
        if (missing.length) return { success: false, error: `Missing ${missing.join(', ')}.` };
        return { success: true, message: 'Supabase public configuration is present.' };
    }

    return { success: false, error: 'Unknown integration.' };
}

function getProductionReadinessSnapshot() {
    const required = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'APP_BASE_URL'];
    const recommended = ['CRON_SECRET', 'CONFIG_ENCRYPTION_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    const missingRequired = required.filter((key) => !process.env[key]);
    const missingRecommended = recommended.filter((key) => !process.env[key]);

    return {
        databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
        directUrlConfigured: Boolean(process.env.DIRECT_URL),
        requiredOk: missingRequired.length === 0,
        missingRequired,
        missingRecommended,
        nodeEnv: process.env.NODE_ENV || 'development',
    };
}
