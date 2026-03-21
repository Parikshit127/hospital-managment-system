import type { ImportType, ColumnMapping, ValidationError, ValidationResult, DuplicateRecord } from '@/app/types/import';
import { getTemplate } from './templates';
import { normalizePhone, normalizeAadhaar, parseDate, parseAmount } from './data-transformer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TenantPrismaClient = any;

// ---- Schema Validation ----

function validateField(field: string, value: string, type: string, required: boolean, values?: string[]): ValidationError | null {
    const trimmed = (value ?? '').trim();

    if (required && !trimmed) {
        return { row: 0, field, value, message: `${field} is required`, severity: 'error' };
    }

    if (!trimmed) return null; // optional empty field is fine

    switch (type) {
        case 'email': {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmed)) {
                return { row: 0, field, value, message: 'Invalid email format', severity: 'warning' };
            }
            break;
        }
        case 'phone': {
            const digits = normalizePhone(trimmed);
            if (!/^[6-9]\d{9}$/.test(digits)) {
                return { row: 0, field, value, message: 'Invalid Indian phone number (must be 10 digits starting with 6-9)', severity: 'error' };
            }
            break;
        }
        case 'aadhaar': {
            const aadhaar = normalizeAadhaar(trimmed);
            if (!/^\d{12}$/.test(aadhaar)) {
                return { row: 0, field, value, message: 'Aadhaar must be exactly 12 digits', severity: 'warning' };
            }
            break;
        }
        case 'date': {
            const parsed = parseDate(trimmed);
            if (!parsed) {
                return { row: 0, field, value, message: 'Could not parse date. Use DD/MM/YYYY format', severity: 'warning' };
            }
            break;
        }
        case 'number': {
            const num = parseAmount(trimmed);
            if (num === null) {
                return { row: 0, field, value, message: 'Invalid number', severity: 'error' };
            }
            break;
        }
        case 'enum': {
            if (values && values.length > 0) {
                const lowerValues = values.map(v => v.toLowerCase());
                if (!lowerValues.includes(trimmed.toLowerCase())) {
                    return { row: 0, field, value, message: `Must be one of: ${values.join(', ')}`, severity: 'warning' };
                }
            }
            break;
        }
    }

    return null;
}

// ---- Business Rule Validation ----

function validateBusinessRules(row: Record<string, string>, importType: ImportType, rowIndex: number): ValidationError[] {
    const errors: ValidationError[] = [];

    if (importType === 'patients') {
        // Age validation
        const age = row['age'];
        if (age && !/^\d{1,3}$/.test(age.trim())) {
            errors.push({ row: rowIndex, field: 'age', value: age, message: 'Age must be a number', severity: 'warning' });
        } else if (age) {
            const ageNum = parseInt(age);
            if (ageNum < 0 || ageNum > 150) {
                errors.push({ row: rowIndex, field: 'age', value: age, message: 'Age must be between 0 and 150', severity: 'warning' });
            }
        }
    }

    if (importType === 'invoices') {
        const total = parseAmount(row['total_amount'] || '');
        const paid = parseAmount(row['paid_amount'] || '');
        if (total !== null && paid !== null && paid > total) {
            errors.push({ row: rowIndex, field: 'paid_amount', value: row['paid_amount'], message: 'Paid amount exceeds total amount', severity: 'warning' });
        }
    }

    if (importType === 'pharmacy') {
        const stock = parseAmount(row['current_stock'] || '');
        if (stock !== null && stock < 0) {
            errors.push({ row: rowIndex, field: 'current_stock', value: row['current_stock'], message: 'Stock cannot be negative', severity: 'error' });
        }
    }

    return errors;
}

// ---- Duplicate Detection ----

interface ExistingPatient {
    id: number;
    patient_id: string;
    full_name: string;
    phone: string;
    aadhar_card: string | null;
}

interface ExistingStaff {
    id: number;
    username: string;
    name: string;
    role: string;
}

async function detectDuplicates(
    data: Record<string, string>[],
    mapping: ColumnMapping,
    importType: ImportType,
    db: TenantPrismaClient,
): Promise<DuplicateRecord[]> {
    const duplicates: DuplicateRecord[] = [];

    if (importType === 'patients') {
        // Collect phones and aadhaar for batch lookup
        const phones: string[] = [];
        const aadhaars: string[] = [];

        const reverseMap: Record<string, string> = {};
        for (const [src, info] of Object.entries(mapping)) {
            reverseMap[info.targetField] = src;
        }

        for (const row of data) {
            const phoneCol = reverseMap['phone'];
            const aadhaarCol = reverseMap['aadhar_card'];
            if (phoneCol && row[phoneCol]) phones.push(normalizePhone(row[phoneCol]));
            if (aadhaarCol && row[aadhaarCol]) aadhaars.push(normalizeAadhaar(row[aadhaarCol]));
        }

        // Batch lookup existing patients
        const existingByPhone: ExistingPatient[] = phones.length > 0
            ? await db.oPD_REG.findMany({
                where: { phone: { in: phones }, is_archived: undefined },
                select: { id: true, patient_id: true, full_name: true, phone: true, aadhar_card: true },
            })
            : [];

        const existingByAadhaar: ExistingPatient[] = aadhaars.length > 0
            ? await db.oPD_REG.findMany({
                where: { aadhar_card: { in: aadhaars.filter(a => a.length === 12) }, is_archived: undefined },
                select: { id: true, patient_id: true, full_name: true, phone: true, aadhar_card: true },
            })
            : [];

        const phoneMap = new Map<string, ExistingPatient>(existingByPhone.map(p => [p.phone, p]));
        const aadhaarMap = new Map<string, ExistingPatient>(
            existingByAadhaar.filter(p => p.aadhar_card).map(p => [p.aadhar_card!, p])
        );

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const phoneCol = reverseMap['phone'];
            const aadhaarCol = reverseMap['aadhar_card'];
            const nameCol = reverseMap['full_name'];

            const phone = phoneCol ? normalizePhone(row[phoneCol] || '') : '';
            const aadhaar = aadhaarCol ? normalizeAadhaar(row[aadhaarCol] || '') : '';

            // Check exact match on phone
            const phoneMatch = phone ? phoneMap.get(phone) : undefined;
            if (phoneMatch) {
                duplicates.push({
                    importRow: i,
                    importData: row as unknown as Record<string, unknown>,
                    existingRecord: {
                        id: phoneMatch.id,
                        patient_id: phoneMatch.patient_id,
                        data: phoneMatch as unknown as Record<string, unknown>,
                    },
                    matchType: 'exact',
                    matchedFields: ['phone'],
                    confidence: 0.95,
                });
                continue;
            }

            // Check exact match on Aadhaar
            const aadhaarMatch = aadhaar ? aadhaarMap.get(aadhaar) : undefined;
            if (aadhaarMatch) {
                duplicates.push({
                    importRow: i,
                    importData: row as unknown as Record<string, unknown>,
                    existingRecord: {
                        id: aadhaarMatch.id,
                        patient_id: aadhaarMatch.patient_id,
                        data: aadhaarMatch as unknown as Record<string, unknown>,
                    },
                    matchType: 'exact',
                    matchedFields: ['aadhar_card'],
                    confidence: 0.95,
                });
                continue;
            }

            // Fuzzy match: same name + last 4 digits of phone
            if (nameCol && phone.length >= 4) {
                const nameValue = (row[nameCol] || '').trim().toLowerCase();
                const phoneSuffix = phone.slice(-4);
                for (const existing of existingByPhone) {
                    if (
                        existing.full_name.toLowerCase().includes(nameValue.slice(0, 5)) &&
                        existing.phone?.endsWith(phoneSuffix)
                    ) {
                        duplicates.push({
                            importRow: i,
                            importData: row as unknown as Record<string, unknown>,
                            existingRecord: {
                                id: existing.id,
                                patient_id: existing.patient_id,
                                data: existing as unknown as Record<string, unknown>,
                            },
                            matchType: 'fuzzy',
                            matchedFields: ['full_name', 'phone (partial)'],
                            confidence: 0.7,
                        });
                        break;
                    }
                }
            }
        }
    }

    if (importType === 'staff') {
        const reverseMap: Record<string, string> = {};
        for (const [src, info] of Object.entries(mapping)) {
            reverseMap[info.targetField] = src;
        }
        const usernameCol = reverseMap['username'];
        if (usernameCol) {
            const usernames = data.map(r => r[usernameCol]).filter(Boolean);
            const existing: ExistingStaff[] = usernames.length > 0
                ? await db.user.findMany({
                    where: { username: { in: usernames } },
                    select: { id: true, username: true, name: true, role: true },
                })
                : [];

            const usernameMap = new Map<string, ExistingStaff>(existing.map(u => [u.username, u]));
            for (let i = 0; i < data.length; i++) {
                const username = data[i][usernameCol];
                const match = username ? usernameMap.get(username) : undefined;
                if (match) {
                    duplicates.push({
                        importRow: i,
                        importData: data[i] as unknown as Record<string, unknown>,
                        existingRecord: { id: match.id, data: match as unknown as Record<string, unknown> },
                        matchType: 'exact',
                        matchedFields: ['username'],
                        confidence: 1.0,
                    });
                }
            }
        }
    }

    return duplicates;
}

// ---- Main Validation Function ----

export async function validateImportData(
    data: Record<string, string>[],
    mapping: ColumnMapping,
    importType: ImportType,
    db: TenantPrismaClient,
): Promise<ValidationResult> {
    const template = getTemplate(importType);
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const errorRowSet = new Set<number>();
    const warningRowSet = new Set<number>();

    // Build reverse map: targetField -> sourceColumn
    const reverseMap: Record<string, string> = {};
    for (const [src, info] of Object.entries(mapping)) {
        reverseMap[info.targetField] = src;
    }

    // Column-level schema validation
    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        for (const col of template.columns) {
            const sourceCol = reverseMap[col.name];
            const value = sourceCol ? (row[sourceCol] ?? '') : '';

            const err = validateField(col.name, value, col.type, col.required, col.values);
            if (err) {
                err.row = i;
                if (err.severity === 'error') {
                    errors.push(err);
                    errorRowSet.add(i);
                } else {
                    warnings.push(err);
                    warningRowSet.add(i);
                }
            }
        }

        // Business rules
        const bizErrors = validateBusinessRules(row, importType, i);
        for (const err of bizErrors) {
            if (err.severity === 'error') {
                errors.push(err);
                errorRowSet.add(i);
            } else {
                warnings.push(err);
                warningRowSet.add(i);
            }
        }
    }

    // Duplicate detection
    const duplicates = await detectDuplicates(data, mapping, importType, db);
    const duplicateRowSet = new Set(duplicates.map(d => d.importRow));

    // Quality score: 0-100
    const totalRows = data.length;
    const errorRows = errorRowSet.size;
    const warningRows = warningRowSet.size;
    const duplicateRows = duplicateRowSet.size;
    const cleanRows = totalRows - errorRows;
    const qualityScore = totalRows > 0 ? Math.round((cleanRows / totalRows) * 100) : 0;

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        duplicates,
        qualityScore,
        summary: {
            totalRows,
            validRows: cleanRows,
            errorRows,
            warningRows,
            duplicateRows,
        },
    };
}
