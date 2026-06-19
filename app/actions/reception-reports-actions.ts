'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import {
    getReportRows,
    REPORT_META,
    type ReportKind,
    type ReportColumn,
    type ReportRow,
} from '@/app/lib/reports/reception-reports';

const ALLOWED_ROLES = ['receptionist', 'admin'];

type ReportResult =
    | { success: true; columns: ReportColumn[]; rows: ReportRow[] }
    | { success: false; error: string };

async function runReport(
    kind: ReportKind,
    fromStr: string,
    toStr: string,
): Promise<ReportResult> {
    try {
        if (!fromStr || !toStr) {
            return { success: false, error: 'From and To dates are required' };
        }
        const { organizationId } = await requireRoleAndTenant(ALLOWED_ROLES);
        const rows = await getReportRows(kind, organizationId, fromStr, toStr);
        return { success: true, columns: REPORT_META[kind].columns, rows };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to generate report';
        return { success: false, error: msg };
    }
}

export async function getIpdPatientReport(fromStr: string, toStr: string) {
    return runReport('ipd', fromStr, toStr);
}

export async function getOpdPatientReport(fromStr: string, toStr: string) {
    return runReport('opd', fromStr, toStr);
}

export async function getWalkinPatientReport(fromStr: string, toStr: string) {
    return runReport('walkin', fromStr, toStr);
}
