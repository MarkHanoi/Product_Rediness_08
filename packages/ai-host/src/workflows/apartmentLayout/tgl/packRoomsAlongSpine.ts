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
import type { SpinePath } from './deriveCorridorSpine.js';

export interface SpineRoom {
    readonly id: string;
    readonly targetAreaM2: number;
    readonly needsWindow: boolean;
    readonly minShortSideM: number;
}

export interface PackedRoom { readonly roomId: string; readonly rect: Rect }

export interface SpinePackResult {
    readonly corridor: Rect;
    readonly rooms: readonly PackedRoom[];
    readonly dropped: readonly string[];
    /** Diagnostic: which side ('A' high / 'B' low) each room landed on. */
    readonly side: Readonly<Record<string, 'A' | 'B'>>;
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
 *  edge AND the outer/façade edge). Returns placements + ids that didn't fit. */
function combBand(
    band: Rect, axis: 'x' | 'z', cohort: readonly SpineRoom[],
): { placements: PackedRoom[]; dropped: string[] } {
    const placements: PackedRoom[] = [];
    const dropped: string[] = [];
    const along0 = axis === 'x' ? band.x0 : band.z0;
    const along1 = axis === 'x' ? band.x1 : band.z1;
    const depth = axis === 'x' ? band.z1 - band.z0 : band.x1 - band.x0;
    let cursor = along0;
    for (const r of cohort) {
        const want = Math.max(r.minShortSideM, r.targetAreaM2 / Math.max(EPS, depth));
        if (cursor + want > along1 + EPS) { dropped.push(r.id); continue; }
        const a = cursor, b = cursor + want;
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
        return { corridor, rooms: [...a.placements, ...b.placements], dropped: [...a.dropped, ...b.dropped], side };
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
    return { corridor, rooms: [...a.placements, ...b.placements], dropped: [...a.dropped, ...b.dropped], side };
}
