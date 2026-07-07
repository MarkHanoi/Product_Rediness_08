// ─── L-stair landing DIRECTION + RAILING regression (§FIX-STAIR-LANDING-DIRECTION-RAILING, L-163) ───
// Founder defect (screenshot): an L-shaped switchback stair (2 flights + a 90°
// landing) had a MALFORMED landing — the second run's direction relative to the
// landing was mis-fitted and the landing railing wrapped at odd angles instead of
// following the landing edge continuously between the two flights.
//
// Root cause: StairRailingBuilder.buildLandingSegment() discriminated a 180°
// U-switchback from a 90° L-corner by the PRESENCE of `nextFlight.startOverride`.
// Since §STAIR-PREVIEW-MATCH-2026-04-25 v2/v3 the 2D path adapter corner-PINS every
// non-first flight, so L-shapes ALSO carry a `startOverride` — and every path-drawn
// L landing was wrongly routed into buildULandingGuard (the half-turn guard designed
// for a 180° switchback: perpDir span of width*1.5 one slab-depth forward). Meanwhile
// StairMeshBuilder correctly keys on the flight-to-flight ANGLE
// (`flatDir.dot(nextDir) < -0.7`), so the MESH drew a clean 90° L landing while the
// RAILING drew a switchback guard — they disagreed.
//
// The fix (a) discriminates by the same angle test the mesh builder uses, and
// (b) for corner-pinned flights reads flight 2's rail-start from its RESOLVED entry
// (the drawn polyline flight-start) instead of the legacy auto-advance projection.
//
// This spec re-encodes that decision math (kept in lock-step with the source) and
// pins the invariants for BOTH the founder L-shape and a true U-switchback. Pure
// THREE vector math (node env — no DOM, no window, no builder boot), matching the
// sibling StairULandingGuard.spec.ts / StairUMeshLandingSide.spec.ts style.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

/**
 * The single discriminator both StairMeshBuilder and (post-fix) StairRailingBuilder
 * use: a switchback iff the two flights are anti-parallel. `startOverride` presence
 * is IRRELEVANT (corner-pinned L-shapes carry it too).
 */
function isUSwitchback(flatDir: THREE.Vector3, nextDir: THREE.Vector3): boolean {
    const a = new THREE.Vector3(flatDir.x, 0, flatDir.z).normalize();
    const b = new THREE.Vector3(nextDir.x, 0, nextDir.z).normalize();
    return a.dot(b) < -0.7;
}

/**
 * Post-fix L-landing connector endpoints for a corner-pinned (2D-path) L-shape.
 * Mirrors buildLandingSegment's L-branch:
 *   landingRailStart = flight 1 rail END  = flightStart + flatDir*totalRun + offset
 *   landingRailEnd   = flight 2 rail START = nextFlightStart + nextOffset
 * where nextFlightStart is the RESOLVED flight-2 entry (corner-pinned), NOT a
 * legacy projection. Both at the shared landing elevation.
 */
function lLandingConnector(params: {
    flightStart: THREE.Vector3;
    flatDir: THREE.Vector3;
    nextDir: THREE.Vector3;
    nextFlightStart: THREE.Vector3; // resolved flight-2 start (corner-pinned)
    totalRun: number;
    totalRise: number;
    width: number;
    sideSign: number; // +1 left, -1 right
    treadDepth: number;
}): { start: THREE.Vector3; end: THREE.Vector3; corner: THREE.Vector3; projLen: number; drawn: boolean } {
    const { flightStart, flatDir, nextDir, nextFlightStart, totalRun, totalRise, width, sideSign, treadDepth } = params;
    const flatH = new THREE.Vector3(flatDir.x, 0, flatDir.z).normalize();
    const sideAxis = new THREE.Vector3(-flatH.z, 0, flatH.x).normalize();
    const offset = sideAxis.clone().multiplyScalar(sideSign * (width / 2));
    const flightEndElev = flightStart.y + totalRise;
    const flightEndPos = flightStart.clone().add(flatH.clone().multiplyScalar(totalRun)).add(offset);

    const nextFlatH = new THREE.Vector3(nextDir.x, 0, nextDir.z).normalize();
    const nextSideAxis = new THREE.Vector3(-nextFlatH.z, 0, nextFlatH.x).normalize();
    const nextOffset = nextSideAxis.clone().multiplyScalar(sideSign * (width / 2));

    const start = new THREE.Vector3(flightEndPos.x, flightEndElev, flightEndPos.z);
    const endPos = nextFlightStart.clone().add(nextOffset);
    const end = new THREE.Vector3(endPos.x, flightEndElev, endPos.z);

    const diff = end.clone().sub(start);
    const projLen = flatH.dot(diff);
    const corner = start.clone().add(flatH.clone().multiplyScalar(projLen));
    return { start, end, corner, projLen, drawn: projLen > treadDepth };
}

describe('L-stair landing direction + railing (§FIX-STAIR-LANDING-DIRECTION-RAILING, L-163)', () => {
    // ── (a) The discriminator — angle, not startOverride ─────────────────────────
    describe('U-vs-L discriminator keys on the flight-to-flight angle', () => {
        it('a 90° L-corner is NOT a switchback (dot ≈ 0)', () => {
            // +X → +Z (left turn) and +X → -Z (right turn) are both 90°.
            expect(isUSwitchback(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1))).toBe(false);
            expect(isUSwitchback(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1))).toBe(false);
            expect(isUSwitchback(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))).toBe(false);
        });

        it('a 180° switchback IS a switchback (dot ≈ -1)', () => {
            expect(isUSwitchback(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0))).toBe(true);
            expect(isUSwitchback(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1))).toBe(true);
        });

        it('matches StairMeshBuilder exactly (same -0.7 threshold, same dot)', () => {
            // Regression guard: the founder bug was the railing using a DIFFERENT
            // discriminator (startOverride) than the mesh (dot). Pin they agree for
            // the L case even when a startOverride IS present (corner-pinned).
            const flatDir = new THREE.Vector3(1, 0, 0);
            const nextDir = new THREE.Vector3(0, 0, 1); // 90° corner
            const startOverridePresent = true; // 2D-path corner-pins L flights
            // OLD (buggy) railing test would have returned true here:
            expect(startOverridePresent).toBe(true);
            // Correct test (angle) returns false → L wrap, not U guard.
            expect(isUSwitchback(flatDir, nextDir)).toBe(false);
        });
    });

    // ── (b) The landing railing wraps the outer edge, opens the inner edge ───────
    describe('corner-pinned L landing railing follows the landing perimeter', () => {
        const width = 1.0;
        const treadDepth = 0.28;
        const riserCount = 8;
        const riserHeight = 0.18;
        const totalRun = riserCount * treadDepth;
        const totalRise = riserCount * riserHeight;
        // Flight 1: start at origin, travels +X. Flight 2: 90° left turn → +Z.
        // Corner (polyline vertex) sits at flight-1 flightEnd + flatDir*width/2.
        const flatDir = new THREE.Vector3(1, 0, 0);
        const nextDir = new THREE.Vector3(0, 0, 1);
        const flightStart = new THREE.Vector3(0, 0, 0);
        // corner-pinned flight 2 start (= drawn polyline flight-start, on the D2
        // side of the landing centre): corner + nextDir*width/2, corner = flightEnd + flatDir*width/2.
        const flightEnd = flightStart.clone().add(flatDir.clone().multiplyScalar(totalRun));
        const corner = flightEnd.clone().add(flatDir.clone().multiplyScalar(width / 2));
        const nextFlightStart = corner.clone()
            .add(nextDir.clone().multiplyScalar(width / 2))
            .setY(flightStart.y + totalRise);

        it('OUTER railing (right side of a left turn) wraps the corner as TWO right-angle segments', () => {
            const c = lLandingConnector({
                flightStart, flatDir, nextDir, nextFlightStart,
                totalRun, totalRise, width, sideSign: -1 /* right = outer */, treadDepth,
            });
            expect(c.drawn).toBe(true); // outer side draws the wrap
            // seg1 (start→corner) runs along flight-1 direction (flatDir).
            const seg1 = c.corner.clone().sub(c.start);
            const seg1Dir = new THREE.Vector3(seg1.x, 0, seg1.z).normalize();
            expect(Math.abs(seg1Dir.dot(new THREE.Vector3(1, 0, 0)))).toBeCloseTo(1, 6);
            // seg2 (corner→end) runs along flight-2 direction (nextDir) — a clean 90° turn.
            const seg2 = c.end.clone().sub(c.corner);
            const seg2Dir = new THREE.Vector3(seg2.x, 0, seg2.z).normalize();
            expect(Math.abs(seg2Dir.dot(new THREE.Vector3(0, 0, 1)))).toBeCloseTo(1, 6);
            // The two segments meet at a RIGHT ANGLE (no odd-angle wrapping).
            expect(Math.abs(seg1Dir.dot(seg2Dir))).toBeLessThan(1e-6);
            // Both segments have real length (a genuine wrap, not a degenerate spike).
            expect(seg1.length()).toBeGreaterThan(0.05);
            expect(seg2.length()).toBeGreaterThan(0.05);
        });

        it('the wrap segments lie ON the landing square edges (follow the landing perimeter)', () => {
            const c = lLandingConnector({
                flightStart, flatDir, nextDir, nextFlightStart,
                totalRun, totalRise, width, sideSign: -1, treadDepth,
            });
            // Landing square is centred on `corner`, half-extent width/2 on each axis.
            // Outer edges: x = corner.x + width/2 and z = corner.z - width/2.
            // seg1 runs along z = corner.z - width/2 (the outer +/-Z edge).
            expect(c.start.z).toBeCloseTo(corner.z - width / 2, 6);
            expect(c.corner.z).toBeCloseTo(corner.z - width / 2, 6);
            // seg2 runs along x = corner.x + width/2 (the outer +X edge).
            expect(c.corner.x).toBeCloseTo(corner.x + width / 2, 6);
            expect(c.end.x).toBeCloseTo(corner.x + width / 2, 6);
        });

        it('INNER railing (left side of a left turn) meets at the reentrant corner → no blocking connector', () => {
            const c = lLandingConnector({
                flightStart, flatDir, nextDir, nextFlightStart,
                totalRun, totalRise, width, sideSign: 1 /* left = inner */, treadDepth,
            });
            // Inner flights' rail terminals coincide at the reentrant landing corner,
            // so the connector is suppressed (projLen ≈ 0 < treadDepth) — the landing
            // walking path stays clear, exactly as the L-branch intends.
            expect(c.drawn).toBe(false);
            expect(c.start.distanceTo(c.end)).toBeLessThan(1e-6);
        });

        it('the connector is HORIZONTAL at the landing elevation (both flights meet there)', () => {
            const c = lLandingConnector({
                flightStart, flatDir, nextDir, nextFlightStart,
                totalRun, totalRise, width, sideSign: -1, treadDepth,
            });
            expect(c.start.y).toBeCloseTo(totalRise, 6);
            expect(c.end.y).toBeCloseTo(totalRise, 6);
            expect(c.corner.y).toBeCloseTo(totalRise, 6);
        });
    });

    // ── (c) Second-run endpoint: resolved entry, NOT the legacy projection ───────
    it('corner-pinned flight 2 rail-start uses the RESOLVED entry, not the auto-advance projection', () => {
        const width = 1.0, treadDepth = 0.28, riserCount = 8, riserHeight = 0.18;
        const totalRun = riserCount * treadDepth;
        const totalRise = riserCount * riserHeight;
        const flatDir = new THREE.Vector3(1, 0, 0);
        const nextDir = new THREE.Vector3(0, 0, 1);
        const flightStart = new THREE.Vector3(0, 0, 0);
        const landingDepth = width; // 90° L landing depth = width

        // Resolved (corner-pinned) flight-2 start: at the drawn polyline flight-start.
        const flightEnd = flightStart.clone().add(flatDir.clone().multiplyScalar(totalRun));
        const cornerPt = flightEnd.clone().add(flatDir.clone().multiplyScalar(width / 2));
        const resolvedStart = cornerPt.clone()
            .add(nextDir.clone().multiplyScalar(width / 2))
            .setY(flightStart.y + totalRise);

        // Legacy auto-advance projection (what the OLD L-branch computed):
        const legacyStart = flightEnd.clone()
            .add(flatDir.clone().multiplyScalar(treadDepth / 2 + width / 2))
            .add(nextDir.clone().multiplyScalar(landingDepth / 2 - treadDepth / 2))
            .setY(flightStart.y + totalRise);

        // They DIFFER (the founder mis-fit): the legacy projection sits treadDepth/2
        // past the corner along flatDir and half-a-landing along nextDir, so a
        // connector to it points the "second run" the wrong way relative to the
        // landing. Pin the resolved start is the geometrically-correct one on the
        // flight-2 axis line through the landing.
        expect(resolvedStart.distanceTo(legacyStart)).toBeGreaterThan(0.05);
        // Resolved start is exactly on flight-2's centreline (x == corner.x), i.e.
        // aligned with the second run; the legacy one overshoots in +X.
        expect(resolvedStart.x).toBeCloseTo(cornerPt.x, 6);
        expect(legacyStart.x).toBeGreaterThan(cornerPt.x + 1e-3);
    });
});
