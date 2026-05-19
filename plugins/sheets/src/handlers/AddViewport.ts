// AddViewportHandler — drop a view onto a sheet at a position and scale
// (S38 / Phase 2C / ADR-0031).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S38 lines
// 293–339 ("Implementation Detail — Viewport Rendering at Scale").  The
// `ViewportManager.handleDropView()` example at line 305 dispatches
// `command: 'sheet.addViewport'` — this handler is the receiver.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload shape: `{ sheetId, viewId, x, y, width, height, scale,
//   id?, clippingBox? }`.  `id` is optional — auto-minted via
//   `createId('view')` (viewports don't have their own typed id brand;
//   view-class works fine as a stable string).
// • `scale` MUST be a positive finite number.  Conventionally an
//   integer (50, 100, 200, ...) but the schema does not require it —
//   sub-integer scales (1.25 = 1:1.25 enlarge) are valid.
// • The handler appends to `SheetData.viewports[]` — no automatic
//   z-ordering (later additions render on top).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ViewportSchema, type ViewportDto } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import {
  SheetNotFoundError,
  DuplicateViewportIdError,
  SheetSchemaError,
} from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface AddViewportPayload {
  readonly sheetId: string;
  readonly viewId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly id?: string;
  readonly clippingBox?: ViewportDto['clippingBox'];
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}
function isFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export class AddViewportHandler implements CommandHandler<AddViewportPayload, Stores> {
  readonly type = 'sheet.addViewport';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: AddViewportPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    const sheet = ctx.stores.sheet[cmd.sheetId];
    if (!sheet) return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    if (typeof cmd.viewId !== 'string' || cmd.viewId.length === 0) {
      return { valid: false, reason: 'viewId must be a non-empty string' };
    }
    if (!isFinite(cmd.x) || !isFinite(cmd.y)) {
      return { valid: false, reason: 'x and y must be finite numbers' };
    }
    if (!isFinitePositive(cmd.width) || !isFinitePositive(cmd.height)) {
      return { valid: false, reason: 'width and height must be positive finite numbers' };
    }
    if (!isFinitePositive(cmd.scale)) {
      return { valid: false, reason: 'scale must be a positive finite number' };
    }
    if (cmd.id !== undefined) {
      if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
        return { valid: false, reason: 'id, when supplied, must be a non-empty string' };
      }
      if (sheet.viewports.some((v) => v.id === cmd.id)) {
        return { valid: false, reason: `viewport id "${cmd.id}" already exists on sheet "${cmd.sheetId}"` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: AddViewportPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.viewport.add', () => {
      const sheet = ctx.stores.sheet[cmd.sheetId];
      if (!sheet) throw new SheetNotFoundError(cmd.sheetId);

      const viewportId = cmd.id ?? createId('view');
      if (sheet.viewports.some((v) => v.id === viewportId)) {
        throw new DuplicateViewportIdError(cmd.sheetId, viewportId);
      }

      const seed: ViewportDto = {
        id: viewportId,
        viewId: cmd.viewId,
        x: cmd.x,
        y: cmd.y,
        width: cmd.width,
        height: cmd.height,
        scale: cmd.scale,
        ...(cmd.clippingBox ? { clippingBox: cmd.clippingBox } : {}),
      };

      let viewport: ViewportDto;
      try { viewport = ViewportSchema.parse(seed); }
      catch (err) { throw new SheetSchemaError(err); }

      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        s.viewports.push(viewport);
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
