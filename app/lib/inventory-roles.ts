export const INVENTORY_ADMIN_ROLES = ['admin', 'store_manager'] as const;
export const INVENTORY_PROCUREMENT_ROLES = ['admin', 'store_manager', 'procurement_officer'] as const;
export const INVENTORY_FINANCE_ROLES = ['admin', 'finance', 'store_manager'] as const;
export const INVENTORY_ISSUE_ROLES = ['admin', 'store_manager'] as const;
export const INVENTORY_INDENT_ROLES = [
  'admin',
  'store_manager',
  'nurse',
  'lab_technician',
  'ipd_manager',
  'opd_manager',
  'pharmacist',
] as const;
export const INVENTORY_VIEW_ROLES = [
  'admin',
  'store_manager',
  'procurement_officer',
  'finance',
  'nurse',
  'lab_technician',
  'ipd_manager',
  'opd_manager',
  'pharmacist',
] as const;

export const ITEM_TYPES = [
  'CONSUMABLE',
  'REAGENT',
  'IMPLANT',
  'LINEN',
  'STATIONERY',
  'MAINTENANCE',
  'EQUIPMENT_SPARE',
  'FOOD_DIETARY',
  'OTHER',
] as const;

export const STORE_TYPES = [
  'CENTRAL',
  'PHARMACY',
  'WARD',
  'OT',
  'ER',
  'LAB',
  'RADIOLOGY',
  'MAINTENANCE',
  'HOUSEKEEPING',
  'KITCHEN',
  'CSSD',
] as const;

export function hasInventoryRole(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}
