// §MOST-INTERIOR-BBOX-WINS (L-12944) — a point inside two national boxes resolves to the one it sits
// deepest inside, not to whichever row is listed first.
//
// The founder's evidence, 2026-09-06: at Sète the console read "attached baked terrain for 'spain'"
// with ground 56.8 m (real ≈ 3 m), and at Montpellier the same tileset gave 96.9 m (real ≈ 40 m).
// Spain's bbox runs east to lon 4.6 / north to lat 43.9, so it contains all of Languedoc, and it is
// listed before france. A ~50 m false plateau also puts the sea surface under the land.
import { describe, it, expect } from 'vitest';
import { regionForLonLat, terrainSlugCandidates, TERRAIN_REGION_BBOXES } from '../terrainCoverage';

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

// ─────────────────────────────────────────────────────────────────────────────
// §EU-EVERY-COUNTRY (2026-09-06) — eleven NEW europe region rows land inside the same overlapping
// rectangle problem L-12944 retired. The lane brief's requirement, pinned here rather than asserted
// in prose: a new row must WIN at home and must not STEAL a neighbour's sites.
//
// MEASURED over the full 73-row table before writing a single row: exactly ONE resolution in Europe
// changes, and it is named below (Iaşi). Everything else is byte-identical to the day before.
// ─────────────────────────────────────────────────────────────────────────────

const NEW_EU_ROWS = [
    'iceland', 'faroeislands', 'cyprus', 'serbia', 'bosniaherzegovina',
    'montenegro', 'northmacedonia', 'albania', 'kosovo', 'ukraine', 'belarus',
] as const;

describe('§EU-EVERY-COUNTRY — the new europe rows resolve at home and steal nothing', () => {
    it('every new row is actually IN the client table (a row nobody can resolve to is dead weight)', () => {
        const have = new Set(TERRAIN_REGION_BBOXES.map((r) => r.region));
        expect(NEW_EU_ROWS.filter((r) => !have.has(r))).toEqual([]);
    });

    it('each new country resolves to ITSELF at its capital AND at a rural village (the founder\'s "all villages")', () => {
        // A capital sits deep inside its own box; a village is the harder case, because it is closer
        // to the border and therefore closer to a neighbour's rectangle edge.
        const cases: ReadonlyArray<readonly [string, number, number, string]> = [
            ['iceland', -21.9426, 64.1466, 'Reykjavík'], ['iceland', -15.2082, 64.2539, 'Höfn (village)'],
            ['faroeislands', -6.7719, 62.0079, 'Tórshavn'], ['faroeislands', -6.7514, 62.3222, 'Gjógv (village)'],
            ['cyprus', 33.3823, 35.1856, 'Nicosia'], ['cyprus', 32.7906, 34.8497, 'Omodos (village)'],
            ['serbia', 20.4489, 44.7866, 'Belgrade'], ['serbia', 19.8022, 43.7361, 'Sirogojno (village)'],
            ['bosniaherzegovina', 18.4131, 43.8563, 'Sarajevo'], ['bosniaherzegovina', 18.1706, 43.6547, 'Lukomir (village)'],
            ['montenegro', 19.2636, 42.4304, 'Podgorica'], ['montenegro', 18.8981, 42.4028, 'Njeguši (village)'],
            ['northmacedonia', 21.4254, 41.9981, 'Skopje'],
            ['albania', 19.8187, 41.3275, 'Tirana'],
            ['kosovo', 21.1655, 42.6629, 'Pristina'], ['kosovo', 20.9006, 42.1856, 'Prevallë (village)'],
            ['ukraine', 30.5234, 50.4501, 'Kyiv'], ['ukraine', 23.7008, 48.4372, 'Kolochava (village)'],
            ['belarus', 27.5615, 53.9006, 'Minsk'], ['belarus', 26.4703, 53.4514, 'Mir (village)'],
        ];
        const wrong = cases
            .filter(([want, lon, lat]) => regionForLonLat(lon, lat) !== want)
            .map(([want, lon, lat, label]) => `${label} → ${regionForLonLat(lon, lat)} (want ${want})`);
        expect(wrong).toEqual([]);
    });

    it('KNOWN LIMITATION, stated not hidden: two mountain villages resolve to the neighbour whose rectangle overhangs them', () => {
        // Greece's box reaches lat 41.80 (well into North Macedonia) and Montenegro's reaches 43.60
        // (well into northern Albania). Vevčani MK and Theth AL therefore sit deeper inside the
        // NEIGHBOUR's rectangle than inside their own. This is the Antwerp class, not the Languedoc
        // class: the relief is IDENTICAL either way (both tilesets are baked from the same planet-wide
        // Mapterhorn source over their own bbox, with the same per-post EGM2008 lift), so there is no
        // false plateau — only a differently-named tileset. And the country's OWN row is still in the
        // candidate list, so nothing is lost if the neighbour is unpublished. The cure is a polygon
        // country test, not a better rectangle.
        expect(regionForLonLat(20.5928, 41.2400)).toBe('greece');       // Vevčani, MK
        expect(terrainSlugCandidates(20.5928, 41.2400)).toContain('northmacedonia');
        expect(regionForLonLat(19.7906, 42.3936)).toBe('montenegro');   // Theth, AL
        expect(terrainSlugCandidates(19.7906, 42.3936)).toContain('albania');
    });

    it('BORDER — Serbia/Croatia: the new serbia box reaches Vukovar, and Vukovar stays croatia', () => {
        // serbia's bbox runs west to lon 18.80; Vukovar (HR) is at 19.00, i.e. inside BOTH rectangles.
        // Croatia's margin there is 0.350 against Serbia's 0.142, so the new row does not take it.
        expect(regionForLonLat(19.0025, 45.3411)).toBe('croatia');
        expect(terrainSlugCandidates(19.0025, 45.3411)).toEqual(['croatia', 'serbia']);
        // …and Belgrade, 1.4 deg east, is Serbia's own — the row is not inert.
        expect(regionForLonLat(20.4489, 44.7866)).toBe('serbia');
    });

    it('BORDER — Ukraine/Poland: Przemyśl and Lublin stay poland, Lviv is ukraine', () => {
        expect(regionForLonLat(22.7679, 49.7838)).toBe('poland');       // Przemyśl PL, 0.67 deg inside the UA box
        expect(regionForLonLat(22.5684, 51.2465)).toBe('poland');       // Lublin PL
        expect(regionForLonLat(24.0297, 49.8397)).toBe('ukraine');      // Lviv UA
        expect(terrainSlugCandidates(22.7679, 49.7838)).toEqual(['poland', 'ukraine']);
    });

    it('BORDER — Belarus/Poland: Białystok stays poland by 0.011 deg, and the fallback names belarus second', () => {
        // The thinnest margin in the whole table. Pinned deliberately: if either box is ever nudged,
        // this is the assertion that fires instead of a Polish site quietly serving Belarusian tiles.
        expect(regionForLonLat(23.1688, 53.1325)).toBe('poland');
        expect(terrainSlugCandidates(23.1688, 53.1325)).toEqual(['poland', 'belarus']);
    });

    it('THE ONE RESOLUTION THIS LANE CHANGES: Iaşi (RO) moves from romania to ukraine — and falls back to romania', () => {
        // Ukraine wraps around Moldova, so ONE rectangle over Ukraine necessarily swallows eastern
        // Romania: at Iaşi ukraine's margin is 3.158 against romania's 1.142. The relief is the same
        // (Iaşi is inside ukraine's baked bbox, same source, same geoid), so this is not a false
        // plateau — but while `ukraine` is PENDING and unpublished its tileset 404s, which is exactly
        // why terrainSlugCandidates now carries romania behind it instead of leaving Iaşi flat.
        expect(regionForLonLat(27.6014, 47.1585)).toBe('ukraine');
        expect(terrainSlugCandidates(27.6014, 47.1585)).toEqual(['ukraine', 'romania']);
    });

    it('the six context-only countries resolve to the named covering region, never to null', () => {
        // malta / andorra / liechtenstein / channelislands / isleofman / moldova get a bake.mjs
        // CONTEXT row but no terrain row, because each loses on margin to a neighbour that fully
        // contains it. "Loses to a neighbour" is only acceptable if the neighbour actually answers —
        // so assert the answer, by name.
        const cases: ReadonlyArray<readonly [string, number, number, string]> = [
            ['italy', 14.5146, 35.8989, 'Valletta MT'],
            ['spain', 1.5218, 42.5063, 'Andorra la Vella AD'],
            ['switzerland', 9.5209, 47.1410, 'Vaduz LI'],
            ['france', -2.1042, 49.1869, 'St Helier JE'],
            ['greatbritain', -4.4814, 54.2361, 'Douglas IM'],
            ['ukraine', 28.8638, 47.0105, 'Chișinău MD'],
        ];
        const wrong = cases
            .filter(([want, lon, lat]) => regionForLonLat(lon, lat) !== want)
            .map(([want, lon, lat, label]) => `${label} → ${regionForLonLat(lon, lat)} (want ${want})`);
        expect(wrong).toEqual([]);
    });
});

describe('§PENDING-REGION-FALLS-THROUGH — candidates carry EVERY containing region, most-interior first', () => {
    it('a single-match point is byte-identical to the winner (nothing that resolves today moves)', () => {
        expect(terrainSlugCandidates(30.5234, 50.4501)).toEqual(['ukraine']);   // deep Ukraine
        expect(terrainSlugCandidates(-21.9426, 64.1466)).toEqual(['iceland']);  // Iceland, no neighbour
    });

    it('a multi-match point lists the winner FIRST and the runners-up in descending interior margin', () => {
        const c = terrainSlugCandidates(3.6959, 43.4014);      // Sète — the L-12944 site
        expect(c[0]).toBe('france');
        expect(c).toContain('spain');
        expect(c.indexOf('france')).toBeLessThan(c.indexOf('spain'));
    });

    it('a city row still leads, and the region tail follows it (the pre-existing city fallback is unchanged)', () => {
        const c = terrainSlugCandidates(2.35, 48.86);           // Paris: city row + france region
        expect(c[0]).toBe('paris');
        expect(c[1]).toBe('france');
    });

    it('outside every box the list is empty, and a non-finite input is empty (never a throw)', () => {
        expect(terrainSlugCandidates(-40, 10)).toEqual([]);
        expect(terrainSlugCandidates(Number.NaN, 43)).toEqual([]);
        expect(terrainSlugCandidates(3.7, Number.POSITIVE_INFINITY)).toEqual([]);
    });

    it('no slug ever appears twice (a city that shares its name with a region must not double-attach)', () => {
        for (const [lon, lat] of [[2.35, 48.86], [3.6959, 43.4014], [-8.6456, 41.1447], [27.6014, 47.1585]] as const) {
            const c = terrainSlugCandidates(lon, lat);
            expect(new Set(c).size).toBe(c.length);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §BAKE-US-STATES (lane USA-ALL-STATES, 2026-09-06) — the same rule, fifty-four more rectangles.
//
// The six US metro rows became 54 whole-state rows. Fifty-four rectangles overlap heavily, so this is
// where §MOST-INTERIOR-BBOX-WINS is actually stress-tested. Every expectation below is the MEASURED
// answer of the real resolver, split into two blocks that must never be confused:
//
//   1. WHAT IT GETS RIGHT — pinned so a later bbox edit cannot quietly break it.
//   2. WHAT IT CANNOT DO — pinned as FACT, with the reason, because the brief for this work said:
//      "if the rule cannot separate a case, say so out loud as a named limitation rather than tuning
//      a box until one test passes." Not one bbox was moved to make a test pass. The Antwerp case
//      above is the precedent, and it already names the real cure: a polygon country test.
//
// THE PART THAT MATTERS MOST. A wrong SLUG here is not (yet) wrong GROUND. Every region tileset in
// this table is a Mapterhorn z0..10 bake over its OWN bbox, and every mis-resolved point below is
// INSIDE the winner's bbox — that is why it won — so the winner's tileset really does hold real posts
// there. The defect is that the console names a foreign region, that a duplicate bake is paid for,
// and that the day any region's bake stops being planet-wide (a national DTM adapter, the way `spain`
// produced the ~50 m Languedoc plateau at the top of this file) the ground goes wrong too. That claim
// is tested below rather than asserted.
import { terrainSlugCandidates } from '../terrainCoverage';

const US_RIGHT: ReadonlyArray<readonly [string, number, number, string]> = [
    // The brief's four border cases — the half the rule gets right.
    ['Kansas City MO', -94.5786, 39.0997, 'missouri'],
    ['Texarkana TX', -94.0477, 33.4418, 'texas'],
    ['Tahoe City CA (west shore)', -120.1446, 39.1677, 'california'],
    // The rest of the country.
    ['Manhattan (the old newyork clip)', -73.9855, 40.7580, 'newyork'],
    ['Jersey City NJ', -74.0776, 40.7282, 'newjersey'],
    ['San Francisco CA', -122.4194, 37.7749, 'california'],
    ['Los Angeles CA', -118.2437, 34.0522, 'california'],
    ['Boston MA', -71.0589, 42.3601, 'massachusetts'],
    ['Austin TX', -97.7431, 30.2672, 'texas'],
    ['Miami FL', -80.1918, 25.7617, 'florida'],
    ['Seattle WA', -122.3321, 47.6062, 'washington'],
    ['Denver CO', -104.9903, 39.7392, 'colorado'],
    ['Wilmington DE', -75.5398, 39.7391, 'delaware'],
    ['Cincinnati OH', -84.5120, 39.1031, 'ohio'],
    ['Portland OR', -122.6784, 45.5152, 'oregon'],
    ['Anchorage AK', -149.9003, 61.2181, 'alaska'],
    ['Attu Station AK (east of 180)', 173.1806, 52.8306, 'alaskaaleutians'],
    ['Honolulu HI', -157.8583, 21.3069, 'hawaii'],
    ['San Juan PR', -66.1057, 18.4655, 'puertoricousa'],
    ['Charlotte Amalie VI', -64.9307, 18.3419, 'usvirginislands'],
];

/** Measured 2026-09-06. `want` is the state the point is REALLY in; `got` is what the rule answers. */
const US_LIMITATION: ReadonlyArray<readonly [string, number, number, string, string]> = [
    // (a) The twin-city shape: two states share one metro, and the bigger rectangle takes both halves.
    ['Kansas City KS', -94.6275, 39.1142, 'kansas', 'missouri'],
    ['Texarkana AR', -93.9846, 33.4418, 'arkansas', 'texas'],
    ['Incline Village NV (east shore)', -119.9418, 39.2510, 'nevada', 'california'],
    ['Covington KY', -84.5085, 39.0837, 'kentucky', 'ohio'],
    ['Vancouver WA', -122.6615, 45.6387, 'washington', 'oregon'],
    ['Omaha NE', -95.9345, 41.2565, 'nebraska', 'iowa'],
    ['Philadelphia PA', -75.1652, 39.9526, 'pennsylvania', 'newjersey'],
    ['St. Louis MO', -90.1994, 38.6270, 'missouri', 'illinois'],
    ['Memphis TN', -90.0490, 35.1495, 'tennessee', 'arkansas'],
    // (b) The enclave shape: a small state can never out-score the big rectangle that contains it.
    //     Washington DC is the brief's fourth border case, and this is the honest answer to it.
    ['Washington DC', -77.0369, 38.9072, 'districtofcolumbia', 'maryland'],
    ['Providence RI', -71.4128, 41.8240, 'rhodeisland', 'massachusetts'],
    ['Hartford CT', -72.6851, 41.7658, 'connecticut', 'newyork'],
    // (c) The FOREIGN shape — and this one PREDATES the US state rows entirely.
    ['Chicago IL', -87.6298, 41.8781, 'illinois', 'ontario'],
    ['Detroit MI', -83.0458, 42.3314, 'michigan', 'ontario'],
    ['Milwaukee WI', -87.9065, 43.0389, 'wisconsin', 'ontario'],
    ['Buffalo NY', -78.8784, 42.8864, 'newyork', 'ontario'],
    ['Houston TX', -95.3698, 29.7604, 'texas', 'mexico'],
    ['El Paso TX', -106.4850, 31.7619, 'texas', 'mexico'],
];

describe('BAKE-US-STATES x MOST-INTERIOR-BBOX-WINS — what fifty-four rectangles can and cannot separate', () => {
    it('resolves 20 measured US points to the right state, including three of the four named border cases', () => {
        const wrong = US_RIGHT.filter(([, lon, lat, want]) => regionForLonLat(lon, lat) !== want)
            .map(([name, lon, lat, want]) => `${name} -> ${regionForLonLat(lon, lat)} (want ${want})`);
        expect(wrong).toEqual([]);
    });

    it('THE REGRESSION THIS LANE FIXED: Austin resolved to `mexico` before the `texas` row existed', () => {
        // mexico's box runs north to 32.75, so its margin at Austin was 2.48 with nothing to beat it.
        // texas scores 4.09 there and wins. Houston is 2.05 against 2.99 and still does NOT — see below.
        expect(regionForLonLat(-97.7431, 30.2672)).toBe('texas');
    });

    it('KNOWN LIMITATION, measured and named: 18 US points resolve to a neighbour, and NOT ONE bbox was tuned', () => {
        const drifted = US_LIMITATION.filter(([, lon, lat, , got]) => regionForLonLat(lon, lat) !== got)
            .map(([name, lon, lat, , got]) => `${name} -> ${regionForLonLat(lon, lat)} (this test recorded ${got})`);
        // If this fails, the RULE or a BBOX moved. Re-measure and rewrite the row; do not delete it.
        expect(drifted).toEqual([]);
        expect(US_LIMITATION.every(([, , , want, got]) => want !== got)).toBe(true);
    });

    it('the FOREIGN-country resolutions predate the US state rows — the chicago/houston metro rows lost to them too', () => {
        // Measured on the pre-lane table: the `chicago` metro box scored 0.081 at Chicago against
        // ontario's 0.278, and `houston` 0.081 against mexico's 2.990. Removing the metro rows did not
        // cause this, and adding illinois (0.104) / texas (2.049) does not cure it. The MEXICO-CANADA
        // lane's own note in terrainCoverage.ts claimed the opposite; it is corrected in place.
        for (const [name, lon, lat] of [['Chicago', -87.6298, 41.8781], ['Houston', -95.3698, 29.7604]] as const) {
            expect(['ontario', 'mexico'], name).toContain(regionForLonLat(lon, lat));
        }
    });

    it('a wrong SLUG is not wrong GROUND today: every winner really contains the point, so its Mapterhorn bake covers it', () => {
        const uncovered = US_LIMITATION.filter(([, lon, lat, , got]) => {
            const b = TERRAIN_REGION_BBOXES.find((r) => r.region === got)!.bbox;
            return !(lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]);
        }).map(([n]) => n);
        expect(uncovered, 'a winner that does NOT contain the point would be wrong ground, not just a wrong name').toEqual([]);
    });

    it('PENDING-REGION-FALLS-THROUGH still lists the RIGHT state behind the wrong winner, so an unbaked winner is not flat ground', () => {
        // ontario and mexico are `pending` (never baked). The candidate list is the safety net: the real
        // state is in it, after the foreign row, and the viewport attaches the first layer.json that
        // loads. Without that fall-through the six metros above would render on bare ellipsoid.
        for (const [name, lon, lat, want] of US_LIMITATION) {
            expect(terrainSlugCandidates(lon, lat), `${name}: the real state must still be reachable`).toContain(want);
        }
    });

    it('Europe is unmoved by 54 new rows — the L-12944 cases above still resolve exactly as they did', () => {
        expect(regionForLonLat(3.6959, 43.4014)).toBe('france');    // Sete
        expect(regionForLonLat(2.1590, 41.3888)).toBe('spain');     // Barcelona
        expect(regionForLonLat(4.8924, 52.3730)).toBe('netherlands');
    });
});
