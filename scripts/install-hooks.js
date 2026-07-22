#!/usr/bin/env node
/**
 * Points git at the versioned .githooks directory.
 *
 * Runs from `predev`, not `prepare`, on purpose. `prepare` also fires during
 * `npm ci` in CI, in the Docker build, and on the EC2 box — none of which are
 * git working copies, or want their git config touched. Wiring it there risks
 * failing a production deploy to install a developer convenience. `predev` only
 * runs on `npm run dev`, so the hook lands on developer machines and nowhere
 * else.
 *
 * Exits 0 unconditionally: never block someone from starting the dev server
 * because a hook could not be installed.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const hooksDir = '.githooks';

try {
    if (!fs.existsSync(path.join(root, hooksDir))) process.exit(0);

    // Not a git working copy (tarball, Docker context) — nothing to configure.
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, stdio: 'ignore' });

    const current = (() => {
        try {
            return execFileSync('git', ['config', '--get', 'core.hooksPath'], {
                cwd: root,
                encoding: 'utf-8',
            }).trim();
        } catch {
            return ''; // unset — git exits 1
        }
    })();

    if (current === hooksDir) process.exit(0);

    // Don't silently hijack a hooks path someone set deliberately.
    if (current) {
        console.error(
            `\x1b[33m⚠  core.hooksPath is "${current}", leaving it alone.\x1b[0m\n` +
            `   To enable the conflict-marker guard: git config core.hooksPath ${hooksDir}`
        );
        process.exit(0);
    }

    execFileSync('git', ['config', 'core.hooksPath', hooksDir], { cwd: root, stdio: 'ignore' });
    console.log(`\x1b[32m✔\x1b[0m git hooks enabled (${hooksDir})`);
} catch {
    // Best effort only.
}

process.exit(0);
