// JoinRoofsHandler — declare an adjacency relationship between roofs (W-1C-5).
//
// Adds `targetId` into `sourceId.joinedToRoofIds` and vice-versa (symmetric).
// Both roofs must exist; they must not already be joined.

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

export interface JoinRoofsPayload {
  readonly sourceId: string;
  readonly targetId: string;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class JoinRoofsHandler
  implements CommandHandler<JoinRoofsPayload, RoofHandlerStores>
{
  readonly type = 'roof.joinRoofs';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: JoinRoofsPayload): ValidationResult {
    if (typeof cmd.sourceId !== 'string' || cmd.sourceId.length === 0) {
      return { valid: false, reason: 'sourceId must be a non-empty string' };
    }
    if (typeof cmd.targetId !== 'string' || cmd.targetId.length === 0) {
      return { valid: false, reason: 'targetId must be a non-empty string' };
    }
    if (cmd.sourceId === cmd.targetId) {
      return { valid: false, reason: 'sourceId and targetId must differ' };
    }
    if (!ctx.stores.roof[cmd.sourceId]) {
      return { valid: false, reason: `roof not found: ${cmd.sourceId}` };
    }
    if (!ctx.stores.roof[cmd.targetId]) {
      return { valid: false, reason: `roof not found: ${cmd.targetId}` };
    }
    const src = ctx.stores.roof[cmd.sourceId];
    if (src && src.joinedToRoofIds.includes(cmd.targetId)) {
      return { valid: false, reason: `roofs already joined: ${cmd.sourceId} ↔ ${cmd.targetId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: JoinRoofsPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.roof[cmd.sourceId]) throw new RoofNotFoundError(cmd.sourceId);
    if (!ctx.stores.roof[cmd.targetId]) throw new RoofNotFoundError(cmd.targetId);
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const src = draft[cmd.sourceId];
      const tgt = draft[cmd.targetId];
      if (src && !src.joinedToRoofIds.includes(cmd.targetId)) {
        src.joinedToRoofIds = [...src.joinedToRoofIds, cmd.targetId];
      }
      if (tgt && !tgt.joinedToRoofIds.includes(cmd.sourceId)) {
        tgt.joinedToRoofIds = [...tgt.joinedToRoofIds, cmd.sourceId];
      }
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
