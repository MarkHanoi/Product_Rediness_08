// GR-10 (`[]`-means-unknown ledger, C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// differentiating tests for the ui-side generic discriminator.
//
// THE CENTRE: an ABSENT relationship field and an EMPTY one produce DIFFERENT
// values. Every assertion here fails against the old `expr ?? []` shape, which
// returned `[]` for both — a test that passed under both shapes would prove
// nothing (the lane brief's rule).

import { describe, it, expect } from 'vitest';
import {
    determineRelationshipArray,
    relationshipArrayOrUnknown,
    relationshipUndetermined,
    isRelationshipUndetermined,
    relationshipUndeterminedLabel,
    type RelationshipDetermination,
} from '../src/ui/relationshipDetermination';
import type { BoundingWallDetermination } from '@pryzm/core-app-model';

describe('determineRelationshipArray — absent ≠ empty (C75 §1.4)', () => {
    it('an ABSENT field is undetermined RELATIONSHIP_NOT_RECORDED — never []', () => {
        const d = determineRelationshipArray<string>(undefined, 'openings of wall-1');
        expect(d.kind).toBe('undetermined');
        if (d.kind === 'undetermined') {
            expect(d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
            expect(d.scope).toBe('openings of wall-1');
        }
    });

    it('null and non-array values are undetermined too', () => {
        expect(determineRelationshipArray<string>(null, 's').kind).toBe('undetermined');
        expect(determineRelationshipArray<string>('nope', 's').kind).toBe('undetermined');
        expect(determineRelationshipArray<string>(7, 's').kind).toBe('undetermined');
    });

    it('a PRESENT EMPTY array is DETERMINED — zero members is a real answer (C71 §4.4)', () => {
        const d = determineRelationshipArray<string>([], 'openings of wall-1');
        expect(d).toEqual({ kind: 'determined', elements: [] });
    });

    it('a present populated array is determined with its elements', () => {
        const d = determineRelationshipArray<string>(['a', 'b'], 's');
        expect(d).toEqual({ kind: 'determined', elements: ['a', 'b'] });
    });

    it('a substrate failure can carry RELATIONSHIP_NOT_READABLE — the two reasons are distinct', () => {
        const d = determineRelationshipArray<string>(undefined, 'doors hosted by wall-1', {
            reason: 'RELATIONSHIP_NOT_READABLE',
        });
        expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_READABLE');
    });
});

describe('relationshipArrayOrUnknown — the `?? []` replacement', () => {
    it('absent → null, NEVER [] (the observable difference GR-10 exists to create)', () => {
        expect(relationshipArrayOrUnknown(undefined)).toBeNull();
        expect(relationshipArrayOrUnknown(null)).toBeNull();
        // Regression pin: null must be distinguishable from [] by the caller.
        expect(relationshipArrayOrUnknown(undefined)).not.toEqual([]);
    });

    it('present arrays pass through unchanged, including empty', () => {
        const empty: string[] = [];
        expect(relationshipArrayOrUnknown(empty)).toBe(empty);
        expect(relationshipArrayOrUnknown(['x'])).toEqual(['x']);
    });
});

describe('constructors, guards, labels', () => {
    it('relationshipUndetermined builds the undetermined arm for failure paths', () => {
        const d = relationshipUndetermined('blind facades', 'PLANNER_THREW', 'boom');
        expect(d).toEqual({
            kind: 'undetermined',
            scope: 'blind facades',
            reason: 'PLANNER_THREW',
            detail: 'boom',
        });
        expect(isRelationshipUndetermined(d)).toBe(true);
        expect(relationshipUndeterminedLabel(d)).toContain('PLANNER_THREW');
        expect(relationshipUndeterminedLabel(d)).toContain('blind facades');
    });

    it('isRelationshipUndetermined is false for a determined-empty answer', () => {
        expect(isRelationshipUndetermined({ kind: 'determined', elements: [] })).toBe(false);
    });
});

describe('vocabulary parity — no rival dialect (C69 rival-list rule)', () => {
    it('core-app-model BoundingWallDetermination is assignable to RelationshipDetermination<string>', () => {
        // Compile-time pin: the two discriminators share arm names, field names
        // and meanings, so they cannot drift into rival dialects. A structural
        // fork of either type fails this file's typecheck.
        const fromCore: BoundingWallDetermination = {
            kind: 'undetermined',
            scope: 'bounding walls of room-1',
            reason: 'RELATIONSHIP_NOT_RECORDED',
        };
        const widened: RelationshipDetermination<string> = fromCore;
        expect(widened.kind).toBe('undetermined');
    });
});
