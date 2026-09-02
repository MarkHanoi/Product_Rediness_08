// LANE PORTO-FLIP — the moda da cércea, end to end at the CHAIN layer (committed ≠ reachable):
// the frente-urbana extractor (Art. 3.º l), the extent-weighted mode (Art. 3.º o / ADR-0379),
// and the CARD `resolvePtZoneIdentityAt` produces for the two FUC categorias — value WITH its
// article chain where the fabric is measured, the ADR-0379 refusal NAMING the failed
// precondition where it is not, and NEVER the bare 21 m cap (the silent-substitution trap
// `ptPortoPdmDraft.ts` was born naming; Art. 27.º n.º 2 b) subordinates the cap to the moda).
//
// Zone fixtures: the two Porto FUC property bags recorded LIVE 2026-09-02
// (fixtures/pt-frente-urbana/recorded-live-2026-09-02.json — the label carries the recording
// provenance + full-body sha256s), wrapped in small synthetic containment squares: the geometry
// under test here is the FRONTAGE geometry, not the zone polygon.
//
// Frontage fixtures: synthetic, geometrically explicit (an E–W way ~185 m between
// intersections; buildings as rectangles with known projected extents), because NO Portuguese
// channel serves cércea-comparable heights today — which is itself asserted on the no-dep card.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchFound, fetchTransient, EnvelopeRefusalSchema } from '@pryzm/schemas';
import {
    buildPtCrusPointUrl,
    evaluatePtPortoCercea,
    extractPtFrenteUrbana,
    parsePtCrusZone,
    ptPortoCerceaStatement,
    ptPortoFucTipo,
    PT_PORTO_MODA_CERCEA_RULE,
    PT_PORTO_PDM_CERTIFIED,
    resolvePtZoneIdentityAt,
    type PtChainDeps,
    type PtFetchDeps,
    type PtFrenteUrbanaData,
    type PtFrontageBuilding,
} from '../src/countryAdapters/pt/index.js';
import { evaluateContextAggregate } from '../src/rulepacks/declarative/evaluateContextAggregate.js';

const FIXTURES = JSON.parse(
    readFileSync(
        new URL('./fixtures/pt-frente-urbana/recorded-live-2026-09-02.json', import.meta.url),
        'utf8',
    ),
) as { __label__: string; fuc1Props: Record<string, unknown>; fuc2Props: Record<string, unknown> };

/* ─────────────────────────── frontage fixture (synthetic, explicit) ─────────────────────── */

// Subject sits ~5.6 m NORTH of an E–W way running ~185 m between two intersections.
const SUBJECT = { lat: 41.1493, lon: -8.6109 };
const WAY = {
    sourceId: 'osm:way/999001',
    name: 'Avenida Sintética dos Aliados',
    path: [
        { lat: 41.14925, lon: -8.612 },
        { lat: 41.14925, lon: -8.6098 },
    ],
} as const;

/** A rectangle footprint from lon/lat bounds (open ring — the extractor accepts either). */
function rect(
    sourceId: string,
    lonA: number,
    lonB: number,
    latA: number,
    latB: number,
    corniceHeightM: number | null,
    heightProvenance = corniceHeightM === null
        ? 'osm: no height tag; building:levels is a storey count, not a cércea — arrives null'
        : 'fixture: cércea from mean ground at façade (Art. 3.º g), synthetic survey',
): PtFrontageBuilding {
    return {
        sourceId,
        corniceHeightM,
        heightProvenance,
        ring: [
            { lat: latA, lon: lonA },
            { lat: latA, lon: lonB },
            { lat: latB, lon: lonB },
            { lat: latB, lon: lonA },
        ],
    };
}

// North side (the subject's side): extents ≈ 22.6 m + 15.9 m at 18 m vs ≈ 10.1 m at 12 m.
const B_18A = rect('osm:way/1001', -8.6118, -8.61153, 41.14928, 41.14935, 18);
const B_18B = rect('osm:way/1002', -8.6115, -8.61131, 41.14928, 41.14935, 18);
const B_12 = rect('osm:way/1003', -8.6112, -8.61108, 41.14928, 41.14935, 12);
// South side — a tall long front that MUST NOT vote (a different frente urbana, Art. 3.º l).
const B_SOUTH = rect('osm:way/2001', -8.6119, -8.6100, 41.14910, 41.14917, 25);
// North but ~36–41 m off the way — beyond the 30 m band (the next street back).
const B_FAR = rect('osm:way/2002', -8.6117, -8.6111, 41.14957, 41.14962, 30);

const MEASURED_FRONTAGE: PtFrenteUrbanaData = {
    subject: SUBJECT,
    way: WAY,
    buildings: [B_18A, B_18B, B_12, B_SOUTH, B_FAR],
};

/* ─────────────────────────── zone fixture plumbing (sibling-test idiom) ─────────────────── */

function synthetic(features: unknown[]): unknown {
    return { type: 'FeatureCollection', numberReturned: features.length, features };
}

function squareFeature(lat: number, lon: number, half: number, props: Record<string, unknown>): unknown {
    return {
        type: 'Feature',
        properties: props,
        geometry: {
            type: 'Polygon',
            coordinates: [
                [
                    [lon - half, lat - half],
                    [lon + half, lat - half],
                    [lon + half, lat + half],
                    [lon - half, lat + half],
                    [lon - half, lat - half],
                ],
            ],
        },
    };
}

function makeFetch(routes: ReadonlyArray<readonly [string, unknown]>): PtFetchDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        for (const [needle, routed] of routes) {
            if (url.includes(needle)) {
                return { ok: true, status: 200, text: async () => JSON.stringify(routed) } as unknown as Response;
            }
        }
        throw new Error(`ptPortoModaCercea.test: unrouted URL — ${url.slice(0, 160)}`);
    }) as typeof fetch;
    return { fetchImpl };
}

const FUC1_POINT = { lat: 41.1493, lon: -8.6109 };
const FUC2_POINT = { lat: 41.162, lon: -8.622 };

function fuc1Deps(extra?: Partial<PtChainDeps>): PtChainDeps {
    return {
        ...makeFetch([
            [
                decodeURIComponent(buildPtCrusPointUrl(FUC1_POINT.lat, FUC1_POINT.lon)),
                synthetic([squareFeature(FUC1_POINT.lat, FUC1_POINT.lon, 0.01, FIXTURES.fuc1Props)]),
            ],
        ]),
        ...extra,
    };
}

function fuc2Deps(extra?: Partial<PtChainDeps>): PtChainDeps {
    return {
        ...makeFetch([
            [
                decodeURIComponent(buildPtCrusPointUrl(FUC2_POINT.lat, FUC2_POINT.lon)),
                synthetic([squareFeature(FUC2_POINT.lat, FUC2_POINT.lon, 0.01, FIXTURES.fuc2Props)]),
            ],
        ]),
        ...extra,
    };
}

/* ══════════════════════════════════ the extractor ═══════════════════════════════════════ */

describe('extractPtFrenteUrbana — the member set (Art. 3.º l/o), constructed or honestly refused', () => {
    it('⭐ builds extent-weighted members on the SUBJECT side only, inside the band, with per-member provenance', () => {
        const ex = extractPtFrenteUrbana(MEASURED_FRONTAGE);
        expect(ex.contextSet.status).toBe('available');
        if (ex.contextSet.status !== 'available') return;
        const ids = ex.contextSet.members.map((m) => m.sourceId);
        expect(ids).toEqual(['osm:way/1001', 'osm:way/1002', 'osm:way/1003']); // sorted, no south, no far
        expect(ex.frontingCount).toBe(3);
        expect(ex.unmeasuredCount).toBe(0);
        expect(ex.wayName).toBe('Avenida Sintética dos Aliados');
        expect(ex.wayLengthM).toBeGreaterThan(150);
        const byId = new Map(ex.contextSet.members.map((m) => [m.sourceId, m]));
        expect(byId.get('osm:way/1001')!.value_m).toBe(18);
        expect(byId.get('osm:way/1001')!.extent_m).toBeGreaterThan(18); // ≈22.6 m projected span
        expect(byId.get('osm:way/1003')!.value_m).toBe(12);
        expect(byId.get('osm:way/1003')!.extent_m).toBeLessThan(14); // ≈10.1 m

        // …and the mode over it is the article's: 18 m by EXTENT (≈38.5 m beats ≈10.1 m).
        const moda = evaluateContextAggregate(PT_PORTO_MODA_CERCEA_RULE, ex.contextSet);
        expect(moda.ok).toBe(true);
        if (!moda.ok) return;
        expect(moda.value_m).toBe(18);
        expect(moda.memberCount).toBe(3);
        expect(moda.supportExtent_m).toBeGreaterThan(30);
        expect(moda.supportExtent_m).toBeLessThan(45);
    });

    it('an UNMEASURED fronting building refuses the whole set (unavailable), naming it — never a silent drop', () => {
        const unmeasured = rect('osm:way/3001', -8.6111, -8.61095, 41.14928, 41.14935, null);
        const ex = extractPtFrenteUrbana({
            ...MEASURED_FRONTAGE,
            buildings: [...MEASURED_FRONTAGE.buildings, unmeasured],
        });
        expect(ex.contextSet.status).toBe('unavailable');
        if (ex.contextSet.status !== 'unavailable') return;
        expect(ex.contextSet.why).toContain('1 of 4 fronting building(s)');
        expect(ex.contextSet.why).toContain('osm:way/3001');
        expect(ex.contextSet.why).toContain('could flip the mode');
        expect(ex.unmeasuredCount).toBe(1);
        expect(ex.frontingCount).toBe(4);
        expect(ex.wayName).toBe('Avenida Sintética dos Aliados'); // frontage WAS established
    });

    it('an established frontage with zero built members is EMPTY, not unavailable (§CONTEXT-DATA-HONESTY)', () => {
        const ex = extractPtFrenteUrbana({ ...MEASURED_FRONTAGE, buildings: [B_SOUTH, B_FAR] });
        expect(ex.contextSet.status).toBe('available');
        if (ex.contextSet.status !== 'available') return;
        expect(ex.contextSet.members.length).toBe(0);
        const out = evaluateContextAggregate(PT_PORTO_MODA_CERCEA_RULE, ex.contextSet);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.code).toBe('context-set-empty');
    });

    it('a degenerate way refuses unavailable — a frente urbana needs a real centreline', () => {
        const ex = extractPtFrenteUrbana({
            ...MEASURED_FRONTAGE,
            way: { ...WAY, path: [{ lat: 41.14925, lon: -8.612 }] },
        });
        expect(ex.contextSet.status).toBe('unavailable');
        if (ex.contextSet.status !== 'unavailable') return;
        expect(ex.contextSet.why).toContain('degenerate');
    });

    it('a subject ON the centreline refuses unavailable — the two sides are different frentes urbanas', () => {
        const ex = extractPtFrenteUrbana({
            ...MEASURED_FRONTAGE,
            subject: { lat: 41.14925, lon: -8.6109 },
        });
        expect(ex.contextSet.status).toBe('unavailable');
        if (ex.contextSet.status !== 'unavailable') return;
        expect(ex.contextSet.why).toContain('centreline');
    });

    it('⭐ a POISONED height passes through VERBATIM and the evaluator refuses invalid-member (ADR-0379 §3)', () => {
        // The extractor must not coerce or drop: dropping could flip the mode — that guard
        // lives in the evaluator, and blinding it here is the falsification this arm pins.
        const poisoned = rect('osm:way/4001', -8.6111, -8.61095, 41.14928, 41.14935, Number.NaN);
        const ex = extractPtFrenteUrbana({
            ...MEASURED_FRONTAGE,
            buildings: [...MEASURED_FRONTAGE.buildings, poisoned],
        });
        expect(ex.contextSet.status).toBe('available');
        if (ex.contextSet.status !== 'available') return;
        expect(ex.contextSet.members.some((m) => m.sourceId === 'osm:way/4001')).toBe(true);
        const out = evaluateContextAggregate(PT_PORTO_MODA_CERCEA_RULE, ex.contextSet);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.code).toBe('invalid-member');
        expect(out.detail).toContain('osm:way/4001');
    });
});

/* ══════════════════════════════ the rule + the mapping ══════════════════════════════════ */

describe('PT_PORTO_MODA_CERCEA_RULE + ptPortoFucTipo — the signed rule and the signed mapping', () => {
    it('the rule is the pinned articles as data: extent-weighted mode over urban-frontage cornice heights, façade datum', () => {
        expect(PT_PORTO_MODA_CERCEA_RULE.kind).toBe('context-aggregate');
        expect(PT_PORTO_MODA_CERCEA_RULE.aggregate).toBe('mode');
        expect(PT_PORTO_MODA_CERCEA_RULE.contextSet).toBe('urban-frontage');
        expect(PT_PORTO_MODA_CERCEA_RULE.attribute).toBe('cornice-height');
        expect(PT_PORTO_MODA_CERCEA_RULE.heightDatum.kind).toBe('mean-ground-at-facade');
    });

    it('keys FUC tipo on the RECORDED verbatim legend (tipo II before tipo I — prefix trap), null elsewhere', () => {
        const fuc1 = parsePtCrusZone(FIXTURES.fuc1Props)!;
        const fuc2 = parsePtCrusZone(FIXTURES.fuc2Props)!;
        expect(ptPortoFucTipo(fuc1)).toBe('fuc-i');
        expect(ptPortoFucTipo(fuc2)).toBe('fuc-ii');
        // Not FUC: Porto's Espaço Verde legend (the demo point's zone).
        const verde = parsePtCrusZone({
            ...FIXTURES.fuc1Props,
            classificacao_e_qualificacao:
                'Solo Urbano  – Espaços verdes e Frente atlântica e ribeirinha – Área verde de fruição coletiva',
        })!;
        expect(ptPortoFucTipo(verde)).toBe(null);
        // Not Porto: the same legend under another DTCC claims nothing.
        const elsewhere = parsePtCrusZone({ ...FIXTURES.fuc1Props, dtcc: '0705' })!;
        expect(ptPortoFucTipo(elsewhere)).toBe(null);
    });
});

/* ══════════════════════════════════ the card ════════════════════════════════════════════ */

describe('resolvePtZoneIdentityAt — the FUC cards (§PORTO-SIGN-OFF open; ADR-0379 refusals by name)', () => {
    it('gate precondition: PT_PORTO_PDM_CERTIFIED is open (these cards exist only signed)', () => {
        expect(PT_PORTO_PDM_CERTIFIED).toBe(true);
    });

    it('⭐ FUC tipo I with NO frontage source: the ADR-0379 unavailable refusal BY NAME — never a substituted cap', async () => {
        const out = await resolvePtZoneIdentityAt(FUC1_POINT.lat, FUC1_POINT.lon, fuc1Deps());
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(() => EnvelopeRefusalSchema.parse(r)).not.toThrow();
        expect(r.detail).toContain('CERTIFIED — §PORTO-SIGN-OFF');
        expect(r.detail).toContain('CÉRCEA (FUC tipo I — moda-governed): NOT RESOLVED — context-set-unavailable');
        expect(r.detail).toContain('resolveFrenteUrbanaAt absent');
        expect(r.detail).toContain('Art. 24.º n.º 1 e)');
        expect(r.knownFacts.some((f) => f.includes('Cércea (FUC tipo I): REFUSED — context-set-unavailable'))).toBe(true);
        // THE TRAP (falsification b): no resolved cércea, and never the 21 m cap as a value.
        expect(r.detail).not.toContain('moda da cércea RESOLVED');
        expect(r.detail).not.toMatch(/cércea máxima[^«]*21/iu);
        for (const f of r.knownFacts) expect(f).not.toMatch(/21\s*m/u);
    });

    it('⭐ FUC tipo I with a MEASURED frontage: the moda-derived cércea WITH its full article chain', async () => {
        const deps = fuc1Deps({
            resolveFrenteUrbanaAt: async () => fetchFound(MEASURED_FRONTAGE),
        });
        const out = await resolvePtZoneIdentityAt(FUC1_POINT.lat, FUC1_POINT.lon, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(r.detail).toContain('⭐ CÉRCEA (FUC tipo I — moda-governed): 18 m');
        expect(r.detail).toContain('extent-weighted mode over 3 member(s)');
        expect(r.detail).toContain('Avenida Sintética dos Aliados');
        expect(r.detail).toContain('Art. 24.º n.º 1 e)');
        expect(r.detail).toContain('Art. 3.º o');
        expect(r.detail).toContain('mean ground at the façade alignment');
        expect(r.detail).toContain('frontage-granularity'); // the C58 §1.11 caveat travels
        // knownFacts carries the STATE, never a bare number (the knownFacts contract).
        const fact = r.knownFacts.find((f) => f.startsWith('Cércea (FUC tipo I)'));
        expect(fact).toBeDefined();
        expect(fact).toContain('RESOLVED');
        expect(fact).not.toMatch(/\d+\s*m/u);
    });

    it('FUC tipo II with a MEASURED frontage: largura unmeasured ⇒ governing cap UNRESOLVED; moda stated as the n.º 2 b) comparator only', async () => {
        // Re-anchor the synthetic frontage around the FUC-II point so the geometry stays valid.
        const shift = { lat: FUC2_POINT.lat - SUBJECT.lat, lon: FUC2_POINT.lon - SUBJECT.lon };
        const moved: PtFrenteUrbanaData = {
            subject: FUC2_POINT,
            way: { ...WAY, path: WAY.path.map((p) => ({ lat: p.lat + shift.lat, lon: p.lon + shift.lon })) },
            buildings: MEASURED_FRONTAGE.buildings.map((b) => ({
                ...b,
                ring: b.ring.map((p) => ({ lat: p.lat + shift.lat, lon: p.lon + shift.lon })),
            })),
        };
        const deps2 = fuc2Deps({ resolveFrenteUrbanaAt: async () => fetchFound(moved) });
        const out = await resolvePtZoneIdentityAt(FUC2_POINT.lat, FUC2_POINT.lon, deps2);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(r.detail).toContain('CÉRCEA (FUC tipo II — street-width-governed with moda override)');
        expect(r.detail).toContain('governing cap is UNRESOLVED');
        expect(r.detail).toContain('largura do arruamento is unmeasured');
        expect(r.detail).toContain('Art. 27.º n.º 1 g)');
        expect(r.detail).toContain('NOT by itself the admitted cércea');
        expect(r.detail).toContain('18 m'); // the comparator, labelled as such
        // Wherever the article's 21 m figure appears, its exception clause travels with it.
        if (r.detail.includes('21 m')) {
            expect(r.detail).toContain('exceto quando a moda da cércea for superior');
        }
        const fact = r.knownFacts.find((f) => f.startsWith('Cércea (FUC tipo II)'));
        expect(fact).toBeDefined();
        expect(fact).toContain('UNRESOLVED');
        expect(fact).not.toMatch(/\d+\s*m/u);
    });

    it('a frontage source that does not answer stays an ADR-0379 unavailable refusal naming the failure', async () => {
        const deps = fuc1Deps({
            resolveFrenteUrbanaAt: async () => fetchTransient('upstream-failed: HTTP 502'),
        });
        const out = await resolvePtZoneIdentityAt(FUC1_POINT.lat, FUC1_POINT.lon, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(r.detail).toContain('NOT RESOLVED — context-set-unavailable');
        expect(r.detail).toContain('did not answer (upstream-failed: HTTP 502)');
        expect(r.detail).not.toContain('moda da cércea RESOLVED');
    });

    it('⭐ a POISONED member reaches the card as the invalid-member refusal — refuse, never exclude-and-resolve', async () => {
        const poisoned = rect('osm:way/4001', -8.6111, -8.61095, 41.14928, 41.14935, Number.NaN);
        const deps = fuc1Deps({
            resolveFrenteUrbanaAt: async () =>
                fetchFound({ ...MEASURED_FRONTAGE, buildings: [...MEASURED_FRONTAGE.buildings, poisoned] }),
        });
        const out = await resolvePtZoneIdentityAt(FUC1_POINT.lat, FUC1_POINT.lon, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(r.detail).toContain('NOT RESOLVED — invalid-member');
        expect(r.detail).toContain('osm:way/4001');
        expect(r.detail).not.toContain('⭐ CÉRCEA (FUC tipo I — moda-governed): 18 m');
    });

    it('evaluatePtPortoCercea with a KNOWN largura applies the pinned interplay (the future-width seat)', () => {
        const ex = extractPtFrenteUrbana(MEASURED_FRONTAGE);
        expect(ex.contextSet.status).toBe('available');
        // Perfil 24 m > 21 m ⇒ Art. 27.º n.º 2 b): cap = max(21 m, moda 18 m) = 21 m, cited.
        const wide = ptPortoCerceaStatement(evaluatePtPortoCercea('fuc-ii', ex.contextSet, ex, 24));
        expect(wide.detailLine).toContain('perfil 24 m > 21 m');
        expect(wide.detailLine).toContain('cércea máxima 21 m');
        expect(wide.detailLine).toContain('Art. 27.º n.º 2 b)');
        expect(wide.detailLine).toContain('moda 18 m');
        // Largura 16 m ≤ 21 m ⇒ Art. 27.º n.º 1 g): cap = the street width itself.
        const narrow = ptPortoCerceaStatement(evaluatePtPortoCercea('fuc-ii', ex.contextSet, ex, 16));
        expect(narrow.detailLine).toContain('cércea ≤ largura do arruamento = 16 m');
        expect(narrow.detailLine).toContain('Art. 27.º n.º 1 g)');
        // And with the moda REFUSED but largura KNOWN ≤ 21: n.º 1 g governs ALONE — the n.º 2 b)
        // override only exists above 21 m, so the width resolves without the moda. Above 21 m
        // the same refused moda keeps the cap unresolved (never the bare 21).
        const noModa = evaluatePtPortoCercea('fuc-ii', { status: 'unavailable', why: 'no source (test)' }, null, 16);
        const narrow2 = ptPortoCerceaStatement(noModa);
        expect(narrow2.detailLine).toContain('cércea ≤ largura do arruamento = 16 m');
        expect(narrow2.detailLine).toContain('n.º 2 b) moda override does not arise');
        const wideNoModa = ptPortoCerceaStatement(
            evaluatePtPortoCercea('fuc-ii', { status: 'unavailable', why: 'no source (test)' }, null, 24),
        );
        expect(wideNoModa.detailLine).toContain('NOT RESOLVED — context-set-unavailable');
        expect(wideNoModa.detailLine).not.toMatch(/cércea máxima ?(?:admitida)? ?:? ?\d+ ?m/iu);
    });
});
