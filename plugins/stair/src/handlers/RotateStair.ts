// RotateStairHandler — set absolute rotation (radians, about world Y) (S14-T1).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StairNotFoundError } from '../errors.js';
import type { StairData, StairsState } from '../store.js';

export interface RotateStairPayload { readonly stairId: string; readonly rotation: number }

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4, Class A "dead verb") — why `stair.rotate` now REFUSES.
 *
 * This handler produced a correct Immer patch against `ctx.stores.stair`, reported
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
 * Neither names `stair.rotate`. The `plugins/cross` cascade rules that synthesise it are
 * inert: `CascadeRunner` is registered nowhere in production (only in
 * packages/command-bus/__tests__/cascade.test.ts and commented-out examples).
 * DISPOSITION (recorded 2026-08-12, ADR-0323 / BIM30 R0 — see
 * docs/04-reference/BIM30-DISPOSITION-DOCKET.md): CascadeRunner passed its
 * promotion test (packages/command-bus/__tests__/cascade-promotion.test.ts:
 * deterministic / non-mutating / set-stable under iteration-order shuffle)
 * and is PROMOTED as the cascade branch of the future ConsequencePlanner
 * (BIM30-REASONING-LOOP-PLAN R2). It stays unregistered until R2 wires it,
 * so these cascade rules remain unreachable TODAY by recorded decision,
 * not neglect.
 * So refusing costs a user nothing, and leaving it silent keeps a SECOND, lying
 * mutation path alive against P6.
 *
 * THE UNDO HAZARD THIS ALSO CLOSES. `affectedStores` is `['stair']`, and CommandBus
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
const STAIR_ROTATE_UNREACHABLE =
  "stair.rotate writes the detached plugin stair store that nothing renders, exports or persists, and no production surface dispatches it. Note the asymmetry, and that it is the honest answer: stair TRANSLATION is live (stair.move — payload keys: stairId, delta — bridges to MoveStairCommand and the geometry stairStore), but stair ROTATION has NO live route on any surface. There is nothing to redirect you to; a live rotate needs a stair rotate bridge to the geometry stairStore, tracked under Gate G7.";

export class RotateStairHandler implements CommandHandler<RotateStairPayload, StairHandlerStores> {
  readonly type = 'stair.rotate';
  readonly affectedStores = ['stair'] as const;

  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx: HandlerContext<StairHandlerStores>, cmd: RotateStairPayload): ValidationResult {
    if (!Number.isFinite(cmd.rotation)) return { valid: false, reason: 'rotation must be finite' };
    return (ctx.stores.stair as StairsState)[cmd.stairId]
      ? { valid: true }
      : { valid: false, reason: `stair not found: ${cmd.stairId}` };
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
  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: RotateStairPayload): ValidationResult {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — the payload is well-formed, and it STILL
    // cannot reach authoritative state. Say so; never report success.
    return { valid: false, reason: STAIR_ROTATE_UNREACHABLE };
  }
  execute(ctx: HandlerContext<StairHandlerStores>, cmd: RotateStairPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.stair as StairsState)[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = { ...dto, rotation: cmd.rotation };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
