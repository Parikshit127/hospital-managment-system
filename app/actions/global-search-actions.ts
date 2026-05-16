'use server';

import { requireTenantContext } from '@/backend/tenant';

export interface GlobalPatientResult {
  patient_id: string;
  full_name: string;
  phone: string | null;
  department: string | null;
  age: string | null;
  gender: string | null;
  last_visit: string | null; // ISO string of last appointment date, or null
}

// Roles allowed to use global patient search.
const ALLOWED_ROLES = new Set([
  'admin',
  'receptionist',
  'doctor',
  'nurse',
  'ipd_manager',
  'finance',
  'opd_manager',
]);

export async function globalSearchPatients(query: string): Promise<{
  success: boolean;
  data: GlobalPatientResult[];
  error?: string;
}> {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return { success: true, data: [] };
    }

    const { db, organizationId, session } = await requireTenantContext();

    if (!ALLOWED_ROLES.has(session.role)) {
      return { success: false, data: [], error: 'Not authorized' };
    }

    const patients = await db.oPD_REG.findMany({
      where: {
        organizationId,
        is_archived: false,
        OR: [
          { full_name: { contains: trimmed, mode: 'insensitive' } },
          { phone: { contains: trimmed } },
          { patient_id: { contains: trimmed, mode: 'insensitive' } },
          { abha_number: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: {
        patient_id: true,
        full_name: true,
        phone: true,
        department: true,
        age: true,
        gender: true,
        appointments: {
          select: { appointment_date: true },
          orderBy: { appointment_date: 'desc' },
          take: 1,
        },
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    const results: GlobalPatientResult[] = patients.map((p: {
      patient_id: string;
      full_name: string;
      phone: string | null;
      department: string | null;
      age: string | null;
      gender: string | null;
      appointments: { appointment_date: Date }[];
    }) => ({
      patient_id: p.patient_id,
      full_name: p.full_name,
      phone: p.phone,
      department: p.department,
      age: p.age,
      gender: p.gender,
      last_visit: p.appointments[0]?.appointment_date
        ? new Date(p.appointments[0].appointment_date).toISOString()
        : null,
    }));

    return { success: true, data: results };
  } catch (error: any) {
    console.error('globalSearchPatients error:', error);
    return { success: false, data: [], error: error?.message ?? 'Search failed' };
  }
}

// Maps a role to the best route for viewing a patient.
export async function getPatientRouteForRole(
  role: string,
  patientId: string,
): Promise<string> {
  switch (role) {
    case 'receptionist':
      return `/reception/patient/${patientId}`;
    case 'doctor':
      return `/doctor/patient/${patientId}`;
    case 'nurse':
      return `/ipd/admissions-hub?q=${encodeURIComponent(patientId)}`;
    case 'ipd_manager':
      return `/ipd/admissions-hub?q=${encodeURIComponent(patientId)}`;
    case 'finance':
      return `/finance/invoices?patient=${encodeURIComponent(patientId)}`;
    case 'opd_manager':
      return `/opd-manager/appointments?patient=${encodeURIComponent(patientId)}`;
    case 'admin':
    default:
      return `/admin/patients?q=${encodeURIComponent(patientId)}`;
  }
}
