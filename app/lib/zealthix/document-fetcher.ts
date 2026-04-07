import { prisma } from '@/backend/db';

interface ZealthixDocument {
    id: string;
    title: string;
    contentType: string;
    attachmentType: string;
    base64: string;
}

/**
 * Fetch a file from a URL and return as base64 string
 */
async function fetchAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) return '';
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
}

/**
 * Generate a PDF from an internal API route and return as base64
 */
async function generatePdfBase64(
    baseUrl: string,
    path: string,
    apiKey: string,
    params?: Record<string, string>
): Promise<string> {
    try {
        const url = new URL(path, baseUrl);
        if (params) {
            Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        }
        const response = await fetch(url.toString(), {
            headers: {
                'X-Internal-Request': 'true',
                'X-Api-Key': apiKey,
            },
        });
        if (!response.ok) return '';
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
    } catch {
        return '';
    }
}

/**
 * Get all documents for a visit, encoded as base64 for Zealthix
 */
export async function getVisitDocuments(
    visitId: string,
    visitType: string,
    organizationId: string,
    baseUrl: string,
    apiKey: string
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
                    const base64 = await generatePdfBase64(
                        baseUrl,
                        `/api/invoice/${invoice.id}/pdf`,
                        apiKey
                    );
                    if (base64) {
                        documents.push({
                            id: `INV-${invoice.id}`,
                            title: `Invoice ${invoice.invoice_number}`,
                            contentType: 'application/pdf',
                            attachmentType: 'Bill',
                            base64,
                        });
                    }
                }

                // Discharge summary PDF
                if (admission.summaries && admission.summaries.length > 0) {
                    const base64 = await generatePdfBase64(
                        baseUrl,
                        `/api/discharge/${admission.admission_id}/pdf`,
                        apiKey
                    );
                    if (base64) {
                        documents.push({
                            id: `DS-${admission.admission_id}`,
                            title: 'Discharge Summary',
                            contentType: 'application/pdf',
                            attachmentType: 'DischargeSummary',
                            base64,
                        });
                    }
                }

                // Consent signature if available
                if (admission.consent_signature_url) {
                    const base64 = await fetchAsBase64(admission.consent_signature_url);
                    if (base64) {
                        documents.push({
                            id: `CONSENT-${admission.admission_id}`,
                            title: 'Patient Consent',
                            contentType: 'image/png',
                            attachmentType: 'Consent',
                            base64,
                        });
                    }
                }

                // ID cards if available
                if (admission.id_cards_url) {
                    const base64 = await fetchAsBase64(admission.id_cards_url);
                    if (base64) {
                        documents.push({
                            id: `ID-${admission.admission_id}`,
                            title: 'ID Card',
                            contentType: 'image/jpeg',
                            attachmentType: 'Other',
                            base64,
                        });
                    }
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
                        const base64 = await fetchAsBase64(lab.report_url);
                        if (base64) {
                            documents.push({
                                id: `LAB-${lab.id}`,
                                title: `Lab Report - ${lab.test_type}`,
                                contentType: 'application/pdf',
                                attachmentType: 'Investigation',
                                base64,
                            });
                        }
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
                    const base64 = await generatePdfBase64(
                        baseUrl,
                        `/api/invoice/${invoice.id}/pdf`,
                        apiKey
                    );
                    if (base64) {
                        documents.push({
                            id: `INV-${invoice.id}`,
                            title: `OP Bill - ${invoice.invoice_number}`,
                            contentType: 'application/pdf',
                            attachmentType: 'Bill',
                            base64,
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error fetching visit documents:', error);
    }

    return documents;
}
