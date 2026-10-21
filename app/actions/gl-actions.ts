'use server';

/**
 * Guarded server-action layer for the finance screens (/finance/*).
 *
 * The implementation lives in app/lib/finance/gl-service.ts and is called directly (no
 * session needed) by other server code: pharmacy, deposits, expenses, insurance, cron.
 * ONLY the functions the finance pages actually call are re-exported here, because every
 * export of a 'use server' file is a public POST endpoint.
 *
 * For each call this layer
 *   1. requires a STAFF session that could open /finance today (same decision as proxy.ts),
 *   2. ignores any client-supplied organizationId and uses the session's unit — the pages
 *      already send the session's own org (fetched from /api/session), so legitimate use is
 *      unchanged, while a forged org id no longer reads or writes another unit's books,
 *   3. for id-addressed calls, checks the record belongs to the session's unit first.
 */
import { prisma } from '@/backend/db';
import { requireLegacyRouteAccess, isAccessDenial } from '@/app/lib/access/legacy-guard';
import { requireAccess } from '@/app/lib/access/require-access';
import * as gl from '@/app/lib/finance/gl-service';

const GATE = '/finance';

type Ctx = Awaited<ReturnType<typeof requireLegacyRouteAccess>>;

/** Same envelope the service returns on failure, so page code that checks `success` keeps working. */
async function guarded<T>(permission: string, fn: (ctx: Ctx) => Promise<T>, onDeny: Record<string, unknown> = {}): Promise<T> {
    let ctx: Ctx;
    try {
        // `legacy` = the exact decision this layer made before Company-OS (same door as the /finance page).
        // While the unit's access_engine flag is `legacy` that alone decides; `shadow` compares; `enforce` replaces it.
        const a = await requireAccess(permission, { legacy: () => requireLegacyRouteAccess(GATE) });
        ctx = { session: a.session, organizationId: a.organizationId };
    } catch (e) {
        if (isAccessDenial(e)) return { success: false, error: 'Access denied', ...onDeny } as T;
        throw e;
    }
    return fn(ctx);
}

const notFound = <T>(onDeny: Record<string, unknown> = {}) => ({ success: false, error: 'Not found', ...onDeny }) as T;

// ───────── Chart of accounts ─────────

export async function getGLAccounts(organizationId: string, filters?: Parameters<typeof gl.getGLAccounts>[1]) {
    return guarded('finance.ledger.view', (c) => gl.getGLAccounts(c.organizationId, filters), { accounts: [] });
}

export async function createGLAccount(data: Parameters<typeof gl.createGLAccount>[0]) {
    return guarded('finance.ledger.create', (c) => gl.createGLAccount({ ...data, organizationId: c.organizationId }));
}

export async function updateGLAccount(id: string, data: Parameters<typeof gl.updateGLAccount>[1]) {
    return guarded('finance.ledger.edit', async (c) => {
        const owned = await prisma.gL_Account.findFirst({ where: { id, organizationId: c.organizationId }, select: { id: true } });
        if (!owned) return notFound<Awaited<ReturnType<typeof gl.updateGLAccount>>>();
        // organizationId is not an updatable field; drop it if a forged payload carries one.
        const { organizationId: _ignored, ...safe } = (data ?? {}) as Record<string, unknown>;
        return gl.updateGLAccount(id, safe as typeof data);
    });
}

// ───────── Journal entries ─────────

export async function getJournalEntries(organizationId: string, filters?: Parameters<typeof gl.getJournalEntries>[1]) {
    return guarded('finance.ledger.view', (c) => gl.getJournalEntries(c.organizationId, filters), { entries: [] });
}

export async function getJournalEntryDetails(journalId: string) {
    return guarded('finance.ledger.view', async (c) => {
        const owned = await prisma.gL_JournalEntry.findFirst({ where: { id: journalId, organizationId: c.organizationId }, select: { id: true } });
        if (!owned) return notFound<Awaited<ReturnType<typeof gl.getJournalEntryDetails>>>();
        return gl.getJournalEntryDetails(journalId);
    });
}

export async function createJournalEntry(data: Parameters<typeof gl.createJournalEntry>[0]) {
    return guarded('finance.ledger.create', (c) => gl.createJournalEntry({ ...data, organizationId: c.organizationId }));
}

export async function reverseJournalEntry(journalId: string, reason: string, reversedBy?: string) {
    return guarded('finance.ledger.edit', async (c) => {
        const owned = await prisma.gL_JournalEntry.findFirst({ where: { id: journalId, organizationId: c.organizationId }, select: { id: true } });
        if (!owned) return notFound<Awaited<ReturnType<typeof gl.reverseJournalEntry>>>();
        return gl.reverseJournalEntry(journalId, reason, reversedBy);
    });
}

// ───────── Reports ─────────

export async function getTrialBalance(organizationId: string, filters?: Parameters<typeof gl.getTrialBalance>[1]) {
    return guarded('finance.ledger.view', (c) => gl.getTrialBalance(c.organizationId, filters));
}

export async function getBalanceSheet(organizationId: string, filters?: Parameters<typeof gl.getBalanceSheet>[1]) {
    return guarded('finance.ledger.view', (c) => gl.getBalanceSheet(c.organizationId, filters));
}

export async function getScheduleIIIBalanceSheet(organizationId: string, filters?: Parameters<typeof gl.getScheduleIIIBalanceSheet>[1]) {
    return guarded('finance.ledger.view', (c) => gl.getScheduleIIIBalanceSheet(c.organizationId, filters));
}

export async function getProfitLossStatement(organizationId: string, filters?: Parameters<typeof gl.getProfitLossStatement>[1]) {
    return guarded('finance.ledger.view', (c) => gl.getProfitLossStatement(c.organizationId, filters));
}

export async function getLedgerReport(accountId: string, filters?: Parameters<typeof gl.getLedgerReport>[1]) {
    return guarded('finance.ledger.view', async (c) => {
        const owned = await prisma.gL_Account.findFirst({ where: { id: accountId, organizationId: c.organizationId }, select: { id: true } });
        if (!owned) return notFound<Awaited<ReturnType<typeof gl.getLedgerReport>>>();
        return gl.getLedgerReport(accountId, filters);
    });
}
