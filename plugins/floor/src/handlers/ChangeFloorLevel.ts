// ChangeFloorLevelHandler — move a floor finish between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: *"the wall element can be
// changed — and works. However the slab element, for example, cannot be
// changed."* The property panel's eligibility test was the literal
// `elType === 'wall'`, so every OTHER family rendered its storey as a VALUE with
// no control. `@pryzm/command-bus`'s `LEVEL_CHANGE_VERBS` is now the one
// register the panel, the L3 bridge and the chat all read; this handler is the
// floor row's part (a).
//
// For a floor finish the absence was doubly invisible: the legacy `FloorStore`
// ACTIVELY refuses a storey change through `update()` — it warns and deletes the
// key (`FloorStore.ts:141-144`) — so even a caller who found a way to dispatch
// `{levelId}` got a `FloorData` back, a bumped `metadata.version`, an 'update'
// fan-out, and a floor that never moved. `FloorStore.changeLevel` is what makes
// the move expressible at all, and `LEVEL_CHANGE_VERBS` states the ordering
// rule: never add a register row before the store method exists.
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — turns the payload into a family-agnostic
//                              `element.level-changed` event via this row's
//                              `idField`/`levelField`.
//   3. `elementLevelChangedMirror` — moves the LEGACY `floorStore` record (the
//                              one `FloorFragmentBuilder`, the plan view,
//                              persistence and IFC export all read), then
//                              re-registers bimManager + the view-dependency
//                              tracker, then dirties BOTH storeys.
//   4. the cascade           — `hostSlabId` now names a slab on the storey the
//                              floor LEFT, so `FloorSlabBindingHandler` is
//                              holding a cross-storey binding. That is a real
//                              constraint question and it is NOT silently
//                              dropped here: destroying an authored binding to
//                              make a move look tidy is data loss.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy — L-946, and
// §committed-is-not-reachable.
//
// ─── WHY A CLASS AND NOT AN OBJECT LITERAL ───────────────────────────────────
// This plugin mixes both shapes (`CreateFloorHandler` is a class,
// `SetFloorMaterialHandler` an object). The class shape is used here to match
// `ChangeSlabLevelHandler`, which is the reference implementation this family's
// row was derived from; the registration below spells the `new`.
//
// ─── WHY `floorId`/`levelId` ─────────────────────────────────────────────────
// It is what the rest of the floor family already spells (`floor.updateLayers`,
// `floor.setMaterial` both take `floorId`). The field names are DECLARED in
// `LEVEL_CHANGE_VERBS` rather than re-typed at each call site (C84 EI-2a; L-978
// is what happens when a dispatch site invents a key the receiver does not
// accept).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { FloorsState } from '../store.js';

export interface ChangeFloorLevelPayload {
  readonly floorId: string;
  readonly levelId: string;
}

type FloorHandlerStores = Readonly<{ floor: FloorsState } & Record<string, unknown>>;

export class ChangeFloorLevelHandler
  implements CommandHandler<ChangeFloorLevelPayload, FloorHandlerStores>
{
  readonly type = 'floor.changeLevel';
  readonly affectedStores = ['floor'] as const;

  canExecute(
    ctx: HandlerContext<FloorHandlerStores>,
    cmd: ChangeFloorLevelPayload,
  ): ValidationResult {
    if (typeof cmd.floorId !== 'string' || cmd.floorId.length === 0) {
      return { valid: false, reason: 'floorId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the floor on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.floor, cmd.floorId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb. That is a
      // pre-existing, repo-wide condition of every bus verb (C84 EI-5a) and not
      // specific to this one; a per-family workaround would mint the second
      // answer EI-9 forbids.
      return { valid: false, reason: `floor not found: ${cmd.floorId}` };
    }
    if (ctx.stores.floor[cmd.floorId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `floor ${cmd.floorId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<FloorHandlerStores>,
    cmd: ChangeFloorLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<FloorsState>(ctx.stores.floor, draft => {
        const f = draft[cmd.floorId];
        if (f === undefined) return;
        f.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[floorId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts`'s §L-946 arm matches before routing the
      // inverse to `floorStore.changeLevel()`. A deeper or wider patch falls
      // through to the generic `update()` write — which for `FloorStore` warns
      // and DELETES the `levelId` key, so Ctrl+Z would report success and revert
      // nothing. Do not widen it.
      return { forward, inverse, nextStates: { floor: next } };
    }); // withHandlerSpan — C10 §2
  }
}
