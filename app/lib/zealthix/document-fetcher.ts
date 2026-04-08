import { prisma } from '@/backend/db';

interface ZealthixDocument {
    id: string;
    title: string;
    contentType: string;
    attachmentType: string;
    url: string;
}

/**
 * Get all documents for a visit as URLs for Zealthix
 */
export async function getVisitDocuments(
    visitId: string,
    visitType: string,
    organizationId: string,
    baseUrl: string
): Promise<ZealthixDocument[]> {
    const documents: ZealthixDocument[] = [];

    try {
        if (visitType === 'INPATIENT' || visitType === 'FINANCIAL_COUNSELLING') {
            // Fetch admission with related data
            const admission = await prisma.admissions.findFirst({
                where: { admission_id: visitId, organizationId },
                include: {
                    invoices: { where: { status: { not: 'Cancelled' } }, take: 5 },
                    summaries: { take: 1, orderBy: { created_at: 'desc' } },
                },
            });

            if (admission) {
                // Invoice PDFs
                for (const invoice of admission.invoices || []) {
                    documents.push({
                        id: `INV-${invoice.id}`,
                        title: `Invoice ${invoice.invoice_number}`,
                        contentType: 'application/pdf',
                        attachmentType: 'Bill',
                        url: `${baseUrl}/api/invoice/${invoice.id}/pdf`,
                    });
                }

                // Discharge summary PDF
                if (admission.summaries && admission.summaries.length > 0) {
                    documents.push({
                        id: `DS-${admission.admission_id}`,
                        title: 'Discharge Summary',
                        contentType: 'application/pdf',
                        attachmentType: 'DischargeSummary',
                        url: `${baseUrl}/api/discharge/${admission.admission_id}/pdf`,
                    });
                }

                // Consent signature if available
                if (admission.consent_signature_url) {
                    documents.push({
                        id: `CONSENT-${admission.admission_id}`,
                        title: 'Patient Consent',
                        contentType: 'image/png',
                        attachmentType: 'Consent',
                        url: admission.consent_signature_url,
                    });
                }

                // ID cards if available
                if (admission.id_cards_url) {
                    documents.push({
                        id: `ID-${admission.admission_id}`,
                        title: 'ID Card',
                        contentType: 'image/jpeg',
                        attachmentType: 'Other',
                        url: admission.id_cards_url,
                    });
                }

                // Lab reports for this patient during admission
                const labOrders = await prisma.lab_orders.findMany({
                    where: {
                        patient_id: admission.patient_id,
                        organizationId,
                        status: 'Completed',
                        report_url: { not: null },
                        created_at: {
                            gte: admission.admission_date,
                            ...(admission.discharge_date
                                ? { lte: admission.discharge_date }
                                : {}),
                        },
                    },
                    take: 10,
                });

                for (const lab of labOrders) {
                    if (lab.report_url) {
                        documents.push({
                            id: `LAB-${lab.id}`,
                            title: `Lab Report - ${lab.test_type}`,
                            contentType: 'application/pdf',
                            attachmentType: 'Investigation',
                            url: lab.report_url,
                        });
                    }
                }
            }
        } else if (visitType === 'OUTPATIENT') {
            // For OPD, fetch appointment-related documents
            const appointment = await prisma.appointments.findFirst({
                where: { appointment_id: visitId, organizationId },
            });

            if (appointment) {
                // Invoices for this patient
                const invoices = await prisma.invoices.findMany({
                    where: {
                        patient_id: appointment.patient_id,
                        invoice_type: 'OPD',
                        status: { not: 'Cancelled' },
                        organizationId,
                    },
                    orderBy: { created_at: 'desc' },
                    take: 3,
                });

                for (const invoice of invoices) {
                    documents.push({
                        id: `INV-${invoice.id}`,
                        title: `OP Bill - ${invoice.invoice_number}`,
                        contentType: 'application/pdf',
                        attachmentType: 'Bill',
                        url: `${baseUrl}/api/invoice/${invoice.id}/pdf`,
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error fetching visit documents:', error);
    }

    return documents;
}
