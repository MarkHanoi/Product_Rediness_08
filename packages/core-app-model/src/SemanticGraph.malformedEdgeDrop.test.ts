// §GR10-DESERIALIZE-DROP-REPORT — the pin, FLIPPED (C71 §5.7 · C70 L-INV-1 / I-INV-3)
//
// THE ROW: `check-graph-persistence` ARM E, finding `deserialize/silent-malformed-drop`,
// ledgered in graph-persistence-debt.json:
//
//     "deserialize silently discards edges missing id/type/sourceId/targetId.
//      Fix: count the drops and report them on the load result instead of
//      falling through."
//
// WHY THIS IS BIGGER THAN ITS SIZE. Every graph measurement in the BIM 3.0
// register is taken AFTER a load. If load discards edges without saying so, then
// every "the graph has N edges" reading is an unknown UNDERSTATEMENT, and a graph
// that never had an edge is the same value as a graph that lost one. That is the
// L-INV-1 collision this programme exists to eliminate, wearing a persistence
// defect's clothes.
//
// ── WHAT THIS FILE PROVES, AND WHAT IT DOES NOT (C74 §3.4) ───────────────────
// REAL: `SemanticGraphManager.deserialize` — the production method, never
//   re-implemented here. Assertions read STORED state (`size`, `getAll()`,
//   `lastLoadReport`) AFTER the load, never the deserializer's return alone —
//   §2 deliberately throws the return value away and re-reads the manager.
// NOT REAL: `ProjectLoader.load()` is not executed (it needs ~40 singleton
//   stores, a live CommandManager and a DOM bus — the same limitation
//   `provenanceSlicePersistence.test.ts` records). The loaders' CONSUMPTION of
//   the drop report is PINNED BY SOURCE ASSERTION against both production
//   ProjectLoader files (§4), so deleting either turns this suite red.
//   Whether a UI surface renders `LoadResult.warnings` is UNPROVEN here and is
//   NOT claimed — it is the same residual ARM C already prints, and it is the
//   honest boundary of this lane.
//
// ── HISTORY OF THIS FILE ─────────────────────────────────────────────────────
// Commit 1 (probe) measured the defect: 6 rows in, 3 edges out, 0 places that
// said so, and §2 was `it.fails` — a declared failure. This commit lands the fix
// and flips both: the numbers below are now the REQUIRED behaviour, and §2 is a
// plain `it` that goes red the moment the report is dropped again.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SemanticGraphManager, type SemanticGraph } from './SemanticGraph';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

/**
 * A snapshot slice as a real project would carry it: three well-formed edges and
 * three that a writer produced malformed. Typed through `as unknown as` on the
 * bad rows only — the point is precisely that these shapes reach `deserialize`
 * at runtime from JSON that no compiler ever checked.
 */
function sliceWithThreeBadRows(): SemanticGraph {
    const good = (id: string, sourceId: string, targetId: string) => ({
        id,
        type: 'hosts' as const,
        sourceId,
        targetId,
        createdAt: 1_700_000_000_000,
        createdBy: 'system',
    });
    return {
        version: 1,
        relationships: [
            good('rel-1', 'wall-1', 'door-1'),
            // BAD 1 — no id. Written by a path that forgot to mint one.
            { type: 'hosts', sourceId: 'wall-2', targetId: 'door-2', createdAt: 1, createdBy: 'system' },
            good('rel-2', 'wall-3', 'door-3'),
            // BAD 2 — no targetId. The other half of the reference is gone.
            { id: 'rel-3', type: 'hosts', sourceId: 'wall-4', createdAt: 1, createdBy: 'system' },
            // BAD 3 — no sourceId.
            { id: 'rel-4', type: 'hosts', targetId: 'door-5', createdAt: 1, createdBy: 'system' },
            good('rel-5', 'wall-6', 'door-6'),
        ] as unknown as SemanticGraph['relationships'],
    };
}

describe('§1 — the graph still LOADS: a malformed row is never fatal', () => {
    it('admits every well-formed row and refuses only the three that cannot be edges', () => {
        const g = new SemanticGraphManager();
        const slice = sliceWithThreeBadRows();

        // Must not throw. Refusing to open a project because one edge is
        // malformed is a worse product than dropping it (the lane's §4).
        expect(() => g.deserialize(slice)).not.toThrow();

        // STORED state after the load.
        expect(slice.relationships.length).toBe(6);
        expect(g.size).toBe(3);
        expect(g.getAll().map((r) => r.id).sort()).toEqual(['rel-1', 'rel-2', 'rel-5']);
    });
});

describe('§2 — the drop is COUNTED and NAMED in STORED state, not just returned', () => {
    it('lastLoadReport survives the call and names all three refusals', () => {
        const g = new SemanticGraphManager();

        // Deliberately DISCARD the return value: everything below reads the
        // manager, so a fix that only returned a report would fail here.
        g.deserialize(sliceWithThreeBadRows());

        const report = g.lastLoadReport;
        expect(report).not.toBeNull();
        expect(report!.presented).toBe(6);
        expect(report!.loaded).toBe(3);
        expect(report!.loaded).toBe(g.size);          // the report matches reality
        expect(report!.dropped.length).toBe(3);
        expect(report!.absent).toBeNull();            // the slice WAS readable

        // Never a bare count (C70 L-INV-3): each refusal names its row.
        expect(report!.dropped.map((d) => `${d.index}:${d.id ?? '<none>'}:${d.reason}`)).toEqual([
            '1:<none>:missing-id',
            '3:rel-3:missing-targetId',
            '4:rel-4:missing-sourceId',
        ]);
        for (const d of report!.dropped) expect(d.detail.length).toBeGreaterThan(20);
    });

    it('a clean slice reports zero drops — [] means "nothing refused", never "I did not look"', () => {
        const g = new SemanticGraphManager();
        g.deserialize({
            version: 1,
            relationships: [{
                id: 'rel-1', type: 'hosts', sourceId: 'w', targetId: 'd',
                createdAt: 1, createdBy: 'system',
            }],
        });
        expect(g.lastLoadReport!.dropped).toEqual([]);
        expect(g.lastLoadReport!.loaded).toBe(1);
        expect(g.lastLoadReport!.absent).toBeNull();
    });

    it('a repeated id no longer silently overwrites — two rows in, one edge out, and it SAYS so', () => {
        const g = new SemanticGraphManager();
        const row = (sourceId: string) => ({
            id: 'rel-dupe', type: 'hosts' as const, sourceId, targetId: 'd',
            createdAt: 1, createdBy: 'system',
        });
        g.deserialize({ version: 1, relationships: [row('w-first'), row('w-second')] });

        expect(g.size).toBe(1);
        expect(g.getAll()[0]!.sourceId).toBe('w-first');   // first wins, explicitly
        expect(g.lastLoadReport!.dropped.map((d) => d.reason)).toEqual(['duplicate-id']);
    });
});

describe('§3 — UNREADABLE is not EMPTY (C70 L-INV-1)', () => {
    it('an unreadable slice and a genuinely empty graph are no longer the same value', () => {
        const unreadable = new SemanticGraphManager();
        unreadable.deserialize({ version: 1 } as unknown as SemanticGraph);

        const genuinelyEmpty = new SemanticGraphManager();
        genuinelyEmpty.deserialize({ version: 1, relationships: [] });

        // Both hold zero edges — that part was never the defect.
        expect(unreadable.size).toBe(0);
        expect(genuinelyEmpty.size).toBe(0);

        // But they now report DIFFERENT facts, which is the whole point.
        expect(unreadable.lastLoadReport!.absent).toBe('relationships-not-an-array');
        expect(genuinelyEmpty.lastLoadReport!.absent).toBeNull();
    });

    it('a project switch never lets one load report describe another graph', () => {
        const g = new SemanticGraphManager();
        g.deserialize(sliceWithThreeBadRows());
        expect(g.lastLoadReport!.dropped.length).toBe(3);

        g.clear();                                   // what projectScopeRegistry calls
        expect(g.lastLoadReport).toBeNull();         // null ≠ "loaded, nothing refused"
    });
});

describe('§4 — the loaders CONSUME the report (source-pinned; load() is not executable here)', () => {
    const LOADERS = [
        'packages/persistence-client/src/loader/ProjectLoader.ts',
        'apps/editor/src/engine/persistence/ProjectLoader.ts',
    ];

    for (const rel of LOADERS) {
        it(`${rel} routes the drop count into result.warnings`, () => {
            const src = readFileSync(resolve(REPO, rel), 'utf8');

            // It calls deserialize and KEEPS the answer.
            expect(src).toMatch(/=\s*semanticGraphManager\.deserialize\(/);
            // It reports the refusals on the load result, not only to the console.
            expect(src).toMatch(/graphLoad\.dropped\.length\s*>\s*0/);
            expect(src).toContain('malformed relationship row(s) refused at load');
            expect(src).toMatch(/graphLoad\.absent/);
            // It no longer prints the INPUT length as the restored count — the
            // claim that made a half-refused load look like a full one.
            expect(src).not.toContain('SemanticGraph restored (${snapshot.semanticGraph.relationships.length}');
            expect(src).toContain('relationship rows admitted');
        });
    }
});
