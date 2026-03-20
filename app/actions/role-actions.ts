'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// Default permissions matrix for system roles
const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
    admin: [
        'opd.view', 'opd.create', 'opd.edit', 'opd.delete', 'opd.approve', 'opd.export',
        'ipd.view', 'ipd.create', 'ipd.edit', 'ipd.delete', 'ipd.approve', 'ipd.export',
        'lab.view', 'lab.create', 'lab.edit', 'lab.delete', 'lab.approve', 'lab.export',
        'pharmacy.view', 'pharmacy.create', 'pharmacy.edit', 'pharmacy.delete', 'pharmacy.approve', 'pharmacy.export',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete', 'finance.approve', 'finance.export',
        'insurance.view', 'insurance.create', 'insurance.edit', 'insurance.delete', 'insurance.approve', 'insurance.export',
        'hr.view', 'hr.create', 'hr.edit', 'hr.delete', 'hr.approve', 'hr.export',
        'admin.view', 'admin.create', 'admin.edit', 'admin.delete', 'admin.approve', 'admin.export',
        'reports.view', 'reports.export',
    ],
    doctor: [
        'opd.view', 'opd.create', 'opd.edit',
        'ipd.view', 'ipd.create', 'ipd.edit',
        'lab.view', 'lab.create',
        'pharmacy.view',
        'finance.view',
        'insurance.view',
        'reports.view',
    ],
    receptionist: [
        'opd.view', 'opd.create', 'opd.edit',
        'ipd.view',
        'finance.view', 'finance.create',
        'insurance.view',
        'reports.view',
    ],
    lab_technician: [
        'lab.view', 'lab.create', 'lab.edit',
        'reports.view',
    ],
    pharmacist: [
        'pharmacy.view', 'pharmacy.create', 'pharmacy.edit',
        'reports.view',
    ],
    finance: [
        'finance.view', 'finance.create', 'finance.edit', 'finance.approve', 'finance.export',
        'insurance.view', 'insurance.create', 'insurance.edit',
        'reports.view', 'reports.export',
    ],
    ipd_manager: [
        'ipd.view', 'ipd.create', 'ipd.edit', 'ipd.approve',
        'opd.view',
        'lab.view',
        'pharmacy.view',
        'finance.view',
        'reports.view', 'reports.export',
    ],
    nurse: [
        'ipd.view', 'ipd.edit',
        'opd.view',
        'lab.view',
        'pharmacy.view',
        'reports.view',
    ],
    opd_manager: [
        'opd.view', 'opd.create', 'opd.edit', 'opd.approve',
        'lab.view',
        'pharmacy.view',
        'finance.view',
        'reports.view', 'reports.export',
    ],
    hr: [
        'hr.view', 'hr.create', 'hr.edit', 'hr.approve', 'hr.export',
        'reports.view', 'reports.export',
    ],
};

const ALL_PERMISSIONS = [
    { key: 'opd.view', module: 'opd', action: 'view', label: 'View OPD Patients' },
    { key: 'opd.create', module: 'opd', action: 'create', label: 'Register OPD Patients' },
    { key: 'opd.edit', module: 'opd', action: 'edit', label: 'Edit OPD Records' },
    { key: 'opd.delete', module: 'opd', action: 'delete', label: 'Delete OPD Records' },
    { key: 'opd.approve', module: 'opd', action: 'approve', label: 'Approve OPD Actions' },
    { key: 'opd.export', module: 'opd', action: 'export', label: 'Export OPD Data' },

    { key: 'ipd.view', module: 'ipd', action: 'view', label: 'View IPD Patients' },
    { key: 'ipd.create', module: 'ipd', action: 'create', label: 'Admit Patients' },
    { key: 'ipd.edit', module: 'ipd', action: 'edit', label: 'Edit IPD Records' },
    { key: 'ipd.delete', module: 'ipd', action: 'delete', label: 'Delete IPD Records' },
    { key: 'ipd.approve', module: 'ipd', action: 'approve', label: 'Approve Admissions/Discharges' },
    { key: 'ipd.export', module: 'ipd', action: 'export', label: 'Export IPD Data' },

    { key: 'lab.view', module: 'lab', action: 'view', label: 'View Lab Orders' },
    { key: 'lab.create', module: 'lab', action: 'create', label: 'Create Lab Orders' },
    { key: 'lab.edit', module: 'lab', action: 'edit', label: 'Enter Lab Results' },
    { key: 'lab.delete', module: 'lab', action: 'delete', label: 'Delete Lab Records' },
    { key: 'lab.approve', module: 'lab', action: 'approve', label: 'Approve Lab Results' },
    { key: 'lab.export', module: 'lab', action: 'export', label: 'Export Lab Data' },

    { key: 'pharmacy.view', module: 'pharmacy', action: 'view', label: 'View Pharmacy' },
    { key: 'pharmacy.create', module: 'pharmacy', action: 'create', label: 'Dispense Medicines' },
    { key: 'pharmacy.edit', module: 'pharmacy', action: 'edit', label: 'Edit Pharmacy Records' },
    { key: 'pharmacy.delete', module: 'pharmacy', action: 'delete', label: 'Delete Pharmacy Records' },
    { key: 'pharmacy.approve', module: 'pharmacy', action: 'approve', label: 'Approve Purchase Orders' },
    { key: 'pharmacy.export', module: 'pharmacy', action: 'export', label: 'Export Pharmacy Data' },

    { key: 'finance.view', module: 'finance', action: 'view', label: 'View Finance' },
    { key: 'finance.create', module: 'finance', action: 'create', label: 'Create Invoices' },
    { key: 'finance.edit', module: 'finance', action: 'edit', label: 'Edit Invoices' },
    { key: 'finance.delete', module: 'finance', action: 'delete', label: 'Delete/Void Invoices' },
    { key: 'finance.approve', module: 'finance', action: 'approve', label: 'Approve Discounts' },
    { key: 'finance.export', module: 'finance', action: 'export', label: 'Export Financial Data' },

    { key: 'insurance.view', module: 'insurance', action: 'view', label: 'View Insurance Claims' },
    { key: 'insurance.create', module: 'insurance', action: 'create', label: 'Submit Claims' },
    { key: 'insurance.edit', module: 'insurance', action: 'edit', label: 'Edit Claims' },
    { key: 'insurance.delete', module: 'insurance', action: 'delete', label: 'Delete Claims' },
    { key: 'insurance.approve', module: 'insurance', action: 'approve', label: 'Approve Claims' },
    { key: 'insurance.export', module: 'insurance', action: 'export', label: 'Export Insurance Data' },

    { key: 'hr.view', module: 'hr', action: 'view', label: 'View HR Records' },
    { key: 'hr.create', module: 'hr', action: 'create', label: 'Create Employees' },
    { key: 'hr.edit', module: 'hr', action: 'edit', label: 'Edit HR Records' },
    { key: 'hr.delete', module: 'hr', action: 'delete', label: 'Delete HR Records' },
    { key: 'hr.approve', module: 'hr', action: 'approve', label: 'Approve Leave/Attendance' },
    { key: 'hr.export', module: 'hr', action: 'export', label: 'Export HR Data' },

    { key: 'admin.view', module: 'admin', action: 'view', label: 'View Admin Panel' },
    { key: 'admin.create', module: 'admin', action: 'create', label: 'Create Users/Settings' },
    { key: 'admin.edit', module: 'admin', action: 'edit', label: 'Edit Admin Settings' },
    { key: 'admin.delete', module: 'admin', action: 'delete', label: 'Delete Admin Items' },
    { key: 'admin.approve', module: 'admin', action: 'approve', label: 'Approve Admin Actions' },
    { key: 'admin.export', module: 'admin', action: 'export', label: 'Export Admin Data' },

    { key: 'reports.view', module: 'reports', action: 'view', label: 'View Reports' },
    { key: 'reports.export', module: 'reports', action: 'export', label: 'Export Reports' },
];

export async function getPermissionMatrix() {
    return { success: true, data: ALL_PERMISSIONS };
}

export async function listRoles() {
    try {
        const { db } = await requireTenantContext();

        const roles = await db.role.findMany({
            orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
        });

        // Count users per role slug
        const userCounts = await db.user.groupBy({
            by: ['role'],
            _count: true,
        });

        const countMap: Record<string, number> = {};
        for (const entry of userCounts) {
            countMap[entry.role] = entry._count;
        }

        const enriched = roles.map((role: any) => ({
            ...role,
            user_count: countMap[role.slug] || 0,
        }));

        return { success: true, data: enriched };
    } catch (error: any) {
        console.error('listRoles error:', error);
        return { success: false, error: error.message };
    }
}

export async function createRole(data: {
    name: string;
    slug: string;
    description?: string;
    data_scope: string;
    permissions: string[];
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const existing = await db.role.findFirst({
            where: { slug: data.slug },
        });
        if (existing) {
            return { success: false, error: 'A role with this slug already exists' };
        }

        const role = await db.role.create({
            data: {
                organizationId,
                name: data.name,
                slug: data.slug,
                description: data.description || null,
                data_scope: data.data_scope,
                permissions: data.permissions,
                is_system: false,
            },
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'CREATE_ROLE',
                module: 'admin',
                entity_type: 'Role',
                entity_id: role.id,
                details: `Created custom role: ${data.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/roles');
        return { success: true, data: role };
    } catch (error: any) {
        console.error('createRole error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateRole(roleId: string, data: {
    name?: string;
    description?: string;
    data_scope?: string;
    permissions?: string[];
    is_active?: boolean;
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const existing = await db.role.findFirst({
            where: { id: roleId },
        });
        if (!existing) return { success: false, error: 'Role not found' };
        if (existing.is_system) return { success: false, error: 'Cannot edit system roles' };

        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.data_scope !== undefined) updateData.data_scope = data.data_scope;
        if (data.permissions !== undefined) updateData.permissions = data.permissions;
        if (data.is_active !== undefined) updateData.is_active = data.is_active;

        const role = await db.role.update({
            where: { id: roleId },
            data: updateData,
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'UPDATE_ROLE',
                module: 'admin',
                entity_type: 'Role',
                entity_id: roleId,
                details: `Updated role: ${role.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/roles');
        return { success: true, data: role };
    } catch (error: any) {
        console.error('updateRole error:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteRole(roleId: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const existing = await db.role.findFirst({
            where: { id: roleId },
        });
        if (!existing) return { success: false, error: 'Role not found' };
        if (existing.is_system) return { success: false, error: 'Cannot delete system roles' };

        await db.role.delete({ where: { id: roleId } });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'DELETE_ROLE',
                module: 'admin',
                entity_type: 'Role',
                entity_id: roleId,
                details: `Deleted role: ${existing.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/roles');
        return { success: true };
    } catch (error: any) {
        console.error('deleteRole error:', error);
        return { success: false, error: error.message };
    }
}

export async function seedSystemRoles() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const existingRoles = await db.role.findMany({
            where: { is_system: true },
        });

        if (existingRoles.length > 0) {
            return { success: true, message: 'System roles already seeded' };
        }

        const systemRoles = [
            { name: 'Administrator', slug: 'admin', description: 'Full system access' },
            { name: 'Doctor', slug: 'doctor', description: 'Clinical access for physicians' },
            { name: 'Receptionist', slug: 'receptionist', description: 'Front desk and registration' },
            { name: 'Lab Technician', slug: 'lab_technician', description: 'Laboratory operations' },
            { name: 'Pharmacist', slug: 'pharmacist', description: 'Pharmacy operations' },
            { name: 'Finance Manager', slug: 'finance', description: 'Billing and financial operations' },
            { name: 'IPD Manager', slug: 'ipd_manager', description: 'Inpatient department management' },
            { name: 'Nurse', slug: 'nurse', description: 'Nursing and patient care' },
            { name: 'OPD Manager', slug: 'opd_manager', description: 'Outpatient department management' },
            { name: 'HR Manager', slug: 'hr', description: 'Human resources management' },
        ];

        for (const role of systemRoles) {
            await db.role.create({
                data: {
                    organizationId,
                    name: role.name,
                    slug: role.slug,
                    description: role.description,
                    is_system: true,
                    is_active: true,
                    permissions: SYSTEM_ROLE_PERMISSIONS[role.slug] || [],
                    data_scope: role.slug === 'admin' ? 'organization' : role.slug === 'doctor' ? 'own' : 'department',
                },
            });
        }

        return { success: true, message: 'System roles seeded successfully' };
    } catch (error: any) {
        console.error('seedSystemRoles error:', error);
        return { success: false, error: error.message };
    }
}

export async function cloneRole(sourceRoleId: string, newName: string, newSlug: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const source = await db.role.findFirst({
            where: { id: sourceRoleId },
        });
        if (!source) return { success: false, error: 'Source role not found' };

        const existing = await db.role.findFirst({
            where: { slug: newSlug },
        });
        if (existing) return { success: false, error: 'A role with this slug already exists' };

        const role = await db.role.create({
            data: {
                organizationId,
                name: newName,
                slug: newSlug,
                description: `Cloned from ${source.name}`,
                is_system: false,
                permissions: source.permissions,
                data_scope: source.data_scope,
            },
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'CLONE_ROLE',
                module: 'admin',
                entity_type: 'Role',
                entity_id: role.id,
                details: `Cloned role ${source.name} as ${newName}`,
                organizationId,
            },
        });

        revalidatePath('/admin/roles');
        return { success: true, data: role };
    } catch (error: any) {
        console.error('cloneRole error:', error);
        return { success: false, error: error.message };
    }
}
