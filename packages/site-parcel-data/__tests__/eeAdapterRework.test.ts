// E1d ESTONIA ADAPTER REWORK — the five named items (E1-GATE-DECISION §F item 2 / verdict §G
// item 2) proven at the CHAIN layer (committed ≠ reachable doctrine: these run the same
// `resolveEeParcelChain` the probe harness and the future SDK call, not pure mapper returns).
//
// Fixtures are RECORDED LIVE 2026-09-01 bodies (see fixtures/ee-kopli-raekoja/*.json — the
// label field names the services and the re-record path), replayed via `EeWfsDeps.fetchImpl`.
//
//   1. R1 referent contract — every `basis` ref resolves to a minted entity CARRIED in the
//      chain result (mint the Prescription each rule cites; no dangling `dp_hoonestus:<id>`
//      strings). THE FALSIFICATION TARGET: sever the minting (return the rules citing a
//      prescription while dropping the prescription) and the referent test below fails.
//   2. R3 `validityBasis` — 'legal' + kehtestkp when the register row resolves; 'ingestion'
//      + fetch date when it does not; the prose note apology is GONE in both arms.
//   3. R1 `useScope` — per-use-slot roof pitch carries the verbatim otstarve token typed;
//      no `-slotN` id suffix.
//   4. ringCentroid replaced — the chain queries by served parcel ring (exact server-side
//      intersects, probed); URL builders emit the MEASURED native (N E) axis order, the one
//      the (E N) control probe showed failing SILENTLY.
//   5. fetchChain seam — documented, not guessed (asserted as: the adapter still exposes the
//      chain under `rules.kind: 'structured'`; the SDK type reconciliation note lives in the
//      adapter header, §SEAM-E1BC-FETCHCHAIN).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    EE_PLANK_ABSENCE_CAVEAT,
    buildGeoserverIntersectsRingUrl,
    buildPlankIntersectsRingUrl,
    eeCountryAdapter,
    resolveEeParcelChain,
    type EeParcelChain,
    type EeResolvedBuildingArea,
    type EeResolvedPlot,
    type EeWfsDeps,
} from '../src/countryAdapters/ee/index.js';
import type { FetchOutcome, SiteIntelRule } from '@pryzm/schemas';

const FIXTURES = JSON.parse(
    readFileSync(new URL('./fixtures/ee-kopli-raekoja/recorded-live-2026-09-01.json', import.meta.url), 'utf8'),
) as Record<string, unknown> & { __label__: string };

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/** Route a decoded-URL substring → canned body; unrouted URLs fail the test BY NAME. */
function makeFetch(routes: ReadonlyArray<readonly [string, unknown]>): EeWfsDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        for (const [needle, body] of routes) {
            if (url.includes(needle)) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(body),
                } as unknown as Response;
            }
        }
        throw new Error(`eeAdapterRework.test: unrouted URL in fixture replay — ${url.slice(0, 160)}`);
    }) as typeof fetch;
    return { fetchImpl };
}

const KOPLI_ROUTES: ReadonlyArray<readonly [string, unknown]> = [
    ['ky_kehtiv', FIXTURES['parcelKopli']],
    ['etak_ehr_hooned', FIXTURES['buildingsKopli']],
    ['typenames=dp_hoonestus', FIXTURES['hoonestusKopli']],
    ['typenames=dp_krunt', FIXTURES['kruntKopli']],
    ['typenames=detailplaneering', FIXTURES['planRegister30100071']],
];

async function kopliChain(routes = KOPLI_ROUTES): Promise<EeParcelChain> {
    const outcome = await resolveEeParcelChain('78401:101:7194', makeFetch(routes), '2026-09-01T12:00:00Z');
    expect(outcome.status).toBe('found');
    if (outcome.status !== 'found') throw new Error('unreachable');
    return outcome.value;
}

function foundValue<T>(o: FetchOutcome<T>): T {
    expect(o.status).toBe('found');
    if (o.status !== 'found') throw new Error('unreachable');
    return o.value;
}

function allRuleSets(chain: EeParcelChain): ReadonlyArray<EeResolvedBuildingArea | EeResolvedPlot> {
    return [...foundValue(chain.buildingAreas), ...foundValue(chain.plots)];
}

describe('E1d rework 1 — the R1 referent contract (mint what you cite)', () => {
    it('every basis ref resolves to a minted entity CARRIED in the same chain result', async () => {
        const chain = await kopliChain();
        const sets = allRuleSets(chain);
        expect(sets.length).toBe(3); // 2 hoonestusalas + 1 krunt (recorded live)
        for (const set of sets) {
            const mintedIds = new Set<string>();
            if (set.prescription !== null) mintedIds.add(set.prescription.id);
            if (set.planEntity !== null) mintedIds.add(set.planEntity.id);
            expect(set.rules.length).toBeGreaterThan(0);
            for (const rule of set.rules) {
                expect(rule.applicability.basis.length).toBeGreaterThan(0);
                for (const ref of rule.applicability.basis) {
                    // THE contract sentence: an unresolvable ref = the §B.2 dangling defect.
                    expect(mintedIds.has(ref.ref)).toBe(true);
                }
            }
        }
    });

    it('the hoonestusala becomes a minted buildingField Prescription whose plan hop also resolves', async () => {
        const chain = await kopliChain();
        for (const area of foundValue(chain.buildingAreas)) {
            expect(area.prescription).not.toBeNull();
            expect(area.prescription!.kind).toBe('buildingField');
            expect(area.prescription!.typology).toEqual({ scheme: 'ee-plank-layer', code: 'dp_hoonestus' });
            expect(area.prescription!.geometry.crs).toBe('EPSG:3301');
            expect(area.prescription!.geometry.kind).toBe('Polygon');
            // The second hop is not dangling either: zoneOrPlanRef → the minted Plan.
            expect(area.planEntity).not.toBeNull();
            expect(area.prescription!.zoneOrPlanRef).toBe(area.planEntity!.id);
            expect(area.planEntity!.status).toBe('Osaliselt kehtiv'); // mirrored verbatim
            for (const rule of area.rules) {
                expect(rule.applicability.basis).toEqual([{ kind: 'prescription', ref: area.prescription!.id }]);
                expect(rule.applicability.geometry).toBeNull();
            }
        }
    });

    it('the old minted-string pattern (dp_hoonestus:<objectid>) appears NOWHERE in the rules', async () => {
        const chain = await kopliChain();
        const serializedRules = JSON.stringify(allRuleSets(chain).map((s) => s.rules));
        expect(serializedRules).not.toContain('dp_hoonestus:');
        expect(serializedRules).not.toContain('dp_krunt:');
        // The replaced pre-R1 leg name is gone from every rule (SiteIntelPlan legitimately
        // carries its own nullable `geometryRef` field — that one is NOT the old leg).
        expect(serializedRules).not.toContain('geometryRef');
    });
});

describe('E1d rework 2 — R3 validityBasis replaces the note apology', () => {
    it("resolved register row → validityBasis 'legal' with the kehtestkp adoption date", async () => {
        const chain = await kopliChain();
        for (const set of allRuleSets(chain)) {
            for (const rule of set.rules) {
                expect(rule.provenance.validityBasis).toBe('legal');
                expect(rule.provenance.valid_from).toBe('2025-07-03');
            }
        }
    });

    it("unresolved register row → validityBasis 'ingestion' with the fetch date, NO prose apology, inline-geometry leg", async () => {
        const routes: ReadonlyArray<readonly [string, unknown]> = [
            ['ky_kehtiv', FIXTURES['parcelKopli']],
            ['etak_ehr_hooned', FIXTURES['buildingsKopli']],
            ['typenames=dp_hoonestus', FIXTURES['hoonestusKopli']],
            ['typenames=dp_krunt', FIXTURES['kruntKopli']],
            ['typenames=detailplaneering', EMPTY_FC], // the register does not answer
        ];
        const chain = await kopliChain(routes);
        for (const set of allRuleSets(chain)) {
            // A half-known planning object is NOT minted — the rules ride R1's inline
            // bare-geometry leg instead (the served ring, native CRS).
            expect(set.planEntity).toBeNull();
            expect(set.prescription).toBeNull();
            for (const rule of set.rules) {
                expect(rule.provenance.validityBasis).toBe('ingestion');
                expect(rule.provenance.valid_from).toBe('2026-09-01');
                expect(rule.applicability.basis).toEqual([]);
                expect(rule.applicability.geometry).not.toBeNull();
                expect(rule.applicability.geometry!.crs).toBe('EPSG:3301');
                const note = rule.provenance.confidence.note ?? '';
                expect(note).not.toContain('FETCH date'); // the killed apology, verbatim spelling
                expect(note.toLowerCase()).not.toContain('adoption date did not resolve');
            }
        }
    });
});

describe('E1d rework 3 — per-use-slot encoding rides R1 useScope', () => {
    it('slot-aligned pitch rules carry the verbatim otstarve token typed, with no -slotN id suffix', async () => {
        const chain = await kopliChain();
        const [plot] = foundValue(chain.plots);
        expect(plot).toBeDefined();
        const rules = plot!.rules;
        // Recorded live: otstarve "ärimaa; elamumaa" · maxsoosak "; 85" · minsoosak "15; ".
        const maxPitch = rules.filter((r) => r.provenance.parameter === 'maxRoofPitch');
        const minPitch = rules.filter((r) => r.provenance.parameter === 'minRoofPitch');
        expect(maxPitch.length).toBe(1);
        expect(minPitch.length).toBe(1);
        expect(maxPitch[0]!.provenance.value).toBe(85);
        expect(maxPitch[0]!.applicability.useScope).toEqual(['elamumaa']);
        expect(minPitch[0]!.provenance.value).toBe(15);
        expect(minPitch[0]!.applicability.useScope).toEqual(['ärimaa']);
        for (const r of [...maxPitch, ...minPitch]) {
            expect(r.id).not.toMatch(/-slot\d+$/);
        }
        // The ids stay unique without the positional suffix.
        expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
        // The use record itself stays a verbatim joined value, not use-conditioned.
        const uses = rules.find((r) => r.provenance.parameter === 'landUseCategories');
        expect(uses!.provenance.value).toBe('ärimaa; elamumaa');
        expect(uses!.applicability.useScope).toEqual([]);
    });
});

describe('E1d rework 4 — parcel-ring intersection replaced ringCentroid', () => {
    it('URL builders emit the MEASURED native (N E) axis order over the served ring', async () => {
        const chain = await kopliChain();
        const ring = chain.parcel.ring;
        // First served pair is [easting 541933.09, northing 6589539.57] — posList must
        // lead northing-first (the (E N) control returned 0 features SILENTLY, probed).
        // URLSearchParams form-encodes spaces as '+' — undo both layers before asserting.
        const decode = (u: string): string => decodeURIComponent(u).replaceAll('+', ' ');
        const plankUrl = decode(buildPlankIntersectsRingUrl('dp_hoonestus', ring));
        expect(plankUrl).toContain('<gml:posList>6589539.57 541933.09 ');
        expect(plankUrl).toContain('msGeometry');
        expect(plankUrl).toContain('urn:ogc:def:crs:EPSG::3301');
        const gsUrl = decode(
            buildGeoserverIntersectsRingUrl('etak_tuletis', 'etak_tuletis:etak_ehr_hooned', 'shape', ring, 50),
        );
        expect(gsUrl).toContain('INTERSECTS(shape,POLYGON((6589539.57 541933.09,');
    });

    it('the chain resolves buildings + both plan layers through the ring (no centroid anywhere)', async () => {
        const chain = await kopliChain();
        const buildings = foundValue(chain.buildings);
        expect(buildings.map((b) => b.ehrGid)).toContain('121395845'); // the baseline conflation row
        expect(foundValue(chain.buildingAreas).length).toBe(2);
        // The tier-6 sibling is VISIBLE (korgus "0" ⇒ UNKNOWN, never 0 / no-limit).
        const sibling = foundValue(chain.buildingAreas).find((a) => a.hoonestus.objectid === '5d9be')!;
        const siblingHeight = sibling.rules.find((r) => r.provenance.parameter === 'maxHeight')!;
        expect(siblingHeight.provenance.value).toBeNull();
        expect(siblingHeight.provenance.confidence.tier).toBe(6);
    });
});

describe('typed-fields-only readability (the wrong-GFA trap dead) + the frozen tier guards', () => {
    it('served GFA reads off typed fields alone — parameter/value/unit, no note required', async () => {
        const chain = await kopliChain();
        const main = foundValue(chain.buildingAreas).find((a) => a.hoonestus.objectid === '5d9d1')!;
        const byParam = new Map(main.rules.map((r) => [r.provenance.parameter, r]));
        const gfa = byParam.get('maxGrossFloorArea')!;
        expect(gfa.provenance.value).toBe(3500);
        expect(gfa.provenance.unit).toBe('m2');
        expect(gfa.provenance.confidence.tier).toBe(1);
        expect(gfa.provenance.derivation).toBe('DIRECT');
        expect(gfa.provenance.valueLocation).toBe('attribute');
        expect(gfa.provenance.confidence.note).toBeUndefined();
        expect(byParam.get('maxHeight')!.provenance.value).toBe(17.4);
        expect(byParam.get('maxHeightAbsolute')!.provenance.value).toBe(32.64);
        expect(byParam.get('floorAreaRatio')!.provenance.value).toBe(2.1);
        expect(byParam.get('coveragePercent')!.provenance.value).toBe(61);
    });

    it('the tingimus prose rule is tier 2 + in-document-text (tier 1 there is a frozen parse error)', async () => {
        const chain = await kopliChain();
        const main = foundValue(chain.buildingAreas).find((a) => a.hoonestus.objectid === '5d9d1')!;
        const tingimus = main.rules.find((r) => r.provenance.parameter === 'tingimus')!;
        expect(tingimus.provenance.confidence.tier).toBe(2);
        expect(tingimus.provenance.valueLocation).toBe('in-document-text');
        expect(tingimus.provenance.value).toContain('EH2000');
    });
});

describe('the Raekoja absence leg (78401:101:0109 — measured 0 dp features live)', () => {
    it('dp layers absent → absent-with-caveat, never empty rules and never failure', async () => {
        const routes: ReadonlyArray<readonly [string, unknown]> = [
            ['ky_kehtiv', FIXTURES['parcelRaekoja']],
            ['etak_ehr_hooned', FIXTURES['buildingsKopli']], // fixture stand-in; leg under test is PLANK
            ['typenames=dp_hoonestus', EMPTY_FC],
            ['typenames=dp_krunt', EMPTY_FC],
            ['typenames=detailplaneering', EMPTY_FC],
        ];
        const outcome = await resolveEeParcelChain('78401:101:0109', makeFetch(routes), '2026-09-01T12:00:00Z');
        const chain = foundValue(outcome);
        expect(chain.parcel.tunnus).toBe('78401:101:0109');
        expect(chain.buildingAreas.status).toBe('absent');
        expect(chain.plots.status).toBe('absent');
        if (chain.buildingAreas.status === 'absent') {
            expect(chain.buildingAreas.reason).toContain(EE_PLANK_ABSENCE_CAVEAT);
        }
    });
});

describe('E1d rework 5 — the fetchChain seam stays documented, not guessed', () => {
    it('the adapter exposes the chain under rules.kind structured (the §J seat the SDK will reconcile)', () => {
        expect(eeCountryAdapter.country).toBe('EE');
        expect(eeCountryAdapter.rules.kind).toBe('structured');
        expect(eeCountryAdapter.rules.fetchChain).toBe(resolveEeParcelChain);
    });
});

// Belt-and-braces: the rules are already parsed through SiteIntelRuleSchema inside the
// mapper; this re-asserts the chain carries structurally valid rule objects end-to-end.
describe('every emitted rule is a valid SiteIntelRule value', () => {
    it('rules re-serialize with basis/useScope/rank/condition present and validityBasis typed', async () => {
        const chain = await kopliChain();
        const check = (r: SiteIntelRule): void => {
            expect(Array.isArray(r.applicability.basis)).toBe(true);
            expect(Array.isArray(r.applicability.useScope)).toBe(true);
            expect(r.applicability.rank).toBeNull();
            expect(r.applicability.condition).toBeNull();
            expect(['legal', 'ingestion']).toContain(r.provenance.validityBasis);
        };
        for (const set of allRuleSets(chain)) set.rules.forEach(check);
    });
});
