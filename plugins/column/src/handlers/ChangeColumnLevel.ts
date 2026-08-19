// ChangeColumnLevelHandler — move a column between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: *"the wall element can be
// changed — and works. However the slab element, for example, cannot be
// changed."* The panel's eligibility test was the hard-coded literal
// `elType === 'wall'`, so every other family rendered its level as a VALUE with
// no control. `column` is one of the families that row now covers.
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
//   3. `elementLevelChangedMirror` — moves the LEGACY `columnStore` record (the
//                              one the fragment builder, plan view, persistence
//                              and IFC export all read — C92 §2 THE AUTHORITY),
//                              then re-registers bimManager + the view-dependency
//                              tracker, then dirties BOTH storeys.
//   4. the cascade           — rooms re-detect on source and destination;
//                              host-reference edges DEGRADE rather than dangle.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy. That was L-946, and
// §committed-is-not-reachable is why this header names the whole chain rather
// than only its own quarter.
//
// ─── WHY `columnId`/`levelId` AND NOT `id`/`newLevelId` ──────────────────────
// Because that is what `packages/command-bus/src/levelChangeVerbs.ts:128-134`
// DECLARES for this family, and it is what the rest of the column family already
// spells (`column.move` → `columnId`; `column.setHeight` → `columnId`).
// `wall.changeLevel` uses `id`/`newLevelId` and `roof.changeLevel` uses
// `roofId`/`levelId` — three spellings for one concept is exactly why the field
// names live in the register rather than being re-typed at each call site
// (C84 EI-2a; L-978 is what happens when a dispatch site invents a key the
// receiver does not accept).
//
// ─── WHY THE LEGACY STORE METHOD HAD TO COME FIRST ───────────────────────────
// `ColumnStore.update` is a WHOLE-RECORD REPLACE
// (`packages/geometry-column/src/ColumnStore.ts:215-243`; declared
// `semantics: 'replace'` in
// `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts:118-127`). Without
// `ColumnStore.changeLevel` the undo adapter's §L-946 arm falls through to that
// generic write and Ctrl+Z destroys the column — L-977. The store method exists
// (`ColumnStore.ts:245`); this verb may therefore exist.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { ColumnsState } from '../store.js';

export interface ChangeColumnLevelPayload {
  readonly columnId: string;
  readonly levelId: string;
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class ChangeColumnLevelHandler
  implements CommandHandler<ChangeColumnLevelPayload, ColumnHandlerStores>
{
  readonly type = 'column.changeLevel';
  readonly affectedStores = ['column'] as const;

  canExecute(
    ctx: HandlerContext<ColumnHandlerStores>,
    cmd: ChangeColumnLevelPayload,
  ): ValidationResult {
    if (typeof cmd.columnId !== 'string' || cmd.columnId.length === 0) {
      return { valid: false, reason: 'columnId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the column on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.column, cmd.columnId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb, so this branch is
      // reached for records restored from disk. That is a pre-existing,
      // repo-wide condition of every bus verb (C84 EI-5a) and not specific to
      // this one; it is logged as L-1070 rather than worked around here, because
      // a per-family workaround would mint the second answer EI-9 forbids.
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    if (ctx.stores.column[cmd.columnId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `column ${cmd.columnId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<ColumnHandlerStores>,
    cmd: ChangeColumnLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, draft => {
        const c = draft[cmd.columnId];
        if (c === undefined) return;
        c.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[columnId, 'levelId']`). That exact shape is what
      // `apps/editor/src/engine/undo/elementUndoStoreAdapter.ts:506` matches
      // before routing the inverse to `columnStore.changeLevel()`. A deeper or
      // wider patch falls through to the generic `update()` write, which for
      // `ColumnStore` is a WHOLE-RECORD REPLACE — the L-977 annihilation. Do not
      // widen it.
      return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
