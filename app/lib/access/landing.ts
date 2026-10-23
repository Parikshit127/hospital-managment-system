import { buildAccessClaims } from './claims-server';
import { moduleForPath } from './claims';
import { hasProfileRow } from './profile-store';

/** Where each system role lands after sign-in today (mirror of the switch in app/login/actions.ts). */
const ROLE_HOME: Record<string, string> = {
    receptionist: '/reception', doctor: '/doctor/dashboard', lab_technician: '/lab/technician', pharmacist: '/pharmacy/billing',
    finance: '/finance/dashboard', ipd_manager: '/ipd', nurse: '/nurse/dashboard', opd_manager: '/opd-manager/dashboard',
    hr: '/hr/dashboard', ot_manager: '/ot/dashboard', er_staff: '/er/dashboard', coordinator: '/coordinator/dashboard',
};

/**
 * Landing page for a user with a per-employee access profile: their role's usual home if that app is still on their
 * profile, otherwise the first app they do hold, otherwise their own workspace. null = not a profile user (use the
 * normal role switch). Never throws.
 */
export async function managedLanding(user: { id: string; role: string; organization_id: string }): Promise<string | null> {
    try {
        if (!(await hasProfileRow(user.id))) return null;
        const claims = await buildAccessClaims(user);
        if (!claims) return null;
        const home = ROLE_HOME[user.role];
        if (home && moduleForPath(home) && claims.mods.includes(moduleForPath(home)!.key)) return home;
        for (const role of Object.keys(ROLE_HOME)) {
            const path = ROLE_HOME[role];
            const m = moduleForPath(path);
            if (m && claims.mods.includes(m.key)) return path;
        }
        return '/me';
    } catch {
        return null;
    }
}
