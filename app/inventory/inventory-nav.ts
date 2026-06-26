import {
  LayoutDashboard,
  Package,
  Warehouse,
  PackageOpen,
  Syringe,
  ClipboardList,
  ShoppingCart,
  ArrowLeftRight,
  ClipboardCheck,
  Boxes,
  ShieldCheck,
  ScanLine,
  Scale,
  BarChart3,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { inventoryHrefsForRole } from '@/app/lib/inventory-rbac';

export type InventoryNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  desc?: string;
  group?: 'core' | 'operations' | 'finance' | 'advanced';
};

export const INVENTORY_NAV_ITEMS: InventoryNavItem[] = [
  { label: 'Dashboard', href: '/inventory/dashboard', icon: LayoutDashboard, desc: 'Overview & KPIs', group: 'core' },
  { label: 'Item Master', href: '/inventory/items', icon: Package, desc: 'Catalogue & categories', group: 'core' },
  { label: 'Stores', href: '/inventory/stores', icon: Warehouse, desc: 'Store hierarchy', group: 'core' },
  { label: 'Stock & Ledger', href: '/inventory/stock', icon: PackageOpen, desc: 'On-hand & movements', group: 'core' },
  { label: 'Issues', href: '/inventory/issues', icon: Syringe, desc: 'Consumption & write-offs', group: 'operations' },
  { label: 'Opening Stock', href: '/inventory/opening-stock', icon: PackageOpen, desc: 'Initial stock load', group: 'operations' },
  { label: 'Indents', href: '/inventory/indents', icon: ClipboardList, desc: 'Internal requisitions', group: 'operations' },
  { label: 'Procurement', href: '/inventory/procurement', icon: ShoppingCart, desc: 'PR, PO & GRN', group: 'operations' },
  { label: 'Transfers', href: '/inventory/transfers', icon: ArrowLeftRight, desc: 'Inter-store moves', group: 'operations' },
  { label: 'Physical Count', href: '/inventory/counts', icon: ClipboardCheck, desc: 'Cycle & variance', group: 'operations' },
  { label: 'Kits / BOM', href: '/inventory/kits', icon: Boxes, desc: 'Kit definitions', group: 'advanced' },
  { label: 'CSSD', href: '/inventory/cssd', icon: ShieldCheck, desc: 'Instrument register', group: 'advanced' },
  { label: 'Barcode Scan', href: '/inventory/barcode', icon: ScanLine, desc: 'Scan lookup', group: 'advanced' },
  { label: 'GL Reconcile', href: '/inventory/reconcile', icon: Scale, desc: 'Finance reconciliation', group: 'finance' },
  { label: 'Reports', href: '/inventory/reports', icon: BarChart3, desc: 'ABC/VED & analytics', group: 'finance' },
  { label: 'Module Settings', href: '/admin/inventory', icon: Settings2, desc: 'Config & migration', group: 'core' },
];

export const INVENTORY_DASHBOARD_MODULES = INVENTORY_NAV_ITEMS.filter(
  (item) => item.href !== '/inventory/dashboard' && item.href !== '/admin/inventory',
);

export function inventoryNavForRole(role: string): InventoryNavItem[] {
  const allowed = new Set(inventoryHrefsForRole(role));
  return INVENTORY_NAV_ITEMS.filter((item) => allowed.has(item.href));
}

export function inventoryNavSection(role: string, title = 'Inventory') {
  return {
    title,
    items: inventoryNavForRole(role).map(({ label, href, icon }) => ({ label, href, icon })),
  };
}

export const INVENTORY_MODULE_GROUPS: { key: InventoryNavItem['group']; label: string }[] = [
  { key: 'core', label: 'Core' },
  { key: 'operations', label: 'Operations' },
  { key: 'finance', label: 'Finance & Reports' },
  { key: 'advanced', label: 'Advanced' },
];
