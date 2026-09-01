// E6-LT — THE LITHUANIA ADAPTER, proven at the CHAIN layer (committed != reachable: these run
// the same `resolveLtParcelChain` the live probe harness ran, not pure mapper returns).
//
// FIXTURES ARE RECORDED LIVE BODIES from 2026-09-01 —
// audit/europe-site-intel/2026-08-31/impl/lane-e6-lt-transcripts/recorded-live-2026-09-01.json,
// recorded by driving THIS adapter against the real services with a recording fetch
// (probe-lt-chain.mts in the same directory re-records them). Keys are `<url>|<decoded form
// body>`; an unrouted request fails the test BY NAME rather than silently returning empty.
//
// The two parcels are the 20-parcel architecture baseline's LT rows (supplement §10 rows 17 and
// 18): Vilnius `0101/0054:0328` and the adjacent `0101/0054:0345`. Both resolved END-TO-END
// LIVE against tpdr.planuojustatau.lt + osp-sdg.stat.gov.lt on 2026-09-01.
//
// WHAT EACH BLOCK PROVES, and what severing it breaks:
//   1. THE LT PRIZE — per-value provenance lands in the PER-RULE `RuleProvenance`, not a shared
//      note. FALSIFICATION TARGET: sever the per-value mapping in `ltRuleMapper.ts` (make every
//      classification rule read one polygon-wide document) and the two-document test below fails
//      NAMING `FUNKC_ZON`.
//   2. THE NAMED BLOCKER — `MAX_INTENS` is REFUSED: tier 6, value null, an R2 `valueBasis` of
//      `lt-asgr-intensity-unit:UNRESOLVED-RATIO-OR-PERCENT`, and a note carrying BOTH numbers.
//      A GFA computed from it is an acceptance FAILURE (supplement §10 row 17).
//   3. R3 `validityBasis` — 'legal' + the served TPD approval date for the four classification
//      fields; 'ingestion' + the fetch date for the four numerics, which ASGR attributes to no
//      document at all.
//   4. R1 referent contract — every `basis` ref resolves to a minted entity CARRIED in the same
//      chain result, and the zone's `planId` hop resolves too.
//   5. E4 control 9 — UNKNOWN is distinct from zero and from no-limit, and is EMITTED, never
//      dropped (supplement §10 test-wide rule 2).
//   6. R5 `normativeForce` — 'rekomendacinio pobūdžio' on every rule.
//   7. FetchOutcome honesty — absent, transient and found are three different values, and an
//      ArcGIS 200-with-error body is a TRANSIENT that names the service's own message.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    LT_ADAPTER_ENDPOINT_BINDINGS,
    LT_ADAPTER_SOURCES,
    LT_ASGR_ABSENCE_CAVEAT,
    LT_ASGR_NORMATIVE_FORCE,
    LT_INTENSITY_UNIT_SCHEME,
    LT_INTENSITY_UNIT_UNRESOLVED,
    LT_RULE_VOCABULARY,
    isInLithuania,
    ltAsgrProvenanceColumnsMeasured,
    ltCompletenessCaveat,
    ltCountryAdapter,
    ltDeserialiseSingle,
    parseLtAsgrPolygon,
    readLtNumeric,
    resolveLtParcelChain,
    type LtArcgisDeps,
    type LtParcelChain,
    type LtResolvedRegulationZone,
} from '../src/countryAdapters/lt/index.js';
import type { FetchOutcome, SiteIntelRule } from '@pryzm/schemas';

const FIXTURES = JSON.parse(
    readFileSync(
        new URL(
            '../../../audit/europe-site-intel/2026-08-31/impl/lane-e6-lt-transcripts/recorded-live-2026-09-01.json',
            import.meta.url,
        ),
        'utf8',
    ),
) as Record<string, unknown> & { __label__: string };

const PARCEL_A = '0101/0054:0328'; // supplement §10 row 17
const PARCEL_B = '0101/0054:0345'; // supplement §10 row 18

/** Replay the recorded bodies, keyed exactly as recorded. Unrouted requests fail BY NAME. */
function replayDeps(overrides: Readonly<Record<string, unknown>> = {}): LtArcgisDeps {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = typeof init?.body === 'string' ? decodeURIComponent(init.body) : '';
        const key = `${url}|${body}`;
        const hit = key in overrides ? overrides[key] : FIXTURES[key];
        if (hit === undefined) {
            throw new Error(
                `ltAsgrAdapter.test: unrouted request in fixture replay — ${key.slice(0, 240)}`,
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

async function chainFor(kadastroNr: string, deps = replayDeps()): Promise<LtParcelChain> {
    const outcome = await resolveLtParcelChain(kadastroNr, deps, '2026-09-01T00:00:00Z');
    expect(outcome.status).toBe('found');
    if (outcome.status !== 'found') throw new Error('unreachable');
    return outcome.value;
}

function found<T>(o: FetchOutcome<T>): T {
    expect(o.status).toBe('found');
    if (o.status !== 'found') throw new Error('unreachable');
    return o.value;
}

function zonesOf(chain: LtParcelChain): readonly LtResolvedRegulationZone[] {
    return found(chain.regulationZones);
}

function ruleFor(zone: LtResolvedRegulationZone, parameter: string): SiteIntelRule {
    const hits = zone.rules.filter((r) => r.provenance.parameter === parameter);
    expect(hits.length, `expected exactly one "${parameter}" rule on ASGR polygon ${zone.polygon.objectId}`).toBe(1);
    return hits[0]!;
}

/**
 * The recorded ASGR request key for parcel B — found by its ring's first easting rather than
 * hard-coded, so a re-record cannot silently make the outcome tests replay a stale body.
 */
function asgrKeyForParcelB(): string {
    const key = Object.keys(FIXTURES).find(
        (k) => k.includes('/ASGR/MapServer/0/query') && k.includes('581829.269'),
    );
    if (key === undefined) {
        throw new Error('ltAsgrAdapter.test: no recorded ASGR request for parcel 0101/0054:0345');
    }
    return key;
}

/** The one polygon in the baseline that carries real numerics AND two source documents. */
function numericZone(chain: LtParcelChain): LtResolvedRegulationZone {
    const z = zonesOf(chain).find((zz) => zz.polygon.objectId === 97619);
    expect(z, 'ASGR OBJECTID 97619 must be among the polygons intersecting parcel 0101/0054:0328').toBeDefined();
    return z!;
}

/* ═════════════ 1. THE LT PRIZE — per-value provenance, per RULE ═════════════ */

describe('E6-LT 1 — per-value provenance lands on the RULE, not in a shared note', () => {
    it('one polygon, two source documents, two approval dates — carried per rule', async () => {
        const zone = numericZone(await chainFor(PARCEL_A));

        // The detail plan (K_D) set the use codes...
        for (const parameter of ['landUseMainPurpose', 'landUseMode', 'territoryUseType']) {
            const p = ruleFor(zone, parameter).provenance;
            expect(p.source.plan_id, `${parameter} must cite the DETAIL plan's document number`).toBe('T00087142');
            expect(p.source.document).toBe('https://tpdr.planuojustatau.lt/tpdr-ext/tpd?id=123025');
            expect(p.valid_from, `${parameter} must carry the detail plan's approval date`).toBe('2021-12-17');
            expect(p.validityBasis).toBe('legal');
        }

        // ...while the FUNCTIONAL ZONE came from the municipal comprehensive plan, six months
        // earlier. THIS is the assertion that breaks if the per-value mapping is severed: a
        // polygon-wide provenance would give FUNKC_ZON the detail plan's id and date.
        const fz = ruleFor(zone, 'functionalZoneType').provenance;
        expect(fz.source.plan_id, 'FUNKC_ZON must cite ITS OWN source document (FUNKC_ZONNR), not the polygon\'s other one').toBe('T00086338');
        expect(fz.source.document).toBe('https://tpdr.planuojustatau.lt/tpdr-ext/tpd?id=203143899');
        expect(fz.valid_from, 'FUNKC_ZON must carry ITS OWN approval date (FUNKC_ZOND)').toBe('2021-06-02');
        expect(fz.validityBasis).toBe('legal');

        // And the two dates genuinely differ — otherwise the test above could pass on a bug.
        expect(fz.valid_from).not.toBe(ruleFor(zone, 'landUseMainPurpose').provenance.valid_from);
    });

    it('both cited documents are MINTED as plans, and the zone hop resolves to one of them', async () => {
        const zone = numericZone(await chainFor(PARCEL_A));
        const ids = zone.plans.map((p) => p.id).sort();
        expect(ids).toEqual(['lt-plan-123025', 'lt-plan-203143899']);

        const detail = zone.plans.find((p) => p.id === 'lt-plan-123025')!;
        expect(detail.kind).toBe('K_D'); // verbatim national subkind, never harmonised
        expect(detail.status).toBe('Registruotas'); // MIRRORED verbatim
        expect(detail.adoptedDate).toBe('2021-12-17'); // TVIRT_DATA (approval)
        expect(detail.inForceFrom).toBe('2021-12-21'); // ISIGALIOJO (in force)
        // inForceTo stays null: the register's end-dates are register acts, not legal repeal.
        expect(detail.inForceTo).toBeNull();

        // The zone is the FUNCTIONAL zone, so its plan is the one that SET the functional zone.
        expect(zone.zone).not.toBeNull();
        expect(zone.zone!.typology.national).toBe('U_SK_F');
        expect(zone.zone!.typology.harmonised).toBeNull();
        expect(zone.zone!.planId).toBe('lt-plan-203143899');
        expect(zone.zone!.geometry.crs).toBe('EPSG:3346');
    });

    it('the register\'s approval date is NOT its registration date (the R3 measurement, pinned)', async () => {
        const zone = numericZone(await chainFor(PARCEL_A));
        const row = zone.tpdRows.get(123025)!;
        expect(row.approvalDate).toBe('2021-12-17'); // TVIRT_DATA — what ASGR's *D equals
        expect(row.registeredDate).toBe('2021-12-21'); // REGISTRUOTA — what it does NOT equal
        expect(row.approvalDate).not.toBe(row.registeredDate);
        // ASGR's served *D matches the APPROVAL date, which is why classification rules are 'legal'.
        const fz = zone.polygon.classifications.find((c) => c.field === 'PAGR_PASK')!;
        expect(fz.approvalDate).toBe(row.approvalDate);
    });

    it('the MEASURED provenance column names have no underscore before the suffix', () => {
        // The L0 vocabulary's `ltAsgrProvenanceColumns()` emits `MAX_AUK_M_TP`-style names,
        // which the live layer does not have. This adapter's corrected sibling is asserted here
        // so a regression back to the underscored form is caught, not discovered in production.
        expect(ltAsgrProvenanceColumnsMeasured('FUNKC_ZON')).toEqual([
            'FUNKC_ZONTP',
            'FUNKC_ZONNR',
            'FUNKC_ZOND',
            'FUNKC_ZONTPR',
        ]);
    });
});

/* ═════════════ 2. THE NAMED BLOCKER — MAX_INTENS is REFUSED ═════════════ */

describe('E6-LT 2 — MAX_INTENS is refused, visibly, with both numbers', () => {
    it('a SERVED intensity value still produces a tier-6 refusal, never a computable number', async () => {
        const zone = numericZone(await chainFor(PARCEL_A));
        // The source really does serve a value here — this is not an unfilled slot.
        expect(zone.polygon.numerics.find((n) => n.field === 'MAX_INTENS')!.value).toBe(1);

        const rule = ruleFor(zone, 'floorAreaRatio');
        expect(rule.provenance.value, 'a refused unit must never become a computable value').toBeNull();
        expect(rule.provenance.confidence.tier).toBe(6);
        expect(rule.provenance.valueBasis).toEqual({
            scheme: LT_INTENSITY_UNIT_SCHEME,
            code: LT_INTENSITY_UNIT_UNRESOLVED,
        });
        // C74: the refusal carries BOTH numbers.
        const note = rule.provenance.confidence.note ?? '';
        expect(note).toContain('REFUSED');
        expect(note).toContain('Served value 1');
        expect(note).toContain('0.01');
        expect(note).toContain('100x');
    });

    it('the refusal is the rule for the whole column, not a per-row judgement', () => {
        // Every reachable input — a ratio-shaped value, a percent-shaped value, a zero, a null —
        // refuses. A reading is never picked.
        for (const raw of [1, 0.4, 15, 59, 160, 0, null]) {
            const r = readLtNumeric('MAX_INTENS', raw);
            expect(r.value, `MAX_INTENS=${raw} must not yield a value`).toBeNull();
            expect(r.unknown).toBe(true);
            expect(r.refusalReason).not.toBeNull();
        }
    });

    it('NO rule anywhere in either baseline chain offers a usable floor-area ratio', async () => {
        for (const kad of [PARCEL_A, PARCEL_B]) {
            for (const zone of zonesOf(await chainFor(kad))) {
                for (const rule of zone.rules) {
                    if (rule.provenance.parameter === 'floorAreaRatio') {
                        expect(rule.provenance.value).toBeNull();
                        expect(rule.provenance.confidence.tier).toBe(6);
                    }
                }
            }
        }
    });

    it('the vocabulary row for MAX_INTENS declares no unit and carries the refusal basis', () => {
        const row = LT_RULE_VOCABULARY.find((e) => e.ltAttribute === 'MAX_INTENS')!;
        expect(row.parameter).toBe('floorAreaRatio');
        expect(row.unit, 'declaring a unit here would BE the guess this lane refused').toBeNull();
        expect(row.valueBasis).toEqual({
            scheme: LT_INTENSITY_UNIT_SCHEME,
            code: LT_INTENSITY_UNIT_UNRESOLVED,
        });
    });
});

/* ═════════════ 3. R3 validityBasis ═════════════ */

describe('E6-LT 3 — R3 validityBasis separates a legal date from an ingestion date', () => {
    it('classification rules are legal-dated; numeric rules are ingestion-dated', async () => {
        const zone = numericZone(await chainFor(PARCEL_A));
        for (const parameter of ['landUseMainPurpose', 'landUseMode', 'functionalZoneType', 'territoryUseType']) {
            expect(ruleFor(zone, parameter).provenance.validityBasis, parameter).toBe('legal');
        }
        for (const parameter of ['maxHeight', 'floorAreaRatio', 'coveragePercent', 'minGreenPercent']) {
            const p = ruleFor(zone, parameter).provenance;
            expect(p.validityBasis, `${parameter}: ASGR attributes no document to the numeric columns`).toBe('ingestion');
            expect(p.valid_from).toBe('2026-09-01');
            expect(p.source.plan_id, `${parameter} must not fabricate a legal address`).toBeNull();
            expect(p.source.document).toBeNull();
            // The candidates ARE named, so a human can resolve what the machine may not.
            expect(p.confidence.note ?? '').toContain('Candidate documents on this polygon');
        }
    });

    it('a classification field with no served provenance falls to ingestion, not to a borrowed date', async () => {
        const zone = zonesOf(await chainFor(PARCEL_B)).find((z) => z.polygon.objectId === 90028)!;
        const p = ruleFor(zone, 'landUseMode').provenance; // NAUD_BUD is null on 90028
        expect(p.value).toBeNull();
        expect(p.confidence.tier).toBe(6);
        expect(p.validityBasis).toBe('ingestion');
        expect(p.valid_from).toBe('2026-09-01');
    });
});

/* ═════════════ 4. R1 referent contract ═════════════ */

describe('E6-LT 4 — every basis ref resolves to a minted entity carried in the same result', () => {
    it('holds for every rule of every polygon of both baseline parcels', async () => {
        let checked = 0;
        for (const kad of [PARCEL_A, PARCEL_B]) {
            const chain = await chainFor(kad);
            for (const zone of zonesOf(chain)) {
                const minted = new Set<string>();
                if (zone.zone !== null) minted.add(zone.zone.id);
                for (const plan of zone.plans) minted.add(plan.id);
                expect(zone.rules.length).toBeGreaterThan(0);
                for (const rule of zone.rules) {
                    const a = rule.applicability;
                    // R1: at least one leg — a rule that applies nowhere is not a rule.
                    expect(a.basis.length > 0 || a.geometry !== null).toBe(true);
                    for (const ref of a.basis) {
                        expect(minted.has(ref.ref), `dangling basis ref ${ref.kind}:${ref.ref}`).toBe(true);
                        checked += 1;
                    }
                }
                // The second hop is not dangling either.
                if (zone.zone !== null) {
                    expect(zone.plans.some((p) => p.id === zone.zone!.planId)).toBe(true);
                }
            }
        }
        expect(checked).toBeGreaterThan(0);
    });
});

/* ═════════════ 5. E4 control 9 — UNKNOWN != 0 != no-limit, and never dropped ═════════════ */

describe('E6-LT 5 — UNKNOWN is emitted, distinct from zero and from no-limit', () => {
    it('every polygon emits all eight vocabulary parameters, filled or not', async () => {
        const expected = LT_RULE_VOCABULARY.map((e) => e.parameter).sort();
        for (const kad of [PARCEL_A, PARCEL_B]) {
            for (const zone of zonesOf(await chainFor(kad))) {
                const got = zone.rules
                    .map((r) => r.provenance.parameter)
                    .filter((p) => p !== 'apibendrinimas')
                    .sort();
                expect(got, `ASGR polygon ${zone.polygon.objectId} dropped an attribute`).toEqual(expected);
            }
        }
    });

    it('an all-null polygon yields eight tier-6 rules and not one zero', async () => {
        const zone = zonesOf(await chainFor(PARCEL_B)).find((z) => z.polygon.objectId === 90028)!;
        expect(zone.polygon.numerics.every((n) => n.value === null)).toBe(true);
        for (const parameter of ['maxHeight', 'floorAreaRatio', 'coveragePercent', 'minGreenPercent']) {
            const p = ruleFor(zone, parameter).provenance;
            expect(p.value, `${parameter} must be null, never 0`).toBeNull();
            expect(p.confidence.tier).toBe(6);
            expect(p.confidence.note ?? '').toContain('never 0 and never no-limit');
        }
    });

    it('a served zero or an out-of-domain percentage is UNKNOWN, not a value', () => {
        expect(readLtNumeric('MAX_AUK_M', 0).unknown).toBe(true);
        expect(readLtNumeric('MAX_AUK_M', 0).value).toBeNull();
        expect(readLtNumeric('MAX_TANKIS', 0).unknown).toBe(true);
        expect(readLtNumeric('MAX_TANKIS', 2931).unknown).toBe(true);
        expect(readLtNumeric('MAX_TANKIS', -5).unknown).toBe(true);
        expect(readLtNumeric('MIN_APZELD', 0).unknown).toBe(true);
        // ...and a real value still passes through.
        expect(readLtNumeric('MAX_AUK_M', 25)).toMatchObject({ value: 25, unknown: false });
        expect(readLtNumeric('MAX_TANKIS', 45)).toMatchObject({ value: 45, unknown: false });
        expect(readLtNumeric('MAX_TANKIS', 100)).toMatchObject({ value: 100, unknown: false });
        expect(readLtNumeric('MIN_APZELD', 15)).toMatchObject({ value: 15, unknown: false });
    });

    it('float32 widening is undone only when provably lossless', () => {
        // esri Single 0.2 arrives as 0.20000000298023224.
        expect(ltDeserialiseSingle(0.20000000298023224, 1)).toBe(0.2);
        expect(ltDeserialiseSingle(8.5, 2)).toBe(8.5);
        expect(ltDeserialiseSingle(25, 2)).toBe(25);
        // A value that does NOT re-narrow to the same float32 is left exactly as served.
        expect(ltDeserialiseSingle(17.44, 0)).toBe(17.44);
    });
});

/* ═════════════ 6. R5 normativeForce ═════════════ */

describe('E6-LT 6 — R5 normativeForce mirrors the register verbatim', () => {
    it('every rule carries "rekomendacinio pobudzio", never a harmonised boolean', async () => {
        expect(LT_ASGR_NORMATIVE_FORCE).toBe('rekomendacinio pobūdžio');
        for (const kad of [PARCEL_A, PARCEL_B]) {
            for (const zone of zonesOf(await chainFor(kad))) {
                for (const rule of zone.rules) {
                    expect(rule.provenance.normativeForce, rule.id).toBe(LT_ASGR_NORMATIVE_FORCE);
                }
            }
        }
    });

    it('the summarising prose is tier 2 in-document-text, never parsed for numbers', async () => {
        const zone = numericZone(await chainFor(PARCEL_A));
        const p = ruleFor(zone, 'apibendrinimas').provenance;
        expect(p.valueLocation).toBe('in-document-text');
        expect(p.confidence.tier).toBe(2); // tier 1 + in-document-text is rejected at parse
        expect(typeof p.value).toBe('string');
        expect(String(p.value)).toContain('Registravimo data');
        // The trap is named on the rule itself: the prose's own date wording is the loose one.
        expect(p.confidence.note ?? '').toContain('do not parse dates out of this prose');
    });
});

/* ═════════════ 7. FetchOutcome honesty ═════════════ */

describe('E6-LT 7 — absent, transient and found are three different values', () => {
    it('an empty ASGR answer is ABSENT and carries the consolidation caveat', async () => {
        const chain = await chainFor(PARCEL_B, replayDeps({ [asgrKeyForParcelB()]: { features: [] } }));
        expect(chain.regulationZones.status).toBe('absent');
        if (chain.regulationZones.status !== 'absent') throw new Error('unreachable');
        expect(chain.regulationZones.reason).toContain(LT_ASGR_ABSENCE_CAVEAT);
        expect(chain.regulationZones.reason).toContain('NOT proof');
        // ...and the parcel leg still succeeded: an absent rules leg is not a failed chain.
        expect(chain.parcel.kadastroNr).toBe(PARCEL_B);
    });

    it('an ArcGIS 200-with-error body is TRANSIENT and names the service\'s own message', async () => {
        const chain = await chainFor(
            PARCEL_B,
            replayDeps({
                [asgrKeyForParcelB()]: {
                    error: {
                        code: 400,
                        message: 'Unable to complete operation.',
                        details: ['Unable to perform query operation.'],
                    },
                },
            }),
        );
        expect(chain.regulationZones.status).toBe('transient');
        if (chain.regulationZones.status !== 'transient') throw new Error('unreachable');
        expect(chain.regulationZones.reason).toContain('ArcGIS 400');
        expect(chain.regulationZones.reason).toContain('Unable to complete operation.');
        // A misconfiguration must NEVER read as "no data here".
        expect(chain.regulationZones.reason).not.toContain(LT_ASGR_ABSENCE_CAVEAT);
    });

    it('a parcel that does not resolve is ABSENT — the chain invents nothing to hang on', async () => {
        // Route by the same key shape the recorder produced, derived rather than transcribed:
        // take the recorded parcel-A request and swap the cadastral number inside it.
        const templateKey = Object.keys(FIXTURES).find(
            (k) => k.includes('/ntr_sklypai/FeatureServer/0/query') && k.includes(PARCEL_A),
        )!;
        const missingKey = templateKey.replace(PARCEL_A, '9999/9999:9999');
        expect(missingKey).not.toBe(templateKey);
        const outcome = await resolveLtParcelChain(
            '9999/9999:9999',
            replayDeps({ [missingKey]: { features: [] } }),
            '2026-09-01T00:00:00Z',
        );
        expect(outcome.status).toBe('absent');
    });
});

/* ═════════════ 8. the parcel arm + adapter shape ═════════════ */

describe('E6-LT 8 — the parcel arm and the §J adapter shape', () => {
    it('both baseline parcels carry native-CRS geometry and an audited area transform', async () => {
        const a = (await chainFor(PARCEL_A)).parcel;
        expect(a.kadastroNr).toBe(PARCEL_A);
        expect(a.unikalusNr).toBe('440055970193');
        expect(a.crs).toBe('EPSG:3346');
        expect(a.ring.length).toBe(18);
        expect(a.areaHaRaw).toBe(0.1544); // as served — hectares
        expect(a.areaM2).toBe(1544); // the single, auditable transform
        expect(a.buildingCount).toBe(0);

        const b = (await chainFor(PARCEL_B)).parcel;
        expect(b.unikalusNr).toBe('440063553760');
        expect(b.areaHaRaw).toBe(0.0775);
        expect(b.areaM2).toBe(775);
    });

    it('heritage overlap arrives as a SHARE with the register\'s own names', async () => {
        const a = (await chainFor(PARCEL_A)).parcel;
        const kvr = a.overlaps.find((o) => o.register === 'cultural-heritage')!;
        expect(kvr.percent).toBe(100);
        expect(kvr.names).toContain('Vilniaus senamiestis');
    });

    it('the adapter exposes the §J shape and every endpoint has a registered source row', () => {
        expect(ltCountryAdapter.country).toBe('LT');
        expect(ltCountryAdapter.rules.kind).toBe('structured');
        expect(ltCountryAdapter.sources()).toBe(LT_ADAPTER_SOURCES);
        expect(ltCountryAdapter.precedence.length).toBeGreaterThan(0);

        for (const binding of LT_ADAPTER_ENDPOINT_BINDINGS) {
            const row = LT_ADAPTER_SOURCES.find((s) => s.id === binding.sourceId);
            expect(row, `no source row for endpoint ${binding.endpoint}`).toBeDefined();
            // The registry may record a deeper URL (the parcel row names layer /0); one must be
            // a prefix of the other, so an endpoint can never drift away from its probed row.
            const registered = row!.endpoint;
            expect(
                registered.startsWith(binding.endpoint) || binding.endpoint.startsWith(registered),
                `${binding.sourceId}: adapter calls ${binding.endpoint}, registry records ${registered}`,
            ).toBe(true);
            expect(row!.probes.length).toBeGreaterThan(0);
        }
    });

    it('the jurisdiction predicate accepts Vilnius and rejects Tallinn', () => {
        expect(isInLithuania(54.6872, 25.2797)).toBe(true); // Vilnius
        expect(isInLithuania(55.7033, 21.1443)).toBe(true); // Klaipeda
        expect(isInLithuania(59.437, 24.7536)).toBe(false); // Tallinn — EE's box, not ours
        expect(isInLithuania(Number.NaN, 25)).toBe(false);
    });
});

/* ═════════════ 9. the completeness flags — SYNTHETIC, and labelled as such ═════════════ */

describe('E6-LT 9 — PILN/ATN_DOK caveats (SYNTHETIC input: no live row carries them)', () => {
    it('surfaces the completeness warning when the register ever fills the flag', () => {
        // ⚠ SYNTHETIC. Measured 2026-09-01: PILN, ATN_DOK and PRIORIT are non-null on 0 of the
        // 175,570 national ASGR polygons, so NO live fixture can exercise this path. The input
        // below is hand-built from the layer's own coded-value domains and is labelled here so
        // nobody reads this test as evidence the flags are populated (a fake must never look
        // more capable than the real thing).
        const synthetic = parseLtAsgrPolygon({
            attributes: { OBJECTID: 1, PILN: 'N', ATN_DOK: 'D' },
            geometry: undefined,
        });
        expect(synthetic.completenessFlag).toBe('N');
        expect(synthetic.nonSpatialUpdateFlag).toBe('D');
        const caveat = ltCompletenessCaveat(synthetic);
        expect(caveat).toContain('PILN=N');
        expect(caveat).toContain('may be incomplete');
        expect(caveat).toContain('ATN_DOK=D');
        expect(caveat).toContain('NON-SPATIAL');
    });

    it('adds nothing when the flags are absent, which is every live row today', async () => {
        for (const zone of zonesOf(await chainFor(PARCEL_A))) {
            expect(zone.polygon.completenessFlag).toBeNull();
            expect(ltCompletenessCaveat(zone.polygon)).toBe('');
        }
    });
});
