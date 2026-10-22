/**
 * "Who am I and what can I see" payload returned at login and by GET /api/v1/auth/me. The app uses
 * `capabilities` to decide which tabs to show (Employee always; Team for managers; HR for HR/admin).
 * The server still enforces every action — this only shapes the UI.
 */

import { getTenantPrisma } from '@/backend/db';
import { hasPermission, type SessionData } from '@/app/lib/session';
import { ensureEmployeeForUser, loadHrPolicy } from '@/app/lib/hr/hr-core';
import { haversineM } from '@/app/lib/hr/hr-policy';
import type { LoginLocation } from './mobile-auth';

export async function describeSession(session: SessionData) {
    const db = getTenantPrisma(session.organization_id);
    const employee = await ensureEmployeeForUser(db, session.organization_id, session.id);
    const [reports, hrView, hrEdit, hrApprove, hrCreate, hrExport] = await Promise.all([
        db.employee.count({ where: { reporting_manager_id: employee.id, is_active: true } }),
        hasPermission('hr.view'), hasPermission('hr.edit'), hasPermission('hr.approve'),
        hasPermission('hr.create'), hasPermission('hr.export'),
    ]);

    return {
        user: { id: session.id, username: session.username, name: session.name, role: session.role },
        organization: { id: session.organization_id, name: session.organization_name, slug: session.organization_slug },
        employee: {
            id: employee.id, code: employee.employee_code, name: employee.name, designation: employee.designation,
            isActive: employee.is_active,
        },
        capabilities: {
            employee: true,
            manager: reports > 0,
            directReports: reports,
            hr: hrView,
            hrEdit, hrApprove, hrCreate, hrExport,
        },
    };
}

/** Where the login location sits relative to the work geofence (informational — punching enforces it). */
export async function geofenceStatus(session: SessionData, loc: LoginLocation | null) {
    const db = getTenantPrisma(session.organization_id);
    const policy = await loadHrPolicy(db);
    if (!policy.geofence) return { required: policy.requireGeo, configured: false, inside: null as boolean | null, distanceM: null as number | null };
    if (!loc) return { required: policy.requireGeo, configured: true, inside: null, distanceM: null };
    const distanceM = Math.round(haversineM({ lat: loc.lat, lng: loc.lng }, policy.geofence));
    return { required: policy.requireGeo, configured: true, inside: distanceM <= policy.geofence.radiusM, distanceM };
}
