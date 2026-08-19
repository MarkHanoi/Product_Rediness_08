// ChangeLightingLevelHandler — move a lighting fixture between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: an element's LEVEL must be
// changeable from the property panel and from chat, for every element family
// that has an independent storey. Before L-1032 the panel's eligibility test was
// the literal `elType === 'wall'`, so even families that HAD a working verb were
// reachable from nothing. Lighting had no verb at all.
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — `LEVEL_CHANGE_VERBS`
//                              (`@pryzm/command-bus/levelChangeVerbs.ts:163-169`)
//                              turns the dispatched payload into a
//                              family-agnostic `element.level-changed` event.
//   3. `elementLevelChangedMirror` — moves the LEGACY `lightingStore` record
//                              (the one `LightingFragmentBuilder`, the plan
//                              symbol renderer, persistence and IFC export all
//                              read — C92 §2 THE AUTHORITY), then re-registers
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
// has rows for `wall`, `roof` and `slab` only. Until a `lighting` row is added
// there — a different lane's file, deliberately not edited from here — the
// legacy record does not move and this verb reaches the plugin store alone. The
// store method it will call, `LightingStore.changeLevel`
// (`packages/geometry-lighting/src/LightingStore.ts`), exists as of this change,
// which is the ordering the register demands: never a row before the method.
//
// ─── WHY THE HOSTED-FIXTURE REFUSAL IS NOT IN THIS FILE ──────────────────────
// `LightingData.hostId` (`packages/geometry-lighting/src/LightingTypes.ts:235`)
// binds a fixture to a host element. Moving such a fixture's storey while the
// host stays put leaves a reference pointing across a floor slab, and NOTHING in
// this repo re-resolves or degrades a lighting `hostId` (one writer —
// `packages/command-registry/src/lighting/CreateLightingCommand.ts:47` → `:130`;
// one reader — `apps/editor/src/engine/persistence/ProjectLoader.ts:1308`, a load
// round-trip). C16 CA-18 says a verb that cannot commit must REFUSE and name why,
// so the refusal exists — in `LightingStore.changeLevel`, which is the only layer
// that can SEE the field.
//
// `canExecute` here structurally cannot ask: `ctx.stores.lighting` is the PLUGIN
// DTO store, whose schema (`packages/schemas/src/elements/Lighting.ts`) declares
// no `hostId` at all. Reading the legacy record from this handler would mean a
// `window.*` bridge cast, which P4 forbids and which would put the answer in a
// second place (C84 EI-9). Recorded here rather than left blank, because a
// missing refusal and an unstated one look identical from this file.
//
// ─── WHY `lightingId`/`levelId` ──────────────────────────────────────────────
// Because that is what the rest of the lighting family already spells
// (`lighting.move` → `lightingId`, `lighting.setIntensity` → `lightingId`) and it
// is what the register DECLARES for this verb (`levelChangeVerbs.ts:163-169`:
// `idField: 'lightingId'`, `levelField: 'levelId'`). The field names are declared
// in one register rather than re-typed at each call site (C84 EI-2a; L-978 is
// what happens when a dispatch site invents a key the receiver does not accept).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { LightingsState } from '../store.js';

export interface ChangeLightingLevelPayload {
  readonly lightingId: string;
  readonly levelId: string;
}

type Stores = Readonly<{ lighting: LightingsState } & Record<string, unknown>>;

export class ChangeLightingLevelHandler
  implements CommandHandler<ChangeLightingLevelPayload, Stores>
{
  readonly type = 'lighting.changeLevel';
  // The EXACT key the rest of this plugin's handlers declare, and the exact key
  // `buildUndoStoreMap()` binds to the legacy geometry store
  // (`apps/editor/src/engine/undo/performUndoRedo.ts:346` —
  // `lighting:       w.lightingStore,`). A key absent from that map makes
  // `_covered()` false, `performUndo` skips the ring buffer and falls through to
  // commandManager, and Ctrl+Z reports "history empty" (the OI-054 bug).
  readonly affectedStores = ['lighting'] as const;

  canExecute(
    ctx: HandlerContext<Stores>,
    cmd: ChangeLightingLevelPayload,
  ): ValidationResult {
    if (typeof cmd.lightingId !== 'string' || cmd.lightingId.length === 0) {
      return { valid: false, reason: 'lightingId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the fixture on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.lighting, cmd.lightingId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb, so this branch is
      // reached for records restored from disk. That is a pre-existing,
      // repo-wide condition of every bus verb (C84 EI-5a) and not specific to
      // this one; it is logged as L-1070 rather than worked around here, because
      // a per-family workaround would mint the second answer EI-9 forbids.
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    if (ctx.stores.lighting[cmd.lightingId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `lighting ${cmd.lightingId} is already on level ${cmd.levelId}`,
      };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<Stores>,
    cmd: ChangeLightingLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<LightingsState>(ctx.stores.lighting, draft => {
        const l = draft[cmd.lightingId];
        if (l === undefined) return;
        l.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[lightingId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts:506` matches before routing the inverse to
      // `lightingStore.changeLevel()`. `LightingStore.update` is a MERGE
      // (`legacyStoreUpdateSemantics.ts:248-253`), so a wider patch would not
      // annihilate the record the way it does for the four REPLACE stores — but
      // it WOULD take the generic `update()` path, which emits only the legacy
      // DOM event and never reaches `storeEventBus`, so the plan views of both
      // storeys would go un-dirtied. Do not widen it.
      return { forward, inverse, nextStates: { lighting: next } };
    }); // withHandlerSpan — C10 §2
  }
}
