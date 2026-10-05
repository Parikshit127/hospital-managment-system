/**
 * Effective payer category for printing an invoice.
 *
 * IPD invoices are created as 'cash' (billing_patient_type default) no matter
 * the patient's category, and the "Change Patient Category" action on the IPD
 * chart only updates the patient record. So for an admission-linked invoice that
 * is still stamped 'cash' with no TPA / corporate money against it, the patient's
 * current category is the truth. An invoice that already carries a non-cash payer
 * type, or real TPA / corporate money, keeps its own stamp — claims are never relabelled.
 */
export type BillPayerType = 'cash' | 'corporate' | 'tpa_insurance';

export function resolveBillPayerType(
    invoice: {
        billing_patient_type?: string | null;
        admission_id?: string | null;
        tpa_provider_id?: number | null;
        tpa_payable?: any;
        tpa_approved_amount?: any;
        tpa_settled_amount?: any;
        corporate_payable?: any;
    },
    patientType?: string | null,
): BillPayerType {
    const norm = (t?: string | null): BillPayerType => {
        const v = String(t || 'cash').toLowerCase();
        if (v === 'tpa_insurance' || v === 'insurance' || v === 'tpa') return 'tpa_insurance';
        if (v === 'corporate') return 'corporate';
        return 'cash';
    };

    const stamped = norm(invoice.billing_patient_type);
    if (stamped !== 'cash') return stamped;

    const hasPayerMoney = !!invoice.tpa_provider_id
        || Number(invoice.tpa_payable || 0) > 0
        || Number(invoice.tpa_approved_amount || 0) > 0
        || Number(invoice.tpa_settled_amount || 0) > 0
        || Number(invoice.corporate_payable || 0) > 0;
    if (hasPayerMoney || !invoice.admission_id) return stamped;

    return norm(patientType);
}
