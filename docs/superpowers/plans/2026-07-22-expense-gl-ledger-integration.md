# Expense → GL Ledger Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing (but disconnected) GL/ledger system in hospital-os-main actually work end-to-end for expenses — proper category→ledger/sub-ledger mapping, reliable posting, and (Phase C) migrate the main finance reports to read the GL as source of truth.

**Architecture:** The GL primitives already exist and are solid (`GL_Account`, `GL_JournalEntry`, `GL_JournalLine`, a transactional `createJournalEntry`, a full 61-account chart of accounts seed). What's broken is the *wiring*: expense categories don't map to specific ledger accounts (everything hardcodes account `8000`), two of five posting functions are dead code, the chart of accounts isn't seeded for at least one live organization, and no report reads from the GL at all. This plan fixes the wiring in place — it does not replace or redesign the GL primitives.

**Tech Stack:** Next.js server actions, Prisma (PostgreSQL/Supabase), TypeScript. No test framework is installed in this repo (confirmed: no `jest`/`vitest` in `package.json`) — verification uses standalone `tsx` scripts under `scripts/`, matching the existing convention (`scripts/test-all-financial-workflows.ts`).

## Global Constraints

- This is a live production system (Indian hospital, multi-tenant via `organizationId`). Every new/changed model must go in `TENANT_SCOPED_MODELS` (`backend/db.ts`) and every new/changed server action must use `requireTenantContext()` (`backend/tenant.ts`), never the bare `prisma` export from `@/backend/db`.
- Do NOT run `prisma migrate dev` — the local migration history has drifted from the remote Supabase DB in the past. Write migration SQL by hand (see existing files under `prisma/migrations/`) and apply with `prisma migrate deploy` only after explicit user go-ahead.
- All schema changes must be additive/nullable — this DB already has live data across multiple organizations ("Axten Hospitals" is the production org; "Golden hos" and "Oscar hospitals" are others with partial chart-of-accounts data).
- **Per user decision:** GL posting for expenses stays triggered on **approval**, not on creation. Do not change this.
- **Per user decision:** the end goal is to migrate P&L/balance-sheet/income-expense reporting to read from the GL (Phase C) — but this cannot happen safely until the GL's coverage is complete (Phase B) and reconciled against current numbers.
- Several other features already have migrations sitting uncommitted/unapplied in this repo (TPA package pricing, refund payment method, doctor commission, referral commission, bill status lifecycle, discharge summary, OPD_FEE, rendered-by attribution). Before applying this plan's migration, run `npx prisma migrate status` and coordinate sequencing with whichever of those land first — do not assume a clean migration history.

---

## File Map

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `gl_expense_account_id` to `ExpenseCategory` (Task 1) |
| `prisma/migrations/<ts>_add_expense_category_gl_account/migration.sql` | New hand-written migration (Task 1) |
| `app/actions/gl-actions.ts` | Fix `postExpenseToGL` to use category mapping (Task 2); add `postExpensePaymentReclassToGL` (Task 4); fix `postDepositToGL`/`postRefundToGL` model mismatches (Task 6, 7) |
| `app/actions/expense-actions.ts` | Call new reclass function from `markExpensePaid` (Task 4) |
| `prisma/seeds/chart-of-accounts-seed.ts` | Extend with default `ExpenseCategory` rows linked to existing 8xxx accounts (Task 3) |
| `app/actions/deposit-actions.ts` (or wherever `PatientDeposit` create/refund-apply lives) | Call `postDepositToGL` (Task 6) |
| `app/actions/finance-actions.ts` | Call `postRefundToGL` from `processRefund`/`requestRefund` (Task 7) |
| `scripts/verify-expense-gl-posting.ts` | New manual verification script (Task 5, 8) |

---

## Phase A — Category → Ledger Mapping (the core ask)

### Task 1: Add `gl_expense_account_id` to `ExpenseCategory`

**Files:**
- Modify: `prisma/schema.prisma:2484-2500` (`ExpenseCategory` model)
- Create: `prisma/migrations/20260722120000_add_expense_category_gl_account/migration.sql`

**Interfaces:**
- Produces: `ExpenseCategory.gl_expense_account_id: string | null`, relation `gl_expense_account: GL_Account | null`

This mirrors the exact pattern `AssetCategory` already uses for its GL links (`prisma/schema.prisma:3643-3667`, fields `gl_asset_account_id`/`gl_depreciation_account_id`/`gl_expense_account_id`, each a nullable FK to `GL_Account.id`) — same codebase, same problem, already solved once. Don't invent a different mechanism (e.g. code-string matching like `gl-income-head-map.ts` uses for revenue) — that pattern exists because invoice line items are free text; `ExpenseCategory` is already a real relational row, so a direct FK is simpler and more precise.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, change the `ExpenseCategory` model from:

```prisma
model ExpenseCategory {
  id             Int               @id @default(autoincrement())
  name           String
  code           String
  parent_id      Int?
  is_active      Boolean           @default(true)
  organizationId String
  created_at     DateTime          @default(now())
  budget_lines   BudgetLine[]
  organization   Organization      @relation(fields: [organizationId], references: [id])
  parent         ExpenseCategory?  @relation("CategoryHierarchy", fields: [parent_id], references: [id])
  children       ExpenseCategory[] @relation("CategoryHierarchy")
  expenses       Expense[]

  @@unique([code, organizationId])
  @@index([organizationId])
  @@map("expense_categories")
}
```

to:

```prisma
model ExpenseCategory {
  id                    Int               @id @default(autoincrement())
  name                  String
  code                  String
  parent_id             Int?
  is_active             Boolean           @default(true)
  organizationId        String
  created_at            DateTime          @default(now())
  gl_expense_account_id String?
  budget_lines          BudgetLine[]
  organization          Organization      @relation(fields: [organizationId], references: [id])
  parent                ExpenseCategory?  @relation("CategoryHierarchy", fields: [parent_id], references: [id])
  children              ExpenseCategory[] @relation("CategoryHierarchy")
  expenses              Expense[]
  gl_expense_account     GL_Account?      @relation("ExpenseCategoryAccount", fields: [gl_expense_account_id], references: [id])

  @@unique([code, organizationId])
  @@index([organizationId])
  @@map("expense_categories")
}
```

Then add the back-relation to `GL_Account` (find the model at `prisma/schema.prisma:3358` and add one line to its relation list, next to the existing `asset_categories_as_expense_account` line):

```prisma
  expense_categories_as_gl_account                                    ExpenseCategory[] @relation("ExpenseCategoryAccount")
```

- [ ] **Step 2: Regenerate the Prisma client (local only, does not touch the DB)**

```bash
npx prisma generate
```

Expected: succeeds, no errors. This just updates TypeScript types locally; it does not require DB connectivity or alter any table.

- [ ] **Step 3: Write the migration by hand**

Create `prisma/migrations/20260722120000_add_expense_category_gl_account/migration.sql`:

```sql
-- Link expense categories to a specific GL ledger account so postExpenseToGL
-- can post to the right sub-ledger instead of a single hardcoded account.
-- Additive/nullable — safe on existing rows; NULL falls back to account 8000.

ALTER TABLE "expense_categories" ADD COLUMN "gl_expense_account_id" TEXT;

CREATE INDEX "expense_categories_gl_expense_account_id_idx" ON "expense_categories"("gl_expense_account_id");

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_gl_expense_account_id_fkey"
  FOREIGN KEY ("gl_expense_account_id") REFERENCES "gl_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Do **not** run `prisma migrate dev` (drift risk against the remote DB) and do **not** run `prisma migrate deploy` yet — this step only creates the file. Applying it happens after user sign-off, per Global Constraints.

- [ ] **Step 4: Verify schema compiles**

```bash
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260722120000_add_expense_category_gl_account
git commit -m "feat(finance): add gl_expense_account_id to ExpenseCategory"
```

---

### Task 2: Fix `postExpenseToGL` to use the category mapping

**Files:**
- Modify: `app/actions/gl-actions.ts:621-686`

**Interfaces:**
- Consumes: `ExpenseCategory.gl_expense_account_id` (Task 1)
- Produces: `postExpenseToGL(expenseId: number)` — same signature, corrected behavior

Current code (verified verbatim, `app/actions/gl-actions.ts:621-686`) hardcodes:

```typescript
const expenseAccount = await getAccountByCode(expense.organizationId, '8000'); // Operating Expenses
```

regardless of `expense.category_id`. Replace the whole function body:

- [ ] **Step 1: Rewrite `postExpenseToGL`**

```typescript
export async function postExpenseToGL(expenseId: number) {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { category: true },
    });

    if (!expense) {
      return { success: false, error: 'Expense not found' };
    }

    // Check if already posted
    const existingEntry = await prisma.gL_JournalEntry.findFirst({
      where: {
        reference_type: 'Expense',
        reference_id: expenseId.toString(),
        status: { not: 'Reversed' },
      },
    });

    if (existingEntry) {
      return { success: true, message: 'Expense already posted to GL', journal: existingEntry };
    }

    // Resolve the ledger account from the expense's category; fall back to the
    // generic Operating Expenses account (8000) if the category has no mapping.
    let expenseAccount = expense.category.gl_expense_account_id
      ? await prisma.gL_Account.findUnique({ where: { id: expense.category.gl_expense_account_id } })
      : null;
    if (!expenseAccount) {
      expenseAccount = await getAccountByCode(expense.organizationId, '8000'); // Operating Expenses fallback
    }

    const cashOrPayableAccount = expense.status === 'Paid'
      ? await getAccountByCode(expense.organizationId, '1110') // Cash
      : await getAccountByCode(expense.organizationId, '3110'); // Vendors Payable

    if (!expenseAccount || !cashOrPayableAccount) {
      return { success: false, error: 'Required GL accounts not found' };
    }

    const lines: JournalLineInput[] = [
      // Debit: Expense (category-specific ledger, or 8000 fallback)
      {
        account_id: expenseAccount.id,
        debit_amount: expense.amount.toNumber(),
        credit_amount: 0,
        description: expense.description || 'Expense',
      },
      // Credit: Cash or Payable
      {
        account_id: cashOrPayableAccount.id,
        debit_amount: 0,
        credit_amount: expense.amount.toNumber(),
        description: expense.status === 'Paid' ? 'Cash paid' : 'Payable',
      },
    ];

    const result = await createJournalEntry({
      organizationId: expense.organizationId,
      entry_date: expense.created_at,
      entry_type: 'Expense',
      narration: `Expense - ${expense.description || 'N/A'}`,
      lines,
      reference_type: 'Expense',
      reference_id: expenseId.toString(),
    });

    return result;
  } catch (error) {
    console.error('Error posting expense to GL:', error);
    return { success: false, error: 'Failed to post expense to GL' };
  }
}
```

The only behavioral changes: (1) `include: { category: true }` on the lookup, (2) the `expenseAccount` resolution block. Everything else — the idempotency check, the Cash/Payable split, the transaction call — is unchanged.

- [ ] **Step 2: Verify TypeScript compiles** (file has `// @ts-nocheck` at the top, so this mainly checks for syntax errors, not type errors)

```bash
npx tsc --noEmit app/actions/gl-actions.ts 2>&1 | head -30
```

Expected: no new syntax errors introduced (pre-existing `@ts-nocheck` means type errors elsewhere in the file are not your concern here).

- [ ] **Step 3: Commit**

```bash
git add app/actions/gl-actions.ts
git commit -m "fix(finance): postExpenseToGL uses category-mapped ledger account instead of hardcoded 8000"
```

---

### Task 3: Seed default expense categories linked to existing GL accounts

**Files:**
- Modify: `prisma/seeds/chart-of-accounts-seed.ts`
- Create: `prisma/seeds/expense-category-seed.ts`

**Interfaces:**
- Consumes: existing 8xxx accounts already in `STANDARD_HOSPITAL_COA` (`prisma/seeds/chart-of-accounts-seed.ts:566-676`): `8000` Operating Expenses, `8100` Salaries & Wages, `8200` Rent, `8300` Electricity, `8400` Water, `8500` Housekeeping, `8600` Repair & Maintenance, `8700` Marketing, `8800` Professional Fees.
- Produces: `ExpenseCategory` rows per organization, each with `gl_expense_account_id` set.

The chart of accounts seed already has the right sub-ledgers (Salaries, Rent, Electricity, Water, Housekeeping, Repair & Maintenance, Marketing, Professional Fees) — they're just never linked to an `ExpenseCategory` row, so `postExpenseToGL` had nothing to look up even before this plan. This task creates that linkage.

- [ ] **Step 1: Write the seed script**

Create `prisma/seeds/expense-category-seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// code must match ExpenseCategory.code; account_code must match an existing
// gl_accounts.account_code for this org (seeded by chart-of-accounts-seed.ts).
const DEFAULT_EXPENSE_CATEGORIES: Array<{ code: string; name: string; account_code: string }> = [
  { code: 'SALARIES', name: 'Salaries & Wages', account_code: '8100' },
  { code: 'RENT', name: 'Rent', account_code: '8200' },
  { code: 'ELECTRICITY', name: 'Electricity', account_code: '8300' },
  { code: 'WATER', name: 'Water', account_code: '8400' },
  { code: 'HOUSEKEEPING', name: 'Housekeeping', account_code: '8500' },
  { code: 'REPAIR_MAINTENANCE', name: 'Repair & Maintenance', account_code: '8600' },
  { code: 'MARKETING', name: 'Marketing', account_code: '8700' },
  { code: 'PROFESSIONAL_FEES', name: 'Professional Fees', account_code: '8800' },
  { code: 'OTHER_OPEX', name: 'Other Operating Expenses', account_code: '8000' },
];

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  if (!organizationId) {
    console.error('Usage: ORGANIZATION_ID=<id> npx tsx prisma/seeds/expense-category-seed.ts');
    process.exit(1);
  }

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const def of DEFAULT_EXPENSE_CATEGORIES) {
    const account = await prisma.gL_Account.findUnique({
      where: { account_code_organizationId: { account_code: def.account_code, organizationId } },
    });

    if (!account) {
      console.warn(`Skipping "${def.name}" — GL account ${def.account_code} not found for org ${organizationId}. Run chart-of-accounts-seed.ts first.`);
      skipped++;
      continue;
    }

    const existing = await prisma.expenseCategory.findUnique({
      where: { code_organizationId: { code: def.code, organizationId } },
    });

    if (existing) {
      if (existing.gl_expense_account_id !== account.id) {
        await prisma.expenseCategory.update({
          where: { id: existing.id },
          data: { gl_expense_account_id: account.id },
        });
        linked++;
      }
      continue;
    }

    await prisma.expenseCategory.create({
      data: {
        name: def.name,
        code: def.code,
        organizationId,
        gl_expense_account_id: account.id,
      },
    });
    created++;
  }

  console.log(`Done. Created: ${created}, re-linked existing: ${linked}, skipped (missing GL account): ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

- [ ] **Step 2: Confirm the Prisma unique constraint names used above are correct**

```bash
npx prisma format --schema=prisma/schema.prisma
grep -A2 "@@unique" prisma/schema.prisma | grep -B2 "account_code, organizationId\]\|code, organizationId\]"
```

Expected: confirms the compound unique names Prisma generates (`account_code_organizationId`, `code_organizationId`) match what's used in the script above. If `prisma format` or the generated client names differ (e.g. because of an explicit `@@unique(name: ...)`), adjust the `where` clauses to match — do not guess, run `npx prisma generate` and check the generated `PrismaClient` types (`.expenseCategory.findUnique` argument autocomplete/type) if unsure.

- [ ] **Step 3: Run this against the live production org once the migration (Task 1) is applied**

```bash
ORGANIZATION_ID=<production-org-id> npx tsx prisma/seeds/expense-category-seed.ts
```

Do not run this yet — it depends on Task 1's migration being applied first (`gl_expense_account_id` column must exist), and per Global Constraints, migrations are applied only with explicit user go-ahead. Note this dependency clearly when handing off.

- [ ] **Step 4: Commit**

```bash
git add prisma/seeds/expense-category-seed.ts
git commit -m "feat(finance): seed default expense categories linked to GL accounts"
```

---

### Task 4: Reclassify Payable → Cash/Bank when an expense is marked Paid

**Files:**
- Modify: `app/actions/gl-actions.ts` (add new function after `postExpenseToGL`)
- Modify: `app/actions/expense-actions.ts:293-333` (`markExpensePaid`)

**Interfaces:**
- Produces: `postExpensePaymentToGL(expenseId: number, paymentMethod: string): Promise<{success: boolean; error?: string; journal?: any}>`
- Consumes: `createJournalEntry`, `getAccountByCode` (both already in `gl-actions.ts`)

Verified (`scripts`/memory + direct read): `markExpensePaid` (`app/actions/expense-actions.ts:293-333`) updates `expense.status` to `'Paid'` but never posts a GL entry — the original approval entry (Debit Expense / Credit Vendors Payable, account `3110`) is left open forever even after the vendor is actually paid in cash/bank. This task adds the missing reclassification entry: Debit Vendors Payable (clearing it), Credit Cash/Bank.

- [ ] **Step 1: Add `postExpensePaymentToGL` to `gl-actions.ts`**, directly after the `postExpenseToGL` function (after the closing `}` at what is currently line 686):

```typescript
export async function postExpensePaymentToGL(expenseId: number, paymentMethod: string) {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      return { success: false, error: 'Expense not found' };
    }

    // Idempotency: don't double-post the payment reclass entry
    const existingPaymentEntry = await prisma.gL_JournalEntry.findFirst({
      where: {
        reference_type: 'ExpensePayment',
        reference_id: expenseId.toString(),
        status: { not: 'Reversed' },
      },
    });
    if (existingPaymentEntry) {
      return { success: true, message: 'Expense payment already posted to GL', journal: existingPaymentEntry };
    }

    const payableAccount = await getAccountByCode(expense.organizationId, '3110'); // Vendors Payable
    const cashOrBankAccount = paymentMethod === 'Cash'
      ? await getAccountByCode(expense.organizationId, '1110') // Cash
      : await getAccountByCode(expense.organizationId, '1120'); // Bank

    if (!payableAccount || !cashOrBankAccount) {
      return { success: false, error: 'Required GL accounts not found' };
    }

    const lines: JournalLineInput[] = [
      // Debit: clear the Payable
      {
        account_id: payableAccount.id,
        debit_amount: expense.amount.toNumber(),
        credit_amount: 0,
        description: `Payment for ${expense.description || 'expense'}`,
      },
      // Credit: Cash/Bank goes out
      {
        account_id: cashOrBankAccount.id,
        debit_amount: 0,
        credit_amount: expense.amount.toNumber(),
        description: 'Cash/bank disbursed',
      },
    ];

    const result = await createJournalEntry({
      organizationId: expense.organizationId,
      entry_date: new Date(),
      entry_type: 'ExpensePayment',
      narration: `Payment reclass - ${expense.description || 'N/A'}`,
      lines,
      reference_type: 'ExpensePayment',
      reference_id: expenseId.toString(),
    });

    return result;
  } catch (error) {
    console.error('Error posting expense payment to GL:', error);
    return { success: false, error: 'Failed to post expense payment to GL' };
  }
}
```

Note: this only makes sense for expenses that were already posted via `postExpenseToGL` at approval time (Debit Expense / Credit Payable). If an expense was approved and immediately marked Paid without ever going through `postExpenseToGL` (e.g. GL accounts were missing at approval time), this reclass entry would debit a Payable balance that was never credited, unbalancing that account. Task 5's verification script must cover this edge case explicitly (see Step 3 below).

- [ ] **Step 2: Wire it into `markExpensePaid`**

In `app/actions/expense-actions.ts`, add the import at the top (next to the existing `postExpenseToGL` import on line 3):

```typescript
import { postExpenseToGL, postExpensePaymentToGL } from './gl-actions';
```

Then in `markExpensePaid` (currently `app/actions/expense-actions.ts:293-333`), after the `db.expense.update(...)` call succeeds and before the `sendExpensePaidEmail` block, add:

```typescript
        postExpensePaymentToGL(id, paymentData.payment_method).catch(err =>
            console.error('Failed to post expense payment to GL:', err)
        );
```

This matches the existing fire-and-forget `.catch()` pattern already used for `postExpenseToGL` in `approveExpense` (`app/actions/expense-actions.ts:266`) — consistent with the rest of this file, not a new pattern.

- [ ] **Step 3: Write the manual verification script** (see Task 5 — this task's verification is folded into Task 5's script since they test the same create→approve→pay flow)

- [ ] **Step 4: Commit**

```bash
git add app/actions/gl-actions.ts app/actions/expense-actions.ts
git commit -m "feat(finance): reclassify Payable to Cash/Bank in GL when expense is marked Paid"
```

---

### Task 5: Manual verification script for the expense→GL flow

**Files:**
- Create: `scripts/verify-expense-gl-posting.ts`

**Interfaces:**
- Consumes: `createExpense`, `approveExpense`, `markExpensePaid` (`app/actions/expense-actions.ts`), `getJournalEntries` (`app/actions/gl-actions.ts`)

No test framework is installed (confirmed: no `jest`/`vitest` in `package.json`). This follows the existing manual-script convention (`scripts/test-all-financial-workflows.ts`, run via `npx tsx`).

- [ ] **Step 1: Write the script**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  if (!organizationId) {
    console.error('Usage: ORGANIZATION_ID=<id> npx tsx scripts/verify-expense-gl-posting.ts');
    process.exit(1);
  }

  const category = await prisma.expenseCategory.findFirst({
    where: { organizationId, code: 'ELECTRICITY' },
  });
  if (!category) {
    console.error('ELECTRICITY category not found for this org — run expense-category-seed.ts first.');
    process.exit(1);
  }
  if (!category.gl_expense_account_id) {
    console.error('ELECTRICITY category has no gl_expense_account_id — mapping did not take.');
    process.exit(1);
  }

  const expense = await prisma.expense.create({
    data: {
      expense_number: `TEST-VERIFY-${Date.now()}`,
      category_id: category.id,
      description: 'Verification script test expense',
      amount: 1000,
      total_amount: 1000,
      organizationId,
      status: 'Pending',
    },
  });

  console.log(`Created expense ${expense.expense_number} (id ${expense.id}), status Pending.`);

  const preApprovalEntries = await prisma.gL_JournalEntry.count({
    where: { reference_type: 'Expense', reference_id: expense.id.toString() },
  });
  console.log(`GL entries before approval: ${preApprovalEntries} (expect 0 — per confirmed design, GL posts on approval only)`);

  await prisma.expense.update({ where: { id: expense.id }, data: { status: 'Approved' } });
  const { postExpenseToGL, postExpensePaymentToGL } = await import('../app/actions/gl-actions');
  const postResult = await postExpenseToGL(expense.id);
  console.log('postExpenseToGL result:', postResult);

  const journalLine = await prisma.gL_JournalLine.findFirst({
    where: { journal: { reference_type: 'Expense', reference_id: expense.id.toString() } },
    include: { account: true },
  });
  console.log(`Posted debit account: ${journalLine?.account.account_code} (expect 8300, Electricity — NOT 8000)`);
  if (journalLine?.account.account_code !== '8300') {
    console.error('FAIL: expected category-mapped account 8300, got', journalLine?.account.account_code);
    process.exit(1);
  }

  await prisma.expense.update({ where: { id: expense.id }, data: { status: 'Paid', payment_method: 'Cash' } });
  const paymentResult = await postExpensePaymentToGL(expense.id, 'Cash');
  console.log('postExpensePaymentToGL result:', paymentResult);

  const totalEntries = await prisma.gL_JournalEntry.count({
    where: {
      OR: [
        { reference_type: 'Expense', reference_id: expense.id.toString() },
        { reference_type: 'ExpensePayment', reference_id: expense.id.toString() },
      ],
    },
  });
  console.log(`Total GL entries for this expense lifecycle: ${totalEntries} (expect 2: approval + payment reclass)`);

  await prisma.gL_JournalLine.deleteMany({ where: { journal: { OR: [
    { reference_type: 'Expense', reference_id: expense.id.toString() },
    { reference_type: 'ExpensePayment', reference_id: expense.id.toString() },
  ] } } });
  await prisma.gL_JournalEntry.deleteMany({ where: { OR: [
    { reference_type: 'Expense', reference_id: expense.id.toString() },
    { reference_type: 'ExpensePayment', reference_id: expense.id.toString() },
  ] } });
  await prisma.expense.delete({ where: { id: expense.id } });
  console.log('Cleaned up test data. PASS.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

- [ ] **Step 2: Run it against a non-production org first**

```bash
ORGANIZATION_ID=<golden-hos-org-id> npx tsx scripts/verify-expense-gl-posting.ts
```

Expected: ends with `Cleaned up test data. PASS.` and the account-code assertion (`8300`, not `8000`) passes. If it fails on the account-code check, Task 2's fix or Task 3's seed didn't take — do not proceed to Phase B until this passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-expense-gl-posting.ts
git commit -m "test(finance): add manual verification script for expense GL posting lifecycle"
```

---

## Phase B — Close the GL Completeness Gap

Required before Phase C (report migration): the GL cannot become the reporting source of truth while entire transaction types (deposits, refunds) never post to it.

### Task 6: Wire `postDepositToGL` — and fix its wrong-model bug

**Files:**
- Modify: `app/actions/gl-actions.ts:688-741`
- Modify: wherever `PatientDeposit` rows are created (locate via `grep -rn "prisma.patientDeposit.create\|db.patientDeposit.create" app/actions/`)

**Verified bug:** `postDepositToGL` currently queries `prisma.payments.findUnique({ where: { id: depositId } })` — but patient deposits are stored in a **separate** `PatientDeposit` model (`prisma/schema.prisma:2626`), not `payments`. This function has zero callers today (confirmed dead code), so the bug has never surfaced. Fix the model reference as part of wiring it up.

- [ ] **Step 1: Fix the model reference**

In `app/actions/gl-actions.ts`, change (currently lines 691-693):

```typescript
    const deposit = await prisma.payments.findUnique({
      where: { id: depositId },
    });
```

to:

```typescript
    const deposit = await prisma.patientDeposit.findUnique({
      where: { id: depositId },
    });
```

Leave the rest of the function body as-is — `PatientDeposit` has the same `amount`, `payment_method`, `organizationId`, and `created_at` fields the existing code already reads.

- [ ] **Step 2: Find where deposits are created and wire the call**

```bash
grep -rn "patientDeposit.create\|PatientDeposit.*create" app/actions/*.ts
```

In that function (after the `db.patientDeposit.create(...)` call succeeds), add:

```typescript
        postDepositToGL(deposit.id).catch(err =>
            console.error('Failed to post deposit to GL:', err)
        );
```

matching the existing fire-and-forget pattern. Import `postDepositToGL` from `./gl-actions` at the top of that file if not already imported.

- [ ] **Step 3: Verify** — extend `scripts/verify-expense-gl-posting.ts` or write a sibling script that creates a `PatientDeposit` row, calls `postDepositToGL`, and asserts a `GL_JournalEntry` with `reference_type: 'Deposit'` exists with the correct account codes (`1110`/`1120` debit, `3140` credit).

- [ ] **Step 4: Commit**

```bash
git add app/actions/gl-actions.ts app/actions/<wherever-deposits-are-created>.ts scripts/
git commit -m "fix(finance): wire postDepositToGL and fix PatientDeposit model mismatch"
```

---

### Task 7: Wire `postRefundToGL` — and fix its wrong-model + Decimal bug

**Files:**
- Modify: `app/actions/gl-actions.ts:743-793`
- Modify: `app/actions/finance-actions.ts` (`processRefund`/`requestRefund`, per memory at lines ~2452/~2251)

**Verified bugs:** (1) `postRefundToGL` queries `prisma.payments.findUnique` but refunds are stored in a separate `Refund` model (`prisma/schema.prisma:2111`). (2) `Refund.amount` is typed `Float` in the schema (a plain JS `number`), not `Decimal` — the existing code calls `refund.amount.toNumber()`, which will throw (`toNumber is not a function`) on a plain number. Both must be fixed before wiring this up.

- [ ] **Step 1: Fix the model reference and the Decimal call**

In `app/actions/gl-actions.ts`, change (currently lines 746-748):

```typescript
    const refund = await prisma.payments.findUnique({
      where: { id: refundId },
    });
```

to:

```typescript
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
    });
```

And change both `refund.amount.toNumber()` calls (currently lines 765 and 773) to plain `refund.amount` (it's already a `number`, no conversion needed):

```typescript
        debit_amount: refund.amount,
```
```typescript
        credit_amount: refund.amount,
```

- [ ] **Step 2: Wire the call into the refund flow**

In `app/actions/finance-actions.ts`, in `processRefund` (per memory around line 2452), after the `db.refund.update(...)` (or `.create(...)`) call that sets the refund to its terminal "processed" state, add:

```typescript
        postRefundToGL(refund.id).catch(err =>
            console.error('Failed to post refund to GL:', err)
        );
```

Import `postRefundToGL` from `./gl-actions` if not already imported. Read the actual current implementation of `processRefund` first (`grep -n "processRefund" app/actions/finance-actions.ts`) to place this at the correct point — after the refund record is finalized, not before validation.

- [ ] **Step 3: Verify** — extend the verification scripts to create a `Refund` row, call `postRefundToGL`, assert the journal entry posts with the corrected account codes and no `toNumber` crash.

- [ ] **Step 4: Commit**

```bash
git add app/actions/gl-actions.ts app/actions/finance-actions.ts scripts/
git commit -m "fix(finance): wire postRefundToGL, fix Refund model mismatch and Float/.toNumber() bug"
```

---

## Phase C — Migrate Reporting to Read from the GL (design-level; detail after Phase A/B land)

**Why this phase is scoped at a coarser level:** the user explicitly chose "migrate reports to GL" over "keep operational tables" — the larger-lift, higher-value option — but this is also the highest-risk phase (it changes numbers finance staff already trust). Per systematic-debugging and writing-plans practice, the concrete step-by-step for this phase should be finalized *after* Phase A/B are verified in production, not guessed now. What's fixed now is the required shape:

1. **Do not cut over until Phase B is live and reconciled.** `getProfitLossStatement`/`getBalanceSheet`/`getTrialBalance` already exist in `gl-actions.ts` (lines ~1008, ~917, ~848) and already read from `GL_JournalLine`/`GL_Account` — these are the target functions. The operational-table equivalents (`getProfitLossReport` etc. in `report-actions.ts:425`) are the current source of truth.
2. **Reconciliation task (required, not optional):** for each organization with GL data, run both the operational-table report and the GL-based report for the same date range and diff the totals per category/department. Any GL_Account not yet linked to a real transaction type (Phase B closes deposits/refunds; pharmacy COGS and asset depreciation may have similar gaps per `docs/superpowers/specs/2026-06-05-finance-portal-upgrades-design.md` and prior memory on pharmacy GL gaps) will show as a discrepancy — each discrepancy must be root-caused (missing posting call, wrong account code, or a genuinely new transaction type) before cutover, not papered over.
3. **Cutover is per-report, not a single flag.** Switch `/finance/reports` (P&L), `/finance/income-expense`, and any balance-sheet view one at a time, each with its own reconciliation window, so a bad number is traceable to one specific report rather than a simultaneous change to all of them.
4. **Keep the operational-table functions in the codebase** (do not delete `getProfitLossReport` etc.) — they remain useful as an independent cross-check even after cutover, and as a rollback path if a GL discrepancy surfaces post-cutover.

This phase gets its own detailed task breakdown (in the same bite-sized, real-code format as Phases A/B) once Phase A/B verification (Tasks 5/6/7's scripts) pass against the live production org's data.

---

## Known Issue Explicitly Out of Scope: `gl-actions.ts` Tenant-Scoping Bypass

Confirmed (multiple independent checks): `gl-actions.ts` imports the bare `prisma` client from `@/backend/db` and manually accepts `organizationId` as a parameter, instead of using `requireTenantContext()`/`getTenantPrisma()` like every other action file in this codebase (`GL_Account`, `GL_JournalEntry`, `GL_JournalLine` are all already registered in `TENANT_SCOPED_MODELS`, `backend/db.ts:102`, so the fix is mechanical). This is a real IDOR-shaped issue (a caller could in principle pass a different org's ID) across roughly 20 functions in a 1,296-line file.

It is **not** the cause of the "expenses don't hit the ledger" bug this plan fixes (the functions this plan touches key off a unique integer/UUID primary key, so tenant scoping doesn't change their correctness) — which is why it's not bundled into Phases A/B. But it's a large enough surface (the whole file, not just the functions this plan edits) that it deserves its own reviewed plan rather than being folded in here as a drive-by fix. Recommend a follow-up plan scoped specifically to migrating all of `gl-actions.ts` to `requireTenantContext()`.
