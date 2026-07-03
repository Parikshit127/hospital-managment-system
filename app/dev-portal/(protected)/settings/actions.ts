'use server';

/**
 * TEMPORARY STUB — Person B owns dev-portal persistence.
 *
 * The Dev Portal settings page (./page.tsx) calls these so the frontend can be
 * built in parallel. Swap for the real implementations (load/save the Dev
 * user's email on the User record) once the backend lands; this file can then
 * be deleted.
 */

export async function getDevPortalEmail(): Promise<{ success: boolean; email: string }> {
    // Real impl will read the logged-in Dev user's email from the DB.
    return { success: true, email: '' };
}

export async function saveDevPortalEmail(input: { email: string }): Promise<{ success: boolean; error?: string }> {
    console.log('Stub saveDevPortalEmail called with:', input);
    return { success: true };
}
