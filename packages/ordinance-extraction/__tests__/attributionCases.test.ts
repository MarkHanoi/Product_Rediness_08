// The four jurisdictions' REAL cases, resolved through the attribution layer.
//
// These are the regressions. Berlin is the one that proves the whole layer: four
// correct readings of one document, one binding value, and a 2× footprint error if
// the wrong one is taken.

import { describe, it, expect } from 'vitest';
import { resolveParameter } from '../src/attribution/resolve.js';
import { priorityTableFor } from '../src/attribution/tables/index.js';
import {
    dkByggefeltLegalStatus,
    type ByggefeltFlags,
} from '../src/attribution/tables/denmark.js';
import {
    BERLIN_8_30_GRZ,
    MADRID_NZ7_2E_FAR,
    PARIS_HEIGHT,
    dkByggefeltEvidence,
} from './fixtures/attribution.js';

describe('Berlin B-Plan 8-30 — four correct GRZ readings, one binding value', () => {
    const result = resolveParameter(BERLIN_8_30_GRZ, priorityTableFor('de'));

    it('selects 0,4 — the §9 BauGB Festsetzung', () => {
        expect(result.status).toBe('resolved');
        if (result.status !== 'resolved') throw new Error('unreachable');
        expect(result.value).toBe(0.4);
        expect(result.winner.instrument.id).toBe('B-Plan 8-30');
        expect(result.winner.citation.page).toBe(56);
    });

    it('rejects 0,3 as a SUPERSEDED DEPICTION, not as a misread', () => {
        if (result.status !== 'resolved') throw new Error('unreachable');
        const three = result.rejected.find((r) => r.evidence.value === 0.3);
        expect(three).toBeDefined();
        expect(three!.reason).toBe('superseded');
        expect(three!.evidence.instrument.kind).toBe('depiction');
        // The verb is what decides, and it is preserved in the citation.
        expect(three!.evidence.citation.verbatim).toContain('dargestellt');
    });

    it('rejects 0,39 as ILLUSTRATIVE — same instrument, same voice, not a determination', () => {
        if (result.status !== 'resolved') throw new Error('unreachable');
        const computed = result.rejected.find((r) => r.evidence.value === 0.39);
        expect(computed!.reason).toBe('illustrative');
        // This is the row that proves legalStatus belongs on the STATEMENT: it is
        // inside the binding plan and carries kind 'binding-plan'.
        expect(computed!.evidence.instrument.kind).toBe('binding-plan');
        expect(computed!.evidence.citation.verbatim).toContain('rechnerischen');
    });

    it('rejects 0,8 by RANK, not by status — it is binding statute, just not the base', () => {
        if (result.status !== 'resolved') throw new Error('unreachable');
        const overrun = result.rejected.find((r) => r.evidence.value === 0.8);
        expect(overrun!.reason).toBe('outranked');
        expect(overrun!.evidence.legalStatus).toBe('binding');
        expect(overrun!.evidence.instrument.kind).toBe('statute');
        expect(overrun!.evidence.ruleKind).toBe('conditional');
    });

    it('the 2x overstatement and the 25% understatement are BOTH avoided', () => {
        if (result.status !== 'resolved') throw new Error('unreachable');
        expect(result.value).not.toBe(0.8); // would overstate footprint 2x
        expect(result.value).not.toBe(0.3); // would understate it by 25%
    });

    it('every one of the four candidates is accounted for — none silently dropped', () => {
        if (result.status !== 'resolved') throw new Error('unreachable');
        expect(result.rejected).toHaveLength(BERLIN_8_30_GRZ.length - 1);
    });
});

describe('Madrid NZ 7 grado 2º nivel "e" — two rival FARs, correctly left unpicked', () => {
    const result = resolveParameter(MADRID_NZ7_2E_FAR, priorityTableFor('es-md'));

    it('is CONFLICTED, not 0,5 and not 1,0', () => {
        expect(result.status).toBe('conflicted');
        if (result.status !== 'conflicted') throw new Error('unreachable');
        expect(result.reasonCode).toBe('tie-on-authority');
    });

    it('carries NO value key at all — not null, not undefined', () => {
        // `'value' in r` is the sound test. A `value: null` would let a careless
        // `?? 0` fabricate a constraint (L-616).
        expect('value' in result).toBe(false);
    });

    it('keeps BOTH candidates cited, never collapsed', () => {
        if (result.status !== 'conflicted') throw new Error('unreachable');
        const values = result.candidates.map((c) => c.value).sort();
        expect(values).toEqual([0.5, 1]);
        expect(result.candidates.map((c) => c.citation.article).sort()).toEqual([
            '8.7.20',
            '8.7.9',
        ]);
    });

    it('does NOT apply lex specialis — the Compendio has no express derogation clause', () => {
        if (result.status !== 'conflicted') throw new Error('unreachable');
        // Art. 8.7.20 IS the more specific provision. Preferring it would be an
        // unsourced legal opinion, so both survive at equal authority.
        const kinds = new Set(result.candidates.map((c) => c.instrument.kind));
        expect(kinds).toEqual(new Set(['binding-plan']));
    });

    it("the table carries its own honest limit in-band", () => {
        const table = priorityTableFor('es-md');
        expect(table!.note).toContain('NO');
        expect(table!.note).toContain('global precedence order');
    });
});

describe('Denmark byggefelt — the published-metadata state machine', () => {
    const cases: readonly [string, ByggefeltFlags, string][] = [
        ['binding', { bygkunifelt: true, bygvejledende: false }, 'binding'],
        ['advisory', { bygkunifelt: false, bygvejledende: true }, 'illustrative'],
        ['contradictory (T,T)', { bygkunifelt: true, bygvejledende: true }, 'unknown'],
        ['null', { bygkunifelt: null, bygvejledende: null }, 'unknown'],
    ];

    for (const [label, flags, expected] of cases) {
        it(`${label} → ${expected}`, () => {
            const verdict = dkByggefeltLegalStatus(flags);
            expect(verdict.legalStatus).toBe(expected);
            expect(verdict.legalStatusSource).toBe('metadata');
        });
    }

    it('the register declining to classify (F,F) is also unknown — and is NOT the advisory set', () => {
        const neither = dkByggefeltLegalStatus({ bygkunifelt: false, bygvejledende: false });
        const advisory = dkByggefeltLegalStatus({ bygkunifelt: false, bygvejledende: true });
        expect(neither.legalStatus).toBe('unknown');
        expect(advisory.legalStatus).toBe('illustrative');
        // Same shape, different answer — the 10.7% (F,F) bucket is the text-parser
        // target; the 64.7% advisory set must never be text-classified away.
        expect(neither.detail).not.toBe(advisory.detail);
    });

    it('null is NOT false — the two produce different details', () => {
        const nullFlag = dkByggefeltLegalStatus({ bygkunifelt: null, bygvejledende: false });
        const falseFlag = dkByggefeltLegalStatus({ bygkunifelt: false, bygvejledende: false });
        expect(nullFlag.legalStatus).toBe('unknown');
        expect(falseFlag.legalStatus).toBe('unknown');
        expect(nullFlag.detail).toContain('null');
        expect(nullFlag.detail).not.toBe(falseFlag.detail);
    });

    it('resolves end-to-end: binding → resolved, everything else → unknown', () => {
        const table = priorityTableFor('dk');
        for (const [label, flags] of cases) {
            const verdict = dkByggefeltLegalStatus(flags);
            const r = resolveParameter([dkByggefeltEvidence(verdict.legalStatus, label)], table);
            if (verdict.legalStatus === 'binding') {
                expect(r.status).toBe('resolved');
            } else {
                expect(r.status).toBe('unknown');
                expect('value' in r).toBe(false);
            }
        }
    });

    it('an advisory-only parameter is `all-candidates-non-binding`, NOT absent', () => {
        const r = resolveParameter(
            [dkByggefeltEvidence('illustrative', 'bygvejledende=true')],
            priorityTableFor('dk'),
        );
        if (r.status !== 'unknown') throw new Error('unreachable');
        expect(r.reasonCode).toBe('all-candidates-non-binding');
        // The evidence EXISTS. Absence would be `no-candidates`.
        expect(r.rejected).toHaveLength(1);
        expect(r.rejected[0]!.reason).toBe('illustrative');
    });
});

describe('Paris — three plub_* height layers, precedence UNKNOWN', () => {
    it('has no registered priority table, and that is the honest state', () => {
        expect(priorityTableFor('fr')).toBeUndefined();
    });

    it('resolves to conflicted(no-priority-table), never to a default', () => {
        const r = resolveParameter(PARIS_HEIGHT, priorityTableFor('fr'));
        expect(r.status).toBe('conflicted');
        if (r.status !== 'conflicted') throw new Error('unreachable');
        expect(r.reasonCode).toBe('no-priority-table');
        expect('value' in r).toBe(false);
        expect(r.candidates).toHaveLength(3);
    });

    it('does not silently take the max, the min, or the first', () => {
        const r = resolveParameter(PARIS_HEIGHT, priorityTableFor('fr'));
        // Each of these would be a defensible-looking heuristic and each is a guess.
        expect('value' in r).toBe(false);
    });
});
