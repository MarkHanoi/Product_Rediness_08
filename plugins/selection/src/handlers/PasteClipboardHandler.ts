// PasteClipboardHandler — `paste-clipboard`.  TASK-08 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18).
//
// Option A implementation: surfaces "not yet available" rejection so the
// command bus returns a typed ValidationResult to the caller instead of
// silently swallowing an unhandled command.
//
// Contract compliance:
//   • P6 — paste-clipboard must be a registered command (no silent no-op).
//   • C11 §5.2 — all mutations via command bus.
//   • C10 §2 — every handler wraps execution in a withHandlerSpan for OTel.
//
// Upgrade path (Option B): when full clipboard support is ready, replace
// canExecute to return `{ valid: true }` only when clipboard data exists,
// and implement execute() to dispatch individual element.create commands
// for each copied element (those individual commands produce Ring Buffer
// patches — paste is undone by undoing each creation).
//
// Anchor: docs/03_PRYZM3/MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18.md TASK-08

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';

export type PasteClipboardPayload = Record<string, never>;

export class PasteClipboardHandler
  implements CommandHandler<PasteClipboardPayload>
{
  readonly type = 'paste-clipboard';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext,
    _cmd: PasteClipboardPayload,
  ): ValidationResult {
    return {
      valid: false,
      reason: 'Copy/paste not yet implemented — coming soon',
    };
  }

  execute(
    _ctx: HandlerContext,
    _cmd: PasteClipboardPayload,
  ): HandlerResult {
    return withHandlerSpan(
      this.type + '.handler',
      { 'pryzm.command.type': this.type },
      () => {
        console.warn('[paste-clipboard.handler] paste-clipboard is not yet implemented.');
        return { forward: [], inverse: [] };
      },
    );
  }
}
