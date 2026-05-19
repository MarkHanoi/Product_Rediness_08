// RotatePanelHandler — rotate a single panel about its own centre by
// 0/90/180/270 degrees (S13-T1).
//
// Currently only the panel DTO's `rotation` field is updated; the
// producer treats panels as flat quads so no geometry rebuild is
// triggered today.  Asymmetric panel kinds added in S14+ (e.g. door
// panels with a swing direction) will read `rotation` and orient the
// glyph accordingly.  We persist the field now so the data model is
// stable across the perf gates.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWallNotFoundError, CurtainWallPanelNotFoundError } from '../errors.js';
import type { CurtainWallsState } from '../store.js';

export type PanelRotationDeg = 0 | 90 | 180 | 270;

export interface RotatePanelPayload {
  readonly curtainWallId: string;
  readonly panelId: string;
  /** Absolute rotation in degrees (0/90/180/270).  Mutually exclusive
   *  with `deltaDeg`. */
  readonly rotation?: PanelRotationDeg;
  /** Relative rotation in degrees (any multiple of 90).  Applied
   *  modulo 360.  Mutually exclusive with `rotation`. */
  readonly deltaDeg?: number;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

const ALLOWED = new Set<number>([0, 90, 180, 270]);

function normalizeDelta(deltaDeg: number): PanelRotationDeg {
  const m = ((deltaDeg % 360) + 360) % 360;
  return m as PanelRotationDeg;
}

export class RotatePanelHandler implements CommandHandler<RotatePanelPayload, CWStores> {
  readonly type = 'curtainwall.rotatePanel';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: RotatePanelPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (typeof cmd.panelId !== 'string' || cmd.panelId.length === 0) {
      return { valid: false, reason: 'panelId must be a non-empty string' };
    }
    if (cmd.rotation !== undefined && cmd.deltaDeg !== undefined) {
      return { valid: false, reason: 'RotatePanel: provide rotation OR deltaDeg, not both' };
    }
    if (cmd.rotation === undefined && cmd.deltaDeg === undefined) {
      return { valid: false, reason: 'RotatePanel: rotation or deltaDeg required' };
    }
    if (cmd.rotation !== undefined && !ALLOWED.has(cmd.rotation)) {
      return { valid: false, reason: 'rotation must be 0, 90, 180, or 270' };
    }
    if (cmd.deltaDeg !== undefined && (!Number.isFinite(cmd.deltaDeg) || cmd.deltaDeg % 90 !== 0)) {
      return { valid: false, reason: 'deltaDeg must be a finite multiple of 90' };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    if (!cw.panels.some((p) => p.id === cmd.panelId)) {
      return { valid: false, reason: `panel not found: ${cmd.panelId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: RotatePanelPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    if (!cw.panels.some((p) => p.id === cmd.panelId)) {
      throw new CurtainWallPanelNotFoundError(cmd.curtainWallId, cmd.panelId);
    }

    const [next, forward, inverse] = produceCommand<CurtainWallsState>(
      ctx.stores.curtainwall,
      (draft) => {
        const c = draft[cmd.curtainWallId];
        if (!c) return;
        const p = c.panels.find((q) => q.id === cmd.panelId);
        if (!p) return;
        if (cmd.rotation !== undefined) {
          p.rotation = cmd.rotation;
        } else if (cmd.deltaDeg !== undefined) {
          const cur = (p.rotation ?? 0) as number;
          p.rotation = normalizeDelta(cur + cmd.deltaDeg);
        }
      },
    );
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
