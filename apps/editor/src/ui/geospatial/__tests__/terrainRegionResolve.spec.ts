// §MOST-INTERIOR-BBOX-WINS (L-12944) — a point inside two national boxes resolves to the one it sits
// deepest inside, not to whichever row is listed first.
//
// The founder's evidence, 2026-09-06: at Sète the console read "attached baked terrain for 'spain'"
// with ground 56.8 m (real ≈ 3 m), and at Montpellier the same tileset gave 96.9 m (real ≈ 40 m).
// Spain's bbox runs east to lon 4.6 / north to lat 43.9, so it contains all of Languedoc, and it is
// listed before france. A ~50 m false plateau also puts the sea surface under the land.
import { describe, it, expect } from 'vitest';
import { regionForLonLat, TERRAIN_REGION_BBOXES } from '../terrainCoverage';

const P: ReadonlyArray<readonly [string, number, number, string]> = [
    ['Sète', 3.6959, 43.4014, 'france'],
    ['Montpellier', 3.8764, 43.6114, 'france'],
    ['Toulouse', 1.4442, 43.6047, 'france'],
    ['Perpignan', 2.8954, 42.6887, 'france'],
    ['Marseille', 5.3698, 43.2965, 'france'],
    ['Barcelona', 2.1590, 41.3888, 'spain'],
    ['Girona', 2.8249, 41.9794, 'spain'],
    ['Madrid', -3.7038, 40.4168, 'spain'],
    ['Paris', 2.3522, 48.8566, 'france'],
    ['Amsterdam', 4.8924, 52.3730, 'netherlands'],
    ['Köln', 6.9603, 50.9375, 'germany'],
    ['Prague', 14.4213, 50.0875, 'czechia'],
    ['Vienna', 16.3725, 48.2086, 'austria'],
];

describe('§MOST-INTERIOR-BBOX-WINS (L-12944)', () => {
    it('THE BUG: Sète and Montpellier resolve to france, not to the spain box that overlaps Languedoc', () => {
        expect(regionForLonLat(3.6959, 43.4014)).toBe('france');
        expect(regionForLonLat(3.8764, 43.6114)).toBe('france');
        const spain = TERRAIN_REGION_BBOXES.find((r) => r.region === 'spain')!;
        // the overlap is real and still declared — the fix is the CHOICE, not a narrowed box
        expect(spain.bbox[2]).toBeGreaterThan(3.9);
        expect(spain.bbox[3]).toBeGreaterThan(43.4);
    });

    it('resolves every border city to its own country', () => {
        const wrong = P.filter(([, lon, lat, want]) => regionForLonLat(lon, lat) !== want)
            .map(([name, lon, lat, want]) => `${name} → ${regionForLonLat(lon, lat)} (want ${want})`);
        expect(wrong).toEqual([]);
    });

    it('KNOWN LIMITATION, stated not hidden: Antwerp resolves to netherlands', () => {
        // Rectangles cannot separate the Flanders border. The Dutch box's south edge (50.7) dips well
        // below Antwerp (51.22), so Antwerp sits DEEPER inside the Dutch rectangle than inside the
        // Belgian one, whose north edge is only 0.33 deg away. This predates §MOST-INTERIOR-BBOX-WINS
        // (netherlands is listed first, so first-match returned it too) — the fix neither causes nor
        // cures it. Both tilesets are flat NAP-referenced ground, so the visible error is small, unlike
        // the ~50 m Spanish plateau over Languedoc. The real cure is a polygon country test, not a
        // better rectangle rule; recorded as its own issue-log row.
        expect(regionForLonLat(4.3997, 51.2213)).toBe('netherlands');
    });

    it('a point in exactly one box is unchanged, and a point in none is null', () => {
        expect(regionForLonLat(-3.7038, 40.4168)).toBe('spain');   // deep Spain, single match
        expect(regionForLonLat(-40, 10)).toBeNull();                // mid-Atlantic
        expect(regionForLonLat(Number.NaN, 43)).toBeNull();
        expect(regionForLonLat(3.7, Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('the winner really is the most interior: its edge margin beats every other match', () => {
        const lon = 3.6959, lat = 43.4014;
        const cos = Math.cos((lat * Math.PI) / 180);
        const margin = (b: readonly number[]) =>
            Math.min((lon - b[0]!) * cos, (b[2]! - lon) * cos, lat - b[1]!, b[3]! - lat);
        const matches = TERRAIN_REGION_BBOXES.filter(
            (r) => lon >= r.bbox[0] && lon <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3],
        );
        expect(matches.length).toBeGreaterThan(1);          // the ambiguity is real
        const winner = matches.find((r) => r.region === regionForLonLat(lon, lat))!;
        for (const other of matches) {
            if (other === winner) continue;
            expect(margin(winner.bbox)).toBeGreaterThanOrEqual(margin(other.bbox));
        }
    });
});
