import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { idRef } from '../base/refs.js';
import { createId } from '../factory/createId.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Pool — the PARENT record of a swimming-pool ASSEMBLY (§FEAT-SWIMMING-POOL-ELEMENT, L-292).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A POOL IS AN ASSEMBLY, NOT A PRIMITIVE. See ADR-0124.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The pool record itself carries NO geometry of its own. It is the identity,
 * the parametric intent, and the OWNER of four kinds of part:
 *
 *   1. a HOLE in the host slab   — `hostSlabId`, punched from `boundary`
 *   2. N POOL WALLS              — real `wall` records, negative `baseOffset`
 *   3. a POOL FLOOR              — a real `slab` record, under the walls
 *   4. the WATER                 — a `water` record (its own family — ADR-0124 §4)
 *
 * Parts 2–4 are REAL element records (they must be schedulable (C28),
 * IFC-exportable (C25) and material-editable). They are linked to this record
 * by the L0 `parentId` / `childrenIds` fields of `BaseNodeShape` — the SAME
 * mechanism the host wall uses for its hosted doors/windows (C15). This is not
 * a new compound pattern; it is the blessed one (ADR-0124 §3).
 *
 * DIMENSIONS ARE NOT STORED AS LITERALS (L-127). Every dimensional field here
 * is OPTIONAL. "Unset" is a first-class state meaning *resolve me* — the
 * resolution chain `record → systemType → documented default` lives in exactly
 * ONE place, `resolvePoolDimensions()` in `@pryzm/geometry-pool`. No builder,
 * no symbol and no command may read a dimension any other way, and none may
 * carry a dimensional constant of its own.
 */

/** Plan outline of the pool: an OPEN loop (do not repeat the closing vertex). */
const PoolLoop = z.array(Vec3).min(3);

export const Pool = defineElement('pool', {
  /** Owning level — the level whose slab the pool is cut into. */
  levelId: z.string().default(''),

  /**
   * The host slab this pool is cut into. Branded `SlabId` so a `WallId` cannot
   * be passed here. The pool punches EXACTLY ONE hole in this slab, and
   * deleting the pool HEALS it (ADR-0124 §6).
   */
  hostSlabId: idRef('slab').default(() => createId('slab')),

  /**
   * The pool's plan outline in WORLD coordinates, as an OPEN loop.
   *
   * This single polygon drives all four parts: it IS the hole cut in the host
   * slab, it is the centreline loop the pool walls are built along, it is the
   * outline of the pool floor, and it is the outline of the water surface.
   * One source of truth — so the parts cannot drift apart.
   */
  boundary: PoolLoop.default([
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 2 },
    { x: 0, y: 0, z: 2 },
  ]),

  // ── Parametric overrides. ALL OPTIONAL — unset means "resolve from the
  //    systemType, then from the documented default" (see the file header).
  //    A `.default()` here would BAKE A LITERAL into L0 and destroy the
  //    systemType tier of the chain, which is exactly the L-127 disease.

  /** Water depth: host-slab TOP → pool-floor TOP, in metres. Founder default 1.2 m. */
  depth: z.number().positive().optional(),
  /** Pool wall thickness, in metres. */
  wallThickness: z.number().positive().optional(),
  /** Pool floor slab thickness, in metres. */
  floorThickness: z.number().positive().optional(),
  /**
   * Freeboard: how far the WATER SURFACE sits BELOW the coping (the host slab's
   * top face), in metres. This is what makes the water level independently
   * addressable from the pool depth — the founder's stated regret case for
   * modelling water as "a slab with a blue material" (ADR-0124 §4).
   */
  freeboard: z.number().nonnegative().optional(),

  /** Pool system type — tier 2 of the dimension-resolution chain. */
  systemTypeId: z.string().optional(),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
})
  // (1) A pool with a degenerate outline is not a pool. Mirrors the Slab and
  //     Wall non-degeneracy refines — a zero-area boundary would punch a
  //     zero-area hole and build zero-length walls.
  .refine(
    (p) => {
      let a2 = 0;
      for (let i = 0; i < p.boundary.length; i++) {
        const c = p.boundary[i]!;
        const n = p.boundary[(i + 1) % p.boundary.length]!;
        a2 += c.x * n.z - n.x * c.z;
      }
      return Math.abs(a2 / 2) >= 0.01;
    },
    { message: 'Pool boundary must enclose a non-degenerate area (≥ 0.01 m²).' },
  )
  // (2) The boundary must be an OPEN loop — identical convention to Slab, so the
  //     hole polygon this pool hands the slab needs no re-normalisation.
  .refine(
    (p) => {
      const first = p.boundary[0]!;
      const last = p.boundary[p.boundary.length - 1]!;
      return first.x !== last.x || first.y !== last.y || first.z !== last.z;
    },
    { message: 'Pool boundary must be open (do not duplicate the closing vertex).' },
  );

export type Pool = z.infer<typeof Pool>;
