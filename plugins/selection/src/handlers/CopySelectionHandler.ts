// CopySelectionHandler — `copy-selection`.  TASK-08 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18).
//
// Option A implementation: surfaces "not yet available" rejection so the
// command bus returns a typed ValidationResult to the caller instead of
// silently swallowing an unhandled command.
//
// Contract compliance:
//   • P6 — copy-selection must be a registered command (no silent no-op).
//   • C11 §5.2 — all mutations via command bus; copy is read-only,
//     so `forward/inverse` are empty (C20 §3 — copy is not undoable).
//   • C10 §2 — every handler wraps execution in a withHandlerSpan for OTel.
//
// Upgrade path (Option B): when full clipboard support is ready, replace
// canExecute to return `{ valid: true }` and implement execute() to
// serialise selected elements into a module-level clipboardStore.
//
// Anchor: docs/03_PRYZM3/MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18.md TASK-08

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';

export type CopySelectionPayload = Record<string, never>;

export class CopySelectionHandler
  implements CommandHandler<CopySelectionPayload>
{
  readonly type = 'copy-selection';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext,
    _cmd: CopySelectionPayload,
  ): ValidationResult {
    return {
      valid: false,
      reason: 'Copy/paste not yet implemented — coming soon',
    };
  }

  execute(
    _ctx: HandlerContext,
    _cmd: CopySelectionPayload,
  ): HandlerResult {
    return withHandlerSpan(
      this.type + '.handler',
      { 'pryzm.command.type': this.type },
      () => {
        console.warn('[copy-selection.handler] copy-selection is not yet implemented.');
        return { forward: [], inverse: [] };
      },
    );
  }
}
