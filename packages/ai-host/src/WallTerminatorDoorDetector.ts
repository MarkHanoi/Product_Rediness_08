/**
 * @file WallTerminatorDoorDetector.ts
 * @description Pure geometric door gap detector using the wall terminator midpoint formula.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls commandManager.execute().
 *  - Pure computation: DetectedWall[] in → GeometricDoorGap[] out.
 *  - Zero coupling to Three.js, BIM stores, command system, or the Claude API.
 *  - Zero randomness — deterministic for the same input.
 *
 * PURPOSE:
 *   After Stage B1 returns wall pixel coordinates, this module performs a purely
 *   geometric scan to locate door gap midpoints BEFORE Stage B2 runs.
 *
 *   The algorithm mirrors the "Structural Detective" logic described in the design
 *   document:
 *     1. Vector Termination Analysis  — find wall endpoints ("terminators")
 *     2. Geometric Alignment          — check collinearity between facing terminators
 *     3. Gap Distance Filter          — reject gaps outside standard door-width range
 *     4. Midpoint Formula             — M = ((x1+x2)/2, (y1+y2)/2)
 *
 *   The resulting GeometricDoorGap[] is injected into the Stage B2 user message
 *   as "precision door centres." Claude receives the exact formula-derived pixel
 *   coordinates and only needs to:
 *     (a) visually confirm a door swing arc is present near each centre, and
 *     (b) assign the correct hostWallId from the B1 wall list.
 *   It does NOT need to estimate centrePx from arc geometry — removing the single
 *   most common source of centrePx error.
 *
 * ALGORITHM DETAIL:
 *   For every ordered pair of distinct walls (wa, wb), consider every combination
 *   of their endpoints (Ea ∈ {startPx_a, endPx_a}, Eb ∈ {startPx_b, endPx_b}).
 *
 *   A pair (Ea, Eb) is a valid door gap candidate if:
 *   1. Gap distance: MIN_GAP_PX ≤ dist(Ea, Eb) ≤ MAX_GAP_PX
 *   2. Collinearity: the perpendicular offset from Eb to the line through Ea in
 *      wall-wa's direction is ≤ PERP_TOL_PX.  i.e.:
 *        perp = |cross(da, v)| ≤ PERP_TOL_PX   where v = Eb − Ea
 *   3. Facing direction: the gap vector v points away from wall wa through Ea.
 *      If Ea = endPx_a  → v should project positively onto da (gap is "forward").
 *      If Ea = startPx_a → v should project negatively onto da (gap is "backward").
 *   4. Not a junction: Ea and Eb are not already snapped to each other (i.e., no
 *      collinear endpoint pair with dist ≤ JUNCTION_SNAP_PX — those are T-junctions
 *      or corners, not door gaps).
 *
 *   Duplicate midpoints within MERGE_RADIUS_PX are merged to their centroid.
 */

import type { DetectedWall } from './FloorPlanAIFactory.js';

// ── Constants ───────────────────────────────────────────────────────────────────

/**
 * Minimum door gap width in pixels.
 * At 1500px image width representing a typical floor plan, even a 0.6m door at
 * 1:100 scale ≈ 9 px. We set a generous floor to avoid missing small-scale plans.
 */
const MIN_GAP_PX = 12;

/**
 * Maximum door gap width in pixels.
 * A 2.4m double door at 1:50 scale (high-detail plan) ≈ 360 px. Generous ceiling.
 */
const MAX_GAP_PX = 380;

/**
 * Perpendicular collinearity tolerance in pixels.
 * Claude's pixel rounding in B1 can shift endpoints by 5–15 px from the true
 * centreline. 22 px accommodates this without accepting truly non-collinear pairs.
 */
const PERP_TOL_PX = 22;

/**
 * Facing direction dot-product threshold.
 * Relaxed from 0.6 to 0.4 (≈66°) to accept non-orthogonal or slightly messy wall
 * endpoints that would otherwise be rejected. 0.6 missed real gaps in diagonal plans.
 */
const FACING_DOT_MIN = 0.4;

/**
 * Radius within which two candidate midpoints are considered the same gap.
 * Increased from 30 px to 50 px to bridge wider door openings that produce two
 * terminator pairs far enough apart to escape the old merge window.
 */
const MERGE_RADIUS_PX = 50;

/**
 * If two endpoints are closer than this, treat them as a junction (not a gap).
 * Prevents corner snaps from being reported as door gaps.
 */
const JUNCTION_SNAP_PX = 8;

// ── Public types ─────────────────────────────────────────────────────────────────

export interface GeometricDoorGap {
    /** Exact midpoint computed by M = ((x1+x2)/2, (y1+y2)/2). */
    centrePx: { x: number; y: number };
    /** Pixel coordinates of the first jamb (wall terminator A). */
    jamb1Px: { x: number; y: number };
    /** Pixel coordinates of the second jamb (wall terminator B). */
    jamb2Px: { x: number; y: number };
    /** Pixel distance between the two jambs (= gap width = door leaf width). */
    gapWidthPx: number;
    /** Hosting wall angle in degrees (0=horizontal, 90=vertical). */
    wallAngleDeg: number;
    /** ID of the wall whose endpoint forms jamb1. */
    wallAId: string;
    /** ID of the wall whose endpoint forms jamb2. */
    wallBId: string;
}

// ── Main export ──────────────────────────────────────────────────────────────────

/**
 * Detect door gap midpoints geometrically from the B1 wall list.
 *
 * @param walls  Wall segments returned by Stage B1 (pixel coordinates).
 * @returns      Array of unique door gap candidates with precise midpoints.
 *               May contain false positives (narrow openings without a door swing)
 *               — Stage B2 is responsible for visual confirmation.
 */
export function detectGeometricDoorGaps(walls: DetectedWall[]): GeometricDoorGap[] {
    const candidates: GeometricDoorGap[] = [];

    for (let i = 0; i < walls.length; i++) {
        const wa = walls[i]!;
        const da = unitVector(wa.endPx.x - wa.startPx.x, wa.endPx.y - wa.startPx.y);
        if (!da) continue; // zero-length wall — skip

        // Both endpoints of wa are terminators to check
        const endpointsA: Array<{ pt: { x: number; y: number }; isEnd: boolean }> = [
            { pt: wa.startPx, isEnd: false },
            { pt: wa.endPx,   isEnd: true  },
        ];

        for (let j = 0; j < walls.length; j++) {
            if (i === j) continue;
            const wb = walls[j]!;

            const endpointsB: Array<{ x: number; y: number }> = [
                wb.startPx,
                wb.endPx,
            ];

            for (const { pt: Ea, isEnd } of endpointsA) {
                for (const Eb of endpointsB) {
                    // ── 1. Gap distance ─────────────────────────────────────────
                    const vx = Eb.x - Ea.x;
                    const vy = Eb.y - Ea.y;
                    const dist = Math.sqrt(vx * vx + vy * vy);

                    if (dist < JUNCTION_SNAP_PX) continue; // same junction point
                    if (dist < MIN_GAP_PX || dist > MAX_GAP_PX) {
                        console.debug(
                            `[WallTerminatorDoorDetector] REJECT dist: ` +
                            `walls=${wa.id.slice(0,8)}↔${wb.id.slice(0,8)} ` +
                            `dist=${dist.toFixed(1)}px (range ${MIN_GAP_PX}–${MAX_GAP_PX}px) ` +
                            `Ea=(${Ea.x},${Ea.y}) Eb=(${Eb.x},${Eb.y})`
                        );
                        continue;
                    }

                    // ── 2. Collinearity: perpendicular offset ────────────────────
                    // cross(da, v) = da.x * v.y − da.y * v.x  (signed perpendicular distance)
                    const perp = Math.abs(da.x * vy - da.y * vx);
                    if (perp > PERP_TOL_PX) {
                        console.debug(
                            `[WallTerminatorDoorDetector] REJECT perp: ` +
                            `walls=${wa.id.slice(0,8)}↔${wb.id.slice(0,8)} ` +
                            `perp=${perp.toFixed(1)}px > tol=${PERP_TOL_PX}px ` +
                            `dist=${dist.toFixed(1)}px`
                        );
                        continue;
                    }

                    // ── 3. Facing direction ──────────────────────────────────────
                    // Normalise v and check projection onto da.
                    const vNormX = vx / dist;
                    const vNormY = vy / dist;
                    const dotV = vNormX * da.x + vNormY * da.y;

                    // isEnd=true  → Ea is the END endpoint → gap should be in +da direction → dotV > 0
                    // isEnd=false → Ea is the START endpoint → gap should be in −da direction → dotV < 0
                    const expectedSign = isEnd ? 1 : -1;
                    if (dotV * expectedSign < FACING_DOT_MIN) {
                        const angleFromWall = Math.acos(Math.min(1, Math.abs(dotV))) * (180 / Math.PI);
                        console.debug(
                            `[WallTerminatorDoorDetector] REJECT facing: ` +
                            `walls=${wa.id.slice(0,8)}↔${wb.id.slice(0,8)} ` +
                            `dotV=${dotV.toFixed(3)} sign=${expectedSign} ` +
                            `score=${(dotV * expectedSign).toFixed(3)} < min=${FACING_DOT_MIN} ` +
                            `angleFromWall=${angleFromWall.toFixed(1)}° dist=${dist.toFixed(1)}px`
                        );
                        continue;
                    }

                    // ── 4. Valid candidate — compute midpoint ────────────────────
                    const mx = (Ea.x + Eb.x) / 2;
                    const my = (Ea.y + Eb.y) / 2;

                    // Wall angle: atan2 of da (wall-A direction)
                    const angleDeg = Math.round(Math.atan2(da.y, da.x) * (180 / Math.PI));
                    // Normalise to [0, 180)
                    const wallAngleDeg = ((angleDeg % 180) + 180) % 180;

                    candidates.push({
                        centrePx: { x: Math.round(mx), y: Math.round(my) },
                        jamb1Px:  { x: Math.round(Ea.x), y: Math.round(Ea.y) },
                        jamb2Px:  { x: Math.round(Eb.x), y: Math.round(Eb.y) },
                        gapWidthPx: Math.round(dist),
                        wallAngleDeg,
                        wallAId: wa.id,
                        wallBId: wb.id,
                    });
                }
            }
        }
    }

    // ── Deduplicate midpoints within MERGE_RADIUS_PX ────────────────────────────
    return mergeDuplicates(candidates);
}

// ── Private helpers ──────────────────────────────────────────────────────────────

/** Return the 2D unit vector for (dx, dy), or null if the vector is near-zero. */
function unitVector(dx: number, dy: number): { x: number; y: number } | null {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return null;
    return { x: dx / len, y: dy / len };
}

/**
 * Merge candidate midpoints that are within MERGE_RADIUS_PX of each other.
 * The first-found candidate in each cluster is kept (greedy single-pass).
 */
function mergeDuplicates(candidates: GeometricDoorGap[]): GeometricDoorGap[] {
    const kept: GeometricDoorGap[] = [];

    for (const c of candidates) {
        const isDuplicate = kept.some(k => {
            const dx = k.centrePx.x - c.centrePx.x;
            const dy = k.centrePx.y - c.centrePx.y;
            return Math.sqrt(dx * dx + dy * dy) < MERGE_RADIUS_PX;
        });
        if (!isDuplicate) kept.push(c);
    }

    console.log(
        `[WallTerminatorDoorDetector] ${candidates.length} raw candidates → ` +
        `${kept.length} unique door gap(s) after deduplication.`,
    );

    return kept;
}
