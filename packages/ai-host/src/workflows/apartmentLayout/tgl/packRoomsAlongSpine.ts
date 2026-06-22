// §SPINE-FIRST P2 (ADR-0073 HAG, 2026-06-21) — pack rooms into the residual BANDS either side of a
// derived corridor spine, so the spine-first invariants hold BY CONSTRUCTION:
//   (I1) every placed room shares the corridor (spine) wall   → no sealed/served-through room.
//   (I2) every window-needing room touches the shell exterior → no "buried, no façade" (window) fail.
// These are exactly the two dominant defects the §CIRCULATION-ROBUSTNESS-SWEEP measured (circulation
// + window). Driving the spine — not area packing — guarantees them.
//
// PURE + deterministic (ADR-0061). Metres, world XZ. This P2 core handles the STRAIGHT primary run
// (double-loaded corridor) on a RECTANGULAR shell — the highest-value common case. Legs (L/T) and
// skewed-shell residuals are P3. Consumes a SpinePath from deriveCorridorSpine (P1).

import type { Rect } from './rectDecomposition.js';
import { rectArea, subtractRectsFromRects } from './rectDecomposition.js';
import type { SpinePath } from './deriveCorridorSpine.js';

const DOOR_W = 0.8;
const SNAP = 0.05;

export interface SpineRoom {
    readonly id: string;
    readonly targetAreaM2: number;
    readonly needsWindow: boolean;
    readonly minShortSideM: number;
}

export interface PackedRoom { readonly roomId: string; readonly rect: Rect }

export interface SpinePackResult {
    /** The primary run rect (the straight corridor strip). */
    readonly corridor: Rect;
    /** ALL corridor cells = the run + any stair legs (each a rect of the corridor width). Their
     *  union is the realised corridor footprint (an L/T when a leg reaches an edge stair). */
    readonly corridorCells: readonly Rect[];
    readonly rooms: readonly PackedRoom[];
    readonly dropped: readonly string[];
    /** Diagnostic: which side ('A' high / 'B' low) each room landed on. */
    readonly side: Readonly<Record<string, 'A' | 'B'>>;
}

/** Build the corridor cells (run rect + a rect per leg segment of the spine). */
function corridorCellsOf(run: Rect, spine: SpinePath): Rect[] {
    const cells: Rect[] = [run];
    const half = spine.widthM / 2;
    for (let i = 1; i < spine.segments.length; i++) {
        const s = spine.segments[i]!;
        if (Math.abs(s.a.x - s.b.x) < EPS) {                 // vertical leg
            cells.push({ x0: s.a.x - half, x1: s.a.x + half, z0: Math.min(s.a.z, s.b.z), z1: Math.max(s.a.z, s.b.z) });
        } else {                                              // horizontal leg
            cells.push({ z0: s.a.z - half, z1: s.a.z + half, x0: Math.min(s.a.x, s.b.x), x1: Math.max(s.a.x, s.b.x) });
        }
    }
    return cells;
}

const EPS = 1e-6;

/** Greedy longest-processing-time split into two area-balanced cohorts (stable, deterministic). */
function balanceTwo(rooms: readonly SpineRoom[]): readonly [SpineRoom[], SpineRoom[]] {
    const byArea = [...rooms].sort((a, b) => b.targetAreaM2 - a.targetAreaM2 || a.id.localeCompare(b.id));
    const A: SpineRoom[] = [], B: SpineRoom[] = [];
    let aArea = 0, bArea = 0;
    for (const r of byArea) {
        if (aArea <= bArea) { A.push(r); aArea += Math.max(EPS, r.targetAreaM2); }
        else { B.push(r); bArea += Math.max(EPS, r.targetAreaM2); }
    }
    return [A, B];
}

/** Comb a cohort along the band's LONG axis; each room spans the FULL band depth (touches the spine
 *  edge AND the outer/façade edge) and takes a share of the band length PROPORTIONAL to its target
 *  area, so the cohort exactly TILES the residual band (no drops — the corridor strip has already
 *  been removed, so rooms fill what remains, like squarify fills a zone). A room is only reported
 *  dropped when the band is so short it can't host the cohort above the per-room minimum. */
function combBand(
    band: Rect, axis: 'x' | 'z', cohort: readonly SpineRoom[],
): { placements: PackedRoom[]; dropped: string[] } {
    const placements: PackedRoom[] = [];
    const dropped: string[] = [];
    if (cohort.length === 0) return { placements, dropped };
    const along0 = axis === 'x' ? band.x0 : band.z0;
    const along1 = axis === 'x' ? band.x1 : band.z1;
    const bandLen = along1 - along0;
    // Drop the lowest-priority (smallest-target) rooms until the rest can each clear their minimum.
    const ordered = [...cohort].sort((a, b) => b.targetAreaM2 - a.targetAreaM2 || a.id.localeCompare(b.id));
    let kept = ordered;
    while (kept.length > 0 && kept.reduce((s, r) => s + r.minShortSideM, 0) > bandLen + EPS) {
        dropped.push(kept[kept.length - 1]!.id);
        kept = kept.slice(0, -1);
    }
    if (kept.length === 0) return { placements, dropped };
    // Proportional fill: each kept room's along-extent = bandLen × target / Σtarget, but never below
    // its minimum (clamp, then renormalise the slack so the band still tiles exactly).
    const totalTarget = kept.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0);
    let widths = kept.map(r => bandLen * Math.max(EPS, r.targetAreaM2) / totalTarget);
    widths = widths.map((w, i) => Math.max(w, kept[i]!.minShortSideM));
    const sumW = widths.reduce((s, w) => s + w, 0);
    widths = widths.map(w => w * bandLen / sumW);                 // renormalise back to exactly bandLen
    // Preserve the input order for determinism of placement positions.
    const orderById = new Map(cohort.map((r, i) => [r.id, i]));
    const seq = kept.map((r, i) => ({ r, w: widths[i]! }))
        .sort((p, q) => (orderById.get(p.r.id) ?? 0) - (orderById.get(q.r.id) ?? 0));
    let cursor = along0;
    for (const { r, w } of seq) {
        const a = cursor, b = Math.min(cursor + w, along1);
        placements.push({
            roomId: r.id,
            rect: axis === 'x'
                ? { x0: a, z0: band.z0, x1: b, z1: band.z1 }
                : { x0: band.x0, z0: a, x1: band.x1, z1: b },
        });
        cursor = b;
    }
    return { placements, dropped };
}

/**
 * Pack `rooms` into the two bands either side of the spine's straight primary run.
 * Rectangular-shell core (P2). Returns null when the spine is not a straight primary run on a usable
 * shell (caller falls back to the legacy carve / P3 handles the residual cases).
 */
export function packRoomsAlongSpine(
    shellBbox: Rect,
    spine: SpinePath,
    rooms: readonly SpineRoom[],
): SpinePackResult | null {
    const run = spine.segments[0];
    if (!run) return null;
    const half = spine.widthM / 2;

    if (spine.primaryAxis === 'x') {
        const zc = run.a.z;
        const bandA: Rect = { x0: shellBbox.x0, z0: zc + half, x1: shellBbox.x1, z1: shellBbox.z1 };  // high side (façade z1)
        const bandB: Rect = { x0: shellBbox.x0, z0: shellBbox.z0, x1: shellBbox.x1, z1: zc - half };  // low side (façade z0)
        if (bandA.z1 - bandA.z0 < EPS || bandB.z1 - bandB.z0 < EPS) return null;
        const [cohortA, cohortB] = balanceTwo(rooms);
        const a = combBand(bandA, 'x', cohortA);
        const b = combBand(bandB, 'x', cohortB);
        const corridor: Rect = { x0: shellBbox.x0, z0: zc - half, x1: shellBbox.x1, z1: zc + half };
        const side: Record<string, 'A' | 'B'> = {};
        for (const r of cohortA) side[r.id] = 'A';
        for (const r of cohortB) side[r.id] = 'B';
        return { corridor, corridorCells: corridorCellsOf(corridor, spine), rooms: [...a.placements, ...b.placements], dropped: [...a.dropped, ...b.dropped], side };
    }

    // primaryAxis 'z' — run vertical; bands left/right.
    const xc = run.a.x;
    const bandA: Rect = { x0: xc + half, z0: shellBbox.z0, x1: shellBbox.x1, z1: shellBbox.z1 };       // right (façade x1)
    const bandB: Rect = { x0: shellBbox.x0, z0: shellBbox.z0, x1: xc - half, z1: shellBbox.z1 };       // left (façade x0)
    if (bandA.x1 - bandA.x0 < EPS || bandB.x1 - bandB.x0 < EPS) return null;
    const [cohortA, cohortB] = balanceTwo(rooms);
    const a = combBand(bandA, 'z', cohortA);
    const b = combBand(bandB, 'z', cohortB);
    const corridor: Rect = { x0: xc - half, z0: shellBbox.z0, x1: xc + half, z1: shellBbox.z1 };
    const side: Record<string, 'A' | 'B'> = {};
    for (const r of cohortA) side[r.id] = 'A';
    for (const r of cohortB) side[r.id] = 'B';
    return { corridor, corridorCells: corridorCellsOf(corridor, spine), rooms: [...a.placements, ...b.placements], dropped: [...a.dropped, ...b.dropped], side };
}

/**
 * §SPINE-TREE (§18 slice 1) — pack rooms off EVERY corridor segment (the straight primary run AND
 * its legs), not just `segments[0]`, so an L/T/U corridor connects rooms in the fragments a straight
 * run never reaches (the founder's fragmented-plate defect). The shell bbox MINUS the corridor cells
 * (`subtractRectsFromRects`) is the set of residual BANDS, each abutting a corridor cell BY
 * CONSTRUCTION; rooms are distributed across the bands (greedy largest-target → emptiest band, LPT)
 * and combed along each band's corridor-shared edge so every placed room shares a corridor wall (I1)
 * and spans to the façade (I2). Rect-based + pure; clipping the bands to the REAL sheared shell is
 * §18 slice 3 (today the caller still gates to a rectangular shell, P8). Returns null on a degenerate
 * spine / no residual band.
 */
export interface PackTreeOptions {
    /** §18 slice 2 — PRE-SPLIT cohorts [sideA, sideB]. When given, sideA packs into the bands on ONE
     *  side of the primary run and sideB into the bands on the OTHER — so a MIXED (ground) floor puts
     *  PUBLIC on one side and PRIVATE on the other (the corridor sits between the social + sleeping
     *  zones). Absent ⇒ all rooms balanced across every band (the all-private upper floor). Falls back
     *  to unzoned if either side has no band (never forces a drop). */
    readonly cohorts?: readonly [readonly SpineRoom[], readonly SpineRoom[]];
}

export function packRoomsAlongSpineTree(
    shellBbox: Rect,
    spine: SpinePath,
    rooms: readonly SpineRoom[],
    opts: PackTreeOptions = {},
): SpinePackResult | null {
    const run = spine.segments[0];
    if (!run) return null;
    const half = spine.widthM / 2;
    // The primary run as a full-width corridor strip (same as packRoomsAlongSpine's corridor rect).
    const corridor: Rect = spine.primaryAxis === 'x'
        ? { x0: shellBbox.x0, z0: run.a.z - half, x1: shellBbox.x1, z1: run.a.z + half }
        : { x0: run.a.x - half, z0: shellBbox.z0, x1: run.a.x + half, z1: shellBbox.z1 };
    const corridorCells = corridorCellsOf(corridor, spine);

    // Residual bands = shell bbox − every corridor strip; each abuts a corridor cell by construction.
    const bands = subtractRectsFromRects([shellBbox], corridorCells)
        .filter(r => rectArea(r) > EPS)
        .sort((p, q) => rectArea(q) - rectArea(p) || p.x0 - q.x0 || p.z0 - q.z0);
    if (bands.length === 0) return null;

    // The axis to comb a band along = the direction of its SHARED edge with a corridor cell, so each
    // slice spans the band depth and TOUCHES the corridor. Horizontal shared edge (band above/below a
    // cell) ⇒ comb along x; vertical shared edge (band beside a cell) ⇒ comb along z. Fallback: the
    // band's longer axis.
    const combAxisFor = (band: Rect): 'x' | 'z' => {
        for (const c of corridorCells) {
            const xOv = Math.min(band.x1, c.x1) - Math.max(band.x0, c.x0);
            const zOv = Math.min(band.z1, c.z1) - Math.max(band.z0, c.z0);
            if (xOv > DOOR_W && (Math.abs(band.z1 - c.z0) < SNAP || Math.abs(band.z0 - c.z1) < SNAP)) return 'x';
            if (zOv > DOOR_W && (Math.abs(band.x1 - c.x0) < SNAP || Math.abs(band.x0 - c.x1) < SNAP)) return 'z';
        }
        return (band.x1 - band.x0) >= (band.z1 - band.z0) ? 'x' : 'z';
    };

    // Comb a room set across a band set: LPT assign (largest target → emptiest band; deterministic),
    // then comb each band along its corridor-shared edge. A room set with no band drops (reported).
    const packInto = (bandSet: readonly Rect[], roomSet: readonly SpineRoom[]): { placements: PackedRoom[]; dropped: string[] } => {
        const placements: PackedRoom[] = [];
        const dropped: string[] = [];
        if (roomSet.length === 0) return { placements, dropped };
        if (bandSet.length === 0) return { placements, dropped: roomSet.map(r => r.id) };
        const remaining = bandSet.map(b => rectArea(b));
        const cohorts: SpineRoom[][] = bandSet.map(() => []);
        for (const r of [...roomSet].sort((p, q) => q.targetAreaM2 - p.targetAreaM2 || p.id.localeCompare(q.id))) {
            let best = 0;
            for (let i = 1; i < bandSet.length; i++) if (remaining[i]! > remaining[best]!) best = i;
            cohorts[best]!.push(r);
            remaining[best]! -= Math.max(EPS, r.targetAreaM2);
        }
        bandSet.forEach((band, i) => {
            const ordered = cohorts[i]!.slice().sort((p, q) => roomSet.indexOf(p) - roomSet.indexOf(q));
            const res = combBand(band, combAxisFor(band), ordered);
            placements.push(...res.placements);
            dropped.push(...res.dropped);
        });
        return { placements, dropped };
    };

    const side: Record<string, 'A' | 'B'> = {};
    // Which side of the primary run a band sits on (A = high side of the run's perpendicular axis).
    const sideOf = (band: Rect): 'A' | 'B' => spine.primaryAxis === 'x'
        ? ((band.z0 + band.z1) / 2 > run.a.z ? 'A' : 'B')
        : ((band.x0 + band.x1) / 2 > run.a.x ? 'A' : 'B');

    // §18 slice 2 — public/private zoning: cohort[0] → side-A bands, cohort[1] → side-B bands.
    if (opts.cohorts) {
        const bandsA = bands.filter(b => sideOf(b) === 'A');
        const bandsB = bands.filter(b => sideOf(b) === 'B');
        if (bandsA.length > 0 && bandsB.length > 0) {
            const a = packInto(bandsA, opts.cohorts[0]);
            const b = packInto(bandsB, opts.cohorts[1]);
            for (const r of opts.cohorts[0]) side[r.id] = 'A';
            for (const r of opts.cohorts[1]) side[r.id] = 'B';
            return { corridor, corridorCells, rooms: [...a.placements, ...b.placements], dropped: [...a.dropped, ...b.dropped], side };
        }
        // One side has no band ⇒ fall through to the unzoned pack (never force a drop for zoning).
    }

    const all = packInto(bands, rooms);
    // Diagnostic side label = which side of the run each placed room landed on (from its own rect).
    for (const p of all.placements) side[p.roomId] = sideOf(p.rect);
    return { corridor, corridorCells, rooms: all.placements, dropped: all.dropped, side };
}
