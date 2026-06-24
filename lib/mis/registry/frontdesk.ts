/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/backend/db';
import { ReportDefinition, ReportCategory, ValidatedFilters } from '../types';

// ── Timezone-safe date boundary helpers ─────────────────────────────────
// Problem: new Date('2026-06-15') parses as 2026-06-15T00:00:00.000Z (UTC midnight).
// For IST (+05:30) deployments this is actually 05:30 IST — so any invoices /
// appointments created from 00:00:00 to 05:29:59 IST (which are BEFORE midnight UTC)
// are missed by the date_start bound, and anything after 00:00:00Z on the NEXT day
// is excluded by date_end. This produces near-empty exports for single-day reports.
//
// Fix: expand bare YYYY-MM-DD strings to T00:00:00.000Z / T23:59:59.999Z explicitly.
// ISO datetime strings that already carry a T component are left unchanged so that
// drill-down calls (which already pass correct ISO strings) are not double-offset.
const toStartOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T00:00:00.000Z') : new Date(d as string);
const toEndOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T23:59:59.999Z') : new Date(d as string);

export const preRegistrationReport: ReportDefinition = {
  id: 'frontdesk-pre-registration',
  category: ReportCategory.Registration,
  name: 'Registration - Pre Registration',
  description: 'Fetch patients who were pre-registered (e.g., via web portal, app, or call center) before arriving at the hospital.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    source: z.string().optional(),
  }),
  columns: [
    { key: 'pre_reg_date', label: 'Pre-Reg Date', type: 'date' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'mobile_number', label: 'Mobile Number', type: 'string' },
    { key: 'source', label: 'Source', type: 'string' },
    { key: 'expected_arrival', label: 'Expected Arrival', type: 'date' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
  defaultSort: { column: 'pre_reg_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.registration.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, source } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(created_at) as "pre_reg_date",
        name as "patient_name",
        phone as "mobile_number",
        source as "source",
        DATE(follow_up_date) as "expected_arrival",
        status as "status"
      FROM "CRMLead"
      WHERE "organizationId" = ${orgId}
        AND created_at >= ${toStartOfDay(date_start)}
        AND created_at <= ${toEndOfDay(date_end)}
        ${source ? Prisma.sql`AND source = ${source}` : Prisma.empty}
      ORDER BY created_at DESC
    `;

    return { rows, totals: {} };
  },
};

export const registrationConvertReport: ReportDefinition = {
  id: 'frontdesk-registration-convert',
  category: ReportCategory.Registration,
  name: 'Registration - Registration Convert Report',
  description: 'Track pre-registrations or inquiries that were successfully converted into full hospital registrations (UHID generated).',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'conversion_date', label: 'Conversion Date', type: 'date' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'pre_reg_id', label: 'Pre-Reg ID', type: 'string' },
    { key: 'new_uhid', label: 'New UHID', type: 'string' },
    { key: 'converted_by', label: 'Converted By', type: 'string' },
  ],
  defaultSort: { column: 'conversion_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.registration.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(c.converted_at) as "conversion_date",
        c.name as "patient_name",
        c.lead_number as "pre_reg_id",
        c.patient_id as "new_uhid",
        COALESCE(u.name, c.assigned_to, 'System') as "converted_by"
      FROM "CRMLead" c
      LEFT JOIN "users" u ON c.assigned_to = u.id
      WHERE c."organizationId" = ${orgId}
        AND c.converted_at IS NOT NULL
        AND c.converted_at >= ${toStartOfDay(date_start)}
        AND c.converted_at <= ${toEndOfDay(date_end)}
      ORDER BY c.converted_at DESC
    `;

    return { rows, totals: {} };
  },
};

export const registrationReport: ReportDefinition = {
  id: 'frontdesk-registration-report',
  category: ReportCategory.Registration,
  name: 'Registration - Registration Report',
  description: 'Fetch the standard list of all completed, definitive patient registrations within the period.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    user_id: z.string().optional(),
  }),
  columns: [
    { key: 'registration_date', label: 'Registration Date', type: 'date' },
    { key: 'uhid', label: 'UHID', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'age', label: 'Age', type: 'string' },
    { key: 'gender', label: 'Gender', type: 'string' },
    { key: 'mobile_number', label: 'Mobile Number', type: 'string' },
    { key: 'registered_by', label: 'Registered By', type: 'string' },
  ],
  defaultSort: { column: 'registration_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.registration.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, user_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(o.created_at) as "registration_date",
        o.patient_id as "uhid",
        o.full_name as "patient_name",
        o.age as "age",
        o.gender as "gender",
        o.phone as "mobile_number",
        COALESCE(u.name, o.employee_id, 'System') as "registered_by"
      FROM "OPD_REG" o
      LEFT JOIN "users" u ON o.employee_id = u.id
      WHERE o."organizationId" = ${orgId}
        AND o.created_at >= ${toStartOfDay(date_start)}
        AND o.created_at <= ${toEndOfDay(date_end)}
        ${user_id ? Prisma.sql`AND o.employee_id = ${user_id}` : Prisma.empty}
      ORDER BY o.created_at DESC
    `;

    return { rows, totals: {} };
  },
};

export const appointmentReport: ReportDefinition = {
  id: 'frontdesk-appointment-report',
  category: ReportCategory.Appointment,
  name: 'Appointment - Appointment Reports',
  description: 'Fetch a detailed list of all patient appointments.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    doctor_id: z.string().optional(),
    status: z.string().optional(),
  }),
  filterSpec: {
    showDoctor: true,
    showStatus: true,
    statusOptions: ['Pending', 'Scheduled', 'COMPLETED', 'NO_SHOW', 'Cancelled'],
  },
  columns: [
    { key: 'appointment_date', label: 'Appointment Date', type: 'date' },
    { key: 'appointment_time', label: 'Time', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'doctor_name', label: 'Doctor Name', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'status', label: 'Appointment Status', type: 'string' },
  ],
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, doctor_id, status } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(a.appointment_date) as "appointment_date",
        TO_CHAR(a.appointment_date, 'HH24:MI') as "appointment_time",
        p.full_name as "patient_name",
        a.doctor_name as "doctor_name",
        a.department as "department",
        a.status as "status"
      FROM "appointments" a
      LEFT JOIN "OPD_REG" p ON a.patient_id = p.patient_id
      WHERE a."organizationId" = ${orgId}
        AND a.appointment_date >= ${toStartOfDay(date_start)}
        AND a.appointment_date <= ${toEndOfDay(date_end)}
        ${doctor_id ? Prisma.sql`AND a.doctor_id = ${doctor_id}` : Prisma.empty}
        ${status ? Prisma.sql`AND a.status = ${status}` : Prisma.empty}
      ORDER BY a.appointment_date DESC
    `;

    return { rows, totals: {} };
  },
};

export const doctorEventOffReport: ReportDefinition = {
  id: 'frontdesk-doctor-event-off',
  category: ReportCategory.Appointment,
  name: 'Appointment - Doctor Event Off Schedule',
  description: 'Fetch records of doctors who took time off, cancelled their schedules, or blocked their calendars.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    doctor_id: z.string().optional(),
  }),
  filterSpec: { showDoctor: true },
  columns: [
    { key: 'event_date', label: 'Date', type: 'date' },
    { key: 'doctor_name', label: 'Doctor Name', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'event_type', label: 'Leave/Block Type', type: 'string' },
    { key: 'reason', label: 'Reason', type: 'string' },
  ],
  defaultSort: { column: 'event_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, doctor_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(e.from_date) as "event_date",
        e.doctor_name as "doctor_name",
        d.department as "department",
        e.leave_type as "event_type",
        e.reason as "reason"
      FROM "DoctorLeave" e
      LEFT JOIN "users" d ON e.doctor_id = d.id
      WHERE e."organizationId" = ${orgId}
        AND e.from_date >= ${toStartOfDay(date_start)}
        AND e.from_date <= ${toEndOfDay(date_end)}
        ${doctor_id ? Prisma.sql`AND e.doctor_id = ${doctor_id}` : Prisma.empty}
      ORDER BY e.from_date DESC
    `;

    return { rows, totals: {} };
  },
};

export const doctorEventOffSummaryReport: ReportDefinition = {
  id: 'frontdesk-doctor-event-off-summary',
  category: ReportCategory.Appointment,
  name: 'Appointment - Doctor Event Off Summary',
  description: 'Aggregate the total hours or days blocked by doctors within the period.',
  // Hidden Bug #2 FIX: Removed filterSpec: { showDepartment: true } and department_id Zod field.
  // Root cause: users.department is a free-text String column (e.g. "Cardiology"), NOT a FK.
  // MISFilterEngine sends a department UUID from the departments table. Comparing a UUID
  // against a department name string would never produce a match — the filter was silently
  // non-functional. Since there is no clean way to join to a proper department ID from
  // DoctorLeave without a schema change, we remove the filter rather than ship broken UX.
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'doctor_name', label: 'Doctor Name', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'total_events', label: 'Total Events', type: 'number' },
    { key: 'total_hours', label: 'Total Hours Blocked', type: 'number' },
  ],
  defaultSort: { column: 'total_events', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        e.doctor_name as "doctor_name",
        d.department as "department",
        COUNT(e.id) as "total_events",
        SUM(EXTRACT(EPOCH FROM (e.to_date - e.from_date))/3600) as "total_hours"
      FROM "DoctorLeave" e
      LEFT JOIN "users" d ON e.doctor_id = d.id
      WHERE e."organizationId" = ${orgId}
        AND e.from_date >= ${toStartOfDay(date_start)}
        AND e.from_date <= ${toEndOfDay(date_end)}
      GROUP BY e.doctor_name, d.department
      ORDER BY "total_events" DESC
    `;

    return {
      rows: rows.map(r => ({
        ...r,
        total_events: Number(r.total_events || 0),
        total_hours: Number(r.total_hours || 0)
      })),
      totals: {}
    };
  },
};

export const appointmentTatReport: ReportDefinition = {
  id: 'frontdesk-appointment-tat',
  category: ReportCategory.Appointment,
  name: 'Appointment - Appointment TAT Reports',
  description: 'Calculate the Turnaround Time (TAT) from patient check-in to consultation completion.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'appointment_date', label: 'Date', type: 'date' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'doctor_name', label: 'Doctor', type: 'string' },
    { key: 'checkin_time', label: 'Check-in Time', type: 'string' },
    { key: 'consultation_start', label: 'Consultation Start Time', type: 'string' },
    { key: 'wait_time', label: 'Wait Time (Minutes)', type: 'number' },
    { key: 'consultation_duration', label: 'Consultation Duration (Minutes)', type: 'number' },
  ],
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(a.appointment_date) as "appointment_date",
        p.full_name as "patient_name",
        a.doctor_name as "doctor_name",
        TO_CHAR(a.checked_in_at, 'HH24:MI:SS') as "checkin_time",
        TO_CHAR(a.called_at, 'HH24:MI:SS') as "consultation_start",
        EXTRACT(EPOCH FROM (a.called_at - a.checked_in_at))/60 as "wait_time",
        EXTRACT(EPOCH FROM (ce.signed_at - a.called_at))/60 as "consultation_duration"
      FROM "appointments" a
      LEFT JOIN "OPD_REG" p ON a.patient_id = p.patient_id
      LEFT JOIN "clinical_encounters" ce ON ce.appointment_id = a.appointment_id
      WHERE a."organizationId" = ${orgId}
        AND a.appointment_date >= ${toStartOfDay(date_start)}
        AND a.appointment_date <= ${toEndOfDay(date_end)}
        AND a.checked_in_at IS NOT NULL
      ORDER BY a.appointment_date DESC
    `;

    return {
      rows: rows.map(r => ({
        ...r,
        wait_time: Number(r.wait_time || 0),
        consultation_duration: Number(r.consultation_duration || 0)
      })),
      totals: {}
    };
  },
};

export const doctorFootfallReport: ReportDefinition = {
  id: 'frontdesk-doctor-footfall',
  category: ReportCategory.Appointment,
  name: 'Appointment - Doctor Wise Footfall Report',
  description: 'Aggregate the total number of patients seen (footfall) grouped by doctor and department.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'doctor_name', label: 'Doctor Name', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'total_appointments', label: 'Total Appointments', type: 'number' },
    { key: 'completed_consultations', label: 'Completed Consultations', type: 'number' },
    { key: 'no_shows', label: 'No Shows', type: 'number' },
  ],
  defaultSort: { column: 'total_appointments', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        a.doctor_name as "doctor_name",
        a.department as "department",
        COUNT(a.id) as "total_appointments",
        SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) as "completed_consultations",
        SUM(CASE WHEN a.status = 'NO_SHOW' THEN 1 ELSE 0 END) as "no_shows"
      FROM "appointments" a
      WHERE a."organizationId" = ${orgId}
        AND a.appointment_date >= ${toStartOfDay(date_start)}
        AND a.appointment_date <= ${toEndOfDay(date_end)}
      GROUP BY a.doctor_name, a.department
      ORDER BY "total_appointments" DESC
    `;

    return {
      rows: rows.map(r => ({
        ...r,
        total_appointments: Number(r.total_appointments || 0),
        completed_consultations: Number(r.completed_consultations || 0),
        no_shows: Number(r.no_shows || 0)
      })),
      totals: {}
    };
  },
};

// ─── Batch 8: Admission Reports (SN 65–69) ─────────────────────────────────

export const ipPatientReport: ReportDefinition = {
  id: 'frontdesk-ip-patient',
  category: ReportCategory.Admission,
  name: 'Admission Report - IP Patient',
  description: 'Fetch a list of patients currently admitted or admitted during the period.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    ward_id: z.string().optional(),
  }),
  // D4 Directive: showWard added — filtering by ward is the primary use-case for this report.
  filterSpec: { showWard: true },
  columns: [
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'uhid', label: 'UHID', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'ward_bed', label: 'Ward / Bed', type: 'string' },
    { key: 'admitting_doctor', label: 'Admitting Doctor', type: 'string' },
  ],
  defaultSort: { column: 'admission_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, ward_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(adm.admission_date) as "admission_date",
        adm.admission_id as "ip_number",
        adm.patient_id as "uhid",
        p.full_name as "patient_name",
        COALESCE(w.ward_name, 'Unassigned') || '/' || COALESCE(b.bed_id, 'N/A') as "ward_bed",
        COALESCE(adm.doctor_name, 'Unassigned') as "admitting_doctor"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      LEFT JOIN "wards" w ON adm.ward_id = w.ward_id
      LEFT JOIN "beds" b ON adm.bed_id = b.bed_id
      WHERE adm."organizationId" = ${orgId}
        AND adm.admission_date >= ${toStartOfDay(date_start)}
        AND adm.admission_date <= ${toEndOfDay(date_end)}
        ${ward_id ? Prisma.sql`AND adm.ward_id = ${parseInt(ward_id)}` : Prisma.empty}
      ORDER BY adm.admission_date DESC
    `;

    return { rows, totals: {} };
  },
};

export const ipConversionReport: ReportDefinition = {
  id: 'frontdesk-ip-conversion',
  category: ReportCategory.Admission,
  name: 'Admission Report - IP Admission Conversion',
  description: 'Track patients who were recommended for admission from OPD and actually got admitted.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'recommendation_date', label: 'Recommendation Date', type: 'date' },
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'opd_doctor', label: 'OPD Doctor', type: 'string' },
    { key: 'admitting_doctor', label: 'Admitting Doctor', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
  defaultSort: { column: 'recommendation_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(ab.expected_date) as "recommendation_date",
        DATE(adm.admission_date) as "admission_date",
        p.full_name as "patient_name",
        COALESCE(ab.doctor_name, 'Unassigned') as "opd_doctor",
        COALESCE(adm.doctor_name, ab.doctor_name, 'Unassigned') as "admitting_doctor",
        CASE WHEN adm.admission_id IS NOT NULL THEN 'Admitted' ELSE ab.status END as "status"
      FROM "AdmissionBooking" ab
      LEFT JOIN "OPD_REG" p ON ab.patient_id = p.patient_id
      LEFT JOIN "admissions" adm ON adm.patient_id = ab.patient_id 
             AND DATE(adm.admission_date) >= DATE(ab.expected_date) - INTERVAL '7 days'
             AND DATE(adm.admission_date) <= DATE(ab.expected_date) + INTERVAL '14 days'
      WHERE ab."organizationId" = ${orgId}
        AND ab.created_at >= ${toStartOfDay(date_start)}
        AND ab.created_at <= ${toEndOfDay(date_end)}
      ORDER BY ab.expected_date DESC
    `;

    return { rows, totals: {} };
  },
};

export const ipCancelReport: ReportDefinition = {
  id: 'frontdesk-ip-cancel',
  category: ReportCategory.Admission,
  name: 'Admission Report - IP Admission Cancel',
  description: 'Fetch all IPD admission bookings that were cancelled.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'cancel_date', label: 'Cancel Date', type: 'date' },
    { key: 'ip_number', label: 'IP / Booking Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'cancellation_reason', label: 'Reason for Cancellation', type: 'string' },
    { key: 'cancelled_by', label: 'Cancelled By', type: 'string' },
  ],
  defaultSort: { column: 'cancel_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(ab.created_at) as "cancel_date",
        ab.booking_number as "ip_number",
        p.full_name as "patient_name",
        COALESCE(ab.notes, 'N/A') as "cancellation_reason",
        COALESCE(ab.doctor_name, 'System') as "cancelled_by"
      FROM "AdmissionBooking" ab
      LEFT JOIN "OPD_REG" p ON ab.patient_id = p.patient_id
      WHERE ab."organizationId" = ${orgId}
        AND ab.status = 'Cancelled'
        AND ab.created_at >= ${toStartOfDay(date_start)}
        AND ab.created_at <= ${toEndOfDay(date_end)}
      ORDER BY ab.created_at DESC
    `;

    return { rows, totals: {} };
  },
};

export const ipDischargeReport: ReportDefinition = {
  id: 'frontdesk-ip-discharge',
  category: ReportCategory.Admission,
  name: 'Admission Report - IP Discharge',
  description: 'Fetch a list of discharged patients with length of stay and discharge type.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    discharge_type: z.string().optional(),
  }),
  // D4 Directive: showStatus added — discharge_type (Normal | LAMA | DAMA | Absconded | Death | Transfer)
  // maps naturally to a status dropdown in the filter engine.
  filterSpec: {
    showStatus: true,
    statusOptions: ['Normal', 'LAMA', 'DAMA', 'Absconded', 'Death', 'Transfer'],
  },
  columns: [
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'discharge_date', label: 'Discharge Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'length_of_stay', label: 'Length of Stay (Days)', type: 'number' },
    { key: 'discharge_type', label: 'Discharge Type', type: 'string' },
  ],
  defaultSort: { column: 'discharge_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, discharge_type } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(adm.admission_date) as "admission_date",
        DATE(adm.discharge_date) as "discharge_date",
        adm.admission_id as "ip_number",
        p.full_name as "patient_name",
        EXTRACT(DAY FROM (adm.discharge_date - adm.admission_date)) as "length_of_stay",
        COALESCE(adm.discharge_type, 'Normal') as "discharge_type"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      WHERE adm."organizationId" = ${orgId}
        AND adm.discharge_date IS NOT NULL
        AND adm.discharge_date >= ${toStartOfDay(date_start)}
        AND adm.discharge_date <= ${toEndOfDay(date_end)}
        ${discharge_type ? Prisma.sql`AND adm.discharge_type = ${discharge_type}` : Prisma.empty}
      ORDER BY adm.discharge_date DESC
    `;

    return {
      rows: rows.map(r => ({
        ...r,
        length_of_stay: Number(r.length_of_stay || 0),
      })),
      totals: {}
    };
  },
};

export const erToIpConversionReport: ReportDefinition = {
  id: 'frontdesk-er-to-ip-conversion',
  category: ReportCategory.Admission,
  name: 'Admission Report - Admission Conversion (ER to IP)',
  description: 'Track patients who entered through the Emergency Room (ER) and were subsequently admitted to IPD.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'er_arrival_date', label: 'ER Arrival Date', type: 'date' },
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'er_doctor', label: 'ER Doctor', type: 'string' },
    { key: 'admitting_doctor', label: 'Admitting Doctor', type: 'string' },
  ],
  defaultSort: { column: 'admission_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(adm.admission_date) as "er_arrival_date",
        DATE(adm.admission_date) as "admission_date",
        p.full_name as "patient_name",
        COALESCE(adm.doctor_name, 'Unassigned') as "er_doctor",
        COALESCE(doc.name, adm.doctor_name, 'Unassigned') as "admitting_doctor"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      LEFT JOIN "users" doc ON adm.attending_doctor_id = doc.id
      WHERE adm."organizationId" = ${orgId}
        AND adm.admission_source = 'Emergency'
        AND adm.admission_date >= ${toStartOfDay(date_start)}
        AND adm.admission_date <= ${toEndOfDay(date_end)}
      ORDER BY adm.admission_date DESC
    `;

    return { rows, totals: {} };
  },
};

// ─── Batch 9: Admissions — Bed Management (SN 70–74) ────────────────────────

export const bedStatusReport: ReportDefinition = {
  id: 'frontdesk-bed-status',
  category: ReportCategory.Admission,
  name: 'Admission Report - Bed Status',
  description: 'Current status of all beds across wards — Available, Occupied, Under Maintenance, etc.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    ward_id: z.string().optional(),
  }),
  // D4 Directive: showWard added — bed status is most actionable when scoped to a single ward.
  filterSpec: { showWard: true },
  columns: [
    { key: 'bed_id', label: 'Bed ID', type: 'string' },
    { key: 'bed_name', label: 'Bed Name', type: 'string' },
    { key: 'ward_name', label: 'Ward', type: 'string' },
    { key: 'ward_type', label: 'Ward Type', type: 'string' },
    { key: 'bed_status', label: 'Status', type: 'string' },
    { key: 'bed_category', label: 'Category', type: 'string' },
    { key: 'is_isolation', label: 'Isolation', type: 'string' },
  ],
  defaultSort: { column: 'ward_name', direction: 'asc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { ward_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        b.bed_id as "bed_id",
        COALESCE(b.bed_name, b.bed_id) as "bed_name",
        w.ward_name as "ward_name",
        w.ward_type as "ward_type",
        COALESCE(b.status, 'Available') as "bed_status",
        COALESCE(b.bed_category, 'General') as "bed_category",
        CASE WHEN b.is_isolation THEN 'Yes' ELSE 'No' END as "is_isolation"
      FROM "beds" b
      LEFT JOIN "wards" w ON b.ward_id = w.ward_id
      WHERE b."organizationId" = ${orgId}
        ${ward_id ? Prisma.sql`AND b.ward_id = ${parseInt(ward_id)}` : Prisma.empty}
      ORDER BY w.ward_name, b.bed_id
    `;

    return { rows, totals: {} };
  },
};

export const admissionsListReport: ReportDefinition = {
  id: 'frontdesk-admissions-list',
  category: ReportCategory.Admission,
  name: 'Admission Report - Admissions',
  description: 'Detailed list of all admissions within the date range with ward, bed, doctor, and diagnosis.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
    ward_id: z.string().optional(),
  }),
  // D4 Directive: showWard added — ward filtering is the primary drill-down for admissions list.
  filterSpec: { showWard: true },
  columns: [
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'uhid', label: 'UHID', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'admission_type', label: 'Admission Type', type: 'string' },
    { key: 'admitting_doctor', label: 'Admitting Doctor', type: 'string' },
    { key: 'ward', label: 'Ward', type: 'string' },
    { key: 'bed', label: 'Bed', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'diagnosis', label: 'Diagnosis', type: 'string' },
  ],
  defaultSort: { column: 'admission_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end, ward_id } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(adm.admission_date) as "admission_date",
        adm.admission_id as "ip_number",
        adm.patient_id as "uhid",
        p.full_name as "patient_name",
        COALESCE(adm.admission_category, adm.admission_type, 'Regular') as "admission_type",
        COALESCE(adm.doctor_name, 'Unassigned') as "admitting_doctor",
        w.ward_name as "ward",
        COALESCE(b.bed_name, adm.bed_id, 'N/A') as "bed",
        adm.status as "status",
        adm.diagnosis as "diagnosis"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      LEFT JOIN "wards" w ON adm.ward_id = w.ward_id
      LEFT JOIN "beds" b ON adm.bed_id = b.bed_id
      WHERE adm."organizationId" = ${orgId}
        AND adm.admission_date >= ${toStartOfDay(date_start)}
        AND adm.admission_date <= ${toEndOfDay(date_end)}
        ${ward_id ? Prisma.sql`AND adm.ward_id = ${parseInt(ward_id)}` : Prisma.empty}
      ORDER BY adm.admission_date DESC
    `;

    return { rows, totals: {} };
  },
};

export const emergencyAdmissionsReport: ReportDefinition = {
  id: 'frontdesk-emergency-admissions',
  category: ReportCategory.Admission,
  name: 'Admission Report - Emergency Admissions',
  description: 'List of all patients admitted through the Emergency Room / ER pathway.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  // Hidden Bug #1 FIX: Removed filterSpec: { showDepartment: true }.
  // Root cause: admissions table has NO department column (verified in Prisma schema).
  // The department dropdown was rendered by MISFilterEngine but there was no Zod field
  // for department_id and no WHERE clause predicate — it was completely non-functional.
  // The admission_source = 'Emergency' predicate is the correct filter for this report.

  columns: [
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'admitting_doctor', label: 'Admitting Doctor', type: 'string' },
    { key: 'admission_source', label: 'Source', type: 'string' },
    { key: 'ward', label: 'Ward', type: 'string' },
    { key: 'diagnosis', label: 'Diagnosis', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
  defaultSort: { column: 'admission_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(adm.admission_date) as "admission_date",
        adm.admission_id as "ip_number",
        p.full_name as "patient_name",
        COALESCE(adm.doctor_name, 'Unassigned') as "admitting_doctor",
        COALESCE(adm.admission_source, 'Emergency') as "admission_source",
        w.ward_name as "ward",
        adm.diagnosis as "diagnosis",
        adm.status as "status"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      LEFT JOIN "wards" w ON adm.ward_id = w.ward_id
      WHERE adm."organizationId" = ${orgId}
        AND (adm.admission_source = 'Emergency' OR adm.admission_category = 'Emergency')
        AND adm.admission_date >= ${toStartOfDay(date_start)}
        AND adm.admission_date <= ${toEndOfDay(date_end)}
      ORDER BY adm.admission_date DESC
    `;

    return { rows, totals: {} };
  },
};

export const bedOccupancyReport: ReportDefinition = {
  id: 'frontdesk-bed-occupancy',
  category: ReportCategory.Admission,
  name: 'Admission Report - Bed Occupancy Details',
  description: 'Ward-wise bed occupancy summary showing total, occupied, available beds and occupancy percentage.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'ward_name', label: 'Ward', type: 'string' },
    { key: 'ward_type', label: 'Ward Type', type: 'string' },
    { key: 'total_beds', label: 'Total Beds', type: 'number' },
    { key: 'occupied_beds', label: 'Occupied', type: 'number' },
    { key: 'available_beds', label: 'Available', type: 'number' },
    { key: 'occupancy_rate', label: 'Occupancy %', type: 'percent' },
  ],
  defaultSort: { column: 'occupancy_rate', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        w.ward_name as "ward_name",
        w.ward_type as "ward_type",
        COUNT(b.bed_id) as "total_beds",
        SUM(CASE WHEN b.status = 'Occupied' THEN 1 ELSE 0 END) as "occupied_beds",
        SUM(CASE WHEN b.status = 'Available' THEN 1 ELSE 0 END) as "available_beds",
        ROUND(SUM(CASE WHEN b.status = 'Occupied' THEN 1 ELSE 0 END)::numeric * 100.0 / NULLIF(COUNT(b.bed_id), 0), 1) as "occupancy_rate"
      FROM "beds" b
      LEFT JOIN "wards" w ON b.ward_id = w.ward_id
      WHERE b."organizationId" = ${orgId}
      GROUP BY w.ward_name, w.ward_type
      ORDER BY "occupancy_rate" DESC
    `;

    return {
      rows: rows.map(r => ({
        ...r,
        total_beds: Number(r.total_beds || 0),
        occupied_beds: Number(r.occupied_beds || 0),
        available_beds: Number(r.available_beds || 0),
        occupancy_rate: Number(r.occupancy_rate || 0),
      })),
      totals: {}
    };
  },
};

export const emergencyDischargeReport: ReportDefinition = {
  id: 'frontdesk-emergency-discharge',
  category: ReportCategory.Admission,
  name: 'Admission Report - Emergency Discharge',
  description: 'List of patients discharged who were originally admitted through Emergency.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'discharge_date', label: 'Discharge Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'doctor_name', label: 'Doctor', type: 'string' },
    { key: 'length_of_stay', label: 'LOS (Days)', type: 'number' },
    { key: 'discharge_type', label: 'Discharge Type', type: 'string' },
  ],
  defaultSort: { column: 'discharge_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(adm.admission_date) as "admission_date",
        DATE(adm.discharge_date) as "discharge_date",
        adm.admission_id as "ip_number",
        p.full_name as "patient_name",
        COALESCE(adm.doctor_name, 'Unassigned') as "doctor_name",
        EXTRACT(DAY FROM (adm.discharge_date - adm.admission_date)) as "length_of_stay",
        COALESCE(adm.discharge_type, 'Normal') as "discharge_type"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      WHERE adm."organizationId" = ${orgId}
        AND (adm.admission_source = 'Emergency' OR adm.admission_category = 'Emergency')
        AND adm.discharge_date IS NOT NULL
        AND adm.discharge_date >= ${toStartOfDay(date_start)}
        AND adm.discharge_date <= ${toEndOfDay(date_end)}
      ORDER BY adm.discharge_date DESC
    `;

    return {
      rows: rows.map(r => ({
        ...r,
        length_of_stay: Number(r.length_of_stay || 0),
      })),
      totals: {}
    };
  },
};

// ─── Batch 10: Admissions — Transfers & TAT (SN 75–79) ──────────────────────

export const bedTransferReport: ReportDefinition = {
  id: 'frontdesk-bed-transfer',
  category: ReportCategory.Admission,
  name: 'Admission Report - Bed Transfer',
  description: 'Log of bed transfers during the patient stay, showing from and to beds and the reason.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'transfer_date', label: 'Transfer Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'from_bed', label: 'From Bed', type: 'string' },
    { key: 'to_bed', label: 'To Bed', type: 'string' },
    { key: 'transfer_reason', label: 'Reason', type: 'string' },
    { key: 'transferred_by', label: 'Transferred By', type: 'string' },
  ],
  defaultSort: { column: 'transfer_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Schema truth: BedTransfer model (L2025) — fields: admission_id, from_bed_id, to_bed_id, reason, transferred_by.
    // from_bed_id and to_bed_id are String? (bed_id FK), not Int.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(bt.created_at) as "transfer_date",
        bt.admission_id as "ip_number",
        p.full_name as "patient_name",
        COALESCE(fb.bed_name, bt.from_bed_id, 'N/A') as "from_bed",
        COALESCE(tb.bed_name, bt.to_bed_id, 'N/A') as "to_bed",
        COALESCE(bt.reason, 'N/A') as "transfer_reason",
        COALESCE(bt.transferred_by, 'System') as "transferred_by"
      FROM "bed_transfers" bt
      LEFT JOIN "admissions" adm ON bt.admission_id = adm.admission_id
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      LEFT JOIN "beds" fb ON bt.from_bed_id = fb.bed_id
      LEFT JOIN "beds" tb ON bt.to_bed_id = tb.bed_id
      WHERE bt."organizationId" = ${orgId}
        AND bt.created_at >= ${toStartOfDay(date_start)}
        AND bt.created_at <= ${toEndOfDay(date_end)}
      ORDER BY bt.created_at DESC
    `;

    return { rows, totals: {} };
  },
};

export const doctorTransferReport: ReportDefinition = {
  id: 'frontdesk-doctor-transfer',
  category: ReportCategory.Admission,
  name: 'Admission Report - Doctor Transfer',
  description: 'Log of patients whose current attending doctor differs from their original admitting doctor.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'admission_date', label: 'Admission Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'admitting_doctor', label: 'Original Admitting Doctor', type: 'string' },
    { key: 'attending_doctor', label: 'Current Attending Doctor', type: 'string' },
    { key: 'ward', label: 'Ward', type: 'string' },
  ],
  defaultSort: { column: 'admission_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    // BUG FIX (D4 Directive): The previous implementation was missing date_start / date_end
    // filters entirely in the WHERE clause. The filters object was destructured but the
    // date parameters were never applied, causing the query to return ALL records across
    // all time regardless of the date range selected by the user.
    //
    // Fix: Extract date_start and date_end from filters and apply them as date range
    // predicates on adm.admission_date.
    const { date_start, date_end } = filters;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(adm.admission_date) as "admission_date",
        adm.admission_id as "ip_number",
        p.full_name as "patient_name",
        COALESCE(adm.doctor_name, 'Unassigned') as "admitting_doctor",
        COALESCE(doc.name, 'Unassigned') as "attending_doctor",
        w.ward_name as "ward"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      LEFT JOIN "users" doc ON adm.attending_doctor_id = doc.id
      LEFT JOIN "wards" w ON adm.ward_id = w.ward_id
      WHERE adm."organizationId" = ${orgId}
        AND adm.admission_date >= ${toStartOfDay(date_start)}
        AND adm.admission_date <= ${toEndOfDay(date_end)}
        AND adm.doctor_name IS NOT NULL 
        AND doc.name IS NOT NULL
        AND adm.doctor_name != doc.name
      ORDER BY adm.admission_date DESC
    `;

    return { rows, totals: {} };
  },
};

export const expiredPatientsReport: ReportDefinition = {
  id: 'frontdesk-expired-patients',
  category: ReportCategory.Admission,
  name: 'Admission Report - Expired Patients',
  description: 'Details of patients who expired during their admission period.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'death_date', label: 'Date of Expiry', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'diagnosis', label: 'Diagnosis', type: 'string' },
    { key: 'attending_doctor', label: 'Attending Doctor', type: 'string' },
    { key: 'length_of_stay', label: 'LOS (Days)', type: 'number' },
  ],
  defaultSort: { column: 'death_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Schema truth: admissions.is_death (Boolean, L1004), discharge_type (String?, L1033)
    // We match on is_death = true OR discharge_type = 'Death' OR status = 'Expired'
    // for broad compatibility (different workflows may set different flags).
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(adm.discharge_date) as "death_date",
        adm.admission_id as "ip_number",
        p.full_name as "patient_name",
        adm.diagnosis as "diagnosis",
        COALESCE(doc.name, adm.doctor_name, 'Unassigned') as "attending_doctor",
        EXTRACT(DAY FROM (adm.discharge_date - adm.admission_date)) as "length_of_stay"
      FROM "admissions" adm
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      LEFT JOIN "users" doc ON adm.attending_doctor_id = doc.id
      WHERE adm."organizationId" = ${orgId}
        AND (adm.is_death = true OR adm.discharge_type = 'Expired' OR adm.status = 'Expired')
        AND adm.discharge_date >= ${toStartOfDay(date_start)}
        AND adm.discharge_date <= ${toEndOfDay(date_end)}
      ORDER BY adm.discharge_date DESC
    `;

    return {
      rows: rows.map(r => ({
        ...r,
        length_of_stay: Number(r.length_of_stay || 0),
      })),
      totals: {}
    };
  },
};

export const counsellingSummaryReport: ReportDefinition = {
  id: 'frontdesk-counselling-summary',
  category: ReportCategory.Admission,
  name: 'Admission Report - Counselling Summary',
  description: 'Log of all admission and financial counselling sessions conducted with patients.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  // D4 Directive: showStatus added — session_type (General, Financial, Pre-Surgery, Discharge,
  // Psychological) and status (Requested, Draft, Confirmed, Completed, Cancelled) are key
  // filters for counselling managers.
  filterSpec: {
    showStatus: true,
    statusOptions: ['Requested', 'Draft', 'Confirmed', 'Completed', 'Cancelled'],
  },
  columns: [
    { key: 'counselling_date', label: 'Counselling Date', type: 'date' },
    { key: 'session_number', label: 'Session Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'counsellor_name', label: 'Counsellor', type: 'string' },
    { key: 'session_type', label: 'Session Type', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'outcome', label: 'Outcome', type: 'string' },
  ],
  defaultSort: { column: 'counselling_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Schema truth: CounsellingSession model (L4742) — confirmed exists.
    // Fields: session_number, patient_id, counsellor_name, session_type, status, outcome.
    // session_type default is 'General' (L4749) but report should return ALL types.
    // Joined to OPD_REG for patient name (patient_id is a String FK to OPD_REG.patient_id).
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(c.created_at) as "counselling_date",
        c.session_number as "session_number",
        p.full_name as "patient_name",
        c.counsellor_name as "counsellor_name",
        c.session_type as "session_type",
        c.status as "status",
        c.outcome as "outcome"
      FROM "CounsellingSession" c
      LEFT JOIN "OPD_REG" p ON c.patient_id = p.patient_id
      WHERE c."organizationId" = ${orgId}
        AND c.created_at >= ${toStartOfDay(date_start)}
        AND c.created_at <= ${toEndOfDay(date_end)}
      ORDER BY c.created_at DESC
    `;

    return { rows, totals: {} };
  },
};

export const dischargeTatReport: ReportDefinition = {
  id: 'frontdesk-discharge-tat',
  category: ReportCategory.Admission,
  name: 'Admission Report - Discharge TAT Report',
  description: 'Turn-Around-Time report tracking the clearance status (Pharmacy, Lab, Finance, Nursing) for discharges.',
  filters: z.object({
    date_start: z.string().or(z.date()),
    date_end: z.string().or(z.date()),
  }),
  columns: [
    { key: 'discharge_initiation_date', label: 'Initiation Date', type: 'date' },
    { key: 'ip_number', label: 'IP Number', type: 'string' },
    { key: 'patient_name', label: 'Patient Name', type: 'string' },
    { key: 'pharmacy_clearance', label: 'Pharmacy', type: 'string' },
    { key: 'lab_clearance', label: 'Lab', type: 'string' },
    { key: 'finance_clearance', label: 'Finance', type: 'string' },
    { key: 'nursing_clearance', label: 'Nursing', type: 'string' },
    { key: 'doctor_clearance', label: 'Doctor', type: 'string' },
    { key: 'status', label: 'Overall Status', type: 'string' },
  ],
  defaultSort: { column: 'discharge_initiation_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.frontdesk.view',
  queryFn: async (filters: ValidatedFilters, orgId: string) => {
    const { date_start, date_end } = filters;
    // Schema truth: DischargeClearance model (L4694) — fields: pharmacy, lab, finance,
    // nursing, doctor (all String with Pending/Cleared/Waived values), all_cleared (Boolean).
    // There is no direct admission_id FK on DischargeClearance to admissions via @relation,
    // but admission_id (String) is stored and can be used for JOIN.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(dc.created_at) as "discharge_initiation_date",
        adm.admission_id as "ip_number",
        p.full_name as "patient_name",
        dc.pharmacy as "pharmacy_clearance",
        dc.lab as "lab_clearance",
        dc.finance as "finance_clearance",
        dc.nursing as "nursing_clearance",
        dc.doctor as "doctor_clearance",
        CASE WHEN dc.all_cleared THEN 'Cleared' ELSE 'Pending' END as "status"
      FROM "DischargeClearance" dc
      LEFT JOIN "admissions" adm ON dc.admission_id = adm.admission_id
      LEFT JOIN "OPD_REG" p ON adm.patient_id = p.patient_id
      WHERE dc."organizationId" = ${orgId}
        AND dc.created_at >= ${toStartOfDay(date_start)}
        AND dc.created_at <= ${toEndOfDay(date_end)}
      ORDER BY dc.created_at DESC
    `;

    return { rows, totals: {} };
  },
};
