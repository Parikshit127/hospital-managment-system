/**
 * Guards the Edit/Cancel Audit Report against dead filters.
 *   node scripts/check-audit-actions.js
 *
 * The report filters `system_audit_logs.action` against a hardcoded list, and
 * nothing links that list to the code that writes the rows. Options therefore
 * rot into filters that always return "No audit records found": CANCEL_BILL,
 * WRITE_OFF, DELETE_INVOICE, EDIT_INVOICE, CREDIT_NOTE_CREATED, STOCK_ADJUSTED
 * and VOID_PAYMENT were all dead on arrival, and 'DISCOUNT_APPLIED' never
 * matched because the writer logs it lowercase (the filter is case-sensitive).
 *
 * This asserts every action offered by the report is one some code actually writes.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const AUDIT_ACTIONS = path.join(APP, 'lib', 'audit-actions.ts');

// ── What the report offers ───────────────────────────────────────────────────
const src = fs.readFileSync(AUDIT_ACTIONS, 'utf8');
const listed = [...new Set(
    [...src.matchAll(/actions: *\[([^\]]*)\]/g)]
        .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
)];
assert.ok(listed.length > 20, `expected a populated action list, parsed ${listed.length}`);

// ── What the code actually writes ────────────────────────────────────────────
// Only files that touch the audit table / helpers count as writers; a screen
// that merely lists action names for a dropdown is a consumer, not a source.
const WRITER = /system_audit_logs|logAudit|logCriticalAction|logAuthEvent/;
const emitted = new Set();
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (p === AUDIT_ACTIONS) continue;
        const text = fs.readFileSync(p, 'utf8');
        if (!WRITER.test(text)) continue;
        // Matches `action: 'X'` and the ternary form `action: cond ? 'X' : 'Y'`.
        for (const m of text.matchAll(
            /action: *(?:[^,\n]*?\? *)?['"`]([A-Za-z][A-Za-z0-9_]*)['"`](?: *: *['"`]([A-Za-z][A-Za-z0-9_]*)['"`])?/g
        )) {
            if (m[1]) emitted.add(m[1]);
            if (m[2]) emitted.add(m[2]);
        }
    }
})(APP);
assert.ok(emitted.size > 50, `expected to find many emitted actions, found ${emitted.size}`);

// ── The assertion ────────────────────────────────────────────────────────────
const dead = listed.filter(a => !emitted.has(a));
assert.deepStrictEqual(dead, [],
    `The audit report offers ${dead.length} filter(s) that no code ever writes, so they ` +
    `return an empty report every time: ${dead.join(', ')}.\n` +
    `Fix by removing them from AUDIT_ACTION_GROUPS, correcting the spelling/case, ` +
    `or logging them where the change actually happens.`);

// Case matters: Prisma's `action: { in: [...] }` is case-sensitive.
for (const a of listed) {
    const clash = [...emitted].find(e => e !== a && e.toLowerCase() === a.toLowerCase());
    assert.ok(!clash, `"${a}" is listed but the code writes "${clash}" — the filter is case-sensitive`);
}

// The two the client reported. Both must stay reachable.
assert.ok(listed.includes('CANCEL_INVOICE'), 'bill cancellation must be reportable');
assert.ok(listed.includes('CANCEL_ADMISSION') && listed.includes('FORCE_CANCEL_ADMISSION'),
    'admission cancellation must be reportable however it was cancelled — an admin ' +
    'force-cancel is the row this report exists to surface');

console.log(`audit action check: OK (${listed.length} filter actions, all written somewhere in app/)`);
