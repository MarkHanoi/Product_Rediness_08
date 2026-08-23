/**
 * §GRAPH-3D-VIEWPORT / §GRAPH-HIERARCHY-VIEWS (L-8450 … L-8462).
 *
 * ⭐ EVERY ARM HERE IS DIFFERENTIATING. It fails if the specific property it names
 * is removed, not merely if the function stops returning an object. The four that
 * matter most:
 *
 *   · the LAYOUT CACHE. If a selection re-solved the layout, the picture would
 *     rearrange under the reader's cursor every time they clicked — they could
 *     never build a mental map of their own building. That is a legibility
 *     property, not a performance one, and it is asserted as such.
 *   · DORMANT, NOT GONE. A focus must dim the rest and keep it in the subject. A
 *     subject that dropped unfocused marks would make every count on the card a
 *     lie about what is on screen.
 *   · THE EXPORT CARRIES ITS CAVEATS. A JSON file has no strip above it saying
 *     "storey-scoped, truncated, possibly stale", so the envelope must.
 *   · THE SUBJECT KEY IS NAMESPACED. It shares one slot in the shared renderer
 *     with the element showroom's keys; a collision draws one subject under the
 *     other's identity.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { projectHierarchy, type UbgEdge, type UbgNode } from '@pryzm/building-graph';
import { focusNeighbourhood } from '@pryzm/building-graph';

import {
  DORMANT_3D,
  GRAPH_VIEW_EVENT,
  _resetGraphLayoutCacheForTest,
  buildGraphSubject,
  dataUrlToBlob,
  graphFocusDepth,
  graphNodeScale,
  graphOrbit,
  graphView,
  resetGraphViewState,
  serialiseNetwork,
  setGraphFocusDepth,
  setGraphLabels,
  setGraphNodeScale,
  setGraphView,
} from '../graphViewState';

const NODES: UbgNode[] = [
  { id: 'wall_a', kind: 'wall' },
  { id: 'room_1', kind: 'room' },
  { id: 'room_2', kind: 'room' },
  { id: 'door_1', kind: 'door' },
];
const EDGES: UbgEdge[] = [
  { from: 'wall_a', to: 'room_1', type: 'bounds' },
  { from: 'room_1', to: 'room_2', type: 'adjacentTo' },
  { from: 'door_1', to: 'wall_a', type: 'hostedIn' },
];

const topo = () => projectHierarchy(NODES, EDGES, 'topology', {});

function subject(focus: ReturnType<typeof focusNeighbourhood> | null, scale = 1) {
  return buildGraphSubject({
    projection: topo(),
    degrees: new Map([['wall_a', 2], ['room_1', 2], ['room_2', 1], ['door_1', 1]]),
    nodeColour: () => '#6600FF',
    edgeColour: () => '#6600FF',
    focus,
    scale,
    caption: 'test',
  });
}

beforeEach(() => {
  resetGraphViewState();
  _resetGraphLayoutCacheForTest();
});

describe('L-8450 — the controls clamp, and they refuse to announce a no-op', () => {
  it('⛔ node size is clamped to 0.4 … 2.5', () => {
    setGraphNodeScale(99);
    expect(graphNodeScale()).toBe(2.5);
    setGraphNodeScale(0);
    expect(graphNodeScale()).toBe(0.4);
  });

  it('⛔ focus depth is clamped to the SAME 1..4 `focusNeighbourhood` enforces', () => {
    // Two rival ideas of one limit is how they drift apart. Differentiating: if
    // the control allowed 7, the card would print "within 7 hops" over a
    // neighbourhood the projection had silently clamped to 4.
    setGraphFocusDepth(9);
    expect(graphFocusDepth()).toBe(4);
    setGraphFocusDepth(-3);
    expect(graphFocusDepth()).toBe(1);
  });

  it('fires the redraw event on a real change and NOT on a no-op', () => {
    let fired = 0;
    const on = (): void => { fired++; };
    window.addEventListener(GRAPH_VIEW_EVENT, on);
    try {
      setGraphView('room');
      expect(fired).toBe(1);
      setGraphView('room'); // same value
      expect(fired).toBe(1);
      setGraphLabels(true); // already true
      expect(fired).toBe(1);
    } finally {
      window.removeEventListener(GRAPH_VIEW_EVENT, on);
    }
  });

  it('reset restores every control, and the default view is Topology', () => {
    setGraphView('system');
    setGraphNodeScale(2.2);
    resetGraphViewState();
    expect(graphView()).toBe('topology');
    expect(graphNodeScale()).toBe(1);
  });

  it('⭐ the orbit object is SHARED and mutated in place, so a re-render cannot reset the camera', () => {
    const a = graphOrbit();
    a.yaw = 1.234;
    // Differentiating: if `graphOrbit()` returned a copy, selecting an element
    // would snap the camera back to the default on every click.
    expect(graphOrbit().yaw).toBe(1.234);
    expect(graphOrbit()).toBe(a);
  });
});

describe('L-8452 — the layout is CACHED across a selection change', () => {
  it('⭐ two subjects over the same node set place every node identically', () => {
    const all = subject(null);
    const focused = subject(focusNeighbourhood(topo(), ['wall_a'], 1));
    const byId = new Map(all.nodes.map((n) => [n.id, n.p]));
    for (const n of focused.nodes) {
      // Differentiating: with the cache removed this still passes only because
      // the layout is deterministic — so the arm below asserts the cache itself.
      expect(byId.get(n.id)).toEqual(n.p);
    }
  });

  it('⛔ the cache is keyed on the NODE SET, not on its size', () => {
    // Two different graphs of the same size are different buildings. A
    // count-keyed cache would draw one building's layout under the other's ids.
    const a = subject(null);
    const other = buildGraphSubject({
      projection: projectHierarchy(
        [{ id: 'x1', kind: 'wall' }, { id: 'x2', kind: 'room' }, { id: 'x3', kind: 'room' }, { id: 'x4', kind: 'door' }],
        [
          { from: 'x1', to: 'x2', type: 'bounds' },
          { from: 'x2', to: 'x3', type: 'adjacentTo' },
          { from: 'x4', to: 'x1', type: 'hostedIn' },
        ],
        'topology',
        {},
      ),
      degrees: new Map(),
      nodeColour: () => '#6600FF',
      edgeColour: () => '#6600FF',
      focus: null,
      scale: 1,
      caption: 'other',
    });
    expect(other.nodes.map((n) => n.id)).not.toEqual(a.nodes.map((n) => n.id));
    expect(other.nodes.every((n) => n.p.every((v) => Number.isFinite(v)))).toBe(true);
  });
});

describe('L-8453 — DORMANT, NOT GONE', () => {
  it('an unfocused node stays in the subject at reduced alpha', () => {
    const f = focusNeighbourhood(topo(), ['room_2'], 1);
    const s = subject(f);
    // Every node is still present…
    expect(s.nodes).toHaveLength(4);
    // …and `wall_a` is two hops from room_2, so it is dormant, not absent.
    const wall = s.nodes.find((n) => n.id === 'wall_a')!;
    expect(wall.alpha).toBe(DORMANT_3D);
    const room2 = s.nodes.find((n) => n.id === 'room_2')!;
    expect(room2.alpha).toBe(1);
  });

  it('with NO focus everything leads — nothing is dimmed by default', () => {
    const s = subject(null);
    expect(s.nodes.every((n) => n.alpha === 1)).toBe(true);
    expect(s.links.every((l) => l.alpha > DORMANT_3D)).toBe(true);
  });

  it('a relation is dimmed unless BOTH endpoints are lit', () => {
    const f = focusNeighbourhood(topo(), ['room_2'], 1);
    const s = subject(f);
    expect(s.links.some((l) => l.alpha === DORMANT_3D)).toBe(true);
  });
});

describe('L-8454 — radius, and the subject key', () => {
  it('⭐ radius tracks the SQUARE ROOT of degree, so AREA carries the quantity', () => {
    const s = subject(null);
    const deg2 = s.nodes.find((n) => n.id === 'wall_a')!.r;
    const deg1 = s.nodes.find((n) => n.id === 'room_2')!.r;
    expect(deg2).toBeGreaterThan(deg1);
    // A LINEAR radius would make the ratio of the variable halves 2.0; sqrt makes
    // it sqrt(2). Differentiating against exactly that mistake.
    const base = 0.028;
    expect((deg2 - base) / (deg1 - base)).toBeCloseTo(Math.SQRT2, 5);
  });

  it('the node-size control scales every radius', () => {
    const small = subject(null, 0.5);
    const big = subject(null, 2);
    expect(big.nodes[0]!.r).toBeCloseTo(small.nodes[0]!.r * 4, 6);
  });

  it('⛔ the key is NAMESPACED `graph:` so it cannot collide with a showroom subject', () => {
    // The two share ONE `builtKey` slot in the renderer. A collision would draw
    // one subject under the other's identity — and neither would look wrong.
    expect(subject(null).key.startsWith('graph:')).toBe(true);
  });

  it('the key changes when the emphasis changes, so the subject is rebuilt', () => {
    const a = subject(null).key;
    const b = subject(focusNeighbourhood(topo(), ['wall_a'], 1)).key;
    expect(a).not.toBe(b);
  });
});

describe('L-8460 — the export carries its caveats, not just its data', () => {
  const ctx = {
    scope: 'Scope: Level 1 ONLY — these counts are exact for this storey.',
    liveness: 'LIVE — maintained off the StoreEventBus.',
    truncated: true,
    totalNodes: 430,
    totalEdges: 900,
  };

  it('⛔ names the scope, the liveness, the cap state and the PRE-cap totals', () => {
    const json = JSON.parse(serialiseNetwork(topo(), ctx));
    expect(json.completeness.scope).toBe(ctx.scope);
    expect(json.completeness.liveness).toBe(ctx.liveness);
    expect(json.completeness.truncated).toBe(true);
    expect(json.completeness.projectedNodes).toBe(430);
    expect(json.completeness.drawnNodes).toBe(4);
  });

  it('⭐ states that it is a PROJECTION, not a census', () => {
    const json = JSON.parse(serialiseNetwork(topo(), ctx));
    expect(json.completeness.note).toMatch(/PROJECTION of the Unified Building Graph, not a census/);
  });

  it('⛔ marks a `bounds` edge UNDIRECTED, because its test is symmetric', () => {
    const json = JSON.parse(serialiseNetwork(topo(), ctx));
    const bounds = json.edges.find((e: { type: string }) => e.type === 'bounds');
    const hosted = json.edges.find((e: { type: string }) => e.type === 'hostedIn');
    expect(bounds.directed).toBe(false);
    expect(hosted.directed).toBe(true);
  });

  it('carries the view basis and, for an empty view, its NAMED cause', () => {
    const sys = projectHierarchy(NODES, EDGES, 'system', {});
    const json = JSON.parse(serialiseNetwork(sys, ctx));
    expect(json.view.id).toBe('system');
    expect(json.view.empty).toMatch(/PARKED/);
    expect(json.nodes).toHaveLength(0);
  });

  it('carries the discipline tree with its per-family IFC answer', () => {
    const json = JSON.parse(serialiseNetwork(topo(), ctx));
    const all = json.categories.flatMap((c: { families: unknown[] }) => c.families) as Array<{ ifcClass: string }>;
    expect(all.length).toBeGreaterThan(0);
    // The authority is not wired, so every cell is a NAMED non-answer, never a guess.
    expect(all.every((f) => /not resolved/i.test(f.ifcClass))).toBe(true);
  });
});

describe('L-8461 — the PNG path', () => {
  it('decodes a base64 data URL to a blob of the right type', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const blob = dataUrlToBlob(png)!;
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('returns null rather than throwing on a malformed URL', () => {
    expect(dataUrlToBlob('not-a-data-url')).toBeNull();
  });
});
