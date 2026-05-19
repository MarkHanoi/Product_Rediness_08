// MoveCurtainWallHandler — translate baseLine endpoints by a delta (S12-T5).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWallNotFoundError } from '../errors.js';
import type { CurtainWallsState } from '../store.js';

export interface MoveCurtainWallPayload {
  readonly curtainWallId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class MoveCurtainWallHandler
  implements CommandHandler<MoveCurtainWallPayload, CWStores>
{
  readonly type = 'curtainwall.move';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: MoveCurtainWallPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: MoveCurtainWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      const cw = draft[cmd.curtainWallId];
      if (!cw) return;
      for (const p of cw.baseLine) {
        p.x += cmd.delta.x; p.y += cmd.delta.y; p.z += cmd.delta.z;
      }
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
