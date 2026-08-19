// ChangeCurtainWallLevelHandler — move a curtain wall between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: *"the wall element can be
// changed — and works. However the slab element, for example, cannot be
// changed."* The property panel's eligibility test was the hard-coded literal
// `elType === 'wall'`, so every other family rendered its level as a VALUE with
// no control. `curtainWall` is one of the families that row now covers.
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
// A level change is not one write. `wall.changeLevel` is the reference
// implementation and all four parts are load-bearing:
//
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store, and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — `LEVEL_CHANGE_VERBS`
//                              (`@pryzm/command-bus/levelChangeVerbs`) turns the
//                              dispatched payload into a family-agnostic
//                              `element.level-changed` event.
//   3. `elementLevelChangedMirror` — moves the LEGACY `curtainWallStore` record
//                              (the one the builder, plan view, persistence and
//                              IFC export all read — C92 §2 THE AUTHORITY), then
//                              re-registers bimManager + the view-dependency
//                              tracker, then dirties BOTH storeys.
//   4. the cascade           — for THIS family the cascade is not optional and
//                              not hypothetical: the legacy store's 'update'
//                              drives `CurtainPanelSyncHandler`, which carries
//                              the wall's PANELS to the new storey. A panel
//                              carries its own required `levelId`
//                              (`CurtainPanelTypes.ts:128` → `CoreElement`), so
//                              without that step the assembly moves and its
//                              panels stay filed on the level it left.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy — panels included. That was
// L-946, and §committed-is-not-reachable is why this header names the whole
// chain rather than only its own quarter.
//
// ─── WHY THE VERB IS `curtainWall.changeLevel`, NOT `curtain-wall.changeLevel` ─
// Every other verb in this plugin is hyphenated (`curtain-wall.move`,
// `curtain-wall.setGrid`). This one is camel-cased because
// `packages/command-bus/src/levelChangeVerbs.ts:184-193` DECLARES it that way,
// and that register — not this file — is what `CommandEventBridge`, the property
// panel and the chat registration all read. A verb string that disagrees with
// its register row is a row that matches nothing: the bridge would never build
// the `element.level-changed` event, the mirror would never run, and the command
// would report success while the renderer kept its own copy. The register is the
// single authority (C84 EI-9); this file follows it rather than the local
// convention.
//
// ─── WHY `curtainWallId`/`levelId` ───────────────────────────────────────────
// Same register row, and it matches what the rest of the family already spells
// (`curtain-wall.move` → `curtainWallId`, `curtain-wall.resize` →
// `curtainWallId`). L-978 is what happens when a dispatch site invents a key the
// receiver does not accept: the value is silently replaced by a schema default.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { CurtainWallsState } from '../store.js';

export interface ChangeCurtainWallLevelPayload {
  readonly curtainWallId: string;
  readonly levelId: string;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class ChangeCurtainWallLevelHandler
  implements CommandHandler<ChangeCurtainWallLevelPayload, CWStores>
{
  readonly type = 'curtainWall.changeLevel';
  // Deliberately NO `aliases` for the hyphenated spelling, unlike
  // `MoveCurtainWall.ts:25`. That alias exists there to keep a PRE-MIGRATION
  // caller working; this verb has no callers predating it, and its one
  // dispatcher builds the verb string from the register itself
  // (`buildLevelChangePayload` / `spec.verb`). A second name for a verb nothing
  // spells by hand is a second thing the register would have to stay in step
  // with, for no caller.
  /**
   * `curtainwall` — ONE WORD, LOWERCASE, and the exact key matters.
   * `buildUndoStoreMap()` (`apps/editor/src/engine/undo/performUndoRedo.ts:315-320`)
   * says so in its own comment: *"the bus handler declares
   * affectedStores=['curtainwall'] (one word, lowercase) — that EXACT key MUST be
   * present or curtain-wall undo falls to commandManager ('history empty'), the
   * identical bug walls had"*. Every other handler in this plugin declares the
   * same key.
   */
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(
    ctx: HandlerContext<CWStores>,
    cmd: ChangeCurtainWallLevelPayload,
  ): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the wall on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.curtainwall, cmd.curtainWallId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb, so this branch is
      // reached for records restored from disk. That is a pre-existing,
      // repo-wide condition of every bus verb (C84 EI-5a) and not specific to
      // this one; it is logged as L-1070 rather than worked around here, because
      // a per-family workaround would mint the second answer EI-9 forbids.
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    if (ctx.stores.curtainwall[cmd.curtainWallId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `curtain wall ${cmd.curtainWallId} is already on level ${cmd.levelId}`,
      };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<CWStores>,
    cmd: ChangeCurtainWallLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<CurtainWallsState>(
        ctx.stores.curtainwall,
        draft => {
          const cw = draft[cmd.curtainWallId];
          if (cw === undefined) return;
          cw.levelId = cmd.levelId;
        },
      );
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[curtainWallId, 'levelId']`). That exact shape is what
      // `apps/editor/src/engine/undo/elementUndoStoreAdapter.ts:506` matches
      // before routing the inverse to `curtainWallStore.changeLevel()` — which is
      // also what re-runs the panel cascade on the way back. A deeper or wider
      // patch falls through to the generic `update()` arm, which for this store
      // survives (it is a MERGE) but SKIPS the bimManager / view-dependency
      // re-registration the adapter performs alongside the `changeLevel` call,
      // leaving the record on one storey and its spatial registration on another.
      // Do not widen it.
      return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
