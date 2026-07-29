// §L-640 Phase 1 — confidence / metrics wiring tests.
//
// These are the verification precondition for C57 §13 KV-3 ("area-collapse bug"):
//   1. A Spanish cadastral proxy response WITH a registry-declared area must yield
//      areaSource:'registry-declared' (not 'derived-from-ring') — proving the area-split
//      fix (server/parcelZoningProxy.js) round-trips correctly through the client parse.
//   2. A footprint-fallback result must ALWAYS yield match:'low' by construction —
//      regardless of how geometrically perfect the ring is. This is enforced via
//      computeParcelConfidence(kind:'footprint-fallback'), never a numeric threshold.
//
// DO NOT mark C57 §13 KV-3 RESOLVED until BOTH fixture categories pass here.
//
// Governance rule: no live network. All fixtures are captured proxy/source shapes.

import { describe, it, expect } from 'vitest';
import { parseProxyResponse } from '../src/ui/site/parcel/CatastroParcelProvider.js';
import { parseWfsProxyResponse } from '../src/ui/site/parcel/WfsParcelProvider.js';
import { pickFootprintAtPoint } from '../src/ui/site/parcel/footprintPick.js';
import type { ContextBuildingFeature } from '../src/ui/geospatial/contextBuildings.js';

// ---------------------------------------------------------------------------
// Fixture 1 — Spanish cadastral parcel WITH registry-declared area.
// This is the end-to-end smoke test for the KV-3 area-collapse fix:
//   • server returns areaOfficialM2 + areaSigM2 separately (not collapsed)
//   • client parse attaches them to confidence without collapsing them back.
// ---------------------------------------------------------------------------
const CATASTRO_WITH_OFFICIAL_AREA = {
    parcel: {
        ring: [
            { lat: 41.3900, lon: 2.1540 },
            { lat: 41.3905, lon: 2.1540 },
            { lat: 41.3905, lon: 2.1550 },
            { lat: 41.3900, lon: 2.1550 },
        ],
        refcat: '0807901DF3800H0001KT',
        areaM2: 312,
        areaOfficialM2: 312,   // registry-declared from INSPIRE areaValue — the KV-3 fix
        areaSigM2: 308,        // shoelace-derived, kept separate — never collapsed
        pointToParcelM: 0,     // OVC _Distancia: click landed inside (0 m)
        candidateMarginM: 45,  // nearest vs 2nd-nearest candidate gap (m)
        address: 'Carrer de Provença 261, Barcelona',
        source: 'catastro',
    },
};

describe('§L-640 confidence — Catastro (Spain, cadastral, registry area present)', () => {
    it('yields areaSource:registry-declared — the area-collapse fix round-trips', () => {
        const f = parseProxyResponse(CATASTRO_WITH_OFFICIAL_AREA);
        expect(f).not.toBeNull();
        expect(f!.confidence).toBeDefined();
        expect(f!.confidence!.areaSource).toBe('registry-declared');
    });

    it('keeps areaOfficialM2 and areaSigM2 separate (not collapsed into one number)', () => {
        const f = parseProxyResponse(CATASTRO_WITH_OFFICIAL_AREA);
        expect(f!.confidence!.areaOfficialM2).toBe(312);
        // areaSigM2 is computed fresh from the ring by computeParcelMetrics — the fixture's
        // 'areaSigM2:308' from the proxy is not passed through directly; the client recomputes it.
        // What matters is that it is present and positive, not that it matches '308' exactly.
        expect(f!.confidence!.areaSigM2).toBeGreaterThan(0);
    });

    it('yields match:high (cadastral + geometryComplete + official area + click inside)', () => {
        const f = parseProxyResponse(CATASTRO_WITH_OFFICIAL_AREA);
        expect(f!.confidence!.match).toBe('high');
        expect(f!.confidence!.geometryComplete).toBe(true);
    });

    it('ships raw numeric fields untiered — pointToParcelM, candidateMarginM, areaDeltaPct', () => {
        const f = parseProxyResponse(CATASTRO_WITH_OFFICIAL_AREA);
        expect(f!.confidence!.pointToParcelM).toBe(0);
        expect(f!.confidence!.candidateMarginM).toBe(45);
        // areaDeltaPct = |official − sig| / official × 100. Not null because official area present.
        expect(f!.confidence!.areaDeltaPct).not.toBeNull();
        expect(typeof f!.confidence!.areaDeltaPct).toBe('number');
    });

    it('attaches geometry metrics (area, perimeter, centroid, compactness, vertexCount)', () => {
        const f = parseProxyResponse(CATASTRO_WITH_OFFICIAL_AREA);
        expect(f!.metrics).toBeDefined();
        expect(f!.metrics!.vertexCount).toBe(4);
        expect(f!.metrics!.areaSigM2).toBeGreaterThan(0);
        expect(f!.metrics!.perimeterM).toBeGreaterThan(0);
        expect(f!.metrics!.compactness).toBeGreaterThan(0);
        expect(f!.metrics!.compactness).toBeLessThanOrEqual(1);
        expect(Number.isFinite(f!.metrics!.centroid.lat)).toBe(true);
        expect(Number.isFinite(f!.metrics!.centroid.lon)).toBe(true);
    });

    it('yields match:medium and areaSource:derived-from-ring when official area is absent', () => {
        // Simulates an older proxy build or a Catastro parcel where areaValue is unpublished.
        const withoutOfficial = {
            parcel: {
                ...CATASTRO_WITH_OFFICIAL_AREA.parcel,
                areaOfficialM2: null,
                areaSigM2: null,
            },
        };
        const f = parseProxyResponse(withoutOfficial);
        expect(f).not.toBeNull();
        expect(f!.confidence!.areaSource).toBe('derived-from-ring');
        expect(f!.confidence!.areaOfficialM2).toBeNull();
        expect(f!.confidence!.match).toBe('medium');
    });
});

// ---------------------------------------------------------------------------
// Fixture 2 — WFS (European cadastral) adapter.
// WFS providers are real cadastres → kind:'cadastral'.
// pointToParcelM / candidateMarginM are OVC-specific (Spain) and are null for WFS.
// ---------------------------------------------------------------------------
const WFS_WITH_OFFICIAL_AREA = {
    parcel: {
        ring: [{ lat: 48.8565, lon: 2.3521 }, { lat: 48.8567, lon: 2.3523 }, { lat: 48.8566, lon: 2.3522 }],
        refcat: '75104000AE0003',
        areaM2: 15168,
        areaOfficialM2: 15168,
        source: 'ign-fr',
    },
};

describe('§L-640 confidence — WFS (European cadastral adapters)', () => {
    it('yields areaSource:registry-declared when proxy supplies areaOfficialM2', () => {
        const f = parseWfsProxyResponse(WFS_WITH_OFFICIAL_AREA, 'unused');
        expect(f).not.toBeNull();
        expect(f!.confidence).toBeDefined();
        expect(f!.confidence!.areaSource).toBe('registry-declared');
        // pointToParcelM is null (OVC-specific) → treated as "unavailable" not "outside",
        // so it does NOT downgrade the match tier. Official area present + click unavailable
        // = high (the null-pointToParcelM is "clickInsideOk" per computeParcelConfidence).
        expect(f!.confidence!.match).toBe('high');
    });

    it('yields areaSource:derived-from-ring and match:medium when areaOfficialM2 absent (older proxy build)', () => {
        // Simulates WFS proxies that predate the §L-640 split-area fix.
        const f = parseWfsProxyResponse(
            {
                parcel: {
                    ring: [{ lat: 52.372, lon: 4.892 }, { lat: 52.373, lon: 4.893 }, { lat: 52.3725, lon: 4.8925 }],
                    refcat: 'ASD04 F 6685',
                    areaM2: 9402,
                    source: 'pdok-nl',
                },
            },
            'pdok-nl',
        );
        expect(f).not.toBeNull();
        expect(f!.confidence!.areaSource).toBe('derived-from-ring');
        expect(f!.confidence!.areaOfficialM2).toBeNull();
        expect(f!.confidence!.match).toBe('medium');
    });

    it('attaches geometry metrics to WFS parcel features', () => {
        const f = parseWfsProxyResponse(WFS_WITH_OFFICIAL_AREA, 'unused');
        expect(f!.metrics).toBeDefined();
        expect(f!.metrics!.vertexCount).toBe(3);
        expect(f!.metrics!.areaSigM2).toBeGreaterThan(0);
        expect(f!.metrics!.compactness).toBeGreaterThan(0);
    });

    it('existing WFS parsing contract is unchanged — source, refcat, ring, areaM2 still present', () => {
        const f = parseWfsProxyResponse(WFS_WITH_OFFICIAL_AREA, 'unused');
        expect(f!.source).toBe('ign-fr');
        expect(f!.refcat).toBe('75104000AE0003');
        expect(f!.areaM2).toBe(15168);
        expect(f!.ring.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Fixture 3 — Footprint-fallback parcel (OSM building outline).
// match MUST be 'low' by CONSTRUCTION — a kind fact, never a numeric threshold.
// Even a geometrically perfect square must yield 'low'.
// ---------------------------------------------------------------------------
function makeFootprintFeature(osmId: number, ring: number[][]): ContextBuildingFeature {
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { heightM: 9, osmId, source: 'osm' } as ContextBuildingFeature['properties'],
    };
}

// A geometrically perfect large square — if confidence.match were EVER computed from geometry
// quality (e.g. compactness, area, completeness) rather than the 'footprint-fallback' kind fact,
// this would qualify as 'high'. It must be 'low' regardless: the kind fact is unconditional.
const PERFECT_SQUARE_FOOTPRINT = makeFootprintFeature(42, [
    [10.0, 50.0], [10.010, 50.0], [10.010, 50.010], [10.0, 50.010], [10.0, 50.0],
]);

describe('§L-640 confidence — footprint-fallback (match:low by construction, always)', () => {
    it('yields match:low regardless of geometry quality — construction guarantee, not a threshold', () => {
        const f = pickFootprintAtPoint([PERFECT_SQUARE_FOOTPRINT], 10.005, 50.005);
        expect(f).not.toBeNull();
        expect(f!.confidence).toBeDefined();
        expect(f!.confidence!.match).toBe('low');
    });

    it('yields areaSource:derived-from-ring — OSM footprints have no official registry area', () => {
        const f = pickFootprintAtPoint([PERFECT_SQUARE_FOOTPRINT], 10.005, 50.005);
        expect(f!.confidence!.areaSource).toBe('derived-from-ring');
        expect(f!.confidence!.areaOfficialM2).toBeNull();
        expect(f!.confidence!.pointToParcelM).toBeNull();
        expect(f!.confidence!.candidateMarginM).toBeNull();
    });

    it('attaches geometry metrics to footprint parcels', () => {
        const f = pickFootprintAtPoint([PERFECT_SQUARE_FOOTPRINT], 10.005, 50.005);
        expect(f!.metrics).toBeDefined();
        expect(f!.metrics!.vertexCount).toBe(5);
        expect(f!.metrics!.areaSigM2).toBeGreaterThan(0);
        expect(f!.metrics!.compactness).toBeGreaterThan(0);
        expect(f!.metrics!.compactness).toBeLessThanOrEqual(1);
    });

    it('existing footprint contract is unchanged — source, refcat, areaM2, ring still present', () => {
        const f = pickFootprintAtPoint([PERFECT_SQUARE_FOOTPRINT], 10.005, 50.005);
        expect(f!.source).toBe('footprint (OSM)');
        expect(f!.refcat).toBe('OSM 42');
        expect(f!.areaM2).toBeGreaterThan(0);
        expect(f!.ring.length).toBeGreaterThanOrEqual(4);
    });

    it('yields match:low even when confidence tier logic would otherwise say high (kind overrides all)', () => {
        // A footprint with a perfectly complete, large ring — geometryComplete would be true,
        // but the kind:'footprint-fallback' path in computeParcelConfidence sets match:'low'
        // BEFORE any other check runs. This confirms the ordering guarantee.
        const anotherSquare = makeFootprintFeature(99, [
            [2.154, 41.390], [2.155, 41.390], [2.155, 41.391], [2.154, 41.391], [2.154, 41.390],
        ]);
        const f = pickFootprintAtPoint([anotherSquare], 2.1545, 41.3905);
        expect(f).not.toBeNull();
        expect(f!.confidence!.match).toBe('low');
        expect(f!.confidence!.geometryComplete).toBe(true); // would otherwise qualify for 'high'
    });
});
