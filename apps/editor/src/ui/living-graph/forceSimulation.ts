// apps/editor — A.21.D17 Living Building Graph: the PURE physics core.
//
// L5, but pure: no DOM, no canvas, no THREE, no I/O, NO Math.random (banned
// repo-wide + it would break determinism). Port of the founder prototype's
// `simulateStep` / `totalEnergy` / `scatterNodes`: a small O(n²) force-directed
// layout —
//
//   • all-pairs Coulomb REPULSION (every node pushes every other apart),
//   • per-ACTIVE-edge Hooke ATTRACTION (only springs whose layer is toggled on
//     pull — this is what makes a layer toggle re-settle the field),
//   • centre GRAVITY (keeps the field framed on the canvas),
//   • integrate + DAMP + per-step CLAMP (cooling, so a sparse graph can't fling),
//   • ALPHA cooling (the sim anneals: each step the effective forces shrink, so
//     it settles and `totalEnergy` falls below a threshold → the ticker stops).
//
// The sim is deterministic given seeded positions; `scatterNodes` seeds an
// organic ring from the node INDEX (golden-angle spiral + index-derived jitter),
// never Math.random — so the same graph always lays out the same way and tests
// are reproducible.
//
// Spec: docs/03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md §4 (physics).

import type { GraphEdge, GraphNode, LayerState, LiveGraph } from './livingGraphSchema';

/** Tunable force parameters (the prototype's constants, named). */
export interface SimParams {
  /** Coulomb repulsion strength between every node pair. */
  repulsion: number;
  /** Hooke spring stiffness per active edge layer. */
  attraction: number;
  /** Desired edge rest length (px). */
  restLength: number;
  /** Centre-pull so the field stays framed. */
  gravity: number;
  /** Velocity damping per step (0..1; lower = more viscous). */
  damping: number;
  /** Max displacement per step (cooling clamp). */
  maxStep: number;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  repulsion: 7200,
  attraction: 0.045,
  restLength: 118,
  gravity: 0.02,
  damping: 0.86,
  maxStep: 26,
};

/** The sim's annealing clock. `alpha` cools toward `alphaMin`; once cool the
 *  field is settled. Reset on rerun / layer-toggle (restart from CURRENT
 *  positions, alpha back up) so the field re-anneals without a full scatter. */
export interface SimState {
  alpha: number;
  readonly alphaMin: number;
  readonly alphaDecay: number;
}

export function createSimState(): SimState {
  return { alpha: 1, alphaMin: 0.02, alphaDecay: 0.04 };
}

/** Re-heat the sim (toggle a layer / rerun) so it re-settles from where it is. */
export function reheat(state: SimState, to = 0.7): void {
  state.alpha = Math.max(state.alpha, to);
}

/** True once the sim has annealed (caller stops ticking). */
export function isSettled(state: SimState): boolean {
  return state.alpha <= state.alphaMin;
}

// ── Deterministic seeding (NO Math.random) ────────────────────────────────────

/**
 * Scatter nodes onto a golden-angle spiral seeded by INDEX, with index-derived
 * jitter so identical-area clusters don't perfectly overlap. Pure + deterministic
 * — the prototype's `scatterNodes`, made RNG-free. Mutates positions + zeroes
 * velocity in place. Nodes in `preserve` keep their existing position (so live
 * rebuilds keep already-settled rooms put; only NEW rooms are scattered).
 */
export function scatterNodes(
  nodes: GraphNode[],
  opts: { preserve?: ReadonlySet<string>; radius?: number } = {},
): void {
  const golden = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399963 rad
  const base = opts.radius ?? 38;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (opts.preserve && opts.preserve.has(n.id)) continue;
    const ring = base + Math.sqrt(i + 1) * 30;
    // Index-derived jitter — deterministic pseudo-noise, never Math.random.
    const jitter = ((i * 2654435761) % 1000) / 1000; // Knuth multiplicative hash → [0,1)
    const theta = i * golden + jitter * 0.7;
    n.x = Math.cos(theta) * ring;
    n.y = Math.sin(theta) * ring;
    n.vx = 0;
    n.vy = 0;
  }
}

// ── One simulation step ───────────────────────────────────────────────────────

/** Does this edge contribute a spring under the active layer state? */
function edgeActive(edge: GraphEdge, active: LayerState): boolean {
  for (const layer of edge.layers) if (active[layer]) return true;
  return false;
}

/** Count of an edge's currently-active layers (more shared active relations →
 *  stronger pull; an adjacent + circulating pair binds tighter than adjacency
 *  alone). */
function activeLayerCount(edge: GraphEdge, active: LayerState): number {
  let c = 0;
  for (const layer of edge.layers) if (active[layer]) c++;
  return c;
}

/**
 * Advance the simulation ONE step in place, honouring the active layer state.
 * Returns the TOTAL KINETIC ENERGY of the system this step (the prototype's
 * `totalEnergy`) so the caller can stop early once it falls below a threshold.
 * Deterministic given identical input positions + params + layer state.
 */
export function simulateStep(
  graph: LiveGraph,
  active: LayerState,
  state: SimState,
  params: SimParams = DEFAULT_SIM_PARAMS,
): number {
  const { nodes, edges } = graph;
  const n = nodes.length;
  const alpha = state.alpha;
  const byId = new Map<string, GraphNode>(nodes.map((nd) => [nd.id, nd]));

  // 1) Repulsion — every unordered pair (Coulomb), scaled by alpha.
  for (let i = 0; i < n; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j]!;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        // Co-incident — nudge apart deterministically by index parity.
        dx = (i % 2 === 0 ? 1 : -1) * 0.5;
        dy = (j % 2 === 0 ? 1 : -1) * 0.5;
        d2 = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(d2);
      const force = (params.repulsion * alpha) / d2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // 2) Attraction — only along edges with an ACTIVE layer (Hooke → rest length).
  //    Strength scales by edge weight × active-layer count, so a pair bound by
  //    several active relations pulls tighter.
  for (const e of edges) {
    if (!edgeActive(e, active)) continue;
    const from = byId.get(e.a);
    const to = byId.get(e.b);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const k = params.attraction * (0.5 + e.weight) * activeLayerCount(e, active) * alpha;
    const f = (dist - params.restLength) * k;
    const fx = (dx / dist) * f;
    const fy = (dy / dist) * f;
    from.vx += fx;
    from.vy += fy;
    to.vx -= fx;
    to.vy -= fy;
  }

  // 3) Gravity + integrate + cool. Total kinetic energy accumulates here.
  let energy = 0;
  for (const node of nodes) {
    node.vx -= node.x * params.gravity * alpha;
    node.vy -= node.y * params.gravity * alpha;
    node.vx *= params.damping;
    node.vy *= params.damping;
    const sx = Math.max(-params.maxStep, Math.min(params.maxStep, node.vx));
    const sy = Math.max(-params.maxStep, Math.min(params.maxStep, node.vy));
    node.x += sx;
    node.y += sy;
    energy += sx * sx + sy * sy;
  }

  // 4) Anneal — cool alpha toward alphaMin so the field settles. The decay is
  //    asymptotic, so once alpha is within an epsilon of alphaMin we SNAP it to
  //    alphaMin so `isSettled` flips cleanly (and the ticker stops).
  state.alpha += (state.alphaMin - state.alpha) * state.alphaDecay;
  if (state.alpha - state.alphaMin < 1e-3) state.alpha = state.alphaMin;

  return energy;
}

/** The current total kinetic energy WITHOUT stepping (the prototype's
 *  `totalEnergy` read-only form) — handy for tests / settle checks. */
export function totalEnergy(graph: LiveGraph): number {
  let energy = 0;
  for (const node of graph.nodes) energy += node.vx * node.vx + node.vy * node.vy;
  return energy;
}

/** Euclidean distance between two nodes (test/inspection helper). */
export function nodeDistance(a: GraphNode, b: GraphNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
