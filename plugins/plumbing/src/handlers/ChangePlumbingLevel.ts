// ChangePlumbingLevelHandler — move a plumbing fixture between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: an element's LEVEL must be
// changeable from the property panel and from chat, for every element family
// that has an independent storey. Before L-1032 the panel's eligibility test was
// the literal `elType === 'wall'`, so even families that HAD a working verb were
// reachable from nothing. Plumbing had no verb at all.
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — `LEVEL_CHANGE_VERBS`
//                              (`@pryzm/command-bus/levelChangeVerbs.ts:170-176`)
//                              turns the dispatched payload into a
//                              family-agnostic `element.level-changed` event.
//   3. `elementLevelChangedMirror` — moves the LEGACY `plumbingStore` record
//                              (the one `PlumbingFragmentBuilder`, the 2-D plan
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
// has rows for `wall`, `roof` and `slab` only. Until a `plumbing` row is added
// there — a different lane's file, deliberately not edited from here — the
// legacy record does not move and this verb reaches the plugin store alone. The
// store method it will call, `PlumbingStore.changeLevel`
// (`packages/geometry-plumbing/src/PlumbingStore.ts`), exists as of this change,
// which is the ordering the register demands: never a row before the method.
//
// ─── WHY `plumbingId`/`levelId` ──────────────────────────────────────────────
// Because that is what the rest of the plumbing family already spells
// (`plumbing.move` → `plumbingId`, `plumbing.setSystem` → `plumbingId`) and it
// is what the register DECLARES for this verb (`levelChangeVerbs.ts:170-176`:
// `idField: 'plumbingId'`, `levelField: 'levelId'`). The field names are
// declared in one register rather than re-typed at each call site (C84 EI-2a;
// L-978 is what happens when a dispatch site invents a key the receiver does not
// accept).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { PlumbingsState } from '../store.js';

export interface ChangePlumbingLevelPayload {
  readonly plumbingId: string;
  readonly levelId: string;
}

type Stores = Readonly<{ plumbing: PlumbingsState } & Record<string, unknown>>;

export class ChangePlumbingLevelHandler
  implements CommandHandler<ChangePlumbingLevelPayload, Stores>
{
  readonly type = 'plumbing.changeLevel';
  // The EXACT key the rest of this plugin's handlers declare, and the exact key
  // `buildUndoStoreMap()` binds to the legacy geometry store
  // (`apps/editor/src/engine/undo/performUndoRedo.ts:345` —
  // `plumbing:       w.plumbingStore,`). A key absent from that map makes
  // `_covered()` false, `performUndo` skips the ring buffer and falls through to
  // commandManager, and Ctrl+Z reports "history empty" (the OI-054 bug).
  readonly affectedStores = ['plumbing'] as const;

  canExecute(
    ctx: HandlerContext<Stores>,
    cmd: ChangePlumbingLevelPayload,
  ): ValidationResult {
    if (typeof cmd.plumbingId !== 'string' || cmd.plumbingId.length === 0) {
      return { valid: false, reason: 'plumbingId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the fixture on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.plumbing, cmd.plumbingId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb, so this branch is
      // reached for records restored from disk. That is a pre-existing,
      // repo-wide condition of every bus verb (C84 EI-5a) and not specific to
      // this one; it is logged as L-1070 rather than worked around here, because
      // a per-family workaround would mint the second answer EI-9 forbids.
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    if (ctx.stores.plumbing[cmd.plumbingId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `plumbing ${cmd.plumbingId} is already on level ${cmd.levelId}`,
      };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<Stores>,
    cmd: ChangePlumbingLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<PlumbingsState>(ctx.stores.plumbing, draft => {
        const p = draft[cmd.plumbingId];
        if (p === undefined) return;
        p.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[plumbingId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts:506` matches before routing the inverse to
      // `plumbingStore.changeLevel()`. A deeper or wider patch falls through to
      // the generic `update()` write, which for `PlumbingStore` is a WHOLE-RECORD
      // REPLACE **with no existence check** (declared in
      // `legacyStoreUpdateSemantics.ts:136-143`) — the L-977 annihilation, plus a
      // phantom-record risk the other REPLACE stores do not have. Do not widen it.
      return { forward, inverse, nextStates: { plumbing: next } };
    }); // withHandlerSpan — C10 §2
  }
}
