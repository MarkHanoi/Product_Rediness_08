// SetWallDimensionsHandler — atomic dimension setter (S07-T8).
//
// ADR-008 collapses three PRYZM 1 commands into one (3 → 1):
//   • `UpdateWallDimensionsCommand.ts` (height + thickness)
//   • `SetWallWidthCommand.ts`         (thickness only)
//   • `UpdateWallHeightCommand.ts`     (height only — also cascaded to
//                                       attached doors/windows in PRYZM 1;
//                                       the cascade lifts to L4 cascade
//                                       infra in S10 D6)
//
// All three become a single payload with optional fields.  At least
// one of `height` / `thickness` / `baseOffset` MUST be present, and
// every present value is patched in a single Immer step → one inverse
// patch undoes the entire change.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallDimensionsError, WallNotFoundError } from '../errors.js';
import type { WallsState } from '../store.js';

export interface SetWallDimensionsPayload {
  readonly id: string;
  readonly height?: number;
  readonly thickness?: number;
  readonly baseOffset?: number;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `wall.setDimensions` now REFUSES.
 *
 * This handler produced a correct Immer patch against `ctx.stores.wall`, reported
 * SUCCESS, and changed nothing any user could ever see. In production the bus's
 * storesProvider (apps/editor/src/bootstrap.ts:92-97) hands it a snapshot of the FRESH
 * plugin `WallStore` built by PluginRegistry — not `window.wallStore`, the legacy
 * geometry singleton that WallFragmentBuilder, the 2-D plan projector, the IFC exporter
 * and persistence all read. Only `wall.created` is mirrored across (initTools.ts:939);
 * there is no update bridge in either direction.
 *
 * THE UNDO HAZARD THIS ALSO CLOSES. `affectedStores` is `['wall']`, and CommandBus
 * pushes that key verbatim onto the ring buffer (CommandBus.ts:470). But
 * `buildUndoStoreMap()` (apps/editor/src/engine/undo/performUndoRedo.ts) maps `'wall'`
 * to `window.wallStore` — the GEOMETRY store. So a ring-first Ctrl+Z handed the
 * geometry store an INVERSE, carrying the plugin store's stale prior value, for a
 * forward write geometry never saw. Reproduced in
 * apps/editor/__tests__/deadVerbAuthoritativeState.test.ts.
 *
 * DECISION: REFUSE, not retire. `CapabilityRefusal.UNCONNECTED_TOPICS` and
 * `CHAT_UNAVAILABLE` both name these verbs, and
 * `tools/ga-gate/check-chat-capability-coverage.ts` requires every such name to be a
 * REGISTERED bus command — retiring would make the chat's own refusal cite a verb that
 * does not exist. Refusing keeps both halves of the declaration honest AND guarantees a
 * third dispatcher gets a reason instead of a lie.
 *
 * The refusal lives in `canExecute` deliberately: CommandBus throws there before touching
 * either undo stack (CommandBus.ts:342-350), so no geometry-keyed PatchPair is ever armed.
 *
 * `execute()` is left intact: it is a correct plugin-store mutation for a host that binds
 * the authoritative store under this key. `canExecute` is the gate the bus honours.
 */
const WALL_SET_DIMENSIONS_UNREACHABLE =
  'wall.setDimensions writes the detached plugin wall store that nothing renders. Use wall.updateDimensions: §FIX-DIMS-REACH-RECORD (ADR-0315 U1 / L-815) re-pointed that verb at the same-name legacy bridge in initBusHandlers, which runs UpdateWallDimensionsCommand against the geometry wallStore and rebuilds the mesh.';

export class SetWallDimensionsHandler
  implements CommandHandler<SetWallDimensionsPayload, WallHandlerStores>
{
  readonly type = 'wall.setDimensions';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallDimensionsPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (cmd.height === undefined && cmd.thickness === undefined && cmd.baseOffset === undefined) {
      return { valid: false, reason: 'at least one of height / thickness / baseOffset is required' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: 'thickness must be ≥ 0.05 m' };
    }
    if (cmd.baseOffset !== undefined && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: 'baseOffset must be a finite number' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it STILL cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: WALL_SET_DIMENSIONS_UNREACHABLE };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallDimensionsPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);
    if (cmd.height !== undefined && cmd.height <= 0) {
      throw new WallDimensionsError('height must be > 0');
    }
    if (cmd.thickness !== undefined && cmd.thickness < 0.05) {
      throw new WallDimensionsError('thickness must be ≥ 0.05 m');
    }
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      if (cmd.height !== undefined) w.height = cmd.height;
      if (cmd.thickness !== undefined) w.thickness = cmd.thickness;
      if (cmd.baseOffset !== undefined) w.baseOffset = cmd.baseOffset;
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
