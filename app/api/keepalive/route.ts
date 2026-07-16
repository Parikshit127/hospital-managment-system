import { NextResponse } from 'next/server';

/**
 * Session keep-alive.
 *
 * proxy.ts logs staff out after SESSION_TIMEOUT_MS (15 min) of inactivity, but
 * it only counts *server requests* as activity — it refreshes the
 * `last_activity` cookie on each request that passes through it. Typing into a
 * long form (a 13-line purchase order, a discharge summary) makes no server
 * requests at all, so the session silently expired mid-form and the submit was
 * redirected to /login, losing the user's work with a cryptic "An unexpected
 * response was received from the server".
 *
 * Hitting this route runs the proxy, which refreshes `last_activity` — so a
 * user who is actively working stays signed in. It deliberately does NOT extend
 * anything on its own: the client only calls it after real user interaction, so
 * an unattended machine still times out at 15 minutes as intended.
 *
 * Must NOT be added to the proxy's early-return bypass list (or its matcher
 * exclusions) — going through the proxy is the entire point.
 */
export async function GET() {
    // Reaching here means the proxy already validated the session and refreshed
    // last_activity. The body is irrelevant.
    return NextResponse.json({ ok: true });
}
