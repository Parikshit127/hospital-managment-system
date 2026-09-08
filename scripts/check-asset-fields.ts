/**
 * Asset register per-category columns.
 *
 * The Add Asset form, the register table, the import template and the import
 * validator all read one registry (app/lib/asset-fields.ts). If a category's
 * column list and the validator disagree, the failure is quiet: the template
 * downloads columns the importer then discards, and every row imports with
 * half its data blank. This asserts they line up.
 *
 * Run: npx tsx scripts/check-asset-fields.ts
 */
import assert from 'node:assert/strict';
import {
    assetFieldsFor, assetFieldsForAll, assetTemplateHeaders, assetTemplateSample,
    deriveAssetName, KNOWN_ASSET_CATEGORIES,
} from '../app/lib/asset-fields';
import { validateAssetRows } from '../app/lib/import/master-validators';

// --- the hospital's sheet, column for column -------------------------------
const SHEET = [
    'asset_type', 'manufacturer', 'model_number', 'serial_number', 'department',
    'location', 'assigned_to', 'cpu_details', 'ram', 'storage', 'operating_system',
    'vendor_name', 'working_status', 'condition', 'notes',
];
assert.deepEqual(assetFieldsFor('Computer/Laptop').map(f => f.key), SHEET,
    'Computer/Laptop no longer matches the IT inventory sheet');
assert.equal(assetFieldsFor('computer/laptop')[0].label, 'Asset Type', 'category lookup is case-sensitive');
assert.equal(assetFieldsFor('Computer/Laptop')[1].label, 'Brand', 'manufacturer should read "Brand" here');

// s_no leads the template because it is the import upsert key.
assert.equal(assetTemplateHeaders('Computer/Laptop')[0], 's_no');
assert.deepEqual(assetTemplateHeaders('Computer/Laptop'),
    ['s_no', 'asset_code', 'category', ...SHEET, 'access_code']);

// Every category the register seeds must have real columns, and every template
// header must have a sample cell — a header with no sample means a silent gap.
for (const name of KNOWN_ASSET_CATEGORIES) {
    const fields = assetFieldsFor(name);
    assert.ok(fields.length > 0, `${name} has no columns`);
    const sample = assetTemplateSample(name);
    for (const h of assetTemplateHeaders(name)) {
        assert.ok(h in sample, `${name} template header "${h}" has no sample cell`);
    }
    assert.equal(new Set(fields.map(f => f.key)).size, fields.length, `${name} lists a column twice`);
}

// An unknown category still renders a usable form rather than nothing.
assert.ok(assetFieldsFor('Ambulances').length > 0, 'unknown category fell through to an empty form');
assert.ok(assetFieldsForAll([]).length > 0, 'empty register showed no columns at all');

// The union keeps first-seen order and does not repeat a shared column.
const union = assetFieldsForAll(['Computer/Laptop', 'Housekeeping']).map(f => f.key);
assert.equal(union[0], 'asset_type', 'union lost first-seen order');
assert.equal(new Set(union).size, union.length, 'union repeated a column');

// --- asset_name is NOT NULL, and the sheet has no such column --------------
assert.equal(deriveAssetName({ asset_type: 'Laptop', manufacturer: 'Dell', model_number: 'Latitude 5420' }),
    'Laptop Dell Latitude 5420');
assert.equal(deriveAssetName({ asset_name: 'Reception PC', manufacturer: 'Dell' }), 'Reception PC',
    'an explicit name must win over the derived one');
assert.equal(deriveAssetName({}), '', 'nothing to build a name from must be empty, not "undefined"');

// --- the importer validates against the row's own category ----------------
const ok = validateAssetRows([{
    s_no: '', asset_code: 'ASSET-IT-001', category: 'Computer/Laptop',
    asset_type: 'Laptop', manufacturer: 'Dell', model_number: 'Latitude 5420',
    serial_number: 'SN-7788XJ22', department: 'Accounts', location: '2nd Floor - Room 204',
    assigned_user: 'ignored — not a column', ram: '8 GB', storage: '512 GB SSD',
    operating_system: 'Windows 11 Pro', vendor_name: 'ABC Computers Pvt Ltd',
    working_status: 'Working', condition: 'Good', notes: 'Example row',
}]);
assert.equal(ok.errors.length, 0, `valid Computer/Laptop row rejected: ${JSON.stringify(ok.errors)}`);
assert.equal(ok.valid[0].s_no, undefined, 'a blank s_no must mean "create", not 0');
assert.equal(ok.valid[0].asset_name, 'Laptop Dell Latitude 5420');
assert.equal(ok.valid[0].ram, '8 GB');

// A Computer/Laptop row needs no acquisition cost; a Housekeeping row does.
const noCost = validateAssetRows([{ category: 'Housekeeping', asset_name: 'Wheelchair' }]);
assert.equal(noCost.valid.length, 0, 'Housekeeping row passed without a cost or date');
assert.match(noCost.errors[0].reason, /acquisition_cost is required/);

// asset_type is the one required Computer/Laptop column.
const noType = validateAssetRows([{ category: 'Computer/Laptop', manufacturer: 'Dell' }]);
assert.equal(noType.valid.length, 0, 'Computer/Laptop row passed with no asset type');
assert.match(noType.errors[0].reason, /asset_type is required/);

// s_no is the upsert key, so a repeat inside one file would overwrite silently.
const dupe = validateAssetRows([
    { s_no: '4', category: 'Computer/Laptop', asset_type: 'Laptop' },
    { s_no: '4', category: 'Computer/Laptop', asset_type: 'Desktop' },
]);
assert.equal(dupe.valid.length, 1, 'a duplicate s_no was allowed through');
assert.match(dupe.errors[0].reason, /used twice/);

// The key must reach the DB as a number — the upsert lookup queries an Int column.
const keyed = validateAssetRows([{ s_no: '7', category: 'Computer/Laptop', asset_type: 'Laptop' }]);
assert.equal(keyed.valid[0].s_no, 7);
assert.equal(typeof keyed.valid[0].s_no, 'number');

console.log('OK — asset field registry, template and importer agree.');
