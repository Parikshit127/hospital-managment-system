import type { ImportType, ColumnMapping } from '@/app/types/import';

// ---- Date Parsing ----

const DATE_FORMATS = [
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/,
    // YYYY-MM-DD, YYYY/MM/DD
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
];

const MONTH_NAMES: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function parseDate(value: string): Date | null {
    if (!value || !value.trim()) return null;
    const trimmed = value.trim();

    // Try standard date formats
    for (const fmt of DATE_FORMATS) {
        const match = trimmed.match(fmt);
        if (match) {
            let day: number, month: number, year: number;
            if (match[1].length === 4) {
                // YYYY-MM-DD
                year = parseInt(match[1]);
                month = parseInt(match[2]);
                day = parseInt(match[3]);
            } else {
                // DD/MM/YYYY (Indian format preferred)
                day = parseInt(match[1]);
                month = parseInt(match[2]);
                year = parseInt(match[3]);
            }
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
                return new Date(year, month - 1, day);
            }
        }
    }

    // Try "15 March 2020" or "March 15, 2020" format
    const namedMatch = trimmed.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i)
        || trimmed.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (namedMatch) {
        let day: number, monthStr: string, year: number;
        if (/^\d/.test(namedMatch[1])) {
            day = parseInt(namedMatch[1]);
            monthStr = namedMatch[2].toLowerCase();
            year = parseInt(namedMatch[3]);
        } else {
            monthStr = namedMatch[1].toLowerCase();
            day = parseInt(namedMatch[2]);
            year = parseInt(namedMatch[3]);
        }
        const month = MONTH_NAMES[monthStr];
        if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
            return new Date(year, month - 1, day);
        }
    }

    // Try native Date.parse as last resort
    const nativeParsed = new Date(trimmed);
    if (!isNaN(nativeParsed.getTime()) && nativeParsed.getFullYear() >= 1900) {
        return nativeParsed;
    }

    return null;
}

// ---- Phone Normalization ----

export function normalizePhone(value: string): string {
    if (!value) return '';
    // Remove everything except digits
    const digits = value.replace(/[^\d]/g, '');
    // Handle +91 prefix or 0 prefix
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    if (digits.length === 10) return digits;
    return digits; // Return as-is if unusual format
}

// ---- Aadhaar Normalization ----

export function normalizeAadhaar(value: string): string {
    if (!value) return '';
    return value.replace(/[^\d]/g, '');
}

// ---- Gender Normalization ----

const GENDER_MAP: Record<string, string> = {
    m: 'Male', male: 'Male', man: 'Male', boy: 'Male',
    f: 'Female', female: 'Female', woman: 'Female', girl: 'Female',
    o: 'Other', other: 'Other', transgender: 'Other', trans: 'Other',
};

export function normalizeGender(value: string): string | undefined {
    if (!value) return undefined;
    return GENDER_MAP[value.toLowerCase().trim()] || undefined;
}

// ---- Amount Parsing ----

export function parseAmount(value: string): number | null {
    if (!value || !value.trim()) return null;
    // Remove currency symbols, Rs., INR, commas
    const cleaned = value.replace(/[₹$]|Rs\.?|INR/gi, '').replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

// ---- Boolean Parsing ----

const TRUE_VALUES = new Set(['yes', 'y', 'true', '1', 'on', 'active']);
const FALSE_VALUES = new Set(['no', 'n', 'false', '0', 'off', 'inactive']);

export function parseBoolean(value: string): boolean | null {
    if (!value) return null;
    const lower = value.toLowerCase().trim();
    if (TRUE_VALUES.has(lower)) return true;
    if (FALSE_VALUES.has(lower)) return false;
    return null;
}

// ---- Row Transformer ----

export function transformRow(
    row: Record<string, string>,
    mapping: ColumnMapping,
    importType: ImportType,
): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [sourceCol, mapInfo] of Object.entries(mapping)) {
        const targetField = mapInfo.targetField;
        const rawValue = row[sourceCol] ?? '';

        if (!rawValue.trim()) {
            transformed[targetField] = null;
            continue;
        }

        // Apply type-specific transformations based on the target field
        transformed[targetField] = transformField(targetField, rawValue, importType);
    }

    return transformed;
}

function transformField(field: string, value: string, _importType: ImportType): unknown {
    // Date fields
    if (field.includes('date') || field === 'date_of_birth' || field === 'expiry_date') {
        const parsed = parseDate(value);
        return parsed ? parsed.toISOString() : value;
    }

    // Phone fields
    if (field === 'phone' || field.includes('phone')) {
        return normalizePhone(value);
    }

    // Aadhaar
    if (field === 'aadhar_card') {
        return normalizeAadhaar(value);
    }

    // Gender
    if (field === 'gender') {
        return normalizeGender(value) || value;
    }

    // Numeric fields
    if (['total_amount', 'discount', 'paid_amount', 'price_per_unit', 'consultation_fee',
        'current_stock', 'min_threshold', 'quantity'].includes(field)) {
        return parseAmount(value);
    }

    // Boolean
    if (field === 'is_critical') {
        return parseBoolean(value) ?? false;
    }

    // String fields - just trim
    return value.trim();
}
