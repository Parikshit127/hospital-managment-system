import { redirect } from 'next/navigation';

// IPD admissions list is now the IPD tab on the combined reception dashboard.
export default function ReceptionIpdIndex() {
    redirect('/reception/dashboard?tab=ipd');
}
