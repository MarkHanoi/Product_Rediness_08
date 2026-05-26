// TGL — partition-vs-window avoidance (pure utility, no THREE / no stores).
//
// Architectural defect addressed (user-reported 2026-05-26):
// when the existing shell carries user-placed windows, the D-TGL squarified
// tiling can produce partition X / Z lines whose ENDPOINTS on the perimeter fall
// INSIDE a window opening — the partition would then visibly terminate inside
// the window glass. This module SNAPS those coordinate lines clear of every
// window span by the minimum required amount, leaving every other coord line
// untouched (so the layout topology is unchanged where it can be).
//
// Pure + deterministic. Composes after `subdivide` (or, more precisely, before
// the rect-tile boundaries are converted to wall segments by `wallsAndDoors`).
//
// Coordinate system: plan XZ in metres, identical to the rest of TGL.
// Vertical partition  = constant x ("xCut")  → its endpoints land on horizontal shell walls (constant z).
// Horizontal partition = constant z ("zCut") → its endpoints land on vertical shell walls (constant x).

import type { Pt } from './rectDecomposition.js';

/** A window's footprint on the shell perimeter, in world XZ. The window is the
 *  straight segment from `a` to `b` — for an axis-aligned shell wall it lies
 *  entirely on one constant-x or constant-z line. Off-axis (curved) shells are
 *  ignored: only axis-aligned spans participate in the snap. */
export interface WindowSpan {
    readonly a: Pt;
    readonly b: Pt;
}

/** Partition coordinate lines from the room tiling. */
export interface CoordLines {
    /** Vertical partitions: constant x = these values. */
    readonly xCuts: readonly number[];
    /** Horizontal partitions: constant z = these values. */
    readonly zCuts: readonly number[];
}

export interface SnapDiagnostic {
    /** Original → adjusted xCut values (only entries that moved). */
    readonly xShifts: ReadonlyArray<{ from: number; to: number; windowAt: number }>;
    /** Original → adjusted zCut values (only entries that moved). */
    readonly zShifts: ReadonlyArray<{ from: number; to: number; windowAt: number }>;
}

const EPS = 1e-6;

/** True when |a − b| ≤ EPS. */
const eq = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

/** Axis-aligned segment classification: horizontal (constant z) or vertical (constant x). */
function classify(span: WindowSpan): { axis: 'h' | 'v'; constCoord: number; min: number; max: number } | null {
    if (eq(span.a.z, span.b.z)) {
        const min = Math.min(span.a.x, span.b.x);
        const max = Math.max(span.a.x, span.b.x);
        return { axis: 'h', constCoord: span.a.z, min, max };
    }
    if (eq(span.a.x, span.b.x)) {
        const min = Math.min(span.a.z, span.b.z);
        const max = Math.max(span.a.z, span.b.z);
        return { axis: 'v', constCoord: span.a.x, min, max };
    }
    return null;   // diagonal — out of scope for rectilinear D-TGL
}

/**
 * For one candidate cut value at position `c` along an axis, return the nearest
 * clearance position OUTSIDE all blocking intervals.  Blocking intervals are
 * `[min − clear, max + clear]` for every window span ON A PERPENDICULAR shell
 * wall whose constant coord matches one of `perimeterBands` (the constant-coord
 * lines of the shell perimeter on the perpendicular axis).
 *
 * If the cut is outside every blocking interval, returns `c` unchanged. Otherwise
 * returns whichever side (min − clear or max + clear) is closer to `c`.
 */
function snapOne(
    c: number,
    blockingIntervals: ReadonlyArray<{ lo: number; hi: number; mid: number }>,
): { snapped: number; movedFrom?: number; windowAt?: number } {
    // Sort by lower bound for determinism + find the first interval that contains c.
    const sorted = [...blockingIntervals].sort((a, b) => a.lo - b.lo);
    for (const iv of sorted) {
        if (c >= iv.lo && c <= iv.hi) {
            const distLo = c - iv.lo;
            const distHi = iv.hi - c;
            const snapped = distLo <= distHi ? iv.lo : iv.hi;
            return { snapped, movedFrom: c, windowAt: iv.mid };
        }
    }
    return { snapped: c };
}

/**
 * Snap partition coordinate lines clear of every axis-aligned window span on the
 * perimeter.  The snap is conservative: a coord is moved IFF it falls strictly
 * inside the `[windowMin − clearance, windowMax + clearance]` interval on some
 * PERPENDICULAR shell wall.  Multiple windows are honoured simultaneously — if a
 * coord conflicts with two windows, the snap picks the nearest clearance edge of
 * the first interval it falls in (deterministic, sorted by lo).
 *
 * NOTE on perpendicularity: a vertical partition (constant x) terminates on a
 * HORIZONTAL shell wall (constant z), so only HORIZONTAL window spans gate its X.
 * Conversely, a horizontal partition (constant z) is gated by VERTICAL windows.
 */
export function snapCoordLinesAwayFromWindows(
    coords: CoordLines,
    windows: readonly WindowSpan[],
    clearanceM: number = 0.1,
): { coords: CoordLines; diag: SnapDiagnostic } {
    // Build the blocking intervals per axis.
    // - X-axis blockers come from horizontal windows (which sit on horizontal shell walls).
    const xBlockers: Array<{ lo: number; hi: number; mid: number }> = [];
    const zBlockers: Array<{ lo: number; hi: number; mid: number }> = [];
    for (const w of windows) {
        const c = classify(w);
        if (!c) continue;
        const mid = (c.min + c.max) / 2;
        if (c.axis === 'h') xBlockers.push({ lo: c.min - clearanceM, hi: c.max + clearanceM, mid });
        else                zBlockers.push({ lo: c.min - clearanceM, hi: c.max + clearanceM, mid });
    }

    const xShifts: Array<{ from: number; to: number; windowAt: number }> = [];
    const zShifts: Array<{ from: number; to: number; windowAt: number }> = [];

    const newXCuts = coords.xCuts.map(x => {
        const r = snapOne(x, xBlockers);
        if (r.movedFrom !== undefined && r.windowAt !== undefined && !eq(r.snapped, r.movedFrom)) {
            xShifts.push({ from: r.movedFrom, to: r.snapped, windowAt: r.windowAt });
        }
        return r.snapped;
    });
    const newZCuts = coords.zCuts.map(z => {
        const r = snapOne(z, zBlockers);
        if (r.movedFrom !== undefined && r.windowAt !== undefined && !eq(r.snapped, r.movedFrom)) {
            zShifts.push({ from: r.movedFrom, to: r.snapped, windowAt: r.windowAt });
        }
        return r.snapped;
    });

    return {
        coords: { xCuts: newXCuts, zCuts: newZCuts },
        diag:   { xShifts, zShifts },
    };
}

/**
 * Lift the snap to an array of room rects: extracts the distinct x-cuts + z-cuts
 * from the rect set, snaps them, and re-applies the mapping back to every rect.
 * Rect IDs are preserved; only x0 / x1 / z0 / z1 coords change for rects that
 * shared a snapped boundary with another rect.
 */
export function snapRectsAwayFromWindows<R extends { x0: number; z0: number; x1: number; z1: number }>(
    rects: readonly R[],
    windows: readonly WindowSpan[],
    clearanceM: number = 0.1,
): { rects: R[]; diag: SnapDiagnostic } {
    // Collect distinct cut coords. We exclude the bbox extents — those are
    // perimeter walls themselves, not partitions, and the snap would NEVER fire
    // for them (they already match a perimeter line by definition).
    const xSet = new Set<number>();
    const zSet = new Set<number>();
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const r of rects) {
        xSet.add(r.x0); xSet.add(r.x1); zSet.add(r.z0); zSet.add(r.z1);
        if (r.x0 < xMin) xMin = r.x0;
        if (r.x1 > xMax) xMax = r.x1;
        if (r.z0 < zMin) zMin = r.z0;
        if (r.z1 > zMax) zMax = r.z1;
    }
    const xCuts = [...xSet].filter(x => x > xMin + EPS && x < xMax - EPS).sort((a, b) => a - b);
    const zCuts = [...zSet].filter(z => z > zMin + EPS && z < zMax - EPS).sort((a, b) => a - b);

    const { coords: snapped, diag } = snapCoordLinesAwayFromWindows({ xCuts, zCuts }, windows, clearanceM);

    // Build replacement maps (only for actually-changed values).
    const xMap = new Map<number, number>();
    const zMap = new Map<number, number>();
    xCuts.forEach((x, i) => { if (!eq(x, snapped.xCuts[i]!)) xMap.set(x, snapped.xCuts[i]!); });
    zCuts.forEach((z, i) => { if (!eq(z, snapped.zCuts[i]!)) zMap.set(z, snapped.zCuts[i]!); });

    const out: R[] = rects.map(r => ({
        ...r,
        x0: xMap.get(r.x0) ?? r.x0,
        x1: xMap.get(r.x1) ?? r.x1,
        z0: zMap.get(r.z0) ?? r.z0,
        z1: zMap.get(r.z1) ?? r.z1,
    }));
    return { rects: out, diag };
}
