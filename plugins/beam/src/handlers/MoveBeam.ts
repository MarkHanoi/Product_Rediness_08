// MoveBeamHandler — translate both baseLine endpoints by a delta (S12-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { BeamNotFoundError } from '../errors.js';
import type { BeamsState } from '../store.js';

export interface MoveBeamPayload {
  readonly beamId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4, Class A "dead verb") — why `beam.move` now REFUSES.
 *
 * This handler produced a correct Immer patch against `ctx.stores.beam`, reported
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
 * Neither names `beam.move`. The `plugins/cross` cascade rules that synthesise it are
 * inert: `CascadeRunner` is registered nowhere in production (only in
 * packages/command-bus/__tests__/cascade.test.ts and commented-out examples).
 * So refusing costs a user nothing, and leaving it silent keeps a SECOND, lying
 * mutation path alive against P6.
 *
 * THE UNDO HAZARD THIS ALSO CLOSES. `affectedStores` is `['beam']`, and CommandBus
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
const BEAM_MOVE_UNREACHABLE =
  "beam.move writes the detached plugin beam store that nothing renders, exports or persists, and no production surface dispatches it. Moving a beam commits through beam.update (payload keys: beamId, updates) → UpdateBeamCommand → the geometry beamStore, which is what MOVE_COMMAND_BY_TYPE, the Align tool and the 3-D gizmo already dispatch. Put the translated startPoint/endPoint in `updates`.";

export class MoveBeamHandler implements CommandHandler<MoveBeamPayload, BeamHandlerStores> {
  readonly type = 'beam.move';
  readonly affectedStores = ['beam'] as const;

  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx: HandlerContext<BeamHandlerStores>, cmd: MoveBeamPayload): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
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
  canExecute(ctx: HandlerContext<BeamHandlerStores>, cmd: MoveBeamPayload): ValidationResult {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — the payload is well-formed, and it STILL
    // cannot reach authoritative state. Say so; never report success.
    return { valid: false, reason: BEAM_MOVE_UNREACHABLE };
  }
  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: MoveBeamPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      const b = draft[cmd.beamId];
      if (!b) return;
      for (const p of b.baseLine) { p.x += cmd.delta.x; p.y += cmd.delta.y; p.z += cmd.delta.z; }
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
