// RemoveViewportHandler — delete a viewport from a sheet (S38 / Phase 2C
// / ADR-0031).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload: `{ sheetId, viewportId }`.
// • Removing a non-existent viewport is a HARD failure (`canExecute`
//   returns invalid; `execute` throws `ViewportNotFoundError`) so a
//   stale UI cannot silently no-op a remove.
// • The patch removes the matching entry from `SheetData.viewports[]`
//   by index — Immer emits an array `remove` patch which inverts to
//   `insert`, so undo restores the viewport at the same index.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import { SheetNotFoundError, ViewportNotFoundError } from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface RemoveViewportPayload {
  readonly sheetId: string;
  readonly viewportId: string;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

export class RemoveViewportHandler implements CommandHandler<RemoveViewportPayload, Stores> {
  readonly type = 'sheet.removeViewport';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: RemoveViewportPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    const sheet = ctx.stores.sheet[cmd.sheetId];
    if (!sheet) return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    if (typeof cmd.viewportId !== 'string' || cmd.viewportId.length === 0) {
      return { valid: false, reason: 'viewportId must be a non-empty string' };
    }
    if (!sheet.viewports.some((v) => v.id === cmd.viewportId)) {
      return { valid: false, reason: `viewport not found: ${cmd.viewportId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: RemoveViewportPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.viewport.remove', () => {
      const sheet = ctx.stores.sheet[cmd.sheetId];
      if (!sheet) throw new SheetNotFoundError(cmd.sheetId);
      const idx = sheet.viewports.findIndex((v) => v.id === cmd.viewportId);
      if (idx < 0) throw new ViewportNotFoundError(cmd.sheetId, cmd.viewportId);

      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        const i = s.viewports.findIndex((v) => v.id === cmd.viewportId);
        if (i >= 0) s.viewports.splice(i, 1);
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
