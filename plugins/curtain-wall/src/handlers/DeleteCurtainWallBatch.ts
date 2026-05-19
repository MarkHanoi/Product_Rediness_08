// DeleteCurtainWallBatchHandler — remove multiple curtain walls atomically.
//
// `curtain-wall.batch.delete` — the undo-mirror of `curtain-wall.batch.create`.
//
// WHY THIS EXISTS:
//   CreateCurtainWallsOnAllSlabsCommand (and CreateCurtainWallsFromSlabCommand)
//   use a dual-write pattern: the legacy curtainWallStore is the authoritative
//   geometry store, and the plugin CurtainWallsState receives a parallel write
//   via `curtain-wall.batch.create` for event-sourcing purposes (E.5.x P2e).
//
//   Without this handler, undo() removes walls from the legacy store but leaves
//   them in the plugin store, causing the two stores to diverge. On subsequent
//   redo, the plugin store accumulates duplicate entries. This handler is
//   dispatched fire-and-forget from undo() to keep both stores in sync.
//
// PAYLOAD:
//   • `ids` — array of curtain wall IDs to remove. IDs absent from the store
//     are silently skipped (idempotent — safe for redo/undo races).
//
// UNDO (of this handler): a single Immer batch produces ONE forward + ONE
//   inverse patch for the whole set, giving the bus undo stack the ability to
//   re-insert all walls in one pop. However, since the legacy undo system calls
//   command.undo() directly (not via bus inverse patches), this handler's own
//   inverse patch is currently unused — it exists for future bus-undo migration.
//
// REFERENCE: mirrors CreateCurtainWallBatchHandler (`curtain-wall.batch.create`)

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { CurtainWallsState } from '../store.js';

export interface DeleteCurtainWallBatchPayload {
  readonly ids: readonly string[];
}

type CWBatchStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class DeleteCurtainWallBatchHandler
  implements CommandHandler<DeleteCurtainWallBatchPayload, CWBatchStores>
{
  readonly type = 'curtain-wall.batch.delete';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(
    _ctx: HandlerContext<CWBatchStores>,
    cmd: DeleteCurtainWallBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.ids)) {
      return { valid: false, reason: '`ids` must be an array' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWBatchStores>, cmd: DeleteCurtainWallBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const ids = cmd.ids ?? [];

      if (ids.length === 0) {
        const [next, forward, inverse] = produceCommand<CurtainWallsState>(
          ctx.stores.curtainwall,
          () => { /* no mutation — identity patches */ },
        );
        return { forward, inverse, nextStates: { curtainwall: next } };
      }

      const [next, forward, inverse] = produceCommand<CurtainWallsState>(
        ctx.stores.curtainwall,
        (draft) => {
          for (const id of ids) {
            delete draft[id as keyof typeof draft];
          }
        },
      );

      console.log(
        `[CommandBus] DISPATCH: curtain-wall.batch.delete — ${ids.length} curtain wall(s) removed from plugin store`,
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}
