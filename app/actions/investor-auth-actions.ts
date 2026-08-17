'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/backend/db';
import crypto from 'crypto';

const INVESTOR_COOKIE_NAME = 'investor_session';

export async function investorLogin(prevState: any, formData: FormData) {
    const username = (formData.get('username') as string || '').trim();
    const password = (formData.get('password') as string || '').trim();

    if (!username || !password) {
        return { success: false, error: 'Please enter both username and password' };
    }

    let isValid = false;
    let displayName = 'Promoter / Investor';

    // 1. Try DB lookup first if available
    try {
        const dbCred = await prisma.investorCredential.findFirst({
            where: {
                username: {
                    equals: username,
                    mode: 'insensitive',
                },
            },
        });

        if (dbCred) {
            if (dbCred.password === password) {
                if (dbCred.is_temporary && dbCred.expires_at) {
                    if (new Date(dbCred.expires_at) < new Date()) {
                        return {
                            success: false,
                            error: 'Temporary investor credentials have expired (valid for 24 hours). Please request new credentials.',
                        };
                    }
                    displayName = `Temporary Investor (${username})`;
                }
                isValid = true;
            }
        }
    } catch (dbErr) {
        console.warn('Investor DB check failed, using fallback static check:', dbErr);
    }

    // 2. Fallback static check if not matched via DB
    if (!isValid) {
        const envUsername = process.env.INVESTOR_USERNAME || 'investor';
        const envPassword = process.env.INVESTOR_PASSWORD || 'inv@4321';

        const isEnvMatch =
            username.toLowerCase() === envUsername.toLowerCase() && password === envPassword;

        const isDefaultMatch =
            username.toLowerCase() === 'investor' && password === 'inv@4321';

        // Legacy fallback
        const isLegacyMatch =
            username.toLowerCase() === 'inv@123' && password === 'inv123';

        if (isEnvMatch || isDefaultMatch || isLegacyMatch) {
            isValid = true;
        }
    }

    if (!isValid) {
        return { success: false, error: 'Invalid investor credentials' };
    }

    const cookieStore = await cookies();
    cookieStore.set(
        INVESTOR_COOKIE_NAME,
        JSON.stringify({
            user: username,
            role: 'investor',
            name: displayName,
            loggedInAt: new Date().toISOString(),
        }),
        {
            httpOnly: true,
            path: '/',
            maxAge: 60 * 60 * 24, // 24 hours
            sameSite: 'lax',
        }
    );

    return { success: true };
}

export async function getInvestorSession() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(INVESTOR_COOKIE_NAME);
    if (!sessionCookie?.value) return null;
    try {
        return JSON.parse(sessionCookie.value);
    } catch {
        return null;
    }
}

export async function investorLogout() {
    const cookieStore = await cookies();
    cookieStore.delete(INVESTOR_COOKIE_NAME);
    redirect('/login/investor');
}

/**
 * Creates a 24-Hour Temporary Investor Credential in the DB.
 */
export async function createTemporaryInvestorCredential(
    customUsername?: string,
    customPassword?: string,
    createdBy: string = 'admin'
) {
    try {
        const randomSuffix = crypto.randomBytes(3).toString('hex');
        const username =
            customUsername?.trim() || `investor_temp_${randomSuffix}`;
        const password =
            customPassword?.trim() || `inv@${crypto.randomInt(1000, 9999)}`;

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        const created = await prisma.investorCredential.create({
            data: {
                username,
                password,
                is_temporary: true,
                expires_at: expiresAt,
                created_by: createdBy,
            },
        });

        return {
            success: true,
            credential: {
                id: created.id,
                username: created.username,
                password: created.password,
                is_temporary: created.is_temporary,
                expires_at: created.expires_at?.toISOString(),
                created_at: created.created_at.toISOString(),
            },
        };
    } catch (error: any) {
        console.error('Failed to create temporary investor credential:', error);
        return {
            success: false,
            error: error.message || 'Failed to create temporary credential',
        };
    }
}

/**
 * Creates or resets the permanent investor credential (`investor` / `inv@4321`) in DB.
 */
export async function setupPermanentInvestorCredential() {
    try {
        const username = 'investor';
        const password = 'inv@4321';

        const existing = await prisma.investorCredential.findFirst({
            where: { username: { equals: username, mode: 'insensitive' } },
        });

        if (existing) {
            await prisma.investorCredential.update({
                where: { id: existing.id },
                data: {
                    password,
                    is_temporary: false,
                    expires_at: null,
                },
            });
        } else {
            await prisma.investorCredential.create({
                data: {
                    username,
                    password,
                    is_temporary: false,
                    created_by: 'system',
                },
            });
        }

        return { success: true, username, password };
    } catch (error: any) {
        console.error('Failed to setup permanent investor credential:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lists all active investor credentials from the DB.
 */
export async function getInvestorCredentialsList() {
    try {
        const credentials = await prisma.investorCredential.findMany({
            orderBy: { created_at: 'desc' },
        });

        const formatted = credentials.map((c: any) => {
            const isExpired = c.is_temporary && c.expires_at ? new Date(c.expires_at) < new Date() : false;
            return {
                id: c.id,
                username: c.username,
                password: c.password,
                is_temporary: c.is_temporary,
                expires_at: c.expires_at ? c.expires_at.toISOString() : null,
                created_at: c.created_at.toISOString(),
                created_by: c.created_by,
                is_expired: isExpired,
            };
        });

        return { success: true, credentials: formatted };
    } catch (error: any) {
        console.error('Failed to fetch investor credentials list:', error);
        return { success: false, credentials: [], error: error.message };
    }
}

/**
 * Deletes an investor credential from DB by ID.
 */
export async function deleteInvestorCredential(id: string) {
    try {
        await prisma.investorCredential.delete({
            where: { id },
        });
        return { success: true };
    } catch (error: any) {
        console.error('Failed to delete investor credential:', error);
        return { success: false, error: error.message };
    }
}
