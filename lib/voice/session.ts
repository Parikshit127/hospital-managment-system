// lib/voice/session.ts — [A] VoiceSession implementation
// Implements the frozen VoiceSession interface from lib/contracts/voice.ts

import type { LanguageCode, VoiceSession } from '@/lib/contracts/voice';
import { listenOnce } from './stt';
import { speakText, stopSpeaking } from './tts';

/**
 * Creates a VoiceSession instance that implements the frozen contract.
 * Track B consumes this via the interface only.
 *
 * Pass `'auto'` when the patient's language isn't known yet (the normal case
 * now that there's no language-picker screen): the session starts in English
 * for TTS purposes, and locks to whatever language `listen()` detects from the
 * patient's first real (non yes/no) utterance. Pass a concrete `LanguageCode`
 * to skip detection (e.g. a QA override).
 */
export function createVoiceSession(
  language: LanguageCode | 'auto',
  opts?: { accurate?: boolean },
): VoiceSession {
  const memory = new Map<string, unknown>();
  let currentLanguage: LanguageCode = language === 'auto' ? 'en' : language;
  let locked = language !== 'auto';

  const session: VoiceSession = {
    get language(): LanguageCode {
      return currentLanguage;
    },

    async listen(expectedType?: 'boolean' | 'text'): Promise<{ text: string; confidence: number }> {
      if (!locked && expectedType !== 'boolean') {
        const result = await listenOnce(currentLanguage, 15000, expectedType, {
          autoDetect: true,
          accurate: opts?.accurate,
        });
        if (result.detectedLanguage) {
          currentLanguage = result.detectedLanguage;
        }
        locked = true;
        return result;
      }
      return listenOnce(currentLanguage, 15000, expectedType, { accurate: opts?.accurate });
    },

    async speak(text: string): Promise<void> {
      return speakText(text, currentLanguage);
    },

    get<T>(key: string): T | undefined {
      return memory.get(key) as T | undefined;
    },

    set<T>(key: string, value: T): void {
      memory.set(key, value);
    },
  };

  return session;
}

/**
 * Stop any ongoing voice activity.
 */
export function stopVoice(): void {
  stopSpeaking();
}

export { isSTTSupported } from './stt';
export { isTTSSupported, preloadVoices } from './tts';
