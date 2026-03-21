import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { validateZealthixApiKey, logZealthixApiCall } from '@/app/lib/zealthix/auth';

// Map Zealthix action statuses to our internal claim statuses
function mapZealthixStatus(actionStatus: string, status: string): string {
    const normalized = (actionStatus || status || '').toUpperCase();

    if (normalized.includes('SETTLED') || normalized.includes('FINAL_SETTLED')) return 'Settled';
    if (normalized.includes('APPROVED') || normalized.includes('DISCHARGE_APPROVED')) return 'Approved';
    if (normalized.includes('REJECTED')) return 'Rejected';
    if (normalized.includes('PARTIAL')) return 'PartiallyApproved';
    if (normalized.includes('PREAUTH') || normalized.includes('INITIATED')) return 'UnderReview';
    if (normalized.includes('ENHANCEMENT') || normalized.includes('DISCHARGE')) return 'UnderReview';

    return 'UnderReview';
}

export async function POST(request: NextRequest) {
    const authResult = await validateZealthixApiKey(request);
    if (authResult instanceof NextResponse) return authResult;

    const { organizationId, apiKeyId } = authResult;
    let body: Record<string, unknown> = {};

    try {
        body = await request.json();

        const {
            claimNumber,
            patientName,
            patientMobileNumber,
            patientEmailId,
            policyNo,
            actionStatus,
            status,
            totalAmount,
            approvedAmount,
            settledAmount,
            tdsAmount,
            remarks,
            attachment,
            lineOfTreatment,
            conditions,
            doctorName,
            roomType,
            items,
            admissionDateTime,
            dischargeDateTime,
        } = body as {
            claimNumber?: string;
            patientName?: string;
            patientMobileNumber?: string;
            patientEmailId?: string;
            policyNo?: string;
            actionStatus?: string;
            status?: string;
            totalAmount?: number;
            approvedAmount?: number;
            settledAmount?: number;
            tdsAmount?: number;
            remarks?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            attachment?: any;
            lineOfTreatment?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            conditions?: any;
            doctorName?: string;
            roomType?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items?: any;
            admissionDateTime?: string;
            dischargeDateTime?: string;
        };

        if (!claimNumber) {
            await logZealthixApiCall(organizationId, apiKeyId, '/claim/update', body, 400);
            return NextResponse.json(
                { success: false, message: 'claimNumber is required' },
                { status: 400 }
            );
        }

        const mappedStatus = mapZealthixStatus(actionStatus || '', status || '');

        // Try to find existing claim by Zealthix claim number
        let claim = await prisma.insurance_claims.findFirst({
            where: { zealthix_claim_number: claimNumber, organizationId },
            include: {
                policy: { include: { patient: true } },
                invoice: true,
            },
        });

        if (!claim) {
            // Try to match by policy number and patient
            if (policyNo && patientMobileNumber) {
                const patient = await prisma.oPD_REG.findFirst({
                    where: { phone: patientMobileNumber, organizationId },
                });

                if (patient) {
                    const policy = await prisma.insurance_policies.findFirst({
                        where: {
                            patient_id: patient.patient_id,
                            policy_number: policyNo,
                            organizationId,
                        },
                    });

                    if (policy) {
                        // Find the most recent claim for this policy
                        claim = await prisma.insurance_claims.findFirst({
                            where: { policy_id: policy.id, organizationId },
                            include: {
                                policy: { include: { patient: true } },
                                invoice: true,
                            },
                            orderBy: { submitted_at: 'desc' },
                        });
                    }
                }
            }
        }

        if (!claim) {
            // No existing claim found - create one if we can identify the patient and policy
            let patientId: string | null = null;

            if (patientMobileNumber) {
                const patient = await prisma.oPD_REG.findFirst({
                    where: { phone: patientMobileNumber, organizationId },
                });
                if (patient) patientId = patient.patient_id;
            }

            if (!patientId) {
                await logZealthixApiCall(organizationId, apiKeyId, '/claim/update', body, 404);
                return NextResponse.json(
                    { success: false, message: 'No matching claim or patient found' },
                    { status: 404 }
                );
            }

            const policy = policyNo
                ? await prisma.insurance_policies.findFirst({
                      where: { patient_id: patientId, policy_number: policyNo, organizationId },
                  })
                : await prisma.insurance_policies.findFirst({
                      where: { patient_id: patientId, status: 'Active', organizationId },
                  });

            if (!policy) {
                await logZealthixApiCall(organizationId, apiKeyId, '/claim/update', body, 404);
                return NextResponse.json(
                    { success: false, message: 'No insurance policy found for patient' },
                    { status: 404 }
                );
            }

            // Find the latest invoice for this patient
            const invoice = await prisma.invoices.findFirst({
                where: { patient_id: patientId, organizationId, status: { not: 'Cancelled' } },
                orderBy: { created_at: 'desc' },
            });

            if (!invoice) {
                await logZealthixApiCall(organizationId, apiKeyId, '/claim/update', body, 404);
                return NextResponse.json(
                    { success: false, message: 'No invoice found for patient' },
                    { status: 404 }
                );
            }

            // Create the claim record
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

            claim = await prisma.insurance_claims.create({
                data: {
                    claim_number: `CLM-${dateStr}-${seq}`,
                    policy_id: policy.id,
                    invoice_id: invoice.id,
                    claimed_amount: totalAmount || Number(invoice.net_amount),
                    status: mappedStatus,
                    zealthix_claim_number: claimNumber,
                    action_status: actionStatus,
                    organizationId,
                },
                include: {
                    policy: { include: { patient: true } },
                    invoice: true,
                },
            });
        }

        // Update the claim with Zealthix data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
            status: mappedStatus,
            zealthix_claim_number: claimNumber,
            action_status: actionStatus,
        };

        if (approvedAmount !== undefined) updateData.approved_amount = approvedAmount;
        if (settledAmount !== undefined) updateData.settled_amount = settledAmount;
        if (tdsAmount !== undefined) updateData.tds_amount = tdsAmount;
        if (remarks) updateData.zealthix_remarks = remarks;
        if (attachment) updateData.zealthix_attachments = attachment;

        if (['Approved', 'PartiallyApproved'].includes(mappedStatus)) {
            updateData.reviewed_at = new Date();
        }
        if (mappedStatus === 'Settled') {
            updateData.settled_at = new Date();
            updateData.reviewed_at = updateData.reviewed_at || new Date();
        }

        const updatedClaim = await prisma.insurance_claims.update({
            where: { id: claim.id },
            data: updateData,
        });

        // If settled with an amount, create a payment record and update invoice
        if (mappedStatus === 'Settled' && (settledAmount || approvedAmount)) {
            const paymentAmount = settledAmount || approvedAmount || 0;

            if (paymentAmount > 0) {
                const now = new Date();
                const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

                await prisma.payments.create({
                    data: {
                        receipt_number: `RCP-${dateStr}-${seq}`,
                        invoice_id: claim.invoice_id,
                        amount: paymentAmount,
                        payment_method: 'Insurance',
                        payment_type: 'Settlement',
                        status: 'Completed',
                        notes: `Zealthix claim ${claimNumber} settled`,
                        organizationId,
                    },
                });

                // Update invoice totals
                const allPayments = await prisma.payments.findMany({
                    where: { invoice_id: claim.invoice_id, status: 'Completed', organizationId },
                });
                const totalPaid = allPayments.reduce(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (sum: number, p: any) => sum + Number(p.amount),
                    0
                );
                const netAmount = Number(claim.invoice?.net_amount || 0);
                const balance = netAmount - totalPaid;

                await prisma.invoices.update({
                    where: { id: claim.invoice_id },
                    data: {
                        paid_amount: totalPaid,
                        balance_due: balance > 0 ? balance : 0,
                        status: balance <= 0 ? 'Paid' : 'Partial',
                    },
                });

                // Update policy remaining limit
                if (claim.policy_id) {
                    const policy = await prisma.insurance_policies.findUnique({
                        where: { id: claim.policy_id },
                    });
                    if (policy) {
                        const newRemaining = Number(policy.remaining_limit || 0) - paymentAmount;
                        await prisma.insurance_policies.update({
                            where: { id: policy.id },
                            data: { remaining_limit: newRemaining > 0 ? newRemaining : 0 },
                        });
                    }
                }
            }
        }

        // Update admission fields if provided
        if (claim.admission_id && (lineOfTreatment || doctorName || roomType || admissionDateTime || dischargeDateTime)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const admissionUpdate: any = {};
            if (lineOfTreatment) admissionUpdate.line_of_treatment = lineOfTreatment;
            if (doctorName) admissionUpdate.doctor_name = doctorName;
            if (admissionDateTime) admissionUpdate.admission_date = new Date(admissionDateTime);
            if (dischargeDateTime) admissionUpdate.discharge_date = new Date(dischargeDateTime);

            if (Object.keys(admissionUpdate).length > 0) {
                await prisma.admissions.update({
                    where: { admission_id: claim.admission_id },
                    data: admissionUpdate,
                }).catch(() => {}); // Non-blocking
            }
        }

        // Audit log
        await prisma.system_audit_logs.create({
            data: {
                action: 'ZEALTHIX_CLAIM_UPDATE',
                module: 'zealthix',
                entity_type: 'claim',
                entity_id: claimNumber,
                details: JSON.stringify({
                    claimId: updatedClaim.id,
                    actionStatus,
                    status: mappedStatus,
                    approvedAmount,
                    settledAmount,
                }),
                organizationId,
            },
        });

        await logZealthixApiCall(organizationId, apiKeyId, '/claim/update', body, 200);

        return NextResponse.json({
            success: true,
            message: 'Claim updated successfully',
            data: {},
        });
    } catch (error) {
        console.error('Zealthix claim update error:', error);
        await logZealthixApiCall(organizationId, apiKeyId, '/claim/update', body, 500);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}
