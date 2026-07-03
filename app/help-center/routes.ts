// Canonical Help Center route + tab helpers.
//
// The Help Center is a single tabbed page reachable ONLY via the notification
// bell's link or a direct URL — never from a sidebar (PRD v3 Addendum §4).
// Referencing these constants keeps the route defined in one place so the bell
// link, the page, and the legacy sub-route redirect aliases never drift.

export const HELP_CENTER_ROUTE = '/help-center';

export type HelpCenterTab = 'track' | 'raise' | 'release-notes' | 'notifications';

export const HELP_CENTER_TABS: HelpCenterTab[] = ['track', 'raise', 'release-notes', 'notifications'];

export const DEFAULT_HELP_CENTER_TAB: HelpCenterTab = 'track';

/** Build a link to a specific Help Center tab (optionally with extra query params). */
export function helpCenterTabHref(tab: HelpCenterTab, extraParams?: Record<string, string>): string {
    const params = new URLSearchParams({ tab, ...(extraParams ?? {}) });
    return `${HELP_CENTER_ROUTE}?${params.toString()}`;
}

/**
 * Landing dashboard path for a given role. Mirrors the post-login role routing
 * in app/login/actions.ts so the Help Center's "Go to Dashboard" button sends
 * each hospital-side role back to their own home, not a hardcoded one.
 */
export function roleDashboardPath(role: string | null | undefined): string {
    switch (role) {
        case 'receptionist': return '/reception';
        case 'doctor': return '/doctor/dashboard';
        case 'lab_technician': return '/lab/technician';
        case 'pharmacist': return '/pharmacy/billing';
        case 'admin': return '/admin/dashboard';
        case 'finance': return '/finance/dashboard';
        case 'ipd_manager': return '/ipd';
        case 'nurse': return '/nurse/dashboard';
        case 'opd_manager': return '/opd-manager/dashboard';
        case 'hr': return '/hr/dashboard';
        case 'coordinator': return '/coordinator/dashboard';
        default: return '/';
    }
}

/** Coerce an arbitrary string into a valid tab, falling back to the default. */
export function normalizeTab(value: string | null | undefined): HelpCenterTab {
    return HELP_CENTER_TABS.includes(value as HelpCenterTab)
        ? (value as HelpCenterTab)
        : DEFAULT_HELP_CENTER_TAB;
}

/**
 * Redirect target for a legacy sub-route (e.g. /help-center/release-notes?id=…).
 * Forwards ALL incoming query params unchanged and pins the tab, so external
 * deep links (like the notification bell's release-note link) keep working after
 * the sub-routes were consolidated into tabs.
 */
export function helpCenterAliasTarget(
    tab: HelpCenterTab,
    searchParams: Record<string, string | string[] | undefined>,
): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
        if (key === 'tab') continue; // the alias fixes the tab itself
        if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v));
        } else if (value != null) {
            params.set(key, value);
        }
    }
    params.set('tab', tab);
    return `${HELP_CENTER_ROUTE}?${params.toString()}`;
}
