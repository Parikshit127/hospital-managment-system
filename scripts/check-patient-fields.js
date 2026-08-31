/**
 * Keeps the patient edit forms and the server allowlist in step.
 *   node scripts/check-patient-fields.js
 *
 * The admin patient screen rendered Nationality, Govt Proof Type and Govt Proof
 * Number in edit mode but seeded none of them into its draft, so all three
 * opened EMPTY however much the record held. Nothing linked the form to the
 * list, so the drift was invisible. This asserts every field a form edits is in
 * app/lib/patient-fields.ts (which is what both the seed and the server
 * allowlist are built from).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── The one list ─────────────────────────────────────────────────────────────
const listSrc = read('app/lib/patient-fields.ts');
const known = new Set(
    // Both `NAME = [ ... ] as const;` arrays, however the names are wrapped.
    [...listSrc.matchAll(/EDITABLE_PATIENT[A-Z_]* = \[([\s\S]*?)\] as const;/g)]
        .flatMap(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]))
);
assert.ok(known.size > 20, `expected a populated field list, parsed ${known.size}`);

// The three that were silently blank. Regression guard.
for (const f of ['nationality', 'govt_id_type', 'govt_id_number', 'address', 'city', 'state', 'pincode', 'country']) {
    assert.ok(known.has(f), `"${f}" must be an editable patient field`);
}

// ── What the admin form actually edits ───────────────────────────────────────
const overview = read('app/admin/patients/[patientId]/tabs/OverviewTab.tsx');
const rendered = [...new Set(
    [...overview.matchAll(/field: *["']([a-z_]+)["']/g)].map(m => m[1])
)];
assert.ok(rendered.length > 15, `expected many rendered fields, parsed ${rendered.length}`);

const orphans = rendered.filter(f => !known.has(f));
assert.deepStrictEqual(orphans, [],
    `The admin patient form edits ${orphans.length} field(s) missing from ` +
    `app/lib/patient-fields.ts: ${orphans.join(', ')}. They will render blank in ` +
    `edit mode and the server will silently drop them on save. Add them to the list.`);

// ── The admin screen must seed from the list, not a hand-written copy ────────
const adminPage = read('app/admin/patients/[patientId]/page.tsx');
assert.ok(adminPage.includes('buildPatientDraft('),
    'admin patient screen must seed its edit draft via buildPatientDraft() — a ' +
    'hand-written seed is what drifted last time');

// ── The server allowlists must come from the list too ────────────────────────
const receptionActions = read('app/actions/reception-actions.ts');
assert.ok(receptionActions.includes('EDITABLE_PATIENT_FIELDS'),
    'updatePatientField must use the shared allowlist');
assert.ok(receptionActions.includes('ALL_EDITABLE_PATIENT_FIELDS'),
    'updatePatient must use the shared allowlist');

console.log(`patient field check: OK (${known.size} editable fields, ${rendered.length} rendered, none orphaned)`);
