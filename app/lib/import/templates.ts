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

const doctorMasterColumns: ImportColumn[] = [
    { name: 'name', required: true, type: 'string', description: 'Doctor full name', example: 'Dr. Priya Sharma', maxLength: 200 },
    { name: 'username', required: true, type: 'string', description: 'Login username (unique)', example: 'priya.sharma' },
    { name: 'password', required: true, type: 'string', description: 'Initial password (min 8 chars)', example: 'Welcome@123' },
    { name: 'specialty', required: true, type: 'string', description: 'Medical specialization', example: 'Cardiology' },
    { name: 'doctor_registration_no', required: false, type: 'string', description: 'Medical council registration number', example: 'MH-12345' },
    { name: 'qualifications', required: false, type: 'string', description: 'Degrees and qualifications', example: 'MBBS, MD' },
    { name: 'email', required: false, type: 'email', description: 'Email address', example: 'priya@hospital.com' },
    { name: 'phone', required: false, type: 'phone', description: 'Phone number', example: '9876543210' },
    { name: 'consultation_fee', required: true, type: 'number', description: 'Consultation fee (INR)', example: '500' },
    { name: 'follow_up_fee', required: true, type: 'number', description: 'Follow-up fee (INR)', example: '300' },
    { name: 'working_hours', required: false, type: 'string', description: 'Working hours range', example: '09:00-17:00' },
    { name: 'slot_duration', required: false, type: 'number', description: 'Appointment slot duration (minutes)', example: '20' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status (true/false)', example: 'true' },
];

const serviceMasterColumns: ImportColumn[] = [
    { name: 'service_code', required: true, type: 'string', description: 'Unique service code', example: 'SVC-001' },
    { name: 'service_name', required: true, type: 'string', description: 'Service name', example: 'ICU Bed (General)' },
    { name: 'service_category', required: true, type: 'enum', description: 'Category', example: 'ICU', values: ['OPD Consultation', 'ICU', 'Procedure', 'Room', 'Nursing', 'Diet', 'Consumable', 'Misc'] },
    { name: 'default_rate', required: true, type: 'number', description: 'Default rate (INR)', example: '3500' },
    { name: 'hsn_sac_code', required: false, type: 'string', description: 'HSN/SAC code for GST', example: '9993' },
    { name: 'tax_rate', required: false, type: 'number', description: 'Tax rate (%)', example: '5' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status', example: 'true' },
];

const labTestMasterColumns: ImportColumn[] = [
    { name: 'test_name', required: true, type: 'string', description: 'Lab test name', example: 'Complete Blood Count' },
    { name: 'price', required: true, type: 'number', description: 'Test price (INR)', example: '350' },
    { name: 'category', required: false, type: 'string', description: 'Test category', example: 'Haematology' },
    { name: 'sample_type', required: false, type: 'string', description: 'Sample type required', example: 'Blood' },
    { name: 'unit', required: false, type: 'string', description: 'Result unit', example: 'g/dL' },
    { name: 'normal_range_min', required: false, type: 'number', description: 'Normal range minimum', example: '12' },
    { name: 'normal_range_max', required: false, type: 'number', description: 'Normal range maximum', example: '17' },
    { name: 'hsn_sac_code', required: false, type: 'string', description: 'HSN/SAC code', example: '9993' },
    { name: 'tax_rate', required: false, type: 'number', description: 'Tax rate (%)', example: '0' },
    { name: 'is_available', required: false, type: 'boolean', description: 'Available for order', example: 'true' },
];

const packageMasterColumns: ImportColumn[] = [
    { name: 'package_code', required: true, type: 'string', description: 'Unique package code', example: 'PKG-001' },
    { name: 'package_name', required: true, type: 'string', description: 'Package name', example: 'Appendectomy Package' },
    { name: 'description', required: false, type: 'string', description: 'Package description', example: 'Includes surgery, 3-day stay, meals' },
    { name: 'total_amount', required: true, type: 'number', description: 'Total package price (INR)', example: '35000' },
    { name: 'validity_days', required: false, type: 'number', description: 'Package validity (days)', example: '7' },
    { name: 'exclusions', required: false, type: 'string', description: 'What is excluded', example: 'Blood products, implants' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status', example: 'true' },
];

const medicineMasterColumns: ImportColumn[] = [
    { name: 'brand_name', required: true, type: 'string', description: 'Medicine brand name (unique)', example: 'Paracetamol 500mg' },
    { name: 'generic_name', required: false, type: 'string', description: 'Generic/salt name', example: 'Paracetamol' },
    { name: 'category', required: false, type: 'string', description: 'Medicine category', example: 'Analgesic' },
    { name: 'manufacturer', required: false, type: 'string', description: 'Manufacturer name', example: 'GSK' },
    { name: 'form', required: false, type: 'string', description: 'Formulation (tablet/syrup/etc)', example: 'Tablet' },
    { name: 'strength', required: false, type: 'string', description: 'Strength', example: '500mg' },
    { name: 'mrp', required: true, type: 'number', description: 'Maximum retail price (INR)', example: '20' },
    { name: 'purchase_price', required: true, type: 'number', description: 'Purchase/cost price (INR)', example: '8' },
    { name: 'selling_price', required: true, type: 'number', description: 'Selling price (INR)', example: '15' },
    { name: 'gst_percent', required: false, type: 'number', description: 'GST percentage', example: '12' },
    { name: 'min_threshold', required: false, type: 'number', description: 'Minimum stock threshold', example: '10' },
    { name: 'hsn_sac_code', required: false, type: 'string', description: 'HSN/SAC code', example: '3004' },
    { name: 'is_active', required: false, type: 'boolean', description: 'Active status', example: 'true' },
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
    doctor_master: {
        name: 'Doctor Master',
        description: 'Bulk import doctors with fees, specialization, and working hours',
        columns: doctorMasterColumns,
    },
    service_master: {
        name: 'Service Master',
        description: 'Bulk import hospital services (ICU, procedures, nursing, etc.)',
        columns: serviceMasterColumns,
    },
    lab_test_master: {
        name: 'Lab Test Master',
        description: 'Bulk import lab test catalog with prices and reference ranges',
        columns: labTestMasterColumns,
    },
    package_master: {
        name: 'Package Master',
        description: 'Bulk import treatment/surgery packages with prices (inclusions added manually)',
        columns: packageMasterColumns,
    },
    medicine_master: {
        name: 'Medicine Master',
        description: 'Bulk import medicine catalog with MRP, purchase, and selling prices',
        columns: medicineMasterColumns,
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
