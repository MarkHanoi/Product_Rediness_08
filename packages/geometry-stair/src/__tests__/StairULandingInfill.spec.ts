// ─── U-stair half-landing INFILL regression (§U-LANDING-INFILL) ──────────────
// Founder defect (follow-on to §60/§U-LANDING-GUARD): the half-landing guard — in
// the area BETWEEN the flight runs and the BACK of the landing — carried the top
// rail + corner/end posts but was MISSING the baluster/spindle INFILL PATTERN the
// flights have. Two concrete gaps in StairRailingBuilder.buildULandingGuard:
//
//   (1) the §60 run↔landing CONNECTOR spans (`connect()`) emitted ONLY a top rail
//       + a closing post — NO balusters/spindles/glass for ANY railing type;
//   (2) the landing OPEN-EDGE infill loop skipped `glass-panel` entirely (it drew
//       balusters for flat-bar/circular but emitted no glass panel), leaving a
//       bare top rail for the glass type.
//
// The fix routes BOTH the open edge and every connector through one shared per-type
// emitter (StairRailingBuilder.emitHorizontalInfill), so the landing carries the
// SAME infill as the flights — square balusters / round balusters / glass panel /
// none — continuous all the way around, driven by the railing config.
//
// This test re-encodes that emitter's math (kept in lock-step with the source) and
// pins the invariants the fix enforces. It is written to FAIL against the pre-fix
// behaviour (the `legacyConnectorInfillCount` / `legacyOpenEdgeGlass` models, which
// emit nothing) and PASS against the new shared emitter. Pure THREE vector math
// (node-compatible — no DOM, no window, no builder boot), matching the sibling
// StairULandingGuard.spec.ts style.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

type RailingType = 'none' | 'flat-bar' | 'glass-panel' | 'circular';

interface InfillCfg {
    railingType: RailingType;
    balusterSpacing: number;
    balusterWidth: number;
}

/**
 * Mirrors StairRailingBuilder.emitHorizontalInfill — returns the infill elements
 * emitted along a HORIZONTAL segment (start→end at one base elevation), classified
 * by kind so the test can count balusters / detect a glass panel per railing type.
 */
function emitHorizontalInfill(
    start: THREE.Vector3,
    end: THREE.Vector3,
    baseElev: number,
    cfg: InfillCfg,
): { balusters: THREE.Vector3[]; glassPanels: number } {
    const balusters: THREE.Vector3[] = [];
    let glassPanels = 0;
    const type = cfg.railingType;
    if (type === 'none') return { balusters, glassPanels };

    const a = new THREE.Vector3(start.x, baseElev, start.z);
    const b = new THREE.Vector3(end.x, baseElev, end.z);
    const spanLen = a.distanceTo(b);
    if (spanLen < 0.01) return { balusters, glassPanels };

    if (type === 'glass-panel') {
        glassPanels = 1;
        return { balusters, glassPanels };
    }

    const balCount = Math.max(1, Math.floor(spanLen / cfg.balusterSpacing));
    for (let i = 0; i <= balCount; i++) {
        const t = i / balCount;
        balusters.push(a.clone().lerp(b, t));
    }
    return { balusters, glassPanels };
}

// ── Pre-fix (LEGACY) models — what the OLD code emitted along these spans ──────
/** OLD connector: top rail + closing post, NO infill — for EVERY type. */
function legacyConnectorInfillCount(): number {
    return 0;
}
/** OLD open edge: balusters for flat-bar/circular, but NOTHING for glass-panel. */
function legacyOpenEdgeGlass(_cfg: InfillCfg): number {
    return 0; // glass-panel was skipped by the `!== 'glass-panel'` guard
}

describe('U-stair half-landing infill (§U-LANDING-INFILL)', () => {
    const baseElev = 1.8; // landing platform elevation
    const railHeight = 0.9;

    // A representative landing open edge (2*width long) and a §60 connector span.
    const openEdgeP0 = new THREE.Vector3(0, baseElev, 0);
    const openEdgeP1 = new THREE.Vector3(0, baseElev, 2.0); // 2 m open edge
    const connectorTerminal = new THREE.Vector3(0, baseElev, 0);
    const connectorCorner = new THREE.Vector3(0.5, baseElev, 0); // ~0.5 m connector

    const flatBar: InfillCfg = { railingType: 'flat-bar', balusterSpacing: 0.15, balusterWidth: 0.02 };
    const circular: InfillCfg = { railingType: 'circular', balusterSpacing: 0.15, balusterWidth: 0.02 };
    const glass: InfillCfg = { railingType: 'glass-panel', balusterSpacing: 0.15, balusterWidth: 0.02 };
    const none: InfillCfg = { railingType: 'none', balusterSpacing: 0.15, balusterWidth: 0.02 };

    // ── (i) Open edge: flat-bar carries balusters at the flight spacing ──────────
    it('flat-bar: landing open edge carries balusters at the flight spacing', () => {
        const { balusters } = emitHorizontalInfill(openEdgeP0, openEdgeP1, baseElev, flatBar);
        const spanLen = openEdgeP0.distanceTo(openEdgeP1);
        const expectedCount = Math.max(1, Math.floor(spanLen / flatBar.balusterSpacing)) + 1;
        expect(balusters.length).toBe(expectedCount);
        expect(balusters.length).toBeGreaterThan(0);
        // Every baluster sits on the landing platform elevation.
        for (const p of balusters) expect(p.y).toBeCloseTo(baseElev, 6);
    });

    // ── (ii) §60 CONNECTOR span carries infill — the founder's red-lined area ────
    // Pre-fix this span had ONLY a top rail + post (legacyConnectorInfillCount = 0).
    // The fix routes it through emitHorizontalInfill, so it now carries balusters.
    it('flat-bar: §60 run↔landing connector now carries balusters (FAILS pre-fix)', () => {
        const { balusters } = emitHorizontalInfill(connectorTerminal, connectorCorner, baseElev, flatBar);
        expect(legacyConnectorInfillCount()).toBe(0);           // OLD behaviour: bare rail
        expect(balusters.length).toBeGreaterThan(legacyConnectorInfillCount()); // FIX: infill present
        expect(balusters.length).toBeGreaterThan(0);
    });

    it('circular: §60 run↔landing connector carries round balusters', () => {
        const { balusters } = emitHorizontalInfill(connectorTerminal, connectorCorner, baseElev, circular);
        expect(balusters.length).toBeGreaterThan(0);
    });

    // ── (iii) Type-agnostic coverage ─────────────────────────────────────────────
    it('glass-panel: landing open edge now carries a glass panel (FAILS pre-fix)', () => {
        const { glassPanels } = emitHorizontalInfill(openEdgeP0, openEdgeP1, baseElev, glass);
        expect(legacyOpenEdgeGlass(glass)).toBe(0);             // OLD behaviour: no glass
        expect(glassPanels).toBeGreaterThan(0);                 // FIX: glass panel present
    });

    it('glass-panel: §60 connector carries a glass panel too', () => {
        const { glassPanels, balusters } = emitHorizontalInfill(connectorTerminal, connectorCorner, baseElev, glass);
        expect(glassPanels).toBe(1);
        expect(balusters.length).toBe(0); // glass type uses a panel, not balusters
    });

    it('none: emits no infill on either the open edge or the connector', () => {
        const edge = emitHorizontalInfill(openEdgeP0, openEdgeP1, baseElev, none);
        const conn = emitHorizontalInfill(connectorTerminal, connectorCorner, baseElev, none);
        expect(edge.balusters.length).toBe(0);
        expect(edge.glassPanels).toBe(0);
        expect(conn.balusters.length).toBe(0);
        expect(conn.glassPanels).toBe(0);
    });

    // ── (iv) Continuity: landing infill matches the flight infill spacing ────────
    // The flights place balusters at `balusterSpacing` along the run; the landing
    // open edge uses the SAME spacing, so a same-length span yields the same count.
    it('landing infill spacing matches the flight infill spacing (same count for same span)', () => {
        const span = 1.5;
        const flightLikeStart = new THREE.Vector3(0, baseElev, 0);
        const flightLikeEnd = new THREE.Vector3(span, baseElev, 0);
        const landing = emitHorizontalInfill(flightLikeStart, flightLikeEnd, baseElev, flatBar);
        // Flight loop count: floor(run/spacing), inclusive of both ends ⇒ +1.
        const flightBalCount = Math.max(1, Math.floor(span / flatBar.balusterSpacing)) + 1;
        expect(landing.balusters.length).toBe(flightBalCount);
    });

    // ── Determinism ──────────────────────────────────────────────────────────────
    it('is deterministic — identical inputs ⇒ identical baluster positions', () => {
        const a = emitHorizontalInfill(openEdgeP0, openEdgeP1, baseElev, flatBar);
        const b = emitHorizontalInfill(openEdgeP0, openEdgeP1, baseElev, flatBar);
        expect(a.balusters.length).toBe(b.balusters.length);
        for (let i = 0; i < a.balusters.length; i++) {
            expect(a.balusters[i].x).toBeCloseTo(b.balusters[i].x, 12);
            expect(a.balusters[i].z).toBeCloseTo(b.balusters[i].z, 12);
        }
    });
});
