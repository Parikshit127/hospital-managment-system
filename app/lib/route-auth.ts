import { NextResponse } from 'next/server';
import {
    getPatientSession,
    getSession,
    type PatientSessionData,
    type SessionData,
} from '@/app/lib/session';

export type StaffRouteContext = {
    kind: 'staff';
    session: SessionData;
    organizationId: string;
};

export type PatientRouteContext = {
    kind: 'patient';
    session: PatientSessionData;
    organizationId: string;
};

export type RouteContext = StaffRouteContext | PatientRouteContext;

export type ResolveRouteAuthOptions = {
    allowPatient?: boolean;
    allowedStaffRoles?: string[];
};

type ResolveRouteAuthResult =
    | { ok: true; context: RouteContext }
    | { ok: false; response: NextResponse };

export async function resolveRouteAuth(
    options: ResolveRouteAuthOptions = {}
): Promise<ResolveRouteAuthResult> {
    const { allowPatient = false, allowedStaffRoles = [] } = options;

    const staffSession = await getSession();
    if (staffSession?.organization_id) {
        if (allowedStaffRoles.length > 0 && !allowedStaffRoles.includes(staffSession.role)) {
            return {
                ok: false,
                response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
            };
        }

        return {
            ok: true,
            context: {
                kind: 'staff',
                session: staffSession,
                organizationId: staffSession.organization_id,
            },
        };
    }

    if (allowPatient) {
        const patientSession = await getPatientSession();
        if (patientSession?.organization_id) {
            return {
                ok: true,
                context: {
                    kind: 'patient',
                    session: patientSession,
                    organizationId: patientSession.organization_id,
                },
            };
        }
    }

    return {
        ok: false,
        response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
}

