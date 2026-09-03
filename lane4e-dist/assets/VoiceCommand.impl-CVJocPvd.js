import { voiceCommandDescriptor } from './index-m083WJ2t.js';
import './preload-helper-CJHylW7d.js';
import './trace-api-BIfvUk_c.js';
import './index-CtIMEkHY.js';
import './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';
import './CreatePlumbingFixtureCommand-DUwQtpaf.js';
import './CfWorkerRelay-DzqGT6yO.js';

const VOICE_CONFIDENCE_THRESHOLD = 0.6;
function createVoiceCommandImpl(deps) {
  const now = deps.now ?? (() => Date.now());
  return async function voiceCommandImpl(ctx) {
    const input = ctx.input ?? null;
    if (!input || !input.audio || !(input.audio instanceof ArrayBuffer)) {
      const result2 = {
        status: "rejected",
        reason: "VoiceCommand requires { audio: ArrayBuffer } in workflow input.",
        totalCostUsd: 0
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: "json", data: result2 }
      };
    }
    const transcribeReq = input.language ? { audio: input.audio, language: input.language } : { audio: input.audio };
    let transcription;
    try {
      transcription = await deps.transcriber.transcribe(transcribeReq);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const result2 = {
        status: "rejected",
        reason: `Transcription failed: ${reason}`,
        totalCostUsd: 0
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: "json", data: result2 }
      };
    }
    const totalCostUsd = transcription.costUsd;
    if (transcription.confidence < VOICE_CONFIDENCE_THRESHOLD) {
      const result2 = {
        status: "rejected",
        reason: `Transcription confidence ${transcription.confidence.toFixed(2)} below threshold ${VOICE_CONFIDENCE_THRESHOLD.toFixed(2)} — please retry.`,
        transcription: transcription.text,
        transcriptionConfidence: transcription.confidence,
        totalCostUsd
      };
      return {
        proposedCommands: [],
        actualCostUsd: totalCostUsd,
        preview: { kind: "json", data: result2 }
      };
    }
    if (transcription.text.trim().length === 0) {
      const result2 = {
        status: "rejected",
        reason: "Transcription was empty — no speech detected.",
        transcription: "",
        transcriptionConfidence: transcription.confidence,
        totalCostUsd
      };
      return {
        proposedCommands: [],
        actualCostUsd: totalCostUsd,
        preview: { kind: "json", data: result2 }
      };
    }
    const match = deps.palette.match(transcription.text);
    if (!match) {
      const result2 = {
        status: "rejected",
        reason: `No command palette entry matches "${transcription.text}".`,
        transcription: transcription.text,
        transcriptionConfidence: transcription.confidence,
        totalCostUsd
      };
      return {
        proposedCommands: [],
        actualCostUsd: totalCostUsd,
        preview: { kind: "json", data: result2 }
      };
    }
    const matchAction = {
      id: `${ctx.runId}-cmd`,
      runId: ctx.runId,
      workflow: voiceCommandDescriptor.kind,
      // 'voice'
      proposedCommands: [match.command],
      estimatedCostUsd: 0,
      // per-match action carries no incremental cost
      preview: {
        kind: "json",
        data: {
          transcription: transcription.text,
          confidence: transcription.confidence,
          paletteLabel: match.label,
          paletteScore: match.score
        }
      },
      createdAt: now(),
      status: "pending"
    };
    deps.approvalQueue.enqueue(matchAction);
    deps.onMatchEnqueued?.(matchAction, match);
    const result = {
      status: "ok",
      transcription: transcription.text,
      transcriptionConfidence: transcription.confidence,
      match,
      totalCostUsd
    };
    return {
      proposedCommands: [],
      // parent zero-command — confirmation happens at the per-match action
      actualCostUsd: totalCostUsd,
      preview: { kind: "json", data: result }
    };
  };
}

export { VOICE_CONFIDENCE_THRESHOLD, createVoiceCommandImpl };
