/**
 * @vitest-environment happy-dom
 *
 * @file packages/ai-host/__tests__/hostsForwardReaderConsumer.test.ts
 *
 * **THE CONSUMER of the typed `hosts` reader (C71 §2.1 #1 / §2.5 / §4.4 · C78 §1.4).**
 *
 * C71 §2.5 is binding: a typed reader exists because a CONSUMER needs it, never
 * to satisfy a gate. This file proves the "what's in wall X" handler is that
 * consumer, and that the difference is USER-VISIBLE.
 *
 * ─── WHAT THIS PROVES ────────────────────────────────────────────────────────
 * The handler was `getTargets(wall.id, 'hosts')` and printed `rows.length` as a
 * fact. `getTargets` returns `[]` for BOTH "this wall hosts nothing" and "the
 * graph has never heard of this wall", so a wall outside the graph produced the
 * sentence *"0 element(s) hosted in wall"* — C78 §1.4's forbidden inference
 * rendered directly into prose the user reads as a determination.
 *
 * `describe('THE DIFFERENTIATOR')` is the centre: the two states now produce
 * different summaries and different row shapes, from the same query string.
 *
 * ─── THE NEGATIVE CONTROL (C70 §5.6) ─────────────────────────────────────────
 * A handler that refused for every wall would satisfy the refusal assertion and
 * destroy the query. `(neg)` pins that a covered wall still answers with a
 * plain definite sentence, no refusal row and no "cannot determine" anywhere.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { semanticQueryEngine } from '../src/SemanticQueryEngine.js';
import { storeRegistry, semanticGraphManager } from '@pryzm/core-app-model';

const WALL = 'w1';
const DOOR = 'door-1';

let spy: ReturnType<typeof vi.spyOn>;

/** Register a wall store holding exactly the one wall the query names. */
function wallStoreWith(id: string) {
    spy = vi.spyOn(storeRegistry, 'getStoreForType' as never).mockImplementation(
        ((t: string) => (t === 'wall' ? { getAll: () => [{ id, name: id }] } : undefined)) as never,
    );
}

/** Exactly what CreateWallOpeningCommand writes, per opening. */
function seedHosting(wallId: string, openingId: string): void {
    semanticGraphManager.addRelationship({
        type: 'hosts', sourceId: wallId, targetId: openingId, createdBy: 'CreateWallOpeningCommand',
    });
    semanticGraphManager.addRelationship({
        type: 'hostedBy', sourceId: openingId, targetId: wallId, createdBy: 'CreateWallOpeningCommand',
    });
}

const ask = () => semanticQueryEngine.query(`elements hosted in wall ${WALL}`);

beforeEach(() => {
    semanticGraphManager.clear();
    wallStoreWith(WALL);
});
afterEach(() => { spy?.mockRestore(); });

describe('THE DIFFERENTIATOR — the same query, two different facts', () => {
    it('a wall the graph has never heard of gets a REFUSAL, not "0 element(s) hosted in wall"', () => {
        // The wall exists in the store; the graph has no edge for it.
        const res = ask();

        expect(res.summary).toContain('Cannot determine');
        expect(res.summary).toContain('wall-unknown-to-hosts-writer');
        expect(res.summary).not.toMatch(/^0 element\(s\)/);
        expect(res.rows.some(r => r.type === 'undetermined')).toBe(true);
    });

    it('a COVERED wall that hosts nothing gets a definite zero — the two states are not the same sentence', () => {
        // Covered by the hosts writer, then the opening is deleted: it hosts
        // nothing, and that is a determination.
        seedHosting(WALL, DOOR);
        semanticGraphManager.removeAllRelationshipsForElement(DOOR);

        const res = ask();

        expect(res.summary).toBe('0 element(s) hosted in wall');
        expect(res.rows).toEqual([]);
        expect(res.rows.some(r => r.type === 'undetermined')).toBe(false);
    });

    it('(neg) NEGATIVE CONTROL — a wall that hosts an opening still answers plainly', () => {
        seedHosting(WALL, DOOR);

        const res = ask();

        expect(res.summary).toBe('1 element(s) hosted in wall');
        expect(res.summary).not.toContain('Cannot determine');
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0]!.id).toBe(DOOR);
        expect(res.rows.some(r => r.type === 'undetermined')).toBe(false);
    });

    it('a corrupt half-pair refuses rather than reporting the survivors as a complete answer', () => {
        seedHosting(WALL, DOOR);
        // A `hosts` edge whose inverse row was dropped at load.
        semanticGraphManager.addRelationship({
            type: 'hosts', sourceId: WALL, targetId: 'window-orphan', createdBy: 'corrupt-slice',
        });

        const res = ask();

        expect(res.summary).toContain('hosts-hostedBy-pair-broken');
        expect(res.rows.some(r => r.type === 'undetermined')).toBe(true);
    });
});
