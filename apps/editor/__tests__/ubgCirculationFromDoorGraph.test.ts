/**
 * §FEAT-UBG-CIRCULATION-FROM-DOOR-GRAPH (L-6610) — `circulatesVia`, wired.
 *
 * ADR:        ADR-0343 §D.4 (the UBG is a PROJECTION) · C71 (the vocabulary)
 * Contracts:  C78 (universal relationships) · C01 §6 rule 6 (ABSENT vs UNREACHABLE)
 * Issue log:  L-6610
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PINS, AND WHY EACH ARM IS A DEFECT WAITING TO HAPPEN
 * ═════════════════════════════════════════════════════════════════════════════
 * `circulatesVia` was UNREACHABLE for as long as it existed: the adapter was
 * written and correct, and `extractRoomGraphSnapshot` never set the key it reads.
 * `roomGraphAdapter.ts:71` reads `snapshot.circulationPaths ?? []`, so an absent
 * key is a SILENT NO-OP — which is exactly why nobody noticed. These tests are
 * therefore written so that the silence FAILS:
 *
 *   • no resolver ⇒ no paths (the pre-L-6610 behaviour must be preserved
 *     exactly, or every caller that does not care starts paying for a scan);
 *   • a resolver ⇒ paths, and they come from the AUTHORED room classification,
 *     not from geometry or a guess;
 *   • the path node must NOT take the corridor's own id — `addNode` is
 *     last-write-wins on `kind`, so that would silently demote the corridor from
 *     `room` to `circulation` and strip the `props.levelId` the level filter
 *     joins through;
 *   • an edgeless corridor emits nothing, rather than a route to nowhere;
 *   • `viaRoomIds` is stable across rebuilds, because a graph that reorders
 *     itself between two reads of the same model cannot be diffed.
 */

import { describe, it, expect } from 'vitest';
import {
  buildBuildingGraph,
  extractRoomGraphSnapshot,
  type RoomGraphServiceLike,
  type RoomStoreLike,
} from '../src/engine/buildBuildingGraph.js';

/** One-level RoomGraphService using Maps (the real shape). */
function fakeRoomGraph(graph: {
  levelId: string;
  nodes: Array<{ roomId: string }>;
  edges: Array<{ fromRoomId: string; toRoomId: string; doorId?: string }>;
}): RoomGraphServiceLike {
  const nodes = new Map(graph.nodes.map((n) => [n.roomId, n]));
  const edges = new Map(graph.edges.map((e, i) => [`${e.fromRoomId}|${e.toRoomId}|${i}`, e]));
  return {
    getGraph: (levelId) =>
      levelId === graph.levelId
        ? { levelId, nodes, edges }
        : { levelId, nodes: new Map(), edges: new Map() },
  };
}

/** A room store that answers only `roomType`, which is the field this feature keys on. */
function fakeRoomStore(types: Record<string, string>): RoomStoreLike {
  return { getById: (id) => (types[id] !== undefined ? { id, roomType: types[id] } : undefined) };
}

// A corridor serving two bedrooms, plus a bedroom-to-bedroom door that must NOT
// produce a circulation path (neither end is circulation).
const NODES = [{ roomId: 'corr' }, { roomId: 'bed1' }, { roomId: 'bed2' }, { roomId: 'wc1' }];
const EDGES = [
  { fromRoomId: 'corr', toRoomId: 'bed1', doorId: 'd1' },
  { fromRoomId: 'bed2', toRoomId: 'corr', doorId: 'd2' }, // reversed on purpose
  { fromRoomId: 'bed1', toRoomId: 'bed2', doorId: 'd3' }, // no circulation endpoint
];
const TYPES = { corr: 'corridor', bed1: 'bedroom', bed2: 'bedroom', wc1: 'wc' };

describe('L-6610 — extractRoomGraphSnapshot derives circulationPaths', () => {
  it('⛔ NO RESOLVER ⇒ NO KEY. The pre-L-6610 behaviour is preserved byte for byte', () => {
    const snap = extractRoomGraphSnapshot(
      fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges: EDGES }).getGraph('L1'),
    );
    // The key is OMITTED, not set to []. `circulationPaths` is optional and the
    // adapter reads `?? []`, so the two behave the same — but "no circulation on
    // this storey" and "nobody asked" are different facts and the snapshot is the
    // last place they are distinguishable.
    expect('circulationPaths' in snap).toBe(false);
  });

  it('a corridor yields ONE path carrying the rooms whose doors open onto it', () => {
    const snap = extractRoomGraphSnapshot(
      fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges: EDGES }).getGraph('L1'),
      (id) => TYPES[id as keyof typeof TYPES] ?? null,
    );
    expect(snap.circulationPaths).toHaveLength(1);
    const [path] = snap.circulationPaths!;
    // ⭐ Direction-agnostic: `bed2 -> corr` was recorded reversed and still counts.
    // The door graph is undirected and a corridor serves a room either way.
    expect(path!.viaRoomIds).toEqual(['bed1', 'bed2']);
  });

  it('⛔ the path node id is SYNTHETIC — reusing the room id would demote the corridor', () => {
    const snap = extractRoomGraphSnapshot(
      fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges: EDGES }).getGraph('L1'),
      (id) => TYPES[id as keyof typeof TYPES] ?? null,
    );
    // `BuildingGraph.addNode` is last-write-wins on `kind`, so `id: 'corr'` would
    // overwrite the corridor's `kind:'room'` with `kind:'circulation'` — losing
    // that a corridor IS a room, and stripping the `props.levelId` that only room
    // nodes carry and that the Analysis storey filter joins through.
    expect(snap.circulationPaths![0]!.id).toBe('circulation:corr');
    expect(snap.circulationPaths![0]!.id).not.toBe('corr');
  });

  it('a room the store does not classify as circulation produces NO path', () => {
    const snap = extractRoomGraphSnapshot(
      fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges: EDGES }).getGraph('L1'),
      // Every room is a bedroom — nothing is circulation.
      () => 'bedroom',
    );
    expect(snap.circulationPaths ?? []).toHaveLength(0);
  });

  it('the whole authored Circulation vocabulary is honoured, and nothing outside it', () => {
    // ⛔ ADOPTED from the "Circulation" section of room-topology's RoomTypes.ts.
    // If that section gains a member and this set does not, this test is where it
    // should be noticed.
    for (const t of ['corridor', 'stairwell', 'lift-lobby', 'entrance-lobby', 'foyer']) {
      const snap = extractRoomGraphSnapshot(
        fakeRoomGraph({
          levelId: 'L1',
          nodes: [{ roomId: 'c' }, { roomId: 'r' }],
          edges: [{ fromRoomId: 'c', toRoomId: 'r' }],
        }).getGraph('L1'),
        (id) => (id === 'c' ? t : 'bedroom'),
      );
      expect(snap.circulationPaths, `${t} should be circulation`).toHaveLength(1);
    }
    for (const t of ['bedroom', 'kitchen', 'atrium', 'terrace', 'unclassified']) {
      const snap = extractRoomGraphSnapshot(
        fakeRoomGraph({
          levelId: 'L1',
          nodes: [{ roomId: 'c' }, { roomId: 'r' }],
          edges: [{ fromRoomId: 'c', toRoomId: 'r' }],
        }).getGraph('L1'),
        (id) => (id === 'c' ? t : 'bedroom'),
      );
      expect(snap.circulationPaths ?? [], `${t} must NOT be circulation`).toHaveLength(0);
    }
  });

  it('classification is case- and whitespace-tolerant, because a store is not a schema', () => {
    const snap = extractRoomGraphSnapshot(
      fakeRoomGraph({
        levelId: 'L1',
        nodes: [{ roomId: 'c' }, { roomId: 'r' }],
        edges: [{ fromRoomId: 'c', toRoomId: 'r' }],
      }).getGraph('L1'),
      (id) => (id === 'c' ? '  Corridor ' : null),
    );
    expect(snap.circulationPaths).toHaveLength(1);
  });

  it('⚠ an EDGELESS corridor emits nothing — a route to nowhere is not a route', () => {
    const snap = extractRoomGraphSnapshot(
      fakeRoomGraph({ levelId: 'L1', nodes: [{ roomId: 'corr' }], edges: [] }).getGraph('L1'),
      () => 'corridor',
    );
    // Mid-draw this is a real modelling state. A path node with an empty
    // `viaRoomIds` would put a dot on the diagram connected to nothing while
    // claiming to be a route.
    expect(snap.circulationPaths ?? []).toHaveLength(0);
  });

  it('viaRoomIds is STABLE across rebuilds, so two reads of one model diff cleanly', () => {
    const build = (edges: typeof EDGES) =>
      extractRoomGraphSnapshot(
        fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges }).getGraph('L1'),
        (id) => TYPES[id as keyof typeof TYPES] ?? null,
      ).circulationPaths![0]!.viaRoomIds;

    // Same model, edges recorded in a different order.
    expect(build(EDGES)).toEqual(build([...EDGES].reverse()));
  });
});

describe('L-6610 — the edges reach the graph, not just the snapshot', () => {
  it('⭐ buildBuildingGraph emits circulatesVia end to end', () => {
    // [[committed-is-not-reachable]] — the snapshot being right proves nothing
    // about the graph. This is the arm that would have caught the original defect.
    const g = buildBuildingGraph({
      services: {
        roomGraph: fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges: EDGES }),
        levelIds: ['L1'],
        roomStore: fakeRoomStore(TYPES),
      },
    });
    const circ = g.query({ edgeType: 'circulatesVia' }).edges;
    expect(circ).toHaveLength(2);
    expect(circ.every((e) => e.from === 'circulation:corr')).toBe(true);
    expect(circ.map((e) => e.to).sort()).toEqual(['bed1', 'bed2']);
  });

  it('the corridor KEEPS kind:room — the synthetic node did not overwrite it', () => {
    const g = buildBuildingGraph({
      services: {
        roomGraph: fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges: EDGES }),
        levelIds: ['L1'],
        roomStore: fakeRoomStore(TYPES),
      },
    });
    expect(g.nodes.get('corr')?.kind).toBe('room');
    expect(g.nodes.get('circulation:corr')?.kind).toBe('circulation');
    // …and the corridor still carries its storey, which the Analysis level filter
    // joins through. This is the assertion that fails if the id collision returns.
    expect(g.nodes.get('corr')?.props?.levelId).toBe('L1');
  });

  it('⛔ NO ROOM STORE ⇒ no circulatesVia, and connectsTo is unaffected', () => {
    const g = buildBuildingGraph({
      services: {
        roomGraph: fakeRoomGraph({ levelId: 'L1', nodes: NODES, edges: EDGES }),
        levelIds: ['L1'],
        // roomStore absent — the classification authority is missing.
      },
    });
    expect(g.query({ edgeType: 'circulatesVia' }).edges).toHaveLength(0);
    // The pre-existing family must not regress: absence of the NEW leg may not
    // cost the OLD one.
    expect(g.query({ edgeType: 'connectsTo' }).edges.length).toBeGreaterThan(0);
  });
});
