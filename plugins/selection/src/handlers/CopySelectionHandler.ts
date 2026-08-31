// CopySelectionHandler — `copy-selection`.  TASK-08 / §FIX-COPY-PASTE (L-84).
//
// Captures the CURRENT selection into the module clipboard so a subsequent
// `paste-clipboard` can re-create the copied element(s). Copy is read-only:
// it fills the clipboard and returns empty forward/inverse patches, so it is
// NOT pushed to the undo stack (C20 §3).
//
// Contract compliance:
//   • P6 — copy-selection is a registered command (no silent no-op).
//   • C20 §3 — copy is not undoable (empty forward/inverse).
//   • C10 §2 — execution is wrapped in a withHandlerSpan for OTel.
//
// Selection source: the canonical L1 `SelectionStore` handed in via
// `ctx.stores.selection` (the same store `selection.select` mutates). Only
// kinds the paste port declares copyable are captured; if a port is supplied
// and nothing selected is copyable, `canExecute` rejects with a reason so the
// caller gets typed feedback instead of a silent success.
//
// Anchor: docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md L-84

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
  SelectionStore,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import {
  selectionClipboard,
  type ClipboardEntry,
  type SelectionClipboard,
  type SelectionPastePort,
} from '../clipboard.js';
import { resolveSelectionStore } from './selectionStoreAccess.js';

export type CopySelectionPayload = Record<string, never>;

type CopyStores = Readonly<{ selection: SelectionStore } & Record<string, unknown>>;

export class CopySelectionHandler
  implements CommandHandler<CopySelectionPayload, CopyStores>
{
  readonly type = 'copy-selection';
  readonly affectedStores = ['selection'] as const;

  constructor(
    private readonly clipboard: SelectionClipboard = selectionClipboard,
    private readonly port: SelectionPastePort | null = null,
    /** §SEL-STORE-IDENTITY — canonical store ADOPTED from the composition root. */
    private readonly store: SelectionStore | null = null,
  ) {}

  /** Copyable selection entries — filtered by the port's `canCopy` when set. */
  private _copyableEntries(ctx: HandlerContext<CopyStores>): ClipboardEntry[] {
    const out: ClipboardEntry[] = [];
    const selection = resolveSelectionStore(this.store, ctx.stores, this.type);
    for (const dto of selection.getState().values()) {
      if (this.port !== null && !this.port.canCopy(dto.kind)) continue;
      out.push({ sourceId: dto.id, kind: dto.kind });
    }
    return out;
  }

  canExecute(
    ctx: HandlerContext<CopyStores>,
    _cmd: CopySelectionPayload,
  ): ValidationResult {
    if (resolveSelectionStore(this.store, ctx.stores, this.type).getState().size === 0) {
      return { valid: false, reason: 'Nothing selected to copy' };
    }
    if (this._copyableEntries(ctx).length === 0) {
      return { valid: false, reason: 'Selected element(s) cannot be copied' };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<CopyStores>,
    _cmd: CopySelectionPayload,
  ): HandlerResult {
    return withHandlerSpan(
      this.type + '.handler',
      { 'pryzm.command.type': this.type },
      (span) => {
        const entries = this._copyableEntries(ctx);
        this.clipboard.set(entries);
        span.setAttribute('pryzm.copy.count', entries.length);
        console.log(`[copy-selection.handler] Copied ${entries.length} element(s) to clipboard.`);
        // Read-only: no store patches → not pushed to the undo stack.
        return { forward: [], inverse: [] };
      },
    );
  }
}
