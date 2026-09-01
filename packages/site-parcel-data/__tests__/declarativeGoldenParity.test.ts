// LANE E1bc — BARCELONA es-08019 GOLDEN PARITY (gate decision §F item 4 ·
// verdict §G item 4 · EUROPE-IMPLEMENTATION-PLAN §E1b).
//
// The pilot's acceptance: the C58 contract DERIVED from the migrated
// declarative document must BYTE-match the live hand-written TS pack
// (`ES_BARCELONA_20A_AILLADA_PACK`) — "byte-compare the resolved parameters
// …; any delta is a finding, not a silent migration. The TS pack stays in
// place until the data pack matches it 100%."
//
// Three guards stacked, most-informative-first:
//   1. the TS pack still equals the baseline CAPTURED BEFORE the migration
//      was authored (the target cannot quietly move under the migration);
//   2. per-zone / per-field comparison — a delta FAILS NAMING zone + field
//      (the falsification arm: corrupt one data value → the exact parameter
//      is named);
//   3. the full byte comparison (JSON.stringify equality) — nothing escapes
//      the field loop (labels, provenance maps, citation strings, key order).
//
// Plus the E1c chain-walk on the real pack (attributed + article-addressed
// paths, sever → names the hop) and the R3 point-in-time arms on real rules.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
    BCN_20A_DECL_INSTRUMENT_CONTEXT,
    ES_BARCELONA_20A_AILLADA_PACK,
    ES_BARCELONA_20A_DECL_DOC,
    deriveC58Contract,
    envelopeSolidHeightCap,
    evaluateZoneParameter,
    walkEvidenceChain,
} from '../src/index.js';

const CTX = BCN_20A_DECL_INSTRUMENT_CONTEXT;
const DOC = ES_BARCELONA_20A_DECL_DOC;
const QUERY = { basis: 'current-set', date: '2026-07-22' } as const;

const baselinePath = fileURLToPath(
    new URL('./fixtures/es-barcelona-20a-golden-baseline.json', import.meta.url),
);

describe('golden parity — derived C58 contract vs the live TS pack', () => {
    it('guard 1: the TS pack still equals the baseline captured BEFORE the migration was authored', () => {
        const baseline = readFileSync(baselinePath, 'utf8').trimEnd();
        expect(JSON.stringify(ES_BARCELONA_20A_AILLADA_PACK, null, 2)).toBe(baseline);
    });

    it('guard 2: per-zone, per-field parity — a delta names the zone and the field', () => {
        const derived = deriveC58Contract(DOC, CTX);
        expect(derived.zones.map((z) => z.code)).toEqual(
            ES_BARCELONA_20A_AILLADA_PACK.zones.map((z) => z.code),
        );
        for (const expected of ES_BARCELONA_20A_AILLADA_PACK.zones) {
            const actual = derived.zones.find((z) => z.code === expected.code);
            expect(actual, `zone ${expected.code} missing from derived pack`).toBeDefined();
            for (const field of [
                'label',
                'permittedUse',
                'maxHeight_m',
                'maxFloors',
                'plotRatioFAR',
                'maxCoverage',
                'setbacks',
                'geometricRule',
                'fieldProvenance',
                'ordinanceRef',
            ] as const) {
                expect(actual![field], `zone ${expected.code} · field ${field}`).toEqual(
                    expected[field],
                );
            }
        }
    });

    it('guard 3: FULL byte parity (JSON.stringify equality, key order included)', () => {
        const derived = deriveC58Contract(DOC, CTX);
        expect(JSON.stringify(derived)).toBe(JSON.stringify(ES_BARCELONA_20A_AILLADA_PACK));
    });
});

describe('E1c chain-walk — "why is max height X?" answers from stored evidence', () => {
    it('POSITIVE (attributed path): 20a/9b maxHeight_m resolves 15.25 through the attribution layer, and the chain walks zone → plan → document → article → rule → verbatim → value', () => {
        const ev = evaluateZoneParameter(DOC, '20a/9b', 'maxHeight_m', QUERY, CTX);
        expect(ev.outcome.kind).toBe('attributed');
        if (ev.outcome.kind !== 'attributed') return;
        expect(ev.outcome.resolution.status).toBe('resolved');
        if (ev.outcome.resolution.status === 'resolved') {
            expect(ev.outcome.resolution.value).toBe(15.25);
            // The winning citation carries the HELD verbatim span (Art. 342.3,
            // printed p. 180) — a human can review it against the committed PDF.
            expect(ev.outcome.resolution.winner.citation.verbatim).toContain(
                "l'alçada màxima serà de 15,25 m.",
            );
            expect(ev.outcome.resolution.winner.citation.article).toBe('Art. 342.3');
        }
        expect(ev.outcome.chain).not.toBeNull();
        const verdict = walkEvidenceChain(ev.outcome.chain!);
        expect(verdict).toEqual({ ok: true, gaps: [] });
        const hops = Object.fromEntries(ev.outcome.chain!.map((h) => [h.hop, h.ref]));
        expect(hops['zone']).toBe('20a/9b');
        expect(hops['plan']).toBe('plan-es-08019-pgm-1976');
        expect(hops['document']).toContain('PGM-NNUU-metropolitana.pdf');
        expect(hops['article']).toBe('Art. 342.3');
        expect(hops['rule']).toBe('rule-es-08019-20a-9b-maxheightm');
        expect(hops['value']).toBe('15.25');
    });

    it('POSITIVE (article-addressed path): 20a/6 setback.front_m resolves 12 with the verbatim gap NAMED — never a fabricated quote', () => {
        const ev = evaluateZoneParameter(DOC, '20a/6', 'setback.front_m', QUERY, CTX);
        expect(ev.outcome.kind).toBe('resolved-unattributed');
        if (ev.outcome.kind !== 'resolved-unattributed') return;
        expect(ev.outcome.value).toBe(12);
        expect(ev.outcome.gap).toBe('no-verbatim-span-curated');
        const verdict = walkEvidenceChain(ev.outcome.chain);
        expect(verdict.ok).toBe(true);
        if (verdict.ok) {
            expect(verdict.gaps.some((g) => g.startsWith('verbatim:'))).toBe(true);
        }
    });

    it('SEVER (basis hop): a dangling plan ref is a HARD refusal naming the ref — the chain cannot silently skip the plan hop', () => {
        const corrupted = structuredClone(DOC);
        const rule = corrupted.packs[0]!.zones.find((z) => z.code === '20a/9b')!
            .rules.find((r) => r.provenance.parameter === 'maxHeight_m')!;
        (rule.applicability.basis[0] as { ref: string }).ref = 'plan-SEVERED';
        const ev = evaluateZoneParameter(corrupted, '20a/9b', 'maxHeight_m', QUERY, CTX);
        expect(ev.outcome.kind).toBe('dangling-basis');
        if (ev.outcome.kind === 'dangling-basis') {
            expect(ev.outcome.dangling[0]!.ref).toBe('plan-SEVERED');
        }
    });

    it('SEVER (article hop): nulling the article makes the chain walk FAIL naming "article"', () => {
        const corrupted = structuredClone(DOC);
        const rule = corrupted.packs[0]!.zones.find((z) => z.code === '20a/9b')!
            .rules.find((r) => r.provenance.parameter === 'maxHeight_m')!;
        (rule.provenance.source as { article: string | null }).article = null;
        const ev = evaluateZoneParameter(corrupted, '20a/9b', 'maxHeight_m', QUERY, CTX);
        expect(ev.outcome.kind).toBe('attributed');
        if (ev.outcome.kind !== 'attributed' || ev.outcome.chain === null) return;
        const verdict = walkEvidenceChain(ev.outcome.chain);
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.missingHop).toBe('article');
    });
});

describe('R3 point-in-time on the REAL pack — the two validity grounds behave as claimed', () => {
    it('legal-as-of 1990: Art. 340.1 FAR (legal since 1976-07-14) answers; the 2004 Arts. 342/343 height is honestly NOT-IN-FORCE', () => {
        const far = evaluateZoneParameter(DOC, '20a/6', 'plotRatioFAR', { basis: 'legal-as-of', date: '1990-06-01' }, CTX);
        expect(far.outcome.kind).toBe('attributed');
        if (far.outcome.kind === 'attributed' && far.outcome.resolution.status === 'resolved') {
            expect(far.outcome.resolution.value).toBe(0.25);
        }
        const height = evaluateZoneParameter(DOC, '20a/6', 'maxHeight_m', { basis: 'legal-as-of', date: '1990-06-01' }, CTX);
        expect(height.outcome.kind).toBe('not-in-force');
    });

    it('legal-as-of 2010: the 2004 instrument answers the height (9.15 — article-addressed: 20a/6 holds no verbatim span)', () => {
        const height = evaluateZoneParameter(DOC, '20a/6', 'maxHeight_m', { basis: 'legal-as-of', date: '2010-01-01' }, CTX);
        expect(height.outcome.kind).toBe('resolved-unattributed');
        if (height.outcome.kind === 'resolved-unattributed') {
            expect(height.outcome.value).toBe(9.15);
        }
    });
});

describe('honest absences stay honest (the §NULLS findings survive migration)', () => {
    it('20a/8 (subzona V): height/floors/FAR are ABSENT-BY-CONSTRUCTION (no rule), and the envelope guard refuses a cap from absence too', () => {
        for (const parameter of ['maxHeight_m', 'maxFloors', 'plotRatioFAR'] as const) {
            const ev = evaluateZoneParameter(DOC, '20a/8', parameter, QUERY, CTX);
            expect(ev.outcome.kind, `20a/8 ${parameter}`).toBe('no-rule');
        }
        const cap = envelopeSolidHeightCap(evaluateZoneParameter(DOC, '20a/8', 'maxHeight_m', QUERY, CTX));
        expect(cap.ok).toBe(false);
        if (!cap.ok) expect(cap.refusal).toBe('no-resolved-height');
    });

    it('20a/9u (subzona VI): FAR is absent (a parcel-area construction), height is a real scalar', () => {
        expect(evaluateZoneParameter(DOC, '20a/9u', 'plotRatioFAR', QUERY, CTX).outcome.kind).toBe('no-rule');
        const h = evaluateZoneParameter(DOC, '20a/9u', 'maxHeight_m', QUERY, CTX);
        expect(h.outcome.kind).toBe('resolved-unattributed');
        if (h.outcome.kind === 'resolved-unattributed') expect(h.outcome.value).toBe(9.15);
    });
});
