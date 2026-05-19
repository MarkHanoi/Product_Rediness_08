// AddWidgetHandler — drop a widget onto a sheet (S39 / Phase 2C /
// ADR-0031).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S39 line 546
// ("`AddWidget`, `RemoveWidget` handlers operational").
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload: `{ sheetId, kind, x, y, width, height, payload?, id? }`.
//   `id` defaults to `createId('view')` (we don't have a typed widget
//   brand yet — the string id space is plenty unique).
// • `kind` MUST be one of the built-in 10 kinds (validated against
//   `WIDGET_KINDS`).  Custom plugin kinds will need a separate plugin
//   handler that reuses this body with a different validator.
// • `payload` is parsed against the matching shape from
//   `widget-payloads.ts` BEFORE the patch is produced — so an invalid
//   shape is a hard failure, not a silently-broken render.
// • Appends to `SheetData.widgets[]` (no automatic z-ordering, same
//   policy as `AddViewport`).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WidgetSchema, type WidgetDto } from '@pryzm/plugin-sdk';
import {
  isWidgetKind,
  parseWidgetPayload,
  type WidgetKind,
} from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import {
  SheetNotFoundError,
  DuplicateWidgetIdError,
  SheetSchemaError,
  WidgetKindUnknownError,
} from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface AddWidgetPayload {
  readonly sheetId: string;
  readonly kind: WidgetKind | string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly payload?: Record<string, unknown>;
  readonly id?: string;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}
function isFinite_(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export class AddWidgetHandler implements CommandHandler<AddWidgetPayload, Stores> {
  readonly type = 'sheet.addWidget';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: AddWidgetPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    const sheet = ctx.stores.sheet[cmd.sheetId];
    if (!sheet) return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    if (!isWidgetKind(cmd.kind)) {
      return { valid: false, reason: `unknown widget kind: ${String(cmd.kind)}` };
    }
    if (!isFinite_(cmd.x) || !isFinite_(cmd.y)) {
      return { valid: false, reason: 'x and y must be finite numbers' };
    }
    if (!isFinitePositive(cmd.width) || !isFinitePositive(cmd.height)) {
      return { valid: false, reason: 'width and height must be positive finite numbers' };
    }
    if (cmd.id !== undefined) {
      if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
        return { valid: false, reason: 'id, when supplied, must be a non-empty string' };
      }
      if (sheet.widgets.some((w) => w.id === cmd.id)) {
        return { valid: false, reason: `widget id "${cmd.id}" already exists on sheet "${cmd.sheetId}"` };
      }
    }
    // Validate payload against the matching shape.
    try { parseWidgetPayload(cmd.kind as WidgetKind, cmd.payload ?? {}); }
    catch (err) {
      const reason = err instanceof Error ? err.message : 'invalid widget payload';
      return { valid: false, reason };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: AddWidgetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.widget.add', () => {
      const sheet = ctx.stores.sheet[cmd.sheetId];
      if (!sheet) throw new SheetNotFoundError(cmd.sheetId);

      if (!isWidgetKind(cmd.kind)) throw new WidgetKindUnknownError(String(cmd.kind));

      const widgetId = cmd.id ?? createId('view');
      if (sheet.widgets.some((w) => w.id === widgetId)) {
        throw new DuplicateWidgetIdError(cmd.sheetId, widgetId);
      }

      // Parse payload through Zod so we store a normalised shape (with
      // defaults filled in) — round-trips through JSON cleanly.
      const parsedPayload = parseWidgetPayload(cmd.kind, cmd.payload ?? {});
      // Strip the `kind` discriminator from the stored payload — `kind`
      // lives at the WidgetDto top level.  Keeping it here too would
      // double-store + risk drift.
      const { kind: _kind, ...payloadBody } = parsedPayload as Record<string, unknown>;

      const seed = {
        id: widgetId,
        kind: cmd.kind,
        x: cmd.x,
        y: cmd.y,
        width: cmd.width,
        height: cmd.height,
        payload: payloadBody,
      };

      let widget: WidgetDto;
      try { widget = WidgetSchema.parse(seed); }
      catch (err) { throw new SheetSchemaError(err); }

      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        s.widgets.push(widget);
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
