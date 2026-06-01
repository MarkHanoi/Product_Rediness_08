// C27 INS-α-2 (BIM 3.0 Inspect Model) — L0 inspect substrate tests.
//
// Covers:
//   • InspectNodeKindSchema accepts each of the 7 node kinds + rejects junk
//   • InspectSelectionSchema accepts a minimal valid selection
//   • breadcrumb defaults to []
//   • breadcrumb accepts a non-empty path of (kind, id) pairs
//   • level constrained to integer 0..6 (rejects -1, 7, 2.5)
//   • id non-empty
//   • IsolationTierSchema accepts FULL / DIMMED / HIDDEN + rejects junk
//   • IsolationOverrideSchema validates required fields + optional opacity
//   • opacity must be in [0, 1] when present
//   • SpatialRelationshipSchema accepts all 5 values + rejects junk
//
// 100% branch coverage per `vitest.config.ts` thresholds.

import { describe, expect, it } from 'vitest';
import {
    InspectNodeKindSchema,
    InspectSelectionSchema,
    IsolationTierSchema,
    IsolationOverrideSchema,
    SpatialRelationshipSchema,
    type InspectSelection,
    type InspectNodeKind,
    type IsolationTier,
    type IsolationOverride,
    type SpatialRelationship,
} from '../src/inspect/index.js';

describe('InspectNodeKindSchema', () => {
    const allKinds: InspectNodeKind[] = [
        'project',
        'building',
        'level',
        'apartment',
        'room',
        'elementType',
        'elementInstance',
    ];

    it('accepts each of the 7 node kinds', () => {
        for (const k of allKinds) {
            expect(InspectNodeKindSchema.parse(k)).toBe(k);
        }
    });

    it('rejects an unknown kind', () => {
        expect(() => InspectNodeKindSchema.parse('foo')).toThrow();
    });

    it('rejects a non-string', () => {
        expect(() => InspectNodeKindSchema.parse(42)).toThrow();
    });
});

describe('InspectSelectionSchema', () => {
    const minimal: InspectSelection = {
        kind: 'apartment',
        id: 'apt-1',
        level: 3,
        breadcrumb: [],
    };

    it('accepts a minimal valid selection', () => {
        const parsed = InspectSelectionSchema.parse(minimal);
        expect(parsed).toEqual(minimal);
    });

    it('breadcrumb defaults to [] when omitted', () => {
        const parsed = InspectSelectionSchema.parse({
            kind: 'project',
            id: 'project-root',
            level: 0,
        });
        expect(parsed.breadcrumb).toEqual([]);
    });

    it('accepts a non-empty breadcrumb path', () => {
        const parsed = InspectSelectionSchema.parse({
            kind: 'room',
            id: 'room-7',
            level: 4,
            breadcrumb: [
                { kind: 'project', id: 'project-root' },
                { kind: 'building', id: 'bldg-A' },
                { kind: 'level', id: 'level-2' },
                { kind: 'apartment', id: 'apt-1' },
            ],
        });
        expect(parsed.breadcrumb).toHaveLength(4);
        expect(parsed.breadcrumb[0]).toEqual({ kind: 'project', id: 'project-root' });
    });

    it('rejects level < 0', () => {
        expect(() => InspectSelectionSchema.parse({ ...minimal, level: -1 })).toThrow();
    });

    it('rejects level > 6', () => {
        expect(() => InspectSelectionSchema.parse({ ...minimal, level: 7 })).toThrow();
    });

    it('rejects non-integer level', () => {
        expect(() => InspectSelectionSchema.parse({ ...minimal, level: 2.5 })).toThrow();
    });

    it('rejects empty id', () => {
        expect(() => InspectSelectionSchema.parse({ ...minimal, id: '' })).toThrow();
    });

    it('rejects unknown kind', () => {
        expect(() => InspectSelectionSchema.parse({ ...minimal, kind: 'site' as InspectNodeKind })).toThrow();
    });

    it('rejects breadcrumb entry with empty id', () => {
        expect(() => InspectSelectionSchema.parse({
            ...minimal,
            breadcrumb: [{ kind: 'project', id: '' }],
        })).toThrow();
    });

    it('rejects breadcrumb entry with unknown kind', () => {
        expect(() => InspectSelectionSchema.parse({
            ...minimal,
            breadcrumb: [{ kind: 'site' as InspectNodeKind, id: 'p' }],
        })).toThrow();
    });
});

describe('IsolationTierSchema', () => {
    const allTiers: IsolationTier[] = ['FULL', 'DIMMED', 'HIDDEN'];

    it('accepts FULL / DIMMED / HIDDEN', () => {
        for (const t of allTiers) {
            expect(IsolationTierSchema.parse(t)).toBe(t);
        }
    });

    it('rejects "INVISIBLE" (not a member)', () => {
        expect(() => IsolationTierSchema.parse('INVISIBLE')).toThrow();
    });

    it('rejects lowercase variants', () => {
        expect(() => IsolationTierSchema.parse('full')).toThrow();
    });
});

describe('IsolationOverrideSchema', () => {
    it('accepts a FULL override (no opacity)', () => {
        const ov: IsolationOverride = { elementId: 'wall-1', tier: 'FULL' };
        expect(IsolationOverrideSchema.parse(ov)).toEqual(ov);
    });

    it('accepts a DIMMED override with opacity in range', () => {
        const ov: IsolationOverride = { elementId: 'wall-1', tier: 'DIMMED', opacity: 0.3 };
        expect(IsolationOverrideSchema.parse(ov)).toEqual(ov);
    });

    it('accepts opacity boundaries 0 and 1', () => {
        expect(IsolationOverrideSchema.parse({ elementId: 'e', tier: 'DIMMED', opacity: 0 }).opacity).toBe(0);
        expect(IsolationOverrideSchema.parse({ elementId: 'e', tier: 'DIMMED', opacity: 1 }).opacity).toBe(1);
    });

    it('rejects opacity < 0', () => {
        expect(() => IsolationOverrideSchema.parse({
            elementId: 'e', tier: 'DIMMED', opacity: -0.1,
        })).toThrow();
    });

    it('rejects opacity > 1', () => {
        expect(() => IsolationOverrideSchema.parse({
            elementId: 'e', tier: 'DIMMED', opacity: 1.1,
        })).toThrow();
    });

    it('rejects empty elementId', () => {
        expect(() => IsolationOverrideSchema.parse({
            elementId: '', tier: 'FULL',
        })).toThrow();
    });

    it('rejects unknown tier', () => {
        expect(() => IsolationOverrideSchema.parse({
            elementId: 'e', tier: 'GHOSTED' as IsolationTier,
        })).toThrow();
    });
});

describe('SpatialRelationshipSchema', () => {
    const allRels: SpatialRelationship[] = [
        'SELECTED',
        'PARENT',
        'SIBLING',
        'CHILD',
        'UNRELATED',
    ];

    it('accepts each of the 5 relationships', () => {
        for (const r of allRels) {
            expect(SpatialRelationshipSchema.parse(r)).toBe(r);
        }
    });

    it('rejects an unknown relationship', () => {
        expect(() => SpatialRelationshipSchema.parse('ANCESTOR')).toThrow();
    });
});
