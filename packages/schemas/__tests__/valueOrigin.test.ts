// C75 §1/§2 — the five-value provenance union.
//
// These tests are written against the CONTRACT's numbered rules, not against the
// implementation, so each failure names the clause it broke. The negative cases
// matter more than the positive ones here: C75 exists because a wrong provenance
// is worse than an absent one, so most of what follows asserts that something
// CANNOT be constructed.

import { describe, it, expect } from 'vitest';
import {
    ValueOriginSchema,
    VALUE_ORIGINS,
    DEFAULTED_VALUE_ORIGIN,
    ProvenanceUnknownReasonSchema,
    ValueProvenanceSchema,
    RetrofittedProvenanceSchema,
    unknownProvenance,
    provenancePredatingTheField,
    systemProvenance,
    authoredProvenance,
    regeneratedProvenance,
    hasKnownOrigin,
    mayBePresentedAsAuthored,
    describeProvenance,
    type ValueProvenance,
} from '../src/provenance/ValueOrigin.js';
import { familyOriginProvenance } from '../src/family-registry/registered-family.js';

describe('C75 §1.1 — the five values, and exactly five', () => {
    it('is exactly AUTHORED/OBSERVED/COMPUTED/INFERRED/REGENERATED', () => {
        expect(VALUE_ORIGINS).toEqual([
            'authored', 'observed', 'computed', 'inferred', 'regenerated',
        ]);
    });

    it('§1.2 — does not carry an `unknown` member (unknown is a value with a reason, not a sixth origin)', () => {
        expect(ValueOriginSchema.safeParse('unknown').success).toBe(false);
    });

    it('§1.2 — COMPUTED and INFERRED are both present and distinct (the merge is the whole subject of the contract)', () => {
        expect(ValueOriginSchema.safeParse('computed').success).toBe(true);
        expect(ValueOriginSchema.safeParse('inferred').success).toBe(true);
    });

    it('§2.2 — a defaulted value is INFERRED', () => {
        expect(DEFAULTED_VALUE_ORIGIN).toBe('inferred');
    });
});

describe('C75 §1.4 — UNKNOWN is a value, not a blank', () => {
    it('a null origin without a reason does not parse', () => {
        const r = ValueProvenanceSchema.safeParse({ origin: null });
        expect(r.success).toBe(false);
    });

    it('a null origin WITH a reason parses', () => {
        const r = ValueProvenanceSchema.safeParse(unknownProvenance('not-recorded'));
        expect(r.success).toBe(true);
    });

    it('a stated origin AND an unknownReason is contradictory and does not parse', () => {
        const r = ValueProvenanceSchema.safeParse({
            origin: 'observed', unknownReason: 'not-recorded',
        });
        expect(r.success).toBe(false);
    });

    it('the reason vocabulary distinguishes a loss from an absence', () => {
        expect(ProvenanceUnknownReasonSchema.safeParse('lost-in-transform').success).toBe(true);
        expect(ProvenanceUnknownReasonSchema.safeParse('not-recorded').success).toBe(true);
        // …and a conflict is a positive finding, not a missing input.
        expect(ProvenanceUnknownReasonSchema.safeParse('conflicting-records').success).toBe(true);
    });
});

describe('C75 §2.3 — an inference states its reason', () => {
    it("origin 'inferred' without `detail` does not parse", () => {
        expect(ValueProvenanceSchema.safeParse({ origin: 'inferred' }).success).toBe(false);
    });

    it("origin 'inferred' with `detail` parses", () => {
        const r = ValueProvenanceSchema.safeParse(
            systemProvenance('inferred', 'repaired self-intersecting ring to largest simple ring'),
        );
        expect(r.success).toBe(true);
    });
});

describe('C75 §2.7 — regeneration carries what it replaced', () => {
    it("origin 'regenerated' without `replaced` does not parse", () => {
        expect(ValueProvenanceSchema.safeParse({ origin: 'regenerated', detail: 'x' }).success).toBe(false);
    });

    it('`replaced` on a non-regenerated origin does not parse', () => {
        const r = ValueProvenanceSchema.safeParse({
            origin: 'computed', detail: 'x', replaced: { origin: 'authored' },
        });
        expect(r.success).toBe(false);
    });

    it("a regeneration over an AUTHORED value carries the user's prior origin", () => {
        const prior = authoredProvenance('user placed the front door');
        const next = regeneratedProvenance(prior, 'apartment generator pass 2');
        expect(ValueProvenanceSchema.safeParse(next).success).toBe(true);
        expect(next.replaced?.origin).toBe('authored');
        expect(next.replaced?.detail).toBe('user placed the front door');
    });

    it('a regeneration over an UNKNOWN-origin value reports a null prior, never a known one', () => {
        const next = regeneratedProvenance(unknownProvenance('predates-provenance'), 'pass 2');
        expect(next.replaced?.origin).toBeNull();
    });
});

describe('C75 §2.2 — the system cannot mint AUTHORED', () => {
    it('systemProvenance does not accept `authored` (compile-time; asserted at runtime for the record)', () => {
        // @ts-expect-error — 'authored' is excluded from SystemWritableOrigin by type.
        const forged = systemProvenance('authored', 'a generator claiming a human acted');
        // The type is the guarantee; this line exists only so the @ts-expect-error
        // above is a real assertion rather than an unchecked comment.
        expect(forged.origin).toBe('authored');
    });

    it('authoredProvenance is the single site that mints it', () => {
        expect(authoredProvenance().origin).toBe('authored');
    });
});

describe('C75 §2.5 — backward compatibility: the default is UNKNOWN, never a member of the five', () => {
    it('an absent provenance field defaults to predates-provenance', () => {
        const parsed = RetrofittedProvenanceSchema.parse(undefined);
        expect(parsed.origin).toBeNull();
        expect(parsed.unknownReason).toBe('predates-provenance');
    });

    it('the default is not shared between parses (factory, not a frozen literal)', () => {
        const a = RetrofittedProvenanceSchema.parse(undefined);
        const b = RetrofittedProvenanceSchema.parse(undefined);
        expect(a).not.toBe(b);
    });

    it('a record that DOES carry provenance round-trips unchanged', () => {
        const rec = systemProvenance('observed', 'IFC IfcSpace import');
        expect(RetrofittedProvenanceSchema.parse(rec)).toEqual(rec);
    });

    it('provenancePredatingTheField is the same value the schema default produces', () => {
        expect(provenancePredatingTheField()).toEqual(RetrofittedProvenanceSchema.parse(undefined));
    });
});

describe('C75 §2.6 — a consumer may not widen provenance', () => {
    it('only AUTHORED may be described as the user\'s', () => {
        for (const o of VALUE_ORIGINS) {
            const p: ValueProvenance = o === 'authored'
                ? authoredProvenance()
                : o === 'regenerated'
                    ? regeneratedProvenance(unknownProvenance('not-recorded'), 'pass')
                    : systemProvenance(o, 'detail');
            expect(mayBePresentedAsAuthored(p)).toBe(o === 'authored');
        }
        expect(mayBePresentedAsAuthored(unknownProvenance('not-recorded'))).toBe(false);
    });

    it('hasKnownOrigin narrows past the unknown case', () => {
        expect(hasKnownOrigin(unknownProvenance('not-recorded'))).toBe(false);
        expect(hasKnownOrigin(systemProvenance('computed', 'shoelace area'))).toBe(true);
    });
});

describe('C75 §2.1/§2.5 — RegisteredFamily.originProvenance (the from-pipeline.ts:225 ledger site)', () => {
    it('a family with no recorded provenance answers UNKNOWN-with-reason, never a member of the five', () => {
        // The shape of the 59 hand-authored core seeds: `origin: 'core'` and no
        // `originProvenance`. The point of the test is that this does NOT read as
        // a claim that a human authored it.
        const seedLike = { origin: 'core' } as unknown as Parameters<typeof familyOriginProvenance>[0];
        const p = familyOriginProvenance(seedLike);
        expect(p.origin).toBeNull();
        expect(p.unknownReason).toBe('producer-not-instrumented');
        expect(mayBePresentedAsAuthored(p)).toBe(false);
    });

    it('a family that DOES record provenance answers with it, unchanged', () => {
        const stated = systemProvenance('observed', 'stated by the caller');
        const withProv = { origin: 'user', originProvenance: stated } as unknown as Parameters<typeof familyOriginProvenance>[0];
        expect(familyOriginProvenance(withProv)).toEqual(stated);
    });

    it('the assembler records UNKNOWN when the caller stated no origin, and `observed` when it did', () => {
        // Guards the exact defect C75's ledger names: `opts.origin ?? 'user'`
        // made these two cases indistinguishable.
        const noneStated = familyOriginProvenance(
            { origin: 'user', originProvenance: unknownProvenance('producer-not-instrumented') } as never,
        );
        const stated = familyOriginProvenance(
            { origin: 'user', originProvenance: systemProvenance('observed', 'stated by the caller') } as never,
        );
        expect(noneStated.origin).toBeNull();
        expect(stated.origin).toBe('observed');
        expect(noneStated).not.toEqual(stated);
    });
});

describe('C75 §4.i — an unknown origin never renders as a blank', () => {
    it('describes the unknown WITH its reason', () => {
        expect(describeProvenance(unknownProvenance('predates-provenance')))
            .toBe('origin not known (predates-provenance)');
    });

    it('describes a regeneration including what it replaced', () => {
        const s = describeProvenance(
            regeneratedProvenance(authoredProvenance('user drew it'), 'generator pass 2'),
        );
        expect(s).toContain('regenerated');
        expect(s).toContain('replaced authored');
    });

    it('names an unknown prior explicitly rather than omitting it', () => {
        const s = describeProvenance(
            regeneratedProvenance(unknownProvenance('lost-in-transform'), 'pass 2'),
        );
        expect(s).toContain('replaced a value of unknown origin');
    });
});
