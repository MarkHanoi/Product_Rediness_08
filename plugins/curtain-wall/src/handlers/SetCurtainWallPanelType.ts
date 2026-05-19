// SetCurtainWallPanelTypeHandler — change the kind / material of a
// single panel within a curtain wall (S12-T5).
//
// Panels are addressed by their `id` (unique per curtain wall — the
// schema enforces uniqueness via a refine).  If the panel does not
// yet exist, the handler can optionally up-sert it given an explicit
// {row, col}.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWallNotFoundError, CurtainWallPanelNotFoundError } from '../errors.js';
import type { CurtainWallData, CurtainWallsState } from '../store.js';

export interface SetCurtainWallPanelTypePayload {
  readonly curtainWallId: string;
  readonly panelId: string;
  readonly kind?: CurtainWallData['panels'][number]['kind'];
  readonly materialId?: string;
  /** When set, creates the panel if it doesn't already exist. */
  readonly upsertAt?: { readonly row: number; readonly col: number };
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class SetCurtainWallPanelTypeHandler
  implements CommandHandler<SetCurtainWallPanelTypePayload, CWStores>
{
  readonly type = 'curtainwall.setPanelType';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallPanelTypePayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (typeof cmd.panelId !== 'string' || cmd.panelId.length === 0) {
      return { valid: false, reason: 'panelId must be a non-empty string' };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    const exists = cw.panels.some((p) => p.id === cmd.panelId);
    if (!exists && !cmd.upsertAt) {
      return { valid: false, reason: `panel not found: ${cmd.panelId} (provide upsertAt to create)` };
    }
    if (cmd.upsertAt && (!Number.isInteger(cmd.upsertAt.row) || cmd.upsertAt.row < 0
                      || !Number.isInteger(cmd.upsertAt.col) || cmd.upsertAt.col < 0)) {
      return { valid: false, reason: 'upsertAt.row and upsertAt.col must be non-negative integers' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallPanelTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    const exists = cw.panels.some((p) => p.id === cmd.panelId);
    if (!exists && !cmd.upsertAt) {
      throw new CurtainWallPanelNotFoundError(cmd.curtainWallId, cmd.panelId);
    }

    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      const c = draft[cmd.curtainWallId];
      if (!c) return;
      const idx = c.panels.findIndex((p) => p.id === cmd.panelId);
      if (idx === -1) {
        c.panels.push({
          id: cmd.panelId,
          row: cmd.upsertAt!.row,
          col: cmd.upsertAt!.col,
          kind: cmd.kind ?? 'glazed',
          rotation: 0,
          materialId: cmd.materialId,
        });
      } else {
        const p = c.panels[idx]!;
        if (cmd.kind !== undefined) p.kind = cmd.kind;
        if (cmd.materialId !== undefined) p.materialId = cmd.materialId;
      }
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
