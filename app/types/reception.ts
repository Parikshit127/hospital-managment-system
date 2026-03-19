// ========================================
// Reception Module — Type Definitions
// ========================================

/** Standard server action response wrapper */
export interface ActionResponse<T = undefined> {
    success: boolean;
    data?: T;
    error?: string;
}

/** Paginated list response */
export interface PaginatedResponse<T> extends ActionResponse<T[]> {
    total: number;
    totalPages: number;
    page: number;
}

// ----------------------------------------
// Patient Types
// ----------------------------------------

export interface Patient {
    id: number;
    patient_id: string;
    full_name: string;
    age: string | null;
    gender: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    department: string | null;
    aadhar_card: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    blood_group: string | null;
    date_of_birth: string | null;
    organizationId: string;
    password: string | null;
    created_at: Date;
}

export interface PatientListItem extends Patient {
    lastAppointmentStatus: string | null;
    lastAppointmentDate: Date | null;
}

export interface PatientRegistrationInput {
    full_name: string;
    phone: string;
    age: string;
    gender: string;
    department: string;
    email?: string;
    address?: string;
    aadhar?: string;
}

export interface PatientRegistrationResult {
    success: boolean;
    patient_id?: string;
    appointment_id?: string;
    user_type?: string;
    password_setup_required?: boolean;
    manual_password_setup_link?: string | null;
    error?: string;
}

// ----------------------------------------
// Appointment Types
// ----------------------------------------

export type AppointmentStatus =
    | 'Pending'
    | 'Scheduled'
    | 'Checked In'
    | 'In Progress'
    | 'Completed'
    | 'Cancelled';

export interface Appointment {
    id: number;
    appointment_id: string;
    patient_id: string;
    doctor_name: string | null;
    doctor_id: string | null;
    department: string | null;
    status: AppointmentStatus;
    reason_for_visit: string | null;
    cancellation_reason: string | null;
    follow_up_date: Date | null;
    queue_token: number | null;
    checked_in_at: Date | null;
    appointment_date: Date;
    patient?: Patient;
}

export interface BookAppointmentInput {
    patientId: string;
    doctorId: string;
    doctorName: string;
    department: string;
    date: string;
    slotId?: string;
    reasonForVisit?: string;
}

export interface AppointmentSlot {
    id: string;
    doctor_id: string;
    date: Date;
    start_time: string;
    end_time: string;
    slot_type: string;
    is_available: boolean;
    is_booked: boolean;
    booked_by: string | null;
}

// ----------------------------------------
// Queue Types
// ----------------------------------------

export interface QueueItem {
    appointmentId: string;
    tokenNumber: number | null;
    patientName: string;
    patientId: string;
    status: AppointmentStatus;
    position: number;
    estimatedWait: number;
    checkedInAt: Date | null;
}

export interface CheckInResult {
    tokenNumber: number;
    position: number;
    estimatedWait: number;
}

export interface DoctorQueue {
    doctorId: string;
    doctorName: string;
    department: string;
    current: QueueItem | null;
    waiting: QueueItem[];
    scheduled: QueueItem[];
}

export interface WaitingRoomDoctor {
    doctorName: string;
    doctorId: string;
    currentPatient: { name: string; token: number } | null;
    waiting: Array<{ name: string; token: number; position: number }>;
}

// ----------------------------------------
// Triage Types
// ----------------------------------------

export interface TriageInput {
    patientName: string;
    patientId?: string;
    phone?: string;
    email?: string;
    symptoms: string[];
    duration: string;
    severity: 'Mild' | 'Moderate' | 'Severe';
    pastMedicalHistory: string;
    currentMedications: string;
    allergies: string;
    age?: number;
    gender?: string;
    vitals?: TriageVitals;
}

export interface TriageVitals {
    bloodPressure?: string;
    heartRate?: number;
    temperature?: number;
    oxygenSat?: number;
}

export type TriageLevel = 'Emergency' | 'Urgent' | 'Routine';

export interface TriageOutput {
    triageLevel: TriageLevel;
    recommendedDepartment: string;
    possibleConditions: string[];
    recommendedTests: string[];
    riskAlerts: string[];
    clinicalSummary: string;
    aiPowered: boolean;
}

export interface TriageResult extends TriageOutput {
    patientId: string;
    appointmentId: string;
    passwordSetupRequired: boolean;
    manualPasswordSetupLink: string | null;
}

// ----------------------------------------
// Reception Stats
// ----------------------------------------

export interface ReceptionStats {
    todayRegistrations: number;
    todayAppointments: number;
    pendingAppointments: number;
    completedToday: number;
    totalPatients: number;
}

// ----------------------------------------
// Department & Doctor
// ----------------------------------------

export interface Department {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    base_consultation_fee: number | null;
    head_doctor_id: string | null;
}

export interface DoctorListItem {
    id: string;
    name: string | null;
    specialty: string | null;
}

// ----------------------------------------
// Patient Detail View
// ----------------------------------------

export interface VitalSign {
    id: number;
    patient_id: string;
    appointment_id: string | null;
    blood_pressure: string | null;
    heart_rate: number | null;
    temperature: number | null;
    oxygen_sat: number | null;
    respiratory_rate: number | null;
    recorded_by: string | null;
    created_at: Date;
}

export interface TriageRecord {
    id: number;
    patient_id: string;
    patient_name: string;
    symptoms: string;
    duration: string | null;
    severity: string | null;
    triage_level: string;
    recommended_department: string;
    possible_conditions: string | null;
    recommended_tests: string | null;
    risk_alerts: string | null;
    clinical_summary: string | null;
    created_at: Date;
}

export interface PatientDetail {
    patient: Patient;
    appointments: Appointment[];
    triageHistory: TriageRecord[];
    vitals: VitalSign[];
}
