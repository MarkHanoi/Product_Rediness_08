/**
 * §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3) — the semantic read must REFUSE, by name,
 * when it cannot run.
 *
 * What this pins, and why each assertion is shaped the way it is:
 *
 * Before this fix, `getSemanticRelationships` and `getAffectedByDeletion` both
 * guarded on `sgm.getEdges` — a method `SemanticGraphManager` has never exposed.
 * Both guards were permanently true and both functions returned `[]`
 * unconditionally. The engine's whole semantic read path was dead code, and the
 * deadness was invisible because `[]` is ALSO what a genuinely unrelated element
 * produces.
 *
 * Therefore a test that merely asserted `severedRelationships.length > 0` on a
 * populated graph would be a fair test of the read — but a test asserting
 * "non-empty" is NOT enough on its own, because the failure being fixed is the
 * conflation of two distinct states. The load-bearing assertions here are the ones
 * that demand the refusal NAME ITS REASON (`reason`, `requiredMethod`, and a
 * `detail` sentence that mentions the missing method). A `[]`-returning
 * implementation cannot satisfy them, and neither can one that refuses generically.
 *
 * §3 below is the direct regression: a manager object exposing ONLY `getEdges` —
 * exactly the shape the old guard was written against.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { speculativeEngine } from '../src/SpeculativeEngine';

type Rel = { id: string; type: string; sourceId: string; targetId: string };

/** A stand-in with the REAL query surface of SemanticGraphManager. */
function fakeManager(rels: Rel[]) {
    return {
        getRelationships: (elementId: string) =>
            rels.filter(r => r.sourceId === elementId || r.targetId === elementId),
        getTargets: (sourceId: string, type: string) =>
            rels.filter(r => r.sourceId === sourceId && r.type === type).map(r => r.targetId),
        getSources: (targetId: string, type: string) =>
            rels.filter(r => r.targetId === targetId && r.type === type).map(r => r.sourceId),
        getAll: () => rels,
    };
}

function install(mgr: unknown): void {
    (window as { semanticGraphManager?: unknown }).semanticGraphManager = mgr;
}

describe('SpeculativeEngine — semantic read refusals (W2-3)', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        delete (window as { semanticGraphManager?: unknown }).semanticGraphManager;
    });

    // ── §1  Graph not installed ───────────────────────────────────────────────

    it('refuses by name when window.semanticGraphManager is absent', () => {
        install(undefined);

        const preview = speculativeEngine.preview({ type: 'delete-wall', elementId: 'wall-1' });

        expect(preview.semanticReadRefusals).toHaveLength(1);
        const r = preview.semanticReadRefusals[0]!;
        expect(r.reason).toBe('graph-absent');
        expect(r.elementId).toBe('wall-1');
        expect(r.requiredMethod).toBe('getRelationships');
        // The sentence must NAME what was missing — a generic failure string is the
        // defect, not the fix.
        expect(r.detail).toContain('semanticGraphManager');
        expect(r.detail).toContain('wall-1');
        expect(r.detail).toMatch(/unknown/i);

        // …and the emptiness it reports must not be mistaken for a clean read.
        expect(preview.severedRelationships).toEqual([]);
        expect(preview.affectedElements).toEqual([]);
    });

    // ── §2  Graph installed, method missing ───────────────────────────────────

    it('refuses by name when the manager lacks getRelationships', () => {
        install({ getAll: () => [] });

        const preview = speculativeEngine.preview({ type: 'delete-wall', elementId: 'wall-2' });

        expect(preview.semanticReadRefusals).toHaveLength(1);
        const r = preview.semanticReadRefusals[0]!;
        expect(r.reason).toBe('method-absent');
        expect(r.requiredMethod).toBe('getRelationships');
        expect(r.detail).toContain('getRelationships');
        expect(r.detail).toContain('wall-2');
    });

    // ── §3  The exact HEAD bug shape ──────────────────────────────────────────

    it('REGRESSION: a manager exposing only getEdges is refused, not silently emptied', () => {
        // This is precisely what the pre-fix guard was written against. On the broken
        // implementation this call returned `severedRelationships: []` with no refusal
        // at all — indistinguishable from an unrelated wall.
        install({ getEdges: (_id: string) => [{ targetId: 'door-9', type: 'hosts' }] });

        const preview = speculativeEngine.preview({ type: 'delete-wall', elementId: 'wall-3' });

        expect(preview.semanticReadRefusals.map(x => x.reason)).toEqual(['method-absent']);
        expect(preview.semanticReadRefusals[0]!.detail).toContain('getRelationships');
        expect(preview.severedRelationships).toEqual([]);
    });

    // ── §4  The query throws ──────────────────────────────────────────────────

    it('refuses by name when the query throws', () => {
        install({
            getRelationships: () => { throw new Error('index corrupt'); },
        });

        const preview = speculativeEngine.preview({ type: 'delete-wall', elementId: 'wall-4' });

        expect(preview.semanticReadRefusals).toHaveLength(1);
        const r = preview.semanticReadRefusals[0]!;
        expect(r.reason).toBe('query-threw');
        expect(r.detail).toContain('index corrupt');
    });

    // ── §5  A successful read that finds nothing is NOT a refusal ─────────────

    it('distinguishes "no relationships" from "could not read"', () => {
        install(fakeManager([]));

        const preview = speculativeEngine.preview({ type: 'delete-wall', elementId: 'wall-5' });

        expect(preview.semanticReadRefusals).toEqual([]);
        expect(preview.severedRelationships).toEqual([]);
        expect(preview.affectedElements).toEqual([]);
    });

    // ── §6  A successful read that finds edges ────────────────────────────────

    it('reports edges in BOTH directions and their far ends', () => {
        install(fakeManager([
            { id: 'r1', type: 'hosts',    sourceId: 'wall-6', targetId: 'door-1'  },
            { id: 'r2', type: 'hostedBy', sourceId: 'win-1',  targetId: 'wall-6'  },
            { id: 'r3', type: 'hosts',    sourceId: 'wall-7', targetId: 'door-2'  },
        ]));

        const preview = speculativeEngine.preview({ type: 'delete-wall', elementId: 'wall-6' });

        expect(preview.semanticReadRefusals).toEqual([]);
        expect(preview.severedRelationships).toHaveLength(2);
        expect(preview.severedRelationships.map(r => r.type).sort()).toEqual(['hostedBy', 'hosts']);

        // The far end, not blindly `targetId` — a target-only projection would have
        // reported `wall-6` itself as affected by its own deletion via r2.
        expect(preview.affectedElements.sort()).toEqual(['door-1', 'win-1']);
    });
});
