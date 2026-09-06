/**
 * Provisioning and teardown for simulation environments.
 *
 * Shared by the Add Hospital wizard and the Simulations page so both create an identical
 * environment — previously the clone logic lived inside createOrganization() and could
 * only be reached through the wizard.
 *
 * Plain library. Never add 'use server' — it exports constants and types.
 */
import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { syncMasterData, syncDepartmentsOnly, assignWorkstationIps } from '@/app/lib/sim-master-data';
import { assertSimulationOrg } from '@/scripts/sim/guard';

/**
 * Cloned staff share one known credential.
 *
 * Source password hashes are deliberately never copied: those same accounts exist with
 * the same password on the production database a staging box is cloned from, so copying
 * them would hand working credentials for real employees to whoever uses the environment.
 */
export const SIMULATION_STAFF_PASSWORD = 'user@123';
/**
 * Login prefix for a simulation's cloned staff.
 *
 * Per environment, not global. User.username is unique across the WHOLE database, so a
 * single 'sim.' prefix meant the SECOND simulation cloned from a hospital found every
 * name taken, cloned zero staff and generated nothing at all — silently, because
 * cloneStaffInto skips collisions rather than failing. Keying on the environment's own
 * code lets one hospital back several simulations at once, and matches the mgh.* naming
 * the bootstrap script already uses.
 */
export function simulationUsernamePrefix(code: string): string {
    return `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}.`;
}

export type DepartmentMode = 'clone' | 'default' | 'none';

/** Departments used when a simulation is provisioned with departmentMode 'default'. */
const DEFAULT_DEPARTMENTS = [
    { name: 'General Medicine', fee: 600 },
    { name: 'Paediatrics', fee: 750 },
    { name: 'Orthopaedics', fee: 1000 },
    { name: 'Obstetrics & Gynaecology', fee: 900 },
    { name: 'Emergency', fee: 1500 },
];

/**
 * Copy every active user from one organization into another.
 *
 * Deliberately NOT run inside a transaction, and deliberately batched. A hospital with
 * fifty staff was doing a findUnique plus a create for each one — a hundred round trips
 * over the pooler, which blew straight through Prisma's interactive-transaction timeout
 * (P2028). One query to find taken usernames, one batched insert.
 */
export async function cloneStaffInto(
    client: any,
    sourceOrgId: string,
    targetOrgId: string,
    prefix: string,
): Promise<number> {
    const sourceStaff = await client.user.findMany({
        where: { organizationId: sourceOrgId, is_active: true },
    });
    if (!sourceStaff.length) return 0;

    const simPassword = await bcrypt.hash(SIMULATION_STAFF_PASSWORD, 10);
    const wanted = sourceStaff.map((u: any) => `${prefix}${u.username}`);

    // Usernames are globally unique. Skip the ones already taken rather than aborting, so
    // re-cloning from a source already used does not lose the whole batch.
    const taken = new Set(
        (await client.user.findMany({
            where: { username: { in: wanted } },
            select: { username: true },
        })).map((r: any) => r.username),
    );

    const rows = sourceStaff
        .filter((u: any) => !taken.has(`${prefix}${u.username}`))
        .map((u: any) => buildClone(u, simPassword, targetOrgId, prefix));

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
        await client.user.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    }
    return rows.length;
}

function buildClone(u: any, password: string, targetOrgId: string, prefix: string) {
    return {
                username: `${prefix}${u.username}`,
                password,
                role: u.role,
                name: u.name,
                specialty: u.specialty,
                designation: u.designation,
                department: u.department,
                gender: u.gender,
                qualifications: u.qualifications,
                // Shift data drives the engine's login/logout timing and on-duty
                // attribution — see app/lib/sim-staff.ts.
                working_hours: u.working_hours,
                working_days: u.working_days,
                slot_duration: u.slot_duration,
                max_patients_per_day: u.max_patients_per_day,
                max_overbooking_per_slot: u.max_overbooking_per_slot,
                // Fees drive generated OPD billing amounts.
                consultation_fee: u.consultation_fee,
                follow_up_fee: u.follow_up_fee,
                // Dropped: real contact details, so nothing the engine does can reach an
                // actual member of staff by SMS, WhatsApp or email.
                email: null,
                phone: null,
                // Dropped: foreign keys into the SOURCE organization's wards, branches and
                // reporting lines. Copying them would point simulated staff at another
                // hospital's rows.
                branch_id: null,
                assigned_ward_id: null,
                supervisor_id: null,
                doctor_group_id: null,
                // Dropped: identifiers belonging to a real person.
                employee_code: null,
                doctor_registration_no: null,
                organizationId: targetOrgId,
                is_active: true,
    };
}

export interface ProvisionParams {
    name: string;
    slug: string;
    code: string;
    sourceOrgId: string | null;
    useMasterData: boolean;
    complaintStyle: string;
    departmentMode: DepartmentMode;
    actor: { id: string; username: string; role: string };
}

export interface ProvisionResult {
    orgId: string;
    clonedStaff: number;
    sourceName: string | null;
    masterData: Record<string, { created: number; updated: number; retired: number }> | null;
    password: string;
    usernamePrefix: string;
}

/**
 * Create a simulation environment, optionally cloned from a real hospital.
 *
 * The organization, config, branding and staff are created inside one transaction so a
 * failure leaves nothing half-built. The master-data copy runs AFTER it commits, on
 * purpose: a large formulary is several thousand rows and would blow through an
 * interactive transaction's timeout.
 */
export async function provisionSimulation(params: ProvisionParams): Promise<ProvisionResult> {
    const { name, slug, code, sourceOrgId, useMasterData, complaintStyle, departmentMode, actor } = params;
    const usernamePrefix = simulationUsernamePrefix(code);

    const created = await prisma.$transaction(async (tx) => {
        if (await tx.organization.findUnique({ where: { slug } })) {
            throw new Error('Organization slug already exists');
        }
        if (await tx.organization.findUnique({ where: { code } })) {
            throw new Error('Organization code already exists');
        }

        let source: { id: string; name: string } | null = null;
        if (sourceOrgId) {
            source = await tx.organization.findUnique({
                where: { id: sourceOrgId },
                select: { id: true, name: true },
            });
            if (!source) throw new Error('Source hospital not found');
        }

        const org = await tx.organization.create({
            data: { name, slug, code, plan: 'enterprise', is_active: true },
        });

        await tx.organizationConfig.create({
            data: {
                organizationId: org.id,
                uhid_prefix: code,
                simulation_enabled: true,
                simulation_source_org_id: source?.id ?? null,
                simulation_use_master_data: useMasterData,
                simulation_complaint_style: complaintStyle,
                simulation_department_mode: departmentMode,
                // Provisioning marks the environment but never starts the engine — that
                // stays a deliberate, separate action.
                activity_generator_enabled: false,
            },
        });

        await tx.organizationBranding.create({
            data: { organizationId: org.id, portal_title: name, portal_subtitle: 'Hospital Information System' },
        });

        if (departmentMode === 'default') {
            for (const d of DEFAULT_DEPARTMENTS) {
                await tx.department.create({
                    data: {
                        name: d.name,
                        slug: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                        base_consultation_fee: d.fee,
                        organizationId: org.id,
                        is_active: true,
                    },
                });
            }
        }

        await tx.system_audit_logs.create({
            data: {
                action: 'CREATE_SIMULATION_ORGANIZATION',
                module: 'superadmin',
                entity_type: 'organization',
                entity_id: org.id,
                user_id: actor.id,
                username: actor.username,
                role: actor.role,
                details: source
                    ? `Created simulation "${name}" cloned from ${source.name}`
                    : `Created blank simulation "${name}"`,
            },
        });

        return { org, sourceName: source?.name ?? null };
    });

    // Staff and master data are copied OUTSIDE the transaction. Both are large — fifty
    // staff and a several-thousand-line formulary — and doing either inside blew through
    // Prisma's interactive-transaction timeout (P2028). The transaction now covers only
    // the organization's identity, which is what actually needs to be atomic: it is where
    // the slug and code uniqueness checks live.
    //
    // The trade is that a failure here leaves a half-built environment, so tear it down
    // rather than leaving something broken on the Simulations page.
    let clonedStaff = 0;
    let masterData: ProvisionResult['masterData'] = null;
    try {
        if (sourceOrgId) {
            clonedStaff = await cloneStaffInto(prisma, sourceOrgId, created.org.id, usernamePrefix);
            // Each simulated user inherits the EXACT address its real counterpart last
            // connected from, so the audit trail reads like the hospital's own network.
            // Only staff with no history fall back to a generated address in the same
            // ranges — see assignWorkstationIps().
            await assignWorkstationIps(created.org.id, sourceOrgId, usernamePrefix);
        }
        if (sourceOrgId && useMasterData) {
            masterData = await syncMasterData(created.org.id, sourceOrgId, { departmentMode });
        } else if (sourceOrgId && departmentMode === 'clone') {
            // Departments were asked for explicitly, so honour that even though the rest of
            // the master data is not being copied.
            await syncDepartmentsOnly(created.org.id, sourceOrgId);
        }
    } catch (err) {
        await deleteSimulationEnvironment(created.org.id).catch(() => { /* best effort */ });
        throw err;
    }

    return {
        orgId: created.org.id,
        clonedStaff,
        sourceName: created.sourceName,
        masterData,
        password: SIMULATION_STAFF_PASSWORD,
        usernamePrefix,
    };
}

/**
 * Delete everything the engine generated, leaving the environment itself standing.
 *
 * Order matters — children before parents, or the foreign keys reject the delete. Beds
 * go back to Available with their cleaning stamps cleared, or the next run finds them
 * Occupied against admissions that no longer exist.
 */
export async function resetSimulationData(orgId: string): Promise<void> {
    await assertSimulationOrg(orgId);
    const o = { organizationId: orgId };

    await prisma.gL_JournalLine.deleteMany({ where: o });
    await prisma.gL_JournalEntry.deleteMany({ where: o });
    await prisma.insurance_claims.deleteMany({ where: o });
    await prisma.insurance_policies.deleteMany({ where: o });
    await prisma.patientDeposit.deleteMany({ where: o });
    await prisma.medicationAdministration.deleteMany({ where: o });
    await prisma.activeMedication.deleteMany({ where: o });
    await prisma.nursingNote.deleteMany({ where: o });
    await prisma.iPDVitals.deleteMany({ where: o });
    await prisma.vital_signs.deleteMany({ where: o });
    await prisma.triage_results.deleteMany({ where: o });
    await prisma.payments.deleteMany({ where: o });
    await prisma.invoice_items.deleteMany({ where: o });
    await prisma.invoices.deleteMany({ where: o });
    await prisma.discharge_summaries.deleteMany({ where: o });
    // The dispense ledger is generated activity and points at both the batch it came
    // from and the medicine — leaving it behind blocked the medicine delete on teardown.
    await prisma.pharmacyInventoryMovement.deleteMany({ where: o });
    await prisma.pharmacy_order_items.deleteMany({ where: { order: { organizationId: orgId } } });
    await prisma.pharmacy_orders.deleteMany({ where: o });
    await prisma.lab_orders.deleteMany({ where: o });
    await prisma.admissions.deleteMany({ where: o });
    await prisma.appointments.deleteMany({ where: o });
    await prisma.oPD_REG.deleteMany({ where: o });
    await prisma.system_audit_logs.deleteMany({ where: o });

    await prisma.beds.updateMany({
        where: o,
        data: { status: 'Available', cleaning_started_at: null, cleaning_completed_at: null, last_occupied_by: null },
    });

    // A reset can never leave the engine running.
    await prisma.organizationConfig.updateMany({
        where: o,
        data: { activity_generator_enabled: false },
    });
}

/**
 * Remove the environment entirely — generated data, master data, staff and the
 * organization itself. Only ever reachable for an org the guard accepts.
 */
export async function deleteSimulationEnvironment(orgId: string): Promise<void> {
    await assertSimulationOrg(orgId);
    await resetSimulationData(orgId);

    const o = { organizationId: orgId };
    await prisma.ipdPackageTpaRate.deleteMany({ where: o });
    await prisma.ipdPackage.deleteMany({ where: o });
    await prisma.ipdServiceMaster.deleteMany({ where: o });
    await prisma.radiology_imaging.deleteMany({ where: o });
    await prisma.lab_test_inventory.deleteMany({ where: o });
    // Batches are scoped through their medicine, not by organizationId, and hold the FK
    // that makes the delete below fail if they are still standing.
    await prisma.pharmacy_batch_inventory.deleteMany({ where: { medicine: { organizationId: orgId } } });
    await prisma.pharmacy_medicine_master.deleteMany({ where: o });
    await prisma.beds.deleteMany({ where: o });
    await prisma.wards.deleteMany({ where: o });
    await prisma.department.deleteMany({ where: o });
    await prisma.user.deleteMany({ where: o });
    await prisma.organizationBranding.deleteMany({ where: o });
    await prisma.organizationConfig.deleteMany({ where: o });
    await prisma.organization.delete({ where: { id: orgId } });
}
