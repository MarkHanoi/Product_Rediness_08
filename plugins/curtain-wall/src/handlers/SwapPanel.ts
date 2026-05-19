// SwapPanelHandler — replace one panel's kind / material / type id
// in-place (S13-T1).
//
// Distinct from SetCurtainWallPanelType (S12) in two ways:
//   1. SwapPanel never up-serts; the panel must already exist.
//   2. SwapPanel atomically swaps the panel record (identity preserved
//      via stable panel id), enabling tools to bind UI selection state
//      to the panel id across the swap.

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

export interface SwapPanelPayload {
  readonly curtainWallId: string;
  readonly panelId: string;
  readonly kind?: CurtainWallData['panels'][number]['kind'];
  readonly materialId?: string;
  readonly panelTypeId?: string;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class SwapPanelHandler implements CommandHandler<SwapPanelPayload, CWStores> {
  readonly type = 'curtainwall.swapPanel';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: SwapPanelPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (typeof cmd.panelId !== 'string' || cmd.panelId.length === 0) {
      return { valid: false, reason: 'panelId must be a non-empty string' };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    if (!cw.panels.some((p) => p.id === cmd.panelId)) {
      return { valid: false, reason: `panel not found: ${cmd.panelId}` };
    }
    if (cmd.kind === undefined && cmd.materialId === undefined && cmd.panelTypeId === undefined) {
      return { valid: false, reason: 'SwapPanel requires at least one of kind/materialId/panelTypeId' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: SwapPanelPayload): HandlerResult {
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
        if (cmd.kind !== undefined) p.kind = cmd.kind;
        if (cmd.materialId !== undefined) p.materialId = cmd.materialId;
        else if (cmd.panelTypeId !== undefined) p.materialId = cmd.panelTypeId;
      },
    );
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
