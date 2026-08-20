/**
 * WallElevationSymbol — §ELEV-SYMBOL-WALL (L-1242)
 *
 * **THE SECOND HALF OF §ELEV-SYMBOL-OPENING. Openings got an authored elevation symbol in
 * L-1240; WALLS did not, and the founder saw exactly that gap.**
 *
 * > *"The RAKED WALLS on elevation are not rendering correctly — I believe the WINDOWS they do,
 * > but the WALL not. Also CURVED WALL renders in elevation with MANY VERTICAL LINES — they
 * > should render CONTINUOUSLY."*
 *
 * ⭐ He is describing the L-1240 fix landing on one family and not the other, and he is right:
 * `[ELEV-DIAG]` on his own West elevation reported `symbols=83 rawLayersSuppressed=50` — 83
 * openings drawn as drawings, sitting inside walls still drawn as photographs of solids.
 *
 * ═══ THE DUMP, AND WHAT IT PROVED — `WallElevationSymbol.probe.test.ts` ═══
 *
 * Real `buildWallHoleBodyGeometry` / `buildCurvedLayerGeometry` output, the real
 * `_applyRakeShearToChildren` matrix, real `THREE.EdgesGeometry`, real
 * `OBC.TechnicalDrawing.toDrawingSpace`, on a West elevation (`dir = −X`):
 *
 * | case | wall | HORIZ | PLUMB (distinct h) | DIAGONAL |
 * |---|---|---|---|---|
 * | A  | straight, square-on                |  8 | 8 (5) | 0 |
 * | B  | **RAKED 75°, square-on**           |  8 | 8 (5) | 0 |  ← byte-identical to A
 * | C0 | **straight, bearing 20°, NO rake** | **16** | **8 (8)** | 0 |
 * | C  | RAKED 75°, bearing 20°             | **16** | 0 | **8 @ 95.24°** |
 *
 * ⛔ **THE PROPOSED ROOT WAS "ON A RAKED WALL THE FACES SEPARATE AND CROSS". THE CONTROL KILLS
 * THE CAUSAL HALF OF THAT.** Case C0 — an oblique wall with **NO RAKE AT ALL** — already doubles
 * its horizontals from 8 to 16 and its plumb lines from 5 distinct positions to 8, paired
 * **0.1026 m** apart. That is `thickness · sin(bearing)` = `0.3 · sin 20°`, to four decimals.
 *
 * ⇒ **THE DOUBLING IS CAUSED BY OBLIQUITY ALONE. Rake is neither necessary nor sufficient for
 * it.** Rake adds only the *lean* (case C: the same eight lines tilt to 95.24°, which is
 * `atan(cot 75° · sin 20°)` off plumb — and that lean is a CORRECT projection of a leaning
 * solid, the D2 finding of L-1240). Square-on (A/B) the two faces project **exactly on top of
 * each other** and the depth edges collapse to points — which is precisely why this survived:
 * the stock N/S/E/W elevations of an axis-aligned building show no doubling at all.
 *
 * **THE REAL ROOT IS THE ONE L-1240 ALREADY NAMED FOR OPENINGS, LEFT UNFIXED FOR WALLS:** the
 * elevation draws the SOLID's wireframe — front face, back face, and the depth edges between —
 * where it should draw the DRAWING's linework. `HiddenLineRemoval` cannot remove the back face
 * because occluders are grouped by `elementUUID`, so *"an element never hides its own linework"*.
 *
 * ═══ AND THE CURVED WALL IS A **SECOND, INDEPENDENT** ROOT ═══
 *
 * | curved wall | edgeAngleDeg | HORIZ | PLUMB (distinct h) |
 * |---|---|---|---|
 * | 16 segments | 1  | 68  | **34** |
 * | 32 segments | 1  | 132 | **66** |
 * | 16 segments | 30 | 68  | 4 |
 * | 32 segments | 30 | 132 | 4 |
 *
 * ⭐ **`PLUMB = 2 × (segments + 1)` — EXACTLY.** The number of vertical lines in the drawing is a
 * function of the TESSELLATION SEGMENT COUNT, which no architect authored and which is not a
 * property of the building. A curved wall is built as radial bands, every band boundary is a real
 * facet in the mesh, and `THREE.EdgesGeometry`'s default ~1° dihedral threshold sits far below a
 * curved wall's per-facet angle — so **every tessellation seam is promoted to a drawn edge.**
 * That is the founder's picket fence, and it appears on a square-on curved wall too, so it is
 * **NOT** the obliquity root above. **Two reports, two roots.**
 *
 * ⭐ **THE ARCHITECTURAL RULE, STATED: A TESSELLATION SEAM IS NOT AN EDGE.** A curved wall in
 * elevation shows its silhouette and its real features — base, top, ends, openings — and nothing
 * else. ⛔ Raising the global dihedral threshold would have "fixed" it by dropping genuine edges
 * elsewhere; this module removes the question instead, by drawing the arc as a **continuous
 * polyline** and letting the L-1240 suppression take the faceted solid away.
 *
 * ═══ WHAT THIS MODULE DRAWS ═══
 *
 * The wall's **near face**, once: base, top, and the two ends. For a curve the base and top are
 * continuous polylines traced **station for station from `computeStations`** — the SAME sampler
 * `buildCurvedLayerGeometry` builds the body from, so the symbol cannot disagree with the wall it
 * describes. That is C86 §10.1 PR-1's rule (*"⛔ no arm may re-derive an arc"*) applied to the
 * wall's arc rather than to the opening's profile.
 *
 * ⭐ **THE RAKE IS APPLIED, AND PER STATION.** `_applyRakeShearToChildren` displaces a straight
 * wall along `leftPerp(chord)`; §FEAT-RAKE-CURVED displaces a curved wall along its LOCAL station
 * normal, which varies along the arc. This traces the local normal for both, so a conical sweep is
 * drawn as the cone it is. Viewed square-on the displacement is pure DEPTH and the ends draw
 * plumb; viewed obliquely they lean **with the wall** — which is what an oblique projection of a
 * leaning wall is, and is D2, not a defect.
 *
 * ⛔ **NO PEN DECISION HERE** (C09 §4.6.4b). Every polyline carries a `DrawingZone` and nothing
 * else.
 *
 * Contract compliance:
 *   C85 §10 / C86 §10.2 — the wall's half of the elevation-symbol rule
 *   C09 §4.6.4f         — a family with a conventional elevation representation gets a symbol;
 *                         zone-suffixed layers; the tessellation-seam rule
 *   C16 CA-18           — every refusal names condition, reason and live alternative
 *
 * @module WallElevationSymbol
 */

import { rakeShearPerMetre } from '@pryzm/geometry-wall';
import type { DrawingZone } from './DrawingZone';
import type { Vec3 } from './ElevationViewBasis';

/** A plan-space point on the host's base line. */
export interface WallPlanPoint { readonly x: number; readonly z: number }

/** One sample of the wall's centreline, with the OUTWARD normal at that station. */
export interface WallStationSample {
    readonly x: number;
    readonly z: number;
    /** Unit outward normal in plan (`leftPerp` of the local tangent). */
    readonly nx: number;
    readonly nz: number;
}

export interface WallElevationSymbolHost {
    readonly id: string;
    readonly baseStart: WallPlanPoint;
    readonly baseEnd: WallPlanPoint;
    /** World Y of the wall's BASE plane — the datum the rake pivots about (§WALL-Y-DATUM). */
    readonly baseY: number;
    readonly height: number;
    /** Horizontal (plan) thickness — `WallRake.ts`'s convention. */
    readonly thickness: number;
    readonly rakeAngleDeg?: number | null;
    /**
     * The wall's centreline, ALREADY SAMPLED, for a curved host. Absent ⇒ straight.
     *
     * ⭐ Passed in rather than computed here, deliberately. The sampler is `computeStations` — the
     * one `buildCurvedLayerGeometry` builds the BODY from — and calling it here would make this
     * module the second place that decides what an arc's stations are. Two answers to *"where
     * along the wall is this?"* is the shape of every join defect this subsystem has had
     * (`CurvedWallLayerBuilder`'s own header says exactly that).
     */
    readonly stations?: ReadonlyArray<WallStationSample> | null;
    /** True when the wall carries an authored elevation PROFILE (a non-flat top). */
    readonly hasProfile?: boolean;
}

export interface WallElevationSymbolOptions {
    /** `+1` / `−1` pick the face on the `+n` / `−n` side; `0` the centreline. */
    readonly faceSign?: -1 | 0 | 1;
}

export type WallElevationSymbolRole = 'wall-outline' | 'wall-base' | 'wall-top' | 'wall-end';

export interface WallElevationSymbolPolyline {
    readonly role: WallElevationSymbolRole;
    readonly zone: DrawingZone;
    readonly points: readonly Vec3[];
    readonly closed: boolean;
}

export interface WallElevationSymbolRefusal {
    readonly code: 'DEGENERATE_HOST' | 'PROFILED_TOP' | 'DEGENERATE_ARC';
    readonly reason: string;
    readonly alternative: string;
}

export interface WallElevationSymbolResult {
    readonly polylines: readonly WallElevationSymbolPolyline[];
    /** Non-null ⇒ NOTHING was emitted, and the wall MUST keep its raw linework. */
    readonly refusal: WallElevationSymbolRefusal | null;
}

const EMPTY: readonly WallElevationSymbolPolyline[] = Object.freeze([]);

/**
 * Which face of a straight wall faces the viewer. Shares its rule with
 * `OpeningElevationSymbol.nearFaceSign` — restated for the wall's own plan frame rather than
 * imported, because a wall may be curved and then "the" near face is a per-station question.
 *
 * ⚠ **NOT MEASURED for an arc that turns past perpendicular.** The sign is taken from the CHORD,
 * so a wall sweeping more than ~90° presents its other face at one end and this picks one for the
 * whole run. Every arc wall this repo builds is well under that; recorded rather than assumed.
 */
export function wallNearFaceSign(
    host: Pick<WallElevationSymbolHost, 'baseStart' | 'baseEnd'>,
    viewDirection: { x: number; z: number },
): -1 | 0 | 1 {
    const dx = host.baseEnd.x - host.baseStart.x;
    const dz = host.baseEnd.z - host.baseStart.z;
    const l = Math.hypot(dx, dz);
    if (!(l > 1e-9)) return 0;
    const lpx = -dz / l, lpz = dx / l;
    const dot = lpx * viewDirection.x + lpz * viewDirection.z;
    if (Math.abs(dot) < 1e-9) return 0;
    return dot < 0 ? 1 : -1;
}

/**
 * Build the authored elevation linework for one wall, in WORLD space.
 *
 * @returns polylines plus a refusal. A refusal is EXCLUSIVE: `polylines` is empty and the caller
 *          MUST leave the wall's raw linework alone. ⛔ Emitting a flat-topped rectangle for a
 *          wall whose top is NOT flat would replace a cluttered TRUE drawing with a clean FALSE
 *          one, and that trade is never worth making.
 */
export function buildWallElevationSymbol(
    host: WallElevationSymbolHost,
    options: WallElevationSymbolOptions = {},
): WallElevationSymbolResult {
    const dx = host.baseEnd.x - host.baseStart.x;
    const dz = host.baseEnd.z - host.baseStart.z;
    const len = Math.hypot(dx, dz);
    if (!(len > 1e-9) || !Number.isFinite(host.baseY) || !(host.height > 0)) {
        return {
            polylines: EMPTY,
            refusal: {
                code: 'DEGENERATE_HOST',
                reason: 'the wall has no length, no height, or no base datum, so it has no face to draw',
                alternative: 'repair the wall base line and height, then re-open this view',
            },
        };
    }

    // ⛔ A PROFILED wall REFUSES, and keeps its raw linework. §FEAT-WALL-PROFILE lets a wall carry
    // an authored elevation outline — a gable, a stepped top. This symbol draws a FLAT top, so
    // emitting it for a profiled wall would draw a top the wall does not have. Same failure C86
    // §10.1 forbids by name for the opening profile ("a silent fall-back to rectangular").
    if (host.hasProfile === true) {
        return {
            polylines: EMPTY,
            refusal: {
                code: 'PROFILED_TOP',
                reason: 'this wall carries an authored elevation profile, and the wall symbol can '
                      + 'only draw a flat top — so it would draw a top the wall does not have',
                alternative: 'the wall keeps its projected linework until the symbol can express a '
                           + 'profiled top',
            },
        };
    }

    const samples = _samplesFor(host, dx, dz, len);
    if (!samples) {
        return {
            polylines: EMPTY,
            refusal: {
                code: 'DEGENERATE_ARC',
                reason: 'the wall is curved but its stations could not be resolved, so its arc '
                      + 'cannot be traced',
                alternative: 'the wall keeps its projected linework',
            },
        };
    }

    const k = rakeShearPerMetre(host.rakeAngleDeg);
    const faceSign = options.faceSign ?? 0;
    const half = Number.isFinite(host.thickness) && host.thickness > 0 ? host.thickness / 2 : 0;
    const face = faceSign * half;

    /**
     * A centreline sample ↦ its near-face point at height `yLocal` above the base.
     *
     * ⭐ `yLocal` reaches world Y untouched, so a base or top run is ONE world height and
     * therefore ONE `v` in every view — C86 §10.2's head-and-sill invariant, applied to the
     * wall's own base and top. The face offset and the rake move the point only in the XZ plane,
     * i.e. only in `h` and DEPTH, never in height.
     */
    const at = (s: WallStationSample, yLocal: number): Vec3 => {
        const perp = face + k * yLocal;
        return { x: s.x + s.nx * perp, y: host.baseY + yLocal, z: s.z + s.nz * perp };
    };

    const first = samples[0]!;
    const last = samples[samples.length - 1]!;

    // ── STRAIGHT: one closed outline. Four lines, and the drawing is done. ────
    if (samples.length === 2) {
        return {
            polylines: [{
                role: 'wall-outline',
                // C09 §4.6.1 — an elevation slices nothing, so a wall's face is PROJECTION. It is
                // never `cut`, and saying so here stops a later caller reaching for the heavy cut
                // pen because a wall "looks structural".
                zone: 'projection',
                points: [
                    at(first, 0), at(last, 0),
                    at(last, host.height), at(first, host.height),
                ],
                closed: true,
            }],
            refusal: null,
        };
    }

    // ── CURVED: base and top as CONTINUOUS polylines, plus the two ends. ──────
    //
    // ⭐ THIS IS THE WHOLE CURVED-WALL FIX. The body carries `2 × (segments + 1)` facet seams and
    // `EdgesGeometry` promotes every one of them to a drawn vertical. Here the arc is TWO
    // polylines and TWO end lines — the silhouette and the real features, and nothing else. The
    // picket fence is not filtered out; it is never created.
    const base: Vec3[] = [];
    const top: Vec3[] = [];
    for (const s of samples) {
        base.push(at(s, 0));
        top.push(at(s, host.height));
    }
    return {
        polylines: [
            { role: 'wall-base', zone: 'projection', points: base, closed: false },
            { role: 'wall-top',  zone: 'projection', points: top,  closed: false },
            { role: 'wall-end',  zone: 'projection', points: [at(first, 0), at(first, host.height)], closed: false },
            { role: 'wall-end',  zone: 'projection', points: [at(last, 0),  at(last, host.height)],  closed: false },
        ],
        refusal: null,
    };
}

/**
 * The centreline samples this wall is traced from: the two endpoints for a straight wall, the
 * caller-supplied stations for a curved one.
 *
 * ⛔ A curved host whose `stations` are present but unusable is a REFUSAL, not a fall-back to the
 * chord — drawing a straight line where the building has an arc is the same class of lie as a
 * flat top on a gable, and it is the failure that would be hardest to notice.
 */
function _samplesFor(
    host: WallElevationSymbolHost,
    dx: number, dz: number, len: number,
): WallStationSample[] | null {
    const st = host.stations;
    if (st && st.length >= 2) return st.map(s => ({ x: s.x, z: s.z, nx: s.nx, nz: s.nz }));
    if (st && st.length > 0) return null;          // curved, but unusable — refuse
    // leftPerp(d) = (−d.z, d.x) — the SAME left as WallFootprint2D / JunctionResolverV2.
    const nx = -dz / len, nz = dx / len;
    return [
        { x: host.baseStart.x, z: host.baseStart.z, nx, nz },
        { x: host.baseEnd.x,   z: host.baseEnd.z,   nx, nz },
    ];
}
