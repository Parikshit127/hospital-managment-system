import { z } from 'zod';

const staffRoles = [
    'admin',
    'doctor',
    'receptionist',
    'lab_technician',
    'pharmacist',
    'finance',
    'ipd_manager',
    'nurse',
    'opd_manager',
    'hr',
] as const;

// ========================================
// Auth
// ========================================

export const loginSchema = z.object({
    username: z.string().min(1, 'Username is required').max(100),
    password: z.string().min(1, 'Password is required').max(200),
});

export const superAdminLoginSchema = z.object({
    email: z.string().email('Valid email required'),
    password: z.string().min(1, 'Password is required'),
});

// ========================================
// Patient Registration
// ========================================

export const registerPatientSchema = z.object({
    full_name: z.string().min(2, 'Name must be at least 2 characters').max(200),
    phone: z.string().min(10, 'Phone must be at least 10 digits').max(15),
    age: z.string().optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    department: z.string().min(1, 'Department is required'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    aadhar: z.string().optional(),
});

// ========================================
// Staff Management
// ========================================

export const addUserSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters').max(50),
    password: z.string().min(8, 'Password must be at least 8 characters').max(100)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    name: z.string().min(2, 'Name is required').max(200),
    role: z.enum(staffRoles),
    specialty: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
});

export const updateUserSchema = z.object({
    name: z.string().min(2).max(200).optional(),
    role: z.enum(staffRoles).optional(),
    specialty: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
});

// ========================================
// Finance
// ========================================

export const createInvoiceSchema = z.object({
    patient_id: z.string().min(1),
    admission_id: z.string().optional(),
    invoice_type: z.enum(['OPD', 'IPD']),
    notes: z.string().optional(),
});

export const addInvoiceItemSchema = z.object({
    invoice_id: z.number().positive(),
    department: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().int().positive().default(1),
    unit_price: z.number().positive(),
    discount: z.number().min(0).default(0),
});

export const recordPaymentSchema = z.object({
    invoice_id: z.number().positive(),
    amount: z.number().positive(),
    payment_method: z.enum(['Cash', 'UPI', 'Card', 'Razorpay', 'BankTransfer', 'Insurance']),
    payment_type: z.enum(['Advance', 'Settlement', 'Refund', 'PartialPayment']),
    razorpay_order_id: z.string().optional(),
    razorpay_payment_id: z.string().optional(),
    notes: z.string().optional(),
});

// ========================================
// Lab
// ========================================

export const orderLabTestSchema = z.object({
    patient_id: z.string().min(1),
    doctor_id: z.string().min(1),
    test_type: z.string().min(1),
});

export const uploadLabResultSchema = z.object({
    barcode: z.string().min(1),
    resultValue: z.string().min(1),
    remarks: z.string().optional(),
});

// ========================================
// IPD
// ========================================

export const admitPatientIPDSchema = z.object({
    patient_id: z.string().min(1),
    bed_id: z.string().min(1),
    ward_id: z.number().positive(),
    diagnosis: z.string().min(1),
    doctor_name: z.string().min(1),
});

// ========================================
// Insurance
// ========================================

export const submitClaimSchema = z.object({
    policy_id: z.number().positive(),
    invoice_id: z.number().positive(),
    admission_id: z.string().optional(),
    claimed_amount: z.number().positive(),
});

// ========================================
// Organization (Super Admin)
// ========================================

export const createOrganizationSchema = z.object({
    // Step 1: Hospital Details
    name: z.string().min(2, 'Hospital name is required').max(200),
    slug: z.string().min(2, 'Slug must be at least 2 characters').max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
    code: z.string().min(2, 'Organization code must be at least 2 characters').max(10).toUpperCase(),
    hospital_type: z.string().optional(),
    bed_capacity: z.string().optional(), // comes as string from FormData, parsed to int
    specialties: z.string().optional(), // comma-separated, parsed to array
    // Step 2: Contact & Location
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    website: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    // Step 3: Regulatory
    license_no: z.string().optional(),
    registration_number: z.string().optional(),
    registration_authority: z.string().optional(),
    accreditation_body: z.string().optional(),
    accreditation_number: z.string().optional(),
    accreditation_expiry: z.string().optional(),
    established_year: z.string().optional(),
    // Step 4: Admin User
    admin_username: z.string().min(3, 'Admin username must be at least 3 characters').max(50),
    admin_password: z.string().min(8, 'Password must be at least 8 characters').max(100)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    admin_name: z.string().min(2, 'Admin name must be at least 2 characters').max(200),
    admin_email: z.string().email(),
    // Step 5: Plan & Config
    plan: z.enum(['free', 'starter', 'pro', 'enterprise']).default('free'),
    appointment_duration: z.string().optional(),
    fiscal_year_start: z.string().optional(),
});

export const organizationProfileSchema = z.object({
    name: z.string().min(2, 'Hospital name is required').max(200),
    slug: z.string().min(2, 'Slug must be at least 2 characters').max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
    code: z.string().min(2, 'Organization code must be at least 2 characters').max(10),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().or(z.literal('')).nullable(),
    license_no: z.string().optional().nullable(),
    hospital_type: z.string().optional().nullable(),
    bed_capacity: z.number().int().min(0).optional().nullable(),
    accreditation_body: z.string().optional().nullable(),
    accreditation_number: z.string().optional().nullable(),
    accreditation_expiry: z.string().optional().nullable(),
    registration_number: z.string().optional().nullable(),
    registration_authority: z.string().optional().nullable(),
    established_year: z.number().int().min(1800).max(2100).optional().nullable(),
    website: z.string().optional().nullable(),
    specialties: z.array(z.string()).optional(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
});

export const branchSchema = z.object({
    branch_name: z.string().min(2, 'Branch name is required').max(200),
    branch_code: z.string().min(2, 'Branch code is required').max(20),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    pincode: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().or(z.literal('')).nullable(),
    is_main_branch: z.boolean().optional(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
});

// ========================================
// Triage
// ========================================

export const triageSchema = z.object({
    full_name: z.string().min(2),
    phone: z.string().min(10),
    age: z.string().optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    symptoms: z.string().min(1),
    duration: z.string().optional(),
    severity: z.string().optional(),
    past_medical_history: z.string().optional(),
    current_medications: z.string().optional(),
    allergies: z.string().optional(),
    blood_pressure: z.string().optional(),
    heart_rate: z.number().optional(),
    temperature: z.number().optional(),
    oxygen_sat: z.number().optional(),
    respiratory_rate: z.number().optional(),
    weight: z.number().optional(),
    height: z.number().optional(),
});

// ========================================
// Clinical Notes
// ========================================

export const clinicalNotesSchema = z.object({
    appointment_id: z.string().min(1),
    patient_id: z.string().min(1),
    doctor_name: z.string().optional(),
    diagnosis: z.string().optional(),
    doctor_notes: z.string().optional(),
});

// ========================================
// Pharmacy
// ========================================

export const addInventoryBatchSchema = z.object({
    brand_name: z.string().min(1),
    generic_name: z.string().optional(),
    price_per_unit: z.number().positive(),
    batch_no: z.string().min(1),
    current_stock: z.number().int().positive(),
    expiry_date: z.string().min(1),
    rack_location: z.string().optional(),
});
