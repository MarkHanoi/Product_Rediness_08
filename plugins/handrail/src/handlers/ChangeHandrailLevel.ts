// ChangeHandrailLevelHandler — move a handrail between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: *"the wall element can be
// changed — and works. However the slab element, for example, cannot be
// changed."* The property panel's eligibility test was the literal
// `elType === 'wall'`, so every OTHER family rendered its storey as a VALUE with
// no control — handrails included. `@pryzm/command-bus`'s `LEVEL_CHANGE_VERBS`
// is now the one register the panel, the L3 bridge and the chat all read; this
// handler is the handrail row's part (a).
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — turns the payload into a family-agnostic
//                              `element.level-changed` event via this row's
//                              `idField`/`levelField`.
//   3. `elementLevelChangedMirror` — moves the LEGACY `handrailStore` record (the
//                              one `HandrailFragmentBuilder`, the plan view,
//                              persistence and IFC export all read), then
//                              re-registers bimManager + the view-dependency
//                              tracker, then dirties BOTH storeys.
//   4. the cascade           — a handrail hosted on a stair or a slab edge keeps
//                              its `hostId`, which now names an element on the
//                              storey the handrail LEFT; and a multi-segment run
//                              shares vertices with siblings that did NOT move
//                              (`suppressStartPost`, C95 §D4). Both are
//                              constraint questions owned by the handrail host
//                              resolver, not silently rewritten here.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy — L-946, and
// §committed-is-not-reachable.
//
// A handrail is NOT a hosted element in the C15 §2 sense: unlike a door or a
// window it carries its own `levelId`
// (`packages/schemas/src/elements/Handrail.ts:45`) and the legacy record parents
// itself to its storey (`HandrailStore.ts:42`). `hostId` is an OPTIONAL
// attachment, not the source of its coordinates — which is why this family gets
// a verb where door and window get a declared refusal in
// `LEVEL_CHANGE_REFUSALS`.
//
// ─── WHY `handrailId`/`levelId` ──────────────────────────────────────────────
// It is what the rest of the handrail family already spells (`handrail.setPath`,
// `handrail.setShape`, `handrail.setHost` all take `handrailId`). The field
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
import type { HandrailsState } from '../store.js';

export interface ChangeHandrailLevelPayload {
  readonly handrailId: string;
  readonly levelId: string;
}

type HandrailHandlerStores = Readonly<{ handrail: HandrailsState } & Record<string, unknown>>;

export class ChangeHandrailLevelHandler
  implements CommandHandler<ChangeHandrailLevelPayload, HandrailHandlerStores>
{
  readonly type = 'handrail.changeLevel';
  readonly affectedStores = ['handrail'] as const;

  canExecute(
    ctx: HandlerContext<HandrailHandlerStores>,
    cmd: ChangeHandrailLevelPayload,
  ): ValidationResult {
    if (typeof cmd.handrailId !== 'string' || cmd.handrailId.length === 0) {
      return { valid: false, reason: 'handrailId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the handrail on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.handrail, cmd.handrailId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb. That is a
      // pre-existing, repo-wide condition of every bus verb (C84 EI-5a) and not
      // specific to this one; a per-family workaround would mint the second
      // answer EI-9 forbids.
      return { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
    }
    if (ctx.stores.handrail[cmd.handrailId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `handrail ${cmd.handrailId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<HandrailHandlerStores>,
    cmd: ChangeHandrailLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<HandrailsState>(ctx.stores.handrail, draft => {
        const h = draft[cmd.handrailId];
        if (h === undefined) return;
        h.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[handrailId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts`'s §L-946 arm matches before routing the
      // inverse to `handrailStore.changeLevel()`. A deeper or wider patch would
      // fall through to the generic `update()` write, which moves `levelId` while
      // leaving `parentId` and `spatialRelationship` on the storey the handrail
      // left — the same two-copy divergence, reached only on the undo leg. Do not
      // widen it.
      return { forward, inverse, nextStates: { handrail: next } };
    }); // withHandlerSpan — C10 §2
  }
}
