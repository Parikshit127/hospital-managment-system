/**
 * System role templates — COMPANY_OS_PLAN.md §5 rule 9 / Phase 1.
 *
 * Every value is copied VERBATIM from the code that decides it today and is parity-tested
 * (npm run check:parity). Nothing here is invented. Where the copies disagree the
 * disagreement is preserved and marked LEGACY-QUIRK; they are reconciled into one canonical
 * permission set in Phase 3/4 (never silently).
 *
 * Edge-safe: data only.
 */
import type { SystemRoleDef } from '../modules/types';

export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  // LEGACY-QUIRK: proxy.ts ROLE_PERMISSIONS grants admin only the *.view keys (+ot/er/billing) while session.ts grants every action; hasPermission() short-circuits true for admin anyway.
  {
    slug: 'admin',
    label: 'Admin',
    legacyHome: { proxy: '/admin/dashboard', login: '/admin/dashboard' },
    legacyPermissions: {
      session: ['opd.view', 'opd.create', 'opd.edit', 'opd.delete', 'opd.approve', 'opd.export', 'ipd.view', 'ipd.create', 'ipd.edit', 'ipd.delete', 'ipd.approve', 'ipd.export', 'lab.view', 'lab.create', 'lab.edit', 'lab.delete', 'lab.approve', 'lab.export', 'pharmacy.view', 'pharmacy.create', 'pharmacy.edit', 'pharmacy.delete', 'pharmacy.approve', 'pharmacy.export', 'finance.view', 'finance.create', 'finance.edit', 'finance.delete', 'finance.approve', 'finance.export', 'insurance.view', 'insurance.create', 'insurance.edit', 'insurance.delete', 'insurance.approve', 'insurance.export', 'hr.view', 'hr.create', 'hr.edit', 'hr.delete', 'hr.approve', 'hr.export', 'admin.view', 'admin.create', 'admin.edit', 'admin.delete', 'admin.approve', 'admin.export', 'reports.view', 'reports.export'],
      roleActions: ['opd.view', 'opd.create', 'opd.edit', 'opd.delete', 'opd.approve', 'opd.export', 'ipd.view', 'ipd.create', 'ipd.edit', 'ipd.delete', 'ipd.approve', 'ipd.export', 'lab.view', 'lab.create', 'lab.edit', 'lab.delete', 'lab.approve', 'lab.export', 'pharmacy.view', 'pharmacy.create', 'pharmacy.edit', 'pharmacy.delete', 'pharmacy.approve', 'pharmacy.export', 'finance.view', 'finance.create', 'finance.edit', 'finance.delete', 'finance.approve', 'finance.export', 'insurance.view', 'insurance.create', 'insurance.edit', 'insurance.delete', 'insurance.approve', 'insurance.export', 'hr.view', 'hr.create', 'hr.edit', 'hr.delete', 'hr.approve', 'hr.export', 'admin.view', 'admin.create', 'admin.edit', 'admin.delete', 'admin.approve', 'admin.export', 'reports.view', 'reports.export'],
      proxy: ['opd.view', 'ipd.view', 'lab.view', 'pharmacy.view', 'finance.view', 'insurance.view', 'hr.view', 'admin.view', 'reports.view', 'ot.view', 'er.view', 'billing.view'],
    },
  },
  {
    slug: 'doctor',
    label: 'Doctor',
    legacyHome: { proxy: '/doctor/dashboard', login: '/doctor/dashboard' },
    legacyPermissions: {
      session: ['opd.view', 'opd.create', 'opd.edit', 'ipd.view', 'ipd.create', 'ipd.edit', 'lab.view', 'lab.create', 'pharmacy.view', 'finance.view', 'insurance.view', 'reports.view'],
      roleActions: ['opd.view', 'opd.create', 'opd.edit', 'ipd.view', 'ipd.create', 'ipd.edit', 'lab.view', 'lab.create', 'pharmacy.view', 'finance.view', 'insurance.view', 'reports.view'],
      proxy: ['opd.view', 'ipd.view', 'lab.view', 'pharmacy.view', 'finance.view', 'insurance.view', 'reports.view', 'ot.view', 'er.view'],
    },
  },
  // LEGACY-QUIRK: role-actions.ts omits ipd.create/ipd.edit that session.ts grants — the permission-matrix UI and hasPermission() disagree.
  {
    slug: 'receptionist',
    label: 'Receptionist',
    legacyHome: { proxy: '/reception', login: '/reception' },
    legacyPermissions: {
      session: ['opd.view', 'opd.create', 'opd.edit', 'ipd.view', 'ipd.create', 'ipd.edit', 'finance.view', 'finance.create', 'insurance.view', 'reports.view'],
      roleActions: ['opd.view', 'opd.create', 'opd.edit', 'ipd.view', 'finance.view', 'finance.create', 'insurance.view', 'reports.view'],
      proxy: ['opd.view', 'ipd.view', 'finance.view', 'insurance.view', 'reports.view', 'billing.view'],
    },
  },
  {
    slug: 'lab_technician',
    label: 'Lab Technician',
    legacyHome: { proxy: '/lab/technician', login: '/lab/technician' },
    legacyPermissions: {
      session: ['lab.view', 'lab.create', 'lab.edit', 'reports.view'],
      roleActions: ['lab.view', 'lab.create', 'lab.edit', 'reports.view'],
      proxy: ['lab.view', 'reports.view'],
    },
  },
  {
    slug: 'pharmacist',
    label: 'Pharmacist',
    legacyHome: { proxy: '/pharmacy/billing', login: '/pharmacy/billing' },
    legacyPermissions: {
      session: ['pharmacy.view', 'pharmacy.create', 'pharmacy.edit', 'reports.view'],
      roleActions: ['pharmacy.view', 'pharmacy.create', 'pharmacy.edit', 'reports.view'],
      proxy: ['pharmacy.view', 'reports.view'],
    },
  },
  {
    slug: 'finance',
    label: 'Finance',
    legacyHome: { proxy: '/finance/dashboard', login: '/finance/dashboard' },
    legacyPermissions: {
      session: ['finance.view', 'finance.create', 'finance.edit', 'finance.approve', 'finance.export', 'insurance.view', 'insurance.create', 'insurance.edit', 'reports.view', 'reports.export'],
      roleActions: ['finance.view', 'finance.create', 'finance.edit', 'finance.approve', 'finance.export', 'insurance.view', 'insurance.create', 'insurance.edit', 'reports.view', 'reports.export'],
      proxy: ['finance.view', 'insurance.view', 'reports.view', 'billing.view'],
    },
  },
  {
    slug: 'ipd_manager',
    label: 'IPD Manager',
    legacyHome: { proxy: '/ipd', login: '/ipd' },
    legacyPermissions: {
      session: ['ipd.view', 'ipd.create', 'ipd.edit', 'ipd.approve', 'opd.view', 'lab.view', 'pharmacy.view', 'finance.view', 'reports.view', 'reports.export'],
      roleActions: ['ipd.view', 'ipd.create', 'ipd.edit', 'ipd.approve', 'opd.view', 'lab.view', 'pharmacy.view', 'finance.view', 'reports.view', 'reports.export'],
      proxy: ['ipd.view', 'opd.view', 'lab.view', 'pharmacy.view', 'finance.view', 'reports.view', 'ot.view', 'billing.view', 'insurance.view'],
    },
  },
  {
    slug: 'nurse',
    label: 'Nurse',
    legacyHome: { proxy: '/nurse/dashboard', login: '/nurse/dashboard' },
    legacyPermissions: {
      session: ['ipd.view', 'ipd.edit', 'opd.view', 'lab.view', 'pharmacy.view', 'reports.view'],
      roleActions: ['ipd.view', 'ipd.edit', 'opd.view', 'lab.view', 'pharmacy.view', 'reports.view'],
      proxy: ['ipd.view', 'opd.view', 'lab.view', 'pharmacy.view', 'reports.view', 'ot.view', 'er.view'],
    },
  },
  {
    slug: 'opd_manager',
    label: 'OPD Manager',
    legacyHome: { proxy: '/opd-manager/dashboard', login: '/opd-manager/dashboard' },
    legacyPermissions: {
      session: ['opd.view', 'opd.create', 'opd.edit', 'opd.approve', 'lab.view', 'pharmacy.view', 'finance.view', 'reports.view', 'reports.export'],
      roleActions: ['opd.view', 'opd.create', 'opd.edit', 'opd.approve', 'lab.view', 'pharmacy.view', 'finance.view', 'reports.view', 'reports.export'],
      proxy: ['opd.view', 'lab.view', 'pharmacy.view', 'finance.view', 'reports.view', 'billing.view'],
    },
  },
  {
    slug: 'hr',
    label: 'HR',
    legacyHome: { proxy: '/hr/dashboard', login: '/hr/dashboard' },
    legacyPermissions: {
      session: ['hr.view', 'hr.create', 'hr.edit', 'hr.approve', 'hr.export', 'reports.view', 'reports.export'],
      roleActions: ['hr.view', 'hr.create', 'hr.edit', 'hr.approve', 'hr.export', 'reports.view', 'reports.export'],
      proxy: ['hr.view', 'reports.view'],
    },
  },
  // LEGACY-QUIRK: absent from session.ts and role-actions.ts → hasPermission() always false and the roles UI doesn't list it; only proxy.ts + sidebar know this role.
  {
    slug: 'ot_manager',
    label: 'OT Manager',
    legacyHome: { proxy: '/ot/dashboard', login: '/ot/dashboard' },
    legacyPermissions: {
      session: undefined,
      roleActions: undefined,
      proxy: ['ot.view', 'ipd.view', 'pharmacy.view', 'reports.view'],
    },
  },
  // LEGACY-QUIRK: absent from session.ts and role-actions.ts (same as ot_manager).
  {
    slug: 'er_staff',
    label: 'ER Staff',
    legacyHome: { proxy: '/er/dashboard', login: '/er/dashboard' },
    legacyPermissions: {
      session: undefined,
      roleActions: undefined,
      proxy: ['er.view', 'ipd.view', 'lab.view', 'pharmacy.view', 'reports.view'],
    },
  },
  // LEGACY-QUIRK: login redirects to /coordinator/dashboard but proxy.ts redirectMap has no entry (falls back to '/'); no proxy role gate or permissions at all.
  {
    slug: 'coordinator',
    label: 'Coordinator',
    legacyHome: { proxy: undefined, login: '/coordinator/dashboard' },
    legacyPermissions: {
      session: undefined,
      roleActions: undefined,
      proxy: undefined,
    },
  },
  // LEGACY-QUIRK: sidebar-only role — no proxy gate, no permissions, no login redirect (login default → /admin/dashboard); not in the createUser Zod enum.
  {
    slug: 'counsellor',
    label: 'Counsellor',
    legacyHome: { proxy: undefined, login: undefined },
    legacyPermissions: {
      session: undefined,
      roleActions: undefined,
      proxy: undefined,
    },
  },
  // LEGACY-QUIRK: sidebar-only role (same as counsellor).
  {
    slug: 'call_center',
    label: 'Call Center',
    legacyHome: { proxy: undefined, login: undefined },
    legacyPermissions: {
      session: undefined,
      roleActions: undefined,
      proxy: undefined,
    },
  },
  // LEGACY-QUIRK: sidebar-only role (same as counsellor).
  {
    slug: 'crm_manager',
    label: 'CRM Manager',
    legacyHome: { proxy: undefined, login: undefined },
    legacyPermissions: {
      session: undefined,
      roleActions: undefined,
      proxy: undefined,
    },
  },
];

export const SYSTEM_ROLE_SLUGS: readonly string[] = SYSTEM_ROLES.map((r) => r.slug);
