// §CTX-HEIGHT-PROVENANCE (L-459) — a context building's height must SAY how it was obtained.
//
// The defect this guards is not that a 9 m default exists — some default is unavoidable when OSM
// carries no height. It is that the default was rendered INDISTINGUISHABLY from a surveyed
// number: no provenance field, no badge, no caveat. A user comparing their proposal against a
// neighbouring "9 m" building — for shadow, for daylight, for a party-wall study — was reading a
// fabricated number as context. C58 §1.4 forbids exactly that shape of failure in the compliance
// layer; this is the same failure in the geospatial layer.
//
// The tests that matter here are the ones asserting a guess is LABELLED as a guess.

import { describe, it, expect } from 'vitest';
import {
    overpassToCollection,
    summariseContextHeightProvenance,
    type ContextBuildingCollection,
} from '../src/ui/geospatial/contextBuildings';

/** A minimal closed square way, with whatever tags the test needs. */
function way(id: number, tags: Record<string, string> | undefined) {
    return {
        type: 'way' as const,
        id,
        tags,
        geometry: [
            { lat: 41.4, lon: 2.18 },
            { lat: 41.4, lon: 2.181 },
            { lat: 41.401, lon: 2.181 },
            { lat: 41.401, lon: 2.18 },
            { lat: 41.4, lon: 2.18 },
        ],
    };
}

const propsOf = (c: ContextBuildingCollection, i = 0) => c.features[i]!.properties;

describe('L-459 — resolveHeight now reports WHICH branch produced the number', () => {
    it('an explicit `height` tag → provenance "tagged"', () => {
        const c = overpassToCollection([way(1, { building: 'yes', height: '34' })]);
        expect(propsOf(c).heightM).toBeCloseTo(34, 6);
        expect(propsOf(c).heightProvenance).toBe('tagged');
    });

    it('`building:height` also counts as tagged', () => {
        const c = overpassToCollection([way(2, { building: 'yes', 'building:height': '21' })]);
        expect(propsOf(c).heightProvenance).toBe('tagged');
    });

    it('`building:levels` → "derived-levels", NOT "tagged"', () => {
        // The distinction is the point: the storey COUNT is real, the 3.2 m storey height is
        // ours. A 6-storey building genuinely has 6 storeys; whether it is 19.2 m is our
        // assumption, and conflating the two is how an assumption becomes a "measurement".
        const c = overpassToCollection([way(3, { building: 'yes', 'building:levels': '6' })]);
        expect(propsOf(c).heightProvenance).toBe('derived-levels');
        expect(propsOf(c).heightM).toBeGreaterThan(15);
    });

    it('NO usable tag → "assumed" — the 9 m default is labelled a fabrication', () => {
        // THE CENTRAL TEST. Before L-459 this was indistinguishable from the 34 m above.
        const c = overpassToCollection([way(4, { building: 'yes' })]);
        expect(propsOf(c).heightM).toBe(9);
        expect(propsOf(c).heightProvenance).toBe('assumed');
    });

    it('a zero / negative / junk height falls through to assumed, not to a bad "tagged"', () => {
        // A tag that PARSES but is nonsense must not inherit the credibility of a real one.
        for (const bad of ['0', '-5', 'about 12 m', '']) {
            const c = overpassToCollection([way(5, { building: 'yes', height: bad })]);
            expect(propsOf(c).heightProvenance).not.toBe('tagged');
        }
    });
});

describe('L-459 — the summary is what makes the fabrication visible', () => {
    it('counts each provenance and reports the fabricated fraction', () => {
        const c = overpassToCollection([
            way(1, { building: 'yes', height: '30' }),
            way(2, { building: 'yes', 'building:levels': '4' }),
            way(3, { building: 'yes' }),
            way(4, { building: 'yes' }),
        ]);
        const s = summariseContextHeightProvenance(c);
        expect(s.total).toBe(4);
        expect(s.tagged).toBe(1);
        expect(s.derivedLevels).toBe(1);
        expect(s.assumed).toBe(2);
        expect(s.assumedFraction).toBeCloseTo(0.5, 6);
    });

    it('a MISSING provenance counts as assumed — never as tagged', () => {
        // Collections cached before L-459 carry no provenance. Reading absence optimistically
        // would silently re-hide precisely what this exists to expose, and it would do so only
        // for returning users — the worst possible distribution for a defect.
        const legacy: ContextBuildingCollection = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [[[2.18, 41.4], [2.181, 41.4], [2.181, 41.401], [2.18, 41.4]]] },
                    properties: { heightM: 9, osmId: 99 },
                },
            ],
        };
        const s = summariseContextHeightProvenance(legacy);
        expect(s.assumed).toBe(1);
        expect(s.tagged).toBe(0);
        expect(s.assumedFraction).toBe(1);
    });

    it('an empty collection reports 0, not NaN', () => {
        const s = summariseContextHeightProvenance({ type: 'FeatureCollection', features: [] });
        expect(s.total).toBe(0);
        expect(s.assumedFraction).toBe(0);
    });

    it('a well-mapped area reports a LOW fabricated fraction — the metric must move', () => {
        // Guards against a summary that always says "mostly fabricated" regardless of input,
        // which would be a different way of telling the user nothing.
        const c = overpassToCollection([
            way(1, { building: 'yes', height: '30' }),
            way(2, { building: 'yes', height: '12' }),
            way(3, { building: 'yes', height: '18' }),
            way(4, { building: 'yes' }),
        ]);
        expect(summariseContextHeightProvenance(c).assumedFraction).toBeCloseTo(0.25, 6);
    });
});
