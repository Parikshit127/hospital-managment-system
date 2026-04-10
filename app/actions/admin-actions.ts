"use server";

import { requireTenantContext } from "@/backend/tenant";
import { addUserSchema, updateUserSchema } from "@/app/lib/validations";
import * as bcrypt from "bcryptjs";

// Get dashboard overview stats
export async function getDashboardStats() {
  try {
    const { db } = await requireTenantContext();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalPatientsToday,
      totalPatientsAll,
      activeAdmissions,
      pendingLabOrders,
      completedLabToday,
      totalRevenue,
      appointmentsToday,
    ] = await Promise.all([
      db.oPD_REG.count({
        where: { created_at: { gte: today } },
      }),
      db.oPD_REG.count(),
      db.admissions.count({
        where: { status: "Admitted" },
      }),
      db.lab_orders.count({
        where: { status: "Pending" },
      }),
      db.lab_orders.count({
        where: { status: "Completed", created_at: { gte: today } },
      }),
      db.billing_records.aggregate({
        _sum: { net_amount: true },
        where: { payment_status: "Paid" },
      }),
      db.appointments.count({
        where: { appointment_date: { gte: today } },
      }),
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
        pendingDischarges: activeAdmissions,
        appointmentsToday,
      },
    };
  } catch (error: any) {
    console.error("getDashboardStats error:", error);
    return { success: false, error: error.message };
  }
}

// Get bed occupancy stats
export async function getBedOccupancy() {
  try {
    const { db } = await requireTenantContext();

    // Single query — fetch all beds with ward info, process in-memory
    const allBeds = await db.beds.findMany({
      select: {
        status: true,
        wards: { select: { ward_name: true, ward_type: true } },
      },
    });

    let total = 0, occupied = 0, available = 0, maintenance = 0;
    const wardMap: Record<
      string,
      { total: number; occupied: number; available: number; wardType: string }
    > = {};

    for (const bed of allBeds) {
      total++;
      if (bed.status === "Occupied") occupied++;
      else if (bed.status === "Available") available++;
      else if (bed.status === "Maintenance") maintenance++;

      const wardName = bed.wards?.ward_name || "Unassigned";
      if (!wardMap[wardName]) {
        wardMap[wardName] = {
          total: 0,
          occupied: 0,
          available: 0,
          wardType: bed.wards?.ward_type || "General",
        };
      }
      wardMap[wardName].total++;
      if (bed.status === "Occupied") wardMap[wardName].occupied++;
      else if (bed.status === "Available") wardMap[wardName].available++;
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
          occupancyRate:
            stats.total > 0
              ? Math.round((stats.occupied / stats.total) * 100)
              : 0,
        })),
      },
    };
  } catch (error: any) {
    console.error("getBedOccupancy error:", error);
    return { success: false, error: error.message };
  }
}

// Get department-wise revenue breakdown
export async function getRevenueBreakdown() {
  try {
    const { db } = await requireTenantContext();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [byDeptRaw, byTypeRaw, totalAgg, dailyTrendRaw] = await Promise.all([
      db.billing_records.groupBy({
        by: ["department"],
        _sum: { net_amount: true },
        where: { payment_status: "Paid" },
      }),
      db.billing_records.groupBy({
        by: ["bill_type"],
        _sum: { net_amount: true },
        where: { payment_status: "Paid" },
      }),
      db.billing_records.aggregate({
        _sum: { net_amount: true },
        where: { payment_status: "Paid" },
      }),
      // Aggregate daily revenue in DB instead of fetching all rows
      db.$queryRaw<{ day: Date; total: number }[]>`
        SELECT DATE("created_at") as day, SUM("net_amount")::float as total
        FROM "billing_records"
        WHERE "payment_status" = 'Paid' AND "created_at" >= ${sevenDaysAgo}
        GROUP BY DATE("created_at")
        ORDER BY day ASC
      `,
    ]);

    const dailyRevenue: Record<string, number> = {};
    for (const r of dailyTrendRaw) {
      const day = new Date(r.day).toLocaleDateString("en-IN", {
        weekday: "short",
      });
      dailyRevenue[day] = (dailyRevenue[day] || 0) + r.total;
    }

    return {
      success: true,
      data: {
        totalRevenue: totalAgg._sum.net_amount || 0,
        byDepartment: byDeptRaw.map((r: any) => ({
          name: r.department || "General",
          amount: r._sum.net_amount || 0,
        })),
        byBillType: byTypeRaw.map((r: any) => ({
          name: r.bill_type,
          amount: r._sum.net_amount || 0,
        })),
        dailyTrend: Object.entries(dailyRevenue).map(([day, amount]) => ({
          day,
          amount,
        })),
      },
    };
  } catch (error: any) {
    console.error("getRevenueBreakdown error:", error);
    return { success: false, error: error.message };
  }
}

// Get recent activity / audit log
export async function getRecentActivity(limit: number = 20) {
  try {
    const { db } = await requireTenantContext();

    const logs = await db.system_audit_logs.findMany({
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return { success: true, data: logs };
  } catch (error: any) {
    console.error("getRecentActivity error:", error);
    return { success: false, error: error.message };
  }
}

// Get patient flow data (registrations per day for the last 7 days)
export async function getPatientFlow() {
  try {
    const { db } = await requireTenantContext();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Use raw count query grouped by date instead of fetching all rows
    const patients = await db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT DATE("created_at") as day, COUNT(*)::bigint as count
      FROM "OPD_REG"
      WHERE "created_at" >= ${sevenDaysAgo}
      GROUP BY DATE("created_at")
      ORDER BY day ASC
    `;

    return {
      success: true,
      data: patients.map((p: { day: Date; count: bigint }) => ({
        day: new Date(p.day).toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
        }),
        count: Number(p.count),
      })),
    };
  } catch (error: any) {
    console.error("getPatientFlow error:", error);
    return { success: false, error: error.message };
  }
}

export async function getAdminPatientList(options?: {
  search?: string;
  department?: string;
  bloodGroup?: string;
  date?: string;
  dateRange?: "today" | "week" | "month" | "all";
  page?: number;
  limit?: number;
}) {
  try {
    const { db } = await requireTenantContext();

    const page = options?.page || 1;
    const limit = options?.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options?.search?.trim()) {
      const search = options.search.trim();
      where.OR = [
        { full_name: { contains: search, mode: "insensitive" } },
        { patient_id: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    if (options?.department) {
      where.department = options.department;
    }

    if (options?.bloodGroup) {
      where.blood_group = options.bloodGroup;
    }

    if (options?.date) {
      const selectedDate = new Date(`${options.date}T00:00:00`);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      where.created_at = { gte: selectedDate, lte: endOfDay };
    } else if (options?.dateRange && options.dateRange !== "all") {
      const now = new Date();
      let from: Date;
      if (options.dateRange === "today") {
        from = new Date(now.setHours(0, 0, 0, 0));
      } else if (options.dateRange === "week") {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      where.created_at = { gte: from };
    }

    const [patients, total] = await Promise.all([
      db.oPD_REG.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        include: {
          appointments: {
            orderBy: { appointment_date: "desc" },
            take: 5,
          },
          admissions: {
            orderBy: { admission_date: "desc" },
            take: 1,
          },
        },
      }),
      db.oPD_REG.count({ where }),
    ]);

    const data = patients.map((patient: any) => {
      const latestAppointment = patient.appointments?.[0] || null;
      const activeAdmission =
        patient.admissions?.find((a: any) => a.status === "Admitted") || null;
      const inConsult = patient.appointments?.some((a: any) =>
        ["Checked In", "In Progress"].includes(a.status),
      );

      let patientState = "Registered";
      if (activeAdmission) patientState = "Admitted";
      else if (inConsult) patientState = "In Consult";
      else if (latestAppointment) patientState = "Appointment";

      const createdAt = new Date(patient.created_at);
      const today = new Date();
      const isNew =
        createdAt.getDate() === today.getDate() &&
        createdAt.getMonth() === today.getMonth() &&
        createdAt.getFullYear() === today.getFullYear();

      return {
        ...patient,
        patientState,
        recency: isNew ? "New" : "Old",
        assignedDoctor:
          latestAppointment?.doctor_name ||
          activeAdmission?.doctor_name ||
          null,
        latestAppointmentStatus: latestAppointment?.status || null,
        latestAppointmentId: latestAppointment?.appointment_id || null,
        latestAppointmentDate: latestAppointment?.appointment_date || null,
        activeAdmissionId: activeAdmission?.admission_id || null,
        activeAdmissionDate: activeAdmission?.admission_date || null,
      };
    });

    return {
      success: true,
      data,
      total,
      totalPages: Math.ceil(total / limit),
      page,
    };
  } catch (error: any) {
    console.error("getAdminPatientList error:", error);
    return {
      success: false,
      data: [],
      total: 0,
      totalPages: 0,
      page: 1,
      error: error.message,
    };
  }
}

// Get pharmacy inventory alerts (low stock + expiring)
export async function getInventoryAlerts() {
  try {
    const { db } = await requireTenantContext();

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [lowStock, expiringSoon] = await Promise.all([
      db.pharmacy_batch_inventory.findMany({
        where: { current_stock: { lte: 10 } },
        include: { medicine: true },
        take: 10,
      }),
      db.pharmacy_batch_inventory.findMany({
        where: { expiry_date: { lte: thirtyDaysFromNow } },
        include: { medicine: true },
        take: 10,
      }),
    ]);

    return {
      success: true,
      data: {
        lowStock: lowStock.map((item: any) => ({
          medicine: item.medicine?.brand_name || "Unknown",
          stock: item.current_stock,
          batchNo: item.batch_no,
        })),
        expiringSoon: expiringSoon.map((item: any) => ({
          medicine: item.medicine?.brand_name || "Unknown",
          expiryDate: item.expiry_date,
          batchNo: item.batch_no,
        })),
      },
    };
  } catch (error: any) {
    console.error("getInventoryAlerts error:", error);
    return { success: false, error: error.message };
  }
}

// ========================================
// STAFF MANAGEMENT ACTIONS
// ========================================

// Get paginated staff list with filters
export async function getUsersList(options?: {
  search?: string;
  role?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}) {
  try {
    const { db } = await requireTenantContext();

    const page = options?.page || 1;
    const limit = options?.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options?.role) {
      where.role = options.role;
    }
    if (options?.is_active !== undefined) {
      where.is_active = options.is_active;
    }
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { username: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          specialty: true,
          email: true,
          phone: true,
          is_active: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    return {
      success: true,
      data: {
        users,
        total,
        totalPages: Math.ceil(total / limit),
        page,
      },
    };
  } catch (error: any) {
    console.error("getUsersList error:", error);
    return { success: false, error: error.message };
  }
}

// Get staff stats for KPI cards
export async function getStaffStats() {
  try {
    const { db } = await requireTenantContext();

    const [total, active, inactive, byRole] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { is_active: true } }),
      db.user.count({ where: { is_active: false } }),
      db.user.groupBy({ by: ["role"], _count: true }),
    ]);

    const doctors = byRole.find((r: any) => r.role === "doctor")?._count || 0;

    return {
      success: true,
      data: {
        total,
        active,
        inactive,
        doctors,
        byRole: byRole.map((r: any) => ({ role: r.role, count: r._count })),
      },
    };
  } catch (error: any) {
    console.error("getStaffStats error:", error);
    return { success: false, error: error.message };
  }
}

// Add a new staff member
export async function addUser(data: {
  username: string;
  password: string;
  name: string;
  role: string;
  specialty?: string;
  email?: string;
  phone?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();

    // Validate input with Zod
    const validationResult = addUserSchema.safeParse(data);
    if (!validationResult.success) {
      return { success: false, error: validationResult.error.issues?.[0]?.message || "Validation failed" };
    }
    const validated = validationResult.data;

    const existing = await db.user.findUnique({
      where: { username: validated.username },
    });
    if (existing) {
      return { success: false, error: "Username already exists" };
    }

    const hashedPassword = await bcrypt.hash(validated.password, 10);

    const user = await db.user.create({
      data: {
        username: validated.username,
        password: hashedPassword,
        name: validated.name,
        role: validated.role,
        specialty:
          validated.role === "doctor" ? validated.specialty || null : null,
        email: validated.email || null,
        phone: validated.phone || null,
        organizationId,
        is_active: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        specialty: true,
        email: true,
        phone: true,
        is_active: true,
      },
    });

    await db.system_audit_logs.create({
      data: {
        user_id: user.id,
        username: validated.username,
        role: validated.role,
        action: "CREATE_USER",
        module: "admin",
        details: `Created user ${validated.name} with role ${validated.role}`,
        organizationId,
      },
    });

    return { success: true, data: user };
  } catch (error: any) {
    console.error("addUser error:", error);
    return { success: false, error: error.message };
  }
}

// Update staff member details
export async function updateUser(
  userId: string,
  data: {
    name?: string;
    role?: string;
    specialty?: string;
    email?: string;
    phone?: string;
    is_active?: boolean;
  },
) {
  try {
    const { db, organizationId } = await requireTenantContext();

    // Validate input with Zod (partial validation for update)
    const validated = updateUserSchema.parse(data);

    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.role !== undefined) updateData.role = validated.role;
    if (validated.specialty !== undefined)
      updateData.specialty = validated.specialty;
    if (validated.email !== undefined) updateData.email = validated.email;
    if (validated.phone !== undefined) updateData.phone = validated.phone;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    // Clear specialty if role is not doctor
    if (validated.role && validated.role !== "doctor") {
      updateData.specialty = null;
    }

    const user = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        specialty: true,
        email: true,
        phone: true,
        is_active: true,
      },
    });

    await db.system_audit_logs.create({
      data: {
        user_id: userId,
        username: user.username,
        role: user.role,
        action: "UPDATE_USER",
        module: "admin",
        details: `Updated user ${user.name}: ${JSON.stringify(data)}`,
        organizationId,
      },
    });

    return { success: true, data: user };
  } catch (error: any) {
    console.error("updateUser error:", error);
    return { success: false, error: error.message };
  }
}

// Reset a staff member's password
export async function resetUserPassword(userId: string, newPassword: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    if (!newPassword || newPassword.length < 6) {
      return {
        success: false,
        error: "Password must be at least 6 characters",
      };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
      select: { id: true, username: true, name: true, role: true },
    });

    await db.system_audit_logs.create({
      data: {
        user_id: userId,
        username: user.username,
        role: user.role,
        action: "RESET_PASSWORD",
        module: "admin",
        details: `Password reset for user ${user.name}`,
        organizationId,
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("resetUserPassword error:", error);
    return { success: false, error: error.message };
  }
}

// Toggle user active status
export async function toggleUserActive(userId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        is_active: true,
      },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { is_active: !user.is_active },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        is_active: true,
      },
    });

    await db.system_audit_logs.create({
      data: {
        user_id: userId,
        username: user.username,
        role: user.role,
        action: updated.is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        module: "admin",
        details: `${updated.is_active ? "Activated" : "Deactivated"} user ${user.name}`,
        organizationId,
      },
    });

    return { success: true, data: updated };
  } catch (error: any) {
    console.error("toggleUserActive error:", error);
    return { success: false, error: error.message };
  }
}

// ============================================
// PHASE 2.1: Admin Settings / Departments / Reports
// ============================================

export async function getDepartments() {
  try {
    const { db } = await requireTenantContext();
    const depts = await db.department.findMany({
      orderBy: { name: "asc" },
    });
    return { success: true, data: depts };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createDepartment(data: {
  name: string;
  description?: string;
  head_doctor_id?: string;
  base_consultation_fee: number;
  is_active?: boolean;
}) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    const dept = await db.department.create({
      data: {
        ...data,
        organizationId,
      },
    });

    await db.system_audit_logs.create({
      data: {
        action: "CREATE_DEPARTMENT",
        module: "admin",
        details: `Created department: ${data.name}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: dept };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateDepartment(id: number, data: any) {
  try {
    const { db } = await requireTenantContext();
    const dept = await db.department.update({
      where: { id },
      data,
    });
    return { success: true, data: dept };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getOrganizationSettings() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const config = await db.organizationConfig.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
    return { success: true, data: config };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateOrganizationSettings(data: any) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const config = await db.organizationConfig.update({
      where: { organizationId },
      data,
    });
    return { success: true, data: config };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getOrganizationBranding() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const branding = await db.organizationBranding.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
    return { success: true, data: branding };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateOrganizationBranding(data: any) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const brand = await db.organizationBranding.update({
      where: { organizationId },
      data,
    });
    return { success: true, data: brand };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Get patient stats for admin patient list header
export async function getAdminPatientStats() {
  try {
    const { db } = await requireTenantContext();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [totalPatients, admittedNow, appointmentsToday, newThisMonth] =
      await Promise.all([
        db.oPD_REG.count(),
        db.admissions.count({ where: { status: "Admitted" } }),
        db.appointments.count({
          where: { appointment_date: { gte: today } },
        }),
        db.oPD_REG.count({
          where: { created_at: { gte: monthStart } },
        }),
      ]);

    return {
      success: true,
      data: { totalPatients, admittedNow, appointmentsToday, newThisMonth },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Get comprehensive patient details for admin detail view
export async function getAdminPatientFullDetails(patientId: string) {
  try {
    const { db } = await requireTenantContext();

    const [
      patient,
      appointments,
      admissions,
      clinicalEHRs,
      labOrders,
      pharmacyOrders,
      vitalSigns,
      insurancePolicies,
      invoices,
      patientDeposits,
      patientFeedbacks,
      followUps,
      pillReminders,
    ] = await Promise.all([
      db.oPD_REG.findUnique({ where: { patient_id: patientId } }),

      db.appointments.findMany({
        where: { patient_id: patientId },
        orderBy: { appointment_date: "desc" },
      }),

      db.admissions.findMany({
        where: { patient_id: patientId },
        orderBy: { admission_date: "desc" },
        include: {
          bed: { include: { wards: true } },
          ward: true,
          medical_notes: { orderBy: { created_at: "desc" } },
          summaries: { orderBy: { created_at: "desc" } },
          invoices: { include: { items: true, payments: true } },
          insurance_claims: {
            include: { policy: { include: { provider: true } } },
          },
          bed_transfers: { orderBy: { created_at: "desc" } },
          diet_plans: { orderBy: { created_at: "desc" } },
          ward_rounds: { orderBy: { created_at: "desc" } },
          nursing_tasks: { orderBy: { scheduled_at: "desc" } },
        },
      }),

      db.clinical_EHR.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),

      db.lab_orders.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),

      db.pharmacy_orders.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
        include: { items: true },
      }),

      db.vital_signs.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),

      db.insurance_policies.findMany({
        where: { patient_id: patientId },
        include: { provider: true, claims: true },
      }),

      db.invoices.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
        include: { items: true, payments: true },
      }),

      db.patientDeposit.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),

      db.patientFeedback.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),

      db.followUp.findMany({
        where: { patient_id: patientId },
        orderBy: { scheduled_date: "desc" },
      }),

      db.pillReminder.findMany({
        where: { patient_id: patientId },
        orderBy: { created_at: "desc" },
      }),
    ]);

    if (!patient) {
      return { success: false, error: "Patient not found" };
    }

    const totalInvoiceAmount = invoices.reduce(
      (sum: number, inv: any) => sum + Number(inv.net_amount || 0),
      0,
    );
    const totalPaidAmount = invoices.reduce(
      (sum: number, inv: any) => sum + Number(inv.paid_amount || 0),
      0,
    );
    const totalBalanceDue = invoices.reduce(
      (sum: number, inv: any) => sum + Number(inv.balance_due || 0),
      0,
    );
    const totalDeposits = patientDeposits.reduce(
      (sum: number, d: any) => sum + Number(d.amount || 0),
      0,
    );
    const activeAdmission =
      admissions.find((a: any) => a.status === "Admitted") || null;

    return {
      success: true,
      data: {
        patient,
        appointments,
        admissions,
        clinicalEHRs,
        labOrders,
        pharmacyOrders,
        vitalSigns,
        insurancePolicies,
        invoices,
        patientDeposits,
        patientFeedbacks,
        followUps,
        pillReminders,
        summary: {
          totalAppointments: appointments.length,
          totalAdmissions: admissions.length,
          totalLabOrders: labOrders.length,
          criticalLabOrders: labOrders.filter((l: any) => l.is_critical).length,
          totalPrescriptions: pharmacyOrders.length,
          totalInvoiceAmount,
          totalPaidAmount,
          totalBalanceDue,
          totalDeposits,
          activeAdmission: !!activeAdmission,
        },
      },
    };
  } catch (error: any) {
    console.error("getAdminPatientFullDetails error:", error);
    return { success: false, error: error.message };
  }
}

export async function generateAdminReport(
  type: string,
  dateRange: { start: string; end: string },
) {
  try {
    const { db } = await requireTenantContext();
    const startDate = new Date(dateRange.start);
    let endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999);

    let data: any = {};

    if (type === "revenue") {
      const invoices = await db.invoices.findMany({
        where: { created_at: { gte: startDate, lte: endDate }, status: "Paid" },
        select: { net_amount: true, invoice_type: true, created_at: true },
      });
      // Basic aggregation logic here to pass back chart-ready data.
      data = invoices;
    } else if (type === "footfall") {
      const appointments = await db.appointments.findMany({
        where: { appointment_date: { gte: startDate, lte: endDate } },
        select: { department: true, appointment_date: true },
      });
      data = appointments;
    } else if (type === "staff_activity") {
      const logs = await db.system_audit_logs.findMany({
        where: { created_at: { gte: startDate, lte: endDate } },
        select: { username: true, action: true, created_at: true },
      });
      data = logs;
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
