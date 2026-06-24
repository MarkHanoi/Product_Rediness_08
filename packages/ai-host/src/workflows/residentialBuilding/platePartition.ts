// Residential building (multi-family) — Slice B / Tracker P6.2.
//
// THE per-level PLATE PARTITION pure function — "the single biggest net-new
// design" (audit §3). Given a level footprint, a centred core rect, a corridor
// spec, and an apartment mix, it returns a disjoint tiling:
//
//      { core, publicCorridor, apartmentCells[] }
//
// the CORE in the centre, a PUBLIC CORRIDOR that reaches every apartment's
// front-door edge, and N apartment cells packed into the residual — each sized
// within the min/max m² band for its typology (audit §6).
//
// PURE + DETERMINISTIC L2: zero THREE, zero DOM, zero I/O, zero RNG. Same idiom as
// the houseLayout workflows (metres, plan frame { x, z }). This is a PLANNER: it
// RETURNS rects/polygons. The apartment ENGINE (D-TGL `generateDeterministicLayouts`)
// lays out each returned cell in a LATER slice (P7). The corridor here is a simple
// DOUBLE-LOADED band stub — the full §18/§20 Steiner-spine tree is the HIGH-RISK,
// gated P8 slice; this stub gives the orchestrator a clean, testable partition for
// a rectangular plate today.
//
// Diagnostic: emits `§DIAG-RESI-PARTITION` (level=… N=… mix=[…] areas=[…] reached=N/N).
// P8: wraps the body in a `pryzm.ai.workflow.residentialBuilding.platePartition` span.
//
// Contracts: audit §3 (plate partition) + §6 (T1–T4 bands); C53 (generative engine);
// C50 §1.7 (infeasible → soft-fail, never throw); P8 (≥1 span per exported fn).

import { trace } from '@opentelemetry/api';
import type { Pt, Rect } from '../apartmentLayout/tgl/rectDecomposition.js';
import { rectArea, rectWidth, rectDepth } from '../apartmentLayout/tgl/rectDecomposition.js';

const _tracer = trace.getTracer('@pryzm/ai-host', '0.1.0');

/** Apartment typology (≈ 1/2/3/4-bed). Mirrors the pack's `ApartmentTypology`. */
export type Typology = 'T1' | 'T2' | 'T3' | 'T4';

/** A requested apartment with its per-typology net-area band (m²). */
export interface ApartmentDemand {
    readonly typology: Typology;
    /** Lower bound of the net-area band (m²). */
    readonly minAreaM2: number;
    /** Upper bound of the net-area band (m²). */
    readonly maxAreaM2: number;
}

/** Corridor specification (audit §3.5). */
export interface CorridorSpec {
    /** Clear corridor width (m). The corridor band is this wide. */
    readonly widthM: number;
}

export interface PlatePartitionInput {
    /** Diagnostic level index (0 = ground). */
    readonly levelIndex: number;
    /**
     * The level footprint polygon (metres, plan frame). The STUB requires it to
     * be an axis-aligned rectangle (the orchestrator rectifies skewed plates
     * upstream via the principal-axis rotation, exactly as the house engine does).
     */
    readonly footprint: readonly Pt[];
    /** The centred core rect (stair + lift), metres, plan frame. */
    readonly core: Rect;
    readonly corridor: CorridorSpec;
    /** The apartment mix to pack on this level (audit §6), in placement order. */
    readonly apartments: readonly ApartmentDemand[];
    /**
     * §RESI-CLIP-BOUNDARY (founder 2026-06-24: "an L-shape comes out rectangular — the algorithm
     * is set for rectangular plates"). The REAL (possibly non-rectangular) plate polygon in the
     * SAME LOCAL frame as `footprint`/`core`. The partition still tiles the bounding box, but when
     * this is supplied it DROPS any apartment cell whose centre falls OUTSIDE this polygon — so an
     * L / trapezoid stops building apartments past the drawn boundary (the first slice of true
     * non-rectangular support). Absent ⇒ no clipping (byte-identical to the rectangular stub).
     */
    readonly clipPolygon?: readonly Pt[];
}

/** One placed apartment cell. */
export interface ApartmentCell {
    readonly typology: Typology;
    readonly rect: Rect;
    readonly areaM2: number;
    /** Which edge of `rect` faces (shares ≥ door-width with) the public corridor. */
    readonly doorEdge: 'x0' | 'x1' | 'z0' | 'z1';
}

export interface PlatePartitionResult {
    readonly status: 'ok';
    readonly core: Rect;
    /** The public corridor band(s), metres, plan frame. With §RESI-FILL-PLATE this is
     *  the MULTIPLE parallel double-loaded corridor runs that tile the plate depth (one
     *  per corridor line), plus the single transverse SPINE that ties them to the core. */
    readonly publicCorridor: readonly Rect[];
    readonly apartmentCells: readonly ApartmentCell[];
    /** N apartments served (share ≥ door-width with the corridor) / N requested. */
    readonly apartmentsReached: number;
    readonly diagnostic: string;
}

export interface PlatePartitionRejected {
    readonly status: 'rejected';
    readonly reason: string;
    readonly diagnostic: string;
}

export type PlatePartitionOutput = PlatePartitionResult | PlatePartitionRejected;

const EPS = 1e-6;
/** Door clear width (m) — an apartment is "reached" when it shares ≥ this with the corridor. */
const DOOR_WIDTH_M = 0.8;

// §RESI-CELL-FEASIBLE (Task C) — the per-cell D-TGL engine soft-fails a cell that is
// too DEEP / too SKINNY (the P7 finding: full-band ~8.3 m cells lay out; deep ~20 m
// full-band cells of a large plate don't). On a founder-sized ~38×43 m plate the
// front/back bands are ~20 m deep, so a full-band-deep apartment is a ~4 m × 20 m
// sliver (aspect ~5:1) that the engine rejects. We make cells ENGINE-FEASIBLE by
// CAPPING the apartment depth: an apartment hangs its door on the corridor edge and
// extends at most MAX_APARTMENT_DEPTH_M toward the façade (the deeper part of a very
// deep band is simply left un-tiled — wasted area, never a correctness bug). We also
// keep the cell from going too SKINNY by flooring its width relative to its depth
// (MIN_CELL_ASPECT) so a high-area band still produces square-ish, layout-able cells.
/** Max apartment depth (m) toward the façade. Held at ~9 m — the proven-feasible
 *  band from the P7 test (a ~9.7 m × 8.3 m / ~80 m² cell lays out reliably). Capping
 *  here keeps a deep-plate cell square-ish (≈ as wide as deep at the typology mid-area)
 *  rather than the sliver a full ~20 m band would force. The deeper residual of a very
 *  deep band is left un-tiled (wasted area, never a correctness bug). */
export const MAX_APARTMENT_DEPTH_M = 9;
/** Min cell width as a fraction of its depth — below this the cell is a sliver the
 *  engine rejects. 0.6 ⇒ a 9 m-deep cell is ≥ 5.4 m wide (aspect ≤ ~1.7:1). */
const MIN_CELL_ASPECT = 0.6;

// §RESI-T3-FIT (founder "T3 never appears — only 2-bed ever wins", 2026-06-24) — a 3-bed survives
// `scaleCellProgram` (keeps its 3 bedrooms) only at ~108 m²+ (3-bed grossMin 85 × the count-scaled
// slack 1.28); a 4-bed at ~155 m²+ (115 × 1.35). With the depth capped at ~9 m an EVEN-divided run
// yields ~95 m² cells — below the 3-bed keep threshold — so every T3 cell stepped DOWN to a 2-bed.
//
// The engine (mapped empirically — _diag grid) lays out + KEEPS 3 bedrooms at depth 9 only when the
// cell is ≥ ~13 m WIDE (13×9 = 117 m² up to 17×9 = 153 m²); a 4-bed wants ≥ ~14×11. So to let T3/T4
// actually appear we steer a keep-typology row's cells toward a TARGET WIDTH inside that proven band
// (FEWER, WIDER cells), CAPPED at an engine-feasible max so we never mint the 17×11 (b=4) / 17×10
// (rejected) over-wide cell. A run too narrow for even one min-keep cell falls back to the ordinary
// band → the cell scales down to the count it can hold (never a rejected cell, never a regression).
interface KeepSpec { minW: number; targetW: number; maxW: number }
/** Per-typology cell WIDTH band (m) at the standard ~9 m depth, from the engine-feasibility grid:
 *  the cell must be ≥ minW to keep the full bedroom count, ≤ maxW to still lay out (engine rejects
 *  beyond), and we aim at targetW. Width scales inversely with depth at pack time (so a deeper row
 *  needs proportionally less width for the same area). T1/T2 keep the ordinary band (no entry). */
const TYPOLOGY_KEEP_WIDTH: Partial<Record<Typology, KeepSpec>> = {
    // 3-bed: 13×9 = 117 (b=3) … 17×9 = 153 (b=3, still lays out); aim ~14 m.
    T3: { minW: 13, targetW: 14, maxW: 16.5 },
    // 4-bed: 15×11 = 165 (b=4); at 9 m depth a 4-bed never reaches b=4 (needs depth), so the packer's
    // depth cap stays 9 and a too-shallow run lets the cell scale to 3-bed — bounded, never rejected.
    // We still aim WIDE so a deep-enough plate (≥ ~11 m rows near the edge) hits the 4-bed band.
    T4: { minW: 15, targetW: 16, maxW: 17 },
};

function bbox(poly: readonly Pt[]): Rect {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x0, z0, x1, z1 };
}

function isRectangle(poly: readonly Pt[], bb: Rect): boolean {
    if (poly.length < 4) return false;
    // Every vertex must sit on a corner of the bbox (axis-aligned rectangle).
    for (const p of poly) {
        const onX = Math.abs(p.x - bb.x0) < 1e-4 || Math.abs(p.x - bb.x1) < 1e-4;
        const onZ = Math.abs(p.z - bb.z0) < 1e-4 || Math.abs(p.z - bb.z1) < 1e-4;
        if (!onX || !onZ) return false;
    }
    return rectWidth(bb) > EPS && rectDepth(bb) > EPS;
}

/** Ray-casting point-in-polygon (plan XZ). Boundary points count as inside-ish (we only use
 *  this on cell CENTRES, which are never exactly on an edge for a real plate). */
function pointInPolygon(px: number, pz: number, poly: readonly Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        const intersect = (a.z > pz) !== (b.z > pz) &&
            px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x;
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Shoelace area (abs, m²) of a closed polygon. */
function polygonArea(poly: readonly Pt[]): number {
    let a = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
        const p = poly[i], q = poly[(i + 1) % n];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
function normRect(r: Rect): Rect {
    return { x0: round4(r.x0), z0: round4(r.z0), x1: round4(r.x1), z1: round4(r.z1) };
}

/**
 * Partition a rectangular level plate into [core] + [public corridor] + [N apartment
 * cells]. Pure + deterministic. Infeasible inputs → `status: 'rejected'` (C50 soft-fail
 * — the caller surfaces it; the function NEVER throws on a feasibility miss).
 *
 * §RESI-FILL-PLATE strategy (rectangular plate, corridor GRID of parallel double-loaded
 * corridors — fills the WHOLE plate, not a central cluster):
 *  1. The core is the centred keep-out (passed in).
 *  2. Corridors run full-length along the plate's LONG axis. The FIRST corridor is
 *     centred on the core (so it touches/serves it); PARALLEL corridors are then added
 *     above and below it at a fixed pitch so EVERY point of the plate depth is within
 *     `MAX_APARTMENT_DEPTH_M` of some corridor — i.e. the corridors tile the whole depth.
 *  3. Each corridor is double-loaded: apartments pack left→right on BOTH sides of it
 *     (the FRONT side and the BACK side), each cell anchored on the corridor (door) edge
 *     and extending toward the façade by a depth bounded by the half-distance to the
 *     neighbouring corridor (so adjacent corridors' apartment rows tile without overlap)
 *     capped at `MAX_APARTMENT_DEPTH_M`. The core's X-interval is carved out of the rows
 *     it straddles. Every cell's corridor-facing edge IS the door edge → reached by
 *     construction.
 *  4. Apartments are consumed from the demand list in order across all corridor sides;
 *     packing stops when the demands run out OR the plate is full. So given a long demand
 *     list, MANY cells span the entire plate (filling it); given few, it places only those.
 */
export function partitionLevelPlate(input: PlatePartitionInput): PlatePartitionOutput {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.residentialBuilding.platePartition',
        (span) => {
            try {
                const out = _partition(input);
                span.setAttribute('pryzm.resi.partition.status', out.status);
                if (out.status === 'ok') {
                    span.setAttribute('pryzm.resi.partition.cells', out.apartmentCells.length);
                    span.setAttribute('pryzm.resi.partition.reached', out.apartmentsReached);
                }
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as PlatePartitionOutput;
}

function reject(levelIndex: number, reason: string): PlatePartitionRejected {
    const diagnostic = `§DIAG-RESI-PARTITION level=${levelIndex} status=rejected reason="${reason}"`;
    return { status: 'rejected', reason, diagnostic };
}

function _partition(input: PlatePartitionInput): PlatePartitionOutput {
    const { levelIndex, footprint, core, corridor, apartments, clipPolygon } = input;

    const bb = bbox(footprint);
    // §RESI-APPROX-RECT (founder 2026-06-23): the orchestrator de-rotates the parcel into this
    // axis-aligned LOCAL frame, but a hand-drawn boundary is an IRREGULAR quad — its de-rotated
    // vertices do NOT land exactly on the bbox corners, so the old strict isRectangle() check
    // rejected EVERY real drawn parcel ("footprint must be an axis-aligned rectangle (stub)").
    // Accept any footprint that substantially fills its bbox (a convex ~rectangle) and use the
    // bbox as the building plate; only reject a genuinely non-rectangular polygon (e.g. an
    // L-shape, fill < 0.8) or a degenerate zero-area one. A perfect rectangle ⇒ fill ≈ 1.0 ⇒
    // byte-identical to before (isRectangle would also have passed).
    const bbArea = rectWidth(bb) * rectDepth(bb);
    if (footprint.length < 3 || bbArea <= EPS) {
        return reject(levelIndex, 'footprint is degenerate (zero-area plate)');
    }
    const bboxFill = polygonArea(footprint) / bbArea;
    if (!isRectangle(footprint, bb) && bboxFill < 0.8) {
        return reject(levelIndex, `footprint must be roughly rectangular (bbox fill ${bboxFill.toFixed(2)} < 0.80)`);
    }
    if (corridor.widthM <= 0) {
        return reject(levelIndex, 'corridor width must be positive');
    }
    if (apartments.length === 0) {
        return reject(levelIndex, 'no apartments requested');
    }

    const coreN = normRect(core);
    // Core must be inside the footprint.
    if (coreN.x0 < bb.x0 - EPS || coreN.x1 > bb.x1 + EPS ||
        coreN.z0 < bb.z0 - EPS || coreN.z1 > bb.z1 + EPS) {
        return reject(levelIndex, 'core is not contained in the footprint');
    }

    // ── §RESI-FILL-PLATE — a GRID of parallel double-loaded corridors that fills the
    // WHOLE plate (not the old single central band that left most of a large plate empty).
    //
    // Corridors run full-length across X. The FIRST corridor is centred on the core's
    // Z-centre (so it touches/serves the core). PARALLEL corridors are then laid out above
    // and below it at a fixed PITCH so every point of the plate depth is within
    // MAX_APARTMENT_DEPTH_M of some corridor → the apartment rows tile the entire depth.
    //
    // PITCH derivation: a corridor serves apartments up to MAX_APARTMENT_DEPTH_M on each
    // side, so two adjacent corridors fully tile the depth between them when their centre-
    // to-centre distance ≤ 2·MAX_APARTMENT_DEPTH_M + corridorWidth (each side's apartment
    // band ≤ MAX_APARTMENT_DEPTH_M, plus the half-corridor on each line). We use exactly
    // that pitch so rows BUTT against each other (deterministic, no overlap, no gap).
    const coreCz = (coreN.z0 + coreN.z1) / 2;
    const halfCorr = corridor.widthM / 2;
    const coreX0 = coreN.x0, coreX1 = coreN.x1;

    // The first (core) corridor must at least fit inside the plate.
    if (round4(coreCz - halfCorr) <= bb.z0 + EPS || round4(coreCz + halfCorr) >= bb.z1 - EPS) {
        return reject(levelIndex, 'corridor band does not fit inside the footprint');
    }

    // Corridor centre-to-centre pitch (m): the apartment row on each side is capped at
    // MAX_APARTMENT_DEPTH_M, so a corridor + its two full rows + the next corridor span
    // 2·cap + corridorWidth. This is the MAX spacing that still leaves no gap deeper than
    // the cap; a smaller plate uses fewer, tighter-packed corridors (see below).
    const pitch = 2 * MAX_APARTMENT_DEPTH_M + corridor.widthM;
    const MIN_ROW_DEPTH = Math.max(DOOR_WIDTH_M, MIN_CELL_ASPECT * 2); // a row thinner than this serves nothing useful

    // §RESI-FILL-PLATE — pick corridor CENTRELINES so the parallel double-loaded corridors
    // tile the WHOLE depth on both sides of the core (not just the core band). We walk OUTWARD
    // from the core toward each plate edge by `pitch`. A corridor covers depth down to
    // `cz − halfCorr − cap`; we add the next corridor only while that boundary is still inside
    // the plate (i.e. an uncovered gap remains). When the stepped position would push the
    // corridor's outer row past the plate edge, we CLAMP that final corridor inward so its
    // outer row lands exactly on the edge (capped at `cap`) — this is what fills a moderately-
    // deep plate (e.g. 40 m) that a single core band would leave > 50% empty. A clamped
    // corridor is only added if it sits meaningfully beyond its inner neighbour (dedup guard),
    // so a deep plate never gets two near-coincident edge corridors. Deterministic + closed-form.
    const SIDE_MIN_GAP = halfCorr + MIN_ROW_DEPTH; // a new corridor must clear its neighbour by this

    /** Walk outward from `coreCz` toward `edge` (sign −1 = above/decreasing z, +1 = below).
     *  Returns the extra corridor centrelines on that side, in core→edge order. */
    function sideCorridors(edgeZ: number, dir: -1 | 1): number[] {
        const lines: number[] = [];
        let prev = coreCz; // the inner neighbour's centre (starts at the core corridor)
        for (let k = 1; k <= 1000; k++) {
            const stepped = coreCz + dir * k * pitch;
            // Does an uncovered gap still remain beyond the PREVIOUS corridor's outer row?
            const prevOuterRowEdge = prev + dir * (halfCorr + MAX_APARTMENT_DEPTH_M);
            const gapRemaining = dir < 0
                ? prevOuterRowEdge - edgeZ > MIN_ROW_DEPTH
                : edgeZ - prevOuterRowEdge > MIN_ROW_DEPTH;
            if (!gapRemaining) break;
            // Clamp the corridor inward if its stepped position would carry the row past the edge.
            const clampedToEdge = edgeZ - dir * (MAX_APARTMENT_DEPTH_M + halfCorr);
            const overshoots = dir < 0 ? stepped - halfCorr <= edgeZ : stepped + halfCorr >= edgeZ;
            const cz = overshoots ? clampedToEdge : stepped;
            // The corridor must sit meaningfully BEYOND its inner neighbour (toward the edge) so a
            // usable apartment row fits between them — else the neighbour already covers the edge.
            const beyondNeighbour = dir < 0 ? prev - cz : cz - prev;
            if (beyondNeighbour < SIDE_MIN_GAP - EPS) break;
            // …and leave a usable row between it and the plate edge.
            const fitsInside = dir < 0
                ? cz - halfCorr > edgeZ + MIN_ROW_DEPTH - EPS
                : cz + halfCorr < edgeZ - MIN_ROW_DEPTH + EPS;
            if (!fitsInside) break;
            lines.push(round4(cz));
            prev = cz;
            if (overshoots) break; // reached/clamped to the edge — done on this side
        }
        return lines;
    }

    const centreLines: number[] = [
        ...sideCorridors(bb.z0, -1),
        coreCz,
        ...sideCorridors(bb.z1, 1),
    ];
    // Sort lines top→bottom for deterministic row tiling + neighbour math.
    centreLines.sort((a, b) => a - b);

    const corridorBands: Rect[] = centreLines.map((cz) =>
        normRect({ x0: bb.x0, z0: round4(cz - halfCorr), x1: bb.x1, z1: round4(cz + halfCorr) }),
    );

    // §RESI-CORE-SPINE (founder "the corridors are isolated from the core", 2026-06-23) — the
    // horizontal corridor bands above never link to each other or to the core, so a resident
    // leaving the stair/lift cannot reach the corridors that serve the apartments. Add a NARROW
    // VERTICAL corridor SPINE at the core's X-centre, spanning the full plate depth, that crosses
    // (and so CONNECTS) every horizontal band + the core into ONE circulation network. The spine is
    // corridor-width and always sits INSIDE the core's X-span, so the channel is continuous (core-
    // width where the core sits, spine-width elsewhere). It is emitted as the column MINUS the core
    // rect → up to two segments (above + below the core); each crosses every horizontal band's Z.
    const coreCx = (coreX0 + coreX1) / 2;
    const spineX0 = round4(coreCx - halfCorr);
    const spineX1 = round4(coreCx + halfCorr);
    if (coreN.z0 - bb.z0 > EPS) corridorBands.push(normRect({ x0: spineX0, z0: bb.z0, x1: spineX1, z1: coreN.z0 }));
    if (bb.z1 - coreN.z1 > EPS) corridorBands.push(normRect({ x0: spineX0, z0: coreN.z1, x1: spineX1, z1: bb.z1 }));

    const placements: ApartmentCell[] = [];
    let cursor = 0;

    type Run = { x0: number; x1: number };
    // The X-runs available on a row. A channel is carved from EVERY row at the core's X so the
    // vertical SPINE corridor runs uninterrupted and links every horizontal band to the core: the
    // FULL core width on rows that straddle the core in Z, else the NARROW spine strip.
    function runsFor(z0: number, z1: number): Run[] {
        const overlapsCoreZ = !(coreN.z1 <= z0 + EPS || coreN.z0 >= z1 - EPS);
        const cutX0 = overlapsCoreZ ? coreX0 : spineX0;
        const cutX1 = overlapsCoreZ ? coreX1 : spineX1;
        const runs: Run[] = [];
        if (cutX0 - bb.x0 > EPS) runs.push({ x0: bb.x0, x1: cutX0 });
        if (bb.x1 - cutX1 > EPS) runs.push({ x0: cutX1, x1: bb.x1 });
        return runs.length > 0 ? runs : [{ x0: bb.x0, x1: bb.x1 }];
    }

    // Pack one apartment ROW: a band of depth `depth` on one side of a corridor line,
    // doors hung on the corridor edge. Walks left→right across the row's X-runs slicing
    // in-band cells until the demand list (or the run) is exhausted.
    //
    function packRow(cellZ0: number, cellZ1: number, doorEdge: 'z0' | 'z1'): void {
        const depth = round4(cellZ1 - cellZ0);
        if (depth <= MIN_ROW_DEPTH - EPS) return;
        const minWidthByAspect = depth * MIN_CELL_ASPECT;
        for (const run of runsFor(cellZ0, cellZ1)) {
            if (cursor >= apartments.length) break;
            const runWidth = round4(run.x1 - run.x0);
            const ref = apartments[cursor];
            if (!ref) break;
            // §RESI-T3-FIT — a T3/T4 demand carries a WIDTH band (TYPOLOGY_KEEP_WIDTH) proven to keep
            // the full bedroom count AND lay out at ~9 m depth. The band is scaled by the actual row
            // depth (a deeper row needs proportionally less width for the same area) and applied ONLY
            // when the run is wide enough to host even one min-keep cell — else we fall back to the
            // ordinary band so the cell still places (it scales down to a feasible count, no reject).
            const keep = TYPOLOGY_KEEP_WIDTH[ref.typology];
            const depthScale = MAX_APARTMENT_DEPTH_M / depth;  // wider band for a shallower row, etc.
            const wMinBase = Math.max(ref.minAreaM2 / depth, minWidthByAspect);
            const wMaxBase = Math.max(ref.maxAreaM2 / depth, wMinBase);
            const keepActive = keep !== undefined && runWidth >= keep.minW * depthScale - EPS;
            // When the keep band is active, the cell width target/floor/ceiling come from the proven
            // engine band (scaled by depth); otherwise the ordinary demand band drives the division.
            const wMin = keepActive ? Math.max(wMinBase, keep!.minW * depthScale) : wMinBase;
            const wMax = keepActive ? Math.max(wMin, keep!.maxW * depthScale) : wMaxBase;
            const wTarget = keepActive ? keep!.targetW * depthScale : Math.min(Math.max((ref.minAreaM2 + ref.maxAreaM2) / 2 / depth, wMin), wMax);
            if (runWidth < wMin - EPS) continue;   // run too narrow for even one min-width cell — skip it
            // §RESI-PACKROW-EVEN (founder "fill the plate", 2026-06-23) — divide the WHOLE run into
            // EQUAL-width cells instead of greedily slicing one mid-width cell and BREAKING on the
            // sub-wMin remainder. The old greedy break left ~7m empty on every core-split row (the core
            // splits each row into two ~16m runs; one ~8.9m cell fit, the 7.1m residual was < wMin so the
            // loop bailed) → those leftovers merged into the ~390m² central "Room 01-002" void. Even
            // division leaves NO remainder, so a 16m run hosts 2 cells (not 1) and the plate fills.
            // nCells is bounded so each equal cell stays engine-feasible: ≥ wMin (never sub-min slivers)
            // and, where the run allows, ≤ wMax; within that band we pick the count closest to the
            // demand's ideal mid-width. Deterministic (no RNG) → ADR-0061 stable output.
            // The ideal cell count divides the run into ~wTarget-wide cells (the keep target for a
            // T3/T4, else the demand mid-width). Bounded so each equal cell stays ≥ wMin and ≤ wMax.
            const maxCellsByMin = Math.max(1, Math.floor(runWidth / wMin + EPS));   // most cells keeping w ≥ wMin
            const minCellsByMax = Math.max(1, Math.ceil(runWidth / wMax - EPS));    // fewest cells keeping w ≤ wMax
            const idealCells = Math.max(1, Math.round(runWidth / wTarget));
            let nCells: number;
            if (keepActive && minCellsByMax > maxCellsByMin) {
                // §RESI-T3-FIT — the run can't be cleanly divided INSIDE the keep band [minW,maxW]
                // (e.g. a 19 m run: 1 cell > maxW, 2 cells < minW). ENGINE FEASIBILITY WINS over the
                // bedroom-keep target: pick the FEWEST cells that keep each ≤ maxW (so the engine lays
                // the cell out rather than rejecting an over-wide one). The cell then scales to the
                // count its area can hold — never a reject. A run whose width IS inside the band keeps
                // the keep target below and produces the full-count T3/T4 cell.
                nCells = minCellsByMax;
            } else {
                // Clamp the ideal into [minByMax, maxByMin]; prefer fewer (wider → keeps the count).
                const loCells = Math.min(minCellsByMax, maxCellsByMin);
                nCells = Math.min(maxCellsByMin, Math.max(loCells, idealCells));
            }
            const w = round4(runWidth / nCells);
            for (let k = 0; k < nCells && cursor < apartments.length; k++) {
                const demand = apartments[cursor];
                if (!demand) break;
                const x0 = round4(run.x0 + k * w);
                // The last cell snaps to the run's true end so float drift never leaves a hairline gap.
                const x1 = k === nCells - 1 ? round4(run.x1) : round4(run.x0 + (k + 1) * w);
                const rect = normRect({ x0, z0: round4(cellZ0), x1, z1: round4(cellZ1) });
                placements.push({ typology: demand.typology, rect, areaM2: round4(rectArea(rect)), doorEdge });
                cursor++;
            }
        }
    }

    // §RESI-FILL-MIDEDGE (founder "leaves huge empty space without apartments — the blue box
    // beside the core", 2026-06-24) — `runsFor` carves the FULL core WIDTH out of every row
    // that touches the core's Z-band, even where that row extends BEYOND the core in Z. So a
    // ~9 m-deep core-band row whose core overlap is only the ~5 m core depth still reserved the
    // full 6 m core width across its WHOLE depth, leaving the INNER STRIPS `[coreX0,spineX0]` and
    // `[spineX1,coreX1]` un-tiled wherever the row lies OUTSIDE the core in Z (the "blue box").
    //
    // We DON'T split the row (that would make the corridor-touching outer cells reach via a thin
    // sliver — it broke engine feasibility). Instead the OUTER runs `[bb.x0,coreX0]`/`[coreX1,bb.x1]`
    // pack FULL-DEPTH against the corridor exactly as before (reach + feasibility unchanged), and we
    // ADDITIVELY pack the inner strips in JUST the row's out-of-core Z sub-band as mid-edge cells
    // whose door faces the VERTICAL SPINE on the inner x-edge. So the formerly-empty strip beside
    // the core fills, the proven outer cells are byte-identical, and every cell stays reached
    // (outer via the horizontal corridor, inner via the spine). Deterministic, no RNG.
    //
    // The inner strip is only packed when it is genuinely usable (≥ MIN_ROW_DEPTH deep beyond the
    // core AND ≥ a min-area cell wide) — a tight plate where the strip is a sliver simply skips it
    // (byte-identical to the pre-fix output → no regression on the proven small-plate cases).
    const STRIP_W_LEFT = round4(spineX0 - coreX0);   // [coreX0, spineX0] left inner strip width
    const STRIP_W_RIGHT = round4(coreX1 - spineX1);  // [spineX1, coreX1] right inner strip width
    function packInnerStrips(rowZ0: number, rowZ1: number, doorEdge: 'z0' | 'z1'): void {
        // The part of the row OUTSIDE the core in Z (where the spine — not the core — bounds the
        // strip). With doorEdge z1 (front row, z < corridor) the out-of-core part is below coreN.z0;
        // with z0 (back row) it is above coreN.z1.
        const segZ0 = doorEdge === 'z1' ? rowZ0 : Math.max(rowZ0, coreN.z1);
        const segZ1 = doorEdge === 'z1' ? Math.min(rowZ1, coreN.z0) : rowZ1;
        const depth = round4(segZ1 - segZ0);
        if (depth <= MIN_ROW_DEPTH - EPS) return;
        const minWidthByAspect = depth * MIN_CELL_ASPECT;
        const strips: Array<{ x0: number; x1: number; door: ApartmentCell['doorEdge'] }> = [];
        if (STRIP_W_LEFT > EPS) strips.push({ x0: coreX0, x1: spineX0, door: 'x1' });   // door faces spine (right edge)
        if (STRIP_W_RIGHT > EPS) strips.push({ x0: spineX1, x1: coreX1, door: 'x0' });  // door faces spine (left edge)
        for (const strip of strips) {
            if (cursor >= apartments.length) break;
            const ref = apartments[cursor];
            if (!ref) break;
            const stripW = round4(strip.x1 - strip.x0);
            const wMin = Math.max(ref.minAreaM2 / depth, minWidthByAspect);
            // Only place the strip cell when it clears the min-width feasibility floor; a thin core-
            // to-spine gap (most cores) is left as the spine surround (no sub-min slivers, no regress).
            if (stripW < wMin - EPS) continue;
            const rect = normRect({ x0: round4(strip.x0), z0: round4(segZ0), x1: round4(strip.x1), z1: round4(segZ1) });
            placements.push({ typology: ref.typology, rect, areaM2: round4(rectArea(rect)), doorEdge: strip.door });
            cursor++;
        }
    }

    // Tile every corridor's two apartment rows. The row depth on each side is bounded by
    // (a) MAX_APARTMENT_DEPTH_M, (b) the plate edge, and (c) the MIDPOINT to the
    // neighbouring corridor's near edge — so two facing rows from adjacent corridors butt
    // together and never overlap. Rows are filled in a deterministic order: for each
    // corridor top→bottom, its FRONT (toward smaller z) row then its BACK (larger z) row.
    for (let i = 0; i < centreLines.length; i++) {
        const cz = centreLines[i]!;
        const myTop = round4(cz - halfCorr);
        const myBot = round4(cz + halfCorr);

        // FRONT row (z < corridor): door edge is z1 (the corridor's top). Its outer limit
        // is the plate top, the prev corridor's near edge, or MAX depth — whichever is closest.
        const prevCz = i > 0 ? centreLines[i - 1]! : undefined;
        const frontOuterLimit = prevCz !== undefined
            ? (prevCz + halfCorr + myTop) / 2   // midpoint between the two corridor near-edges
            : bb.z0;
        const frontDepth = Math.min(MAX_APARTMENT_DEPTH_M, myTop - frontOuterLimit);
        if (frontDepth > MIN_ROW_DEPTH - EPS) {
            const frontZ0 = round4(myTop - frontDepth);
            packRow(frontZ0, myTop, 'z1');
            // §RESI-FILL-MIDEDGE — fill the inner strips beside the core in the row's out-of-core part.
            packInnerStrips(frontZ0, myTop, 'z1');
        }

        // BACK row (z > corridor): door edge is z0 (the corridor's bottom).
        const nextCz = i < centreLines.length - 1 ? centreLines[i + 1]! : undefined;
        const backOuterLimit = nextCz !== undefined
            ? (nextCz - halfCorr + myBot) / 2
            : bb.z1;
        const backDepth = Math.min(MAX_APARTMENT_DEPTH_M, backOuterLimit - myBot);
        if (backDepth > MIN_ROW_DEPTH - EPS) {
            const backZ1 = round4(myBot + backDepth);
            packRow(myBot, backZ1, 'z0');
            packInnerStrips(myBot, backZ1, 'z0');
        }
    }

    // §RESI-CLIP-BOUNDARY — drop any cell whose CENTRE is outside the real (possibly non-
    // rectangular) plate polygon, so an L / trapezoid stops building apartments past the drawn
    // boundary. The bbox tiling above is unchanged; this only removes out-of-shape cells. A near-
    // rectangular plate keeps every cell (all centres inside) → no behavioural change.
    let clippedOut = 0;
    if (clipPolygon && clipPolygon.length >= 3) {
        for (let i = placements.length - 1; i >= 0; i--) {
            const r = placements[i]!.rect;
            if (!pointInPolygon((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, clipPolygon)) {
                placements.splice(i, 1);
                clippedOut++;
            }
        }
    }

    // §RESI-FILL-PLATE: place as MANY apartments as fit and return them — do NOT reject just
    // because the demand list exceeds the plate's capacity (the plate filling to capacity with a
    // surplus demand list is success, not failure; the orchestrator's "fill the plate" path
    // intentionally supplies more demand than a single band could hold). Reject ONLY when the
    // core/corridor grid leaves NO usable band run at all (a genuinely too-small plate).
    if (placements.length === 0) {
        return reject(
            levelIndex,
            `core/corridor leave no usable band runs (placed 0/${apartments.length})`,
        );
    }

    // Verify every placed cell shares ≥ door-width with the corridor (reached).
    const reached = placements.filter((c) => {
        const w = rectWidth(c.rect);
        return w >= DOOR_WIDTH_M - EPS;
    }).length;

    const areas = placements.map((c) => c.areaM2);
    const mix = placements.map((c) => c.typology);
    const diagnostic =
        `§DIAG-RESI-PARTITION level=${levelIndex} status=ok N=${placements.length} ` +
        `corridors=${corridorBands.length} ` +
        `mix=[${mix.join(',')}] areas=[${areas.map((a) => a.toFixed(1)).join(',')}] ` +
        `clippedOutOfBoundary=${clippedOut} reached=${reached}/${placements.length}`;

    return {
        status: 'ok',
        core: coreN,
        publicCorridor: corridorBands,
        apartmentCells: placements,
        apartmentsReached: reached,
        diagnostic,
    };
}
