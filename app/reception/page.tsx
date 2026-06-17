import { redirect } from 'next/navigation';

// Reception dashboard and patient list are merged into a single page at
// /reception/dashboard. This route just forwards there.
export default function ReceptionIndex() {
    redirect('/reception/dashboard');
}
