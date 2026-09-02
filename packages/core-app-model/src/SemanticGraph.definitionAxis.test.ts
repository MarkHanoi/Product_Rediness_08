// ─── C71 §2.7 — THE DEFINITION AXIS, and its four obligations in one place ───
//
// `instantiates` · `specializes` · `dependsOnDefinition` are the first families
// in this graph whose endpoints are NOT both element instances (C71 §1.5). C71
// §2.6 requires a new member to land with FOUR things together — a writer, a
// TYPED reader, a rebuild disposition, and a delete behaviour on both endpoints
// with what undo restores — because "§1.2 made mechanical at the moment of
// introduction … is the only moment it is cheap". This suite is that PR's
// evidence, one describe block per obligation.
//
// WHAT IT DRIVES. A real `SemanticGraphManager` in every case. A stub built from
// the assertion could only prove the stub agrees with it, and the property under
// test here — that FAILURE and EMPTINESS are different values — is exactly the
// property a stub cannot have.
//
// ⚠ WHAT IT DOES NOT PROVE, stated so silence is never read as coverage: the
// PRODUCTION WRITER. C71 §2.7 obligation 1 is "the command that creates the
// relationship, and ONLY that command", and the component placement command is
// Phase 4C's, which has not landed (`packages/schemas/src/elements/Component.ts`
// does not exist at the time of writing). These tests drive the WRITE API
// (`recordInstantiation` and its two siblings) directly, which is the seam that
// command calls. A passing suite here is NOT a claim that anything in production
// writes these edges yet.

import { describe, expect, it } from 'vitest';
import {
    SemanticGraphManager,
    AUTHOR_KEYED_RELATIONSHIP_TYPES,
    DEFINITION_AXIS_RELATIONSHIP_TYPES,
    DEFINITION_AXIS_ENDPOINT_KINDS,
    isDefinitionAxisRelationship,
    type Relationship,
} from './SemanticGraph.js';

/** A window definition with one Medium type and two placed occurrences. */
function placedSlice(): SemanticGraphManager {
    const g = new SemanticGraphManager();
    g.recordInstantiation('inst-1', 'def-window');
    g.recordInstantiation('inst-2', 'def-window');
    g.recordSpecialization('type-medium', 'def-window', 'definition');
    return g;
}

describe('C71 §2.7 — node kinds are DECLARED, never inferred (§1.5 semantic 7)', () => {
    it('declares an endpoint kind for every definition-axis family, per side', () => {
        for (const family of DEFINITION_AXIS_RELATIONSHIP_TYPES) {
            const kinds = DEFINITION_AXIS_ENDPOINT_KINDS[family];
            expect(kinds.source).toBeTruthy();
            expect(kinds.target.length).toBeGreaterThan(0);
        }
        expect(DEFINITION_AXIS_ENDPOINT_KINDS.instantiates).toEqual({
            source: 'instance',
            target: ['definition'],
        });
        // `specializes` is the one family with TWO legal target kinds — C65's
        // T1-T4 tiering. If this ever collapses to one, the tiering stopped
        // being traversable and the reader below is answering a narrower question.
        expect(DEFINITION_AXIS_ENDPOINT_KINDS.specializes.target).toEqual(['definition', 'type']);
    });

    it('resolves the SIDE an id sits on from the writer mark and the edge position', () => {
        const g = placedSlice();
        expect(g.resolveDefinitionAxisNodeKind('inst-1', 'instantiates')).toEqual({
            side: 'source',
            nodeKind: 'instance',
        });
        expect(g.resolveDefinitionAxisNodeKind('def-window', 'instantiates')).toEqual({
            side: 'target',
            nodeKind: 'definition',
        });
    });

    it('⛔ REFUSES to place an id it has no declaration for — it does not guess a direction', () => {
        const g = placedSlice();
        // `def-window` is a definition and a well-known node — but nothing has
        // ever said a word about it under `dependsOnDefinition`.
        expect(g.resolveDefinitionAxisNodeKind('def-window', 'dependsOnDefinition')).toBeNull();
        expect(g.resolveDefinitionAxisNodeKind('who-is-this', 'instantiates')).toBeNull();
    });

    it('never consults an id PREFIX (C71 §1.5 MUST NOT) — an ElementType-shaped id resolves by declaration alone', () => {
        const g = new SemanticGraphManager();
        // An id that LOOKS like an element instance is a definition here, because
        // the writer declared it as one. A prefix-reading resolver would answer
        // 'instance' and hand a caller the wrong kind of ids.
        g.markDefinitionAxisCoverage('definition', ['wall-1234']);
        expect(g.resolveDefinitionAxisNodeKind('wall-1234', 'instantiates')).toEqual({
            side: 'target',
            nodeKind: 'definition',
        });
    });

    it('membership test agrees with the declared set', () => {
        expect(isDefinitionAxisRelationship('instantiates')).toBe(true);
        expect(isDefinitionAxisRelationship('hosts')).toBe(false);
    });
});

describe('C71 §2.6 obligation 1 + 2 — the WRITE API and its TYPED readers', () => {
    it('instantiates: forward reader answers "what IS this thing?" without a mesh', () => {
        const g = placedSlice();
        const q = g.getInstantiatedDefinition('inst-1');
        expect(q.ok).toBe(true);
        if (q.ok) expect(q.definitionId).toBe('def-window');
    });

    it('⭐ instantiates: REVERSE reader answers "which instances exist over this definition?"', () => {
        const g = placedSlice();
        const q = g.getInstancesOfDefinition('def-window');
        expect(q.ok).toBe(true);
        if (q.ok) expect([...q.instanceIds].sort()).toEqual(['inst-1', 'inst-2']);
    });

    it('FAILURE ≠ EMPTINESS: a covered definition with nothing placed answers a POSITIVE empty', () => {
        const g = new SemanticGraphManager();
        g.markDefinitionAxisCoverage('definition', ['def-fresh']);
        const q = g.getInstancesOfDefinition('def-fresh');
        expect(q.ok).toBe(true);
        if (q.ok) expect(q.instanceIds).toEqual([]);
    });

    it('FAILURE ≠ EMPTINESS: an id no writer covered REFUSES, and names why', () => {
        const g = placedSlice();
        const q = g.getInstancesOfDefinition('def-never-heard-of');
        expect(q.ok).toBe(false);
        if (!q.ok) {
            expect(q.reason).toBe('id-unknown-to-instantiates-writer');
            expect(q.detail).toContain('NO ANSWER');
        }
    });

    it('instantiates: two definitions for one occurrence is CORRUPTION, and it refuses rather than picking one', () => {
        const g = new SemanticGraphManager();
        g.recordInstantiation('inst-1', 'def-a');
        g.recordInstantiation('inst-1', 'def-b');
        const q = g.getInstantiatedDefinition('inst-1');
        expect(q.ok).toBe(false);
        if (!q.ok) expect(q.reason).toBe('instance-instantiates-multiple-definitions');
    });

    it('specializes: both directions, and the parent KIND comes off the edge, not a guess', () => {
        const g = new SemanticGraphManager();
        g.recordSpecialization('type-medium', 'def-window', 'definition');
        g.recordSpecialization('type-medium-tall', 'type-medium', 'type');

        const fwd = g.getSpecializedParent('type-medium-tall');
        expect(fwd.ok).toBe(true);
        if (fwd.ok) {
            expect(fwd.parentId).toBe('type-medium');
            expect(fwd.parentKind).toBe('type');
        }
        const rev = g.getSpecializationsOf('def-window');
        expect(rev.ok).toBe(true);
        if (rev.ok) expect(rev.typeIds).toEqual(['type-medium']);
    });

    it('dependsOnDefinition: both directions, deduped by DEFINITION even when two slots author it', () => {
        const g = new SemanticGraphManager();
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-right');

        const fwd = g.getDefinitionDependencies('def-window');
        expect(fwd.ok).toBe(true);
        // TWO edges (they are distinct facts), ONE dependency — reporting the
        // same dependent twice would overstate the blast radius.
        expect(g.getRelationships('def-window', 'dependsOnDefinition')).toHaveLength(2);
        if (fwd.ok) expect(fwd.dependsOnIds).toEqual(['def-frame']);

        const rev = g.getDefinitionDependents('def-frame');
        expect(rev.ok).toBe(true);
        if (rev.ok) expect(rev.dependentIds).toEqual(['def-window']);
    });

    it('⭐ C112 §3.2 — two SLOTS onto one definition are TWO edges, and the unkeyed shape collapses them (the scramble control)', () => {
        const keyed = new SemanticGraphManager();
        keyed.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        keyed.recordDefinitionDependency('def-window', 'def-frame', 'slot-right');
        expect(keyed.getRelationships('def-window', 'dependsOnDefinition')).toHaveLength(2);

        // THE CONTROL — strip the key and the same two writes collapse onto one
        // edge. Without this arm the assertion above proves nothing: it could
        // pass on a graph that always inserts.
        const unkeyed = new SemanticGraphManager();
        unkeyed.addRelationship({ type: 'dependsOnDefinition', sourceId: 'def-window', targetId: 'def-frame', createdBy: 'system' });
        unkeyed.addRelationship({ type: 'dependsOnDefinition', sourceId: 'def-window', targetId: 'def-frame', createdBy: 'system' });
        expect(unkeyed.getRelationships('def-window', 'dependsOnDefinition')).toHaveLength(1);
    });

    it('re-writing the SAME slot is idempotent — the keying does not degrade into "always insert"', () => {
        const g = new SemanticGraphManager();
        const first = g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        const again = g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        expect(again).toBe(first);
        expect(g.getRelationships('def-window', 'dependsOnDefinition')).toHaveLength(1);
    });

    it('only dependsOnDefinition is author-keyed — the C112 §3.2 membership test, applied', () => {
        expect(AUTHOR_KEYED_RELATIONSHIP_TYPES).toContain('dependsOnDefinition');
        expect(AUTHOR_KEYED_RELATIONSHIP_TYPES).not.toContain('instantiates');
        expect(AUTHOR_KEYED_RELATIONSHIP_TYPES).not.toContain('specializes');
    });

    it('C71 §2.7 — the CYCLE question, which no expression engine can answer', () => {
        const g = new SemanticGraphManager();
        g.recordDefinitionDependency('def-a', 'def-b', 's1');
        g.recordDefinitionDependency('def-b', 'def-c', 's2');
        const clean = g.findDefinitionDependencyCycle('def-a');
        expect(clean.ok).toBe(true);
        if (clean.ok) expect(clean.cycle).toBeNull();

        g.recordDefinitionDependency('def-c', 'def-a', 's3');
        const looped = g.findDefinitionDependencyCycle('def-a');
        expect(looped.ok).toBe(true);
        // The ORDERED path, repeated id last — so a caller can NAME the loop.
        if (looped.ok) expect(looped.cycle).toEqual(['def-a', 'def-b', 'def-c', 'def-a']);
    });
});

describe('C71 §2.6 obligation 3 — the rebuild disposition is PERSIST-ONLY, and it survives the wire', () => {
    it('all three families survive a REAL JSON round-trip, authoredBy included', () => {
        const g = placedSlice();
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-right');
        const before = g.size;

        // A real wire, not a structural copy: `authoredBy` is part of edge
        // IDENTITY, so a serializer that drops it re-collapses the pair on reload
        // (C112 §3.2 arm 4/6).
        const wire = JSON.parse(JSON.stringify(g.serialize())) as ReturnType<SemanticGraphManager['serialize']>;
        const g2 = new SemanticGraphManager();
        const load = g2.deserialize(wire);

        expect(load.dropped).toEqual([]);
        expect(load.loaded).toBe(before);
        expect(g2.getRelationships('def-window', 'dependsOnDefinition')).toHaveLength(2);
        expect(
            g2.getRelationships('def-window', 'dependsOnDefinition').map((r) => r.authoredBy).sort(),
        ).toEqual(['slot-left', 'slot-right']);
    });

    it('an instance still knows what it is after a reload — the loss C71 §2.7 calls the most expensive', () => {
        const g = placedSlice();
        const g2 = new SemanticGraphManager();
        g2.deserialize(JSON.parse(JSON.stringify(g.serialize())) as ReturnType<SemanticGraphManager['serialize']>);
        const q = g2.getInstantiatedDefinition('inst-1');
        expect(q.ok).toBe(true);
        if (q.ok) expect(q.definitionId).toBe('def-window');
    });

    it('the coverage MARKS are derived and do NOT survive — so a reloaded empty definition refuses rather than lying', () => {
        const g = new SemanticGraphManager();
        g.markDefinitionAxisCoverage('definition', ['def-fresh']);
        const g2 = new SemanticGraphManager();
        g2.deserialize(JSON.parse(JSON.stringify(g.serialize())) as ReturnType<SemanticGraphManager['serialize']>);
        // Honest rather than unfortunate: the mark is not a persisted fact, and
        // inventing one on load would be asserting coverage nothing established.
        const q = g2.getInstancesOfDefinition('def-fresh');
        expect(q.ok).toBe(false);
    });
});

describe('C71 §2.6 obligation 4 — DELETE, on both endpoints, and what undo restores', () => {
    it('deleting the INSTANCE purges its edges and leaves the definition KNOWN, now placed nowhere', () => {
        const g = placedSlice();
        g.removeAllRelationshipsForElement('inst-1');
        g.removeAllRelationshipsForElement('inst-2');

        expect(g.getInstantiatedDefinition('inst-1').ok).toBe(false);
        const q = g.getInstancesOfDefinition('def-window');
        // ⭐ THE MARK OUTLIVES THE EDGES. Without it this is indistinguishable
        // from an unknown id, and the delete would silently downgrade a
        // determined answer to an undetermined one.
        expect(q.ok).toBe(true);
        if (q.ok) expect(q.instanceIds).toEqual([]);
    });

    it('undo restores the purged edges VERBATIM (the 3ee632f6 reference shape)', () => {
        const g = placedSlice();
        const captured: Relationship[] = g.getRelationships('inst-1').map((r) => ({ ...r }));
        g.removeAllRelationshipsForElement('inst-1');
        expect(g.getInstantiatedDefinition('inst-1').ok).toBe(false);

        for (const rel of captured) {
            g.addRelationship({
                type: rel.type,
                sourceId: rel.sourceId,
                targetId: rel.targetId,
                createdBy: rel.createdBy,
                ...(rel.authoredBy !== undefined ? { authoredBy: rel.authoredBy } : {}),
                ...(rel.metadata ? { metadata: rel.metadata } : {}),
            });
        }
        const q = g.getInstantiatedDefinition('inst-1');
        expect(q.ok).toBe(true);
        if (q.ok) expect(q.definitionId).toBe('def-window');
    });

    it('⛔ deleting a DEFINITION is a REFUSAL question — the disposition names the instances, never cascades', () => {
        const g = placedSlice();
        const d = g.getDefinitionDeleteDisposition('def-window');
        expect(d.ok).toBe(false);
        if (!d.ok) {
            expect(d.reason).toBe('definition-has-live-instances');
            expect([...d.instanceIds].sort()).toEqual(['inst-1', 'inst-2']);
            expect(d.detail).toContain('MUST NOT');
        }
        // And the instances are STILL THERE — asking the question deleted nothing.
        expect(g.getInstantiatedDefinition('inst-1').ok).toBe(true);
    });

    it('a definition with dependents refuses too, and names them', () => {
        const g = new SemanticGraphManager();
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        const d = g.getDefinitionDeleteDisposition('def-frame');
        expect(d.ok).toBe(false);
        if (!d.ok) {
            expect(d.reason).toBe('definition-has-dependents');
            expect(d.dependentIds).toEqual(['def-window']);
        }
    });

    it('⛔ an id NO writer covered REFUSES the disposition — it never reads as "safe to delete"', () => {
        const g = placedSlice();
        const d = g.getDefinitionDeleteDisposition('def-never-heard-of');
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.reason).toBe('definition-axis-node-kind-undetermined');
    });

    it('a known definition with nothing over it is UNOBSTRUCTED — the refusal is not a refuse-everything', () => {
        const g = new SemanticGraphManager();
        g.markDefinitionAxisCoverage('definition', ['def-unused']);
        expect(g.getDefinitionDeleteDisposition('def-unused').ok).toBe(true);
    });

    it('⭐ C112 §5 — removing ONE SLOT is EDGE-WISE and leaves the other slot standing', () => {
        const g = new SemanticGraphManager();
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-right');

        const removed = g.removeDefinitionDependenciesAuthoredBy('slot-left', ['def-window']);
        expect(removed).toHaveLength(1);
        expect(removed[0]!.authoredBy).toBe('slot-left');

        const survivors = g.getRelationships('def-window', 'dependsOnDefinition');
        expect(survivors).toHaveLength(1);
        expect(survivors[0]!.authoredBy).toBe('slot-right');
    });

    it('⛔ THE OVER-PURGE CONTROL — the endpoint purge tears down BOTH slots, which is why the edge-wise one exists', () => {
        const g = new SemanticGraphManager();
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-right');
        g.removeAllRelationshipsForElement('def-window');
        // The naive repair C112 §5 names as "worse than the defect", measured.
        expect(g.getRelationships('def-window', 'dependsOnDefinition')).toHaveLength(0);
    });

    it('the edge-wise removal returns the edges VERBATIM, so undo restores the key rather than re-deriving it', () => {
        const g = new SemanticGraphManager();
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-left');
        g.recordDefinitionDependency('def-window', 'def-frame', 'slot-right');
        const removed = g.removeDefinitionDependenciesAuthoredBy('slot-left', ['def-window']);

        for (const rel of removed) {
            g.addRelationship({
                type: rel.type,
                sourceId: rel.sourceId,
                targetId: rel.targetId,
                createdBy: rel.createdBy,
                ...(rel.authoredBy !== undefined ? { authoredBy: rel.authoredBy } : {}),
                ...(rel.metadata ? { metadata: rel.metadata } : {}),
            });
        }
        expect(
            g.getRelationships('def-window', 'dependsOnDefinition').map((r) => r.authoredBy).sort(),
        ).toEqual(['slot-left', 'slot-right']);
    });
});
