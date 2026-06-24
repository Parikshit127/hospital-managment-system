/**
 * app/patient/appointment/voice/page.tsx
 * =====================================================================
 * Server Component wrapper for the Voice Booking page.
 * This isolates the 'use client' boundary and ensures useSearchParams()
 * is safely wrapped in <Suspense> during SSR, preventing hydration errors.
 * =====================================================================
 */

import { prisma } from '@/backend/db';
import VoiceBookingClient from './VoiceBookingClient';
import { getPatientSession } from '@/app/lib/session';

export const metadata = {
  title: 'AI Voice Booking | HospitalOS',
  description: 'Book your appointment using our AI voice assistant.',
};

export default async function VoiceBookingPage() {
  const session = await getPatientSession();

  // Prefer the org from the patient's own session — they registered there.
  // Fall back to findFirst only when no session exists (e.g. direct dev access).
  const orgId = session?.organization_id || (
    await prisma.organization.findFirst({ where: { is_active: true } })
  )?.id || '';

  return (
    <VoiceBookingClient
      initialOrgId={orgId}
      sessionPatientId={session?.id}
      sessionPatientName={session?.name}
    />
  );
}
