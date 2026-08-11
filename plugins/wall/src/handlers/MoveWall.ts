// MoveWallHandler — facade over TransformWallHandler (W-1B-1 errata).
//
// The original S07-T5 implementation has been superseded by
// TransformWallHandler (ADR-008 §"Wave 3 — S10") which accepts the
// same ABSOLUTE baseLine via `kind: 'referenceEdit'`.  This file is
// kept as a thin facade so existing bus registrations and tests that
// reference `wall.move` continue to work without migration overhead.
//
// @deprecated Use TransformWallHandler with { kind: 'referenceEdit', ... } directly.
//
// ADR-0008 errata (W-1B-1): MoveWall is now a 1-call delegation to
// TransformWall.referenceEdit.  The full validation logic has moved
// into TransformWallHandler where it is shared with mirror / scale /
// offset / move-delta transforms.

import { type CommandHandler, type HandlerContext, type HandlerResult, type ValidationResult, withHandlerSpan } from '@pryzm/plugin-sdk';
import { TransformWallHandler } from './TransformWall.js';
import type { WallData, WallsState } from '../store.js';

export interface MoveWallPayload {
  readonly id: string;
  readonly baseLine: WallData['baseLine'];
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const INNER = new TransformWallHandler();

/**
 * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4, Class A "dead verb") — why `wall.move` now REFUSES.
 *
 * This handler produced a correct Immer patch against `ctx.stores.wall`, reported
 * SUCCESS, and changed nothing any user could ever see. In production the bus's
 * storesProvider (apps/editor/src/bootstrap.ts:92-97) hands it a snapshot of the FRESH
 * plugin DTO store built by PluginRegistry — not the legacy geometry singleton that the
 * fragment builders, the 2-D plan projector, the IFC exporter and persistence all read.
 * Only `<family>.created` is mirrored across; there is no update bridge in either
 * direction.
 *
 * IT IS ALSO A DEAD PARALLEL PATH. No production surface dispatches it. The ONE table
 * that decides what a move dispatches is `MOVE_COMMAND_BY_TYPE`
 * (apps/editor/src/engine/transforms/elementMove.ts:102-127), and the 3-D gizmo's own
 * list is the 13 `dragDispatch(...)` sites in `registerTransformDragHandler.ts`.
 * Neither names `wall.move`. The `plugins/cross` cascade rules that synthesise it are
 * inert: `CascadeRunner` is registered nowhere in production (only in
 * packages/command-bus/__tests__/cascade.test.ts and commented-out examples).
 * So refusing costs a user nothing, and leaving it silent keeps a SECOND, lying
 * mutation path alive against P6.
 *
 * THE UNDO HAZARD THIS ALSO CLOSES. `affectedStores` is `['wall']`, and CommandBus
 * pushes that key verbatim onto the ring buffer. `buildUndoStoreMap()`
 * (apps/editor/src/engine/undo/performUndoRedo.ts) maps it to the GEOMETRY store. So a
 * ring-first Ctrl+Z handed the geometry store an INVERSE carrying the plugin store's
 * stale prior value, for a forward write geometry never saw. Reproduced and pinned in
 * apps/editor/__tests__/deadMoveVerbAuthoritativeState.test.ts.
 *
 * DECISION: REFUSE, not retire. `CapabilityRefusal` / `CHAT_UNAVAILABLE` /
 * `ChatCommandClassification` name these verbs, and
 * `tools/ga-gate/check-chat-capability-coverage.ts` requires every such name to be a
 * REGISTERED bus command — retiring would make chat's own refusal cite a verb that does
 * not exist.
 *
 * The refusal lives in `canExecute` deliberately: CommandBus throws there before
 * touching either undo stack, so no geometry-keyed PatchPair is ever armed. Payload
 * validation runs FIRST (`validatePayload`) so a malformed payload still gets its own
 * specific reason rather than this one.
 *
 * `execute()` is left intact: it is a correct plugin-store mutation for a host that
 * binds the authoritative store under this key. `canExecute` is the gate the bus honours.
 */
const WALL_MOVE_UNREACHABLE =
  "wall.move writes the detached plugin wall store that nothing renders, exports or persists, and no production surface dispatches it. Moving a wall commits through wall.updateBaseline (payload keys: wallId, newBaseLine, prevBaseLine) — the live bridge to UpdateWallBaselineCommand and the geometry wallStore, pinned by L-49 — which is what both the 3-D gizmo and the plan Move tool already dispatch. Use the Move tool, the 3-D gizmo, or wall.updateBaseline directly.";

export class MoveWallHandler implements CommandHandler<MoveWallPayload, WallHandlerStores> {
  readonly type = 'wall.move';
  readonly affectedStores = ['wall'] as const;

  /**
   * Payload validation ONLY.
   *
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — this delegates to `INNER.validatePayload`,
   * NOT to `INNER.canExecute`. `TransformWallHandler.canExecute` now refuses too, and
   * routing through it would make a `wall.move` caller read a refusal that talks about
   * `wall.transform`. Each verb must state its OWN reason, so the facade reuses only the
   * shared validation and supplies its own refusal above.
   */
  validatePayload(ctx: HandlerContext<WallHandlerStores>, cmd: MoveWallPayload): ValidationResult {
    return INNER.validatePayload(ctx, { kind: 'referenceEdit', id: cmd.id, newBaseLine: cmd.baseLine });
  }

  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx: HandlerContext<WallHandlerStores>, cmd: MoveWallPayload): ValidationResult {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — the payload is well-formed, and it STILL
    // cannot reach authoritative state. Say so; never report success.
    return { valid: false, reason: WALL_MOVE_UNREACHABLE };
  }
  execute(ctx: HandlerContext<WallHandlerStores>, cmd: MoveWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return INNER.execute(ctx, { kind: 'referenceEdit', id: cmd.id, newBaseLine: cmd.baseLine });
    }); // withHandlerSpan — C10 §2
  }
}
