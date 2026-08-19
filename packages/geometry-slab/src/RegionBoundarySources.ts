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
    /** §REGION-LEVEL-SCOPE (L-1192) — the storey this slab sits on. Absent = UNKNOWN. */
    levelId?: string | null;
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
    /** §REGION-LEVEL-SCOPE (L-1192) — the storey this glazing sits on. Absent = UNKNOWN. */
    levelId?: string | null;
}

/**
 * §REGION-LEVEL-SCOPE (L-1192) — A WALL ON ANOTHER STOREY IS NOT A WEAKER
 * CANDIDATE FOR A REGION BOUNDARY. IT IS A WRONG ONE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder, drawing a region slab on Level 3 of a four-storey project, got:
 *
 *     region traced: 0 host-referenced edge(s) across 0 wall(s), 17 free edge(s)
 *     (curved=0, no-wall-id=17, ambiguous=0)
 *     searched=[18 wall(s), 99 slab edge(s), 0 curtain-wall edge(s),
 *               parcel boundary present (17 edge(s))]
 *
 * `18 wall(s)` is the WHOLE PROJECT's wall count across all four storeys — his
 * snapshot the same minute read `79 elements, 4 LEVELS, 18 walls, 3 slabs`. The
 * traced loop is 17 anonymous edges, i.e. EXACTLY the parcel ring. His words:
 * *"it only recognises the BELOW levels' ones."*
 *
 * The tracer welds every chord it is handed into ONE 2-D graph at
 * `REGION_WELD_TOLERANCE_M` (0.15 m). A Level-3 wall standing directly above a
 * Level-2 wall has the SAME world XZ, so the two weld onto the SAME node pair.
 * Three consequences, all silent:
 *   1. `buildAttributedClosedLoops` sees a second chord on that node pair and
 *      drops the attribution to `ambiguous` — the founder's `ambiguous=4`;
 *   2. `visitedEdges` is keyed by NODE PAIR, so whichever storey's chord is
 *      enumerated first CONSUMES the edge and the other storey's wall can never
 *      start a loop of its own;
 *   3. every storey's outline is a candidate for "smallest enclosing loop", so
 *      the walk can return a ring that MIXES storeys and nothing says so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EXCLUSION HERE, WHERE SNAPPING CHOSE DEMOTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `packages/snapping/src/LevelScope.ts` (§SNAP-LEVEL-SCOPE, L-1108, C06 §9)
 * established the model this reuses: DATUM (project-wide by design) · ACTIVE ·
 * OTHER · UNKNOWN (left alone). It DEMOTES other-level candidates by 1000 rather
 * than filtering them, and that is right THERE: "align this wall to the wall
 * below" is a gesture a user makes deliberately, so the reference must survive.
 *
 * ⭐ It is WRONG HERE, and the difference is not taste — it is that a snap RANKS
 * candidates while a region trace COMPOSES them. A snap picks exactly one
 * reference and the user sees which one won. A region trace walks a graph and
 * returns a RING: a demoted-but-present other-storey chord is still in the graph,
 * still welds onto shared nodes, and still consumes edges. There is no ranking
 * step for a demotion to act on, so demotion here would be a no-op with a
 * comment attached.
 *
 * And the result would be indefensible even if it could be ranked: a slab is a
 * physical plate on ONE storey. A loop half-formed from Level-3 walls and half
 * from the Level-2 shell below describes no plate that exists. That is strictly
 * worse than a refusal — and a refusal is a correct answer here
 * (§FIX-REGION-CLICK-SELF-SUFFICIENT). So this FILTERS, and the refusal names
 * what it left out.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PARCEL BOUNDARY STAYS ON EVERY STOREY — IT IS A DATUM
 * ─────────────────────────────────────────────────────────────────────────────
 * Identical to `LevelScope.ts`'s DATUM class and for the identical reason: a
 * parcel boundary constrains a third-floor balcony exactly as it constrains the
 * ground floor. It is not "the ground storey's edge", it is the property line, so
 * it keeps bounding regions on every storey. It is also why the founder's first
 * click returned it: with the storey's own walls unreachable, the parcel was the
 * only loop left enclosing his point — a correct walk over a wrong graph.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNKNOWN IS LEFT ALONE — DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────
 * A record with no `levelId`, or a caller that supplies no `activeLevelId`,
 * participates exactly as before. Callers and tests that hand this assembler bare
 * `{ baseLine }` shapes are UNCHANGED, and a caller not yet taught which storey
 * it is on does not have its behaviour silently altered — `LevelScope.ts`'s rule,
 * restated. Passing `activeLevelId` is what opts a call site in, and
 * `RegionBoundaryCounts.activeLevelId` reports whether it did, so "this search
 * was project-wide" is a READING and never an inference.
 */
export type RegionLevelRelation = 'active' | 'other' | 'unknown';

/** Classify one boundary-source record against the storey being drawn on. */
export function classifyRegionSourceLevel(
    levelId: string | null | undefined,
    activeLevelId: string | null | undefined,
): RegionLevelRelation {
    if (levelId == null || activeLevelId == null) return 'unknown';
    return levelId === activeLevelId ? 'active' : 'other';
}

/**
 * Does this source record's geometry enter the region graph?
 *
 * Everything except a PROVEN other-storey record does. Note this is deliberately
 * not `=== 'active'`: UNKNOWN participates, which is the whole opt-in property
 * described above. The parcel boundary never reaches this function — it is a
 * datum and is added unconditionally.
 */
export function regionSourceParticipates(
    levelId: string | null | undefined,
    activeLevelId: string | null | undefined,
): boolean {
    return classifyRegionSourceLevel(levelId, activeLevelId) !== 'other';
}

export interface RegionBoundaryInputs {
    walls?: ReadonlyArray<RegionWallLike & { levelId?: string | null }> | null;
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
    /**
     * §REGION-LEVEL-SCOPE (L-1192) — the storey the region is being drawn on.
     *
     * Omitted / null ⇒ NO level scoping is applied and every source participates,
     * exactly as before this field existed. That is the honest default: a caller
     * that cannot say which storey it is on must not have one guessed for it.
     */
    activeLevelId?: string | null;
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
    /**
     * §REGION-LEVEL-SCOPE (L-1192) — the storey the search was scoped to, or `null`
     * when the caller supplied none and the search therefore spanned every storey.
     * Reported so "the search was project-wide" is a READING, not an inference —
     * it is the reading that would have named this defect in one log line.
     */
    activeLevelId: string | null;
    /** How many source RECORDS were left out for sitting on a PROVEN other storey. */
    otherLevelExcluded: { walls: number; slabs: number; curtainWalls: number };
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

    // §REGION-LEVEL-SCOPE (L-1192) — see the policy block above. `null` disables
    // scoping entirely; it is NOT "the ground floor".
    const activeLevelId = inputs.activeLevelId ?? null;
    const otherLevelExcluded = { walls: 0, slabs: 0, curtainWalls: 0 };

    let wallsSearched = 0;
    for (const w of inputs.walls ?? []) {
        if (!w) continue;
        if (!regionSourceParticipates(w.levelId, activeLevelId)) {
            otherLevelExcluded.walls++;
            continue;
        }
        segments.push(w);
        wallsSearched++;
    }

    let slabEdges = 0;
    for (const s of inputs.slabs ?? []) {
        if (!s) continue;
        if (inputs.excludeSlabId && s.id === inputs.excludeSlabId) continue;
        // A slab on the storey below is a PLATE, not this storey's boundary. Its
        // outline traces the walls beneath and welds onto their nodes — the second
        // half of the founder's `99 slab edge(s)`.
        if (!regionSourceParticipates(s.levelId, activeLevelId)) {
            otherLevelExcluded.slabs++;
            continue;
        }
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
    // region. ⭐ UPGRADED FROM ANONYMOUS TO ATTRIBUTED by
    // §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182), now that C87 CW-Region-3 is DECIDED.
    //
    // L-1125 contributed these spines WITHOUT an id, and that was the correct answer
    // AT THE TIME — not timidity. `HostReferenceEdge.hostType` could only say `'wall'`,
    // so an attributed curtain-wall edge would have sent `WallFaceResolver` to
    // `window.wallStore`, missed, silently fallen back to its authoring-time memory,
    // and reported `preserved` while following NOTHING (C79 §5.2.1). An anonymous edge
    // that is COUNTED beats an attributed edge that lies.
    //
    // Two things changed, and both were prerequisites:
    //   1. `hostType` now admits `'curtain-wall'`, so the kind travels with the id and
    //      the resolver knows which store to ask.
    //   2. The FOUNDER decided what a curtain wall's FACE is — C87 CW-Region-3,
    //      2026-08-19: "to the mullion always" (`mullionSize`, 0.08). Until that was
    //      answered the contract BLOCKED this arm, because `mullionSize` and
    //      `panelThickness` differ by 4x and an arm resolving to a plausible wrong
    //      offset is strictly worse than the anonymous contribution it replaces.
    //
    // So a region slab bounded by glazing now FOLLOWS that glazing when it moves,
    // instead of staying where it was traced.
    let curtainWallEdges = 0;
    for (const cw of inputs.curtainWalls ?? []) {
        if (!cw) continue;
        // Glazing encloses space on ITS OWN storey, exactly like a wall.
        if (!regionSourceParticipates(cw.levelId, activeLevelId)) {
            otherLevelExcluded.curtainWalls++;
            continue;
        }
        const line = cw.baseLine;
        if (!line || line.length < 2) continue;
        const a = line[0]!;
        const b = line[line.length - 1]!;
        if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9) continue; // zero-length
        // The id is what makes the edge followable; `hostType` is what makes it
        // followable to the RIGHT store. A curtain wall with no id stays anonymous
        // and is still counted — the honest degradation L-1125 established.
        segments.push({
            id: cw?.id ?? null,
            hostType: 'curtain-wall',
            baseLine: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }],
        });
        curtainWallEdges++;
    }

    // §REGION-LEVEL-SCOPE (L-1192) — DATUM. Unconditional on every storey; it is
    // the property line, not the ground floor's edge. See the policy block.
    const parcel = inputs.parcelBoundary;
    const parcelPresent = Array.isArray(parcel) && parcel.length > 0;
    const parcelEdges = parcelPresent ? ringToSegments(parcel!, segments) : 0;

    return {
        segments,
        counts: {
            walls: wallsSearched,
            slabEdges,
            curtainWallEdges,
            parcelEdges,
            parcelPresent,
            activeLevelId,
            otherLevelExcluded,
        },
    };
}

/**
 * The human sentence naming what was searched. Lives beside the assembler so the
 * refusal text cannot drift out of step with the edge set as new sources are added —
 * the failure mode "13 wall(s) were searched" had when slabs and the parcel boundary
 * were silently absent from the search.
 */
export function describeRegionBoundaryCounts(c: RegionBoundaryCounts): string {
    // §REGION-LEVEL-SCOPE (L-1192) — the SCOPE is part of what was searched, and it
    // is the clause whose absence cost this round trip: `18 wall(s)` read as a
    // complete search when it was the whole project's wall count across 4 storeys.
    // Now the line says WHICH storey, and how much it deliberately left out.
    const o = c.otherLevelExcluded;
    const excludedTotal = o.walls + o.slabs + o.curtainWalls;
    const scope = c.activeLevelId
        ? ` on level ${c.activeLevelId}`
          + (excludedTotal > 0
              ? ` (excluded as being on other levels: ${o.walls} wall(s), `
                + `${o.slabs} slab(s), ${o.curtainWalls} curtain wall(s))`
              : ' (nothing excluded — no geometry on other levels)')
        : ' across EVERY level (no active level was supplied, so the search was NOT '
          + 'level-scoped)';
    return `${c.walls} wall(s), ${c.slabEdges} slab edge(s), `
        + `${c.curtainWallEdges} curtain-wall edge(s), `
        + `parcel boundary ${c.parcelPresent ? `present (${c.parcelEdges} edge(s))` : 'ABSENT'}`
        + `,${scope}`;
}
