// §PT-DOCTRINE-REACH — `derivePtEnvelope` END TO END, over the twelve steps of
// `docs/04-reference/jurisdictions/pt/PT-ENVELOPE-DERIVATION-DOCTRINE.md` §12.
//
// ⛔ WHY THIS FILE EXISTS. Rounds 2 and 3 shipped the doctrine modules and then the pipeline that
// composes them, and NOTHING imported either — `grep -rn 'derivePtEnvelope'` over the repo returned
// its own definition and nothing else. An unrun pipeline is a claim, not a capability
// (§committed-is-not-reachable). This file runs it.
//
// ⭐ WHAT IT PROVES, and equally what it does NOT. It proves the STEP ORDER, the BLOCKING rule
// (doctrine §0.2 — any `unresolved` parameter refuses instead of producing a number) and the four
// inversions the founder named. It proves NOTHING about coverage: the regulamento index below is a
// SYNTHETIC fixture (see its own block comment for why it is not Porto's real numbers), nothing is
// registered, and NO município has a `PtRegulamentoIndex` in production — the pipeline is complete
// and its FEED is empty. See `docs/04-reference/jurisdictions/pt/PT-DOCTRINE-SCORECARD.md`.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import {
    derivePtEnvelope,
    type PtDeriveInput,
    type PtRegulamentoEntry,
    type PtRegulamentoIndex,
    type PtCrusZone,
    type PtCondicionantesInput,
} from '../src/countryAdapters/pt/index.js';

/* ═════════════════════════════════ the fixture bench ═════════════════════════════════ */

/** A square of side `s` metres, centred on the origin, in scene-XZ. */
function square(s: number): Pt[] {
    const h = s / 2;
    return [
        { x: -h, z: -h },
        { x: h, z: -h },
        { x: h, z: h },
        { x: -h, z: h },
    ];
}

const PORTO_ZONE: PtCrusZone = {
    fid: 4711,
    dtcc: '1312',
    municipio: 'PORTO',
    classificacaoEQualificacao: 'Solo Urbano - Espaços centrais',
    classe2021: 'Solo Urbano',
    categoria2021: 'Espaço Central',
    escalaOrigem: '1:10000',
    fonte: 'DGT CRUS',
    autor: 'CM Porto',
    dataPubOrigem: '2021-07-08T00:00:00Z',
    registoOuDeposito: '01.13.12/PDM/03/2021/93',
    situacaoPdm: 'Vigente',
    codigo: 2,
};

/**
 * ⛔⛔ A SYNTHETIC FIXTURE, DELIBERATELY NOT A TRANSCRIPTION. Every number and every article string
 * below is INVENTED for this bench, and the município is named `MUNICÍPIO DE ENSAIO` so no reader
 * and no future grep can mistake it for a pack. That is the point: PRYZM holds article-pinned Porto
 * values (`ptPortoPdmDraft.ts` §A.0.3), and putting them here would make a bench look like a
 * transcription while §PORTO-SIGN-OFF authorises no envelope-drawing pack (L-449: a test cannot
 * sign a reading). The subject under test is the PIPELINE — its step order, its blocking rule and
 * its inversions — none of which depends on whose numbers ride through it.
 *
 * ⭐ The one deliberately Portuguese detail: `cércea` is transcribed into `H_m` and NEVER `Hf_m`
 * (doctrine §9). Reading it as Hf under-reads the envelope by the whole roof volume.
 */
const EM_ENTRY: PtRegulamentoEntry = {
    etiqueta: 'EH1',
    designacao: 'Espaço habitacional de moradias',
    instrument: {
        instrument: 'PDM do MUNICÍPIO DE ENSAIO — Regulamento (SYNTHETIC FIXTURE, not a real plan)',
        version: 'fixture-v1',
        dateInForce: '2021-07-08',
        article: 'Cap. III (fixture)',
    },
    // The doctrine's own §6 example legend — the `setback` family's measured phrase ("moradia").
    c1Text: 'EH1 — Espaço habitacional de moradias',
    Iu: { value: 1, article: 'Art. 32.º (fixture)' },
    Io_pct: { value: 60, article: 'Art. 25.º (fixture)' },
    H_m: { value: 21, article: 'Art. 27.º (fixture) — cércea 21 m, transcribed into H (doutrina §9)' },
    Hf_m: null,
    Alt_m: null,
    pisos: { value: 6, article: 'Art. 27.º (fixture)' },
    Re_m: { value: 4, article: 'Art. 30.º a) (fixture)' },
    AfLateral_m: { value: 3, article: 'Art. 30.º d) (fixture)' },
    AfTardoz_m: { value: 5, article: 'Art. 30.º d) (fixture)' },
    profundidade_m: null,
    permittedUse: ['residential'],
};

const INDEX: PtRegulamentoIndex = { municipio: 'MUNICÍPIO DE ENSAIO', entries: [EM_ENTRY] };

const CLEAR_CONDICIONANTES: PtCondicionantesInput = {
    ren: 'clear',
    renExclusao: null,
    ran: 'clear',
    ranExclusao: null,
    renSource: 'municipal-planta-condicionantes',
    commercialUse: false,
    apaAuthorisationOnFile: false,
};

const RING = square(40);

function baseInput(over: Partial<PtDeriveInput> = {}): PtDeriveInput {
    return {
        retrievedAt: '2026-09-04T00:00:00Z',
        a1: {
            clientSurveyRing: RING,
            cadastroPredial: { status: 'not-queried' },
            bupi: { status: 'not-queried' },
            isSoloUrbano: true,
        },
        edgeClassifications: ['front', 'side', 'rear', 'side'],
        zone: PORTO_ZONE,
        etiqueta: 'EH1',
        rustico: { inAglomeradoRural: null, forestOrWithin50m: null },
        b5: { pdmObjects: { status: 'absent' }, loteamentoEvidence: false, loteamentoEntry: null },
        regulamento: INDEX,
        proceduralStartDateIso: '2020-03-01',
        datum: { S_m: 84.2, Es_m: 0 },
        condicionantes: CLEAR_CONDICIONANTES,
        art59: null,
        art60: [
            { edge: 'front', opposingFacadeDistance_m: 22, hasHabitableOpenings: true },
            { edge: 'side', opposingFacadeDistance_m: 30, hasHabitableOpenings: false },
            { edge: 'rear', opposingFacadeDistance_m: 40, hasHabitableOpenings: true },
            { edge: 'side', opposingFacadeDistance_m: 30, hasHabitableOpenings: false },
        ],
        use: 'residential',
        slabThickness_m: 0.3,
        floors: null,
        commercialUse: false,
        ...over,
    };
}

/* ═════════════════════════════════ the happy path ═════════════════════════════════ */

describe('derivePtEnvelope — the twelve steps as one function', () => {
    it('DERIVES on a complete input, and every emitted number carries its article (doctrine §0.1)', () => {
        const out = derivePtEnvelope(baseInput());
        expect(out.kind).toBe('derived');
        if (out.kind !== 'derived') return;

        // §0.1 — value + unit + instrument + article on every parameter.
        for (const [key, v] of Object.entries(out.volume.parameters)) {
            expect(v.unit, `${key} carries a unit`).toBeTruthy();
            expect(v.instrument.instrument, `${key} names its instrument`).toBeTruthy();
            expect(v.instrument.article, `${key} names its ARTICLE — a number without an article is not a product`).toBeTruthy();
            expect(['resolved', 'assumed']).toContain(v.confidence);
        }
        // §9 — cércea read as H, so the cap is the roof, not the eaves.
        expect(out.volume.governingHeight).toBe('H');
        expect(out.volume.parameters['H']?.value).toBe(21);
        expect(out.volume.parameters['Hf']).toBeUndefined();
        // §12.6 — the dictionary version is on the identity, derived from the PROCEDURAL start date.
        expect(out.regulatoryIdentity.conceptDictionaryVersion).toBe('DR-5/2019');
        // §12.5 — the ETIQUETA join, not a text similarity.
        expect(out.regulatoryIdentity.joinKind).toBe('etiqueta-join');
        // §12.8 — C1 is ALWAYS inferred; it must be stated as such.
        expect(out.regulatoryIdentity.c1Family).toBe('setback');
        // §12.12 — Ac is emitted disaggregated in the national categories.
        expect(out.yield.byUse).toBeDefined();
        expect(out.yield.iuCeilingM2).toBeCloseTo(1 * 1600, 6);
        // §13 — the output block is whole, and the engine was called.
        expect(out.envelope).toBeTruthy();
        expect(out.pack.crs).toBe('EPSG:3763');
        expect(out.pack.zones).toHaveLength(1);
        expect(out.constraintsApplied.length).toBeGreaterThan(0);
        expect(out.watchFlags.length).toBeGreaterThanOrEqual(6);
    });

    it('§4 — the datum field holds MORE THAN ONE VALUE when an auxiliary S2 is arbitrated', () => {
        const one = derivePtEnvelope(baseInput());
        expect(one.kind === 'derived' && one.volume.facadeDatums.map((d) => d.id)).toEqual(['Hf1']);

        const two = derivePtEnvelope(baseInput({ datum: { S_m: 84.2, Es_m: 0, S2_m: 78.9 } }));
        expect(two.kind).toBe('derived');
        if (two.kind !== 'derived') return;
        expect(two.volume.facadeDatums.map((d) => d.id)).toEqual(['Hf1', 'Hf2']);
        expect(two.volume.facadeDatums[1]?.S_m).toBe(78.9);
        expect(two.constraintsApplied.some((c) => c.code === 'C2-datum-§4')).toBe(true);
    });
});

/* ═══════════════ the blocking rule: every `unresolved` REFUSES, naming its step ═══════════════ */

describe('derivePtEnvelope — doctrine §0.2, an unresolved parameter BLOCKS', () => {
    const refusalAt = (over: Partial<PtDeriveInput>): { step: number; reason: string; grounded: boolean } => {
        const out = derivePtEnvelope(baseInput(over));
        expect(out.kind).toBe('refused');
        if (out.kind !== 'refused') throw new Error('expected a refusal');
        return { step: out.stepReached, reason: out.refusals[0]!.reason, grounded: out.refusals[0]!.legallyGrounded };
    };

    it('step 1 — no geometry and no client input', () => {
        const r = refusalAt({
            a1: { clientSurveyRing: null, cadastroPredial: { status: 'absent' }, bupi: { status: 'not-queried' }, isSoloUrbano: true },
        });
        expect(r.step).toBe(1);
        // A coverage fact about PRYZM's sources, NOT a statement about the land.
        expect(r.grounded).toBe(false);
    });

    it('step 2 — §8 topology: a DOUBLE CLASSIFICATION is reported, never silently resolved', () => {
        const out = derivePtEnvelope(
            baseInput({
                classificationClaims: [
                    { classificacaoEQualificacao: 'Solo Urbano - Espaços centrais', fid: 4711, etiqueta: 'EC1' },
                    { classificacaoEQualificacao: 'Solo Urbano - Espaços verdes', fid: 4712, etiqueta: 'EV2' },
                ],
            }),
        );
        expect(out.kind).toBe('refused');
        if (out.kind !== 'refused') return;
        expect(out.stepReached).toBe(2);
        expect(out.refusal.code).toBe('regime-undetermined');
        // BOTH claimants are named — picking one is the forbidden move.
        expect(out.refusal.knownFacts.join(' ')).toContain('Espaços centrais');
        expect(out.refusal.knownFacts.join(' ')).toContain('Espaços verdes');
        // ⛔ The LAW is unambiguous; the município's FILING is not. That is a data fact.
        expect(out.refusal.legallyGrounded).toBe(false);
    });

    it('step 4 — §7 código 135: an AUGI is its own C1 family and REFUSES', () => {
        const out = derivePtEnvelope(
            baseInput({
                b5: {
                    pdmObjects: { status: 'found', value: [{ codigo: 135, etiqueta: 'AUGI-7', especifica: 'Bairro do Cerco' }] },
                    loteamentoEvidence: false,
                    loteamentoEntry: null,
                },
            }),
        );
        expect(out.kind).toBe('refused');
        if (out.kind !== 'refused') return;
        expect(out.stepReached).toBe(4);
        expect(out.refusal.code).toBe('derived-plan');
        expect(out.refusal.legallyGrounded).toBe(true);
        expect(out.refusal.headline).toContain('AUGI');
    });

    it('step 4 — §7 código 136 (ARU) does NOT refuse, but states the UNDERSTATEMENT direction', () => {
        const out = derivePtEnvelope(
            baseInput({
                b5: {
                    pdmObjects: { status: 'found', value: [{ codigo: 136, etiqueta: 'ARU-CENTRO' }] },
                    loteamentoEvidence: false,
                    loteamentoEntry: null,
                },
            }),
        );
        expect(out.kind).toBe('derived');
        if (out.kind !== 'derived') return;
        const aru = out.assumptions.find((a) => a.includes('ARU'));
        expect(aru).toBeTruthy();
        // ⭐ The direction is stated, and it is the conservative one (L-616 forbids overstating).
        expect(aru).toContain('UNDERSTATE');
        expect(out.constraintsApplied.some((c) => c.code === 'B5-ARU-136')).toBe(true);
    });

    it('step 4 — §7 código 138 (Unidade de Execução) is flagged with NO consequence invented', () => {
        const out = derivePtEnvelope(
            baseInput({
                b5: {
                    pdmObjects: { status: 'found', value: [{ codigo: 138, etiqueta: 'UE-3' }] },
                    loteamentoEvidence: false,
                    loteamentoEntry: null,
                },
            }),
        );
        expect(out.kind).toBe('derived');
        if (out.kind !== 'derived') return;
        expect(out.assumptions.some((a) => a.includes('Unidade de Execução') && a.includes('NO consequence'))).toBe(true);
    });

    it('step 6 — no PROCEDURAL start date ⇒ the concept dictionary is unresolved (§2.6, the silent error)', () => {
        const r = refusalAt({ proceduralStartDateIso: null });
        expect(r.step).toBe(6);
        expect(r.reason).toContain('PROCEDURAL START DATE');
    });

    it('§2.6 — a 2016 procedure is read against DR 9/2009, not DR 5/2019', () => {
        const out = derivePtEnvelope(baseInput({ proceduralStartDateIso: '2016-05-10' }));
        expect(out.kind).toBe('derived');
        if (out.kind !== 'derived') return;
        expect(out.regulatoryIdentity.conceptDictionaryVersion).toBe('DR-9/2009');
    });

    it('step 8 — C1 without a stated basis REFUSES (the wrong family is well-formed nonsense)', () => {
        const r = refusalAt({
            regulamento: { municipio: 'MUNICÍPIO DE ENSAIO', entries: [{ ...EM_ENTRY, c1Text: 'as edificações observam o disposto no presente regulamento' }] },
        });
        expect(r.step).toBe(8);
    });

    it('step 10 — B4 not read: an UNREAD overlay stack is never assumed clear', () => {
        const r = refusalAt({ condicionantes: null });
        expect(r.step).toBe(10);
        expect(r.reason).toContain('condicionantes NOT READ');
    });

    it('step 10 — a REN hit WITHOUT the exclusion layer (código 82) refuses: REN alone gives FALSE REFUSALS', () => {
        const r = refusalAt({ condicionantes: { ...CLEAR_CONDICIONANTES, ren: 'hit', renExclusao: null } });
        expect(r.step).toBe(10);
        expect(r.reason).toContain('82');
    });

    it('step 10 — a REN hit INSIDE a REN exclusion is CLEARED, not vetoed', () => {
        const out = derivePtEnvelope(baseInput({ condicionantes: { ...CLEAR_CONDICIONANTES, ren: 'hit', renExclusao: 'hit' } }));
        expect(out.kind).toBe('derived');
        if (out.kind !== 'derived') return;
        expect(out.constraintsApplied.some((c) => c.code === 'B4-148' && c.effect.startsWith('cleared-by-exclusion'))).toBe(true);
    });

    it('step 10 — the APA licence gate: a COMMERCIAL output on APA-sourced REN with no authorisation refuses', () => {
        const r = refusalAt({
            commercialUse: true,
            condicionantes: { ...CLEAR_CONDICIONANTES, ren: 'clear', renSource: 'apa-sniamb', commercialUse: true },
        });
        expect(r.step).toBe(10);
        expect(r.reason).toContain('APA');
    });

    it('step 10 — the SOURCE actually used for REN is RECORDED on the derivation', () => {
        const out = derivePtEnvelope(baseInput());
        expect(out.kind).toBe('derived');
        if (out.kind !== 'derived') return;
        expect(
            out.constraintsApplied.find((c) => c.code === 'B4-REN-source')?.effect,
        ).toContain('municipal-planta-condicionantes');
    });

    it('step 10 — `Alt` with S unknown REFUSES; it is NEVER collapsed into H (§2.4)', () => {
        const withAlt: PtRegulamentoEntry = { ...EM_ENTRY, Alt_m: { value: 110, article: 'Art. 27.º n.º 3 (fixture)' } };
        const r = refusalAt({
            datum: { S_m: null, Es_m: null },
            regulamento: { municipio: 'MUNICÍPIO DE ENSAIO', entries: [withAlt] },
        });
        expect(r.step).toBe(10);
        expect(r.reason).toContain('ALTITUDE');
    });

    it('step 10 — `Alt` BINDS when it is stricter than H, and says so', () => {
        const withAlt: PtRegulamentoEntry = { ...EM_ENTRY, Alt_m: { value: 95, article: 'Art. 27.º n.º 3 (fixture)' } };
        const out = derivePtEnvelope(baseInput({ regulamento: { municipio: 'MUNICÍPIO DE ENSAIO', entries: [withAlt] } }));
        expect(out.kind).toBe('derived');
        if (out.kind !== 'derived') return;
        // Alt 95 − S 84.2 = 10.8 m above S, stricter than H = 21 m.
        expect(out.volume.governingHeight).toBe('Alt');
        expect(out.volume.topAboveS_m?.value).toBeCloseTo(10.8, 6);
    });

    it('step 10 — art. 60 not measured: assuming no neighbour would OVERSTATE, so it refuses', () => {
        const r = refusalAt({ art60: null });
        expect(r.step).toBe(10);
        expect(r.reason).toContain('art. 60');
    });

    it('step 11 — no Iu: an untrimmed volume OVERSTATES (L-616), so it refuses', () => {
        const r = refusalAt({ regulamento: { municipio: 'MUNICÍPIO DE ENSAIO', entries: [{ ...EM_ENTRY, Iu: null }] } });
        expect(r.step).toBe(11);
    });

    it('step 7 — a token that does not TYPE-CHECK is rejected, never converted', () => {
        // Io = 150 in a PERCENT seat: the signature of a ratio/percent confusion. Rejected, never rescaled.
        const r = refusalAt({ regulamento: { municipio: 'MUNICÍPIO DE ENSAIO', entries: [{ ...EM_ENTRY, Io_pct: { value: 150, article: 'Art. 25.º (fixture)' } }] } });
        expect(r.step).toBe(7);
    });

    it('step 7 — a number WITHOUT an article is refused, whatever its value (§0)', () => {
        const r = refusalAt({ regulamento: { municipio: 'MUNICÍPIO DE ENSAIO', entries: [{ ...EM_ENTRY, Iu: { value: 1, article: '   ' } }] } });
        expect(r.step).toBe(7);
        expect(r.reason).toContain('NO article');
    });

    it('step 3 — solo rústico with the DL 82/2021 art. 61 facts UNKNOWN refuses, never grants', () => {
        const rustic: PtCrusZone = { ...PORTO_ZONE, classe2021: 'Solo Rústico', categoria2021: 'Espaço Florestal', classificacaoEQualificacao: 'Solo Rústico - Espaços florestais', codigo: 9 };
        const r = refusalAt({ zone: rustic, a1: { clientSurveyRing: RING, cadastroPredial: { status: 'not-queried' }, bupi: { status: 'not-queried' }, isSoloUrbano: false } });
        expect(r.step).toBe(3);
    });

    it('step 4 — an alvará de loteamento with its parameters NOT in hand refuses (no national register)', () => {
        const r = refusalAt({ b5: { pdmObjects: { status: 'absent' }, loteamentoEvidence: true, loteamentoEntry: null } });
        expect(r.step).toBe(4);
        expect(r.reason).toContain('loteamento');
    });

    it('step 4 — an UNANSWERED plan-intervention layer refuses: failure is NOT "no override"', () => {
        const r = refusalAt({ b5: { pdmObjects: { status: 'transient', reason: 'timeout' }, loteamentoEvidence: false, loteamentoEntry: null } });
        expect(r.step).toBe(4);
        expect(r.reason).toContain('failure is not');
    });
});
