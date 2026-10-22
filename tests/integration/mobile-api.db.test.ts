/**
 * HR mobile API against a real database (skipped without TEST_DATABASE_URL — see scripts/test-integration.sh).
 * Drives the actual /api/v1 route handlers: login → me → punch (geofence) → refresh rotation → reuse detection → revoke.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';

const URL_ = process.env.TEST_DATABASE_URL;
const ORG = 'org-mob';
const DEVICE = { deviceId: 'device-aaaa-1111', deviceName: 'Pixel Test', platform: 'android', appVersion: '1.0.0' };
const SITE = { lat: 28.6139, lng: 77.209 }; // geofence centre
const FAR = { lat: 28.7, lng: 77.3 };

const json = (method: string, url: string, body?: unknown, token?: string) =>
    new NextRequest(`http://localhost${url}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

describe.skipIf(!URL_)('hr mobile api', () => {
    let prisma: any;
    let login: any, refresh: any, me: any, logout: any, punch: any, workspace: any, devices: any, revokeDev: any, leaveApprove: any;

    const call = async (handler: any, req: NextRequest, params?: object) => {
        const res: Response = await handler(req, params ? { params: Promise.resolve(params) } : undefined);
        return { status: res.status, body: await res.json() };
    };
    const doLogin = (username = 'emp1', password = 'pw12345', location: any = SITE, device = DEVICE) =>
        call(login.POST, json('POST', '/api/v1/auth/login', { username, password, device, location }));

    beforeAll(async () => {
        process.env.DATABASE_URL = URL_; process.env.DIRECT_URL = URL_; process.env.JWT_SECRET = 'x';
        const { PrismaClient } = await import('@prisma/client');
        prisma = new PrismaClient();
        const pw = await bcrypt.hash('pw12345', 4);

        await prisma.organization.create({ data: { id: ORG, name: 'Mob Hospital', slug: 'mob', code: 'MOB' } });
        await prisma.user.createMany({ data: [
            { id: 'u-emp', username: 'emp1', password: pw, role: 'nurse', organizationId: ORG, name: 'Emp One' },
            { id: 'u-mgr', username: 'mgr1', password: pw, role: 'nurse', organizationId: ORG, name: 'Mgr One' },
            { id: 'u-hr', username: 'hr1', password: pw, role: 'hr', organizationId: ORG, name: 'HR One' },
            { id: 'u-off', username: 'off1', password: pw, role: 'nurse', organizationId: ORG, name: 'Disabled', is_active: false },
        ] });
        await prisma.moduleConfig.create({ data: {
            organizationId: ORG, module_key: 'hr', enabled: true,
            config_json: { requireGeo: true, geofence: { ...SITE, radiusM: 200 } },
        } });

        login = await import('@/app/api/v1/auth/login/route');
        refresh = await import('@/app/api/v1/auth/refresh/route');
        me = await import('@/app/api/v1/auth/me/route');
        logout = await import('@/app/api/v1/auth/logout/route');
        punch = await import('@/app/api/v1/hr/me/punch/route');
        workspace = await import('@/app/api/v1/hr/me/workspace/route');
        devices = await import('@/app/api/v1/hr/devices/route');
        revokeDev = await import('@/app/api/v1/hr/devices/[id]/revoke/route');
        leaveApprove = await import('@/app/api/v1/hr/leave/[id]/review/route');
    });
    afterAll(async () => { await prisma?.$disconnect(); });

    it('rejects bad credentials and disabled accounts', async () => {
        expect((await doLogin('emp1', 'wrong')).status).toBe(401);
        expect((await doLogin('off1', 'pw12345')).status).toBe(403);
        expect((await call(login.POST, json('POST', '/api/v1/auth/login', { username: 'emp1' }))).status).toBe(400);
    });

    it('logs in, records the login location and reports capabilities + geofence', async () => {
        const r = await doLogin();
        expect(r.status).toBe(200);
        expect(r.body.data.accessToken).toBeTruthy();
        expect(r.body.data.employee.code).toMatch(/^EMP-/);
        expect(r.body.data.capabilities).toMatchObject({ employee: true, hr: false, manager: false });
        expect(r.body.data.geofence).toMatchObject({ required: true, inside: true });
        const row = await prisma.mobileSession.findFirst({ where: { user_id: 'u-emp', revoked_at: null } });
        expect(row.login_lat).toBeCloseTo(SITE.lat);
        expect(row.refresh_hash).not.toBe(r.body.data.refreshToken); // only the hash is stored
    });

    it('protects routes: no token, garbage token, and a web-style token are refused', async () => {
        expect((await call(me.GET, json('GET', '/api/v1/auth/me'))).status).toBe(401);
        expect((await call(me.GET, json('GET', '/api/v1/auth/me', undefined, 'garbage'))).status).toBe(401);
    });

    it('serves /me and the workspace through the existing HR engine', async () => {
        const { body } = await doLogin();
        const t = body.data.accessToken;
        const who = await call(me.GET, json('GET', '/api/v1/auth/me', undefined, t));
        expect(who.body.data.user.username).toBe('emp1');
        const ws = await call(workspace.GET, json('GET', '/api/v1/hr/me/workspace', undefined, t));
        expect(ws.status).toBe(200);
        expect(ws.body.data.punch.isIn).toBe(false);
        expect(ws.body.data.policy.requireGeo).toBe(true);
    });

    it('enforces the geofence and mock-location on punch, then punches in/out from inside', async () => {
        const t = (await doLogin()).body.data.accessToken;
        const p = (b: object) => call(punch.POST, json('POST', '/api/v1/hr/me/punch', b, t));

        expect((await p({ type: 'IN' })).status).toBe(400);                                  // no location
        expect((await p({ type: 'IN', ...FAR })).body.error).toMatch(/from the work location/); // outside
        expect((await p({ type: 'IN', ...SITE, mocked: true })).status).toBe(403);           // fake GPS
        const ok = await p({ type: 'IN', ...SITE, accuracy: 12 });
        expect(ok.status).toBe(200);
        const ev = await prisma.attendanceEvent.findFirst({ where: { type: 'IN' }, orderBy: { id: 'desc' } });
        expect(ev.source).toBe('MOBILE');
        expect(ev.latitude).toBeCloseTo(SITE.lat);
        expect((await p({ type: 'IN', ...SITE })).status).toBe(400);                         // already in
    });

    it('rotates refresh tokens and revokes the session when a rotated-out token is replayed', async () => {
        const first = (await doLogin()).body.data;
        const r1 = await call(refresh.POST, json('POST', '/api/v1/auth/refresh', { refreshToken: first.refreshToken, deviceId: DEVICE.deviceId }));
        expect(r1.status).toBe(200);
        expect(r1.body.data.refreshToken).not.toBe(first.refreshToken);

        // old token replayed (stolen copy) → whole session dies, including the legit new token
        const replay = await call(refresh.POST, json('POST', '/api/v1/auth/refresh', { refreshToken: first.refreshToken, deviceId: DEVICE.deviceId }));
        expect(replay.status).toBe(401);
        const after = await call(refresh.POST, json('POST', '/api/v1/auth/refresh', { refreshToken: r1.body.data.refreshToken, deviceId: DEVICE.deviceId }));
        expect(after.status).toBe(401);
        expect((await call(me.GET, json('GET', '/api/v1/auth/me', undefined, r1.body.data.accessToken))).body.code).toBe('revoked');
    });

    it('refuses a refresh token presented from a different device', async () => {
        const d = (await doLogin()).body.data;
        const r = await call(refresh.POST, json('POST', '/api/v1/auth/refresh', { refreshToken: d.refreshToken, deviceId: 'some-other-device-9' }));
        expect(r.status).toBe(401);
    });

    it('a new login on the same device replaces the old session; logout revokes immediately', async () => {
        const a = (await doLogin()).body.data;
        const b = (await doLogin()).body.data;
        expect((await call(me.GET, json('GET', '/api/v1/auth/me', undefined, a.accessToken))).status).toBe(401);
        expect((await call(me.GET, json('GET', '/api/v1/auth/me', undefined, b.accessToken))).status).toBe(200);
        expect((await call(logout.POST, json('POST', '/api/v1/auth/logout', {}, b.accessToken))).status).toBe(200);
        expect((await call(me.GET, json('GET', '/api/v1/auth/me', undefined, b.accessToken))).status).toBe(401);
    });

    it('disabling the user or changing their role cuts the live token', async () => {
        const t = (await doLogin('mgr1')).body.data.accessToken;
        await prisma.user.update({ where: { id: 'u-mgr' }, data: { role: 'receptionist' } });
        const r = await call(me.GET, json('GET', '/api/v1/auth/me', undefined, t));
        expect(r.status).toBe(401);
        expect(r.body.code).toBe('token_expired'); // app refreshes → picks up the new role
        await prisma.user.update({ where: { id: 'u-mgr' }, data: { is_active: false } });
        const rt = (await prisma.mobileSession.findFirst({ where: { user_id: 'u-mgr', revoked_at: null } }));
        expect(rt).toBeTruthy();
        expect((await call(me.GET, json('GET', '/api/v1/auth/me', undefined, t))).status).toBe(401);
        await prisma.user.update({ where: { id: 'u-mgr' }, data: { role: 'nurse', is_active: true } });
    });

    it('HR sees the capability, lists devices with login location, and can revoke one; staff cannot', async () => {
        const emp = (await doLogin()).body.data.accessToken;
        const hr = (await doLogin('hr1', 'pw12345', SITE, { ...DEVICE, deviceId: 'hr-device-0001' })).body.data;
        expect(hr.capabilities.hr).toBe(true);

        expect((await call(devices.GET, json('GET', '/api/v1/hr/devices', undefined, emp))).status).toBe(403);
        const list = await call(devices.GET, json('GET', '/api/v1/hr/devices', undefined, hr.accessToken));
        expect(list.status).toBe(200);
        const target = list.body.data.find((d: any) => d.username === 'emp1');
        expect(target.loginLocation.lat).toBeCloseTo(SITE.lat);

        expect((await call(revokeDev.POST, json('POST', `/api/v1/hr/devices/${target.id}/revoke`, {}, hr.accessToken), { id: target.id })).status).toBe(200);
        expect((await call(me.GET, json('GET', '/api/v1/auth/me', undefined, emp))).body.code).toBe('revoked');
    });

    it('validates review decisions', async () => {
        const t = (await doLogin('hr1', 'pw12345', SITE, { ...DEVICE, deviceId: 'hr-device-0001' })).body.data.accessToken;
        const r = await call(leaveApprove.POST, json('POST', '/api/v1/hr/leave/1/review', { decision: 'Maybe' }, t), { id: '1' });
        expect(r.status).toBe(400);
    });
});
