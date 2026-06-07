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
  /** Hard collision push-apart strength so node CIRCLES never overlap. */
  collision: number;
  /** Extra padding (px) added on top of the two radii when colliding. */
  collisionPad: number;
}

// The prototype's BASE constants. These stay the stable, test-facing reference
// geometry (the convergence + spring tests run against these). The LIVE overlay
// never uses these raw — it always calls `scaledParams` (below), which multiplies
// repulsion + rest length UP for a clean, spread-out, panel-filling field. The
// only ADDITIVE change here vs the prototype is the hard collision term, which
// fires solely at short range (overlap) and so leaves the settled spring/repulsion
// geometry — hence the tests — unchanged.
export const DEFAULT_SIM_PARAMS: SimParams = {
  repulsion: 7200,
  attraction: 0.045,
  restLength: 118,
  gravity: 0.02,
  damping: 0.86,
  maxStep: 26,
  collision: 0.65,
  collisionPad: 12,
};

/**
 * A.21.D34(e) — derive spacing-scaled params for the LIVE graph so it spreads to
 * FILL the available canvas instead of the old cramped, overlapping layout. This
 * is what the overlay feeds `simulateStep` (the raw defaults are test-only).
 *
 *  • a BASE spread (~1.7×) over the prototype so even a small plan on the default
 *    panel breathes (the "too compressed" complaint);
 *  • by NODE COUNT — more rooms need more room: repulsion + rest length grow
 *    (sub-linearly, √n) so a 20-room plan isn't a dense knot;
 *  • by CANVAS SIZE — a bigger (resized) panel gets a longer rest length + weaker
 *    centre gravity so the field expands to use the extra space.
 *
 * Returns a fresh params object; `DEFAULT_SIM_PARAMS` is never mutated. Pure +
 * deterministic (no RNG, no time).
 */
export function scaledParams(nodeCount: number, canvasW: number, canvasH: number): SimParams {
  const n = Math.max(1, nodeCount);
  // Base spread so even the smallest graph on the default panel isn't cramped.
  const BASE = 1.7;
  // √n keeps growth gentle; clamp so tiny + huge graphs both stay sane.
  const countScale = Math.min(2.2, Math.max(1, Math.sqrt(n) / 3));
  // Reference canvas ≈ 380×300 (the default panel). Bigger → spread more.
  const minDim = Math.max(240, Math.min(canvasW || 380, canvasH || 300));
  const sizeScale = Math.min(2.2, Math.max(0.9, minDim / 300));
  const spread = BASE * countScale * sizeScale;
  return {
    ...DEFAULT_SIM_PARAMS,
    repulsion: DEFAULT_SIM_PARAMS.repulsion * BASE * countScale * (0.7 + 0.3 * sizeScale),
    restLength: DEFAULT_SIM_PARAMS.restLength * spread,
    // Weaker gravity on a larger field so it doesn't collapse back to centre.
    gravity: DEFAULT_SIM_PARAMS.gravity / Math.max(1, sizeScale * 0.9),
  };
}

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

  // 1b) Collision — a HARD short-range push so node CIRCLES (radius ∝ √area)
  //     never overlap. Distinct from Coulomb repulsion (which is soft + global):
  //     this only fires when two circles' edges are inside `collisionPad`, and it
  //     drives them apart by HALF the overlap each. NOT alpha-scaled, so it stays
  //     effective even as the field cools (overlap must never survive settling).
  //     Deterministic; symmetric.
  for (let i = 0; i < n; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j]!;
      const minDist = a.radius + b.radius + params.collisionPad;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist) continue; // not overlapping
      if (d2 < 1) {
        // Co-incident — separate deterministically by index parity.
        dx = (i % 2 === 0 ? 1 : -1) * 0.5;
        dy = (j % 2 === 0 ? 1 : -1) * 0.5;
        d2 = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(d2);
      const overlap = (minDist - dist) * 0.5 * params.collision;
      const ox = (dx / dist) * overlap;
      const oy = (dy / dist) * overlap;
      a.vx += ox;
      a.vy += oy;
      b.vx -= ox;
      b.vy -= oy;
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

/** The pan/zoom transform that frames the field on the canvas. `scale` ≤ 1 zooms
 *  OUT to fit; offsets re-centre the node cloud's bounding box. */
export interface FitTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * A.21.D34(e) — compute a pan + (down-only) zoom that AUTO-FITS the settled node
 * cloud to the canvas so the graph uses the available space and never spills off
 * the (resizable) panel. Centres the nodes' bounding box (radii + labels
 * included via `pad`) and, if the cloud is bigger than the canvas, zooms OUT to
 * fit (never UP past 1, so a small graph isn't blown up into fuzzy giant
 * bubbles). Pure; returns identity for an empty graph.
 */
export function fitToCanvas(
  nodes: readonly GraphNode[],
  canvasW: number,
  canvasH: number,
  pad = 28,
): FitTransform {
  if (nodes.length === 0) return { offsetX: 0, offsetY: 0, scale: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const r = n.radius + pad;
    if (n.x - r < minX) minX = n.x - r;
    if (n.y - r < minY) minY = n.y - r;
    if (n.x + r > maxX) maxX = n.x + r;
    if (n.y + r > maxY) maxY = n.y + r;
  }
  const cloudW = Math.max(1, maxX - minX);
  const cloudH = Math.max(1, maxY - minY);
  const W = Math.max(1, canvasW);
  const H = Math.max(1, canvasH);
  // Zoom out only (cap at 1) so a sparse graph isn't magnified.
  const scale = Math.min(1, Math.min(W / cloudW, H / cloudH));
  // Centre of the cloud (layout space).
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // The renderer maps a node to canvasCentre + offset + n*scale; to centre the
  // cloud we offset by -centre*scale.
  return { offsetX: -cx * scale, offsetY: -cy * scale, scale };
}
