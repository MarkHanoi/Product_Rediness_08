// ADR-0270 / §L-451 — GeometricRule union.
//
// These tests target the ways this schema could FAIL SILENTLY, because every failure mode here
// produces a well-formed-looking compliance number that is wrong:
//   • a legacy pack silently not parsing (or parsing as the wrong kind)
//   • `sideTreatment:'setback'` with no side_m solving as a party wall — the OPPOSITE of intent
//   • fabricated setbacks leaking out for a non-setback zone

import { describe, it, expect } from 'vitest';
import {
    GeometricRuleSchema,
    GeometricRuleCompatSchema,
    displaySetbacks,
    requiresBlockRing,
    type GeometricRule,
} from '../src/site/GeometricRule';

describe('ADR-0270 §A1a — setback rule (today\'s behaviour, unchanged)', () => {
    it('parses the Seixal UH2 case (the founder\'s Portuguese reference)', () => {
        const r = GeometricRuleSchema.parse({
            kind: 'setback', front_m: 6, side_m: 3, rear_m: 5,
        });
        expect(r.kind).toBe('setback');
        if (r.kind === 'setback') expect(r.front_m).toBe(6);
    });

    it('rejects negative distances', () => {
        expect(() => GeometricRuleSchema.parse({
            kind: 'setback', front_m: -1, side_m: 3, rear_m: 5,
        })).toThrow();
    });
});

describe('ADR-0270 §A1a — alignment rule (the case setback CANNOT express)', () => {
    const ensanche = {
        kind: 'alignment' as const,
        alignTo: 'street' as const,
        buildableDepth_m: 12,
        sideTreatment: 'party-wall' as const,
    };

    it('parses a Spanish ensanche zone and defaults the alignment offset to 0', () => {
        const r = GeometricRuleSchema.parse(ensanche);
        expect(r.kind).toBe('alignment');
        if (r.kind === 'alignment') {
            expect(r.buildableDepth_m).toBe(12);
            // 0 = build ON the line, which is what alineación a vial means.
            expect(r.alignmentOffset_m).toBe(0);
        }
    });

    it('REJECTS zero buildable depth — that is a transcription error, not a rule', () => {
        // Accepting it would yield an empty envelope reading as "nothing may be built here"
        // rather than "this rule pack is wrong".
        expect(() => GeometricRuleSchema.parse({ ...ensanche, buildableDepth_m: 0 })).toThrow();
    });

    it('REQUIRES side_m when sideTreatment is "setback" — else it would silently become a party wall', () => {
        // The critical refinement. Missing side_m would solve as build-to-boundary, the exact
        // opposite of what the pack author wrote, and nothing downstream could detect it.
        expect(() => GeometricRuleSchema.parse({
            ...ensanche, sideTreatment: 'setback',
        })).toThrow(/side_m is REQUIRED/);

        expect(() => GeometricRuleSchema.parse({
            ...ensanche, sideTreatment: 'setback', side_m: 3,
        })).not.toThrow();
    });

    it('does not require side_m for a party wall (zero by definition)', () => {
        expect(() => GeometricRuleSchema.parse(ensanche)).not.toThrow();
    });
});

describe('ADR-0270 §A1a — explicit-area rule', () => {
    it('carries a ring REFERENCE, never inline geometry', () => {
        const r = GeometricRuleSchema.parse({ kind: 'explicit-area', ringRef: 'madrid/fondo/28079-A12' });
        expect(r.kind).toBe('explicit-area');
    });

    it('rejects an empty ringRef', () => {
        expect(() => GeometricRuleSchema.parse({ kind: 'explicit-area', ringRef: '' })).toThrow();
    });
});

describe('ADR-0270 §A1a — BACK-COMPAT: no shipped rule pack may break', () => {
    it('stamps kind:"setback" on a legacy pack that has no kind', () => {
        // Every pre-ADR-0270 pack is implicitly a setback rule — that was the only shape the
        // model could express — so this is the identity, not a guess.
        const r = GeometricRuleCompatSchema.parse({ front_m: 6, side_m: 3, rear_m: 5 }) as GeometricRule;
        expect(r.kind).toBe('setback');
        if (r.kind === 'setback') {
            expect(r.front_m).toBe(6);
            expect(r.rear_m).toBe(5);
        }
    });

    it('leaves an explicit kind untouched — new packs are not rewritten', () => {
        const r = GeometricRuleCompatSchema.parse({
            kind: 'alignment', alignTo: 'street', buildableDepth_m: 12, sideTreatment: 'party-wall',
        }) as GeometricRule;
        expect(r.kind).toBe('alignment');
    });

    it('does NOT mislabel an unrecognised shape as a setback — it fails loudly', () => {
        // The dangerous compat bug: blanket-stamping 'setback' onto anything without a kind
        // would turn a malformed pack into a silently-wrong setback rule.
        expect(() => GeometricRuleCompatSchema.parse({ foo: 1 })).toThrow();
        expect(() => GeometricRuleCompatSchema.parse({ front_m: 6 })).toThrow();
    });

    it('round-trips: parsed legacy output re-parses through the strict schema', () => {
        const once = GeometricRuleCompatSchema.parse({ front_m: 4, side_m: 2, rear_m: 3 });
        expect(() => GeometricRuleSchema.parse(once)).not.toThrow();
    });
});

describe('ADR-0270 §A1a — displaySetbacks NEVER fabricates (C58 §1.7 option A)', () => {
    it('returns the real triple for a setback zone', () => {
        expect(displaySetbacks({ kind: 'setback', front_m: 6, side_m: 3, rear_m: 5 }))
            .toEqual({ front_m: 6, side_m: 3, rear_m: 5 });
    });

    it('returns NULL for alignment and explicit-area — never an invented triple', () => {
        // ADR-0270 rejected "equivalent effective setbacks" as lossy by construction AND
        // invisible. null is the honest answer; a fabricated triple would look well-formed and
        // be undetectably wrong downstream.
        expect(displaySetbacks({
            kind: 'alignment', alignTo: 'street', buildableDepth_m: 12,
            sideTreatment: 'party-wall', alignmentOffset_m: 0,
        })).toBeNull();

        expect(displaySetbacks({ kind: 'explicit-area', ringRef: 'x' })).toBeNull();
    });
});

describe('ADR-0271 — block-derived alignment (the Barcelona Eixample case)', () => {
    // PGM NNUU Art. 242.2: depth is DERIVED per block (>=30% interior free, cap 30 m, floor 11 m),
    // not stated. A scalar buildableDepth_m cannot express it — that is why this variant exists.
    const eixample = {
        kind: 'block-derived-alignment' as const,
        alignTo: 'street' as const,
        sideTreatment: 'party-wall' as const,
        interiorFreeRatio: 0.3,
        minDepth_m: 11,
        maxDepth_m: 30,
    };

    it('parses an Eixample zone and defaults the alignment offset to 0', () => {
        const r = GeometricRuleSchema.parse(eixample);
        expect(r.kind).toBe('block-derived-alignment');
        if (r.kind === 'block-derived-alignment') {
            expect(r.interiorFreeRatio).toBe(0.3);
            expect(r.minDepth_m).toBe(11);
            expect(r.maxDepth_m).toBe(30);
            expect(r.alignmentOffset_m).toBe(0);
        }
    });

    it('carries NO scalar depth — the whole point of the variant', () => {
        const r = GeometricRuleSchema.parse(eixample);
        expect(r).not.toHaveProperty('buildableDepth_m');
    });

    it('REJECTS an interiorFreeRatio of 0 or 1 — neither is a zone', () => {
        // 0 imposes no constraint at all (the cap would always bind, so the rule is not a
        // construction); 1 admits no building whatever. Both are transcription errors, and
        // accepting either yields an envelope that reads as a planning fact.
        expect(() => GeometricRuleSchema.parse({ ...eixample, interiorFreeRatio: 0 })).toThrow();
        expect(() => GeometricRuleSchema.parse({ ...eixample, interiorFreeRatio: 1 })).toThrow();
    });

    it('REJECTS an inverted depth band — it would empty every parcel in the zone', () => {
        // An inverted band admits no depth, so every parcel returns "no buildable area" —
        // indistinguishable at runtime from a plot that genuinely cannot be built on. Reject
        // the PACK instead, where the error actually is.
        expect(() => GeometricRuleSchema.parse({ ...eixample, minDepth_m: 30, maxDepth_m: 11 }))
            .toThrow(/inverted band/);
    });

    it('accepts min === max — a fixed-depth block rule is degenerate but not wrong', () => {
        expect(() => GeometricRuleSchema.parse({ ...eixample, minDepth_m: 20, maxDepth_m: 20 }))
            .not.toThrow();
    });

    it('shares the alignment side-treatment refinement — side_m required when set back', () => {
        // Factored from the same helper as `alignment`, so this proves the shared shape is
        // genuinely shared rather than re-declared and drifting.
        expect(() => GeometricRuleSchema.parse({ ...eixample, sideTreatment: 'setback' }))
            .toThrow(/side_m is REQUIRED/);
        expect(() => GeometricRuleSchema.parse({ ...eixample, sideTreatment: 'setback', side_m: 3 }))
            .not.toThrow();
    });

    it('displaySetbacks returns NULL — an ensanche zone has no honest triple', () => {
        expect(displaySetbacks(GeometricRuleSchema.parse(eixample) as GeometricRule)).toBeNull();
    });

    it('requiresBlockRing is TRUE for this kind and FALSE for every other', () => {
        // This is what lets the engine refuse to solve rather than silently fall back to the
        // ordinance floor — which would publish a depth the ordinance does not sanction.
        expect(requiresBlockRing(GeometricRuleSchema.parse(eixample) as GeometricRule)).toBe(true);
        expect(requiresBlockRing({ kind: 'setback', front_m: 6, side_m: 3, rear_m: 5 })).toBe(false);
        expect(requiresBlockRing({
            kind: 'alignment', alignTo: 'street', buildableDepth_m: 12,
            sideTreatment: 'party-wall', alignmentOffset_m: 0,
        })).toBe(false);
        expect(requiresBlockRing({ kind: 'explicit-area', ringRef: 'x' })).toBe(false);
    });

    it('BACK-COMPAT: adding this kind did not disturb the legacy setback stamp', () => {
        const r = GeometricRuleCompatSchema.parse({ front_m: 6, side_m: 3, rear_m: 5 }) as GeometricRule;
        expect(r.kind).toBe('setback');
    });
});

describe('ADR-0288 — occupation-capped alignment (Córdoba Art. 13.5.2.4: depth libre, ocupación-bound)', () => {
    // The zone whose depth is unconstrained ("libre") and bounded ONLY by a parcel-level
    // occupation ratio the ZoningRule already carries (`maxCoverage`) — no stated depth
    // (`alignment` needs one), no block ring (`block-derived-alignment`/`tiered-occupation` both
    // need one). See the schema's own header for the full citation trail.
    const occupationCapped = {
        kind: 'occupation-capped-alignment' as const,
        alignTo: 'street' as const,
        sideTreatment: 'party-wall' as const,
    };

    it('parses the Córdoba MC shape and defaults the alignment offset to 0', () => {
        const r = GeometricRuleSchema.parse(occupationCapped);
        expect(r.kind).toBe('occupation-capped-alignment');
        if (r.kind === 'occupation-capped-alignment') expect(r.alignmentOffset_m).toBe(0);
    });

    it('carries NO scalar depth and NO occupation ratio — both are the whole point of the variant', () => {
        // No `buildableDepth_m` (Art. 13.5.2.4 states none) and no duplicated occupation field
        // (it already lives on `ZoningRule.maxCoverage` — see `TieredOccupationRuleSchema`'s own
        // "no occupation figure" precedent this kind follows).
        const r = GeometricRuleSchema.parse(occupationCapped);
        expect(r).not.toHaveProperty('buildableDepth_m');
        expect(r).not.toHaveProperty('occupationRatio');
        expect(r).not.toHaveProperty('interiorFreeRatio');
    });

    it('shares the alignment side-treatment refinement — side_m required when set back', () => {
        expect(() => GeometricRuleSchema.parse({ ...occupationCapped, sideTreatment: 'setback' }))
            .toThrow(/side_m is REQUIRED/);
        expect(() => GeometricRuleSchema.parse({ ...occupationCapped, sideTreatment: 'setback', side_m: 3 }))
            .not.toThrow();
    });

    it('accepts an optional rear_m (a patio de manzana, where one is imposed)', () => {
        expect(() => GeometricRuleSchema.parse({ ...occupationCapped, rear_m: 3 })).not.toThrow();
    });

    it('displaySetbacks returns NULL — this kind has no honest setback triple', () => {
        expect(displaySetbacks(GeometricRuleSchema.parse(occupationCapped) as GeometricRule)).toBeNull();
    });

    it('requiresBlockRing is FALSE — unlike block-derived-alignment/tiered-occupation, this kind ' +
        'is solved from the PARCEL alone (Art. 13.5.2.4 states no block-level condition)', () => {
        expect(requiresBlockRing(GeometricRuleSchema.parse(occupationCapped) as GeometricRule)).toBe(false);
    });

    it('BACK-COMPAT: adding this kind did not disturb the legacy setback stamp', () => {
        const r = GeometricRuleCompatSchema.parse({ front_m: 6, side_m: 3, rear_m: 5 }) as GeometricRule;
        expect(r.kind).toBe('setback');
    });
});
