'use server';

import { requireTenantContext } from '@/backend/tenant';
import { prisma } from '@/backend/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function serialize<T>(data: T): T {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
                ? Number(value)
                : value
        )
    );
}

// ============================================
// API KEY MANAGEMENT
// ============================================

/**
 * Generate a new Zealthix API key.
 * Returns the plain key ONCE - it is never stored.
 */
export async function createZealthixApiKey(label: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Generate a random API key
        const rawKey = crypto.randomBytes(32).toString('hex');
        const apiKey = `zx_${rawKey}`;
        const hash = await bcrypt.hash(apiKey, 10);

        const record = await db.zealthixApiKey.create({
            data: {
                api_key_hash: hash,
                label: label || 'Zealthix Integration Key',
                is_active: true,
                organizationId,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CREATE_ZEALTHIX_API_KEY',
                module: 'zealthix',
                entity_type: 'api_key',
                entity_id: record.id,
                details: JSON.stringify({ label }),
                organizationId,
            },
        });

        // Return the plain key only this one time
        return {
            success: true,
            data: {
                id: record.id,
                apiKey, // Plain key - shown once
                label: record.label,
                created_at: record.created_at,
            },
        };
    } catch (error: unknown) {
        console.error('createZealthixApiKey error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * List all API keys (masked, never shows the actual key)
 */
export async function listZealthixApiKeys() {
    try {
        const { db } = await requireTenantContext();

        const keys = await db.zealthixApiKey.findMany({
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                label: true,
                is_active: true,
                last_used_at: true,
                created_at: true,
            },
        });

        return {
            success: true,
            data: serialize(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                keys.map((k: any) => ({
                    ...k,
                    masked_key: 'zx_' + '*'.repeat(60),
                }))
            ),
        };
    } catch (error: unknown) {
        console.error('listZealthixApiKeys error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Revoke (deactivate) an API key
 */
export async function revokeZealthixApiKey(id: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        await db.zealthixApiKey.update({
            where: { id },
            data: { is_active: false },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'REVOKE_ZEALTHIX_API_KEY',
                module: 'zealthix',
                entity_type: 'api_key',
                entity_id: id,
                organizationId,
            },
        });

        return { success: true };
    } catch (error: unknown) {
        console.error('revokeZealthixApiKey error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get Zealthix integration audit logs
 */
export async function getZealthixLogs(limit: number = 50) {
    try {
        const { db } = await requireTenantContext();

        const logs = await db.system_audit_logs.findMany({
            where: { module: 'zealthix' },
            orderBy: { created_at: 'desc' },
            take: limit,
        });

        return { success: true, data: serialize(logs) };
    } catch (error: unknown) {
        console.error('getZealthixLogs error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get integration stats
 */
export async function getZealthixStats() {
    try {
        const { db } = await requireTenantContext();

        const [activeKeys, totalApiCalls, recentClaims] = await Promise.all([
            db.zealthixApiKey.count({ where: { is_active: true } }),
            prisma.system_audit_logs.count({
                where: { module: 'zealthix', action: 'ZEALTHIX_API_CALL' },
            }),
            db.insurance_claims.count({
                where: { zealthix_claim_number: { not: null } },
            }),
        ]);

        return {
            success: true,
            data: { activeKeys, totalApiCalls, recentClaims },
        };
    } catch (error: unknown) {
        console.error('getZealthixStats error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
