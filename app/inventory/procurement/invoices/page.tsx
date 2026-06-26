import { redirect } from 'next/navigation';

export default function InvoicesPage() {
  redirect('/inventory/procurement?tab=invoices');
}
