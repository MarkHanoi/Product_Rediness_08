// PasteClipboardHandler — `paste-clipboard`.  TASK-08 / §FIX-COPY-PASTE (L-84).
//
// Re-creates every element captured by `copy-selection` as a NEW element with
// a fresh id, translated by a small offset, on the SAME level as the source.
// Re-creation is delegated to the injected `SelectionPastePort`, whose
// concrete implementation (in the app composition root) routes the mutation
// through a registered command — so paste is undoable (P6). Each copied
// element becomes its own command; undoing paste is undoing each creation.
//
// This handler itself returns empty forward/inverse patches: the real store
// mutations happen inside the port's command(s), not here, so the bus records
// `paste-clipboard` as a side-effecting audit event without double-counting
// the child creations on the ring buffer (see CommandBus §U-B2/§U-B5).
//
// Contract compliance:
//   • P6 — mutation goes through the port's registered command, never a
//     direct store write.
//   • C10 §2 — execution is wrapped in a withHandlerSpan for OTel.
//
// Anchor: docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md L-84

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import {
  selectionClipboard,
  DEFAULT_PASTE_OFFSET,
  type SelectionClipboard,
  type SelectionPastePort,
  type PasteOffset,
} from '../clipboard.js';

export type PasteClipboardPayload = Record<string, never>;

/** Generate a fresh element id. Node ≥20 and browsers both expose crypto. */
function freshId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class PasteClipboardHandler
  implements CommandHandler<PasteClipboardPayload>
{
  readonly type = 'paste-clipboard';
  readonly affectedStores = [] as const;

  constructor(
    private readonly clipboard: SelectionClipboard = selectionClipboard,
    private readonly port: SelectionPastePort | null = null,
    private readonly offset: PasteOffset = DEFAULT_PASTE_OFFSET,
  ) {}

  canExecute(
    _ctx: HandlerContext,
    _cmd: PasteClipboardPayload,
  ): ValidationResult {
    if (this.port === null) {
      return { valid: false, reason: 'Paste is not available (no paste port wired)' };
    }
    if (this.clipboard.size === 0) {
      return { valid: false, reason: 'Clipboard is empty — copy an element first' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext,
    _cmd: PasteClipboardPayload,
  ): HandlerResult {
    return withHandlerSpan(
      this.type + '.handler',
      { 'pryzm.command.type': this.type },
      (span) => {
        const port = this.port;
        const newIds: string[] = [];
        if (port !== null) {
          for (const entry of this.clipboard.get()) {
            const newId = freshId();
            const res = port.paste(entry, { newId, offset: this.offset });
            if (res) newIds.push(res.newId);
          }
        }
        span.setAttribute('pryzm.paste.count', newIds.length);
        console.log(`[paste-clipboard.handler] Pasted ${newIds.length} element(s):`, newIds);
        // Child creations own their patches/undo; this command is a
        // side-effecting orchestrator with no patches of its own.
        return { forward: [], inverse: [] };
      },
    );
  }
}
