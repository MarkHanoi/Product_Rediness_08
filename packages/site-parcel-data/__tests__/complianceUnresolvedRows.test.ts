// §PARCEL-LAW-UNRESOLVED (STR §25.1 block B · C58 §1.3/§1.4 · L-616)
//
// The Parcel Law card prints Max height / Storeys / Max FAR / Max site coverage on EVERY parcel,
// falling to "not derived". Before this slice, a constraint the rule pack never emitted was
// `continue`d past by `buildComplianceReport`, so the row vanished from the "Why these numbers?"
// fold and the reader could not tell a hole in OUR data from a finding about the ORDINANCE.
//
// These tests pin the honest distinction rather than a count, and they pin the two things that
// must NOT move: `rows` membership and the estimate denominator.

import { describe, it, expect } from 'vitest';
import {
    buildComplianceReport,
    CARD_ASSERTED_CONSTRAINTS,
    EMPTY_VALUE_TEXT,
    MAX_FLOORS_ROW_ID,
} from '../src/complianceReport.js';
import type { BuildableEnvelope } from '@pryzm/schemas';

const entry = (
    constraint: string,
    value: unknown,
    provenance = 'published-structured',
    ordinanceRef: string | null = null,
    zoneCode = 'P2',
    source = 'plandata-dk',
) => ({ constraint, value, zoneCode, source, fieldProvenance: provenance, ordinanceRef }) as never;

/**
 * A deliberately BARE envelope: no derivation at all, no scalars. Every over-ride below adds back
 * exactly the one fact under test, so a passing assertion names its own cause.
 */
const mkEnv = (over: Partial<BuildableEnvelope> = {}): BuildableEnvelope =>
    ({
        status: 'ok',
        confidence: 'estimated-ruleset',
        insetAreaM2: 1000,
        maxHeight_m: null,
        maxFAR: null,
        maxCoverage: null,
        maxFloors: null,
        insetPolygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }],
        derivation: [],
        ...over,
    }) as unknown as BuildableEnvelope;

const byId = (r: ReturnType<typeof buildComplianceReport>, id: string) =>
    r!.unresolvedRows.find((x) => x.id === id);

describe('§PARCEL-LAW-UNRESOLVED — a promised row keeps its citation slot', () => {
    it('the asserted SET is the three block-B constraints, pinned as a set and not as a count', () => {
        // A count can be right while the range is wrong — this repo has paid for that repeatedly.
        expect([...CARD_ASSERTED_CONSTRAINTS]).toEqual(['maxHeight', 'maxFAR', 'maxCoverage']);
    });

    it('a constraint the pack never addressed gets an unresolved row, NOT silence', () => {
        const r = buildComplianceReport(mkEnv())!;
        expect(r.unresolvedRows.map((x) => x.id)).toEqual([
            'maxHeight', 'maxFAR', 'maxCoverage', MAX_FLOORS_ROW_ID,
        ]);
        expect(byId(r, 'maxFAR')!.reason).toBe('no-value');
        expect(byId(r, 'maxFAR')!.label).toBe('Max FAR');
        expect(r.unresolvedRowCount).toBe(4);
    });

    it('an unresolved row NEVER carries a value — it is the honest blank, not a synthesised figure', () => {
        const r = buildComplianceReport(mkEnv())!;
        for (const u of r.unresolvedRows) {
            expect(Object.keys(u).sort()).toEqual(['id', 'label', 'reason']);
        }
    });

    it('a resolved constraint gets NO unresolved row (the slot is filled)', () => {
        const r = buildComplianceReport(mkEnv({
            maxHeight_m: 12,
            derivation: [entry('maxHeight', 12, 'published-structured', 'Plandata §4.2')] as never,
        } as Partial<BuildableEnvelope>))!;
        expect(byId(r, 'maxHeight')).toBeUndefined();
        expect(r.rows.map((x) => x.constraint)).toEqual(['maxHeight']);
        expect(r.unresolvedRows.map((x) => x.id)).toEqual(['maxFAR', 'maxCoverage', MAX_FLOORS_ROW_ID]);
    });

    it('C58 §1.3 breach: a NUMBER on the envelope with no derivation entry reads value-without-citation', () => {
        // Block B prints "12.0 m" and the fold has nothing to source it with. That is the worse of
        // the two absences, because a number on screen reads as authoritative.
        const r = buildComplianceReport(mkEnv({ maxHeight_m: 12, maxFAR: 2 } as Partial<BuildableEnvelope>))!;
        expect(byId(r, 'maxHeight')!.reason).toBe('value-without-citation');
        expect(byId(r, 'maxFAR')!.reason).toBe('value-without-citation');
        // ...and the field that really is absent is still the other arm.
        expect(byId(r, 'maxCoverage')!.reason).toBe('no-value');
    });

    it('Storeys is always in the fold, because it has no DerivationConstraint to be sourced by', () => {
        const withFloors = buildComplianceReport(mkEnv({ maxFloors: 4 } as Partial<BuildableEnvelope>))!;
        expect(byId(withFloors, MAX_FLOORS_ROW_ID)!.reason).toBe('value-without-citation');
        expect(byId(withFloors, MAX_FLOORS_ROW_ID)!.label).toBe('Storeys');
        const noFloors = buildComplianceReport(mkEnv())!;
        expect(byId(noFloors, MAX_FLOORS_ROW_ID)!.reason).toBe('no-value');
    });

    it('a non-finite scalar is NOT a value (NaN must not read as a cited number)', () => {
        const r = buildComplianceReport(mkEnv({ maxFAR: Number.NaN } as Partial<BuildableEnvelope>))!;
        expect(byId(r, 'maxFAR')!.reason).toBe('no-value');
    });
});

describe('§PARCEL-LAW-UNRESOLVED — the family-specific constraints are deliberately NOT minted', () => {
    it('a Danish parcel gets no "Upper-floor band ratio — not derived" row', () => {
        // Minting one would be an overstatement in the OPPOSITE direction: a claim that PGM
        // Art. 350.2 was something we should have looked up in Denmark.
        const r = buildComplianceReport(mkEnv())!;
        const ids = r.unresolvedRows.map((x) => x.id);
        for (const foreign of [
            'tier.bandAreaRatio', 'tier.bandDepth', 'tier.interiorHeight',
            'alignment.depth', 'alignment.offset', 'alignment.sideTreatment',
            'occupationCap.ratio', 'occupationCap.depth_m', 'permittedUse',
        ]) {
            expect(ids).not.toContain(foreign);
        }
    });

    it('setbacks are excluded — on an alignment zone they are null BY DESIGN (§L-518c)', () => {
        // A Barcelona 13a determination is CORRECT with null setbacks; reporting them as gaps
        // would turn a right answer into a defect.
        const r = buildComplianceReport(mkEnv({
            derivation: [entry('alignment.depth', 16, 'published-structured', 'PGM Art. 242.2')] as never,
        } as Partial<BuildableEnvelope>))!;
        const ids = r.unresolvedRows.map((x) => x.id);
        expect(ids).not.toContain('setback.front');
        expect(ids).not.toContain('setback.side');
        expect(ids).not.toContain('setback.rear');
    });
});

describe('§PARCEL-LAW-UNRESOLVED — the two things that must NOT move', () => {
    it('`rows` membership is unchanged: an entry with a NULL value still produces an ordinary row', () => {
        // We consulted Plandata and it states nothing. That is a stronger fact than silence, it
        // owns a real citation, and it stays in `rows` so no confidence reading shifts.
        const r = buildComplianceReport(mkEnv({
            derivation: [entry('maxFAR', null, 'published-structured', 'Plandata §4.3')] as never,
        } as Partial<BuildableEnvelope>))!;
        expect(r.rows.map((x) => x.constraint)).toEqual(['maxFAR']);
        expect(r.rows[0]!.ordinanceRef).toBe('Plandata §4.3');
        // ...but the renderer must be able to tell it apart from a real figure.
        expect(r.rows[0]!.hasStatedValue).toBe(false);
        expect(r.rows[0]!.valueText).toBe(EMPTY_VALUE_TEXT);
        // ...and it is NOT double-reported as unresolved.
        expect(byId(r, 'maxFAR')).toBeUndefined();
    });

    it('`hasStatedValue` is true for a real figure', () => {
        const r = buildComplianceReport(mkEnv({
            derivation: [entry('maxFAR', 2, 'published-structured', 'Plandata §4.3')] as never,
        } as Partial<BuildableEnvelope>))!;
        expect(r.rows[0]!.hasStatedValue).toBe(true);
        expect(r.rows[0]!.valueText).toBe('2.00');
    });

    it('the ESTIMATED denominator still counts resolved rows only (L-526: never restate a quantity)', () => {
        const r = buildComplianceReport(mkEnv({
            derivation: [
                entry('setback.front', 3, 'estimated'),
                entry('maxHeight', 12, 'published-structured', 'Plandata §4.2'),
            ] as never,
        } as Partial<BuildableEnvelope>))!;
        expect(r.rows).toHaveLength(2);
        expect(r.estimatedRowCount).toBe(1);
        expect(r.hasAnyEstimate).toBe(true);
        // Three unresolved slots exist alongside, and none of them touched the fraction above.
        expect(r.unresolvedRowCount).toBe(3);
    });

    it('a null envelope is still null (no report is not an empty report)', () => {
        expect(buildComplianceReport(null)).toBeNull();
    });
});
