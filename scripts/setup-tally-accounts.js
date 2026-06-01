const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ORGS = [
  'org-axten-production',
  '0425857b-6293-4d91-86b2-bd049de66252'
];

// ── Account Groups (Tally hierarchy) ──
const GROUPS = [
  // Assets
  { code: '1000', name: 'Current Assets', type: 'Asset', parent: null },
  { code: '1010', name: 'Bank Accounts', type: 'Asset', parent: '1000' },
  { code: '1020', name: 'Cash-in-Hand', type: 'Asset', parent: '1000' },
  { code: '1030', name: 'Deposits (Asset)', type: 'Asset', parent: '1000' },
  { code: '1031', name: 'Fixed Deposits', type: 'Asset', parent: '1030' },
  { code: '1040', name: 'Loans & Advances (Asset)', type: 'Asset', parent: '1000' },
  { code: '1050', name: 'Stock-in-Hand', type: 'Asset', parent: '1000' },
  { code: '1060', name: 'Sundry Debtors', type: 'Asset', parent: '1000' },
  { code: '1100', name: 'Fixed Assets', type: 'Asset', parent: null },
  { code: '1200', name: 'Investments', type: 'Asset', parent: null },

  // Liabilities
  { code: '2000', name: 'Current Liabilities', type: 'Liability', parent: null },
  { code: '2010', name: 'Duties & Taxes', type: 'Liability', parent: '2000' },
  { code: '2020', name: 'Employee Payables', type: 'Liability', parent: '2000' },
  { code: '2030', name: 'Provisions', type: 'Liability', parent: '2000' },
  { code: '2040', name: 'Sundry Creditors', type: 'Liability', parent: '2000' },
  { code: '2050', name: 'Outside Doctors', type: 'Liability', parent: '2040' },
  { code: '2100', name: 'Loans (Liability)', type: 'Liability', parent: null },
  { code: '2110', name: 'Bank OD A/c', type: 'Liability', parent: '2100' },
  { code: '2120', name: 'Secured Loans', type: 'Liability', parent: '2100' },
  { code: '2130', name: 'Unsecured Loans', type: 'Liability', parent: '2100' },

  // Equity
  { code: '3000', name: 'Capital Account', type: 'Equity', parent: null },
  { code: '3010', name: 'Reserves & Surplus', type: 'Equity', parent: '3000' },

  // Revenue / Income
  { code: '4000', name: 'Sales Accounts', type: 'Revenue', parent: null },
  { code: '4100', name: 'Direct Incomes', type: 'Revenue', parent: null },
  { code: '4200', name: 'Indirect Incomes', type: 'Revenue', parent: null },

  // Expenses
  { code: '5000', name: 'Direct Expenses', type: 'Expense', parent: null },
  { code: '5100', name: 'Indirect Expenses', type: 'Expense', parent: null },
  { code: '5110', name: 'Employee Benefit', type: 'Expense', parent: '5100' },
  { code: '5200', name: 'Purchase Accounts', type: 'Expense', parent: null },

  // Suspense
  { code: '9000', name: 'Suspense A/c', type: 'Liability', parent: null },
];

// ── Ledgers from Tally ──
const LEDGERS = [
  // Bank Accounts
  { code: '1010-001', name: 'DBS BANK INDIA LIMITED', type: 'Asset', group: 'Bank Accounts', tally_group: 'Bank Accounts', balance: 'Debit' },
  { code: '1010-002', name: 'ICICI Bank -072005500811', type: 'Asset', group: 'Bank Accounts', tally_group: 'Bank Accounts', balance: 'Debit' },
  { code: '1010-003', name: 'INDIAN BANK - 5245', type: 'Asset', group: 'Bank Accounts', tally_group: 'Bank Accounts', balance: 'Debit' },

  // Cash
  { code: '1020-001', name: 'Cash', type: 'Asset', group: 'Cash-in-Hand', tally_group: 'Cash-in-Hand', balance: 'Debit' },
  { code: '1020-002', name: 'PETTY CASH', type: 'Asset', group: 'Cash-in-Hand', tally_group: 'Cash-in-Hand', balance: 'Debit' },

  // Fixed Deposits
  { code: '1031-001', name: 'FD 8290104677', type: 'Asset', group: 'Fixed Deposits', tally_group: 'Fixed Deposits', balance: 'Debit' },
  { code: '1031-002', name: 'FD 8301032863', type: 'Asset', group: 'Fixed Deposits', tally_group: 'Fixed Deposits', balance: 'Debit' },
  { code: '1031-003', name: 'FD 8311042928', type: 'Asset', group: 'Fixed Deposits', tally_group: 'Fixed Deposits', balance: 'Debit' },

  // Sundry Debtors
  { code: '1060-001', name: 'GHV ADVANCED CARE PVT LTD', type: 'Asset', group: 'Sundry Debtors', tally_group: 'Sundry Debtors', balance: 'Debit' },
  { code: '1060-002', name: 'CARD', type: 'Asset', group: 'Sundry Debtors', tally_group: 'Sundry Debtors', balance: 'Debit' },
  { code: '1060-003', name: 'EDEN HOSPITAL PVT. LTD.', type: 'Asset', group: 'Sundry Debtors', tally_group: 'Sundry Debtors', balance: 'Debit' },
  { code: '1060-004', name: 'PAYING', type: 'Asset', group: 'Sundry Debtors', tally_group: 'Sundry Debtors', balance: 'Debit' },
  { code: '1060-005', name: 'RTGS_NEFT', type: 'Asset', group: 'Sundry Debtors', tally_group: 'Sundry Debtors', balance: 'Debit' },
  { code: '1060-006', name: 'SARITA ENTERPRISES', type: 'Asset', group: 'Sundry Debtors', tally_group: 'Sundry Debtors', balance: 'Debit' },
  { code: '1060-007', name: 'UPI', type: 'Asset', group: 'Sundry Debtors', tally_group: 'Sundry Debtors', balance: 'Debit' },
  { code: '1060-008', name: 'PRISTYNCARE', type: 'Asset', group: 'Sundry Debtors', tally_group: 'PRISTYNCARE', balance: 'Debit' },

  // Fixed Assets
  { code: '1100-001', name: 'LAPTOP & COMPUTER', type: 'Asset', group: 'Fixed Assets', tally_group: 'Fixed Assets', balance: 'Debit' },
  { code: '1100-002', name: 'PHONE', type: 'Asset', group: 'Fixed Assets', tally_group: 'Fixed Assets', balance: 'Debit' },

  // Duties & Taxes
  { code: '2010-001', name: 'EPFO PAYABLE', type: 'Liability', group: 'Duties & Taxes', tally_group: 'Duties & Taxes', balance: 'Credit' },
  { code: '2010-002', name: 'ESIC PAYABLE', type: 'Liability', group: 'Duties & Taxes', tally_group: 'Duties & Taxes', balance: 'Credit' },
  { code: '2010-003', name: 'TDS-94C CO.-2%', type: 'Liability', group: 'Duties & Taxes', tally_group: 'Duties & Taxes', balance: 'Credit' },
  { code: '2010-004', name: 'TDS 94C NON CO.-1%', type: 'Liability', group: 'Duties & Taxes', tally_group: 'Duties & Taxes', balance: 'Credit' },
  { code: '2010-005', name: 'TDS 94I-0.50%', type: 'Liability', group: 'Duties & Taxes', tally_group: 'Duties & Taxes', balance: 'Credit' },
  { code: '2010-006', name: 'TDS 94I-NONCO', type: 'Liability', group: 'Duties & Taxes', tally_group: 'Duties & Taxes', balance: 'Credit' },
  { code: '2010-007', name: 'TDS 94J-10%', type: 'Liability', group: 'Duties & Taxes', tally_group: 'Duties & Taxes', balance: 'Credit' },

  // Provisions / Rent Payable
  { code: '2030-001', name: 'HARGYAN SINGH', type: 'Liability', group: 'Provisions', tally_group: 'RENT PAYABLE', balance: 'Credit' },
  { code: '2030-002', name: 'MRINAL SINGH', type: 'Liability', group: 'Provisions', tally_group: 'RENT PAYABLE', balance: 'Credit' },

  // Sundry Creditors (Vendors)
  { code: '2040-001', name: 'ACT FIBER NET', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-002', name: 'ADRECIPES DIGITAL PVT LTD', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-003', name: 'ADVANCE', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-004', name: 'AKASA COWORKING PVT LTD', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-005', name: 'ALPHA MRI & DIAGNOSTICS', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-006', name: 'AMAZON', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-007', name: 'A N AIR CONDITIONING', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-008', name: 'ANKIT STATIONERS', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-009', name: 'ANSH HOME DRESSING CARE', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-010', name: 'Bharti Airtel Limited', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-011', name: 'BIOTIC WASTE SOLUTIONS PVT.LTD.', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-012', name: 'BLOOD CENTRE OF TRITON HOSPITAL', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-013', name: 'BSES-100091608', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-014', name: 'BSES-100105622', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-015', name: 'BSES-150464047', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-016', name: 'CUBE SOFTWARE PVT LTD', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-017', name: 'DIAMOND PEST CONTROL SERVICES', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-018', name: 'E2E Networks Limited', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-019', name: 'GANGA DHAR DRYCLEANERS', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-020', name: 'GARNET PHARMACEUTICALS', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-021', name: 'GRD ENTERPRISES', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-022', name: 'HABIN DIETARY SERVICES', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-023', name: 'HEALTHOPIA DIAGNOSTICS', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-024', name: 'INDUSTRIAL SOLUTIONS', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-025', name: 'J.K. GENERATOR SERVICE CENTRE', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-026', name: 'K T Medical Instrument Services', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-027', name: 'LEDSAK TECHNOLOGIES PVT LTD', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-028', name: 'ROCKMAN SECURITY PVT LTD', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-029', name: 'SETH AIR PRODUCTS', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-030', name: 'STIGASOFT PVT LTD', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-031', name: 'TAH GLOBAL HEALTHTECH', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-032', name: 'ZENA HEALTHCARE PVT LTD', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-033', name: 'P D PHARMAA', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-034', name: 'MOLECULE PHARMA CARE OF NAVEEN', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-035', name: 'SPD INDIA HEALTHCARE PRIVATE LIMITED', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },
  { code: '2040-036', name: 'Refund Payable', type: 'Liability', group: 'Sundry Creditors', tally_group: 'Sundry Creditors', balance: 'Credit' },

  // Bank OD
  { code: '2110-001', name: 'INDIAN BANK OD A/C 8291474796', type: 'Liability', group: 'Bank OD A/c', tally_group: 'Bank OD A/c', balance: 'Credit' },

  // Unsecured Loans
  { code: '2130-001', name: 'Claim Buddy Technologies Pvt Ltd-Loan', type: 'Liability', group: 'Unsecured Loans', tally_group: 'Unsecured Loans', balance: 'Credit' },
  { code: '2130-002', name: 'CLAIMFRIENDY PRIVATE LIMITED', type: 'Liability', group: 'Unsecured Loans', tally_group: 'Unsecured Loans', balance: 'Credit' },
  { code: '2130-003', name: 'DMI FINANCE PRIVATE LIMITED', type: 'Liability', group: 'Unsecured Loans', tally_group: 'Unsecured Loans', balance: 'Credit' },
  { code: '2130-004', name: 'GAUTAM CHHABRA-LOAN', type: 'Liability', group: 'Unsecured Loans', tally_group: 'Unsecured Loans', balance: 'Credit' },
  { code: '2130-005', name: 'PRABJIT SINGH GILL- LOAN', type: 'Liability', group: 'Unsecured Loans', tally_group: 'Unsecured Loans', balance: 'Credit' },
  { code: '2130-006', name: 'SATISH KUMAR PANDEY - LOAN', type: 'Liability', group: 'Unsecured Loans', tally_group: 'Unsecured Loans', balance: 'Credit' },

  // Suspense
  { code: '9000-001', name: 'Suspense A/c', type: 'Liability', group: 'Suspense A/c', tally_group: 'Suspense A/c', balance: 'Credit' },

  // ── EXPENSES ──

  // Direct Expenses
  { code: '5000-001', name: 'ANESTHESIA CHARGES', type: 'Expense', group: 'Direct Expenses', tally_group: 'Direct Expenses', balance: 'Debit' },
  { code: '5000-002', name: 'Consultation Charges', type: 'Expense', group: 'Direct Expenses', tally_group: 'Direct Expenses', balance: 'Debit' },

  // Employee Benefit
  { code: '5110-001', name: 'Staff Welfare', type: 'Expense', group: 'Employee Benefit', tally_group: 'Employee Benefit', balance: 'Debit' },

  // Indirect Expenses
  { code: '5100-001', name: 'ACCOUNTING CHARGES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-002', name: 'Advertisement Expenses', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-003', name: 'Bank Charge', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-004', name: 'BLOOD CHARGE', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-005', name: 'BUSINESS PROMOTION', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-006', name: 'CLOUD CHARGES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-007', name: 'Conveyance Expense', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-008', name: 'COURIER CHARGES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-009', name: 'Diesel', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-010', name: 'ELECTRICITY EXPENSES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-011', name: 'Festival Expenses', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-012', name: 'FOOD CHARGES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-013', name: 'Garbage Charge', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-014', name: 'HOUSEKEEPING-EXPENSE', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-015', name: 'Interest on Loan', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-016', name: 'Interest On OD Account', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-017', name: 'INVESTIGATION CHARGES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-018', name: 'LAB CHARGES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-019', name: 'LATE FEE CHARGE', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-020', name: 'LAUNDRY CHARGES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-021', name: 'LEASE LICENSE', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-022', name: 'Legal & Professional Expenses', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-023', name: 'MEDICAL GASES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-024', name: 'Office Expenses', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-025', name: 'Printing and Stationery Charges', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-026', name: 'Refund Expenses', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-027', name: 'Regstratiions Charge', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-028', name: 'RENT', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-029', name: 'Repair & Maintance - IT Exp.', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-030', name: 'REPAIR & MAINTENANCE -BUILDING', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-031', name: 'Repair & Maintenance - Computer', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-032', name: 'REPAIR & MAINTENANCE- MACHINERY', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-033', name: 'REPAIR & MAINTENANCE- MEDICAL EQUIPMENTS', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-034', name: 'SECURITY SERVICES', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-035', name: 'Short & Excess', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-036', name: 'Telephone & Internet Exp.', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },
  { code: '5100-037', name: 'Website Expenses', type: 'Expense', group: 'Indirect Expenses', tally_group: 'Indirect Expenses', balance: 'Debit' },

  // Purchase
  { code: '5200-001', name: 'Medicine & Disposable', type: 'Expense', group: 'Purchase Accounts', tally_group: 'Purchase Accounts', balance: 'Debit' },

  // ── INCOME / REVENUE ──

  // Sales
  { code: '4000-001', name: 'SALES', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },

  // Income sub-ledgers (from Rate Chart mapping)
  { code: '4000-002', name: 'OPD Income', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-003', name: 'IPD Income', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-004', name: 'Diagnostics Income', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-005', name: 'LABORATORY INCOME', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-006', name: 'MEDICAL MANAGEMENT INCOME', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-007', name: 'PROFESSIONAL MANAGEMENT INCOME', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-008', name: 'Pharmacy Income', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-009', name: 'OTHER INCOME', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },
  { code: '4000-010', name: 'INTENSIVE CARE UNIT (ICU) INCOME', type: 'Revenue', group: 'Sales Accounts', tally_group: 'Sales Accounts', balance: 'Credit' },

  // Indirect Incomes
  { code: '4200-001', name: 'Rental Equipment Charges', type: 'Revenue', group: 'Indirect Incomes', tally_group: 'Indirect Incomes', balance: 'Credit' },
  { code: '4200-002', name: 'RENT-DIALYSIS/CANTEEN', type: 'Revenue', group: 'Indirect Incomes', tally_group: 'Indirect Incomes', balance: 'Credit' },
];

// ── Service Category → Income Ledger mapping ──
const SERVICE_LEDGER_MAP = {
  'DIAGNOSTICS CHARGES': 'Diagnostics Income',
  'INTENSIVE CARE UNIT (ICU)': 'INTENSIVE CARE UNIT (ICU) INCOME',
  'MEDICAL MANAGEMENT': 'MEDICAL MANAGEMENT INCOME',
  'NEPHROLOGY': 'IPD Income',
  'OTHERS': 'OTHER INCOME',
  'PHARMACY': 'Pharmacy Income',
  'PROCEDURE': 'OPD Income',
  'PROFESSIONAL MANAGEMENT': 'PROFESSIONAL MANAGEMENT INCOME',
};

async function run() {
  for (const orgId of ORGS) {
    const orgName = orgId === 'org-axten-production' ? 'Axten' : 'Avise';
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Setting up GL accounts for: ${orgName}`);
    console.log('='.repeat(50));

    // Track created group accounts for parent linking
    const groupMap = {};

    // Step 1: Create group accounts (parent nodes)
    let groupCount = 0;
    for (const g of GROUPS) {
      const existing = await p.gL_Account.findFirst({
        where: { account_code: g.code, organizationId: orgId }
      });
      if (existing) {
        groupMap[g.code] = existing.id;
        continue;
      }

      const parentId = g.parent ? (groupMap[g.parent] || null) : null;
      const created = await p.gL_Account.create({
        data: {
          organizationId: orgId,
          account_code: g.code,
          account_name: g.name,
          account_type: g.type,
          account_group: g.name,
          parent_id: parentId,
          normal_balance: ['Asset', 'Expense'].includes(g.type) ? 'Debit' : 'Credit',
          tally_group: g.name,
          is_active: true,
        }
      });
      groupMap[g.code] = created.id;
      groupCount++;
    }
    console.log(`  Groups created: ${groupCount}`);

    // Step 2: Create ledger accounts
    let ledgerCount = 0;
    for (const l of LEDGERS) {
      const existing = await p.gL_Account.findFirst({
        where: { organizationId: orgId, account_code: l.code }
      });
      if (existing) continue;

      // Find parent group
      const groupCode = l.code.split('-')[0];
      const parentId = groupMap[groupCode] || null;

      await p.gL_Account.create({
        data: {
          organizationId: orgId,
          account_code: l.code,
          account_name: l.name,
          account_type: l.type,
          account_group: l.group,
          parent_id: parentId,
          normal_balance: l.balance,
          tally_ledger_name: l.name,
          tally_group: l.tally_group,
          is_active: true,
        }
      });
      ledgerCount++;
    }
    console.log(`  Ledgers created: ${ledgerCount}`);

    // Step 3: Map service categories to income ledgers
    let mappedCount = 0;
    for (const [serviceCategory, ledgerName] of Object.entries(SERVICE_LEDGER_MAP)) {
      const ledgerAccount = await p.gL_Account.findFirst({
        where: { organizationId: orgId, account_name: ledgerName }
      });
      if (!ledgerAccount) {
        console.log(`  Warning: Ledger "${ledgerName}" not found for mapping`);
        continue;
      }

      // Update charge_catalog items with this service_category
      const updated = await p.charge_catalog.updateMany({
        where: { organizationId: orgId, service_category: serviceCategory },
        data: { department: ledgerName }
      });
      if (updated.count > 0) {
        mappedCount += updated.count;
      }
    }
    console.log(`  Services mapped to ledgers: ${mappedCount}`);
  }

  console.log('\nDone!');
  await p.$disconnect();
}

run().catch(e => { console.error(e); p.$disconnect(); });
