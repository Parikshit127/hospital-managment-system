import { API_URL } from '@/config';
import { clearTokens, getDeviceId, loadTokens, saveTokens, type Tokens } from '@/auth/storage';

/**
 * One fetch wrapper for the whole app.
 *  - adds the Bearer token
 *  - on 401 token_expired: refreshes ONCE (shared by concurrent calls) and retries
 *  - on 401 revoked / failed refresh: wipes tokens and tells the app to show the login screen
 *  - network problems never log the user out
 */

export type ApiCode =
    | 'bad_request' | 'unauthorized' | 'token_expired' | 'forbidden' | 'not_found' | 'revoked'
    | 'rate_limited' | 'mfa_required' | 'server_error' | 'network' | 'timeout';

export class ApiError extends Error {
    constructor(message: string, public status: number, public code: ApiCode) {
        super(message);
        this.name = 'ApiError';
    }
    get isNetwork() { return this.code === 'network' || this.code === 'timeout'; }
}

export interface ApiResult<T> {
    data: T;
    meta?: { total?: number; totalPages?: number; page?: number; [k: string]: unknown };
}

const TIMEOUT_MS = 20_000;

let tokens: Tokens | null = null;
let tokensLoaded = false;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(fn: (() => void) | null) { onSessionLost = fn; }

export async function setTokens(t: Tokens | null) {
    tokens = t;
    tokensLoaded = true;
    if (t) await saveTokens(t); else await clearTokens();
}

async function currentTokens(): Promise<Tokens | null> {
    if (!tokensLoaded) { tokens = await loadTokens(); tokensLoaded = true; }
    return tokens;
}

async function rawFetch(path: string, init: { method: string; body?: unknown; token?: string | null; query?: Record<string, unknown> }) {
    const url = new URL(`${API_URL}/api/v1${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url.toString(), {
            method: init.method,
            headers: {
                Accept: 'application/json',
                ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
            },
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
            signal: ctl.signal,
        });
        let json: any = null;
        try { json = await res.json(); } catch { /* non-JSON (proxy error page etc.) */ }
        return { status: res.status, json };
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new ApiError('The server took too long to respond. Try again.', 0, 'timeout');
        throw new ApiError('No connection. Check your internet and try again.', 0, 'network');
    } finally {
        clearTimeout(timer);
    }
}

function toError(status: number, json: any): ApiError {
    const msg = typeof json?.error === 'string' && json.error ? json.error : status >= 500 ? 'Server error. Try again shortly.' : 'Request failed';
    return new ApiError(msg, status, (json?.code as ApiCode) ?? (status === 401 ? 'unauthorized' : 'server_error'));
}

/** Exchange the refresh token. Resolves false (and logs out) if the session is dead; throws on network trouble. */
async function refreshOnce(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
        const t = await currentTokens();
        if (!t) return false;
        const { status, json } = await rawFetch('/auth/refresh', {
            method: 'POST', body: { refreshToken: t.refreshToken, deviceId: await getDeviceId() },
        });
        if (status === 200 && json?.ok) {
            await setTokens({ accessToken: json.data.accessToken, refreshToken: json.data.refreshToken });
            return true;
        }
        if (status === 401 || status === 403) {
            await sessionLost();
            return false;
        }
        throw toError(status, json); // 5xx etc.: keep the session, surface the error
    })().finally(() => { refreshing = null; });
    return refreshing;
}

async function sessionLost() {
    await setTokens(null);
    onSessionLost?.();
}

export async function request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    opts: { body?: unknown; query?: Record<string, unknown>; auth?: boolean } = {},
): Promise<ApiResult<T>> {
    const auth = opts.auth !== false;
    let t = auth ? await currentTokens() : null;
    if (auth && !t) { await sessionLost(); throw new ApiError('Please sign in again.', 401, 'unauthorized'); }

    for (let attempt = 0; attempt < 2; attempt++) {
        const { status, json } = await rawFetch(path, { method, body: opts.body, query: opts.query, token: t?.accessToken });
        if (status >= 200 && status < 300 && json?.ok) return { data: json.data as T, meta: json.meta };

        const code = json?.code as ApiCode | undefined;
        if (auth && status === 401 && attempt === 0 && (code === 'token_expired' || code === 'unauthorized')) {
            if (await refreshOnce()) { t = await currentTokens(); continue; }
            throw new ApiError('Please sign in again.', 401, 'unauthorized');
        }
        if (auth && status === 401) {
            await sessionLost();
            throw new ApiError(json?.error ?? 'You were signed out.', 401, code ?? 'revoked');
        }
        throw toError(status, json);
    }
    throw new ApiError('Request failed', 500, 'server_error');
}

export const api = {
    get: <T>(path: string, query?: Record<string, unknown>) => request<T>('GET', path, { query }),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
    del: <T>(path: string) => request<T>('DELETE', path),
};

export { currentTokens };
