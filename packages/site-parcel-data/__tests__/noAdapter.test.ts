// E7-NO — NORWAY adapter suite. Fixtures are the STATE'S OWN RECORDED BYTES, replayed through
// `deps.fetchImpl`; nothing here reaches the network. Re-record path + sha256 pins:
// `__tests__/fixtures/no-nap-matrikkel/README.md`.
//
// ── FALSIFICATION TARGETS (§6-G.4 — named here, executed in the lane transcripts) ──────────
//   F1. THE PROVENANCE LEG. Sever `noSourceRef`'s `document` (return `null` instead of
//       `plan?.link`) in `noRuleMapper.ts` -> "F1 · every rule carries the plan's bestemmelser
//       document as its provenance address" FAILS BY NAME. Restore byte-identically.
//   F2. THE R3 LEGAL-VALIDITY LEG. Sever `noValidity`'s legal arm (always return
//       `'ingestion'`) -> "F2 · R3 validityBasis is 'legal' on the served ikrafttredelsesdato"
//       FAILS BY NAME. Restore byte-identically.
//   F3. THE THREE-WAY UNKNOWN GUARD. Delete the `isNapJavaArraySentinel` branch from
//       `readNoUtnyttingNumber` -> "F3 · the Java-array leak is UNKNOWN-DESTROYED, never
//       UNKNOWN-NOT-SERVED" FAILS BY NAME. Restore byte-identically.
//
// ── THE SCRAMBLE CONTROL (§6-G.5, MANDATORY) ───────────────────────────────────────────────
// `scramble control · the end-to-end expectations are sensitive to the fixture` perturbs the
// recorded bytes and asserts the SAME assertion function goes red. Without it the suite cannot
// prove it is not passing on arbitrary input.

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteIntelRuleSchema, type SiteIntelRule } from '@pryzm/schemas';
import {
    buildNoPlanFeatureSet,
    isNapJavaArraySentinel,
    mapNoZoneToRules,
    noCountryAdapter,
    nonAsciiNameFromScanDetail,
    noNapGetFeatureInfo,
    noWfsGetMembers,
    NO_ADAPTER_ENDPOINT_BINDINGS,
    NO_ADAPTER_SOURCES,
    NO_APPLICABILITY_LADDER,
    NO_MATRIKKEL_WFS_BASE,
    NO_NAP_COVERAGE_CENSUS_2026_09_01,
    NO_NAP_DOWNLOAD_REQUIRED_ROLE,
    NO_NAP_MAX_HALF_WINDOW_M,
    NO_NAP_REGULERINGSPLANER_WMS,
    NO_NAP_SOURCE_ID,
    NO_NAP_VN1_FEATURE_TYPES,
    NO_RULE_VOCABULARY,
    NO_UTNYTTINGSTYPE_CODELIST,
    NO_UTNYTTINGSTYPE_PROHIBITION_CODES,
    NO_XMLSCAN_NON_ASCII_BLOCKER_TOKEN,
    readNoIsoDate,
    readNoUtnyttingNumber,
    readUtnyttingstype,
    resolveNoPlanChainAtNativePoint,
    resolveNoTeigerAtWgs84Point,
    type NoPlanChain,
    type NoZoneArea,
} from '../src/countryAdapters/no/index.js';
import { scanXml } from '../src/parsers/appGml/xmlScan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'no-nap-matrikkel');
const read = (name: string): string => readFileSync(join(FX, name), 'utf8');
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** The Bergen anchor: teig 4601-167/714's own representasjonspunkt, EPSG:25833. */
const BERGEN_E = -31841.977;
const BERGEN_N = 6735304.036;

/* ────────────────────────────── the fixture-replaying fetch ────────────────────── */

/**
 * §6-G.3: an UNROUTED request must fail BY NAME, never fall through to an empty answer. This
 * router keys on the request's own `CRS` + `_vn<n>` and throws for anything it did not record.
 */
function makeFakeFetch(overrides: Readonly<Record<string, string>> = {}): typeof fetch {
    const body = (name: string): string => overrides[name] ?? read(name);
    return (async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (!url.startsWith(NO_NAP_REGULERINGSPLANER_WMS) && !url.startsWith(NO_MATRIKKEL_WFS_BASE)) {
            throw new Error(`UNROUTED HOST — the NO suite recorded no bytes for: ${url}`);
        }
        if (url.startsWith(NO_MATRIKKEL_WFS_BASE)) {
            return respond(200, body('matrikkel-teig-bergen-4601-167.xml'), 'text/xml');
        }
        const crs = /[?&]CRS=([^&]+)/.exec(url)?.[1] ?? '';
        const vn = /_vn(\d)/.exec(/[?&]QUERY_LAYERS=([^&]*)/.exec(url)?.[1] ?? '')?.[1] ?? '';
        if (crs === 'EPSG%3A25833' || crs === 'EPSG:25833') {
            if (vn === '1') return respond(200, body('nap-gfi-vn1-bergen-167-714.json'), 'application/json');
            if (vn === '2') return respond(200, body('nap-gfi-vn2-bergen-167-714.json'), 'application/json');
            if (vn === '3' || vn === '4' || vn === '5') {
                return respond(200, body('nap-gfi-empty-wrong-crs.json'), 'application/json');
            }
        }
        if ((crs === 'EPSG%3A3857' || crs === 'EPSG:3857') && vn === '1') {
            return respond(200, body('nap-gfi-utnyttingstall-array-leak.json'), 'application/json');
        }
        throw new Error(`UNROUTED REQUEST — the NO suite recorded no bytes for CRS='${crs}' vn='${vn}': ${url}`);
    }) as unknown as typeof fetch;
}

function respond(status: number, text: string, contentType: string): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
        text: async () => text,
    } as unknown as Response;
}

const NOW = '2026-09-01';
const chain = (deps: { fetchImpl: typeof fetch }, nowIso: string = NOW): Promise<NoPlanChain> =>
    resolveNoPlanChainAtNativePoint(BERGEN_E, BERGEN_N, deps, nowIso);

function zonesOf(c: NoPlanChain, level: number) {
    const lvl = c.levels.find((l) => l.level === level);
    if (lvl === undefined) throw new Error(`no level ${level} in chain`);
    if (lvl.zones.status !== 'found') throw new Error(`level ${level} zones not found: ${JSON.stringify(lvl.zones)}`);
    return lvl.zones.value;
}

function allRules(c: NoPlanChain): SiteIntelRule[] {
    const out: SiteIntelRule[] = [];
    for (const lvl of c.levels) {
        if (lvl.zones.status === 'found') for (const z of lvl.zones.value) out.push(...z.rules);
        if (lvl.planRules.status === 'found') out.push(...lvl.planRules.value);
    }
    return out;
}

/* ────────────────────────────── §1 fixtures are the state's bytes ──────────────── */

describe('E7-NO §1 — the fixtures are the state\'s own recorded bytes', () => {
    it('pins the sha256 of the four STABLE fixtures', () => {
        expect(sha256(read('matrikkel-teig-bergen-4601-167.xml'))).toBe(
            'b89c4cf340cd9151e26e8914d34274c61510cd747fcc4dfd2681e49d1db909fc',
        );
        expect(sha256(read('matrikkel-typename-error.xml'))).toBe(
            '4e7015553541cc34024788f02187e34acf1e126cb33e4678207fd1b63a1face2',
        );
        expect(sha256(read('nap-gfi-layer-not-defined.xml'))).toBe(
            '66b31bfdf076427fa831ff3cc75752b00757552108d6c561c860653b032693ac',
        );
        expect(sha256(read('nap-gfi-vn1-bergen-167-714.json'))).toBe(
            '738a2bd32bb61db284fff2b0abc8e1ef7b6cf8447c5b05d8588ce2a54b814677',
        );
    });

    it('does NOT pin the leak fixture by hash — its value is an object identity that changes per request', () => {
        const leak = JSON.parse(read('nap-gfi-utnyttingstall-array-leak.json')) as {
            features: { properties: Record<string, unknown> }[];
        };
        const raw = leak.features[0]!.properties['utnytting.utnyttingstall'];
        expect(isNapJavaArraySentinel(raw)).toBe(true);
        expect(String(raw)).toMatch(/^\[Ljava\.lang\.Double;@[0-9a-f]+$/);
    });
});

/* ────────────────────────────── §2 the chain, end to end ───────────────────────── */

/**
 * The end-to-end expectations, as ONE function — so the scramble control can run the SAME
 * assertions against perturbed bytes and prove they go red.
 */
function assertBergenChain(c: NoPlanChain): void {
    // ── level 1: the 2023 Bybanen TUNNEL plan, with one formålområde ──
    const l1 = zonesOf(c, 1);
    expect(l1).toHaveLength(1);
    const z = l1[0]!;
    expect(z.zone.arealformaal).toBe('2022');
    expect(z.zone.feltbetegnelse).toBe('o_STS3');
    expect(z.zoneEntity?.id).toBe('no-zone-1690166a-fa22-4bf4-ab2a-a710dcf3c4ae');
    expect(z.zoneEntity?.typology).toEqual({ national: '2022', harmonised: null });
    expect(z.planEntity?.id).toBe('no-plan-4601-65800000');
    expect(z.planEntity?.kind).toBe('reguleringsplan');
    expect(z.planEntity?.status).toBe('3');
    // Norway serves a real IN-FORCE axis; the adoption axis is a DIFFERENT, unserved column.
    expect(z.planEntity?.inForceFrom).toBe('2023-05-31');
    expect(z.planEntity?.adoptedDate).toBeNull();

    // ── level 2: a DIFFERENT plan, 40 years older, with NO formålområde at all ──
    const lvl2 = c.levels.find((l) => l.level === 2)!;
    expect(lvl2.features.status).toBe('found');
    expect(zonesOf(c, 2)).toHaveLength(0);
    expect(lvl2.planRules.status).toBe('found');
    const l2PlanName = lvl2.planRules.status === 'found'
        ? lvl2.planRules.value.find((r) => r.provenance.parameter === 'planName')?.provenance.value
        : null;
    expect(l2PlanName).toBe('BERGENHUS. STØLEN/LADEGÅRDEN/ROTHAUGEN');
    const l2InForce = lvl2.planRules.status === 'found' ? lvl2.planRules.value[0]!.provenance.valid_from : null;
    expect(l2InForce).toBe('1983-10-10');

    // ── the hensynssoner / bestemmelsesområder minted as Prescriptions ──
    const l1Prescriptions = c.levels.find((l) => l.level === 1)!.prescriptions;
    expect(l1Prescriptions.map((p) => p.kind).sort()).toEqual([
        'RpBestemmelseOmråde',
        'RpBåndleggingSone',
        'RpSikringSone',
    ]);
    expect(l1Prescriptions.every((p) => p.zoneOrPlanRef === 'no-zone-1690166a-fa22-4bf4-ab2a-a710dcf3c4ae')).toBe(true);
    expect(l1Prescriptions.every((p) => p.typology.scheme === 'no-nap-layer')).toBe(true);
    expect(l1Prescriptions.every((p) => p.typology.code.endsWith('_vn1'))).toBe(true);
}

describe('E7-NO §2 — a REAL Norwegian zone resolves end to end at the CHAIN layer', () => {
    it('resolves Bergen 4601/65800000 across two vertical levels, from the state\'s own bytes', async () => {
        assertBergenChain(await chain({ fetchImpl: makeFakeFetch() }));
    });

    it('⭐ the SAME parcel point carries TWO different plans at TWO vertical levels — never merged', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        const planIds = c.levels
            .filter((l) => l.features.status === 'found')
            .map((l) => (l.features.status === 'found' ? l.features.value.planAreas.map((p) => p.arealplanId?.planidentifikasjon) : []))
            .flat();
        expect(planIds).toEqual(['65800000', '5380000']);
        // level 1 is UNDER GROUND — the tunnel. Every level-1 rule says so.
        const verticals = zonesOf(c, 1)[0]!.rules.filter((r) => r.provenance.parameter === 'verticalLevel');
        expect(verticals).toHaveLength(1);
        expect(verticals[0]!.provenance.value).toBe('1');
        expect(verticals[0]!.provenance.confidence.note).toMatch(/UNDER GROUND/);
    });

    it('every emitted rule is a valid SiteIntelRule value', async () => {
        const rules = allRules(await chain({ fetchImpl: makeFakeFetch() }));
        expect(rules.length).toBeGreaterThan(0);
        for (const r of rules) expect(() => SiteIntelRuleSchema.parse(r)).not.toThrow();
    });

    it('every applicability basis ref resolves to an entity RETURNED IN THE SAME RESULT (R1)', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        const minted = new Set<string>();
        for (const lvl of c.levels) {
            if (lvl.zones.status === 'found') {
                for (const z of lvl.zones.value) {
                    if (z.zoneEntity !== null) minted.add(z.zoneEntity.id);
                    if (z.planEntity !== null) minted.add(z.planEntity.id);
                }
            }
            for (const p of lvl.planEntities) minted.add(p.id);
            for (const p of lvl.prescriptions) minted.add(p.id);
        }
        for (const r of allRules(c)) {
            for (const b of r.applicability.basis) {
                expect(minted.has(b.ref), `dangling basis ref ${b.kind}:${b.ref} on rule ${r.id}`).toBe(true);
            }
        }
    });

    it('a caller passing a FULL ISO timestamp gets the same rules as a date (L-12873 shape)', async () => {
        const a = await chain({ fetchImpl: makeFakeFetch() }, '2026-09-01');
        const b = await chain({ fetchImpl: makeFakeFetch() }, '2026-09-01T12:34:56.000Z');
        expect(JSON.stringify(allRules(b))).toBe(JSON.stringify(allRules(a)));
    });
});

/* ────────────────────────────── §3 the falsification targets ───────────────────── */

describe('E7-NO §3 — the falsification targets', () => {
    it('F1 · every rule carries the plan\'s bestemmelser document as its provenance address', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        const zoneRules = zonesOf(c, 1)[0]!.rules;
        expect(zoneRules.length).toBeGreaterThan(0);
        for (const r of zoneRules) {
            expect(r.provenance.source.document).toBe(
                'https://www.arealplaner.no/bergen4601/gi?funksjon=VisPlan&kommunenummer=4601&planidentifikasjon=65800000',
            );
            expect(r.provenance.source.country).toBe('NO');
            expect(r.provenance.source.plan_id).toBe('4601/65800000');
        }
    });

    it('F2 · R3 validityBasis is \'legal\' on the served ikrafttredelsesdato', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        for (const r of zonesOf(c, 1)[0]!.rules) {
            expect(r.provenance.validityBasis).toBe('legal');
            expect(r.provenance.valid_from).toBe('2023-05-31');
        }
    });

    it('F3 · the Java-array leak is UNKNOWN-DESTROYED, never UNKNOWN-NOT-SERVED', () => {
        const destroyed = readNoUtnyttingNumber('[Ljava.lang.Double;@493a67bb');
        expect(destroyed.kind).toBe('transport-destroyed');
        const notServed = readNoUtnyttingNumber(null);
        expect(notServed.kind).toBe('not-served');
        // ⛔ The two must not collapse: Number('[Ljava…') is NaN, so a naive numeric parse would
        // classify a DESTROYED value as merely unreadable and lose the fact that one exists.
        expect(destroyed.kind).not.toBe(notServed.kind);
        expect(readNoUtnyttingNumber(42).kind).toBe('value');
        expect(readNoUtnyttingNumber('2.54')).toEqual({ kind: 'value', value: 2.54 });
        expect(readNoUtnyttingNumber('kanskje').kind).toBe('unreadable');
    });
});

/* ────────────────────────────── §4 the R2 denominator refusal ──────────────────── */

describe('E7-NO §4 — R2: the denominator refusal carries BOTH numbers (C74)', () => {
    it('the national Utnyttingstype codelist has 16 members, 2 of which are PROHIBITIONS', () => {
        expect(Object.keys(NO_UTNYTTINGSTYPE_CODELIST)).toHaveLength(16);
        expect(NO_UTNYTTINGSTYPE_PROHIBITION_CODES).toEqual(['10', '11']);
        expect(NO_UTNYTTINGSTYPE_CODELIST['10']).toBe('Ikke tillatt å bebygge');
        expect(NO_UTNYTTINGSTYPE_CODELIST['11']).toBe('Ikke tillatt med ytterligere bebyggelse');
    });

    it('a degreeOfUtilisation rule emits NO valueBasis and refuses the per-parcel multiply BY NAME', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        const rule = zonesOf(c, 1)[0]!.rules.find((r) => r.provenance.parameter === 'degreeOfUtilisation');
        expect(rule).toBeDefined();
        expect(rule!.provenance.valueBasis).toBeUndefined();
        expect(rule!.provenance.value).toBeNull();
        expect(rule!.provenance.confidence.tier).toBe(6);
        const note = rule!.provenance.confidence.note ?? '';
        // BOTH numbers: one served value against sixteen possible meanings, two of them
        // prohibitions on building.
        expect(note).toMatch(/DENOMINATOR UNKNOWN/);
        expect(note).toMatch(/16 members/);
        expect(note).toMatch(/PROHIBITIONS/);
        expect(note).toMatch(/refused/);
    });

    it('⛔ a utnyttingstype outside the CLOSED national codelist THROWS BY NAME (§6-E R2)', () => {
        expect(() => readUtnyttingstype('99')).toThrow(/NOT a member of the closed/);
        expect(() => readUtnyttingstype('99')).toThrow(/NATIONAL SCHEMA CHANGE/);
        // The two states the schema DOES distinguish:
        expect(readUtnyttingstype(undefined)).toBeUndefined(); // key not served by the feature type
        expect(readUtnyttingstype(null)).toBeNull(); // key served, empty
        expect(readUtnyttingstype('16')).toBe('16');
    });

    it('when the basis code IS served, it rides R2 verbatim — and a prohibition says so', () => {
        const zone = makeZone({ utnyttingstypeRaw: '16', utnyttingstallRaw: 30 });
        const r = mapNoZoneToRules(zone, null, NOW).rules.find((x) => x.provenance.parameter === 'degreeOfUtilisation')!;
        expect(r.provenance.valueBasis).toEqual({ scheme: 'sosi-utnyttingstype', code: '16' });
        expect(r.provenance.value).toBe(30);
        expect(r.provenance.confidence.tier).toBe(1);

        const prohibited = makeZone({ utnyttingstypeRaw: '10', utnyttingstallRaw: 0 });
        const pr = mapNoZoneToRules(prohibited, null, NOW).rules.find(
            (x) => x.provenance.parameter === 'degreeOfUtilisation',
        )!;
        expect(pr.provenance.confidence.note).toMatch(/PROHIBITION on building, NOT a capacity/);
    });

    it('the transport-destroyed value is tier 6 with its OWN note, not the not-served one', () => {
        const zone = makeZone({ utnyttingstallRaw: '[Ljava.lang.Double;@493a67bb' });
        const r = mapNoZoneToRules(zone, null, NOW).rules.find((x) => x.provenance.parameter === 'degreeOfUtilisation')!;
        expect(r.provenance.value).toBeNull();
        expect(r.provenance.confidence.tier).toBe(6);
        expect(r.provenance.confidence.note).toMatch(/TRANSPORT DESTROYED THE VALUE/);
        expect(r.provenance.confidence.note).toMatch(/\[Ljava\.lang\.Double;@493a67bb/);
        expect(r.provenance.confidence.note).not.toMatch(/NAP served no value/);
    });
});

/* ────────────────────────────── §5 the tier-6 census ───────────────────────────── */

describe('E7-NO §5 — tier-6 UNKNOWNs are VISIBLE and COUNTED against the source\'s own vocabulary', () => {
    it('emits one row per DECLARED vocabulary entry even when the server omits the key', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        const rules = zonesOf(c, 1)[0]!.rules;
        const declared = NO_RULE_VOCABULARY.filter((e) => e.featureTypes.includes('rparealformalomrade'));
        // INDEPENDENT CENSUS: the declared vocabulary, not the served bag.
        expect(declared).toHaveLength(5);
        for (const entry of declared) {
            const r = rules.find((x) => x.provenance.parameter === entry.parameter);
            expect(r, `declared parameter ${entry.parameter} was silently dropped`).toBeDefined();
        }
        const tier6 = rules.filter((r) => r.provenance.confidence.tier === 6);
        // All five declared numeric/provision slots are unserved on this feature — measured.
        expect(tier6).toHaveLength(5);
        expect(tier6.map((r) => r.provenance.parameter).sort()).toEqual([
            'accessProvisionCode',
            'degreeOfUtilisation',
            'degreeOfUtilisationMinimum',
            'outdoorAmenityArea',
            'structureProvisionCode',
        ]);
        for (const r of tier6) {
            expect(r.provenance.value, `${r.provenance.parameter} must be null at tier 6`).toBeNull();
            expect(r.provenance.confidence.note).toBeTruthy();
        }
    });

    it('the whole resolved chain is 19 rules / 5 tier-6, every one legally addressed', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        const rules = allRules(c);
        // THE MEASURED INVENTORY for Bergen teig 4601-167/714 (see lane-e7-no.md §7).
        expect(rules).toHaveLength(19);
        expect(rules.filter((r) => r.provenance.confidence.tier === 6)).toHaveLength(5);
        expect(rules.filter((r) => r.provenance.confidence.tier === 1)).toHaveLength(14);
        // Every rule is legally addressed AND legally dated — no rule rides ingestion here,
        // because Norway serves an in-force date on 30 of 30 sampled plans.
        expect(rules.every((r) => r.provenance.validityBasis === 'legal')).toBe(true);
        expect(rules.every((r) => r.provenance.source.document !== null)).toBe(true);
        expect(rules.every((r) => r.provenance.normativeForce === null)).toBe(true);
        expect(rules.every((r) => r.applicability.rank === null)).toBe(true);
        // Two plans, two levels; levels 3-5 are honestly ABSENT, not silently empty.
        expect(c.levels.map((l) => l.planEntities.length)).toEqual([1, 1, 0, 0, 0]);
        expect(c.levels.map((l) => l.features.status)).toEqual([
            'found',
            'found',
            'absent',
            'absent',
            'absent',
        ]);
    });

    it('UNKNOWN is kept distinct from 0, unlimited and no-restriction (control 9)', async () => {
        const c = await chain({ fetchImpl: makeFakeFetch() });
        const tier6 = zonesOf(c, 1)[0]!.rules.filter((r) => r.provenance.confidence.tier === 6);
        for (const r of tier6) {
            expect(r.provenance.value).not.toBe(0);
            expect(r.provenance.value).not.toBe(Infinity);
            expect(r.provenance.confidence.note).toMatch(/UNKNOWN/);
        }
        // A served 0 stays a 0 at tier 1 — the guard must not swallow real zeros.
        const zeroZone = makeZone({ utnyttingstallRaw: 0 });
        const zr = mapNoZoneToRules(zeroZone, null, NOW).rules.find(
            (x) => x.provenance.parameter === 'degreeOfUtilisation',
        )!;
        expect(zr.provenance.value).toBe(0);
        expect(zr.provenance.confidence.tier).toBe(1);
    });
});

/* ────────────────────────────── §6 the three silent-empty traps ────────────────── */

describe('E7-NO §6 — the three measured silent-empty traps are refused BY NAME', () => {
    it('T1 · a window past the measured scale cliff refuses instead of returning a false empty', async () => {
        const out = await noNapGetFeatureInfo(
            { crs: 'EPSG:25833', x: BERGEN_E, y: BERGEN_N },
            ['arealformal_vn1'],
            'scale-cliff probe',
            { fetchImpl: makeFakeFetch() },
            { halfWindowM: NO_NAP_MAX_HALF_WINDOW_M + 1 },
        );
        expect(out.status).toBe('transient');
        expect(out.status === 'transient' ? out.reason : '').toMatch(/upstream-failed: NAP GetFeatureInfo half-window/);
        expect(out.status === 'transient' ? out.reason : '').toMatch(/FALSE "no plan here"/);
    });

    it('T2 · an unprobed CRS is refused BEFORE the request (it returns a silent empty)', async () => {
        const out = await noNapGetFeatureInfo(
            { crs: 'EPSG:4326' as never, x: 5.32, y: 60.4 },
            ['arealformal_vn1'],
            'crs probe',
            { fetchImpl: makeFakeFetch() },
        );
        expect(out.status).toBe('transient');
        expect(out.status === 'transient' ? out.reason : '').toMatch(/has not been probed by this adapter/);
    });

    it('T3 · LayerNotDefined arrives as HTTP 200 and is still classified transient, naming the layer', async () => {
        const fetchImpl = (async () =>
            respond(200, read('nap-gfi-layer-not-defined.xml'), 'text/xml')) as unknown as typeof fetch;
        const out = await noNapGetFeatureInfo(
            { crs: 'EPSG:25833', x: BERGEN_E, y: BERGEN_N },
            ['arealformal_vn9'],
            'bad layer',
            { fetchImpl },
        );
        expect(out.status).toBe('transient');
        expect(out.status === 'transient' ? out.reason : '').toMatch(/Could not find layer reguleringsplaner:arealformal_vn9/);
    });

    it('a genuinely empty answer past all three traps is ABSENT, not transient, and carries the coverage caveat', async () => {
        const fetchImpl = (async () =>
            respond(200, read('nap-gfi-empty-wrong-crs.json'), 'application/json')) as unknown as typeof fetch;
        const c = await resolveNoPlanChainAtNativePoint(BERGEN_E, BERGEN_N, { fetchImpl }, NOW);
        const l1 = c.levels[0]!;
        expect(l1.features.status).toBe('absent');
        expect(l1.features.status === 'absent' ? l1.features.reason : '').toMatch(/NOT at Oslo/);
        expect(l1.features.status === 'absent' ? l1.features.reason : '').toMatch(/ingestion is PARTIAL/);
    });

    it('an UNROUTED request fails BY NAME rather than resolving to an empty answer', async () => {
        await expect(
            noNapGetFeatureInfo(
                { crs: 'EPSG:3857', x: 1, y: 2 },
                ['arealformal_vn2'],
                'unrouted',
                { fetchImpl: makeFakeFetch() },
            ),
        ).resolves.toMatchObject({ status: 'transient' });
        const out = await noNapGetFeatureInfo(
            { crs: 'EPSG:3857', x: 1, y: 2 },
            ['arealformal_vn2'],
            'unrouted',
            { fetchImpl: makeFakeFetch() },
        );
        expect(out.status === 'transient' ? out.reason : '').toMatch(/UNROUTED REQUEST/);
    });
});

/* ────────────────────────────── §7 the Matrikkelen arm ─────────────────────────── */

describe('E7-NO §7 — the Matrikkelen arm: the count header lies, and our own scanner blocks us', () => {
    it('⛔ PINS THE SHARED-FILE DEFECT: xmlScan refuses the well-formed name app:område', () => {
        const r = scanXml(read('matrikkel-teig-bergen-4601-167.xml'));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('malformed-tag');
        expect(r.detail).toBe('invalid element name "app:område"');
        expect(nonAsciiNameFromScanDetail(r.reason, r.detail)).toBe('app:område');
        // ⭐ WHEN THIS TEST GOES RED, THE ONE-LINE FIX IN parsers/appGml/xmlScan.ts HAS LANDED.
        // Delete this pin, delete the blocker paragraphs in noMatrikkelClient.ts and
        // countryAdapters/no/index.ts, and the parcel arm is live with no other change.
    });

    it('⛔ AND THE STATE\'S OWN COUNT HEADER LIES: numberReturned="0" over 3 real teiger', () => {
        const xml = read('matrikkel-teig-bergen-4601-167.xml');
        expect(xml).toMatch(/numberReturned="0"/);
        expect((xml.match(/<wfs:member>/g) ?? []).length).toBe(3);
        expect(xml).toMatch(/<app:matrikkelnummerTekst>167\/714<\/app:matrikkelnummerTekst>/);
        expect(xml).toMatch(/<app:lagretBeregnetAreal>809\.3<\/app:lagretBeregnetAreal>/);
        // The client counts MEMBERS, never the header — proven by the refusal below being about
        // the scanner rather than about an empty collection.
    });

    it('the blocked parcel leg refuses SELF-NAMINGLY — our bug, not Kartverket\'s outage', async () => {
        const out = await resolveNoTeigerAtWgs84Point(60.401356, 5.324201, { fetchImpl: makeFakeFetch() });
        expect(out.status).toBe('transient');
        const reason = out.status === 'transient' ? out.reason : '';
        expect(reason).toMatch(new RegExp(NO_XMLSCAN_NON_ASCII_BLOCKER_TOKEN));
        expect(reason).toMatch(/PRYZM-side blocker/);
        expect(reason).toMatch(/app:område/);
        // ⛔ It must NOT read as "no parcel here".
        expect(out.status).not.toBe('absent');
    });

    it('a wrong feature type refuses with Kartverket\'s OWN exception text', async () => {
        const fetchImpl = (async () =>
            respond(400, read('matrikkel-typename-error.xml'), 'application/xml')) as unknown as typeof fetch;
        const out = await noWfsGetMembers(`${NO_MATRIKKEL_WFS_BASE}?typeNames=app:Teigg`, 'bad typename', {
            fetchImpl,
        });
        expect(out.status).toBe('transient');
        expect(out.status === 'transient' ? out.reason : '').toMatch(
            /Feature type with name 'Teigg' is not served by this WFS/,
        );
    });
});

/* ────────────────────────────── §8 the scramble control ────────────────────────── */

describe('E7-NO §8 — the scramble control (§6-G.5, MANDATORY)', () => {
    it('scramble control · the end-to-end expectations are sensitive to the fixture', async () => {
        // Sanity: the un-perturbed run passes.
        await expect(chain({ fetchImpl: makeFakeFetch() }).then(assertBergenChain)).resolves.toBeUndefined();

        const original = read('nap-gfi-vn1-bergen-167-714.json');
        const scrambled = original
            .replace('"arealformål":"2022"', '"arealformål":"9999"')
            .replace('"ikrafttredelsesdato":"2023-05-31Z"', '"ikrafttredelsesdato":"1999-01-01Z"')
            .replace('"feltbetegnelse":"o_STS3"', '"feltbetegnelse":"SCRAMBLED"');
        // The perturbation must actually have bitten — otherwise the control proves nothing.
        expect(scrambled).not.toBe(original);

        const c = await chain({
            fetchImpl: makeFakeFetch({ 'nap-gfi-vn1-bergen-167-714.json': scrambled }),
        });
        await expect(Promise.resolve().then(() => assertBergenChain(c))).rejects.toThrow();
    });

    it('scramble control · severing the plan JOIN KEY collapses R3 from legal to ingestion', async () => {
        const original = read('nap-gfi-vn1-bergen-167-714.json');
        // Break ONLY the RpOmrade's own planidentifikasjon, so the zone's arealplanId can no
        // longer join to it. Nothing about the ZONE changes.
        const doc = JSON.parse(original) as {
            features: { id: string; properties: Record<string, unknown> }[];
        };
        const rpomrade = doc.features.find((f) => f.id.startsWith('rpomrade_vn1'))!;
        expect(rpomrade.properties['arealplanId.planidentifikasjon']).toBe('65800000');
        rpomrade.properties['arealplanId.planidentifikasjon'] = '00000000';
        const severed = JSON.stringify(doc);
        expect(severed).not.toBe(original);

        const c = await chain({ fetchImpl: makeFakeFetch({ 'nap-gfi-vn1-bergen-167-714.json': severed }) });
        const rules = zonesOf(c, 1)[0]!.rules;
        expect(rules.length).toBeGreaterThan(0);
        // ⭐ The zone no longer resolves a plan, so R3 MUST fall back to ingestion + the fetch
        // date, and the provenance document MUST become null. Both are honest degradations, and
        // both are invisible unless the suite is actually sensitive to the recorded bytes.
        for (const r of rules) {
            expect(r.provenance.validityBasis).toBe('ingestion');
            expect(r.provenance.valid_from).toBe(NOW);
            expect(r.provenance.source.document).toBeNull();
            expect(r.provenance.source.plan_id).toBeNull();
        }
        // And the R1 ladder degrades to the inline-geometry leg: no plan, so no basis ref.
        expect(rules.every((r) => r.applicability.basis.length === 0)).toBe(true);
        expect(rules.every((r) => r.applicability.geometry !== null)).toBe(true);
    });
});

/* ────────────────────────────── §9 the adapter value + sources ─────────────────── */

describe('E7-NO §9 — the §J adapter value and its source rows', () => {
    it('exposes the §J shape', () => {
        expect(noCountryAdapter.country).toBe('NO');
        expect(noCountryAdapter.rules.kind).toBe('structured');
        expect(typeof noCountryAdapter.rules.fetchChain).toBe('function');
        expect(noCountryAdapter.sources()).toBe(NO_ADAPTER_SOURCES);
        expect(noCountryAdapter.precedence).toBe(NO_APPLICABILITY_LADDER);
    });

    it('every endpoint this adapter calls has a registered, probed source row behind it', () => {
        for (const binding of NO_ADAPTER_ENDPOINT_BINDINGS) {
            const row = NO_ADAPTER_SOURCES.find((r) => r.id === binding.sourceId);
            expect(row, `no source row for ${binding.sourceId}`).toBeDefined();
            expect(row!.endpoint).toBe(binding.endpoint);
            expect(row!.probes.length).toBeGreaterThan(0);
        }
    });

    it('the Norge digitalt bulk gate is RECORDED, machine-declared, and not worked around', () => {
        const bulk = NO_ADAPTER_SOURCES.find((r) => r.id === 'no-nap-reguleringsplaner-bulk')!;
        expect(bulk.gate).toMatch(new RegExp(NO_NAP_DOWNLOAD_REQUIRED_ROLE));
        expect(bulk.gate).toMatch(/MACHINE-DECLARED/);
        expect(bulk.licence.colour).toBe('YELLOW');
        // The KEYLESS row is the one the adapter actually calls.
        const wms = NO_ADAPTER_SOURCES.find((r) => r.id === NO_NAP_SOURCE_ID)!;
        expect(wms.gate).toBeNull();
        expect(wms.accessOption).toBe(1);
    });

    it('the coverage census is carried as DATA, including the Oslo gap', () => {
        expect(NO_NAP_COVERAGE_CENSUS_2026_09_01.withData).toHaveLength(5);
        expect(NO_NAP_COVERAGE_CENSUS_2026_09_01.withoutData).toContain('Oslo');
    });

    it('DescribeLayer found 22 real feature types behind 8 advertised _vn1 groups', () => {
        expect(NO_NAP_VN1_FEATURE_TYPES).toHaveLength(22);
        expect(NO_NAP_VN1_FEATURE_TYPES.filter((t) => t.includes('sone'))).toHaveLength(8);
    });
});

/* ────────────────────────────── §10 pure readers ───────────────────────────────── */

describe('E7-NO §10 — the pure readers never guess', () => {
    it('reads the Z-suffixed SOSI date and refuses anything else', () => {
        expect(readNoIsoDate('2023-05-31Z')).toBe('2023-05-31');
        expect(readNoIsoDate('2023-05-31')).toBe('2023-05-31');
        expect(readNoIsoDate('2019-06-20T00:00:00Z')).toBe('2019-06-20');
        expect(readNoIsoDate('31.05.2023')).toBeNull();
        expect(readNoIsoDate('')).toBeNull();
        expect(readNoIsoDate(null)).toBeNull();
    });

    it('recognises the Java-array sentinel and nothing else', () => {
        expect(isNapJavaArraySentinel('[Ljava.lang.Double;@1997c7f1')).toBe(true);
        expect(isNapJavaArraySentinel('[Ljava.lang.String;@ff')).toBe(true);
        expect(isNapJavaArraySentinel('2540')).toBe(false);
        expect(isNapJavaArraySentinel('[Ljava.lang.Double;@')).toBe(false);
        expect(isNapJavaArraySentinel(null)).toBe(false);
    });

    it('classifies feature types off the DECLARED vocabulary and flags anything else', () => {
        const set = buildNoPlanFeatureSet(
            [{ id: 'rpsomething_vn1.fid-1', featureType: 'rpsomething_vn1', properties: {}, geometry: null }],
            1,
            'EPSG:25833',
        );
        expect(set.unknownFeatureTypes).toEqual(['rpsomething']);
    });
});

/* ────────────────────────────── helpers ────────────────────────────────────────── */

function makeZone(overrides: Partial<NoZoneArea>): NoZoneArea {
    return {
        featureType: 'rparealformalomrade',
        level: 1,
        servedVertikalnivaa: '1',
        objekttypenavn: 'RpArealformålOmråde',
        arealplanId: { kommunenummer: '4601', planidentifikasjon: '65800000', landkode: null },
        lokalId: 'test-zone',
        navnerom: null,
        versjonId: null,
        oppdateringsdato: null,
        forsteDigitaliseringsdato: null,
        originalDatavert: 'Bergen kommune',
        kopidato: null,
        raw: { objid: 1 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        crs: 'EPSG:25833',
        arealformaal: '1110',
        reguleringsformaal: null,
        feltbetegnelse: 'BF1',
        eierform: '1',
        beskrivelse: null,
        utnyttingstallRaw: null,
        utnyttingstallMinimumRaw: null,
        utnyttingstypeRaw: undefined,
        uteoppholdsarealRaw: null,
        byggverkbestemmelseRaw: null,
        avkjorselsbestemmelseRaw: null,
        ...overrides,
    };
}
