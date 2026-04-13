import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AccountDefinition {
  account_code: string;
  account_name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  account_group: string;
  parent_code?: string;
  normal_balance: 'Debit' | 'Credit';
  tally_ledger_name: string;
  tally_group: string;
}

const STANDARD_HOSPITAL_COA: AccountDefinition[] = [
  // ========================================
  // ASSETS (1000-2999)
  // ========================================
  {
    account_code: '1000',
    account_name: 'Assets',
    account_type: 'Asset',
    account_group: 'Assets',
    normal_balance: 'Debit',
    tally_ledger_name: 'Assets',
    tally_group: 'Assets',
  },

  // Current Assets (1100-1999)
  {
    account_code: '1100',
    account_name: 'Current Assets',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Current Assets',
    tally_group: 'Current Assets',
  },
  {
    account_code: '1110',
    account_name: 'Cash in Hand',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Cash',
    tally_group: 'Cash-in-Hand',
  },
  {
    account_code: '1120',
    account_name: 'Bank Accounts',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Bank Accounts',
    tally_group: 'Bank Accounts',
  },
  {
    account_code: '1130',
    account_name: 'Patient Receivables',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Sundry Debtors - Patients',
    tally_group: 'Sundry Debtors',
  },
  {
    account_code: '1140',
    account_name: 'Corporate Receivables',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Sundry Debtors - Corporate',
    tally_group: 'Sundry Debtors',
  },
  {
    account_code: '1150',
    account_name: 'Insurance Receivables',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Sundry Debtors - Insurance/TPA',
    tally_group: 'Sundry Debtors',
  },
  {
    account_code: '1160',
    account_name: 'Pharmacy Inventory',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Stock - Pharmacy',
    tally_group: 'Stock-in-Hand',
  },
  {
    account_code: '1170',
    account_name: 'Medical Consumables Inventory',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Stock - Medical Consumables',
    tally_group: 'Stock-in-Hand',
  },
  {
    account_code: '1180',
    account_name: 'Patient Deposits (Advance)',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Patient Advances',
    tally_group: 'Current Assets',
  },
  {
    account_code: '1190',
    account_name: 'Prepaid Expenses',
    account_type: 'Asset',
    account_group: 'Current Assets',
    parent_code: '1100',
    normal_balance: 'Debit',
    tally_ledger_name: 'Prepaid Expenses',
    tally_group: 'Current Assets',
  },

  // Fixed Assets (2000-2999)
  {
    account_code: '2000',
    account_name: 'Fixed Assets',
    account_type: 'Asset',
    account_group: 'Fixed Assets',
    parent_code: '1000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Fixed Assets',
    tally_group: 'Fixed Assets',
  },
  {
    account_code: '2100',
    account_name: 'Land & Building',
    account_type: 'Asset',
    account_group: 'Fixed Assets',
    parent_code: '2000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Land & Building',
    tally_group: 'Fixed Assets',
  },
  {
    account_code: '2200',
    account_name: 'Medical Equipment',
    account_type: 'Asset',
    account_group: 'Fixed Assets',
    parent_code: '2000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Medical Equipment',
    tally_group: 'Fixed Assets',
  },
  {
    account_code: '2300',
    account_name: 'Furniture & Fixtures',
    account_type: 'Asset',
    account_group: 'Fixed Assets',
    parent_code: '2000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Furniture & Fixtures',
    tally_group: 'Fixed Assets',
  },
  {
    account_code: '2400',
    account_name: 'IT Equipment',
    account_type: 'Asset',
    account_group: 'Fixed Assets',
    parent_code: '2000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Computers & IT Equipment',
    tally_group: 'Fixed Assets',
  },
  {
    account_code: '2500',
    account_name: 'Vehicles',
    account_type: 'Asset',
    account_group: 'Fixed Assets',
    parent_code: '2000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Vehicles',
    tally_group: 'Fixed Assets',
  },
  {
    account_code: '2600',
    account_name: 'Accumulated Depreciation',
    account_type: 'Asset',
    account_group: 'Fixed Assets',
    parent_code: '2000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Accumulated Depreciation',
    tally_group: 'Fixed Assets',
  },

  // ========================================
  // LIABILITIES (3000-4999)
  // ========================================
  {
    account_code: '3000',
    account_name: 'Liabilities',
    account_type: 'Liability',
    account_group: 'Liabilities',
    normal_balance: 'Credit',
    tally_ledger_name: 'Liabilities',
    tally_group: 'Liabilities',
  },

  // Current Liabilities (3100-3999)
  {
    account_code: '3100',
    account_name: 'Current Liabilities',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Current Liabilities',
    tally_group: 'Current Liabilities',
  },
  {
    account_code: '3110',
    account_name: 'Vendors Payable',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'Sundry Creditors',
    tally_group: 'Sundry Creditors',
  },
  {
    account_code: '3120',
    account_name: 'GST Payable (CGST)',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'CGST Payable',
    tally_group: 'Duties & Taxes',
  },
  {
    account_code: '3121',
    account_name: 'GST Payable (SGST)',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'SGST Payable',
    tally_group: 'Duties & Taxes',
  },
  {
    account_code: '3122',
    account_name: 'GST Payable (IGST)',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'IGST Payable',
    tally_group: 'Duties & Taxes',
  },
  {
    account_code: '3130',
    account_name: 'TDS Payable',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'TDS Payable',
    tally_group: 'Duties & Taxes',
  },
  {
    account_code: '3140',
    account_name: 'Advance from Patients (Deposits)',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'Patient Deposits',
    tally_group: 'Current Liabilities',
  },
  {
    account_code: '3150',
    account_name: 'Salary Payable',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'Salary Payable',
    tally_group: 'Current Liabilities',
  },
  {
    account_code: '3160',
    account_name: 'Statutory Dues',
    account_type: 'Liability',
    account_group: 'Current Liabilities',
    parent_code: '3100',
    normal_balance: 'Credit',
    tally_ledger_name: 'Statutory Dues',
    tally_group: 'Current Liabilities',
  },

  // Long-term Liabilities (4000-4999)
  {
    account_code: '4000',
    account_name: 'Long-term Liabilities',
    account_type: 'Liability',
    account_group: 'Long-term Liabilities',
    parent_code: '3000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Long-term Liabilities',
    tally_group: 'Loans (Liability)',
  },
  {
    account_code: '4100',
    account_name: 'Bank Loans',
    account_type: 'Liability',
    account_group: 'Long-term Liabilities',
    parent_code: '4000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Bank Loans',
    tally_group: 'Bank OD A/c',
  },
  {
    account_code: '4200',
    account_name: 'Other Loans',
    account_type: 'Liability',
    account_group: 'Long-term Liabilities',
    parent_code: '4000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Other Loans',
    tally_group: 'Loans (Liability)',
  },

  // ========================================
  // EQUITY (5000-5999)
  // ========================================
  {
    account_code: '5000',
    account_name: 'Equity',
    account_type: 'Equity',
    account_group: 'Equity',
    normal_balance: 'Credit',
    tally_ledger_name: 'Capital Account',
    tally_group: 'Capital Account',
  },
  {
    account_code: '5100',
    account_name: 'Capital Account',
    account_type: 'Equity',
    account_group: 'Equity',
    parent_code: '5000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Capital Account',
    tally_group: 'Capital Account',
  },
  {
    account_code: '5200',
    account_name: 'Retained Earnings',
    account_type: 'Equity',
    account_group: 'Equity',
    parent_code: '5000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Retained Earnings',
    tally_group: 'Reserves & Surplus',
  },
  {
    account_code: '5300',
    account_name: 'Current Year Profit/Loss',
    account_type: 'Equity',
    account_group: 'Equity',
    parent_code: '5000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Profit & Loss A/c',
    tally_group: 'Profit & Loss A/c',
  },

  // ========================================
  // REVENUE (6000-6999)
  // ========================================
  {
    account_code: '6000',
    account_name: 'Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    normal_balance: 'Credit',
    tally_ledger_name: 'Revenue',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6100',
    account_name: 'IPD Room Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'IPD Room Charges',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6200',
    account_name: 'IPD Consultation Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'IPD Consultation',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6300',
    account_name: 'OPD Consultation Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'OPD Consultation',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6400',
    account_name: 'Laboratory Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Laboratory Services',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6500',
    account_name: 'Radiology Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Radiology Services',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6600',
    account_name: 'Pharmacy Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Pharmacy Sales',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6700',
    account_name: 'Operation Theater Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'OT Charges',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6800',
    account_name: 'Procedure Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Procedure Charges',
    tally_group: 'Sales Accounts',
  },
  {
    account_code: '6900',
    account_name: 'Other Medical Revenue',
    account_type: 'Revenue',
    account_group: 'Revenue',
    parent_code: '6000',
    normal_balance: 'Credit',
    tally_ledger_name: 'Other Medical Services',
    tally_group: 'Sales Accounts',
  },

  // ========================================
  // DIRECT EXPENSES (7000-7999)
  // ========================================
  {
    account_code: '7000',
    account_name: 'Direct Expenses',
    account_type: 'Expense',
    account_group: 'Direct Expenses',
    normal_balance: 'Debit',
    tally_ledger_name: 'Direct Expenses',
    tally_group: 'Direct Expenses',
  },
  {
    account_code: '7100',
    account_name: 'Pharmacy Purchases',
    account_type: 'Expense',
    account_group: 'Direct Expenses',
    parent_code: '7000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Pharmacy Purchases',
    tally_group: 'Purchase Accounts',
  },
  {
    account_code: '7200',
    account_name: 'Medical Consumables',
    account_type: 'Expense',
    account_group: 'Direct Expenses',
    parent_code: '7000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Medical Consumables',
    tally_group: 'Purchase Accounts',
  },
  {
    account_code: '7300',
    account_name: 'Lab Reagents',
    account_type: 'Expense',
    account_group: 'Direct Expenses',
    parent_code: '7000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Lab Reagents',
    tally_group: 'Purchase Accounts',
  },
  {
    account_code: '7400',
    account_name: 'Radiology Consumables',
    account_type: 'Expense',
    account_group: 'Direct Expenses',
    parent_code: '7000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Radiology Consumables',
    tally_group: 'Purchase Accounts',
  },

  // ========================================
  // OPERATING EXPENSES (8000-8999)
  // ========================================
  {
    account_code: '8000',
    account_name: 'Operating Expenses',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    normal_balance: 'Debit',
    tally_ledger_name: 'Operating Expenses',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8100',
    account_name: 'Salaries & Wages',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Salaries',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8200',
    account_name: 'Rent',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Rent',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8300',
    account_name: 'Electricity',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Electricity Charges',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8400',
    account_name: 'Water',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Water Charges',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8500',
    account_name: 'Housekeeping',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Housekeeping',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8600',
    account_name: 'Repair & Maintenance',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Repairs & Maintenance',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8700',
    account_name: 'Marketing',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Marketing & Advertising',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8800',
    account_name: 'Professional Fees',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Professional Fees',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8900',
    account_name: 'Depreciation',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Depreciation',
    tally_group: 'Indirect Expenses',
  },
  {
    account_code: '8950',
    account_name: 'Bank Charges',
    account_type: 'Expense',
    account_group: 'Operating Expenses',
    parent_code: '8000',
    normal_balance: 'Debit',
    tally_ledger_name: 'Bank Charges',
    tally_group: 'Indirect Expenses',
  },
];

export async function seedChartOfAccounts(organizationId: string) {
  console.log(`Seeding Chart of Accounts for organization: ${organizationId}`);

  // Create accounts in hierarchical order (parents first)
  const accountMap = new Map<string, string>(); // code -> id mapping

  for (const accountDef of STANDARD_HOSPITAL_COA) {
    const parentId = accountDef.parent_code
      ? accountMap.get(accountDef.parent_code)
      : undefined;

    const account = await prisma.gL_Account.create({
      data: {
        organizationId,
        account_code: accountDef.account_code,
        account_name: accountDef.account_name,
        account_type: accountDef.account_type,
        account_group: accountDef.account_group,
        parent_id: parentId,
        normal_balance: accountDef.normal_balance,
        tally_ledger_name: accountDef.tally_ledger_name,
        tally_group: accountDef.tally_group,
        opening_balance: 0,
        current_balance: 0,
        is_active: true,
      },
    });

    accountMap.set(accountDef.account_code, account.id);
    console.log(`  ✓ Created account: ${accountDef.account_code} - ${accountDef.account_name}`);
  }

  console.log(`✅ Successfully seeded ${STANDARD_HOSPITAL_COA.length} accounts`);
  return accountMap;
}

// CLI execution
async function main() {
  const organizationId = process.env.ORGANIZATION_ID;

  if (!organizationId) {
    console.error('❌ Error: ORGANIZATION_ID environment variable is required');
    console.log('Usage: ORGANIZATION_ID=<org-id> npx tsx prisma/seeds/chart-of-accounts-seed.ts');
    process.exit(1);
  }

  // Check if organization exists
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!org) {
    console.error(`❌ Error: Organization with ID "${organizationId}" not found`);
    process.exit(1);
  }

  // Check if accounts already exist
  const existingAccounts = await prisma.gL_Account.count({
    where: { organizationId },
  });

  if (existingAccounts > 0) {
    console.warn(`⚠️  Warning: Found ${existingAccounts} existing accounts for this organization`);
    console.log('Do you want to skip seeding or continue anyway? (Ctrl+C to cancel)');
    // Continue anyway for now
  }

  await seedChartOfAccounts(organizationId);

  console.log('\n🎉 Chart of Accounts seed completed successfully!');
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
