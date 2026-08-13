'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const INVESTOR_COOKIE_NAME = 'investor_session';

export async function investorLogin(prevState: any, formData: FormData) {
    const username = (formData.get('username') as string || '').trim();
    const password = (formData.get('password') as string || '').trim();

    if (!username || !password) {
        return { success: false, error: 'Please enter both username and password' };
    }

    // Explicit Investor credentials specified by user: inv@123 / inv123
    const isValidUsername = username.toLowerCase() === 'inv@123';
    const isValidPassword = password === 'inv123';

    if (!isValidUsername || !isValidPassword) {
        return { success: false, error: 'Invalid investor credentials' };
    }

    const cookieStore = await cookies();
    cookieStore.set(INVESTOR_COOKIE_NAME, JSON.stringify({
        user: 'inv@123',
        role: 'investor',
        name: 'Promoter / Investor',
        loggedInAt: new Date().toISOString(),
    }), {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: 'lax',
    });

    return { success: true };
}

export async function getInvestorSession() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(INVESTOR_COOKIE_NAME);
    if (!sessionCookie?.value) return null;
    try {
        return JSON.parse(sessionCookie.value);
    } catch {
        return null;
    }
}

export async function investorLogout() {
    const cookieStore = await cookies();
    cookieStore.delete(INVESTOR_COOKIE_NAME);
    redirect('/login/investor');
}
