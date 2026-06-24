// lib/voice/session.ts — [A] VoiceSession implementation
// Implements the frozen VoiceSession interface from lib/contracts/voice.ts

import type { LanguageCode, VoiceSession } from '@/lib/contracts/voice';
import { listenOnce } from './stt';
import { speakText, stopSpeaking } from './tts';

/**
 * Creates a VoiceSession instance that implements the frozen contract.
 * Track B consumes this via the interface only.
 */
export function createVoiceSession(language: LanguageCode): VoiceSession {
  const memory = new Map<string, unknown>();

  const session: VoiceSession = {
    language,

    async listen(expectedType?: 'boolean' | 'text'): Promise<{ text: string; confidence: number }> {
      return listenOnce(language, 15000, expectedType);
    },

    async speak(text: string): Promise<void> {
      return speakText(text, language);
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
