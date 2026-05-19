// SetWallLayersHandler — replace a wall's resolved layer composition (S10-T2).
//
// Mirrors `src/commands/walls/UpdateWallLayersCommand.ts:169`.  Used by
// the inspector "Edit Layers…" dialog when the user customises a wall
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
//     docs/architecture/adr/0009-wall-producer-signature.md`).

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
    return { valid: true };
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
