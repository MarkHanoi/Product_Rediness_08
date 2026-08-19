// ChangeBeamLevelHandler — move a beam between storeys (§L-1032).
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Founder, 2026-08-19, from live production use: *"the wall element can be
// changed — and works. However the slab element, for example, cannot be
// changed."* The property panel's eligibility test was the literal
// `elType === 'wall'`, so every OTHER family rendered its storey as a VALUE with
// no control — beams included. `@pryzm/command-bus`'s `LEVEL_CHANGE_VERBS` is
// now the one register the panel, the L3 bridge and the chat all read, and this
// handler is the beam row's part (a).
//
// ─── THE FOUR-PART CHAIN THIS IS ONE QUARTER OF ──────────────────────────────
// A level change is not one write. `wall.changeLevel` is the reference
// implementation and all four parts are load-bearing:
//
//   1. THIS handler          — rewrites `levelId` in the plugin DTO store, and
//                              produces the forward/inverse patch pair that
//                              `elementUndoStoreAdapter` turns back into a
//                              `changeLevel` call on Ctrl+Z.
//   2. `CommandEventBridge`  — turns the dispatched payload into a
//                              family-agnostic `element.level-changed` event
//                              using this row's `idField`/`levelField`.
//   3. `elementLevelChangedMirror` — moves the LEGACY `beamStore` record (the
//                              one `BeamFragmentBuilder`, the plan view,
//                              persistence and IFC export all read), then
//                              re-registers bimManager + the view-dependency
//                              tracker, then dirties BOTH storeys.
//   4. the cascade           — support references (`startSupportId` /
//                              `endSupportId`) now point at columns and walls on
//                              the storey the beam LEFT. That is a real
//                              constraint question, owned by the beam support
//                              resolver, not silently dropped here.
//
// Omit (3) and the command succeeds, the plugin store is right, and the layer
// the user experiences keeps its own unchanged copy. That was L-946, and
// §committed-is-not-reachable is why this header names the whole chain rather
// than only its own quarter.
//
// ─── WHY `beamId`/`levelId` AND NOT `id`/`newLevelId` ────────────────────────
// Because that is what the rest of the beam family already spells:
// `beam.setType` (`beamId`), `beam.setSection` (`beamId`), `beam.move`.
// `wall.changeLevel` uses `id`/`newLevelId` and `roof.changeLevel` uses
// `roofId`/`levelId` — three spellings for one concept is exactly why the field
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
import type { BeamsState } from '../store.js';

export interface ChangeBeamLevelPayload {
  readonly beamId: string;
  readonly levelId: string;
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class ChangeBeamLevelHandler
  implements CommandHandler<ChangeBeamLevelPayload, BeamHandlerStores>
{
  readonly type = 'beam.changeLevel';
  readonly affectedStores = ['beam'] as const;

  canExecute(
    ctx: HandlerContext<BeamHandlerStores>,
    cmd: ChangeBeamLevelPayload,
  ): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
    }
    // An empty destination is REFUSED rather than defaulted. `'' ?? 'L0'` is the
    // §DIAG-WALL-LEVEL trap — a silent default files the beam on the GROUND
    // floor, and the founder's report for that one was "sometimes first-floor
    // rooms overlap on the ground plan".
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'levelId must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.beam, cmd.beamId)) {
      // C16 CA-18 — a refusal that names its reason. See L-1070: after a project
      // LOAD this store is empty for every family, because `ProjectLoader`
      // replays LEGACY commands and dispatches no bus verb, so this branch is
      // reached for records restored from disk. That is a pre-existing,
      // repo-wide condition of every bus verb (C84 EI-5a) and not specific to
      // this one; it is logged as L-1070 rather than worked around here, because
      // a per-family workaround would mint the second answer EI-9 forbids.
      return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    }
    if (ctx.stores.beam[cmd.beamId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `beam ${cmd.beamId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<BeamHandlerStores>,
    cmd: ChangeBeamLevelPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, draft => {
        const b = draft[cmd.beamId];
        if (b === undefined) return;
        b.levelId = cmd.levelId;
      });
      // The patch pair is deliberately JUST `levelId`, at depth 2
      // (`[beamId, 'levelId']`). That exact shape is what
      // `elementUndoStoreAdapter.ts`'s §L-946 arm matches before routing the
      // inverse to `beamStore.changeLevel()`. A deeper or wider patch would fall
      // through to the generic `update()` write, which for the legacy `BeamStore`
      // moves `levelId` while leaving `parentId` on the storey the beam left —
      // the same two-copy divergence, reached only on the undo leg. Do not widen it.
      return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
