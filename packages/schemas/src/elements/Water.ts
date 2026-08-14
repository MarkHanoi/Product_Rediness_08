import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { idRef } from '../base/refs.js';
import { createId } from '../factory/createId.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Water — a body of water held by a pool (§FEAT-SWIMMING-POOL-ELEMENT, L-292).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY WATER IS ITS OWN ELEMENT FAMILY AND **NOT** "A SLAB WITH A BLUE MATERIAL"
 * ═══════════════════════════════════════════════════════════════════════════
 * The decision and its evidence are recorded in ADR-0124 §4. In short:
 *
 *  1. WATER LEVEL IS NOT A THICKNESS. A slab's `thickness` grows DOWN from its
 *     top. Modelling water as a slab therefore couples the water SURFACE to the
 *     pool FLOOR: you cannot lower the water level without also raising the
 *     floor. The founder's exact regret case ("the water level below the
 *     coping") is unrepresentable. Water carries `surfaceElevation` and
 *     `bottomElevation` INDEPENDENTLY, so it is.
 *
 *  2. WATER IS NOT CONSTRUCTION. A `slab` record is a structural/finish element:
 *     it lands in every floor-area schedule, every quantity takeoff and every
 *     `IfcSlab` export. A blue slab would be counted as FLOOR AREA. That is a
 *     data-integrity defect, not a cosmetic one.
 *
 *  3. WATER IS SCHEDULABLE ON ITS OWN TERMS (C28). Its quantity is a VOLUME
 *     (m³), not an area — and the volume is derivable, deterministically, from
 *     the three fields below. `volumeOf()` in `@pryzm/geometry-pool` is that
 *     one derivation; nothing else may compute it.
 *
 * Water is a CHILD of its pool: `poolId` is the typed host reference, and the
 * L0 `parentId` / `childrenIds` fields carry the assembly link (ADR-0124 §3).
 */

/** Plan outline of the water surface: an OPEN loop (do not repeat the closing vertex). */
const WaterLoop = z.array(Vec3).min(3);

export const Water = defineElement('water', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from: one of the five
   * (`ValueOrigin.ts`, which owns the vocabulary and is never restated here),
   * or an explicit unknown carrying its reason.
   *
   * ⚠ `RetrofittedProvenanceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape`, and that is
   * deliberate twice over. C75 §2.5 requires optional-with-an-UNKNOWN-default so
   * a snapshot written before this field existed parses unchanged and lands on
   * `predates-provenance` — never on a member of the five (§2.1 and §2.5 are the
   * same rule). And `check-provenance-coverage` measures the file that declares
   * `defineElement('<kind>')`: an indirection hides the field from the C3
   * retrofit-safety arm, so coverage you cannot see at the point of use is the
   * §4.d defect in a new place.
   */
  provenance: RetrofittedProvenanceSchema,
  /**
   * PV-06 / C75 §1.3 — how much this element's values can be TRUSTED. A
   * separate axis from `provenance`: that says where a value came from, this
   * says how sure we are of it, and C75 §1.2 forbids merging axes.
   *
   * ⚠ `RetrofittedConfidenceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape` — the same
   * instruction `RetrofittedProvenanceSchema` carries above, for the same
   * measured reason. Optional with an UNKNOWN-with-reason default, so a
   * record written before this field existed parses unchanged and lands on
   * `pending-implementation` — never on a tier, never on `score: 0`.
   *
   * The vocabulary is C62's (`site/metadata/DataConfidence.ts`, ADR-0280),
   * REUSED not reinvented: PV-06 says C62 owns confidence (§4.h).
   */
  confidence: RetrofittedConfidenceSchema,
  /** Owning level — the same level as the pool that holds it. */
  levelId: z.string().default(''),

  /** The pool that holds this water. Branded `PoolId`. */
  poolId: idRef('pool').default(() => createId('pool')),

  /** Water-surface plan outline, WORLD coordinates, OPEN loop. */
  boundary: WaterLoop.default([
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 2 },
    { x: 0, y: 0, z: 2 },
  ]),

  /**
   * ABSOLUTE world-Y elevation of the water's TOP surface, in metres.
   *
   * This is THE field the guard `poolWaterLevel.test.ts` pins: halve it and the
   * water must move. It is absolute (not an offset) precisely so no consumer
   * can be tempted to re-derive it from a depth and a literal freeboard.
   */
  surfaceElevation: z.number().default(0),

  /**
   * ABSOLUTE world-Y elevation of the water's underside — i.e. the TOP face of
   * the pool floor. Stored, not derived, so `volume` needs no graph walk and a
   * schedule (C28) can read a water row without resolving its pool.
   */
  bottomElevation: z.number().default(0),

  /** Render intent. Water is transparent and blue by convention; both resolve
   *  through the systemType chain like every other dimension (see Pool.ts). */
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  materialId: z.string().optional(),
  systemTypeId: z.string().optional(),
})
  // (1) Water must have positive depth. A zero- or negative-depth body of water
  //     is an empty pool, which is the ABSENCE of a water element, not a water
  //     element with no water. (A guard that cannot fail is not a guard: this
  //     one reds if a builder ever swaps surface/bottom.)
  .refine((w) => w.surfaceElevation > w.bottomElevation, {
    message: 'Water surfaceElevation must be strictly above bottomElevation (an empty pool has no water element).',
  })
  // (2) Non-degenerate plan area — mirrors Pool's refine so a water body cannot
  //     exist with zero volume via a collapsed outline.
  .refine(
    (w) => {
      let a2 = 0;
      for (let i = 0; i < w.boundary.length; i++) {
        const c = w.boundary[i]!;
        const n = w.boundary[(i + 1) % w.boundary.length]!;
        a2 += c.x * n.z - n.x * c.z;
      }
      return Math.abs(a2 / 2) >= 0.01;
    },
    { message: 'Water boundary must enclose a non-degenerate area (≥ 0.01 m²).' },
  )
  // (3) Open loop — same convention as Slab and Pool.
  .refine(
    (w) => {
      const first = w.boundary[0]!;
      const last = w.boundary[w.boundary.length - 1]!;
      return first.x !== last.x || first.y !== last.y || first.z !== last.z;
    },
    { message: 'Water boundary must be open (do not duplicate the closing vertex).' },
  );

export type Water = z.infer<typeof Water>;
