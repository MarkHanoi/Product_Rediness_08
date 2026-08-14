// §GR-10/GR-14 — "nobody classified this parcel's edges" ≠ "no edge is street
// frontage" (C78 §1.4/§8.1 · C71 §4.4 · §CONTEXT-DATA-HONESTY L-422/457/467/469).
//
// THE SITES: `check-no-empty-means-unknown` ARM C at
// `apps/editor/src/ui/layout/GISAreaLayout.ts:1518` (the shared committed-boundary
// resolver) and `:2437` (the site-data card that renders it).
//
// WHAT THE OLD SHAPE DID. `committed?.edgeClassifications ?? []` then
// `frontEdges > 0 ? \` (\${frontEdges} street frontage)\` : ''` — so an
// UNCLASSIFIED parcel and a LANDLOCKED one both rendered the EMPTY STRING. The
// card asserted "this plot has no street frontage" about a plot nobody had
// measured, and street frontage is the edge buildable depth insets from.
//
// THE DISCIPLINE: every assertion below is DIFFERENTIATING. Each names two
// inputs that produced byte-identical output before the fix and asserts they now
// differ. Collapse them back together and these fail.

import { describe, it, expect } from 'vitest';
import {
    determineParcelEdgeClassifications,
    parcelEdgeClassificationsOrUnknown,
    frontEdgeCount,
    frontageClause,
} from '../src/ui/site/parcelEdgeClassificationDetermination';

describe('determineParcelEdgeClassifications — the two facts `?? []` merged', () => {
    it('DETERMINED and EMPTY — edges examined, none is frontage, is a real answer', () => {
        const d = determineParcelEdgeClassifications([]);
        expect(d.kind).toBe('determined');
        // Load-bearing: refusing on a legitimate empty is the mirror-image defect.
        // A landlocked parcel is a finding, not a failure (C71 §4.4).
        expect(d.kind === 'determined' && d.elements).toEqual([]);
    });

    it('DETERMINED and non-empty', () => {
        const d = determineParcelEdgeClassifications(['front', 'side', 'side', 'back']);
        expect(d.kind === 'determined' && d.elements).toHaveLength(4);
    });

    it('UNDETERMINED — absent, null, and non-array all fail to determine', () => {
        for (const raw of [undefined, null, 'front', 7, {}]) {
            expect(determineParcelEdgeClassifications(raw).kind).toBe('undetermined');
        }
    });

    it('the reason is the closed C78 §8.1 member, and the detail says what went unwritten', () => {
        const d = determineParcelEdgeClassifications(undefined);
        expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
        expect(d.kind === 'undetermined' && d.detail).toContain('edgeClassifications');
    });

    it('THE DIFFERENTIATOR — classified-and-landlocked is NOT EQUAL to never-classified', () => {
        const landlocked = determineParcelEdgeClassifications(['side', 'side', 'rear']);
        const unclassified = determineParcelEdgeClassifications(undefined);
        expect(landlocked.kind).toBe('determined');
        expect(landlocked.kind).not.toBe(unclassified.kind);
        // …and the migration affordance keeps the same distinction as array vs null.
        expect(parcelEdgeClassificationsOrUnknown(['side'])).toEqual(['side']);
        expect(parcelEdgeClassificationsOrUnknown(undefined)).toBeNull();
    });

    it('THE SCHEMA-DEFAULT TRAP — `[]` against a real polygon is UNRECORDED, not landlocked', () => {
        // ParcelBoundarySchema DEFAULTS edgeClassifications to [] while C19 §2.7
        // requires one entry per edge. So a committed, never-classified parcel is
        // schema-valid with `[]` and a 4-edge polygon — and a determination that
        // read bare `[]` as "examined, no frontage" would rebuild the defect one
        // notch deeper. This is the arm the first draft of the fix itself missed.
        const d = determineParcelEdgeClassifications([], 'edges', 4);
        expect(d.kind).toBe('undetermined');
        expect(d.kind === 'undetermined' && d.detail).toContain('C19');
        // A length MISMATCH (not just zero) is equally unrecorded.
        expect(determineParcelEdgeClassifications(['front', 'side'], 'edges', 4).kind).toBe('undetermined');
        // The right length stays determined — including a landlocked one.
        expect(determineParcelEdgeClassifications(['side', 'side', 'rear', 'side'], 'edges', 4).kind).toBe('determined');
        // Without a polygon length the arm cannot fire (nothing to compare against).
        expect(determineParcelEdgeClassifications([], 'edges').kind).toBe('determined');
    });

    it('TOTAL — no input makes the discriminator throw', () => {
        for (const bad of [undefined, null, 0, '', NaN, { edgeClassifications: 1 }]) {
            expect(() => determineParcelEdgeClassifications(bad)).not.toThrow();
        }
    });
});

describe('frontEdgeCount — three values where the old code had two', () => {
    it('counts only the `front` label', () => {
        expect(frontEdgeCount(['front', 'side', 'front', 'back'])).toBe(2);
    });

    it('a classified parcel with no frontage counts ZERO — a real, notable answer', () => {
        expect(frontEdgeCount(['side', 'side', 'back'])).toBe(0);
    });

    it('DIFFERENTIATING — an unclassified parcel counts NULL, not zero', () => {
        expect(frontEdgeCount(undefined)).toBeNull();
        // The whole row reduces to this line. Before the fix both sides were 0.
        expect(frontEdgeCount(undefined)).not.toBe(frontEdgeCount(['side']));
        // And the schema-default `[]` against a real polygon counts NULL too.
        expect(frontEdgeCount([], 4)).toBeNull();
    });
});

describe('frontageClause — the render arm, where the lie was actually printed', () => {
    it('DIFFERENTIATING — unknown and landlocked printed the SAME empty string; now they do not', () => {
        const unknown = frontageClause(undefined);
        const landlocked = frontageClause(['side', 'side']);
        expect(unknown).not.toBe(landlocked);
    });

    it('NO ARM IS EMPTY — an empty string is the render-layer spelling of the same defect', () => {
        // A withheld answer and a negative one must not both print as nothing.
        for (const raw of [undefined, null, [], ['side'], ['front'], ['unclassified']]) {
            expect(frontageClause(raw).trim().length).toBeGreaterThan(0);
        }
    });

    it('the unknown arm SAYS it is unrecorded rather than implying zero', () => {
        expect(frontageClause(undefined)).toContain('not recorded');
        expect(frontageClause(undefined)).not.toContain('no edge');
    });

    it('the schema-default `[]` on a real polygon renders UNRECORDED, not landlocked', () => {
        expect(frontageClause([], 4)).toContain('not recorded');
        expect(frontageClause([], 4)).not.toContain('no edge');
    });

    it('an all-`unclassified` full-length array is an IN-BAND unknown, not a landlocked finding', () => {
        const clause = frontageClause(['unclassified', 'unclassified', 'unclassified'], 3);
        expect(clause).toContain('not yet classified');
        expect(clause).not.toContain('no edge classified');
    });

    it('the landlocked arm states the finding positively', () => {
        expect(frontageClause(['side', 'back'])).toContain('no edge classified');
    });

    it('the counted arm is unchanged for the case that always worked', () => {
        expect(frontageClause(['front', 'side', 'front'])).toBe(' (2 street frontage)');
    });
});

describe('no rival vocabulary — the union comes from command-bus via relationshipDetermination', () => {
    it('the reason is a member the shared discriminator already produces', () => {
        const d = determineParcelEdgeClassifications(undefined);
        expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('the module imports the shared discriminator rather than restating a union', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve, dirname } = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
            resolve(here, '../src/ui/site/parcelEdgeClassificationDetermination.ts'), 'utf8',
        );
        expect(src).toContain("from '../relationshipDetermination'");
        // A twelfth member must be unrepresentable here: no literal union of
        // reason strings may be declared in this file.
        expect(src).not.toMatch(/export type \w*UndeterminedReason\s*=/);
    });
});
