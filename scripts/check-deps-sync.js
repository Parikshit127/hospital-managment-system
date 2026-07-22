#!/usr/bin/env node
/**
 * Detects when node_modules/@prisma/client is out of sync with package.json.
 *
 * Why this script exists:
 *   When teammates push a Prisma version bump in package.json, `git pull`
 *   updates package.json but leaves node_modules untouched. The dev server
 *   then loads the OLD installed client, and routes that touch newer Prisma
 *   APIs fail with confusing 404s / 500s.
 *
 * This runs before `npm run dev` and prints a single clear instruction
 * if a mismatch is detected. Exits 0 (non-blocking) so dev can still try.
 */
const fs = require('fs');
const path = require('path');

function readJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return null;
    }
}

const root = path.resolve(__dirname, '..');
const pkg = readJSON(path.join(root, 'package.json'));
if (!pkg) process.exit(0);

// Running a Node major outside `engines` breaks in ways that never point back
// at the Node version. The one that cost us real time was
//   TypeError: controller[kState].transformAlgorithm is not a function
// thrown from Node's own web-streams internals on Node 24, with every frame
// ignore-listed so the stack named nothing in this repo. CI, Docker and EC2 all
// pin a supported major, so this only ever bites local dev.
const declaredEngine = pkg.engines?.node || '';
const declaredMajor = (declaredEngine.match(/(\d+)/) || [])[1];
const runningMajor = process.versions.node.split('.')[0];
if (declaredMajor && runningMajor !== declaredMajor) {
    console.error('\n\x1b[33m┌───────────────────────────────────────────────────────────────────┐\x1b[0m');
    console.error('\x1b[33m│ ⚠  Unsupported Node version.                                      │\x1b[0m');
    console.error('\x1b[33m├───────────────────────────────────────────────────────────────────┤\x1b[0m');
    console.error('\x1b[33m│ \x1b[0m' + `running=v${process.versions.node}  engines=${declaredEngine}`.padEnd(65) + '\x1b[33m │\x1b[0m');
    console.error('\x1b[33m├───────────────────────────────────────────────────────────────────┤\x1b[0m');
    console.error('\x1b[33m│ Symptom: TypeError: controller[kState].transformAlgorithm is not  │\x1b[0m');
    console.error('\x1b[33m│ a function — thrown from Node internals, stack shows no app code. │\x1b[0m');
    console.error('\x1b[33m│ \x1b[0m' + `Fix:  install Node ${declaredMajor} LTS, then re-run npm install.`.padEnd(65) + '\x1b[33m │\x1b[0m');
    console.error('\x1b[33m└───────────────────────────────────────────────────────────────────┘\x1b[0m\n');
}

const declaredPrisma = (pkg.dependencies?.['@prisma/client'] || '').replace(/^[~^]/, '');
const declaredCli = (pkg.dependencies?.['prisma'] || '').replace(/^[~^]/, '');

const installedPrisma = readJSON(path.join(root, 'node_modules/@prisma/client/package.json'))?.version;
const installedCli = readJSON(path.join(root, 'node_modules/prisma/package.json'))?.version;

const mismatches = [];
if (declaredPrisma && installedPrisma && declaredPrisma.split('.')[0] !== installedPrisma.split('.')[0]) {
    mismatches.push(`@prisma/client  declared=${declaredPrisma}  installed=${installedPrisma}`);
}
if (declaredCli && installedCli && declaredCli.split('.')[0] !== installedCli.split('.')[0]) {
    mismatches.push(`prisma          declared=${declaredCli}  installed=${installedCli}`);
}

if (mismatches.length > 0) {
    console.error('\n\x1b[33m┌───────────────────────────────────────────────────────────────────┐\x1b[0m');
    console.error('\x1b[33m│ ⚠  Dependency version mismatch detected (major-version drift).    │\x1b[0m');
    console.error('\x1b[33m├───────────────────────────────────────────────────────────────────┤\x1b[0m');
    for (const m of mismatches) {
        console.error('\x1b[33m│ \x1b[0m' + m.padEnd(65) + '\x1b[33m │\x1b[0m');
    }
    console.error('\x1b[33m├───────────────────────────────────────────────────────────────────┤\x1b[0m');
    console.error('\x1b[33m│ This typically causes 404s on routes that hit the new Prisma API.│\x1b[0m');
    console.error('\x1b[33m│ Fix:  npm run setup                                               │\x1b[0m');
    console.error('\x1b[33m└───────────────────────────────────────────────────────────────────┘\x1b[0m\n');
}

process.exit(0); // never block — just warn
