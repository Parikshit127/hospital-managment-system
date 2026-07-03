import { redirect } from 'next/navigation';
import { helpCenterAliasTarget } from '../routes';

export const dynamic = 'force-dynamic';

// Legacy sub-route kept alive as a thin redirect into the consolidated Help
// Center's Raise Ticket tab (PRD v3 Addendum §4). Forwards any query params.
export default async function RaiseTicketRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    redirect(helpCenterAliasTarget('raise', await searchParams));
}
