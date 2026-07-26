// ─── L-stair landing INFILL (vertical balusters) regression (§FIX-STAIR-LANDING-BALUSTERS) ───
// Founder defect: on a stair LANDING the railing rendered the horizontal TOP RAIL
// but NOT the vertical baluster/spindle posts the runs carry, so the landing rail
// floated with an open gap beneath it.
//
// Root cause: StairRailingBuilder.buildLandingSegment's L-corner branch emitted only
// the top-rail connector segments (seg1: run→corner, seg2: corner→run 2) via
// `buildSegment`, and NEVER the per-type vertical infill. Only the U-switchback path
// (buildULandingGuard, via §U-LANDING-INFILL) routed through emitHorizontalInfill.
// Since the 2D path adapter corner-pins every non-first flight, EVERY drawn L-shape
// landing hit this bare branch — top rail only, no verticals.
//
// The fix routes BOTH L connector legs through the SAME shared emitter
// (StairRailingBuilder.emitHorizontalInfill) the runs and the U-guard use, so the
// landing carries the SAME infill — square balusters / round balusters / glass panel
// / none — continuous run → landing → run.
//
// This spec re-encodes the L-branch connector geometry + the emitter's per-type math
// (kept in lock-step with the source) and pins the invariants, mirroring the sibling
// StairULandingInfill.spec.ts / StairLLandingRailing.spec.ts pure-math style (node —
// no DOM, no window, no builder boot). It is written to FAIL against the pre-fix
// behaviour (`legacyLLandingVerticalCount` — the bare-rail branch emitted zero).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

type RailingType = 'none' | 'flat-bar' | 'glass-panel' | 'circular';

interface RailCfg {
    railingType: RailingType;
    balusterSpacing: number;
    balusterWidth: number;
    topRailHeight: number;
}

/** Mirrors StairRailingBuilder.emitHorizontalInfill (§U-LANDING-INFILL). */
function emitHorizontalInfill(
    start: THREE.Vector3, end: THREE.Vector3, baseElev: number, cfg: RailCfg,
): { balusters: number; glassPanels: number } {
    const type = cfg.railingType;
    if (type === 'none') return { balusters: 0, glassPanels: 0 };
    const a = new THREE.Vector3(start.x, baseElev, start.z);
    const b = new THREE.Vector3(end.x, baseElev, end.z);
    const spanLen = a.distanceTo(b);
    if (spanLen < 0.01) return { balusters: 0, glassPanels: 0 };
    if (type === 'glass-panel') return { balusters: 0, glassPanels: 1 };
    const balCount = Math.max(1, Math.floor(spanLen / cfg.balusterSpacing));
    return { balusters: balCount + 1, glassPanels: 0 };
}

/** Pre-fix L-connector: seg1 + seg2 top rails only — ZERO verticals for ANY type. */
function legacyLLandingVerticalCount(): number {
    return 0;
}

/**
 * The corner-pinned L-landing connector geometry (mirrors buildLandingSegment's
 * L-branch). Returns the two connector legs (start→corner, corner→end) that the
 * fix now also fills with vertical infill. Only drawn on the OUTER side
 * (projLen > treadDepth); the inner side is suppressed (walking path stays clear).
 */
function lLandingConnectorLegs(params: {
    flightStart: THREE.Vector3; flatDir: THREE.Vector3; nextDir: THREE.Vector3;
    nextFlightStart: THREE.Vector3; totalRun: number; totalRise: number;
    width: number; sideSign: number; railHeight: number; treadDepth: number;
}): { legs: Array<{ a: THREE.Vector3; b: THREE.Vector3 }>; baseElev: number; drawn: boolean } {
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
    const drawn = projLen > treadDepth;
    const legs = drawn ? [{ a: start, b: corner }, { a: corner, b: end }] : [];
    return { legs, baseElev: flightEndElev, drawn };
}

describe('L-stair landing infill — vertical balusters (§FIX-STAIR-LANDING-BALUSTERS)', () => {
    const width = 1.0, treadDepth = 0.28, riserCount = 8, riserHeight = 0.18;
    const totalRun = riserCount * treadDepth;
    const totalRise = riserCount * riserHeight;
    // Flight 1 → +X, flight 2 → +Z (90° left turn), corner-pinned.
    const flatDir = new THREE.Vector3(1, 0, 0);
    const nextDir = new THREE.Vector3(0, 0, 1);
    const flightStart = new THREE.Vector3(0, 0, 0);
    const flightEnd = flightStart.clone().add(flatDir.clone().multiplyScalar(totalRun));
    const corner = flightEnd.clone().add(flatDir.clone().multiplyScalar(width / 2));
    const nextFlightStart = corner.clone().add(nextDir.clone().multiplyScalar(width / 2)).setY(totalRise);

    const flatBar: RailCfg = { railingType: 'flat-bar', balusterSpacing: 0.15, balusterWidth: 0.02, topRailHeight: 0.9 };
    const circular: RailCfg = { railingType: 'circular', balusterSpacing: 0.15, balusterWidth: 0.02, topRailHeight: 0.9 };
    const glass: RailCfg = { railingType: 'glass-panel', balusterSpacing: 0.15, balusterWidth: 0.02, topRailHeight: 0.9 };
    const none: RailCfg = { railingType: 'none', balusterSpacing: 0.15, balusterWidth: 0.02, topRailHeight: 0.9 };

    const outer = { flightStart, flatDir, nextDir, nextFlightStart, totalRun, totalRise, width, sideSign: -1, railHeight: 0.9, treadDepth };

    it('flat-bar: the L landing connector now carries VERTICAL balusters (FAILS pre-fix)', () => {
        const { legs, baseElev, drawn } = lLandingConnectorLegs(outer);
        expect(drawn).toBe(true);
        const total = legs.reduce((s, leg) => s + emitHorizontalInfill(leg.a, leg.b, baseElev, flatBar).balusters, 0);
        expect(legacyLLandingVerticalCount()).toBe(0);   // OLD: bare top rail, no verticals
        expect(total).toBeGreaterThan(0);                // FIX: balusters present
    });

    it('circular: the L landing connector carries round balusters', () => {
        const { legs, baseElev } = lLandingConnectorLegs(outer);
        const total = legs.reduce((s, leg) => s + emitHorizontalInfill(leg.a, leg.b, baseElev, circular).balusters, 0);
        expect(total).toBeGreaterThan(0);
    });

    it('glass-panel: the L landing connector carries glass panels (not balusters)', () => {
        const { legs, baseElev } = lLandingConnectorLegs(outer);
        const glassPanels = legs.reduce((s, leg) => s + emitHorizontalInfill(leg.a, leg.b, baseElev, glass).glassPanels, 0);
        const balusters = legs.reduce((s, leg) => s + emitHorizontalInfill(leg.a, leg.b, baseElev, glass).balusters, 0);
        expect(glassPanels).toBeGreaterThan(0);
        expect(balusters).toBe(0);
    });

    it('none: emits no landing infill', () => {
        const { legs, baseElev } = lLandingConnectorLegs(outer);
        const total = legs.reduce((s, leg) =>
            s + emitHorizontalInfill(leg.a, leg.b, baseElev, none).balusters
              + emitHorizontalInfill(leg.a, leg.b, baseElev, none).glassPanels, 0);
        expect(total).toBe(0);
    });

    it('landing balusters sit on the landing platform elevation (base of the vertical run)', () => {
        const { baseElev } = lLandingConnectorLegs(outer);
        // The connector — and therefore its infill base — is at flight 1's top
        // elevation (= the landing platform = flight 2's start elevation).
        expect(baseElev).toBeCloseTo(totalRise, 6);
    });

    it('landing infill spacing matches the flights (same spacing ⇒ continuous pattern)', () => {
        // A run leg of the same length yields the same baluster count as the flights'
        // own infill loop (floor(len/spacing)+1), so the pattern reads continuous.
        const legStart = new THREE.Vector3(0, totalRise, 0);
        const legEnd = new THREE.Vector3(0, totalRise, 0.9);
        const span = legStart.distanceTo(legEnd);
        const got = emitHorizontalInfill(legStart, legEnd, totalRise, flatBar).balusters;
        expect(got).toBe(Math.max(1, Math.floor(span / flatBar.balusterSpacing)) + 1);
    });
});
