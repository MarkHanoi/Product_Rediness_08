// GRAMMAR CLASSIFIER TESTS — ⛔ NEVER FORCE A GRAMMAR.
//
// A grammar is a KIND, not a number (ADR-0270). The tests below are written around the ONE thing
// that matters: `unknown` must be reachable, and it must be reached whenever the parameters do not
// determine an operation. A classifier that always answers is worse than one that often abstains.

import { describe, it, expect } from 'vitest';
import { classifyGrammar, isPublicSystemOrdinance, isIndustrialOrdinance, requiredParameters } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmGrammar.js';
import type { EnvelopeRules } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';
import { published, unknown } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';

const U = unknown(null, 'not published');
const base: EnvelopeRules = {
    height_m: U, storeys: U, occupationPct: U, depth_m: U,
    setbackFront_m: U, setbackSide_m: U, setbackRear_m: U,
    plotRatioFAR: U, minFrontage_m: U,
};

const withSetbacks = (f = 3, s = 3, r = 3): EnvelopeRules => ({
    ...base,
    setbackFront_m: published(f, 'NM_RTR_FRNT'),
    setbackSide_m: published(s, 'NM_RTR_LATL'),
    setbackRear_m: published(r, 'NM_RTR_POST'),
});
const withHeight = (rules: EnvelopeRules, h = 7, n = 2): EnvelopeRules => ({
    ...rules, height_m: published(h, 'NM_ALTURA'), storeys: published(n, 'NM_N_PLTA'),
});

describe('ordinance-name classification', () => {
    // Real Boadilla values, all six of its public-system designations.
    it('recognises every public-system designation in the Boadilla fixture', () => {
        for (const n of [
            'ZONAS VERDES', 'RED VIARIA', 'EQUIPAMIENTO', 'DEPORTIVAS',
            'SERVICIOS URBANOS E INFRAESTRUCTURAS', 'ESPACIOS DE TRANSICIÓN',
        ]) {
            expect(isPublicSystemOrdinance(n)).toBe(true);
        }
    });

    // MUTATION: over-broad matching. These four are PRIVATE buildable fabric and a false positive
    // would refuse them on the law — the worst possible error, since it tells a buildable-plot
    // owner the ordinance forbids building.
    it('does NOT flag private residential or commercial designations', () => {
        for (const n of [
            'RESIDENCIAL UNIFAMILIAR', 'RESIDENCIAL MULTIFAMILIAR',
            'TERCIARIO COMERCIAL', 'CASCO ANTIGUO',
        ]) {
            expect(isPublicSystemOrdinance(n)).toBe(false);
        }
    });

    it('is accent- and case-insensitive, because the corpus is not consistent', () => {
        expect(isPublicSystemOrdinance('espacios de transicion')).toBe(true);
        expect(isPublicSystemOrdinance('ESPACIOS DE TRANSICIÓN')).toBe(true);
    });

    it('treats a blank designation as neither public nor industrial', () => {
        for (const n of [null, undefined, '']) {
            expect(isPublicSystemOrdinance(n)).toBe(false);
            expect(isIndustrialOrdinance(n)).toBe(false);
        }
    });

    it('recognises industrial designations', () => {
        expect(isIndustrialOrdinance('INDUSTRIAL LIMPIA')).toBe(true);
        expect(isIndustrialOrdinance('POLÍGONO INDUSTRIAL')).toBe(true);
        expect(isIndustrialOrdinance('RESIDENCIAL UNIFAMILIAR')).toBe(false);
    });
});

describe('classifyGrammar — SETBACK', () => {
    it('classifies a complete triple plus a height as setback', () => {
        const c = classifyGrammar(withHeight(withSetbacks()), 'RESIDENCIAL UNIFAMILIAR');
        expect(c.grammar).toBe('setback');
        expect(c.missingRequired).toEqual([]);
        expect(c.decidedBy).toContain('NM_RTR_FRNT');
        expect(c.decidedBy).toContain('NM_ALTURA');
    });

    // ⛔ MUTATION: `knownSetbacks >= 1` or defaulting the missing edge to 0. Defaulting erodes
    // NOTHING on that edge, publishing MORE buildable area than the ordinance grants.
    it('does NOT classify a PARTIAL triple as setback', () => {
        const partial: EnvelopeRules = {
            ...base,
            setbackFront_m: published(3, 'NM_RTR_FRNT'),
            setbackSide_m: published(3, 'NM_RTR_LATL'),
            height_m: published(7, 'NM_ALTURA'),
        };
        const c = classifyGrammar(partial, 'RESIDENCIAL UNIFAMILIAR');
        expect(c.grammar).toBe('unknown');
        expect(c.rationale).toMatch(/incomplete \(2 of 3/);
    });

    // ⛔ NO HEIGHT, NO ENVELOPE. Setbacks alone give a footprint; a footprint published as an
    // envelope leaves the height unbounded, which is L-616's "a missing constraint OVERSTATES".
    it('flags a missing vertical limit as a REQUIRED parameter, not a detail', () => {
        const c = classifyGrammar(withSetbacks(), 'RESIDENCIAL UNIFAMILIAR');
        expect(c.grammar).toBe('setback');
        expect(c.missingRequired).toContain('NM_ALTURA|NM_N_PLTA');
    });

    // Storeys alone still bound a solid. A classifier that demanded NM_ALTURA specifically would
    // discard every storeys-only row — and NM_N_PLTA outnumbers NM_ALTURA across the corpus.
    it('accepts storeys alone as the vertical limit', () => {
        const r: EnvelopeRules = { ...withSetbacks(), storeys: published(3, 'NM_N_PLTA') };
        expect(classifyGrammar(r, 'RESIDENCIAL UNIFAMILIAR').missingRequired).toEqual([]);
    });
});

describe('classifyGrammar — ALIGNMENT', () => {
    it('classifies a published depth plus a height as alignment', () => {
        const r: EnvelopeRules = {
            ...base,
            depth_m: published(12, 'NM_FDO_MX_ED'),
            height_m: published(13.5, 'NM_ALTURA'),
        };
        const c = classifyGrammar(r, 'CASCO ANTIGUO');
        expect(c.grammar).toBe('alignment');
        expect(c.decidedBy).toContain('NM_FDO_MX_ED');
    });

    // ⛔⛔ THE MOST DANGEROUS AVAILABLE MUTATION: reaching `alignment` when the setbacks are ABSENT
    // or ZERO. 7,225 rows carry a literal-zero NM_RTR_FRNT, and inferring "façade on the street
    // line" from them would put an ensanche grammar on 7,225 suburban plots — spanning the full
    // plot depth on each.
    it('is NEVER reached by the ABSENCE of setbacks — only by a POSITIVE depth', () => {
        const noSetbacksNoDepth: EnvelopeRules = { ...base, height_m: published(7, 'NM_ALTURA') };
        expect(classifyGrammar(noSetbacksNoDepth, 'RESIDENCIAL').grammar).toBe('unknown');

        // And a stored zero must not become a depth either.
        const zeroDepth: EnvelopeRules = {
            ...base,
            height_m: published(7, 'NM_ALTURA'),
            depth_m: unknown('NM_FDO_MX_ED', 'value is literal 0'),
        };
        expect(classifyGrammar(zeroDepth, 'RESIDENCIAL').grammar).toBe('unknown');
    });

    // Precedence: a complete setback triple is a POSITIVE statement that the building stands away
    // from every boundary, which is incompatible with a façade ON the line.
    it('prefers SETBACK over ALIGNMENT when a row carries both', () => {
        const both: EnvelopeRules = { ...withHeight(withSetbacks()), depth_m: published(12, 'NM_FDO_MX_ED') };
        expect(classifyGrammar(both, 'RESIDENCIAL').grammar).toBe('setback');
    });
});

describe('classifyGrammar — OCCUPATION and INDUSTRIAL', () => {
    it('classifies a coverage cap plus a height as occupation, and says it is a CAP', () => {
        const r: EnvelopeRules = {
            ...base, occupationPct: published(70, 'NM_OCP_MX'), height_m: published(7, 'NM_ALTURA'),
        };
        const c = classifyGrammar(r, 'RESIDENCIAL');
        expect(c.grammar).toBe('occupation');
        expect(c.rationale).toMatch(/does not determine a FOOTPRINT SHAPE/);
    });

    // Industrial is decided on the NAME and BEFORE any parameter, so a thin industrial row is
    // counted as industrial rather than disappearing into `unknown` where nobody tracks it.
    it('classifies industrial on the name, ahead of the parameters', () => {
        const c = classifyGrammar(withHeight(withSetbacks()), 'INDUSTRIAL LIMPIA');
        expect(c.grammar).toBe('industrial');
        expect(c.decidedBy).toContain('DS_NOMB_ORD');
    });
});

describe('classifyGrammar — UNKNOWN is reachable and is the default', () => {
    // ⛔ MUTATION: any final `return { grammar: 'setback' | 'occupation', ... }` fallback.
    it('returns unknown for a completely empty parameter set', () => {
        const c = classifyGrammar(base, 'RESIDENCIAL UNIFAMILIAR');
        expect(c.grammar).toBe('unknown');
        expect(c.decidedBy).toEqual([]);
        expect(c.rationale).toMatch(/NOT forced/);
    });

    it('returns unknown when only a height is published — a height is not a shape', () => {
        expect(classifyGrammar({ ...base, height_m: published(7, 'NM_ALTURA') }, 'RESIDENCIAL').grammar)
            .toBe('unknown');
    });

    it('names what was missing so the refusal card is not a shrug', () => {
        const c = classifyGrammar(base, 'RESIDENCIAL');
        expect(c.rationale).toContain('NM_FDO_MX_ED');
        expect(c.rationale).toContain('NM_OCP_MX');
        expect(c.missingRequired.length).toBeGreaterThan(0);
    });
});

describe('requiredParameters', () => {
    it('requires all three setback edges, never a subset', () => {
        expect(requiredParameters('setback')).toEqual(['setbackFront_m', 'setbackSide_m', 'setbackRear_m']);
    });
    it('requires the depth for alignment and the coverage for occupation', () => {
        expect(requiredParameters('alignment')).toEqual(['depth_m']);
        expect(requiredParameters('occupation')).toEqual(['occupationPct']);
    });
    it('requires nothing of unknown — there is nothing to require', () => {
        expect(requiredParameters('unknown')).toEqual([]);
    });
});
