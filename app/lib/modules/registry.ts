/**
 * Module registry — single source of truth for what the product is made of
 * (docs/COMPANY_OS_PLAN.md §7.1, ADR-003).
 *
 * PHASE 1: this file DESCRIBES today's behaviour and is parity-tested against the
 * hardcoded maps in proxy.ts / session.ts / role-actions.ts / Sidebar.tsx
 * (`npm run check:parity`). Nothing at runtime reads it yet, so editing it cannot change
 * what any user can do. Do not wire it into runtime code before the parity test is green.
 *
 * ORDER MATTERS: proxy.ts takes the first matching `startsWith` gate, so the order of
 * `legacyGates` across MODULES reproduces ROLE_ROUTES exactly. Do not reorder casually.
 * (LEGACY-QUIRK: '/opd' precedes '/opd-manager', so the '/opd' gate also matches
 * '/opd-manager/*' — a role outside the '/opd' list is only saved by the *.view permission
 * fallback. Preserved on purpose; fixed in Phase 3 by longest-prefix-wins routing.)
 *
 * `dependsOn` values are PROPOSALS (not enforced until Phase 3).
 * Edge-safe: data only, no Node/Prisma imports.
 */
import type { ModuleDef } from './types';

const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
const perms = (m: string, actions: readonly string[] = ACTIONS) => actions.map((a) => `${m}.${a}`);

export const MODULES: readonly ModuleDef[] = [
    // ───────────── Gated by proxy.ts ROLE_ROUTES (order = ROLE_ROUTES order) ─────────────
    {
        key: 'admin', name: 'Hospital Admin Console', layer: 'core', dataLevel: 'unit',
        routePrefixes: ['/admin', '/api/admin'],
        actionsFiles: ['admin-actions', 'role-actions', 'module-config-actions', 'branch-actions', 'branding-actions',
            'master-data-actions', 'master-import-actions', 'import-actions', 'integration-actions', 'template-actions',
            'registration-config-actions', 'patient-type-actions', 'service-master-actions', 'medicine-master-actions',
            'doctor-master-actions', 'doctor-group-actions', 'unit-switch-actions', 'access-admin-actions', 'mfa-actions',
            'alert-actions', 'audit-actions', 'dashboard-actions', 'analytics-actions', 'global-search-actions',
            'broadcast-actions', 'simulation-actions', 'tax-actions', 'finance-master-actions', 'finance-config-actions'],
        legacyPermissions: perms('admin'),
        // Access administration (Company-OS Phase 4). Tied to the legacy admin.* keys, so today only `admin` holds them;
        // a company can later give e.g. an "HR Admin" role admin.access.assign and the delegation rules
        // (app/lib/access/delegation.ts) confine what that person can hand out to what they hold themselves.
        permissions: [
            { key: 'admin.access.view', legacyKey: 'admin.view', description: 'See who has which access, effective access and the change log' },
            { key: 'admin.access.assign', legacyKey: 'admin.edit', description: 'Assign roles and per-user overrides — only what you hold yourself, never to yourself' },
            { key: 'admin.user.create', legacyKey: 'admin.create', description: 'Create staff logins (with their access) and import users' },
            { key: 'admin.user.offboard', legacyKey: 'admin.edit', description: 'Offboard a user: disable login, end roles, revoke overrides' },
            { key: 'admin.role.view', legacyKey: 'admin.view', description: 'See access roles and their permissions' },
            { key: 'admin.role.edit', legacyKey: 'admin.edit', description: 'Create, clone, edit and delete custom roles' },
        ],
        dependsOn: [], defaultRoles: [],
        legacyGates: [{ prefix: '/admin', roles: ['admin'], permission: 'admin.view' }],
    },
    {
        key: 'doctor', name: 'Doctor Workspace', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/doctor'],
        actionsFiles: ['doctor-actions', 'emr-actions', 'ipd-emr-actions', 'order-set-actions', 'doctor-list-actions',
            'doctor-leave-actions', 'prescription-gate-actions', 'drug-interaction-actions', 'icd10-lookup-actions',
            'investigation-mylist-actions', 'patient-history-actions', 'video-call-actions', 'vitals-sync-actions'],
        legacyPermissions: [],
        dependsOn: ['reception'], defaultRoles: ['doctor'],
        legacyGates: [{ prefix: '/doctor', roles: ['admin', 'doctor'], permission: 'opd.view' }],
    },
    {
        key: 'reception', name: 'Reception & Registration', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/reception', '/kiosk', '/api/patient', '/api/appointments', '/api/organisations', '/api/org-lookup'],
        actionsFiles: ['reception-actions', 'reception-reports-actions', 'register-patient', 'patient-actions',
            'patient-note-actions', 'uhid-merge-actions', 'triage-actions', 'single-patient-report-actions'],
        legacyPermissions: [],
        dependsOn: [], defaultRoles: ['receptionist'],
        legacyGates: [{ prefix: '/reception', roles: ['admin', 'receptionist'], permission: 'opd.view' }],
    },
    {
        key: 'lab', name: 'Laboratory', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/lab', '/api/lab', '/api/verify-lab-pharmacy'],
        actionsFiles: ['lab-actions'],
        legacyPermissions: perms('lab'),
        dependsOn: ['reception'], defaultRoles: ['lab_technician'],
        legacyGates: [{ prefix: '/lab', roles: ['admin', 'lab_technician'], permission: 'lab.view' }],
    },
    {
        key: 'pharmacy', name: 'Pharmacy', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/pharmacy', '/api/pharmacy', '/api/inventory'],
        actionsFiles: ['pharmacy-actions', 'pharmacy-gst-actions', 'pill-actions', 'indent-report-actions'],
        legacyPermissions: perms('pharmacy'),
        // One permission per tier of app/lib/pharmacy-access.ts. Where a legacy key's holders already equal the
        // tier's role list we point at it (no seeding); otherwise defaultRoles copies the hand-written list.
        // tests/access/permission-parity.test.ts proves every one of these equals today's allow-list.
        permissions: [
            { key: 'pharmacy.catalog.view', legacyKey: 'pharmacy.view', description: 'Read-only medicine and stock lookup' },
            { key: 'pharmacy.dispense.execute', legacyKey: 'pharmacy.create', description: 'Dispense, bill, move stock, registers, pharmacy financials' },
            { key: 'pharmacy.purchase.create', legacyKey: 'pharmacy.create', description: 'Suppliers, purchase orders, GRN, purchase invoices, supplier payments' },
            { key: 'pharmacy.purchase.approve', legacyKey: 'pharmacy.approve', description: 'Approve a purchase order (checker of maker-checker)' },
            { key: 'pharmacy.return.create', description: 'File patient returns (nurses file these from the ward indent screen)', defaultRoles: ['admin', 'pharmacist', 'nurse'] },
            { key: 'pharmacy.indent.cancel', description: 'Cancel a ward pharmacy indent', defaultRoles: ['admin', 'pharmacist', 'nurse', 'ipd_manager'] },
        ],
        dependsOn: [], defaultRoles: ['pharmacist'],
        legacyGates: [{ prefix: '/pharmacy', roles: ['admin', 'pharmacist'], permission: 'pharmacy.view' }],
    },
    {
        key: 'finance', name: 'Finance & Accounts', layer: 'business', dataLevel: 'unit',
        routePrefixes: ['/finance', '/api/tally-export'],
        actionsFiles: ['finance-actions', 'gl-actions', 'tally-actions', 'tally-export-actions',
            'expense-actions', 'period-actions', 'bank-actions', 'bank-master-actions', 'account-actions',
            'balance-actions', 'dunning-actions', 'writeoff-actions', 'asset-register-actions',
            'cash-compliance-actions', 'investor-actions', 'doctor-commission-actions', 'doctor-invoice-actions', 'referral-actions',
            'consultant-charge-actions'],
        // Internal services (NOT server actions, not callable from the browser): app/lib/finance/{gl,budget,
        // gst-compliance,asset-management,insurance-gl}-service.ts — used by other modules, cron and scripts.
        legacyPermissions: perms('finance'),
        // Deliberately STRICTER than today for writes: the page gate lets any role holding finance.view through, so
        // e.g. a doctor can create a journal entry today. These keys map writes to finance.create / finance.edit /
        // finance.export; shadow mode will show exactly which users that would affect before anything is enforced.
        permissions: [
            { key: 'finance.ledger.view', legacyKey: 'finance.view', description: 'Chart of accounts, journal entries, trial balance, balance sheet, P&L, ledger' },
            { key: 'finance.ledger.create', legacyKey: 'finance.create', description: 'Create GL accounts and journal entries' },
            { key: 'finance.ledger.edit', legacyKey: 'finance.edit', description: 'Edit GL accounts, reverse journal entries' },
            { key: 'finance.tally.export', legacyKey: 'finance.export', description: 'Generate, download and delete Tally exports' },
        ],
        dependsOn: [], defaultRoles: ['finance'],
        legacyGates: [{ prefix: '/finance', roles: ['admin', 'finance'], permission: 'finance.view' }],
    },
    {
        key: 'ipd', name: 'In-Patient (IPD) & Discharge', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/ipd', '/discharge', '/api/ipd', '/api/admission', '/api/discharge'],
        actionsFiles: ['ipd-actions', 'ipd-automation-actions', 'ipd-billing-helpers', 'ipd-enhancement-actions',
            'ipd-finance-actions', 'ipd-master-actions', 'discharge-actions', 'discharge-summary-actions',
            'bed-occupancy-actions', 'coordinator-actions'],
        legacyPermissions: perms('ipd'),
        dependsOn: ['reception', 'billing'], defaultRoles: ['ipd_manager'],
        legacyGates: [
            { prefix: '/ipd', roles: ['admin', 'ipd_manager'], permission: 'ipd.view' },
            { prefix: '/discharge', roles: ['admin', 'ipd_manager', 'doctor'], permission: 'ipd.view' },
        ],
    },
    {
        key: 'opd', name: 'Out-Patient (OPD)', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/opd', '/api/opd', '/api/doctors', '/api/departments'],
        actionsFiles: ['opd-actions'],
        legacyPermissions: perms('opd'),
        dependsOn: ['reception'], defaultRoles: ['receptionist', 'doctor', 'opd_manager'],
        legacyGates: [{ prefix: '/opd', roles: ['admin', 'receptionist', 'doctor', 'opd_manager'], permission: 'opd.view' }],
    },
    {
        key: 'insurance', name: 'Insurance & TPA', layer: 'business', dataLevel: 'unit',
        routePrefixes: ['/insurance', '/api/insurance', '/api/zealthix'],
        actionsFiles: ['insurance-actions', 'insurance-aging-actions', 'insurance-corporate-actions',
            'insurance-lookup', 'insurance-receipts-actions', 'insurance-shortpay-actions', 'zealthix-actions'],
        legacyPermissions: perms('insurance'),
        dependsOn: ['billing'], defaultRoles: ['finance', 'ipd_manager'],
        legacyGates: [{ prefix: '/insurance', roles: ['admin', 'finance', 'ipd_manager'], permission: 'insurance.view' }],
    },
    {
        key: 'nurse', name: 'Nursing', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/nurse', '/api/nurse'],
        actionsFiles: ['nurse-actions', 'ipd-nursing-actions', 'assessment-alert-actions'],
        legacyPermissions: [],
        dependsOn: ['ipd'], defaultRoles: ['nurse'],
        legacyGates: [{ prefix: '/nurse', roles: ['admin', 'nurse'], permission: 'ipd.view' }],
    },
    {
        key: 'opd_manager', name: 'OPD Manager', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/opd-manager'],
        actionsFiles: ['opd-manager-actions'],
        legacyPermissions: [],
        dependsOn: ['opd'], defaultRoles: ['opd_manager'],
        legacyGates: [{ prefix: '/opd-manager', roles: ['admin', 'opd_manager'], permission: 'opd.view' }],
    },
    {
        key: 'hr', name: 'HR & Attendance', layer: 'business', dataLevel: 'company',
        routePrefixes: ['/hr'],
        actionsFiles: ['hr-actions'],
        legacyPermissions: perms('hr'),
        permissions: [
            { key: 'hr.dashboard.view', legacyKey: 'hr.view', description: 'HR dashboard' },
            { key: 'hr.employee.view', legacyKey: 'hr.view', description: 'View employee records' },
            { key: 'hr.employee.create', legacyKey: 'hr.create', description: 'Create employees' },
            { key: 'hr.employee.edit', legacyKey: 'hr.edit', description: 'Edit employee records' },
            { key: 'hr.attendance.view', legacyKey: 'hr.view', description: 'View attendance' },
            { key: 'hr.attendance.edit', legacyKey: 'hr.edit', description: 'Edit attendance and regularizations' },
            { key: 'hr.attendance.approve', legacyKey: 'hr.approve', description: 'Approve attendance regularizations' },
            { key: 'hr.leave.view', legacyKey: 'hr.view', description: 'View leave requests and balances' },
            { key: 'hr.leave.create', legacyKey: 'hr.create', description: 'Apply leave on behalf of an employee' },
            { key: 'hr.leave.edit', legacyKey: 'hr.edit', description: 'Cancel or amend leave' },
            { key: 'hr.leave.approve', legacyKey: 'hr.approve', description: 'Approve or reject leave' },
            { key: 'hr.roster.view', legacyKey: 'hr.view', description: 'View shift rosters' },
            { key: 'hr.roster.edit', legacyKey: 'hr.edit', description: 'Create and edit shift rosters' },
            { key: 'hr.holiday.view', legacyKey: 'hr.view', description: 'View holidays' },
            { key: 'hr.holiday.edit', legacyKey: 'hr.edit', description: 'Manage holidays' },
            { key: 'hr.policy.view', legacyKey: 'hr.view', description: 'View HR policy' },
            { key: 'hr.policy.edit', legacyKey: 'hr.edit', description: 'Change HR policy and leave types' },
            { key: 'hr.report.export', legacyKey: 'hr.export', description: 'Export HR data' },
        ],
        // Ownership used by scopeWhere(): which column ties a row to an employee / unit.
        models: {
            Attendance: { employeeField: 'employee_id', unitField: 'organizationId' },
            AttendanceEvent: { employeeField: 'employee_id', unitField: 'organizationId' },
            AttendanceRegularization: { employeeField: 'employee_id', unitField: 'organizationId' },
            LeaveRequest: { employeeField: 'employee_id', unitField: 'organizationId' },
            ShiftAssignment: { employeeField: 'employee_id', unitField: 'organizationId' },
            Employee: { employeeField: 'id', unitField: 'organizationId', companyField: 'company_id' },
        },
        dependsOn: [], defaultRoles: ['hr'],
        legacyGates: [{ prefix: '/hr', roles: ['admin', 'hr'], permission: 'hr.view' }],
    },
    {
        key: 'ot', name: 'Operation Theatre', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/ot'],
        actionsFiles: ['ot-actions'],
        legacyPermissions: ['ot.view'],
        dependsOn: ['ipd'], defaultRoles: ['ot_manager'],
        legacyGates: [{ prefix: '/ot', roles: ['admin', 'ot_manager', 'doctor', 'nurse'], permission: 'ot.view' }],
    },
    {
        key: 'er', name: 'Emergency', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/er'],
        actionsFiles: ['er-actions'],
        legacyPermissions: ['er.view'],
        dependsOn: ['reception', 'billing'], defaultRoles: ['er_staff'],
        legacyGates: [{ prefix: '/er', roles: ['admin', 'er_staff', 'doctor', 'nurse'], permission: 'er.view' }],
    },
    {
        key: 'billing', name: 'Master Billing', layer: 'business', dataLevel: 'unit',
        routePrefixes: ['/billing', '/api/invoice', '/api/payment', '/api/refund', '/api/deposit', '/api/bill-preview', '/api/razorpay'],
        actionsFiles: ['master-billing-actions', 'billing-engine', 'deposit-actions', 'fee-receipt-actions', 'approval-center-actions'],
        legacyPermissions: ['billing.view'],
        dependsOn: [], defaultRoles: ['finance', 'ipd_manager', 'receptionist', 'opd_manager'],
        legacyGates: [{ prefix: '/billing', roles: ['admin', 'finance', 'ipd_manager', 'receptionist', 'opd_manager'], permission: 'billing.view' }],
    },

    // ───────────── NOT gated by proxy.ts (any logged-in staff can open them by URL) ─────────────
    {
        // LEGACY-QUIRK: the employee self-service portal is deliberately open to every staff role.
        key: 'ess', name: 'My Workspace (Employee Self-Service)', layer: 'core', dataLevel: 'company',
        routePrefixes: ['/me'],
        actionsFiles: ['hr-self-service-actions'],
        legacyPermissions: [],
        // Every active employee holds these at OWN scope; the engine grants them implicitly (alwaysOn).
        permissions: [
            { key: 'ess.self.view', description: 'See my own workspace, attendance, leave, roster, profile' },
            { key: 'ess.self.edit', description: 'Punch, apply for leave, request regularization, edit my profile' },
        ],
        dependsOn: [], defaultRoles: [], alwaysOn: true,
    },
    {
        // LEGACY-QUIRK: no proxy gate — any staff user can open /crm by URL.
        key: 'crm', name: 'CRM', layer: 'business', dataLevel: 'unit',
        routePrefixes: ['/crm'],
        actionsFiles: ['crm-actions'],
        legacyPermissions: [],
        dependsOn: [], defaultRoles: ['crm_manager'],
    },
    {
        // LEGACY-QUIRK: no proxy gate (layout is a pass-through).
        key: 'call_center', name: 'Call Centre', layer: 'business', dataLevel: 'unit',
        routePrefixes: ['/call-center'],
        actionsFiles: [],
        legacyPermissions: [],
        dependsOn: [], defaultRoles: ['call_center'],
    },
    {
        // LEGACY-QUIRK: no proxy gate.
        key: 'coordinator', name: 'Coordinator', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/coordinator'],
        actionsFiles: [],
        legacyPermissions: [],
        dependsOn: ['ipd'], defaultRoles: ['coordinator'],
    },
    {
        // LEGACY-QUIRK: no proxy gate.
        key: 'counselling', name: 'Counselling', layer: 'pack', pack: 'healthcare', dataLevel: 'unit',
        routePrefixes: ['/counselling'],
        actionsFiles: ['counselling-actions'],
        legacyPermissions: [],
        dependsOn: [], defaultRoles: ['counsellor'],
    },
    {
        key: 'mis', name: 'MIS & Reports', layer: 'business', dataLevel: 'unit',
        routePrefixes: ['/api/reports', '/api/mis'],
        actionsFiles: ['mis-report-actions', 'report-actions', 'report-export-actions'],
        legacyPermissions: ['reports.view', 'reports.export'],
        dependsOn: [], defaultRoles: [],
    },
    {
        key: 'print_center', name: 'Print Centre', layer: 'core', dataLevel: 'unit',
        routePrefixes: ['/print-center'],
        actionsFiles: [],
        legacyPermissions: [],
        dependsOn: [], defaultRoles: [],
    },
    {
        key: 'notifications', name: 'Notifications', layer: 'core', dataLevel: 'unit',
        routePrefixes: ['/notifications', '/api/notifications', '/api/whatsapp'],
        actionsFiles: ['notification-actions'],
        legacyPermissions: [],
        dependsOn: [], defaultRoles: [],
    },
    {
        key: 'help_center', name: 'Help Centre', layer: 'core', dataLevel: 'unit',
        routePrefixes: ['/help-center'],
        actionsFiles: ['help-center-actions'],
        legacyPermissions: [],
        dependsOn: [], defaultRoles: [],
    },
];

/**
 * Top-level route trees that are NOT staff modules: separate login realms, the login page,
 * public pages and the root redirect. The registry coverage check requires every
 * `app/<dir>/**\/page.tsx` tree to be either a module prefix or listed here.
 */
export const NON_STAFF_ROUTE_PREFIXES: readonly string[] = [
    '/patient', // patient realm
    '/superadmin', // platform operators
    '/dev-portal', // dev realm
    '/investor', // investor realm
    '/login', // staff + investor login
    '/hospital', // public hospital page
];

export const MODULE_KEYS: readonly string[] = MODULES.map((m) => m.key);

/** Every legacy 2-part permission string any module owns. */
export const LEGACY_PERMISSION_KEYS: readonly string[] = Array.from(new Set(MODULES.flatMap((m) => m.legacyPermissions)));
