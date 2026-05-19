// RemovePanelHandler — remove a single panel from a curtain wall
// (S13-T1).  Removal is by panel id (not by cell coordinate) so that
// the operation is unambiguous when two requests race.

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

export interface RemovePanelPayload {
  readonly curtainWallId: string;
  readonly panelId: string;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class RemovePanelHandler implements CommandHandler<RemovePanelPayload, CWStores> {
  readonly type = 'curtainwall.removePanel';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: RemovePanelPayload): ValidationResult {
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
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: RemovePanelPayload): HandlerResult {
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
        const idx = c.panels.findIndex((p) => p.id === cmd.panelId);
        if (idx !== -1) c.panels.splice(idx, 1);
      },
    );
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
