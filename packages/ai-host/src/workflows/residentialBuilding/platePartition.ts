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
    /** §DIAG-RESI-FILL — placed-apartment footprint ÷ net plate area (plate − core), 0..~1. The
     *  headline §RESI-PLATE-UNDERFILL metric; a well-packed plate fills a strong majority of its net. */
    readonly fillRatio: number;
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
// §RESI-CORNER-UNITS-ALWAYS (founder 2026-06-24: "there must always be apartments at the building
// corners, facing the façade") — the OUTERMOST apartment row (the band between a corridor and the
// PLATE EDGE) must reach the façade so its corner cells touch BOTH the corridor (door) AND the plate
// edge (corner + windows). The standard 9 m depth cap leaves a thin façade strip un-tiled when the
// edge sits > 9 m from the corridor (e.g. a 22 m plate: corridor→edge ≈ 10.3 m → a 1.3 m gap at the
// façade → the corner cell stops short of the edge). The frozen D-TGL engine lays out a SQUARE-ish
// cell well past 9 m (verified feasible to ~12 m for 2/3-bed at widths 5–16 m), so the outer row is
// allowed to span the FULL corridor→edge distance up to this DEEPER cap — the cell then touches the
// façade (corner) and the corridor (reach). Inner rows keep the 9 m cap (a deep plate's interior
// stays square-ish). Beyond this cap the outer row keeps 9 m (a very deep plate's corner is far from
// any corridor anyway — not a corner-unit case).
/** Max depth (m) for the OUTERMOST (plate-edge-touching) apartment row, so its corner cells reach the
 *  façade while still fronting the corridor. Held at the engine's proven deeper-cell limit (~12 m). */
const MAX_OUTER_BAND_DEPTH_M = 12;
/** Min cell width as a fraction of its depth — below this the cell is a sliver the
 *  engine rejects. 0.6 ⇒ a 9 m-deep cell is ≥ 5.4 m wide (aspect ≤ ~1.7:1). */
const MIN_CELL_ASPECT = 0.6;

// §RESI-T3-FIT-REGRESSION-FIX (founder "20 units couldn't fit at this size — 0 apartments",
// 2026-06-24) — THE per-cell rejection root cause. The packer hands the partition a TIGHT area
// band (e.g. a T2 [66,81] m²); at the depth-capped ~9 m row that band maps to a cell WIDTH ceiling
// wMax = 81/9 = 9 m. But the centred core splits each row into ~14 m-wide runs (the NARROW vertical
// spine — not the full core — is carved from out-of-core rows). With wMin = 66/9 = 7.33 m the old
// even-division capped nCells at maxCellsByMin = floor(14/7.33) = 1 → ONE 14.3 m-wide cell. The
// FROZEN D-TGL engine REJECTS a cell wider than its per-depth feasible edge (~13.25 m at a 9 m
// depth; mapped empirically over runApartmentCellLayout, all 1–4 bed × depth 7.3–9), so EVERY such
// cell soft-failed → 0 apartments (the founder's 4-cells-all-hatched screenshot). The fix: cap the
// cell width at the ENGINE'S OWN feasible MAX, and when the run can't be evenly tiled at-or-below
// that cap, SLICE GREEDILY at the cap and LEAVE the sub-min remainder unbuilt (a thin strip) —
// never minting one over-wide cell the engine rejects.
//
// The cap is DEPTH-DEPENDENT. The upper (multi-room) feasible width is NOT a simple multiple of
// depth — it is WIDER at shallow depths (a 7.3 m row lays out up to ~14.75 m wide) and NARROWER at
// the 9 m cap (~13.25 m). A flat factor·depth either over-shrinks a shallow cell BELOW its area
// floor (regressing the §RESI-T3-FIT area guarantee) or exceeds the deep reject edge. `min(13,
// depth + 4)` tracks the SMALLEST feasible upper width across every program at every depth in the
// band with margin: d 7.3 → 11.3, d 8 → 12, d 8.5 → 12.5, d 9 → 13 — each verified feasible AND
// ≥ a T3's area-floor width (a 7.3 m-deep T3 at 11.3 m is 82.5 m² ≥ its 80 m² floor). Below ~7.3 m
// depth the engine can't lay out a multi-room apartment at ANY width (it scales to a studio), so
// the cap is moot there.
/** Engine-feasible MAX cell width (m) at a given row depth — the upper edge the frozen D-TGL engine
 *  reliably lays out, with margin below the per-depth reject edge. See the block comment above. */
const engineMaxCellWidth = (depthM: number): number => Math.min(13, depthM + 4);
/** Engine-feasible MIN cell width as a multiple of row depth — keeps a cell in the engine's upper
 *  (multi-room) band, away from the narrow studio-only sliver band. ≈ 7.65 m at a 9 m depth. */
const ENGINE_MIN_WIDTH_FACTOR = 0.85;

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
    // §RESI-PLATE-UNDERFILL — accept a real L / non-rectangular plate. The partition tiles the bbox
    // and the §RESI-CLIP-BOUNDARY pass DROPS any cell whose centre falls outside the real polygon, so
    // an L-plate builds apartments only within the drawn boundary (the SPEC's safe non-rect subset).
    // When a `clipPolygon` is supplied we therefore admit a much lower bbox fill (an L is typically
    // ~0.55–0.75); only a genuinely degenerate sliver (< 0.30) is still rejected. WITHOUT a clip
    // polygon we keep the 0.80 guard, because the bbox tiling would otherwise build phantom cells past
    // the boundary with nothing to clip them. A perfect rectangle (fill ≈ 1.0) is unchanged.
    const minFill = clipPolygon && clipPolygon.length >= 3 ? 0.3 : 0.8;
    if (!isRectangle(footprint, bb) && bboxFill < minFill) {
        return reject(levelIndex, `footprint too sparse to tile (bbox fill ${bboxFill.toFixed(2)} < ${minFill.toFixed(2)})`);
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
            const clampedToEdge = edgeZ - dir * (MAX_APARTMENT_DEPTH_M + halfCorr);
            const facadeGap = dir < 0 ? (stepped - halfCorr) - edgeZ : edgeZ - (stepped + halfCorr);
            const tooThinFacade = facadeGap < MAX_APARTMENT_DEPTH_M - EPS;
            const cz = tooThinFacade ? clampedToEdge : stepped;
            const overshoots = tooThinFacade;
            const beyondNeighbour = dir < 0 ? prev - cz : cz - prev;
            if (beyondNeighbour < SIDE_MIN_GAP - EPS) break;
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
            const wFeasMin = ENGINE_MIN_WIDTH_FACTOR * depth;
            const wMinBase = Math.max(ref.minAreaM2 / depth, minWidthByAspect);
            const wMaxBase = Math.max(ref.maxAreaM2 / depth, wMinBase);
            const keepActive = keep !== undefined && runWidth >= keep.minW * depthScale - EPS;
            // When the keep band is active, the cell width target/floor/ceiling come from the proven
            // engine band (scaled by depth); otherwise the ordinary demand band drives the division.
            const wMinArea = keepActive ? Math.max(wMinBase, keep!.minW * depthScale) : wMinBase;
            const wMaxArea = keepActive ? Math.max(wMinArea, keep!.maxW * depthScale) : wMaxBase;
            // §RESI-T3-FIT-REGRESSION-FIX — the ENGINE'S OWN feasible MAX width at this row depth.
            // The area-band-derived wMax (maxAreaM2/depth) does NOT bound width to what the engine can
            // lay out — a small area band yields a wMax SMALLER than the feasible width, and the
            // maxCellsByMin floor can then still force an OVER-wide cell when the run won't divide. So
            // we cap the cell width at wFeasMax (never over-wide). For a NON-keep typology (T1/T2) that
            // is the generic per-depth engine edge `engineMaxCellWidth(depth)` (~13 m at d = 9). For a
            // keep typology (T3/T4) the keep band's OWN maxW (16.5/17 m, scaled by depth) is ALREADY the
            // engine-calibrated upper edge for that program (a 3/4-bed lays out wider than a 1/2-bed at
            // the same depth — sweep: ~17.75 m vs ~13.25 m at d = 9), so we keep it rather than
            // over-shrinking a wide T3/T4 cell with the conservative 1/2-bed cap.
            const wFeasMax = keepActive ? wMaxArea : engineMaxCellWidth(depth);
            // wMax is HARD-capped at wFeasMax (never over-wide); wMin is raised toward wFeasMin but
            // never above wMax (so [wMin,wMax] stays non-empty).
            const wMax = Math.min(wMaxArea, wFeasMax);
            const wMin = Math.min(Math.max(wMinArea, wFeasMin), wMax);
            const wTarget = keepActive
                ? Math.min(keep!.targetW * depthScale, wMax)
                : Math.min(Math.max((ref.minAreaM2 + ref.maxAreaM2) / 2 / depth, wMin), wMax);
            // §RESI-T3-FIT-REGRESSION-FIX — SKIP a run too narrow to host even one cell of the demand's
            // minimum AREA. The skip threshold is the AREA floor (`wMinArea`), NOT the engine-clamped
            // `wMin`: on a very shallow row (e.g. a 1.88 m-deep clamped edge row) `wMax = engine cap`
            // collapses small and `wMin` would be dragged down with it, so an engine-clamped test would
            // place a sub-area sliver the engine then rejects (the 16× tiny rejected cells regression).
            // Testing the area floor preserves the proven behaviour: a row that can't host a min-area
            // apartment is left empty (byte-identical to before this fix on those rows).
            if (runWidth < wMinArea - EPS) continue;
            // §RESI-PACKROW-EVEN (founder "fill the plate", 2026-06-23) — divide the WHOLE run into
            // EQUAL-width cells instead of greedily slicing one mid-width cell and BREAKING on the
            // sub-wMin remainder. Even division leaves NO remainder, so a 16m run hosts 2 cells (not 1)
            // and the plate fills. nCells is bounded so each equal cell stays engine-feasible: ≥ wMin
            // and ≤ wMax; within that band we pick the count closest to the demand's ideal mid-width.
            // Deterministic (no RNG) → ADR-0061 stable output.
            const maxCellsByMin = Math.max(1, Math.floor(runWidth / wMin + EPS));   // most cells keeping w ≥ wMin
            const minCellsByMax = Math.max(1, Math.ceil(runWidth / wMax - EPS));    // fewest cells keeping w ≤ wMax
            const idealCells = Math.max(1, Math.round(runWidth / wTarget));
            let nCells: number;
            let sliceWidth: number | undefined;   // set ⇒ greedy-slice at this width, leave the remainder
            if (minCellsByMax > maxCellsByMin) {
                // §RESI-T3-FIT-REGRESSION-FIX — the run can't be tiled EVENLY inside [wMin, wMax]
                // (e.g. a 14.3 m run at depth 9: 1 cell = 14.3 m > wMax ≈ 12.6 m, 2 cells = 7.1 m <
                // wMin ≈ 7.65 m). Even division would force EITHER an over-wide cell the engine rejects
                // (the founder's 0-apartments bug) OR a sub-min sliver. ENGINE FEASIBILITY WINS: SLICE
                // GREEDILY at wMax and LEAVE the sub-min remainder unbuilt (a thin strip — accepted per
                // the founder's narrowed scope; the central-void/strip-fill pass is separate). This
                // guarantees every emitted cell is ≤ wMax (engine-layable) → never a rejected over-wide
                // cell → adding any typology (T1) to the mix can no longer drop the count to 0.
                // §RESI-PLATE-UNDERFILL (founder 2026-06-26: large plates UNDER-FILL — a wide run lost
                // its sub-wMax remainder to an un-built strip). Prefer the FEWEST EQUAL cells that keep
                // each ≤ wMax: nEven = ceil(runWidth/wMax). When those equal cells are STILL ≥ the engine
                // MIN width (wFeasMin) the whole run tiles with NO wasted strip (e.g. a 16.5 m run at
                // depth 9 → 2 × 8.25 m cells, both engine-feasible — instead of 1 × 13 m cell + a 3.5 m
                // gap). Only when an extra cell would fall BELOW the min do we fall back to the greedy
                // wMax slice + leave the remainder (the proven anti-over-wide behaviour). Deterministic.
                const nEven = Math.max(1, Math.ceil(runWidth / wMax - EPS));
                const evenW = runWidth / nEven;
                // The even cell must clear BOTH the engine MIN width AND the demand's MIN AREA (so the
                // extra cell is a real, on-spec apartment — not a feasible-width but sub-area sliver).
                if (evenW >= wFeasMin - EPS && evenW >= wMinArea - EPS) {
                    nCells = nEven;                          // even tiling fills the run, every cell on-spec
                } else {
                    nCells = Math.max(1, Math.floor(runWidth / wMax + EPS));
                    sliceWidth = round4(wMax);               // greedy: leave the sub-min remainder unbuilt
                }
            } else {
                // Clamp the ideal into [minByMax, maxByMin]; prefer fewer (wider → keeps the count).
                const loCells = Math.min(minCellsByMax, maxCellsByMin);
                nCells = Math.min(maxCellsByMin, Math.max(loCells, idealCells));
            }
            const w = sliceWidth ?? round4(runWidth / nCells);
            // §RESI-CORNER-UNITS-ALWAYS (founder 2026-06-24: "there must always be apartments at the
            // building corners") — when a greedy slice leaves a remainder, the un-built strip used to
            // land at the run's HIGH-x END. For the run that abuts the plate's RIGHT edge (run.x1 ≈
            // bb.x1) that end IS the building corner, so the corner came out EMPTY (no apartment). We
            // ANCHOR the packing to whichever run end sits on the plate boundary: a run touching the
            // right edge packs FLUSH-RIGHT (the remainder slides to the interior, the corner gets a
            // cell); a run touching the left edge packs flush-left (already the corner there). An
            // interior run (between core and a corridor, touching no plate edge) keeps the flush-left
            // behaviour. Even division has no remainder, so this is a no-op there (byte-identical).
            const packedWidth = nCells * w;
            const remainder = round4(runWidth - packedWidth);
            const touchesRight = Math.abs(run.x1 - bb.x1) <= 1e-3;
            const touchesLeft = Math.abs(run.x0 - bb.x0) <= 1e-3;
            // Slide the whole packed block to the boundary end so a plate-edge run fills its corner.
            // Prefer the right edge when a run somehow touches both (a full-width edge run): the left
            // corner is then covered by the FIRST cell starting at run.x0 anyway (block spans the run).
            const startX = (touchesRight && !touchesLeft && remainder > EPS)
                ? round4(run.x0 + remainder)   // flush-right: leave the remainder on the interior side
                : run.x0;                       // flush-left (default): corner is the run's low-x end
            for (let k = 0; k < nCells && cursor < apartments.length; k++) {
                const demand = apartments[cursor];
                if (!demand) break;
                const x0 = round4(startX + k * w);
                // The block's FINAL cell snaps to the boundary end so float drift never leaves a hairline
                // gap at the plate edge: flush-right ⇒ snap to run.x1 (= bb.x1, the corner); flush-left
                // even-division ⇒ snap to run.x1; flush-left greedy ⇒ exact wMax slice (remainder interior).
                const isLast = k === nCells - 1;
                const snapToRunEnd = isLast && (startX > run.x0 + EPS || sliceWidth === undefined);
                const x1 = snapToRunEnd ? round4(run.x1) : round4(startX + (k + 1) * w);
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
        // §RESI-CORNER-UNITS-ALWAYS guard — packInnerStrips ADDS the inner strips ONLY for a row that
        // OVERLAPS the core in Z (where `runsFor` carves the FULL core width, leaving the strips for
        // this pass). A row entirely OUTSIDE the core's Z-band already has its inner strips filled by
        // `packRow` (which then carves only the narrow SPINE), so packing them again here double-tiles
        // the strip → overlap. (The corner/outer-band deepening introduced fully-out-of-core façade
        // rows that re-exposed this.) So skip when the row does not overlap the core in Z.
        const rowOverlapsCoreZ = !(coreN.z1 <= rowZ0 + EPS || coreN.z0 >= rowZ1 - EPS);
        if (!rowOverlapsCoreZ) return;
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
        // §RESI-CORNER-UNITS-ALWAYS — the OUTERMOST front row (no prev corridor ⇒ it abuts the plate
        // edge) is allowed the DEEPER cap so it spans corridor→façade and its corner cells reach the
        // edge; an interior front row keeps the standard cap.
        const frontCap = prevCz === undefined ? MAX_OUTER_BAND_DEPTH_M : MAX_APARTMENT_DEPTH_M;
        const frontDepth = Math.min(frontCap, myTop - frontOuterLimit);
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
        const backCap = nextCz === undefined ? MAX_OUTER_BAND_DEPTH_M : MAX_APARTMENT_DEPTH_M;
        const backDepth = Math.min(backCap, backOuterLimit - myBot);
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
    // §DIAG-RESI-FILL (§RESI-PLATE-UNDERFILL, SPEC-NONRECT-APARTMENTS-CORRIDOR-FIRST) — the apartment
    // FILL RATIO: placed-apartment footprint ÷ the NET plate area (plate − core). This is the headline
    // metric the under-fill fix targets; a healthy plate fills a strong majority of its net area.
    const placedArea = placements.reduce((s, c) => s + rectArea(c.rect), 0);
    const netPlateArea = Math.max(EPS, bbArea - rectArea(coreN));
    const fillRatio = round4(placedArea / netPlateArea);
    const diagnostic =
        `§DIAG-RESI-PARTITION level=${levelIndex} status=ok N=${placements.length} ` +
        `corridors=${corridorBands.length} ` +
        `mix=[${mix.join(',')}] areas=[${areas.map((a) => a.toFixed(1)).join(',')}] ` +
        `clippedOutOfBoundary=${clippedOut} reached=${reached}/${placements.length} ` +
        `§DIAG-RESI-FILL fillRatio=${fillRatio.toFixed(3)} (placed=${placedArea.toFixed(0)}m²/net=${netPlateArea.toFixed(0)}m²)`;

    return {
        status: 'ok',
        core: coreN,
        publicCorridor: corridorBands,
        apartmentCells: placements,
        apartmentsReached: reached,
        fillRatio,
        diagnostic,
    };
}
