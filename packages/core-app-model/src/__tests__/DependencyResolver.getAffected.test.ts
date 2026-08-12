/**
 * CONNECT-0 (roadmap Phase 5) / C72 §2.3, gap PR-01/PR-04 (F-INV-2) —
 * `getAffected()` as the queryable reverse-dependency answer, and `delete`
 * distinguishing DETERMINED-EMPTY from CANNOT-DETERMINE.
 *
 * The three sentences under test:
 *  1. mutate a wall → the hosted openings and joined walls come back as a
 *     DETERMINED set (the impact substrate that used to read
 *     UNDETERMINED{NO_DEPENDENCY_INDEX});
 *  2. delete a wall → a NON-EMPTY affected set, both pre-purge (live graph)
 *     and post-purge (the capture recorded before the edges left);
 *  3. an element that genuinely affects nothing answers determined-EMPTY,
 *     which is a DIFFERENT value from cannot-determine (ADR-0322 — failure
 *     and emptiness must never print the same thing).
 */

import { describe, it, expect } from 'vitest';

import { DependencyResolver } from '../DependencyResolver';
import { semanticGraphManager } from '../SemanticGraph';

let seq = 0;
function uid(prefix: string): string {
    return `${prefix}_getaffected_${++seq}_${Math.random().toString(36).slice(2, 8)}`;
}

describe('CONNECT-0 — DependencyResolver.getAffected', () => {

    it('update on a wall: hosted opening + joined wall come back DETERMINED', () => {
        const resolver = new DependencyResolver();
        const wall = uid('wall');
        const door = uid('door');
        const wall2 = uid('wall');

        semanticGraphManager.addRelationship({ type: 'hosts', sourceId: wall, targetId: door, createdBy: 'test' });
        semanticGraphManager.addRelationship({ type: 'joinedTo', sourceId: wall, targetId: wall2, createdBy: 'test' });

        const result = resolver.getAffected(wall, 'update');
        expect(result.status).toBe('determined');
        if (result.status !== 'determined') return;

        const ids = result.tasks.map(t => t.elementId);
        expect(ids).toContain(door);
        expect(ids).toContain(wall2);
        // priority ordering: hosts (2) sorts before joinedTo (5, record-only)
        expect(result.tasks[0]!.relationshipType).toBe('hosts');
    });

    it('delete: non-empty affected set BOTH pre-purge and post-purge', () => {
        const resolver = new DependencyResolver();
        const wall = uid('wall');
        const slab = uid('slab');

        semanticGraphManager.addRelationship({ type: 'sitsOn', sourceId: wall, targetId: slab, createdBy: 'test' });

        // Pre-purge (the delete command asking BEFORE it purges): live graph answers.
        const pre = resolver.getAffected(wall, 'delete');
        expect(pre.status).toBe('determined');
        if (pre.status === 'determined') {
            expect(pre.tasks.length).toBeGreaterThan(0);
            expect(pre.tasks[0]!.elementId).toBe(slab);
        }

        // Post-purge (the store-event path, after removeAllRelationshipsForElement):
        // the pre-purge capture answers — NOT an empty array.
        semanticGraphManager.removeAllRelationshipsForElement(wall);
        expect(semanticGraphManager.getRelationships(wall).length).toBe(0);

        const post = resolver.getAffected(wall, 'delete');
        expect(post.status).toBe('determined');
        if (post.status === 'determined') {
            expect(post.tasks.length).toBeGreaterThan(0);
            expect(post.tasks[0]!.elementId).toBe(slab);
        }
    });

    it('determined-EMPTY (observed, zero edges) ≠ cannot-determine (never observed)', () => {
        const resolver = new DependencyResolver();

        // Observed element with genuinely no relationships: a REAL empty answer.
        const loner = uid('loner');
        const observed = resolver.getAffected(loner, 'update');
        expect(observed.status).toBe('determined');
        if (observed.status === 'determined') expect(observed.tasks.length).toBe(0);

        const lonerDelete = resolver.getAffected(loner, 'delete');
        expect(lonerDelete.status).toBe('determined');
        if (lonerDelete.status === 'determined') expect(lonerDelete.tasks.length).toBe(0);

        // Never-observed element with no edges: the resolver REFUSES rather than
        // conflating "affects nothing" with "I cannot know".
        const ghost = uid('ghost');
        const refusal = resolver.getAffected(ghost, 'delete');
        expect(refusal.status).toBe('cannot-determine');
        if (refusal.status === 'cannot-determine') {
            expect(refusal.reason).toContain('NO_DEPENDENCY_INDEX');
        }
    });

    it('the refusal is a different VALUE, not a differently-labelled empty set', () => {
        const resolver = new DependencyResolver();
        const ghost = uid('ghost');
        const refusal = resolver.getAffected(ghost, 'delete');
        // Structural assertion: a cannot-determine carries NO tasks member at all —
        // a consumer cannot accidentally iterate it as an empty cascade.
        expect('tasks' in refusal).toBe(false);
    });
});
