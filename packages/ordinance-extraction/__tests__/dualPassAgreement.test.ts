import { describe, expect, it } from 'vitest';
import { dualPassAgreement } from '../src/gates/dualPassAgreement.js';
import { type ExtractionCandidate } from '../src/types.js';

const cand = (over: Partial<ExtractionCandidate>): ExtractionCandidate => ({
    field: 'maxFAR',
    value: 1.6,
    zoneCode: 'OA-2',
    rawText: '1,6',
    pass: 'A',
    ...over,
});

describe('dualPassAgreement', () => {
    it('passes when both passes agree on value and attribution', () => {
        const g = dualPassAgreement(cand({ pass: 'A' }), cand({ pass: 'B' }));
        expect(g.verdict).toBe('pass');
    });

    it('flags a value disagreement', () => {
        const g = dualPassAgreement(cand({ pass: 'A', value: 1.6 }), cand({ pass: 'B', value: 1.66 }));
        expect(g.verdict).toBe('flag');
    });

    it('flags an ATTRIBUTION disagreement (right value, wrong subzone — L-590g §7.3)', () => {
        const g = dualPassAgreement(
            cand({ pass: 'A', zoneCode: 'PAS-1' }),
            cand({ pass: 'B', zoneCode: 'PAS-2' }),
        );
        expect(g.verdict).toBe('flag');
    });

    it('passes when both passes agree it is the same algorithm (null + same rule)', () => {
        const a = cand({ pass: 'A', value: null, rule: 'derived', field: 'maxCoverage' });
        const b = cand({ pass: 'B', value: null, rule: 'derived', field: 'maxCoverage' });
        expect(dualPassAgreement(a, b).verdict).toBe('pass');
    });

    it('flags a number-vs-algorithm disagreement', () => {
        const a = cand({ pass: 'A', value: 0.6, field: 'maxCoverage' });
        const b = cand({ pass: 'B', value: null, rule: 'derived', field: 'maxCoverage' });
        expect(dualPassAgreement(a, b).verdict).toBe('flag');
    });

    it('flags two different rules', () => {
        const a = cand({ pass: 'A', value: null, rule: 'derived', field: 'maxCoverage' });
        const b = cand({ pass: 'B', value: null, rule: 'on-drawing', field: 'maxCoverage' });
        expect(dualPassAgreement(a, b).verdict).toBe('flag');
    });

    it('flags when the passes read different fields', () => {
        expect(
            dualPassAgreement(cand({ field: 'maxFAR' }), cand({ field: 'maxHeight_m' })).verdict,
        ).toBe('flag');
    });
});
