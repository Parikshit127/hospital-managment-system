import { redirect } from 'next/navigation';

export default function GrnPage() {
  redirect('/inventory/procurement?tab=grn');
}
