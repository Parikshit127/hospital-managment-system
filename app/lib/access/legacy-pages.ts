/**
 * Pure (no session, no Node) form of proxy.ts's page-access decision, so scripts and tests can
 * evaluate it without importing 'use server' modules. Decision, exactly as proxy.ts makes it:
 * flat role list for the route prefix first, then the `*.view` permission fallback.
 * Parity with proxy.ts is enforced by `npm run check:parity`.
 */
import { MODULES } from '../modules/registry';

export function gateFor(prefix: string) {
    for (const m of MODULES) for (const g of m.legacyGates ?? []) if (g.prefix === prefix) return g;
    throw new Error(`No proxy gate registered for "${prefix}"`);
}

/** Would `role`, holding `permissions`, be let through the proxy gate for `prefix`? */
export function roleMayOpenWith(role: string, permissions: readonly string[], prefix: string): boolean {
    const gate = gateFor(prefix);
    return gate.roles.includes(role) || permissions.includes(gate.permission);
}
