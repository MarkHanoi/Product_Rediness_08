// ChangeSlabLevelHandler — move a slab between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: *"the wall element can be
// changed — and works. However the slab element, for example, cannot be
// changed — I cannot move a slab from first floor to second floor."* The slab
// panel's SLABPLACEMENT block rendered `Level  Level 1 (3m)` as a VALUE with no
// control, because there was no verb behind it to dispatch.
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
// A level change is not one write. `wall.changeLevel` is the reference
// implementation and all four parts are load-bearing:
//
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store, and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — `LEVEL_CHANGE_VERBS` (now
//                              `@pryzm/command-bus/levelChangeVerbs`) turns the
//                              dispatched payload into a family-agnostic
//                              `element.level-changed` event.
//   3. `elementLevelChangedMirror` — moves the LEGACY `slabStore` record (the
//                              one the renderer, plan view, persistence and IFC
//                              export all read — C92 §2 THE AUTHORITY), then
//                              re-registers bimManager + the view-dependency
//                              tracker, then dirties BOTH storeys.
//   4. the cascade           — rooms re-detect on source and destination;
//                              host-reference edges DEGRADE rather than dangle.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy. That was L-946, and
// §committed-is-not-reachable is why this header names the whole chain rather
// than only its own quarter.
//
// ─── WHY `slabId`/`levelId` AND NOT `id`/`newLevelId` ────────────────────────
// Because that is what the rest of the slab family already spells:
// `slab.updatePolygon` (`slabId`), `slab.updateLayers` (`slabId`),
// `slab.setThickness` (`slabId`). `wall.changeLevel` uses `id`/`newLevelId` and
// `roof.changeLevel` uses `roofId`/`levelId` — three spellings for one concept
// is exactly why the field names are DECLARED in the register rather than
// re-typed at each call site (C84 EI-2a; L-978 is what happens when a dispatch
// site invents a key the receiver does not accept).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SlabsState } from '../store.js';

export interface ChangeSlabLevelPayload {
  readonly slabId: string;
  readonly levelId: string;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class ChangeSlabLevelHandler
  implements CommandHandler<ChangeSlabLevelPayload, SlabHandlerStores>
{
  readonly type = 'slab.changeLevel';
  readonly affectedStores = ['slab'] as const;

  canExecute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: ChangeSlabLevelPayload,
  ): ValidationResult {
    if (typeof cmd.slabId !== 'string' || cmd.slabId.length === 0) {
      return { valid: false, reason: 'slabId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the slab on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.slab, cmd.slabId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb, so this branch is
      // reached for records restored from disk. That is a pre-existing,
      // repo-wide condition of every bus verb (C84 EI-5a) and not specific to
      // this one; it is logged as L-1070 rather than worked around here, because
      // a per-family workaround would mint the second answer EI-9 forbids.
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    if (ctx.stores.slab[cmd.slabId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `slab ${cmd.slabId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: ChangeSlabLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, draft => {
        const s = draft[cmd.slabId];
        if (s === undefined) return;
        s.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[slabId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts`'s §L-946 arm matches before routing the
      // inverse to `slabStore.changeLevel()`. A deeper or wider patch would fall
      // through to the generic `update()` write, which for `SlabStore` is a
      // WHOLE-RECORD REPLACE — the L-977 annihilation. Do not widen it.
      return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
