// BulkSetWallVisualsHandler — apply visual properties to MANY walls in
// one atomic command (S10-T2).
//
// `code-level ADR docs/02-decisions/adrs/0008-wall-handler-triage.md`
// MERGES 2 PRYZM 1 commands → 1 PRYZM 2 handler:
//   • `SetAllWallsWidthCommand.ts:118`            (bulk thickness)
//   • `SetAllWallsVisualPropertiesCommand.ts:88`  (bulk colour / material)
//
// PAYLOAD SHAPE:
//   • `ids` — explicit list of wall ids to mutate (empty list rejected
//     at `canExecute` time — empty bulk is a no-op antipattern).  PRYZM 1
//     iterated `WallStore.getAll()` directly; the new handler keeps the
//     iteration AT THE UI LAYER so the command is auditable + replayable.
//   • At least one of `materialColor` / `materialId` / `thickness` MUST
//     be present.  Each present value is applied to every id in `ids`.
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch
// regardless of how many ids are touched — undo is one stack pop.

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

export interface BulkSetWallVisualsPayload {
  readonly ids: readonly string[];
  readonly materialColor?: string;
  /** `null` clears the catalogue binding on every targeted wall. */
  readonly materialId?: string | null;
  readonly thickness?: number;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `wall.bulkSetVisuals` now REFUSES.
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
const WALL_BULK_VISUALS_UNREACHABLE =
  'wall.bulkSetVisuals writes the detached plugin wall store, which no renderer, 2-D projector, IFC exporter or persistence path reads (§FIX-MATERIAL-DEAD-DISPATCH). Use wall.updateColorBatch for a bulk recolour, or wall.addLayerBatch / wall.updateSystemTypeBatch for bulk composition — all three reach the geometry wallStore, land as ONE undo entry, and report per-wall what they changed and skipped.';

export class BulkSetWallVisualsHandler
  implements CommandHandler<BulkSetWallVisualsPayload, WallHandlerStores>
{
  readonly type = 'wall.bulkSetVisuals';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: BulkSetWallVisualsPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.ids) || cmd.ids.length === 0) {
      return { valid: false, reason: 'ids must be a non-empty array' };
    }
    if (
      cmd.materialColor === undefined &&
      cmd.materialId === undefined &&
      cmd.thickness === undefined
    ) {
      return { valid: false, reason: 'at least one of materialColor / materialId / thickness is required' };
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
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: 'thickness must be ≥ 0.05 m' };
    }
    for (const id of cmd.ids) {
      if (typeof id !== 'string' || id.length === 0) {
        return { valid: false, reason: 'every id must be a non-empty string' };
      }
      if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, id)) {
        return { valid: false, reason: `wall not found: ${id}` };
      }
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it STILL cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: WALL_BULK_VISUALS_UNREACHABLE };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: BulkSetWallVisualsPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (cmd.thickness !== undefined && cmd.thickness < 0.05) {
      throw new WallDimensionsError('thickness must be ≥ 0.05 m');
    }
    // Race-defensive: every id must still exist at execute time.
    for (const id of cmd.ids) {
      if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, id)) {
        throw new WallNotFoundError(id);
      }
    }

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      for (const id of cmd.ids) {
        const w = draft[id];
        if (w === undefined) continue;
        if (cmd.materialColor !== undefined) w.materialColor = cmd.materialColor;
        if (cmd.materialId !== undefined) {
          if (cmd.materialId === null) {
            delete w.materialId;
          } else {
            w.materialId = cmd.materialId;
          }
        }
        if (cmd.thickness !== undefined) w.thickness = cmd.thickness;
      }
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
