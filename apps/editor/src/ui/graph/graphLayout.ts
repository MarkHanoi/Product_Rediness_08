// apps/editor — GRAPH.3: deterministic force-directed layout + visual vocabulary
// for the living-blob Building-Graph overlay.
//
// L5, READ-ONLY over the UBG. Pure math + a colour map; no DOM, no canvas, no
// THREE (P2-safe). The overlay (BuildingGraphOverlay) owns rendering; this file
// owns only the node POSITIONS and the kind/edge → colour vocabulary so the two
// concerns stay testable and the spring sim is deterministic (seeded by node id,
// not Math.random — so the same graph always lays out the same way).
//
// Spec: docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md
// §4.1 (fluid/living aesthetic). Governance: ADR-0058 (UBG substrate).

import type { UbgEdge, UbgEdgeType, UbgNode } from '@pryzm/building-graph';

/** A laid-out node: the source node plus its simulated position + velocity. */
export interface LaidOutNode {
  readonly node: UbgNode;
  /** World-ish position in layout space (centred on the origin). */
  x: number;
  y: number;
  /** Velocity carried between integration steps (Verlet-ish). */
  vx: number;
  vy: number;
  /** Soft-body radius (blob size), derived from degree. */
  radius: number;
  /** Colour for this node's kind. */
  colour: string;
}

/** A laid-out edge resolves both endpoints to laid-out nodes (or null if an
 *  endpoint is unmaterialised — those edges are dropped from the draw list). */
export interface LaidOutEdge {
  readonly edge: UbgEdge;
  readonly from: LaidOutNode;
  readonly to: LaidOutNode;
  readonly colour: string;
}

export interface GraphLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  /** id → laid-out node, for O(1) hover/neighbour lookups. */
  index: Map<string, LaidOutNode>;
}

// ── Visual vocabulary — PRYZM purple family + kind/edge accents ───────────────
// The hero colour is #6600FF; node kinds spread across an analogous
// violet→magenta→indigo band so the field reads as ONE purple organism, not a
// rainbow. Unknown kinds fall back to the hero purple.

const HERO = '#6600FF';

const KIND_COLOURS: Record<string, string> = {
  room: '#7A3CFF',
  space: '#7A3CFF',
  wall: '#5A2BD6',
  door: '#9B4DFF',
  window: '#B266FF',
  zone: '#6633CC',
  level: '#4422AA',
  building: '#3A1C8C',
  site: '#2E1670',
  furniture: '#C24DFF',
  system: '#8A5CFF',
  rule: '#FF4D9B', // violations pop magenta so breaches read at a glance
  circulation: '#A877FF',
};

/** Edge accent by relation type — kept in the same purple band but tinted so
 *  the flowing bridges hint at WHAT the relation is without a legend. */
const EDGE_COLOURS: Record<UbgEdgeType, string> = {
  bounds: 'rgba(90,43,214,0.55)',
  adjacentTo: 'rgba(122,60,255,0.45)',
  connectsTo: 'rgba(155,77,255,0.65)',
  circulatesVia: 'rgba(168,119,255,0.6)',
  hostedIn: 'rgba(178,102,255,0.6)',
  servesZone: 'rgba(102,51,204,0.5)',
  derivesFrom: 'rgba(138,92,255,0.5)',
  dependsOn: 'rgba(102,0,255,0.55)',
  precededBy: 'rgba(68,34,170,0.45)',
  violates: 'rgba(255,77,155,0.7)',
};

export function colourForKind(kind: string): string {
  return KIND_COLOURS[kind] ?? HERO;
}

export function colourForEdge(type: UbgEdgeType): string {
  return EDGE_COLOURS[type] ?? 'rgba(102,0,255,0.5)';
}

export const HERO_PURPLE = HERO;

// ── Deterministic seed from a node id (FNV-1a → [0,1)) ────────────────────────
// We seed the initial ring placement from the id so the same graph always
// produces the same layout (no Math.random — the overlay must look stable across
// rebuilds, only flexing when the graph actually changes).

function hash01(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // → unsigned, then to [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

// ── Build the initial layout (seeded positions + degree-scaled radii) ─────────

const MIN_RADIUS = 14;
const MAX_RADIUS = 34;

export function buildLayout(nodes: UbgNode[], edges: UbgEdge[]): GraphLayout {
  const index = new Map<string, LaidOutNode>();

  // Degree (in+out) per node — drives blob radius so well-connected rooms swell.
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const maxDeg = Math.max(1, ...degree.values());

  // Seed positions on a golden-angle spiral so even a degenerate graph (all
  // isolated nodes) reads as an organic scatter, not a grid. Jitter by the id
  // hash so identical-kind clusters don't perfectly overlap.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const laidOut: LaidOutNode[] = nodes.map((node, i) => {
    const r = 40 + Math.sqrt(i + 1) * 26;
    const theta = i * golden + hash01(node.id) * 0.6;
    const deg = degree.get(node.id) ?? 0;
    const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(deg / maxDeg);
    const lo: LaidOutNode = {
      node,
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      vx: 0,
      vy: 0,
      radius,
      colour: colourForKind(node.kind),
    };
    index.set(node.id, lo);
    return lo;
  });

  const laidOutEdges: LaidOutEdge[] = [];
  for (const edge of edges) {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    if (!from || !to) continue; // unmaterialised endpoint — drop from draw list
    laidOutEdges.push({ edge, from, to, colour: colourForEdge(edge.type) });
  }

  return { nodes: laidOut, edges: laidOutEdges, index };
}

// ── Force simulation — a small O(n²) spring layout, deterministic & capped ────
//
// Classic Fruchterman-Reingold-ish forces: every pair repels (Coulomb), every
// edge attracts (Hooke), and a gentle gravity pulls the whole field toward the
// origin so it never drifts off-canvas. No Barnes-Hut — fine for the node counts
// a single apartment/floor produces (tens, low hundreds). We expose ONE step so
// the caller controls iteration count (warm-up burst + a slow perpetual breathe
// for the "living" feel).

export interface ForceParams {
  /** Repulsion strength between every node pair. */
  repulsion: number;
  /** Spring (edge) stiffness. */
  attraction: number;
  /** Desired edge rest length. */
  restLength: number;
  /** Centre-pull so the field stays framed. */
  gravity: number;
  /** Velocity damping per step (0..1; lower = more viscous/liquid). */
  damping: number;
  /** Max displacement per step (cooling clamp — prevents explosions). */
  maxStep: number;
}

export const DEFAULT_FORCES: ForceParams = {
  repulsion: 9000,
  attraction: 0.012,
  restLength: 96,
  gravity: 0.015,
  damping: 0.82,
  maxStep: 28,
};

/**
 * Advance the simulation ONE step in place. Returns the total kinetic energy of
 * the system (callers can stop warm-up early once it falls below a threshold).
 * Deterministic given identical input positions.
 */
export function stepForces(
  layout: GraphLayout,
  params: ForceParams = DEFAULT_FORCES,
): number {
  const { nodes, edges } = layout;
  const n = nodes.length;

  // Repulsion — every unordered pair.
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
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
      const force = params.repulsion / d2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Attraction — along each edge (Hooke toward rest length).
  for (const { from, to } of edges) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (dist - params.restLength) * params.attraction;
    const fx = (dx / dist) * f;
    const fy = (dy / dist) * f;
    from.vx += fx;
    from.vy += fy;
    to.vx -= fx;
    to.vy -= fy;
  }

  // Gravity + integrate + cool.
  let energy = 0;
  for (const node of nodes) {
    node.vx -= node.x * params.gravity;
    node.vy -= node.y * params.gravity;
    node.vx *= params.damping;
    node.vy *= params.damping;
    // Clamp the per-step displacement so a sparse graph can't fling apart.
    const sx = Math.max(-params.maxStep, Math.min(params.maxStep, node.vx));
    const sy = Math.max(-params.maxStep, Math.min(params.maxStep, node.vy));
    node.x += sx;
    node.y += sy;
    energy += sx * sx + sy * sy;
  }
  return energy;
}
