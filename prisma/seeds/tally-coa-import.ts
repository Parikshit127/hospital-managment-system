/**
 * Idempotent import of the client's real Tally chart of accounts (37 groups,
 * 346 ledgers — see prisma/seeds/tally-import-data.ts for provenance and the
 * two flagged ambiguity notes) into GL_Account for a given organization.
 *
 * This is ADDITIVE, not a replacement: the existing generic control accounts
 * seeded by chart-of-accounts-seed.ts (1110 Cash, 1120 Bank, 1130/1140/1150
 * Receivables, 3110 Vendors Payable, 3120 GST Payable, 6000-6900 Income
 * heads, 8000-8960 Expense heads) are left untouched — gl-actions.ts hardcodes
 * those specific codes for automated postings (postInvoiceToGL,
 * postPaymentToGL, postExpenseToGL, etc.) and must keep working unmodified.
 * The Tally-imported tree is a separate, more granular reference/management
 * layer (browsable and editable in /finance/chart-of-accounts) that the real
 * finance team recognizes from their own books — it does not yet receive
 * automated postings itself.
 *
 * Safe to re-run: every group/ledger is looked up by (account_code,
 * organizationId) before creating, so a second run creates nothing new.
 *
 * Usage:
 *   ORGANIZATION_ID=<id> npx tsx prisma/seeds/tally-coa-import.ts
 *   ORGANIZATION_ID=<id> npx tsx prisma/seeds/tally-coa-import.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { TALLY_GROUPS, TALLY_LEDGERS, EXPECTED_GROUP_COUNT, EXPECTED_LEDGER_COUNT, type TallyAccountType } from './tally-import-data';

const prisma = new PrismaClient();

function normalBalanceFor(accountType: TallyAccountType): 'Debit' | 'Credit' {
  return accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit';
}

function slugify(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  const dryRun = process.argv.includes('--dry-run');
  if (!organizationId) {
    console.error('Usage: ORGANIZATION_ID=<id> npx tsx prisma/seeds/tally-coa-import.ts [--dry-run]');
    process.exit(1);
  }

  if (TALLY_GROUPS.length !== EXPECTED_GROUP_COUNT || TALLY_LEDGERS.length !== EXPECTED_LEDGER_COUNT) {
    console.error(`Data file integrity check failed: expected ${EXPECTED_GROUP_COUNT} groups / ${EXPECTED_LEDGER_COUNT} ledgers, found ${TALLY_GROUPS.length} / ${TALLY_LEDGERS.length}. Aborting.`);
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!org) {
    console.error(`Organization ${organizationId} not found. Aborting.`);
    process.exit(1);
  }
  console.log(`Target org: ${org.name} (${org.id})${dryRun ? ' [DRY RUN]' : ''}`);

  const codeToId = new Map<string, string>(); // TLY-XXX group code -> GL_Account.id
  let groupsCreated = 0;
  let groupsSkipped = 0;

  // Pass 1: create all group nodes without parent_id (parents may not exist yet)
  for (const g of TALLY_GROUPS) {
    const existing = await prisma.gL_Account.findFirst({
      where: { organizationId, account_code: g.code },
    });
    if (existing) {
      codeToId.set(g.code, existing.id);
      groupsSkipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] would create group ${g.code} "${g.name}" (${g.account_type})`);
      groupsCreated++;
      continue;
    }
    const created = await prisma.gL_Account.create({
      data: {
        organizationId,
        account_code: g.code,
        account_name: g.name,
        account_type: g.account_type,
        account_group: g.name,
        normal_balance: normalBalanceFor(g.account_type),
        tally_group: g.name,
        tally_ledger_name: null,
        is_active: true,
      },
    });
    codeToId.set(g.code, created.id);
    groupsCreated++;
  }

  // Pass 2: set parent_id now that every group has an id
  let parentLinksSet = 0;
  if (!dryRun) {
    for (const g of TALLY_GROUPS) {
      if (!g.parent_code) continue;
      const id = codeToId.get(g.code);
      const parentId = codeToId.get(g.parent_code);
      if (!id || !parentId) continue;
      await prisma.gL_Account.update({ where: { id }, data: { parent_id: parentId } });
      parentLinksSet++;
    }
  }

  // Pass 3: create ledgers, linked to their resolved group
  let ledgersCreated = 0;
  let ledgersSkipped = 0;
  const usedCodes = new Set<string>();

  for (const l of TALLY_LEDGERS) {
    const group = TALLY_GROUPS.find((g) => g.code === l.group_code);
    if (!group) {
      console.error(`Ledger "${l.name}" references unknown group_code ${l.group_code} — skipping.`);
      continue;
    }

    let code = `TLY-LEDGER-${slugify(l.name)}`;
    if (usedCodes.has(code)) {
      let n = 2;
      while (usedCodes.has(`${code}-${n}`)) n++;
      code = `${code}-${n}`;
    }
    usedCodes.add(code);

    const existing = await prisma.gL_Account.findFirst({
      where: { organizationId, account_code: code },
    });
    if (existing) {
      ledgersSkipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would create ledger ${code} "${l.name}" under ${l.group_code}`);
      ledgersCreated++;
      continue;
    }

    const parentId = codeToId.get(l.group_code);
    await prisma.gL_Account.create({
      data: {
        organizationId,
        account_code: code,
        account_name: l.name,
        account_type: group.account_type,
        account_group: group.name,
        parent_id: parentId,
        normal_balance: normalBalanceFor(group.account_type),
        tally_group: group.name,
        tally_ledger_name: l.name,
        is_active: true,
      },
    });
    ledgersCreated++;
  }

  console.log('--- Import summary ---');
  console.log(`Groups: ${groupsCreated} created, ${groupsSkipped} already existed, ${parentLinksSet} parent links set`);
  console.log(`Ledgers: ${ledgersCreated} created, ${ledgersSkipped} already existed`);
  console.log(dryRun ? 'DRY RUN — nothing was written.' : 'Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
