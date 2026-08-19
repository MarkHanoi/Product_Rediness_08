/**
 * RegionBoundarySources — §FIX-REGION-BOUNDARY-SOURCES (L-959 follow-up).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION IS "WHAT ENCLOSES THIS POINT?", NOT "WHICH WALLS ENCLOSE IT"
 * ─────────────────────────────────────────────────────────────────────────────
 * The By Region tools resolved regions against `wallStore.getAll()` and nothing
 * else — on BOTH the hover and the click path. So a region whose boundary is not
 * made of walls could not be found, and the tool refused correctly against an
 * edge set that was simply too small:
 *
 *     region click REFUSED — No enclosed region at this point. The walls around
 *     (6.90, -88.73) do not close a loop — 13 wall(s) on this level were searched.
 *
 * The founder's garden is bounded OUTSIDE by the parcel boundary — which is not a
 * wall — and INSIDE by the building's walls. A terrace, plinth or podium is bounded
 * by a SLAB edge. All three are boundaries a user expects to click inside, and none
 * of them is expressible as "a wall".
 *
 * ⚠ THIS IS DELIBERATELY ONE FUNCTION, NOT THREE BRANCHES AT THE CALL SITE.
 * L-956 was two paths answering "which gesture is this" differently. L-959 was two
 * paths answering "where is the region" differently. Both were C84 EI-9. Assembling
 * the edge set inline in the click path — `if (slab) … if (parcelBoundary) …` —
 * would mint the same defect a third time, and the next missing source (rooms? grid
 * lines? an imported IFC slab?) would diverge again. Every consumer calls THIS, and
 * a new source is added HERE, once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY NON-WALL EDGE IS EMITTED WITHOUT AN `id`
 * ─────────────────────────────────────────────────────────────────────────────
 * The tracer attributes a chord to a host only when the chord came from that wall's
 * own centreline, the wall has an id, and the wall is straight — `ATTRIBUTION_RULE`.
 * A `HostReferenceEdge` carries `hostType: 'wall'` and is resolved by
 * `WallFaceResolver`, which has no notion of a slab edge or a property line. Giving a
 * parcel edge a wall id would therefore make the slab follow a wall that does not
 * exist. So these edges are emitted anonymously and the tracer degrades them to
 * `FreeLineEdge`, counting them in `missingIdFallbacks`.
 *
 * The consequence is the same intentional asymmetry the curved case already has: a
 * region slab FOLLOWS its straight walls parametrically and its parcel/slab-derived
 * boundary stays where it was traced, with the reason reported rather than a
 * plausible-looking wrong id invented for it.
 */

import type { RegionWallLike } from './SlabRegionTracer';

/** A point in the parcel-boundary frame — world XZ metres (`schemas/site/types.ts` `Pt`). */
export interface BoundaryPointXZ { x: number; z: number }

/**
 * The subset of `SlabData` this needs. Declared structurally rather than importing
 * `SlabData` so the assembler stays usable from a caller holding plain records.
 *
 * ⚠ `polygon[i].y` ENCODES THE Z AXIS, AND IS LOCAL, NOT WORLD. It must be offset by
 * `position` — the conversion is copied from `SlabColumnCoupling.ts:73-78`, which is
 * the canonical one, not re-derived here.
 */
export interface RegionSlabLike {
    id?: string;
    position?: { x: number; y: number; z: number } | null;
    polygon?: ReadonlyArray<{ x: number; y: number }> | null;
}

/**
 * §FEAT-REGION-CURTAIN-WALL (L-1125) — the subset of `CurtainWallData` this needs.
 *
 * A curtain wall is a WALL to the user and to the eye: it encloses space, you stand
 * inside it, and "put a floor in here" is the same request whether the enclosure is
 * masonry or glazing. It was simply not in the edge set, so `traceRegionSketchAtPoint`
 * walked a graph with a HOLE where the glazing stood, found no closed loop, and the
 * tool refused — correctly, against inputs that were too small. That is L-959's exact
 * shape one source later, which is why this is a new SOURCE here and not a branch at a
 * call site (see the header: a new source is added HERE, once).
 *
 * Declared structurally rather than importing `CurtainWallData` so this package gains
 * no dependency on `@pryzm/geometry-curtain-wall` — the two are siblings at L2 and a
 * geometry↔geometry edge between element families is exactly what the layer model is
 * there to prevent. `baseLine: [Point3D, Point3D]` is read for `{x, z}` only.
 */
export interface RegionCurtainWallLike {
    id?: string;
    baseLine?: ReadonlyArray<{ x: number; z: number }> | null;
}

export interface RegionBoundaryInputs {
    walls?: ReadonlyArray<RegionWallLike> | null;
    slabs?: ReadonlyArray<RegionSlabLike> | null;
    /**
     * §FEAT-REGION-CURTAIN-WALL (L-1125) — curtain-wall spines, contributed as
     * ANONYMOUS segments. See the assembler for why they carry no `id`.
     */
    curtainWalls?: ReadonlyArray<RegionCurtainWallLike> | null;
    /** The parcel/property ring, OPEN (no repeated closing vertex) — `Parcel.boundary.polygon`. */
    parcelBoundary?: ReadonlyArray<BoundaryPointXZ> | null;
    /** A slab id to leave OUT — used when re-tracing around a slab being replaced. */
    excludeSlabId?: string | null;
}

/**
 * What the search actually looked at. Reported so a refusal can name its INPUTS
 * rather than only its conclusion — the property that let L-959's cause be read off
 * one log line instead of three round trips.
 */
export interface RegionBoundaryCounts {
    walls: number;
    slabEdges: number;
    /** §FEAT-REGION-CURTAIN-WALL (L-1125) — curtain-wall spines contributed. */
    curtainWallEdges: number;
    parcelEdges: number;
    /** `false` when no parcel boundary is loaded at all — distinct from an empty one. */
    parcelPresent: boolean;
}

export interface RegionBoundaryEdgeSet {
    /** Everything that bounds space here, in the ONE shape the tracer consumes. */
    segments: RegionWallLike[];
    counts: RegionBoundaryCounts;
}

/** Turn a closed ring into consecutive anonymous 2-point segments. */
function ringToSegments(
    ring: ReadonlyArray<BoundaryPointXZ>,
    out: RegionWallLike[],
): number {
    if (ring.length < 3) return 0;
    // The ring may arrive OPEN (the committed parcel ring is — `boundaryProjection.ts`
    // pops the duplicate close) or CLOSED (hand-built rings often repeat vertex 0).
    // Normalising here means neither caller has to know which it got.
    const last = ring[ring.length - 1]!;
    const first = ring[0]!;
    const closed = Math.abs(last.x - first.x) < 1e-9 && Math.abs(last.z - first.z) < 1e-9;
    const pts = closed ? ring.slice(0, -1) : ring;
    if (pts.length < 3) return 0;

    let n = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9) continue; // zero-length
        out.push({
            // NO `id` — see the header. An anonymous segment degrades to a FreeLineEdge
            // and is counted, never attributed to a wall that does not exist.
            baseLine: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }],
        });
        n++;
    }
    return n;
}

/**
 * Assemble every edge that bounds space on this level, from every source, into the
 * single `RegionWallLike[]` the tracer already consumes.
 *
 * The tracer itself is UNCHANGED — it never needed to know what produced an edge,
 * which is precisely why it distinguishes host-referenced from free edges instead of
 * sorting by element type. Widening the input is the whole fix.
 */
export function assembleRegionBoundary(inputs: RegionBoundaryInputs): RegionBoundaryEdgeSet {
    const segments: RegionWallLike[] = [];

    const walls = inputs.walls ?? [];
    for (const w of walls) segments.push(w);

    let slabEdges = 0;
    for (const s of inputs.slabs ?? []) {
        if (!s) continue;
        if (inputs.excludeSlabId && s.id === inputs.excludeSlabId) continue;
        const poly = s.polygon;
        if (!poly || poly.length < 3) continue;
        // `SlabColumnCoupling.ts:73-78` — local {x, y=Z} + position → world XZ.
        const ox = s.position?.x ?? 0;
        const oz = s.position?.z ?? 0;
        slabEdges += ringToSegments(
            poly.map(p => ({ x: p.x + ox, z: p.y + oz })),
            segments,
        );
    }

    // §FEAT-REGION-CURTAIN-WALL (L-1125) — the glazing encloses space, so it bounds a
    // region. Contributed ANONYMOUSLY (no `id`), for the reason the header gives for
    // every non-wall source: `HostReferenceEdge` carries `hostType: 'wall'` and is
    // resolved by `WallFaceResolver`, which reads `window.wallStore` and has no notion
    // of a curtain wall. Attributing a curtain-wall id would make the slab follow a
    // WALL THAT DOES NOT EXIST — the resolver would miss, the edge would fall back to
    // its authoring-time memory, and the slab would report `preserved` while following
    // nothing (C79 §5.2.1). An anonymous edge degrades to a `FreeLineEdge` and is
    // COUNTED, so "this boundary does not follow its curtain wall" is a reported fact
    // and not a silent one.
    //
    // ⛔ THE OWNERSHIP LINE. Everything above is the SLAB half — what bounds a region,
    // and how a traced boundary is attributed. Making a curtain-wall edge FOLLOW its
    // host would need a `hostType: 'curtainWall'` arm inside `WallFaceResolver` and a
    // curtain-wall face model to resolve against; that is the curtain-wall side and is
    // deliberately NOT done here.
    let curtainWallEdges = 0;
    for (const cw of inputs.curtainWalls ?? []) {
        const line = cw?.baseLine;
        if (!line || line.length < 2) continue;
        const a = line[0]!;
        const b = line[line.length - 1]!;
        if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9) continue; // zero-length
        segments.push({ baseLine: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }] });
        curtainWallEdges++;
    }

    const parcel = inputs.parcelBoundary;
    const parcelPresent = Array.isArray(parcel) && parcel.length > 0;
    const parcelEdges = parcelPresent ? ringToSegments(parcel!, segments) : 0;

    return {
        segments,
        counts: { walls: walls.length, slabEdges, curtainWallEdges, parcelEdges, parcelPresent },
    };
}

/**
 * The human sentence naming what was searched. Lives beside the assembler so the
 * refusal text cannot drift out of step with the edge set as new sources are added —
 * the failure mode "13 wall(s) were searched" had when slabs and the parcel boundary
 * were silently absent from the search.
 */
export function describeRegionBoundaryCounts(c: RegionBoundaryCounts): string {
    return `${c.walls} wall(s), ${c.slabEdges} slab edge(s), `
        + `${c.curtainWallEdges} curtain-wall edge(s), `
        + `parcel boundary ${c.parcelPresent ? `present (${c.parcelEdges} edge(s))` : 'ABSENT'}`;
}
