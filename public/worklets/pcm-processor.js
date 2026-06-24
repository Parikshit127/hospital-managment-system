/**
 * public/worklets/pcm-processor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AudioWorklet Processor — Phase 3A STT Engine
 *
 * Runs in the AudioWorkletGlobalScope (off the main thread).
 * Receives Float32 audio frames from the browser's audio graph at whatever
 * sample rate the system uses (48 000 Hz on most desktops, 44 100 Hz on
 * some iOS/Safari devices, rarely 32 000 Hz).
 *
 * Responsibilities:
 *   1. Downsample from `sampleRate` → TARGET_SAMPLE_RATE (16 000 Hz).
 *      Groq Whisper and Sarvam both specify 16 kHz mono as their preferred
 *      raw-PCM input format.
 *   2. Convert Float32 samples (range -1.0 … +1.0) to Int16 (PCM-16).
 *   3. Buffer output samples until FRAME_SIZE is reached, then post the
 *      Int16Array buffer to the main thread via `this.port`.
 *
 * The main thread receives these buffers and forwards them over a WebSocket
 * to `app/api/ws/stt/route.ts`, which accumulates them and calls Groq Whisper.
 *
 * Downsampling algorithm: linear interpolation.
 *   • Simple, zero-dependency, runs in under 0.5 ms per 128-sample input frame.
 *   • Good enough for speech recognition (no need for a proper anti-alias
 *     filter at these rates — Whisper itself is robust to minor aliasing).
 *
 * Frame size choice: 4 096 samples @ 16 000 Hz ≈ 256 ms.
 *   • Small enough to keep latency low.
 *   • Large enough to amortise postMessage overhead.
 *   • Divisible by 128 (AudioWorklet quantum), so frames align naturally.
 */

const TARGET_SAMPLE_RATE = 16_000; // Hz — Groq Whisper's preferred sample rate
const FRAME_SIZE = 4_096;          // Int16 samples per dispatch (~256 ms at 16 kHz)

class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);

    // `sampleRate` is a global in AudioWorkletGlobalScope — the actual input
    // sample rate chosen by the browser / OS audio stack.
    this._ratio = sampleRate / TARGET_SAMPLE_RATE;

    // Pending downsampled Float32 samples waiting to fill a frame.
    this._pending = new Float32Array(0);

    // Allow the main thread to stop this processor cleanly.
    this.port.onmessage = (evt) => {
      if (evt.data?.type === 'stop') {
        // Flush any remaining samples as a final (potentially partial) frame.
        this._flush();
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  /**
   * Called by the audio graph for every 128-sample quantum.
   * Must return `true` to keep the processor alive.
   */
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true; // No audio yet — keep alive.
    }

    // Use only the first channel (mono). MediaStreamTrack from getUserMedia
    // delivers mono by default, but we handle stereo inputs gracefully.
    const channelData = input[0];
    const inputLength = channelData.length; // Typically 128 samples.

    // ── Step 1: Downsample from system rate → 16 kHz ─────────────────────────
    const outputLength = Math.floor(inputLength / this._ratio);
    const downsampled = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcPos = i * this._ratio;
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;

      const a = channelData[srcIdx] ?? 0;
      const b = channelData[srcIdx + 1] ?? a; // clamp at end
      downsampled[i] = a + frac * (b - a);    // linear interpolation
    }

    // ── Step 2: Append to pending buffer ─────────────────────────────────────
    const merged = new Float32Array(this._pending.length + downsampled.length);
    merged.set(this._pending, 0);
    merged.set(downsampled, this._pending.length);
    this._pending = merged;

    // ── Step 3: Emit complete FRAME_SIZE frames ───────────────────────────────
    while (this._pending.length >= FRAME_SIZE) {
      const frame = this._pending.slice(0, FRAME_SIZE);
      this._pending = this._pending.slice(FRAME_SIZE);
      this._postPcm16(frame);
    }

    return true; // Keep processor alive.
  }

  /**
   * Convert a Float32Array frame to Int16 PCM and post it to the main thread.
   * Transfers ownership of the underlying ArrayBuffer (zero-copy).
   */
  _postPcm16(float32Frame) {
    const pcm16 = new Int16Array(float32Frame.length);
    for (let i = 0; i < float32Frame.length; i++) {
      // Clamp to [-1, 1] then scale to Int16 range.
      const s = Math.max(-1.0, Math.min(1.0, float32Frame[i]));
      pcm16[i] = s < 0 ? (s * 0x8000) : (s * 0x7FFF);
    }
    // Transfer the buffer — avoids copying ~8 KB across the thread boundary.
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
  }

  /**
   * Send any buffered samples that didn't fill a complete FRAME_SIZE frame.
   * Called on 'stop' so the final word of the utterance is not lost.
   */
  _flush() {
    if (this._pending.length > 0) {
      this._postPcm16(this._pending);
      this._pending = new Float32Array(0);
    }
  }
}

registerProcessor('pcm-processor', PcmProcessor);
