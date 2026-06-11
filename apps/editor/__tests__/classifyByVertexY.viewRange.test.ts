// @vitest-environment happy-dom
//
// §VIEW-RANGE-BELOW (founder 2026-06-11) — the plan-view edge classifier must honour
// the active VISIBILITY INTENT's View Range `belowLevelDepth`. The bug: the "Architectural
// Plan — Current Level Only" intent sets belowLevelDepth = 0 ("does NOT show the storey
// below"), yet the plan still rendered storey-below ghost linework, because
// `classifyByVertexY` tagged EVERY below-floor segment as :beyond (no lower bound) and was
// never given the beyond-zone floor `belowY`. Fix: pass belowY; a below-floor segment is
// :beyond ONLY inside [belowY, floorY); with belowY=null (belowLevelDepth=0) the storey
// below is suppressed (dropped). See EdgeProjectorService.classifyByVertexY +
// ViewRangeIntentResolver (the canonical contract).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { classifyByVertexY } from '../src/engine/views/EdgeProjectorService.js';

/** Build a line-segment BufferGeometry from flat [x,y,z, x,y,z, …] pairs. */
function segGeo(positions: number[]): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    return g;
}
const vcount = (g: THREE.BufferGeometry | null): number =>
    g ? (g.getAttribute('position') as THREE.BufferAttribute).count : 0;

const CUT = 1.2;      // cut plane (m above floor) — a typical plan cut height
const FLOOR = 0;      // level floor elevation

// Four representative segments (each a vertex pair):
//   A — AT the cut plane            → :cut
//   B — above the floor, below cut  → :projection (current level)
//   C — below the floor, within the beyond zone [belowY, floor)
//   D — below the floor, BELOW the beyond zone (deeper than belowLevelDepth)
const A = [0, CUT, 0,  1, CUT, 0];     // cut
const B = [0, 0.5, 0,  1, 0.8, 0];     // projection (avgY 0.65 > floor)
const C = [0, -0.5, 0, 1, -0.5, 0];    // beyond (avgY -0.5)
const D = [0, -2.0, 0, 1, -2.0, 0];    // deep below (avgY -2.0)

describe('§VIEW-RANGE-BELOW — classifyByVertexY honours the beyond zone', () => {
    it('belowLevelDepth = 0 (belowY = null) SUPPRESSES the storey below (no :beyond)', () => {
        const { cutGeo, projGeo, beyondGeo } = classifyByVertexY(segGeo([...A, ...B, ...C, ...D]), CUT, FLOOR, 0.15, null);
        expect(vcount(cutGeo)).toBe(2);    // A kept as cut
        expect(vcount(projGeo)).toBe(2);   // B kept as projection
        expect(beyondGeo).toBeNull();      // C + D dropped — the storey below is not shown
    });

    it('belowLevelDepth = 1.2 (belowY = floor−1.2) shows only the beyond zone, drops deeper edges', () => {
        const belowY = FLOOR - 1.2;        // -1.2
        const { cutGeo, projGeo, beyondGeo } = classifyByVertexY(segGeo([...A, ...B, ...C, ...D]), CUT, FLOOR, 0.15, belowY);
        expect(vcount(cutGeo)).toBe(2);    // A
        expect(vcount(projGeo)).toBe(2);   // B
        expect(vcount(beyondGeo)).toBe(2); // C only (avgY -0.5 ∈ [-1.2, 0)); D (-2.0) dropped
    });

    it('no floorY (non-plan / floorY null) keeps the legacy behaviour — nothing classified as beyond', () => {
        const { beyondGeo } = classifyByVertexY(segGeo([...A, ...B, ...C, ...D]), CUT, null, 0.15, null);
        expect(beyondGeo).toBeNull();
    });
});
