'use server';

import { requireTenantContext } from '@/backend/tenant';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';

const createDoctorSchema = z.object({
  name: z.string().min(2).max(200),
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
  specialty: z.string().min(1),
  doctor_registration_no: z.string().optional(),
  qualifications: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  consultation_fee: z.number().nonnegative(),
  follow_up_fee: z.number().nonnegative(),
  working_hours: z.string().default('09:00-17:00'),
  slot_duration: z.number().int().positive().default(20),
  is_active: z.boolean().default(true),
});

const updateDoctorSchema = createDoctorSchema.partial().extend({
  password: z.string().min(8).max(100).optional(),
});

function assertAdmin(session: { role: string }) {
  if (session.role !== 'admin') throw new Error('Admin only');
}

export async function listDoctors(opts?: {
  search?: string;
  specialty?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { db } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = { role: 'doctor' };
    if (opts?.search?.trim()) {
      where.OR = [
        { name: { contains: opts.search, mode: 'insensitive' } },
        { username: { contains: opts.search, mode: 'insensitive' } },
        { specialty: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    if (opts?.specialty) where.specialty = opts.specialty;
    const [doctors, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          username: true,
          specialty: true,
          doctor_registration_no: true,
          email: true,
          phone: true,
          consultation_fee: true,
          follow_up_fee: true,
          working_hours: true,
          slot_duration: true,
          is_active: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ]);
    return {
      success: true,
      data: {
        doctors,
        total,
        totalPages: Math.ceil(total / limit),
        page,
      },
    };
  } catch (error: any) {
    console.error('listDoctors error:', error);
    return {
      success: false,
      error: error.message,
      data: { doctors: [], total: 0, totalPages: 0, page: 1 },
    };
  }
}

export async function createDoctor(input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    assertAdmin(session);
    const data = createDoctorSchema.parse(input);
    const dup = await db.user.findUnique({ where: { username: data.username } });
    if (dup) return { success: false, error: 'Username already exists' };
    const hashed = await bcrypt.hash(data.password, 10);
    const doctor = await db.user.create({
      data: {
        name: data.name,
        username: data.username,
        password: hashed,
        role: 'doctor',
        specialty: data.specialty,
        doctor_registration_no: data.doctor_registration_no || null,
        email: data.email || null,
        phone: data.phone || null,
        consultation_fee: data.consultation_fee,
        follow_up_fee: data.follow_up_fee,
        working_hours: data.working_hours,
        slot_duration: data.slot_duration,
        is_active: data.is_active,
      },
      select: {
        id: true,
        name: true,
        specialty: true,
        consultation_fee: true,
        follow_up_fee: true,
      },
    });
    await db.system_audit_logs.create({
      data: {
        action: 'CREATE_DOCTOR',
        module: 'master-data',
        details: `Created doctor ${data.name} (${data.specialty})`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: doctor };
  } catch (error: any) {
    console.error('createDoctor error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateDoctor(id: string, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    assertAdmin(session);
    const data = updateDoctorSchema.parse(input);
    const patch: any = { ...data };
    if (data.password) {
      patch.password = await bcrypt.hash(data.password, 10);
    } else {
      delete patch.password;
    }
    if (data.email === '') patch.email = null;
    const doctor = await db.user.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        name: true,
        specialty: true,
        consultation_fee: true,
        follow_up_fee: true,
      },
    });
    await db.system_audit_logs.create({
      data: {
        action: 'UPDATE_DOCTOR',
        module: 'master-data',
        details: `Updated doctor ${id}: ${Object.keys(data).join(', ')}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: doctor };
  } catch (error: any) {
    console.error('updateDoctor error:', error);
    return { success: false, error: error.message };
  }
}

export async function deactivateDoctor(id: string) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    assertAdmin(session);
    const doctor = await db.user.update({
      where: { id },
      data: { is_active: false },
    });
    await db.system_audit_logs.create({
      data: {
        action: 'DEACTIVATE_DOCTOR',
        module: 'master-data',
        details: `Deactivated doctor ${id}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: { id: doctor.id, is_active: false } };
  } catch (error: any) {
    console.error('deactivateDoctor error:', error);
    return { success: false, error: error.message };
  }
}
