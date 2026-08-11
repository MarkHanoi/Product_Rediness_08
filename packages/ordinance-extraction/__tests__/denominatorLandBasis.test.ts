// W5-2 PROBE — "which land is this ratio OVER?" is a distinction the model could not represent.
//
// C63 is RATIFIED: a completion/envelope figure is scored against BUILDABLE land, net of
// cesión / street dedication and of area the ordinance removes from private buildability
// (C63 §3.2 denominator rule, L-656). Yet until this probe there was NO type anywhere in the
// TypeScript source naming a land denominator — only a metadata STRING (`densityScope`) that
// `densityCoherence()` never read.
//
// The consequence is the L-616 defect one level up. `densityCoherence()` asserts the density
// identity FAR ≤ coverage × floors. That identity holds ONLY when FAR and coverage are ratios
// over THE SAME land. Given a FAR measured over gross sector area and a coverage measured over
// the parcel, the arithmetic still "works" and the gate still says `pass` — three mutually
// consistent numbers, all wrong, because nothing in the type system knew which land they were
// ratios of. A healthy aggregate computed over an unmodelled denominator.
//
// These tests assert the CORRECT behaviour: refuse, with a code and a reason. They are RED
// against the pre-fix tree — and the way they are red is the evidence: the assertion failure
// reads `expected 'pass' …`, i.e. the system declared two incomparable ratios coherent.

import { describe, it, expect } from 'vitest';
import { densityCoherence, densityIdentityOverOneLand } from '../src/envelope/coherence.js';
import { type ResolvedParameter } from '../src/envelope/types.js';
import { ratioOverLand, type LandBasis } from '@pryzm/schemas';

/** A minimal, valid `ResolvedParameter`. Only field / value / basis vary per case. */
function param(
    field: ResolvedParameter['field'],
    value: number,
    unit: ResolvedParameter['unit'],
    landBasis?: LandBasis,
): ResolvedParameter {
    return {
        status: 'resolved',
        key: field,
        field,
        value,
        unit,
        ...(landBasis !== undefined ? { landBasis } : {}),
        citation: {
            document: 'PROBE-W5-2',
            page: null,
            section: null,
            sentence: `probe sentence stating ${field} = ${value}`,
        },
        rawText: String(value),
        matcherId: 'probe',
        corroborations: 1,
        confidence: 'pipeline-extracted-unverified',
        fieldProvenance: 'pipeline-extracted',
        domainConfidence: {
            tier: 'pipeline-extracted-unverified',
            score: null,
            validationState: 'not-checked',
        },
        gates: [],
        autoAccepted: true,
        flags: [],
    };
}

describe('W5-2 — the density identity may not be asserted across two land bases', () => {
    it('REFUSES when FAR and coverage are measured over DIFFERENT land', () => {
        // FAR 0,9 over the GROSS sector; coverage 0,5 over the PARCEL; 3 storeys.
        // 0.9 ≤ 0.5 × 3 = 1.5 arithmetically — so the pre-fix gate says `pass`. But a gross-area
        // FAR and a parcel-area coverage are not two facts about one denominator, and "they are
        // consistent" is a statement nobody is entitled to make.
        const r = densityCoherence([
            param('maxFAR', 0.9, 'ratio', 'gross'),
            param('maxCoverage', 0.5, 'ratio', 'parcel'),
            param('maxFloors', 3, 'storeys'),
        ]);

        expect(r.verdict).not.toBe('pass');
        expect(r.denominator?.code).toBe('basis-mismatch');
        // The refusal keeps its reason AND names both bases — a refusal reduced to a generic
        // "not applicable" would be indistinguishable from "a parameter did not resolve".
        expect(r.detail).toMatch(/gross/);
        expect(r.detail).toMatch(/parcel/);
        expect(r.token).toBe('coherence:denominator-refused:basis-mismatch');
    });

    it('REFUSES when the ratio basis is UNKNOWN — unknown is not gross, zero or unbounded', () => {
        // The ordinance stated the ratio but not the land it is measured over. Defaulting that to
        // the parcel (the optimistic reading) is the L-616 over-statement: an UNKNOWN constraint
        // treated as a known one. It must be a typed refusal, never a number.
        const r = densityCoherence([
            param('maxFAR', 0.9, 'ratio', 'unknown'),
            param('maxCoverage', 0.5, 'ratio', 'parcel'),
            param('maxFloors', 3, 'storeys'),
        ]);

        expect(r.verdict).not.toBe('pass');
        expect(r.denominator?.code).toBe('basis-unknown');
    });

    it('REFUSES when the ratio carries NO basis at all (structurally silent)', () => {
        // Absent ≠ unknown-and-stated: before this change the German GRZ matcher emitted no
        // `densityScope` whatsoever, so coverage's denominator was not merely unknown — the
        // producer never even had a place to say it. That silence must not read as agreement.
        const r = densityCoherence([
            param('maxFAR', 0.9, 'ratio', 'parcel'),
            param('maxCoverage', 0.5, 'ratio'),
            param('maxFloors', 3, 'storeys'),
        ]);

        expect(r.verdict).not.toBe('pass');
        expect(r.denominator?.code).toBe('basis-not-declared');
    });

    it('PASSES only when both ratios are over the SAME known land', () => {
        const r = densityCoherence([
            param('maxFAR', 0.9, 'ratio', 'parcel'),
            param('maxCoverage', 0.5, 'ratio', 'parcel'),
            param('maxFloors', 3, 'storeys'),
        ]);
        expect(r.verdict).toBe('pass');
        expect(r.denominator).toBeUndefined();
    });

    it('still FLAGS a genuine identity breach over one known land', () => {
        const r = densityCoherence([
            param('maxFAR', 2.9, 'ratio', 'parcel'),
            param('maxCoverage', 0.4, 'ratio', 'parcel'),
            param('maxFloors', 3, 'storeys'),
        ]);
        expect(r.verdict).toBe('flag');
        expect(r.token).toBe('coherence:flag-density');
    });

    it('names the land it asserted the identity over, even when it passes', () => {
        const r = densityCoherence([
            param('maxFAR', 0.9, 'ratio', 'net-of-cesion'),
            param('maxCoverage', 0.5, 'ratio', 'net-of-cesion'),
            param('maxFloors', 3, 'storeys'),
        ]);
        // A density verdict with no stated denominator is exactly the thing being abolished.
        expect(r.detail).toMatch(/over net-of-cesion land/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE COMPILE-TIME HALF. This file is inside `tsconfig.json`'s `include`, so these
// `@ts-expect-error` directives are checked by `tsc --noEmit`: if the invariance ever
// degrades into structural bivariance the directive becomes UNUSED and the typecheck FAILS.
// A runtime test could never assert this — the whole claim is that the bad call never runs.
// ─────────────────────────────────────────────────────────────────────────────
describe('W5-2 — mixing land bases does not compile', () => {
    it('rejects a gross-land ratio in a parcel-land slot', () => {
        const farOverGross = ratioOverLand(0.9, 'gross');
        const coverageOverParcel = ratioOverLand(0.5, 'parcel');

        // @ts-expect-error the density identity is declared over ONE `B`, and `NoInfer` pins it
        // to the first argument — a coverage over different land cannot occupy the second slot.
        densityIdentityOverOneLand(farOverGross, coverageOverParcel, 3);

        // Over one land it compiles and computes.
        const ok = densityIdentityOverOneLand(farOverGross, ratioOverLand(0.5, 'gross'), 3);
        expect(ok.verdict).toBe('pass');
    });

    it('cannot construct a ratio whose denominator is unknown', () => {
        // @ts-expect-error `ratioOverLand` takes a `KnownLandBasis`. There is no `RatioOverLand`
        // at `'unknown'`, so "we do not know which land" cannot reach the arithmetic at all.
        ratioOverLand(0.9, 'unknown');
        expect(true).toBe(true);
    });
});
