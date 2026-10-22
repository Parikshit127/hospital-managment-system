/**
 * Plumbing shared by every `/api/v1` route handler: response envelope, JSON body parsing, and
 * `mobileRoute()` which authenticates the Bearer token and runs the handler inside the mobile request
 * context so the existing server actions / HR engine see the caller as a normal logged-in user.
 *
 * Envelope:  { ok: true, data, meta? }  |  { ok: false, error, code }
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { SessionData } from '@/app/lib/session';
import { mobileRequest } from './request-context';
import { MobileAuthError, assertSessionActive, verifyAccessToken } from './mobile-auth';

export type ApiCode =
    | 'bad_request' | 'unauthorized' | 'token_expired' | 'forbidden' | 'not_found' | 'revoked'
    | 'rate_limited' | 'mfa_required' | 'server_error';

export function ok<T>(data: T, status = 200, meta?: Record<string, unknown>) {
    return NextResponse.json(meta ? { ok: true, data, meta } : { ok: true, data }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function fail(error: string, status = 400, code?: ApiCode) {
    const c: ApiCode = code ?? (status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not_found' : status === 429 ? 'rate_limited' : status >= 500 ? 'server_error' : 'bad_request');
    return NextResponse.json({ ok: false, error, code: c }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Thrown inside handlers for a clean 4xx. */
export class ApiError extends Error {
    constructor(message: string, public status = 400, public apiCode?: ApiCode) {
        super(message);
        this.name = 'ApiError';
    }
}

export async function readJson(req: Request): Promise<Record<string, any>> {
    try {
        const body = await req.json();
        if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    } catch { /* fallthrough */ }
    throw new ApiError('Request body must be a JSON object');
}

/** Positive integer path/query param. */
export function intParam(v: string | null | undefined, name = 'id'): number {
    const n = Number(v);
    if (!v || !Number.isInteger(n) || n <= 0) throw new ApiError(`Invalid ${name}`);
    return n;
}

/** Map the `{ success, data|error }` shape the server actions return onto the API envelope. */
export function fromAction(result: any, okStatus = 200) {
    if (result?.success) {
        // Paged actions return extra siblings of `data` (total, totalPages, page) — surface them as `meta`.
        const { success: _s, data, error: _e, ...rest } = result;
        return ok(data ?? null, okStatus, Object.keys(rest).length ? rest : undefined);
    }
    const msg: string = typeof result?.error === 'string' && result.error ? result.error : 'Request failed';
    if (/session expired/i.test(msg)) return fail(msg, 401, 'unauthorized');
    if (/do not have permission/i.test(msg)) return fail(msg, 403);
    if (/not found/i.test(msg)) return fail(msg, 404);
    // Actions that swallow their own errors return { success:false, data: [] } with no message.
    return fail(msg, typeof result?.error === 'string' && result.error ? 400 : 500);
}

export interface MobileCtx<P> {
    session: SessionData;
    sessionId: string;
    params: P;
    url: URL;
}

/**
 * Wrap a handler: verify Bearer token → confirm the device session is live → run the handler with the
 * caller installed as the request identity. Handlers may return a Response, or throw ApiError.
 */
export function mobileRoute<P = Record<string, never>>(
    handler: (req: NextRequest, ctx: MobileCtx<P>) => Promise<Response>,
) {
    return async (req: NextRequest, routeCtx?: { params: Promise<P> }): Promise<Response> => {
        try {
            const header = req.headers.get('authorization') ?? '';
            const m = /^Bearer\s+(.+)$/i.exec(header);
            if (!m) return fail('Missing access token', 401, 'unauthorized');

            const { session, sessionId } = await verifyAccessToken(m[1].trim());
            await assertSessionActive(session, sessionId);

            const params = (routeCtx?.params ? await routeCtx.params : {}) as P;
            return await mobileRequest.run(session, () => handler(req, { session, sessionId, params, url: new URL(req.url) }));
        } catch (e) {
            return handleError(e);
        }
    };
}

export function handleError(e: unknown): Response {
    if (e instanceof MobileAuthError) {
        if (e.code === 'expired' || e.code === 'stale') return fail(e.message, 401, 'token_expired');
        if (e.code === 'revoked' || e.code === 'user_disabled') return fail(e.message, 401, 'revoked');
        return fail(e.message, 401, 'unauthorized');
    }
    if (e instanceof ApiError) return fail(e.message, e.status, e.apiCode);
    if ((e as any)?.name === 'AuthError') return fail('Session expired', 401, 'unauthorized');
    if ((e as any)?.name === 'ForbiddenError') return fail('You do not have permission to do that.', 403);
    console.error('[api/v1] unhandled error', e);
    return fail('Something went wrong', 500);
}

/** Wrap an unauthenticated route (login / refresh) with the same error handling. */
export function publicRoute(handler: (req: NextRequest) => Promise<Response>) {
    return async (req: NextRequest): Promise<Response> => {
        try {
            return await handler(req);
        } catch (e) {
            return handleError(e);
        }
    };
}

export function clientIp(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
