/**
 * Per-category field registry for the Asset Register.
 *
 * Client-safe (no 'use server', no Prisma). One definition drives four things
 * that used to be four hardcoded copies: the Add Asset form, the register
 * table columns, the import template headers, and the import validator. Change
 * a category's column list here and all four follow.
 *
 * Every `key` is a real column on `FixedAsset`. Keys the register always shows
 * itself — s_no, category, the Active/Disposed lifecycle, book value, the
 * encrypted access code — are deliberately NOT here; this list is only the
 * descriptive columns that differ between an IT laptop and a wheelchair.
 */

export type AssetFieldType = 'string' | 'text' | 'number' | 'date' | 'select';

export interface AssetField {
    /** FixedAsset column name. Also the import sheet header. */
    key: string;
    /** Sheet header / form label as the hospital says it ("Brand", not "manufacturer"). */
    label: string;
    type: AssetFieldType;
    required?: boolean;
    /** Suggested values. Import still accepts free text — a sheet holds what it holds. */
    options?: string[];
    example?: string;
    /** Small grey subtitle under a table header or form label. */
    hint?: string;
    /** Spans both form columns; wraps rather than stretches in the table. */
    wide?: boolean;
}

/** Field catalogue. `f(key, overrides)` reuses a definition with a category's own wording. */
const CATALOGUE: Record<string, AssetField> = {
    asset_name: { key: 'asset_name', label: 'Asset Name', type: 'string', required: true, example: 'Dell Latitude 5420 - Reception' },
    asset_type: { key: 'asset_type', label: 'Asset Type', type: 'select', options: ['Laptop', 'Desktop', 'All-in-One', 'Workstation', 'Server', 'Tablet', 'Thin Client'], example: 'Laptop' },
    manufacturer: { key: 'manufacturer', label: 'Manufacturer', type: 'string', example: 'Dell' },
    model_number: { key: 'model_number', label: 'Model', type: 'string', example: 'Latitude 5420' },
    serial_number: { key: 'serial_number', label: 'Serial Number', type: 'string', example: 'SN-7788XJ22' },
    department: { key: 'department', label: 'Department', type: 'string', example: 'Accounts' },
    location: { key: 'location', label: 'Location', type: 'string', example: '2nd Floor - Room 204' },
    assigned_to: { key: 'assigned_to', label: 'Assigned User', type: 'string', example: 'Rahul Sharma' },
    cpu_details: { key: 'cpu_details', label: 'Processor (CPU)', type: 'string', example: 'Intel Core i5 11th Gen' },
    ram: { key: 'ram', label: 'RAM', type: 'string', example: '8 GB' },
    storage: { key: 'storage', label: 'Storage', type: 'string', example: '512 GB SSD' },
    operating_system: { key: 'operating_system', label: 'Operating System', type: 'string', example: 'Windows 11 Pro' },
    vendor_name: { key: 'vendor_name', label: 'Vendor / Supplier', type: 'string', example: 'ABC Computers Pvt Ltd' },
    working_status: { key: 'working_status', label: 'Status', type: 'select', options: ['Working', 'Not Working', 'Under Repair'], example: 'Working', hint: 'Does it work - separate from Active / Disposed' },
    condition: { key: 'condition', label: 'Condition', type: 'select', options: ['Good', 'Fair', 'Poor'], example: 'Good' },
    notes: { key: 'notes', label: 'Remarks / Issue', type: 'text', wide: true, example: 'Example row - replace with real data' },
    acquisition_date: { key: 'acquisition_date', label: 'Acquisition Date', type: 'date', required: true, example: '2026-04-01' },
    acquisition_cost: { key: 'acquisition_cost', label: 'Acquisition Cost (INR)', type: 'number', required: true, example: '55000' },
    warranty_expiry: { key: 'warranty_expiry', label: 'Warranty Expiry', type: 'date', example: '2029-04-01' },
    invoice_number: { key: 'invoice_number', label: 'Purchase Invoice No', type: 'string', example: 'INV-3321' },
    hardware_specs: { key: 'hardware_specs', label: 'Hardware Specifications', type: 'text', wide: true, hint: 'CPU / RAM / Storage', example: 'Intel Core i5 @ 3.2 GHz, 8 GB RAM, 477 GB HDD' },
    peripherals: { key: 'peripherals', label: 'Peripherals', type: 'text', wide: true, hint: 'K/B, Mouse, Monitor, Telephone', example: 'HP K/B + Mouse, Dell 19in monitor, Intercom 204' },
    printer_details: { key: 'printer_details', label: 'Printer Details', type: 'string', example: 'Canon Oplu Printer' },
    ups_network: { key: 'ups_network', label: 'UPS / Power & Network', type: 'string', example: 'APC 600VA UPS, LAN port 12' },
    status_notes: { key: 'notes', label: 'Status / Notes', type: 'text', wide: true, example: 'Working; keyboard replaced Jul-26' },
};

function f(key: keyof typeof CATALOGUE, overrides: Partial<AssetField> = {}): AssetField {
    return { ...CATALOGUE[key], ...overrides };
}

/** The hospital's IT inventory sheet, column for column. */
const COMPUTER_LAPTOP: AssetField[] = [
    f('asset_type', { required: true }),
    f('manufacturer', { label: 'Brand' }),
    f('model_number'),
    f('serial_number'),
    f('department'),
    f('location'),
    f('assigned_to'),
    f('cpu_details'),
    f('ram'),
    f('storage'),
    f('operating_system'),
    f('vendor_name'),
    f('working_status'),
    f('condition'),
    f('notes'),
];

/** What the register held before per-category columns existed. Also the fallback. */
const GENERAL: AssetField[] = [
    f('asset_name'),
    f('location'),
    f('department'),
    f('manufacturer'),
    f('model_number'),
    f('serial_number'),
    f('vendor_name'),
    f('acquisition_date'),
    f('acquisition_cost'),
    f('invoice_number'),
    f('warranty_expiry'),
    f('assigned_to'),
    f('working_status'),
    f('condition'),
    f('status_notes'),
];

/** Desktops/printers/UPS recorded as one workstation row - the older IT sheet shape. */
const IT_EQUIPMENT: AssetField[] = [
    f('asset_name'),
    f('location'),
    f('department'),
    f('manufacturer'),
    f('model_number'),
    f('serial_number'),
    f('vendor_name'),
    f('acquisition_date'),
    f('acquisition_cost'),
    f('invoice_number'),
    f('warranty_expiry'),
    f('assigned_to'),
    f('cpu_details', { label: 'CPU' }),
    f('hardware_specs'),
    f('peripherals'),
    f('printer_details'),
    f('ups_network'),
    f('working_status'),
    f('condition'),
    f('status_notes'),
];

/** No CPU, no peripherals - a wheelchair has none of that. */
const NON_IT: AssetField[] = [
    f('asset_name'),
    f('location'),
    f('department'),
    f('manufacturer'),
    f('model_number'),
    f('serial_number'),
    f('vendor_name'),
    f('acquisition_date'),
    f('acquisition_cost'),
    f('invoice_number'),
    f('warranty_expiry'),
    f('assigned_to'),
    f('condition'),
    f('status_notes'),
];

/** Category name (lower-cased) -> its columns. */
const BY_CATEGORY: Record<string, AssetField[]> = {
    'computer/laptop': COMPUTER_LAPTOP,
    'it equipment': IT_EQUIPMENT,
    'medical equipment': NON_IT,
    'housekeeping': NON_IT,
    'reception & office': NON_IT,
    'furniture & fixtures': NON_IT,
};

/** Categories the register seeds and knows the columns for. Order = template dropdown order. */
export const KNOWN_ASSET_CATEGORIES = [
    'Computer/Laptop', 'IT Equipment', 'Medical Equipment',
    'Housekeeping', 'Reception & Office', 'Furniture & Fixtures',
] as const;

/** A category with no entry falls back to the general column set rather than showing nothing. */
export function assetFieldsFor(categoryName: string | null | undefined): AssetField[] {
    return BY_CATEGORY[String(categoryName ?? '').trim().toLowerCase()] ?? GENERAL;
}

/**
 * Union of several categories' columns, in first-seen order — what the register
 * table shows when no category filter is applied.
 */
export function assetFieldsForAll(categoryNames: (string | null | undefined)[]): AssetField[] {
    const seen = new Set<string>();
    const out: AssetField[] = [];
    for (const name of categoryNames) {
        for (const field of assetFieldsFor(name)) {
            if (seen.has(field.key)) continue;
            seen.add(field.key);
            out.push(field);
        }
    }
    return out.length ? out : GENERAL;
}

/**
 * Import sheet headers for a category. `s_no` leads because it is the match key
 * — a row carrying one updates that asset, a blank one creates a new asset.
 * `asset_code` (the hospital's own Asset ID) follows; `category` tells the
 * importer which column set the rest of the row belongs to.
 */
export function assetTemplateHeaders(categoryName?: string): string[] {
    return ['s_no', 'asset_code', 'category', ...assetFieldsFor(categoryName).map(x => x.key), 'access_code'];
}

/** Sample row for a downloaded template - the "replace with real data" line. */
export function assetTemplateSample(categoryName?: string): Record<string, string> {
    const row: Record<string, string> = {
        s_no: '',
        asset_code: 'ASSET-IT-001',
        category: categoryName ?? 'IT Equipment',
        access_code: '',
    };
    for (const field of assetFieldsFor(categoryName)) row[field.key] = field.example ?? '';
    return row;
}

/** `asset_name` is NOT NULL, but the IT sheet has no such column - build one from what it does have. */
export function deriveAssetName(row: Record<string, unknown>): string {
    const explicit = String(row.asset_name ?? '').trim();
    if (explicit) return explicit;
    const parts = [row.asset_type, row.manufacturer, row.model_number].map(v => String(v ?? '').trim()).filter(Boolean);
    return parts.join(' ');
}
