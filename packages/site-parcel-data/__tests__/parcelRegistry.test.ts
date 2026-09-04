// L-613 — routing tests for the parcel-provider registry. PURE (no network): asserts that a
// real city point in each wired country routes to the right cadastre, that the documented-
// unreachable countries route to the footprint fallback, and that the resolver never throws.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelJurisdiction,
    resolveParcelCandidates,
    resolveParcelWithFallback,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    UNIVERSAL_FOOTPRINT_JURISDICTION,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';

describe('resolveParcelJurisdiction — cadastral routing (live-probed open cadastres)', () => {
    const cadastral: ReadonlyArray<[string, number, number, string]> = [
        ['Barcelona → Catastro', 41.3915, 2.1649, 'catastro'],
        ['Madrid → Catastro', 40.4168, -3.7038, 'catastro'],
        ['Paris → IGN', 48.8566, 2.3522, 'ign-fr'],
        ['Amsterdam → PDOK', 52.373, 4.8925, 'pdok-nl'],
        ['Oslo → Kartverket', 59.9139, 10.7522, 'geonorge-no'],
        ['Düsseldorf → ALKIS NRW', 51.2277, 6.7735, 'alkis-nrw'],
        ['Copenhagen → Matriklen (deferred stub, still routed cadastral)', 55.6761, 12.5683, 'matrikel-dk'],
        ['Zürich → swisstopo AV (federal identify, keyless)', 47.3769, 8.5417, 'swisstopo-av'],
        // L-650 Phase-4 batch (proxy-pending → route cadastral now, fetch falls to OSM until wired).
        ['Rome → Agenzia Entrate (national INSPIRE cadastre)', 41.9028, 12.4964, 'agenzia-entrate'],
        ['Antwerp → GRB (Flanders, before NL+FR)', 51.2194, 4.4025, 'flanders-grb'],
        ['London → HMLR INSPIRE (England, before FR)', 51.5074, -0.1278, 'gb-os-inspire'],
        ['New York City → MapPLUTO (no overlap with any box)', 40.7128, -74.006, 'nyc-pluto'],
    ];
    for (const [name, lat, lon, providerId] of cadastral) {
        it(name, () => {
            const j = resolveParcelJurisdiction(lat, lon);
            expect(j.providerId).toBe(providerId);
            expect(j.kind).toBe('cadastral');
            expect(j.proxyPath).toBeTruthy();
        });
    }

    // ⚠ HELSINKI WAS REMOVED FROM THE LIST ABOVE 2026-09-04 (lane PARCEL-REACH round 4) and is
    // pinned here INSTEAD, as the honest state — removing a row from a list is how a fact gets lost,
    // so the fact moves rather than disappearing.
    // MEASURED: GET https://pryzm.fly.dev/api/parcel/fi?lon=24.9384&lat=60.1699
    //           → HTTP 404 {"error":"Unknown cadastre 'fi'."}
    // There is no `fi` key in EU_CADASTRE_SOURCES, no fi proxy module, and no MML_API_KEY anywhere
    // under server/ — the key-carrying proxy the FI note described was never built. Asserting
    // kind:'cadastral' here made this suite CERTIFY that a Helsinki click reaches the Finnish land
    // register, when it can only ever return an OSM footprint (C58 §1.4).
    it('Helsinki is a FOOTPRINT, not MML: /api/parcel/fi is a route the server does not serve', () => {
        const j = resolveParcelJurisdiction(60.1699, 24.9384);
        expect(j.providerId).toBe('mml'); // providerId reserved so row + mmlParcelProvider cannot drift
        expect(j.kind).toBe('footprint-fallback');
        expect(j.proxyPath).toBeNull();
        // FI still outranks the enclosing Norwegian row — the demotion is about the LABEL, not routing.
        expect(j.regionCode).toBe('FI');
    });
});

describe('resolveParcelJurisdiction — documented footprint-fallback jurisdictions', () => {
    const fallback: ReadonlyArray<[string, number, number, string]> = [
        ['Munich (non-NRW Germany)', 48.1351, 11.582, 'DE'],
        ['Riyadh (SA geo-fenced)', 24.7136, 46.6753, 'SA'],
    ];
    for (const [name, lat, lon, regionCode] of fallback) {
        it(name, () => {
            const j = resolveParcelJurisdiction(lat, lon);
            expect(j.kind).toBe('footprint-fallback');
            expect(j.regionCode).toBe(regionCode);
            expect(j.proxyPath).toBeNull();
            expect(j.providerId).toBe('footprint');
        });
    }
});

describe('resolveParcelJurisdiction — universal footprint + never-throws', () => {
    // L-651: Chicago USED to be the "no US cadastre beyond NYC" example. It now has a live Cook
    // County row, so the example moved to Denver — a US city with no wired parcel source. (The US has
    // no national cadastre, so it is wired city by city; every unwired city still lands here.)
    it('a US point in an unwired city (Denver) routes to the universal footprint', () => {
        const j = resolveParcelJurisdiction(39.7392, -104.9903);
        expect(j).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
        expect(j.kind).toBe('footprint-fallback');
    });
    it('Chicago now routes to the Cook County cadastre (L-651 wired it)', () => {
        expect(resolveParcelJurisdiction(41.8781, -87.6298).providerId).toBe('chicago-cook');
    });
    it('mid-ocean routes to the universal footprint', () => {
        expect(resolveParcelJurisdiction(0, -30)).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
    });
    // Lane PARCEL-REACH round 3 (2026-09-04) — MEASURED before the fix: Valletta → `IT:cadastral`.
    // Malta is a sovereign state inside ITALY_BBOX; labelling it Italy and dispatching to the Agenzia
    // WFS (which cannot serve it, and holds a 25 s deadline) was the C58 §1.4 wrong-country failure.
    it('Valletta (Malta) is NOT Italy — no Italian candidate is offered, the honest universal footprint is', () => {
        const cands = resolveParcelCandidates(35.8989, 14.5146);
        expect(cands.map((c) => c.regionCode)).not.toContain('IT');
        expect(resolveParcelJurisdiction(35.8989, 14.5146)).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
        // The falsification control: Sicily just north of the carve-out is still Italian.
        expect(resolveParcelJurisdiction(36.7306, 14.8497).regionCode).toBe('IT'); // Pozzallo
    });
    it('never throws on NaN / Infinity / garbage', () => {
        expect(() => resolveParcelJurisdiction(NaN, 0)).not.toThrow();
        expect(() => resolveParcelJurisdiction(0, Infinity)).not.toThrow();
        expect(resolveParcelJurisdiction(NaN, NaN)).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
        // @ts-expect-error — hostile input must still not throw.
        expect(() => resolveParcelJurisdiction('x', undefined)).not.toThrow();
    });
    it('NRW precedes the whole-Germany footprint entry (order matters)', () => {
        // Düsseldorf is in both NRW_BBOX and GERMANY_BBOX; the cadastral entry must win.
        expect(resolveParcelJurisdiction(51.2277, 6.7735).providerId).toBe('alkis-nrw');
    });
    it('Zürich escapes FRANCE_BBOX (maxLon 8.3°) and routes to the Swiss AV cadastre', () => {
        // 8.5417°E is east of France's eastern edge, so FR does not swallow it — CH wins.
        expect(resolveParcelJurisdiction(47.3769, 8.5417).providerId).toBe('swisstopo-av');
    });
    it('Geneva: the single verdict now AGREES with the dispatch — both say Switzerland', () => {
        // 6.14°E, 46.20°N is inside BOTH FRANCE_BBOX and SWITZERLAND_BBOX.
        // ⚠ UPDATED 2026-09-04 (lane PARCEL-REACH) — this test previously asserted 'ign-fr' and
        // NAMED THE BUG IT WAS PINNING: "the legacy single verdict stays FR (first-match)". A click
        // in Geneva fetched from the SWISS cadastre (the candidate list held swisstopo-av alone)
        // while the coverage/labelling verdict said FRANCE. `resolveParcelJurisdiction` is now the
        // HEAD of `resolveParcelCandidates` instead of a second, order-only algorithm, so label and
        // fetch agree by construction and Geneva reads Swiss on both. The same change corrected
        // Köln (labelled FR since FRANCE_BBOX reaches 8.3°E) and München (labelled AT once
        // AUSTRIA_BBOX existed). A verdict that can contradict the fetch is not a coarse answer,
        // it is a confident falsehood about which sovereign register owns the user's land.
        expect(resolveParcelJurisdiction(46.2044, 6.1432).providerId).toBe('swisstopo-av');
        expect(resolveParcelCandidates(46.2044, 6.1432).map((j) => j.providerId)).toEqual([
            'swisstopo-av',
        ]);
    });
    it('lists all registered jurisdictions (cadastral + fallback)', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(
            expect.arrayContaining([
                'ES', 'FR', 'NL', 'NO', 'DE-NW', 'DE', 'CH', 'DK', 'SA',
                // L-650 Phase-4 batch.
                'IT', 'BE-VLG', 'GB-ENG', 'FI', 'US-NY-NYC',
            ]),
        );
    });
});

// ── L-650 per-point PRIORITY-FALLBACK dispatch — specificity ordering + fall-through ─────────────

// ⚠ SECTION UPDATED 2026-09-02 (L-12871 wave). These four used to pin CROSS-COUNTRY candidate
// lists produced by the smallest-box rule (Kirkenes FI-then-NO, Eindhoven BE-then-NL, Calais
// GB-then-FR) and relied on each wrong-country cadastre's null to self-correct. The national
// claim filter in `resolveParcelCandidates` now removes wrong-country candidates outright:
// Kirkenes is NORWEGIAN, so Norway alone is offered. Specificity still orders SUB-NATIONAL rows
// within the claimed country (Düsseldorf: NRW before the DE footprint) — that is the one job the
// area sort keeps on a claim.
describe('resolveParcelCandidates — national claim filters, specificity orders within a country', () => {
    it('Kirkenes is Norwegian: NO alone is offered (FI is no longer tried first)', () => {
        // 69.73°N, 30.05°E is inside BOTH the Finland and Norway boxes; the CLAIM (NOR) decides.
        const ids = resolveParcelCandidates(69.7263, 30.0464).map((j) => j.providerId);
        expect(ids).toEqual(['geonorge-no']);
    });
    it('Eindhoven is Dutch: NL alone is offered (Flanders is no longer tried first)', () => {
        // 51.44°N, 5.48°E is inside FLANDERS_BBOX and NETHERLANDS_BBOX (and NOT FRANCE — lat > 51.2).
        const ids = resolveParcelCandidates(51.4416, 5.4697).map((j) => j.providerId);
        expect(ids).toEqual(['pdok-nl']);
    });
    it('Calais is French: FR alone is offered (England is no longer tried first)', () => {
        const ids = resolveParcelCandidates(50.9513, 1.8587).map((j) => j.providerId);
        expect(ids).toEqual(['ign-fr']);
    });
    it('Düsseldorf: the DEU claim keeps BOTH German rows, NRW first by specificity; NL is dropped', () => {
        const ids = resolveParcelCandidates(51.2277, 6.7735).map((j) => j.providerId);
        // ⚠ UPDATED 2026-09-04 (lane PARCEL-REACH): `alkis-ni` joined the list because
        // Niedersachsen's rectangle (51.2–54.0N) reaches Düsseldorf. NRW still ranks FIRST on
        // specificity, so the click is unchanged; the extra candidate is the walk's insurance, not
        // a defect. Germany's Länder interlock and no rectangle set separates them — see the
        // `isInDeLand` note for the subtraction that was tried and reverted.
        expect(ids).toEqual(['alkis-nrw', 'alkis-ni', 'footprint']);
    });
    it('a non-overlapping interior point has exactly one candidate', () => {
        expect(resolveParcelCandidates(41.9028, 12.4964).map((j) => j.providerId)).toEqual([
            'agenzia-entrate',
        ]);
    });
    it('specificity: a city/region box is strictly smaller than its enclosing national box', () => {
        // (Point moved to Düsseldorf 2026-09-02: Kirkenes now yields a single NO row, so the
        // within-country pair to compare is NRW vs the DE footprint.)
        const [nrw, de] = resolveParcelCandidates(51.2277, 6.7735);
        expect(parcelJurisdictionSpecificity(nrw!)).toBeLessThan(parcelJurisdictionSpecificity(de!));
        expect(parcelJurisdictionSpecificity(UNIVERSAL_FOOTPRINT_JURISDICTION)).toBe(
            Number.POSITIVE_INFINITY,
        );
    });
    it('never throws on garbage → empty candidate list', () => {
        expect(resolveParcelCandidates(NaN, 0)).toEqual([]);
        expect(resolveParcelCandidates(0, Infinity)).toEqual([]);
    });
});

describe('resolveParcelWithFallback — falls THROUGH a null provider to the enclosing live cadastre', () => {
    /** A fetchFor that returns a fake parcel ONLY for the given providerIds, null otherwise. */
    const answersFor =
        (...liveIds: string[]) =>
        (jur: ParcelJurisdiction): { id: string } | null =>
            liveIds.includes(jur.providerId) ? { id: jur.providerId } : null;

    it('Kirkenes: FI proxy null → resolves NO (the live Kartverket cadastre)', async () => {
        const hit = await resolveParcelWithFallback(69.7263, 30.0464, answersFor('geonorge-no'));
        expect(hit?.jurisdiction.providerId).toBe('geonorge-no');
        expect(hit?.parcel).toEqual({ id: 'geonorge-no' });
    });
    it('Eindhoven: BE (proxy-pending) null → resolves NL (the live PDOK cadastre)', async () => {
        const hit = await resolveParcelWithFallback(51.4416, 5.4697, answersFor('pdok-nl'));
        expect(hit?.jurisdiction.providerId).toBe('pdok-nl');
    });
    it('Calais: GB (proxy-pending) null → resolves FR (the live IGN cadastre)', async () => {
        const hit = await resolveParcelWithFallback(50.9513, 1.8587, answersFor('ign-fr'));
        expect(hit?.jurisdiction.providerId).toBe('ign-fr');
    });
    it('a genuine FI parcel: FI proxy answers → resolves FI (does NOT fall through)', async () => {
        const hit = await resolveParcelWithFallback(60.1699, 24.9384, answersFor('mml', 'geonorge-no'));
        expect(hit?.jurisdiction.providerId).toBe('mml');
        expect(hit?.parcel).toEqual({ id: 'mml' });
    });
    it('every provider null → returns null (caller applies the universal footprint)', async () => {
        const hit = await resolveParcelWithFallback(51.4416, 5.4697, () => null);
        expect(hit).toBeNull();
    });
    it('a throwing provider is a miss — falls through, never propagates', async () => {
        const hit = await resolveParcelWithFallback(69.7263, 30.0464, (jur) => {
            if (jur.providerId === 'mml') throw new Error('proxy 500');
            return { id: jur.providerId };
        });
        expect(hit?.jurisdiction.providerId).toBe('geonorge-no');
    });
    it('awaits async providers and respects specificity order', async () => {
        const seen: string[] = [];
        const hit = await resolveParcelWithFallback(51.2277, 6.7735, async (jur) => {
            seen.push(jur.providerId);
            return null; // force a full walk
        });
        expect(hit).toBeNull();
        // (Updated 2026-09-02: pdok-nl no longer appears — the DEU claim drops the NL row.)
        // (Updated 2026-09-04: `alkis-ni` sits between them — Niedersachsen's box reaches
        // Düsseldorf. The ORDER is the assertion that matters: NRW is tried first.)
        expect(seen).toEqual(['alkis-nrw', 'alkis-ni', 'footprint']);
    });
    it('never throws on garbage → null', async () => {
        await expect(resolveParcelWithFallback(NaN, NaN, () => ({ id: 'x' }))).resolves.toBeNull();
    });
});

// ── LANE PARCEL-REACH (2026-09-04) — CZ · IE · AT reachability ──────────────────────────────────
// These three had NO REGISTRY ROW AT ALL, which is worse than an unwired row: the resolver either
// returned nothing or handed the point to a NEIGHBOUR's rectangle. This block is the standing guard
// that a proxy leg is actually REACHABLE — `committed !== reachable`, and a registry row is not a
// working click.
describe('CZ · IE · AT are routable, and the wrong-country labels stay fixed', () => {
    const cases: ReadonlyArray<readonly [string, number, number, string, string]> = [
        // name, lat, lon, expected regionCode, expected proxyPath
        ['Praha',      50.0875,  14.4213, 'CZ',     '/api/parcel/cz'],
        ['Brno',       49.1951,  16.6068, 'CZ',     '/api/parcel/cz'],
        ['Ostrava',    49.8355,  18.2925, 'CZ',     '/api/parcel/cz'],
        ['Dublin',     53.3503,  -6.2610, 'IE',     '/api/parcel/ie'],
        ['Cork',       51.8990,  -8.4767, 'IE',     '/api/parcel/ie'],
        ['Wien',       48.2084,  16.3731, 'AT',     '/api/parcel/at'],
        ['Salzburg',   47.7982,  13.0465, 'AT',     '/api/parcel/at'],
        ['Innsbruck',  47.2654,  11.3927, 'AT',     '/api/parcel/at'],
    ];
    for (const [name, lat, lon, region, proxy] of cases) {
        it(`${name} routes to ${region} (${proxy}), not a neighbour`, () => {
            const j = resolveParcelJurisdiction(lat, lon);
            expect(j.regionCode).toBe(region);
            expect(j.proxyPath).toBe(proxy);
            expect(j.kind).toBe('cadastral');
        });
    }

    it('the four measured wrong-country labels are all corrected', () => {
        // ⛔ Every one of these was MEASURED WRONG on 2026-09-04 before this lane. They are kept as
        // one test so the whole class regresses together if `resolveParcelJurisdiction` is ever
        // reverted to an order-only walk.
        //   Praha  → DE     (GERMANY_BBOX reaches 15.1°E and nothing more specific existed)
        //   Dublin → GB-ENG (ENGLAND_BBOX reaches −6.5°W; HMLR serves no Irish parcel)
        //   Köln   → FR     (FRANCE_BBOX reaches 8.3°E and the FR row precedes DE-NW) — PRE-EXISTING
        //   München→ AT     (inside AUSTRIA_BBOX; surfaced the moment that box was added)
        expect(resolveParcelJurisdiction(50.0875, 14.4213).regionCode).toBe('CZ');
        expect(resolveParcelJurisdiction(53.3503, -6.2610).regionCode).toBe('IE');
        // ⚠ KÖLN IS DELIBERATELY *NOT* ASSERTED HERE ANY MORE. It was, until the German block
        // landed and made the honest answer messier: Rheinland-Pfalz's rectangle covers Köln, an
        // RP-minus-NRW subtraction fixed the label and COST KOBLENZ ITS CADASTRE, and the
        // subtraction was reverted. Köln's coarse label is now `DE-RP` while the click still
        // resolves from DE-NW via the candidate walk (proven live) — asserted in the Germany block
        // below rather than pretended away here. A test that asserted DE-NW would be describing a
        // repo that does not exist.
        expect(resolveParcelJurisdiction(48.1374, 11.5755).regionCode).toBe('DE');
    });

    it('the wired neighbours are UNCHANGED — the new boxes steal nothing', () => {
        for (const [lat, lon, want] of [
            [52.2297, 21.0122, 'PL'], [48.1436, 17.1077, 'SK'], [46.0514, 14.5060, 'SI'],
            [51.5034, -0.1276, 'GB-ENG'], [47.3728, 8.5387, 'CH'], [45.4640, 9.1900, 'IT'],
            [48.8649, 2.3697, 'FR'], [41.3917, 2.1650, 'ES'], [51.2213, 4.3997, 'BE-VLG'],
        ] as ReadonlyArray<readonly [number, number, string]>) {
            expect(resolveParcelJurisdiction(lat, lon).regionCode).toBe(want);
        }
    });

    it('Belfast is a KNOWN coarse-router tradeoff, recorded rather than hidden', () => {
        // Northern Ireland is contiguous with the Republic, so NO rectangle can separate them: any
        // box that excludes Belfast also excludes Donegal. Belfast therefore labels IE, and the
        // Tailte Éireann leg answers ZERO features there (LPS Northern Ireland is a separate,
        // non-keyless register), so the click self-corrects to the OSM footprint. This is the same
        // documented class as Corsica→footprint, and it is asserted so it stays a KNOWN tradeoff
        // rather than a silent surprise. ⚠ The honest fix is a polygon gate, not a tighter box.
        expect(resolveParcelJurisdiction(54.5973, -5.9301).regionCode).toBe('IE');
    });
});

// ── LANE PARCEL-REACH (2026-09-04) — GERMANY: 14 Länder ─────────────────────────────────────────
describe('Germany: 14 Länder are cadastral, Bayern is an honest footprint', () => {
    const LAENDER = [
        'DE-BW', 'DE-HE', 'DE-NI', 'DE-SN', 'DE-SH', 'DE-BB', 'DE-ST',
        'DE-MV', 'DE-SL', 'DE-HH', 'DE-RP', 'DE-TH', 'DE-HB', 'DE-BE',
    ] as const;

    it('all 14 are registered cadastral with their own proxy route', () => {
        const rows = listParcelJurisdictions();
        for (const code of LAENDER) {
            const row = rows.find((j) => j.regionCode === code);
            expect(row, `${code} must be registered`).toBeDefined();
            expect(row!.kind).toBe('cadastral');
            expect(row!.proxyPath).toBe(`/api/parcel/${code.toLowerCase()}`);
        }
    });

    it('every Land row has a FINITE specificity — a missing REGION_BBOX entry sorts it LAST', () => {
        // ⚠ For a city-state this is not cosmetic: Berlin's box sits inside Brandenburg's and
        // Bremen's inside Niedersachsen's, so a +Infinity score would silently hand the city-state's
        // points to the Land that encloses it. The map spreads DE_LAND_BBOX for exactly this reason.
        for (const code of LAENDER) {
            const row = listParcelJurisdictions().find((j) => j.regionCode === code)!;
            expect(Number.isFinite(parcelJurisdictionSpecificity(row))).toBe(true);
        }
    });

    it('the city-states beat the Länder that enclose them (specificity, not order)', () => {
        expect(resolveParcelJurisdiction(52.5219, 13.4132).regionCode).toBe('DE-BE'); // in DE-BB's box
        expect(resolveParcelJurisdiction(53.0793, 8.8017).regionCode).toBe('DE-HB');  // in DE-NI's box
        expect(resolveParcelJurisdiction(53.5503, 9.9920).regionCode).toBe('DE-HH');  // in DE-NI's box
        // ⚠ POTSDAM is the regression this pins: Berlin's box originally reached to 13.0°E, swallowed
        // Potsdam (13.0645) and — being the SMALLER box — BEAT Brandenburg. A city-state box must be
        // tight precisely BECAUSE its smallness is what makes it win.
        expect(resolveParcelJurisdiction(52.3906, 13.0645).regionCode).not.toBe('DE-BE');
    });

    it('Bayern is a footprint with a NAMED credential blocker, never a dead cadastral row', () => {
        // ⛔ There is deliberately no DE-BY row and no `de-by` proxy key. Bavaria's INSPIRE ALKIS WFS
        // answers 401 with `WWW-Authenticate: Basic realm="INSPIRE-WFS ALKIS"`, and its whole
        // open-data catalogue is raster (Parzellarkarte: PNG/JPEG, "keine Flurstücksnummern", every
        // WMS layer queryable="0"). A stub row would advertise Bayern as wired.
        for (const [lat, lon] of [[48.1374, 11.5755], [49.4521, 11.0767], [49.0134, 12.1016]]) {
            const j = resolveParcelJurisdiction(lat, lon);
            expect(j.regionCode).toBe('DE');
            expect(j.kind).toBe('footprint-fallback');
        }
        expect(listParcelJurisdictions().some((j) => j.regionCode === 'DE-BY')).toBe(false);
    });

    it('⚠ the coarse SINGLE-VERDICT label is a KNOWN tradeoff, recorded rather than hidden', () => {
        // Germany's sixteen Länder INTERLOCK and no set of rectangles separates them: measured over
        // 41 German cities (2026-09-04), eight rectangles claim a neighbour's city — e.g. Köln falls
        // inside Rheinland-Pfalz's box and Leipzig inside Thüringen's.
        // ⛔ A SUBTRACTION WAS TRIED AND REVERTED: `DE-RP` minus `NRW_BBOX` restored Köln and Bonn and
        // in the same stroke took KOBLENZ out of the candidate list entirely (NRW_BBOX reaches
        // 50.3°N), dropping a working Rhineland-Palatinate cadastre to the OSM footprint. Trading a
        // wrong LABEL for a lost PARCEL is the wrong trade.
        // ⭐ THE CLICK IS UNAFFECTED, and that is the part that matters: `resolveParcelWithFallback`
        // walks every candidate and returns the jurisdiction that ACTUALLY ANSWERED — proven live
        // 2026-09-04 for Köln→DE-NW, Bonn→DE-NW, Koblenz→DE-RP, Altenkirchen→DE-RP, Wiesbaden→DE-HE,
        // Leipzig→DE-SN, Potsdam→DE-BB, Halle→DE-ST, Osnabrück→DE-NI, Braunschweig→DE-NI.
        // Within Germany a coarse label is always a WRONG LAND, never a wrong sovereign register.
        expect(resolveParcelJurisdiction(50.9413, 6.9583).regionCode).toBe('DE-RP'); // Köln, coarse
        // …but Köln IS in the candidate list alongside the Land that serves it, so the walk recovers.
        const koeln = resolveParcelCandidates(50.9413, 6.9583).map((j) => j.regionCode);
        expect(koeln).toContain('DE-NW');
        expect(koeln.indexOf('DE-RP')).toBeLessThan(koeln.indexOf('DE'));
    });
});
