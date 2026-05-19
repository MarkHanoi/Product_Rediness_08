// CreateSlabHandler — mint a new slab (S12-T2).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 line 1366.
// Slabs are self-contained: handler declares only `affectedStores:
// ['slab']`.  Edge-pinned wall propagation is the cross-element
// rule's responsibility (`plugins/cross/slab-wall.ts`).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Slab, createId } from '@pryzm/plugin-sdk';
import {
  SlabBoundaryError,
  SlabSchemaError,
  SlabThicknessError,
} from '../errors.js';
import type { SlabData, SlabsState } from '../store.js';
import { validateSlabBoundary } from '../intent.js';

/**
 * 2D plan-tool point type — the SlabPlanToolHandler sends polygon vertices as
 * {x: worldX, y: worldZ} (no z field).  `z` is optional so that callers that
 * already pass full Vec3 points are also accepted.
 */
type PlanPoint2D = { readonly x: number; readonly y: number; readonly z?: number };

export interface CreateSlabPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly boundary?: SlabData['boundary'];
  /**
   * §FT1-C11: `polygon` is the plan-tool field name for the slab outline.
   * SlabPlanToolHandler sends {x: worldX, y: worldZ}[] (2D, no z).
   * Accepted as an alias for `boundary` so the dispatch payload does not need
   * renaming and the Immer slab store always receives a valid boundary.
   * When resolving to boundary (Vec3[]), missing z defaults to 0 (floor elevation).
   * Contract: C11 §3.2 — handler MUST produce a complete Immer patch.
   * See also: C11 §7.0 bug FT1-C11-SLAB-BOUNDARY.
   */
  readonly polygon?: PlanPoint2D[] | SlabData['boundary'];
  readonly holes?: SlabData['holes'];
  readonly thickness?: number;
  readonly baseOffset?: number;
  readonly materialId?: string;
  readonly materialColor?: string;
  readonly systemTypeId?: string;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class CreateSlabHandler implements CommandHandler<CreateSlabPayload, SlabHandlerStores> {
  readonly type = 'slab.create';
  readonly affectedStores = ['slab'] as const;

  canExecute(_ctx: HandlerContext<SlabHandlerStores>, cmd: CreateSlabPayload): ValidationResult {
    const rawPoly = cmd.polygon as Array<{ x: number; y: number; z?: number }> | undefined;
    const resolvedBoundaryForValidation: SlabData['boundary'] | undefined =
      cmd.boundary ??
      (rawPoly ? rawPoly.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 })) as SlabData['boundary'] : undefined);
    if (resolvedBoundaryForValidation !== undefined) {
      const v = validateSlabBoundary(resolvedBoundaryForValidation);
      if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid boundary' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: 'thickness must be > 0' };
    }
    if (cmd.baseOffset !== undefined && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: 'baseOffset must be a finite number' };
    }
    if (cmd.holes !== undefined) {
      for (let i = 0; i < cmd.holes.length; i++) {
        const v = validateSlabBoundary(cmd.holes[i]!);
        if (!v.ok) return { valid: false, reason: `hole[${i}]: ${v.reason ?? 'invalid hole'}` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: CreateSlabPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('slab')) as SlabData['id'];
    // §FT1-C11 + §FT1-C11-Z-FIX:
    // SlabPlanToolHandler sends polygon as {x: worldX, y: worldZ}[] (2D, no z).
    // Slab.parse() requires boundary as Vec3[] = {x, y, z}[] with z finite.
    // When resolving from cmd.polygon, add z: p.z ?? 0 (floor elevation default)
    // so the Zod parse succeeds regardless of whether the caller sends 2D or 3D points.
    // See C11 §7.0 bugs FT1-C11-SLAB-BOUNDARY and the SlabPlanToolHandler dispatch:
    //   polygon: poly.map(p => ({ x: p.worldX, y: p.worldZ }))  ← no z field
    const rawPolygon = cmd.polygon as Array<{ x: number; y: number; z?: number }> | undefined;
    const resolvedBoundary: SlabData['boundary'] | undefined =
      cmd.boundary ??
      (rawPolygon
        ? (rawPolygon.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 })) as SlabData['boundary'])
        : undefined);
    const seed: Partial<SlabData> = {
      id,
      levelId: cmd.levelId ?? '',
      thickness: cmd.thickness ?? 0.2,
      baseOffset: cmd.baseOffset ?? 0,
      holes: cmd.holes ?? [],
      materialId: cmd.materialId,
      materialColor: cmd.materialColor,
      systemTypeId: cmd.systemTypeId,
    };
    if (resolvedBoundary) seed.boundary = resolvedBoundary;

    if (seed.thickness !== undefined && seed.thickness <= 0) {
      throw new SlabThicknessError(seed.thickness);
    }
    if (resolvedBoundary) {
      const v = validateSlabBoundary(resolvedBoundary);
      if (!v.ok) throw new SlabBoundaryError(v.reason ?? 'invalid');
    }

    let slab: SlabData;
    try {
      slab = Slab.parse(seed);
    } catch (err) {
      throw new SlabSchemaError(err);
    }

    const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, (draft) => {
      draft[slab.id] = slab;
    });
    return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
