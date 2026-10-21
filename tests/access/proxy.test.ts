/**
 * Exercises the real proxy.ts. Two promises:
 *   1. A session WITHOUT access claims (every unit that is not in `enforce` mode) is gated exactly as it always was.
 *   2. A session WITH claims is gated by module membership instead.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';

process.env.JWT_SECRET = 'proxy-test-secret';
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

let proxy: (req: NextRequest) => Promise<Response>;
beforeAll(async () => { ({ proxy } = await import('@/proxy')); });

async function cookieFor(role: string, claims?: { mods: string[] }) {
    const payload: Record<string, unknown> = {
        id: 'u1', username: 'u1', role, name: 'U', specialty: null,
        organization_id: 'org', organization_slug: 'org', organization_name: 'Org',
        ...(claims ? { cid: 'c1', eid: 5, mods: claims.mods, mv: '1.1', ae: 'enforce' } : {}),
    };
    const jwt = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
    return `session=${jwt}; last_activity=${Date.now()}`;
}
const call = async (path: string, cookie: string) =>
    proxy(new NextRequest(`http://localhost${path}`, { headers: { cookie } }));
const redirectTarget = (res: Response) => (res.status >= 300 && res.status < 400 ? new URL(res.headers.get('location')!).pathname + new URL(res.headers.get('location')!).search : null);

describe('no claims → exactly the legacy gate', () => {
    it('lets a role onto its own area', async () => {
        expect(redirectTarget(await call('/finance/dashboard', await cookieFor('finance')))).toBeNull();
        expect(redirectTarget(await call('/hr/employees', await cookieFor('hr')))).toBeNull();
    });
    it('turns away a role that is neither listed nor holds the *.view permission', async () => {
        expect(redirectTarget(await call('/hr/employees', await cookieFor('nurse')))).toBe('/login?reason=unauthorized');
        expect(redirectTarget(await call('/pharmacy/billing', await cookieFor('receptionist')))).toBe('/login?reason=unauthorized');
    });
    it('keeps the *.view permission fallback (a doctor still reaches /finance)', async () => {
        expect(redirectTarget(await call('/finance/dashboard', await cookieFor('doctor')))).toBeNull();
    });
    it('keeps ungated pages open to any staff (/crm)', async () => {
        expect(redirectTarget(await call('/crm/leads', await cookieFor('lab_technician')))).toBeNull();
    });
    it('still sends signed-out users to /login', async () => {
        expect(redirectTarget(await call('/finance', 'x=1'))).toBe('/login');
    });
});

describe('with claims → module membership decides', () => {
    it('allows a held module', async () => {
        expect(redirectTarget(await call('/hr/employees', await cookieFor('hr', { mods: ['hr', 'ess'] })))).toBeNull();
    });
    it('blocks a module not held and sends the user to My Workspace with a reason', async () => {
        expect(redirectTarget(await call('/finance/dashboard', await cookieFor('doctor', { mods: ['doctor', 'ess'] })))).toBe('/me?reason=no-access');
    });
    it('the legacy role list no longer applies (a role the old gate rejected can be let in)', async () => {
        expect(redirectTarget(await call('/hr/employees', await cookieFor('nurse', { mods: ['hr', 'ess'] })))).toBeNull();
    });
    it('…and a previously ungated page is now governed', async () => {
        expect(redirectTarget(await call('/crm/leads', await cookieFor('lab_technician', { mods: ['lab', 'ess'] })))).toBe('/me?reason=no-access');
    });
    it('My Workspace is always reachable, so a no-access redirect can never loop', async () => {
        expect(redirectTarget(await call('/me', await cookieFor('hr', { mods: [] })))).toBeNull();
    });
    it('/opd and /opd-manager are routed separately (the old first-prefix quirk is gone)', async () => {
        const c = await cookieFor('opd_manager', { mods: ['opd_manager', 'ess'] });
        expect(redirectTarget(await call('/opd-manager/dashboard', c))).toBeNull();
        expect(redirectTarget(await call('/opd/queue', c))).toBe('/me?reason=no-access');
    });
    it('a forged shadow-mode claim is ignored (only enforce claims count)', async () => {
        const jwt = await new SignJWT({ id: 'u1', username: 'u', role: 'nurse', name: 'U', organization_id: 'o', mods: ['hr'], mv: '1', ae: 'shadow' })
            .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
        const res = await call('/hr/employees', `session=${jwt}; last_activity=${Date.now()}`);
        expect(redirectTarget(res)).toBe('/login?reason=unauthorized'); // legacy gate, not the claim
    });
});

describe('matcher', () => {
    it('the claims-refresh poll is excluded, so it can never count as user activity (idle timeout stays 15 min)', async () => {
        const { config } = await import('@/proxy');
        const re = new RegExp('^' + config.matcher[0] + '$');
        expect(re.test('/api/auth/refresh')).toBe(false);
        expect(re.test('/api/session')).toBe(false);
        expect(re.test('/api/ipd/anything')).toBe(true);
        expect(re.test('/admin/access/users')).toBe(true);
    });
});
