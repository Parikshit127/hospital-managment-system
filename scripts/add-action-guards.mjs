#!/usr/bin/env node
/**
 * Insert a role guard into every mutating server action that lacks one.
 *
 * Reads are left alone: they already run through the tenant-scoped client, so
 * they cannot cross hospitals, and guarding them would break the many screens
 * that legitimately read another module's data (a nurse reading lab results,
 * a doctor reading a bill). Mutations are where the damage is.
 *
 * Usage:  node scripts/add-action-guards.mjs [--apply]
 * Without --apply it only reports.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR = 'app/actions';
const APPLY = process.argv.includes('--apply');

// Verbs that change something. Deliberately explicit rather than "not a getter"
// so a new naming style fails closed in the checker instead of silently
// slipping through here.
const MUTATION = /^(create|add|update|edit|delete|remove|cancel|approve|reject|apply|post|settle|save|set|assign|unassign|generate|issue|record|submit|send|dispatch|schedule|reschedule|start|stop|close|open|finalize|finalise|void|reverse|refund|transfer|admit|discharge|allocate|deallocate|release|claim|complete|acknowledge|escalate|resolve|link|unlink|import|upload|sync|process|confirm|verify|activate|deactivate|archive|restore|merge|split|adjust|reconcile|break|write|mark|toggle|move|swap|clone|duplicate|bulk|seed|reset|revoke|grant|enable|disable)/i;

const files = readdirSync(DIR).filter(f => f.endsWith('.ts')).sort();
let touchedFiles = 0, added = 0, skippedGuarded = 0, reads = 0, total = 0, helpers = 0;
const report = [];

for (const file of files) {
    const path = join(DIR, file);
    let src = readFileSync(path, 'utf8');
    if (!/^\s*['"]use server['"]/m.test(src.slice(0, 200))) continue;

    const moduleKey = basename(file, '.ts');
    const lines = src.split('\n');
    const insertions = [];

    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^export async function (\w+)\s*\(/);
        if (!m) continue;
        total++;
        const name = m[1];

        // Find the line whose brace opens the BODY, not a brace inside the
        // parameter list. `function f(data: { a: string })` has its first `{`
        // in a type annotation — inserting there produced 2,109 syntax errors
        // on the first attempt. Track paren depth: the body brace is the first
        // `{` seen once the parameter list has closed.
        let bodyStart = -1;
        let paren = 0, seenParen = false;
        outer:
        for (let j = i; j < Math.min(lines.length, i + 60); j++) {
            for (const ch of lines[j]) {
                if (ch === '(') { paren++; seenParen = true; }
                else if (ch === ')') { paren--; }
                else if (ch === '{' && seenParen && paren === 0) { bodyStart = j; break outer; }
            }
        }
        if (bodyStart < 0) continue;

        // Already guarded within the first few lines of the body?
        const head = lines.slice(bodyStart, bodyStart + 8).join('\n');
        if (head.includes('denyUnlessRole') || head.includes('guardAction')) { skippedGuarded++; continue; }

        if (!MUTATION.test(name)) { reads++; continue; }

        // Internal helpers, not client entry points: they are called from
        // inside another action with a transaction handle, and have their own
        // return shapes. Guarding them changes those shapes and breaks callers.
        const sig = lines.slice(i, bodyStart + 1).join(' ');
        if (/\(\s*(dbOrTx|tx|db)\s*[:,)]/.test(sig)) { helpers++; continue; }

        insertions.push({ at: bodyStart + 1, name });
    }

    if (!insertions.length) continue;

    for (const ins of insertions.reverse()) {
        lines.splice(ins.at, 0,
            `    const __denied = await guardAction('${moduleKey}', '${ins.name}');`,
            `    if (__denied) return __denied;`);
        added++;
    }
    src = lines.join('\n');

    if (!src.includes("from '@/app/lib/action-guard'")) {
        // The directive is not always the first line — some files open with
        // eslint-disable comments — and line endings may be CRLF, so anchor on
        // the line rather than the start of the file.
        const out = src.split('\n');
        const di = out.findIndex(l => /^\s*['"]use server['"]/.test(l));
        if (di < 0) { console.error(`  !! ${file}: no 'use server' line, skipped`); continue; }
        out.splice(di + 1, 0, '', "import { guardAction } from '@/app/lib/action-guard';");
        src = out.join('\n');
    }

    report.push(`  ${file}: +${insertions.length}`);
    touchedFiles++;
    if (APPLY) writeFileSync(path, src);
}

console.log(report.join('\n'));
console.log(`\nfiles touched: ${touchedFiles}`);
console.log(`actions seen: ${total} | guards added: ${added} | already guarded: ${skippedGuarded} | reads left alone: ${reads} | internal helpers skipped: ${helpers}`);
console.log(APPLY ? '\nAPPLIED.' : '\nDry run. Re-run with --apply to write.');
