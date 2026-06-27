/**
 * Inventory RBAC — route access + UI capabilities per role.
 * Aligns with PRD role matrix (store_manager, procurement_officer, admin, finance, clinical roles).
 */

export type InventoryCapability =
  | 'view_dashboard'
  | 'propose_items'
  | 'approve_items'
  | 'manage_stores'
  | 'view_stock'
  | 'receive_grn'
  | 'create_po'
  | 'approve_po'
  | 'enter_invoice'
  | 'match_invoice'
  | 'approve_variance'
  | 'issue_stock'
  | 'raise_indent'
  | 'approve_indent'
  | 'confirm_receipt'
  | 'record_consumption'
  | 'transfers'
  | 'physical_count'
  | 'adjustments'
  | 'reports'
  | 'reconcile'
  | 'module_settings';

const ROLE_CAPABILITIES: Record<string, InventoryCapability[]> = {
  admin: [
    'view_dashboard', 'propose_items', 'approve_items', 'manage_stores', 'view_stock',
    'receive_grn', 'create_po', 'approve_po', 'enter_invoice', 'match_invoice', 'approve_variance',
    'issue_stock', 'raise_indent', 'approve_indent', 'confirm_receipt', 'record_consumption',
    'transfers', 'physical_count', 'adjustments', 'reports', 'reconcile', 'module_settings',
  ],
  store_manager: [
    'view_dashboard', 'propose_items', 'view_stock', 'receive_grn', 'create_po', 'approve_po',
    'issue_stock', 'raise_indent', 'approve_indent', 'confirm_receipt', 'record_consumption',
    'transfers', 'physical_count', 'adjustments', 'reports',
  ],
  procurement_officer: [
    'view_dashboard', 'view_stock', 'create_po', 'enter_invoice', 'match_invoice', 'reports',
  ],
  finance: [
    'view_dashboard', 'view_stock', 'approve_variance', 'physical_count', 'reports', 'reconcile',
  ],
  nurse: ['view_dashboard', 'view_stock', 'raise_indent', 'confirm_receipt', 'record_consumption'],
  lab_technician: ['view_dashboard', 'view_stock', 'raise_indent', 'confirm_receipt', 'record_consumption'],
  ipd_manager: ['view_dashboard', 'view_stock', 'raise_indent', 'confirm_receipt', 'record_consumption'],
  opd_manager: ['view_dashboard', 'view_stock', 'raise_indent', 'confirm_receipt', 'record_consumption'],
  pharmacist: ['view_dashboard', 'view_stock', 'raise_indent', 'confirm_receipt'],
};

/** Route prefix → roles allowed (longest match wins in canAccessInventoryRoute). */
export const INVENTORY_ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: '/inventory/dashboard', roles: ['admin', 'store_manager', 'procurement_officer', 'finance', 'nurse', 'lab_technician', 'ipd_manager', 'opd_manager', 'pharmacist'] },
  { prefix: '/inventory/items', roles: ['admin', 'store_manager', 'procurement_officer'] },
  { prefix: '/inventory/stores', roles: ['admin', 'store_manager'] },
  { prefix: '/inventory/stock', roles: ['admin', 'store_manager', 'procurement_officer', 'finance', 'nurse', 'lab_technician', 'ipd_manager', 'opd_manager', 'pharmacist'] },
  { prefix: '/inventory/issues', roles: ['admin', 'store_manager', 'nurse', 'lab_technician', 'ipd_manager', 'opd_manager'] },
  { prefix: '/inventory/opening-stock', roles: ['admin', 'store_manager'] },
  { prefix: '/inventory/indents', roles: ['admin', 'store_manager', 'nurse', 'lab_technician', 'ipd_manager', 'opd_manager', 'pharmacist'] },
  { prefix: '/inventory/procurement', roles: ['admin', 'store_manager', 'procurement_officer'] },
  { prefix: '/inventory/transfers', roles: ['admin', 'store_manager'] },
  { prefix: '/inventory/counts', roles: ['admin', 'store_manager', 'finance'] },
  { prefix: '/inventory/kits', roles: ['admin', 'store_manager'] },
  { prefix: '/inventory/cssd', roles: ['admin', 'store_manager'] },
  { prefix: '/inventory/barcode', roles: ['admin', 'store_manager'] },
  { prefix: '/inventory/reconcile', roles: ['admin', 'finance'] },
  { prefix: '/inventory/reports', roles: ['admin', 'store_manager', 'procurement_officer', 'finance'] },
  { prefix: '/inventory', roles: ['admin', 'store_manager', 'procurement_officer', 'finance', 'nurse', 'lab_technician', 'ipd_manager', 'opd_manager', 'pharmacist'] },
];

export function inventoryCapabilities(role: string): Set<InventoryCapability> {
  return new Set(ROLE_CAPABILITIES[role] || ['view_dashboard']);
}

export function hasInventoryCapability(role: string, cap: InventoryCapability): boolean {
  return inventoryCapabilities(role).has(cap);
}

export function canAccessInventoryRoute(role: string, pathname: string): boolean {
  if (!pathname.startsWith('/inventory')) return true;
  const hits = INVENTORY_ROUTE_ROLES.filter(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  if (hits.length === 0) return INVENTORY_ROUTE_ROLES.at(-1)!.roles.includes(role);
  const best = hits.reduce((a, b) => (a.prefix.length >= b.prefix.length ? a : b));
  return best.roles.includes(role);
}

/** Nav hrefs allowed per role (sidebar + dashboard module grid). */
export function inventoryHrefsForRole(role: string): string[] {
  const caps = inventoryCapabilities(role);
  const hrefs: string[] = [];
  if (caps.has('view_dashboard')) hrefs.push('/inventory/dashboard');
  if (caps.has('propose_items') || caps.has('approve_items')) hrefs.push('/inventory/items');
  if (caps.has('manage_stores')) hrefs.push('/inventory/stores');
  if (caps.has('view_stock')) hrefs.push('/inventory/stock');
  if (caps.has('record_consumption') || caps.has('issue_stock')) hrefs.push('/inventory/issues');
  if (caps.has('adjustments')) hrefs.push('/inventory/opening-stock');
  if (caps.has('raise_indent') || caps.has('approve_indent') || caps.has('confirm_receipt')) hrefs.push('/inventory/indents');
  if (caps.has('create_po') || caps.has('receive_grn') || caps.has('enter_invoice')) hrefs.push('/inventory/procurement');
  if (caps.has('transfers')) hrefs.push('/inventory/transfers');
  if (caps.has('physical_count')) hrefs.push('/inventory/counts');
  if (role === 'store_manager' || role === 'admin') {
    hrefs.push('/inventory/kits', '/inventory/cssd', '/inventory/barcode');
  }
  if (caps.has('reconcile')) hrefs.push('/inventory/reconcile');
  if (caps.has('reports')) hrefs.push('/inventory/reports');
  if (caps.has('module_settings')) hrefs.push('/admin/inventory');
  return [...new Set(hrefs)];
}
