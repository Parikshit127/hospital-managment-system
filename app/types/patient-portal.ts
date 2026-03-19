// ========================================
// Patient Portal — Type Definitions
// ========================================

import type { Patient, Appointment, VitalSign } from './reception';

/** Standard server action response wrapper */
export interface ActionResponse<T = undefined> {
    success: boolean;
    data?: T;
    error?: string;
}

// ----------------------------------------
// Patient Session
// ----------------------------------------

export interface PatientSession {
    id: string;
    name: string;
    organization_id: string;
    organization_name?: string;
}

// ----------------------------------------
// Dashboard
// ----------------------------------------

export interface PharmacyOrderItem {
    id: number;
    medicine_name: string;
    quantity: number;
    dosage: string | null;
    duration: string | null;
}

export interface PharmacyOrder {
    id: number;
    patient_id: string;
    doctor_id: string | null;
    total_amount: number | null;
    status: string;
    created_at: Date;
    items: PharmacyOrderItem[];
}

export interface PatientDashboardData {
    patient: Patient;
    upcomingAppointments: Appointment[];
    activePrescriptions: PharmacyOrder[];
    latestVitals: VitalSign | null;
    pendingLabCount: number;
    unpaidInvoiceCount: number;
}

// ----------------------------------------
// Lab Results
// ----------------------------------------

export interface LabOrder {
    id: number;
    barcode: string;
    patient_id: string;
    doctor_id: string;
    test_type: string;
    status: string;
    result_value: string | null;
    report_url: string | null;
    is_critical: boolean;
    created_at: Date;
}

// ----------------------------------------
// Prescriptions
// ----------------------------------------

export interface Prescription {
    id: number;
    patient_id: string;
    doctor_id: string | null;
    total_amount: number | null;
    status: string;
    created_at: Date;
    items: PrescriptionItem[];
}

export interface PrescriptionItem {
    id: number;
    medicine_name: string;
    quantity: number;
    dosage: string | null;
    duration: string | null;
}

// ----------------------------------------
// Medical Records
// ----------------------------------------

export interface ClinicalEHR {
    appointment_id: string;
    patient_id: string;
    doctor_name: string | null;
    diagnosis: string | null;
    doctor_notes: string | null;
    created_at: Date;
}

export interface PatientRecords {
    labs: LabOrder[];
    diagnoses: ClinicalEHR[];
    vitals: VitalSign[];
}

// ----------------------------------------
// Payments
// ----------------------------------------

export interface Invoice {
    id: number;
    invoice_number: string;
    patient_id: string;
    admission_id: string | null;
    invoice_type: string;
    total_amount: number;
    discount_amount: number;
    net_amount: number;
    paid_amount: number;
    status: string;
    created_at: Date;
}

export interface Payment {
    id: number;
    receipt_number: string;
    invoice_id: number;
    amount: number;
    payment_method: string;
    payment_type: string;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
    created_at: Date;
}

// ----------------------------------------
// Feedback
// ----------------------------------------

export interface PatientFeedback {
    id: string;
    patient_id: string;
    rating: number;
    comments: string | null;
    created_at: Date;
}
