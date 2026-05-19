// SetCurtainWallOutlineHandler — replace baseLine + height in one
// atomic edit (S12-T5).
//
// Distinct from `Resize`: outline accepts a fully new baseLine,
// while resize keeps direction + start, scaling length only.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWallGeometryError, CurtainWallNotFoundError } from '../errors.js';
import type { CurtainWallData, CurtainWallsState } from '../store.js';
import { isFiniteVec3, isNonZeroBaseLine } from '../intent.js';

export interface SetCurtainWallOutlinePayload {
  readonly curtainWallId: string;
  readonly baseLine?: CurtainWallData['baseLine'];
  readonly height?: number;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class SetCurtainWallOutlineHandler
  implements CommandHandler<SetCurtainWallOutlinePayload, CWStores>
{
  readonly type = 'curtainwall.setOutline';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallOutlinePayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (cmd.baseLine !== undefined) {
      const [a, b] = cmd.baseLine;
      if (!isFiniteVec3(a) || !isFiniteVec3(b)) {
        return { valid: false, reason: 'baseLine endpoints must be finite Vec3' };
      }
      if (!isNonZeroBaseLine(a, b)) {
        return { valid: false, reason: 'baseLine endpoints must differ' };
      }
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.baseLine === undefined && cmd.height === undefined) {
      return { valid: false, reason: 'must specify at least one of baseLine or height' };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallOutlinePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    if (cmd.height !== undefined && cmd.height <= 0) {
      throw new CurtainWallGeometryError('height must be > 0');
    }
    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      const cw = draft[cmd.curtainWallId];
      if (!cw) return;
      if (cmd.baseLine) {
        cw.baseLine = [
          { x: cmd.baseLine[0].x, y: cmd.baseLine[0].y, z: cmd.baseLine[0].z },
          { x: cmd.baseLine[1].x, y: cmd.baseLine[1].y, z: cmd.baseLine[1].z },
        ];
      }
      if (cmd.height !== undefined) cw.height = cmd.height;
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
