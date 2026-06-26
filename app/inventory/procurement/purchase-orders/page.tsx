import { redirect } from 'next/navigation';

export default function PurchaseOrdersPage() {
  redirect('/inventory/procurement?tab=po');
}
