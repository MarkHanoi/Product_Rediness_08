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
// §FIX-CREATE-DTO-ONLY-SUCCESS — the AUTHORITATIVE-store census, nothing else.
// Reached through the SDK FACADE, not around it: `@pryzm/plugin-sdk` re-exports
// `storeRegistry` for exactly this question (see the widening note at the foot of
// `packages/plugin-sdk/src/index.ts`). This module is READ here and never written —
// ADR-0318 I-2 makes population the composition root's job, never a plugin's.
import { storeRegistry } from '@pryzm/plugin-sdk';

/**
 * §FIX-CREATE-DTO-ONLY-SUCCESS (BIM30 Phase 2) — the slab half of the wall finding.
 * The full reasoning is written once, at `plugins/wall/src/handlers/CreateWall.ts`;
 * what follows is the slab-specific evidence, because a cross-reference to another
 * package is not evidence.
 *
 * MEASURED. The CA-21 executed read-back
 * (`tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts`) dispatched
 * `slab.create` on the composed bus and read `runtime.stores.elements.get('slab')`
 * — the authoritative `slabStore` singleton `ProjectSerializer` reads (ADR-0318
 * wave 1). Verdict: **`readback-negative` — dispatch reported success; the
 * AUTHORITATIVE store did not change.**
 *
 * NOT an unconditional refusal (the door.create answer): `slab.create` is the live
 * creation path for `SlabPlanToolHandler`, `CopyPlanToolHandler`, `PreviewManager`
 * and `slab.batch.create`. Refusing outright would delete slab creation.
 *
 * NOT an authoritative write from here either:
 *  1. In the browser it would be a SECOND write site — `initTools.ts` already
 *     subscribes to `runtime.events.on('slab.created')` (emitted by
 *     `CommandEventBridge` from THIS command) and calls `slabStore.add(...)` behind
 *     a `getById` dedup guard.
 *  2. Headlessly it is impossible by design: `SlabStore.add()` resolves a missing
 *     `levelId` through `this.activeLevelId`, which throws
 *     `SlabStoreEngineNotAttachedError` when the engine half is absent (ADR-0318
 *     I-3 — the store refuses to invent a level rather than answer with a fiction).
 *     `CreateSlabCommand` additionally owns the stable IFC GUID
 *     (§01 §2.6 — `SlabStore.add()` warns loudly when it has to mint a fallback,
 *     because that GUID is NOT stable across undo/redo) and the stair-void
 *     reconciliation (§FIX-STAIR-SLAB-OPENING-SYMMETRY). A slab minted here would
 *     be missing both.
 *
 * So what is fixed is the FALSE SUCCESS, with the same three-valued predicate:
 * no authoritative slab store registered → proceed (unit tests, headless DTO
 * loops); registered and engine-attached → proceed (the browser, unchanged);
 * registered and NOT attached → refuse and name why.
 */
const SLAB_CREATE_UNREACHABLE =
  'slab.create: this process registers an authoritative SlabStore (ADR-0318 §ADR-0318-ELEMENTS-SLOT, ' +
  'the instance ProjectSerializer reads) but its engine half is NOT attached, so the create cannot land: ' +
  'SlabStore.add() resolves the level through activeLevelId, which refuses rather than invent one ' +
  '(ADR-0318 I-3, SlabStoreEngineNotAttachedError). This handler will not report success for a write that ' +
  'reaches only the detached plugin DTO store. slab.create completes in a runtime that ALSO composes the ' +
  'engine half: apps/editor/src/engine/initBuilders.ts calls slabStore.attachEngine(projectContext), and ' +
  "initTools.ts's runtime.events.on('slab.created') bridge performs the authoritative slabStore.add.";

/**
 * §FIX-CREATE-DTO-ONLY-SUCCESS — the three-valued census in code.
 * Returns the refusal reason, or `null` when this handler's write is honest here.
 */
function authoritativeSlabStoreRefusal(): string | null {
  const s = storeRegistry.getStoreForType('slab') as
    | { isEngineAttached?: () => boolean }
    | undefined;
  if (!s) return null;                                     // no authoritative store here
  if (typeof s.isEngineAttached !== 'function') return null; // unjudgeable ≠ failure
  if (s.isEngineAttached()) return null;                   // the bridge completes the write
  return SLAB_CREATE_UNREACHABLE;
}

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
    // §FIX-CREATE-DTO-ONLY-SUCCESS — LAST, and only once the payload is known to be
    // well-formed: "this payload is fine and it STILL cannot reach authoritative
    // state" is the whole message, and a payload error would muddle it.
    const unreachable = authoritativeSlabStoreRefusal();
    if (unreachable !== null) return { valid: false, reason: unreachable };
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
