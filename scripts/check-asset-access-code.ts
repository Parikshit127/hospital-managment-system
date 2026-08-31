/**
 * Asset register "Password / Code" round-trip.
 *
 * The register stores this column encrypted and serves a mask; only the
 * admin-only reveal action decrypts. If encryptSecret/decryptSecret ever
 * drift, the failure is silent — the register keeps showing asterisks and
 * nobody notices the codes are unreadable. This asserts the round trip.
 *
 * Run: npx tsx scripts/check-asset-access-code.ts
 */
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, maskSecret } from '../app/lib/secure-config';

process.env.CONFIG_ENCRYPTION_KEY ||= process.env.JWT_SECRET || 'test-key-for-asset-code-check';

const codes = ['BIOS:hp1234', 'a', 'wifi-Axten@2026!', 'x'.repeat(64)];

for (const plain of codes) {
    const stored = encryptSecret(plain)!;
    assert.ok(stored.startsWith('enc:v1:'), `not encrypted at rest: ${stored}`);
    assert.notEqual(stored, plain, 'plaintext leaked into the stored value');
    assert.equal(decryptSecret(stored), plain, 'round trip lost the code');
    assert.ok(!maskSecret(stored).includes(plain.slice(0, 5)) || plain.length <= 8,
        `mask exposed too much of "${plain}"`);
    // Re-encrypting an already-encrypted value must not double-wrap: editAsset
    // and the bulk importer both pass whatever is in the field back through.
    assert.equal(decryptSecret(encryptSecret(stored)!), plain, 'double encryption corrupted the code');
}

// Blank must stay falsy, never become an encrypted empty string — the call
// sites rely on `encryptSecret(x) || undefined` leaving the column NULL.
assert.ok(!encryptSecret(''), 'empty code should not be encrypted');
assert.ok(!encryptSecret(undefined), 'missing code should not be encrypted');
assert.equal(maskSecret(null), '');

console.log(`✓ asset access code: encrypt/mask/decrypt round trip OK (${codes.length} cases)`);
