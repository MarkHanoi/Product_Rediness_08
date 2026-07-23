import { describe, expect, it } from 'vitest';
import {
    runDocumentExtraction,
    type DocumentExtractionPlan,
} from '../src/pipeline.js';
import {
    type DualPassExtractor,
    type FieldExtractionRequest,
} from '../src/gates/dualPassAgreement.js';
import { type ExtractionCandidate } from '../src/types.js';
import { type OrdinanceDocumentRef } from '../src/enumerator.js';

// A fake dual-pass extractor keyed by cropRef → [passA, passB]. Stands in for the
// injected ai-host-backed adapter; keeps the core test pure/offline.
class FakeExtractor implements DualPassExtractor {
    constructor(private readonly reads: Map<string, [ExtractionCandidate, ExtractionCandidate]>) {}
    async extractPassA(r: FieldExtractionRequest): Promise<ExtractionCandidate> {
        return this.reads.get(r.cropRef)![0];
    }
    async extractPassB(r: FieldExtractionRequest): Promise<ExtractionCandidate> {
        return this.reads.get(r.cropRef)![1];
    }
}

const ref = (over: Partial<OrdinanceDocumentRef> = {}): OrdinanceDocumentRef => ({
    documentId: 'DOC',
    cityId: 'es-ct/08019-barcelona',
    instrument: 'test',
    fetchUrl: 'https://example/DOC',
    supersession: { vigencia: 'VIGENT' },
    textLayer: null,
    imageRegime: null,
    ...over,
});

const c = (o: Partial<ExtractionCandidate> & Pick<ExtractionCandidate, 'field'>): ExtractionCandidate => ({
    value: null,
    zoneCode: 'Z',
    rawText: '',
    pass: 'A',
    ...o,
});

describe('runDocumentExtraction — Stage 0 gating', () => {
    it('extracts NOTHING from a derogated document and returns the cited refusal', async () => {
        const plan: DocumentExtractionPlan = {
            documentRef: ref({ supersession: { expDerogated: true } }),
            locale: 'es',
            extractionModel: 'm@1',
            promptHash: 'h',
            fields: [
                {
                    request: { documentId: 'DOC', page: 1, field: 'maxFAR', cropRef: 'k', ordinanceRef: 'Art. 1' },
                },
            ],
        };
        const res = await runDocumentExtraction(plan, new FakeExtractor(new Map()));
        expect(res.supersession.status).toBe('derogated');
        expect(res.extracted).toHaveLength(0);
    });
});

describe('runDocumentExtraction — clean field auto-accepts at the pipeline tier', () => {
    it('emits pipeline-extracted-unverified with full provenance and autoAccepted', async () => {
        const reads = new Map<string, [ExtractionCandidate, ExtractionCandidate]>([
            ['oa2-far', [
                c({ field: 'maxFAR', value: 1.6, zoneCode: 'OA-2', rawText: '1,6', pass: 'A' }),
                c({ field: 'maxFAR', value: 1.6, zoneCode: 'OA-2', rawText: '1,6', pass: 'B' }),
            ]],
        ]);
        const plan: DocumentExtractionPlan = {
            documentRef: ref({ documentId: 'O_OA1', cityId: 'es-an/14021-cordoba' }),
            locale: 'es',
            extractionModel: 'vision@2026-07',
            promptHash: 'sha256:abc',
            fields: [
                { request: { documentId: 'O_OA1', page: 1, field: 'maxFAR', cropRef: 'oa2-far', ordinanceRef: 'PGOU Art. 13.6' } },
            ],
        };
        const res = await runDocumentExtraction(plan, new FakeExtractor(reads));
        const f = res.extracted[0]!;
        expect(f.value).toBe(1.6);
        expect(f.confidence).toBe('pipeline-extracted-unverified');
        expect(f.fieldProvenance).toBe('pipeline-extracted');
        expect(f.autoAccepted).toBe(true);
        expect(f.provenance.dualPassAgreed).toBe(true);
        expect(f.provenance.humanVerifiedBy).toBeNull();
        expect(f.provenance.supersededCheck).toBe('vigent');
        expect(f.provenance.crossChecks).toContain('dual-pass:pass');
    });
});
