import { redirect } from 'next/navigation';
import { getSession } from '@/app/lib/session';
import { TicketTable } from '../_components/TicketTable';

export default async function TrackStatusPage() {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    return (
        <div className="px-4 py-8 sm:px-6 lg:px-8">
            <TicketTable userId={session.id} />
        </div>
    );
}
