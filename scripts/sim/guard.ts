/**
 * Environment lock for the background activity generator.
 *
 * The generator writes clinical-shaped records (patients, appointments, lab orders,
 * pharmacy indents) that are deliberately indistinguishable from real ones once
 * rendered. That is the point — and it is also the risk. This module is the single
 * gate that decides whether the engine is allowed to run at all, and against which
 * organization.
 *
 * THREE conditions must all hold. Any one of them failing stops the engine:
 *
 *   1. SIM_ENABLED=1 in the environment — the master switch, absent on every real
 *      deploy, so the engine simply cannot run there whatever the database says.
 *   2. The target organization's config has simulation_enabled = true — set once at
 *      provisioning by a superadmin, which is what allows more than one simulation
 *      environment to exist without pinning a UUID into the deploy environment.
 *   3. The target is not on PROTECTED_ORG_IDS below.
 *
 * SIM_ORG_ID is still honoured as an optional pin: set it and the engine is restricted
 * to that one organization even if others carry the flag. Leave it unset and every
 * flagged organization is eligible.
 *
 * Deliberately NOT checked: the database hostname. Staging runs against a *clone*
 * of the production RDS instance, so a hostname test would either block the
 * legitimate deploy or give false comfort. A restored snapshot carries real
 * organization ids AND their config rows with it — which is exactly why condition 3
 * exists independently of condition 2.
 *
 * Every caller must await assertActivityTarget() before opening a tenant client. Pair
 * with getTenantPrisma(orgId), which auto-scopes reads and writes, so a guarded call is
 * structurally unable to touch another tenant.
 */
import { prisma } from '@/backend/db';

/**
 * Organizations known to hold real clinical data. The generator must never target
 * these, even on a clone — a snapshot restore preserves these ids verbatim, so the
 * id alone is not evidence of which database you are pointed at.
 *
 * Add to this list whenever a real tenant is onboarded.
 */
const PROTECTED_ORG_IDS: ReadonlySet<string> = new Set([
    'org-axten-production',
]);

export class ActivityGeneratorDisabledError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ActivityGeneratorDisabledError';
    }
}

/** True when the deploy environment permits the generator to run at all. */
export function isActivityGeneratorPermitted(): boolean {
    return process.env.SIM_ENABLED === '1';
}

/** The optional single-organization pin, or null when the engine is unpinned. */
export function pinnedOrganizationId(): string | null {
    if (process.env.SIM_ENABLED !== '1') return null;
    return process.env.SIM_ORG_ID?.trim() || null;
}

/**
 * Every organization the engine may currently write to.
 *
 * Used by scripts and by the Superadmin config readout. Returns [] whenever the
 * environment has not opted in, so a real deploy reports "nothing eligible" rather
 * than leaking a list of flagged orgs.
 */
export async function eligibleOrganizationIds(): Promise<string[]> {
    if (process.env.SIM_ENABLED !== '1') return [];
    const pin = pinnedOrganizationId();
    const rows = await prisma.organizationConfig.findMany({
        where: { simulation_enabled: true },
        select: { organizationId: true },
    });
    return rows
        .map(r => r.organizationId)
        .filter(id => !PROTECTED_ORG_IDS.has(id))
        .filter(id => !pin || id === pin);
}

/**
 * Throw unless the engine is permitted to write to `orgId`.
 *
 * Call before every write path — script entry points, the cron route, any tick loop.
 * It is cheap and idempotent; call it more often than feels necessary rather than
 * threading a "checked" flag around.
 */
export async function assertActivityTarget(orgId: string): Promise<void> {
    if (process.env.SIM_ENABLED !== '1') {
        throw new ActivityGeneratorDisabledError(
            'Refusing to run: SIM_ENABLED is not "1". The activity generator is ' +
            'inert outside a deploy that explicitly opts in.',
        );
    }

    if (!orgId?.trim()) {
        throw new ActivityGeneratorDisabledError('Refusing to run: no target organization id supplied.');
    }

    // Checked before the config lookup and independently of it. A restored production
    // snapshot brings both the organization and its config row along, so a flag alone
    // must never be able to authorise writing to a real hospital's tenant.
    if (PROTECTED_ORG_IDS.has(orgId)) {
        throw new ActivityGeneratorDisabledError(
            `Refusing to run: "${orgId}" holds real clinical data.`,
        );
    }

    const pin = pinnedOrganizationId();
    if (pin && orgId !== pin) {
        throw new ActivityGeneratorDisabledError(
            `Refusing to run: this deploy is pinned to SIM_ORG_ID "${pin}", ` +
            `so it will not write to "${orgId}".`,
        );
    }

    const config = await prisma.organizationConfig.findUnique({
        where: { organizationId: orgId },
        select: { simulation_enabled: true },
    });

    if (!config?.simulation_enabled) {
        throw new ActivityGeneratorDisabledError(
            `Refusing to run: organization "${orgId}" is not marked as a simulation ` +
            'environment. Provision it via Superadmin → Add Hospital with ' +
            '"Create as Simulation Environment" enabled.',
        );
    }
}

/**
 * Throw unless `orgId` is a simulation environment safe to administer.
 *
 * Used by the Superadmin management actions — reset, delete, start, stop — which must be
 * usable on a machine where the engine itself is switched off. It therefore does NOT
 * require SIM_ENABLED: you should be able to tear down an environment without first
 * enabling generation. What it does enforce is the part that actually matters — the
 * target is flagged as a simulation, and is not one of the organizations holding real
 * clinical data.
 */
export async function assertSimulationOrg(orgId: string): Promise<void> {
    if (!orgId?.trim()) {
        throw new ActivityGeneratorDisabledError('No organization id supplied.');
    }
    if (PROTECTED_ORG_IDS.has(orgId)) {
        throw new ActivityGeneratorDisabledError(
            `Refusing: "${orgId}" holds real clinical data.`,
        );
    }
    const config = await prisma.organizationConfig.findUnique({
        where: { organizationId: orgId },
        select: { simulation_enabled: true },
    });
    if (!config?.simulation_enabled) {
        throw new ActivityGeneratorDisabledError(
            `Refusing: "${orgId}" is not a simulation environment. This action only ever ` +
            'operates on organizations created as simulations.',
        );
    }
}

/**
 * Resolve and validate a target organization in one step.
 *
 * Uses SIM_ORG_ID when pinned; otherwise the single eligible organization. Throws when
 * several are eligible, because silently picking one would make it unclear which
 * environment a script just wrote to.
 */
export async function resolveActivityTarget(): Promise<string> {
    const pin = pinnedOrganizationId();
    if (pin) {
        await assertActivityTarget(pin);
        return pin;
    }

    const eligible = await eligibleOrganizationIds();
    if (eligible.length === 0) {
        throw new ActivityGeneratorDisabledError(
            'Refusing to run: no organization is marked as a simulation environment ' +
            '(or SIM_ENABLED is not "1").',
        );
    }
    if (eligible.length > 1) {
        throw new ActivityGeneratorDisabledError(
            `Refusing to run: ${eligible.length} simulation environments are eligible ` +
            `(${eligible.join(', ')}). Set SIM_ORG_ID to choose one.`,
        );
    }
    await assertActivityTarget(eligible[0]);
    return eligible[0];
}

// ---------------------------------------------------------------------------
// Self-check:  npx tsx scripts/sim/guard.ts
// ---------------------------------------------------------------------------

/**
 * Covers every refusal that happens BEFORE the database is consulted — which is all of
 * the security-critical ones. Acceptance of a correctly flagged organization needs a
 * real config row and is asserted in scratch/t-provision.ts instead.
 */
async function selfCheck(): Promise<void> {
    const assert = (cond: boolean, msg: string) => {
        if (!cond) throw new Error(`guard self-check failed: ${msg}`);
    };
    const refuses = async (orgId: string) => {
        try {
            await assertActivityTarget(orgId);
            return false;
        } catch (e) {
            return e instanceof ActivityGeneratorDisabledError;
        }
    };

    const saved = { enabled: process.env.SIM_ENABLED, org: process.env.SIM_ORG_ID };
    try {
        // Nothing set at all — the state of every real deploy.
        delete process.env.SIM_ENABLED;
        delete process.env.SIM_ORG_ID;
        assert(await refuses('any-org'), 'must refuse when SIM_ENABLED is unset');
        assert(!isActivityGeneratorPermitted(), 'must report not-permitted when unset');
        assert(pinnedOrganizationId() === null, 'must report no pin when unset');
        assert((await eligibleOrganizationIds()).length === 0, 'must list nothing eligible when unset');

        process.env.SIM_ENABLED = '1';

        // Empty target.
        assert(await refuses(''), 'must refuse an empty organization id');

        // The failure this guard exists to prevent. Checked before the config lookup, so
        // a restored production snapshot carrying a simulation_enabled row cannot
        // authorise writing to the real tenant.
        assert(await refuses('org-axten-production'), 'must refuse a protected org id');
        process.env.SIM_ORG_ID = 'org-axten-production';
        assert(await refuses('org-axten-production'), 'must refuse a protected org even when pinned to it');
        assert(
            !(await eligibleOrganizationIds()).includes('org-axten-production'),
            'protected org must never appear as eligible',
        );

        // Pinned deploy must not write to a different organization.
        process.env.SIM_ORG_ID = 'pinned-sim-org';
        assert(await refuses('some-other-org'), 'must refuse an org that is not the SIM_ORG_ID pin');

        // Unpinned, but the organization is not flagged as a simulation environment.
        delete process.env.SIM_ORG_ID;
        assert(await refuses('definitely-not-a-sim-org-' + Date.now()), 'must refuse an unflagged org');

        console.log('guard.ts self-check passed (pre-database refusals)');
    } finally {
        if (saved.enabled === undefined) delete process.env.SIM_ENABLED;
        else process.env.SIM_ENABLED = saved.enabled;
        if (saved.org === undefined) delete process.env.SIM_ORG_ID;
        else process.env.SIM_ORG_ID = saved.org;
    }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/sim/guard.ts')) {
    selfCheck().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
