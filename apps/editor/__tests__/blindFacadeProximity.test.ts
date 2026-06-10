// PW.2 (§DIAG-PARTY-WALL) — pure proximity / blind-façade detection tests.
//
// All coordinates are editor world-XZ metres. A shell wall is BLIND when a
// neighbour footprint edge runs roughly parallel + within setback + on the OUTWARD
// side. These tests exercise each gate (proximity, parallel, span, outward side)
// and the additive-identity (no neighbours ⇒ no blind walls).

import { describe, it, expect } from 'vitest';
import {
    computeBlindFacadeHits,
    DEFAULT_PROXIMITY_CONFIG,
    type ProximityShellWall,
    type ProximityFootprint,
} from '../src/ui/apartment-layout/blindFacadeProximity';

/** A simple 10 m × 6 m building shell centred on the origin, walls CCW.
 *  - north wall (top, z = -3): runs along +x
 *  - east, south, west complete the box. interior centroid ≈ (0,0). */
const SHELL: ProximityShellWall[] = [
    { id: 'w-north', start: { x: -5, z: -3 }, end: { x: 5, z: -3 } },
    { id: 'w-east', start: { x: 5, z: -3 }, end: { x: 5, z: 3 } },
    { id: 'w-south', start: { x: 5, z: 3 }, end: { x: -5, z: 3 } },
    { id: 'w-west', start: { x: -5, z: 3 }, end: { x: -5, z: -3 } },
];

/** Centroid of all shell endpoints (the building interior). */
const INTERIOR = { x: 0, z: 0 };

function blindIds(
    footprints: ProximityFootprint[],
    cfg = { ...DEFAULT_PROXIMITY_CONFIG, interiorPoint: INTERIOR },
): string[] {
    return computeBlindFacadeHits(SHELL, footprints, cfg).map(h => h.wallId).sort();
}

describe('computeBlindFacadeHits — blind-façade proximity', () => {
    it('marks the wall blind when a neighbour edge is within setback + parallel + outward', () => {
        // A neighbour wall 0.5 m OUTSIDE the north wall (z = -3.5), parallel along x.
        const neighbour: ProximityFootprint = {
            ring: [
                { x: -5, z: -3.5 }, { x: 5, z: -3.5 },
                { x: 5, z: -8 }, { x: -5, z: -8 },
            ],
        };
        expect(blindIds([neighbour])).toEqual(['w-north']);
    });

    it('PARTY wall (touching, distance 0) is blind', () => {
        const neighbour: ProximityFootprint = {
            ring: [
                { x: -5, z: -3 }, { x: 5, z: -3 },
                { x: 5, z: -9 }, { x: -5, z: -9 },
            ],
        };
        expect(blindIds([neighbour])).toEqual(['w-north']);
    });

    it('does NOT mark a wall blind when the neighbour is beyond the setback', () => {
        // Neighbour edge 3 m away (setback default 1 m) → not blind.
        const neighbour: ProximityFootprint = {
            ring: [
                { x: -5, z: -6 }, { x: 5, z: -6 },
                { x: 5, z: -10 }, { x: -5, z: -10 },
            ],
        };
        expect(blindIds([neighbour])).toEqual([]);
    });

    it('does NOT mark a wall blind for a PERPENDICULAR neighbour edge (not parallel)', () => {
        // A neighbour edge running in z near the north wall but perpendicular to it.
        const neighbour: ProximityFootprint = {
            ring: [
                { x: 0, z: -3.5 }, { x: 0, z: -10 },
                { x: 1, z: -10 }, { x: 1, z: -3.5 },
            ],
        };
        // The x-running edges of this ring are at z=-3.5 but span only x∈[0,1] near
        // the wall midpoint (x=0) — still parallel + close, so this is actually a
        // close parallel fragment. Move it well off to the side to test rejection:
        const offToSide: ProximityFootprint = {
            ring: [
                { x: 20, z: -3.2 }, { x: 20, z: -10 },
                { x: 21, z: -10 }, { x: 21, z: -3.2 },
            ],
        };
        expect(blindIds([offToSide])).toEqual([]);
        // The first ring DOES have a close parallel edge near the midpoint → blind.
        expect(blindIds([neighbour])).toEqual(['w-north']);
    });

    it('does NOT mark a wall blind when the neighbour is on the INWARD side', () => {
        // A footprint INSIDE the box near the north wall (z = -2.5, inward of z=-3).
        const insideNeighbour: ProximityFootprint = {
            ring: [
                { x: -4, z: -2.5 }, { x: 4, z: -2.5 },
                { x: 4, z: -1 }, { x: -4, z: -1 },
            ],
        };
        expect(blindIds([insideNeighbour])).toEqual([]);
    });

    it('ADDITIVE IDENTITY: no neighbours ⇒ no blind walls', () => {
        expect(blindIds([])).toEqual([]);
        expect(computeBlindFacadeHits(SHELL, [])).toHaveLength(0);
        expect(computeBlindFacadeHits([], [{ ring: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] }])).toHaveLength(0);
    });

    it('respects a custom setback (configurable threshold)', () => {
        // Neighbour 2.5 m away — blind only when setback ≥ 2.5.
        const neighbour: ProximityFootprint = {
            ring: [
                { x: -5, z: -5.5 }, { x: 5, z: -5.5 },
                { x: 5, z: -9 }, { x: -5, z: -9 },
            ],
        };
        expect(blindIds([neighbour])).toEqual([]); // default 1 m → not blind
        expect(blindIds([neighbour], { ...DEFAULT_PROXIMITY_CONFIG, setbackM: 3, interiorPoint: INTERIOR }))
            .toEqual(['w-north']); // 3 m → blind
    });

    it('marks the correct multiple walls when neighbours abut more than one façade', () => {
        const northNbr: ProximityFootprint = {
            ring: [{ x: -5, z: -3.5 }, { x: 5, z: -3.5 }, { x: 5, z: -8 }, { x: -5, z: -8 }],
        };
        const eastNbr: ProximityFootprint = {
            ring: [{ x: 5.5, z: -3 }, { x: 9, z: -3 }, { x: 9, z: 3 }, { x: 5.5, z: 3 }],
        };
        expect(blindIds([northNbr, eastNbr])).toEqual(['w-east', 'w-north']);
    });
});
