import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { validateZealthixApiKey, logZealthixApiCall } from '@/app/lib/zealthix/auth';
import { mapPatientFindResult } from '@/app/lib/zealthix/mappers';

export async function POST(request: NextRequest) {
    // Validate API key
    const authResult = await validateZealthixApiKey(request);
    if (authResult instanceof NextResponse) return authResult;

    const { organizationId, apiKeyId } = authResult;
    let body: Record<string, unknown> = {};

    try {
        body = await request.json();
        const { patientId, mobileNumber, ipNumber, abhaNumber, ipdVisitType } = body as {
            patientId?: string;
            mobileNumber?: string;
            ipNumber?: string;
            abhaNumber?: string;
            ipdVisitType?: string;
        };

        // Build search conditions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orConditions: any[] = [];

        if (patientId) orConditions.push({ patient_id: patientId });
        if (mobileNumber) orConditions.push({ phone: mobileNumber });
        if (abhaNumber) orConditions.push({ abha_number: abhaNumber });

        // If ipNumber is provided, search by admission ID to find the patient
        if (ipNumber) {
            const admission = await prisma.admissions.findFirst({
                where: { admission_id: ipNumber, organizationId },
                select: { patient_id: true },
            });
            if (admission) {
                orConditions.push({ patient_id: admission.patient_id });
            }
        }

        if (orConditions.length === 0) {
            await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/find', body, 400);
            return NextResponse.json(
                { success: false, message: 'At least one search parameter is required' },
                { status: 400 }
            );
        }

        // Find matching patients
        const patients = await prisma.oPD_REG.findMany({
            where: {
                organizationId,
                OR: orConditions,
                is_archived: false,
            },
            take: 20,
        });

        // For each patient, get their latest visit and invoice
        const results = await Promise.all(
            patients.map(async (patient: Record<string, unknown>) => {
                const patId = patient.patient_id as string;

                // Get latest visit based on type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let visit: any = null;

                if (ipdVisitType === 'INPATIENT' || !ipdVisitType) {
                    visit = await prisma.admissions.findFirst({
                        where: { patient_id: patId, organizationId },
                        orderBy: { admission_date: 'desc' },
                    });
                }

                if (!visit && (ipdVisitType === 'OUTPATIENT' || !ipdVisitType)) {
                    visit = await prisma.appointments.findFirst({
                        where: { patient_id: patId, organizationId },
                        orderBy: { appointment_date: 'desc' },
                    });
                }

                // Get latest invoice
                const invoice = await prisma.invoices.findFirst({
                    where: { patient_id: patId, organizationId, status: { not: 'Cancelled' } },
                    orderBy: { created_at: 'desc' },
                });

                // Get active policy
                const policy = await prisma.insurance_policies.findFirst({
                    where: { patient_id: patId, organizationId, status: 'Active' },
                });

                return mapPatientFindResult(patient, visit, invoice, policy);
            })
        );

        await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/find', body, 200);

        return NextResponse.json({
            success: true,
            message: 'success',
            data: results,
        });
    } catch (error) {
        console.error('Zealthix patient find error:', error);
        await logZealthixApiCall(organizationId, apiKeyId, '/claim/patient/find', body, 500);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}
