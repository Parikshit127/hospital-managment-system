/**
 * scripts/seed-voice-call-logs.mjs
 * Dev-only helper for AI Voice Call Assistant — Phase 1.
 *
 * - Prints the organization UUID to use for VOICE_AI_ORG_ID.
 * - Seeds a few CLEARLY-MARKED sample CallLog rows (agent_id = 'sample-seed')
 *   plus one transcript, so the call-center UI renders with data.
 *
 * Idempotent: deletes previous 'sample-seed' rows before inserting.
 * Remove the sample rows anytime with:
 *   DELETE FROM "CallTranscript" WHERE call_log_id IN (SELECT id FROM "CallLog" WHERE agent_id='sample-seed');
 *   DELETE FROM "CallLog" WHERE agent_id='sample-seed';
 *
 * Run:  set -a; source .env; set +a; node scripts/seed-voice-call-logs.mjs
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.$queryRaw`
    SELECT id, name FROM organizations WHERE is_active = true ORDER BY created_at ASC LIMIT 1`;
  const org = orgs[0];
  if (!org) {
    console.error('No active organization found — cannot seed.');
    process.exit(1);
  }
  console.log(`VOICE_AI_ORG_ID=${org.id}   (${org.name})`);

  // Idempotent cleanup of previous sample rows
  await prisma.$executeRaw`DELETE FROM "CallTranscript" WHERE call_log_id IN (SELECT id FROM "CallLog" WHERE agent_id = 'sample-seed')`;
  await prisma.$executeRaw`DELETE FROM "CallLog" WHERE agent_id = 'sample-seed'`;

  const id1 = randomUUID();
  const id2 = randomUUID();
  const id3 = randomUUID();
  const tId = randomUUID();

  // 1) AI voice — booked
  await prisma.$executeRaw`
    INSERT INTO "CallLog" (id, "organizationId", agent_id, patient_phone, patient_name, call_type, outcome,
      duration_seconds, notes, created_at, channel, direction, provider, provider_call_id, from_number,
      status, language, verification_status, started_at, ended_at)
    VALUES (${id1}, ${org.id}, 'sample-seed', '9876543210', 'Ramesh Kumar', 'Inbound', 'Booked',
      92, 'Sample — AI booked an OPD appointment', now(), 'voice_ai', 'inbound', 'vapi', ${'sample-' + id1},
      '+919876543210', 'completed', 'en', 'name_confirmed', now() - interval '2 minutes', now())`;

  // 2) AI voice — callback created (unresolved)
  await prisma.$executeRaw`
    INSERT INTO "CallLog" (id, "organizationId", agent_id, patient_phone, patient_name, call_type, outcome,
      duration_seconds, notes, created_at, channel, direction, provider, provider_call_id, from_number,
      status, language, verification_status, handoff_status)
    VALUES (${id2}, ${org.id}, 'sample-seed', '9812345678', NULL, 'Inbound', 'Callback',
      45, 'Sample — caller asked for a human; callback logged', now() - interval '1 hour', 'voice_ai',
      'inbound', 'vapi', ${'sample-' + id2}, '+919812345678', 'completed', 'hi', 'unverified', 'callback_created')`;

  // 3) Manual staff call — enquiry
  await prisma.$executeRaw`
    INSERT INTO "CallLog" (id, "organizationId", agent_id, patient_phone, patient_name, call_type, outcome,
      duration_seconds, notes, created_at, channel, status)
    VALUES (${id3}, ${org.id}, 'sample-seed', '9900112233', 'Priya Sharma', 'Outbound', 'Enquiry',
      130, 'Sample — manual staff follow-up call', now() - interval '3 hours', 'manual', 'completed')`;

  // Transcript for the AI booked call
  await prisma.$executeRaw`
    INSERT INTO "CallTranscript" (id, call_log_id, "organizationId", turns, summary, language, created_at)
    VALUES (${tId}, ${id1}, ${org.id},
      ${JSON.stringify([
        { role: 'assistant', text: 'Hello, this is the AI assistant for Avani Hospital. How can I help you today?' },
        { role: 'caller', text: 'I want to book an appointment with a heart doctor.' },
        { role: 'assistant', text: 'Sure. May I have your name to check your record?' },
        { role: 'caller', text: 'Ramesh Kumar.' },
        { role: 'assistant', text: 'Thank you, Ramesh. I have booked you with Dr. Mehta in Cardiology tomorrow at 10 AM. Payment at the desk.' },
      ])}::jsonb,
      'Caller booked a Cardiology OPD appointment; identity confirmed by name.', 'en', now())`;

  console.log('Seeded 3 sample CallLog rows + 1 transcript (agent_id = "sample-seed").');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
