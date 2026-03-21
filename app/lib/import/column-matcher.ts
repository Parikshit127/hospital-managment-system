import type { ImportColumn, ColumnMapping } from '@/app/types/import';

// Synonym dictionary mapping common hospital data headers to our schema field names
const SYNONYMS: Record<string, string[]> = {
    full_name: ['patient name', 'name', 'patient_name', 'pt name', 'patient', 'patientname', 'fullname', 'full name'],
    phone: ['mobile', 'contact', 'phone number', 'mob', 'mobile no', 'contact no', 'mobile number', 'phone no', 'cell', 'telephone'],
    email: ['email address', 'e-mail', 'mail', 'email id', 'emailid'],
    address: ['full address', 'residential address', 'addr', 'home address', 'patient address'],
    aadhar_card: ['aadhaar', 'aadhar', 'uid', 'aadhaar no', 'aadhar no', 'aadhaar number', 'aadhar number', 'uidai'],
    date_of_birth: ['dob', 'birth date', 'birthday', 'date of birth', 'birthdate', 'born on', 'birth_date'],
    blood_group: ['blood type', 'blood_type', 'bg', 'bloodgroup'],
    gender: ['sex', 'm/f', 'male/female'],
    age: ['patient age', 'yrs', 'years'],
    allergies: ['allergy', 'known allergies', 'drug allergies'],
    chronic_conditions: ['chronic disease', 'medical history', 'conditions', 'past history', 'pmh'],
    emergency_contact_name: ['emergency contact', 'kin name', 'next of kin', 'nok name', 'emergency name'],
    emergency_contact_phone: ['emergency phone', 'kin phone', 'nok phone', 'emergency mobile', 'emergency contact phone'],
    emergency_contact_relation: ['relation', 'relationship', 'kin relation', 'nok relation'],
    department: ['dept', 'speciality', 'specialty', 'section'],
    registration_date: ['reg date', 'registered on', 'registration date', 'reg_date'],
    // Staff fields
    username: ['user name', 'login', 'login id', 'user id', 'userid'],
    role: ['designation', 'position', 'staff role', 'user role'],
    specialty: ['speciality', 'specialization', 'dept', 'department'],
    consultation_fee: ['fee', 'consult fee', 'charges', 'opd fee', 'opd charges'],
    working_hours: ['work hours', 'shift', 'timing', 'schedule'],
    // Invoice fields
    invoice_number: ['inv no', 'bill no', 'bill number', 'invoice no', 'invoice id', 'bill_no', 'inv_no'],
    patient_id: ['patient id', 'uhid', 'hospital id', 'mr no', 'mrn', 'patient_id', 'patientid', 'patient no'],
    invoice_type: ['bill type', 'type', 'category', 'inv type'],
    total_amount: ['total', 'amount', 'gross amount', 'bill amount', 'grand total'],
    discount: ['disc', 'discount amount', 'concession'],
    paid_amount: ['paid', 'received', 'amount paid', 'payment', 'received amount'],
    status: ['payment status', 'bill status', 'inv status'],
    invoice_date: ['bill date', 'date', 'inv date', 'billing date'],
    item_description: ['items', 'description', 'services', 'line items', 'particulars'],
    payment_method: ['payment mode', 'mode', 'pay method', 'pay mode', 'payment type'],
    // Lab fields
    doctor_id: ['doctor', 'ordered by', 'referring doctor', 'doctor username'],
    test_type: ['test name', 'test', 'investigation', 'lab test', 'test_name'],
    result_value: ['result', 'value', 'test result', 'report value', 'finding'],
    technician_remarks: ['remarks', 'comment', 'notes', 'technician notes'],
    test_date: ['date', 'order date', 'test_date', 'sample date'],
    is_critical: ['critical', 'urgent', 'is critical', 'critical flag'],
    // Pharmacy fields
    brand_name: ['medicine', 'drug name', 'medicine name', 'product', 'brand'],
    generic_name: ['salt', 'generic', 'composition', 'salt name', 'molecule'],
    category: ['medicine category', 'drug category', 'type', 'class'],
    manufacturer: ['company', 'mfg', 'mfr', 'manufacturer name', 'made by'],
    price_per_unit: ['price', 'mrp', 'unit price', 'rate', 'cost'],
    batch_no: ['batch', 'batch number', 'lot no', 'lot number', 'batch_number'],
    current_stock: ['stock', 'quantity', 'qty', 'available', 'in stock', 'stock qty'],
    expiry_date: ['expiry', 'exp date', 'exp', 'expires', 'expiration', 'exp_date'],
    rack_location: ['rack', 'location', 'shelf', 'storage', 'bin'],
    min_threshold: ['reorder level', 'min stock', 'minimum', 'threshold', 'reorder'],
    // Appointment fields
    doctor_name: ['doctor', 'dr name', 'physician', 'doctor name', 'consulting doctor'],
    reason_for_visit: ['reason', 'complaint', 'chief complaint', 'visit reason', 'purpose'],
    appointment_date: ['date', 'appt date', 'visit date', 'appointment_date', 'schedule date'],
};

function normalize(str: string): string {
    return str
        .toLowerCase()
        .replace(/[_\-\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) matrix[i] = [i];
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }
    return matrix[a.length][b.length];
}

function matchScore(sourceHeader: string, targetField: string, synonyms: string[]): number {
    const normalizedSource = normalize(sourceHeader);
    const normalizedTarget = normalize(targetField);

    // Exact match
    if (normalizedSource === normalizedTarget) return 1.0;

    // Synonym exact match
    for (const syn of synonyms) {
        if (normalizedSource === syn) return 0.95;
    }

    // Substring containment
    if (normalizedSource.includes(normalizedTarget) || normalizedTarget.includes(normalizedSource)) {
        return 0.85;
    }

    // Synonym substring match
    for (const syn of synonyms) {
        if (normalizedSource.includes(syn) || syn.includes(normalizedSource)) {
            return 0.8;
        }
    }

    // Fuzzy match via Levenshtein distance
    const dist = levenshtein(normalizedSource, normalizedTarget);
    const maxLen = Math.max(normalizedSource.length, normalizedTarget.length);
    if (maxLen === 0) return 0;
    const similarity = 1 - dist / maxLen;
    if (similarity >= 0.75) return similarity * 0.85;

    // Fuzzy match against synonyms
    for (const syn of synonyms) {
        const synDist = levenshtein(normalizedSource, syn);
        const synMaxLen = Math.max(normalizedSource.length, syn.length);
        const synSimilarity = 1 - synDist / synMaxLen;
        if (synSimilarity >= 0.75) return synSimilarity * 0.8;
    }

    return 0;
}

export function autoMatchColumns(
    sourceHeaders: string[],
    targetColumns: ImportColumn[],
): ColumnMapping {
    const mapping: ColumnMapping = {};
    const usedTargets = new Set<string>();

    // Score all pairs
    const pairs: { source: string; target: string; score: number }[] = [];
    for (const source of sourceHeaders) {
        for (const col of targetColumns) {
            const synonyms = SYNONYMS[col.name] || [];
            const score = matchScore(source, col.name, synonyms);
            if (score > 0.5) {
                pairs.push({ source, target: col.name, score });
            }
        }
    }

    // Sort by score descending, then greedily assign
    pairs.sort((a, b) => b.score - a.score);

    for (const pair of pairs) {
        if (mapping[pair.source] || usedTargets.has(pair.target)) continue;
        mapping[pair.source] = {
            targetField: pair.target,
            confidence: pair.score,
            autoDetected: true,
        };
        usedTargets.add(pair.target);
    }

    return mapping;
}

export function getUnmappedRequiredFields(
    mapping: ColumnMapping,
    targetColumns: ImportColumn[],
): ImportColumn[] {
    const mappedTargets = new Set(Object.values(mapping).map(m => m.targetField));
    return targetColumns.filter(col => col.required && !mappedTargets.has(col.name));
}
