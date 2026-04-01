import useSWR, { mutate } from 'swr';
import { getPatientDashboardData, getPatientRecords } from '@/app/actions/patient-actions';
import { getActiveCallRequests } from '@/app/actions/video-call-actions';
import { getMyAppointments } from '@/app/patient/appointments/actions';

// SWR keys
export const SWR_KEYS = {
    dashboard: 'patient-dashboard',
    appointments: 'patient-appointments',
    records: 'patient-records',
    videoCalls: 'patient-video-calls',
} as const;

// SWR default options — stale-while-revalidate with background refresh
const defaultOpts = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 10_000, // 10s dedup
    errorRetryCount: 2,
};

/** Dashboard data: patient info, upcoming appointments, vitals, counts */
export function usePatientDashboard() {
    const { data, error, isLoading, isValidating, mutate: revalidate } = useSWR(
        SWR_KEYS.dashboard,
        () => getPatientDashboardData(),
        { ...defaultOpts, refreshInterval: 60_000 }, // auto-refresh every 60s
    );

    return {
        data: data?.success ? data.data : null,
        error: data?.success === false ? data.error : error?.message,
        isLoading,
        isValidating,
        refresh: () => revalidate(),
    };
}

/** Appointments list */
export function useAppointments() {
    const { data, error, isLoading, isValidating, mutate: revalidate } = useSWR(
        SWR_KEYS.appointments,
        () => getMyAppointments(),
        { ...defaultOpts, refreshInterval: 30_000 }, // 30s for appointments
    );

    return {
        appointments: data?.success ? data.data ?? [] : [],
        error: data?.success === false ? (data as any).error : error?.message,
        isLoading,
        isValidating,
        refresh: () => revalidate(),
    };
}

/** Medical records: labs, diagnoses, vitals */
export function usePatientRecords() {
    const { data, error, isLoading, isValidating, mutate: revalidate } = useSWR(
        SWR_KEYS.records,
        () => getPatientRecords(),
        defaultOpts,
    );

    return {
        data: data?.success ? data.data : null,
        error: data?.success === false ? data.error : error?.message,
        isLoading,
        isValidating,
        refresh: () => revalidate(),
    };
}

/** Video call requests & status */
export function useVideoCalls() {
    const { data: dashboardData } = usePatientDashboard();
    const patientId = dashboardData?.patient?.patient_id;

    const { data, error, isLoading, isValidating, mutate: revalidate } = useSWR(
        patientId ? [SWR_KEYS.videoCalls, patientId] : null,
        () => getActiveCallRequests(patientId!),
        { ...defaultOpts, refreshInterval: 30_000 },
    );

    return {
        requests: data?.success ? data.data ?? [] : [],
        error: data?.success === false ? (data as any)?.error : error?.message,
        isLoading,
        isValidating,
        refresh: () => revalidate(),
    };
}

// ── Cache invalidation helpers ────────────────────────────────

/** Invalidate appointment-related caches after booking/cancel/reschedule */
export function invalidateAppointments() {
    mutate(SWR_KEYS.appointments);
    mutate(SWR_KEYS.dashboard); // dashboard shows upcoming appointments too
}

/** Invalidate dashboard after profile update */
export function invalidateDashboard() {
    mutate(SWR_KEYS.dashboard);
}

/** Invalidate all patient data caches */
export function invalidateAll() {
    mutate(SWR_KEYS.dashboard);
    mutate(SWR_KEYS.appointments);
    mutate(SWR_KEYS.records);
}
