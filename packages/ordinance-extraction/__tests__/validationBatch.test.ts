// CROSS-CITY VALIDATION BATCH (task item 5).
//
// Replays real pilot documents (L-590g) — 2 Barcelona + 3 Córdoba — through the
// shared core with a fake extractor that reproduces the pilot's reads AND injects
// the measured failure modes, then asserts WHICH GATE fires on each. This is the
// proof that the verification gates catch the confident-wrong extraction — the
// catastrophe §CONTEXT-DATA-HONESTY exists to prevent.
//
// Each case documents: [city · doc · field] → the injected condition → the gate
// that MUST fire. See the summary assertions at the bottom.

import { describe, expect, it } from 'vitest';
import {
    runDocumentExtraction,
    type DocumentExtractionPlan,
    type FieldExtractionPlan,
} from '../src/pipeline.js';
import {
    type DualPassExtractor,
    type FieldExtractionRequest,
} from '../src/gates/dualPassAgreement.js';
import { type ExtractionCandidate, type ExtractedField } from '../src/types.js';
import { type OrdinanceDocumentRef } from '../src/enumerator.js';

class FakeExtractor implements DualPassExtractor {
    constructor(private readonly reads: Map<string, [ExtractionCandidate, ExtractionCandidate]>) {}
    async extractPassA(r: FieldExtractionRequest) {
        return this.reads.get(r.cropRef)![0];
    }
    async extractPassB(r: FieldExtractionRequest) {
        return this.reads.get(r.cropRef)![1];
    }
}

const c = (o: Partial<ExtractionCandidate> & Pick<ExtractionCandidate, 'field' | 'pass'>): ExtractionCandidate => ({
    value: null,
    zoneCode: 'Z',
    rawText: '',
    ...o,
});

function docRef(over: Partial<OrdinanceDocumentRef>): OrdinanceDocumentRef {
    return {
        documentId: 'DOC',
        cityId: 'city',
        instrument: 'test',
        fetchUrl: 'https://example/DOC',
        supersession: { vigencia: 'VIGENT' },
        textLayer: null,
        imageRegime: null,
        ...over,
    };
}

/** Which gate(s) flagged a field. */
function flaggedGates(f: ExtractedField): string[] {
    return f.gates.filter((g) => g.verdict === 'flag').map((g) => g.gate);
}

describe('VALIDATION BATCH — the gates fire on the pilot documents', () => {
    it('Córdoba O_OA1 · OA-2 FAR 1,6 — clean, both passes agree → AUTO-ACCEPT', async () => {
        const reads = new Map([
            ['c', [
                c({ field: 'maxFAR', pass: 'A', value: 1.6, zoneCode: 'OA-2', rawText: '1,6' }),
                c({ field: 'maxFAR', pass: 'B', value: 1.6, zoneCode: 'OA-2', rawText: '1,6' }),
            ]] as [string, [ExtractionCandidate, ExtractionCandidate]],
        ]);
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: 'O_OA1', cityId: 'es-an/14021-cordoba' }),
            locale: 'es', extractionModel: 'm', promptHash: 'h',
            fields: [{ request: { documentId: 'O_OA1', page: 1, field: 'maxFAR', cropRef: 'c', ordinanceRef: 'Art. 13.6' } }],
        };
        const f = (await runDocumentExtraction(plan, new FakeExtractor(reads))).extracted[0]!;
        expect(f.autoAccepted).toBe(true);
        expect(flaggedGates(f)).toEqual([]);
    });

    it('Córdoba O_PAS2 · parcela mínima "2.000" read as 2.0 — LOCALE + RANGE gates fire', async () => {
        // Both passes make the SAME anglophone mistake → dual-pass AGREES (wrongly).
        // The locale + range gates are what catch it. This is the case dual-pass misses.
        const reads = new Map([
            ['c', [
                c({ field: 'minParcelArea_m2', pass: 'A', value: 2, zoneCode: 'PAS-1', rawText: '2.000' }),
                c({ field: 'minParcelArea_m2', pass: 'B', value: 2, zoneCode: 'PAS-1', rawText: '2.000' }),
            ]] as [string, [ExtractionCandidate, ExtractionCandidate]],
        ]);
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: 'O_PAS2', cityId: 'es-an/14021-cordoba' }),
            locale: 'es', extractionModel: 'm', promptHash: 'h',
            fields: [{ request: { documentId: 'O_PAS2', page: 1, field: 'minParcelArea_m2', cropRef: 'c', ordinanceRef: 'Art. 13.7' } }],
        };
        const f = (await runDocumentExtraction(plan, new FakeExtractor(reads))).extracted[0]!;
        expect(f.autoAccepted).toBe(false);
        expect(flaggedGates(f)).toEqual(expect.arrayContaining(['locale', 'range']));
        expect(f.provenance.dualPassAgreed).toBe(true); // dual-pass alone would have shipped it
    });

    it('Córdoba O_PAS2 · two-column ATTRIBUTION cross-wire — DUAL-PASS gate fires', async () => {
        // Right value (1,2) attributed to the wrong subzone by one pass (L-590g §4.4 #1).
        const reads = new Map([
            ['c', [
                c({ field: 'maxFAR', pass: 'A', value: 1.2, zoneCode: 'PAS-1', rawText: '1,2' }),
                c({ field: 'maxFAR', pass: 'B', value: 1.2, zoneCode: 'PAS-2', rawText: '1,2' }),
            ]] as [string, [ExtractionCandidate, ExtractionCandidate]],
        ]);
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: 'O_PAS2', cityId: 'es-an/14021-cordoba' }),
            locale: 'es', extractionModel: 'm', promptHash: 'h',
            fields: [{ request: { documentId: 'O_PAS2', page: 1, field: 'maxFAR', cropRef: 'c', ordinanceRef: 'Art. 13.7' } }],
        };
        const f = (await runDocumentExtraction(plan, new FakeExtractor(reads))).extracted[0]!;
        expect(f.autoAccepted).toBe(false);
        expect(flaggedGates(f)).toContain('dual-pass');
    });

    it('Córdoba O_INDUSTRIAL · IND-1 ocupación algorithm — honest null AUTO-ACCEPTS', async () => {
        const reads = new Map([
            ['c', [
                c({ field: 'maxCoverage', pass: 'A', value: null, rule: 'derived', zoneCode: 'IND-1', rawText: 'resultante de la aplicación de los parámetros' }),
                c({ field: 'maxCoverage', pass: 'B', value: null, rule: 'derived', zoneCode: 'IND-1', rawText: 'resultante de la aplicación de los parámetros' }),
            ]] as [string, [ExtractionCandidate, ExtractionCandidate]],
        ]);
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: 'O_INDUSTRIAL', cityId: 'es-an/14021-cordoba' }),
            locale: 'es', extractionModel: 'm', promptHash: 'h',
            fields: [{ request: { documentId: 'O_INDUSTRIAL', page: 1, field: 'maxCoverage', cropRef: 'c', ordinanceRef: 'Art. 13.11.2' } }],
        };
        const f = (await runDocumentExtraction(plan, new FakeExtractor(reads))).extracted[0]!;
        expect(f.value).toBeNull();
        expect(f.rule).toBe('derived');
        expect(f.autoAccepted).toBe(true); // correctly refused to fabricate a number
        expect(f.provenance.crossChecks).toContain('algorithm:pass-derived');
    });

    it('Córdoba O_INDUSTRIAL · a pass FABRICATES a number for the algorithm — DUAL-PASS fires', async () => {
        const reads = new Map([
            ['c', [
                c({ field: 'maxCoverage', pass: 'A', value: null, rule: 'derived', zoneCode: 'IND-1', rawText: 'resultante de aplicar los parámetros' }),
                c({ field: 'maxCoverage', pass: 'B', value: 0.6, zoneCode: 'IND-1', rawText: 'resultante de aplicar los parámetros' }),
            ]] as [string, [ExtractionCandidate, ExtractionCandidate]],
        ]);
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: 'O_INDUSTRIAL', cityId: 'es-an/14021-cordoba' }),
            locale: 'es', extractionModel: 'm', promptHash: 'h',
            fields: [{ request: { documentId: 'O_INDUSTRIAL', page: 1, field: 'maxCoverage', cropRef: 'c', ordinanceRef: 'Art. 13.11.2' } }],
        };
        const f = (await runDocumentExtraction(plan, new FakeExtractor(reads))).extracted[0]!;
        expect(f.autoAccepted).toBe(false);
        expect(flaggedGates(f)).toContain('dual-pass');
    });

    it('Barcelona 73609 · Can Figuerola block H — ARITHMETIC gate fires on the redundant row', async () => {
        // The height field (6 plantas) reads cleanly and both passes agree — but the
        // row's sup.planta×plantas=sup.edificada identity does NOT reconcile (read
        // 1449,81 vs computed 1449,78). Arithmetic catches the table misread.
        const reads = new Map([
            ['c', [
                c({ field: 'maxFloors', pass: 'A', value: 6, zoneCode: 'H', rawText: '6' }),
                c({ field: 'maxFloors', pass: 'B', value: 6, zoneCode: 'H', rawText: '6' }),
            ]] as [string, [ExtractionCandidate, ExtractionCandidate]],
        ]);
        const fp: FieldExtractionPlan = {
            request: { documentId: '73609', page: 7, field: 'maxFloors', cropRef: 'c', ordinanceRef: 'Datos y coeficientes' },
            arithmetic: { operands: [241.63, 6], op: 'product', expected: 1449.81 },
        };
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: '73609', cityId: 'es-ct/08019-barcelona' }),
            locale: 'es', extractionModel: 'm', promptHash: 'h', fields: [fp],
        };
        const f = (await runDocumentExtraction(plan, new FakeExtractor(reads))).extracted[0]!;
        expect(f.autoAccepted).toBe(false);
        expect(flaggedGates(f)).toContain('arithmetic');
    });

    it('Barcelona 89134 · alçada base "segons plànol O 1.2" — algorithm gate keeps it null', async () => {
        const reads = new Map([
            ['c', [
                c({ field: 'maxHeight_m', pass: 'A', value: null, rule: 'on-drawing', zoneCode: 'clau-11', rawText: 'segons plànol O 1.2' }),
                c({ field: 'maxHeight_m', pass: 'B', value: null, rule: 'on-drawing', zoneCode: 'clau-11', rawText: 'segons plànol O 1.2' }),
            ]] as [string, [ExtractionCandidate, ExtractionCandidate]],
        ]);
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: '89134', cityId: 'es-ct/08019-barcelona' }),
            locale: 'es', extractionModel: 'm', promptHash: 'h',
            fields: [{ request: { documentId: '89134', page: 40, field: 'maxHeight_m', cropRef: 'c', ordinanceRef: 'Art. 10.3' } }],
        };
        const f = (await runDocumentExtraction(plan, new FakeExtractor(reads))).extracted[0]!;
        expect(f.value).toBeNull();
        expect(f.rule).toBe('on-drawing');
        expect(f.autoAccepted).toBe(true);
    });

    it('Barcelona 72016 · derogated Congrés Eucarístic — Stage 0 refuses, nothing extracted', async () => {
        const plan: DocumentExtractionPlan = {
            documentRef: docRef({ documentId: '72016', cityId: 'es-ct/08019-barcelona', supersession: { expDerogated: true } }),
            locale: 'es', extractionModel: 'm', promptHash: 'h',
            fields: [{ request: { documentId: '72016', page: 1, field: 'maxHeight_m', cropRef: 'x', ordinanceRef: 'memoria' } }],
        };
        const res = await runDocumentExtraction(plan, new FakeExtractor(new Map()));
        expect(res.supersession.shouldExtract).toBe(false);
        expect(res.extracted).toHaveLength(0);
    });
});
