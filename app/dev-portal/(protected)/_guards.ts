import { redirect } from 'next/navigation';
import { requireDevPortalContext } from '@/backend/dev-portal';

/**
 * Server-side segment guard for Dev-Admin-only routes (Broadcasts, Releases,
 * Audit). A plain Developer who reaches these by direct URL is bounced back to
 * the Ticket Command Center. Runs on the server before the (client) page renders,
 * so it is a real access boundary — not just the hidden nav link.
 *
 * The action-level requireDevAdmin() guards on the underlying server actions are
 * still the authoritative check; this simply keeps the UI coherent.
 */
export async function requireDevAdminPage(): Promise<void> {
    let ctx;
    try {
        ctx = await requireDevPortalContext();
    } catch {
        redirect('/dev-portal/login');
    }

    if (!ctx!.user.is_dev_admin) {
        redirect('/dev-portal/tickets');
    }
}
