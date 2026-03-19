'use server';

import { getTenantPrisma } from '@/backend/db';
import { getPatientSession } from '@/app/patient/login/actions';
import { revalidatePath } from 'next/cache';
import { logPatientAudit } from '@/app/lib/audit';
import { generateSignedReportToken } from '@/app/lib/signed-url';
import { headers } from 'next/headers';

export async function getPatientDashboardData() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);
        const pid = session.id;

        const patient = await db.oPD_REG.findUnique({
            where: { patient_id: pid }
        });

        if (!patient) return { success: false, error: 'Patient not found' };

        const upcomingAppointments = await db.appointments.findMany({
            where: { patient_id: pid, appointment_date: { gte: new Date() }, status: { in: ['Scheduled', 'Checked In', 'Pending'] } },
            orderBy: { appointment_date: 'asc' },
            take: 5
        });
        const activePrescriptions = await db.pharmacy_orders.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' },
            include: { items: true },
            take: 3
        });
        const latestVitalsArr = await db.vital_signs.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' },
            take: 1
        });
        const pendingLabCount = await db.lab_orders.count({
            where: { patient_id: pid, status: { not: 'Completed' } }
        });
        const unpaidInvoiceCount = await db.invoices.count({
            where: { patient_id: pid, status: { not: 'Paid' } }
        });
        const latestVitals = latestVitalsArr;

        return {
            success: true,
            data: {
                patient,
                upcomingAppointments,
                activePrescriptions,
                latestVitals: latestVitals?.[0] || null,
                pendingLabCount,
                unpaidInvoiceCount,
            }
        };
    } catch (error) {
        console.error('Patient dashboard error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getPatientRecords() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);
        const pid = session.id;

        const labs = await db.lab_orders.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' }
        });
        const diagnoses = await db.clinical_EHR.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' }
        });
        const vitals = await db.vital_signs.findMany({
            where: { patient_id: pid },
            orderBy: { created_at: 'desc' }
        });

        logPatientAudit({ action: 'VIEW_MEDICAL_RECORDS', entity_type: 'patient', entity_id: pid });

        return { success: true, data: { labs, diagnoses, vitals } };
    } catch (error) {
        console.error('Patient records error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function submitPatientFeedback(rating: number, comments: string) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);

        await db.patientFeedback.create({
            data: {
                patient_id: session.id,
                rating,
                comments,
                organizationId: session.organization_id
            }
        });

        logPatientAudit({ action: 'SUBMIT_FEEDBACK', details: `Rating: ${rating}` });

        revalidatePath('/patient/feedback');
        return { success: true };
    } catch (error) {
        console.error('Feedback error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ── Privacy & Consent ──────────────────────────────────────────

const CONSENT_TYPES = ['data_processing', 'marketing', 'research'] as const;

export async function getPrivacySettings() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);

        const consents = await db.patientConsent.findMany({
            where: { patient_id: session.id, organizationId: session.organization_id },
        });

        // Build a map keyed by consent_type, defaulting to false
        const consentMap: Record<string, { granted: boolean; granted_at: Date | null; revoked_at: Date | null }> = {};
        for (const t of CONSENT_TYPES) {
            const c = consents.find((r: { consent_type: string }) => r.consent_type === t);
            consentMap[t] = {
                granted: c?.granted ?? false,
                granted_at: c?.granted_at ?? null,
                revoked_at: c?.revoked_at ?? null,
            };
        }

        return { success: true, data: consentMap };
    } catch (error) {
        console.error('Privacy settings error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function updateConsent(consentType: string, granted: boolean) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };
        if (!CONSENT_TYPES.includes(consentType as typeof CONSENT_TYPES[number])) {
            return { success: false, error: 'Invalid consent type' };
        }

        const db = getTenantPrisma(session.organization_id);
        const hdrs = await headers();
        const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;

        await db.patientConsent.upsert({
            where: {
                patient_id_consent_type_organizationId: {
                    patient_id: session.id,
                    consent_type: consentType,
                    organizationId: session.organization_id,
                },
            },
            update: {
                granted,
                granted_at: granted ? new Date() : undefined,
                revoked_at: granted ? null : new Date(),
                ip_address: ip,
            },
            create: {
                patient_id: session.id,
                consent_type: consentType,
                granted,
                granted_at: granted ? new Date() : null,
                ip_address: ip,
                organizationId: session.organization_id,
            },
        });

        logPatientAudit({
            action: granted ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
            entity_type: 'consent',
            entity_id: consentType,
        });

        revalidatePath('/patient/settings/privacy');
        return { success: true };
    } catch (error) {
        console.error('Update consent error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function exportMyData() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const db = getTenantPrisma(session.organization_id);
        const pid = session.id;

        // Fetch all patient data in parallel
        const [patient, appointments, labs, vitals, diagnoses, prescriptions, invoices] = await Promise.all([
            db.oPD_REG.findUnique({ where: { patient_id: pid } }),
            db.appointments.findMany({ where: { patient_id: pid }, orderBy: { appointment_date: 'desc' } }),
            db.lab_orders.findMany({ where: { patient_id: pid }, orderBy: { created_at: 'desc' } }),
            db.vital_signs.findMany({ where: { patient_id: pid }, orderBy: { created_at: 'desc' } }),
            db.clinical_EHR.findMany({ where: { patient_id: pid }, orderBy: { created_at: 'desc' } }),
            db.pharmacy_orders.findMany({ where: { patient_id: pid }, orderBy: { created_at: 'desc' }, include: { items: true } }),
            db.invoices.findMany({ where: { patient_id: pid }, orderBy: { created_at: 'desc' } }),
        ]);

        const exportData = {
            exported_at: new Date().toISOString(),
            patient_id: pid,
            organization: session.organization_name,
            personal_info: patient ? {
                full_name: patient.full_name,
                age: patient.age,
                gender: patient.gender,
                phone: patient.phone,
                email: patient.email,
                address: patient.address,
                blood_group: patient.blood_group,
                date_of_birth: patient.date_of_birth,
                emergency_contact_name: patient.emergency_contact_name,
                emergency_contact_phone: patient.emergency_contact_phone,
            } : null,
            appointments,
            lab_orders: labs,
            vital_signs: vitals,
            clinical_records: diagnoses,
            prescriptions,
            invoices,
        };

        logPatientAudit({ action: 'DATA_EXPORT', entity_type: 'patient', entity_id: pid });

        return { success: true, data: exportData };
    } catch (error) {
        console.error('Data export error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function generateLabReportUrl(barcode: string) {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        const token = generateSignedReportToken(barcode, session.organization_id);

        logPatientAudit({
            action: 'GENERATE_LAB_REPORT_URL',
            entity_type: 'lab_order',
            entity_id: barcode,
        });

        return { success: true, url: `/api/reports/lab/pdf?token=${token}` };
    } catch (error) {
        console.error('Generate lab URL error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
