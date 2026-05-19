// SetViewportScaleHandler — update a viewport's scale and/or rectangle
// (S38 / Phase 2C / ADR-0031).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload: `{ sheetId, viewportId, scale?, x?, y?, width?, height?,
//   clippingBox? }`.  At least ONE update field must be supplied — a
//   no-op call is rejected by `canExecute` (the user dispatched it for
//   a reason; failing loud is better than silently dropping).
// • `scale` MUST be a positive finite number when supplied.  S38 D9
//   demo uses integer scales (1:50, 1:100, 1:200, 1:500, 1:1000) — the
//   parity test in `__tests__/viewport.test.ts` enforces that an
//   integer scale round-trips bit-exact through this handler.
// • `width`, `height` MUST be positive finite numbers; `x`, `y` finite.
// • `clippingBox` allows clearing the crop by passing `null` — the
//   handler interprets `null` as "remove the field"; `undefined` means
//   "leave unchanged".

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { ViewportDto } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import { SheetNotFoundError, ViewportNotFoundError } from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface SetViewportScalePayload {
  readonly sheetId: string;
  readonly viewportId: string;
  readonly scale?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  /** `undefined` = leave unchanged.  `null` = remove the existing
   *  clippingBox (renderer falls back to "show entire viewport"). */
  readonly clippingBox?: ViewportDto['clippingBox'] | null;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}
function isFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function hasAnyUpdate(p: SetViewportScalePayload): boolean {
  return p.scale !== undefined
    || p.x !== undefined
    || p.y !== undefined
    || p.width !== undefined
    || p.height !== undefined
    || p.clippingBox !== undefined;
}

export class SetViewportScaleHandler implements CommandHandler<SetViewportScalePayload, Stores> {
  readonly type = 'sheet.setViewportScale';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetViewportScalePayload): ValidationResult {
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
    if (!hasAnyUpdate(cmd)) {
      return { valid: false, reason: 'at least one of scale/x/y/width/height/clippingBox must be supplied' };
    }
    if (cmd.scale !== undefined && !isFinitePositive(cmd.scale)) {
      return { valid: false, reason: 'scale must be a positive finite number' };
    }
    if (cmd.x !== undefined && !isFinite(cmd.x)) {
      return { valid: false, reason: 'x must be a finite number' };
    }
    if (cmd.y !== undefined && !isFinite(cmd.y)) {
      return { valid: false, reason: 'y must be a finite number' };
    }
    if (cmd.width !== undefined && !isFinitePositive(cmd.width)) {
      return { valid: false, reason: 'width must be a positive finite number' };
    }
    if (cmd.height !== undefined && !isFinitePositive(cmd.height)) {
      return { valid: false, reason: 'height must be a positive finite number' };
    }
    if (cmd.clippingBox !== undefined && cmd.clippingBox !== null) {
      const cb = cmd.clippingBox;
      if (!isFinite(cb.x) || !isFinite(cb.y) || !isFinitePositive(cb.width) || !isFinitePositive(cb.height)) {
        return { valid: false, reason: 'clippingBox must have finite x/y and positive finite width/height' };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetViewportScalePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.viewport.setScale', () => {
      const sheet = ctx.stores.sheet[cmd.sheetId];
      if (!sheet) throw new SheetNotFoundError(cmd.sheetId);
      const idx = sheet.viewports.findIndex((v) => v.id === cmd.viewportId);
      if (idx < 0) throw new ViewportNotFoundError(cmd.sheetId, cmd.viewportId);

      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        const vp = s.viewports[idx];
        if (!vp) return;
        if (cmd.scale !== undefined) vp.scale = cmd.scale;
        if (cmd.x !== undefined) vp.x = cmd.x;
        if (cmd.y !== undefined) vp.y = cmd.y;
        if (cmd.width !== undefined) vp.width = cmd.width;
        if (cmd.height !== undefined) vp.height = cmd.height;
        if (cmd.clippingBox === null) {
          delete vp.clippingBox;
        } else if (cmd.clippingBox !== undefined) {
          vp.clippingBox = { ...cmd.clippingBox };
        }
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
