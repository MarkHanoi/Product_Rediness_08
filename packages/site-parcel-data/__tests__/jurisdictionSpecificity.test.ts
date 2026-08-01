// §JURISDICTION-SPECIFICITY (L-652) — ROUTING EXCLUSIVITY over EVERY registered jurisdiction.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS FILE EXISTS TO STOP RECURRING
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `listJurisdictionCoverage()` was consumed by a FIRST-MATCH lookup, and `REGISTRATIONS` lists
// Barcelona first. `BARCELONA_BBOX` is a documented LOOSE METROPOLITAN proximity gate and it FULLY
// CONTAINS the municipal boxes of L'Hospitalet, Badalona, Sant Boi and Cornellà — the four
// municipalities registered afterwards, each with a DELIBERATELY EMPTY `packsByZone` precisely
// because no human has verified that any of their claus equals Barcelona's. So a real
// L'Hospitalet parcel was answered `es-08019-barcelona`: Barcelona's packed numbers and Barcelona's
// citations stamped onto another municipality's land — the exact mis-citation those registrations
// were created to prevent. A wrong-jurisdiction answer is worse than no answer.
//
// The four registrations each say they are "peeled off before `isInBarcelona`". That intent lived
// ONLY in `siteDispatch.ts`'s hand-ordered `if` chain, invisible to every other consumer. It now
// lives on the registration as `extentResolution`, applied by `resolveJurisdictionClaim()`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THESE TESTS ARE PROPERTIES AND NOT A LIST OF CITIES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A list of cities pins today's registry and says nothing about the NEXT registration. Every case
// below is quantified over `listJurisdictionCoverage()` and re-derives the overlaps from the
// SHIPPED boxes, so a future registration that overlaps an existing one at the same or a coarser
// resolution fails HERE — at the moment it is added, not on someone's parcel.
//
// NETWORK: none. Pure geometry over the shipped extents.

import { describe, it, expect } from 'vitest';
import {
    listJurisdictionCoverage,
    resolveJurisdictionClaim,
    resolveRegisteredJurisdictionAt,
    JURISDICTION_EXTENT_RESOLUTIONS,
    BCN_JURISDICTION_ID,
    type JurisdictionCoverage,
    type JurisdictionExtent,
} from '../src/rulepacks/registry.js';
import { LHOSPITALET_JURISDICTION_ID } from '../src/rulepacks/esLHospitalet.js';
import { BADALONA_JURISDICTION_ID } from '../src/rulepacks/esBadalona.js';
import { SANT_BOI_JURISDICTION_ID } from '../src/rulepacks/esSantBoi.js';
import { CORNELLA_JURISDICTION_ID } from '../src/rulepacks/esCornella.js';
import { isInBarcelona } from '../src/providers/barcelonaBbox.js';
import { CH_JURISDICTION_ID } from '../src/rulepacks/chZoning.js';
import { DK_PLANDATA_JURISDICTION_ID } from '../src/rulepacks/dkPlandataEnvelope.js';
import { NL_JURISDICTION_ID } from '../src/rulepacks/nlBestemmingsplan.js';
import { CATALUNYA_JURISDICTION_ID } from '../src/rulepacks/esCatalunya.js';

const ALL = listJurisdictionCoverage();
const rank = (c: JurisdictionCoverage): number =>
    JURISDICTION_EXTENT_RESOLUTIONS.indexOf(c.extentResolution);

/** Interior sample points: the centre, plus a 5×5 grid inset 10 % from every edge. */
function interiorPoints(e: JurisdictionExtent): ReadonlyArray<readonly [number, number]> {
    const pts: Array<readonly [number, number]> = [];
    const dLat = e.maxLat - e.minLat;
    const dLon = e.maxLon - e.minLon;
    for (let i = 0; i <= 4; i++) {
        for (let j = 0; j <= 4; j++) {
            pts.push([e.minLat + dLat * (0.1 + 0.2 * i), e.minLon + dLon * (0.1 + 0.2 * j)]);
        }
    }
    return pts;
}

describe('§JURISDICTION-SPECIFICITY — the registry declares a resolution for every extent', () => {
    it('every registration declares an `extentResolution` from the known ladder', () => {
        expect(ALL.length).toBeGreaterThan(0);
        for (const c of ALL) {
            expect(
                JURISDICTION_EXTENT_RESOLUTIONS,
                `${c.jurisdictionId} declares an unknown extent resolution`,
            ).toContain(c.extentResolution);
        }
    });

    it("every registration's own predicate is true at its own extent centre", () => {
        // If this fails the extent and the predicate have drifted apart, and NOTHING below means
        // what it says — the whole coverage claim (C60 §2) rests on them being the same statement.
        for (const c of ALL) {
            const lat = (c.extent.minLat + c.extent.maxLat) / 2;
            const lon = (c.extent.minLon + c.extent.maxLon) / 2;
            expect(c.contains(lat, lon), c.jurisdictionId).toBe(true);
        }
    });

    it('the ladder is strictly ordered and has no duplicate rungs', () => {
        expect(new Set(JURISDICTION_EXTENT_RESOLUTIONS).size).toBe(
            JURISDICTION_EXTENT_RESOLUTIONS.length,
        );
    });
});

describe('§JURISDICTION-SPECIFICITY — routing exclusivity over EVERY registered jurisdiction', () => {
    it("each registration's extent CENTRE resolves to that registration", () => {
        // The case that caught the defect. Kept as a property, not as four city names.
        for (const c of ALL) {
            const lat = (c.extent.minLat + c.extent.maxLat) / 2;
            const lon = (c.extent.minLon + c.extent.maxLon) / 2;
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            expect(r.kind, `${c.jurisdictionId} centre`).toBe('resolved');
            if (r.kind !== 'resolved') continue;
            expect(r.jurisdiction.jurisdictionId, `${c.jurisdictionId} centre`).toBe(c.jurisdictionId);
        }
    });

    it('NO point inside ANY registered extent is ambiguous — no two claims tie', () => {
        for (const c of ALL) {
            for (const [lat, lon] of interiorPoints(c.extent)) {
                const r = resolveRegisteredJurisdictionAt(lat, lon);
                expect(
                    r.kind,
                    `${c.jurisdictionId} @ ${lat.toFixed(4)},${lon.toFixed(4)} — two registrations ` +
                        'claim this point at the SAME resolution. Resolve the overlap (make one ' +
                        'finer, or shrink a box); do NOT break the tie by hand.',
                ).not.toBe('ambiguous');
            }
        }
    });

    it('a point inside a registration resolves to it, or to a STRICTLY FINER claim — never coarser', () => {
        // THE routing-exclusivity property. It is not "exactly one claimant" — Barcelona's
        // metropolitan gate legitimately overlaps four municipal boxes — it is "the winner is never
        // less specific than a registration that claims the point". A new registration that
        // overlapped an existing one at the same or a coarser resolution fails here.
        for (const c of ALL) {
            for (const [lat, lon] of interiorPoints(c.extent)) {
                const r = resolveRegisteredJurisdictionAt(lat, lon);
                expect(r.kind, `${c.jurisdictionId} @ ${lat},${lon}`).toBe('resolved');
                if (r.kind !== 'resolved') continue;
                const won = r.jurisdiction;
                expect(won.contains(lat, lon), `${won.jurisdictionId} must contain what it won`).toBe(
                    true,
                );
                if (won.jurisdictionId === c.jurisdictionId) continue;
                expect(
                    rank(won),
                    `${c.jurisdictionId} @ ${lat.toFixed(4)},${lon.toFixed(4)} lost to ` +
                        `${won.jurisdictionId}, which is NOT more specific (${won.extentResolution} ` +
                        `vs ${c.extentResolution})`,
                ).toBeLessThan(rank(c));
            }
        }
    });

    it('registration ORDER is not load-bearing — every permutation of a pair agrees', () => {
        // Order used to decide everything. Prove it now decides nothing, by re-running the rule on
        // reversed and rotated claim lists for every overlapping pair in the registry.
        const overlaps: Array<readonly [JurisdictionCoverage, JurisdictionCoverage]> = [];
        for (let i = 0; i < ALL.length; i++) {
            for (let j = i + 1; j < ALL.length; j++) {
                const a = ALL[i]!;
                const b = ALL[j]!;
                const dLat = Math.min(a.extent.maxLat, b.extent.maxLat) - Math.max(a.extent.minLat, b.extent.minLat);
                const dLon = Math.min(a.extent.maxLon, b.extent.maxLon) - Math.max(a.extent.minLon, b.extent.minLon);
                if (dLat >= 0 && dLon >= 0) overlaps.push([a, b]);
            }
        }
        // Today: the four Barcelona ⊃ AMB-municipality pairs, PLUS the five Catalonia ⊃ <Catalan
        // registration> pairs added by the L-658 `es-ct-catalunya` registration. Asserted so that a
        // NEW overlap is a visible, deliberate change rather than a silent one.
        //
        // ⚠ THE FIVE NEW PAIRS ARE THE POINT OF THAT REGISTRATION, NOT A SIDE EFFECT. Catalonia is
        // declared `'regional'` — coarser than both `'metropolitan'` (Barcelona) and `'municipal'`
        // (the four AMB cities) — so it LOSES every one of these overlaps by rule. That is exactly
        // what makes registering the next Catalan municipality a pure data addition: it will add a
        // 10th pair here and win it, with no ordering edit anywhere. The loop below proves the
        // losing is by RULE and not by list order, for all nine pairs.
        expect(overlaps.map(([a, b]) => `${a.jurisdictionId}|${b.jurisdictionId}`).sort()).toEqual(
            [
                `${BCN_JURISDICTION_ID}|${BADALONA_JURISDICTION_ID}`,
                `${BCN_JURISDICTION_ID}|${CORNELLA_JURISDICTION_ID}`,
                `${BCN_JURISDICTION_ID}|${LHOSPITALET_JURISDICTION_ID}`,
                `${BCN_JURISDICTION_ID}|${SANT_BOI_JURISDICTION_ID}`,
                `${BCN_JURISDICTION_ID}|${CATALUNYA_JURISDICTION_ID}`,
                `${LHOSPITALET_JURISDICTION_ID}|${CATALUNYA_JURISDICTION_ID}`,
                `${BADALONA_JURISDICTION_ID}|${CATALUNYA_JURISDICTION_ID}`,
                `${SANT_BOI_JURISDICTION_ID}|${CATALUNYA_JURISDICTION_ID}`,
                `${CORNELLA_JURISDICTION_ID}|${CATALUNYA_JURISDICTION_ID}`,
            ].sort(),
        );
        for (const [a, b] of overlaps) {
            const lat = (Math.max(a.extent.minLat, b.extent.minLat) + Math.min(a.extent.maxLat, b.extent.maxLat)) / 2;
            const lon = (Math.max(a.extent.minLon, b.extent.minLon) + Math.min(a.extent.maxLon, b.extent.maxLon)) / 2;
            const forward = resolveJurisdictionClaim([a, b], lat, lon);
            const reverse = resolveJurisdictionClaim([b, a], lat, lon);
            expect(forward.kind).toBe('resolved');
            expect(reverse.kind).toBe('resolved');
            if (forward.kind !== 'resolved' || reverse.kind !== 'resolved') continue;
            expect(forward.jurisdiction.jurisdictionId).toBe(reverse.jurisdiction.jurisdictionId);
            // …and the whole-registry answer agrees with the isolated pair.
            const whole = resolveRegisteredJurisdictionAt(lat, lon);
            expect(whole.kind).toBe('resolved');
            if (whole.kind === 'resolved') {
                expect(whole.jurisdiction.jurisdictionId).toBe(forward.jurisdiction.jurisdictionId);
            }
        }
    });

    it('a non-finite or unclaimed point yields `none`, never a throw and never a guess', () => {
        for (const [lat, lon] of [
            [Number.NaN, 2.1],
            [41.4, Number.POSITIVE_INFINITY],
            [0, 0], // Gulf of Guinea
            [35.6812, 139.7671], // Tokyo
        ] as const) {
            expect(resolveRegisteredJurisdictionAt(lat, lon).kind).toBe('none');
        }
    });
});

describe('§JURISDICTION-SPECIFICITY — the AMB regression, by real coordinates', () => {
    // Reference points copied from the four municipalities' own routing tests.
    const AMB: ReadonlyArray<readonly [string, number, number]> = [
        [LHOSPITALET_JURISDICTION_ID, 41.3593, 2.1004],
        [BADALONA_JURISDICTION_ID, 41.445, 2.248],
        [SANT_BOI_JURISDICTION_ID, 41.343, 2.039],
        [CORNELLA_JURISDICTION_ID, 41.3585, 2.071],
    ];

    it('Barcelona genuinely claims all four — so the RULE, not the geometry, is what decides', () => {
        for (const [id, lat, lon] of AMB) expect(isInBarcelona(lat, lon), id).toBe(true);
    });

    it('…and every one of them resolves to its OWN municipality, with Barcelona outranked', () => {
        for (const [id, lat, lon] of AMB) {
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            expect(r.kind, id).toBe('resolved');
            if (r.kind !== 'resolved') continue;
            expect(r.jurisdiction.jurisdictionId, id).toBe(id);
            // ⚠ TWO claims are now outranked, and the ORDER of this list is itself the assertion:
            // `outranked` is finest-first, so Barcelona's `'metropolitan'` box must come BEFORE
            // Catalonia's `'regional'` one. If the regional rung were ever mis-placed in the ladder
            // (or Catalonia mis-declared as `'metropolitan'`), this ordering — not just the
            // membership — is what would catch it.
            expect(r.outranked.map((c) => c.jurisdictionId), id).toEqual([
                BCN_JURISDICTION_ID,
                CATALUNYA_JURISDICTION_ID,
            ]);
            // The registration they win with is the honest one: NO packs, a cited refusal.
            expect(r.jurisdiction.packZoneCodes, id).toEqual([]);
        }
    });

    it('Barcelona is NOT shrunk by the fix — its own fabric still resolves to Barcelona', () => {
        // Passeig de Gràcia (Eixample) and Sants, the district adjacent to L'Hospitalet.
        for (const [lat, lon] of [[41.3916, 2.165], [41.375, 2.138]] as const) {
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            expect(r.kind).toBe('resolved');
            if (r.kind !== 'resolved') continue;
            expect(r.jurisdiction.jurisdictionId).toBe(BCN_JURISDICTION_ID);
            // ⚠ Barcelona's own fabric now outranks exactly ONE coarser claim — Catalonia — and
            // nothing else. This assertion used to read `toEqual([])`, which was only ever true
            // because no registration was coarser than Barcelona's metropolitan box. What it was
            // actually pinning is that Barcelona still WINS its own streets, and that is preserved
            // verbatim above; naming the single outranked claim keeps the pin exact rather than
            // loosening it to "some list".
            expect(r.outranked.map((c) => c.jurisdictionId)).toEqual([CATALUNYA_JURISDICTION_ID]);
        }
    });
});

describe('§EXTENT-SPILLS-A-BORDER — a rectangle cannot follow a national border', () => {
    // ⚠ THESE CASES PIN A KNOWN, UNFIXED DEFECT — they are not a claim that it is solved. The three
    // NATIONAL registrations claim real foreign land, and the specificity rule cannot help because
    // there is no registered neighbour to out-rank them. Recorded as executable measurements so the
    // scope is exact, and so the closing move is a DATA addition proven below rather than described.
    const SPILLS: ReadonlyArray<readonly [string, number, number, string]> = [
        ['Brussels, BE', 50.8503, 4.3517, NL_JURISDICTION_ID],
        ['Antwerp, BE', 51.2194, 4.4025, NL_JURISDICTION_ID],
        ['Düsseldorf, DE', 51.2277, 6.7735, NL_JURISDICTION_ID],
        ['Cologne, DE', 50.9375, 6.9603, NL_JURISDICTION_ID],
        ['Malmö, SE', 55.605, 13.0038, DK_PLANDATA_JURISDICTION_ID],
        ['Gothenburg, SE', 57.7089, 11.9746, DK_PLANDATA_JURISDICTION_ID],
        ['Flensburg, DE', 54.7937, 9.4469, DK_PLANDATA_JURISDICTION_ID],
        ['Como, IT', 45.8081, 9.0852, CH_JURISDICTION_ID],
        ['Vaduz, LI', 47.141, 9.5209, CH_JURISDICTION_ID],
        ['Konstanz, DE', 47.6603, 9.1758, CH_JURISDICTION_ID],
    ];

    it('records EXACTLY which foreign cities the national boxes over-claim today', () => {
        for (const [name, lat, lon, claimant] of SPILLS) {
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            expect(r.kind, name).toBe('resolved');
            if (r.kind !== 'resolved') continue;
            expect(r.jurisdiction.jurisdictionId, `${name} — over-claimed`).toBe(claimant);
        }
    });

    it('the fix is a DATA addition: registering the neighbour closes it with no engine edit', () => {
        // Proof that the mechanism is READY, so the day a Belgian rule pack lands nothing here
        // changes. `resolveJurisdictionClaim` is the same rule `resolveRegisteredJurisdictionAt`
        // applies — this is the production rule over a claim list with one extra member.
        const BELGIUM = {
            jurisdictionId: 'be-synthetic-for-this-test',
            contains: (lat: number, lon: number) =>
                lat >= 49.4 && lat <= 51.55 && lon >= 2.5 && lon <= 6.45,
            extentResolution: 'national' as const,
        };
        const claims = [
            ...ALL.map((c) => ({
                jurisdictionId: c.jurisdictionId,
                contains: c.contains,
                extentResolution: c.extentResolution,
            })),
            BELGIUM,
        ];
        // Two NATIONAL claims tie on Brussels ⇒ AMBIGUOUS, refused — which is already strictly
        // better than a Dutch instrument cited on Belgian land, and is the honest answer while both
        // boxes over-claim. A finer (municipal/regional) Belgian registration wins outright:
        const brusselsNational = resolveJurisdictionClaim(claims, 50.8503, 4.3517);
        expect(brusselsNational.kind).toBe('ambiguous');
        const finer = [...claims.slice(0, -1), { ...BELGIUM, extentResolution: 'municipal' as const }];
        const brusselsFiner = resolveJurisdictionClaim(finer, 50.8503, 4.3517);
        expect(brusselsFiner.kind).toBe('resolved');
        if (brusselsFiner.kind === 'resolved') {
            expect(brusselsFiner.jurisdiction.jurisdictionId).toBe('be-synthetic-for-this-test');
        }
        // …and the Netherlands proper is untouched by the neighbour's arrival (Utrecht).
        const utrecht = resolveJurisdictionClaim(finer, 52.0907, 5.1214);
        expect(utrecht.kind).toBe('resolved');
        if (utrecht.kind === 'resolved') {
            expect(utrecht.jurisdiction.jurisdictionId).toBe(NL_JURISDICTION_ID);
        }
    });
});
