// §CONTAIN-CHECK (queued "we need a checker so we avoid walls going off the shell"
// + "corners where the window goes beyond the corner", 2026-06-16) — PURE diagnostics.
//
// These functions REPORT violations; they never move geometry. They are the observability
// counterpart to the FIXERS (`clampPartitionsInsideShell` in weldPartitionsToShell.ts and
// §WINDOW-CLEAR-WIDTH-CAP in windowEmission/emitWindows.ts): run a check BEFORE the fixer to
// log what was wrong, and AFTER to confirm the fixer closed it. That makes the recurring
// "walls poke past the perimeter" / "window overflows the corner" defects measurable instead
// of eyeballed from a 3D screenshot.
//
// PURE + DETERMINISTIC L2 — no stores, no DOM, no THREE.

import { EPSILON_ZERO, pointInPolygonXZ } from '@pryzm/geometry-kernel';

export interface XZ { readonly x: number; readonly z: number }

// §C73-EPSILON-POLICY — the private `const EPS = 1e-9` that stood here is DELETED,
// not aliased. Both uses are degenerate-arithmetic guards (a zero-length segment
// before the projection divide, a zero-length edge before normalising), which is
// precisely the question the kernel's `EPSILON_ZERO` answers. The kernel value IS
// 1e-9 — byte-identical to the literal removed — so every verdict here is unchanged.

function nearestOnSeg(p: XZ, a: XZ, b: XZ): { pt: XZ; dist: number } {
    const ex = b.x - a.x, ez = b.z - a.z;
    const L2 = ex * ex + ez * ez;
    if (L2 < EPSILON_ZERO) return { pt: { x: a.x, z: a.z }, dist: Math.hypot(p.x - a.x, p.z - a.z) };
    let t = ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const pt = { x: a.x + t * ex, z: a.z + t * ez };
    return { pt, dist: Math.hypot(p.x - pt.x, p.z - pt.z) };
}

/** Signed: >0 strictly inside, 0 on boundary, distance to nearest edge for outside points. */
function pointRing(p: XZ, ring: readonly XZ[]): { inside: boolean; edgeDist: number } {
    const n = ring.length;
    let edgeDist = Infinity;
    for (let i = 0; i < n; i++) {
        const d = nearestOnSeg(p, ring[i]!, ring[(i + 1) % n]!).dist;
        if (d < edgeDist) edgeDist = d;
    }
    // §C73-PIP-CANONICAL — interior test delegates to THE kernel ray cast (the
    // local `|| 1e-30` guard was dead code); edgeDist keeps its own owner above.
    const inside = pointInPolygonXZ(p.x, p.z, ring);
    return { inside, edgeDist };
}

// ── Shell containment ──────────────────────────────────────────────────────────

export interface ContainWall {
    readonly id: string;
    readonly start: XZ;
    readonly end: XZ;
}

export interface ShellViolation {
    readonly id: string;
    /** Which endpoint is outside. */
    readonly end: 'start' | 'end';
    /** How far past the shell boundary the endpoint sits, in metres. */
    readonly overshootM: number;
    /** The offending point (world m). */
    readonly point: XZ;
}

export interface ShellContainmentReport {
    readonly violations: readonly ShellViolation[];
    readonly count: number;
    /** Worst overshoot across all violations (0 when clean). */
    readonly maxOvershootM: number;
}

/**
 * §CONTAIN-CHECK / shell — report every partition endpoint that lies STRICTLY OUTSIDE the
 * shell ring by more than `tolM` (so float / grid dust and on-perimeter endpoints are NOT
 * flagged). Reports the overshoot distance so the caller can log "N walls off-shell, worst
 * 1.06 m" — the exact signal we were reading off 3D screenshots. Geometry is untouched.
 *
 * @param shellRing ORDERED shell perimeter ring (drawn footprint polygon, world m).
 */
export function checkShellContainment(
    partitions: readonly ContainWall[],
    shellRing: readonly XZ[],
    tolM = 0.05,
): ShellContainmentReport {
    if (shellRing.length < 3) return { violations: [], count: 0, maxOvershootM: 0 };
    const violations: ShellViolation[] = [];
    let maxOvershootM = 0;
    const test = (id: string, end: 'start' | 'end', p: XZ): void => {
        const r = pointRing(p, shellRing);
        if (r.inside || r.edgeDist <= tolM) return;     // inside or within band → fine
        const overshootM = r.edgeDist;
        violations.push({ id, end, overshootM, point: { x: p.x, z: p.z } });
        if (overshootM > maxOvershootM) maxOvershootM = overshootM;
    };
    for (const w of partitions) {
        test(w.id, 'start', w.start);
        test(w.id, 'end', w.end);
    }
    return { violations, count: violations.length, maxOvershootM };
}

// ── Window-corner overflow ─────────────────────────────────────────────────────

export interface CheckWindow {
    readonly id: string;
    /** Host wall id (for the report only). */
    readonly hostWallId: string;
    /** Centre offset of the window ALONG its host wall, from the wall start, metres. */
    readonly offsetM: number;
    /** Window opening width, metres. */
    readonly widthM: number;
}

export interface HostSegment {
    readonly id: string;
    readonly start: XZ;
    readonly end: XZ;
}

export interface WindowOverflowViolation {
    readonly windowId: string;
    readonly hostWallId: string;
    /** Which end of the host wall the window runs past. */
    readonly side: 'start' | 'end';
    /** How far the window's edge overshoots the host wall end (m); the run that has no wall. */
    readonly overflowM: number;
}

export interface WindowOverflowReport {
    readonly violations: readonly WindowOverflowViolation[];
    readonly count: number;
    readonly maxOverflowM: number;
}

/**
 * §CONTAIN-CHECK / window-corner — report any window whose opening run
 * [offset − width/2, offset + width/2] extends past its host wall's end (a corner) by more
 * than `tolM`. That is the "window goes beyond the corner" defect: the opening reaches into
 * the perpendicular wall / past the building edge, leaving glass with no frame on one side.
 * The §WINDOW-CLEAR-WIDTH-CAP fixer caps width to the clear run; this is the check that says
 * whether any window still overflows. Geometry untouched.
 */
export function checkWindowCornerOverflow(
    windows: readonly CheckWindow[],
    hostSegments: readonly HostSegment[],
    tolM = 0.02,
): WindowOverflowReport {
    const segById = new Map<string, HostSegment>();
    for (const s of hostSegments) segById.set(s.id, s);
    const violations: WindowOverflowViolation[] = [];
    let maxOverflowM = 0;
    for (const w of windows) {
        const seg = segById.get(w.hostWallId);
        if (!seg) continue;                                   // unknown host → not this check's job
        const len = Math.hypot(seg.end.x - seg.start.x, seg.end.z - seg.start.z);
        if (len < EPSILON_ZERO) continue;
        const half = w.widthM / 2;
        const lo = w.offsetM - half;                          // run start, from wall start
        const hi = w.offsetM + half;                          // run end
        if (lo < -tolM) {
            const overflowM = -lo;
            violations.push({ windowId: w.id, hostWallId: w.hostWallId, side: 'start', overflowM });
            if (overflowM > maxOverflowM) maxOverflowM = overflowM;
        }
        if (hi > len + tolM) {
            const overflowM = hi - len;
            violations.push({ windowId: w.id, hostWallId: w.hostWallId, side: 'end', overflowM });
            if (overflowM > maxOverflowM) maxOverflowM = overflowM;
        }
    }
    return { violations, count: violations.length, maxOverflowM };
}
