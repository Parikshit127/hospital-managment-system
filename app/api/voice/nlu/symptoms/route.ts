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
// Lightweight in-process rate limiter (per cold-start window)
// Protects against burst LLM calls; not a substitute for edge rate limiting.
// ─────────────────────────────────────────────────────────────────────────────
const callCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15;           // max calls per org per minute

function checkRateLimit(orgId: string): boolean {
  const now = Date.now();
  const entry = callCounts.get(orgId);

  if (!entry || now > entry.resetAt) {
    callCounts.set(orgId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
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
    if (!checkRateLimit(organisationId)) {
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
