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

    // Investor credentials configurable via environment variables (falls back to demo defaults)
    const validUsername = process.env.INVESTOR_USERNAME || 'inv@123';
    const validPassword = process.env.INVESTOR_PASSWORD || 'inv123';

    const isValidUsername = username.toLowerCase() === validUsername.toLowerCase();
    const isValidPassword = password === validPassword;

    if (!isValidUsername || !isValidPassword) {
        return { success: false, error: 'Invalid investor credentials' };
    }

    const cookieStore = await cookies();
    cookieStore.set(INVESTOR_COOKIE_NAME, JSON.stringify({
        user: username,
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
