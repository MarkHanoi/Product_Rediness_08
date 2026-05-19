// MoveRoofHandler — translate the roof boundary by a 3D delta (S11-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RoofNotFoundError } from '../errors.js';
import type { RoofsState } from '../store.js';

export interface MoveRoofPayload {
  readonly roofId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class MoveRoofHandler implements CommandHandler<MoveRoofPayload, RoofHandlerStores> {
  readonly type = 'roof.move';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: MoveRoofPayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
    }
    if (!cmd.delta || ![cmd.delta.x, cmd.delta.y, cmd.delta.z].every(Number.isFinite)) {
      return { valid: false, reason: 'delta must be a finite Vec3' };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: MoveRoofPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const r = draft[cmd.roofId];
      if (!r) return;
      r.boundary = r.boundary.map((p) => ({
        x: p.x + cmd.delta.x,
        y: p.y + cmd.delta.y,
        z: p.z + cmd.delta.z,
      }));
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
