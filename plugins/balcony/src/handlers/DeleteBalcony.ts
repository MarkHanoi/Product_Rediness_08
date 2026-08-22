// DeleteBalconyHandler — the compound goes as ONE thing.
//
// §FEAT-BALCONY-COMPOUND (L-5600) · C103 §6.3 · C16 §3 (delete/lifecycle)
//
// ═══════════════════════════════════════════════════════════════════════════════
// A RAILING LEFT FLOATING IN THE AIR IS WORSE THAN NO FEATURE.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The delete removes the balcony record, its cantilever slab, its floor finish and
// every one of its railings — in ONE undo entry.
//
// This is not a hypothetical failure mode. It is a bug that is IN THE TREE RIGHT NOW
// and the balcony is not allowed to repeat it: `CreateStairCommand` punches an
// opening in the slab above it and its `undo()` correctly removes it, while
// `DeleteStairCommand` contains ZERO references to openings — so deleting a stair
// leaves the void punched through the floor plate forever, and nothing reaps it.
// (Recorded by the pool lane; out of this lane's blast radius.)
//
// ⭐ AND THE BALCONY IS DELIBERATELY EASIER THAN THE POOL, FOR A STRUCTURAL REASON.
// The pool's delete must additionally HEAL the hole it cut in its host slab, and it
// has to find that hole by geometry. A balcony cuts nothing (ADR-0333 §3 — it
// ATTACHES to the façade), so there is no reconciliation step and no way for it to
// leave the host wall damaged. That is one of the reasons attach-only was chosen.
//
// There is no generic "when X is deleted also delete Y" registry in PRYZM to lean on
// (`plugins/cross` explicitly refuses delete cascades), so the cascade is written
// HERE, explicitly, in the one command that owns it.

import {
  produceMultiStoreCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { BalconyNotFoundError } from '../errors.js';
import type { BalconiesState } from '../store.js';

export interface DeleteBalconyPayload {
  readonly balconyId: string;
}

type BalconyHandlerStores = Readonly<
  {
    balcony: BalconiesState;
    slab: Record<string, unknown>;
    floor: Record<string, unknown>;
    handrail: Record<string, unknown>;
  } & Record<string, unknown>
>;

// eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: mirrors
// CreateBalcony — four stores is the truthful declaration; see the rationale there.
export class DeleteBalconyHandler
  implements CommandHandler<DeleteBalconyPayload, BalconyHandlerStores>
{
  readonly type = 'balcony.delete';

  /** The same four stores the create touched — the delete must be able to undo it. */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: see above.
  readonly affectedStores = ['balcony', 'slab', 'floor', 'handrail'] as const;

  canExecute(
    ctx: HandlerContext<BalconyHandlerStores>,
    cmd: DeleteBalconyPayload,
  ): ValidationResult {
    if (!ctx.stores.balcony[cmd.balconyId]) {
      return { valid: false, reason: `balcony not found: ${cmd.balconyId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<BalconyHandlerStores>, cmd: DeleteBalconyPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const balcony = ctx.stores.balcony[cmd.balconyId];
      if (!balcony) throw new BalconyNotFoundError(cmd.balconyId);

      // The balcony's members are ITS OWN RECORD's `childrenIds` — no O(N) scan of
      // every slab in the project looking for `parentId === balconyId`, and no
      // guessing. This is why the compound link is stored on BOTH ends (C103 §2.2).
      const childIds = new Set(balcony.childrenIds);

      const out = produceMultiStoreCommand(
        {
          balcony: ctx.stores.balcony,
          slab: ctx.stores.slab,
          floor: ctx.stores.floor,
          handrail: ctx.stores.handrail,
        },
        {
          balcony: (d) => {
            delete (d as Record<string, unknown>)[cmd.balconyId];
          },
          slab: (d) => {
            const draft = d as Record<string, unknown>;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          floor: (d) => {
            const draft = d as Record<string, unknown>;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          handrail: (d) => {
            const draft = d as Record<string, unknown>;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
        },
      );

      return { forward: out.forward, inverse: out.inverse, nextStates: out.nextStates };
    }); // withHandlerSpan — CA-14 / C10 §2
  }
}
