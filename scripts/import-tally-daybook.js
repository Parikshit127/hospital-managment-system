#!/usr/bin/env node
/**
 * Import a Tally "Day Book" Excel export into gl_journal_entries / gl_journal_lines.
 *
 * Usage:
 *   node scripts/import-tally-daybook.js --org <organizationId> --file <path-to-xls> --dry-run
 *   node scripts/import-tally-daybook.js --org <organizationId> --file <path-to-xls>
 *
 * ALWAYS run with --dry-run first. It makes NO database writes and prints a full report:
 * every ledger that will be created as a new GL account (with the type/group it will get),
 * per-voucher-type totals, and the grand total debit/credit (must balance). Read that report
 * before dropping --dry-run to do the real import.
 *
 * What it does for real (no --dry-run):
 *   1. Creates any missing GL accounts for ledgers in the file that don't already match an
 *      existing account_name/tally_ledger_name (case-insensitive) in this organization.
 *   2. Creates one gl_journal_entries row per Tally voucher (entry_type='Manual', status='Posted',
 *      reference_type='Tally Day Book Import', journal_number continuing this org's JV-<year>-#### series),
 *      with one gl_journal_lines row per ledger line in that voucher.
 *   3. Applies the net current_balance change to every touched GL account once, at the end.
 *
 * Requires DATABASE_URL in the environment (same as the app) pointing at the target server's DB.
 */
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const prisma = new PrismaClient();

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const ORG_ID = getArg('org');
const FILE = getArg('file');
const DRY_RUN = process.argv.includes('--dry-run');
const SHEET_NAME = getArg('sheet') || 'Day Book';

if (!ORG_ID || !FILE) {
  console.error('Usage: node scripts/import-tally-daybook.js --org <organizationId> --file <path.xls> [--dry-run] [--sheet "Day Book"]');
  process.exit(1);
}

// ---- Ledger names this hospital's Day Book is already known to use, mapped to a category
// (not a literal account_group — the actual group name is resolved per-org at runtime from
// that org's own existing chart of accounts, see resolveCategoryTemplates()). Anything from
// the file NOT in this list falls back to keyword heuristics in guessCategory().
const KNOWN_CATEGORY = {
  'Axten - HQ Unit': 'BRANCH',
  'Axten Avise Hospital- Unit FINAL': 'BRANCH',
  'CSI Hospital': 'BRANCH',
  'SALARY': 'EXPENSE',
  'Professional Expenses': 'EXPENSE',
  'SATISH KUMAR PANDEY - LOAN 2': 'LOAN_LIABILITY',
  'Tata AIG General Insurance Co. Ltd.': 'CREDITOR',
  'Registration  for TPA Empanelment': 'EXPENSE',
  'One- Federal Bank Credit Card': 'CREDIT_CARD',
  'Universal Sompo General Insurance Co. Ltd': 'CREDITOR',
  'EPFO Expenses': 'EXPENSE',
  'SBI Credit Card': 'CREDIT_CARD',
  'SUMIT KUMAR - Insurance Consultant': 'CREDITOR',
  'DMB ORTHOSPORT PVT LTD': 'CREDITOR',
  'Gautam Chhabra - Imprest A/c': 'ADVANCE_ASSET',
  'GAUTAM CHHABRA': 'CREDITOR',
  'Axis Bank Credit Card': 'CREDIT_CARD',
  'MEENU MALHOTRA - GCOO': 'CREDITOR',
  'Medical Consumables & Equipments': 'EXPENSE_DIRECT',
  'ROHAN-FREELENCER': 'CREDITOR',
  'DEEPIKA SINGH -FREELENCER': 'CREDITOR',
  'Misc. Expenses': 'EXPENSE',
  'SIGNAGE WORLD': 'CREDITOR',
  'SONY AIR COOL': 'CREDITOR',
  'Marketing Exp': 'EXPENSE',
  'Fee & Subscripcation': 'EXPENSE',
  'Petrol Expenses': 'EXPENSE',
  'Shuaib - Payroll': 'STAFF',
  'Interest on FD': 'INCOME',
  'TANMAY- PAYROLL': 'STAFF',
  'Mohit- Payroll': 'STAFF',
  'Travel Exp': 'EXPENSE',
  'Repair & Maintenance - Air Conditioner': 'EXPENSE',
  'ABHISHEK BHARDWAJ': 'CREDITOR',
  'VISHWANATH': 'CREDITOR',
  'ESIC Expenses': 'EXPENSE',
  'AVANI ENTERPRISES': 'CREDITOR',
  'Donation and Charity': 'EXPENSE',
  'Conveyance Expenses': 'EXPENSE',
  'Dr. Kunal': 'CREDITOR',
  'Conference for Doctor': 'EXPENSE',
  'PF Admin Charges': 'EXPENSE',
  'MMB Partners': 'CREDITOR',
  'Kashish Enterprises': 'CREDITOR',
  'RAHUL CARESPHERE': 'CREDITOR',
  'RAVI SAROHA': 'CREDITOR',
  'Yatin - Reimbursement': 'CREDITOR',
  'JAI SHRI SAINATH - SOURABH SHRIVASTAVA': 'CREDITOR',
  'Insurance Exp': 'EXPENSE',
  'SHIVAM KUMAR': 'CREDITOR',
  'SANGAM PLASTIC INDUSTRIES PVT LTD': 'CREDITOR',
  'Kailash Service Station': 'CREDITOR',
  'TDS-RECOVERABLE-26-27': 'TDS_RECOVERABLE_ASSET',
  'INDIAN BANK - 5910': 'BANK',
  'INDIAN BANK - 4715': 'BANK',
  'Staff Recruitment Cherges': 'EXPENSE',
  'Dr. Vikram Pabreja': 'CREDITOR',
  'JMD Electricals': 'CREDITOR',
  'TDS 94J-2%': 'DUTIES_TAXES',
  'STAFF INCENTIVE': 'EXPENSE',
  'Repair & Maintenance - Telephones': 'EXPENSE',
  'BALAJI TONER SOLUTION': 'CREDITOR',
  'POLESTAR INFOSYSTEM': 'CREDITOR',
  'SHAHJAHAN for Garbage': 'CREDITOR',
};

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/payroll|paroll/.test(n)) return 'STAFF';
  if (/credit card/.test(n)) return 'CREDIT_CARD';
  if (/^tds|duties|payable.*tax|tax.*payable/.test(n)) return 'DUTIES_TAXES';
  if (/\bloan\b/.test(n)) return 'LOAN_LIABILITY';
  if (/^(indian |icici |hdfc |axis |sbi |dbs |federal |bank of|kotak).*bank/i.test(name) || /bank\b/.test(n) && /\d{3,}/.test(n)) return 'BANK';
  if (/imprest|advance a\/c/.test(n)) return 'ADVANCE_ASSET';
  if (/interest (on|from)|dividend|rent income|other income/.test(n)) return 'INCOME';
  if (/expense|exp\.?$| exp$|charges|fee|subscri|conveyance|travel|petrol|donation|repair|maintenance|insurance exp|incentive|recruitment/.test(n)) return 'EXPENSE';
  return 'CREDITOR'; // default: a named vendor/individual/company being paid — treat as a payable
}

// Inspect this org's OWN existing chart of accounts to find the real group name/type/normal_balance
// to use for each category, so new accounts match this org's actual conventions instead of a
// hardcoded guess. Falls back to a sensible generic if the org has no example of that category yet.
function resolveCategoryTemplates(accounts) {
  const byGroupCount = {};
  for (const a of accounts) {
    const key = `${a.account_type}||${a.account_group}||${a.normal_balance}`;
    byGroupCount[key] = (byGroupCount[key] || 0) + 1;
  }
  function pickBest(matchFn, fallback) {
    let best = null, bestCount = 0;
    for (const a of accounts) {
      if (!matchFn(a)) continue;
      const key = `${a.account_type}||${a.account_group}||${a.normal_balance}`;
      const c = byGroupCount[key];
      if (c > bestCount) { bestCount = c; best = { type: a.account_type, group: a.account_group, bal: a.normal_balance }; }
    }
    return best || fallback;
  }
  const isPayrollName = (a) => /payroll|paroll/i.test(a.account_name);
  return {
    CREDITOR: pickBest(a => /creditor/i.test(a.account_group || ''), { type: 'Liability', group: 'Sundry Creditors', bal: 'Credit' }),
    STAFF: pickBest(isPayrollName, { type: 'Liability', group: 'Staff Payable', bal: 'Credit' }),
    BANK: pickBest(a => a.account_type === 'Asset' && /bank/i.test(a.account_group || ''), { type: 'Asset', group: 'Bank Accounts', bal: 'Debit' }),
    CREDIT_CARD: pickBest(a => /credit card/i.test(a.account_group || ''), { type: 'Liability', group: 'Credit Card', bal: 'Credit' }),
    DUTIES_TAXES: pickBest(a => /duties.*tax/i.test(a.account_group || ''), { type: 'Liability', group: 'Duties & Taxes', bal: 'Credit' }),
    LOAN_LIABILITY: pickBest(a => a.account_type === 'Liability' && /loan/i.test(a.account_group || ''), { type: 'Liability', group: 'Loans (Liability)', bal: 'Credit' }),
    ADVANCE_ASSET: pickBest(a => a.account_type === 'Asset' && /loans.*advances|advance/i.test(a.account_group || ''), { type: 'Asset', group: 'Loans & Advances (Asset)', bal: 'Debit' }),
    TDS_RECOVERABLE_ASSET: pickBest(a => a.account_type === 'Asset' && /loans.*advances|advance/i.test(a.account_group || ''), { type: 'Asset', group: 'Loans & Advances (Asset)', bal: 'Debit' }),
    BRANCH: pickBest(a => /branch|division/i.test(a.account_group || ''), { type: 'Asset', group: 'Branch / Divisions', bal: 'Debit' }),
    EXPENSE: pickBest(a => a.account_type === 'Expense' && /indirect/i.test(a.account_group || ''), { type: 'Expense', group: 'Indirect Expenses', bal: 'Debit' }),
    EXPENSE_DIRECT: pickBest(a => a.account_type === 'Expense' && /direct/i.test(a.account_group || ''), { type: 'Expense', group: 'Direct Expenses', bal: 'Debit' }),
    INCOME: pickBest(a => a.account_type === 'Revenue', { type: 'Revenue', group: 'Indirect Incomes', bal: 'Credit' }),
  };
}

function slugCode(name) {
  return 'TLY-LEDGER-' + name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---- Parse the Day Book sheet into balanced vouchers ----
function parseDayBook(filePath, sheetName) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found. Sheets in file: ${wb.SheetNames.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

  // Find the header row (Date | Particulars | ... | Vch Type | Vch No. | Debit | Credit)
  const headerIdx = rows.findIndex(r => r[0] === 'Date' && String(r[4] || '').startsWith('Vch Type'));
  if (headerIdx === -1) throw new Error('Could not find the "Date | Particulars | ... | Vch Type | Vch No. | Debit | Credit" header row.');

  const vouchers = [];
  let cur = null;
  const anomalies = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const [date, particulars, , , vchType, vchNo, debit, credit] = r;
    const d = debit ? parseFloat(String(debit).replace(/,/g, '')) : 0;
    const c = credit ? parseFloat(String(credit).replace(/,/g, '')) : 0;

    if (vchType) {
      if (cur) vouchers.push(cur);
      if (!date) { anomalies.push({ row: i, issue: 'header row missing date', r }); cur = null; continue; }
      cur = { date, vch_type: vchType, vch_no: vchNo ? String(vchNo).trim() : '', lines: [{ ledger: String(particulars).trim(), debit: d, credit: c }], narration: [] };
    } else if (date === '' && particulars && (debit || credit)) {
      if (!cur) { anomalies.push({ row: i, issue: 'sub-line with no open voucher', r }); continue; }
      cur.lines.push({ ledger: String(particulars).trim(), debit: d, credit: c });
    } else if (!date && particulars && !debit && !credit) {
      if (cur) cur.narration.push(String(particulars).trim());
    } else if (!date && !particulars) {
      // blank spacer row
    } else {
      anomalies.push({ row: i, issue: 'unrecognized row shape', r });
    }
  }
  if (cur) vouchers.push(cur);

  const unbalanced = [];
  for (const v of vouchers) {
    v.total_debit = Math.round(v.lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
    v.total_credit = Math.round(v.lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
    if (Math.abs(v.total_debit - v.total_credit) > 0.01) unbalanced.push(v);
  }

  return { vouchers, anomalies, unbalanced };
}

async function main() {
  console.log(`Parsing "${FILE}" (sheet: "${SHEET_NAME}")...`);
  const { vouchers, anomalies, unbalanced } = parseDayBook(FILE, SHEET_NAME);
  console.log(`Parsed ${vouchers.length} vouchers. Anomalies: ${anomalies.length}. Unbalanced: ${unbalanced.length}.`);
  if (anomalies.length) console.log('Anomalies (first 10):', anomalies.slice(0, 10));
  if (unbalanced.length) {
    console.log('Unbalanced vouchers (first 10) — FIX THE FILE OR INVESTIGATE BEFORE PROCEEDING:', unbalanced.slice(0, 10));
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { id: ORG_ID }, select: { id: true, name: true } });
  if (!org) { console.error(`No organization found with id ${ORG_ID}`); process.exit(1); }
  console.log(`Target org: ${org.name} (${org.id})`);

  let accounts = await prisma.gL_Account.findMany({ where: { organizationId: ORG_ID } });
  console.log(`Org has ${accounts.length} existing GL accounts.`);

  const nameToAccount = new Map();
  for (const a of accounts) {
    if (a.account_name) nameToAccount.set(a.account_name.trim().toLowerCase(), a);
    if (a.tally_ledger_name) nameToAccount.set(a.tally_ledger_name.trim().toLowerCase(), a);
  }
  const existingCodes = new Set(accounts.map(a => a.account_code));
  const templates = resolveCategoryTemplates(accounts);

  // Collect every distinct ledger name touched, and what needs to be created
  const allLedgerNames = new Set();
  for (const v of vouchers) for (const l of v.lines) allLedgerNames.add(l.ledger.trim());

  const toCreate = [];
  const autoGuessed = [];
  for (const name of allLedgerNames) {
    if (nameToAccount.has(name.toLowerCase())) continue;
    const known = KNOWN_CATEGORY[name];
    const category = known || guessCategory(name);
    if (!known) autoGuessed.push(name);
    const tmpl = templates[category] || templates.CREDITOR;
    const code = slugCode(name);
    toCreate.push({ name, category, code, ...tmpl, codeCollision: existingCodes.has(code) });
  }

  const vchTypeStats = {};
  for (const v of vouchers) {
    vchTypeStats[v.vch_type] = vchTypeStats[v.vch_type] || { count: 0, debit: 0, credit: 0 };
    vchTypeStats[v.vch_type].count++;
    vchTypeStats[v.vch_type].debit += v.total_debit;
    vchTypeStats[v.vch_type].credit += v.total_credit;
  }
  const grandDebit = vouchers.reduce((s, v) => s + v.total_debit, 0);
  const grandCredit = vouchers.reduce((s, v) => s + v.total_credit, 0);

  console.log('\n=== REPORT ===');
  console.log('Voucher types:', JSON.stringify(vchTypeStats, null, 2));
  console.log('Grand total debit:', grandDebit.toFixed(2), '| credit:', grandCredit.toFixed(2));
  console.log(`\nNew GL accounts to create: ${toCreate.length}`);
  for (const a of toCreate) {
    console.log(`  ${a.codeCollision ? '[COLLISION] ' : ''}${a.name}  ->  ${a.type} / ${a.group} / ${a.bal}  (code: ${a.code}, category: ${a.category}${autoGuessed.includes(a.name) ? ', AUTO-GUESSED — review this one' : ''})`);
  }
  const collisions = toCreate.filter(a => a.codeCollision);
  if (collisions.length) {
    console.log(`\n!! ${collisions.length} account_code collision(s) with existing accounts — resolve before running for real.`);
  }
  if (autoGuessed.length) {
    console.log(`\n${autoGuessed.length} ledger name(s) were not in the known list and got a keyword-based guess — double check these above before the real run.`);
  }

  if (DRY_RUN) {
    console.log('\nDry run only — no database writes made. Re-run without --dry-run to actually import.');
    await prisma.$disconnect();
    return;
  }

  if (collisions.length) {
    console.error('\nAborting real run: account_code collisions must be resolved first.');
    process.exit(1);
  }

  // ---- Real run ----
  console.log('\nCreating new GL accounts...');
  for (const a of toCreate) {
    const created = await prisma.gL_Account.create({
      data: {
        organizationId: ORG_ID, account_code: a.code, account_name: a.name,
        account_type: a.type, account_group: a.group, normal_balance: a.bal,
        opening_balance: 0, current_balance: 0, tally_ledger_name: a.name, is_active: true,
      },
    });
    nameToAccount.set(a.name.toLowerCase(), created);
  }
  console.log(`Created ${toCreate.length} accounts.`);

  const last = await prisma.gL_JournalEntry.findFirst({
    where: { organizationId: ORG_ID, journal_number: { startsWith: `JV-${new Date(vouchers[0].date).getFullYear()}-` } },
    orderBy: { journal_number: 'desc' },
  });
  let nextNumber = 1;
  if (last) { const m = last.journal_number.match(/JV-\d{4}-(\d+)/); if (m) nextNumber = parseInt(m[1], 10) + 1; }

  const balanceDelta = new Map();
  let ok = 0, failed = 0;
  const failures = [];

  for (let vi = 0; vi < vouchers.length; vi++) {
    const v = vouchers[vi];
    const year = new Date(v.date).getFullYear();
    const journal_number = `JV-${year}-${String(nextNumber).padStart(4, '0')}`;
    const resolvedLines = v.lines.map(l => ({ ...l, account: nameToAccount.get(l.ledger.trim().toLowerCase()) }));
    if (resolvedLines.some(l => !l.account)) { failed++; failures.push({ voucher: v, reason: 'unresolved ledger' }); continue; }

    const narrationParts = [...new Set(v.lines.map(l => l.ledger))];
    const narration = (narrationParts.join(' / ') + (v.narration.length ? ' — ' + v.narration.join(' ') : '')).slice(0, 4000);

    try {
      await prisma.gL_JournalEntry.create({
        data: {
          organizationId: ORG_ID, journal_number,
          entry_date: new Date(v.date + 'T00:00:00.000Z'),
          entry_type: 'Manual', reference_type: 'Tally Day Book Import',
          reference_number: `${v.vch_type}${v.vch_no ? ' #' + v.vch_no : ''}`,
          narration, total_debit: v.total_debit, total_credit: v.total_credit,
          status: 'Posted', created_by: 'tally-daybook-import',
          lines: { create: resolvedLines.map((l, i) => ({ organizationId: ORG_ID, line_number: i + 1, account_id: l.account.id, debit_amount: l.debit, credit_amount: l.credit })) },
        },
      });
      for (const l of resolvedLines) {
        const change = l.account.normal_balance === 'Debit' ? (l.debit - l.credit) : (l.credit - l.debit);
        balanceDelta.set(l.account.id, (balanceDelta.get(l.account.id) || 0) + change);
      }
      ok++; nextNumber++;
    } catch (e) { failed++; failures.push({ voucher: v, reason: e.message }); }

    if ((vi + 1) % 300 === 0) console.log(`... ${vi + 1}/${vouchers.length} (ok=${ok}, failed=${failed})`);
  }

  console.log(`\nJournal entries created: ${ok}, failed: ${failed}`);
  if (failures.length) {
    const failFile = FILE.replace(/\.[^.]+$/, '') + '.import-failures.json';
    fs.writeFileSync(failFile, JSON.stringify(failures, null, 2));
    console.log(`Failures written to ${failFile}`);
  }

  console.log('Applying account balance updates...');
  let balUpdates = 0;
  for (const [accountId, delta] of balanceDelta.entries()) {
    if (Math.abs(delta) < 0.001) continue;
    await prisma.gL_Account.update({ where: { id: accountId }, data: { current_balance: { increment: delta } } });
    balUpdates++;
  }
  console.log(`Account balances updated: ${balUpdates}.`);
  console.log('\nDone.');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
