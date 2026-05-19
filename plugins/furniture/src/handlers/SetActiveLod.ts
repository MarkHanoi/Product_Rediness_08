// SetActiveLodHandler — swap which per-LOD representation the producer
// reads (S27 / ADR-0027 §4).
//
// The producer's geometry hash includes `lod=<n>`, so a successful LOD
// change always invalidates the chunk cache and the committer triggers
// a mesh-swap via the standard `subscribeDirty` path. No special wiring
// is needed in the committer for the swap to work.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { FurnitureNotFoundError, FurnitureLodError } from '../errors.js';
import type { FurnitureData, FurnituresState } from '../store.js';
import { isValidLod } from '../intent.js';

export interface SetActiveLodPayload {
  readonly furnitureId: string;
  readonly lod: FurnitureData['activeLod'];
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class SetActiveLodHandler
  implements CommandHandler<SetActiveLodPayload, Stores>
{
  readonly type = 'furniture.setActiveLod';
  readonly affectedStores = ['furniture'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetActiveLodPayload): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
    }
    if (!isValidLod(cmd.lod)) {
      return { valid: false, reason: 'lod must be one of {0,1,2,3,4}' };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetActiveLodPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
    if (!isValidLod(cmd.lod)) throw new FurnitureLodError(cmd.lod);
    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      const f = draft[cmd.furnitureId];
      if (!f) return;
      f.activeLod = cmd.lod;
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
