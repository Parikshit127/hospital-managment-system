'use server';

import { requireTenantContext } from '@/backend/tenant';

// ============================================
// BRANCH MANAGEMENT SERVER ACTIONS
// ============================================

export interface BranchInput {
    branch_name: string;
    branch_code: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    is_main_branch?: boolean;
    latitude?: number | null;
    longitude?: number | null;
}

// List all branches for the current tenant
export async function listBranches() {
    try {
        const { db } = await requireTenantContext();

        const branches = await db.branch.findMany({
            orderBy: [
                { is_main_branch: 'desc' },
                { branch_name: 'asc' },
            ],
        });

        return { success: true, data: branches };
    } catch (error: any) {
        console.error('listBranches error:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// Create a new branch
export async function createBranch(data: BranchInput) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // If marking as main branch, unset any existing main branch
        if (data.is_main_branch) {
            await db.branch.updateMany({
                where: { is_main_branch: true },
                data: { is_main_branch: false },
            });
        }

        const branch = await db.branch.create({
            data: {
                branch_name: data.branch_name,
                branch_code: data.branch_code.toUpperCase(),
                address: data.address || null,
                city: data.city || null,
                state: data.state || null,
                pincode: data.pincode || null,
                phone: data.phone || null,
                email: data.email || null,
                is_main_branch: data.is_main_branch || false,
                latitude: data.latitude ?? null,
                longitude: data.longitude ?? null,
            },
        });

        // Audit log
        try {
            await db.system_audit_logs.create({
                data: {
                    user_id: session.id,
                    username: session.username,
                    role: session.role,
                    action: 'CREATE_BRANCH',
                    module: 'admin',
                    entity_type: 'Branch',
                    entity_id: branch.id,
                    details: `Created branch "${data.branch_name}" (${data.branch_code})`,
                    organizationId,
                },
            });
        } catch (auditErr) {
            console.error('Audit log error (non-blocking):', auditErr);
        }

        return { success: true, data: branch };
    } catch (error: any) {
        console.error('createBranch error:', error);
        return { success: false, error: error.message };
    }
}

// Update an existing branch
export async function updateBranch(id: string, data: Partial<BranchInput>) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // If marking as main branch, unset any existing main branch
        if (data.is_main_branch) {
            await db.branch.updateMany({
                where: { is_main_branch: true, id: { not: id } },
                data: { is_main_branch: false },
            });
        }

        const updateData: any = {};
        if (data.branch_name !== undefined) updateData.branch_name = data.branch_name;
        if (data.branch_code !== undefined) updateData.branch_code = data.branch_code.toUpperCase();
        if (data.address !== undefined) updateData.address = data.address || null;
        if (data.city !== undefined) updateData.city = data.city || null;
        if (data.state !== undefined) updateData.state = data.state || null;
        if (data.pincode !== undefined) updateData.pincode = data.pincode || null;
        if (data.phone !== undefined) updateData.phone = data.phone || null;
        if (data.email !== undefined) updateData.email = data.email || null;
        if (data.is_main_branch !== undefined) updateData.is_main_branch = data.is_main_branch;
        if (data.latitude !== undefined) updateData.latitude = data.latitude ?? null;
        if (data.longitude !== undefined) updateData.longitude = data.longitude ?? null;

        const branch = await db.branch.update({
            where: { id },
            data: updateData,
        });

        // Audit log
        try {
            await db.system_audit_logs.create({
                data: {
                    user_id: session.id,
                    username: session.username,
                    role: session.role,
                    action: 'UPDATE_BRANCH',
                    module: 'admin',
                    entity_type: 'Branch',
                    entity_id: id,
                    details: `Updated branch "${branch.branch_name}" (${branch.branch_code})`,
                    organizationId,
                },
            });
        } catch (auditErr) {
            console.error('Audit log error (non-blocking):', auditErr);
        }

        return { success: true, data: branch };
    } catch (error: any) {
        console.error('updateBranch error:', error);
        return { success: false, error: error.message };
    }
}

// Toggle branch active/inactive
export async function toggleBranch(id: string) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // Find current branch
        const current = await db.branch.findFirst({ where: { id } });
        if (!current) {
            return { success: false, error: 'Branch not found' };
        }

        // Prevent deactivating main branch
        if (current.is_main_branch && current.is_active) {
            return { success: false, error: 'Cannot deactivate the main branch' };
        }

        const branch = await db.branch.update({
            where: { id },
            data: { is_active: !current.is_active },
        });

        // Audit log
        try {
            await db.system_audit_logs.create({
                data: {
                    user_id: session.id,
                    username: session.username,
                    role: session.role,
                    action: branch.is_active ? 'ACTIVATE_BRANCH' : 'DEACTIVATE_BRANCH',
                    module: 'admin',
                    entity_type: 'Branch',
                    entity_id: id,
                    details: `${branch.is_active ? 'Activated' : 'Deactivated'} branch "${branch.branch_name}"`,
                    organizationId,
                },
            });
        } catch (auditErr) {
            console.error('Audit log error (non-blocking):', auditErr);
        }

        return { success: true, data: branch };
    } catch (error: any) {
        console.error('toggleBranch error:', error);
        return { success: false, error: error.message };
    }
}

// Delete a branch (only if not main branch)
export async function deleteBranch(id: string) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // Find current branch
        const current = await db.branch.findFirst({ where: { id } });
        if (!current) {
            return { success: false, error: 'Branch not found' };
        }

        // Prevent deleting main branch
        if (current.is_main_branch) {
            return { success: false, error: 'Cannot delete the main branch. Assign another branch as main first.' };
        }

        await db.branch.delete({ where: { id } });

        // Audit log
        try {
            await db.system_audit_logs.create({
                data: {
                    user_id: session.id,
                    username: session.username,
                    role: session.role,
                    action: 'DELETE_BRANCH',
                    module: 'admin',
                    entity_type: 'Branch',
                    entity_id: id,
                    details: `Deleted branch "${current.branch_name}" (${current.branch_code})`,
                    organizationId,
                },
            });
        } catch (auditErr) {
            console.error('Audit log error (non-blocking):', auditErr);
        }

        return { success: true };
    } catch (error: any) {
        console.error('deleteBranch error:', error);
        return { success: false, error: error.message };
    }
}
