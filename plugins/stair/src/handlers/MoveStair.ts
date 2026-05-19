// MoveStairHandler — translate origin in XYZ (S14-T1).
//
// Triggers `cross.stair-handrail` cascade per ADR-0012: any handrail
// hosted on this stair re-runs its producer with the new edge polyline.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StairNotFoundError } from '../errors.js';
import type { StairData, StairsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface MoveStairPayload {
  readonly stairId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class MoveStairHandler implements CommandHandler<MoveStairPayload, StairHandlerStores> {
  readonly type = 'stair.move';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: MoveStairPayload): ValidationResult {
    if (!isFiniteVec3(cmd.delta)) return { valid: false, reason: 'delta must be a finite Vec3' };
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: MoveStairPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const s = (ctx.stores.stair as StairsState)[cmd.stairId];
    if (!s) throw new StairNotFoundError(cmd.stairId);
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = {
        ...dto,
        origin: {
          x: dto.origin.x + cmd.delta.x,
          y: dto.origin.y + cmd.delta.y,
          z: dto.origin.z + cmd.delta.z,
        },
      };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
