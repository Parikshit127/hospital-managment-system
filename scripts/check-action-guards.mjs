#!/usr/bin/env node
/**
 * Every mutating server action must carry a role guard.
 *
 * Authorization here was route-based only: proxy.ts decides which pages a role
 * may open, and nothing checked the role when an action ran. A server action is
 * a POST to whatever route the caller is standing on, so any role allowed on
 * that page could invoke any action reachable from it. A nurse discharged a
 * patient and settled a bill that way.
 *
 * Reads are exempt. They run through the tenant-scoped client so they cannot
 * cross hospitals, and guarding them would break the screens that legitimately
 * read another module's data.
 *
 * Fails with the file:line of anything unguarded, so a new action cannot ship
 * without a decision about who may run it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR = 'app/actions';
const MUTATION = /^(create|add|update|edit|delete|remove|cancel|approve|reject|apply|post|settle|save|set|assign|unassign|generate|issue|record|submit|send|dispatch|schedule|reschedule|start|stop|close|open|finalize|finalise|void|reverse|refund|transfer|admit|discharge|allocate|deallocate|release|claim|complete|acknowledge|escalate|resolve|link|unlink|import|upload|sync|process|confirm|verify|activate|deactivate|archive|restore|merge|split|adjust|reconcile|break|write|mark|toggle|move|swap|clone|duplicate|bulk|seed|reset|revoke|grant|enable|disable)/i;

const offenders = [];
let guarded = 0, reads = 0, helpers = 0;

for (const file of readdirSync(DIR).filter(f => f.endsWith('.ts')).sort()) {
    const src = readFileSync(join(DIR, file), 'utf8');
    if (!/^\s*['"]use server['"]/m.test(src.slice(0, 200))) continue;
    const lines = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^export async function (\w+)\s*\(/);
        if (!m) continue;
        const name = m[1];
        if (!MUTATION.test(name)) { reads++; continue; }

        let bodyStart = -1, paren = 0, seenParen = false;
        outer:
        for (let j = i; j < Math.min(lines.length, i + 60); j++) {
            for (const ch of lines[j]) {
                if (ch === '(') { paren++; seenParen = true; }
                else if (ch === ')') paren--;
                else if (ch === '{' && seenParen && paren === 0) { bodyStart = j; break outer; }
            }
        }
        if (bodyStart < 0) continue;

        const sig = lines.slice(i, bodyStart + 1).join(' ');
        if (/\(\s*(dbOrTx|tx|db)\s*[:,)]/.test(sig)) { helpers++; continue; }

        const head = lines.slice(bodyStart, bodyStart + 10).join('\n');
        if (head.includes('denyUnlessRole') || head.includes('guardAction')) { guarded++; continue; }

        offenders.push({ file, line: i + 1, name });
    }
}

if (offenders.length) {
    console.error('\nMutating server actions with no role guard:\n');
    for (const o of offenders) console.error(`  ${DIR}/${o.file}:${o.line}  ${o.name}()`);
    console.error(`\n${offenders.length} unguarded. Add one of:`);
    console.error(`  const denied = await guardAction('<module>', '<action>'); if (denied) return denied;`);
    console.error(`  const denied = await denyUnlessRole(ROLES, 'do the thing'); if (denied) return denied;`);
    console.error(`Policy lives in app/lib/action-policy.ts.\n`);
    process.exit(1);
}

console.log(`check-action-guards: ${guarded} mutating actions guarded, ${reads} reads exempt, ${helpers} internal helpers exempt.`);
