// SetWallColorHandler — visual property setter (S07-T8).
//
// Mirrors `src/commands/walls/UpdateWallColorCommand.ts:71` — small,
// no geometry rebuild, just a material-side mutation.  Either
// `materialColor` (hex string) or `materialId` (catalogue reference)
// MUST be present; both may be set in the same call.
//
// Setting `materialId: null` clears the catalogue reference (lets the
// inspector "unbind" a wall from a shared material).  PRYZM 1 used
// `null` here for the same purpose.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallNotFoundError } from '../errors.js';
import type { WallsState } from '../store.js';

export interface SetWallColorPayload {
  readonly id: string;
  readonly materialColor?: string;
  /** `null` clears the catalogue binding; `undefined` leaves it untouched. */
  readonly materialId?: string | null;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `wall.setColor` now REFUSES.
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
const WALL_SET_COLOR_UNREACHABLE =
  'wall.setColor writes the detached plugin wall store that nothing renders (§FIX-MATERIAL-DEAD-DISPATCH). Use wall.updateColor for one wall (its payload key is wallId, not id) or wall.updateColorBatch for many — both run UpdateWallColorCommand against the geometry wallStore, and WallFragmentBuilder reads BOTH materialColor and a catalogue materialId from it.';

export class SetWallColorHandler
  implements CommandHandler<SetWallColorPayload, WallHandlerStores>
{
  readonly type = 'wall.setColor';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallColorPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (cmd.materialColor === undefined && cmd.materialId === undefined) {
      return { valid: false, reason: 'at least one of materialColor / materialId is required' };
    }
    if (cmd.materialColor !== undefined && !HEX_COLOR_RE.test(cmd.materialColor)) {
      return { valid: false, reason: 'materialColor must be a #rrggbb hex string' };
    }
    if (
      cmd.materialId !== undefined &&
      cmd.materialId !== null &&
      (typeof cmd.materialId !== 'string' || cmd.materialId.length === 0)
    ) {
      return { valid: false, reason: 'materialId must be a non-empty string or null' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it STILL cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: WALL_SET_COLOR_UNREACHABLE };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallColorPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      if (cmd.materialColor !== undefined) w.materialColor = cmd.materialColor;
      if (cmd.materialId !== undefined) {
        if (cmd.materialId === null) {
          delete w.materialId;
        } else {
          w.materialId = cmd.materialId;
        }
      }
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
