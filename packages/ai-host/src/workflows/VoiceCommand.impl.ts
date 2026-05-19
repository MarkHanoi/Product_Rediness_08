// @pryzm/ai-host — VoiceCommand IMPL chunk (S52 D5).
//
// CRITICAL: per K3-A this module is loaded ONLY via dynamic
// `import('./VoiceCommand.impl.js')` from `VoiceCommand.ts`. NO
// other module in the editor's L7-or-below cold-start path may
// statically reference this file. The static enforcer
// `scripts/check-ai-host-lazy.mjs` validates the contract at
// build / CI time.
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S52
//     lines 470-487 — voice command pipeline.
//   • [strategic ADR-014] — voice surface lives at L7.5 alongside
//     the rest of the AI plane.
//
// PIPELINE per spec lines 480-485:
//
//   1. Caller hands the impl an audio buffer + a palette adapter.
//   2. Impl transcribes via the porter (Whisper-tiny on-device first;
//      LLM fallback only when confidence < 0.6).
//   3. Matches the text against the palette adapter (fuzzy match —
//      the palette decides what's a match).
//   4. If no match: enqueue a `'rejected'` action so the user knows
//      the transcription was heard but not actionable.
//   5. If match: enqueue ONE pending action carrying the matched
//      palette command + the transcription text in the preview.
//      The user confirms (or rejects) via the approval queue UI.
//
// No state mutates without explicit user confirmation per spec
// line 484.

import type {
  AiApprovalQueueLike,
  AiPendingAction,
  CommandPayloadRef,
  WorkflowExecutionContext,
  WorkflowImpl,
  WorkflowRunResult,
} from '../types.js';
import type {
  TranscribeRequest,
  TranscribeResponse,
  VoiceTranscriberPorter,
} from './VoiceCommand.js';
import { voiceCommandDescriptor } from './VoiceCommand.js';

/** Confidence threshold for skipping the LLM fallback. Per spec
 *  line 483 — high-confidence transcriptions go straight to the
 *  palette; low-confidence ones get re-classified by an LLM. The
 *  LLM fallback itself ships at S55+; until then we treat anything
 *  under this threshold as unactionable. */
export const VOICE_CONFIDENCE_THRESHOLD = 0.6;

/** Adapter contract for the editor's command palette. The palette
 *  knows about every registered editor command and can fuzzy-match
 *  free-form text to a `CommandPayloadRef`. The voice impl talks
 *  to it through this minimal interface so the ai-host package
 *  doesn't drag the editor in. */
export interface PaletteAdapter {
  /** Returns the best palette match for the supplied text, or
   *  `null` if no match exceeds the palette's own threshold. */
  match(text: string): PaletteMatch | null;
}

/** A single palette match. */
export interface PaletteMatch {
  /** The command + payload to dispatch on user confirmation. */
  readonly command: CommandPayloadRef;
  /** The display label that will surface in the approval-queue card
   *  (e.g. "Create wall"). */
  readonly label: string;
  /** Match score from the palette [0, 1] — used to break ties when
   *  the queue card shows a confidence bar. */
  readonly score: number;
}

/** Result of one voice-command run — discriminated on `status`. */
export type VoiceCommandResult =
  | {
      readonly status: 'ok';
      /** The transcribed text the palette matched against. */
      readonly transcription: string;
      /** The transcription confidence [0, 1]. */
      readonly transcriptionConfidence: number;
      /** The matched palette entry. */
      readonly match: PaletteMatch;
      /** Total cost in USD (transcription + any fallback). */
      readonly totalCostUsd: number;
    }
  | {
      readonly status: 'rejected';
      /** Human-readable reason — the queue UI surfaces this verbatim. */
      readonly reason: string;
      /** When rejection happened post-transcription, the text the
       *  user said (so they can re-try with a different phrasing). */
      readonly transcription?: string;
      readonly transcriptionConfidence?: number;
      /** Cost incurred up to the point of rejection (may be > 0
       *  even on rejection — the transcription still ran). */
      readonly totalCostUsd: number;
    };

/** Dependencies the impl needs at run time. */
export interface VoiceCommandDeps {
  readonly transcriber: VoiceTranscriberPorter;
  readonly approvalQueue: AiApprovalQueueLike;
  readonly palette: PaletteAdapter;
  /** Optional hook so tests can introspect the per-match action. */
  readonly onMatchEnqueued?: (action: AiPendingAction, match: PaletteMatch) => void;
  /** Clock injection — defaults to Date.now. */
  readonly now?: () => number;
}

/** Input the plane hands to the impl through `ctx.input`. */
export interface VoiceCommandInput {
  readonly audio: ArrayBuffer;
  readonly language?: string;
}

/** Returned by the impl as `WorkflowRunResult`. */
export interface VoiceCommandWorkflowResult extends WorkflowRunResult {
  readonly actualCostUsd: number;
  readonly preview: { kind: 'json'; data: VoiceCommandResult };
}

/** Factory returning the `WorkflowImpl` the AiPlane invokes. */
export function createVoiceCommandImpl(deps: VoiceCommandDeps): WorkflowImpl {
  const now = deps.now ?? (() => Date.now());

  return async function voiceCommandImpl(
    ctx: WorkflowExecutionContext,
  ): Promise<VoiceCommandWorkflowResult> {
    const input = (ctx.input ?? null) as VoiceCommandInput | null;
    if (!input || !input.audio || !(input.audio instanceof ArrayBuffer)) {
      const result: VoiceCommandResult = {
        status: 'rejected',
        reason: 'VoiceCommand requires { audio: ArrayBuffer } in workflow input.',
        totalCostUsd: 0,
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: 'json', data: result },
      };
    }

    // 1. Transcribe.
    const transcribeReq: TranscribeRequest = input.language
      ? { audio: input.audio, language: input.language }
      : { audio: input.audio };
    let transcription: TranscribeResponse;
    try {
      transcription = await deps.transcriber.transcribe(transcribeReq);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const result: VoiceCommandResult = {
        status: 'rejected',
        reason: `Transcription failed: ${reason}`,
        totalCostUsd: 0,
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: 'json', data: result },
      };
    }

    const totalCostUsd = transcription.costUsd;

    // 2. Confidence gate.
    if (transcription.confidence < VOICE_CONFIDENCE_THRESHOLD) {
      const result: VoiceCommandResult = {
        status: 'rejected',
        reason: `Transcription confidence ${transcription.confidence.toFixed(2)} below threshold ${VOICE_CONFIDENCE_THRESHOLD.toFixed(2)} — please retry.`,
        transcription: transcription.text,
        transcriptionConfidence: transcription.confidence,
        totalCostUsd,
      };
      return {
        proposedCommands: [],
        actualCostUsd: totalCostUsd,
        preview: { kind: 'json', data: result },
      };
    }

    // 3. Empty-text guard — high-confidence-but-silent.
    if (transcription.text.trim().length === 0) {
      const result: VoiceCommandResult = {
        status: 'rejected',
        reason: 'Transcription was empty — no speech detected.',
        transcription: '',
        transcriptionConfidence: transcription.confidence,
        totalCostUsd,
      };
      return {
        proposedCommands: [],
        actualCostUsd: totalCostUsd,
        preview: { kind: 'json', data: result },
      };
    }

    // 4. Palette match.
    const match = deps.palette.match(transcription.text);
    if (!match) {
      const result: VoiceCommandResult = {
        status: 'rejected',
        reason: `No command palette entry matches "${transcription.text}".`,
        transcription: transcription.text,
        transcriptionConfidence: transcription.confidence,
        totalCostUsd,
      };
      return {
        proposedCommands: [],
        actualCostUsd: totalCostUsd,
        preview: { kind: 'json', data: result },
      };
    }

    // 5. Enqueue confirm action — ONE per-match action carrying the
    //    palette command. The parent action (synthesised by the
    //    plane) summarises the run.
    // `runId` is set so the queue UI can group this child action
    // with the parent without parsing the `id` string.
    const matchAction: AiPendingAction = {
      id: `${ctx.runId}-cmd`,
      runId: ctx.runId,
      workflow: voiceCommandDescriptor.kind, // 'voice'
      proposedCommands: [match.command],
      estimatedCostUsd: 0, // per-match action carries no incremental cost
      preview: {
        kind: 'json',
        data: {
          transcription: transcription.text,
          confidence: transcription.confidence,
          paletteLabel: match.label,
          paletteScore: match.score,
        },
      },
      createdAt: now(),
      status: 'pending',
    };
    deps.approvalQueue.enqueue(matchAction);
    deps.onMatchEnqueued?.(matchAction, match);

    const result: VoiceCommandResult = {
      status: 'ok',
      transcription: transcription.text,
      transcriptionConfidence: transcription.confidence,
      match,
      totalCostUsd,
    };

    return {
      proposedCommands: [], // parent zero-command — confirmation happens at the per-match action
      actualCostUsd: totalCostUsd,
      preview: { kind: 'json', data: result },
    };
  };
}
