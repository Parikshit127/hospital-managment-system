'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function getDoctorLeaves(filters?: { doctorId?: string; from?: string; to?: string }) {
  const { db, organizationId } = await requireTenantContext();
  const where: any = { organizationId };
  if (filters?.doctorId) where.doctor_id = filters.doctorId;
  if (filters?.from) where.from_date = { gte: new Date(filters.from) };
  const leaves = await (db as any).doctorLeave.findMany({
    where,
    orderBy: { from_date: 'desc' },
    take: 100,
  });
  return { success: true, data: leaves };
}

export async function createDoctorLeave(data: {
  doctorId: string;
  doctorName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason?: string;
}) {
  const { db, organizationId } = await requireTenantContext();
  const leave = await (db as any).doctorLeave.create({
    data: {
      organizationId,
      doctor_id: data.doctorId,
      doctor_name: data.doctorName,
      leave_type: data.leaveType,
      from_date: new Date(data.fromDate),
      to_date: new Date(data.toDate),
      reason: data.reason || null,
    },
  });
  revalidatePath('/admin/doctor-leave');
  return { success: true, data: leave };
}

export async function deleteDoctorLeave(id: string) {
  const { db, organizationId } = await requireTenantContext();
  await (db as any).doctorLeave.delete({ where: { id } });
  revalidatePath('/admin/doctor-leave');
  return { success: true };
}

export async function isDoctorOnLeave(doctorId: string, date: Date): Promise<boolean> {
  const { db, organizationId } = await requireTenantContext();
  const leave = await (db as any).doctorLeave.findFirst({
    where: {
      organizationId,
      doctor_id: doctorId,
      from_date: { lte: date },
      to_date: { gte: date },
    },
  });
  return !!leave;
}
