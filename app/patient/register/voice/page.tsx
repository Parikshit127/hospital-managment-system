// app/patient/register/voice/page.tsx — [A] Voice registration route
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import type { LanguageCode, RegistrationResult } from '@/lib/contracts/voice';
import { createVoiceSession, isSTTSupported, preloadVoices } from '@/lib/voice/session';
import { requestMicPermission } from '@/lib/voice/stt';
import { unlockAudio, stopSpeaking } from '@/lib/voice/tts';
import {
  RegistrationFSM,
  type FSMContext,
  type OrgOption,
} from '@/lib/registration/field-fsm';
import type { FieldName } from '@/lib/registration/field-specs';
import { VoiceMicButton } from '@/app/components/voice/VoiceMicButton';
import { VoiceTranscript } from '@/app/components/voice/VoiceTranscript';
import { VoiceShell } from '@/app/components/voice/VoiceShell';
import { VoiceFormMirror } from '@/app/components/registration/VoiceFormMirror';
import { RegistrationSuccess } from '@/app/components/registration/RegistrationSuccess';

// ─── Mock booking handler (Track B placeholder) ────────────────────────────────
function mockBookingHandler(result: RegistrationResult): void {
  console.log('[Track A → Seam] RegistrationResult emitted:', result);
  console.log('[Mock Booking Handler] Would proceed to Track B with:', {
    patientId: result.patientId,
    organisationId: result.organisationId,
    language: result.language,
    patientName: result.patientName,
  });
}

export default function VoiceRegistrationPage() {
  // ─── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'start' | 'registration' | 'success'>('start');
  // Tracks whatever language the assistant has detected/is using right now —
  // starts English, flips once the patient's first answer is auto-detected.
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [sttSupported, setSttSupported] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [fsmCtx, setFsmCtx] = useState<FSMContext | null>(null);
  const [registrationResult, setRegistrationResult] = useState<RegistrationResult | null>(null);
  const [successPatientId, setSuccessPatientId] = useState<string>('');
  const [successPassword, setSuccessPassword] = useState<string>('');

  const fsmRef = useRef<RegistrationFSM | null>(null);
  const sessionRef = useRef<ReturnType<typeof createVoiceSession> | null>(null);

  // ─── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setSttSupported(isSTTSupported());
    preloadVoices();

    // Fetch organisations
    fetch('/api/organisations')
      .then(r => r.json())
      .then(d => {
        setOrgs(
          (d.orgs || []).map((o: any) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            address: o.address,
          })),
        );
        setOrgsLoading(false);
      })
      .catch(() => setOrgsLoading(false));
  }, []);

  // ─── Start: mic permission + consent gesture, then straight into the ───────
  // conversation. There's no language step — the assistant auto-detects
  // English vs. Hindi from the patient's first answer.
  const handleStart = async () => {
    // Unlock HTML5 Audio context synchronously upon this user gesture
    unlockAudio();

    const granted = await requestMicPermission();
    setMicPermission(granted);
    if (!granted) return;

    setStep('registration');

    const session = createVoiceSession('auto');
    sessionRef.current = session;

    const fsm = new RegistrationFSM(
      session,
      orgs,
      (ctx) => {
        setFsmCtx({ ...ctx });
        setLanguage(session.language);
      },
      (formData, patientId, password, setupLink) => {
        setSuccessPatientId(patientId);
        setSuccessPassword(password ?? '');

        const result: RegistrationResult = {
          patientId,
          organisationId: formData.org_id,
          language: session.language,
          patientName: formData.full_name,
          setupLink,
        };

        setRegistrationResult(result);
        mockBookingHandler(result);
        setStep('success');
      },
    );

    fsmRef.current = fsm;
    fsm.start();
  };

  // ─── Manual input handler ──────────────────────────────────────────────────
  const handleManualChange = useCallback((field: FieldName, value: string) => {
    if (fsmRef.current) {
      fsmRef.current.handleManualInput(field, value);
    }
  }, []);

  // ─── Resume after manual fallback ──────────────────────────────────────────
  const handleResumeFallback = useCallback(() => {
    if (fsmRef.current) {
      fsmRef.current.resumeAfterFallback();
    }
  }, []);

  // ─── Manual submit (if voice save failed) ──────────────────────────────────
  const handleManualSubmit = useCallback(() => {
    if (fsmRef.current) {
      fsmRef.current.submitManually();
    }
  }, []);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      fsmRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  // ─── Render: Start Screen (mic permission + one-tap start) ─────────────────
  if (step === 'start') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-6 sm:py-10 px-4">
        <div className="max-w-lg mx-auto">
          <Link
            href="/patient/register"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 sm:mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Registration
          </Link>

          <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 sm:px-8 py-6 sm:py-8 text-white text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mic className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-black">AI Voice Assistant</h1>
              <p className="text-emerald-100 text-sm mt-1">
                Register by speaking — no typing needed
              </p>
              <p className="text-emerald-50 text-xs mt-2">
                बोलकर पंजीकरण करें — अंग्रेज़ी या हिंदी में बोलें
              </p>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {sttSupported === false && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                  <MicOff className="w-4 h-4 shrink-0" />
                  Your browser does not support speech recognition. Please use Chrome on desktop or Android.
                </div>
              )}

              <div className="space-y-3">
                <h2 className="font-bold text-gray-800">Before we begin</h2>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 text-sm text-gray-700">
                  <p>
                    <Volume2 className="w-4 h-4 inline mr-1 text-blue-500" />
                    This assistant will <strong>use your microphone</strong> to understand your speech and help you fill the registration form. You can answer in <strong>English or Hindi</strong> — it will follow whichever you use.
                  </p>
                  <p>Your voice data is processed locally in your browser and is not stored or recorded.</p>
                  <p>You can correct any field at any time by tapping on the form, and you can switch to manual entry at any point.</p>
                </div>
              </div>

              {micPermission === false && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
                  Microphone access was denied. Please allow microphone access in your browser settings and try again.
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={sttSupported === false || orgsLoading}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-xl hover:from-emerald-600 hover:to-teal-700 transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm min-h-[44px]"
              >
                {orgsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" /> Tap to Start Speaking
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                By continuing, you consent to voice capture and processing for registration purposes.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Success ───────────────────────────────────────────────────────
  if (step === 'success' && registrationResult) {
    // Route to the "Choose Next Step" interstitial. The patient is auto-logged-in,
    // so the booking pages resolve their identity from the session.
    return (
      <RegistrationSuccess
        patientId={successPatientId}
        password={successPassword}
        redirectTo="/patient/appointments/choose-method"
        ctaLabel="Continue"
      />
    );
  }

  // ─── Render: Voice Registration Flow ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/patient/register"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Registration
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 items-start">
          {/* Left panel: Voice interface */}
          <div className="lg:col-span-1 lg:sticky lg:top-6">
            <div className="bg-white rounded-3xl shadow-2xl shadow-emerald-900/5 overflow-hidden border border-emerald-50">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 sm:px-6 py-4 sm:py-5 text-white">
                <h2 className="font-black text-lg">Voice Assistant</h2>
                <p className="text-emerald-100 text-xs mt-0.5">
                  {language === 'hi' ? 'बोलकर फॉर्म भरें' : 'Fill the form by speaking'}
                </p>
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                {fsmCtx && (
                  <VoiceShell
                    state={fsmCtx.state}
                    currentFieldIndex={fsmCtx.currentFieldIndex}
                  >
                    {/* Mic button */}
                    <div className="flex justify-center py-4">
                      <VoiceMicButton
                        isListening={fsmCtx.isListening}
                        isSpeaking={fsmCtx.isSpeaking}
                        isProcessing={fsmCtx.isProcessing}
                      />
                    </div>
                  </VoiceShell>
                )}

                {/* Transcript */}
                {fsmCtx && fsmCtx.transcriptLog.length > 0 && (
                  <VoiceTranscript
                    entries={fsmCtx.transcriptLog}
                    maxHeight="400px"
                  />
                )}

                {/* Error state */}
                {fsmCtx?.state === 'SAVE_ERROR' && (
                  <div className="space-y-3">
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                      {fsmCtx.error || 'Registration save failed.'}
                    </div>
                    <button
                      onClick={handleManualSubmit}
                      className="w-full py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition text-sm"
                    >
                      Retry Save
                    </button>
                  </div>
                )}

                {/* Manual fallback prompt */}
                {fsmCtx?.state === 'MANUAL_FALLBACK' && (
                  <div className="space-y-3">
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
                      {language === 'hi'
                        ? 'कृपया इस फ़ील्ड को दाईं ओर फॉर्म में टाइप करें, फिर "जारी रखें" दबाएं।'
                        : 'Please type this field in the form on the right, then press "Continue".'}
                    </div>
                    <button
                      onClick={handleResumeFallback}
                      className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition text-sm"
                    >
                      {language === 'hi' ? 'जारी रखें →' : 'Continue →'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right panel: Form mirror */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl shadow-2xl shadow-emerald-900/5 overflow-hidden border border-emerald-50">
              <div className="bg-gray-50/80 border-b border-gray-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-gray-800 text-sm">Registration Form</h2>
                  <p className="text-xs text-gray-500">
                    {language === 'hi'
                      ? 'स्वचालित रूप से भरा जा रहा है — किसी भी फ़ील्ड पर टैप करके सुधार करें'
                      : 'Auto-filling via voice — tap any field to correct'}
                  </p>
                </div>
                {fsmCtx?.state === 'DONE' && (
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full shrink-0">
                    ✓ Complete
                  </span>
                )}
              </div>

              <div className="p-4 sm:p-6">
                {fsmCtx ? (
                  <VoiceFormMirror
                    formData={fsmCtx.formData}
                    organisations={orgs}
                    currentFieldIndex={fsmCtx.currentFieldIndex}
                    onManualChange={handleManualChange}
                  />
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
