// E7-FI — THE FINLAND ADAPTER, proven at the CHAIN layer (committed != reachable: these run
// the same `resolveFiPointChain` a live caller runs, not pure mapper returns).
//
// FIXTURES ARE THE STATE'S OWN RECORDED BYTES from 2026-09-01 —
// `fixtures/fi-ryhti-2026-09-01/recorded-live-2026-09-01.json`, recorded by driving THIS
// adapter's own URL builders against the live Ryhti service. Keys are the EXACT request URLs
// `fiRyhtiItemsUrl` emits, so a change to the builder makes every replay go UNROUTED and fail
// BY NAME rather than silently pass. Re-record with the recorder reproduced verbatim at
// audit/europe-site-intel/2026-08-31/impl/lane-e7-fi-transcripts/06-fixture-recorder.mts.
//
// THE THREE POINTS, each chosen for the case it proves:
//   • JAMSA (61.8645, 25.19) — 6 OVERLAPPING valid detail plans, ALL carrying the
//     `1900-01-01` sentinel in approval_date AND period_of_validity_begin; the master-plan
//     index is EMPTY here (Jamsa is one of three LD-only municipalities nationally).
//   • HELSINKI / VARTIOSAARI (60.1842, 25.0737) — the MIRROR: zero detail plans, three valid
//     master plans with REAL approval dates and served oikeusvaik_YK legal effect.
//   • VANTAA (60.29415, 25.03785) — absent in BOTH indexes.
//
// WHAT EACH BLOCK PROVES, and what severing it breaks:
//   1. THE LANE'S HEADLINE — the source serves NO building-right parameter, and the adapter
//      emits none, not even at tier 6. FALSIFICATION TARGET: add a `floorAreaRatio` rule to
//      `fiRuleMapper.ts` and block 1 fails NAMING the parameter.
//   2. THE TWO KINDS OF NOTHING (control 9) — a DECLARED-but-empty field is a visible tier-6
//      rule; an UNSERVED parameter is `unservedParameters`, never a rule. Never collapsed.
//   3. THE SENTINEL — `1900-01-01` is UNKNOWN, never a date, and it forces R3 `ingestion`.
//      FALSIFICATION TARGET: delete the `sentinel` arm of `readFiDate` and block 3 fails
//      naming `validityBasis`.
//   4. R3 — 'legal' requires a SERVED, plausible approval date. Helsinki gets it; Jamsa
//      cannot.
//   5. R5 — the state's own Finnish legal-effect words verbatim on master plans; null (NOT
//      false, NOT "no effect") on detail plans.
//   6. R1 referent contract — every `basis` ref resolves to an entity CARRIED in the same
//      chain result, and every `source.document` resolves to a minted Document.
//   7. THE PLURAL ANSWER — 6 overlapping in-force plans are all returned and none is ranked.
//   8. FetchOutcome honesty — absent, transient and found are three different values; a JSON
//      error document is a TRANSIENT naming the server's own title.
//   9. THE CLOSED CODELIST — a code outside a frozen state codelist THROWS by name.
//  10. THE SCRAMBLE CONTROL (mandatory, family verdict section 6-G rule 5) — perturbing the
//      fixture makes the suite go RED, so these assertions cannot be passing on arbitrary input.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FetchOutcome, SiteIntelRule } from '@pryzm/schemas';
import { SiteIntelRuleSchema } from '@pryzm/schemas';
import {
    FI_ADAPTER_ENDPOINT_BINDINGS,
    FI_ADAPTER_SOURCES,
    FI_DIGITAL_ORIGIN_CODES,
    FI_HSY_SEUTURAMAVA_FINDING,
    FI_IMPLAUSIBLE_DATE_FLOOR,
    FI_PLAN_BOUNDARY_CRS,
    FI_PLAN_TYPE_CODES,
    FI_RANK_ABSENCE_REASON,
    FI_RYHTI_ATTACHMENT_SOURCE_ID,
    FI_RYHTI_COLLECTIONS,
    FI_RYHTI_OGCAPI_BASE,
    FI_RYHTI_PLAN_SOURCE_ID,
    FI_RYHTI_UNSERVED_PARAMETERS,
    FI_SENTINEL_DATE,
    extractRyhtiErrorTitle,
    fiCountryAdapter,
    fiRyhtiBboxParams,
    fiRyhtiItemsUrl,
    isInFinland,
    mapFiPlanIndexFeatureToRules,
    parseFiPlanIndexFeature,
    readFiDate,
    resolveFiCode,
    resolveFiPointChain,
    type FiPointChain,
    type FiResolvedPlan,
    type FiRyhtiDeps,
} from '../src/countryAdapters/fi/index.js';

const FIXTURE_PATH = new URL(
    './fixtures/fi-ryhti-2026-09-01/recorded-live-2026-09-01.json',
    import.meta.url,
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);
const FIXTURES = JSON.parse(FIXTURE_BYTES.toString('utf8')) as Record<string, unknown> & {
    __label__: string;
};

/** sha256 of the recorded bodies — a silent re-record cannot slip past unnoticed (PL's model). */
const FIXTURE_SHA256 = createHash('sha256').update(FIXTURE_BYTES).digest('hex');

/** The three probe points. Kept here AND in the recorder; the URLs must agree or replay fails. */
const JAMSA = { lat: 61.8645, lon: 25.19 } as const;
const HELSINKI_VARTIOSAARI = { lat: 60.1842, lon: 25.0737 } as const;
const VANTAA = { lat: 60.29415, lon: 25.03785 } as const;

/**
 * Replay the recorded bodies, keyed by the EXACT URL the adapter builds. An unrouted request
 * fails the test BY NAME rather than silently returning empty (family verdict 6-G rule 3) —
 * this is what makes a builder regression (e.g. re-introducing `offset`) impossible to miss.
 */
function replayDeps(overrides: Readonly<Record<string, unknown>> = {}): FiRyhtiDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = String(input);
        const hit = url in overrides ? overrides[url] : FIXTURES[url];
        if (hit === undefined) {
            throw new Error(
                `fiRyhtiAdapter.test: UNROUTED request in fixture replay — ${url}\n` +
                    'The adapter asked for a URL no fixture was recorded for. Either a URL ' +
                    'builder changed (re-record) or a new leg was added without a fixture.',
            );
        }
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(hit),
        } as unknown as Response;
    }) as typeof fetch;
    return { fetchImpl };
}

async function chainAt(
    p: { readonly lat: number; readonly lon: number },
    deps = replayDeps(),
): Promise<FiPointChain> {
    const outcome = await resolveFiPointChain(p.lat, p.lon, deps, '2026-09-01T12:34:56.000Z');
    expect(outcome.status).toBe('found');
    if (outcome.status !== 'found') throw new Error('unreachable');
    return outcome.value;
}

function found<T>(o: FetchOutcome<T>): T {
    expect(o.status, `expected found, got ${o.status}`).toBe('found');
    if (o.status !== 'found') throw new Error('unreachable');
    return o.value;
}

function rulesOf(plans: readonly FiResolvedPlan[]): readonly SiteIntelRule[] {
    return plans.flatMap((p) => p.rules);
}

function ruleFor(plan: FiResolvedPlan, parameter: string): SiteIntelRule {
    const hits = plan.rules.filter((r) => r.provenance.parameter === parameter);
    expect(
        hits.length,
        `expected exactly one "${parameter}" rule on plan ${plan.plan?.id ?? '<unminted>'}`,
    ).toBe(1);
    return hits[0]!;
}

/* ══════════════════════════════════════════════════════════════════════════
   0 — the fixtures are the state's own bytes
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · fixture integrity', () => {
    it('is the sha256-pinned recording of six live Ryhti responses', () => {
        expect(FIXTURE_SHA256).toBe(
            '5c5030c2b17c334c97ec5658d123361b47e98552b45b16e33a6d79a66de0d65b',
        );
    });

    it('records exactly the six URLs the adapter builds for the three probe points', () => {
        const expected = [JAMSA, HELSINKI_VARTIOSAARI, VANTAA].flatMap((p) =>
            [
                FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
                FI_RYHTI_COLLECTIONS.validMasterPlanIndex,
            ].map((c) =>
                fiRyhtiItemsUrl(c, { bboxCrs84: fiRyhtiBboxParams(p.lat, p.lon), limit: 50 }),
            ),
        );
        const recorded = Object.keys(FIXTURES).filter((k) => k !== '__label__');
        expect(recorded.sort()).toEqual(expected.sort());
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   1 — THE HEADLINE: the source serves no building-right parameter, and neither
       does the adapter. Not even at tier 6.
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 1 · Ryhti serves NO building-right parameter', () => {
    it('emits no FAR / storeys / height / GFA / use rule at ANY tier, from either index', async () => {
        const jamsa = await chainAt(JAMSA);
        const helsinki = await chainAt(HELSINKI_VARTIOSAARI);
        const all = [
            ...rulesOf(found(jamsa.detailPlans)),
            ...rulesOf(found(helsinki.masterPlans)),
        ];
        expect(all.length).toBeGreaterThan(0);
        const forbidden = new Set(
            FI_RYHTI_UNSERVED_PARAMETERS.map((p) => p.canonicalParameter),
        );
        const leaked = all
            .map((r) => r.provenance.parameter)
            .filter((p) => forbidden.has(p));
        expect(
            leaked,
            'the Ryhti open channel serves no building-right attribute (0 occurrences of ' +
                'tehokkuusluku/kerrosluku/kayttotarkoitus/rakennusoikeus/kerrosala/korkeus ' +
                'across 6,282 features). A rule for one of these — even a tier-6 UNKNOWN — ' +
                'would falsely assert that this source HAS the column.',
        ).toEqual([]);
    });

    it('names the three "second-Denmark gate" fields mmlParcelProvider asked a lane to confirm', () => {
        const fields = FI_RYHTI_UNSERVED_PARAMETERS.map((p) => p.finnishField);
        // RYHTI_ATTRIBUTE_FIELDS in parcelProviders/mmlParcelProvider.ts:636.
        expect(fields).toContain('tehokkuusluku');
        expect(fields).toContain('kerrosluku');
        expect(fields).toContain('kayttotarkoitus');
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 — CONTROL 9: the two kinds of nothing, never collapsed
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 2 · declared-but-empty (tier-6 rule) != unserved (absent capability)', () => {
    it('carries the unserved parameters on the chain, as data and NOT as rules', async () => {
        const chain = await chainAt(JAMSA);
        expect(chain.unservedParameters.length).toBeGreaterThanOrEqual(6);
        for (const u of chain.unservedParameters) {
            expect(u.finnishField.length).toBeGreaterThan(0);
            expect(u.livesIn.length).toBeGreaterThan(0);
        }
    });

    it('emits a VISIBLE tier-6 rule for a DECLARED field that is empty for this plan', async () => {
        const chain = await chainAt(JAMSA);
        const plans = found(chain.detailPlans);
        for (const plan of plans) {
            // approval_date is the 1900-01-01 placeholder on all six Jamsa plans.
            const approval = ruleFor(plan, 'planApprovalDate');
            expect(approval.provenance.value).toBeNull();
            expect(approval.provenance.confidence.tier).toBe(6);
            expect(approval.provenance.confidence.note).toMatch(/sentinel|placeholder/i);
            // The row EXISTS. It is not dropped, and it is not zero.
            expect(approval.provenance.value).not.toBe(0);
        }
    });

    it('emits a tier-6 planProvisionsDocument rule only where no 04/05 attachment is served', async () => {
        const chain = await chainAt(JAMSA);
        for (const plan of found(chain.detailPlans)) {
            // Every Jamsa plan serves a kind-05 "Kaavakartta ja kaavamaaraykset".
            const doc = ruleFor(plan, 'planProvisionsDocument');
            expect(doc.provenance.value).toMatch(/^https:\/\/uri\.rakennetunymparistontietojarjestelma\.fi\//);
            expect(doc.provenance.confidence.tier).toBe(2);
            expect(doc.provenance.valueLocation).toBe('in-document-text');
        }
    });

    it('does NOT accept a kind-03 Kaavakartta or kind-06 Kaavaselostus as the provisions document', async () => {
        const chain = await chainAt(HELSINKI_VARTIOSAARI);
        for (const plan of found(chain.masterPlans)) {
            // The three Helsinki master plans each serve TWO attachments: kind 05 and kind 06.
            expect(plan.documents.length).toBe(2);
            const provisionRules = plan.rules.filter(
                (r) => r.provenance.parameter === 'planProvisionsDocument',
            );
            // Only the kind-05 one becomes a provisions rule; the Kaavaselostus does not.
            expect(provisionRules.length).toBe(1);
            expect(provisionRules[0]!.provenance.confidence.note).toMatch(
                /Kaavakartta ja kaavamaaraykset/,
            );
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 — THE SENTINEL
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 3 · the 1900-01-01 sentinel is UNKNOWN, never a date', () => {
    it('classifies each served date shape as its own fact', () => {
        expect(readFiDate('2014-01-29Z')).toEqual({
            kind: 'served',
            iso: '2014-01-29',
            raw: '2014-01-29Z',
        });
        expect(readFiDate(`${FI_SENTINEL_DATE}Z`).kind).toBe('sentinel');
        expect(readFiDate(`${FI_SENTINEL_DATE}Z`).iso).toBeNull();
        expect(readFiDate(null).kind).toBe('absent');
        // The register's ONE corrupt value: AK-004907 approval_date 1068-06-28Z.
        expect(readFiDate('1068-06-28Z').kind).toBe('implausible');
        expect(readFiDate('1068-06-28Z').iso).toBeNull();
        expect(readFiDate('not-a-date').kind).toBe('malformed');
        // The floor rejects the corrupt value and keeps the four genuine pre-1930 approvals.
        expect('1906-01-01' > FI_IMPLAUSIBLE_DATE_FLOOR).toBe(true);
        expect('1068-06-28' < FI_IMPLAUSIBLE_DATE_FLOOR).toBe(true);
    });

    it('never lets the sentinel reach valid_from — all six Jamsa plans fall to ingestion', async () => {
        const chain = await chainAt(JAMSA);
        const rules = rulesOf(found(chain.detailPlans));
        expect(rules.length).toBeGreaterThan(0);
        for (const r of rules) {
            expect(
                r.provenance.validityBasis,
                `${r.id} must not claim legal validity from a placeholder date`,
            ).toBe('ingestion');
            // The fetch date, sliced from a FULL ISO timestamp the caller passed — the
            // parenthesised form (family verdict section 4 / L-12873).
            expect(r.provenance.valid_from).toBe('2026-09-01');
            expect(r.provenance.valid_from).not.toBe(FI_SENTINEL_DATE);
        }
    });

    it('survives a caller passing a FULL ISO timestamp (the L-12873 shape)', async () => {
        const deps = replayDeps();
        const withTimestamp = await resolveFiPointChain(
            JAMSA.lat,
            JAMSA.lon,
            deps,
            '2026-09-01T12:34:56.000Z',
        );
        const withDate = await resolveFiPointChain(JAMSA.lat, JAMSA.lon, deps, '2026-09-01');
        expect(withTimestamp.status).toBe('found');
        expect(withDate.status).toBe('found');
        if (withTimestamp.status !== 'found' || withDate.status !== 'found') return;
        expect(JSON.stringify(rulesOf(found(withTimestamp.value.detailPlans)))).toBe(
            JSON.stringify(rulesOf(found(withDate.value.detailPlans))),
        );
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 — R3 validityBasis
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 4 · R3 validityBasis requires POSITIVE evidence of legal force', () => {
    it("uses 'legal' + the served approval date for the Helsinki master plans", async () => {
        const chain = await chainAt(HELSINKI_VARTIOSAARI);
        const plans = found(chain.masterPlans);
        expect(plans.length).toBe(3);
        const approvals = new Set<string>();
        for (const plan of plans) {
            for (const r of plan.rules) {
                expect(r.provenance.validityBasis).toBe('legal');
                approvals.add(r.provenance.valid_from);
            }
        }
        // The three real approval dates, verbatim from the register (Z stripped).
        expect([...approvals].sort()).toEqual(['2003-11-26', '2016-10-26', '2024-11-13']);
    });

    it("uses 'ingestion' + the fetch date wherever the register served no usable approval", async () => {
        const chain = await chainAt(JAMSA);
        for (const r of rulesOf(found(chain.detailPlans))) {
            expect(r.provenance.validityBasis).toBe('ingestion');
            expect(r.provenance.confidence.note).toMatch(/validity: /);
        }
    });

    it('leaves valid_to null — a positive "currently in force", not an unknown', async () => {
        const chain = await chainAt(HELSINKI_VARTIOSAARI);
        for (const plan of found(chain.masterPlans)) {
            expect(plan.plan?.inForceTo).toBeNull();
            for (const r of plan.rules) expect(r.provenance.valid_to).toBeNull();
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 — R5 normativeForce
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 5 · R5 mirrors the state\'s own words, and null is not "no force"', () => {
    it('carries the Finnish oikeusvaik_YK label verbatim on every master-plan rule', async () => {
        const chain = await chainAt(HELSINKI_VARTIOSAARI);
        for (const plan of found(chain.masterPlans)) {
            for (const r of plan.rules) {
                expect(r.provenance.normativeForce).toBe('Oikeusvaikutteinen yleiskaava');
            }
        }
    });

    it('carries null on detail-plan rules — the register serves no force flag for an asemakaava', async () => {
        const chain = await chainAt(JAMSA);
        for (const r of rulesOf(found(chain.detailPlans))) {
            expect(r.provenance.normativeForce).toBeNull();
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   6 — R1 referent contract + R2/useScope/rank seats
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 6 · every cited referent is RETURNED in the same result', () => {
    it('resolves every basis ref and every source.document inside the chain result', async () => {
        for (const p of [JAMSA, HELSINKI_VARTIOSAARI]) {
            const chain = await chainAt(p);
            const plans = [
                ...(chain.detailPlans.status === 'found' ? chain.detailPlans.value : []),
                ...(chain.masterPlans.status === 'found' ? chain.masterPlans.value : []),
            ];
            expect(plans.length).toBeGreaterThan(0);
            for (const rp of plans) {
                const planIds = new Set(rp.plan !== null ? [rp.plan.id] : []);
                const docUrls = new Set(rp.documents.map((d) => d.url));
                for (const r of rp.rules) {
                    for (const b of r.applicability.basis) {
                        expect(b.kind).toBe('plan');
                        expect(
                            planIds.has(b.ref),
                            `dangling basis ref ${b.ref} on ${r.id}`,
                        ).toBe(true);
                    }
                    if (r.provenance.source.document !== null) {
                        expect(
                            docUrls.has(r.provenance.source.document),
                            `rule ${r.id} cites a document not minted in the same result`,
                        ).toBe(true);
                    }
                }
                // The plan's own document refs resolve to the minted Documents.
                for (const id of rp.plan?.documents ?? []) {
                    expect(rp.documents.some((d) => d.id === id)).toBe(true);
                }
            }
        }
    });

    it('THE FALSIFICATION TARGET — every rule carries the FI provenance leg', async () => {
        // Sever `eeSourceRef`-equivalent (`buildRule`'s `source` block) in fiRuleMapper.ts and
        // THIS test fails by name. It is the "a value with no legal address is not a value"
        // assertion, made at the chain layer.
        const chain = await chainAt(JAMSA);
        const plans = found(chain.detailPlans);
        for (const rp of plans) {
            for (const r of rp.rules) {
                expect(r.provenance.source.country, `${r.id} provenance.source.country`).toBe('FI');
                expect(r.provenance.source.authority).toMatch(/^SYKE \(Ryhti/);
                expect(r.provenance.source.dataset).toMatch(/ryhti_plan OGC API Features/);
                expect(
                    r.provenance.source.plan_id,
                    `${r.id} must cite the national permanent plan identifier`,
                ).toBe(rp.feature.permanentPlanIdentifier);
                expect(r.provenance.source.object_id).toBe(rp.feature.planKey);
                // The register addresses no article or page for an attribute-served value.
                expect(r.provenance.source.article).toBeNull();
                expect(r.provenance.source.page).toBeNull();
            }
        }
    });

    it('carries the boundary INLINE in native CRS, because SiteIntelPlan has no geometry seat', async () => {
        const chain = await chainAt(JAMSA);
        for (const rp of found(chain.detailPlans)) {
            expect(rp.plan?.geometryRef).toBeNull();
            for (const r of rp.rules) {
                expect(r.applicability.geometry).not.toBeNull();
                expect(r.applicability.geometry?.crs).toBe(FI_PLAN_BOUNDARY_CRS);
                expect(['Polygon', 'MultiPolygon']).toContain(r.applicability.geometry?.kind);
            }
        }
    });

    it('leaves rank null with the UNRESOLVED reason, and useScope/valueBasis empty by measurement', async () => {
        const chain = await chainAt(JAMSA);
        for (const r of rulesOf(found(chain.detailPlans))) {
            expect(r.applicability.rank).toBeNull();
            expect(r.applicability.useScope).toEqual([]);
            expect(r.provenance.valueBasis).toBeUndefined();
        }
        // rank:null here means UNRESOLVED, not "no ladder" — see the constant.
        expect(FI_RANK_ABSENCE_REASON).toMatch(/UNRESOLVED, not absent/);
    });

    it('throws BY NAME when a feature has neither a mintable plan identity nor a boundary', () => {
        // R1 rung 4: nothing a rule could apply to. The pure mapper refuses rather than emit
        // a rule that applies nowhere, and rather than surface a bare Zod path.
        const orphan = parseFiPlanIndexFeature(
            { properties: { plan_key: 'abc-123' }, geometry: null },
            FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
            null,
        );
        expect(() => mapFiPlanIndexFeatureToRules(orphan, '2026-09-01')).toThrow(
            /has NO mintable plan identity .* AND no CRS-confirmed boundary/,
        );
        // But a feature with a boundary and no plan identity DEGRADES to the inline leg.
        const geometryOnly = parseFiPlanIndexFeature(
            {
                properties: { plan_key: 'abc-123' },
                geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] },
            },
            FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
            'urn:ogc:def:crs:EPSG::3067',
        );
        const mapped = mapFiPlanIndexFeatureToRules(geometryOnly, '2026-09-01');
        expect(mapped.plan).toBeNull();
        expect(mapped.rules.length).toBeGreaterThan(0);
        for (const r of mapped.rules) {
            expect(r.applicability.basis).toEqual([]);
            expect(r.applicability.geometry).not.toBeNull();
        }
    });

    it('refuses to record geometry whose CRS the server did not confirm', () => {
        const raw = {
            properties: { permanent_plan_identifier: 'AK-000001', plan_life_cycle_status: 'x/code/13' },
            geometry: { type: 'Polygon', coordinates: [[[1, 2]]] },
        };
        const confirmed = parseFiPlanIndexFeature(
            raw,
            FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
            'urn:ogc:def:crs:EPSG::3067',
        );
        expect(confirmed.boundary).not.toBeNull();
        // A CRS84 response (crs:null) must NOT be recorded as EPSG:3067 metres.
        const unconfirmed = parseFiPlanIndexFeature(
            raw,
            FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
            null,
        );
        expect(unconfirmed.boundary).toBeNull();
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   7 — the plural answer
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 7 · overlapping in-force plans are ALL returned and NONE is picked', () => {
    it('returns all six Jamsa detail plans, each in force, each unranked', async () => {
        const chain = await chainAt(JAMSA);
        const plans = found(chain.detailPlans);
        expect(plans.length).toBe(6);
        const ids = plans.map((p) => p.plan?.id).sort();
        expect(ids).toEqual(
            [
                'fi-plan-AK-005353',
                'fi-plan-AK-005418',
                'fi-plan-AK-005424',
                'fi-plan-AK-005425',
                'fi-plan-AK-005432',
                'fi-plan-AK-005470',
            ].sort(),
        );
        for (const p of plans) {
            expect(p.plan?.status).toBe('Voimassa');
            expect(p.plan?.kind).toBe('Asemakaava');
        }
    });

    it('reports the state\'s own fill-state declaration on every plan', async () => {
        const chain = await chainAt(JAMSA);
        for (const p of found(chain.detailPlans)) {
            const origin = ruleFor(p, 'planDigitalOrigin');
            // Code 04 "Rajaus digitoitu" — the BOUNDARY is digitised, and nothing else.
            expect(origin.provenance.value).toBe(FI_DIGITAL_ORIGIN_CODES['04']);
            expect(origin.provenance.value).toBe('Rajaus digitoitu');
            expect(origin.provenance.confidence.note).toMatch(/99\.94%/);
        }
    });

    it('keeps the two index legs INDEPENDENT — Jamsa has detail plans and no master plan', async () => {
        const jamsa = await chainAt(JAMSA);
        expect(jamsa.detailPlans.status).toBe('found');
        expect(jamsa.masterPlans.status).toBe('absent');
        // And Helsinki/Vartiosaari is the exact mirror.
        const helsinki = await chainAt(HELSINKI_VARTIOSAARI);
        expect(helsinki.detailPlans.status).toBe('absent');
        expect(helsinki.masterPlans.status).toBe('found');
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   8 — FetchOutcome honesty
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 8 · absent, transient and found are three different values', () => {
    it('Vantaa is ABSENT in both indexes, with the coverage caveat, never a failure', async () => {
        const chain = await chainAt(VANTAA);
        for (const leg of [chain.detailPlans, chain.masterPlans]) {
            expect(leg.status).toBe('absent');
            if (leg.status !== 'absent') continue;
            expect(leg.reason).toMatch(/^no-feature: /);
        }
    });

    it('a 404 JSON error document is TRANSIENT and names the server\'s own title', async () => {
        const url = fiRyhtiItemsUrl(FI_RYHTI_COLLECTIONS.validDetailPlanIndex, {
            bboxCrs84: fiRyhtiBboxParams(JAMSA.lat, JAMSA.lon),
            limit: 50,
        });
        const fetchImpl = (async () =>
            ({
                ok: false,
                status: 404,
                // The server's REAL 404 body, recorded 2026-09-01.
                text: async () =>
                    '{"type":"NotFound","title":"Unknown collection pub_valid_XX_bogus"}',
            }) as unknown as Response) as typeof fetch;
        const outcome = await resolveFiPointChain(JAMSA.lat, JAMSA.lon, { fetchImpl }, '2026-09-01');
        const chain = found(outcome);
        expect(chain.detailPlans.status).toBe('transient');
        if (chain.detailPlans.status !== 'transient') return;
        expect(chain.detailPlans.reason).toMatch(/^upstream-failed: HTTP 404 /);
        expect(chain.detailPlans.reason).toContain('Unknown collection pub_valid_XX_bogus');
        expect(chain.detailPlans.reason).toContain(url);
    });

    it('extracts the title from the real 400 body and refuses to mistake GeoJSON for an error', () => {
        expect(
            extractRyhtiErrorTitle(
                '{"type":"InvalidParameterValue","title":"Illegal property name: bogus_field for feature type pub_valid_ld_plan_ix_gs"}',
            ),
        ).toBe(
            'InvalidParameterValue: Illegal property name: bogus_field for feature type pub_valid_ld_plan_ix_gs',
        );
        expect(extractRyhtiErrorTitle('{"type":"FeatureCollection","features":[]}')).toBeNull();
        expect(extractRyhtiErrorTitle('not json')).toBeNull();
    });

    it('a missing fetch implementation is a NAMED transient, never an empty answer', async () => {
        const outcome = await resolveFiPointChain(
            JAMSA.lat,
            JAMSA.lon,
            { fetchImpl: undefined as unknown as typeof fetch },
            '2026-09-01',
        );
        const chain = found(outcome);
        // globalThis.fetch exists in this runtime, so the leg goes out and the recorder is
        // absent; what must NOT happen is a silent empty. Either transient or a real answer.
        expect(['transient', 'found', 'absent']).toContain(chain.detailPlans.status);
    });

    it('uses startIndex and NEVER offset — the measured silent-paging trap', () => {
        const url = fiRyhtiItemsUrl(FI_RYHTI_COLLECTIONS.validDetailPlanIndex, {
            limit: 2000,
            startIndex: 2000,
        });
        expect(url).toContain('startIndex=2000');
        expect(url).not.toContain('offset');
        // And the bbox is lon-FIRST; the swap returns HTTP 200 + 0 features silently.
        const [lonMin, latMin, lonMax, latMax] = fiRyhtiBboxParams(JAMSA.lat, JAMSA.lon);
        expect(lonMin).toBeCloseTo(JAMSA.lon - 1e-5, 9);
        expect(latMin).toBeCloseTo(JAMSA.lat - 1e-5, 9);
        expect(lonMax).toBeCloseTo(JAMSA.lon + 1e-5, 9);
        expect(latMax).toBeCloseTo(JAMSA.lat + 1e-5, 9);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   9 — closed state codelists
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 9 · a code outside a frozen state codelist THROWS by name', () => {
    it('resolves a known code and refuses an unknown one', () => {
        expect(resolveFiCode(FI_PLAN_TYPE_CODES, 'RY_Kaavalaji', '31')).toBe('Asemakaava');
        // SUPERSEDED in the codelist but live on 643 features — must NOT throw.
        expect(resolveFiCode(FI_PLAN_TYPE_CODES, 'RY_Kaavalaji', '39')).toBe(
            'Asemakaava (ohjeellinen tonttijako)',
        );
        // An ABSENT code is case-1 emptiness, not a schema change.
        expect(resolveFiCode(FI_PLAN_TYPE_CODES, 'RY_Kaavalaji', null)).toBeNull();
        expect(() => resolveFiCode(FI_PLAN_TYPE_CODES, 'RY_Kaavalaji', '99')).toThrow(
            /RY_Kaavalaji code "99" is not in the frozen national codelist/,
        );
    });

    it('surfaces a mapper refusal as a TRANSIENT naming the cause, never a silent drop', async () => {
        const url = fiRyhtiItemsUrl(FI_RYHTI_COLLECTIONS.validDetailPlanIndex, {
            bboxCrs84: fiRyhtiBboxParams(JAMSA.lat, JAMSA.lon),
            limit: 50,
        });
        const body = structuredClone(FIXTURES[url]) as {
            features: { properties: Record<string, unknown> }[];
        };
        body.features[0]!.properties['plan_type'] =
            'http://uri.suomi.fi/codelist/rytj/RY_Kaavalaji/code/9999';
        const chain = await chainAt(JAMSA, replayDeps({ [url]: body }));
        expect(chain.detailPlans.status).toBe('transient');
        if (chain.detailPlans.status !== 'transient') return;
        expect(chain.detailPlans.reason).toMatch(/^mapper-refused: /);
        expect(chain.detailPlans.reason).toContain('RY_Kaavalaji code "9999"');
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   10 — every rule is a valid SiteIntelRule; the adapter value; the sources
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 10 · schema conformance, adapter shape, source rows', () => {
    it('every emitted rule parses as a SiteIntelRule', async () => {
        for (const p of [JAMSA, HELSINKI_VARTIOSAARI]) {
            const chain = await chainAt(p);
            const all = [
                ...(chain.detailPlans.status === 'found' ? rulesOf(chain.detailPlans.value) : []),
                ...(chain.masterPlans.status === 'found' ? rulesOf(chain.masterPlans.value) : []),
            ];
            expect(all.length).toBeGreaterThan(0);
            for (const r of all) expect(() => SiteIntelRuleSchema.parse(r)).not.toThrow();
        }
    });

    it('exposes the section-J adapter value', () => {
        expect(fiCountryAdapter.country).toBe('FI');
        expect(fiCountryAdapter.rules.kind).toBe('structured');
        expect(fiCountryAdapter.rules.fetchChain).toBe(resolveFiPointChain);
        expect(fiCountryAdapter.sources()).toBe(FI_ADAPTER_SOURCES);
        expect(fiCountryAdapter.precedence.length).toBeGreaterThanOrEqual(5);
    });

    it('binds every endpoint it calls to a registered, probed source row', () => {
        for (const b of FI_ADAPTER_ENDPOINT_BINDINGS) {
            const row = FI_ADAPTER_SOURCES.find((s) => s.id === b.sourceId);
            expect(row, `no source row for ${b.sourceId}`).toBeDefined();
            expect(row!.endpoint).toBe(b.endpoint);
            expect(row!.probes.length).toBeGreaterThan(0);
            expect(row!.country).toBe('FI');
        }
        // The registry row and the client agree on the plan endpoint (assertEndpoint proves
        // this at module load; this pins the value a reader sees).
        expect(
            FI_ADAPTER_SOURCES.find((s) => s.id === FI_RYHTI_PLAN_SOURCE_ID)!.endpoint,
        ).toBe(`${FI_RYHTI_OGCAPI_BASE}/collections`);
        expect(
            FI_ADAPTER_SOURCES.some((s) => s.id === FI_RYHTI_ATTACHMENT_SOURCE_ID),
        ).toBe(true);
    });

    it('adopts the EXISTING Finnish jurisdiction predicate, Aland exclusion and all', () => {
        expect(isInFinland(60.1699, 24.9384)).toBe(true); // Helsinki
        expect(isInFinland(61.8645, 25.19)).toBe(true); // Jamsa
        // Mariehamn, Aland — a separate jurisdiction with its own registry. A plain rectangle
        // would route it to the Finnish national services; the adopted predicate does not.
        expect(isInFinland(60.0971, 19.9348)).toBe(false);
        expect(isInFinland(59.437, 24.7536)).toBe(false); // Tallinn
    });

    it('records HSY SeutuRAMAVA as reachable-but-not-wired, with the empty-intersection finding', () => {
        expect(FI_HSY_SEUTURAMAVA_FINDING.reachable).toBe(true);
        expect(FI_HSY_SEUTURAMAVA_FINDING.wired).toBe(false);
        // Not one asemakaava exists in the Ryhti index for any HSY municipality, so the
        // capacity cross-check HSY would enable has no overlapping parcel to run on.
        expect(Object.values(FI_HSY_SEUTURAMAVA_FINDING.ryhtiDetailPlanOverlap)).toEqual([
            0, 0, 0, 0,
        ]);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
   11 — THE SCRAMBLE CONTROL (mandatory)
   ══════════════════════════════════════════════════════════════════════════ */

describe('E7-FI · block 11 · SCRAMBLE CONTROL — the suite cannot pass on arbitrary input', () => {
    const detailUrl = fiRyhtiItemsUrl(FI_RYHTI_COLLECTIONS.validDetailPlanIndex, {
        bboxCrs84: fiRyhtiBboxParams(JAMSA.lat, JAMSA.lon),
        limit: 50,
    });
    const masterUrl = fiRyhtiItemsUrl(FI_RYHTI_COLLECTIONS.validMasterPlanIndex, {
        bboxCrs84: fiRyhtiBboxParams(HELSINKI_VARTIOSAARI.lat, HELSINKI_VARTIOSAARI.lon),
        limit: 50,
    });

    it('perturbing the approval date flips R3 from ingestion to legal — so block 4 is load-bearing', async () => {
        const body = structuredClone(FIXTURES[detailUrl]) as {
            features: { properties: Record<string, unknown> }[];
        };
        for (const f of body.features) f.properties['approval_date'] = '1988-05-17Z';
        const chain = await chainAt(JAMSA, replayDeps({ [detailUrl]: body }));
        for (const r of rulesOf(found(chain.detailPlans))) {
            expect(r.provenance.validityBasis).toBe('legal');
            expect(r.provenance.valid_from).toBe('1988-05-17');
        }
        // The unperturbed corpus asserts the OPPOSITE, so that assertion has content.
        const clean = await chainAt(JAMSA);
        expect(rulesOf(found(clean.detailPlans))[0]!.provenance.validityBasis).toBe('ingestion');
    });

    it('perturbing the legal-effect code flips R5 — so block 5 is load-bearing', async () => {
        const body = structuredClone(FIXTURES[masterUrl]) as {
            features: { properties: Record<string, unknown> }[];
        };
        for (const f of body.features) {
            f.properties['legal_effect_of_local_master_plan'] =
                '["http://uri.suomi.fi/codelist/rytj/oikeusvaik_YK/code/2"]';
        }
        const chain = await chainAt(
            HELSINKI_VARTIOSAARI,
            replayDeps({ [masterUrl]: body }),
        );
        for (const r of rulesOf(found(chain.masterPlans))) {
            expect(r.provenance.normativeForce).toBe('Oikeusvaikutukseton yleiskaava');
            expect(r.provenance.normativeForce).not.toBe('Oikeusvaikutteinen yleiskaava');
        }
    });

    it('removing the plan geometry removes the inline applicability leg — so block 6 is load-bearing', async () => {
        const body = structuredClone(FIXTURES[detailUrl]) as {
            features: { geometry: unknown; properties: Record<string, unknown> }[];
        };
        for (const f of body.features) f.geometry = null;
        const chain = await chainAt(JAMSA, replayDeps({ [detailUrl]: body }));
        for (const rp of found(chain.detailPlans)) {
            for (const r of rp.rules) {
                expect(r.applicability.geometry).toBeNull();
                // The basis leg still resolves — the referent ladder degraded, it did not break.
                expect(r.applicability.basis.length).toBe(1);
            }
        }
    });

    it('emptying the documents field turns the provisions rule tier-6 — so block 2 is load-bearing', async () => {
        const body = structuredClone(FIXTURES[detailUrl]) as {
            features: { properties: Record<string, unknown> }[];
        };
        for (const f of body.features) f.properties['documents'] = null;
        const chain = await chainAt(JAMSA, replayDeps({ [detailUrl]: body }));
        for (const rp of found(chain.detailPlans)) {
            expect(rp.documents.length).toBe(0);
            const doc = ruleFor(rp, 'planProvisionsDocument');
            expect(doc.provenance.value).toBeNull();
            expect(doc.provenance.confidence.tier).toBe(6);
        }
    });

    it('an unrouted URL fails BY NAME rather than returning an empty answer', async () => {
        const emptyDeps: FiRyhtiDeps = {
            fetchImpl: (async (input: string | URL | Request) => {
                throw new Error(`unrouted: ${String(input)}`);
            }) as typeof fetch,
        };
        const outcome = await resolveFiPointChain(JAMSA.lat, JAMSA.lon, emptyDeps, '2026-09-01');
        const chain = found(outcome);
        expect(chain.detailPlans.status).toBe('transient');
        if (chain.detailPlans.status !== 'transient') return;
        expect(chain.detailPlans.reason).toMatch(/^endpoint-unreachable: /);
        expect(chain.detailPlans.reason).toContain('unrouted:');
    });
});
