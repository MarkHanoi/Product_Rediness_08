// RemoveWidgetHandler — delete a widget from a sheet (S39 / Phase 2C /
// ADR-0031).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload: `{ sheetId, widgetId }`.
// • Removing a non-existent widget is a HARD failure (mirrors
//   RemoveViewport) so a stale UI cannot silently no-op a remove.
// • The patch removes the matching entry by index — Immer emits an
//   array `remove` patch which inverts to `insert`, so undo restores
//   the widget at the same position in `widgets[]`.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import { SheetNotFoundError, WidgetNotFoundError } from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface RemoveWidgetPayload {
  readonly sheetId: string;
  readonly widgetId: string;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

export class RemoveWidgetHandler implements CommandHandler<RemoveWidgetPayload, Stores> {
  readonly type = 'sheet.removeWidget';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: RemoveWidgetPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    const sheet = ctx.stores.sheet[cmd.sheetId];
    if (!sheet) return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    if (typeof cmd.widgetId !== 'string' || cmd.widgetId.length === 0) {
      return { valid: false, reason: 'widgetId must be a non-empty string' };
    }
    if (!sheet.widgets.some((w) => w.id === cmd.widgetId)) {
      return { valid: false, reason: `widget not found: ${cmd.widgetId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: RemoveWidgetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.widget.remove', () => {
      const sheet = ctx.stores.sheet[cmd.sheetId];
      if (!sheet) throw new SheetNotFoundError(cmd.sheetId);
      const idx = sheet.widgets.findIndex((w) => w.id === cmd.widgetId);
      if (idx < 0) throw new WidgetNotFoundError(cmd.sheetId, cmd.widgetId);

      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        const i = s.widgets.findIndex((w) => w.id === cmd.widgetId);
        if (i >= 0) s.widgets.splice(i, 1);
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
