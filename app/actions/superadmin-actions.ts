'use server';

import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
    createSuperAdminSession,
    getSuperAdminSession,
} from '@/app/lib/session';
import { superAdminLoginSchema, createOrganizationSchema } from '@/app/lib/validations';

// ========================================
// AUTH
// ========================================

export async function superAdminLogin(prevState: any, formData: FormData) {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    };

    const parsed = superAdminLoginSchema.safeParse(raw);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    try {
        const admin = await prisma.superAdmin.findUnique({
            where: { email: parsed.data.email },
        });

        if (!admin || !(await bcrypt.compare(parsed.data.password, admin.password))) {
            return { success: false, error: 'Invalid credentials' };
        }

        if (!admin.is_active) {
            return { success: false, error: 'Account is disabled' };
        }

        await createSuperAdminSession({
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: 'superadmin',
        });
    } catch (error: any) {
        console.error('SuperAdmin login error:', error);
        return { success: false, error: 'Internal server error' };
    }

    redirect('/superadmin');
}

export async function superAdminLogout() {
    const cookieStore = await cookies();
    cookieStore.delete('superadmin_session');
    redirect('/superadmin/login');
}

export async function requireSuperAdmin() {
    const session = await getSuperAdminSession();
    if (!session) {
        redirect('/superadmin/login');
    }
    return session;
}

// ========================================
// SYSTEM STATS
// ========================================

export async function getSystemStats() {
    await requireSuperAdmin();

    try {
        const [
            totalOrgs,
            activeOrgs,
            totalUsers,
            totalPatients,
            totalAdmissions,
        ] = await Promise.all([
            prisma.organization.count(),
            prisma.organization.count({ where: { is_active: true } }),
            prisma.user.count(),
            prisma.oPD_REG.count(),
            prisma.admissions.count({ where: { status: 'Admitted' } }),
        ]);

        return {
            success: true,
            data: { totalOrgs, activeOrgs, totalUsers, totalPatients, totalAdmissions },
        };
    } catch (error: any) {
        console.error('getSystemStats error:', error);
        return { success: false, error: 'Failed to fetch system stats' };
    }
}

// ========================================
// ORGANIZATION MANAGEMENT
// ========================================

export async function listOrganizations() {
    await requireSuperAdmin();

    try {
        const orgs = await prisma.organization.findMany({
            orderBy: { created_at: 'desc' },
            include: {
                _count: {
                    select: {
                        users: true,
                        patients: true,
                    },
                },
            },
        });

        return { success: true, data: orgs };
    } catch (error: any) {
        console.error('listOrganizations error:', error);
        return { success: false, error: 'Failed to list organizations' };
    }
}

export async function getOrganizationDetail(id: string) {
    await requireSuperAdmin();

    try {
        const org = await prisma.organization.findUnique({
            where: { id },
            include: {
                config: true,
                branding: true,
                _count: {
                    select: {
                        users: true,
                        patients: true,
                        admissions: true,
                        invoices: true,
                    },
                },
            },
        });

        if (!org) return { success: false, error: 'Organization not found' };

        return { success: true, data: org };
    } catch (error: any) {
        console.error('getOrganizationDetail error:', error);
        return { success: false, error: 'Failed to fetch organization details' };
    }
}

export async function createOrganization(prevState: any, formData: FormData) {
    const session = await requireSuperAdmin();

    const raw = Object.fromEntries(formData.entries());
    if (!raw.plan) raw.plan = 'free';

    const parsed = createOrganizationSchema.safeParse(raw);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const data = parsed.data;

    try {
        const result = await prisma.$transaction(async (tx) => {
            // Check slug uniqueness
            const existing = await tx.organization.findUnique({ where: { slug: data.slug } });
            if (existing) {
                throw new Error('Organization slug already exists');
            }

            // Check code uniqueness
            const existingCode = await tx.organization.findUnique({ where: { code: data.code } });
            if (existingCode) {
                throw new Error('Organization code already exists');
            }

            // Check admin username uniqueness
            const existingUser = await tx.user.findUnique({ where: { username: data.admin_username } });
            if (existingUser) {
                throw new Error('Admin username already exists');
            }

            // Create organization
            const org = await tx.organization.create({
                data: {
                    name: data.name,
                    slug: data.slug,
                    code: data.code,
                    address: data.address || null,
                    phone: data.phone || null,
                    email: data.email || null,
                    license_no: data.license_no || null,
                    plan: data.plan,
                    is_active: true,
                },
            });

            // Create config
            await tx.organizationConfig.create({
                data: {
                    organizationId: org.id,
                    uhid_prefix: data.code,
                    enable_ai_triage: true,
                },
            });

            // Create branding
            await tx.organizationBranding.create({
                data: {
                    organizationId: org.id,
                    portal_title: data.name,
                    portal_subtitle: 'Management System',
                },
            });

            // Create admin user
            const hashedPassword = await bcrypt.hash(data.admin_password, 10);
            await tx.user.create({
                data: {
                    username: data.admin_username,
                    password: hashedPassword,
                    role: 'admin',
                    name: data.admin_name,
                    email: data.admin_email,
                    organizationId: org.id,
                    is_active: true,
                },
            });

            // Audit log
            await tx.system_audit_logs.create({
                data: {
                    action: 'CREATE_ORGANIZATION',
                    module: 'superadmin',
                    entity_type: 'organization',
                    entity_id: org.id,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `Created organization: ${data.name} (${data.slug})`,
                },
            });

            return org;
        });

        return { success: true, data: result };
    } catch (error: any) {
        console.error('createOrganization error:', error);
        if (['Organization slug already exists', 'Organization code already exists', 'Admin username already exists'].includes(error.message)) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Failed to create organization' };
    }
}

export async function toggleOrganization(id: string) {
    const session = await requireSuperAdmin();

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const org = await tx.organization.findUnique({ where: { id } });
            if (!org) throw new Error('Organization not found');

            const updatedOrg = await tx.organization.update({
                where: { id },
                data: { is_active: !org.is_active },
            });

            await tx.system_audit_logs.create({
                data: {
                    action: updatedOrg.is_active ? 'ACTIVATE_ORGANIZATION' : 'SUSPEND_ORGANIZATION',
                    module: 'superadmin',
                    entity_type: 'organization',
                    entity_id: id,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `${updatedOrg.is_active ? 'Activated' : 'Suspended'} organization: ${updatedOrg.name}`,
                },
            });

            return updatedOrg;
        });

        return { success: true, data: updated };
    } catch (error: any) {
        console.error('toggleOrganization error:', error);
        if (error.message === 'Organization not found') return { success: false, error: error.message };
        return { success: false, error: 'Failed to toggle organization status' };
    }
}

export async function updateOrganizationPlan(id: string, plan: string) {
    const session = await requireSuperAdmin();

    const ALLOWED_PLANS = ['free', 'starter', 'pro', 'enterprise'];
    if (!ALLOWED_PLANS.includes(plan)) {
        return { success: false, error: 'Invalid plan selected' };
    }

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const org = await tx.organization.update({
                where: { id },
                data: { plan },
            });

            await tx.system_audit_logs.create({
                data: {
                    action: 'UPDATE_ORGANIZATION_PLAN',
                    module: 'superadmin',
                    entity_type: 'organization',
                    entity_id: id,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `Updated plan to ${plan} for organization: ${org.name}`,
                },
            });

            return org;
        });

        return { success: true, data: updated };
    } catch (error: any) {
        console.error('updateOrganizationPlan error:', error);
        return { success: false, error: 'Failed to update organization plan' };
    }
}

// ========================================
// PLATFORM ANALYTICS
// ========================================

export async function getPlatformAnalytics() {
    await requireSuperAdmin();
    try {
        const orgStats = await prisma.organization.findMany({
            include: { _count: { select: { patients: true, users: true, invoices: true, admissions: true } } },
            orderBy: { patients: { _count: 'desc' } },
            take: 20
        });

        const allInvoices = await prisma.invoices.aggregate({
            _sum: { net_amount: true },
            where: { status: { not: 'Cancelled' } }
        });
        const platformRevenue = Number(allInvoices._sum.net_amount || 0);

        // Count totals over time or other metrics as needed
        const totalPayments = await prisma.payments.aggregate({
            _sum: { amount: true },
            where: { status: 'Completed' }
        });

        return {
            success: true,
            data: {
                orgStats,
                platformRevenue,
                totalCollected: Number(totalPayments._sum.amount || 0)
            }
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ========================================
// CROSS-TENANT USERS
// ========================================

export async function getOrganizationUsers(orgId?: string, search?: string) {
    await requireSuperAdmin();
    try {
        const users = await prisma.user.findMany({
            where: {
                ...(orgId ? { organizationId: orgId } : {}),
                ...(search ? {
                    OR: [
                        { name: { contains: search } },
                        { username: { contains: search } },
                        { email: { contains: search } }
                    ]
                } : {}),
            },
            include: { organization: { select: { name: true, code: true } } },
            take: 200,
            orderBy: { createdAt: 'desc' },
        });

        // Strip passwords before returning
        const safeUsers = users.map(u => {
            const { password, ...rest } = u;
            return rest;
        });

        return { success: true, data: JSON.parse(JSON.stringify(safeUsers)) };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

