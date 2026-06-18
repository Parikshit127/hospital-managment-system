import { redirect } from 'next/navigation';

// OPD patient list is now the OPD tab on the combined reception dashboard.
export default function ReceptionOpdIndex() {
    redirect('/reception/dashboard');
}
