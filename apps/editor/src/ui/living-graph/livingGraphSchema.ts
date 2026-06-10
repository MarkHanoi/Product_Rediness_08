// apps/editor — A.21.D17 Living Building Graph: the overlay's own value types.
//
// L5, READ-ONLY over the UBG. Pure types + the layer vocabulary — no DOM, no
// canvas, no THREE (P2-safe), no I/O. The force-sim (forceSimulation.ts), the
// data binding (livingGraphData.ts), the renderer (LivingGraphCanvas.ts) and the
// panel (LivingGraphOverlay.ts) all speak these shapes.
//
// This is the PRYZM port of the founder's React prototype schema: a GraphNode
// carries its derived architectural metrics (sun exposure, noise) PLUS its live
// sim state (x/y/vx/vy/radius); a GraphEdge declares WHICH relationship LAYERS it
// participates in (a single pair of rooms can be adjacent AND acoustically
// separated AND share a sun aspect — one edge, multiple layers), so toggling a
// layer simply changes which springs are active in the sim.
//
// Spec: docs/03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md. Governance:
// ADR-0058 (UBG substrate; specialised graphs are projections).

/**
 * The five relationship LAYERS the Living Graph models as springs. Each active
 * layer contributes attraction along the edges that declare it; toggling a layer
 * off removes its springs and the field re-settles to answer a different
 * "spatial question" (e.g. Acoustic on → noisy/quiet rooms pull apart).
 *
 * | layer           | the spatial question it answers |
 * |-----------------|---------------------------------|
 * | `adjacency`     | which rooms physically touch?   |
 * | `circulation`   | how do you move between rooms (doors / corridors)? |
 * | `environmental` | which rooms share a sun aspect (daylight clustering)? |
 * | `acoustic`      | which rooms must be acoustically separated (loud ↔ quiet)? |
 * | `structural`    | which wet/service rooms should stack/cluster (risers)? |
 */
export type EdgeLayer =
  | 'adjacency'
  | 'circulation'
  | 'environmental'
  | 'acoustic'
  | 'structural'
  // §49 FIVE-GRAPH — the founder's two NEW relationship classes the prototype
  // layers never carried: ACCESS (route depth/privacy from the entrance) and
  // SEPARATION (negative "should-NOT-touch" relations). Both ride the same edge
  // mechanism (a GraphEdge tagged with the layer); SEPARATION is derived in the
  // binder from the privacy gradient, ACCESS is stubbed pending the route solver.
  | 'access'
  | 'separation';

/** The closed, ordered layer set — drives the sim + (legacy) toggle chips. */
export const EDGE_LAYERS: readonly EdgeLayer[] = [
  'adjacency',
  'circulation',
  'environmental',
  'acoustic',
  'structural',
  'access',
  'separation',
] as const;

/**
 * §49 FIVE-GRAPH MODEL (founder 2026-06-10, ADR-0068) — the FIVE DISTINCT named
 * graphs the user picks between in the dropdown, replacing the "one dense
 * everything-network" the layer chips produced. The **Circulation graph is the
 * MASTER** (source of truth, default selection). Each view renders ONLY its own
 * (sparse) edge set so an optimiser — and the eye — can tell "must connect" from
 * "should be near" from "must NOT touch" from "people move through here".
 *
 * | view          | the relationship it isolates                              | maps to EdgeLayer |
 * |---------------|-----------------------------------------------------------|-------------------|
 * | `circulation` | walkable routes (MASTER / source of truth)                | `circulation`     |
 * | `access`      | how you REACH a room — depth/privacy/route from entrance  | `access` (stub)   |
 * | `adjacency`   | functional must-touch / preferred / optional adjacency    | `adjacency`       |
 * | `separation`  | negative "should-NOT-touch" relations (privacy/acoustic)  | `separation`(NEW) |
 * | `service`     | wet-area clustering for plumbing/MEP only                 | `structural`      |
 */
export type GraphView = 'circulation' | 'access' | 'adjacency' | 'separation' | 'service';

/** The closed, ordered view set — drives the dropdown. Circulation FIRST = master/default. */
export const GRAPH_VIEWS: readonly GraphView[] = [
  'circulation',
  'access',
  'adjacency',
  'separation',
  'service',
] as const;

/** §49 — the EdgeLayer each named graph renders. Circulation/Adjacency/Service
 *  map onto existing (real) layers; Access/Separation onto the two new layers. */
export const GRAPH_VIEW_LAYER: Record<GraphView, EdgeLayer> = {
  circulation: 'circulation',
  access: 'access',
  adjacency: 'adjacency',
  separation: 'separation',
  service: 'structural',
};

/** §49 — which views carry REAL derived data today vs. are stubbed ("coming
 *  soon" in the dropdown) pending a deeper engine slice. Circulation/Adjacency/
 *  Service + Separation are real; Access awaits the entrance-rooted route solver. */
export const GRAPH_VIEW_READY: Record<GraphView, boolean> = {
  circulation: true,
  access: false, // stub — needs the entrance-rooted route/depth solver (S-Access)
  adjacency: true,
  separation: true, // derived from the privacy gradient (see livingGraphData)
  service: true,
};

/** §49 — dropdown labels (the master is marked). */
export const GRAPH_VIEW_LABEL: Record<GraphView, string> = {
  circulation: 'Circulation (master)',
  access: 'Access',
  adjacency: 'Functional Adjacency',
  separation: 'Separation',
  service: 'Service / Wet-core',
};

/** §49 — one-line description shown under the dropdown for the active view. */
export const GRAPH_VIEW_HINT: Record<GraphView, string> = {
  circulation: 'Walkable routes — the source-of-truth graph that drives generation.',
  access: 'How you reach each room (depth & privacy from the entrance). Coming soon.',
  adjacency: 'Functional adjacency: must-touch / preferred / optional.',
  separation: 'Negative relations — rooms that should NOT touch (privacy / acoustic).',
  service: 'Wet-area clustering for plumbing / MEP stacking only.',
};

/** §49 — the default (master) view the dropdown opens on. */
export const DEFAULT_GRAPH_VIEW: GraphView = 'circulation';

/**
 * The functional ROOM-TYPE taxonomy (the prototype's `inferRoomType` output).
 * Drives node colour (semantic, not brand) + the acoustic/environmental
 * derivations. `unknown` is the safe fallback for an unclassifiable space.
 */
export type RoomKind =
  | 'living'
  | 'sleeping'
  | 'service'
  | 'wet'
  | 'circulation'
  | 'entry'
  | 'unknown';

/** A simulated node — a ROOM (furniture/non-room UBG nodes are excluded). */
export interface GraphNode {
  /** UBG node id (stable across rebuilds → positions are preserved). */
  readonly id: string;
  /** Human label ("Master Bedroom"), already humanised. */
  label: string;
  /**
   * §UBG-LEVEL-TAG — the storey this room belongs to (humanised level name/id),
   * so a multi-storey house's rooms are distinguishable in the graph. `undefined`
   * for a single-level model (no chip rendered). Read from the UBG node's
   * `levelId` prop that the roomGraph adapter stamps.
   */
  level?: string;
  /** Functional room type — colour + metric derivations key off this. */
  type: RoomKind;
  /**
   * The room's raw occupancy / program tag as the model carries it
   * ("Bedroom", "Kitchen", "Bathroom"…), humanised. Surfaced in the inspector
   * so the user sees the REAL program label, not only the coarse `type`.
   * `undefined` when the node carries no occupancy tag.
   */
  occupancy?: string;
  /** Floor area (m²); drives node radius (√area). 0 when unknown. */
  areaSqm: number;
  /** Derived daylight/sun exposure ∈ [0,1] (environmental layer halo). */
  sunExposure: number;
  /** Derived noise level ∈ [0,1] (acoustic layer ring). */
  noiseLevel: number;
  // ── live sim state (mutated in place by the force sim) ──
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Render radius in px (√area scaled). */
  radius: number;
}

/**
 * A relationship between two rooms, tagged with EVERY layer it belongs to. The
 * sim sums attraction over the edge's ACTIVE layers; `weight` scales the spring
 * (e.g. adjacency length, door count). `a`/`b` are node ids.
 */
export interface GraphEdge {
  readonly a: string;
  readonly b: string;
  /** Which relationship layers this edge participates in (≥1). */
  layers: EdgeLayer[];
  /** Relation strength (≥0); scales spring stiffness + render emphasis. */
  weight: number;
}

/** Which layers are currently active (toggle state). */
export type LayerState = Record<EdgeLayer, boolean>;

/** The full live graph the overlay simulates + renders. */
export interface LiveGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** All layers on by default (the prototype's initial state). §49: the dropdown
 *  now overrides this each frame with a SINGLE active view; this default is kept
 *  for the legacy chip path + the initial (pre-dropdown) state. */
export function defaultLayerState(): LayerState {
  return {
    adjacency: true,
    circulation: true,
    environmental: true,
    acoustic: true,
    structural: true,
    access: false,
    separation: false,
  };
}

/** §49 — a LayerState that shows ONLY the one named graph the dropdown selected
 *  (every other layer off), so the canvas renders that view's sparse edge set
 *  alone. This is how the dropdown collapses the old dense multi-layer network. */
export function layerStateForView(view: GraphView): LayerState {
  const target = GRAPH_VIEW_LAYER[view];
  return {
    adjacency: target === 'adjacency',
    circulation: target === 'circulation',
    environmental: target === 'environmental',
    acoustic: target === 'acoustic',
    structural: target === 'structural',
    access: target === 'access',
    separation: target === 'separation',
  };
}

/** Semantic node colour per room type (kept from the prototype — these read as
 *  meaning, NOT brand chrome). Unknown rooms fall to PRYZM purple. */
export const ROOM_TYPE_COLOUR: Record<RoomKind, string> = {
  living: '#6f42ff', // social / living — violet
  sleeping: '#3a7bd5', // private / sleeping — calm blue
  service: '#13a89e', // kitchen / utility — teal
  wet: '#1aa6b7', // bathroom / wc — aqua
  circulation: '#b07bff', // corridor / hall — pale violet
  entry: '#8a5cff', // entrance / lobby — indigo
  unknown: '#6600ff', // PRYZM purple fallback
};

/** Edge colour per LAYER (semantic — distinguishes the relationship kinds). */
export const EDGE_LAYER_COLOUR: Record<EdgeLayer, string> = {
  adjacency: 'rgba(102,0,255,0.55)', // brand purple — physical touch
  circulation: 'rgba(176,123,255,0.75)', // pale violet — movement
  environmental: 'rgba(255,176,32,0.7)', // amber — sun / daylight
  acoustic: 'rgba(225,75,140,0.7)', // magenta — noise separation
  structural: 'rgba(19,168,158,0.7)', // teal — wet/service clustering
  access: 'rgba(60,140,220,0.75)', // blue — route depth from the entrance (§49)
  separation: 'rgba(220,60,70,0.7)', // red — negative "should-NOT-touch" (§49)
};

/** Human-friendly layer label for the toggle chips. */
export const EDGE_LAYER_LABEL: Record<EdgeLayer, string> = {
  adjacency: 'Adjacency',
  circulation: 'Circulation',
  environmental: 'Sun',
  acoustic: 'Acoustic',
  structural: 'Structural',
  access: 'Access',
  separation: 'Separation',
};
