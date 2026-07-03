import { redirect } from 'next/navigation';
import { helpCenterAliasTarget } from '../routes';

export const dynamic = 'force-dynamic';

// Legacy sub-route kept alive as a thin redirect into the consolidated Help
// Center's Track Status tab (PRD v3 Addendum §4). Forwards any query params.
export default async function TrackStatusRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    redirect(helpCenterAliasTarget('track', await searchParams));
}
