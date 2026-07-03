import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/app/lib/session';
import { HelpCenterTabs } from './_components/HelpCenterTabs';
import { roleDashboardPath } from './routes';
import { LoadingState } from '@/app/components/ui/LoadingState';

export const dynamic = 'force-dynamic';

// Consolidated Help Center — a single tabbed page reachable only via the
// notification bell's link or a direct URL (PRD v3 Addendum §4). The four tabs
// (Track Status / Raise Ticket / Release Notes / Notifications) relocate the
// existing v2 §3.2 functionality; the active tab is URL-driven via ?tab=.
export default async function HelpCenterPage() {
    const session = await getSession();
    if (!session) {
        redirect('/login');
    }

    return (
        // HelpCenterTabs reads ?tab via useSearchParams, so it must sit under a
        // Suspense boundary.
        <Suspense fallback={<LoadingState message="Loading Help Center…" />}>
            <HelpCenterTabs userId={session.id} dashboardHref={roleDashboardPath(session.role)} />
        </Suspense>
    );
}
