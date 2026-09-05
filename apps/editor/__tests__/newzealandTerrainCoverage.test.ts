// §BAKE-NEWZEALAND — the CLIENT half of the NZ terrain row, pinned at the layer the user experiences.
//
// DEFECT this closes. 6701ac25 added the `newzealand` TERRAIN_REGION_BBOXES row and terrain.mjs's
// `--check-client-coverage` proves the bake and client slug SETS are equal — but nothing asserted that
// an Auckland site RESOLVES to that slug. Slug-set parity is not reachability (memory:
// "committed ≠ reachable"): a bbox typo, a sign flip, or an AU row swallowing the point would keep the
// sets equal and still leave NZ flat. These pin the resolution itself.
//
// MEASURED against the LIVE tileset (2026-09-05, lane NZ-FINISH, curl -m 20):
//   · https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/terrain/newzealand/layer.json
//     → HTTP 200 application/json 1,629 B — quantized-mesh-1.0, tms, EPSG:4326,
//       bounds [166, -47.5, 178.7, -34.3] (EQUAL to the row below), zoom 0→10, 11 available levels,
//       deepest level x 1968..2040 · y 241..316.
//   · …/terrain/newzealand/10/2018/302.terrain (the z10 tile over Auckland CBD)
//     → HTTP 200 application/vnd.quantized-mesh 521,857 B; header decodes to centre ECEF
//       (-5090781.9, 462002.7, -3802061.9), minHeight 32.38 m, maxHeight 276.67 m, 26,179 vertices.
//       Real relief, and the ~32 m floor at the coast is the EGM2008 geoid lift (terrain.mjs
//       geoidSepM 34.11 at Auckland) — the tiles are ellipsoidal, which is what Cesium expects.
// So the terrain half of New Zealand is LIVE, not merely wired; 6701ac25's "NOT DONE: no terrain is
// baked or published" is SUPERSEDED (published under TERRAIN_TILESET_VERSION L639j, 7e3c78cf).
import { describe, it, expect } from 'vitest';
import {
    TERRAIN_REGION_BBOXES, TERRAIN_TILESET_VERSION,
    cityForLonLat, regionForLonLat, terrainSlugCandidates, terrainSlugForLonLat,
    decideBakedTerrainAttach,
} from '../src/ui/geospatial/terrainCoverage';

/** The row's bbox, as bake.mjs `newzealand` and terrain.mjs `newzealand` both carry it. */
const NZ_BBOX = [166.0, -47.5, 178.7, -34.3] as const;

// Real sites, both islands + Stewart Island. lon,lat.
const NZ_SITES: ReadonlyArray<readonly [string, number, number]> = [
    ['Auckland CBD', 174.7645, -36.8485],
    ['Wellington', 174.7762, -41.2865],
    ['Christchurch', 172.6362, -43.5321],
    ['Dunedin', 170.5028, -45.8788],
    ['Queenstown', 168.6626, -45.0312],
    ['Hamilton', 175.2793, -37.7870],
    ['Tauranga', 176.1651, -37.6878],
    ['Invercargill', 168.3538, -46.4132],
    ['Oban, Stewart Island', 168.1180, -46.8990],
    ['Cape Reinga', 172.6819, -34.4266],
];

describe('§BAKE-NEWZEALAND — an NZ site resolves to the `newzealand` terrain tileset', () => {
    it('the TERRAIN_REGION_BBOXES row exists exactly once and carries the bake bbox', () => {
        const rows = TERRAIN_REGION_BBOXES.filter((r) => r.region === 'newzealand');
        expect(rows).toHaveLength(1);
        expect(rows[0].bbox).toEqual(NZ_BBOX);
    });

    it.each(NZ_SITES)('%s resolves to `newzealand`', (_name, lon, lat) => {
        expect(regionForLonLat(lon, lat)).toBe('newzealand');
        expect(terrainSlugForLonLat(lon, lat)).toBe('newzealand');
    });

    it('NO NZ city tileset is baked yet, so the region is the ONLY candidate (a city row later must be deliberate)', () => {
        for (const [, lon, lat] of NZ_SITES) {
            expect(cityForLonLat(lon, lat)).toBeNull();
            expect(terrainSlugCandidates(lon, lat)).toEqual(['newzealand']);
        }
    });

    it('the Chatham Islands are DELIBERATELY outside — the bbox stays west of the antimeridian', () => {
        // Waitangi, Chatham Island: lon −176.55. Inside a naive "NZ" box, outside this one BY DESIGN
        // (a bbox spanning the antimeridian would have to be split; nothing is baked there).
        expect(regionForLonLat(-176.5537, -43.9535)).toBeNull();
        expect(terrainSlugForLonLat(-176.5537, -43.9535)).toBeNull();
    });

    it('Australian sites are NOT swallowed by the NZ row', () => {
        for (const [lon, lat] of [[151.2093, -33.8688], [144.9631, -37.8136], [115.8605, -31.9505]] as const) {
            expect(regionForLonLat(lon, lat)).not.toBe('newzealand');
        }
    });

    it('decideBakedTerrainAttach attaches the region tileset for an Auckland site', () => {
        const d = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: false,
            lon: 174.7645, lat: -36.8485,
        });
        expect(d.attach).toBe(true);
        if (!d.attach) throw new Error('unreachable');
        expect(d.city).toBe('newzealand');
        expect(d.scope).toBe('region');
        expect(d.candidates).toEqual(['newzealand']);
    });

    it('the toggle and the photoreal path still win over the NZ row', () => {
        const base = { photorealActive: false, formaMode: false, lon: 174.7645, lat: -36.8485 };
        expect(decideBakedTerrainAttach({ ...base, terrainEnabled: false })).toEqual({ attach: false, reason: 'toggle-off' });
        expect(decideBakedTerrainAttach({ ...base, terrainEnabled: true, photorealActive: true }))
            .toEqual({ attach: false, reason: 'photoreal' });
    });

    it('the published version stamp is the one the NZ tiles were verified under', () => {
        // Bumped to L639j by 7e3c78cf, the publish whose verify log names newzealand.
        expect(TERRAIN_TILESET_VERSION).toBe('L639j');
    });
});
