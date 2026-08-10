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
import {
    rectArea, rectWidth, rectDepth,
    // §RESI-RECT-DECOMP — the proven rectilinear slab-sweep decomposition (L/T/U → axis-aligned
    // rects) + the guillotine core-subtraction, reused to tile a concave plate wing-by-wing.
    decomposeToRects, subtractRectsFromRects,
} from '../apartmentLayout/tgl/rectDecomposition.js';

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
    /** §NONRECT-CELLS-P1 — the cell's REAL footprint polygon (metres, plan-XZ, CCW). For a
     *  rectangular cell this is exactly `rectPolygon(rect)` (4 corners) → byte-identical geometry.
     *  When the §RESI-CLIP-BOUNDARY pass RESHAPES an out-of-shape cell to the drawn boundary (flag
     *  `__pryzmNonRectCells` ON) this is the clipped rectilinear polygon; the single-apartment
     *  engine lays out rooms in THIS perimeter (polySubdivide), and rect-only gates read its bbox
     *  (`cellBBoxRect`). ALWAYS present (rect cells set it from their rect). */
    readonly polygon: readonly Pt[];
    /** §RESI-CORE-CIRCULATION (founder 2026-06-30: "circulation always needs to be at the core") —
     *  TRUE iff this cell's door edge fronts a corridor band that traces back to the CENTRAL CORE
     *  through other corridors only (no marooned corridor stub, no unit-to-unit-only circulation).
     *  Every shipped cell SHOULD be `true`: the winning candidate's corridor network is repaired to
     *  connect every fronting band to the core (`repairCoreCirculation`) and then each cell is tagged
     *  (`tagCoreReachability`). The preview graph roots `true` cells to the core hub and shows any
     *  `false` cell honestly (orphaned). Optional at push time (defaults true), set authoritatively
     *  on the result. */
    readonly coreReachable?: boolean;
    /** §RESI-CORE-DOOR (founder 2026-06-30: "the door should always be well calculated") — the
     *  along-edge offset (from the door edge's low corner, m) for the unit's entry door, computed so
     *  the door sits CENTRED within the span the `doorEdge` SHARES with the core-connected corridor
     *  (clear of corners / the core / a perpendicular wall by a jamb margin). Set on every shipped
     *  core-reachable cell whose door edge genuinely shares ≥ a door width with circulation; absent
     *  when the door edge doesn't share with a core-connected band (caller falls back to its engine-
     *  circulation alignment / centred offset). The executor PREFERS this geometric offset for its
     *  fallback so a small core-flank unit's door is never mis-placed at a corner. */
    readonly coreDoorOffset?: number;
    /** §RESI-CORE-DOOR — the door leaf width (m) that fits the corridor-shared span with jambs (paired
     *  with `coreDoorOffset`). Absent when `coreDoorOffset` is. */
    readonly coreDoorWidth?: number;
}

/** §NONRECT-CELLS-P1 — the 4-corner CCW polygon of an axis-aligned rect (the identity case: a rect
 *  cell's `polygon` is exactly this, so a rectangular plate stays byte-identical). */
export function rectPolygon(r: Rect): Pt[] {
    return [
        { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
    ];
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
    /** §RESI-CORE-CIRCULATION — N apartments whose door fronts a CORE-CONNECTED corridor (the door
     *  edge shares ≥ a door width with a corridor band that traces back to the central core through
     *  corridors only). The strict core-centric invariant: on a well-formed plate this equals
     *  `apartmentCells.length`. Always ≤ `apartmentsReached` (a band may front a cell yet be a
     *  marooned stub, which this does NOT count). */
    readonly apartmentsCoreReachable: number;
    /** §DIAG-RESI-FILL — placed-apartment footprint ÷ net plate area (plate − core), 0..~1. The
     *  headline §RESI-PLATE-UNDERFILL metric; a well-packed plate fills a strong majority of its net.
     *  §RESI-CORRIDOR-ECONOMY (audit P1-2) — no longer diagnostic-only: the candidate objective now
     *  charges corridor area (so tighter layouts win) and the orchestrator surfaces this ratio to the
     *  preview card ("apartments NN% of plate"). */
    readonly fillRatio: number;
    /** §RESI-CORRIDOR-ECONOMY — the shipped corridor bands' UNION area (m², overlaps counted once).
     *  The circulation cost the objective charged; surfaced beside `fillRatio` for honesty. */
    readonly corridorAreaM2: number;
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
// §RESI-CORRIDOR-GRID — the shallowest apartment row depth (m) at which the frozen D-TGL engine still
// lays out a real multi-room apartment (rather than soft-failing / scaling to a studio). Mirrors the
// absorbResidual ENGINE_MIN_DEPTH_M gate. The hybrid grid only adds an INTERIOR corridor when its rows
// clear this — so the perimeter fills with buildable units, never un-layable slivers the founder sees
// as the same empty band.
const ENGINE_MIN_ROW_DEPTH_M = 7.5;
/** Min cell width as a fraction of its depth — below this the cell is a sliver the
 *  engine rejects. 0.6 ⇒ a 9 m-deep cell is ≥ 5.4 m wide (aspect ≤ ~1.7:1). */
const MIN_CELL_ASPECT = 0.6;

// §RESI-FILL-COREFLANK (founder 2026-06-30: "apartments fit the corners always — great — BUT they
// don't need to be square; rectangular is fine, and there's still a lot of space around the central
// core to fit MORE"). On a near-rectangular ~1200 m² plate the corridor grid fills the two DEEP outer
// bands (corner units) but leaves the CENTRAL depth zone FLANKING THE CORE empty: the band between the
// corridor just above the core and the corridor just below it, on each side of the core, is one large
// ~14×14 m pocket that NO row tiles (the rows there are the sub-feasible inter-corridor slivers) and
// that absorbResidual rejects because the middle corridor fragments it below the ~7.5 m engine depth.
// The §RESI-FILL-COREFLANK pass packs those two core-flanking pockets DIRECTLY as ELONGATED RECTANGULAR
// units fronting the nearest horizontal corridor (door on the corridor edge), allowing a generous
// aspect so a long thin flank becomes one or two real apartments instead of dead space. Every flank
// unit fronts a corridor by construction (so it is core-reachable) and is engine-feasibility-gated.
/** Max aspect (long:short) for a RECTANGULAR mid-edge / core-flank unit. The frozen D-TGL engine lays
 *  out an elongated apartment well past square (rooms strung along the long axis); 3.5:1 is the sane
 *  ceiling the founder set ("rectangular is fine … respect a sane max aspect"). */
export const MAX_RECT_ASPECT = 3.5;
/** A core-flank pocket must be at least this deep (m) toward the façade to host a real apartment — the
 *  same engine-feasible floor the absorb/grid passes use. A shallower pocket stays empty (no sliver). */
const COREFLANK_MIN_DEPTH_M = 7.5;

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

/**
 * §NONRECT-CELLS-P1 — clip an axis-aligned RECT to a (rectilinear) boundary polygon, returning the
 * single CCW ring of their intersection (or null when the overlap is empty / a sliver). RESHAPE,
 * not drop: a cell that pokes past the drawn L/trapezoid boundary becomes the rectilinear cell that
 * stays inside it (absorbing the residual the rect packer would waste). Robust for the rectilinear
 * boundaries the resi pipeline draws: it builds the breakpoint grid over the rect ∩ boundary, marks
 * each grid sub-cell whose CENTRE is inside BOTH, then traces the covered region's outer boundary
 * (the same proven marching-edges tracer the corridor-residual uses). Pure + deterministic.
 */
function clipRectToPolygon(rect: Rect, poly: readonly Pt[]): Pt[] | null {
    if (poly.length < 3) return null;
    const rx0 = Math.min(rect.x0, rect.x1), rx1 = Math.max(rect.x0, rect.x1);
    const rz0 = Math.min(rect.z0, rect.z1), rz1 = Math.max(rect.z0, rect.z1);
    if (rx1 - rx0 <= EPS || rz1 - rz0 <= EPS) return null;
    // Breakpoint grid: the rect edges + every boundary vertex coord, clamped to the rect extent.
    const xs = new Set<number>([rx0, rx1]);
    const zs = new Set<number>([rz0, rz1]);
    for (const p of poly) {
        if (p.x > rx0 + EPS && p.x < rx1 - EPS) xs.add(round4(p.x));
        if (p.z > rz0 + EPS && p.z < rz1 - EPS) zs.add(round4(p.z));
    }
    const xa = [...xs].sort((a, b) => a - b);
    const za = [...zs].sort((a, b) => a - b);
    const nx = xa.length - 1, nz = za.length - 1;
    if (nx < 1 || nz < 1) return null;
    // covered[i][j] = grid cell centre is inside the boundary polygon (it is inside the rect by
    // construction). The cell rect is the union of the covered grid cells.
    const covered: boolean[][] = Array.from({ length: nx }, () => new Array<boolean>(nz).fill(false));
    for (let i = 0; i < nx; i++) {
        const cx = (xa[i]! + xa[i + 1]!) / 2;
        for (let j = 0; j < nz; j++) {
            const cz = (za[j]! + za[j + 1]!) / 2;
            covered[i]![j] = pointInPolygon(cx, cz, poly);
        }
    }
    // Trace the covered region's boundary into directed edges (covered region on the LEFT = CCW).
    const key = (a: Pt, b: Pt): string => `${a.x.toFixed(4)},${a.z.toFixed(4)}->${b.x.toFixed(4)},${b.z.toFixed(4)}`;
    const edges = new Map<string, { a: Pt; b: Pt }>();
    const addEdge = (a: Pt, b: Pt): void => { edges.set(key(a, b), { a, b }); };
    const isCov = (i: number, j: number): boolean => i >= 0 && i < nx && j >= 0 && j < nz && covered[i]![j]!;
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
            if (!covered[i]![j]) continue;
            const x0 = xa[i]!, x1 = xa[i + 1]!, z0 = za[j]!, z1 = za[j + 1]!;
            if (!isCov(i, j - 1)) addEdge({ x: x0, z: z0 }, { x: x1, z: z0 });
            if (!isCov(i + 1, j)) addEdge({ x: x1, z: z0 }, { x: x1, z: z1 });
            if (!isCov(i, j + 1)) addEdge({ x: x1, z: z1 }, { x: x0, z: z1 });
            if (!isCov(i - 1, j)) addEdge({ x: x0, z: z1 }, { x: x0, z: z0 });
        }
    }
    if (edges.size === 0) return null;
    // Chain the directed edges into a ring, then drop collinear vertices for a clean polygon.
    const byStart = new Map<string, { a: Pt; b: Pt }[]>();
    for (const e of edges.values()) {
        const k = `${e.a.x.toFixed(4)},${e.a.z.toFixed(4)}`;
        (byStart.get(k) ?? byStart.set(k, []).get(k)!).push(e);
    }
    const used = new Set<string>();
    let best: Pt[] = [];
    for (const start of edges.values()) {
        if (used.has(key(start.a, start.b))) continue;
        const ring: Pt[] = [];
        let cur = start, guard = edges.size + 4;
        while (guard-- > 0) {
            used.add(key(cur.a, cur.b));
            ring.push({ x: cur.a.x, z: cur.a.z });
            const k = `${cur.b.x.toFixed(4)},${cur.b.z.toFixed(4)}`;
            const next = (byStart.get(k) ?? []).find(e => !used.has(key(e.a, e.b)));
            if (!next) break;
            cur = next;
            if (key(cur.a, cur.b) === key(start.a, start.b)) break;
        }
        // Keep the LARGEST ring (the cell's main body; ignore any tiny disconnected speck).
        if (polygonArea(ring) > polygonArea(best)) best = ring;
    }
    // Drop collinear vertices.
    const clean: Pt[] = [];
    const n = best.length;
    for (let i = 0; i < n; i++) {
        const a = best[(i - 1 + n) % n]!, b = best[i]!, c = best[(i + 1) % n]!;
        const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        if (Math.abs(cross) < 1e-6) continue;
        clean.push(b);
    }
    return clean.length >= 3 ? clean : null;
}

/**
 * §NONRECT-CELLS-P1 — RESIDUAL ABSORPTION. Find the in-boundary area NOT covered by any placed cell,
 * the core, or a corridor, decompose it into connected rectilinear regions, and mint a reshaped cell
 * for each region that (a) is ≥ a feasible apartment size, (b) is ≤ the outer-band depth from the
 * corridor it fronts, and (c) FRONTS a corridor by ≥ a door width (CF). The cell's polygon is the
 * region clipped to the boundary. Mutates `placements`. Deterministic; only runs when the flag is on.
 */
function absorbResidual(
    placements: ApartmentCell[],
    corridors: readonly Rect[],
    bb: Rect,
    core: Rect,
    clipPolygon: readonly Pt[] | undefined,
    demands: readonly ApartmentDemand[],
    nextDemand: () => ApartmentDemand | undefined,
): void {
    if (demands.length === 0) return;
    // Build the breakpoint grid over the plate; mark a grid cell OCCUPIED when its centre is in any
    // placed cell / the core / a corridor / OUTSIDE the boundary. The residual = the rest.
    const xs = new Set<number>([bb.x0, bb.x1]);
    const zs = new Set<number>([bb.z0, bb.z1]);
    const occupiers: Rect[] = [...placements.map(p => p.rect), core, ...corridors];
    for (const r of occupiers) { xs.add(round4(r.x0)); xs.add(round4(r.x1)); zs.add(round4(r.z0)); zs.add(round4(r.z1)); }
    const xa = [...xs].filter(x => x >= bb.x0 - EPS && x <= bb.x1 + EPS).sort((a, b) => a - b);
    const za = [...zs].filter(z => z >= bb.z0 - EPS && z <= bb.z1 + EPS).sort((a, b) => a - b);
    const nx = xa.length - 1, nz = za.length - 1;
    if (nx < 1 || nz < 1) return;
    const inRect = (cx: number, cz: number, r: Rect): boolean =>
        cx > Math.min(r.x0, r.x1) + EPS && cx < Math.max(r.x0, r.x1) - EPS &&
        cz > Math.min(r.z0, r.z1) + EPS && cz < Math.max(r.z0, r.z1) - EPS;
    // residual[i][j] = empty AND inside the boundary.
    const residual: boolean[][] = Array.from({ length: nx }, () => new Array<boolean>(nz).fill(false));
    for (let i = 0; i < nx; i++) {
        const cx = (xa[i]! + xa[i + 1]!) / 2;
        for (let j = 0; j < nz; j++) {
            const cz = (za[j]! + za[j + 1]!) / 2;
            if (clipPolygon && clipPolygon.length >= 3 && !pointInPolygon(cx, cz, clipPolygon)) continue;
            if (occupiers.some(r => inRect(cx, cz, r))) continue;
            residual[i]![j] = true;
        }
    }
    // Flood-fill the residual grid into connected components (4-neighbour).
    const comp: number[][] = Array.from({ length: nx }, () => new Array<number>(nz).fill(-1));
    let nc = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (!residual[i]![j] || comp[i]![j] >= 0) continue;
        const stack: Array<[number, number]> = [[i, j]];
        comp[i]![j] = nc;
        while (stack.length) {
            const [ci, cj] = stack.pop()!;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
                const ni = ci + di, nj = cj + dj;
                if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
                if (residual[ni]![nj] && comp[ni]![nj] < 0) { comp[ni]![nj] = nc; stack.push([ni, nj]); }
            }
        }
        nc++;
    }
    // For each component, trace its outer ring + check it fronts a corridor and is feasible.
    for (let cId = 0; cId < nc; cId++) {
        const ring = traceComponentRing(comp, cId, xa, za, nx, nz);
        if (!ring || ring.length < 3) continue;
        const area = polygonArea(ring);
        if (!polygonFrontsCorridor(ring, corridors, DOOR_WIDTH_M)) continue;   // CF: must front a corridor
        const rbb = bbox(ring);
        const w = rbb.x1 - rbb.x0, dpt = rbb.z1 - rbb.z0;
        const minSide = Math.min(w, dpt), maxSide = Math.max(w, dpt);
        // §NONRECT-CELLS-P1 ENGINE-FEASIBILITY GATE — only mint an absorbed cell the per-cell D-TGL
        // engine can actually lay out (else it soft-fails and the unit never ships). The engine needs
        // a region that is (a) ≥ a real apartment area, (b) ≥ the feasible min DEPTH (~7.5 m short
        // side — a shallower pocket is the un-tileable shallow-row residual, left empty by design),
        // and (c) not aspect-extreme (≤ ~2.2:1). A pocket failing these stays residual (no rejected
        // sliver cell — the founder sees only laid-out apartments). This keeps the absorbed cells
        // ENGINE-FEASIBLE so the realOK count actually rises, not just the partition fill geometry.
        const ENGINE_MIN_DEPTH_M = 7.5, MAX_ASPECT = 2.2, MIN_ABSORB_AREA = 50;
        if (area < MIN_ABSORB_AREA) continue;
        if (minSide < ENGINE_MIN_DEPTH_M - EPS) continue;
        if (maxSide / Math.max(EPS, minSide) > MAX_ASPECT) continue;
        // The polygon must FILL most of its bbox (a near-rect pocket lays out; a thin L-arm doesn't).
        if (area < 0.75 * w * dpt) continue;
        const demand = nextDemand();
        if (!demand) break;
        placements.push({
            typology: demand.typology,
            rect: normRect(rbb),
            areaM2: round4(area),
            doorEdge: 'z0',
            polygon: ring.map(p => ({ x: round4(p.x), z: round4(p.z) })),
        });
    }
}

/** Trace the outer ring of grid component `cId` (covered-on-left ⇒ CCW), dropping collinear verts. */
function traceComponentRing(
    comp: readonly number[][], cId: number, xa: readonly number[], za: readonly number[], nx: number, nz: number,
): Pt[] | null {
    const key = (a: Pt, b: Pt): string => `${a.x.toFixed(4)},${a.z.toFixed(4)}->${b.x.toFixed(4)},${b.z.toFixed(4)}`;
    const edges = new Map<string, { a: Pt; b: Pt }>();
    const add = (a: Pt, b: Pt): void => { edges.set(key(a, b), { a, b }); };
    const is = (i: number, j: number): boolean => i >= 0 && i < nx && j >= 0 && j < nz && comp[i]![j] === cId;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (comp[i]![j] !== cId) continue;
        const x0 = xa[i]!, x1 = xa[i + 1]!, z0 = za[j]!, z1 = za[j + 1]!;
        if (!is(i, j - 1)) add({ x: x0, z: z0 }, { x: x1, z: z0 });
        if (!is(i + 1, j)) add({ x: x1, z: z0 }, { x: x1, z: z1 });
        if (!is(i, j + 1)) add({ x: x1, z: z1 }, { x: x0, z: z1 });
        if (!is(i - 1, j)) add({ x: x0, z: z1 }, { x: x0, z: z0 });
    }
    if (edges.size === 0) return null;
    const byStart = new Map<string, { a: Pt; b: Pt }[]>();
    for (const e of edges.values()) {
        const k = `${e.a.x.toFixed(4)},${e.a.z.toFixed(4)}`;
        (byStart.get(k) ?? byStart.set(k, []).get(k)!).push(e);
    }
    const used = new Set<string>();
    let best: Pt[] = [];
    for (const start of edges.values()) {
        if (used.has(key(start.a, start.b))) continue;
        const ring: Pt[] = [];
        let cur = start, guard = edges.size + 4;
        while (guard-- > 0) {
            used.add(key(cur.a, cur.b));
            ring.push({ x: cur.a.x, z: cur.a.z });
            const k = `${cur.b.x.toFixed(4)},${cur.b.z.toFixed(4)}`;
            const next = (byStart.get(k) ?? []).find(e => !used.has(key(e.a, e.b)));
            if (!next) break;
            cur = next;
            if (key(cur.a, cur.b) === key(start.a, start.b)) break;
        }
        if (polygonArea(ring) > polygonArea(best)) best = ring;
    }
    const clean: Pt[] = [];
    const n = best.length;
    for (let i = 0; i < n; i++) {
        const a = best[(i - 1 + n) % n]!, b = best[i]!, c = best[(i + 1) % n]!;
        const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        if (Math.abs(cross) < 1e-6) continue;
        clean.push(b);
    }
    return clean.length >= 3 ? clean : null;
}

/** §NONRECT-CELLS-P1 — does any polygon EDGE share ≥ `minShare` of its length with a corridor band's
 *  edge (the corridor-first invariant CF: a reshaped cell must still FRONT a corridor — never sealed)?
 *  A cell edge fronts a corridor when it is collinear with, and overlaps, a corridor band boundary. */
function polygonFrontsCorridor(poly: readonly Pt[], corridors: readonly Rect[], minShare: number): boolean {
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const horizontal = Math.abs(a.z - b.z) < 1e-4;
        const vertical = Math.abs(a.x - b.x) < 1e-4;
        if (!horizontal && !vertical) continue;
        for (const c of corridors) {
            const cx0 = Math.min(c.x0, c.x1), cx1 = Math.max(c.x0, c.x1);
            const cz0 = Math.min(c.z0, c.z1), cz1 = Math.max(c.z0, c.z1);
            if (horizontal) {
                // The edge's z must coincide with a corridor horizontal boundary; overlap along x.
                const onBoundary = Math.abs(a.z - cz0) < 0.05 || Math.abs(a.z - cz1) < 0.05;
                if (!onBoundary) continue;
                const lo = Math.max(Math.min(a.x, b.x), cx0), hi = Math.min(Math.max(a.x, b.x), cx1);
                if (hi - lo >= minShare) return true;
            } else {
                const onBoundary = Math.abs(a.x - cx0) < 0.05 || Math.abs(a.x - cx1) < 0.05;
                if (!onBoundary) continue;
                const lo = Math.max(Math.min(a.z, b.z), cz0), hi = Math.min(Math.max(a.z, b.z), cz1);
                if (hi - lo >= minShare) return true;
            }
        }
    }
    return false;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
function normRect(r: Rect): Rect {
    return { x0: round4(r.x0), z0: round4(r.z0), x1: round4(r.x1), z1: round4(r.z1) };
}

// §RESI-EDGE-TYPE-VARIETY (founder 2026-06-27: "fill the long edges between the corners with ADJACENT
// apartments — and these can be DIFFERENT: fewer bedrooms (T1/T2 vs corner T3/T4), different sizes…").
// The packer picks ONE typology for every equal slot, so a filled plate came out uniform (every cell
// the same T). Once the grid fills the perimeter, the cells are NOT uniform in area — a deep corner
// cell is genuinely larger than a shallow edge-fill cell — so we re-stamp each placed cell's typology
// from its REAL AREA, choosing among the typologies the demand actually requested (the user's enabled
// mix). Larger cells → larger typology, smaller cells → smaller typology. This is geometry-honest
// (the bedroom count follows the cell that can hold it) and keeps every cell within the brief's mix.
/** The per-typology net-area band (m²) — mirrors `apartmentPacker.TYPOLOGY_BAND` (audit §6). Kept a
 *  local copy so platePartition stays a leaf (no upward import of the packer); exported so the
 *  orchestrator can declare the enabled-typology palette without re-deriving the bands. */
export const TYPOLOGY_AREA_BAND: Record<Typology, { min: number; max: number }> = {
    T1: { min: 35, max: 55 },
    T2: { min: 55, max: 80 },
    T3: { min: 80, max: 110 },
    T4: { min: 110, max: 150 },
};
/** Pick the typology (from the ENABLED set, largest→smallest) whose area band best fits `areaM2`:
 *  the largest enabled typology whose band MIN ≤ area (so a big cell becomes a big unit); if the area
 *  is below every enabled min, the smallest enabled typology (the cell is a small unit of that type).
 *  Deterministic — `enabled` is iterated in a fixed T1→T4 order. */
function typologyForArea(areaM2: number, enabled: readonly Typology[]): Typology {
    const order: readonly Typology[] = ['T1', 'T2', 'T3', 'T4'];
    const present = order.filter((t) => enabled.includes(t));
    if (present.length === 0) return 'T2';
    // Largest enabled typology whose band MIN the area clears.
    for (let i = present.length - 1; i >= 0; i--) {
        const t = present[i]!;
        if (areaM2 + EPS >= TYPOLOGY_AREA_BAND[t].min) return t;
    }
    return present[0]!;   // below every band min → the smallest enabled typology
}

// ── §RESI-CORE-CIRCULATION (founder 2026-06-30: "circulation always needs to be at the CORE") ──────
// The packer fronts every apartment on SOME corridor band, but that alone does NOT make circulation
// core-centric: a band could be a marooned stub (e.g. a per-wing connector that doesn't quite butt
// the core spine, or a side-façade unit fronting a corridor that the §RESI-FILL-SIDEFACADE trim left
// short of the core). The founder wants EVERY apartment's entry to connect to the CORE-anchored
// corridor cross — not to a neighbour unit and not to an isolated corridor stub.
//
// These pure helpers (a) build the corridor connectivity graph and find the component touching the
// CORE, (b) REPAIR a near-miss by extending/joining a fronting band to the core component with a
// short spur, and (c) TAG each cell `coreReachable` iff its door fronts a core-connected band. The
// orchestrator/preview consume the tag; the diagnostic reports `coreReached=N/N`.

/** Two axis-aligned rects are CIRCULATION-ADJACENT when they overlap OR share a boundary segment
 *  longer than a door width (so a resident can walk from one corridor band into the other). A small
 *  overlap tolerance lets float-rounded coincident edges count as connected. */
function corridorsAdjacent(a: Rect, b: Rect): boolean {
    const ax0 = Math.min(a.x0, a.x1), ax1 = Math.max(a.x0, a.x1);
    const az0 = Math.min(a.z0, a.z1), az1 = Math.max(a.z0, a.z1);
    const bx0 = Math.min(b.x0, b.x1), bx1 = Math.max(b.x0, b.x1);
    const bz0 = Math.min(b.z0, b.z1), bz1 = Math.max(b.z0, b.z1);
    // Overlap (interiors intersect) OR edge-touch with ≥ door-width shared run along the touching axis.
    const xOverlap = Math.min(ax1, bx1) - Math.max(ax0, bx0);
    const zOverlap = Math.min(az1, bz1) - Math.max(az0, bz0);
    const TOUCH = 0.05;            // collinear-edge coincidence tolerance (m)
    if (xOverlap > EPS && zOverlap > EPS) return true;                       // true overlap
    // Edge-touch: one axis just touches (gap ≤ TOUCH) while the other shares ≥ a door width.
    if (Math.abs(xOverlap) <= TOUCH && zOverlap >= DOOR_WIDTH_M - EPS) return true;
    if (Math.abs(zOverlap) <= TOUCH && xOverlap >= DOOR_WIDTH_M - EPS) return true;
    return false;
}

/** Does a rect (a corridor band, or the CORE) circulation-touch a band? Reuses `corridorsAdjacent`. */
function rectTouchesBand(r: Rect, band: Rect): boolean {
    return corridorsAdjacent(r, band);
}

/** §RESI-CORE-CIRCULATION — the set of corridor-band indices REACHABLE FROM THE CORE through other
 *  corridor bands only (BFS over the corridor adjacency graph, seeded by bands touching the core).
 *  A band NOT in this set is a marooned stub — any apartment fronting only such a band is NOT
 *  core-connected. Pure + deterministic (index order fixed). */
function coreConnectedBandSet(corridorBands: readonly Rect[], core: Rect): Set<number> {
    const reachable = new Set<number>();
    const queue: number[] = [];
    // Seed: every band that touches the core.
    for (let i = 0; i < corridorBands.length; i++) {
        if (rectTouchesBand(core, corridorBands[i]!)) { reachable.add(i); queue.push(i); }
    }
    // BFS the corridor adjacency graph.
    while (queue.length) {
        const i = queue.shift()!;
        const bi = corridorBands[i]!;
        for (let j = 0; j < corridorBands.length; j++) {
            if (reachable.has(j)) continue;
            if (corridorsAdjacent(bi, corridorBands[j]!)) { reachable.add(j); queue.push(j); }
        }
    }
    return reachable;
}

/** §RESI-CORE-CIRCULATION — does a cell's DOOR EDGE front a corridor band that is in `connected`
 *  (the core-connected set)? The door edge is the cell's `doorEdge`; we test that edge shares ≥ a
 *  door width with a core-connected band's coincident boundary. Mirrors `polygonFrontsCorridor` but
 *  restricted to the door edge AND to core-connected bands. */
function cellDoorOnConnectedCorridor(
    cell: ApartmentCell, corridorBands: readonly Rect[], connected: ReadonlySet<number>,
): boolean {
    const r = cell.rect;
    // The door edge as a segment (constant coord + span).
    const e = cell.doorEdge;
    const horizontal = e === 'z0' || e === 'z1';
    const edgeConst = e === 'x0' ? r.x0 : e === 'x1' ? r.x1 : e === 'z0' ? r.z0 : r.z1;
    const spanLo = horizontal ? Math.min(r.x0, r.x1) : Math.min(r.z0, r.z1);
    const spanHi = horizontal ? Math.max(r.x0, r.x1) : Math.max(r.z0, r.z1);
    for (let i = 0; i < corridorBands.length; i++) {
        if (!connected.has(i)) continue;
        const c = corridorBands[i]!;
        const cx0 = Math.min(c.x0, c.x1), cx1 = Math.max(c.x0, c.x1);
        const cz0 = Math.min(c.z0, c.z1), cz1 = Math.max(c.z0, c.z1);
        if (horizontal) {
            // door on a horizontal edge (z const): the band's z0 or z1 must coincide; overlap along x.
            const onBoundary = Math.abs(edgeConst - cz0) < 0.05 || Math.abs(edgeConst - cz1) < 0.05;
            if (!onBoundary) continue;
            const lo = Math.max(spanLo, cx0), hi = Math.min(spanHi, cx1);
            if (hi - lo >= DOOR_WIDTH_M - EPS) return true;
        } else {
            const onBoundary = Math.abs(edgeConst - cx0) < 0.05 || Math.abs(edgeConst - cx1) < 0.05;
            if (!onBoundary) continue;
            const lo = Math.max(spanLo, cz0), hi = Math.min(spanHi, cz1);
            if (hi - lo >= DOOR_WIDTH_M - EPS) return true;
        }
    }
    return false;
}

// ── §RESI-CORRIDOR-TO-CORE (founder 2026-06-30, plan-view arrows: "the walls of the corridor should
// arrive JUST to the core") ──────────────────────────────────────────────────────────────────────
// The horizontal corridor bands span the FULL plate width `[plate.x0, plate.x1]`, so a band whose Z
// overlaps the core RUNS STRAIGHT THROUGH the core rect (over the stair/lift). Geometrically the
// corridor then overshoots PAST the core face into its interior — the founder's "corridor walls don't
// arrive just to the core" defect (the corridor reads as crossing the core instead of butting it).
// `clipCorridorBandsToCore` SPLITS every band that overlaps the core interior at the core's faces:
// a band wider than tall (a horizontal run) becomes its left segment `[band.x0, core.x0]` and right
// segment `[core.x1, band.x1]` (each clamped to the band's Z), so each corridor wall terminates EXACTLY
// on the core's X-face — no gap, no overshoot, no stub floating inside the core. A band taller than
// wide (a vertical spine/connector) is split at the core's Z-faces the same way. A band that does NOT
// overlap the core interior is kept verbatim. The two resulting segments both BUTT the core, so they
// stay core-connected (the spine bridges them across the core) and the §RESI-CORE-CIRCULATION graph is
// unchanged. Pure + deterministic; a plate whose bands never cross the core (no horizontal corridor at
// the core's Z) is byte-identical (the core-spanning rows are typically only the core corridor itself).
function clipCorridorBandsToCore(bands: readonly Rect[], core: Rect): Rect[] {
    const cx0 = Math.min(core.x0, core.x1), cx1 = Math.max(core.x0, core.x1);
    const cz0 = Math.min(core.z0, core.z1), cz1 = Math.max(core.z0, core.z1);
    const out: Rect[] = [];
    for (const b of bands) {
        const bx0 = Math.min(b.x0, b.x1), bx1 = Math.max(b.x0, b.x1);
        const bz0 = Math.min(b.z0, b.z1), bz1 = Math.max(b.z0, b.z1);
        // Does the band's interior overlap the core's interior at all?
        const xOverlap = Math.min(bx1, cx1) - Math.max(bx0, cx0);
        const zOverlap = Math.min(bz1, cz1) - Math.max(bz0, cz0);
        if (xOverlap <= EPS || zOverlap <= EPS) { out.push(normRect(b)); continue; }   // no crossing → verbatim
        const horizontal = (bx1 - bx0) >= (bz1 - bz0);
        if (horizontal) {
            // Split at the core's X-faces; each segment keeps the band's Z and butts the core face.
            if (cx0 - bx0 > EPS) out.push(normRect({ x0: bx0, z0: bz0, x1: cx0, z1: bz1 }));   // left, butts core.x0
            if (bx1 - cx1 > EPS) out.push(normRect({ x0: cx1, z0: bz0, x1: bx1, z1: bz1 }));   // right, butts core.x1
        } else {
            // Vertical band → split at the core's Z-faces; each segment butts a core Z-face.
            if (cz0 - bz0 > EPS) out.push(normRect({ x0: bx0, z0: bz0, x1: bx1, z1: cz0 }));   // above, butts core.z0
            if (bz1 - cz1 > EPS) out.push(normRect({ x0: bx0, z0: cz1, x1: bx1, z1: bz1 }));   // below, butts core.z1
        }
        // If the band is entirely inside the core in the split axis it produces no segment (it WAS the
        // core lobby strip — dropped, since the core perimeter encloses that space, never a corridor wall).
    }
    return out;
}

// ── §RESI-CORRIDOR-ECONOMY (audit GENERATIVE-PIPELINE-AUDIT-2026-08-10 §2.4 / P1-2, C53) ─────────
// The candidate objective used to be (feasibleCount, cellCount, placedArea) — corridor area appeared
// in NO term, so "a candidate that buys +2 m² of placed area with +40 m² of corridor wins". The two
// helpers below make circulation a CHARGED cost:
//   • `corridorUnionAreaM2` — the bands' union area (the spine crosses every horizontal band, so a
//     plain sum double-counts every crossing; union counts each m² once).
//   • `trimCorridorBandsToServedCells` — trims each horizontal band's X-extent to the hull of the
//     spans it actually SERVES (its fronting cells' door spans) plus every span it needs for
//     CONNECTIVITY (vertical spine/connector crossings, the core-butt faces) — so a band never runs
//     past its last served door into dead corridor. Mirrors the §RESI-FILL-SIDEFACADE precedent
//     (mid-zone bands trimmed to the core X-span). Objective steers, gates decide: the trim runs
//     BEFORE `repairCoreCirculation`/`tagCoreReachability`, so §RESI-CORE-CIRCULATION and the
//     downstream §CORRIDOR-STAIR-CONTIGUITY gate still veto any layout the trim would starve.
// Kill-switch idiom (mirrors `__pryzmCorridorGrid`): `__pryzmCorridorEconomy === false` restores the
// old objective + untrimmed bands byte-identically.

/** §RESI-CORRIDOR-ECONOMY — corridor-per-m² charge in the candidate score. 1 ⇒ a corridor m² costs
 *  exactly a placed m² (corridor is pure loss of net plate), so the audit's "+2 m² placed for
 *  +40 m² corridor" candidate now loses by 38. */
const CORRIDOR_AREA_LAMBDA = 1;

/** §RESI-CORRIDOR-ECONOMY — UNION area (m²) of the corridor bands: each band contributes only the
 *  part not already covered by an earlier band (guillotine subtraction), so spine/band crossings
 *  count once. Pure + deterministic. */
function corridorUnionAreaM2(bands: readonly Rect[]): number {
    let area = 0;
    const prior: Rect[] = [];
    for (const b of bands) {
        const n = normRect(b);
        for (const r of subtractRectsFromRects([n], prior, 0.01)) area += rectArea(r);
        prior.push(n);
    }
    return round4(area);
}

/** §RESI-CORRIDOR-ECONOMY — trim each HORIZONTAL corridor band's X-extent to the hull of
 *  (a) the door spans of the cells it serves, (b) every VERTICAL band (spine / wing connector)
 *  interval crossing its Z, and (c) its core-butt face when it terminates on the core — so the
 *  band keeps every door + every network junction but sheds the dead run past its last served
 *  cell. Vertical bands are the network's trunks and are kept verbatim (the spine must span the
 *  depth to link the rows). A band with NO keep-interval at all is left verbatim (repair/tag own
 *  it — never silently deleted). Mutates `bands` in place; returns the m² trimmed. Deterministic. */
function trimCorridorBandsToServedCells(
    bands: Rect[],
    cells: readonly ApartmentCell[],
    core: Rect,
): number {
    const TOL = 0.05;   // adjacency tolerance — same as computeCoreDoorPlacement's boundary test
    const cx0 = Math.min(core.x0, core.x1), cx1 = Math.max(core.x0, core.x1);
    const cz0 = Math.min(core.z0, core.z1), cz1 = Math.max(core.z0, core.z1);
    let trimmedM2 = 0;
    for (let i = 0; i < bands.length; i++) {
        const b = bands[i]!;
        const bx0 = Math.min(b.x0, b.x1), bx1 = Math.max(b.x0, b.x1);
        const bz0 = Math.min(b.z0, b.z1), bz1 = Math.max(b.z0, b.z1);
        if ((bx1 - bx0) < (bz1 - bz0)) continue;   // vertical trunk — keep verbatim
        const keep: Array<readonly [number, number]> = [];
        // (a) Door spans of the cells this band serves (door edge coincident with a band face).
        for (const c of cells) {
            if (c.doorEdge !== 'z0' && c.doorEdge !== 'z1') continue;
            const r = c.rect;
            const edgeZ = c.doorEdge === 'z0' ? Math.min(r.z0, r.z1) : Math.max(r.z0, r.z1);
            if (Math.abs(edgeZ - bz1) >= TOL && Math.abs(edgeZ - bz0) >= TOL) continue;
            const lo = Math.max(bx0, Math.min(r.x0, r.x1)), hi = Math.min(bx1, Math.max(r.x0, r.x1));
            if (hi - lo >= DOOR_WIDTH_M - EPS) keep.push([lo, hi]);
        }
        // (b) Vertical bands (core spine, wing connectors) whose Z touches this band's Z.
        for (let j = 0; j < bands.length; j++) {
            if (j === i) continue;
            const v = bands[j]!;
            const vx0 = Math.min(v.x0, v.x1), vx1 = Math.max(v.x0, v.x1);
            const vz0 = Math.min(v.z0, v.z1), vz1 = Math.max(v.z0, v.z1);
            if ((vx1 - vx0) >= (vz1 - vz0)) continue;   // not vertical
            if (Math.min(vz1, bz1) - Math.max(vz0, bz0) < -TOL) continue;   // no Z contact
            const lo = Math.max(bx0, vx0), hi = Math.min(bx1, vx1);
            if (hi - lo > EPS) keep.push([lo, hi]);
        }
        // (c) The core-butt face: a band split by clipCorridorBandsToCore terminates ON the core
        // face (zero X-overlap), so keep that endpoint as a point interval — the band must stay
        // touching the core or it would fall out of the core component.
        const zTouchesCore = Math.min(bz1, cz1) - Math.max(bz0, cz0) > -TOL;
        if (zTouchesCore) {
            if (Math.abs(bx1 - cx0) < TOL) keep.push([bx1, bx1]);   // butts core's left face
            if (Math.abs(bx0 - cx1) < TOL) keep.push([bx0, bx0]);   // butts core's right face
        }
        if (keep.length === 0) continue;   // nothing measurable to keep → leave verbatim (repair/tag own it)
        const lo = Math.min(...keep.map((k) => k[0]));
        const hi = Math.max(...keep.map((k) => k[1]));
        if (lo > bx0 + EPS || hi < bx1 - EPS) {
            trimmedM2 += ((bx1 - bx0) - (hi - lo)) * (bz1 - bz0);
            bands[i] = normRect({ x0: round4(lo), z0: round4(bz0), x1: round4(hi), z1: round4(bz1) });
        }
    }
    return round4(trimmedM2);
}

// ── §RESI-CORE-DOOR (founder 2026-06-30, plan-view arrow: "the door should always be well calculated")
// ──────────────────────────────────────────────────────────────────────────────────────────────────
// A cell records WHICH edge fronts circulation (`doorEdge`) but the executor's geometric fallback
// centres the door on the WHOLE edge — which, for a small core-flank / inner-strip unit whose door
// edge only PARTIALLY abuts a corridor (the rest abuts the core RC wall or a perpendicular party wall),
// lands the door at a corner or even over the core. The founder's mis-placed-door arrow.
// `computeCoreDoorPlacement` returns the door's along-edge CLEAR SPAN as the OVERLAP between the cell's
// door edge and the CORE-CONNECTED corridor band(s) it fronts — so the door sits on the wall the unit
// genuinely SHARES with core-reaching circulation — then a sane offset CENTRED in that shared span,
// clamped clear of each corner by a door-width jamb margin. When the door edge shares < a door width
// with any core-connected band (a sealed/ambiguous cell) it returns null so the executor keeps its
// engine-circulation alignment / centred fallback. Pure + deterministic.
export interface CoreDoorPlacement {
    /** The along-edge offset (leading edge, from the edge's low corner, m) for the entry door. */
    readonly offset: number;
    /** The door leaf width used (m) — the clamped width that fits the shared span with jambs. */
    readonly width: number;
    /** The corridor-shared clear span on the door edge: [lo, hi] along the edge axis (m). */
    readonly clearLo: number;
    readonly clearHi: number;
}

/** §RESI-CORE-DOOR — compute the validated door offset on a cell's `doorEdge`, centred within the span
 *  the edge SHARES with a core-connected corridor band, clear of corners. `connected` is the core-
 *  connected band index set (from `coreConnectedBandSet`). Returns null when no core-connected band
 *  shares ≥ a door width with the door edge (caller falls back). `jambM` reserves solid wall at each
 *  end of the SHARED span (so the leaf never abuts a corner / the core / a perpendicular wall). */
export function computeCoreDoorPlacement(
    cell: ApartmentCell,
    corridorBands: readonly Rect[],
    connected: ReadonlySet<number>,
    doorWidth = DOOR_WIDTH_M,
    jambM = 0.2,
): CoreDoorPlacement | null {
    const r = cell.rect;
    const e = cell.doorEdge;
    const horizontal = e === 'z0' || e === 'z1';
    const edgeConst = e === 'x0' ? Math.min(r.x0, r.x1) : e === 'x1' ? Math.max(r.x0, r.x1)
        : e === 'z0' ? Math.min(r.z0, r.z1) : Math.max(r.z0, r.z1);
    const spanLo = horizontal ? Math.min(r.x0, r.x1) : Math.min(r.z0, r.z1);
    const spanHi = horizontal ? Math.max(r.x0, r.x1) : Math.max(r.z0, r.z1);
    // The WIDEST overlap between the door edge and a CORE-CONNECTED band coincident with that edge.
    let bestLo = NaN, bestHi = NaN, bestSpan = -Infinity;
    for (let i = 0; i < corridorBands.length; i++) {
        if (!connected.has(i)) continue;
        const c = corridorBands[i]!;
        const cx0 = Math.min(c.x0, c.x1), cx1 = Math.max(c.x0, c.x1);
        const cz0 = Math.min(c.z0, c.z1), cz1 = Math.max(c.z0, c.z1);
        if (horizontal) {
            const onBoundary = Math.abs(edgeConst - cz0) < 0.05 || Math.abs(edgeConst - cz1) < 0.05;
            if (!onBoundary) continue;
            const lo = Math.max(spanLo, cx0), hi = Math.min(spanHi, cx1);
            if (hi - lo > bestSpan) { bestSpan = hi - lo; bestLo = lo; bestHi = hi; }
        } else {
            const onBoundary = Math.abs(edgeConst - cx0) < 0.05 || Math.abs(edgeConst - cx1) < 0.05;
            if (!onBoundary) continue;
            const lo = Math.max(spanLo, cz0), hi = Math.min(spanHi, cz1);
            if (hi - lo > bestSpan) { bestSpan = hi - lo; bestLo = lo; bestHi = hi; }
        }
    }
    if (!(bestSpan >= DOOR_WIDTH_M - EPS)) return null;   // door edge doesn't share a door width with circulation
    // Clamp the leaf to fit the shared span with a jamb each side; centre it in the shared span.
    const w = Math.max(0.7, Math.min(doorWidth, bestSpan - 2 * jambM));
    if (!(w > 0)) return null;
    const sharedCentre = (bestLo + bestHi) / 2;
    // Offset is measured from the EDGE's low corner (spanLo), matching the executor's door host frame.
    let offset = (sharedCentre - spanLo) - w / 2;
    // Clamp clear of the corridor-shared span's ends (never over the core / a corner / a perpendicular wall).
    const minOff = (bestLo - spanLo) + jambM;
    const maxOff = (bestHi - spanLo) - jambM - w;
    offset = Math.min(Math.max(minOff, offset), Math.max(minOff, maxOff));
    return { offset: round4(offset), width: round4(w), clearLo: round4(bestLo), clearHi: round4(bestHi) };
}

/**
 * §RESI-CORE-CIRCULATION — REPAIR the corridor network so every band that FRONTS A PLACED CELL is
 * connected to the core. A band that is marooned (not in the core component) but serves at least one
 * cell is joined to the core component by a short SPUR corridor: a corridor-width column/row along
 * the core's spine axis (X-centre) that bridges the gap between the stub band and the nearest
 * core-connected band. Mutates `corridorBands` IN PLACE (appends spurs). Idempotent: a fully-
 * connected network gets no spurs (no-op → byte-identical). Deterministic.
 *
 * Strategy: most stubs are SHORT of the core spine by a small gap (the side-façade trim or a wing
 * connector). The spur is the rect spanning from the stub band toward the core's X-centre at the
 * stub's Z (a horizontal bridge) or from the stub's X toward the core's Z (a vertical bridge),
 * corridor-width, clamped to the plate. We add the MINIMAL bridge that makes the stub adjacent to a
 * core-connected band, re-running the BFS until no serving stub remains or no progress is possible.
 */
function repairCoreCirculation(
    corridorBands: Rect[],
    placements: readonly ApartmentCell[],
    core: Rect,
    halfCorr: number,
    plate: Rect,
): void {
    const coreCx = (Math.min(core.x0, core.x1) + Math.max(core.x0, core.x1)) / 2;
    const coreZc = (Math.min(core.z0, core.z1) + Math.max(core.z0, core.z1)) / 2;
    const spineX0 = round4(coreCx - halfCorr), spineX1 = round4(coreCx + halfCorr);
    // A spur corridor must NOT be laid over a placed apartment cell (that would seal the unit it
    // crosses). Reject any candidate leg that overlaps a cell's interior.
    const overlapsAnyCell = (leg: Rect): boolean => placements.some((p) => {
        const a = leg, b = p.rect;
        const ax0 = Math.min(a.x0, a.x1), ax1 = Math.max(a.x0, a.x1);
        const az0 = Math.min(a.z0, a.z1), az1 = Math.max(a.z0, a.z1);
        const bx0 = Math.min(b.x0, b.x1), bx1 = Math.max(b.x0, b.x1);
        const bz0 = Math.min(b.z0, b.z1), bz1 = Math.max(b.z0, b.z1);
        return Math.min(ax1, bx1) - Math.max(ax0, bx0) > 1e-3 &&
               Math.min(az1, bz1) - Math.max(az0, bz0) > 1e-3;
    });
    // Which bands SERVE a placed cell (front its door edge)? Only those must reach the core.
    const servesCell = (bandIdx: number): boolean => {
        const one = new Set<number>([bandIdx]);
        return placements.some((p) => cellDoorOnConnectedCorridor(p, corridorBands, one));
    };
    let guard = corridorBands.length + 8;
    while (guard-- > 0) {
        const connected = coreConnectedBandSet(corridorBands, core);
        // A serving band that is NOT core-connected is a stub we must bridge.
        let stubIdx = -1;
        for (let i = 0; i < corridorBands.length; i++) {
            if (!connected.has(i) && servesCell(i)) { stubIdx = i; break; }
        }
        if (stubIdx < 0) break;   // every serving band is core-connected → done
        const stub = corridorBands[stubIdx]!;
        const sx0 = Math.min(stub.x0, stub.x1), sx1 = Math.max(stub.x0, stub.x1);
        const sz0 = Math.min(stub.z0, stub.z1), sz1 = Math.max(stub.z0, stub.z1);
        // Bridge the stub to the core's X-centre spine with an L of corridor-width legs: a COLUMN at
        // the core spine X spanning the stub's Z toward the core's Z (butts the spine), and a ROW at
        // the stub's Z-centre reaching from the stub to the core spine (butts the stub). Both are
        // clamped to the plate. Together they reconnect the stub to the core component.
        const legZ0 = round4(Math.max(plate.z0, Math.min(sz0, coreZc)));
        const legZ1 = round4(Math.min(plate.z1, Math.max(sz1, coreZc)));
        const vLeg = normRect({ x0: spineX0, z0: legZ0, x1: spineX1, z1: legZ1 });
        const szc = round4((sz0 + sz1) / 2);
        const hz0 = round4(szc - halfCorr), hz1 = round4(szc + halfCorr);
        const hx0 = round4(Math.max(plate.x0, Math.min(sx1, spineX0, sx0)));
        const hx1 = round4(Math.min(plate.x1, Math.max(sx0, spineX1, sx1)));
        const hLeg = normRect({ x0: hx0, z0: hz0, x1: hx1, z1: hz1 });
        let added = false;
        for (const leg of [hLeg, vLeg]) {
            if (Math.abs(leg.x1 - leg.x0) < EPS || Math.abs(leg.z1 - leg.z0) < EPS) continue;
            // Never seal a unit: skip a leg that crosses a placed apartment.
            if (overlapsAnyCell(leg)) continue;
            const already = corridorBands.some((b) =>
                Math.abs(b.x0 - leg.x0) < 1e-3 && Math.abs(b.x1 - leg.x1) < 1e-3 &&
                Math.abs(b.z0 - leg.z0) < 1e-3 && Math.abs(b.z1 - leg.z1) < 1e-3);
            if (already) continue;
            corridorBands.push(leg);
            added = true;
        }
        // No leg could be safely added (degenerate / would seal a unit) → stop; the stub's cells stay
        // tagged coreReachable:false and the preview graph shows them honestly (orphaned). C50 soft-fail.
        if (!added) break;
    }
}

/** §RESI-CORE-CIRCULATION — TAG every cell `coreReachable` from the (possibly repaired) network, and
 *  return the count that are core-connected. A cell is core-reachable iff its door edge fronts a
 *  corridor band in the core component. Pure-ish (returns a new array; does not mutate input cells). */
function tagCoreReachability(
    placements: readonly ApartmentCell[], corridorBands: readonly Rect[], core: Rect,
): { tagged: ApartmentCell[]; coreReached: number } {
    const connected = coreConnectedBandSet(corridorBands, core);
    let coreReached = 0;
    const tagged = placements.map((cell) => {
        const reachable = cellDoorOnConnectedCorridor(cell, corridorBands, connected);
        if (reachable) coreReached++;
        return { ...cell, coreReachable: reachable };
    });
    return { tagged, coreReached };
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

    // ── §RESI-CORRIDOR-GRID (Phase 3 — DEFAULT-ON, founder 2026-06-27: "KEEP corner apartments… but
    // ALSO fill the long edges between the corners with adjacent apartments"). THE perimeter-band fill.
    // The baseline §RESI-FILL-PLATE outward-walk steps OUTWARD by a fixed `pitch` and CLAMPS the last
    // corridor a fixed `cap` in from each plate edge; on a MODERATELY-deep plate (depth between one and
    // two pitches, e.g. 40×30 / 60×30) the core corridor + both clamped edge corridors crowd within
    // ~5 m, so the apartment ROWS between them collapse below the engine-feasible depth and lay out
    // NOTHING — the plate keeps just its two deep outer rows whose corner-anchored packing reads as
    // "~4 corner units around an empty perimeter band" (the founder's screenshot).
    //
    // The HYBRID candidate KEEPS the founder's deep corner band — two outer corridors placed so their
    // outer rows are a full engine-feasible depth and reach the plate edge (corner units, dual-aspect)
    // — and FILLS the interior between them with evenly-spaced corridors whose rows tile the residual
    // depth. So a large plate reads as corners + a full ring/grid of edge-adjacent units, not 4 corners
    // around a dead band. The §RESI-EDGE-TYPE-VARIETY re-stamp then makes the deep corner cells the
    // larger typology and the shallower edge-fill cells the smaller ones.
    //
    // §P3 — DEFAULT-ON (was flag-gated `__pryzmCorridorGrid`). The hybrid is ALWAYS offered as a
    // candidate; the best-of-candidates selection (baseline is candidate 0) keeps it SAFE BY
    // CONSTRUCTION — the hybrid only wins where it genuinely places more apartments, so a plate the
    // baseline already fills well is unchanged and NO plate regresses. Because the hybrid's OUTER rows
    // ARE deep corner rows (same depth as the baseline's), a winning hybrid NEVER sacrifices the corner
    // units — it only ADDS interior edge-fill rows. The legacy `__pryzmCorridorGrid` flag is now an
    // OPT-OUT kill-switch: `=== false` forces the baseline-only set (byte-identical to pre-P3). A
    // SHALLOW plate (no room for a deep outer band + a feasible interior corridor) offers NO hybrid
    // candidate ⇒ the baseline single/central corridor path → small plates byte-identical.
    const corridorGridOptOut = (globalThis as { __pryzmCorridorGrid?: boolean }).__pryzmCorridorGrid === false;
    const corridorGrid = !corridorGridOptOut;   // DEFAULT-ON: the rich fill is what the user gets
    const plateDepth = round4(bb.z1 - bb.z0);

    /** §RESI-CORRIDOR-GRID — the HYBRID corner-preserving corridor line-set for a given number of
     *  INTERIOR corridors `nInterior`. Two OUTER corridors are placed `outerDepth + halfCorr` from each
     *  plate edge so their outer rows are a full `outerDepth`-deep band that reaches the edge (the
     *  founder's deep dual-aspect corner units). `nInterior` evenly-spaced corridors then tile the band
     *  between the two outer corridors. Returns `null` when the plate is too shallow to host the deep
     *  outer band plus at least the requested interior corridors (so a small plate falls back to the
     *  baseline, byte-identical). The vertical SPINE (core X-centre, full depth) ties every line to the
     *  core, so every cell stays corridor-reachable regardless of `nInterior`. */
    function hybridLinesFor(nInterior: number, outerDepth: number): number[] | null {
        const top = round4(bb.z0 + halfCorr + outerDepth);
        const bot = round4(bb.z1 - halfCorr - outerDepth);
        // The two outer corridors must sit inside the plate and leave a real interior band between them.
        if (top >= bot - EPS) return null;
        const lines: number[] = [top];
        if (nInterior > 0) {
            const span = (bot - top) / (nInterior + 1);
            // Each interior row (half the inter-corridor span minus the half-corridor) must clear the
            // ENGINE-FEASIBLE depth floor — NOT just MIN_ROW_DEPTH. An interior row shallower than the
            // engine can lay out a real multi-room apartment in (≈ 7.5 m) would soft-fail downstream and
            // the founder would see the same empty band. So we only add interior corridors when their
            // rows are genuinely buildable; an interior band too thin for a feasible row yields NO hybrid
            // candidate for that count and the plate falls back to its deep-corner baseline (correct for
            // a smaller plate — 4 deep corner units beat a band of un-buildable slivers).
            const interiorRowDepth = span / 2 - halfCorr;
            if (interiorRowDepth < ENGINE_MIN_ROW_DEPTH_M - EPS) return null;
            for (let i = 1; i <= nInterior; i++) lines.push(round4(top + i * span));
        }
        lines.push(bot);
        // De-dup + order (top===bot guarded above; a 1-interior degenerate is filtered by the set).
        const uniq = [...new Set(lines.map((z) => round4(z)))].sort((a, b) => a - b);
        return uniq.length >= 2 ? uniq : null;
    }

    /** §RESI-CORRIDOR-GRID — candidate HYBRID line-sets to PACK + compare against the baseline. The
     *  baseline under-fills when the plate depth is between one and two pitches (the deep-band valley);
     *  the hybrid keeps the deep corner band and fills the interior with `nInterior` corridors. We offer
     *  a small range of interior counts (the residual band can fill best with one more/fewer corridor as
     *  the core fragments rows) and let best-of-count pick. Only emitted when the plate is deep enough to
     *  host the deep outer band PLUS a feasible interior band (else the baseline already tiles it). */
    function gridCandidateLineSets(): number[][] {
        // The deep outer corner band — the engine-feasible deep row (≈ the 9 m proven cap) so a corner
        // cell lays out as a full multi-room dual-aspect unit AND reaches the plate edge.
        const outerDepth = MAX_APARTMENT_DEPTH_M;
        // The interior band between the two deep outer corridors, and how many interior corridors tile
        // it so each interior row stays ≤ the apartment-depth cap (the fewest that keep rows feasible,
        // ± a couple so best-of-count can choose).
        const interiorBand = plateDepth - 2 * (outerDepth + corridor.widthM);
        if (interiorBand <= MIN_ROW_DEPTH) return [];   // not deep enough for a distinct interior band
        // The span between the two deep outer corridors' CENTRELINES; nInterior corridors split it into
        // (nInterior+1) gaps, each = two apartment rows + the corridor. A gap fits two ENGINE-FEASIBLE
        // rows when it is ≥ 2·(7.5 m + halfCorr) wide, so the MAX feasible interior corridor count is
        // bounded by that. We pack EVERY feasible count 0…max and let best-of-count pick the richest
        // (a deeper plate can host more interior corridors at the feasible depth; a shallower one only a
        // few or none). All shallow-row candidates are filtered inside hybridLinesFor by the same floor.
        const outerSpan = (bb.z1 - halfCorr - outerDepth) - (bb.z0 + halfCorr + outerDepth);
        const gapForFeasibleRows = 2 * (ENGINE_MIN_ROW_DEPTH_M + halfCorr);
        const nMax = Math.max(0, Math.floor(outerSpan / gapForFeasibleRows) - 1);
        // Only offer hybrids that ADD ≥1 interior corridor (n ≥ 1). The n=0 hybrid is just the two deep
        // outer corridors, whose inner rows can meet in a sub-feasible sliver band — exactly the baseline
        // valley we are fixing; leaving n=0 out keeps that plate on the baseline (its proven deep-corner
        // result) and lets the hybrid win ONLY when it genuinely tiles the interior with feasible rows.
        const sets: number[][] = [];
        const seen = new Set<string>();
        for (let n = nMax; n >= 1; n--) {
            const lines = hybridLinesFor(n, outerDepth);
            if (!lines) continue;
            const k = lines.map((z) => z.toFixed(3)).join(',');
            if (seen.has(k)) continue;
            seen.add(k);
            sets.push(lines);
        }
        return sets;
    }

    // §RESI-CORE-SPINE constants (shared by every candidate's spine + run carving).
    const coreCx = (coreX0 + coreX1) / 2;
    const spineX0 = round4(coreCx - halfCorr);
    const spineX1 = round4(coreCx + halfCorr);

    // The CANDIDATE corridor-line layouts. The baseline §RESI-FILL-PLATE outward walk is always a
    // candidate. §P3 DEFAULT-ON: we ALSO offer the even grid (and a couple of neighbouring corridor
    // counts), then PACK each candidate and keep the one that places the most apartments (tie → higher
    // area). This guarantees the grid never REGRESSES a plate the baseline already fills well (it only
    // wins where it genuinely fills more — the deep-plate valley) while the founder's plate stops
    // coming out as 4 corner units around a dead perimeter band. The opt-out kill-switch
    // (`__pryzmCorridorGrid === false`) drops the grid candidates ⇒ baseline only ⇒ byte-identical.
    // Deterministic (fixed candidate set, deterministic pack, deterministic tiebreak).
    const baselineLines = [
        ...sideCorridors(bb.z0, -1),
        coreCz,
        ...sideCorridors(bb.z1, 1),
    ];
    const candidateLineSets: number[][] = [baselineLines];
    if (corridorGrid) {
        for (const lines of gridCandidateLineSets()) candidateLineSets.push(lines);
    }

    type Run = { x0: number; x1: number };

    /** Build the corridor bands + spine for one candidate `centreLinesIn`, then PACK the plate into
     *  apartment cells. Pure of any outer mutable state (its own `placements`/`cursor`), so a caller
     *  can pack several candidates and keep the best. Returns the placed cells AND the candidate's
     *  corridor bands (the downstream clip/absorb passes need the WINNER's bands).
     *
     *  §RESI-RECT-DECOMP (founder 2026-06-29: an L-shape plate fills only ~3 units / one wing) — the
     *  packer is now parameterised by the RECTANGLE `plate` it tiles (default `bb`, the full bbox).
     *  The L/T/U rect-decomposition path (`packDecomposed`) calls this once PER SUB-RECTANGLE so each
     *  wing of a concave plate gets its OWN corridor-grid pack, instead of the whole L being tiled as
     *  one bbox band that abandons the second wing. A sub-rect that DOES NOT contain the core packs
     *  its rows against its own edges and its corridors are wired to the core by the connector spine
     *  the caller adds; a sub-rect that contains the core packs around it exactly as the full bbox did.
     *  `spineCarve` (default true) controls whether the core/spine X-channel is carved from this
     *  plate's rows (true for the core-containing wing; for a wing WITHOUT the core the connector spine
     *  is the only channel, so that wing carves only its own connector column — passed via `connectorX`).
     *  With `plate === bb` and no overrides this is byte-identical to the pre-decomp packer. */
    function packPlate(
        centreLinesIn: readonly number[],
        plate: Rect = bb,
        opts: { spineCarve?: boolean; connectorX?: { x0: number; x1: number } } = {},
    ): { placements: ApartmentCell[]; corridorBands: Rect[] } {
        const spineCarve = opts.spineCarve ?? true;
        const connectorX = opts.connectorX;
        const centreLines = [...centreLinesIn];
        // Sort lines top→bottom for deterministic row tiling + neighbour math.
        centreLines.sort((a, b) => a - b);

        const corridorBands: Rect[] = centreLines.map((cz) =>
            normRect({ x0: plate.x0, z0: round4(cz - halfCorr), x1: plate.x1, z1: round4(cz + halfCorr) }),
        );

        // §RESI-CORE-SPINE (founder "the corridors are isolated from the core", 2026-06-23) — the
        // horizontal corridor bands above never link to each other or to the core, so a resident
        // leaving the stair/lift cannot reach the corridors that serve the apartments. Add a NARROW
        // VERTICAL corridor SPINE at the core's X-centre, spanning the full plate depth, that crosses
        // (and so CONNECTS) every horizontal band + the core into ONE circulation network. The spine is
        // corridor-width and always sits INSIDE the core's X-span, so the channel is continuous (core-
        // width where the core sits, spine-width elsewhere). It is emitted as the column MINUS the core
        // rect → up to two segments (above + below the core); each crosses every horizontal band's Z.
        // §RESI-RECT-DECOMP — only the core-containing plate emits the core spine (spineCarve); a wing
        // without the core is tied to circulation by the connector the caller adds instead.
        if (spineCarve && spineX0 >= plate.x0 - EPS && spineX1 <= plate.x1 + EPS) {
            const sTop = Math.max(plate.z0, bb.z0), sBot = Math.min(plate.z1, bb.z1);
            if (coreN.z0 - sTop > EPS) corridorBands.push(normRect({ x0: spineX0, z0: round4(Math.max(sTop, plate.z0)), x1: spineX1, z1: coreN.z0 }));
            if (sBot - coreN.z1 > EPS) corridorBands.push(normRect({ x0: spineX0, z0: coreN.z1, x1: spineX1, z1: round4(Math.min(sBot, plate.z1)) }));
        }

        const placements: ApartmentCell[] = [];
        let cursor = 0;
    // The X-runs available on a row. A channel is carved from EVERY row at the core's X so the
    // vertical SPINE corridor runs uninterrupted and links every horizontal band to the core: the
    // FULL core width on rows that straddle the core in Z, else the NARROW spine strip.
    // §RESI-RECT-DECOMP — the carve is clamped to THIS plate's X-extent; a wing that does not contain
    // the core's X carves only its `connectorX` column (the corridor that reaches the core), so it
    // never reserves a phantom core strip outside the wing.
    function runsFor(z0: number, z1: number): Run[] {
        const overlapsCoreZ = !(coreN.z1 <= z0 + EPS || coreN.z0 >= z1 - EPS);
        let cutX0: number, cutX1: number;
        if (spineCarve && spineX0 >= plate.x0 - EPS && spineX1 <= plate.x1 + EPS) {
            cutX0 = overlapsCoreZ ? coreX0 : spineX0;
            cutX1 = overlapsCoreZ ? coreX1 : spineX1;
        } else if (connectorX) {
            cutX0 = connectorX.x0;
            cutX1 = connectorX.x1;
        } else {
            // No spine, no connector to carve — the whole plate is one run.
            return [{ x0: plate.x0, x1: plate.x1 }];
        }
        const runs: Run[] = [];
        if (cutX0 - plate.x0 > EPS) runs.push({ x0: plate.x0, x1: cutX0 });
        if (plate.x1 - cutX1 > EPS) runs.push({ x0: cutX1, x1: plate.x1 });
        return runs.length > 0 ? runs : [{ x0: plate.x0, x1: plate.x1 }];
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
            const touchesRight = Math.abs(run.x1 - plate.x1) <= 1e-3;
            const touchesLeft = Math.abs(run.x0 - plate.x0) <= 1e-3;
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
                placements.push({ typology: demand.typology, rect, areaM2: round4(rectArea(rect)), doorEdge, polygon: rectPolygon(rect) });
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
        // §RESI-RECT-DECOMP — the inner strips beside the CORE only exist on the core-containing plate
        // (`spineCarve`); a decomposed wing has no core, so its rows are tiled fully by `packRow`.
        if (!spineCarve) return;
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
            placements.push({ typology: ref.typology, rect, areaM2: round4(rectArea(rect)), doorEdge: strip.door, polygon: rectPolygon(rect) });
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
            : plate.z0;
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
            : plate.z1;
        const backCap = nextCz === undefined ? MAX_OUTER_BAND_DEPTH_M : MAX_APARTMENT_DEPTH_M;
        const backDepth = Math.min(backCap, backOuterLimit - myBot);
        if (backDepth > MIN_ROW_DEPTH - EPS) {
            const backZ1 = round4(myBot + backDepth);
            packRow(myBot, backZ1, 'z0');
            packInnerStrips(myBot, backZ1, 'z0');
        }
        }

        // §RESI-FILL-SIDEFACADE — fill the LEFT and RIGHT plate-edge MID-EDGE BANDS (founder 2026-06-30:
        // "apartments fit the corners always — great — BUT they don't need to be square; rectangular is
        // fine, and there's still a lot of space around to fit MORE"). The corridor grid tiles the TOP and
        // BOTTOM façade bands (corners + their mid-edge units), but the LEFT (x = plate.x0) and RIGHT
        // (x = plate.x1) façades in the CENTRAL Z-zone — between the top-corner band and the bottom-corner
        // band — sit empty: the inter-corridor rows there are sub-feasible slivers and absorbResidual's
        // pockets are interior (no façade → the engine, which needs a window edge, produces no layout).
        //
        // We pack those two SIDE-FAÇADE bands directly: a unit hugs the plate's left/right edge (so it has
        // a real exterior wall + windows) and hangs its DOOR on the nearest HORIZONTAL corridor (so it is
        // core-reachable via the corridor + spine). Each band hosts up to two units — one fronting the
        // corridor ABOVE the central zone, one fronting the corridor BELOW — each a RECTANGULAR (elongated)
        // apartment: deep toward the building interior (capped at the outer-band depth) and tall enough in
        // Z to reach its corridor. Width-sliced like a row so a tall band becomes several on-spec units.
        // Only on the core-containing plate (spineCarve); a decomposed wing has no centred core spine.
        if (spineCarve && spineX0 >= plate.x0 - EPS && spineX1 <= plate.x1 + EPS) {
            // The corridor nearest ABOVE the core's top and the one nearest BELOW its bottom bound the
            // central side-façade zone in Z. (centreLines is sorted top→bottom.)
            let zAbove = plate.z0, zBelow = plate.z1;
            let corridorAtTop = false, corridorAtBot = false;
            for (const cz of centreLines) {
                const cTop = round4(cz - halfCorr), cBot = round4(cz + halfCorr);
                if (cBot <= coreN.z0 + EPS && cBot > zAbove) { zAbove = cBot; corridorAtTop = true; }
                if (cTop >= coreN.z1 - EPS && cTop < zBelow) { zBelow = cTop; corridorAtBot = true; }
            }
            const zoneZ0 = round4(zAbove), zoneZ1 = round4(zBelow);
            const zoneDepthZ = round4(zoneZ1 - zoneZ0);   // the central zone's Z-extent (corridor→corridor)
            // The side band's INWARD depth (toward the building interior, in X) is capped at the outer-band
            // depth; it must not reach the core (so a left band stops at coreX0, a right band at coreX1).
            const leftInward = round4(Math.min(MAX_OUTER_BAND_DEPTH_M, coreX0 - plate.x0));
            const rightInward = round4(Math.min(MAX_OUTER_BAND_DEPTH_M, plate.x1 - coreX1));
            const sides: Array<{ x0: number; x1: number }> = [];
            if (leftInward > MIN_ROW_DEPTH) sides.push({ x0: plate.x0, x1: round4(plate.x0 + leftInward) });
            if (rightInward > MIN_ROW_DEPTH) sides.push({ x0: round4(plate.x1 - rightInward), x1: plate.x1 });

            // §RESI-FILL-SIDEFACADE — the pass ONLY fires when the side bands are GENUINELY EMPTY (the
            // under-filled near-rectangular plate). On a DEEP plate the corridor grid already tiles the
            // central rows with feasible cells fronting the interior corridors, so touching them here would
            // double-tile / orphan their corridors. Gate the whole pass: if any existing placement already
            // occupies either side band in the central zone, skip it entirely (no-op, no regression).
            const rOverlapsRect = (a: Rect, b: Rect): boolean =>
                Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-3 &&
                Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-3;
            const sideZoneRects: Rect[] = sides.map((s) => normRect({ x0: s.x0, z0: zoneZ0, x1: s.x1, z1: zoneZ1 }));
            const sideZoneEmpty = sides.length > 0 && zoneDepthZ >= COREFLANK_MIN_DEPTH_M - EPS &&
                !placements.some((p) => sideZoneRects.some((zr) => rOverlapsRect(p.rect, zr)));
            // A horizontal corridor running ENTIRELY INSIDE the central zone (strictly between zoneZ0 and
            // zoneZ1 — e.g. the core's own corridor) fragments the EMPTY side bands into sub-feasible
            // slivers AND would be overlapped by a side unit spanning the zone. The side units front the
            // zone's TOP/BOTTOM corridors and reach the core via the VERTICAL SPINE, so a mid-zone corridor
            // is redundant in the side X-range: TRIM its band to the core's X-span (where the spine needs
            // it). Only done when the side zone is empty (so no already-placed cell loses its corridor).
            if (sideZoneEmpty) {
                for (let bi = 0; bi < corridorBands.length; bi++) {
                    const cb = corridorBands[bi]!;
                    const horizontal = Math.abs(cb.x1 - cb.x0) > Math.abs(cb.z1 - cb.z0);
                    const insideZone = cb.z0 > zoneZ0 + EPS && cb.z1 < zoneZ1 - EPS;
                    const spansSides = cb.x0 <= plate.x0 + EPS && cb.x1 >= plate.x1 - EPS;
                    if (horizontal && insideZone && spansSides) {
                        corridorBands[bi] = normRect({ x0: coreX0, z0: cb.z0, x1: coreX1, z1: cb.z1 });
                    }
                }
            }

            // The unit's Z-extent fronting a corridor: it must reach the corridor (door) and be deep enough
            // in Z (≥ engine floor). When the zone is tall enough for two non-overlapping units, place one
            // against the TOP corridor (door z0) and one against the BOTTOM corridor (door z1); else a
            // single unit fronting whichever corridor bounds the zone. Each unit's Z-extent is capped at
            // the apartment-depth cap so a very tall zone leaves an interior gap rather than an over-deep
            // unit (the gap is a deeper sliver absorbResidual may later pick up — never a correctness bug).
            type SubZ = { z0: number; z1: number; door: 'z0' | 'z1' };
            const subZs: SubZ[] = [];
            const canTwo = corridorAtTop && corridorAtBot &&
                zoneDepthZ >= 2 * COREFLANK_MIN_DEPTH_M - EPS;
            if (canTwo) {
                const topZ = round4(Math.min(MAX_APARTMENT_DEPTH_M, zoneDepthZ / 2));
                const botZ = round4(Math.min(MAX_APARTMENT_DEPTH_M, zoneDepthZ / 2));
                subZs.push({ z0: zoneZ0, z1: round4(zoneZ0 + topZ), door: 'z0' });
                subZs.push({ z0: round4(zoneZ1 - botZ), z1: zoneZ1, door: 'z1' });
            } else if (zoneDepthZ >= COREFLANK_MIN_DEPTH_M - EPS) {
                const h = round4(Math.min(MAX_OUTER_BAND_DEPTH_M, zoneDepthZ));
                if (corridorAtTop) subZs.push({ z0: zoneZ0, z1: round4(zoneZ0 + h), door: 'z0' });
                else if (corridorAtBot) subZs.push({ z0: round4(zoneZ1 - h), z1: zoneZ1, door: 'z1' });
            }

            for (const side of (sideZoneEmpty ? sides : [])) {
                const inwardDepth = round4(side.x1 - side.x0);    // the unit's depth toward the interior (X)
                for (const sub of subZs) {
                    if (cursor >= apartments.length) break;
                    const ref = apartments[cursor];
                    if (!ref) break;
                    const bandZ = round4(sub.z1 - sub.z0);        // the unit's Z-extent (façade length, fronts corridor on `sub.door`)
                    if (bandZ < COREFLANK_MIN_DEPTH_M - EPS) continue;
                    // ONE unit per (side × corridor-front): the cell hugs the plate-edge X-side (façade +
                    // windows) and reaches its corridor on the sub.door Z-edge. We DON'T slice the Z-extent
                    // (only the cell touching the corridor would have a door — an interior Z-slice would be
                    // sealed); the inward X-depth is the unit's other dimension. The cell is engine-feasible
                    // when both extents clear the depth floor, area ≥ the demand min, and aspect ≤ the cap.
                    const area = round4(inwardDepth * bandZ);
                    const aspect = Math.max(inwardDepth, bandZ) / Math.max(EPS, Math.min(inwardDepth, bandZ));
                    if (inwardDepth < COREFLANK_MIN_DEPTH_M - EPS) continue;
                    if (area < ref.minAreaM2 - EPS) continue;
                    if (aspect > MAX_RECT_ASPECT + EPS) continue;
                    const rect = normRect({ x0: round4(side.x0), z0: round4(sub.z0), x1: round4(side.x1), z1: round4(sub.z1) });
                    // §RESI-FILL-SIDEFACADE — defensive: never overlap the core, an existing cell, or a
                    // corridor band (the zone-empty gate above already ensures this; this is belt-and-braces
                    // for the two-unit sub case where the first sub could meet the second).
                    if (rOverlapsRect(rect, coreN)) continue;
                    if (placements.some((p) => rOverlapsRect(rect, p.rect))) continue;
                    if (corridorBands.some((cb) => rOverlapsRect(rect, cb))) continue;
                    // §RESI-FILL-SIDEFACADE — door faces the horizontal corridor (sub.door) → core-reachable;
                    // façade (windows) is the plate-edge X-side (set downstream from the cell's plate-edge
                    // contact). Both present → habitable + reachable.
                    placements.push({ typology: ref.typology, rect, areaM2: area, doorEdge: sub.door, polygon: rectPolygon(rect) });
                    cursor++;
                }
            }
        }

        return { placements, corridorBands };
    }

    // ── §RESI-RECT-DECOMP (founder 2026-06-29: a ~1165 m² L-SHAPE plate previewed only 3 units/floor,
    // both wings + the mid-edge bands wasted) — THE non-rectangular plate-fill. The baseline +
    // corridor-grid candidates tile the bbox RECTANGLE and rely on the downstream clip to drop the
    // out-of-boundary cells; on a concave L/T/U that abandons every wing whose depth does not align
    // with the single bbox-centred corridor grid, so only the band straddling the core fills.
    //
    // This candidate instead DECOMPOSES the REAL drawn boundary (`clipPolygon`) into axis-aligned
    // rectangles (the proven rectilinear slab-sweep `decomposeToRects`), SUBTRACTS the core
    // (`subtractRectsFromRects`), and packs EACH sub-rectangle with its OWN corridor-grid pack via the
    // parameterised `packPlate(plate=subRect)`. Circulation is preserved to the core by construction:
    // a sub-rect that CONTAINS the core packs around it with the normal core spine; a sub-rect WITHOUT
    // the core is wired to circulation by a CONNECTOR corridor column (`connectorX`) aligned with the
    // core/neighbour spine, carved from its rows so its doors front that connector. The connector runs
    // the wing's full depth and butts the core-containing region, so every wing's corridor network is
    // one connected graph reaching the stair/lift. Deterministic; only contributes a candidate when the
    // plate is genuinely concave (a rectangle decomposes to ONE rect ⇒ identical to packPlate(bb) ⇒
    // best-of selection keeps the baseline, no regression).
    function packDecomposed(): { placements: ApartmentCell[]; corridorBands: Rect[] } | null {
        if (!clipPolygon || clipPolygon.length < 4) return null;
        // Decompose the REAL boundary into rects, then carve the core out of every sub-rect so no
        // apartment tiles over the stair/lift. A clean rectangle yields ONE rect (no benefit) → skip.
        const rawRects = decomposeToRects(clipPolygon, MIN_ROW_DEPTH);
        if (rawRects.length < 2) return null;   // not concave enough to beat the bbox pack
        const subRects = subtractRectsFromRects(rawRects, [coreN], MIN_ROW_DEPTH)
            // Keep only sub-rects big enough to host at least one feasible apartment band.
            .filter((r) => rectWidth(r) > MIN_ROW_DEPTH && rectDepth(r) > MIN_ROW_DEPTH);
        if (subRects.length === 0) return null;

        const allPlacements: ApartmentCell[] = [];
        const allBands: Rect[] = [];
        // Pack sub-rects in a deterministic order (top-left first) so cells/cursor are stable.
        const ordered = [...subRects].sort((a, b) => (a.z0 - b.z0) || (a.x0 - b.x0));
        for (const sr of ordered) {
            // Does this sub-rect straddle the core in X (so the core spine sits inside it)?
            const coreInX = coreN.x0 >= sr.x0 - EPS && coreN.x1 <= sr.x1 + EPS;
            const coreInZ = !(coreN.z1 <= sr.z0 + EPS || coreN.z0 >= sr.z1 - EPS);
            const hasCore = coreInX && coreInZ;
            // Corridor centrelines for THIS sub-rect: walk the same parallel-double-loaded grid within
            // the sub-rect's depth. The first line is centred on the core's Z when the core is in this
            // wing, else on the sub-rect's own Z-centre (so its rows tile symmetrically).
            const srCz = hasCore ? coreCz : round4((sr.z0 + sr.z1) / 2);
            const lines: number[] = [srCz];
            const pitch2 = 2 * MAX_APARTMENT_DEPTH_M + corridor.widthM;
            for (let k = 1; k <= 1000; k++) {
                const up = round4(srCz - k * pitch2), dn = round4(srCz + k * pitch2);
                let added = false;
                if (up - halfCorr > sr.z0 + MIN_ROW_DEPTH) { lines.push(up); added = true; }
                if (dn + halfCorr < sr.z1 - MIN_ROW_DEPTH) { lines.push(dn); added = true; }
                if (!added) break;
            }
            // A wing WITHOUT the core needs a connector column to reach the core. Align it with the
            // core's X when the core's X overlaps the wing's X-span (then the wing's connector lines up
            // with the core spine), else clamp it to the wing edge NEAREST the core in X (so the
            // connector reaches toward the core-containing region). The connector is corridor-width.
            let connectorX: { x0: number; x1: number } | undefined;
            if (!hasCore) {
                let cx = (spineX0 + spineX1) / 2;
                if (cx < sr.x0 + halfCorr) cx = sr.x0 + halfCorr;
                if (cx > sr.x1 - halfCorr) cx = sr.x1 - halfCorr;
                connectorX = { x0: round4(cx - halfCorr), x1: round4(cx + halfCorr) };
                // Emit the connector band spanning the wing's depth so the wing's corridors link to it.
                allBands.push(normRect({ x0: connectorX.x0, z0: sr.z0, x1: connectorX.x1, z1: sr.z1 }));
            }
            const packed = packPlate(lines, sr, { spineCarve: hasCore, connectorX });
            allPlacements.push(...packed.placements);
            allBands.push(...packed.corridorBands);
        }
        // §RESI-RECT-DECOMP CIRCULATION-TIE — add a transverse band along the core's Z-centre across the
        // FULL bbox so the per-wing connector columns + the core spine join into ONE network (a resident
        // leaving the stair reaches every wing). Clipped to the boundary downstream like every band.
        allBands.push(normRect({ x0: bb.x0, z0: round4(coreCz - halfCorr), x1: bb.x1, z1: round4(coreCz + halfCorr) }));
        return allPlacements.length > 0 ? { placements: allPlacements, corridorBands: allBands } : null;
    }

    // §RESI-CORRIDOR-GRID — pack every candidate and keep the BEST. The score is the count of
    // ENGINE-FEASIBLE cells FIRST (a cell whose row is ≥ the engine-feasible depth — a real, buildable
    // apartment), then total count, then placed area. Scoring feasible cells first is what makes the
    // hybrid win where it should: the baseline's deep-valley plates pack a band of SUB-FEASIBLE sliver
    // rows that inflate the raw count but soft-fail downstream (the founder still sees an empty band),
    // so a hybrid that tiles the interior with FEWER but BUILDABLE rows must beat them. Where the
    // baseline already fills with feasible rows it stays the winner (candidate 0, ties keep it) — no
    // regression. Flag opt-out ⇒ exactly one candidate (the baseline) ⇒ byte-identical. Deterministic.
    const feasibleCount = (cells: readonly ApartmentCell[]): number =>
        cells.filter((c) => Math.abs(c.rect.z1 - c.rect.z0) >= ENGINE_MIN_ROW_DEPTH_M - EPS).length;
    // §RESI-CORRIDOR-ECONOMY (audit §2.4 / P1-2, C53) — the area term now CHARGES corridor: the
    // third tiebreak is `placedArea − λ·corridorUnionArea` instead of raw placed area, so among
    // candidates tied on feasible/total count the one that buys its area with LESS circulation wins
    // (the audit's "+2 m² placed for +40 m² corridor" candidate now loses by 38). feasibleCount and
    // cellCount precedence are RETAINED — the economy term never trades an apartment away for
    // corridor savings. Kill-switch `__pryzmCorridorEconomy === false` restores the raw-area
    // objective byte-identically (same idiom as `__pryzmCorridorGrid`).
    const corridorEconomy = (globalThis as { __pryzmCorridorEconomy?: boolean }).__pryzmCorridorEconomy !== false;
    const candScore = (cand: { placements: ApartmentCell[]; corridorBands: Rect[] }): number => {
        const placedArea = cand.placements.reduce((s, c) => s + c.areaM2, 0);
        return corridorEconomy
            ? placedArea - CORRIDOR_AREA_LAMBDA * corridorUnionAreaM2(cand.corridorBands)
            : placedArea;
    };
    let best = packPlate(candidateLineSets[0]!);
    let bestScore = candScore(best);
    let bestFeasible = feasibleCount(best.placements);
    const considerCandidate = (cand: { placements: ApartmentCell[]; corridorBands: Rect[] } | null): void => {
        if (!cand) return;
        const candAreaScore = candScore(cand);
        const candFeasible = feasibleCount(cand.placements);
        if (candFeasible > bestFeasible ||
            (candFeasible === bestFeasible && cand.placements.length > best.placements.length) ||
            (candFeasible === bestFeasible && cand.placements.length === best.placements.length && candAreaScore > bestScore + EPS)) {
            best = cand;
            bestFeasible = candFeasible;
            bestScore = candAreaScore;
        }
    };
    for (let ci = 1; ci < candidateLineSets.length; ci++) {
        considerCandidate(packPlate(candidateLineSets[ci]!));
    }
    // §RESI-RECT-DECOMP — the wing-by-wing rect-decomposition candidate (concave L/T/U plates only). It
    // wins on a concave plate because it fills EVERY wing's corridor grid (the bbox candidates abandon
    // the wing that doesn't align with the single bbox-centred grid); on a rectangle it produces ONE
    // sub-rect ⇒ packDecomposed returns null ⇒ the baseline keeps winning (byte-identical, no regress).
    if (corridorGrid) considerCandidate(packDecomposed());
    const placements = best.placements;
    // §RESI-CORRIDOR-TO-CORE — clip the winning candidate's corridor bands so no band runs THROUGH the
    // core: every band crossing the core is split at the core faces, so each corridor wall butts the
    // core boundary exactly (no overshoot into / gap before the core). Done on the winner only, before
    // the repair/tag passes (which read the band geometry). Idempotent on a plate whose bands never
    // cross the core (byte-identical there). The split keeps both segments touching the core, so the
    // §RESI-CORE-CIRCULATION graph is preserved (the vertical spine bridges the two sides across the core).
    const corridorBands = clipCorridorBandsToCore(best.corridorBands, coreN);
    // The residual-absorption pass (flag ON) appends EXTRA cells from the demand tail; it consumes
    // the demand from where the winning candidate's packing stopped. Every candidate packs the same
    // demand list in order from cursor 0, so the count it placed is exactly the demand it consumed.
    let cursor = placements.length;

    // §RESI-CLIP-BOUNDARY / §NONRECT-CELLS-P1 — handle cells that poke past the real (possibly non-
    // rectangular) plate polygon. DEFAULT (flag OFF): DROP any cell whose CENTRE is outside the drawn
    // boundary (the proven byte-identical behaviour). FLAG ON (`globalThis.__pryzmNonRectCells`):
    // RESHAPE-NOT-DROP — clip the cell rect to the drawn boundary into a rectilinear cell that stays
    // inside it, ABSORBING the residual the rect packer wastes (the deep-plate / L under-fill). The
    // corridor-first invariant CF is preserved: a reshaped cell is kept ONLY when one of its polygon
    // edges still FRONTS a corridor band by ≥ a door width — a cell that can't front the corridor is
    // SOFT-FAILED (dropped, C50 §1.7), NEVER shipped sealed. A rect cell wholly inside keeps its rect
    // polygon (identity). On a rectangular plate the flag is moot (no cell is out-of-shape) → identical.
    let clippedOut = 0, reshaped = 0;
    // §RESI-NONRECT-DEFAULT (founder 2026-06-27: "way more professional and adaptable — NOT just
    // rectangular apartments; the apartments can fill the COMPLETE floor plate"). The non-rect path
    // (RESHAPE-NOT-DROP + RESIDUAL ABSORPTION) is now DEFAULT-ON: a straddling cell on an L/trapezoid
    // boundary becomes the in-boundary rectilinear (multi-shape) cell instead of being dropped, and
    // feasible residual pockets the rect rows left empty are absorbed as extra reshaped cells — every
    // one engine-feasibility-gated and corridor-fronting (CF). On a RECTANGULAR plate no cell is
    // out-of-shape and the absorbed residual (if any) is sub-feasible, so the path is byte-identical
    // (pinned by the flag-OFF==ON-no-clip tests). The legacy `__pryzmNonRectCells` flag is now an
    // OPT-OUT kill-switch: `=== false` forces the proven drop-not-reshape path. The polygon-native
    // single-apartment engine (subdividePolygon/tileConcave) lays out the >4-vert cells (SPEC §5).
    const nonRectCells = (globalThis as { __pryzmNonRectCells?: boolean }).__pryzmNonRectCells !== false;
    if (clipPolygon && clipPolygon.length >= 3) {
        for (let i = placements.length - 1; i >= 0; i--) {
            const cell = placements[i]!;
            const r = cell.rect;
            const centreInside = pointInPolygon((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, clipPolygon);
            // Fully (or centre-) inside ⇒ keep as-is (rect polygon already set at push time).
            if (centreInside && pointInPolygon(r.x0 + EPS, r.z0 + EPS, clipPolygon)
                && pointInPolygon(r.x1 - EPS, r.z1 - EPS, clipPolygon)
                && pointInPolygon(r.x0 + EPS, r.z1 - EPS, clipPolygon)
                && pointInPolygon(r.x1 - EPS, r.z0 + EPS, clipPolygon)) {
                continue;   // wholly inside → unchanged
            }
            if (!nonRectCells) {
                // DEFAULT — drop a cell whose CENTRE is outside (byte-identical to the prior behaviour).
                if (!centreInside) { placements.splice(i, 1); clippedOut++; }
                continue;
            }
            // FLAG ON — RESHAPE: clip the cell to the boundary. Keep only when it stays a real,
            // corridor-fronting cell; else soft-fail (drop), never sealed.
            const clipped = clipRectToPolygon(r, clipPolygon);
            const minAreaForKeep = 18;   // a reshaped fragment below ~a studio floor is not a real unit
            if (!clipped || polygonArea(clipped) < minAreaForKeep
                || !polygonFrontsCorridor(clipped, corridorBands, DOOR_WIDTH_M)) {
                placements.splice(i, 1); clippedOut++;
                continue;
            }
            const bb2 = bbox(clipped);
            placements[i] = {
                ...cell,
                rect: normRect(bb2),                       // the reshaped cell's bbox (rect-only gates read this)
                areaM2: round4(polygonArea(clipped)),
                polygon: clipped.map(p => ({ x: round4(p.x), z: round4(p.z) })),
            };
            reshaped++;
        }
    }

    // §NONRECT-CELLS-P1 — RESIDUAL ABSORPTION (flag ON). The rect packer caps each row at the
    // apartment-depth limit and leaves the DEEP residual of a deep band UN-TILED (the founder's
    // deep-plate under-fill). With the flag on we now ABSORB that residual: per corridor band, the
    // un-tiled strip BEYOND the capped row (between the row's outer edge and the next corridor / the
    // plate edge / the boundary) is minted as ADDITIONAL reshaped cells that FRONT THE SAME corridor
    // through the already-placed row in front of them — kept only when ≥ a feasible size + reachable.
    // Bounded to the in-boundary area (clipped to `clipPolygon` when present). Deterministic. This
    // is the mechanism that lifts a deep 37×29 plate's fill materially without shallow-row regressions
    // (the absorbed cells are DEEP, not shallow — they take the leftover depth as ONE more unit row).
    if (nonRectCells) {
        absorbResidual(placements, corridorBands, bb, coreN, clipPolygon, apartments, () => cursor < apartments.length ? apartments[cursor++] : undefined);
    }

    // §RESI-EDGE-TYPE-VARIETY — re-stamp each placed cell's typology from its REAL AREA, choosing among
    // the typologies the demand actually requested (the user's enabled mix). With the grid filling the
    // perimeter the cells are no longer uniform: a deep corner cell is genuinely larger than a shallow
    // edge-fill cell, so the corners come out as the larger typology (more bedrooms) and the edge-fill
    // units as smaller ones — exactly the founder's "corners T3/T4, edge-fill T1/T2" intent. This is
    // geometry-honest: the bedroom count follows the cell that can hold it, every cell stays within the
    // brief's enabled mix, and the orchestrator pairs each cell to a program BY THIS typology (not by
    // demand index). When only ONE typology is enabled this is a no-op (every cell keeps that type) →
    // a single-typology brief is byte-identical. Deterministic.
    const enabledTypologies = Array.from(new Set(apartments.map((a) => a.typology)));
    if (enabledTypologies.length > 1) {
        for (let i = 0; i < placements.length; i++) {
            const c = placements[i]!;
            placements[i] = { ...c, typology: typologyForArea(c.areaM2, enabledTypologies) };
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

    // §RESI-CORRIDOR-ECONOMY (C.2) — trim each horizontal band to the hull of its served door
    // spans + its network junctions (spine crossings, core-butt faces), shedding the dead corridor
    // run past the last served cell. Runs AFTER the cells are final (clip/reshape/absorb done) and
    // BEFORE the repair/tag passes, so §RESI-CORE-CIRCULATION re-verifies the trimmed network and
    // the downstream contiguity gates still veto — objective steers, gates decide. Kill-switch
    // `__pryzmCorridorEconomy === false` skips the trim (byte-identical bands).
    const corridorTrimmedM2 = corridorEconomy
        ? trimCorridorBandsToServedCells(corridorBands, placements, coreN)
        : 0;

    // ── §RESI-CORE-CIRCULATION — make circulation strictly CORE-CENTRIC (founder 2026-06-30: "always
    // needs to be at the CORE"). Fronting SOME corridor is not enough — a band could be a marooned
    // stub. (1) REPAIR: bridge any serving-but-disconnected band to the core component with a short
    // spur corridor (no-op on a fully-connected network → byte-identical). (2) TAG: mark each cell
    // `coreReachable` iff its door fronts a CORE-CONNECTED band, and count them. The winning candidate's
    // full-width horizontal corridors already all cross the core spine, so on a clean rectangular plate
    // every band is core-connected and the repair adds nothing; the repair earns its keep on the
    // §RESI-FILL-SIDEFACADE-trimmed and §RESI-RECT-DECOMP per-wing-connector plates.
    repairCoreCirculation(corridorBands, placements, coreN, halfCorr, bb);
    const { tagged, coreReached } = tagCoreReachability(placements, corridorBands, coreN);
    // §RESI-CORE-DOOR — stamp each cell's validated entry-door offset: centred within the span its
    // `doorEdge` SHARES with a core-connected corridor band, clear of corners. The executor uses this
    // as its geometric door offset (replacing the centre-of-the-WHOLE-edge fallback that mis-placed a
    // small core-flank unit's door). Absent on a cell whose door edge doesn't share a door width with
    // a core-connected band (the executor keeps its engine-circulation / centred fallback there).
    const connectedForDoors = coreConnectedBandSet(corridorBands, coreN);
    const withDoors = tagged.map((cell) => {
        const dp = computeCoreDoorPlacement(cell, corridorBands, connectedForDoors);
        return dp ? { ...cell, coreDoorOffset: dp.offset, coreDoorWidth: dp.width } : cell;
    });
    placements.length = 0;
    placements.push(...withDoors);

    const areas = placements.map((c) => c.areaM2);
    const mix = placements.map((c) => c.typology);
    // §DIAG-RESI-FILL (§RESI-PLATE-UNDERFILL / §NONRECT-CELLS-P1) — the apartment FILL RATIO: placed-
    // apartment footprint ÷ the NET plate area (plate − core). The headline under-fill metric. The
    // placed footprint uses each cell's REAL polygon area (`c.areaM2`, set to the polygon area for a
    // reshaped non-rect cell) so a reshaped cell counts its true footprint, not its over-counting bbox.
    const placedArea = placements.reduce((s, c) => s + c.areaM2, 0);
    const netPlateArea = Math.max(EPS, bbArea - rectArea(coreN));
    const fillRatio = round4(placedArea / netPlateArea);
    // §RESI-CORRIDOR-ECONOMY — the SHIPPED circulation cost (union m² of the final, possibly
    // repaired network), surfaced beside fillRatio so the preview card and the diagnostic can
    // quote both honestly.
    const corridorAreaM2 = corridorUnionAreaM2(corridorBands);
    const diagnostic =
        `§DIAG-RESI-PARTITION level=${levelIndex} status=ok N=${placements.length} ` +
        `corridors=${corridorBands.length} ` +
        `mix=[${mix.join(',')}] areas=[${areas.map((a) => a.toFixed(1)).join(',')}] ` +
        `clippedOutOfBoundary=${clippedOut} reshaped=${reshaped} reached=${reached}/${placements.length} ` +
        `§RESI-CORE-CIRCULATION coreReached=${coreReached}/${placements.length} ` +
        `§DIAG-RESI-FILL fillRatio=${fillRatio.toFixed(3)} (placed=${placedArea.toFixed(0)}m²/net=${netPlateArea.toFixed(0)}m²) ` +
        `§RESI-CORRIDOR-ECONOMY corridor=${corridorAreaM2.toFixed(0)}m² trimmed=${corridorTrimmedM2.toFixed(1)}m²`;

    return {
        status: 'ok',
        core: coreN,
        publicCorridor: corridorBands,
        apartmentCells: placements,
        apartmentsReached: reached,
        apartmentsCoreReachable: coreReached,
        fillRatio,
        corridorAreaM2,
        diagnostic,
    };
}
