import { redirect } from 'next/navigation';

/**
 * Consolidated: OPD display now lives at /reception/token-display.
 * This page redirects to prevent duplication.
 */
export default function WaitingRoomDisplay() {
    redirect('/reception/token-display');
}
