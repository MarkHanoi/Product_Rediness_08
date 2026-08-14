// PV-06 — element kinds carry a C62 `confidence`, and adding it broke nothing.
//
// ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
// Measured 2026-08-14 at HEAD:
//     grep -rc 'confidence' packages/schemas/src/elements  →  0
//     grep -rc 'confidence' packages/schemas/src/site      →  48
// Zero across all 27 `defineElement()` kinds; rich and in places mandatory across
// site / context / climate / zoning. A jurisdiction setback carried a tier, an
// authority rank, a validation state and a typed unknown-reason; a wall the
// generator INFERRED and a wall a human drew carried nothing, and so could not be
// told apart on trust.
//
// ─── WHAT IS ASSERTED, AND WHY EACH ARM EXISTS ───────────────────────────────
// As with PV-02's provenance retrofit, the dangerous half is not "the field
// exists" — it is backward compatibility. A new field that breaks old-data
// loading gets reverted, and the revert removes confidence rather than fixing the
// migration. So the weight is on the pre-change half:
//
//  0. the pre-change baseline is itself valid, per kind — the FLOOR, without which
//     every arm below can pass vacuously
//  1. every IN-SCOPE kind declares the field; every OUT-OF-SCOPE kind is named
//     here IN WRITING (C75 §5 — never by omission)
//  2. a PRE-CHANGE record (no `confidence` key) still parses, for every kind
//  3. …and lands on UNKNOWN-WITH-REASON — never a tier, never `score: 0`
//  4. the parse is byte-stable across a JSON round trip
//  5. a real judged confidence survives the round trip intact
//  6. C62's vocabulary is REUSED, not forked (PV-06 §4.h)
//
// ⚠ NOT asserted here, stated so silence is never read as coverage: that any
// PRODUCER writes a real confidence. Every kind defaults to
// `pending-implementation` today — honest and empty. Instrumenting the producers
// is a separate, named piece of work and this file does not pretend to cover it.

import { describe, it, expect } from 'vitest';
import { SCHEMA_REGISTRY } from '../src/registry.js';
import {
    ElementConfidenceSchema,
    confidencePredatingTheField,
    unknownConfidence,
    judgedConfidence,
    confidenceIsUnknown,
} from '../src/provenance/ElementConfidence.js';
import {
    DomainConfidenceSchema,
    UnknownReasonSchema,
} from '../src/site/metadata/DataConfidence.js';

type ElementKind = keyof typeof SCHEMA_REGISTRY;
const ELEMENT_TYPES = Object.keys(SCHEMA_REGISTRY) as ElementKind[];

/**
 * Kinds deliberately left WITHOUT a confidence field, named here because C75 §5
 * requires an out-of-scope argument to be written down rather than inferred from
 * an absence.
 *
 * These five are DOCUMENTATION artefacts. Their content is the user's drawing or
 * reporting act, not a fact sourced from anywhere that could be more or less
 * trustworthy. A dimension's NUMBER is derived from the geometry it references,
 * and the confidence belongs to that referenced element — putting a second,
 * independent confidence on the dimension would let the two disagree, which is a
 * defect and not a feature.
 */
const OUT_OF_SCOPE: Record<string, string> = {
    annotation: 'documentation artefact — the text is the user’s, with no external source to be confident about',
    dimension: 'reports another element’s geometry; the confidence belongs to the referenced element, and a second copy could disagree with it',
    schedule: 'a query over other elements — its trust is the trust of its rows, computed at read time',
    sheet: 'a layout container; it sources no facts of its own',
    view: 'a camera + display settings; it sources no facts of its own',
};

const IN_SCOPE = ELEMENT_TYPES.filter((t) => !(t in OUT_OF_SCOPE));

/** Same fixture reasoning as elementProvenance.test.ts — see ADR-0124. */
const PRE_CHANGE_INPUT: Partial<Record<ElementKind, Record<string, unknown>>> = {
    water: { surfaceElevation: 1, bottomElevation: 0 },
};

function baseInput(type: ElementKind): Record<string, unknown> {
    return { ...(PRE_CHANGE_INPUT[type] ?? {}) };
}

/** The pre-change shape: exactly what a parse produced BEFORE this commit. */
function preConfidenceRecord(type: ElementKind): Record<string, unknown> {
    const full = SCHEMA_REGISTRY[type].parse(baseInput(type)) as Record<string, unknown>;
    const { confidence: _dropped, ...rest } = full;
    return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}

describe('PV-06 — scope is declared, never inferred from an absence (C75 §5)', () => {
    it('the registry is the full set (floor, not a sample)', () => {
        expect(ELEMENT_TYPES.length).toBeGreaterThanOrEqual(27);
    });

    it('every out-of-scope key names a REAL kind — the exemption list cannot rot into a no-op', () => {
        for (const key of Object.keys(OUT_OF_SCOPE)) {
            expect(ELEMENT_TYPES).toContain(key as ElementKind);
        }
    });

    it('every out-of-scope kind carries a non-empty written reason', () => {
        for (const [kind, why] of Object.entries(OUT_OF_SCOPE)) {
            expect(why.length, `kind '${kind}' is exempt with no reason — that is omission, not scope`).toBeGreaterThan(20);
        }
    });

    it('in-scope + out-of-scope partitions the registry exactly', () => {
        expect(IN_SCOPE.length + Object.keys(OUT_OF_SCOPE).length).toBe(ELEMENT_TYPES.length);
    });
});

describe('PV-06 — every in-scope kind declares confidence', () => {
    it.each(IN_SCOPE)('%s: a default parse carries a confidence record', (type) => {
        const parsed = SCHEMA_REGISTRY[type].parse(baseInput(type)) as Record<string, unknown>;
        expect(parsed).toHaveProperty('confidence');
        expect(ElementConfidenceSchema.safeParse(parsed['confidence']).success).toBe(true);
    });

    it.each(Object.keys(OUT_OF_SCOPE))('%s: is exempt and genuinely has no field', (type) => {
        const parsed = SCHEMA_REGISTRY[type as ElementKind].parse(
            baseInput(type as ElementKind),
        ) as Record<string, unknown>;
        expect(parsed['confidence']).toBeUndefined();
    });
});

describe('PV-06 — backward compatibility: a pre-change record still parses', () => {
    it.each(IN_SCOPE)('%s: the pre-change baseline is itself VALID (arm 0 — the floor)', (type) => {
        const r = SCHEMA_REGISTRY[type].safeParse(baseInput(type));
        expect(
            r.success,
            `kind '${type}' cannot produce a valid confidence-free record, so its backward ` +
                `compatibility is UNTESTED rather than proven. Add the minimum valid payload to ` +
                `PRE_CHANGE_INPUT['${type}'].`,
        ).toBe(true);
    });

    it.each(IN_SCOPE)('%s: a record written before the field existed parses unchanged', (type) => {
        const old = preConfidenceRecord(type);
        expect(old).not.toHaveProperty('confidence');
        const r = SCHEMA_REGISTRY[type].safeParse(old);
        expect(r.success).toBe(true);
    });

    it.each(IN_SCOPE)('%s: …and lands on UNKNOWN-WITH-REASON, never a tier and never score 0', (type) => {
        const parsed = SCHEMA_REGISTRY[type].parse(preConfidenceRecord(type)) as Record<string, unknown>;
        const c = ElementConfidenceSchema.parse(parsed['confidence']);

        // The whole rule, in three assertions:
        expect(c.unknownReason).toBe('pending-implementation'); // a reason, always
        expect(c.score).toBeNull();                             // NOT 0 — 0 is a claim
        expect(c.tier).toBeUndefined();                         // no invented tier
        expect(confidenceIsUnknown(c)).toBe(true);
    });

    it.each(IN_SCOPE)('%s: the parse is byte-stable across a JSON round trip', (type) => {
        const once = SCHEMA_REGISTRY[type].parse(baseInput(type));
        const twice = SCHEMA_REGISTRY[type].parse(JSON.parse(JSON.stringify(once)));
        expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    });

    it.each(IN_SCOPE)('%s: a real judged confidence survives the round trip intact', (type) => {
        const judged = judgedConfidence({ tier: 'high', score: 0.9 }, 'cross-validated');
        const parsed = SCHEMA_REGISTRY[type].parse({
            ...baseInput(type),
            confidence: judged,
        }) as Record<string, unknown>;
        const back = ElementConfidenceSchema.parse(
            JSON.parse(JSON.stringify(parsed))['confidence'],
        );
        expect(back.tier).toBe('high');
        expect(back.score).toBe(0.9);
        expect(back.validationState).toBe('cross-validated');
        expect(back.unknownReason).toBeUndefined();
    });
});

// ── The C74 §3.4 negative: no confidence must never ACQUIRE one ────────────

describe('PV-06 negative — an element with no confidence reads unknown-with-reason', () => {
    it('the retrofit default is a REASON, not a value', () => {
        const d = confidencePredatingTheField();
        expect(d.unknownReason).toBe('pending-implementation');
        expect(d.score).toBeNull();
        expect(d.tier).toBeUndefined();
        expect(d.validationState).toBe('not-checked');
    });

    it('score 0 is a CLAIM and is never what "unknown" produces', () => {
        // The one-character version of the whole defect. If a future edit
        // defaults score to 0, this arm goes red.
        for (const type of IN_SCOPE) {
            const c = (SCHEMA_REGISTRY[type].parse(baseInput(type)) as Record<string, unknown>)[
                'confidence'
            ] as { score: number | null };
            expect(c.score, `kind '${type}' defaults confidence.score to 0 — that claims certainty of wrongness, not absence of knowledge`).not.toBe(0);
        }
    });

    it('unknown and low are DIFFERENT answers, and the predicate keeps them apart', () => {
        expect(confidenceIsUnknown(unknownConfidence('not-queried'))).toBe(true);
        expect(confidenceIsUnknown(judgedConfidence({ score: 0.05 }))).toBe(false);
        expect(confidenceIsUnknown(judgedConfidence({ tier: 'low' }))).toBe(false);
        expect(confidenceIsUnknown(undefined)).toBe(true);
    });

    it('an empty claim cannot be minted — judgedConfidence REFUSES it', () => {
        expect(() => judgedConfidence({})).toThrow(/tier or a score/);
        expect(() => judgedConfidence({ score: null })).toThrow(/tier or a score/);
    });

    it('the unknown-reason vocabulary is CLOSED — an ad-hoc string is rejected', () => {
        expect(
            ElementConfidenceSchema.safeParse({
                score: null,
                validationState: 'not-checked',
                unknownReason: 'because-we-felt-like-it',
            }).success,
        ).toBe(false);
    });
});

// ── C62 reuse, not a third scale (PV-06 §4.h) ──────────────────────────────

describe('PV-06 — C62 owns confidence; this is reuse, not a fork', () => {
    it('ElementConfidenceSchema IS C62 DomainConfidenceSchema', () => {
        expect(ElementConfidenceSchema).toBe(DomainConfidenceSchema);
    });

    it('the unknown-reason tokens are C62\'s, unmodified', () => {
        expect(UnknownReasonSchema.options).toContain('pending-implementation');
        // A fork would show up as a token this file knows and C62 does not.
        for (const r of ['not-queried', 'outside-coverage', 'adapter-limitation'] as const) {
            expect(UnknownReasonSchema.safeParse(r).success).toBe(true);
        }
    });

    it('confidence is a SEPARATE axis from provenance (C75 §1.2 — never merged)', () => {
        const parsed = SCHEMA_REGISTRY['wall'].parse({}) as Record<string, unknown>;
        // Both present, neither derivable from the other.
        expect(parsed).toHaveProperty('provenance');
        expect(parsed).toHaveProperty('confidence');
        const prov = parsed['provenance'] as Record<string, unknown>;
        const conf = parsed['confidence'] as Record<string, unknown>;
        expect(prov['unknownReason']).toBe('predates-provenance');
        expect(conf['unknownReason']).toBe('pending-implementation');
        // Different vocabularies — a confidence reason is not an origin reason.
        expect(prov['unknownReason']).not.toBe(conf['unknownReason']);
    });
});
