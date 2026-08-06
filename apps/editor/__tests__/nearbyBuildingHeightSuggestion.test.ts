// §NEARBY-HEIGHT-SUGGESTION (2026-08-05) — tests for `suggestZoneFromNearbyHeights`. Proves the
// honesty properties from the module's own header: never throws, never invents a value, and
// excludes fabricated (`assumed`) heights from the aggregate.

import { describe, it, expect, vi } from 'vitest';
import { suggestZoneFromNearbyHeights } from '../src/ui/site/nearbyBuildingHeightSuggestion';
import type { ContextBuildingCollection, ContextHeightProvenance } from '../src/ui/geospatial/contextBuildings';

const ORIGIN = { lat: 37.9000, lon: -4.7512 };

/** A small square footprint offset `dLat`/`dLon` degrees from ORIGIN (roughly metres via *111000). */
function footprint(
    dLat: number,
    dLon: number,
    heightM: number,
    heightProvenance: ContextHeightProvenance | undefined,
    id: number,
): ContextBuildingCollection['features'][number] {
    const clat = ORIGIN.lat + dLat;
    const clon = ORIGIN.lon + dLon;
    const half = 0.00005;
    const ring: [number, number][] = [
        [clon - half, clat - half],
        [clon + half, clat - half],
        [clon + half, clat + half],
        [clon - half, clat + half],
        [clon - half, clat - half],
    ];
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
            heightM,
            ...(heightProvenance !== undefined ? { heightProvenance } : {}),
            osmId: id,
            osmIdSource: 'osm',
        },
    };
}

const KNOWN_OPTIONS = [
    { code: 'UAD-2', maxHeight_m: 7 },
    { code: 'PAS-1', maxHeight_m: 12.75 },
    { code: 'PAS-3', maxHeight_m: 19.5 },
    { code: 'OA-1', maxHeight_m: 21 },
];

describe('suggestZoneFromNearbyHeights — honesty guards', () => {
    it('returns null on invalid lat/lon without calling fetchBuildings', async () => {
        const fetchBuildings = vi.fn();
        const result = await suggestZoneFromNearbyHeights(NaN, -4.75, KNOWN_OPTIONS, { fetchBuildings });
        expect(result).toBeNull();
        expect(fetchBuildings).not.toHaveBeenCalled();
    });

    it('returns null when knownOptions is empty', async () => {
        const fetchBuildings = vi.fn();
        const result = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, [], { fetchBuildings });
        expect(result).toBeNull();
        expect(fetchBuildings).not.toHaveBeenCalled();
    });

    it('returns null on a fetch failure (never throws)', async () => {
        const fetchBuildings = vi.fn().mockRejectedValue(new Error('network down'));
        const result = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, { fetchBuildings });
        expect(result).toBeNull();
    });

    it('returns null when the collection has zero features', async () => {
        const fetchBuildings = vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] });
        const result = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, { fetchBuildings });
        expect(result).toBeNull();
    });

    it('returns null when every nearby footprint is `assumed` (fabricated) — never guesses from a fabricated default', async () => {
        const fetchBuildings = vi.fn().mockResolvedValue({
            type: 'FeatureCollection',
            features: [
                footprint(0.0001, 0.0001, 9, 'assumed', 1),
                footprint(-0.0001, 0.0002, 9, undefined, 2), // absent ⇒ treated as assumed too
            ],
        });
        const result = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, { fetchBuildings });
        expect(result).toBeNull();
    });

    it('excludes footprints outside the search radius', async () => {
        const fetchBuildings = vi.fn().mockResolvedValue({
            type: 'FeatureCollection',
            features: [
                // ~0.5° away — nowhere near the 80 m default radius.
                footprint(0.5, 0.5, 12.75, 'tagged', 1),
            ],
        });
        const result = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, { fetchBuildings });
        expect(result).toBeNull();
    });
});

describe('suggestZoneFromNearbyHeights — real match behaviour', () => {
    it('picks the closest-maxHeight_m zone from the REAL median, citing the real sample count', async () => {
        const fetchBuildings = vi.fn().mockResolvedValue({
            type: 'FeatureCollection',
            features: [
                footprint(0.0001, 0.0001, 12.0, 'tagged', 1),
                footprint(-0.0001, 0.0001, 13.0, 'tagged', 2),
                footprint(0.0001, -0.0001, 13.5, 'derived-levels', 3),
                // an assumed (fabricated) footprint nearby — must NOT pull the median.
                footprint(0.0002, 0.0002, 100, 'assumed', 4),
            ],
        });
        const result = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, { fetchBuildings });
        expect(result).not.toBeNull();
        expect(result!.suggestedCode).toBe('PAS-1'); // maxHeight_m 12.75 — closest to median 13.0
        expect(result!.sampleCount).toBe(3); // the assumed one is excluded
        expect(result!.medianHeightM).toBeCloseTo(13.0, 5);
    });

    it('includes measured-lidar samples as real', async () => {
        const fetchBuildings = vi.fn().mockResolvedValue({
            type: 'FeatureCollection',
            features: [
                footprint(0.0001, 0.0001, 19.0, 'measured-lidar', 1),
                footprint(-0.0001, 0.0001, 20.0, 'measured-lidar', 2),
            ],
        });
        const result = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, { fetchBuildings });
        expect(result).not.toBeNull();
        expect(result!.suggestedCode).toBe('PAS-3'); // maxHeight_m 19.5 — closest to median 19.5
        expect(result!.sampleCount).toBe(2);
    });

    it('respects an injected radiusM override', async () => {
        const fetchBuildings = vi.fn().mockResolvedValue({
            type: 'FeatureCollection',
            // ~0.001 deg ≈ 111 m north — outside a tight 20 m radius, inside a generous 200 m one.
            features: [footprint(0.001, 0, 7, 'tagged', 1)],
        });
        const tight = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, {
            fetchBuildings,
            radiusM: 20,
        });
        expect(tight).toBeNull();

        const wide = await suggestZoneFromNearbyHeights(ORIGIN.lat, ORIGIN.lon, KNOWN_OPTIONS, {
            fetchBuildings,
            radiusM: 200,
        });
        expect(wide).not.toBeNull();
        expect(wide!.suggestedCode).toBe('UAD-2');
    });
});
