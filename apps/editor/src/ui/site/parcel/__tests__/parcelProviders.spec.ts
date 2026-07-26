// L-613 — client parcel-provider specs. NO live network: the same-origin proxy always returns the
// uniform `{ parcel: { ring, refcat, areaM2, address, source } }` shape, so these pin the client
// parse of that shape (per-country `source`), the footprint pick, and never-throws.

import { describe, it, expect } from 'vitest';
import { parseWfsProxyResponse } from '../WfsParcelProvider.js';
import { pickFootprintAtPoint } from '../footprintPick.js';
import type { ContextBuildingFeature } from '../../../geospatial/contextBuildings.js';

// A captured proxy row per wired cadastre (the server-normalised shape; ring truncated to a
// minimal valid triangle — provenance is what matters here).
const PROXY_ROWS: ReadonlyArray<[string, unknown, string]> = [
    ['FR / IGN', { parcel: { ring: [{ lat: 48.8565, lon: 2.3521 }, { lat: 48.8567, lon: 2.3523 }, { lat: 48.8566, lon: 2.3522 }], refcat: '75104000AE0003', areaM2: 15168, address: 'Paris AE 0003', source: 'ign-fr' } }, 'ign-fr'],
    ['NL / PDOK', { parcel: { ring: [{ lat: 52.372, lon: 4.892 }, { lat: 52.373, lon: 4.893 }, { lat: 52.3725, lon: 4.8925 }], refcat: 'ASD04 F 6685', areaM2: 9402, address: 'Amsterdam', source: 'pdok-nl' } }, 'pdok-nl'],
    ['NO / Kartverket', { parcel: { ring: [{ lat: 59.9137, lon: 10.752 }, { lat: 59.9141, lon: 10.7524 }, { lat: 59.9139, lon: 10.7522 }], refcat: '0301-208/644', areaM2: 512, address: 'OSLO', source: 'geonorge-no' } }, 'geonorge-no'],
    ['DE-NRW / ALKIS', { parcel: { ring: [{ lat: 51.2287, lon: 6.7729 }, { lat: 51.2289, lon: 6.773 }, { lat: 51.2288, lon: 6.7731 }], refcat: '05311000400273', areaM2: 2355, address: 'Altstadt', source: 'alkis-nrw' } }, 'alkis-nrw'],
    ['CH / swisstopo AV', { parcel: { ring: [{ lat: 47.3766, lon: 8.5414 }, { lat: 47.3772, lon: 8.5417 }, { lat: 47.3769, lon: 8.542 }], refcat: 'CH119192997709', areaM2: 640, address: 'ZH AA8048', source: 'swisstopo-av' } }, 'swisstopo-av'],
];

describe('parseWfsProxyResponse — per-country proxy rows', () => {
    for (const [name, json, source] of PROXY_ROWS) {
        it(`${name} → a ParcelFeature carrying its own provenance`, () => {
            const f = parseWfsProxyResponse(json, 'unused-fallback');
            expect(f).not.toBeNull();
            expect(f!.source).toBe(source);
            expect(f!.ring.length).toBeGreaterThanOrEqual(3);
            expect(f!.refcat.length).toBeGreaterThan(0);
            expect(f!.areaM2).toBeGreaterThan(0);
        });
    }

    it('uses the fallback source only when the proxy omits one', () => {
        const f = parseWfsProxyResponse(
            { parcel: { ring: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 1, lon: 2 }], refcat: 'X' } },
            'ign-fr',
        );
        expect(f?.source).toBe('ign-fr');
    });

    it('returns null on a miss / malformed / < 3 pts / no refcat — never throws', () => {
        expect(parseWfsProxyResponse({ parcel: null }, 's')).toBeNull();
        expect(parseWfsProxyResponse({}, 's')).toBeNull();
        expect(parseWfsProxyResponse(null, 's')).toBeNull();
        expect(parseWfsProxyResponse('garbage', 's')).toBeNull();
        expect(parseWfsProxyResponse({ parcel: { ring: [{ lat: 1, lon: 1 }], refcat: 'X' } }, 's')).toBeNull();
        expect(parseWfsProxyResponse({ parcel: { ring: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 1, lon: 2 }], refcat: '' } }, 's')).toBeNull();
        expect(() => parseWfsProxyResponse(undefined, 's')).not.toThrow();
    });
});

describe('pickFootprintAtPoint — universal fallback', () => {
    const footprint = (osmId: number, ring: number[][]): ContextBuildingFeature => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { heightM: 9, osmId, source: 'osm' } as ContextBuildingFeature['properties'],
    });
    // A ~unit-square building (lon 10.0–10.001, lat 50.0–50.001).
    const square = footprint(42, [[10.0, 50.0], [10.001, 50.0], [10.001, 50.001], [10.0, 50.001], [10.0, 50.0]]);

    it('returns the CONTAINING footprint, labelled as a footprint (not a cadastral parcel)', () => {
        const f = pickFootprintAtPoint([square], 10.0005, 50.0005);
        expect(f).not.toBeNull();
        expect(f!.source).toBe('footprint (OSM)');
        expect(f!.refcat).toBe('OSM 42');
        expect(f!.refcat).not.toMatch(/cadastr/i);
        expect(f!.ring.length).toBeGreaterThanOrEqual(3);
        expect(f!.areaM2).toBeGreaterThan(0);
    });

    it('returns null when no footprint contains the point (honest "nothing here")', () => {
        expect(pickFootprintAtPoint([square], 11, 51)).toBeNull();
        expect(pickFootprintAtPoint([], 10.0005, 50.0005)).toBeNull();
    });

    it('never throws on degenerate footprints', () => {
        const degenerate = footprint(7, [[0, 0], [0, 0]]);
        expect(() => pickFootprintAtPoint([degenerate], 0, 0)).not.toThrow();
        expect(pickFootprintAtPoint([degenerate], 0, 0)).toBeNull();
    });
});
