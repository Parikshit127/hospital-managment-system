import { ImportColumn, ImportTemplate, ImportType } from '@/app/types/import';

const patientColumns: ImportColumn[] = [
    { name: 'full_name', required: true, type: 'string', description: 'Patient full name', example: 'Rajesh Kumar', maxLength: 200 },
    { name: 'phone', required: true, type: 'phone', description: 'Mobile number (10 digits)', example: '9876543210' },
    { name: 'age', required: false, type: 'string', description: 'Age in years', example: '45' },
    { name: 'gender', required: false, type: 'enum', description: 'Gender', example: 'Male', values: ['Male', 'Female', 'Other'] },
    { name: 'email', required: false, type: 'email', description: 'Email address', example: 'rajesh@example.com' },
    { name: 'address', required: false, type: 'string', description: 'Full address', example: '123 MG Road, Mumbai' },
    { name: 'aadhar_card', required: false, type: 'aadhaar', description: 'Aadhaar number (12 digits)', example: '123456789012' },
    { name: 'blood_group', required: false, type: 'enum', description: 'Blood group', values: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    { name: 'date_of_birth', required: false, type: 'date', description: 'Date of birth (DD/MM/YYYY)', example: '15/03/1980' },
    { name: 'allergies', required: false, type: 'string', description: 'Known allergies', example: 'Penicillin, Sulfa' },
    { name: 'chronic_conditions', required: false, type: 'string', description: 'Chronic conditions', example: 'Diabetes, Hypertension' },
    { name: 'emergency_contact_name', required: false, type: 'string', description: 'Emergency contact name', example: 'Priya Kumar' },
    { name: 'emergency_contact_phone', required: false, type: 'phone', description: 'Emergency contact phone', example: '9876543211' },
    { name: 'emergency_contact_relation', required: false, type: 'string', description: 'Relationship to patient', example: 'Spouse' },
    { name: 'department', required: false, type: 'string', description: 'Default department', example: 'General Medicine' },
    { name: 'registration_date', required: false, type: 'date', description: 'Original registration date', example: '01/01/2020' },
];

const staffColumns: ImportColumn[] = [
    { name: 'name', required: true, type: 'string', description: 'Staff member name', example: 'Dr. Priya Sharma', maxLength: 200 },
    { name: 'username', required: true, type: 'string', description: 'Login username (unique)', example: 'priya.sharma' },
    { name: 'role', required: true, type: 'enum', description: 'System role', values: ['admin', 'doctor', 'receptionist', 'lab_technician', 'pharmacist', 'finance', 'ipd_manager', 'nurse', 'opd_manager', 'hr'] },
    { name: 'email', required: false, type: 'email', description: 'Email address', example: 'priya@hospital.com' },
    { name: 'phone', required: false, type: 'phone', description: 'Phone number', example: '9876543210' },
    { name: 'specialty', required: false, type: 'string', description: 'Medical specialty (for doctors)', example: 'Cardiology' },
    { name: 'consultation_fee', required: false, type: 'number', description: 'Consultation fee (INR)', example: '500' },
    { name: 'working_hours', required: false, type: 'string', description: 'Working hours', example: '09:00-17:00' },
];

const invoiceColumns: ImportColumn[] = [
    { name: 'invoice_number', required: true, type: 'string', description: 'Original invoice number', example: 'INV-2024-001' },
    { name: 'patient_id', required: true, type: 'string', description: 'Patient ID (must exist in system)', example: 'AVN000001' },
    { name: 'invoice_type', required: false, type: 'enum', description: 'Invoice type', example: 'OPD', values: ['OPD', 'IPD', 'Lab', 'Pharmacy'] },
    { name: 'total_amount', required: true, type: 'number', description: 'Total amount (INR)', example: '1500.00' },
    { name: 'discount', required: false, type: 'number', description: 'Discount amount', example: '100.00' },
    { name: 'paid_amount', required: false, type: 'number', description: 'Amount paid', example: '1400.00' },
    { name: 'status', required: false, type: 'enum', description: 'Invoice status', values: ['Draft', 'Final', 'Paid', 'Partial', 'Overdue', 'Cancelled'] },
    { name: 'invoice_date', required: false, type: 'date', description: 'Invoice date (DD/MM/YYYY)', example: '15/06/2024' },
    { name: 'item_description', required: false, type: 'string', description: 'Line item descriptions (semicolon separated)', example: 'Consultation;Blood Test' },
    { name: 'payment_method', required: false, type: 'string', description: 'Payment method', example: 'Cash' },
];

const labResultColumns: ImportColumn[] = [
    { name: 'patient_id', required: true, type: 'string', description: 'Patient ID (must exist in system)', example: 'AVN000001' },
    { name: 'doctor_id', required: true, type: 'string', description: 'Ordering doctor username', example: 'dr.sharma' },
    { name: 'test_type', required: true, type: 'string', description: 'Test name', example: 'Complete Blood Count' },
    { name: 'status', required: false, type: 'enum', description: 'Test status', values: ['Pending', 'Processing', 'Completed', 'Rejected', 'Cancelled'] },
    { name: 'result_value', required: false, type: 'string', description: 'Test result value', example: '12.5 g/dL' },
    { name: 'technician_remarks', required: false, type: 'string', description: 'Technician remarks', example: 'Normal range' },
    { name: 'test_date', required: false, type: 'date', description: 'Test date (DD/MM/YYYY)', example: '20/06/2024' },
    { name: 'is_critical', required: false, type: 'boolean', description: 'Is critical value?', example: 'No' },
];

const pharmacyColumns: ImportColumn[] = [
    { name: 'brand_name', required: true, type: 'string', description: 'Medicine brand name', example: 'Crocin Advance' },
    { name: 'generic_name', required: false, type: 'string', description: 'Generic/salt name', example: 'Paracetamol 500mg' },
    { name: 'category', required: false, type: 'string', description: 'Medicine category', example: 'Analgesic' },
    { name: 'manufacturer', required: false, type: 'string', description: 'Manufacturer name', example: 'GSK' },
    { name: 'price_per_unit', required: true, type: 'number', description: 'Price per unit (INR)', example: '15.50' },
    { name: 'batch_no', required: false, type: 'string', description: 'Batch number', example: 'BATCH-2024-A1' },
    { name: 'current_stock', required: false, type: 'number', description: 'Current stock quantity', example: '500' },
    { name: 'expiry_date', required: false, type: 'date', description: 'Expiry date (DD/MM/YYYY)', example: '31/12/2025' },
    { name: 'rack_location', required: false, type: 'string', description: 'Storage rack location', example: 'A-3-2' },
    { name: 'min_threshold', required: false, type: 'number', description: 'Minimum stock threshold', example: '50' },
];

const appointmentColumns: ImportColumn[] = [
    { name: 'patient_id', required: true, type: 'string', description: 'Patient ID (must exist in system)', example: 'AVN000001' },
    { name: 'doctor_name', required: false, type: 'string', description: 'Doctor name', example: 'Dr. Priya Sharma' },
    { name: 'doctor_id', required: false, type: 'string', description: 'Doctor username', example: 'priya.sharma' },
    { name: 'department', required: false, type: 'string', description: 'Department', example: 'Cardiology' },
    { name: 'status', required: false, type: 'enum', description: 'Appointment status', values: ['Pending', 'Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled'] },
    { name: 'reason_for_visit', required: false, type: 'string', description: 'Reason for visit', example: 'Routine checkup' },
    { name: 'appointment_date', required: false, type: 'date', description: 'Appointment date (DD/MM/YYYY)', example: '15/06/2024' },
];

const TEMPLATES: Record<ImportType, Omit<ImportTemplate, 'import_type'>> = {
    patients: {
        name: 'Patient Records',
        description: 'Import patient demographics, contact info, and medical history',
        columns: patientColumns,
    },
    staff: {
        name: 'Staff & Doctors',
        description: 'Import hospital staff and doctor records with roles and specialties',
        columns: staffColumns,
    },
    invoices: {
        name: 'Invoices & Billing',
        description: 'Import historical invoice and payment records',
        columns: invoiceColumns,
    },
    lab_results: {
        name: 'Lab Results',
        description: 'Import laboratory test orders and results',
        columns: labResultColumns,
    },
    pharmacy: {
        name: 'Pharmacy Inventory',
        description: 'Import medicine catalog and batch inventory',
        columns: pharmacyColumns,
    },
    appointments: {
        name: 'Appointments',
        description: 'Import historical appointment records',
        columns: appointmentColumns,
    },
};

export function getTemplate(importType: ImportType): ImportTemplate {
    const tmpl = TEMPLATES[importType];
    return { import_type: importType, ...tmpl };
}

export function getAllTemplates(): ImportTemplate[] {
    return (Object.keys(TEMPLATES) as ImportType[]).map(getTemplate);
}

export function getRequiredColumns(importType: ImportType): ImportColumn[] {
    return TEMPLATES[importType].columns.filter(c => c.required);
}

export function getTemplateHeaders(importType: ImportType): string[] {
    return TEMPLATES[importType].columns.map(c => c.name);
}
