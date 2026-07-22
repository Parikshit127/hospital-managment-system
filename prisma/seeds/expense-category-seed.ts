/**
 * Seeds ExpenseCategory rows mapped to the real Tally expense ledgers already
 * imported by tally-coa-import.ts (must be run first). Creates a 2-level
 * hierarchy mirroring the Tally groups: a parent ExpenseCategory per expense
 * group (Direct Expenses, Indirect Expenses, Purchase Accounts, Employee
 * Benefit), and one child ExpenseCategory per leaf ledger, each with
 * gl_expense_account_id set so postExpenseToGL posts to the correct
 * category-specific ledger instead of the generic 8000 fallback.
 *
 * Safe to re-run: looked up by (code, organizationId) before creating.
 *
 * Usage: ORGANIZATION_ID=<id> npx tsx prisma/seeds/expense-category-seed.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPENSE_TALLY_GROUPS = ['Direct Expenses', 'Indirect Expenses', 'Purchase Accounts', 'Employee Benefit'];

function codeFor(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  const dryRun = process.argv.includes('--dry-run');
  if (!organizationId) {
    console.error('Usage: ORGANIZATION_ID=<id> npx tsx prisma/seeds/expense-category-seed.ts [--dry-run]');
    process.exit(1);
  }

  // Parent group accounts (the 4 Tally groups themselves) — GL_Account rows with no
  // parent among the expense set (i.e. the group node, not a leaf ledger under it).
  const groupAccounts = await prisma.gL_Account.findMany({
    where: {
      organizationId,
      account_type: 'Expense',
      tally_ledger_name: null,
      tally_group: { in: EXPENSE_TALLY_GROUPS },
    },
  });

  if (groupAccounts.length === 0) {
    console.error('No matching Tally expense group accounts found. Run tally-coa-import.ts for this org first.');
    process.exit(1);
  }

  const parentCategoryIdByGroupName = new Map<string, number>();
  let parentsCreated = 0;
  let parentsSkipped = 0;

  for (const group of groupAccounts) {
    const code = `TLY_GRP_${codeFor(group.account_name)}`;
    const existing = await prisma.expenseCategory.findUnique({
      where: { code_organizationId: { code, organizationId } },
    });
    if (existing) {
      parentCategoryIdByGroupName.set(group.account_name, existing.id);
      parentsSkipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] would create parent category "${group.account_name}" (${code})`);
      parentsCreated++;
      continue;
    }
    const created = await prisma.expenseCategory.create({
      data: { name: group.account_name, code, organizationId },
    });
    parentCategoryIdByGroupName.set(group.account_name, created.id);
    parentsCreated++;
  }

  // Leaf ledgers — real expense accounts imported from Tally, each becomes a
  // selectable expense category mapped straight to its GL ledger.
  const leafAccounts = await prisma.gL_Account.findMany({
    where: {
      organizationId,
      account_type: 'Expense',
      tally_ledger_name: { not: null },
      tally_group: { in: EXPENSE_TALLY_GROUPS },
    },
  });

  let leafCreated = 0;
  let leafSkipped = 0;
  let leafOrphaned = 0;

  for (const leaf of leafAccounts) {
    const code = codeFor(leaf.account_name);
    const existing = await prisma.expenseCategory.findUnique({
      where: { code_organizationId: { code, organizationId } },
    });
    if (existing) {
      if (existing.gl_expense_account_id !== leaf.id && !dryRun) {
        await prisma.expenseCategory.update({
          where: { id: existing.id },
          data: { gl_expense_account_id: leaf.id },
        });
      }
      leafSkipped++;
      continue;
    }

    const parentId = leaf.tally_group ? parentCategoryIdByGroupName.get(leaf.tally_group) : undefined;
    if (!parentId) {
      console.warn(`No parent category resolved for ledger "${leaf.account_name}" (tally_group: ${leaf.tally_group}) — creating without a parent.`);
      leafOrphaned++;
    }

    if (dryRun) {
      console.log(`[dry-run] would create category "${leaf.account_name}" (${code}) under parent ${leaf.tally_group}, linked to GL account ${leaf.account_code}`);
      leafCreated++;
      continue;
    }

    await prisma.expenseCategory.create({
      data: {
        name: leaf.account_name,
        code,
        organizationId,
        parent_id: parentId,
        gl_expense_account_id: leaf.id,
      },
    });
    leafCreated++;
  }

  console.log('--- Expense category seed summary ---');
  console.log(`Parent categories: ${parentsCreated} created, ${parentsSkipped} already existed`);
  console.log(`Leaf categories: ${leafCreated} created, ${leafSkipped} already existed/updated, ${leafOrphaned} without a resolved parent`);
  console.log(dryRun ? 'DRY RUN — nothing was written.' : 'Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
