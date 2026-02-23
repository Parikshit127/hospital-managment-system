'use server';

import { prisma } from '@/app/lib/db';

// Get dashboard overview stats
export async function getDashboardStats() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalPatientsToday,
            totalPatientsAll,
            activeAdmissions,
            pendingLabOrders,
            completedLabToday,
            totalRevenue,
            pendingDischarges,
            appointmentsToday,
        ] = await Promise.all([
            prisma.oPD_REG.count({
                where: { created_at: { gte: today } }
            }),
            prisma.oPD_REG.count(),
            prisma.admissions.count({
                where: { status: 'Admitted' }
            }),
            prisma.lab_orders.count({
                where: { status: 'Pending' }
            }),
            prisma.lab_orders.count({
                where: { status: 'Completed', created_at: { gte: today } }
            }),
            prisma.billing_records.aggregate({
                _sum: { net_amount: true },
                where: { payment_status: 'Paid' }
            }),
            prisma.admissions.count({
                where: { status: 'Admitted' }
            }),
            prisma.appointments.count({
                where: { appointment_date: { gte: today } }
            })
        ]);

        return {
            success: true,
            data: {
                totalPatientsToday,
                totalPatientsAll,
                activeAdmissions,
                pendingLabOrders,
                completedLabToday,
                totalRevenue: totalRevenue._sum.net_amount || 0,
                pendingDischarges,
                appointmentsToday,
            }
        };
    } catch (error: any) {
        console.error('getDashboardStats error:', error);
        return { success: false, error: error.message };
    }
}

// Get bed occupancy stats
export async function getBedOccupancy() {
    try {
        const [total, occupied, available, maintenance, wardBeds] = await Promise.all([
            prisma.beds.count(),
            prisma.beds.count({ where: { status: 'Occupied' } }),
            prisma.beds.count({ where: { status: 'Available' } }),
            prisma.beds.count({ where: { status: 'Maintenance' } }),
            prisma.beds.findMany({
                select: { status: true, wards: { select: { ward_name: true, ward_type: true } } }
            }),
        ]);

        // Group by ward
        const wardMap: Record<string, { total: number; occupied: number; available: number; wardType: string }> = {};
        for (const bed of wardBeds) {
            const wardName = bed.wards?.ward_name || 'Unassigned';
            if (!wardMap[wardName]) {
                wardMap[wardName] = { total: 0, occupied: 0, available: 0, wardType: bed.wards?.ward_type || 'General' };
            }
            wardMap[wardName].total++;
            if (bed.status === 'Occupied') wardMap[wardName].occupied++;
            else if (bed.status === 'Available') wardMap[wardName].available++;
        }

        return {
            success: true,
            data: {
                total,
                occupied,
                available,
                maintenance,
                occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
                byWard: Object.entries(wardMap).map(([name, stats]) => ({
                    wardName: name,
                    ...stats,
                    occupancyRate: stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0
                }))
            }
        };
    } catch (error: any) {
        console.error('getBedOccupancy error:', error);
        return { success: false, error: error.message };
    }
}

// Get department-wise revenue breakdown
export async function getRevenueBreakdown() {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [byDeptRaw, byTypeRaw, totalAgg, recentRecords] = await Promise.all([
            prisma.billing_records.groupBy({
                by: ['department'],
                _sum: { net_amount: true },
                where: { payment_status: 'Paid' },
            }),
            prisma.billing_records.groupBy({
                by: ['bill_type'],
                _sum: { net_amount: true },
                where: { payment_status: 'Paid' },
            }),
            prisma.billing_records.aggregate({
                _sum: { net_amount: true },
                where: { payment_status: 'Paid' },
            }),
            prisma.billing_records.findMany({
                where: { payment_status: 'Paid', created_at: { gte: sevenDaysAgo } },
                select: { created_at: true, net_amount: true },
                orderBy: { created_at: 'asc' },
            }),
        ]);

        const dailyRevenue: Record<string, number> = {};
        for (const r of recentRecords) {
            const day = r.created_at.toLocaleDateString('en-IN', { weekday: 'short' });
            dailyRevenue[day] = (dailyRevenue[day] || 0) + r.net_amount;
        }

        return {
            success: true,
            data: {
                totalRevenue: totalAgg._sum.net_amount || 0,
                byDepartment: byDeptRaw.map(r => ({ name: r.department || 'General', amount: r._sum.net_amount || 0 })),
                byBillType: byTypeRaw.map(r => ({ name: r.bill_type, amount: r._sum.net_amount || 0 })),
                dailyTrend: Object.entries(dailyRevenue).map(([day, amount]) => ({ day, amount })),
            }
        };
    } catch (error: any) {
        console.error('getRevenueBreakdown error:', error);
        return { success: false, error: error.message };
    }
}

// Get recent activity / audit log
export async function getRecentActivity(limit: number = 20) {
    try {
        const logs = await prisma.system_audit_logs.findMany({
            orderBy: { created_at: 'desc' },
            take: limit
        });

        return { success: true, data: logs };
    } catch (error: any) {
        console.error('getRecentActivity error:', error);
        return { success: false, error: error.message };
    }
}

// Get patient flow data (registrations per day for the last 7 days)
export async function getPatientFlow() {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const patients = await prisma.oPD_REG.findMany({
            where: { created_at: { gte: sevenDaysAgo } },
            select: { created_at: true },
            orderBy: { created_at: 'asc' },
        });

        const dailyCount: Record<string, number> = {};
        for (const p of patients) {
            const day = p.created_at.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
            dailyCount[day] = (dailyCount[day] || 0) + 1;
        }

        return {
            success: true,
            data: Object.entries(dailyCount).map(([day, count]) => ({ day, count }))
        };
    } catch (error: any) {
        console.error('getPatientFlow error:', error);
        return { success: false, error: error.message };
    }
}

// Get pharmacy inventory alerts (low stock + expiring)
export async function getInventoryAlerts() {
    try {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const [lowStock, expiringSoon] = await Promise.all([
            prisma.pharmacy_batch_inventory.findMany({
                where: { current_stock: { lte: 10 } },
                include: { medicine: true },
                take: 10,
            }),
            prisma.pharmacy_batch_inventory.findMany({
                where: { expiry_date: { lte: thirtyDaysFromNow } },
                include: { medicine: true },
                take: 10,
            }),
        ]);

        return {
            success: true,
            data: {
                lowStock: lowStock.map((item: any) => ({
                    medicine: item.medicine?.brand_name || 'Unknown',
                    stock: item.current_stock,
                    batchNo: item.batch_no
                })),
                expiringSoon: expiringSoon.map((item: any) => ({
                    medicine: item.medicine?.brand_name || 'Unknown',
                    expiryDate: item.expiry_date,
                    batchNo: item.batch_no
                }))
            }
        };
    } catch (error: any) {
        console.error('getInventoryAlerts error:', error);
        return { success: false, error: error.message };
    }
}
