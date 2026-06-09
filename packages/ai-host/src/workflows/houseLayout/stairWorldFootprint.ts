// Casa Unifamiliar — the SHARED, pure stair world-footprint builder (2026-06-09).
//
// §STAIR-CONTAIN-UPSTREAM — the SINGLE SOURCE OF TRUTH for the multi-storey house
// stair's plan geometry. BOTH the orchestrator (to compute the room-tiling keep-out
// + the inward containment BEFORE tiling) AND the editor's HouseLayoutExecutor (to
// build the dispatched CreateStairCommand) call THIS one function, so the carved
// keep-out and the SHIPPED stair footprint are byte-identical by construction —
// closing the §8.5 "position → keep-out → tile → nudge" desync at the root.
//
// PREVIOUSLY the executor reconstructed this geometry inline (`_buildFlights` +
// `computeStairFootprintRect` + a downstream §STAIR-CONTAIN nudge) while the
// orchestrator derived the keep-out from the *reserved* `core.rectMm` — a DIFFERENT
// shape (the reserved cell, not the real flights/landings/width footprint) at a
// DIFFERENT position (un-nudged). This module makes the two agree.
//
// PURE + DETERMINISTIC L2 (ADR-0061) — no stores, no DOM, no THREE, no Date/RNG.
// World-XZ metres.
//
// FOOTPRINT MATH: `computeStairFootprintRectPure` below is a BYTE-FOR-BYTE port of
// `@pryzm/geometry-stair` `StairFootprintUtils.computeStairFootprintRect` (the SAME
// helper CreateStairCommand uses to punch the slab void). We INLINE it rather than
// import the barrel because the @pryzm/geometry-stair barrel re-exports DOM/THREE-
// touching builders (SlabTool → @thatopen/ui needs `HTMLElement`), which would break
// ai-host's pure Node test environment, and the package's exports map blocks a deep
// import of the pure file. Keep this port IN LOCK-STEP with the geometry-stair source.

import { rotatePt } from '../apartmentLayout/tgl/rectDecomposition.js';
import type { StairShape } from './types.js';
import type { StairCorePositionKind } from './stairPosition.js';

export interface XZ { readonly x: number; readonly z: number }
interface XYZ { readonly x: number; readonly y: number; readonly z: number }

/** Geometry constants — MUST stay in lock-step with HouseLayoutExecutor's
 *  STAIR_* constants (the executor delegates to this module, so a divergence here
 *  silently desyncs the shipped stair from the keep-out again). */
export const STAIR_RISER_TARGET_M = 0.18;   // ~180 mm — the architectural sweet-spot
export const STAIR_RISER_MIN_M = 0.15;
export const STAIR_RISER_MAX_M = 0.19;
export const STAIR_TREAD_M = 0.27;          // ≥ 250 mm minimum
export const STAIR_WIDTH_M = 1.0;           // ≥ 900 mm minimum
const MM_PER_M = 1000;

/** The executor's exact total-riser resolution for a floor-to-floor gap: start at
 *  round(ftf / target), then clamp so the per-riser height stays in [MIN, MAX].
 *  Identical to HouseLayoutExecutor._createStair so both build the same flight lengths. */
export function resolveTotalRisers(floorToFloorM: number): number {
    let totalRisers = Math.max(2, Math.round(floorToFloorM / STAIR_RISER_TARGET_M));
    let riserHeight = floorToFloorM / totalRisers;
    while (riserHeight > STAIR_RISER_MAX_M && totalRisers < 40) { totalRisers++; riserHeight = floorToFloorM / totalRisers; }
    while (riserHeight < STAIR_RISER_MIN_M && totalRisers > 2) { totalRisers--; riserHeight = floorToFloorM / totalRisers; }
    return totalRisers;
}

/** Re-normalise the L/U riser split so the two flights sum to `totalRisers`. I → one
 *  flight (all risers). Mirrors HouseLayoutExecutor._normaliseSplit exactly. */
function normaliseSplit(shape: StairShape, totalRisers: number, before: number): { before: number; after: number } {
    if (shape === 'I' || totalRisers < 3) return { before: totalRisers, after: 0 };
    let b = Math.max(1, Math.min(totalRisers - 1, Math.round(before || Math.floor(totalRisers / 2))));
    if (totalRisers - b < 1) b = totalRisers - 1;
    return { before: b, after: totalRisers - b };
}

function unit(d: XYZ): XYZ {
    const len = Math.hypot(d.x, d.z) || 1;
    return { x: d.x / len, y: 0, z: d.z / len };
}

/** Rotate a world point's XZ by `angleRad` about an XZ pivot (preserving y). Matches
 *  HouseLayoutExecutor._rotateXZ / rectDecomposition.rotatePt. */
function rotateXZ(p: XYZ, angleRad: number, pivot: XZ): XYZ {
    if (angleRad === 0) return { x: p.x, y: p.y, z: p.z };
    const r = rotatePt({ x: p.x, z: p.z }, angleRad, pivot);
    return { x: r.x, y: p.y, z: r.z };
}

/** Rotate a DIRECTION's XZ by `angleRad` about the origin. */
function rotateXZDir(d: XYZ, angleRad: number): XYZ {
    if (angleRad === 0) return { x: d.x, y: d.y, z: d.z };
    const c = Math.cos(angleRad), s = Math.sin(angleRad);
    return { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c };
}

export interface FlightGeom {
    readonly direction: XYZ;
    readonly riserCount: number;
    readonly startOverride?: XYZ;
}

/** Build the LAYOUT-frame flights + landings for a shape, mirroring
 *  HouseLayoutExecutor._buildFlights (incl. §STAIR-HALF-LANDING-INWARD U folding). */
function buildFlightsLayout(
    shape: StairShape,
    start: XYZ,
    dir1: XYZ,
    split: { before: number; after: number },
    width: number,
    tread: number,
    interiorSide: StairCorePositionKind | undefined,
): { flights: FlightGeom[]; landings: { depth: number }[]; secondRunSide: 'left' | 'right' } {
    const d1 = unit(dir1);
    if (shape === 'I') {
        return { flights: [{ direction: d1, riserCount: split.before }], landings: [], secondRunSide: 'left' };
    }
    const d2raw = shape === 'L' ? { x: -d1.z, y: 0, z: d1.x } : { x: -d1.x, y: 0, z: -d1.z };
    const d2 = unit(d2raw);

    if (shape === 'L') {
        return {
            flights: [
                { direction: d1, riserCount: split.before },
                { direction: d2, riserCount: split.after },
            ],
            landings: [{ depth: width }],
            secondRunSide: 'left',
        };
    }
    // U: flight 2 runs parallel back, offset across by the stair width; the
    // §STAIR-HALF-LANDING-INWARD interior-side fold (mirror of the executor).
    const firstLen = split.before * tread;
    const legacyPerp = unit({ x: -d1.z, y: 0, z: d1.x }); // left of flight 1
    const interiorDir =
        interiorSide === 'left' ? { x: 1, z: 0 } :
        interiorSide === 'right' ? { x: -1, z: 0 } :
        interiorSide === 'back' ? { x: 0, z: -1 } :
        null;
    const interiorDot = interiorDir ? interiorDir.x * legacyPerp.x + interiorDir.z * legacyPerp.z : 0;
    const perp = Math.abs(interiorDot) > 1e-6
        ? unit({ x: legacyPerp.x * Math.sign(interiorDot), y: 0, z: legacyPerp.z * Math.sign(interiorDot) })
        : legacyPerp;
    const secondStart = {
        x: start.x + d1.x * (firstLen + tread) + perp.x * width,
        y: start.y,
        z: start.z + d1.z * (firstLen + tread) + perp.z * width,
    };
    const secondRunSide: 'left' | 'right' =
        (Math.abs(interiorDot) > 1e-6 && Math.sign(interiorDot) < 0) ? 'right' : 'left';
    return {
        flights: [
            { direction: d1, riserCount: split.before },
            { direction: d2, riserCount: split.after, startOverride: secondStart },
        ],
        landings: [{ depth: 2 * width }],
        secondRunSide,
    };
}

/** The inputs the shared builder needs — the orchestrator-resolved stair core data,
 *  exactly the subset HouseLayoutExecutor._createStair reads off a StairCore. */
export interface StairWorldFootprintInput {
    /** The reserved core rect in the LAYOUT (principal-axis) frame (mm). */
    readonly rectMm: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly shape: StairShape;
    /** Per-flight WORLD-rotated directions + riser counts (the orchestrator's
     *  `resolveFlightPlans` output / StairCore.flights). One for I, two for L/U. */
    readonly flights: ReadonlyArray<{ readonly riserCount: number; readonly direction: XYZ }>;
    readonly risersBeforeLanding?: number;
    readonly interiorSide?: StairCorePositionKind;
    readonly principalAxisRad: number;
    readonly pivot: XZ;
    /** Floor-to-floor gap (m) → drives totalRisers via {@link resolveTotalRisers}. */
    readonly floorToFloorM: number;
    /** World floor elevation of the lower level (m). Rotation-invariant; default 0. */
    readonly startY?: number;
}

/** The fully-resolved WORLD-frame stair geometry: the dispatched start/flights/
 *  landings AND the tight oriented footprint (4 world-XZ corners). */
export interface StairWorldFootprint {
    readonly startPosition: XYZ;
    readonly flights: FlightGeom[];
    readonly landings: { depth: number }[];
    readonly secondRunSide: 'left' | 'right';
    readonly totalRisers: number;
    readonly split: { before: number; after: number };
    /** The 4 CCW world-XZ corners of the stair's tight oriented footprint, or null
     *  on degenerate input (the caller logs + proceeds). */
    readonly footprintWorld: XZ[] | null;
}

/**
 * §STAIR-CONTAIN-UPSTREAM — build the SHARED world-frame stair geometry + footprint.
 *
 * `containOffset` (optional) is an inward world-XZ translation applied to the WHOLE
 * rigid body (start + every flight startOverride) BEFORE the footprint is computed —
 * so the orchestrator can compute a footprint, solve the containment offset, and
 * re-build the CONTAINED footprint, and the executor can rebuild that SAME contained
 * body by passing the SAME offset. {0,0} (the default) is the un-contained body.
 *
 * Determinism: pure function of its inputs (no Date/RNG). On an axis-aligned plate
 * (`principalAxisRad === 0`) and zero offset the body is byte-identical to the
 * pre-refactor executor geometry.
 */
export function computeStairWorldFootprint(
    input: StairWorldFootprintInput,
    containOffset: XZ = { x: 0, z: 0 },
): StairWorldFootprint {
    const x0 = input.rectMm.x / MM_PER_M;
    const z0 = input.rectMm.y / MM_PER_M;
    const wM = input.rectMm.w / MM_PER_M;
    const hM = input.rectMm.h / MM_PER_M;
    const runAlongZ = hM >= wM;          // longer dimension carries flight 1

    const shape = input.shape;
    const width = STAIR_WIDTH_M;
    const tread = STAIR_TREAD_M;
    const startY = input.startY ?? 0;
    const principalAxisRad = input.principalAxisRad ?? 0;
    const pivot = input.pivot ?? { x: 0, z: 0 };

    const totalRisers = resolveTotalRisers(input.floorToFloorM);

    const engFlights = input.flights && input.flights.length > 0 ? input.flights : null;
    const dir1Layout: XYZ = runAlongZ ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };

    const before = engFlights && engFlights.length === 2
        ? engFlights[0]!.riserCount
        : (shape === 'I' ? totalRisers : Math.max(1, input.risersBeforeLanding ?? Math.floor(totalRisers / 2)));
    const split = normaliseSplit(shape, totalRisers, before);

    // Start position (LAYOUT frame): near corner of the core.
    const startLayout: XYZ = runAlongZ
        ? { x: x0 + wM / 2, y: startY, z: z0 }
        : { x: x0, y: startY, z: z0 + hM / 2 };

    const built = buildFlightsLayout(shape, startLayout, dir1Layout, split, width, tread, input.interiorSide);

    // Rotate the rigid body to WORLD (+angle about pivot): start + per-flight override;
    // directions come from the engine's already-world-rotated flights where present.
    const startPosition0 = rotateXZ(startLayout, principalAxisRad, pivot);
    const worldFlights0: FlightGeom[] = built.flights.map((f, idx) => ({
        ...f,
        direction: engFlights?.[idx]
            ? engFlights[idx]!.direction
            : unit(rotateXZDir(f.direction, principalAxisRad)),
        ...(f.startOverride ? { startOverride: rotateXZ(f.startOverride, principalAxisRad, pivot) } : {}),
    }));

    // Apply the inward containment translation to the whole rigid body.
    const dx = containOffset.x, dz = containOffset.z;
    const startPosition: XYZ = (dx || dz)
        ? { x: startPosition0.x + dx, y: startPosition0.y, z: startPosition0.z + dz }
        : startPosition0;
    const worldFlights: FlightGeom[] = (dx || dz)
        ? worldFlights0.map(f => ({
            ...f,
            ...(f.startOverride ? { startOverride: { x: f.startOverride.x + dx, y: f.startOverride.y, z: f.startOverride.z + dz } } : {}),
        }))
        : worldFlights0;

    const footprintWorld = computeStairFootprintRectPure({
        shape, width, treadDepth: tread, startPosition,
        flights: worldFlights,
        landings: built.landings,
    });

    return {
        startPosition,
        flights: worldFlights,
        landings: built.landings,
        secondRunSide: built.secondRunSide,
        totalRisers,
        split,
        footprintWorld,
    };
}

// ─── Inlined pure footprint math ─────────────────────────────────────────────
// BYTE-FOR-BYTE port of @pryzm/geometry-stair StairFootprintUtils.computeStairFootprintRect.
// Computes the 4 CCW world-XZ corners of the oriented rectangle (aligned to flight 1)
// that tightly contains ALL flights + landings. Keep IN LOCK-STEP with that source.
interface FootprintInput {
    shape: StairShape;
    width: number;
    treadDepth: number;
    startPosition: XYZ;
    flights: ReadonlyArray<{ direction: XYZ; riserCount: number; startOverride?: XYZ; treadDepth?: number }>;
    landings?: ReadonlyArray<{ depth: number }>;
}

function computeStairFootprintRectPure(input: FootprintInput): XZ[] | null {
    if (!input.flights.length) return null;
    const dir1 = input.flights[0]!.direction;
    const dirLen = Math.hypot(dir1.x, dir1.z);
    if (dirLen < 1e-6) return null;

    const u: XZ = { x: dir1.x / dirLen, z: dir1.z / dirLen };
    const v: XZ = { x: -u.z, z: u.x };
    const origin = input.startPosition;
    const halfW = input.width / 2;

    const toLocal = (p: XZ): { u: number; v: number } => {
        const dx = p.x - origin.x, dz = p.z - origin.z;
        return { u: dx * u.x + dz * u.z, v: dx * v.x + dz * v.z };
    };

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    const accumulate = (p: XZ) => {
        const lp = toLocal(p);
        if (lp.u < minU) minU = lp.u;
        if (lp.u > maxU) maxU = lp.u;
        if (lp.v < minV) minV = lp.v;
        if (lp.v > maxV) maxV = lp.v;
    };

    const addFlightRect = (start: XZ, dirN: XZ, length: number): XZ => {
        const perpN: XZ = { x: -dirN.z, z: dirN.x };
        const end: XZ = { x: start.x + dirN.x * length, z: start.z + dirN.z * length };
        const hw: XZ = { x: perpN.x * halfW, z: perpN.z * halfW };
        accumulate({ x: start.x - hw.x, z: start.z - hw.z });
        accumulate({ x: start.x + hw.x, z: start.z + hw.z });
        accumulate({ x: end.x - hw.x, z: end.z - hw.z });
        accumulate({ x: end.x + hw.x, z: end.z + hw.z });
        return end;
    };

    let cursor: XZ = { x: origin.x, z: origin.z };
    let prevDir: XZ = u;

    for (let i = 0; i < input.flights.length; i++) {
        const f = input.flights[i]!;
        const dLen = Math.hypot(f.direction.x, f.direction.z);
        if (dLen < 1e-6) continue;
        const dN: XZ = { x: f.direction.x / dLen, z: f.direction.z / dLen };

        let start: XZ;
        if (f.startOverride) {
            start = { x: f.startOverride.x, z: f.startOverride.z };
        } else if (i === 0) {
            start = { x: origin.x, z: origin.z };
        } else {
            const landing = input.landings?.[i - 1];
            const landingDepth = landing?.depth ?? input.width;
            start = { x: cursor.x + prevDir.x * landingDepth, z: cursor.z + prevDir.z * landingDepth };
        }

        const flightTread = f.treadDepth ?? input.treadDepth;
        const length = f.riserCount * flightTread;
        const end = addFlightRect(start, dN, length);

        if (i < input.flights.length - 1) {
            const landing = input.landings?.[i];
            if (landing) {
                const halfLW = input.width / 2;
                const perpN: XZ = { x: -dN.z, z: dN.x };
                const lEnd: XZ = { x: end.x + dN.x * landing.depth, z: end.z + dN.z * landing.depth };
                accumulate({ x: end.x - perpN.x * halfLW, z: end.z - perpN.z * halfLW });
                accumulate({ x: end.x + perpN.x * halfLW, z: end.z + perpN.z * halfLW });
                accumulate({ x: lEnd.x - perpN.x * halfLW, z: lEnd.z - perpN.z * halfLW });
                accumulate({ x: lEnd.x + perpN.x * halfLW, z: lEnd.z + perpN.z * halfLW });
            }
        }
        cursor = end;
        prevDir = dN;
    }

    if (!isFinite(minU) || !isFinite(minV)) return null;
    const corner = (lu: number, lv: number): XZ => ({
        x: origin.x + u.x * lu + v.x * lv,
        z: origin.z + u.z * lu + v.z * lv,
    });
    return [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)];
}
