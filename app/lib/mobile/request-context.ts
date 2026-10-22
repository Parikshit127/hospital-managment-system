import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionData } from '@/app/lib/session';

/**
 * Per-request identity for the mobile API. `/api/v1` handlers verify the Bearer token, then run the
 * existing server actions inside `mobileRequest.run(session, ...)`; `getSession()` consults this store
 * before the cookie. Nothing outside withMobileAuth can populate it, so a Bearer header on any other
 * route never authenticates anyone.
 */
export const mobileRequest = new AsyncLocalStorage<SessionData>();
