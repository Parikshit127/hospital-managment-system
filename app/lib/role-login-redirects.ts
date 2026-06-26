/** Post-login landing path per staff role (keep in sync across login, MFA, proxy). */
export const ROLE_LOGIN_REDIRECTS: Record<string, string> = {
  receptionist: '/reception',
  doctor: '/doctor/dashboard',
  lab_technician: '/lab/technician',
  pharmacist: '/pharmacy/billing',
  admin: '/admin/dashboard',
  finance: '/finance/dashboard',
  ipd_manager: '/ipd',
  nurse: '/nurse/dashboard',
  opd_manager: '/opd-manager/dashboard',
  hr: '/hr/dashboard',
  coordinator: '/coordinator/dashboard',
  ot_manager: '/ot/dashboard',
  er_staff: '/er/dashboard',
  store_manager: '/inventory/dashboard',
  procurement_officer: '/inventory/procurement',
};

export function getLoginRedirectForRole(role: string): string {
  return ROLE_LOGIN_REDIRECTS[role] || '/login';
}
