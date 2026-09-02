// LANE PT-ENVELOPE — the vendored PDM catalogue, the national developability map, the object
// 22/132 derivability gate, and the ATO_ESPECIFICO citation seat — proven at the CHAIN layer
// where it matters (committed ≠ reachable: the chain tests run the same
// `resolvePtZoneIdentityAt` a dispatcher calls, over the RECORDED LIVE bodies the PT-ZONEID
// lane pinned and this lane re-used).
//
// THE THREE NON-NEGOTIABLES UNDER TEST:
//   1. NEVER A NUMBER — the developability upgrade is a STATEMENT + citation; no field it
//      writes carries a numeric allowance, and the base refusal's code/legallyGrounded are
//      untouched by upgrades (only the 22/132 gate REPLACES the card, with a typed
//      `derived-plan` refusal).
//   2. NEVER A GUESS — unknown codigo, unmatched categoria, two witnesses disagreeing, a
//      classe contradiction: all yield NO upgrade (the prior honest refusal returns —
//      the falsification contract in unit form).
//   3. THE GATE NEEDS EVIDENCE — the PU/PP override fires only on served objects containing
//      the point; a transient object layer CAVEATS the card by name instead of silently
//      certifying "no override here".

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';
import {
    PT_ANEXO_I_PO_OBJECTS,
    PT_ANEXO_I_PO_TRUNCATION,
    PT_ATO_TIPO_DOMAIN,
    PT_CONDICIONANTES_CODES,
    PT_DEVELOPABILITY_BY_CODIGO,
    PT_PDM_FIVE_TABLE_SCHEMA,
    PT_PDM_NORM_CITATION,
    PT_PLAN_INTERVENTION_CODES,
    PT_SOIL_CATEGORIES,
    buildPtCrusPointUrl,
    parsePtAtoEspecifico,
    parsePtCrusZone,
    parsePtSrupServCitation,
    ptAnexoPoObjectByCodigo,
    ptAtoCitation,
    ptCrusZoneRefusal,
    ptDevelopabilityForZone,
    ptDevelopabilityRefusal,
    ptPlanInterventionOverride,
    ptSoilCategoryByCodigo,
    ptSoilCategoryByName,
    ptSrupCitationLine,
    resolvePtZoneIdentityAt,
    type PtChainDeps,
    type PtCrusZone,
    type PtFetchDeps,
    type PtPdmObjectEvidence,
} from '../src/countryAdapters/pt/index.js';

const FIXTURES = JSON.parse(
    readFileSync(
        new URL('./fixtures/pt-crus-zoneid/recorded-live-2026-09-02.json', import.meta.url),
        'utf8',
    ),
) as Record<string, unknown>;

function body(key: string): unknown {
    const b = FIXTURES[key];
    if (b === undefined) throw new Error(`fixture key missing: ${key}`);
    return b;
}

function makeFetch(routes: ReadonlyArray<readonly [string, unknown]>): PtFetchDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        for (const [needle, routed] of routes) {
            if (url.includes(needle)) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(routed),
                } as unknown as Response;
            }
        }
        throw new Error(`ptPdmEnvelope.test: unrouted URL — ${url.slice(0, 160)}`);
    }) as typeof fetch;
    return { fetchImpl };
}

/** A verbatim-shaped Évora zone (the recorded live bag, parsed the production way). */
function evoraZone(): PtCrusZone {
    const z = parsePtCrusZone({
        fid: 218933,
        dtcc: '0705',
        municipio: 'ÉVORA',
        classificacao_e_qualificacao: 'Solo Urbano - Espaços habitacionais',
        classe_2021: 'Solo Urbano',
        categoria_2021: 'Espaço Habitacional',
        escala_origem: '10000',
        fonte: 'CRUS',
        autor: 'DGT',
        data_pub_origem: '2025-01-01T00:00:00Z',
        registo_ou_deposito: '04.07.05/PDM/02/2025/162',
        situacao_pdm: 'Vigente',
        codigo: 3,
    });
    if (z === null) throw new Error('evoraZone fixture failed to parse');
    return z;
}

/* ────────────────────────── the vendored catalogue ────────────────────────── */

describe('ptPdmDataModel — the vendored closed catalogue (Aviso n.º 9282/2021 Anexo I)', () => {
    it('is EXACTLY the closed 18 — 8 urbano + 10 rústico, the brief\'s codes verbatim, no duplicates', () => {
        expect(PT_SOIL_CATEGORIES.length).toBe(18);
        const urbano = PT_SOIL_CATEGORIES.filter((c) => c.classe === 'urbano').map((c) => c.codigo);
        const rustico = PT_SOIL_CATEGORIES.filter((c) => c.classe === 'rustico').map((c) => c.codigo);
        expect(urbano).toEqual([2, 3, 4, 5, 151, 152, 6, 7]);
        expect(rustico).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
        expect(new Set(PT_SOIL_CATEGORIES.map((c) => c.codigo)).size).toBe(18);
    });

    it('looks up by codigo and by accent-insensitive EXACT name — and never guesses', () => {
        expect(ptSoilCategoryByCodigo(3)?.designacao).toBe('Espaço Habitacional');
        expect(ptSoilCategoryByCodigo(11)?.designacao).toBe('Espaço Natural e Paisagístico');
        expect(ptSoilCategoryByCodigo(1)).toBeNull(); // served-but-unvendored code
        expect(ptSoilCategoryByName('espaco habitacional')?.codigo).toBe(3); // accents stripped
        expect(ptSoilCategoryByName('Espaço Verde')?.codigo).toBe(7);
        // A disaggregated / pluralised designation is NOT the categoria — exact match only.
        expect(ptSoilCategoryByName('Espaços habitacionais')).toBeNull();
        expect(ptSoilCategoryByName('Espaço Habitacional de moradias')).toBeNull();
    });

    it('vendors the brief\'s 14 Anexo I-PO objects, honours the 41–52+ truncation, and never interpolates', () => {
        expect(PT_ANEXO_I_PO_OBJECTS.map((o) => o.codigo).sort((a, b) => a - b)).toEqual(
            [18, 19, 20, 22, 132, 133, 134, 135, 136, 138, 139, 140, 149, 150],
        );
        expect(ptAnexoPoObjectByCodigo(22)?.designacao).toContain('Plano de Urbanização');
        expect(ptAnexoPoObjectByCodigo(132)?.designacao).toContain('Plano de Pormenor');
        // The truncated range yields null — TRUNCATED-IN-SOURCE, never guessed.
        for (const code of [41, 45, 50, 52]) expect(ptAnexoPoObjectByCodigo(code)).toBeNull();
        expect(PT_ANEXO_I_PO_TRUNCATION.rule).toContain('never guess');
    });

    it('names the condicionantes codes the brief verified (REN 148, RAN 68, monuments 91–97)', () => {
        const codes = PT_CONDICIONANTES_CODES.map((c) => c.codigo);
        expect(codes).toContain(148);
        expect(codes).toContain(68);
        for (const c of [91, 92, 93, 94, 95, 96, 97]) expect(codes).toContain(c);
    });

    it('vendors the five-table schema: identical graphic tables, closed ATO domains, MEDIDA the ONLY numeric field', () => {
        expect(PT_PDM_FIVE_TABLE_SCHEMA.map((t) => t.table)).toEqual([
            'OBJETO_TIPO',
            'OBJETOS_PONTO',
            'OBJETOS_LINHA',
            'OBJETOS_POLIGONO',
            'ATO_ESPECIFICO',
        ]);
        const graphic = PT_PDM_FIVE_TABLE_SCHEMA.filter((t) => t.table.startsWith('OBJETOS_'));
        for (const t of graphic) {
            expect(t.fields.map((f) => f.name)).toEqual([
                'IDENTIFICA', 'ID', 'ESPECIFICA', 'ETIQUETA', 'FONTE_INF', 'DATA_INF', 'GEOM', 'MEDIDA',
            ]);
        }
        // The verified envelope-parameter gap, encoded: across the WHOLE model the only
        // decimal field is MEDIDA (area/length) — no cércea, índice, pisos, afastamento.
        const decimals = PT_PDM_FIVE_TABLE_SCHEMA.flatMap((t) =>
            t.fields.filter((f) => f.type === 'decimal').map((f) => f.name),
        );
        expect([...new Set(decimals)]).toEqual(['MEDIDA']);
        expect(PT_ATO_TIPO_DOMAIN.length).toBe(13);
        expect(PT_ATO_TIPO_DOMAIN).toContain('Aviso');
        expect(PT_ATO_TIPO_DOMAIN).toContain('Dec-Reg');
    });
});

/* ────────────────────────── the developability map ────────────────────────── */

describe('ptDevelopability — the national category → developability map', () => {
    it('is TOTAL over the 18 codes and matches the brief\'s assignment verbatim', () => {
        for (const c of PT_SOIL_CATEGORIES) {
            expect(PT_DEVELOPABILITY_BY_CODIGO[c.codigo]).toBeDefined();
        }
        for (const code of [2, 3, 4, 5, 6]) expect(PT_DEVELOPABILITY_BY_CODIGO[code]).toBe('development-target');
        for (const code of [7, 151, 152]) expect(PT_DEVELOPABILITY_BY_CODIGO[code]).toBe('correct-null');
        for (const code of [13, 14, 16]) expect(PT_DEVELOPABILITY_BY_CODIGO[code]).toBe('limited-edification');
        for (const code of [8, 9, 10, 11, 12, 15, 17]) expect(PT_DEVELOPABILITY_BY_CODIGO[code]).toBe('no-urban-envelope');
        // And nothing beyond the 18 (the map minted no code the catalogue lacks).
        expect(Object.keys(PT_DEVELOPABILITY_BY_CODIGO).length).toBe(18);
    });

    it('joins codigo-first (the measured CRUS join), falls back to the exact name, refuses disagreement', () => {
        // codigo + name agree (the live Évora shape).
        const agreed = ptDevelopabilityForZone({ codigo: 3, categoria2021: 'Espaço Habitacional', classe2021: 'Solo Urbano' });
        expect(agreed?.verdict).toBe('development-target');
        expect(agreed?.category.codigo).toBe(3);
        // codigo null → the name witness alone.
        expect(
            ptDevelopabilityForZone({ codigo: null, categoria2021: 'Espaço Verde', classe2021: 'Solo Urbano' })?.verdict,
        ).toBe('correct-null');
        // codigo unvendored (1) + valid name → the name witness (codigo cannot testify).
        expect(
            ptDevelopabilityForZone({ codigo: 1, categoria2021: 'Espaço Habitacional', classe2021: 'Solo Urbano' })?.verdict,
        ).toBe('development-target');
        // TWO WITNESSES DISAGREE → null, never a pick.
        expect(
            ptDevelopabilityForZone({ codigo: 7, categoria2021: 'Espaço Habitacional', classe2021: 'Solo Urbano' }),
        ).toBeNull();
        // classe contradiction → null (a codigo-3 record served as Solo Rústico is an anomaly).
        expect(
            ptDevelopabilityForZone({ codigo: 3, categoria2021: 'Espaço Habitacional', classe2021: 'Solo Rústico' }),
        ).toBeNull();
        // pre-2015 vocabulary / unknown both → null.
        expect(
            ptDevelopabilityForZone({ codigo: null, categoria2021: 'Urbanizável Programado', classe2021: 'Solo Urbano' }),
        ).toBeNull();
        // the rústico limited trio resolves by name too.
        expect(
            ptDevelopabilityForZone({ codigo: 13, categoria2021: 'Aglomerado Rural', classe2021: 'Solo Rústico' })?.verdict,
        ).toBe('limited-edification');
    });

    it('upgrades the card with the verdict + catalogue citation — code/legallyGrounded/headline UNTOUCHED', () => {
        const zone = evoraZone();
        const base = ptCrusZoneRefusal(zone);
        const up = ptDevelopabilityRefusal(zone, base);
        expect(() => EnvelopeRefusalSchema.parse(up)).not.toThrow();
        expect(up.code).toBe(base.code);
        expect(up.legallyGrounded).toBe(base.legallyGrounded);
        expect(up.headline).toBe(base.headline);
        expect(up.ordinanceRef).toBe(base.ordinanceRef);
        expect(up.detail).toContain('NATIONAL DEVELOPABILITY');
        expect(up.detail).toContain('DEVELOPMENT TARGET');
        expect(up.detail).toContain('código 3');
        expect(up.detail).toContain('Aviso n.º 9282/2021');
        expect(up.knownFacts).toContain('Categoria nacional: código 3 — Espaço Habitacional (Solo Urbano)');
        expect(up.knownFacts.some((f) => f.startsWith('Developability (catálogo nacional): DEVELOPMENT TARGET'))).toBe(true);
        // NEVER A NUMBER: no numeric allowance (value + unit) appears in anything the upgrade
        // WROTE — the delta over the base detail plus the new knownFacts. (The base card's own
        // text already contains "~0 % structured", which is the coverage-rate citation, not an
        // allowance — the base is not this test's subject.)
        const added = [up.detail.slice(base.detail.length), ...up.knownFacts.slice(base.knownFacts.length)];
        for (const field of added) {
            expect(field).not.toMatch(/\d+(?:[.,]\d+)?\s*(?:m\b|m2|m²|%)/);
        }
    });

    it('returns the base refusal UNCHANGED (===) on a catalogue miss — the falsification contract', () => {
        const zone = parsePtCrusZone({
            fid: 1, dtcc: '0705', municipio: 'ÉVORA',
            classificacao_e_qualificacao: 'Solo Urbano - Espaços habitacionais',
            classe_2021: 'Solo Urbano',
            categoria_2021: 'Categoria Desconhecida', // no catalogue entry can settle this
            codigo: 999,
        });
        if (zone === null) throw new Error('fixture parse failed');
        const base = ptCrusZoneRefusal(zone);
        expect(ptDevelopabilityRefusal(zone, base)).toBe(base); // the SAME object, not a copy
    });
});

/* ────────────────────────── the chain, over recorded live bodies ────────────────────────── */

describe('resolvePtZoneIdentityAt — the developability verdict reaches the card at the chain layer', () => {
    it('Évora: DEVELOPMENT TARGET (código 3) + catalogue citation on the no-rule-pack card', async () => {
        const deps = makeFetch([[decodeURIComponent(buildPtCrusPointUrl(38.5667, -7.9)), body('evoraItems')]]);
        const out = await resolvePtZoneIdentityAt(38.5667, -7.9, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(r.code).toBe('no-rule-pack'); // the legal claim is untouched
        expect(r.legallyGrounded).toBe(false);
        expect(r.detail).toContain('NATIONAL DEVELOPABILITY');
        expect(r.detail).toContain('DEVELOPMENT TARGET');
        expect(r.knownFacts).toContain('Categoria nacional: código 3 — Espaço Habitacional (Solo Urbano)');
    });

    it('Porto: the pack-draft coverage line AND the CORRECT NULL verdict (código 7) coexist', async () => {
        const deps = makeFetch([[decodeURIComponent(buildPtCrusPointUrl(41.1579, -8.6291)), body('portoItems')]]);
        const out = await resolvePtZoneIdentityAt(41.1579, -8.6291, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(r.code).toBe('public-open-space');
        expect(r.detail).toContain('PORTO COVERAGE UPDATE');
        expect(r.detail).toContain('NATIONAL DEVELOPABILITY');
        expect(r.detail).toContain('CORRECT NULL');
        expect(r.knownFacts).toContain('Categoria nacional: código 7 — Espaço Verde (Solo Urbano)');
    });

    it('Lisboa: the containment-picked Espaço Verde (código 7) carries CORRECT NULL', async () => {
        const deps = makeFetch([[decodeURIComponent(buildPtCrusPointUrl(38.7223, -9.1393)), body('lisbonItems')]]);
        const out = await resolvePtZoneIdentityAt(38.7223, -9.1393, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.refusal.code).toBe('public-open-space');
        expect(out.value.refusal.detail).toContain('CORRECT NULL');
        expect(out.value.refusal.knownFacts).toContain('Categoria nacional: código 7 — Espaço Verde (Solo Urbano)');
    });
});

/* ────────────────────────── the object 22/132 derivability gate ────────────────────────── */

describe('ptPlanInterventionOverride + the chain gate — a PU/PP overrides the PDM by NAME', () => {
    const evoraDeps = (): PtFetchDeps =>
        makeFetch([[decodeURIComponent(buildPtCrusPointUrl(38.5667, -7.9)), body('evoraItems')]]);
    const objectLayer =
        (outcome: { status: string; value?: readonly PtPdmObjectEvidence[]; reason?: string }) =>
        async () =>
            outcome as never;

    it('the gate pair is exactly 22 (PU) and 132 (PP)', () => {
        expect([...PT_PLAN_INTERVENTION_CODES]).toEqual([22, 132]);
    });

    it('object 132 (synthetic five-table-shaped fixture) → derived-plan refusal naming the PP verbatim', async () => {
        const deps: PtChainDeps = {
            ...evoraDeps(),
            resolvePdmObjectsAt: objectLayer({
                status: 'found',
                value: [
                    {
                        codigo: 132,
                        especifica: 'PP do Centro Histórico de Évora',
                        etiqueta: 'PP3',
                        fonteInf: 'CM Évora',
                        dataInf: '2024-05-01',
                    },
                ],
            }),
        };
        const out = await resolvePtZoneIdentityAt(38.5667, -7.9, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const r = out.value.refusal;
        expect(() => EnvelopeRefusalSchema.parse(r)).not.toThrow();
        expect(r.code).toBe('derived-plan');
        expect(r.legallyGrounded).toBe(true);
        expect(r.headline).toContain('Área de Intervenção de Plano Municipal');
        expect(r.detail).toContain('Plano de Pormenor (PP)');
        expect(r.detail).toContain('PP do Centro Histórico de Évora');
        expect(r.detail).toContain('NOT the governing determination');
        expect(r.ordinanceRef).toContain('Anexo I-PO codes 22/132');
        expect(r.knownFacts.some((f) => f.includes('«PP3»'))).toBe(true);
        // The displaced category verdict does not masquerade as governing on this card.
        expect(r.detail).not.toContain('DEVELOPMENT TARGET');
    });

    it('object 22 → the Plano de Urbanização named', async () => {
        const zone = evoraZone();
        const r = ptPlanInterventionOverride(zone, [{ codigo: 22, especifica: 'PU de Évora Nascente' }]);
        expect(r?.code).toBe('derived-plan');
        expect(r?.detail).toContain('Plano de Urbanização (PU)');
        expect(r?.detail).toContain('PU de Évora Nascente');
    });

    it('objects present but none 22/132 (UOPG código 20) → the developability card stands', async () => {
        const deps: PtChainDeps = {
            ...evoraDeps(),
            resolvePdmObjectsAt: objectLayer({ status: 'found', value: [{ codigo: 20, etiqueta: 'UOPG1' }] }),
        };
        const out = await resolvePtZoneIdentityAt(38.5667, -7.9, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.refusal.code).toBe('no-rule-pack');
        expect(out.value.refusal.detail).toContain('DEVELOPMENT TARGET');
        expect(out.value.refusal.detail).not.toContain('did not answer');
    });

    it('a TRANSIENT object layer caveats the card by name — never silently certifies "no override"', async () => {
        const deps: PtChainDeps = {
            ...evoraDeps(),
            resolvePdmObjectsAt: objectLayer({ status: 'transient', reason: 'upstream-failed: HTTP 502' }),
        };
        const out = await resolvePtZoneIdentityAt(38.5667, -7.9, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.refusal.code).toBe('no-rule-pack'); // never derived-plan without evidence
        expect(out.value.refusal.detail).toContain('plan-intervention layer');
        expect(out.value.refusal.detail).toContain('UNVERIFIED');
        expect(out.value.refusal.detail).toContain('upstream-failed: HTTP 502');
    });

    it('an ABSENT object layer (a served "no object here") changes nothing', async () => {
        const deps: PtChainDeps = {
            ...evoraDeps(),
            resolvePdmObjectsAt: objectLayer({ status: 'absent', reason: 'no-feature: none' }),
        };
        const out = await resolvePtZoneIdentityAt(38.5667, -7.9, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.refusal.code).toBe('no-rule-pack');
        expect(out.value.refusal.detail).not.toContain('plan-intervention layer');
    });

    it('no object layer wired (today\'s production shape) → no gate, no caveat — unchanged behaviour', async () => {
        const out = await resolvePtZoneIdentityAt(38.5667, -7.9, evoraDeps());
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.refusal.code).toBe('no-rule-pack');
        expect(out.value.refusal.detail).not.toContain('plan-intervention layer');
    });
});

/* ────────────────────────── the ATO_ESPECIFICO citation seat ────────────────────────── */

describe('ATO_ESPECIFICO — the typed citation seat (five-table + the measured SRUP flattening)', () => {
    it('parses a conformant row and formats the Diário da República citation', () => {
        const row = parsePtAtoEspecifico({
            IDENTIFICA: 'a3e0…guid',
            SERIE: 'SERIE II',
            TIPO_ATO: 'Aviso',
            NUM_ATO: '23631/2025/2',
            DATA: '2025-09-24',
            NUM_DR: '184',
        });
        expect(row).not.toBeNull();
        expect(row?.tipoAto).toBe('Aviso');
        expect(ptAtoCitation(row!)).toBe(
            'Aviso n.º 23631/2025/2, de 2025-09-24, Diário da República SERIE II n.º 184',
        );
    });

    it('refuses non-conformant rows: missing required fields, out-of-domain TIPO_ATO or SERIE', () => {
        expect(parsePtAtoEspecifico({ IDENTIFICA: 'x', TIPO_ATO: 'Aviso', DATA: '2025-01-01' })).toBeNull(); // no NUM_ATO
        expect(
            parsePtAtoEspecifico({ IDENTIFICA: 'x', TIPO_ATO: 'Edital', NUM_ATO: '1', DATA: '2025-01-01' }),
        ).toBeNull(); // TIPO_ATO outside the CLOSED domain — refused, not coerced
        expect(
            parsePtAtoEspecifico({ IDENTIFICA: 'x', SERIE: 'SERIE III', TIPO_ATO: 'Lei', NUM_ATO: '1', DATA: '2025-01-01' }),
        ).toBeNull();
        // SERIE may be absent (null) — the row still parses.
        expect(
            parsePtAtoEspecifico({ IDENTIFICA: 'x', TIPO_ATO: 'Lei', NUM_ATO: '1', DATA: '2025-01-01' })?.serie,
        ).toBeNull();
    });

    it('parses the MEASURED live SRUP flattening (the Santarém RAN row, recorded 2026-09-02)', () => {
        // Verbatim from srup_ran items at Lezíria do Tejo (transcripts in audit/demo-esfrpt/2026-09-02/).
        const c = parsePtSrupServCitation({
            fid: '20',
            designacao: 'RAN de SANTARÉM',
            servidao: 'RESERVA AGRÍCOLA NACIONAL',
            tipologia: 'RESERVA AGRÍCOLA NACIONAL',
            lei_tipo: 'DL 196/89',
            serv_dr: '184 IIS',
            serv_data: '2025-09-24T00:00:00',
            serv_hiperligacao: 'https://snit-mais.dgterritorio.gov.pt/SNIT/Diplomas/AVISO 23631_2025_2.pdf',
            serv_lei: 'Aviso n.º 23631/2025/2',
            municipio: 'SANTARÉM',
        });
        expect(c).not.toBeNull();
        expect(c?.servLei).toBe('Aviso n.º 23631/2025/2');
        expect(c?.hiperligacao).toContain('snit-mais.dgterritorio.gov.pt');
        expect(ptSrupCitationLine(c!)).toBe(
            'Aviso n.º 23631/2025/2, de 2025-09-24, D.R. 184 IIS, ao abrigo de DL 196/89',
        );
        // No serv_lei → no citation, never fabricated from lei_tipo alone.
        expect(parsePtSrupServCitation({ lei_tipo: 'DL 196/89' })).toBeNull();
    });

    it('the norm citation string anchors every catalogue surface', () => {
        expect(PT_PDM_NORM_CITATION).toContain('Aviso n.º 9282/2021');
        for (const c of PT_ANEXO_I_PO_OBJECTS) expect(c.codigo).toBeGreaterThan(0);
        expect(PT_CONDICIONANTES_CODES.length).toBeGreaterThan(0);
    });
});
