import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { validateZealthixApiKey, logZealthixApiCall } from '@/app/lib/zealthix/auth';
import {
    mapPatientDetailsToZealthix,
    mapTreatmentDetails,
    mapDoctorDetails,
    mapCaseDetails,
    mapTreatmentPastHistory,
    mapBillDetailsToZealthix,
    mapDischargeDetails,
    mapOtherDetails,
} from '@/app/lib/zealthix/mappers';

export async function POST(request: NextRequest) {
    const authResult = await validateZealthixApiKey(request);
    if (authResult instanceof NextResponse) return authResult;

    const { organizationId, apiKeyId } = authResult;
    let body: Record<string, unknown> = {};

    try {
        body = await request.json();
        const { visitId, visitType } = body as {
            visitId?: string;
            visitDateTime?: string;
            visitType?: string;
        };

        if (!visitId) {
            await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/visit', body, 400);
            return NextResponse.json(
                { success: false, message: 'visitId is required' },
                { status: 400 }
            );
        }

        if (visitType === 'INPATIENT' || visitType === 'FINANCIAL_COUNSELLING') {
            // Fetch admission with all related data
            const admission = await prisma.admissions.findFirst({
                where: { admission_id: visitId, organizationId },
                include: {
                    patient: true,
                    bed: true,
                    ward: true,
                    invoices: {
                        where: { status: { not: 'Cancelled' } },
                        include: { items: true, payments: { orderBy: { created_at: 'desc' } } },
                        orderBy: { created_at: 'desc' },
                        take: 1,
                    },
                },
            });

            if (!admission) {
                await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/visit', body, 404);
                return NextResponse.json(
                    { success: false, message: 'Visit not found' },
                    { status: 404 }
                );
            }

            // Get patient's active insurance policy
            const policy = await prisma.insurance_policies.findFirst({
                where: {
                    patient_id: admission.patient_id,
                    organizationId,
                    status: 'Active',
                },
                include: { provider: true },
            });

            // Get doctor details
            const doctor = admission.doctor_name
                ? await prisma.user.findFirst({
                      where: {
                          organizationId,
                          name: admission.doctor_name,
                          role: 'doctor',
                      },
                  })
                : null;

            const invoice = admission.invoices?.[0] || null;
            const invoiceItems = invoice?.items || [];
            const payments = invoice?.payments || [];

            const responseData = {
                patientDetails: mapPatientDetailsToZealthix(
                    admission.patient,
                    policy,
                    policy?.provider || null,
                    admission,
                    invoice
                ),
                treatmentDetails: mapTreatmentDetails(admission),
                doctorDetails: mapDoctorDetails(admission, doctor, admission.ward),
                treatmentPastHistory: mapTreatmentPastHistory(admission),
                caseDetails: mapCaseDetails(admission),
                billDetails: mapBillDetailsToZealthix(invoiceItems),
                dischargeInitiationDetails: mapDischargeDetails(
                    admission,
                    payments,
                    visitType || 'INPATIENT'
                ),
                otherDeatails: mapOtherDetails(admission, policy, policy?.provider || null),
            };

            await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/visit', body, 200);

            return NextResponse.json({
                success: true,
                message: 'success',
                data: responseData,
            });
        } else {
            // OUTPATIENT visit
            const appointment = await prisma.appointments.findFirst({
                where: { appointment_id: visitId, organizationId },
                include: { patient: true },
            });

            if (!appointment) {
                await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/visit', body, 404);
                return NextResponse.json(
                    { success: false, message: 'Visit not found' },
                    { status: 404 }
                );
            }

            const policy = await prisma.insurance_policies.findFirst({
                where: {
                    patient_id: appointment.patient_id,
                    organizationId,
                    status: 'Active',
                },
                include: { provider: true },
            });

            const invoice = await prisma.invoices.findFirst({
                where: {
                    patient_id: appointment.patient_id,
                    invoice_type: 'OPD',
                    status: { not: 'Cancelled' },
                    organizationId,
                },
                include: { items: true, payments: { orderBy: { created_at: 'desc' } } },
                orderBy: { created_at: 'desc' },
            });

            const doctor = appointment.doctor_id
                ? await prisma.user.findFirst({
                      where: { id: appointment.doctor_id, organizationId },
                  })
                : null;

            const responseData = {
                patientDetails: mapPatientDetailsToZealthix(
                    appointment.patient,
                    policy,
                    policy?.provider || null,
                    null,
                    invoice
                ),
                treatmentDetails: {
                    dateOfAdmission: '',
                    dateOfDischarge: '',
                    lineOfTreatment: '',
                    diagnosis: '',
                    surgeryRequested: '',
                    admissionType: '',
                },
                doctorDetails: {
                    doctorName: appointment.doctor_name || doctor?.name || '',
                    doctorRegistrationNo: doctor?.doctor_registration_no || '',
                    roomType: '',
                    isDischargedToday: false,
                    isDeath: false,
                    departmentName: appointment.department || '',
                },
                treatmentPastHistory: { pastAilments: '', pastAilmentDuration: '', otherAilments: '' },
                caseDetails: mapCaseDetails(null),
                billDetails: mapBillDetailsToZealthix(invoice?.items || []),
                dischargeInitiationDetails: mapDischargeDetails(null, invoice?.payments || [], 'OUTPATIENT'),
                otherDeatails: mapOtherDetails(null, policy, policy?.provider || null),
            };

            await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/visit', body, 200);

            return NextResponse.json({
                success: true,
                message: 'success',
                data: responseData,
            });
        }
    } catch (error) {
        console.error('Zealthix patient visit error:', error);
        await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/visit', body, 500);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}
