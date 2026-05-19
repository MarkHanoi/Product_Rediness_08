// DeleteWallHandler — thin wall-scoped delete (S07-T5).
//
// Mirrors `src/commands/walls/DeleteElementCommand.ts` (783 LOC) BUT
// only the wall-relevant subset (~80 LOC equivalent).  The generic
// L4 `DeleteElement` handler that delegates to plugin-registered
// cascade rules is the longer-term home for cross-plugin deletes
// (lands in `packages/command-bus/handlers/` when the second element
// plugin arrives in S11).
//
// At S07 the wall-only delete:
//   • removes the wall row from the wall store,
//   • returns the inverse patch that re-adds the EXACT pre-delete
//     wall DTO (Immer captures the entire row in the inverse — undo
//     is byte-identical),
//   • does NOT cascade to door/window/opening stores (those land
//     when the door + window plugins arrive in S11; the cascade
//     declarations live on the generic L4 handler from S11 onward).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallNotFoundError } from '../errors.js';
import type { WallsState } from '../store.js';

export interface DeleteWallPayload {
  /** Id of the wall to remove. */
  readonly id: string;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class DeleteWallHandler
  implements CommandHandler<DeleteWallPayload, WallHandlerStores>
{
  readonly type = 'wall.delete';
  readonly affectedStores = ['wall'] as const;

  canExecute(ctx: HandlerContext<WallHandlerStores>, cmd: DeleteWallPayload): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WallHandlerStores>, cmd: DeleteWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      // Race: passed canExecute but state changed before execute ran.
      // Throw OUTWARD so the bus does not push a partial event.
      throw new WallNotFoundError(cmd.id);
    }
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      delete draft[cmd.id];
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
