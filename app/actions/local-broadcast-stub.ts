'use server';

/**
 * TEMPORARY STUB — Person B is building the real hospital-scoped broadcast action.
 *
 * The Hospital Admin broadcast UI (app/admin/broadcasts/page.tsx) calls this so
 * the frontend can be built in parallel. Once the real backend action lands,
 * swap the import in that page for the real one — this file can then be deleted.
 *
 * Contract (agreed with Person B): takes { title, body }; the real action will
 * inherently send to the admin's entire hospital (no audience/facility input).
 */
export async function sendLocalBroadcast(input: { title: string; body: string }) {
    console.log('Stub called with:', input);
    return { success: true, data: { id: 'test-id', recipients: 10 } };
}
