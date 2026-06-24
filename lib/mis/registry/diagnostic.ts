import { z } from 'zod';
import { prisma } from '@/backend/db';
import { ReportDefinition, ReportCategory, ValidatedFilters } from '../types';

// ── Timezone-safe date boundary helpers ─────────────────────────────────
const toStartOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T00:00:00.000Z') : new Date(d as string);
const toEndOfDay = (d: string | Date): Date =>
  typeof d === 'string' && !d.includes('T') ? new Date(d + 'T23:59:59.999Z') : new Date(d as string);

// A generic query factory for diagnostic appointments to reduce code duplication
const createDiagnosticAppointmentQuery = (departmentKeyword: string) => async (filters: ValidatedFilters, orgId: string) => {
  const { date_start, date_end } = filters;
  const rows = await prisma.$queryRaw<any[]>`
    SELECT 
      DATE(a.appointment_date) as "appointment_date",
      a.appointment_id as "appointment_id",
      p.full_name as "patient_name",
      COALESCE(a.doctor_name, 'Unassigned') as "doctor_name",
      a.department as "department",
      a.status as "status"
    FROM "appointments" a
    LEFT JOIN "OPD_REG" p ON a.patient_id = p.patient_id
    WHERE a."organizationId" = ${orgId}
      AND a.department ILIKE ${'%' + departmentKeyword + '%'}
      AND a.appointment_date >= ${toStartOfDay(date_start)}
      AND a.appointment_date <= ${toEndOfDay(date_end)}
    ORDER BY a.appointment_date DESC
  `;

  return { rows, totals: {} };
};

const diagnosticAppointmentColumns = [
  { key: 'appointment_date', label: 'Appointment Date', type: 'date' as const },
  { key: 'appointment_id', label: 'Appointment ID', type: 'string' as const },
  { key: 'patient_name', label: 'Patient Name', type: 'string' as const },
  { key: 'doctor_name', label: 'Doctor Name', type: 'string' as const },
  { key: 'department', label: 'Department', type: 'string' as const },
  { key: 'status', label: 'Status', type: 'string' as const },
];

const defaultFilters = z.object({
  date_start: z.string().or(z.date()),
  date_end: z.string().or(z.date()),
});

// ─── Batch 11: Diagnostics — Appointments (SN 33–38) ────────────────────

export const diagCardiologyAppointmentReport: ReportDefinition = {
  id: 'diagnostic-cardiology-appointment',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Cardiology Appointment',
  description: 'Details of all cardiology diagnostic appointments booked.',
  filters: defaultFilters,
  columns: diagnosticAppointmentColumns,
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticAppointmentQuery('Cardiology'),
};

export const diagNeurologyAppointmentReport: ReportDefinition = {
  id: 'diagnostic-neurology-appointment',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Neurology Appointment',
  description: 'Details of all neurology diagnostic appointments booked.',
  filters: defaultFilters,
  columns: diagnosticAppointmentColumns,
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticAppointmentQuery('Neurology'),
};

export const diagNuclearMedicineAppointmentReport: ReportDefinition = {
  id: 'diagnostic-nuclear-medicine-appointment',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Nuclear Medicine Appointment',
  description: 'Details of all nuclear medicine diagnostic appointments booked.',
  filters: defaultFilters,
  columns: diagnosticAppointmentColumns,
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticAppointmentQuery('Nuclear'),
};

export const diagPathologyAppointmentReport: ReportDefinition = {
  id: 'diagnostic-pathology-appointment',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Pathology Appointment',
  description: 'Details of all pathology diagnostic appointments booked.',
  filters: defaultFilters,
  columns: diagnosticAppointmentColumns,
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticAppointmentQuery('Pathology'),
};

export const diagPulmonologyAppointmentReport: ReportDefinition = {
  id: 'diagnostic-pulmonology-appointment',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Pulmonology Appointment',
  description: 'Details of all pulmonology diagnostic appointments booked.',
  filters: defaultFilters,
  columns: diagnosticAppointmentColumns,
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticAppointmentQuery('Pulmonology'),
};

export const diagRadiologyAppointmentReport: ReportDefinition = {
  id: 'diagnostic-radiology-appointment',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Radiology Appointment',
  description: 'Details of all radiology diagnostic appointments booked.',
  filters: defaultFilters,
  columns: diagnosticAppointmentColumns,
  defaultSort: { column: 'appointment_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticAppointmentQuery('Radiology'),
};

// ─── Batch 12: Diagnostics — Services & TAT (SN 39–45) ────────────────────

const createDiagnosticServiceQuery = (departmentKeyword: string) => async (filters: ValidatedFilters, orgId: string) => {
  const { date_start, date_end } = filters;
  const rows = await prisma.$queryRaw<any[]>`
    SELECT 
      DATE(lo.created_at) as "order_date",
      lo.barcode as "order_id",
      p.full_name as "patient_name",
      lo.test_type as "service_name",
      COALESCE(doc.name, 'Unassigned') as "doctor_name",
      lo.status as "status"
    FROM "lab_orders" lo
    LEFT JOIN "OPD_REG" p ON lo.patient_id = p.patient_id
    LEFT JOIN "users" doc ON lo.doctor_id = doc.id
    WHERE lo."organizationId" = ${orgId}
      AND lo.test_type ILIKE ${'%' + departmentKeyword + '%'}
      AND lo.created_at >= ${toStartOfDay(date_start)}
      AND lo.created_at <= ${toEndOfDay(date_end)}
    ORDER BY lo.created_at DESC
  `;
  return { rows, totals: {} };
};

const diagnosticServiceColumns = [
  { key: 'order_date', label: 'Order Date', type: 'date' as const },
  { key: 'order_id', label: 'Order ID (Barcode)', type: 'string' as const },
  { key: 'patient_name', label: 'Patient Name', type: 'string' as const },
  { key: 'service_name', label: 'Service/Test Name', type: 'string' as const },
  { key: 'doctor_name', label: 'Doctor Name', type: 'string' as const },
  { key: 'status', label: 'Status', type: 'string' as const },
];

export const diagCardiologyServiceReport: ReportDefinition = {
  id: 'diagnostic-cardiology-service',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Cardiology Service',
  description: 'Details of cardiology services and tests ordered.',
  filters: defaultFilters,
  columns: diagnosticServiceColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticServiceQuery('Cardiology'),
};

export const diagNeurologyServiceReport: ReportDefinition = {
  id: 'diagnostic-neurology-service',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Neurology Service',
  description: 'Details of neurology services and tests ordered.',
  filters: defaultFilters,
  columns: diagnosticServiceColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticServiceQuery('Neurology'),
};

export const diagPulmonologyServiceReport: ReportDefinition = {
  id: 'diagnostic-pulmonology-service',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Pulmonology Service',
  description: 'Details of pulmonology services and tests ordered.',
  filters: defaultFilters,
  columns: diagnosticServiceColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticServiceQuery('Pulmonology'),
};

export const diagPathologyServiceReport: ReportDefinition = {
  id: 'diagnostic-pathology-service',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Pathology Service',
  description: 'Details of pathology services and tests ordered.',
  filters: defaultFilters,
  columns: diagnosticServiceColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticServiceQuery('Pathology'),
};

// ─── Phase D2: Missing Radiology Service Report ───────────────────────────
//
// Gap Analysis §3.4 identified this as missing from the registry.
// The PRD lists a Radiology Service report (SN ~43) alongside Pathology
// Service. The existing Radiology TAT report covers completed orders only;
// this report covers ALL radiology lab_orders regardless of status,
// mirroring diagPathologyServiceReport exactly but filtered by 'Radiology'.

export const diagRadiologyServiceReport: ReportDefinition = {
  id: 'diagnostic-radiology-service',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Radiology Service',
  description: 'Details of all radiology services and imaging tests ordered — MRI, CT, X-Ray, Ultrasound, etc.',
  filters: defaultFilters,
  columns: diagnosticServiceColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createDiagnosticServiceQuery('Radiology'),
};

// TAT Queries

const diagnosticTatColumns = [
  { key: 'order_date', label: 'Order Date', type: 'date' as const },
  { key: 'order_id', label: 'Order ID (Barcode)', type: 'string' as const },
  { key: 'patient_name', label: 'Patient Name', type: 'string' as const },
  { key: 'service_name', label: 'Service/Test Name', type: 'string' as const },
  { key: 'collected_at', label: 'Collected At', type: 'date' as const },
  { key: 'completed_at', label: 'Completed At', type: 'date' as const },
  { key: 'tat_hours', label: 'TAT (Hours)', type: 'number' as const },
];

const createTatQuery = (departmentKeyword: string) => async (filters: ValidatedFilters, orgId: string) => {
  const { date_start, date_end } = filters;
  
  // Use Prisma.sql or just raw interpolation depending on if keyword is passed
  const condition = departmentKeyword 
    ? `AND lo.test_type ILIKE '%${departmentKeyword}%'` 
    : '';

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      DATE(lo.created_at) as "order_date",
      lo.barcode as "order_id",
      p.full_name as "patient_name",
      lo.test_type as "service_name",
      ls.collected_at as "collected_at",
      ls.completed_at as "completed_at",
      EXTRACT(EPOCH FROM (ls.completed_at - ls.collected_at))/3600 as "tat_hours"
    FROM "lab_orders" lo
    LEFT JOIN "lab_sample_tracking" ls ON lo.barcode = ls.barcode
    LEFT JOIN "OPD_REG" p ON lo.patient_id = p.patient_id
    WHERE lo."organizationId" = $1
      AND ls.completed_at IS NOT NULL
      AND ls.collected_at IS NOT NULL
      ${condition}
      AND lo.created_at >= $2
      AND lo.created_at <= $3
    ORDER BY lo.created_at DESC
  `, orgId, toStartOfDay(date_start), toEndOfDay(date_end));

  return { 
    rows: rows.map(r => ({
      ...r,
      tat_hours: Number(r.tat_hours || 0), // Explicit BigInt to Number cast not strictly required for EXTRACT EPOCH, but good for safety
    })), 
    totals: {} 
  };
};

export const diagTatReport: ReportDefinition = {
  id: 'diagnostic-tat-report',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - TAT Report',
  description: 'Overall Turn-Around-Time report for all completed diagnostic services.',
  filters: defaultFilters,
  columns: diagnosticTatColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createTatQuery(''),
};

export const diagPathologyTatReport: ReportDefinition = {
  id: 'diagnostic-pathology-tat-report',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Pathology TAT Report',
  description: 'Turn-Around-Time report for completed pathology services.',
  filters: defaultFilters,
  columns: diagnosticTatColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createTatQuery('Pathology'),
};

export const diagRadiologyTatReport: ReportDefinition = {
  id: 'diagnostic-radiology-tat-report',
  category: ReportCategory.Diagnostic,
  name: 'Diagnostic - Radiology TAT Report',
  description: 'Turn-Around-Time report for completed radiology services.',
  filters: defaultFilters,
  columns: diagnosticTatColumns,
  defaultSort: { column: 'order_date', direction: 'desc' },
  rowLimitSync: 5000,
  requiredPermission: 'mis_reports.diagnostic.view',
  queryFn: createTatQuery('Radiology'),
};
