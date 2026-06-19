import { redirect } from 'next/navigation';

// All roles (including reception) now use the single canonical IPD Patient Chart
// at /ipd/admission/[id]. This route just forwards there so the view is identical
// everywhere.
export default async function ReceptionIpdDetailRedirect({ params }: { params: any }) {
    const { id } = await params;
    redirect(`/ipd/admission/${id}`);
}
