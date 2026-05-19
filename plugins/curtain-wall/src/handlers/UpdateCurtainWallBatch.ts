// UpdateCurtainWallBatchHandler — FT7 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18).
//
// Replaces N sequential `wall.updateCurtainWall` dispatches (each of which
// triggers a full WallFragmentBuilder rebuild) with a single Immer
// produceCommand call that writes all changes atomically.  The bus emits one
// forward+inverse patch pair → one undo-stack entry → one rebuild at the end.
//
// PAYLOAD SHAPE
//   • `updates` — non-empty array of { id, updates } pairs.  `updates` is a
//     free-form Record<string,unknown> of CurtainWallData fields to merge, matching
//     the shape accepted by the single `wall.updateCurtainWall` handler.
//   • Entries whose `id` is absent from the plugin store are silently skipped —
//     the handler is idempotent and safe to dispatch from undo/redo replay.
//
// VALIDATION
//   • `updates` array must be non-empty (empty batch is a caller error; use
//     a no-op to avoid touching the undo stack).
//   • Each entry must carry a non-empty `id` string.
//   • No schema re-parse — the handler applies the patch object as-is, matching
//     the existing `wall.updateCurtainWall` bridge behaviour.  Field-level
//     validation is the caller's responsibility (PropertyInspector / AI layer).
//
// UNDO: the single Immer batch produces ONE forward+inverse pair — undoing a
// "batch material change" is one undo-stack pop.
//
// REFERENCE: mirrors CreateCurtainWallBatchHandler in CreateCurtainWallBatch.ts.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { CurtainWallsState } from '../store.js';

export interface UpdateCurtainWallBatchPayload {
  readonly updates: ReadonlyArray<{
    readonly id: string;
    readonly updates: Record<string, unknown>;
  }>;
}

type CWBatchUpdateStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class UpdateCurtainWallBatchHandler
  implements CommandHandler<UpdateCurtainWallBatchPayload, CWBatchUpdateStores>
{
  readonly type = 'curtainwall.batch.update';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(
    _ctx: HandlerContext<CWBatchUpdateStores>,
    cmd: UpdateCurtainWallBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.updates) || cmd.updates.length === 0) {
      return {
        valid: false,
        reason: 'curtainwall.batch.update: updates array must be non-empty',
      };
    }
    for (let i = 0; i < cmd.updates.length; i++) {
      const entry = cmd.updates[i]!;
      if (!entry.id || typeof entry.id !== 'string' || entry.id.trim() === '') {
        return {
          valid: false,
          reason: `curtainwall.batch.update: updates[${i}].id must be a non-empty string`,
        };
      }
      if (!entry.updates || typeof entry.updates !== 'object') {
        return {
          valid: false,
          reason: `curtainwall.batch.update: updates[${i}].updates must be a plain object`,
        };
      }
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<CWBatchUpdateStores>,
    cmd: UpdateCurtainWallBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      this.type + '.handler',
      { 'pryzm.command.type': this.type },
      () => {
        let applied = 0;
        let skipped = 0;

        const [next, forward, inverse] = produceCommand<CurtainWallsState>(
          ctx.stores.curtainwall,
          draft => {
            for (const entry of cmd.updates) {
              const existing = draft[entry.id];
              if (!existing) {
                // id not in store — idempotent skip (safe for undo/redo replay)
                console.warn(
                  `[curtainwall.batch.update] id '${entry.id}' not found in plugin store — skipping`,
                );
                skipped++;
                continue;
              }
              Object.assign(existing, entry.updates);
              applied++;
            }
          },
        );

        console.log(
          `[CommandBus] DISPATCH: curtainwall.batch.update — ${applied} applied, ${skipped} skipped`,
        );
        return { forward, inverse, nextStates: { curtainwall: next } };
      },
    ); // withHandlerSpan — C10 §2
  }
}
