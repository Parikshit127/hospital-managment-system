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
    /**
     * Roles allowed to open this screen. The palette must not offer a shortcut
     * into a module the user cannot use — the server would reject it anyway,
     * but surfacing it leaks which modules exist and looks broken. Omitted =
     * available to every role that can use the palette at all.
     */
    roles?: string[];
};

// These MUST mirror ROLE_ROUTES in proxy.ts. The proxy is what actually blocks
// a request; if the palette offered a screen the proxy rejects, the user would
// be bounced to the login page instead of simply not seeing the option.
// Grouped by the URL prefix each screen sits under.
const FINANCE = ['admin', 'finance'];                                              // /finance/*
const BILLING = ['admin', 'finance', 'ipd_manager', 'receptionist', 'opd_manager']; // /billing/*
const INSURANCE = ['admin', 'finance', 'ipd_manager'];                             // /insurance
const PHARMACY = ['admin', 'pharmacist'];                                          // /pharmacy/*
const FRONT_DESK = ['admin', 'receptionist'];                                      // /reception/*
// proxy.ts allows nurse and doctor on /ipd, so the palette must too — this list
// is supposed to mirror it, and excluding nurses hid every ward screen from the
// people who spend the whole shift in them.
const WARD = ['admin', 'ipd_manager', 'nurse', 'doctor'];                          // /ipd/*
const NURSING = ['admin', 'nurse'];                                                // /nurse/*
const ADMIN_ONLY = ['admin'];                                                      // /admin/*
const LAB = ['admin', 'lab_technician'];                                           // /lab/*

export const SCREEN_INDEX: ScreenEntry[] = [
    // Billing & finance
    { label: 'Master Billing', href: '/billing', group: 'Billing', keywords: ['bill', 'invoice', 'cash', 'collect'], roles: BILLING },
    { label: 'TPA / Insurance', href: '/insurance', group: 'Billing', keywords: ['tpa', 'insurance', 'claim', 'preauth', 'panel', 'cashless'], roles: INSURANCE },
    { label: 'Doctor Invoicing & Commission', href: '/finance/doctor-invoicing', group: 'Finance', keywords: ['doctor', 'invoicing', 'commission', 'payout', 'share'], roles: FINANCE },
    { label: 'Approval Center', href: '/billing/approvals', group: 'Billing', keywords: ['approve', 'discount', 'request'], roles: BILLING },
    { label: 'Write-offs', href: '/billing/writeoffs', group: 'Billing', keywords: ['writeoff', 'bad debt'], roles: BILLING },
    { label: 'Refund History', href: '/finance/refunds', group: 'Finance', keywords: ['refund', 'return money', 'wapas'], roles: FINANCE },
    { label: 'Deposits & Advances', href: '/finance/deposits', group: 'Finance', keywords: ['deposit', 'advance', 'security'], roles: FINANCE },
    { label: 'Payment Ledger', href: '/finance/payments', group: 'Finance', keywords: ['payment', 'receipt', 'ledger'], roles: FINANCE },
    { label: 'All Invoices', href: '/finance/invoices', group: 'Finance', keywords: ['invoice', 'bills'], roles: FINANCE },
    { label: 'Cash Closure', href: '/finance/cash-closure', group: 'Finance', keywords: ['cash', 'closing', 'day end', 'shift'], roles: FINANCE },
    { label: 'Credit Notes', href: '/finance/credit-notes', group: 'Finance', keywords: ['credit note'], roles: FINANCE },
    { label: 'Expenses', href: '/finance/expenses', group: 'Finance', roles: FINANCE },
    { label: 'Financial Reports', href: '/finance/reports', group: 'Reports', keywords: ['collection', 'ar aging', 'p&l', 'profit'], roles: FINANCE },
    { label: 'Tally Export', href: '/finance/tally-export', group: 'Finance', keywords: ['tally', 'accounting export'], roles: FINANCE },

    // Reports
    { label: 'Single Patient Report', href: '/reception/single-patient-report', group: 'Reports', keywords: ['single patient', 'one patient', 'patient history', 'statement', 'ledger'], roles: FRONT_DESK },
    { label: 'Edit / Cancel Audit Report', href: '/ipd/audit-trail', group: 'Reports', keywords: ['audit', 'edited', 'cancelled', 'reversed', 'who changed', 'trail'], roles: WARD },
    { label: 'MIS Reports', href: '/admin/mis-reports', group: 'Reports', keywords: ['mis', 'catalogue', 'revenue', 'doctor wise', 'monthly'], roles: ADMIN_ONLY },
    { label: 'Patient Reports (IPD/OPD/Walk-in)', href: '/reception/reports', group: 'Reports', roles: FRONT_DESK },
    { label: 'Indent Report', href: '/pharmacy/indent-report', group: 'Reports', keywords: ['indent', 'requisition', 'nurse indent', 'pharmacy indent'], roles: PHARMACY },
    { label: 'Pharmacy Analytics', href: '/pharmacy/reports', group: 'Reports', roles: PHARMACY },

    // Pharmacy
    { label: 'Pharmacy Dispensing', href: '/pharmacy/billing', group: 'Pharmacy', keywords: ['dispense', 'medicine', 'sale', 'counter'], roles: PHARMACY },
    { label: 'IP Orders (Nurse Indents)', href: '/pharmacy/ip-orders', group: 'Pharmacy', keywords: ['indent', 'ip order', 'ward request'], roles: PHARMACY },
    { label: 'Pharmacy Stock', href: '/pharmacy/inventory', group: 'Pharmacy', keywords: ['stock', 'inventory', 'batch', 'expiry', 'adjust'], roles: PHARMACY },
    { label: 'Purchase Orders', href: '/pharmacy/purchase-orders', group: 'Pharmacy', keywords: ['po', 'purchase'], roles: PHARMACY },
    { label: 'Suppliers', href: '/pharmacy/suppliers', group: 'Pharmacy', keywords: ['vendor', 'supplier'], roles: PHARMACY },

    // Reception / OPD
    { label: 'Reception Dashboard', href: '/reception/dashboard', group: 'Reception', keywords: ['front desk', 'opd list'], roles: FRONT_DESK },
    { label: 'Register Patient', href: '/reception/register', group: 'Reception', keywords: ['registration', 'new patient', 'uhid', 'tpa patient', 'corporate patient'], roles: FRONT_DESK },
    { label: 'Queue Management', href: '/reception/queue', group: 'Reception', keywords: ['token', 'queue'], roles: FRONT_DESK },
    { label: 'Patient History', href: '/reception/history', group: 'Reception', roles: FRONT_DESK },

    // IPD
    { label: 'IPD Dashboard', href: '/ipd', group: 'IPD', keywords: ['inpatient', 'admitted'], roles: WARD },
    // The nursing module had no entries whatsoever, so a nurse's palette could
    // find patients but not one of her own screens.
    { label: 'Nurse Dashboard', href: '/nurse/dashboard', group: 'Nursing', keywords: ['nurse', 'shift', 'home'], roles: NURSING },
    { label: 'My Patients', href: '/nurse/patients', group: 'Nursing', keywords: ['ward patients', 'my patients', 'marij'], roles: NURSING },
    { label: 'Vitals', href: '/nurse/vitals', group: 'Nursing', keywords: ['vitals', 'observations', 'news', 'bp', 'temperature', 'obs'], roles: NURSING },
    { label: 'Medications (eMAR)', href: '/nurse/medications', group: 'Nursing', keywords: ['emar', 'medication', 'drug', 'dawai', 'administer', 'dose'], roles: NURSING },
    { label: 'Nursing Notes', href: '/nurse/nursing-notes', group: 'Nursing', keywords: ['notes', 'nursing note'], roles: NURSING },
    { label: 'Nursing Tasks', href: '/nurse/tasks', group: 'Nursing', keywords: ['task', 'todo', 'kaam', 'pending'], roles: NURSING },
    { label: 'Shift Handover', href: '/nurse/handover', group: 'Nursing', keywords: ['handover', 'shift change', 'sbar'], roles: NURSING },
    { label: 'Nursing Care Record', href: '/ipd/care-record', group: 'Nursing', keywords: ['care plan', 'fluid balance', 'wound', 'device', 'transfusion', 'teaching'], roles: WARD },
    { label: 'Clinical Incidents', href: '/ipd/incidents', group: 'Nursing', keywords: ['incident', 'fall', 'medication error', 'needlestick'], roles: WARD },
    { label: 'Escalations', href: '/doctor/escalations', group: 'Clinical', keywords: ['escalation', 'news', 'deteriorating', 'acknowledge'], roles: ['admin', 'doctor'] },
    { label: 'Controlled Drugs', href: '/pharmacy/controlled-drugs', group: 'Pharmacy', keywords: ['narcotic', 'ndps', 'schedule x', 'controlled'], roles: PHARMACY },
    { label: 'Admissions Hub', href: '/ipd/admissions-hub', group: 'IPD', keywords: ['admission', 'admitted patients'], roles: WARD },
    { label: 'Bed Matrix', href: '/ipd/bed-matrix', group: 'IPD', keywords: ['bed', 'ward', 'occupancy'], roles: WARD },
    { label: 'Discharge Settlement', href: '/ipd/discharge-settlement', group: 'IPD', keywords: ['discharge', 'final bill', 'settlement'], roles: WARD },
    { label: 'Nursing Station', href: '/ipd/nursing-station', group: 'IPD', keywords: ['nursing', 'ward'], roles: WARD },

    // Assets & admin
    { label: 'Asset Register (IT / Housekeeping)', href: '/admin/assets', group: 'Admin', keywords: ['asset', 'it asset', 'laptop', 'housekeeping', 'hk', 'furniture', 'inventory', 'equipment'], roles: ADMIN_ONLY },
    { label: 'Staff & Users', href: '/admin/staff', group: 'Admin', keywords: ['user', 'staff', 'login'], roles: ADMIN_ONLY },
    { label: 'Doctors', href: '/admin/doctors', group: 'Admin', keywords: ['doctor', 'consultant'], roles: ADMIN_ONLY },
    { label: 'Departments', href: '/admin/departments', group: 'Admin', roles: ADMIN_ONLY },
    { label: 'Bill Settings', href: '/admin/bill-settings', group: 'Admin', keywords: ['bill format', 'letterhead'], roles: ADMIN_ONLY },
    { label: 'Branding', href: '/admin/branding', group: 'Admin', keywords: ['logo', 'hospital name'], roles: ADMIN_ONLY },
    { label: 'Print Center', href: '/print-center', group: 'Admin', keywords: ['print', 'reprint'], roles: BILLING },

    // Lab
    { label: 'Lab Worklist', href: '/lab/worklist', group: 'Lab', roles: LAB },
    { label: 'Lab Reports', href: '/lab/reports', group: 'Lab', roles: LAB },
];

/**
 * Rank screens against a query. Exact-ish label matches sort above keyword-only
 * hits so typing "tpa" puts TPA / Insurance first rather than a screen that
 * merely mentions it.
 */
export function searchScreens(query: string, role?: string, limit = 6): ScreenEntry[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    // Only offer screens this role can actually open. Without a role we return
    // nothing rather than everything — failing closed, so a missing prop can
    // never turn the palette into a way around the menu's own restrictions.
    const r = (role || '').toLowerCase();
    const allowed = (e: ScreenEntry) => !e.roles || e.roles.includes(r);
    if (!r) return [];

    const scored: { entry: ScreenEntry; score: number }[] = [];
    for (const entry of SCREEN_INDEX) {
        if (!allowed(entry)) continue;
        const label = entry.label.toLowerCase();
        let score = 0;
        if (label === q) score = 100;
        else if (label.startsWith(q)) score = 80;
        else if (label.includes(q)) score = 60;
        else if (entry.group.toLowerCase().includes(q)) score = 30;
        // `q.includes(k)` is only safe for reasonably long keywords. Short ones
        // ("po", "hk") are substrings of unrelated words — "po" sits inside
        // "de-po-sit", which made Purchase Orders match a search for deposits.
        else if (entry.keywords?.some(k => k.includes(q) || (k.length >= 4 && q.includes(k)))) score = 40;

        if (score > 0) scored.push({ entry, score });
    }

    return scored
        .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
        .slice(0, limit)
        .map(s => s.entry);
}
