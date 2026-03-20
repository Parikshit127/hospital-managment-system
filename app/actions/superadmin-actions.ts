'use server';

import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
    createSuperAdminSession,
    getSuperAdminSession,
} from '@/app/lib/session';
import { superAdminLoginSchema, createOrganizationSchema, organizationProfileSchema, branchSchema } from '@/app/lib/validations';

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
                        branches: true,
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

            // Parse numeric/array fields from FormData strings
            const bedCapacity = data.bed_capacity ? parseInt(data.bed_capacity, 10) : null;
            const specialtiesArr = data.specialties ? data.specialties.split(',').map(s => s.trim()).filter(Boolean) : [];
            const lat = data.latitude ? parseFloat(data.latitude) : null;
            const lng = data.longitude ? parseFloat(data.longitude) : null;
            const estYear = data.established_year ? parseInt(data.established_year, 10) : null;
            // Build full address from parts
            const addressParts = [data.address, data.city, data.state, data.pincode].filter(Boolean);
            const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

            // Create organization
            const org = await tx.organization.create({
                data: {
                    name: data.name,
                    slug: data.slug,
                    code: data.code,
                    address: fullAddress,
                    phone: data.phone || null,
                    email: data.email || null,
                    license_no: data.license_no || null,
                    plan: data.plan,
                    is_active: true,
                    hospital_type: data.hospital_type || null,
                    bed_capacity: bedCapacity,
                    specialties: specialtiesArr,
                    website: data.website || null,
                    latitude: lat,
                    longitude: lng,
                    registration_number: data.registration_number || null,
                    registration_authority: data.registration_authority || null,
                    accreditation_body: data.accreditation_body || null,
                    accreditation_number: data.accreditation_number || null,
                    accreditation_expiry: data.accreditation_expiry ? new Date(data.accreditation_expiry) : null,
                    established_year: estYear,
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

// ========================================
// ORGANIZATION PROFILE UPDATE
// ========================================

export async function updateOrganizationProfile(orgId: string, data: any) {
    const session = await requireSuperAdmin();

    const parsed = organizationProfileSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const d = parsed.data;

    try {
        const updated = await prisma.$transaction(async (tx) => {
            // Check slug uniqueness if changed
            const existing = await tx.organization.findUnique({ where: { id: orgId } });
            if (!existing) throw new Error('Organization not found');

            if (d.slug !== existing.slug) {
                const slugTaken = await tx.organization.findUnique({ where: { slug: d.slug } });
                if (slugTaken) throw new Error('Slug already in use by another organization');
            }

            const org = await tx.organization.update({
                where: { id: orgId },
                data: {
                    name: d.name,
                    slug: d.slug,
                    code: d.code,
                    address: d.address || null,
                    phone: d.phone || null,
                    email: d.email || null,
                    license_no: d.license_no || null,
                    hospital_type: d.hospital_type || null,
                    bed_capacity: d.bed_capacity ?? null,
                    accreditation_body: d.accreditation_body || null,
                    accreditation_number: d.accreditation_number || null,
                    accreditation_expiry: d.accreditation_expiry ? new Date(d.accreditation_expiry) : null,
                    registration_number: d.registration_number || null,
                    registration_authority: d.registration_authority || null,
                    established_year: d.established_year ?? null,
                    website: d.website || null,
                    specialties: d.specialties || [],
                    latitude: d.latitude ?? null,
                    longitude: d.longitude ?? null,
                },
            });

            await tx.system_audit_logs.create({
                data: {
                    action: 'UPDATE_ORGANIZATION_PROFILE',
                    module: 'superadmin',
                    entity_type: 'organization',
                    entity_id: orgId,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `Updated profile for organization: ${org.name}`,
                },
            });

            return org;
        });

        return { success: true, data: JSON.parse(JSON.stringify(updated)) };
    } catch (error: any) {
        console.error('updateOrganizationProfile error:', error);
        if (['Organization not found', 'Slug already in use by another organization'].includes(error.message)) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Failed to update organization profile' };
    }
}

// ========================================
// BRANCH MANAGEMENT
// ========================================

export async function getOrganizationBranches(orgId: string) {
    await requireSuperAdmin();
    try {
        const branches = await prisma.branch.findMany({
            where: { organizationId: orgId },
            orderBy: [{ is_main_branch: 'desc' }, { created_at: 'desc' }],
        });
        return { success: true, data: JSON.parse(JSON.stringify(branches)) };
    } catch (err: any) {
        console.error('getOrganizationBranches error:', err);
        return { success: false, error: 'Failed to fetch branches' };
    }
}

export async function createBranch(orgId: string, data: any) {
    const session = await requireSuperAdmin();

    const parsed = branchSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const d = parsed.data;

    try {
        const branch = await prisma.$transaction(async (tx) => {
            // Check org exists
            const org = await tx.organization.findUnique({ where: { id: orgId } });
            if (!org) throw new Error('Organization not found');

            // Check branch_code uniqueness within org
            const existing = await tx.branch.findFirst({
                where: { organizationId: orgId, branch_code: d.branch_code },
            });
            if (existing) throw new Error('Branch code already exists for this organization');

            const newBranch = await tx.branch.create({
                data: {
                    branch_name: d.branch_name,
                    branch_code: d.branch_code,
                    address: d.address || null,
                    city: d.city || null,
                    state: d.state || null,
                    pincode: d.pincode || null,
                    phone: d.phone || null,
                    email: d.email || null,
                    is_main_branch: d.is_main_branch || false,
                    latitude: d.latitude ?? null,
                    longitude: d.longitude ?? null,
                    organizationId: orgId,
                },
            });

            await tx.system_audit_logs.create({
                data: {
                    action: 'CREATE_BRANCH',
                    module: 'superadmin',
                    entity_type: 'branch',
                    entity_id: newBranch.id,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `Created branch "${d.branch_name}" (${d.branch_code}) for org: ${org.name}`,
                },
            });

            return newBranch;
        });

        return { success: true, data: JSON.parse(JSON.stringify(branch)) };
    } catch (error: any) {
        console.error('createBranch error:', error);
        if (['Organization not found', 'Branch code already exists for this organization'].includes(error.message)) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Failed to create branch' };
    }
}

export async function updateBranch(branchId: string, data: any) {
    const session = await requireSuperAdmin();

    const parsed = branchSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const d = parsed.data;

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const existing = await tx.branch.findUnique({ where: { id: branchId } });
            if (!existing) throw new Error('Branch not found');

            // Check branch_code uniqueness if changed
            if (d.branch_code !== existing.branch_code) {
                const codeTaken = await tx.branch.findFirst({
                    where: { organizationId: existing.organizationId, branch_code: d.branch_code, id: { not: branchId } },
                });
                if (codeTaken) throw new Error('Branch code already exists for this organization');
            }

            const branch = await tx.branch.update({
                where: { id: branchId },
                data: {
                    branch_name: d.branch_name,
                    branch_code: d.branch_code,
                    address: d.address || null,
                    city: d.city || null,
                    state: d.state || null,
                    pincode: d.pincode || null,
                    phone: d.phone || null,
                    email: d.email || null,
                    is_main_branch: d.is_main_branch || false,
                    latitude: d.latitude ?? null,
                    longitude: d.longitude ?? null,
                },
            });

            await tx.system_audit_logs.create({
                data: {
                    action: 'UPDATE_BRANCH',
                    module: 'superadmin',
                    entity_type: 'branch',
                    entity_id: branchId,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `Updated branch "${d.branch_name}" (${d.branch_code})`,
                },
            });

            return branch;
        });

        return { success: true, data: JSON.parse(JSON.stringify(updated)) };
    } catch (error: any) {
        console.error('updateBranch error:', error);
        if (['Branch not found', 'Branch code already exists for this organization'].includes(error.message)) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Failed to update branch' };
    }
}

export async function toggleBranch(branchId: string) {
    const session = await requireSuperAdmin();

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const branch = await tx.branch.findUnique({ where: { id: branchId } });
            if (!branch) throw new Error('Branch not found');

            const toggled = await tx.branch.update({
                where: { id: branchId },
                data: { is_active: !branch.is_active },
            });

            await tx.system_audit_logs.create({
                data: {
                    action: toggled.is_active ? 'ACTIVATE_BRANCH' : 'DEACTIVATE_BRANCH',
                    module: 'superadmin',
                    entity_type: 'branch',
                    entity_id: branchId,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `${toggled.is_active ? 'Activated' : 'Deactivated'} branch: ${toggled.branch_name}`,
                },
            });

            return toggled;
        });

        return { success: true, data: JSON.parse(JSON.stringify(updated)) };
    } catch (error: any) {
        console.error('toggleBranch error:', error);
        if (error.message === 'Branch not found') return { success: false, error: error.message };
        return { success: false, error: 'Failed to toggle branch status' };
    }
}

export async function deleteBranch(branchId: string) {
    const session = await requireSuperAdmin();

    try {
        await prisma.$transaction(async (tx) => {
            const branch = await tx.branch.findUnique({ where: { id: branchId } });
            if (!branch) throw new Error('Branch not found');

            await tx.branch.delete({ where: { id: branchId } });

            await tx.system_audit_logs.create({
                data: {
                    action: 'DELETE_BRANCH',
                    module: 'superadmin',
                    entity_type: 'branch',
                    entity_id: branchId,
                    user_id: session.id,
                    username: session.email,
                    role: session.role,
                    details: `Deleted branch: ${branch.branch_name} (${branch.branch_code})`,
                },
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error('deleteBranch error:', error);
        if (error.message === 'Branch not found') return { success: false, error: error.message };
        return { success: false, error: 'Failed to delete branch' };
    }
}

// ========================================
// ORGANIZATION CONFIG & BRANDING (Phase 2)
// ========================================

export async function getOrganizationConfig(orgId: string) {
    await requireSuperAdmin();
    try {
        const [config, branding] = await Promise.all([
            prisma.organizationConfig.findUnique({ where: { organizationId: orgId } }),
            prisma.organizationBranding.findUnique({ where: { organizationId: orgId } }),
        ]);
        return { success: true, data: { config, branding } };
    } catch (err: any) {
        console.error('getOrganizationConfig error:', err);
        return { success: false, error: 'Failed to fetch config' };
    }
}

export async function updateOrganizationConfig(orgId: string, configData: any) {
    const session = await requireSuperAdmin();
    try {
        const config = await prisma.organizationConfig.upsert({
            where: { organizationId: orgId },
            update: {
                uhid_prefix: configData.uhid_prefix,
                timezone: configData.timezone,
                currency: configData.currency,
                date_format: configData.date_format,
                session_timeout: Number(configData.session_timeout) || 15,
                enable_whatsapp: !!configData.enable_whatsapp,
                enable_razorpay: !!configData.enable_razorpay,
                enable_ai_triage: !!configData.enable_ai_triage,
            },
            create: {
                organizationId: orgId,
                uhid_prefix: configData.uhid_prefix || 'AVN',
                timezone: configData.timezone || 'Asia/Kolkata',
                currency: configData.currency || 'INR',
                date_format: configData.date_format || 'DD/MM/YYYY',
                session_timeout: Number(configData.session_timeout) || 15,
                enable_whatsapp: !!configData.enable_whatsapp,
                enable_razorpay: !!configData.enable_razorpay,
                enable_ai_triage: configData.enable_ai_triage ?? true,
            },
        });

        await prisma.system_audit_logs.create({
            data: {
                action: 'UPDATE_ORGANIZATION_CONFIG',
                module: 'superadmin',
                entity_type: 'organization_config',
                entity_id: orgId,
                user_id: session.id,
                username: session.email,
                role: session.role,
                details: `Updated config for organization: ${orgId}`,
            },
        });

        return { success: true, data: config };
    } catch (err: any) {
        console.error('updateOrganizationConfig error:', err);
        return { success: false, error: 'Failed to update config' };
    }
}

export async function updateOrganizationBranding(orgId: string, brandingData: any) {
    const session = await requireSuperAdmin();
    try {
        const branding = await prisma.organizationBranding.upsert({
            where: { organizationId: orgId },
            update: {
                primary_color: brandingData.primary_color,
                secondary_color: brandingData.secondary_color,
                logo_url: brandingData.logo_url || null,
                portal_title: brandingData.portal_title,
                portal_subtitle: brandingData.portal_subtitle,
                footer_text: brandingData.footer_text || null,
            },
            create: {
                organizationId: orgId,
                primary_color: brandingData.primary_color || '#10b981',
                secondary_color: brandingData.secondary_color || '#0f172a',
                logo_url: brandingData.logo_url || null,
                portal_title: brandingData.portal_title || 'Hospital OS',
                portal_subtitle: brandingData.portal_subtitle || 'Management System',
                footer_text: brandingData.footer_text || null,
            },
        });

        await prisma.system_audit_logs.create({
            data: {
                action: 'UPDATE_ORGANIZATION_BRANDING',
                module: 'superadmin',
                entity_type: 'organization_branding',
                entity_id: orgId,
                user_id: session.id,
                username: session.email,
                role: session.role,
                details: `Updated branding for organization: ${orgId}`,
            },
        });

        return { success: true, data: branding };
    } catch (err: any) {
        console.error('updateOrganizationBranding error:', err);
        return { success: false, error: 'Failed to update branding' };
    }
}

// ========================================
// AUDIT LOGS (Phase 2)
// ========================================

export async function getOrganizationAuditLog(orgId: string, filters?: {
    from?: string; to?: string; action?: string; page?: number;
}) {
    await requireSuperAdmin();
    try {
        const page = filters?.page || 1;
        const pageSize = 50;
        const where: any = { organizationId: orgId };

        if (filters?.from) where.created_at = { ...where.created_at, gte: new Date(filters.from) };
        if (filters?.to) where.created_at = { ...where.created_at, lte: new Date(filters.to + 'T23:59:59') };
        if (filters?.action) where.action = { contains: filters.action };

        const [logs, total] = await Promise.all([
            prisma.system_audit_logs.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.system_audit_logs.count({ where }),
        ]);

        return { success: true, data: { logs: JSON.parse(JSON.stringify(logs)), total, page, pageSize } };
    } catch (err: any) {
        console.error('getOrganizationAuditLog error:', err);
        return { success: false, error: 'Failed to fetch audit logs' };
    }
}

export async function getPlatformAuditLog(filters?: {
    orgId?: string; from?: string; to?: string; action?: string; username?: string; page?: number;
}) {
    await requireSuperAdmin();
    try {
        const page = filters?.page || 1;
        const pageSize = 50;
        const where: any = {};

        if (filters?.orgId) where.organizationId = filters.orgId;
        if (filters?.from) where.created_at = { ...where.created_at, gte: new Date(filters.from) };
        if (filters?.to) where.created_at = { ...where.created_at, lte: new Date(filters.to + 'T23:59:59') };
        if (filters?.action) where.action = { contains: filters.action };
        if (filters?.username) where.username = { contains: filters.username };

        const [logs, total] = await Promise.all([
            prisma.system_audit_logs.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    organization: { select: { name: true, code: true } },
                },
            }),
            prisma.system_audit_logs.count({ where }),
        ]);

        return { success: true, data: { logs: JSON.parse(JSON.stringify(logs)), total, page, pageSize } };
    } catch (err: any) {
        console.error('getPlatformAuditLog error:', err);
        return { success: false, error: 'Failed to fetch platform audit logs' };
    }
}

// ========================================
// USAGE ANALYTICS (Phase 3)
// ========================================

export async function getOrganizationUsageMetrics(orgId: string) {
    await requireSuperAdmin();
    try {
        const [
            totalPatients, totalUsers, totalInvoices, totalAdmissions,
            totalLabOrders, totalPharmacyOrders, totalAppointments,
            totalInsuranceClaims, totalBranches,
            revenueAgg,
        ] = await Promise.all([
            prisma.oPD_REG.count({ where: { organizationId: orgId } }),
            prisma.user.count({ where: { organizationId: orgId } }),
            prisma.invoices.count({ where: { organizationId: orgId } }),
            prisma.admissions.count({ where: { organizationId: orgId } }),
            prisma.lab_orders.count({ where: { organizationId: orgId } }),
            prisma.pharmacy_orders.count({ where: { organizationId: orgId } }),
            prisma.appointments.count({ where: { organizationId: orgId } }),
            prisma.insurance_claims.count({ where: { organizationId: orgId } }),
            prisma.branch.count({ where: { organizationId: orgId } }),
            prisma.invoices.aggregate({
                where: { organizationId: orgId, status: { not: 'Cancelled' } },
                _sum: { net_amount: true },
            }),
        ]);

        const totalRevenue = Number(revenueAgg._sum.net_amount || 0);

        // 30-day average daily patients
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentPatients = await prisma.oPD_REG.count({
            where: { organizationId: orgId, created_at: { gte: thirtyDaysAgo } },
        });
        const avgDailyPatients = Math.round(recentPatients / 30);

        return {
            success: true,
            data: {
                totalPatients, totalUsers, totalInvoices, totalAdmissions,
                totalLabOrders, totalPharmacyOrders, totalAppointments,
                totalInsuranceClaims, totalBranches, totalRevenue, avgDailyPatients,
            },
        };
    } catch (err: any) {
        console.error('getOrganizationUsageMetrics error:', err);
        return { success: false, error: 'Failed to fetch usage metrics' };
    }
}

export async function getOrganizationUsageTrend(orgId: string, months: number = 12) {
    await requireSuperAdmin();
    try {
        const trends: { month: string; patients: number; invoices: number; revenue: number }[] = [];

        for (let i = months - 1; i >= 0; i--) {
            const start = new Date();
            start.setMonth(start.getMonth() - i, 1);
            start.setHours(0, 0, 0, 0);

            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);

            const [patients, invoiceAgg] = await Promise.all([
                prisma.oPD_REG.count({
                    where: { organizationId: orgId, created_at: { gte: start, lt: end } },
                }),
                prisma.invoices.aggregate({
                    where: { organizationId: orgId, created_at: { gte: start, lt: end }, status: { not: 'Cancelled' } },
                    _sum: { net_amount: true },
                    _count: true,
                }),
            ]);

            trends.push({
                month: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
                patients,
                invoices: invoiceAgg._count,
                revenue: Number(invoiceAgg._sum.net_amount || 0),
            });
        }

        return { success: true, data: trends };
    } catch (err: any) {
        console.error('getOrganizationUsageTrend error:', err);
        return { success: false, error: 'Failed to fetch usage trends' };
    }
}

export async function getEnhancedPlatformAnalytics() {
    await requireSuperAdmin();
    try {
        const allOrgs = await prisma.organization.findMany({
            include: {
                _count: {
                    select: {
                        patients: true, users: true, invoices: true, admissions: true,
                        lab_orders: true, pharmacy_orders: true, branches: true,
                    },
                },
            },
            orderBy: { patients: { _count: 'desc' } },
        });

        const totalOrgs = allOrgs.length;
        const activeOrgs = allOrgs.filter(o => o.is_active).length;

        // Platform-wide counts
        const [totalPatients, totalRevAgg, totalPayments] = await Promise.all([
            prisma.oPD_REG.count(),
            prisma.invoices.aggregate({ where: { status: { not: 'Cancelled' } }, _sum: { net_amount: true } }),
            prisma.payments.aggregate({ where: { status: 'Completed' }, _sum: { amount: true } }),
        ]);

        const totalRevenue = Number(totalRevAgg._sum.net_amount || 0);
        const totalCollected = Number(totalPayments._sum.amount || 0);

        // Plan distribution
        const planDist: Record<string, number> = {};
        allOrgs.forEach(o => { planDist[o.plan] = (planDist[o.plan] || 0) + 1; });

        // Top 10 by patients and revenue
        const top10ByPatients = allOrgs.slice(0, 10).map(o => ({
            name: o.name, code: o.code, count: o._count.patients,
        }));

        // For revenue, we need per-org aggregation
        const orgRevenues = await Promise.all(
            allOrgs.slice(0, 20).map(async (o) => {
                const rev = await prisma.invoices.aggregate({
                    where: { organizationId: o.id, status: { not: 'Cancelled' } },
                    _sum: { net_amount: true },
                });
                return { name: o.name, code: o.code, revenue: Number(rev._sum.net_amount || 0) };
            })
        );
        const top10ByRevenue = orgRevenues.sort((a, b) => b.revenue - a.revenue).slice(0, 10);

        // Tenant comparison table
        const tenantComparison = allOrgs.map(o => ({
            id: o.id, name: o.name, code: o.code, plan: o.plan, is_active: o.is_active,
            hospital_type: o.hospital_type,
            patients: o._count.patients, users: o._count.users,
            invoices: o._count.invoices, admissions: o._count.admissions,
            branches: o._count.branches,
            created_at: o.created_at,
        }));

        return {
            success: true,
            data: {
                totalOrgs, activeOrgs, totalPatients, totalRevenue, totalCollected,
                planDistribution: planDist,
                top10ByPatients, top10ByRevenue,
                tenantComparison: JSON.parse(JSON.stringify(tenantComparison)),
            },
        };
    } catch (err: any) {
        console.error('getEnhancedPlatformAnalytics error:', err);
        return { success: false, error: 'Failed to fetch analytics' };
    }
}

// ========================================
// SUBSCRIPTION PLANS (Phase 4)
// ========================================

export async function getSubscriptionPlans() {
    await requireSuperAdmin();
    try {
        const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price_monthly: 'asc' } });
        return { success: true, data: JSON.parse(JSON.stringify(plans)) };
    } catch (err: any) {
        console.error('getSubscriptionPlans error:', err);
        return { success: false, error: 'Failed to fetch plans' };
    }
}

export async function createSubscriptionPlan(data: any) {
    const session = await requireSuperAdmin();
    try {
        const existing = await prisma.subscriptionPlan.findUnique({ where: { plan_code: data.plan_code } });
        if (existing) return { success: false, error: 'Plan code already exists' };

        const plan = await prisma.subscriptionPlan.create({
            data: {
                plan_name: data.plan_name,
                plan_code: data.plan_code,
                max_users: Number(data.max_users) || 0,
                max_branches: Number(data.max_branches) || 0,
                max_patients_per_month: data.max_patients_per_month ? Number(data.max_patients_per_month) : null,
                features: data.features || [],
                price_monthly: Number(data.price_monthly) || 0,
                price_yearly: Number(data.price_yearly) || 0,
                is_active: true,
            },
        });

        await prisma.system_audit_logs.create({
            data: {
                action: 'CREATE_SUBSCRIPTION_PLAN',
                module: 'superadmin',
                entity_type: 'subscription_plan',
                entity_id: plan.id,
                user_id: session.id,
                username: session.email,
                role: session.role,
                details: `Created plan: ${data.plan_name} (${data.plan_code})`,
            },
        });

        return { success: true, data: JSON.parse(JSON.stringify(plan)) };
    } catch (err: any) {
        console.error('createSubscriptionPlan error:', err);
        return { success: false, error: 'Failed to create plan' };
    }
}

export async function updateSubscriptionPlan(planId: string, data: any) {
    const session = await requireSuperAdmin();
    try {
        const plan = await prisma.subscriptionPlan.update({
            where: { id: planId },
            data: {
                plan_name: data.plan_name,
                max_users: Number(data.max_users) || 0,
                max_branches: Number(data.max_branches) || 0,
                max_patients_per_month: data.max_patients_per_month ? Number(data.max_patients_per_month) : null,
                features: data.features || [],
                price_monthly: Number(data.price_monthly) || 0,
                price_yearly: Number(data.price_yearly) || 0,
                is_active: data.is_active ?? true,
            },
        });

        await prisma.system_audit_logs.create({
            data: {
                action: 'UPDATE_SUBSCRIPTION_PLAN',
                module: 'superadmin',
                entity_type: 'subscription_plan',
                entity_id: planId,
                user_id: session.id,
                username: session.email,
                role: session.role,
                details: `Updated plan: ${plan.plan_name} (${plan.plan_code})`,
            },
        });

        return { success: true, data: JSON.parse(JSON.stringify(plan)) };
    } catch (err: any) {
        console.error('updateSubscriptionPlan error:', err);
        return { success: false, error: 'Failed to update plan' };
    }
}

export async function getOrganizationBilling(orgId: string) {
    await requireSuperAdmin();
    try {
        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: {
                id: true, name: true, plan: true,
                _count: { select: { users: true, branches: true, patients: true } },
            },
        });
        if (!org) return { success: false, error: 'Organization not found' };

        // Get matching subscription plan limits
        const plan = await prisma.subscriptionPlan.findUnique({ where: { plan_code: org.plan } });

        // 30-day patient count
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const monthlyPatients = await prisma.oPD_REG.count({
            where: { organizationId: orgId, created_at: { gte: thirtyDaysAgo } },
        });

        return {
            success: true,
            data: {
                currentPlan: org.plan,
                planDetails: plan ? JSON.parse(JSON.stringify(plan)) : null,
                usage: {
                    users: org._count.users,
                    branches: org._count.branches,
                    monthlyPatients,
                },
            },
        };
    } catch (err: any) {
        console.error('getOrganizationBilling error:', err);
        return { success: false, error: 'Failed to fetch billing info' };
    }
}

