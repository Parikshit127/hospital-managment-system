'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function requestVideoCall(data: {
    patientId: string;
    doctorId: string;
    reason?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const model = (db.videoCallRequest || db.VideoCallRequest);

        const request = await model.create({
            data: {
                patient_id: data.patientId,
                doctor_id: data.doctorId,
                reason: data.reason,
                organizationId,
                status: 'Pending'
            }
        });

        revalidatePath('/patient/dashboard');
        return { success: true, data: request };
    } catch (error: any) {
        console.error('Request Video Call Error:', error);
        return { success: false, error: 'Failed to request video call: ' + (error?.message || 'Unknown error') };
    }
}

export async function respondToVideoCall(data: {
    requestId: string;
    status: 'Accepted' | 'Rejected';
    scheduledAt?: string;
    rejectionReason?: string;
    meetLink?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const model = (db.videoCallRequest || db.VideoCallRequest);

        let finalLink = data.meetLink || null;
        if (data.status === 'Accepted' && !finalLink) {
            finalLink = `https://meet.google.com/${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`;
        }

        await model.update({
            where: { id: data.requestId },
            data: {
                status: data.status,
                scheduled_at: data.scheduledAt ? new Date(data.scheduledAt) : null,
                rejection_reason: data.rejectionReason,
                meet_link: finalLink
            }
        });

        revalidatePath('/doctor/dashboard');
        revalidatePath('/patient/dashboard');
        return { success: true };
    } catch (error) {
        console.error('Respond to Video Call Error:', error);
        return { success: false, error: 'Failed to respond to request' };
    }
}

export async function getPendingCallRequests(doctorId: string) {
    try {
        const { db } = await requireTenantContext();
        const model = (db.videoCallRequest || db.VideoCallRequest);

        const requests = await model.findMany({
            where: {
                doctor_id: doctorId,
                status: 'Pending'
            },
            include: {
                patient: {
                    select: {
                        full_name: true,
                        patient_id: true,
                        phone: true
                    }
                }
            },
            orderBy: { request_date: 'desc' }
        });

        return { success: true, data: requests };
    } catch (error) {
        console.error('Get Pending Requests Error:', error);
        return { success: false, data: [] };
    }
}

export async function getAllCallRequests(doctorId: string) {
    try {
        const { db } = await requireTenantContext();
        const model = (db.videoCallRequest || db.VideoCallRequest);

        const requests = await model.findMany({
            where: { doctor_id: doctorId },
            include: {
                patient: {
                    select: {
                        full_name: true,
                        patient_id: true,
                        phone: true
                    }
                }
            },
            orderBy: { request_date: 'desc' },
            take: 20
        });

        return { success: true, data: requests };
    } catch (error) {
        console.error('Get All Requests Error:', error);
        return { success: false, data: [] };
    }
}

export async function getActiveCallRequests(patientId: string) {
    try {
        const { db } = await requireTenantContext();
        const model = (db.videoCallRequest || db.VideoCallRequest);

        const requests = await model.findMany({
            where: { patient_id: patientId },
            orderBy: { request_date: 'desc' },
            take: 10
        });

        return { success: true, data: requests };
    } catch (error) {
        console.error('Get Active Call Requests Error:', error);
        return { success: false, data: [] };
    }
}
