// BalconyAssembly — one balcony record → the THREE members it owns.
//
// §FEAT-BALCONY-COMPOUND (L-5600) · C103 · ADR-0333
//
// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSE, DO NOT INVENT.
// ═══════════════════════════════════════════════════════════════════════════════
// ALL THREE members of a balcony already exist as element families, and this file
// does not re-implement a single one of them:
//
//   • the cantilever SLAB  → a real `Slab` record, top face on the level datum
//   • the FLOOR FINISH     → a real `Floor` record, FFL one finish-thickness up
//   • the RAILING          → real `Handrail` records, one per FREE edge
//
// ⭐ AND UNLIKE THE POOL, THE BALCONY MINTS NO NEW MEMBER FAMILY AT ALL. The pool
// had to mint `water`, because a volume whose surface level is independent of its
// floor is not any existing element (ADR-0124 §4). A balcony has no such part: a
// cantilever plate IS a slab, a balcony finish IS a floor covering, and — ADR-0332,
// which this file was written after reading — *"the handrail is a wall with a
// different infill"*, so a balcony guard IS a handrail. `balcony` is therefore the
// only new kind, and it is a COMPOUND, carrying identity and one polygon.
//
// There is no slab builder here, no finish builder, no rail builder. There is
// arithmetic and there are record literals. That is the whole point.
//
// ─── ⭐ ONE POLYGON. THIS IS THE FOUNDER'S REQUIREMENT, MADE STRUCTURAL. ────────
// *"The slab will be a rectangle by default, but as we do with the edit profile
//  feature, the user could after change the shape, and the floor finish and
//  railings should adapt."*
//
// The finish outline and the railing runs are not COPIES of the slab outline that
// something must remember to update. They are COMPUTED from `balcony.boundary`
// every time this function runs. Re-run it with a new boundary and all three
// members move together, by construction. There is no diffing step that can be
// skipped and no second polygon that can be stale.
//
// PURITY (and why it matters): this module is a PURE function of the balcony
// record. No THREE, no DOM, no store, no id minting (ids are passed IN — CA-2
// requires them to be stable across redo, so the caller mints them once and reuses
// them). It is therefore exhaustively testable and — critically — it cannot smuggle
// a dimension in from a mesh. Every dimension comes from
// `resolveBalconyDimensions()`.

import { trace } from '@opentelemetry/api';
import type { Balcony, Floor, Handrail, Slab } from '@pryzm/schemas';
import {
  confidencePredatingTheField,
  systemProvenance,
  type ValueProvenance,
} from '@pryzm/schemas/provenance';
import {
  SLAB_TOP_AT_LEVEL_DATUM,
  resolveBalconyDimensions,
  type BalconySystemType,
  type ResolvedBalconyDimensions,
} from './BalconyDimensions.js';
import {
  resolveFreeEdges,
  type BalconyEdge,
  type BalconyVertex,
  type HostWallSegment,
} from './BalconyGeometry.js';

/**
 * C75 §1.1 — every member of a balcony compound is **COMPUTED**, and here that is
 * not a judgement call: this module is a pure function of the balcony record, so
 * re-running it on the same record emits the same three members. That is §1.1's
 * `computed` verbatim — *derived deterministically from inputs the system holds, by
 * a rule that would produce the same output again.*
 *
 * ⚠ **Not `inferred`** (nothing here is plausible-but-not-entailed; §1.2 forbids
 * merging the two), and **not `authored`** — the user drew the balcony OUTLINE, not
 * these three records, and `systemProvenance` makes that mistake unrepresentable by
 * refusing `authored` at the type level (§2.2 / §2.8). The balcony's OWN provenance
 * is a separate record and is not touched here.
 *
 * These literals bypass `Slab.parse()` / `Floor.parse()` / `Handrail.parse()`, so
 * the schema default never runs on this path — the C75 §6.3.b blind spot the
 * coverage gate cannot see, closed here by hand for this one producer.
 */
const memberProvenance = (member: string): ValueProvenance =>
  systemProvenance('computed', `@pryzm/geometry-balcony buildBalconyAssembly — balcony ${member}`);

const _tracer = trace.getTracer('pryzm-geometry-balcony');

/**
 * The ids the caller has pre-minted for the members.
 *
 * CA-2: ids MUST be identical across redo, so they are generated ONCE at the
 * command entry — never inside the assembly, which may be re-run.
 *
 * ⚠ `railingIds` must have exactly one id per FREE edge, and the free-edge count is
 * a function of the boundary AND the host wall. A caller therefore has to call
 * `resolveFreeEdges()` BEFORE minting — which is deliberate: it is the one place
 * "how many rails does this shape need?" is asked, and making the caller ask it is
 * what stops a profile edit from silently reusing a stale count.
 */
export interface BalconyMemberIds {
  readonly slabId: string;
  readonly floorId: string;
  /** One per FREE edge, in free-edge order. */
  readonly railingIds: readonly string[];
}

/** Everything a balcony owns, ready to be written to the stores in ONE patch set. */
export interface BalconyAssembly {
  /** The resolved dimensions the whole assembly was built from (for spans + tests). */
  readonly dims: ResolvedBalconyDimensions;
  /** The cantilever plate — a real `Slab`. */
  readonly slab: Slab;
  /** The floor finish — a real `Floor` (IfcCovering / FLOORING). */
  readonly finish: Floor;
  /** The railing — real `Handrail` records, one per free edge. */
  readonly railings: readonly Handrail[];
  /** The free edges the railings were built along, reported for tests + diagnostics. */
  readonly freeEdges: readonly BalconyEdge[];
}

/** Everything the assembly needs that is not on the balcony record itself. */
export interface BalconyAssemblyContext {
  /**
   * The host wall's CENTRELINE, when the host is known and resolvable.
   *
   * ⚠ ABSENT ≠ FREE-STANDING, and this distinction is load-bearing. `undefined`
   * here means "this caller could not resolve the host geometry", and the free-edge
   * rule treats it as free-standing — railing ALL ROUND. That is the safe answer
   * (an unguarded drop is the dangerous one) but it is NOT the same fact as "the
   * user placed a free-standing balcony", and a caller that HAS a `hostWallId` but
   * cannot resolve its baseline is producing a balcony with a rail across its own
   * doorway. Such a caller must say so rather than pass `undefined` silently —
   * `CreateBalconyHandler` refuses in that case (C103 §7.3).
   */
  readonly hostSegment?: HostWallSegment;
  /** Tier 2 of the dimension chain. */
  readonly systemType?: BalconySystemType;
}

/**
 * Compute the balcony's three members.
 *
 * COORDINATE MODEL (stated explicitly, because the stair got this wrong — its
 * `worldXZToSlabLocal` only agrees with `OpeningTool`'s world-XZ profiles because
 * `SlabData.position` happens to always be 0):
 *
 *   **EVERYTHING HERE IS WORLD SPACE.** `Balcony.boundary`, the slab boundary, the
 *   finish boundary and the railing paths are all world XZ, with `y` carrying the
 *   level elevation — the same convention `Slab.boundary` and `Wall.baseLine` use.
 *   There is no local space to get wrong.
 *
 * VERTICAL MODEL — all offsets are relative to the LEVEL DATUM (`y = datumY`), which
 * is the balcony slab's TOP face (the slab's §03 semantic anchor: *the slab is
 * positioned so its TOP face aligns with the level datum*). So:
 *
 *      railing top ──────────────────────────────  y = FFL + railingHeight
 *                            ↕ railingHeight
 *      FFL / finish TOP / railing BASE ──────────  y = datum + finishThickness
 *                            ↕ finishThickness
 *      finish underside = slab TOP = level datum ─ y = datum          (offset 0)
 *                            ↕ slabThickness
 *      slab underside ──────────────────────────── y = datum − slabThickness
 *
 * ⭐ THE RAILING IS MEASURED FROM THE FINISHED FLOOR, NOT FROM THE SLAB. Every guard
 * code measures guard height from the surface a person stands on, so a 1.00 m rail
 * on a 15 mm finish stands 1.015 m above the structural plate — and if the user
 * later thickens the finish, the rail must rise with it. Anchoring the rail path at
 * `datum + finishThickness` is what makes that true without a second rule.
 *
 * ⭐ AND IT AGREES WITH THE EXISTING BINDING. `FloorSlabBindingHandler._onSlabUpdated`
 * computes a bound finish's offset as `slabTopOffset + finishThickness` — the same
 * arithmetic, arrived at independently for the same reason ("the finish RESTS ON the
 * slab top"). Two producers, one number, checked against each other rather than
 * merely coincident.
 */
export function buildBalconyAssembly(
  balcony: Balcony,
  ids: BalconyMemberIds,
  ctx: BalconyAssemblyContext = {},
): BalconyAssembly {
  return _tracer.startActiveSpan('pryzm.balcony.buildAssembly', (span) => {
    try {
      const dims = resolveBalconyDimensions(balcony, ctx.systemType);
      const boundary = balcony.boundary;
      const datumY = boundary[0]!.y;

      const freeEdges = resolveFreeEdges(boundary as readonly BalconyVertex[], ctx.hostSegment);

      if (ids.railingIds.length !== freeEdges.length) {
        // ⛔ NOT a silent truncation. A mismatch means the caller minted ids against
        // a DIFFERENT shape from the one it is now building — the exact stale-count
        // failure a profile edit produces — and quietly building the shorter of the
        // two would leave an unguarded edge. Fail loudly, at the boundary, before a
        // store is touched.
        throw new Error(
          `[buildBalconyAssembly] expected ${freeEdges.length} railing ids (one per FREE edge), ` +
            `got ${ids.railingIds.length}. Call resolveFreeEdges() on the CURRENT boundary and ` +
            `mint against that count; ids are pre-minted so they are stable across redo (CA-2).`,
        );
      }

      // ── 1. THE CANTILEVER SLAB ──────────────────────────────────────────────
      // A real `Slab`. Its TOP face is the level datum (baseOffset 0) and its body
      // grows DOWNWARD by `thickness` — the slab family's own anchor, unchanged.
      const slab: Slab = {
        id: ids.slabId as Slab['id'],
        type: 'slab',
        parentId: balcony.id, // ← the compound link (C103 §2)
        childrenIds: [],
        metadata: balcony.metadata,
        provenance: memberProvenance('slab'),
        // PV-06 — this member is CONSTRUCTED by the assembly, never measured, so its
        // confidence is the predating default: pending-implementation, score null.
        confidence: confidencePredatingTheField(),
        levelId: balcony.levelId,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        holes: [],
        thickness: dims.slabThickness,
        baseOffset: SLAB_TOP_AT_LEVEL_DATUM,
        ...(balcony.materialId ? { materialId: balcony.materialId } : {}),
        ...(balcony.materialColor ? { materialColor: balcony.materialColor } : {}),
        ...(balcony.systemTypeId ? { systemTypeId: balcony.systemTypeId } : {}),
      } as Slab;

      // ── 2. THE FLOOR FINISH ─────────────────────────────────────────────────
      // A real `Floor` — IfcCovering/FLOORING, NOT a second slab. `FloorTypes.ts`
      // states the split at the top: *"structural slabs remain as IfcSlab"*. Two IFC
      // classes, two elements — which is also why the founder can select and restyle
      // the finish without touching the plate.
      //
      // Its outline is THE SAME polygon. Not a copy taken at creation — the same
      // array recomputed on every build, which is what "the finish adapts" means.
      const finish: Floor = {
        id: ids.floorId as Floor['id'],
        type: 'floor',
        parentId: balcony.id, // ← the compound link
        childrenIds: [],
        metadata: balcony.metadata,
        provenance: memberProvenance('floor finish'),
        confidence: confidencePredatingTheField(),
        levelId: balcony.levelId,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        // FFL = slab top + finish thickness. The floor body extrudes DOWNWARD from
        // its FFL, so its underside lands exactly on the slab's top face.
        baseOffset: dims.finishThickness,
        thickness: dims.finishThickness,
        ...(balcony.materialId ? { materialId: balcony.materialId } : {}),
        ...(balcony.materialColor ? { materialColor: balcony.materialColor } : {}),
      } as Floor;

      // ── 3. THE RAILING ──────────────────────────────────────────────────────
      // One real `Handrail` per FREE edge — the residential generator's "outer U",
      // measured rather than indexed (see `BalconyGeometry.ts`). The rail sits at the
      // FINISHED floor level, so its path carries `datumY + finishThickness`.
      const railBaseY = datumY + dims.finishThickness;
      const railings: Handrail[] = freeEdges.map((e, i) => ({
        id: ids.railingIds[i]! as Handrail['id'],
        type: 'handrail',
        parentId: balcony.id, // ← the compound link
        childrenIds: [],
        metadata: balcony.metadata,
        provenance: memberProvenance('railing'),
        confidence: confidencePredatingTheField(),
        levelId: balcony.levelId,
        // The handrail's HOST is the balcony's SLAB, not the balcony record: a guard
        // is carried by the plate it stands on, and `Handrail.hostId` is documented
        // as "(stair, slab edge, ramp)". The compound link is `parentId` above; these
        // are two different relationships and are not merged.
        hostId: ids.slabId,
        path: [
          { x: e.a.x, y: railBaseY, z: e.a.z },
          { x: e.b.x, y: railBaseY, z: e.b.z },
        ],
        shape: 'round',
        height: dims.railingHeight,
        diameter: dims.railDiameter,
        ...(balcony.materialId ? { materialId: balcony.materialId } : {}),
      })) as Handrail[];

      span.setAttribute('pryzm.balcony.railingCount', railings.length);
      span.setAttribute('pryzm.balcony.freeEdgeCount', freeEdges.length);
      span.setAttribute('pryzm.balcony.hostKnown', ctx.hostSegment !== undefined);

      return { dims, slab, finish, railings, freeEdges };
    } finally {
      span.end();
    }
  });
}
