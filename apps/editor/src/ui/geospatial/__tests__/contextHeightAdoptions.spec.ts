// §CTX-HEIGHT-ADOPTION (L-1663) — the honesty contract of adopted context heights.
//
// The behaviours worth pinning are the GUARDS, not the happy path: an adoption must never
// override real tile data (that is what lets the Catastro bake join retire the table silently),
// must select by CONTAINMENT (a near-miss adopts nothing), and must stamp `derived-levels` +
// a citable source — never `tagged`, never silence.

import { describe, expect, it } from 'vitest';
import {
    ADOPTION_METRES_PER_LEVEL,
    adoptionPointInRing,
    applyContextHeightAdoptions,
    CONTEXT_HEIGHT_ADOPTIONS,
    type ContextHeightAdoption,
} from '../contextHeightAdoptions';

/** A closed square ring around (lon, lat), GeoJSON [lon, lat] order. */
const square = (lon: number, lat: number, h: number): number[][] => [
    [lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h],
];

const A: ContextHeightAdoption = {
    lat: 41.3981329,
    lon: 2.2054181,
    floorsAboveGround: 6,
    refcat: '3634514DF3833D',
    source: 'test',
};

function feat(ring: number[][], heightM = 9, heightProvenance = 'assumed') {
    return {
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { heightM, heightProvenance } as {
            heightM: number; heightProvenance?: string; floors?: number; adoptedHeightSource?: string;
        },
    };
}

describe('§CTX-HEIGHT-ADOPTION (L-1663)', () => {
    it('adopts a real floor count onto a containing assumed-height footprint, as derived-levels', () => {
        const f = feat(square(A.lon, A.lat, 0.0003));
        const n = applyContextHeightAdoptions([f], [A]);
        expect(n).toBe(1);
        expect(f.properties.heightM).toBeCloseTo(6 * ADOPTION_METRES_PER_LEVEL, 6);
        expect(f.properties.heightProvenance).toBe('derived-levels'); // NEVER 'tagged'
        expect(f.properties.floors).toBe(6);
        expect(f.properties.adoptedHeightSource).toContain('3634514DF3833D');
    });

    it('NEVER overrides tagged or measured-lidar tile data — the bake fix retires the table', () => {
        const tagged = feat(square(A.lon, A.lat, 0.0003), 21.5, 'tagged');
        const lidar = feat(square(A.lon, A.lat, 0.0003), 20.1, 'measured-lidar');
        expect(applyContextHeightAdoptions([tagged, lidar], [A])).toBe(0);
        expect(tagged.properties.heightM).toBe(21.5);
        expect(lidar.properties.heightM).toBe(20.1);
    });

    it('containment, not proximity: a footprint NEXT DOOR adopts nothing', () => {
        const nextDoor = feat(square(A.lon + 0.001, A.lat, 0.0003));
        expect(applyContextHeightAdoptions([nextDoor], [A])).toBe(0);
        expect(nextDoor.properties.heightM).toBe(9);
        expect(nextDoor.properties.adoptedHeightSource).toBeUndefined();
    });

    it('an empty adoption table is a no-op scan', () => {
        const f = feat(square(A.lon, A.lat, 0.0003));
        expect(applyContextHeightAdoptions([f], [])).toBe(0);
        expect(f.properties.heightM).toBe(9);
    });

    it('the shipped §DEMO-PATCH table carries exactly the two Poblenou parcels, floors from Catastro', () => {
        expect(CONTEXT_HEIGHT_ADOPTIONS.map((a) => a.refcat).sort()).toEqual([
            '3634514DF3833D',
            '3634515DF3833D',
        ]);
        for (const a of CONTEXT_HEIGHT_ADOPTIONS) {
            expect(a.floorsAboveGround).toBe(6);
            expect(a.source).toContain('Catastro');
        }
    });

    it('adoptionPointInRing: even-odd basics', () => {
        const ring = square(2.0, 41.0, 0.001);
        expect(adoptionPointInRing(2.0, 41.0, ring)).toBe(true);
        expect(adoptionPointInRing(2.01, 41.0, ring)).toBe(false);
    });
});
