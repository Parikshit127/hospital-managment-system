'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// ========================================
// GET NOTIFICATIONS
// ========================================

export async function getNotifications(userId: string, options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
}) {
    try {
        const { db } = await requireTenantContext();

        const where: any = { user_id: userId };
        if (options?.unreadOnly) where.is_read = false;

        const [data, total, unreadCount] = await Promise.all([
            db.notification.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: options?.limit || 50,
                skip: options?.offset || 0,
            }),
            db.notification.count({ where: { user_id: userId } }),
            db.notification.count({ where: { user_id: userId, is_read: false } }),
        ]);

        return { success: true, data, total, unreadCount };
    } catch (error) {
        console.error('Get Notifications Error:', error);
        return { success: false, data: [], total: 0, unreadCount: 0 };
    }
}

export async function getUnreadCount(userId: string) {
    try {
        const { db } = await requireTenantContext();
        const count = await db.notification.count({
            where: { user_id: userId, is_read: false },
        });
        return { success: true, count };
    } catch (error) {
        return { success: false, count: 0 };
    }
}

// ========================================
// MARK AS READ
// ========================================

export async function markNotificationRead(id: number) {
    try {
        const { db } = await requireTenantContext();
        await db.notification.update({
            where: { id },
            data: { is_read: true },
        });
        return { success: true };
    } catch (error) {
        console.error('Mark Read Error:', error);
        return { success: false };
    }
}

export async function markAllNotificationsRead(userId: string) {
    try {
        const { db } = await requireTenantContext();
        await db.notification.updateMany({
            where: { user_id: userId, is_read: false },
            data: { is_read: true },
        });
        revalidatePath('/notifications');
        return { success: true };
    } catch (error) {
        console.error('Mark All Read Error:', error);
        return { success: false };
    }
}

// ========================================
// CREATE NOTIFICATION (internal helper)
// ========================================

export async function createNotification(data: {
    userId: string;
    title: string;
    body: string;
    type?: string;
    link?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        await db.notification.create({
            data: {
                user_id: data.userId,
                title: data.title,
                body: data.body,
                type: data.type || 'info',
                link: data.link,
            },
        });
        return { success: true };
    } catch (error) {
        console.error('Create Notification Error:', error);
        return { success: false };
    }
}

// ========================================
// BULK NOTIFY (e.g., notify all doctors)
// ========================================

export async function notifyUsersByRole(role: string, data: {
    title: string;
    body: string;
    type?: string;
    link?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const users = await db.user.findMany({
            where: { role, is_active: true },
            select: { id: true },
        });

        if (users.length > 0) {
            await db.notification.createMany({
                data: users.map((u: any) => ({
                    user_id: u.id,
                    title: data.title,
                    body: data.body,
                    type: data.type || 'info',
                    link: data.link,
                })),
            });
        }

        return { success: true, notified: users.length };
    } catch (error) {
        console.error('Bulk Notify Error:', error);
        return { success: false, notified: 0 };
    }
}

export async function deleteNotification(id: number) {
    try {
        const { db } = await requireTenantContext();
        await db.notification.delete({ where: { id } });
        return { success: true };
    } catch (error) {
        console.error('Delete Notification Error:', error);
        return { success: false };
    }
}
