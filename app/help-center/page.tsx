import { redirect } from 'next/navigation';

// Help center index — redirect to the ticket tracker by default
export default function HelpCenterIndex() {
    redirect('/help-center/track');
}
