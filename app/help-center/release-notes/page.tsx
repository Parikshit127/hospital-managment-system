import { redirect } from 'next/navigation';
import { helpCenterAliasTarget } from '../routes';

export const dynamic = 'force-dynamic';

// Legacy sub-route kept alive as a thin redirect into the consolidated Help
// Center's Release Notes tab (PRD v3 Addendum §4). Forwards any query params —
// notably the ?id carried by the notification bell's release-note deep link.
export default async function ReleaseNotesRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    redirect(helpCenterAliasTarget('release-notes', await searchParams));
}
