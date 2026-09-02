// L-12871 — the acceptance suite for the national-jurisdiction resolver.
//
// ⛔ WHAT THIS SUITE IS FOR. Nine country adapters are committed and tested, and none is reachable
// from a map click, because registering any two whose bboxes overlap would route real territory to
// the wrong national cadastre by SMALLEST BOX. This suite is the gate that has to pass before any
// of them is registered. It drives the five towns L-12871 names, one interior control per country
// that owns a national routing bbox, and an adversarial set the bbox pre-filter alone would get
// wrong.
//
// ⭐ THE INVARIANT IS "NEVER WRONG", NOT "ALWAYS ANSWERS". A refusal is a legitimate outcome and is
// asserted as such, with its named reason. What is NOT tolerated anywhere in this file is a CLAIM
// naming the wrong country — that is the failure mode a smallest-box tiebreak produces and the one
// this whole lane exists to remove.

import { describe, it, expect } from 'vitest';
import {
    resolveNationalJurisdiction,
    describeNationalJurisdiction,
    NATIONAL_BOUNDARY_SET,
    type NationalJurisdictionVerdict,
} from '../src/jurisdiction/nationalJurisdictionResolver.js';
import { isInPoland } from '../src/countryAdapters/pl/plJurisdiction.js';
import { isInLithuania } from '../src/countryAdapters/lt/ltJurisdiction.js';
import { isInGermany } from '../src/parcelProviders/countryBbox.js';

/** [name, lat, lon, the country that really holds it]. */
type Town = readonly [string, number, number, string];

const claimOf = (v: NationalJurisdictionVerdict): string | null => (v.ok ? v.iso3 : null);

describe('L-12871 · the defect: raw bbox predicates disagree about real towns', () => {
    // These four assertions are the BUG, pinned. They must keep failing to be resolved by bbox
    // alone — if one of them ever flips, someone narrowed a routing box and the resolver's
    // reason for existing changed.
    it('Suwalki and Sejny are POLISH yet satisfy isInLithuania AND isInPoland', () => {
        expect(isInPoland(54.1017, 22.9308)).toBe(true);
        expect(isInLithuania(54.1017, 22.9308)).toBe(true);
        expect(isInPoland(54.1069, 23.3489)).toBe(true);
        expect(isInLithuania(54.1069, 23.3489)).toBe(true);
    });

    it('Marijampole is LITHUANIAN yet satisfies isInPoland', () => {
        expect(isInLithuania(54.5589, 23.3542)).toBe(true);
        expect(isInPoland(54.5589, 23.3542)).toBe(true);
    });

    it('Frankfurt (Oder) is GERMAN yet satisfies isInPoland — the Oder strip', () => {
        expect(isInGermany(52.3412, 14.5506)).toBe(true);
        expect(isInPoland(52.3412, 14.5506)).toBe(true);
    });

    it('a smallest-box tiebreak would hand Frankfurt (Oder) to Poland', () => {
        // POLAND_BBOX 5.84 x 10.03 = 58.6 deg^2 is SMALLER than GERMANY_BBOX 7.9 x 9.3 = 73.5 deg^2,
        // so "most specific enclosing box wins" picks Poland for German territory. This is the
        // arithmetic the resolver refuses to use.
        const poland = (54.84 - 49.0) * (24.15 - 14.12);
        const germany = (55.1 - 47.2) * (15.1 - 5.8);
        expect(poland).toBeLessThan(germany);
    });
});

describe('L-12871 acceptance · the five named towns', () => {
    const NAMED: readonly Town[] = [
        ['Suwalki', 54.1017, 22.9308, 'POL'],
        ['Sejny', 54.1069, 23.3489, 'POL'],
        ['Marijampole', 54.5589, 23.3542, 'LTU'],
        ['Frankfurt (Oder)', 52.3412, 14.5506, 'DEU'],
        ['Slubice', 52.3506, 14.5701, 'POL'],
    ];

    it.each(NAMED)('%s is never claimed by the wrong country', (name, lat, lon, truth) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number);
        const claimed = claimOf(v);
        expect(
            claimed === null || claimed === truth,
            `${name}: ${describeNationalJurisdiction(v)}`,
        ).toBe(true);
    });

    it.each(NAMED)('%s carries a named basis or a named refusal — never a silent pick', (name, lat, lon) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number);
        if (v.ok) {
            expect(v.basis.kind).toMatch(/^(polygon-containment|nearest-polygon)$/);
            expect(v.basis.dataset.length).toBeGreaterThan(0);
            expect(v.basis.sourceSha256).toHaveLength(64);
        } else {
            expect(v.reason.length).toBeGreaterThan(0);
            expect(v.detail.length).toBeGreaterThan(0);
        }
    });

    // ⭐ THE THREE THAT RESOLVE. Their margins are 8-31 km, one to two orders of magnitude above
    // the dataset's measured 1500 m tolerance, so these are claims the geometry genuinely earns.
    it('Suwalki, Sejny and Marijampole each resolve to EXACTLY ONE country by containment', () => {
        for (const [name, lat, lon, truth] of [
            ['Suwalki', 54.1017, 22.9308, 'POL'],
            ['Sejny', 54.1069, 23.3489, 'POL'],
            ['Marijampole', 54.5589, 23.3542, 'LTU'],
        ] as readonly Town[]) {
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok, `${name}: ${describeNationalJurisdiction(v)}`).toBe(true);
            if (!v.ok) continue;
            expect(v.iso3, name).toBe(truth);
            expect(v.basis.kind).toBe('polygon-containment');
            // Both PL and LT were candidates — the bbox did NOT decide this.
            expect(v.candidates).toContain('POL');
            expect(v.candidates).toContain('LTU');
            if (v.basis.kind === 'polygon-containment') {
                expect(v.basis.nearestRivalDistanceM).toBeGreaterThan(v.basis.toleranceM);
            }
        }
    });

    // ⛔ THE TWO THAT DO NOT — AND WHY THAT IS THE HONEST ANSWER, NOT A GAP IN THE LOGIC.
    // Frankfurt (Oder) sits 679 m from the true Oder border and Slubice 1442 m from it (measured
    // against official German ADM0 geometry). The shipped public-domain coverage places its own
    // DE/PL boundary with a p95 error of 1501 m in that corridor, so it cannot separate them. It
    // gets Gorlitz — the same border, 508 m out — FLATLY WRONG. Claiming these two from this
    // dataset would be luck wearing a citation. When a per-country official boundary replaces the
    // coarse one, its tolerance falls with it and both convert to claims with no code change.
    it('Frankfurt (Oder) and Slubice REFUSE, naming the rival and the tolerance', () => {
        for (const [name, lat, lon] of [
            ['Frankfurt (Oder)', 52.3412, 14.5506],
            ['Slubice', 52.3506, 14.5701],
        ] as readonly (readonly [string, number, number])[]) {
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok, `${name} unexpectedly claimed: ${describeNationalJurisdiction(v)}`).toBe(false);
            if (v.ok) continue;
            expect(v.reason).toBe('within-dataset-tolerance-of-rival');
            expect(v.candidates).toContain('DEU');
            expect(v.candidates).toContain('POL');
            expect(v.detail).toMatch(/DEU|POL/);
            expect(v.detail).toMatch(/1500 m/);
        }
    });
});

describe('interior controls · one per country owning a national routing bbox', () => {
    const CONTROLS: readonly Town[] = [
        ['Madrid', 40.4168, -3.7038, 'ESP'],
        ['Paris', 48.8566, 2.3522, 'FRA'],
        ['Amsterdam', 52.3676, 4.9041, 'NLD'],
        ['Oslo', 59.9139, 10.7522, 'NOR'],
        ['Berlin', 52.52, 13.405, 'DEU'],
        ['Zurich', 47.3769, 8.5417, 'CHE'],
        ['Riyadh', 24.7136, 46.6753, 'SAU'],
        ['Kobenhavn', 55.6761, 12.5683, 'DNK'],
        ['Roma', 41.9028, 12.4964, 'ITA'],
        ['Lisboa', 38.7223, -9.1393, 'PRT'],
        ['Helsinki', 60.1699, 24.9384, 'FIN'],
        ['Tallinn', 59.437, 24.7536, 'EST'],
        ['Vilnius', 54.6872, 25.2797, 'LTU'],
        ['Luxembourg', 49.6116, 6.1319, 'LUX'],
        ['Warszawa', 52.2297, 21.0122, 'POL'],
        ['Stockholm', 59.3293, 18.0686, 'SWE'],
    ];

    it('covers every country in the shipped boundary set', () => {
        expect(new Set(CONTROLS.map((c) => c[3])).size).toBe(
            Object.keys(NATIONAL_BOUNDARY_SET.countries).length,
        );
    });

    it.each(CONTROLS)('%s resolves to exactly one country, with a basis', (name, lat, lon, truth) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number);
        expect(v.ok, `${name}: ${describeNationalJurisdiction(v)}`).toBe(true);
        if (!v.ok) return;
        expect(v.iso3, `${name}: ${describeNationalJurisdiction(v)}`).toBe(truth);
        expect(v.basis.dataset).toBe(NATIONAL_BOUNDARY_SET.dataset);
    });

    // Kobenhavn is the reason `nearest-polygon` exists: the coarse coastline puts the Danish
    // capital 140 m out to sea. A containment-only resolver reports "no country" for it.
    it('Kobenhavn resolves via nearest-polygon, decisively over Sweden', () => {
        const v = resolveNationalJurisdiction(55.6761, 12.5683);
        expect(v.ok).toBe(true);
        if (!v.ok || v.basis.kind !== 'nearest-polygon') throw new Error(describeNationalJurisdiction(v));
        expect(v.iso3).toBe('DNK');
        expect(v.candidates).toContain('SWE');
        expect(v.basis.offsetM).toBeLessThan(NATIONAL_BOUNDARY_SET.coastalToleranceM);
        expect(v.basis.nextNearestDistanceM).toBeGreaterThan(v.basis.toleranceM);
    });
});

describe('adversarial · the bbox is a PRE-FILTER, never the decider', () => {
    // Each of these is inside one or more national routing bboxes and belongs to NO registered
    // country. A resolver that trusted the bbox would claim all four.
    const FOREIGN: readonly (readonly [string, number, number, string])[] = [
        ['Casablanca (MA, inside SPAIN_BBOX)', 33.5731, -7.5898, 'ESP'],
        ['Kaliningrad (RU, inside LITHUANIA+POLAND bbox)', 54.7104, 20.4522, 'POL'],
        ['Praha (CZ, inside GERMANY_BBOX)', 50.0755, 14.4378, 'DEU'],
        ['Minsk (BY, inside no national bbox)', 53.9006, 27.5667, ''],
    ];

    it.each(FOREIGN)('%s is never claimed', (name, lat, lon) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number);
        expect(v.ok, `${name}: ${describeNationalJurisdiction(v)}`).toBe(false);
    });

    it('Casablanca is a bbox candidate of Spain and still refuses', () => {
        const v = resolveNationalJurisdiction(33.5731, -7.5898);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.candidates).toContain('ESP');
        expect(v.reason).toBe('outside-every-candidate-polygon');
    });
});

describe('adversarial · the towns the coarse geometry gets WRONG must refuse, not claim', () => {
    // ⭐ THIS IS THE MOST IMPORTANT BLOCK IN THE FILE. ne_10m places Gorlitz 398 m inside POLAND
    // and Tornio 255 m inside SWEDEN. Both are wrong. A containment-only resolver would answer
    // confidently and wrongly, WITH a citation attached — strictly worse than the bbox it replaced.
    // The tolerance band converts both into named refusals.
    const MISPLACED: readonly (readonly [string, number, number, string])[] = [
        ['Gorlitz (DE, ne_10m says PL)', 51.1548, 14.9884, 'DEU'],
        ['Tornio (FI, ne_10m says SE)', 65.8482, 24.1467, 'FIN'],
    ];

    it.each(MISPLACED)('%s refuses rather than making a wrong claim', (name, lat, lon) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number);
        expect(v.ok, `${name} was CLAIMED: ${describeNationalJurisdiction(v)}`).toBe(false);
        if (v.ok) return;
        expect(v.reason).toBe('within-dataset-tolerance-of-rival');
    });

    it('no witness anywhere in this suite is claimed by the wrong country', () => {
        const ALL: readonly Town[] = [
            ['Suwalki', 54.1017, 22.9308, 'POL'],
            ['Sejny', 54.1069, 23.3489, 'POL'],
            ['Marijampole', 54.5589, 23.3542, 'LTU'],
            ['Frankfurt (Oder)', 52.3412, 14.5506, 'DEU'],
            ['Slubice', 52.3506, 14.5701, 'POL'],
            ['Gorlitz', 51.1548, 14.9884, 'DEU'],
            ['Zgorzelec', 51.1494, 15.0086, 'POL'],
            ['Tornio', 65.8482, 24.1467, 'FIN'],
            ['Haparanda', 65.8356, 24.1345, 'SWE'],
            ['Malmo', 55.605, 13.0038, 'SWE'],
            ['Kobenhavn', 55.6761, 12.5683, 'DNK'],
            ['Roros', 62.5744, 11.3842, 'NOR'],
            ['Kiruna', 67.8558, 20.2253, 'SWE'],
            ['Klaipeda', 55.7033, 21.1443, 'LTU'],
            ['Kuressaare', 58.2528, 22.4869, 'EST'],
        ];
        const wrong: string[] = [];
        for (const [name, lat, lon, truth] of ALL) {
            const v = resolveNationalJurisdiction(lat, lon);
            if (v.ok && v.iso3 !== truth) wrong.push(`${name}: expected ${truth}, ${describeNationalJurisdiction(v)}`);
        }
        expect(wrong).toEqual([]);
    });
});

describe('provenance and purity', () => {
    it('the shipped boundary set names its source, licence and MEASURED tolerance', () => {
        expect(NATIONAL_BOUNDARY_SET.licence).toMatch(/public domain/i);
        expect(NATIONAL_BOUNDARY_SET.licenceUrl).toBe('https://www.naturalearthdata.com/about/terms-of-use/');
        expect(NATIONAL_BOUNDARY_SET.sourceSha256).toHaveLength(64);
        expect(NATIONAL_BOUNDARY_SET.positionalToleranceM).toBe(1500);
        expect(NATIONAL_BOUNDARY_SET.coastalToleranceM).toBe(2000);
        // The simplification applied to the source must stay far below the dataset's own error,
        // so it never becomes the dominant term.
        expect(NATIONAL_BOUNDARY_SET.simplifiedToleranceM).toBeLessThan(
            NATIONAL_BOUNDARY_SET.positionalToleranceM / 10,
        );
    });

    it('never throws and never claims on a non-finite point', () => {
        for (const [lat, lon] of [
            [Number.NaN, 14.5],
            [52.3, Number.POSITIVE_INFINITY],
            [Number.NEGATIVE_INFINITY, Number.NaN],
        ] as const) {
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.reason).toBe('non-finite-point');
        }
    });

    it('is deterministic — the same point yields a byte-identical verdict', () => {
        const a = resolveNationalJurisdiction(54.1017, 22.9308);
        const b = resolveNationalJurisdiction(54.1017, 22.9308);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('a claim always names a country that was a bbox candidate', () => {
        for (const [lat, lon] of [
            [40.4168, -3.7038],
            [52.52, 13.405],
            [59.3293, 18.0686],
            [55.6761, 12.5683],
        ] as const) {
            const v = resolveNationalJurisdiction(lat, lon);
            if (v.ok) expect(v.candidates).toContain(v.iso3);
        }
    });
});

describe('falsification · remove the precedence data and the ambiguous towns go ambiguous again', () => {
    // ⛔ THE CONTROL FOR THIS WHOLE LANE. Strip the polygons out of the boundary set and the
    // resolver loses its only means of separating the overlapping bboxes: every contested town
    // collapses back to the L-12871 state — several countries' boxes, nothing able to choose.
    // The resolver must NOT fall back to a box-area guess; it must refuse, by name.
    const stripped = {
        ...NATIONAL_BOUNDARY_SET,
        countries: Object.fromEntries(
            Object.entries(NATIONAL_BOUNDARY_SET.countries).map(([iso, c]) => [iso, { ...c, rings: [] }]),
        ),
    };

    it.each([
        ['Suwalki', 54.1017, 22.9308],
        ['Sejny', 54.1069, 23.3489],
        ['Marijampole', 54.5589, 23.3542],
        ['Frankfurt (Oder)', 52.3412, 14.5506],
        ['Slubice', 52.3506, 14.5701],
    ])('%s becomes a NAMED refusal with no boundary data — never a smallest-box pick', (name, lat, lon) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number, { boundaries: stripped });
        expect(v.ok, `${name} was still claimed without any geometry: ${describeNationalJurisdiction(v)}`).toBe(false);
        if (v.ok) return;
        expect(v.reason).toBe('outside-every-candidate-polygon');
        // The rival country is still visible as a candidate — the ambiguity is reported, not hidden.
        expect(v.candidates.length).toBeGreaterThan(1);
    });

    it('the three resolvable towns DO resolve with the data restored — the control is live', () => {
        expect(claimOf(resolveNationalJurisdiction(54.1017, 22.9308))).toBe('POL');
        expect(claimOf(resolveNationalJurisdiction(54.1069, 23.3489))).toBe('POL');
        expect(claimOf(resolveNationalJurisdiction(54.5589, 23.3542))).toBe('LTU');
    });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// L-12887 · UN-MODELLED-NEIGHBOUR ANNEXATION. Written RED-FIRST 2026-09-02, before the fix:
// the E9 verifier drove 34 border points in countries with NO polygon in the 16-country set and
// got TEN CONFIDENT WRONG CLAIMS — Cesky Tesin CZ→PL by POLYGON CONTAINMENT (the strongest basis
// this module issues), Vaduz LI→CH, Monaco MC→FR, Athus BE→LU, Vise BE→NL, Valka LV→EE,
// Ivangorod RU→EE, Sovetsk RU→LT, Hradek CZ→PL, Fnideq MA→ES. Mechanism: the nearest-polygon
// coastal rescue has no rival to lose to when the true owner is absent, and an absent rival
// disarms the tolerance band entirely. The fix ships the land neighbours as REFUSAL-ONLY
// members (`neighbours` in the boundary set): they can never be claimed — they exist so a point
// in un-modelled territory is REFUSED BY NAME instead of annexed.
// ════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12887 · a point in un-modelled territory is never annexed by a modelled country', () => {
    // [name, lat, lon, true owner (never claimable), the country the broken resolver annexed it to]
    const ANNEXED: readonly (readonly [string, number, number, string, string])[] = [
        ['Cesky Tesin (CZ)', 49.746, 18.626, 'CZE', 'POL'],
        ['Hradek nad Nisou (CZ)', 50.8528, 14.8446, 'CZE', 'POL'],
        ['Vaduz (LI)', 47.141, 9.5209, 'LIE', 'CHE'],
        ['Monaco (MC)', 43.7384, 7.4246, 'MCO', 'FRA'],
        ['Athus (BE)', 49.5622, 5.8261, 'BEL', 'LUX'],
        ['Vise (BE)', 50.7377, 5.6997, 'BEL', 'NLD'],
        ['Valka (LV)', 57.7772, 26.0146, 'LVA', 'EST'],
        ['Ivangorod (RU)', 59.3714, 28.2149, 'RUS', 'EST'],
        ['Sovetsk (RU, Kaliningrad)', 55.0819, 21.8884, 'RUS', 'LTU'],
        ['Fnideq (MA)', 35.8489, -5.3576, 'MAR', 'ESP'],
    ];

    it.each(ANNEXED)('%s is REFUSED, never claimed for a modelled country', (name, lat, lon) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number);
        expect(v.ok, `${name} was CLAIMED: ${describeNationalJurisdiction(v)}`).toBe(false);
    });

    it.each(ANNEXED)('%s: the refusal NAMES the un-modelled true owner where it contains the point', (name, lat, lon, owner) => {
        const v = resolveNationalJurisdiction(lat as number, lon as number);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        // Two honest shapes: the neighbour polygon contains the point (claimed-by-unmodelled-
        // neighbour, owner named), or ne_10m displacement puts the point inside a MODELLED
        // polygon and the neighbour is the within-tolerance rival (rival named). Either way the
        // detail must carry the true owner's ISO3 so the refusal is diagnosable.
        expect([
            'claimed-by-unmodelled-neighbour',
            'within-dataset-tolerance-of-rival',
            'ambiguous-nearest-polygon',
        ]).toContain(v.reason);
        expect(v.detail).toContain(owner as string);
    });

    it('interior points of un-modelled neighbours stay refused too (the 24 that already refused must not regress)', () => {
        const INTERIOR: readonly (readonly [string, number, number])[] = [
            ['Praha (CZ)', 50.0755, 14.4378],
            ['Brno (CZ)', 49.1951, 16.6068],
            ['Riga (LV)', 56.9496, 24.1052],
            ['Daugavpils (LV)', 55.8714, 26.5161],
            ['Bruxelles (BE)', 50.8467, 4.3525],
            ['Liege (BE)', 50.6326, 5.5797],
            ['Kaliningrad (RU)', 54.7104, 20.4522],
            ['Pskov (RU)', 57.8136, 28.3496],
            ['Innsbruck (AT)', 47.2692, 11.4041],
            ['Bregenz (AT)', 47.5031, 9.7471],
            ['Andorra la Vella (AD)', 42.5063, 1.5218],
            ['San Marino (SM)', 43.9424, 12.4578],
            ['Ljubljana (SI)', 46.0569, 14.5058],
            ['Tanger (MA)', 35.7595, -5.834],
        ];
        const wrong: string[] = [];
        for (const [name, lat, lon] of INTERIOR) {
            const v = resolveNationalJurisdiction(lat, lon);
            if (v.ok) wrong.push(`${name}: ${describeNationalJurisdiction(v)}`);
        }
        expect(wrong).toEqual([]);
    });

    it('⛔ CONTROL: with the neighbour ring STRIPPED the annexation returns — the guard is load-bearing', () => {
        // If this control ever stops claiming, the assertions above pass vacuously.
        const noNeighbours = { ...NATIONAL_BOUNDARY_SET, neighbours: {} };
        const vaduz = resolveNationalJurisdiction(47.141, 9.5209, { boundaries: noNeighbours });
        expect(vaduz.ok, describeNationalJurisdiction(vaduz)).toBe(true);
        if (vaduz.ok) expect(vaduz.iso3).toBe('CHE');
        const athus = resolveNationalJurisdiction(49.5622, 5.8261, { boundaries: noNeighbours });
        expect(athus.ok, describeNationalJurisdiction(athus)).toBe(true);
        if (athus.ok) expect(athus.iso3).toBe('LUX');
    });

    it('a neighbour is REFUSAL-ONLY: no verdict ever claims a neighbour ISO3', () => {
        // Sweep every annexation witness + interior neighbour point: `ok:true` must never carry
        // an iso3 that is not one of the 16 claimable members.
        const claimable = new Set(Object.keys(NATIONAL_BOUNDARY_SET.countries));
        for (const [, lat, lon] of ANNEXED) {
            const v = resolveNationalJurisdiction(lat as number, lon as number);
            if (v.ok) expect(claimable.has(v.iso3), `claimed non-member ${v.iso3}`).toBe(true);
        }
    });

    it('the neighbour set documents its own provenance (same source, same discipline)', () => {
        const set = NATIONAL_BOUNDARY_SET;
        expect(Object.keys(set.neighbours ?? {}).length).toBeGreaterThanOrEqual(12);
        for (const iso3 of ['CZE', 'LVA', 'BEL', 'AUT', 'LIE', 'RUS', 'BLR', 'AND', 'MCO', 'SMR', 'SVN', 'MAR']) {
            expect(set.neighbours?.[iso3]?.rings?.length ?? 0, iso3).toBeGreaterThan(0);
        }
    });
});
