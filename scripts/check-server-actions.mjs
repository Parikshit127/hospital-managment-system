#!/usr/bin/env node
/**
 * Every export of a 'use server' module must be an async function.
 *
 * Next.js enforces this at build time, but a violation surfaces as a runtime
 * 500 on any page whose import graph touches the file — including /api/session,
 * which takes out login for the whole app. TypeScript does not catch it, so it
 * is easy to introduce a sync helper next to the actions that use it and only
 * discover the damage in the browser.
 *
 * Usage: node scripts/check-server-actions.mjs
 * Exits non-zero and prints every offending export.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'backend', 'lib'];
const offenders = [];

function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) check(full);
    }
}

function check(file) {
    const src = readFileSync(file, 'utf8');
    // 'use server' must be the first statement for the whole module to be actions.
    const head = src.slice(0, 400);
    if (!/^\s*(['"])use server\1/m.test(head)) return;

    const lines = src.split('\n');
    lines.forEach((line, i) => {
        // Only top-level exports matter (column 0).
        if (!/^export\s/.test(line)) return;
        // Allowed: async functions, type-only exports, and re-exports.
        if (/^export\s+async\s+function\s/.test(line)) return;
        if (/^export\s+(type|interface)\s/.test(line)) return;
        if (/^export\s+\{[^}]*\}\s*(from|;)/.test(line)) return;
        if (/^export\s+\*/.test(line)) return;
        if (/^export\s+default\s+async\s/.test(line)) return;

        // Everything else is a violation: sync function, const, class, enum...
        offenders.push({
            file: relative(process.cwd(), file).replace(/\\/g, '/'),
            line: i + 1,
            text: line.trim().slice(0, 100),
        });
    });
}

for (const r of ROOTS) walk(r);

if (offenders.length) {
    console.error(`\n'use server' modules may only export async functions.`);
    console.error(`Move the following into a plain module (e.g. app/lib/…):\n`);
    for (const o of offenders) console.error(`  ${o.file}:${o.line}\n      ${o.text}`);
    console.error(`\n${offenders.length} violation(s).\n`);
    process.exit(1);
}

console.log("check-server-actions: all 'use server' exports are async functions.");
