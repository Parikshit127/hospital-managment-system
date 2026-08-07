/**
 * POST /api/voice/nlu/symptoms
 * =====================================================================
 * Track B — Step 3 API: Symptom text → specialty routing + red-flag detection
 *
 * Security:
 * - Validates organisationId exists in DB before calling LLM (prevents
 *   arbitrary LLM usage outside a valid tenant context)
 * - Does NOT expose doctor/patient data — only routing metadata
 *
 * Rate-limiting note: In production, add edge-level rate limiting
 * (e.g. Vercel middleware or Upstash) for LLM call cost control.
 * The in-memory counter below covers only per-cold-start protection.
 * =====================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { analyseSymptoms, getValidSpecialties } from '@/lib/booking/symptom-nlu';

// ─────────────────────────────────────────────────────────────────────────────
// In-process rate limiter.
//
// This ships as a long-running Node process on ECS/EC2, not per-request
// serverless, so these counters live for the life of the task — the limit is
// real, not the "per cold-start" approximation. With N tasks behind the load
// balancer the effective ceiling is N x the numbers below.
//
// Limited per IP as well as per org: this route is deliberately unauthenticated
// (the patient voice agent runs pre-login, see proxy.ts) and `organisationId`
// is caller-supplied and publicly known, so an org-only limit is one an abuser
// can widen at will by rotating IDs. It bills a real LLM call per request.
// ─────────────────────────────────────────────────────────────────────────────
const callCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15;           // max calls per org per minute
const RATE_LIMIT_MAX_IP = 15;        // and per caller IP per minute

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();

  // IP keys are unbounded, so sweep expired entries before the map can grow
  // without limit. Cheap because it only runs once the map is already large.
  if (callCounts.size > 10_000) {
    for (const [k, v] of callCounts) {
      if (now > v.resetAt) callCounts.delete(k);
    }
  }

  const entry = callCounts.get(key);

  if (!entry || now > entry.resetAt) {
    callCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symptomText, organisationId, language } = body as {
      symptomText?: string;
      organisationId?: string;
      language?: 'en' | 'hi';
    };

    // Default to English when omitted (keeps the existing English-only flow working).
    const lang: 'en' | 'hi' = language === 'hi' ? 'hi' : 'en';

    // ── 400: Required fields ─────────────────────────────────────────────────
    if (!symptomText?.trim()) {
      return NextResponse.json(
        { success: false, error: 'symptomText is required' },
        { status: 400 },
      );
    }
    if (!organisationId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'organisationId is required' },
        { status: 400 },
      );
    }
    if (symptomText.trim().length > 2000) {
      return NextResponse.json(
        { success: false, error: 'symptomText exceeds maximum length of 2000 characters' },
        { status: 400 },
      );
    }

    // ── Validate org exists (prevents misuse outside a real tenant) ──────────
    const org = await prisma.organization.findUnique({
      where: { id: organisationId },
      select: { id: true, is_active: true },
    });
    if (!org || !org.is_active) {
      return NextResponse.json(
        { success: false, error: 'Organisation not found or inactive' },
        { status: 404 },
      );
    }

    // ── Rate limit ────────────────────────────────────────────────────────────
    // Behind the ALB this is the real client; direct callers share the
    // 'unknown' bucket, which errs strict rather than permissive.
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    if (
      !checkRateLimit(`org:${organisationId}`, RATE_LIMIT_MAX) ||
      !checkRateLimit(`ip:${clientIp}`, RATE_LIMIT_MAX_IP)
    ) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
    }

    // ── NLU analysis ─────────────────────────────────────────────────────────
    const result = await analyseSymptoms(symptomText.trim(), lang);

    return NextResponse.json({
      success: true,
      ...result,
      // Also return the full specialty list so the UI can render a
      // manual department picker when confidence is low (per user decision)
      availableSpecialties: result.confidence < 0.5 || result.specialties.length === 0
        ? getValidSpecialties()
        : [],
    });
  } catch (error: any) {
    console.error('[POST /api/voice/nlu/symptoms]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
