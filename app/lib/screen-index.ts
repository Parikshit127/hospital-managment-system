/**
 * Searchable index of application screens.
 *
 * The Ctrl+K palette only searched patients, so staff had to know which portal
 * a module lived in to reach it — "TPA is hard to find", "doctor invoicing is
 * hard to find". This gives the palette a second result group: jump straight to
 * a screen by name.
 *
 * `keywords` carry the words people actually use (including Hinglish) that do
 * not appear in the screen's own label.
 */

export type ScreenEntry = {
    label: string;
    href: string;
    group: string;
    keywords?: string[];
};

export const SCREEN_INDEX: ScreenEntry[] = [
    // Billing & finance
    { label: 'Master Billing', href: '/billing', group: 'Billing', keywords: ['bill', 'invoice', 'cash', 'collect'] },
    { label: 'TPA / Insurance', href: '/insurance', group: 'Billing', keywords: ['tpa', 'insurance', 'claim', 'preauth', 'panel', 'cashless'] },
    { label: 'Doctor Invoicing & Commission', href: '/finance/doctor-invoicing', group: 'Finance', keywords: ['doctor', 'invoicing', 'commission', 'payout', 'share'] },
    { label: 'Approval Center', href: '/billing/approvals', group: 'Billing', keywords: ['approve', 'discount', 'request'] },
    { label: 'Write-offs', href: '/billing/writeoffs', group: 'Billing', keywords: ['writeoff', 'bad debt'] },
    { label: 'Refund History', href: '/finance/refunds', group: 'Finance', keywords: ['refund', 'return money', 'wapas'] },
    { label: 'Deposits & Advances', href: '/finance/deposits', group: 'Finance', keywords: ['deposit', 'advance', 'security'] },
    { label: 'Payment Ledger', href: '/finance/payments', group: 'Finance', keywords: ['payment', 'receipt', 'ledger'] },
    { label: 'All Invoices', href: '/finance/invoices', group: 'Finance', keywords: ['invoice', 'bills'] },
    { label: 'Cash Closure', href: '/finance/cash-closure', group: 'Finance', keywords: ['cash', 'closing', 'day end', 'shift'] },
    { label: 'Credit Notes', href: '/finance/credit-notes', group: 'Finance', keywords: ['credit note'] },
    { label: 'Expenses', href: '/finance/expenses', group: 'Finance' },
    { label: 'Financial Reports', href: '/finance/reports', group: 'Reports', keywords: ['collection', 'ar aging', 'p&l', 'profit'] },
    { label: 'Tally Export', href: '/finance/tally-export', group: 'Finance', keywords: ['tally', 'accounting export'] },

    // Reports
    { label: 'Single Patient Report', href: '/reception/single-patient-report', group: 'Reports', keywords: ['single patient', 'one patient', 'patient history', 'statement', 'ledger'] },
    { label: 'Edit / Cancel Audit Report', href: '/ipd/audit-trail', group: 'Reports', keywords: ['audit', 'edited', 'cancelled', 'reversed', 'who changed', 'trail'] },
    { label: 'MIS Reports', href: '/admin/mis-reports', group: 'Reports', keywords: ['mis', 'catalogue', 'revenue', 'doctor wise', 'monthly'] },
    { label: 'Patient Reports (IPD/OPD/Walk-in)', href: '/reception/reports', group: 'Reports' },
    { label: 'Indent Report', href: '/pharmacy/indent-report', group: 'Reports', keywords: ['indent', 'requisition', 'nurse indent', 'pharmacy indent'] },
    { label: 'Pharmacy Analytics', href: '/pharmacy/reports', group: 'Reports' },

    // Pharmacy
    { label: 'Pharmacy Dispensing', href: '/pharmacy/billing', group: 'Pharmacy', keywords: ['dispense', 'medicine', 'sale', 'counter'] },
    { label: 'IP Orders (Nurse Indents)', href: '/pharmacy/ip-orders', group: 'Pharmacy', keywords: ['indent', 'ip order', 'ward request'] },
    { label: 'Pharmacy Stock', href: '/pharmacy/inventory', group: 'Pharmacy', keywords: ['stock', 'inventory', 'batch', 'expiry', 'adjust'] },
    { label: 'Purchase Orders', href: '/pharmacy/purchase-orders', group: 'Pharmacy', keywords: ['po', 'purchase'] },
    { label: 'Suppliers', href: '/pharmacy/suppliers', group: 'Pharmacy', keywords: ['vendor', 'supplier'] },

    // Reception / OPD
    { label: 'Reception Dashboard', href: '/reception/dashboard', group: 'Reception', keywords: ['front desk', 'opd list'] },
    { label: 'Register Patient', href: '/reception/register', group: 'Reception', keywords: ['registration', 'new patient', 'uhid', 'tpa patient', 'corporate patient'] },
    { label: 'Queue Management', href: '/reception/queue', group: 'Reception', keywords: ['token', 'queue'] },
    { label: 'Patient History', href: '/reception/history', group: 'Reception' },

    // IPD
    { label: 'IPD Dashboard', href: '/ipd', group: 'IPD', keywords: ['inpatient', 'admitted'] },
    { label: 'Admissions Hub', href: '/ipd/admissions-hub', group: 'IPD', keywords: ['admission', 'admitted patients'] },
    { label: 'Bed Matrix', href: '/ipd/bed-matrix', group: 'IPD', keywords: ['bed', 'ward', 'occupancy'] },
    { label: 'Discharge Settlement', href: '/ipd/discharge-settlement', group: 'IPD', keywords: ['discharge', 'final bill', 'settlement'] },
    { label: 'Nursing Station', href: '/ipd/nursing-station', group: 'IPD', keywords: ['nursing', 'ward'] },

    // Assets & admin
    { label: 'Asset Register (IT / Housekeeping)', href: '/admin/assets', group: 'Admin', keywords: ['asset', 'it asset', 'laptop', 'housekeeping', 'hk', 'furniture', 'inventory', 'equipment'] },
    { label: 'Staff & Users', href: '/admin/staff', group: 'Admin', keywords: ['user', 'staff', 'login'] },
    { label: 'Doctors', href: '/admin/doctors', group: 'Admin', keywords: ['doctor', 'consultant'] },
    { label: 'Departments', href: '/admin/departments', group: 'Admin' },
    { label: 'Bill Settings', href: '/admin/bill-settings', group: 'Admin', keywords: ['bill format', 'letterhead'] },
    { label: 'Branding', href: '/admin/branding', group: 'Admin', keywords: ['logo', 'hospital name'] },
    { label: 'Print Center', href: '/print-center', group: 'Admin', keywords: ['print', 'reprint'] },

    // Lab
    { label: 'Lab Worklist', href: '/lab/worklist', group: 'Lab' },
    { label: 'Lab Reports', href: '/lab/reports', group: 'Lab' },
];

/**
 * Rank screens against a query. Exact-ish label matches sort above keyword-only
 * hits so typing "tpa" puts TPA / Insurance first rather than a screen that
 * merely mentions it.
 */
export function searchScreens(query: string, limit = 6): ScreenEntry[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const scored: { entry: ScreenEntry; score: number }[] = [];
    for (const entry of SCREEN_INDEX) {
        const label = entry.label.toLowerCase();
        let score = 0;
        if (label === q) score = 100;
        else if (label.startsWith(q)) score = 80;
        else if (label.includes(q)) score = 60;
        else if (entry.group.toLowerCase().includes(q)) score = 30;
        else if (entry.keywords?.some(k => k.includes(q) || q.includes(k))) score = 40;

        if (score > 0) scored.push({ entry, score });
    }

    return scored
        .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
        .slice(0, limit)
        .map(s => s.entry);
}
