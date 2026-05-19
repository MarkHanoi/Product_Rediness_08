// @pryzm/runtime-undo-stack — public barrel.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
// C.6.02 (Cmd+Z + Undo button) and C.6.03 (Cmd+Shift+Z + Redo button).
// Phase C ships the slot + a backward-compat adapter that delegates to
// the legacy `(window as any).commandManager`; Phase D replaces the
// adapter with a real Immer-reverse-apply backend hooked to the L0
// EventLog's per-event inverse patches.
//
// A16-T9 (2026-05-03): CommandHistoryBackend — Phase D ring-buffer backend.
// maxSize configurable (default: 200); silently discards oldest on cap (C03 §4.2).

export {
  UndoStack,
  NullUndoStackBackend,
  LegacyCommandManagerAdapter,
} from './UndoStack.js';

export type {
  UndoStackState,
  UndoStackSubscription,
  UndoStackBackend,
  LegacyCommandManagerLike,
} from './UndoStack.js';

// Wave A16 S123 (A16-T9) — Phase D real backend with configurable ring-buffer cap.
// CONTRACT: C03 §4.2 — ring buffer size MUST be configurable (default: 200 commands).
export { RingBufferUndoStack } from './RingBufferUndoStack.js';

export type {
  PatchPair,
  PatchSide,
  JsonPatchOp,
  RingBufferUndoStackOptions,
} from './RingBufferUndoStack.js';
