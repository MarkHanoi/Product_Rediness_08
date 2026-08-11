// MoveWindowHandler — change window offset along its host wall (S11-T2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WindowNotFoundError } from '../errors.js';
import type { WindowsState } from '../store.js';

export interface MoveWindowPayload {
  readonly windowId: string;
  readonly offset: number;
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4, Class A "dead verb") — why `window.move` now REFUSES.
 *
 * This handler produced a correct Immer patch against `ctx.stores.window`, reported
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
 * Neither names `window.move`. The `plugins/cross` cascade rules that synthesise it are
 * inert: `CascadeRunner` is registered nowhere in production (only in
 * packages/command-bus/__tests__/cascade.test.ts and commented-out examples).
 * So refusing costs a user nothing, and leaving it silent keeps a SECOND, lying
 * mutation path alive against P6.
 *
 * THE UNDO HAZARD THIS ALSO CLOSES. `affectedStores` is `['window']`, and CommandBus
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
const WINDOW_MOVE_UNREACHABLE =
  "window.move writes the detached plugin window store that nothing renders, exports or persists, and no production surface dispatches it. Moving a window along its host wall commits through window.setOffset (payload keys: windowId, newOffset, prevOffset) → SetWindowOffsetCommand → the geometry wallStore opening, which is what MOVE_COMMAND_BY_TYPE and the 3-D gizmo already dispatch.";

export class MoveWindowHandler implements CommandHandler<MoveWindowPayload, WindowHandlerStores> {
  readonly type = 'window.move';
  readonly affectedStores = ['window'] as const;

  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx: HandlerContext<WindowHandlerStores>, cmd: MoveWindowPayload): ValidationResult {
    if (typeof cmd.windowId !== 'string' || cmd.windowId.length === 0) {
      return { valid: false, reason: 'windowId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.offset) || cmd.offset < 0) {
      return { valid: false, reason: 'offset must be a finite number ≥ 0' };
    }
    if (!ctx.stores.window[cmd.windowId]) {
      return { valid: false, reason: `window not found: ${cmd.windowId}` };
    }
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
  canExecute(ctx: HandlerContext<WindowHandlerStores>, cmd: MoveWindowPayload): ValidationResult {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — the payload is well-formed, and it STILL
    // cannot reach authoritative state. Say so; never report success.
    return { valid: false, reason: WINDOW_MOVE_UNREACHABLE };
  }
  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: MoveWindowPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.window[cmd.windowId]) throw new WindowNotFoundError(cmd.windowId);
    const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
      const w = draft[cmd.windowId];
      if (w) w.offset = cmd.offset;
    });
    return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
