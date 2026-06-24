'use client';

/**
 * components/booking/EmergencyAdvisory.tsx
 * =====================================================================
 * Track B — Step 3 UI: Emergency red-flag advisory
 *
 * Shown when the NLU engine detects emergency symptoms.
 * Design intent: immediate, high-urgency, unmistakable.
 * Must never block the patient — always offer a way to continue.
 *
 * Accessibility: The alert role is set so screen readers announce
 * this immediately. Focus is moved to the primary CTA on mount.
 *
 * FR-3.4: The assistant must detect and escalate emergency symptoms.
 * This component is the UI manifestation of that requirement.
 * =====================================================================
 */

import { useEffect, useRef } from 'react';
import { AlertTriangle, Phone, ChevronRight, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EmergencyAdvisoryProps {
  /** Red-flag phrases detected in the patient's symptoms */
  detectedSymptoms: string[];
  /** Called when patient taps "Call 108" — parent handles tel: link */
  onCallEmergency?: () => void;
  /** Called when patient wants to continue booking anyway */
  onContinueManually?: () => void;
  /** Called when patient dismisses the advisory */
  onDismiss?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Advisory Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmergencyAdvisory({
  detectedSymptoms,
  onCallEmergency,
  onContinueManually,
  onDismiss,
}: EmergencyAdvisoryProps) {
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Move focus to primary CTA when advisory appears (accessibility)
  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  const handleCallEmergency = () => {
    // Trigger tel: protocol in addition to callback
    if (typeof window !== 'undefined') {
      window.location.href = 'tel:108';
    }
    onCallEmergency?.();
  };

  return (
    /* Alert role — screen readers announce this immediately */
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl shadow-red-900/30 animate-in fade-in zoom-in-95 duration-200">
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-red-600 to-red-700 px-6 py-6 relative">
          {/* Dismiss button */}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss emergency advisory"
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"
            >
              <X className="w-4 h-4 text-white" aria-hidden="true" />
            </button>
          )}

          {/* Icon */}
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                <AlertTriangle className="w-9 h-9 text-white" aria-hidden="true" />
              </div>
              <span className="absolute inset-0 rounded-full bg-white/20 animate-ping" aria-hidden="true" />
            </div>
          </div>

          <h2 className="text-xl font-black text-white text-center leading-tight">
            Emergency Symptoms Detected
          </h2>
          <p className="text-red-200 text-sm text-center mt-1 leading-snug">
            Your symptoms may require immediate medical attention.
          </p>
        </div>

        {/* ── Detected symptoms ─────────────────────────────────────────────── */}
        {detectedSymptoms.length > 0 && (
          <div className="bg-red-50 px-5 py-4 border-b border-red-100">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">
              Flagged symptoms
            </p>
            <ul className="space-y-1" aria-label="Detected emergency symptoms">
              {detectedSymptoms.map((symptom, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-red-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" aria-hidden="true" />
                  <span className="capitalize">{symptom}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Advisory message ──────────────────────────────────────────────── */}
        <div className="bg-white px-5 py-4 border-b border-gray-100">
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong>Please do not wait for an appointment.</strong> Go to the nearest emergency
            room or call <strong className="text-red-600">108</strong> (National Emergency) immediately.
          </p>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        <div className="bg-white px-5 py-5 space-y-3">
          {/* Primary: Call 108 */}
          <button
            ref={primaryBtnRef}
            type="button"
            onClick={handleCallEmergency}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:scale-[0.98] transition-all shadow shadow-red-200"
            aria-label="Call 108 emergency services"
          >
            <Phone className="w-4 h-4" aria-hidden="true" />
            Call 108 — National Emergency
          </button>

          {/* Secondary: Continue to manual booking */}
          {onContinueManually && (
            <button
              type="button"
              onClick={onContinueManually}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all"
              aria-label="I understand — continue booking a regular appointment"
            >
              I understand, continue booking
              <ChevronRight className="w-4 h-4 opacity-50" aria-hidden="true" />
            </button>
          )}

          <p className="text-center text-xs text-gray-400 leading-snug">
            Your safety is our priority. The AI assistant cannot replace emergency care.
          </p>
        </div>
      </div>
    </div>
  );
}
