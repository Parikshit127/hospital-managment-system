'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';
import { encryptSecret, decryptSecret } from '@/app/lib/secure-config';
import {
    postToTally,
    buildLedgerXml,
    buildVoucherXml,
    buildConnectionProbeXml,
    buildVoucherTypeProbeXml,
    tallyVoucherType,
    mapAccountTypeToTallyGroup,
    type TallyConnectionConfig,
} from '@/app/lib/tally-client';

const TALLY_ROLES = ['admin', 'finance'];

function serialize<T>(data: T): T {
    return JSON.parse(
        JSON.stringify(data, (_k, v) => (v && typeof v === 'object' && v.constructor?.name === 'Decimal' ? Number(v) : v)),
    );
}

function clip(s: string | null | undefined, n = 8000): string | null {
    if (!s) return null;
    return s.length > n ? s.slice(0, n) : s;
}

async function resolveTallyConfig(db: any, organizationId: string) {
    const cfg = await db.organizationConfig.findUnique({ where: { organizationId } });
    if (!cfg) return null;
    const conn: TallyConnectionConfig = {
        url: cfg.tally_url || '',
        company: cfg.tally_company || null,
        username: cfg.tally_username || null,
        password: decryptSecret(cfg.tally_password) || null,
    };
    let voucherTypeMap: Record<string, string> | undefined;
    try { if (cfg.tally_voucher_type_map) voucherTypeMap = JSON.parse(cfg.tally_voucher_type_map); } catch { /* ignore bad json */ }
    return { enabled: !!cfg.tally_enabled, auto_sync: !!cfg.tally_auto_sync, last_sync_at: cfg.tally_last_sync_at, conn, voucherTypeMap };
}

async function logSync(
    db: any,
    organizationId: string,
    entry: {
        entity_type: string;
        entity_id?: string | null;
        action: string;
        status: 'success' | 'failed';
        request_payload?: string | null;
        response_payload?: string | null;
        error_message?: string | null;
        records_count?: number;
        created_by?: string | null;
    },
) {
    try {
        await db.tallySyncLog.create({
            data: {
                organizationId,
                entity_type: entry.entity_type,
                entity_id: entry.entity_id ?? null,
                action: entry.action,
                status: entry.status,
                request_payload: clip(entry.request_payload),
                response_payload: clip(entry.response_payload),
                error_message: clip(entry.error_message, 1000),
                records_count: entry.records_count ?? 0,
                created_by: entry.created_by ?? null,
            },
        });
    } catch {
        /* logging must never break a sync */
    }
}

// ── Configuration (per-hospital, no env vars) ───────────────────────────────

export async function getTallyConfig() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const cfg = await db.organizationConfig.findUnique({ where: { organizationId } });
        return {
            success: true,
            data: {
                tally_enabled: !!cfg?.tally_enabled,
                tally_url: cfg?.tally_url || '',
                tally_company: cfg?.tally_company || '',
                tally_username: cfg?.tally_username || '',
                has_password: !!cfg?.tally_password,
                tally_auto_sync: !!cfg?.tally_auto_sync,
                tally_last_sync_at: cfg?.tally_last_sync_at || null,
            },
        };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function saveTallyConfig(input: {
    tally_enabled?: boolean;
    tally_url?: string;
    tally_company?: string;
    tally_username?: string;
    tally_password?: string; // empty string = leave unchanged
    tally_auto_sync?: boolean;
}) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const data: Record<string, any> = {
            tally_enabled: !!input.tally_enabled,
            tally_url: (input.tally_url || '').trim() || null,
            tally_company: (input.tally_company || '').trim() || null,
            tally_username: (input.tally_username || '').trim() || null,
            tally_auto_sync: !!input.tally_auto_sync,
        };
        if (typeof input.tally_password === 'string' && input.tally_password.length > 0) {
            data.tally_password = encryptSecret(input.tally_password);
        }
        await db.organizationConfig.upsert({
            where: { organizationId },
            update: data,
            create: { organizationId, ...data },
        });
        await logAudit({
            action: 'UPDATE_TALLY_CONFIG',
            module: 'finance',
            entity_type: 'organization_config',
            entity_id: organizationId,
            details: JSON.stringify({ url: data.tally_url, company: data.tally_company, enabled: data.tally_enabled, auto_sync: data.tally_auto_sync, by: session.username }),
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Only finance/admin can change Tally settings.' : e.message };
    }
}

export async function testTallyConnection() {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Configure and save the Tally Server URL first.' };
        const probe = buildConnectionProbeXml();
        const result = await postToTally(resolved.conn, probe, { timeoutMs: 15000 });
        await logSync(db, organizationId, {
            entity_type: 'connection',
            action: 'test_connection',
            status: result.ok ? 'success' : 'failed',
            request_payload: probe,
            response_payload: result.raw,
            error_message: result.ok ? null : result.message,
            created_by: session.username,
        });
        await logAudit({ action: 'TEST_TALLY_CONNECTION', module: 'finance', entity_type: 'tally', entity_id: organizationId, details: JSON.stringify({ ok: result.ok, code: result.code }) });
        return { success: result.ok, message: result.message, code: result.code, error: result.ok ? undefined : result.message };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

// ── Ledger sync (GL_Account = source of truth) ──────────────────────────────

async function postLedger(db: any, organizationId: string, username: string, conn: TallyConnectionConfig, account: any) {
    const xml = buildLedgerXml(account, conn.company);
    const result = await postToTally(conn, xml, { timeoutMs: 20000 });
    const tallyName = account.tally_ledger_name || account.account_name;
    const tallyGroup = account.tally_group || mapAccountTypeToTallyGroup(account.account_type);
    await db.tallyLedgerMapping.upsert({
        where: { organizationId_gl_account_id: { organizationId, gl_account_id: account.id } },
        update: {
            his_ledger_name: account.account_name,
            tally_ledger_name: tallyName,
            tally_group: tallyGroup,
            sync_status: result.ok ? 'synced' : 'failed',
            error_message: result.ok ? null : result.message,
            ...(result.ok ? { last_synced_at: new Date() } : {}),
        },
        create: {
            organizationId,
            gl_account_id: account.id,
            his_ledger_name: account.account_name,
            tally_ledger_name: tallyName,
            tally_group: tallyGroup,
            sync_status: result.ok ? 'synced' : 'failed',
            error_message: result.ok ? null : result.message,
            last_synced_at: result.ok ? new Date() : null,
        },
    });
    await logSync(db, organizationId, {
        entity_type: 'ledger',
        entity_id: account.id,
        action: 'sync_ledger',
        status: result.ok ? 'success' : 'failed',
        request_payload: xml,
        response_payload: result.raw,
        error_message: result.ok ? null : result.message,
        records_count: result.ok ? 1 : 0,
        created_by: username,
    });
    return result;
}

export async function syncLedger(glAccountId: string) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Tally Server URL not configured.' };
        const account = await db.gL_Account.findFirst({ where: { id: glAccountId } });
        if (!account) return { success: false, error: 'Ledger not found.' };
        const r = await postLedger(db, organizationId, session.username, resolved.conn, account);
        return r.ok ? { success: true, message: r.message } : { success: false, error: r.message, code: r.code };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function syncAllLedgers() {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Tally Server URL not configured.' };
        const accounts = await db.gL_Account.findMany({ where: { is_active: true }, orderBy: { account_code: 'asc' } });
        let synced = 0, failed = 0, firstError = '';
        for (const acc of accounts) {
            const r = await postLedger(db, organizationId, session.username, resolved.conn, acc);
            if (r.ok) synced++;
            else {
                failed++;
                if (!firstError) firstError = r.message;
                if (r.code === 'offline' || r.code === 'timeout') { failed = accounts.length - synced; break; }
            }
        }
        await db.organizationConfig.update({ where: { organizationId }, data: { tally_last_sync_at: new Date() } }).catch(() => {});
        await logSync(db, organizationId, { entity_type: 'bulk', action: 'bulk_sync', status: failed === 0 ? 'success' : 'failed', error_message: failed ? firstError : null, records_count: synced, created_by: session.username });
        return { success: failed === 0, synced, failed, total: accounts.length, message: `${synced} ledger(s) synced, ${failed} failed${failed ? ': ' + firstError : ''}` };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

// ── Voucher sync (GL_JournalEntry = source of truth) ────────────────────────

async function postVoucher(db: any, organizationId: string, username: string, conn: TallyConnectionConfig, journal: any, voucherTypeMap?: Record<string, string>) {
    const { xml, voucherType } = buildVoucherXml(journal, conn.company, voucherTypeMap);
    const result = await postToTally(conn, xml, { timeoutMs: 20000 });
    await db.tallyVoucherMapping.upsert({
        where: { organizationId_gl_journal_entry_id: { organizationId, gl_journal_entry_id: journal.id } },
        update: {
            voucher_type: voucherType,
            his_voucher_number: journal.journal_number,
            sync_status: result.ok ? 'synced' : 'failed',
            error_message: result.ok ? null : result.message,
            ...(result.ok ? { last_synced_at: new Date() } : {}),
        },
        create: {
            organizationId,
            gl_journal_entry_id: journal.id,
            voucher_type: voucherType,
            his_voucher_number: journal.journal_number,
            sync_status: result.ok ? 'synced' : 'failed',
            error_message: result.ok ? null : result.message,
            last_synced_at: result.ok ? new Date() : null,
        },
    });
    await logSync(db, organizationId, {
        entity_type: 'voucher',
        entity_id: journal.id,
        action: 'sync_voucher',
        status: result.ok ? 'success' : 'failed',
        request_payload: xml,
        response_payload: result.raw,
        error_message: result.ok ? null : result.message,
        records_count: result.ok ? 1 : 0,
        created_by: username,
    });
    return result;
}

async function postVoucherEntries(db: any, organizationId: string, username: string, conn: TallyConnectionConfig, entries: any[], voucherTypeMap?: Record<string, string>) {
    let synced = 0, failed = 0, firstError = '';
    for (const e of entries) {
        const r = await postVoucher(db, organizationId, username, conn, e, voucherTypeMap);
        if (r.ok) synced++;
        else {
            failed++;
            if (!firstError) firstError = r.message;
            if (r.code === 'offline' || r.code === 'timeout') { failed = entries.length - synced; break; }
        }
    }
    return { synced, failed, firstError };
}

export async function syncVoucher(glJournalEntryId: string) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Tally Server URL not configured.' };
        const journal = await db.gL_JournalEntry.findFirst({ where: { id: glJournalEntryId }, include: { lines: { include: { account: true } } } });
        if (!journal) return { success: false, error: 'Voucher not found.' };
        const r = await postVoucher(db, organizationId, session.username, resolved.conn, journal, resolved.voucherTypeMap);
        return r.ok ? { success: true, message: r.message } : { success: false, error: r.message, code: r.code };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function postSelectedVouchers(ids: string[]) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        if (!ids?.length) return { success: false, error: 'No vouchers selected.' };
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Tally Server URL not configured.' };
        const entries = await db.gL_JournalEntry.findMany({ where: { id: { in: ids } }, include: { lines: { include: { account: true } } } });
        const { synced, failed, firstError } = await postVoucherEntries(db, organizationId, session.username, resolved.conn, entries, resolved.voucherTypeMap);
        return { success: failed === 0, synced, failed, message: `${synced} synced, ${failed} failed${failed ? ': ' + firstError : ''}` };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function syncAllVouchers() {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Tally Server URL not configured.' };
        const entries = await db.gL_JournalEntry.findMany({ where: { status: 'Posted' }, include: { lines: { include: { account: true } } }, orderBy: { entry_date: 'asc' }, take: 2000 });
        const { synced, failed, firstError } = await postVoucherEntries(db, organizationId, session.username, resolved.conn, entries, resolved.voucherTypeMap);
        await db.organizationConfig.update({ where: { organizationId }, data: { tally_last_sync_at: new Date() } }).catch(() => {});
        await logSync(db, organizationId, { entity_type: 'bulk', action: 'bulk_sync', status: failed === 0 ? 'success' : 'failed', error_message: failed ? firstError : null, records_count: synced, created_by: session.username });
        return { success: failed === 0, synced, failed, total: entries.length, message: `${synced} voucher(s) synced, ${failed} failed${failed ? ': ' + firstError : ''}` };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function postAllPendingVouchers() {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Tally Server URL not configured.' };
        const entries = await db.gL_JournalEntry.findMany({ where: { status: 'Posted' }, include: { lines: { include: { account: true } } }, orderBy: { entry_date: 'asc' }, take: 2000 });
        const maps = await db.tallyVoucherMapping.findMany({ where: { sync_status: 'synced' }, select: { gl_journal_entry_id: true } });
        const syncedIds = new Set(maps.map((m: any) => m.gl_journal_entry_id));
        const pending = entries.filter((e: any) => !syncedIds.has(e.id));
        if (pending.length === 0) return { success: true, synced: 0, failed: 0, message: 'No pending vouchers — everything is already synced.' };
        const { synced, failed, firstError } = await postVoucherEntries(db, organizationId, session.username, resolved.conn, pending, resolved.voucherTypeMap);
        await db.organizationConfig.update({ where: { organizationId }, data: { tally_last_sync_at: new Date() } }).catch(() => {});
        await logSync(db, organizationId, { entity_type: 'bulk', action: 'bulk_sync', status: failed === 0 ? 'success' : 'failed', error_message: failed ? firstError : null, records_count: synced, created_by: session.username });
        return { success: failed === 0, synced, failed, total: pending.length, message: `${synced} synced, ${failed} failed${failed ? ': ' + firstError : ''}` };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

// ── Dashboard / lists / logs ────────────────────────────────────────────────

export async function getTallyDashboard() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const cfg = await db.organizationConfig.findUnique({ where: { organizationId } });
        const [ledgerTotal, voucherTotal, ledgerSynced, voucherSynced, ledgerFailed, voucherFailed] = await Promise.all([
            db.gL_Account.count({ where: { is_active: true } }),
            db.gL_JournalEntry.count({ where: { status: 'Posted' } }),
            db.tallyLedgerMapping.count({ where: { sync_status: 'synced' } }),
            db.tallyVoucherMapping.count({ where: { sync_status: 'synced' } }),
            db.tallyLedgerMapping.count({ where: { sync_status: 'failed' } }),
            db.tallyVoucherMapping.count({ where: { sync_status: 'failed' } }),
        ]);
        const failed = ledgerFailed + voucherFailed;
        const synced = ledgerSynced + voucherSynced;
        const total = ledgerTotal + voucherTotal;
        return {
            success: true,
            data: {
                connected: !!(cfg?.tally_enabled && cfg?.tally_url),
                enabled: !!cfg?.tally_enabled,
                auto_sync: !!cfg?.tally_auto_sync,
                last_sync: cfg?.tally_last_sync_at || null,
                ledgers_total: ledgerTotal,
                ledgers_synced: ledgerSynced,
                vouchers_total: voucherTotal,
                vouchers_synced: voucherSynced,
                failed,
                pending: Math.max(0, total - synced - failed),
            },
        };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function getTallyVoucherList(opts?: { limit?: number; sync_status?: string }) {
    try {
        const { db } = await requireRoleAndTenant(TALLY_ROLES);
        const limit = Math.min(500, opts?.limit || 100);
        const entries = await db.gL_JournalEntry.findMany({ where: { status: { in: ['Posted', 'Reversed'] } }, orderBy: { entry_date: 'desc' }, take: limit });
        const ids = entries.map((e: any) => e.id);
        const maps = ids.length ? await db.tallyVoucherMapping.findMany({ where: { gl_journal_entry_id: { in: ids } } }) : [];
        const mapBy = new Map<string, any>(maps.map((m: any) => [m.gl_journal_entry_id, m]));
        let rows = entries.map((e: any) => {
            const m = mapBy.get(e.id);
            return {
                id: e.id,
                voucher_number: e.journal_number,
                voucher_type: tallyVoucherType(e.entry_type),
                entry_type: e.entry_type,
                reference: e.reference_number || e.narration || '—',
                amount: Number(e.total_debit || 0),
                status: e.status,
                sync_status: m?.sync_status || 'pending',
                tally_voucher_number: m?.tally_voucher_number || null,
                error_message: m?.error_message || null,
                last_synced_at: m?.last_synced_at || null,
                created_at: e.entry_date,
            };
        });
        if (opts?.sync_status) rows = rows.filter((r: any) => r.sync_status === opts.sync_status);
        return { success: true, data: serialize(rows) };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function getTallyLedgerList(opts?: { limit?: number }) {
    try {
        const { db } = await requireRoleAndTenant(TALLY_ROLES);
        const accounts = await db.gL_Account.findMany({ where: { is_active: true }, orderBy: { account_code: 'asc' }, take: Math.min(1000, opts?.limit || 500) });
        const ids = accounts.map((a: any) => a.id);
        const maps = ids.length ? await db.tallyLedgerMapping.findMany({ where: { gl_account_id: { in: ids } } }) : [];
        const mapBy = new Map<string, any>(maps.map((m: any) => [m.gl_account_id, m]));
        const rows = accounts.map((a: any) => {
            const m = mapBy.get(a.id);
            return {
                id: a.id,
                account_code: a.account_code,
                his_ledger_name: a.account_name,
                tally_ledger_name: a.tally_ledger_name || m?.tally_ledger_name || a.account_name,
                tally_group: a.tally_group || mapAccountTypeToTallyGroup(a.account_type),
                account_type: a.account_type,
                sync_status: m?.sync_status || 'pending',
                error_message: m?.error_message || null,
                last_synced_at: m?.last_synced_at || null,
            };
        });
        return { success: true, data: serialize(rows) };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

export async function getTallySyncLogs(opts?: { limit?: number }) {
    try {
        const { db } = await requireRoleAndTenant(TALLY_ROLES);
        const logs = await db.tallySyncLog.findMany({ orderBy: { created_at: 'desc' }, take: Math.min(200, opts?.limit || 50) });
        return { success: true, data: serialize(logs) };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

// Validate that the company's Tally has the required voucher types (after any override).
export async function validateTallyVoucherTypes() {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(TALLY_ROLES);
        const resolved = await resolveTallyConfig(db, organizationId);
        if (!resolved?.conn.url) return { success: false, error: 'Tally Server URL not configured.' };
        const probe = buildVoucherTypeProbeXml();
        const result = await postToTally(resolved.conn, probe, { timeoutMs: 15000 });
        await logSync(db, organizationId, { entity_type: 'connection', action: 'test_connection', status: result.ok ? 'success' : 'failed', request_payload: probe, response_payload: result.raw, error_message: result.ok ? null : result.message, created_by: session.username });
        if (!result.ok) return { success: false, error: result.message };

        const raw = result.raw || '';
        const found = new Set<string>();
        let m: RegExpExecArray | null;
        const reAttr = /<VOUCHERTYPE[^>]*\bNAME="([^"]+)"/gi;
        while ((m = reAttr.exec(raw))) found.add(m[1].trim().toLowerCase());
        const reName = /<NAME[^>]*>([^<]+)<\/NAME>/gi;
        while ((m = reName.exec(raw))) found.add(m[1].trim().toLowerCase());

        const required = ['Sales', 'Receipt', 'Payment', 'Journal', 'Contra'];
        const map = resolved.voucherTypeMap || {};
        // Only flag missing when we actually parsed some types (avoid false negatives).
        const missing = found.size > 0 ? required.filter((r) => !found.has((map[r] || r).toLowerCase())) : [];
        return {
            success: true,
            data: {
                found: [...found],
                missing,
                message: missing.length
                    ? `Missing voucher types in Tally: ${missing.join(', ')}. Create them in Tally or map custom names in settings.`
                    : found.size > 0
                        ? 'All required voucher types exist in the Tally company.'
                        : 'Connected, but could not read voucher types (Tally returned no parseable list).',
            },
        };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}

// HIS vs Tally reconciliation: posted vouchers (by type) compared to sync status.
export async function getTallyReconciliation(opts?: { from?: string; to?: string }) {
    try {
        const { db } = await requireRoleAndTenant(TALLY_ROLES);
        const where: any = { status: 'Posted' };
        if (opts?.from || opts?.to) {
            where.entry_date = {};
            if (opts.from) where.entry_date.gte = new Date(opts.from);
            if (opts.to) where.entry_date.lte = new Date(opts.to + 'T23:59:59.999');
        }
        const entries = await db.gL_JournalEntry.findMany({ where, select: { id: true, entry_type: true, total_debit: true } });
        const ids = entries.map((e: any) => e.id);
        const maps = ids.length ? await db.tallyVoucherMapping.findMany({ where: { gl_journal_entry_id: { in: ids } } }) : [];
        const mapBy = new Map<string, any>(maps.map((m: any) => [m.gl_journal_entry_id, m]));

        const byType: Record<string, { type: string; his_count: number; his_total: number; synced: number; failed: number; pending: number }> = {};
        let his_total = 0, synced = 0, failed = 0, pending = 0;
        for (const e of entries) {
            const vt = tallyVoucherType(e.entry_type);
            const b = byType[vt] || (byType[vt] = { type: vt, his_count: 0, his_total: 0, synced: 0, failed: 0, pending: 0 });
            const amt = Number(e.total_debit || 0);
            b.his_count++; b.his_total += amt; his_total += amt;
            const st = mapBy.get(e.id)?.sync_status || 'pending';
            if (st === 'synced') { b.synced++; synced++; }
            else if (st === 'failed') { b.failed++; failed++; }
            else { b.pending++; pending++; }
        }
        return {
            success: true,
            data: serialize({
                his_count: entries.length,
                his_total,
                synced,
                failed,
                pending,
                in_sync: failed === 0 && pending === 0,
                byType: Object.values(byType),
            }),
        };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Not authorized.' : e.message };
    }
}
