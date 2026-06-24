// app/components/registration/RegistrationSuccess.tsx
// Shared post-registration success screen.
// Shows the patient's credentials (ID + auto-generated password) once for them
// to copy, runs a visual countdown, and then routes them onward — to the voice
// booking agent (voice path) or the dashboard (manual path). The patient is
// already auto-logged-in via the session cookie set during registration.
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Copy, Check, ArrowRight } from 'lucide-react';

interface RegistrationSuccessProps {
  patientId: string;
  /** Auto-generated plaintext password — displayed once for the patient to copy. */
  password?: string;
  /** Where to send the patient when the timer ends or they tap the CTA. */
  redirectTo: string;
  /** CTA button label, e.g. "Start Booking Now →" or "Go to Dashboard →". */
  ctaLabel: string;
  /** Countdown duration in seconds (15–20). */
  seconds?: number;
}

function CopyableValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — value is still visible to copy manually */
    }
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-3 bg-white border border-emerald-200 rounded-xl px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-black text-emerald-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function RegistrationSuccess({
  patientId,
  password,
  redirectTo,
  ctaLabel,
  seconds = 18,
}: RegistrationSuccessProps) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);

  const go = useCallback(() => {
    router.push(redirectTo);
  }, [router, redirectTo]);

  // Tick down once per second; redirect when it reaches zero.
  useEffect(() => {
    if (remaining <= 0) {
      go();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, go]);

  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100));

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10 max-w-md w-full text-center space-y-5">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>

        <div>
          <h2 className="text-2xl font-black text-gray-900">Registration Successful!</h2>
          <p className="text-gray-500 text-sm mt-1">
            You&apos;re signed in. Save these credentials to log in again later.
          </p>
        </div>

        {/* Credentials */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3 text-left">
          <CopyableValue label="Patient ID" value={patientId} mono />
          {password && <CopyableValue label="Password" value={password} mono />}
          <p className="text-[11px] text-gray-500 leading-relaxed">
            This password is shown only once. We&apos;ve emailed your Patient ID and a secure link to
            change it. Keep it somewhere safe.
          </p>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={go}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-sm hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          {ctaLabel} <ArrowRight className="w-4 h-4" />
        </button>

        {/* Countdown */}
        <div className="space-y-1.5">
          <div className="h-1.5 w-full bg-emerald-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            Redirecting automatically in <span className="font-bold text-gray-600">{remaining}s</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegistrationSuccess;
