'use server';

import { getTenantPrisma } from '@/backend/db';
import { getPatientSession } from '../login/actions';

type NotificationOptions = {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
};

export async function getPatientNotifications(options?: NotificationOptions) {
    const session = await getPatientSession();
    if (!session) return { success: false, data: [], total: 0, unreadCount: 0 };

    try {
        const db = getTenantPrisma(session.organization_id);

        const where: Record<string, unknown> = { user_id: session.id };
        if (options?.unreadOnly) where.is_read = false;

        const [data, total, unreadCount] = await Promise.all([
            db.notification.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: options?.limit || 50,
                skip: options?.offset || 0,
            }),
            db.notification.count({ where: { user_id: session.id } }),
            db.notification.count({ where: { user_id: session.id, is_read: false } }),
        ]);

        return { success: true, data, total, unreadCount };
    } catch (error) {
        console.error('Patient Notifications Error:', error);
        return { success: false, data: [], total: 0, unreadCount: 0 };
    }
}

export async function getPatientUnreadCount() {
    const session = await getPatientSession();
    if (!session) return { success: false, count: 0 };

    try {
        const db = getTenantPrisma(session.organization_id);
        const count = await db.notification.count({
            where: { user_id: session.id, is_read: false },
        });
        return { success: true, count };
    } catch (error) {
        return { success: false, count: 0 };
    }
}

export async function markPatientNotificationRead(id: number) {
    const session = await getPatientSession();
    if (!session) return { success: false };

    try {
        const db = getTenantPrisma(session.organization_id);
        // Verify notification belongs to this patient
        const notif = await db.notification.findFirst({
            where: { id, user_id: session.id },
        });
        if (!notif) return { success: false };

        await db.notification.update({
            where: { id },
            data: { is_read: true },
        });
        return { success: true };
    } catch (error) {
        console.error('Mark Patient Notification Read Error:', error);
        return { success: false };
    }
}

export async function markAllPatientNotificationsRead() {
    const session = await getPatientSession();
    if (!session) return { success: false };

    try {
        const db = getTenantPrisma(session.organization_id);
        await db.notification.updateMany({
            where: { user_id: session.id, is_read: false },
            data: { is_read: true },
        });
        return { success: true };
    } catch (error) {
        console.error('Mark All Patient Notifications Read Error:', error);
        return { success: false };
    }
}
