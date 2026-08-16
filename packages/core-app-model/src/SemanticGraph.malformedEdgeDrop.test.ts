// §GR10-DESERIALIZE-DROP-REPORT — MEASURE-FIRST PIN (C71 §5.7 · C70 L-INV-1 / I-INV-3)
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
//   `lastLoadReport`) AFTER the load, never a pure function's return alone.
// NOT REAL: `ProjectLoader.load()` is not executed (it needs ~40 singleton
//   stores, a live CommandManager and a DOM bus — the same limitation
//   `provenanceSlicePersistence.test.ts` records). The loader's consumption of
//   the drop report is PINNED BY SOURCE ASSERTION against both production
//   ProjectLoader files instead, so deleting either turns this suite red.
//   Whether a UI surface renders `LoadResult.warnings` is UNPROVEN here and is
//   NOT claimed — it is the same residual ARM C already prints.
//
// ── THE PIN ──────────────────────────────────────────────────────────────────
// §1 asserts TODAY'S WRONG BEHAVIOUR with numbers: a six-row slice, three rows
// unusable, three edges in the graph, and NOTHING anywhere that says three rows
// were refused. §2 states the requirement and is `it.fails` at this commit — it
// throws today, by design, and goes RED the moment the fix lands, which is when
// §1's numbers get flipped in the same commit as the fix.

import { describe, it, expect } from 'vitest';
import { SemanticGraphManager, type SemanticGraph } from './SemanticGraph';

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

describe('§1 — MEASURED AT HEAD: the drop is silent (the defect, pinned with numbers)', () => {
    it('admits 3 of 6 rows and the 3 refusals leave no trace anywhere', () => {
        const g = new SemanticGraphManager();
        const slice = sliceWithThreeBadRows();

        g.deserialize(slice);

        // STORED state after load — not the return value.
        expect(slice.relationships.length).toBe(6);
        expect(g.size).toBe(3);
        expect(g.getAll().map((r) => r.id).sort()).toEqual(['rel-1', 'rel-2', 'rel-5']);

        // …and this is the defect: three rows were refused and the graph holds
        // no record that they ever existed. The ONLY observable is a size that
        // is indistinguishable from a project that genuinely had three edges.
        const anyManager = g as unknown as Record<string, unknown>;
        expect(typeof anyManager['lastLoadReport']).toBe('undefined');
    });

    it('a slice that is entirely unreadable is the same value as an empty graph', () => {
        // The second half of the same collision, one line above the drop branch:
        // `if (!data || !Array.isArray(data.relationships)) return;`
        const unreadable = new SemanticGraphManager();
        unreadable.deserialize({ version: 1 } as unknown as SemanticGraph);

        const genuinelyEmpty = new SemanticGraphManager();
        genuinelyEmpty.deserialize({ version: 1, relationships: [] });

        // Two different facts, one value. A caller cannot tell them apart.
        expect(unreadable.size).toBe(genuinelyEmpty.size);
        expect(unreadable.size).toBe(0);
    });
});

describe('§2 — THE REQUIREMENT (C71 §5.7): drops are COUNTED and REPORTED', () => {
    // `it.fails` = this body THROWS at this commit, deliberately, and this suite
    // is green because the failure is declared. It flips to a plain `it` in the
    // commit that lands the fix; if the fix regresses, this line goes red again.
    it.fails('the load result names every refused row — not a bare count, never silence', () => {
        const g = new SemanticGraphManager();
        const report = (g as unknown as {
            deserialize(d: SemanticGraph): { loaded: number; dropped: readonly unknown[] };
        }).deserialize(sliceWithThreeBadRows());

        expect(report.loaded).toBe(3);
        expect(report.dropped.length).toBe(3);
    });
});
