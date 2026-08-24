// Single source of truth for IPD Service Master categories. Keep this in sync
// with the z.enum in service-master-actions.ts — both must list the same
// values, since Prisma stores whatever string is submitted and nothing else
// validates it.
export const SERVICE_MASTER_CATEGORIES = [
  'OPD Consultation', 'ICU', 'Procedure', 'Room', 'Nursing', 'Diet', 'Consumable',
  'Home Care', 'Visit Charges', 'Observation Ward/Bed Charges', 'Misc',
  'Surgery', 'Operation Theatre', 'Anaesthesia', 'Cardiology', 'Administration',
] as const;

// Categories the free-text "Post Manual Charge" picker on the IPD bill offers.
// These operational categories (Pharmacy/Lab/Radiology/Package/etc.) drive
// billing logic elsewhere (pharmacist-only edit gating, package routing,
// billing-tab grouping) and aren't part of the Service Master catalog, so they
// come first. Any Service Master category not already in that base set is
// appended, so adding a category in Service Master (e.g. "Surgery") makes it
// available here too without a second manual edit.
const MANUAL_CHARGE_BASE_CATEGORIES = [
  'Miscellaneous', 'Package', 'Pharmacy', 'Lab', 'Radiology', 'Procedure',
  'DoctorVisit', 'Consultation', 'Room', 'Nursing',
] as const;

export const MANUAL_CHARGE_CATEGORIES: string[] = [
  ...MANUAL_CHARGE_BASE_CATEGORIES,
  ...SERVICE_MASTER_CATEGORIES.filter(c => !(MANUAL_CHARGE_BASE_CATEGORIES as readonly string[]).includes(c)),
];
