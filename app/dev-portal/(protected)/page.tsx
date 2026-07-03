import { redirect } from 'next/navigation';

// The portal root has no page of its own — send authenticated users straight
// to the Ticket Command Center (the default landing view).
export default function DevPortalRootPage() {
    redirect('/dev-portal/tickets');
}
