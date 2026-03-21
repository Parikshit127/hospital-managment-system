import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import bcrypt from 'bcryptjs';

export interface ZealthixAuthResult {
    organizationId: string;
    apiKeyId: string;
}

/**
 * Validates X-Api-Key header against stored hashed API keys.
 * Returns the organizationId associated with the matched key, or an error response.
 */
export async function validateZealthixApiKey(
    request: NextRequest
): Promise<ZealthixAuthResult | NextResponse> {
    const apiKey = request.headers.get('X-Api-Key');

    if (!apiKey) {
        return NextResponse.json(
            { success: false, message: 'Missing X-Api-Key header' },
            { status: 401 }
        );
    }

    try {
        // Fetch all active API keys (typically very few per org)
        const activeKeys = await prisma.zealthixApiKey.findMany({
            where: { is_active: true },
            select: {
                id: true,
                api_key_hash: true,
                organizationId: true,
            },
        });

        if (activeKeys.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Invalid API key' },
                { status: 401 }
            );
        }

        // Compare against each active key
        for (const key of activeKeys) {
            const isMatch = await bcrypt.compare(apiKey, key.api_key_hash);
            if (isMatch) {
                // Update last_used_at (non-blocking)
                prisma.zealthixApiKey
                    .update({
                        where: { id: key.id },
                        data: { last_used_at: new Date() },
                    })
                    .catch(() => {});

                return {
                    organizationId: key.organizationId,
                    apiKeyId: key.id,
                };
            }
        }

        return NextResponse.json(
            { success: false, message: 'Invalid API key' },
            { status: 401 }
        );
    } catch (error) {
        console.error('Zealthix API key validation error:', error);
        return NextResponse.json(
            { success: false, message: 'Authentication failed' },
            { status: 500 }
        );
    }
}

/**
 * Log Zealthix API call to audit trail
 */
export async function logZealthixApiCall(
    organizationId: string,
    apiKeyId: string,
    endpoint: string,
    requestBody: Record<string, unknown>,
    responseStatus: number
) {
    try {
        await prisma.system_audit_logs.create({
            data: {
                action: 'ZEALTHIX_API_CALL',
                module: 'zealthix',
                entity_type: 'api_call',
                entity_id: endpoint,
                details: JSON.stringify({
                    apiKeyId,
                    endpoint,
                    request: requestBody,
                    responseStatus,
                }),
                organizationId,
            },
        });
    } catch {
        // Non-blocking audit log
    }
}
