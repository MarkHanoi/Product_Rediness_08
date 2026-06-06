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
  | 'structural';

/** The closed, ordered layer set — drives the toggle chips + the sim. */
export const EDGE_LAYERS: readonly EdgeLayer[] = [
  'adjacency',
  'circulation',
  'environmental',
  'acoustic',
  'structural',
] as const;

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

/** All layers on by default (the prototype's initial state). */
export function defaultLayerState(): LayerState {
  return {
    adjacency: true,
    circulation: true,
    environmental: true,
    acoustic: true,
    structural: true,
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
};

/** Human-friendly layer label for the toggle chips. */
export const EDGE_LAYER_LABEL: Record<EdgeLayer, string> = {
  adjacency: 'Adjacency',
  circulation: 'Circulation',
  environmental: 'Sun',
  acoustic: 'Acoustic',
  structural: 'Structural',
};
