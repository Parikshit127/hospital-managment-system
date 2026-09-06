'use server';

/**
 * Superadmin → Simulations.
 *
 * Every destructive action calls assertSimulationOrg() first, which refuses anything not
 * flagged as a simulation and refuses the protected real-hospital ids outright. That
 * check is the reason a "Delete environment" button can exist on this screen at all.
 *
 * This file is 'use server': only async functions may be exported from it.
 */
import { prisma } from '@/backend/db';
import { requireSuperAdmin } from '@/app/actions/superadmin-actions';
import { revalidatePath } from 'next/cache';
import { assertSimulationOrg, isActivityGeneratorPermitted, pinnedOrganizationId } from '@/scripts/sim/guard';
import { describeMasterData, masterDataCounts, syncMasterData } from '@/app/lib/sim-master-data';
import {
    provisionSimulation,
    resetSimulationData,
    deleteSimulationEnvironment,
    type DepartmentMode,
} from '@/app/lib/sim-provisioning';

async function audit(action: string, orgId: string, details: string) {
    const session = await requireSuperAdmin();
    await prisma.system_audit_logs.create({
        data: {
            action, module: 'superadmin', entity_type: 'simulation', entity_id: orgId,
            user_id: session.id, username: session.email, role: session.role, details,
        },
    });
}

/** Every simulation environment, with live counts and whatever is stopping it running. */
export async function listSimulations() {
    await requireSuperAdmin();
    try {
        const configs = await prisma.organizationConfig.findMany({
            where: { simulation_enabled: true },
            select: {
                organizationId: true,
                activity_generator_enabled: true,
                activity_generator_intensity: true,
                simulation_use_master_data: true,
                simulation_complaint_style: true,
                simulation_department_mode: true,
                simulation_source_org_id: true,
                simulation_master_synced_at: true,
            },
        });

        const envPermits = isActivityGeneratorPermitted();
        const pin = pinnedOrganizationId();

        // Every count is read across ALL simulations at once. Counting per organization
        // meant roughly eleven queries each, and DATABASE_URL pins connection_limit=1
        // (pgBouncer) — so they queued on one connection and the page died with a P2024
        // pool timeout before it rendered.
        const orgIds = configs.map(c => c.organizationId);
        const [orgs, patientRows, visitRows, invoiceRows, counts] = await Promise.all([
            prisma.organization.findMany({
                where: { id: { in: orgIds } },
                select: { id: true, name: true, code: true, is_active: true },
            }),
            prisma.oPD_REG.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: { in: orgIds } } }),
            prisma.appointments.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: { in: orgIds } } }),
            prisma.invoices.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: { in: orgIds } } }),
            masterDataCounts(orgIds),
        ]);
        const orgById = new Map(orgs.map(o => [o.id, o]));
        const tally = (rows: { organizationId: string; _count: number }[]) =>
            new Map(rows.map(r => [r.organizationId, r._count]));
        const patientsBy = tally(patientRows as any);
        const visitsBy = tally(visitRows as any);
        const invoicesBy = tally(invoiceRows as any);

        const rows = await Promise.all(configs.map(async (c) => {
            const org = orgById.get(c.organizationId);
            const patients = patientsBy.get(c.organizationId) ?? 0;
            const visits = visitsBy.get(c.organizationId) ?? 0;
            const invoices = invoicesBy.get(c.organizationId) ?? 0;
            const report = await describeMasterData(c.organizationId, counts[c.organizationId]);

            // Three things must agree before a tick does anything. Surface which one is
            // missing rather than leaving an operator staring at a switched-on toggle
            // that generates nothing.
            const blockers: string[] = [];
            if (!envPermits) blockers.push('SIM_ENABLED is not set on this server');
            if (pin && pin !== c.organizationId) blockers.push('this server is pinned to a different simulation');
            if (!c.activity_generator_enabled) blockers.push('generation is switched off');

            return {
                orgId: c.organizationId,
                name: org?.name ?? 'Unknown',
                code: org?.code ?? '',
                running: c.activity_generator_enabled && envPermits && (!pin || pin === c.organizationId),
                enabled: c.activity_generator_enabled,
                intensity: c.activity_generator_intensity,
                useMasterData: c.simulation_use_master_data,
                complaintStyle: c.simulation_complaint_style,
                departmentMode: c.simulation_department_mode,
                sourceName: report.sourceName,
                lastSyncedAt: c.simulation_master_synced_at?.toISOString() ?? null,
                counts: { patients, visits, invoices, ...report.counts },
                warnings: report.warnings,
                blockers,
            };
        }));

        rows.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, data: rows };
    } catch (err: any) {
        console.error('listSimulations error:', err);
        return { success: false, error: 'Failed to list simulations' };
    }
}

/** Hospitals that can be cloned, with enough detail to judge whether it is worth it. */
export async function listHospitalsForCloning() {
    await requireSuperAdmin();
    try {
        const orgs = await prisma.organization.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, code: true, config: { select: { simulation_enabled: true } } },
        });

        // Same reasoning as listSimulations: one grouped query per table, not five per
        // hospital. With connection_limit=1 the per-hospital fan-out timed out.
        const candidates = orgs.filter(o => !o.config?.simulation_enabled);
        const ids = { in: candidates.map(o => o.id) };
        const [staffRows, doctorRows, labRows, medRows, svcRows] = await Promise.all([
            prisma.user.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: ids, is_active: true } }),
            prisma.user.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: ids, role: 'doctor', is_active: true } }),
            prisma.lab_test_inventory.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: ids } }),
            prisma.pharmacy_medicine_master.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: ids } }),
            prisma.ipdServiceMaster.groupBy({ by: ['organizationId'], _count: true, where: { organizationId: ids } }),
        ]);
        const tally = (rows: any[]) => new Map(rows.map(r => [r.organizationId, r._count as number]));
        const staffBy = tally(staffRows), doctorsBy = tally(doctorRows);
        const labBy = tally(labRows), medBy = tally(medRows), svcBy = tally(svcRows);

        const rows = candidates.map(o => ({
            id: o.id, name: o.name, code: o.code,
            staff: staffBy.get(o.id) ?? 0,
            doctors: doctorsBy.get(o.id) ?? 0,
            labTests: labBy.get(o.id) ?? 0,
            medicines: medBy.get(o.id) ?? 0,
            services: svcBy.get(o.id) ?? 0,
        }));

        return { success: true, data: rows };
    } catch (err: any) {
        console.error('listHospitalsForCloning error:', err);
        return { success: false, error: 'Failed to list hospitals' };
    }
}

export async function createSimulation(input: {
    name: string;
    slug: string;
    code: string;
    sourceOrgId: string | null;
    useMasterData: boolean;
    complaintStyle: string;
    departmentMode: DepartmentMode;
}) {
    const session = await requireSuperAdmin();
    try {
        if (!input.name?.trim() || !input.slug?.trim() || !input.code?.trim()) {
            return { success: false, error: 'Name, slug and code are required' };
        }
        const result = await provisionSimulation({
            name: input.name.trim(),
            slug: input.slug.trim().toLowerCase(),
            code: input.code.trim().toUpperCase(),
            sourceOrgId: input.sourceOrgId,
            useMasterData: input.useMasterData,
            complaintStyle: input.complaintStyle || 'general',
            departmentMode: input.departmentMode || 'clone',
            actor: { id: session.id, username: session.email, role: session.role },
        });
        revalidatePath('/superadmin/simulations');
        return { success: true, data: result };
    } catch (err: any) {
        console.error('createSimulation error:', err);
        const known = ['Organization slug already exists', 'Organization code already exists', 'Source hospital not found'];
        return { success: false, error: known.includes(err.message) ? err.message : 'Failed to create simulation' };
    }
}

export async function setSimulationRunning(orgId: string, running: boolean) {
    await requireSuperAdmin();
    try {
        await assertSimulationOrg(orgId);
        await prisma.organizationConfig.update({
            where: { organizationId: orgId },
            data: { activity_generator_enabled: running },
        });
        await audit(running ? 'START_SIMULATION' : 'PAUSE_SIMULATION', orgId, running ? 'Generation started' : 'Generation paused');
        revalidatePath('/superadmin/simulations');
        return { success: true };
    } catch (err: any) {
        console.error('setSimulationRunning error:', err);
        return { success: false, error: err.message || 'Failed to change state' };
    }
}

export async function updateSimulationSettings(orgId: string, settings: {
    intensity?: string;
    useMasterData?: boolean;
    complaintStyle?: string;
    departmentMode?: DepartmentMode;
}) {
    await requireSuperAdmin();
    try {
        await assertSimulationOrg(orgId);
        const intensity = ['low', 'moderate', 'high'].includes(settings.intensity ?? '')
            ? settings.intensity : undefined;
        const style = ['general', 'ayurvedic'].includes(settings.complaintStyle ?? '')
            ? settings.complaintStyle : undefined;
        const mode = ['clone', 'default', 'none'].includes(settings.departmentMode ?? '')
            ? settings.departmentMode : undefined;

        await prisma.organizationConfig.update({
            where: { organizationId: orgId },
            data: {
                ...(intensity ? { activity_generator_intensity: intensity } : {}),
                ...(settings.useMasterData !== undefined ? { simulation_use_master_data: settings.useMasterData } : {}),
                ...(style ? { simulation_complaint_style: style } : {}),
                ...(mode ? { simulation_department_mode: mode } : {}),
            },
        });
        revalidatePath('/superadmin/simulations');
        return { success: true };
    } catch (err: any) {
        console.error('updateSimulationSettings error:', err);
        return { success: false, error: err.message || 'Failed to save settings' };
    }
}

/** Pull master-data changes from the source hospital immediately. */
export async function syncSimulationMasterData(orgId: string) {
    await requireSuperAdmin();
    try {
        await assertSimulationOrg(orgId);
        const config = await prisma.organizationConfig.findUnique({
            where: { organizationId: orgId },
            select: { simulation_source_org_id: true, simulation_department_mode: true },
        });
        if (!config?.simulation_source_org_id) {
            return { success: false, error: 'This simulation was not cloned from a hospital, so there is nothing to sync.' };
        }
        const result = await syncMasterData(orgId, config.simulation_source_org_id, {
            departmentMode: (config.simulation_department_mode as DepartmentMode) ?? 'clone',
        });
        await audit('SYNC_SIMULATION_MASTER_DATA', orgId, 'Master data synced from source hospital');
        revalidatePath('/superadmin/simulations');
        return { success: true, data: result };
    } catch (err: any) {
        console.error('syncSimulationMasterData error:', err);
        return { success: false, error: err.message || 'Sync failed' };
    }
}

/** Clear generated activity, keep the environment. */
export async function resetSimulation(orgId: string) {
    await requireSuperAdmin();
    try {
        await resetSimulationData(orgId);
        await audit('RESET_SIMULATION', orgId, 'Generated data cleared');
        revalidatePath('/superadmin/simulations');
        return { success: true };
    } catch (err: any) {
        console.error('resetSimulation error:', err);
        return { success: false, error: err.message || 'Reset failed' };
    }
}

/** Remove the environment entirely. Guarded, audited, and confirmed in the UI. */
export async function deleteSimulation(orgId: string) {
    await requireSuperAdmin();
    try {
        const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
        await audit('DELETE_SIMULATION', orgId, `Deleted simulation environment "${org?.name ?? orgId}"`);
        await deleteSimulationEnvironment(orgId);
        revalidatePath('/superadmin/simulations');
        return { success: true };
    } catch (err: any) {
        console.error('deleteSimulation error:', err);
        return { success: false, error: err.message || 'Delete failed' };
    }
}
