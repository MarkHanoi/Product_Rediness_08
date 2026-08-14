// §GR-17 — THE UBG IS DERIVED, NOT AUTHORED, WHICH IS WHY IT IS NOT PERSISTED.
//
// THE ROW THIS PINS
// ─────────────────────────────────────────────────────────────────────────────
// GR-17: *"The UBG's own header claims snapshot persistence it does not have —
//         no `ubg` key in `ProjectSerializer.ts`."*
// Fix column: *"correct the header or persist it; do not leave the doc-vs-code
//              drift."*
//
// MEASURED AT HEAD, both halves:
//   · `ProjectSerializer.ts:1083` writes `semanticGraph`; grep for `ubg` in that
//     file returns NOTHING — no key, no reader, no schema slot.
//   · `types.ts` claimed the snapshot *"persists in the `.pryzm` snapshot"*.
// The drift was real. It is resolved in favour of the CODE, and this file is the
// executable half of that decision: it measures the property that makes NOT
// persisting the right answer rather than an omission.
//
// WHY A TEST AND NOT JUST A COMMENT
// ─────────────────────────────────────────────────────────────────────────────
// "It's derived, so we don't persist it" is exactly the kind of claim that rots
// silently — the day someone adds an authored field to a `UbgNode`, the comment
// is wrong again and nothing says so. The argument therefore has to be
// MEASURABLE, and it is: if the UBG is purely projected, then rebuilding it from
// the same sources reproduces it EXACTLY, and anything not derivable from the
// sources cannot survive a rebuild. Both are asserted below.
//
// THE DIFFERENTIATING ARM (the one that matters)
// ─────────────────────────────────────────────────────────────────────────────
// A test that only proved "rebuild == rebuild" would pass just as happily on a
// graph FULL of authored state. The negative arm is what discriminates: a node
// hand-written into the graph — the shape any authored fact would take — is
// GONE after the next rebuild. That is not a bug being pinned; it is the proof
// that the substrate has no authored state to lose, and therefore nothing a
// `ubg` persistence key could protect. If that arm ever fails, the UBG HAS
// acquired authored state, this file's conclusion is void, and the fix is a
// `ubg` key in `ProjectSerializer` WITH a named reader (never a key alone — an
// unread persisted key is the authored-but-unwired hazard in a new costume).
//
// NOT MEASURED HERE, deliberately, so silence is never read as coverage:
//   (a) That `ProjectSerializer.ts` has no `ubg` key. This is an L2 package; it
//       cannot import an L7 editor module, and a test that re-greps a file is a
//       worse instrument than the grep. That half stays source-verified.
//   (b) That the LIVE sources are themselves fully restored on load — that is
//       `check-graph-persistence`'s question, and its ledger of 3 is where the
//       remaining losses (`measuredAt`, `decidedBy`) are named.
//   (c) Runtime reachability of `buildBuildingGraph` (GR-18 / CE-05 territory).

import { describe, it, expect } from 'vitest';
import {
    BuildingGraph,
    createTopologyAdapter,
    createRoomGraphAdapter,
    createSemanticAdapter,
    createDependencyAdapter,
    createConstraintAdapter,
    type UbgSnapshot,
} from '../src/index.js';

/**
 * The five specialised-graph snapshots, exactly as `buildBuildingGraph.ts`
 * extracts them from the live services. Held as ONE value so both builds below
 * are provably fed the same input — a rebuild fed different sources would prove
 * nothing at all.
 */
const SOURCES = {
    topology: {
        relationships: [
            { sourceId: 'w1', targetId: 'r1', kind: 'intersects' as const },
            { sourceId: 'w2', targetId: 'r1', kind: 'intersects' as const },
            { sourceId: 'r1', targetId: 'r2', kind: 'adjacentTo' as const },
        ],
        kindOf: (id: string) => (id.startsWith('w') ? 'wall' : 'room'),
    },
    roomGraph: {
        nodes: [
            { roomId: 'r1', name: 'Living', area: 24 },
            { roomId: 'r2', name: 'Kitchen', area: 11 },
        ],
        edges: [{ fromRoomId: 'r1', toRoomId: 'r2', viaElementId: 'd1' }],
    },
    semantic: {
        // Only the DERIVATION family projects (`semanticAdapter.ts`: branchedFrom /
        // supersedes / precededBy → `derivesFrom`). A first draft of this fixture
        // used `hostedBy`/`boundedBy` and the semantic adapter contributed NOTHING —
        // the test still passed, which is exactly the silent-under-coverage failure
        // the assertion below now forbids.
        relationships: [{ sourceId: 'w2', targetId: 'w1', type: 'branchedFrom' }],
    },
    dependency: {
        edges: [{ dependentId: 'd1', dependsOnId: 'w1' }],
    },
    constraint: {
        violations: [{ elementId: 'd1', ruleId: 'DOOR-CLEARANCE', severity: 'warning' }],
    },
};

/** Run every adapter, in the fixed order `buildBuildingGraph` uses. */
function project(): BuildingGraph {
    const g = new BuildingGraph();
    createTopologyAdapter(SOURCES.topology as never).project(g);
    createRoomGraphAdapter(SOURCES.roomGraph as never).project(g);
    createSemanticAdapter(SOURCES.semantic as never).project(g);
    createDependencyAdapter(SOURCES.dependency as never).project(g);
    createConstraintAdapter(SOURCES.constraint as never).project(g);
    return g;
}

describe('§GR-17 — the UBG is a projection, so a `ubg` persistence key would protect nothing', () => {
    it('POSITIVE — a rebuild from the same sources reproduces the snapshot EXACTLY (so a reload needs no stored copy)', () => {
        const first = project().toJSON() as UbgSnapshot;
        const second = project().toJSON() as UbgSnapshot;

        // Byte-equality, not deep-equality-modulo-order: insertion order is part
        // of the UBG's determinism contract (BuildingGraph header), and a
        // "regenerable" graph whose ORDER wandered would still make an overlay
        // and a diff unstable across reloads.
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        expect(first.nodes.length, 'the fixture must actually produce a graph, or this proves nothing')
            .toBeGreaterThan(0);
        expect(first.edges.length, 'the fixture must actually produce edges, or this proves nothing')
            .toBeGreaterThan(0);
    });

    it('DIFFERENTIATING NEGATIVE — a hand-authored node does NOT survive the rebuild, so there is no authored state to persist', () => {
        const g = project();
        const beforeJson = JSON.stringify(g.toJSON());

        // The shape any authored UBG-only fact would take: a node no adapter can
        // produce, because no source graph holds it.
        g.addNode({ id: 'ubg-only-authored-fact', kind: 'zone', props: { author: 'a human' } });
        expect(g.getNode('ubg-only-authored-fact'), 'the write itself must land, or the arm is testing nothing')
            .toBeTruthy();
        expect(JSON.stringify(g.toJSON())).not.toBe(beforeJson);

        // …and the next projection — which is exactly what a reload performs —
        // reproduces the graph WITHOUT it.
        const rebuilt = project();
        expect(rebuilt.getNode('ubg-only-authored-fact'),
            'an authored UBG node survived a rebuild — the UBG now holds state no source graph can restore, ' +
            'GR-17 must be re-opened, and the fix is a `ubg` key in ProjectSerializer WITH a named reader')
            .toBeUndefined();
        expect(JSON.stringify(rebuilt.toJSON())).toBe(beforeJson);
    });

    it('EVERY projected edge carries its adapter provenance, so no edge is of unknown origin', () => {
        // `evidence` is the field that makes "this came from a source graph"
        // checkable rather than asserted. An edge with no provenance could not be
        // attributed to any adapter — and an unattributable edge is precisely the
        // thing a persistence key would have to preserve.
        const snapshot = project().toJSON() as UbgSnapshot;
        const orphans = snapshot.edges.filter((e) => !e.evidence);
        expect(orphans,
            'edges with no `evidence` cannot be attributed to a projecting adapter: ' +
            JSON.stringify(orphans)).toEqual([]);
    });

    it('ALL FIVE adapters contribute, so "nothing survives a rebuild" is not an artefact of a thin fixture', () => {
        // Without this, a fixture that quietly stopped feeding one adapter would
        // still pass every assertion above while proving nothing about that
        // adapter's family — and the first draft of this file did exactly that
        // (the semantic adapter contributed zero edges for two runs).
        const snapshot = project().toJSON() as UbgSnapshot;
        const adapters = new Set(snapshot.edges.map((e) => (e.evidence ?? '').split(':')[0]));
        expect([...adapters].sort()).toEqual(
            ['constraint', 'dependency', 'roomGraph', 'semantic', 'topology'],
        );
    });
});
