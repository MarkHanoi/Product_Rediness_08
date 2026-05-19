// @pryzm/ai-host — VoiceCommand lazy entry (S52 D5).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S52
//     lines 470-487 — voice command surface + lazy chunk requirement
//     ("Per K3-A the voice module must remain a separate chunk; its
//     presence in the editor's first-paint bundle is a kill-switch
//     trigger.").
//   • SPEC-28 §3 — per-call ceiling $0.18; voice descriptor estimate
//     $0.02 (Whisper-tiny on-device + thin LLM intent fallback).
//
// PUBLIC ENTRY: `getVoiceCommand()` returns a Promise of the impl
// module. The impl module sits in a separate file and is loaded via
// `await import('./VoiceCommand.impl.js')` so Vite tree-shakes it
// out of the editor's first-paint bundle. The K3-A static enforcer
// (`scripts/check-ai-host-lazy.mjs`) validates that no L7-or-below
// module statically references `./VoiceCommand.impl`.
//
// PORTER pattern: `VoiceTranscriberPorter` is the contract for any
// transcription backend (on-device Whisper, server-side Whisper,
// browser Web Speech API). Real Whisper-tiny binding ships at S55+;
// the `MockVoiceTranscriber` returns deterministic text for test
// fixtures.

import type { WorkflowDescriptor } from '../types.js';

/** Single transcription request. */
export interface TranscribeRequest {
  /** PCM audio buffer (16-bit signed, 16 kHz, mono) — the editor's
   *  mic-stream wrapper resamples whatever WebAudio produces into
   *  this canonical shape. */
  readonly audio: ArrayBuffer;
  /** Optional BCP-47 language hint (e.g. `'en-US'`). When omitted
   *  the porter defaults to the workspace language. */
  readonly language?: string;
}

/** Single transcription response. */
export interface TranscribeResponse {
  /** Concatenated text from all detected speech segments. */
  readonly text: string;
  /** Confidence score [0, 1] from the upstream model. The voice
   *  workflow uses this as a routing signal — high-confidence
   *  transcriptions go straight to palette match, low-confidence
   *  ones fall back to LLM intent classification per spec line 483. */
  readonly confidence: number;
  /** Cost in USD for this transcription (covers Whisper-tiny + the
   *  fallback LLM call if it ran). */
  readonly costUsd: number;
}

/** Porter contract. */
export interface VoiceTranscriberPorter {
  transcribe(req: TranscribeRequest): Promise<TranscribeResponse>;
}

/** Mock transcriber used by tests + the local-dev path until the
 *  real Whisper binding ships at S55+. The mock pattern-matches on
 *  the audio buffer's length to return deterministic fixture text:
 *
 *    • length === 1024  → "create a wall here"     (canonical fixture)
 *    • length === 2048  → "delete this column"     (canonical fixture)
 *    • length === 4096  → ""                       (silence simulation)
 *    • length === 0     → throws (loud about empty buffers)
 *    • everything else  → "select all"             (fallback fixture)
 *
 *  Cost is fixed at $0.001 (Whisper-tiny at ~1¢ per minute → 0.1¢
 *  per 1-second clip). */
export class MockVoiceTranscriber implements VoiceTranscriberPorter {
  readonly kind = 'mock' as const;

  async transcribe(req: TranscribeRequest): Promise<TranscribeResponse> {
    if (!req.audio || req.audio.byteLength === 0) {
      throw new Error('[ai-host/VoiceCommand] MockVoiceTranscriber: audio buffer is empty.');
    }
    const len = req.audio.byteLength;
    let text: string;
    let confidence: number;
    if (len === 1024) {
      text = 'create a wall here';
      confidence = 0.95;
    } else if (len === 2048) {
      text = 'delete this column';
      confidence = 0.92;
    } else if (len === 4096) {
      text = '';
      confidence = 0.10;
    } else {
      text = 'select all';
      confidence = 0.78;
    }
    return { text, confidence, costUsd: 0.001 };
  }
}

/** Selector mirroring `loadRelay` from `AnthropicRelay.ts`. Returns
 *  the mock unless `WHISPER_TRANSCRIBER_URL` is set (in which case
 *  the real on-device or server-side adapter would be loaded via
 *  dynamic import — that adapter ships at S55+). */
export async function loadTranscriber(
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<VoiceTranscriberPorter> {
  const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {});
  const url = env.WHISPER_TRANSCRIBER_URL;
  if (!url) return new MockVoiceTranscriber();
  // Real adapter lands at S55+; for now fall through.
  // Indirect-eval `Function('s', 'return import(s)')` + non-literal
  // specifier so Vite/Rollup cannot statically resolve the missing
  // module at bundle time (which would break `vite build`).
  try {
    const dynImport = (new Function('s', 'return import(s)') as (s: string) => Promise<unknown>);
    const specifier = './' + 'WhisperTranscriber.js';
    const mod = await dynImport(specifier);
    if (mod && typeof (mod as { createWhisperTranscriber?: unknown }).createWhisperTranscriber === 'function') {
      return (mod as { createWhisperTranscriber: (u: string) => VoiceTranscriberPorter }).createWhisperTranscriber(url);
    }
  } catch {
    // Adapter not yet shipped — fall through to mock.
  }
  return new MockVoiceTranscriber();
}

/** Stable descriptor surface — exported here at the lazy-entry level
 *  (not from `VoiceCommand.impl.ts`) so the workflow registry can
 *  enumerate it without triggering the impl chunk load. The plane
 *  registers `{descriptor, lazyImpl}` and only resolves the impl on
 *  the first `submit('voice-command', ...)` call. */
export const voiceCommandDescriptor: WorkflowDescriptor = {
  id: 'voice-command',
  title: 'Voice command',
  kind: 'voice',
  // Whisper-tiny on-device for first pass + ~$0.01 LLM intent
  // fallback when confidence < 0.6 = $0.02 ceiling per call.
  estimatedCostUsd: 0.02,
  surface: 'ai.voice.command',
  description:
    'Captures a short audio clip from the mic, transcribes it (Whisper-tiny on-device), matches the resulting text against the command palette, and enqueues a confirm action so the user can approve before any state mutates.',
};

/** Cached impl module promise. The lazy-load pattern matches
 *  `getAiHost()` from `AiHost.ts`. */
let _voiceModule: Promise<typeof import('./VoiceCommand.impl.js')> | null = null;

/** Public entry — returns the impl module. Each call after the first
 *  resolves to the *same* cached promise (identity-equal under
 *  `===`, which the K3-A static check relies on to prove only one
 *  dynamic-import roundtrip happens per editor session).
 *
 *  ⚠ Intentionally NOT `async` — an `async function` would wrap the
 *  cached promise in a fresh outer Promise on every call, defeating
 *  the identity check. Returning the cached promise directly keeps
 *  `getVoiceCommand() === getVoiceCommand()` true. */
export function getVoiceCommand(): Promise<typeof import('./VoiceCommand.impl.js')> {
  if (!_voiceModule) {
    _voiceModule = import('./VoiceCommand.impl.js');
  }
  return _voiceModule;
}

/** Test-only — clears the cache so a follow-up `getVoiceCommand()`
 *  triggers a fresh dynamic import. */
export function _resetVoiceCommandLoaderForTesting(): void {
  _voiceModule = null;
}
