// ChangeFurnitureLevelHandler — move a furniture item between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: an element's LEVEL must be
// changeable from the property panel and from chat, for every element family
// that has an independent storey. Before L-1032 the panel's eligibility test was
// the literal `elType === 'wall'`, so `roof.changeLevel` — live, undoable and
// correctly cascading since S11 — was reachable from nothing. Furniture had no
// verb at all.
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
// A level change is not one write. All four parts are load-bearing:
//
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — `LEVEL_CHANGE_VERBS`
//                              (`@pryzm/command-bus/levelChangeVerbs.ts:156-162`)
//                              turns the dispatched payload into a
//                              family-agnostic `element.level-changed` event.
//   3. `elementLevelChangedMirror` — moves the LEGACY `furnitureStore` record
//                              (the one the fragment builder, the 2-D plan
//                              projector, persistence and IFC export all read —
//                              C92 §2 THE AUTHORITY), then re-registers
//                              bimManager + the view-dependency tracker, then
//                              dirties BOTH storeys.
//   4. the cascade           — host-reference edges DEGRADE rather than dangle.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy. That was L-946, and
// §committed-is-not-reachable is why this header names the whole chain rather
// than only its own quarter.
//
// ⚠ PART (3) IS NOT WIRED FOR THIS FAMILY YET, and saying so is the point.
// `LEGACY_LEVEL_MOVERS` (`apps/editor/src/engine/elementLevelChangedMirror.ts:111-120`)
// has rows for `wall`, `roof` and `slab` only. Until a `furniture` row is added
// there — a different lane's file, deliberately not edited from here — the
// legacy record does not move and this verb reaches the plugin store alone. The
// store method it will call, `FurnitureStore.changeLevel`
// (`packages/geometry-furniture/src/FurnitureStore.ts`), exists as of this
// change, which is the ordering the register demands: never a row before the
// method.
//
// ─── WHY `furnitureId`/`levelId` AND NOT `id`/`newLevelId` ───────────────────
// Because that is what the rest of the furniture family already spells
// (`furniture.move` → `furnitureId`, `furniture.rotate` → `furnitureId`,
// `furniture.setScale` → `furnitureId`) and it is what the register DECLARES for
// this verb (`levelChangeVerbs.ts:156-162`: `idField: 'furnitureId'`,
// `levelField: 'levelId'`). `wall.changeLevel` uses `id`/`newLevelId` and
// `roof.changeLevel` uses `roofId`/`levelId` — three spellings for one concept
// is exactly why the field names are declared in one register rather than
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
import type { FurnituresState } from '../store.js';

export interface ChangeFurnitureLevelPayload {
  readonly furnitureId: string;
  readonly levelId: string;
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class ChangeFurnitureLevelHandler
  implements CommandHandler<ChangeFurnitureLevelPayload, Stores>
{
  readonly type = 'furniture.changeLevel';
  // The EXACT key the rest of this plugin's handlers declare, and the exact key
  // `buildUndoStoreMap()` binds to the legacy geometry store
  // (`apps/editor/src/engine/undo/performUndoRedo.ts:322` —
  // `furniture:      w.furnitureStore,`). A key absent from that map makes
  // `_covered()` false, `performUndo` skips the ring buffer and falls through to
  // commandManager, and Ctrl+Z reports "history empty" (the OI-054 bug).
  readonly affectedStores = ['furniture'] as const;

  canExecute(
    ctx: HandlerContext<Stores>,
    cmd: ChangeFurnitureLevelPayload,
  ): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the item on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.furniture, cmd.furnitureId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb, so this branch is
      // reached for records restored from disk. That is a pre-existing,
      // repo-wide condition of every bus verb (C84 EI-5a) and not specific to
      // this one; it is logged as L-1070 rather than worked around here, because
      // a per-family workaround would mint the second answer EI-9 forbids.
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    if (ctx.stores.furniture[cmd.furnitureId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `furniture ${cmd.furnitureId} is already on level ${cmd.levelId}`,
      };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<Stores>,
    cmd: ChangeFurnitureLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, draft => {
        const f = draft[cmd.furnitureId];
        if (f === undefined) return;
        f.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[furnitureId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts:506` matches before routing the inverse to
      // `furnitureStore.changeLevel()`. A deeper or wider patch falls through to
      // the generic `update()` write, which for `FurnitureStore` is a
      // WHOLE-RECORD REPLACE (declared in `legacyStoreUpdateSemantics.ts:128-135`)
      // — the L-977 annihilation. Do not widen it.
      return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
