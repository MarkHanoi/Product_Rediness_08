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
    /** The public corridor band(s), metres, plan frame. */
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
const MAX_APARTMENT_DEPTH_M = 9;
/** Min cell width as a fraction of its depth — below this the cell is a sliver the
 *  engine rejects. 0.6 ⇒ a 9 m-deep cell is ≥ 5.4 m wide (aspect ≤ ~1.7:1). */
const MIN_CELL_ASPECT = 0.6;

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

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
function normRect(r: Rect): Rect {
    return { x0: round4(r.x0), z0: round4(r.z0), x1: round4(r.x1), z1: round4(r.z1) };
}

/**
 * Partition a rectangular level plate into [core] + [public corridor] + [N apartment
 * cells]. Pure + deterministic. Infeasible inputs → `status: 'rejected'` (C50 soft-fail
 * — the caller surfaces it; the function NEVER throws on a feasibility miss).
 *
 * STUB strategy (rectangular plate, double-loaded corridor):
 *  1. The core is the centred keep-out (passed in).
 *  2. A public-corridor BAND of `corridor.widthM` runs across the FULL plate along
 *     the plate's SHORT axis, centred on the core — so it touches the core and
 *     splits the plate into a FRONT band + a BACK band.
 *  3. Apartments are packed left→right into the front band, then the back band,
 *     each a full-band-deep slice whose width is sized so its area lands in the
 *     typology's [min,max] band. Each cell's corridor-facing edge IS the door edge,
 *     so every placed apartment is "reached" by construction.
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
    const { levelIndex, footprint, core, corridor, apartments } = input;

    const bb = bbox(footprint);
    if (!isRectangle(footprint, bb)) {
        return reject(levelIndex, 'footprint must be an axis-aligned rectangle (stub)');
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

    // ── Orient the corridor along the plate's SHORT axis (so the corridor is the
    // shorter span and apartments get the deeper front/back bands). The corridor
    // band runs FULL-WIDTH across X and is centred on Z at the core centre. We
    // operate in (X = long, Z = short) by ensuring width(plate) ≥ depth(plate);
    // if not we swap roles by mirroring the math on the Z axis. To keep the stub
    // simple + deterministic we run the corridor across the X span at the core's
    // Z-centre and pack apartments along X in the front (z < corridor) and back
    // (z > corridor) bands.
    const coreCz = (coreN.z0 + coreN.z1) / 2;
    const halfCorr = corridor.widthM / 2;
    const corrZ0 = round4(coreCz - halfCorr);
    const corrZ1 = round4(coreCz + halfCorr);

    if (corrZ0 <= bb.z0 + EPS || corrZ1 >= bb.z1 - EPS) {
        return reject(levelIndex, 'corridor band does not fit inside the footprint');
    }

    // The corridor spans the full X extent (one straight band, double-loaded). It
    // touches the core (the core's Z-centre sits inside the band by construction).
    const corridorBand: Rect = normRect({ x0: bb.x0, z0: corrZ0, x1: bb.x1, z1: corrZ1 });

    // The two residual bands the apartments pack into.
    const frontBand: Rect = normRect({ x0: bb.x0, z0: bb.z0, x1: bb.x1, z1: corrZ0 }); // doorEdge z1
    const backBand: Rect = normRect({ x0: bb.x0, z0: corrZ1, x1: bb.x1, z1: bb.z1 });  // doorEdge z0

    // The core occupies part of one (or both) bands — we exclude the core's X-span
    // from the band it overlaps so apartments never overlap the core. For the
    // centred-core stub the core straddles the corridor (its Z-centre == corridor
    // centre), so its footprint pokes equally into the front + back bands. We carve
    // the core's X-interval out of BOTH bands → each band becomes [leftRun]+[rightRun].
    const coreX0 = coreN.x0, coreX1 = coreN.x1;

    const placements: ApartmentCell[] = [];
    let cursor = 0;

    // Greedy packer over a band: walk left→right across the available X runs,
    // slicing each apartment a full-band-deep × (area/depth)-wide cell whose area
    // lands in [min,max]. Returns true if ALL its assigned apartments fit.
    type Run = { x0: number; x1: number };
    function runsFor(band: Rect): Run[] {
        // Subtract the core X-interval if the core overlaps this band in Z.
        const overlapsCoreZ = !(coreN.z1 <= band.z0 + EPS || coreN.z0 >= band.z1 - EPS);
        if (!overlapsCoreZ) return [{ x0: band.x0, x1: band.x1 }];
        const runs: Run[] = [];
        if (coreX0 - band.x0 > EPS) runs.push({ x0: band.x0, x1: coreX0 });
        if (band.x1 - coreX1 > EPS) runs.push({ x0: coreX1, x1: band.x1 });
        return runs;
    }

    function packBand(band: Rect, doorEdge: 'z0' | 'z1'): boolean {
        const bandDepth = rectDepth(band);
        if (bandDepth <= EPS) return cursor >= apartments.length; // nothing to do here
        // §RESI-CELL-FEASIBLE — cap the apartment depth so a deep plate doesn't force
        // sliver cells the per-cell engine rejects. The apartment anchors on the
        // corridor (door) edge and extends `depth` toward the façade; the far residual
        // of a very deep band is left un-tiled (wasted area, not a correctness bug).
        const depth = Math.min(bandDepth, MAX_APARTMENT_DEPTH_M);
        // The cell's z-interval, anchored at the corridor edge: front band's corridor
        // edge is z1 (so the cell sits at [z1−depth, z1]); back band's is z0 ([z0, z0+depth]).
        const cellZ0 = doorEdge === 'z1' ? round4(band.z1 - depth) : band.z0;
        const cellZ1 = doorEdge === 'z1' ? band.z1 : round4(band.z0 + depth);
        // §RESI-CELL-FEASIBLE — floor the width so the cell never goes too skinny for
        // the engine; an apartment that can't reach this min width in the remaining run
        // is simply not placed there (the orchestrator's prefix-trim drops the tail).
        const minWidthByAspect = depth * MIN_CELL_ASPECT;
        for (const run of runsFor(band)) {
            let x = run.x0;
            while (cursor < apartments.length) {
                const demand = apartments[cursor];
                if (!demand) break;
                // Width is chosen to hit the MIDPOINT of the typology band over the
                // (capped) cell depth, clamped to the remaining run + the band area.
                const midArea = (demand.minAreaM2 + demand.maxAreaM2) / 2;
                let w = midArea / depth;
                const remaining = run.x1 - x;
                const wMin = Math.max(demand.minAreaM2 / depth, minWidthByAspect);
                const wMax = demand.maxAreaM2 / depth;
                if (remaining < wMin - EPS) break; // run can't host this demand at min width
                // Clamp width so area stays in band, respects the aspect floor, AND fits the run.
                w = Math.min(Math.max(w, wMin), Math.max(wMax, wMin), remaining);
                const area = w * depth;
                if (area < demand.minAreaM2 - 1e-3) break; // can't satisfy min in this run
                const rect = normRect({ x0: x, z0: cellZ0, x1: x + w, z1: cellZ1 });
                placements.push({ typology: demand.typology, rect, areaM2: round4(rectArea(rect)), doorEdge });
                x = round4(x + w);
                cursor++;
            }
        }
        return true;
    }

    // Pack front band first (apartments hang their door on its z1 = corridor edge),
    // then back band (door on its z0 = corridor edge).
    packBand(frontBand, 'z1');
    packBand(backBand, 'z0');

    if (cursor < apartments.length) {
        return reject(
            levelIndex,
            `plate too small: placed ${cursor}/${apartments.length} apartments in the residual bands`,
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
        `mix=[${mix.join(',')}] areas=[${areas.map((a) => a.toFixed(1)).join(',')}] ` +
        `reached=${reached}/${placements.length}`;

    return {
        status: 'ok',
        core: coreN,
        publicCorridor: [corridorBand],
        apartmentCells: placements,
        apartmentsReached: reached,
        diagnostic,
    };
}
