// The six invariants, each with a MUTATION-STYLE TWIN.
//
// WHY THE TWINS EXIST. On 2026-07-31 four separate components in this repo reported
// success while doing nothing: a CI gate that scanned zero files, an audit asserting
// against its own literal, 17 gates wired to no workflow, and a mutation test that
// silently no-op'd on CRLF. A test that cannot demonstrate its own failure mode is
// not evidence.
//
// So every invariant below is proven twice:
//   (a) the invariant HOLDS on the real input;
//   (b) a mutation is applied, THE MUTATION IS ASSERTED TO HAVE LANDED, and only then
//       is detection asserted. Step (b)'s middle assertion is the whole point — it is
//       what a no-op'ing mutation test omits.

import { describe, it, expect } from 'vitest';
import { resolveParameter } from '../src/attribution/resolve.js';
import { priorityTableFor } from '../src/attribution/tables/index.js';
import { MADRID_PRIORITY_TABLE } from '../src/attribution/tables/madrid.js';
import { type InstrumentPriorityTable } from '../src/attribution/priority.js';
import {
    EVIDENCE_CONFIDENCES,
    INSTRUMENT_KINDS,
    LEGAL_STATUSES,
    LEGAL_STATUS_SOURCES,
    RULE_KINDS,
    ATTRIBUTION_UNKNOWN_REASONS,
    evidenceConfidenceRank,
    type ParameterEvidence,
    type Resolution,
} from '../src/attribution/types.js';
import {
    BERLIN_8_30_GRZ,
    MADRID_NZ7_2E_FAR,
    madridCataloguePair,
} from './fixtures/attribution.js';

/** A minimal well-formed candidate the individual invariants vary one field of. */
function evidence(over: Partial<ParameterEvidence<number>> = {}): ParameterEvidence<number> {
    return {
        parameter: 'maxHeight_m',
        value: 10,
        instrument: { id: 'test-instrument', kind: 'binding-plan' },
        legalStatus: 'binding',
        legalStatusSource: 'plan_text',
        ruleKind: 'numeric',
        citation: { document: 'test-doc', verbatim: 'test verbatim' },
        confidence: 'medium',
        ...over,
    };
}

// ───────────────────────────────────────────────────────────────────────────────
// INVARIANT 1 — never pick when candidates tie on authority.
// ───────────────────────────────────────────────────────────────────────────────
describe('INVARIANT 1 — never pick on a tie', () => {
    it('holds: Madrid NZ 7.2.e ties and yields conflicted with no value', () => {
        const r = resolveParameter(MADRID_NZ7_2E_FAR, priorityTableFor('es-md'));
        expect(r.status).toBe('conflicted');
        expect('value' in r).toBe(false);
    });

    it('MUTATION PROOF: breaking the tie flips it to resolved', () => {
        const original = MADRID_NZ7_2E_FAR;
        const mutated: ParameterEvidence<number>[] = original.map((c, i) =>
            i === 0
                ? { ...c, instrument: { ...c.instrument, kind: 'special-plan' as const } }
                : c,
        );

        // ── STEP 1: assert the mutation LANDED. Without this the test could be
        // asserting against an unchanged input and would pass while proving nothing.
        expect(mutated[0]!.instrument.kind).not.toBe(original[0]!.instrument.kind);
        expect(mutated[0]!.instrument.kind).toBe('special-plan');
        expect(mutated[1]!.instrument.kind).toBe(original[1]!.instrument.kind);

        // ── STEP 2: now the outcome must change. This proves the `conflicted` above
        // came from the TIE and not from an unconditional refusal to ever resolve.
        const r = resolveParameter(mutated, priorityTableFor('es-md'));
        expect(r.status).toBe('resolved');
        if (r.status !== 'resolved') throw new Error('unreachable');
        expect(r.value).toBe(1.0);
    });

    it('MUTATION PROOF: a tie on authority with the SAME value is corroboration, not conflict', () => {
        const same: ParameterEvidence<number>[] = MADRID_NZ7_2E_FAR.map((c) => ({
            ...c,
            value: 0.5,
        }));
        // Mutation landed: the two values are now equal where they were 1.0 and 0.5.
        expect(new Set(MADRID_NZ7_2E_FAR.map((c) => c.value)).size).toBe(2);
        expect(new Set(same.map((c) => c.value)).size).toBe(1);

        const r = resolveParameter(same, priorityTableFor('es-md'));
        expect(r.status).toBe('resolved');
    });
});

// ───────────────────────────────────────────────────────────────────────────────
// INVARIANT 2 — resolution must never increase confidence.
// ───────────────────────────────────────────────────────────────────────────────
describe('INVARIANT 2 — resolution never manufactures certainty', () => {
    const allUnknownStatus: ParameterEvidence<number>[] = [
        evidence({ value: 10, legalStatus: 'unknown', confidence: 'high' }),
        evidence({ value: 20, legalStatus: 'unknown', confidence: 'high' }),
        evidence({ value: 30, legalStatus: 'unknown', confidence: 'high' }),
    ];

    it('holds: every candidate unknown-status ⇒ unknown, even at confidence "high"', () => {
        const r = resolveParameter(allUnknownStatus, priorityTableFor('de'));
        expect(r.status).toBe('unknown');
        if (r.status !== 'unknown') throw new Error('unreachable');
        expect(r.reasonCode).toBe('no-candidate-has-established-legal-status');
        expect('value' in r).toBe(false);
    });

    it('MUTATION PROOF: making ONE candidate binding flips it to resolved', () => {
        const mutated = allUnknownStatus.map((c, i) =>
            i === 1 ? { ...c, legalStatus: 'binding' as const } : c,
        );
        // STEP 1 — the mutation landed.
        expect(allUnknownStatus.every((c) => c.legalStatus === 'unknown')).toBe(true);
        expect(mutated.filter((c) => c.legalStatus === 'binding')).toHaveLength(1);

        // STEP 2 — detection.
        const r = resolveParameter(mutated, priorityTableFor('de'));
        expect(r.status).toBe('resolved');
        if (r.status !== 'resolved') throw new Error('unreachable');
        expect(r.value).toBe(20);
    });

    it('a resolution is never MORE confident than its winner, even when a loser is more confident', () => {
        // The winner is deliberately the LEAST confident candidate.
        const lowWinner: ParameterEvidence<number>[] = [
            evidence({
                value: 0.4,
                confidence: 'low',
                instrument: { id: 'B-Plan', kind: 'binding-plan' },
            }),
            evidence({
                value: 0.8,
                confidence: 'high',
                instrument: { id: 'BauNVO §19(4)', kind: 'statute' },
            }),
        ];
        const r = resolveParameter(lowWinner, priorityTableFor('de'));
        if (r.status !== 'resolved') throw new Error('unreachable');
        expect(r.value).toBe(0.4);
        // NOT 'high'. The rejected candidate's confidence must not leak upward, and
        // "two sources agree" must not be arithmetic that raises a tier.
        expect(r.confidence).toBe('low');
        expect(evidenceConfidenceRank(r.confidence)).toBeLessThan(
            evidenceConfidenceRank('high'),
        );
    });

    it('MUTATION PROOF: raising only the WINNER raises the resolution, and only to its own level', () => {
        const base: ParameterEvidence<number>[] = [
            evidence({ value: 0.4, confidence: 'low', instrument: { id: 'A', kind: 'binding-plan' } }),
            evidence({ value: 0.8, confidence: 'high', instrument: { id: 'B', kind: 'statute' } }),
        ];
        const mutated = base.map((c, i) => (i === 0 ? { ...c, confidence: 'medium' as const } : c));
        // STEP 1 — mutation landed.
        expect(base[0]!.confidence).toBe('low');
        expect(mutated[0]!.confidence).toBe('medium');

        // STEP 2 — the resolution tracks the winner exactly: medium, NOT high.
        const r = resolveParameter(mutated, priorityTableFor('de'));
        if (r.status !== 'resolved') throw new Error('unreachable');
        expect(r.confidence).toBe('medium');
    });

    it('the Berlin resolution copies its winner confidence verbatim', () => {
        const r = resolveParameter(BERLIN_8_30_GRZ, priorityTableFor('de'));
        if (r.status !== 'resolved') throw new Error('unreachable');
        expect(r.confidence).toBe(r.winner.confidence);
    });
});

// ───────────────────────────────────────────────────────────────────────────────
// INVARIANT 3 — `unknown` is mandatory in every enum.
// ───────────────────────────────────────────────────────────────────────────────
describe('INVARIANT 3 — every enum carries `unknown`', () => {
    /** The check under test, isolated so the mutation can be run through it. */
    const carriesUnknown = (members: readonly string[]): boolean => members.includes('unknown');

    const enums: readonly [string, readonly string[]][] = [
        ['InstrumentKind', INSTRUMENT_KINDS],
        ['LegalStatus', LEGAL_STATUSES],
        ['RuleKind', RULE_KINDS],
        ['EvidenceConfidence', EVIDENCE_CONFIDENCES],
    ];

    for (const [name, members] of enums) {
        it(`holds: ${name} includes 'unknown'`, () => {
            expect(carriesUnknown(members)).toBe(true);
        });
    }

    it("LegalStatusSource carries 'unresolved' — its own name for the same idea", () => {
        // Not 'unknown' literally, but the mandatory could-not-establish member.
        expect(LEGAL_STATUS_SOURCES).toContain('unresolved');
    });

    it('MUTATION PROOF: removing `unknown` from a copy is DETECTED', () => {
        for (const [name, members] of enums) {
            const mutated = members.filter((m) => m !== 'unknown');
            // STEP 1 — the mutation landed. (If a future rename made 'unknown' absent
            // already, this assertion fails loudly instead of the test passing vacuously.)
            expect(mutated.length, `${name} mutation did not land`).toBe(members.length - 1);
            expect(mutated).not.toContain('unknown');

            // STEP 2 — the check catches it.
            expect(carriesUnknown(mutated), `${name} check failed to detect`).toBe(false);
        }
    });

    it('`discretionary` is a POSITIVE claim and is not the fallback', () => {
        // The France regression: a taxonomy without `unknown` forces every
        // unclassifiable rule into a positive legal claim.
        expect(RULE_KINDS).toContain('discretionary');
        expect(RULE_KINDS).toContain('unknown');
        expect(RULE_KINDS.indexOf('discretionary')).not.toBe(RULE_KINDS.indexOf('unknown'));
    });
});

// ───────────────────────────────────────────────────────────────────────────────
// INVARIANT 4 — superseded / illustrative / absent / errored are FOUR results.
// ───────────────────────────────────────────────────────────────────────────────
describe('INVARIANT 4 — four different non-results stay four', () => {
    const table = priorityTableFor('de');

    /** The discriminating signature of a non-result: its code plus its rejection trail. */
    const signature = (r: Resolution<number>): string => {
        if (r.status !== 'unknown') return `status:${r.status}`;
        return `${r.reasonCode}|${r.rejected.map((x) => x.reason).sort().join(',')}`;
    };

    const superseded = resolveParameter([evidence({ legalStatus: 'superseded' })], table);
    const illustrative = resolveParameter([evidence({ legalStatus: 'illustrative' })], table);
    // Explicit type argument: an empty literal infers `never[]`, which would widen the
    // whole `results` map to `Resolution<unknown>` and defeat the comparison below.
    const absent = resolveParameter<number>([], table);
    // Force the contained-error path with a comparator that throws.
    const errored = resolveParameter(
        [evidence({ value: 1 }), evidence({ value: 2 })],
        table,
        {
            sameValue: () => {
                throw new Error('injected comparator failure');
            },
        },
    );

    const results = { superseded, illustrative, absent, errored };

    it('all four are `unknown`', () => {
        for (const [label, r] of Object.entries(results)) {
            expect(r.status, label).toBe('unknown');
        }
    });

    it('holds: all four signatures are PAIRWISE DISTINCT', () => {
        const sigs = Object.values(results).map(signature);
        expect(new Set(sigs).size).toBe(4);
    });

    it('errored has its OWN reason code — not folded into unestablished-status', () => {
        if (errored.status !== 'unknown') throw new Error('unreachable');
        expect(errored.reasonCode).toBe('internal-error');
        expect(errored.reasonCode).not.toBe('no-candidate-has-established-legal-status');
        expect(ATTRIBUTION_UNKNOWN_REASONS).toContain('internal-error');
    });

    it('MUTATION PROOF: collapsing superseded and illustrative is DETECTED', () => {
        // A plausible-looking "simplification": one non-binding bucket.
        const collapsed = (r: Resolution<number>): string =>
            signature(r).replace(/superseded|illustrative/g, 'non-binding');

        // STEP 1 — the collapse landed: the two signatures were different and now match.
        expect(signature(superseded)).not.toBe(signature(illustrative));
        expect(collapsed(superseded)).toBe(collapsed(illustrative));

        // STEP 2 — the distinctness check fails under the collapse.
        const collapsedSigs = Object.values(results).map(collapsed);
        expect(new Set(collapsedSigs).size).toBe(3);
        expect(new Set(collapsedSigs).size).not.toBe(4);
    });

    it('absent (`no-candidates`) is not the same as "we looked and found only non-binding"', () => {
        if (absent.status !== 'unknown') throw new Error('unreachable');
        if (superseded.status !== 'unknown') throw new Error('unreachable');
        expect(absent.reasonCode).toBe('no-candidates');
        expect(absent.rejected).toHaveLength(0);
        expect(superseded.reasonCode).toBe('all-candidates-non-binding');
        expect(superseded.rejected).toHaveLength(1); // the evidence EXISTS
    });
});

// ───────────────────────────────────────────────────────────────────────────────
// INVARIANT 5 — never synthesise a missing constraint. Unknown ≠ 0 ≠ default.
// ───────────────────────────────────────────────────────────────────────────────
describe('INVARIANT 5 — a missing constraint is never synthesised', () => {
    const onDrawing = [
        evidence({ value: null, ruleKind: 'graphical', legalStatus: 'binding' }),
    ];
    const r = resolveParameter(onDrawing, priorityTableFor('de'));

    it('holds: a binding rule whose value lives on the drawing is `unknown`, not 0', () => {
        expect(r.status).toBe('unknown');
        if (r.status !== 'unknown') throw new Error('unreachable');
        expect(r.reasonCode).toBe('binding-candidate-carries-no-value');
        // The determination EXISTS. That is not the same as "the ordinance is silent".
        expect(r.reason).toContain('EXISTS');
        expect(r.reason).toContain('graphical');
    });

    it('carries no `value` key, so a careless `?? 0` has nothing to fall through', () => {
        expect('value' in r).toBe(false);
    });

    it('MUTATION PROOF: a caller that defaults to 0 fabricates a constraint, and the guard catches it', () => {
        // The naive caller this invariant exists to stop.
        const naive = (res: Resolution<number>): number =>
            (res as { value?: number }).value ?? 0;
        // The correct caller.
        const strict = (res: Resolution<number>): number | 'refused' =>
            res.status === 'resolved' ? res.value : 'refused';

        // STEP 1 — the mutation (the naive default) LANDED: it really did produce a
        // fabricated 0 for a parameter the ordinance does regulate.
        expect(naive(r)).toBe(0);

        // STEP 2 — the guard detects it: the sound reader refuses instead.
        expect(strict(r)).toBe('refused');
        expect('value' in r).toBe(false);
    });

    it('a `prohibited` rule is a POSITIVE answer, not an absence', () => {
        const banned = resolveParameter(
            [evidence({ value: null, ruleKind: 'prohibited', legalStatus: 'binding' })],
            priorityTableFor('de'),
        );
        if (banned.status !== 'unknown') throw new Error('unreachable');
        expect(banned.reasonCode).toBe('binding-candidate-carries-no-value');
        expect(banned.reason).toContain('prohibited');
    });
});

// ───────────────────────────────────────────────────────────────────────────────
// INVARIANT 6 — per-parameter resolution, not per-rule.
// ───────────────────────────────────────────────────────────────────────────────
describe('INVARIANT 6 — the SAME evidence resolves differently per parameter', () => {
    const table = priorityTableFor('es-md')!;

    it('holds: the catalogue WINS `worksRegime` (Art. 8.0.6 names it)', () => {
        const r = resolveParameter(madridCataloguePair('worksRegime'), table);
        expect(r.status).toBe('resolved');
        if (r.status !== 'resolved') throw new Error('unreachable');
        expect(r.winner.instrument.kind).toBe('catalogue-overlay');
    });

    it('holds: the SAME pair is UNRANKABLE on `farRatio` (Art. 8.0.6 does not name it)', () => {
        const r = resolveParameter(madridCataloguePair('farRatio'), table);
        expect(r.status).toBe('conflicted');
        if (r.status !== 'conflicted') throw new Error('unreachable');
        expect(r.reasonCode).toBe('unrankable-instrument-kind');
        expect('value' in r).toBe(false);
    });

    it('and on `maxHeight_m` and `maxCoverage` too — the narrow scope is real', () => {
        for (const p of ['maxHeight_m', 'maxCoverage']) {
            const r = resolveParameter(madridCataloguePair(p), table);
            expect(r.status, p).toBe('conflicted');
        }
    });

    it('MUTATION PROOF: stripping parameterOverrides breaks `worksRegime`', () => {
        const stripped: InstrumentPriorityTable = {
            ...MADRID_PRIORITY_TABLE,
            parameterOverrides: [],
        };

        // STEP 1 — the mutation landed.
        expect(MADRID_PRIORITY_TABLE.parameterOverrides!.length).toBeGreaterThan(0);
        expect(stripped.parameterOverrides).toHaveLength(0);

        // STEP 2 — detection: `worksRegime` stops resolving, proving the earlier
        // `resolved` came from the override and not from the base ranks.
        const before = resolveParameter(madridCataloguePair('worksRegime'), table);
        const after = resolveParameter(madridCataloguePair('worksRegime'), stripped);
        expect(before.status).toBe('resolved');
        expect(after.status).toBe('conflicted');
    });

    it('MUTATION PROOF: an unranked kind is UNRANKABLE, not weakest', () => {
        // If the resolver treated "absent from the map" as "weakest", the Norma Zonal
        // would win `farRatio` outright. It must refuse instead.
        const r = resolveParameter(madridCataloguePair('farRatio'), table);
        expect(r.status).not.toBe('resolved');
        expect('value' in r).toBe(false);

        // And the counterfactual: ADDING a rank makes it resolve, proving the refusal
        // was caused by the absence and not by something else.
        const ranked: InstrumentPriorityTable = {
            ...MADRID_PRIORITY_TABLE,
            rank: { ...MADRID_PRIORITY_TABLE.rank, 'catalogue-overlay': 5 },
        };
        expect(MADRID_PRIORITY_TABLE.rank['catalogue-overlay']).toBeUndefined();
        expect(ranked.rank['catalogue-overlay']).toBe(5);

        const r2 = resolveParameter(madridCataloguePair('farRatio'), ranked);
        expect(r2.status).toBe('resolved');
        if (r2.status !== 'resolved') throw new Error('unreachable');
        // Norma Zonal (rank 1) beats the now-ranked catalogue (rank 5).
        expect(r2.winner.instrument.kind).toBe('binding-plan');
    });
});

// ───────────────────────────────────────────────────────────────────────────────
// The tests' own honesty check.
// ───────────────────────────────────────────────────────────────────────────────
describe('the fixtures are load-bearing', () => {
    it('Berlin really does carry four DISTINCT correctly-read values', () => {
        expect(new Set(BERLIN_8_30_GRZ.map((c) => c.value)).size).toBe(4);
        // …under three different instrument kinds, which is what makes it a test of
        // attribution rather than of arithmetic.
        expect(new Set(BERLIN_8_30_GRZ.map((c) => c.instrument.kind)).size).toBe(3);
    });

    it('Madrid really does carry two candidates identical on every authority axis', () => {
        const [a, b] = MADRID_NZ7_2E_FAR;
        expect(a!.value).not.toBe(b!.value);
        expect(a!.instrument.kind).toBe(b!.instrument.kind);
        expect(a!.legalStatus).toBe(b!.legalStatus);
        expect(a!.legalStatusSource).toBe(b!.legalStatusSource);
        // If any of those diverged, the `conflicted` result would be proving the
        // wrong thing.
    });
});
