// SetWallLayersHandler — replace a wall's resolved layer composition (S10-T2).
//
// ⚠ SCOPE, CORRECTED 2026-08-06 (§FIX-WALL-LAYER-EDIT-DETACHED-STORE): this handler writes
// the PLUGIN Immer wall store ONLY. That store is DETACHED from the legacy `wallStore` that
// WallFragmentBuilder, the plan projection and the IFC export all read — only `wall.created`
// is mirrored across, never updates. So this handler is correct in isolation and invisible in
// the viewport: the founder edited a layer thickness, the values were written faithfully, and
// no geometry changed and no error was raised.
//
// The property-panel LAYERS editor therefore does NOT dispatch `wall.setLayers`; it routes
// through `element.changeType` → `UpdateWallSystemTypeCommand` on the legacy store (the same
// shape already used for floor, §FIX-FLOOR-TYPE-SWAP L-106, and slab, §FIX-SLAB-TYPE-SWAP).
// This handler remains as the plugin-store surface for headless/SDK callers operating on the
// PRYZM3 store. Anything that must be VISIBLE must go through the legacy route until the
// plugin store is bridged for updates.
//
// Used by the inspector "Edit Layers…" dialog when the user customises a wall
// AWAY from its catalogue defaults — the wall keeps `systemTypeId`
// (so the inspector still shows the heritage) but `layers[]` is now
// project-scoped.
//
// VALIDATION:
//   • `layers[]` must be a non-empty array.
//   • Every layer's `thickness` must be > 0 and finite (mirrors
//     the WallLayer schema).
//   • The handler ALSO overwrites `thickness` with the layer-sum so
//     the producer sees a consistent wall body (per `code-level ADR
//     docs/02-decisions/adrs/0009-wall-producer-signature.md`).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallDimensionsError, WallNotFoundError } from '../errors.js';
import type { WallData, WallsState } from '../store.js';

const VALID_LAYER_FUNCTIONS = new Set([
  'finish-exterior',
  'substrate',
  'insulation',
  'air-barrier',
  'structure',
  'finish-interior',
]);

type WallLayer = NonNullable<WallData['layers']>[number];

export interface SetWallLayersPayload {
  readonly id: string;
  readonly layers: readonly WallLayer[];
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

function isLayerValid(l: unknown): { valid: true } | { valid: false; reason: string } {
  if (typeof l !== 'object' || l === null) {
    return { valid: false, reason: 'layer must be an object' };
  }
  const r = l as Record<string, unknown>;
  if (typeof r.name !== 'string' || r.name.length === 0) {
    return { valid: false, reason: 'layer.name must be a non-empty string' };
  }
  if (typeof r.function !== 'string' || !VALID_LAYER_FUNCTIONS.has(r.function)) {
    return { valid: false, reason: `layer.function must be one of: ${[...VALID_LAYER_FUNCTIONS].join(', ')}` };
  }
  if (typeof r.thickness !== 'number' || !Number.isFinite(r.thickness) || r.thickness <= 0) {
    return { valid: false, reason: 'layer.thickness must be a finite number > 0' };
  }
  if (r.materialId !== undefined && typeof r.materialId !== 'string') {
    return { valid: false, reason: 'layer.materialId must be a string when present' };
  }
  if (r.materialColor !== undefined && typeof r.materialColor !== 'string') {
    return { valid: false, reason: 'layer.materialColor must be a string when present' };
  }
  return { valid: true };
}

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `wall.setLayers` now REFUSES.
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
const WALL_SET_LAYERS_UNREACHABLE =
  'wall.setLayers writes the detached plugin wall store, so a layer edit was written faithfully, was invisible in the viewport, and was gone after reload (§FIX-WALL-LAYER-EDIT-DETACHED-STORE). Use element.changeType (→ UpdateWallSystemTypeCommand on the geometry wallStore) to change a wall composition, or wall.addLayerBatch to add a finish layer across many walls.';

export class SetWallLayersHandler
  implements CommandHandler<SetWallLayersPayload, WallHandlerStores>
{
  readonly type = 'wall.setLayers';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallLayersPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (!Array.isArray(cmd.layers) || cmd.layers.length === 0) {
      return { valid: false, reason: 'layers must be a non-empty array' };
    }
    for (let i = 0; i < cmd.layers.length; i += 1) {
      const r = isLayerValid(cmd.layers[i]);
      if (!r.valid) return { valid: false, reason: `layers[${i}]: ${r.reason}` };
    }
    const total = cmd.layers.reduce((s, l) => s + l.thickness, 0);
    if (total < 0.05) {
      return { valid: false, reason: `Sum of layer thicknesses (${total}) must be ≥ 0.05 m` };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it STILL cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: WALL_SET_LAYERS_UNREACHABLE };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallLayersPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);

    const total = cmd.layers.reduce((s, l) => s + l.thickness, 0);
    if (total < 0.05) {
      throw new WallDimensionsError(
        `wall.setLayers rejected — total thickness ${total} m < 0.05 m`,
      );
    }

    // 6dp round so equality assertions in tests are stable across the
    // float ops in the producer (matches WallSystemTypeStore convention).
    const rounded = Math.round(total * 1_000_000) / 1_000_000;

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      w.layers = cmd.layers.map((l) => ({ ...l }));
      w.thickness = rounded;
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
