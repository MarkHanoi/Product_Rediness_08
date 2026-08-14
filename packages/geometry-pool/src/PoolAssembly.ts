// PoolAssembly — one pool record → the FOUR parts it owns.
//
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) · ADR-0124
//
// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSE, DO NOT INVENT.
// ═══════════════════════════════════════════════════════════════════════════════
// Three of the four parts of a pool ALREADY EXIST as element families, and this
// file does not re-implement a single one of them:
//
//   • the HOLE       → a loop appended to the host `Slab.holes` (already a field)
//   • the POOL WALLS → real `Wall` records with a NEGATIVE `baseOffset`
//                      (already a field) and height = the pool depth
//   • the POOL FLOOR → a real `Slab` record, `baseOffset` = −(depth + floorThickness)
//   • the WATER      → the ONLY genuinely new element (ADR-0124 §4)
//
// There is no hole-punching routine here, no wall builder, no slab builder. There is
// arithmetic and there are record literals. That is the whole point of the ticket.
//
// PURITY (and why it matters): this module is a PURE function of the pool record. No
// THREE, no DOM, no store, no id minting (ids are passed IN — CA-2 requires them to be
// stable across redo, so the caller mints them once and reuses them). It is therefore
// exhaustively testable, and — critically — it cannot smuggle a dimension in from a
// mesh. Every dimension it uses comes from `resolvePoolDimensions()`.

import { trace } from '@opentelemetry/api';
import type { Pool, Slab, Wall, Water } from '@pryzm/schemas';
import { confidencePredatingTheField, systemProvenance, type ValueProvenance } from '@pryzm/schemas/provenance';
import { resolvePoolDimensions, type PoolSystemType, type ResolvedPoolDimensions } from './PoolDimensions.js';

/**
 * C75 §1.1 — every part of a pool assembly is **COMPUTED**, and this is one of
 * the few producers where that is not a judgement call: the header above states
 * the property this label records — the module is a PURE function of the pool
 * record, "arithmetic and record literals", every dimension arriving from
 * `resolvePoolDimensions()`. Re-run it on the same pool and it emits the same
 * four parts. That is C75 §1.1's `computed` verbatim: *derived deterministically
 * from inputs the system holds, by a rule that would produce the same output
 * again.*
 *
 * ⚠ **Not `inferred`** (nothing here is plausible-but-not-entailed; §1.2 forbids
 * merging the two, and §4.f is exactly that merge), **not `authored`** — the
 * user drew the pool OUTLINE, not these walls, and `systemProvenance` makes that
 * mistake unrepresentable by refusing `authored` at the type level (§2.2/§2.8).
 * The pool's own `provenance` is a separate record and is not touched here.
 *
 * These literals bypass `Wall.parse()` / `Slab.parse()` / `Water.parse()`, so the
 * schema default never runs on this path — the C75 §6.3.b blind spot the
 * coverage gate cannot see, closed here by hand for this one producer.
 */
const partProvenance = (part: string): ValueProvenance =>
  systemProvenance('computed', `@pryzm/geometry-pool buildPoolAssembly — pool ${part}`);

const _tracer = trace.getTracer('pryzm-geometry-pool');

/** A point on the pool's plan outline. */
export interface PoolVertex { readonly x: number; readonly y: number; readonly z: number }

/**
 * The ids the caller has pre-minted for the parts (CA-2: ids MUST be identical
 * across redo, so they are generated ONCE at the command entry — never inside the
 * assembly, which may be re-run).
 */
export interface PoolPartIds {
  readonly wallIds: readonly string[];   // one per boundary EDGE, in boundary order
  readonly floorSlabId: string;
  readonly waterId: string;
}

/** Everything a pool owns, ready to be written to the stores in ONE patch pair. */
export interface PoolAssembly {
  /** The resolved dimensions the whole assembly was built from (for spans + tests). */
  readonly dims: ResolvedPoolDimensions;
  /** The hole loop to append to the HOST slab's `holes` — world coords, OPEN loop. */
  readonly hostHole: readonly PoolVertex[];
  /** The pool walls — real `Wall` records with a negative `baseOffset`. */
  readonly walls: readonly Wall[];
  /** The pool floor — a real `Slab` record. */
  readonly floorSlab: Slab;
  /** The water — the one new family. */
  readonly water: Water;
}

/**
 * Compute the pool's four parts.
 *
 * COORDINATE MODEL (stated explicitly, because the stair got this wrong — its
 * `worldXZToSlabLocal` only agrees with `OpeningTool`'s world-XZ profiles because
 * `SlabData.position` happens to always be 0, so any slab with a non-zero position
 * gets the stair's hole in the wrong place):
 *
 *   **EVERYTHING HERE IS WORLD SPACE.** `Pool.boundary`, the hole loop, the wall
 *   baselines and the water outline are all world XZ, with `y` carrying the level
 *   elevation. This is the same convention `Slab.boundary` and `Wall.baseLine` use,
 *   so no consumer has to convert, and there is no local space to get wrong.
 *
 * VERTICAL MODEL — all offsets are relative to the LEVEL DATUM (`y = levelElevation`),
 * which is the host slab's TOP face (the slab's §03 semantic anchor: "the slab is
 * positioned so its TOP face aligns with the level datum"). So the coping IS the
 * datum, and:
 *
 *      level datum / coping / host-slab top ────────────────  y = 0   (relative)
 *                                     ↕ freeboard
 *      water surface ───────────────────────────────────────  y = −freeboard
 *                                     ↕
 *      pool-floor TOP  =  wall BASE ───────────────────────── y = −depth
 *                                     ↕ floorThickness
 *      pool-floor underside ────────────────────────────────  y = −depth − floorThickness
 *
 * so the pool walls run from `y = −depth` up to `y = 0`: height = depth, and
 * `baseOffset = −depth` — **the negative base offset the ticket predicted, and the
 * `Wall` record already carries it.** No new wall type is needed, and none is made.
 */
export function buildPoolAssembly(
  pool: Pool,
  ids: PoolPartIds,
  systemType?: PoolSystemType,
): PoolAssembly {
  return _tracer.startActiveSpan('pryzm.pool.buildAssembly', (span) => {
    try {
      const dims = resolvePoolDimensions(pool, systemType);
      const boundary = pool.boundary;
      const n = boundary.length;

      if (ids.wallIds.length !== n) {
        throw new Error(
          `[buildPoolAssembly] expected ${n} wall ids (one per boundary edge), got ${ids.wallIds.length}. ` +
          `Ids are pre-minted by the command so they are stable across redo (CA-2).`,
        );
      }

      // Level datum = the host slab's top face = the coping. See the header diagram.
      const datumY = boundary[0]!.y;

      // ── 1. THE HOLE ─────────────────────────────────────────────────────────
      // The pool's outline IS the hole. One polygon, one source of truth — so the
      // hole, the walls, the floor and the water can never drift out of alignment.
      const hostHole: PoolVertex[] = boundary.map((p) => ({ x: p.x, y: p.y, z: p.z }));

      // ── 2. THE POOL WALLS ───────────────────────────────────────────────────
      // One real `Wall` per boundary edge, sitting UNDER the level: baseOffset is
      // NEGATIVE and height is the pool depth.
      const walls: Wall[] = [];
      for (let i = 0; i < n; i++) {
        const a = boundary[i]!;
        const b = boundary[(i + 1) % n]!;
        walls.push({
          id: ids.wallIds[i]! as Wall['id'],
          type: 'wall',
          parentId: pool.id,          // ← the assembly link (ADR-0124 §3)
          childrenIds: [],
          metadata: pool.metadata,
          provenance: partProvenance('wall'),
          // PV-06 — this part is CONSTRUCTED by the assembly, never measured, so its
          // confidence is the predating default: pending-implementation, score null.
          confidence: confidencePredatingTheField(),
          levelId: pool.levelId,
          // Wall baselines are horizontal by contract (the schema refines it), and
          // both endpoints carry the level elevation in `y`.
          baseLine: [
            { x: a.x, y: datumY, z: a.z },
            { x: b.x, y: datumY, z: b.z },
          ],
          height: dims.depth,
          thickness: dims.wallThickness,
          baseOffset: -dims.depth,     // ← UNDER the level. The whole trick.
          openings: [],
          ...(pool.materialId ? { materialId: pool.materialId } : {}),
          ...(pool.materialColor ? { materialColor: pool.materialColor } : {}),
        } as Wall);
      }

      // ── 3. THE POOL FLOOR ───────────────────────────────────────────────────
      // A real `Slab`, within the walls, whose TOP face is the pool floor. A slab's
      // `baseOffset` positions it relative to the level datum and its thickness grows
      // downward from its top (the §03 `topReference: 'LEVEL'` anchor), so the top
      // face lands at −depth when baseOffset = −depth.
      const floorSlab: Slab = {
        id: ids.floorSlabId as Slab['id'],
        type: 'slab',
        parentId: pool.id,            // ← the assembly link
        childrenIds: [],
        metadata: pool.metadata,
        provenance: partProvenance('floor slab'),
        // PV-06 — this part is CONSTRUCTED by the assembly, never measured, so its
        // confidence is the predating default: pending-implementation, score null.
        confidence: confidencePredatingTheField(),
        levelId: pool.levelId,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        holes: [],
        thickness: dims.floorThickness,
        baseOffset: -dims.depth,
        ...(pool.materialId ? { materialId: pool.materialId } : {}),
        ...(pool.materialColor ? { materialColor: pool.materialColor } : {}),
        ...(pool.systemTypeId ? { systemTypeId: pool.systemTypeId } : {}),
      } as Slab;

      // ── 4. THE WATER ────────────────────────────────────────────────────────
      // The one new family. Its surface and its bottom are ABSOLUTE elevations and
      // INDEPENDENT of each other — which is precisely what a blue slab could not do
      // (a slab's thickness would tie the surface to the floor). Halve `freeboard`
      // and the water moves without the pool floor budging: that is the guard
      // `poolWaterLevel.test.ts` pins, and it is the reason water is its own family.
      const water: Water = {
        id: ids.waterId as Water['id'],
        type: 'water',
        parentId: pool.id,            // ← the assembly link
        childrenIds: [],
        metadata: pool.metadata,
        provenance: partProvenance('water'),
        // PV-06 — this part is CONSTRUCTED by the assembly, never measured, so its
        // confidence is the predating default: pending-implementation, score null.
        confidence: confidencePredatingTheField(),
        levelId: pool.levelId,
        poolId: pool.id,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        surfaceElevation: datumY - dims.freeboard,
        bottomElevation: datumY - dims.depth,
        color: dims.waterColor,
        opacity: dims.waterOpacity,
        ...(pool.systemTypeId ? { systemTypeId: pool.systemTypeId } : {}),
      } as Water;

      span.setAttribute('pryzm.pool.wallCount', walls.length);
      span.setAttribute('pryzm.pool.waterSurfaceY', water.surfaceElevation);

      return { dims, hostHole, walls, floorSlab, water };
    } finally {
      span.end();
    }
  });
}

/**
 * Plan area of an OPEN loop in world XZ, via the shoelace formula. Metres².
 * Winding-independent (absolute value), so a CW or CCW pool both measure positive.
 */
export function planAreaOf(loop: readonly PoolVertex[]): number {
  return _tracer.startActiveSpan('pryzm.pool.planArea', (span) => {
    try {
      let a2 = 0;
      for (let i = 0; i < loop.length; i++) {
        const c = loop[i]!;
        const nx = loop[(i + 1) % loop.length]!;
        a2 += c.x * nx.z - nx.x * c.z;
      }
      return Math.abs(a2 / 2);
    } finally {
      span.end();
    }
  });
}

/**
 * The water's VOLUME, in m³ — the quantity a schedule (C28) reads off a water row.
 *
 * THE ONE derivation. It exists because "what is this pool's volume?" is the exact
 * question the founder named as the thing a blue slab could never answer, and the
 * answer must not be re-derived (differently) in the schedule, the IFC exporter and
 * the property panel.
 *
 * Prismatic (flat-bottomed) for now — a sloped floor is a `depth`-per-vertex
 * extension, and when it lands it lands HERE, so every consumer gets it at once.
 */
export function waterVolumeOf(water: Pick<Water, 'boundary' | 'surfaceElevation' | 'bottomElevation'>): number {
  return _tracer.startActiveSpan('pryzm.pool.waterVolume', (span) => {
    try {
      const depth = water.surfaceElevation - water.bottomElevation;
      const volume = depth > 0 ? planAreaOf(water.boundary) * depth : 0;
      span.setAttribute('pryzm.pool.waterVolume', volume);
      return volume;
    } finally {
      span.end();
    }
  });
}
