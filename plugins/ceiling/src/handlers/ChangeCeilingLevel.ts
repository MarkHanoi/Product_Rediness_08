// ChangeCeilingLevelHandler — move a ceiling between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: *"the wall element can be
// changed — and works. However the slab element, for example, cannot be
// changed."* The property panel's eligibility test was the literal
// `elType === 'wall'`, so every OTHER family rendered its storey as a VALUE with
// no control. `@pryzm/command-bus`'s `LEVEL_CHANGE_VERBS` is now the one
// register the panel, the L3 bridge and the chat all read; this handler is the
// ceiling row's part (a).
//
// For a ceiling the absence was doubly invisible: the legacy `CeilingStore`
// ACTIVELY refuses a storey change through `update()` — it warns and deletes the
// key (`CeilingStore.ts:181-184`) — so even a caller who found a way to dispatch
// `{levelId}` got a success return over a ceiling that never moved. The store
// method this verb depends on (`CeilingStore.changeLevel`) is what makes the
// move expressible at all, and `LEVEL_CHANGE_VERBS` states the ordering rule:
// never add a register row before the store method exists.
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — turns the payload into a family-agnostic
//                              `element.level-changed` event via this row's
//                              `idField`/`levelField`.
//   3. `elementLevelChangedMirror` — moves the LEGACY `ceilingStore` record (the
//                              one `CeilingFragmentBuilder`, the plan view,
//                              persistence and IFC export all read), then
//                              re-registers bimManager + the view-dependency
//                              tracker, then dirties BOTH storeys.
//   4. the cascade           — `coveredRoomIds` / `boundingWallIds` / `hostRoomId`
//                              now name rooms and walls on the storey the ceiling
//                              LEFT. Those are constraint questions owned by the
//                              ceiling seating rules, not silently rewritten here.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy — L-946, and
// §committed-is-not-reachable.
//
// ─── WHY `ceilingId`/`levelId` ───────────────────────────────────────────────
// It is what the rest of the ceiling family already spells (`ceiling.setHeight`,
// `ceiling.setBoundary`, `ceiling.updateLayers` all take `ceilingId`). The field
// names are DECLARED in `LEVEL_CHANGE_VERBS` rather than re-typed at each call
// site (C84 EI-2a; L-978 is what happens when a dispatch site invents a key the
// receiver does not accept).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { CeilingsState } from '../store.js';

export interface ChangeCeilingLevelPayload {
  readonly ceilingId: string;
  readonly levelId: string;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export class ChangeCeilingLevelHandler
  implements CommandHandler<ChangeCeilingLevelPayload, CeilingHandlerStores>
{
  readonly type = 'ceiling.changeLevel';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(
    ctx: HandlerContext<CeilingHandlerStores>,
    cmd: ChangeCeilingLevelPayload,
  ): ValidationResult {
    if (typeof cmd.ceilingId !== 'string' || cmd.ceilingId.length === 0) {
      return { valid: false, reason: 'ceilingId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the ceiling on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.ceiling, cmd.ceilingId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb. That is a
      // pre-existing, repo-wide condition of every bus verb (C84 EI-5a) and not
      // specific to this one; a per-family workaround would mint the second
      // answer EI-9 forbids.
      return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    }
    if (ctx.stores.ceiling[cmd.ceilingId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `ceiling ${cmd.ceilingId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<CeilingHandlerStores>,
    cmd: ChangeCeilingLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, draft => {
        const c = draft[cmd.ceilingId];
        if (c === undefined) return;
        c.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[ceilingId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts`'s §L-946 arm matches before routing the
      // inverse to `ceilingStore.changeLevel()`. A deeper or wider patch falls
      // through to the generic `update()` write — which for `CeilingStore` warns
      // and DELETES the `levelId` key, so Ctrl+Z would report success and revert
      // nothing. Do not widen it.
      return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
