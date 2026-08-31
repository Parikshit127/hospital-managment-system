/**
 * Environment lock for the background activity generator.
 *
 * The generator writes clinical-shaped records (patients, appointments, lab orders,
 * pharmacy indents) that are deliberately indistinguishable from real ones once
 * rendered. That is the point — and it is also the risk. This module is the single
 * gate that decides whether the engine is allowed to run at all, and against which
 * organization.
 *
 * Two conditions must BOTH hold. Either alone is inert:
 *
 *   1. SIM_ENABLED=1              — set only on the staging deploy.
 *   2. SIM_ORG_ID=<organizationId> — the one org the engine may write to.
 *
 * Deliberately NOT checked: the database hostname. Staging runs against a *clone*
 * of the production RDS instance, so a hostname test would either block the
 * legitimate deploy or give false comfort. A restored snapshot carries real
 * organization ids with it, which is why org identity is the boundary that matters.
 *
 * Every caller must pass the resolved org id through assertActivityTarget() before
 * opening a tenant client. Pair with getTenantPrisma(orgId), which auto-scopes reads
 * and writes, so a guarded call is structurally unable to touch another tenant.
 */

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

/** True when the environment permits the generator to run at all. */
export function isActivityGeneratorPermitted(): boolean {
    return process.env.SIM_ENABLED === '1' && !!process.env.SIM_ORG_ID?.trim();
}

/** The single organization id the environment permits, or null. */
export function permittedOrganizationId(): string | null {
    if (process.env.SIM_ENABLED !== '1') return null;
    const orgId = process.env.SIM_ORG_ID?.trim();
    return orgId || null;
}

/**
 * Throw unless the environment permits the generator to write to `orgId`.
 *
 * Call this before every write path — script entry points, the cron route, and any
 * future tick loop. It is cheap and idempotent; call it more often than feels
 * necessary rather than threading a "checked" flag around.
 */
export function assertActivityTarget(orgId: string): void {
    if (process.env.SIM_ENABLED !== '1') {
        throw new ActivityGeneratorDisabledError(
            'Refusing to run: SIM_ENABLED is not "1". The activity generator is ' +
            'inert outside a deploy that explicitly opts in.',
        );
    }

    const permitted = process.env.SIM_ORG_ID?.trim();
    if (!permitted) {
        throw new ActivityGeneratorDisabledError(
            'Refusing to run: SIM_ENABLED=1 but SIM_ORG_ID is unset. The engine has ' +
            'no designated organization to write to.',
        );
    }

    if (PROTECTED_ORG_IDS.has(permitted)) {
        throw new ActivityGeneratorDisabledError(
            `Refusing to run: SIM_ORG_ID is "${permitted}", which holds real clinical ` +
            'data. Point the generator at a dedicated organization.',
        );
    }

    if (!orgId?.trim()) {
        throw new ActivityGeneratorDisabledError('Refusing to run: no target organization id supplied.');
    }

    if (PROTECTED_ORG_IDS.has(orgId)) {
        throw new ActivityGeneratorDisabledError(
            `Refusing to run: "${orgId}" holds real clinical data.`,
        );
    }

    if (orgId !== permitted) {
        throw new ActivityGeneratorDisabledError(
            `Refusing to run: target organization "${orgId}" is not the permitted ` +
            `SIM_ORG_ID ("${permitted}").`,
        );
    }
}

/**
 * Resolve and validate the target organization in one step.
 * Convenience for script entry points: `const orgId = resolveActivityTarget();`
 */
export function resolveActivityTarget(): string {
    const orgId = process.env.SIM_ORG_ID?.trim() ?? '';
    assertActivityTarget(orgId);
    return orgId;
}

// ---------------------------------------------------------------------------
// Self-check:  npx tsx scripts/sim/guard.ts
// ---------------------------------------------------------------------------

function selfCheck(): void {
    const assert = (cond: boolean, msg: string) => {
        if (!cond) throw new Error(`guard self-check failed: ${msg}`);
    };
    const refuses = (orgId: string) => {
        try {
            assertActivityTarget(orgId);
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
        assert(refuses('any-org'), 'must refuse when SIM_ENABLED is unset');
        assert(!isActivityGeneratorPermitted(), 'must report not-permitted when unset');
        assert(permittedOrganizationId() === null, 'must resolve no org when unset');

        // Half-configured: opted in but no target.
        process.env.SIM_ENABLED = '1';
        assert(refuses('any-org'), 'must refuse when SIM_ORG_ID is unset');

        // The failure this guard exists to prevent: pointed at the live tenant.
        process.env.SIM_ORG_ID = 'org-axten-production';
        assert(refuses('org-axten-production'), 'must refuse a protected org id');

        // Correctly configured, but a caller passes a different org.
        process.env.SIM_ORG_ID = 'staging-activity-org';
        assert(refuses('some-other-org'), 'must refuse an org that is not SIM_ORG_ID');
        assert(refuses('org-axten-production'), 'must refuse a protected org even when permitted differs');

        // The one permitted path.
        assertActivityTarget('staging-activity-org');
        assert(isActivityGeneratorPermitted(), 'must report permitted when fully configured');
        assert(resolveActivityTarget() === 'staging-activity-org', 'must resolve the permitted org');

        console.log('guard.ts self-check passed');
    } finally {
        if (saved.enabled === undefined) delete process.env.SIM_ENABLED;
        else process.env.SIM_ENABLED = saved.enabled;
        if (saved.org === undefined) delete process.env.SIM_ORG_ID;
        else process.env.SIM_ORG_ID = saved.org;
    }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/sim/guard.ts')) selfCheck();
