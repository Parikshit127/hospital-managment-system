/**
 * Data mappers for transforming Hospital OS data to Zealthix API format
 */

// Configurable mapping from invoice_items department names to Zealthix bill categories
const DEPARTMENT_TO_BILL_CATEGORY: Record<string, string> = {
    // Infrastructure / Bed charges
    'Infrastructure': 'infraCharges',
    'Bed': 'infraCharges',
    'Bed Charges': 'infraCharges',
    'Room': 'infraCharges',
    'Room Charges': 'infraCharges',
    'Accommodation': 'infraCharges',
    // Consultation
    'Consultation': 'consultation',
    'Doctor Consultation': 'consultation',
    'OPD': 'consultation',
    // OT Charges
    'OT': 'otCharges',
    'Operation Theatre': 'otCharges',
    'OT Charges': 'otCharges',
    // Surgery
    'Surgery': 'surgeon',
    'Surgical': 'surgeon',
    'Surgeon': 'surgeon',
    'Surgeon Charges': 'surgeon',
    // Lab / Investigation
    'Lab': 'laboratoryInvestigation',
    'Laboratory': 'laboratoryInvestigation',
    'Investigation': 'laboratoryInvestigation',
    'Pathology': 'laboratoryInvestigation',
    'Radiology': 'laboratoryInvestigation',
    'Diagnostic': 'laboratoryInvestigation',
    // Pharmacy
    'Pharmacy': 'pharmacy',
    'Medicine': 'pharmacy',
    'Medicines': 'pharmacy',
    'Drug': 'pharmacy',
};

interface InvoiceItem {
    department: string;
    net_price: number | { toNumber?: () => number };
}

interface BillDetails {
    package: number;
    infraCharges: number;
    consultation: number;
    otCharges: number;
    surgeon: number;
    laboratoryInvestigation: number;
    pharmacy: number;
    otherExpenses: number;
}

/**
 * Aggregate invoice items into Zealthix bill categories
 */
export function mapBillDetailsToZealthix(items: InvoiceItem[]): BillDetails {
    const result: BillDetails = {
        package: 0,
        infraCharges: 0,
        consultation: 0,
        otCharges: 0,
        surgeon: 0,
        laboratoryInvestigation: 0,
        pharmacy: 0,
        otherExpenses: 0,
    };

    for (const item of items) {
        const amount =
            typeof item.net_price === 'object' && item.net_price?.toNumber
                ? item.net_price.toNumber()
                : Number(item.net_price);

        const category = DEPARTMENT_TO_BILL_CATEGORY[item.department];
        if (category && category in result) {
            result[category as keyof BillDetails] += amount;
        } else {
            result.otherExpenses += amount;
        }
    }

    return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/**
 * Map patient + policy + provider to Zealthix patient details format
 */
export function mapPatientDetailsToZealthix(
    patient: AnyRecord,
    policy: AnyRecord | null,
    provider: AnyRecord | null,
    admission: AnyRecord | null,
    invoice: AnyRecord | null
) {
    const age = patient.age || (patient.date_of_birth ? calculateAge(patient.date_of_birth) : '');

    return {
        patientName: patient.full_name || '',
        mobileNumber: patient.phone || '',
        memberId: policy?.member_id || '',
        emailId: patient.email || '',
        abhaId: patient.abha_number || '',
        employeeId: patient.employee_id || '',
        insurerName: provider?.provider_name || '',
        payer: provider?.provider_name || '',
        payerID: provider?.id?.toString() || '',
        insurerID: policy?.insurer_id || '0',
        corporateName: policy?.corporate_name || '',
        policyNumber: policy?.policy_number || '',
        inpatientNumber: admission?.admission_id || '',
        registrationNumber: patient.registration_number || '',
        abhaAddress: patient.abha_address || '',
        gender: patient.gender || '',
        dob: patient.date_of_birth || '',
        patientAge: age,
        policyType: policy?.policy_type || '',
        patientPayable: invoice ? Number(invoice.balance_due || 0) : 0,
        panNumber: patient.pan_number || '',
    };
}

/**
 * Map admission to treatment details
 */
export function mapTreatmentDetails(admission: AnyRecord | null) {
    if (!admission) {
        return {
            dateOfAdmission: '',
            dateOfDischarge: '',
            lineOfTreatment: '',
            diagnosis: '',
            surgeryRequested: '',
            admissionType: '',
        };
    }

    return {
        dateOfAdmission: admission.admission_date
            ? String(new Date(admission.admission_date).getTime())
            : '',
        dateOfDischarge: admission.discharge_date
            ? String(new Date(admission.discharge_date).getTime())
            : '',
        lineOfTreatment: admission.line_of_treatment || '',
        diagnosis: admission.diagnosis || '',
        surgeryRequested: admission.surgery_requested || '',
        admissionType: admission.admission_type || 'Normal',
    };
}

/**
 * Map doctor and ward details
 */
export function mapDoctorDetails(
    admission: AnyRecord | null,
    doctor: AnyRecord | null,
    ward: AnyRecord | null
) {
    return {
        doctorName: admission?.doctor_name || doctor?.name || '',
        doctorRegistrationNo: doctor?.doctor_registration_no || '',
        roomType: ward?.ward_type || 'General Ward',
        isDischargedToday: admission?.status === 'Discharged' &&
            admission?.discharge_date &&
            isSameDay(new Date(admission.discharge_date), new Date()),
        isDeath: admission?.is_death || false,
        departmentName: ward?.ward_name || admission?.department || '',
    };
}

/**
 * Map case/accident details
 */
export function mapCaseDetails(admission: AnyRecord | null) {
    return {
        dateOfInjury: admission?.case_injury_date
            ? new Date(admission.case_injury_date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
              }) + ' 00:00:00'
            : '01-01-1900 00:00:00',
        firNumber: admission?.case_fir_number || '0',
        isRTA: admission?.case_is_rta || false,
        isSubstanceAbuse: admission?.case_is_substance_abuse || false,
        isReportToPolice: admission?.case_is_police_report || false,
        isTestConducted: admission?.case_is_test_conducted || false,
    };
}

/**
 * Map treatment past history
 */
export function mapTreatmentPastHistory(admission: AnyRecord | null) {
    return {
        pastAilments: admission?.past_ailments || '',
        pastAilmentDuration: admission?.past_ailment_duration || '',
        otherAilments: admission?.other_ailments || '',
    };
}

/**
 * Map discharge initiation details
 */
export function mapDischargeDetails(
    admission: AnyRecord | null,
    payments: AnyRecord[],
    visitType: string
) {
    const totalPaid = payments.reduce(
        (sum: number, p: AnyRecord) => sum + Number(p.amount || 0),
        0
    );
    const latestReceipt = payments.length > 0 ? payments[0].receipt_number : '';

    return {
        dateOfAdmission: admission?.admission_date
            ? new Date(admission.admission_date).toISOString()
            : '',
        dateOfDischarge: admission?.discharge_date
            ? new Date(admission.discharge_date).toISOString()
            : '',
        paUtilised: payments.some((p: AnyRecord) => p.payment_method === 'Insurance'),
        paidAmount: totalPaid,
        inpatientNumber: admission?.admission_id || '',
        receiptNumber: latestReceipt,
        visitType: visitType === 'INPATIENT' ? 'IP' : visitType === 'OUTPATIENT' ? 'OP' : 'FC',
    };
}

/**
 * Map other details (consent, IDs, company info)
 */
export function mapOtherDetails(
    admission: AnyRecord | null,
    policy: AnyRecord | null,
    provider: AnyRecord | null
) {
    return {
        consentSignature: admission?.consent_signature_url || '',
        idCards: admission?.id_cards_url || ' ',
        admissionType: admission?.admission_type || 'Normal',
        corporateCompnay: policy?.corporate_name || '',
        insuranceCompany: provider?.provider_name || '',
    };
}

/**
 * Map patient search result to Zealthix format
 */
export function mapPatientFindResult(
    patient: AnyRecord,
    visit: AnyRecord | null,
    invoice: AnyRecord | null,
    policy: AnyRecord | null
) {
    return {
        patientId: patient.patient_id,
        name: patient.full_name || '',
        email: patient.email || '',
        phone: patient.phone || '',
        visitId: visit?.admission_id || visit?.appointment_id || '',
        departmentName: visit?.department || '',
        doctorName: visit?.doctor_name || '',
        visitDateTime: visit?.admission_date || visit?.appointment_date || '',
        visitType: visit?.admission_id ? 'INPATIENT' : 'OUTPATIENT',
        doctorId: visit?.doctor_id || '',
        amount: invoice ? Number(invoice.net_amount || 0) : 0,
        type: invoice?.invoice_type || '',
        payerId: policy?.provider_id?.toString() || '',
    };
}

// ---- Helpers ----

function calculateAge(dob: string): string {
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return String(age);
}

function isSameDay(d1: Date, d2: Date): boolean {
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
}
