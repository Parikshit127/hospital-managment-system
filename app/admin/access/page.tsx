import { redirect } from 'next/navigation';

export default function AccessIndex() {
    redirect('/admin/access/users');
}
