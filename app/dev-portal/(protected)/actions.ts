'use server';

import { redirect } from 'next/navigation';
import { clearDevPortalSession } from '@/app/lib/session';

export async function devPortalLogout() {
    await clearDevPortalSession();
    redirect('/dev-portal/login');
}
