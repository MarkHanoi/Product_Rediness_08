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
