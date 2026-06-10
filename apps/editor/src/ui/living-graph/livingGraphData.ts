// apps/editor — A.21.D17 Living Building Graph: bind the live UBG → LiveGraph.
//
// L5, READ-ONLY over the UBG. Reads the CACHED `window.__pryzmBuildingGraph`
// only (NEVER `pryzmBuildBuildingGraph()` — calling that re-enters and, from
// inside the `pryzm:building-graph-rebuilt` listener, recurses → stack overflow;
// see the §RE-ENTRY guard). Maps ROOM nodes → GraphNodes (furniture + non-room
// kinds excluded), relationship edges → adjacency/circulation GraphEdges, then
// AUGMENTS the edge set with DERIVED acoustic / environmental / structural layers
// per the founder prototype's helpers (`inferRoomType`, `augmentEdges`).
//
// Defensive throughout (white-UI boot / headless / partial models): a missing
// graph yields an empty LiveGraph; a self-intersecting / boundary-less room is
// skipped, never thrown on; `detected < expected` is handled gracefully (we map
// whatever rooms exist).
//
// Spec: docs/03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md §3 (data binding).

import {
  ROOM_TYPE_COLOUR,
  type EdgeLayer,
  type GraphEdge,
  type GraphNode,
  type LiveGraph,
  type RoomKind,
} from './livingGraphSchema';

// ── Minimal structural views of the UBG (no heavy import beyond the type) ──────

interface UbgNodeLike {
  id: string;
  kind: string;
  props?: Record<string, unknown>;
}
interface UbgEdgeLike {
  from: string;
  to: string;
  type: string;
  weight?: number;
}
interface BuildingGraphLike {
  allNodes(): UbgNodeLike[];
  allEdges(): UbgEdgeLike[];
}
interface DataWindow {
  __pryzmBuildingGraph?: BuildingGraphLike;
}

function dw(): DataWindow | undefined {
  return (typeof window !== 'undefined' ? window : undefined) as unknown as DataWindow | undefined;
}

/** Read the CACHED UBG only — never rebuild (re-entry guard). */
export function readCachedBuildingGraph(): BuildingGraphLike | null {
  return dw()?.__pryzmBuildingGraph ?? null;
}

// ── Room-type inference (the prototype's `inferRoomType`) ──────────────────────

/** UBG node kinds we treat as ROOM-like spaces. Everything else (wall, door,
 *  window, furniture, slab, rule…) is excluded from the Living Graph. */
const ROOM_KINDS = new Set(['room', 'space', 'zone']);

interface RoomTypeRule {
  readonly type: RoomKind;
  readonly test: RegExp;
}

// Ordered: first match wins (wet before service so "bathroom" doesn't fall to
// service via a generic keyword). Mirrors the prototype's keyword table.
const ROOM_TYPE_RULES: readonly RoomTypeRule[] = [
  { type: 'wet', test: /bath|wc|toilet|shower|ensuite|powder|washroom/i },
  { type: 'service', test: /kitchen|utility|laundry|pantry|storage|store|service|garage|plant/i },
  { type: 'circulation', test: /corridor|hall|landing|passage|circulation|stair|lobby.?corr/i },
  { type: 'entry', test: /entrance|entry|foyer|lobby|vestibule|porch|hallway/i },
  { type: 'sleeping', test: /bed|sleep|master|nursery|guest.?room|dorm/i },
  { type: 'living', test: /living|lounge|dining|family|sitting|study|office|den|reception|salon|great.?room/i },
];

/** Occupancy / name → functional room type. Reads occupancy first (authoritative
 *  when the enriched graph carries it), then the label, then falls back. */
export function inferRoomType(name: string, occupancy?: string): RoomKind {
  const hay = `${occupancy ?? ''} ${name}`;
  for (const rule of ROOM_TYPE_RULES) if (rule.test.test(hay)) return rule.type;
  return 'unknown';
}

// ── Per-type base metrics (the prototype's noise/sun seeds) ────────────────────
// Where the enriched node carries a real metric we use it; otherwise we derive
// from the room type. Noise: kitchens/living are loud, bedrooms/baths quiet.
// Sun: living/sleeping want daylight; service/wet/circulation tolerate less.

const BASE_NOISE: Record<RoomKind, number> = {
  living: 0.8,
  service: 0.7, // kitchens, utilities
  entry: 0.5,
  circulation: 0.45,
  unknown: 0.4,
  sleeping: 0.2,
  wet: 0.25,
};

const BASE_SUN: Record<RoomKind, number> = {
  living: 0.9,
  sleeping: 0.75,
  entry: 0.5,
  unknown: 0.45,
  circulation: 0.35,
  service: 0.4,
  wet: 0.3,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function humanize(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelOf(node: UbgNodeLike): string {
  const p = node.props ?? {};
  const name =
    str(p.name) ?? str(p.label) ?? str(p.roomName) ?? str(p.roomType) ?? str(p.occupancyType);
  const base = name ? humanize(name) : humanize(node.kind);
  return base.length > 28 ? `${base.slice(0, 27)}…` : base;
}

function occupancyOf(node: UbgNodeLike): string | undefined {
  const p = node.props ?? {};
  return str(p.occupancyType) ?? str(p.occupancy) ?? str(p.roomType) ?? str(p.use);
}

/**
 * Real floor area (m²) for a room node. Prefers an explicit stamped metric
 * (`areaSqm`/`area`/`floorArea`/`areaM2`/`computed.area`), and FALLS BACK to a
 * shoelace area computed from the room's boundary polygon when no scalar is
 * present — so the inspector shows "— m²" only when the room genuinely carries
 * neither a metric NOR a boundary (§LG-REAL-AREA). The previous binder read
 * only the four scalar keys; rooms whose area lives at `computed.area` (the
 * detected-room store shape) or only as a polygon showed "— m²".
 */
function areaOf(node: UbgNodeLike): number {
  const p = node.props ?? {};
  const scalar =
    num(p.areaSqm) ??
    num(p.area) ??
    num(p.floorArea) ??
    num(p.areaM2) ??
    num((p.computed as Record<string, unknown> | undefined)?.area);
  if (scalar !== undefined && scalar > 0) return scalar;
  return polygonArea(p.polygon) || polygonArea(p.boundary) || 0;
}

/** A 2D point on a room boundary, tolerant of `{x,z}` (world plan) or `{x,y}`. */
function pointXY(v: unknown): { x: number; y: number } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const x = num(o.x);
  const y = num(o.z) ?? num(o.y);
  return x !== undefined && y !== undefined ? { x, y } : null;
}

/**
 * Shoelace area of a boundary polygon (absolute, m²). Accepts either a bare
 * vertex array or a `{ polygon: [...] }` wrapper (the detected-room `boundary`
 * shape). Returns 0 for anything that isn't a ≥3-vertex ring.
 */
function polygonArea(raw: unknown): number {
  let ring: unknown = raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    ring = (raw as Record<string, unknown>).polygon;
  }
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const pts: Array<{ x: number; y: number }> = [];
  for (const v of ring) {
    const p = pointXY(v);
    if (p) pts.push(p);
  }
  if (pts.length < 3) return 0;
  let twice = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** §UBG-LEVEL-TAG — the room's storey, humanised. The roomGraph adapter stamps
 *  `levelId` on every room node; a friendlier `levelName` wins if present. Returns
 *  undefined when the node carries no level (single-level model → no chip). */
function levelOf(node: UbgNodeLike): string | undefined {
  const p = node.props ?? {};
  const raw = str(p.levelName) ?? str(p.level) ?? str(p.levelId);
  return raw ? humanize(raw) : undefined;
}

/** Does the node have a usable boundary? Rooms with no boundary / a degenerate
 *  one are SKIPPED (defensive — never crash). We treat a present, ≥3-vertex
 *  polygon OR a positive area as "has boundary"; a self-intersecting boundary the
 *  enriched graph may flag is skipped too. */
function hasUsableBoundary(node: UbgNodeLike, area: number): boolean {
  const p = node.props ?? {};
  if (p.boundaryValid === false || p.selfIntersecting === true) return false;
  if (area > 0) return true;
  const poly = p.polygon ?? p.boundary;
  if (Array.isArray(poly) && poly.length >= 3) return true;
  // No boundary info at all — still admit it (a sealed detected room may carry
  // only a name); it just won't size by area. Skip ONLY explicit invalidity.
  return true;
}

/** Sort node ids deterministically (insertion order is already deterministic,
 *  but we normalise pair keys a<b so undirected edges dedup stably). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

// ── Build the LiveGraph ─────────────────────────────────────────────────────────

/** A node freshly created by the binder (no sim position yet — scattered later). */
function makeNode(ubg: UbgNodeLike): GraphNode {
  const occ = occupancyOf(ubg);
  const label = labelOf(ubg);
  const type = inferRoomType(label, occ);
  const area = areaOf(ubg);
  const p = ubg.props ?? {};
  // Prefer a real enriched metric; else derive from type.
  const sun = clamp01(num(p.sunExposure) ?? num(p.daylightFactor) ?? BASE_SUN[type]);
  const noise = clamp01(num(p.noiseLevel) ?? num(p.acousticLevel) ?? BASE_NOISE[type]);
  // A.21.D34(e) — radius ∝ √area with a wider, more legible spread (min 18, cap
  // 64) so small + large rooms read as distinctly different bubbles. The sim's
  // collision term keeps these circles from overlapping; auto-fit zooms out when
  // the cloud exceeds the canvas, so a larger cap is safe.
  const radius = 18 + Math.sqrt(Math.max(area, 4)) * 2.6;
  const level = levelOf(ubg);
  return {
    id: ubg.id,
    label,
    ...(level ? { level } : {}),
    type,
    ...(occ ? { occupancy: humanize(occ) } : {}),
    areaSqm: area,
    sunExposure: sun,
    noiseLevel: noise,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: Math.min(64, radius),
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** The UBG relationship → base relationship layer mapping (the structural edges
 *  the graph already models). `adjacentTo`/`bounds` → adjacency;
 *  `connectsTo`/`circulatesVia` → circulation. */
const EDGE_TYPE_LAYER: Record<string, EdgeLayer> = {
  adjacentTo: 'adjacency',
  bounds: 'adjacency',
  connectsTo: 'circulation',
  circulatesVia: 'circulation',
};

/**
 * Read the cached UBG and project it to a LiveGraph: room nodes + base
 * (adjacency / circulation) edges, then AUGMENT with derived acoustic /
 * environmental / structural layers. Returns an empty graph if no UBG is cached.
 */
export function buildLiveGraph(): LiveGraph {
  const ubg = readCachedBuildingGraph();
  if (!ubg) return { nodes: [], edges: [] };

  let rawNodes: UbgNodeLike[] = [];
  let rawEdges: UbgEdgeLike[] = [];
  try {
    rawNodes = ubg.allNodes() ?? [];
    rawEdges = ubg.allEdges() ?? [];
  } catch {
    return { nodes: [], edges: [] };
  }

  // 1) Rooms only — exclude furniture + non-room kinds; skip boundary-less /
  //    self-intersecting rooms (defensive).
  const nodes: GraphNode[] = [];
  const roomIds = new Set<string>();
  for (const n of rawNodes) {
    if (!n || !n.id || !n.kind) continue;
    if (!ROOM_KINDS.has(n.kind)) continue;
    const area = areaOf(n);
    if (!hasUsableBoundary(n, area)) continue;
    nodes.push(makeNode(n));
    roomIds.add(n.id);
  }
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 2) Base edges from the UBG relationship types (room↔room only). Merge layers
  //    + max weight per undirected pair.
  const edgeMap = new Map<string, GraphEdge>();
  const addLayer = (a: string, b: string, layer: EdgeLayer, weight: number): void => {
    if (a === b || !roomIds.has(a) || !roomIds.has(b)) return;
    const key = pairKey(a, b);
    const existing = edgeMap.get(key);
    if (existing) {
      if (!existing.layers.includes(layer)) existing.layers.push(layer);
      existing.weight = Math.max(existing.weight, weight);
    } else {
      const [na, nb] = a < b ? [a, b] : [b, a];
      edgeMap.set(key, { a: na, b: nb, layers: [layer], weight });
    }
  };

  for (const e of rawEdges) {
    if (!e || !e.from || !e.to) continue;
    const layer = EDGE_TYPE_LAYER[e.type];
    if (!layer) continue;
    addLayer(e.from, e.to, layer, typeof e.weight === 'number' ? Math.max(0, e.weight) : 1);
  }

  // 3) Augment: derive acoustic / environmental / structural layers from the
  //    room metrics + topology (the prototype's `augmentEdges`).
  augmentEdges(nodes, byId, edgeMap, addLayer);

  return { nodes, edges: [...edgeMap.values()] };
}

/**
 * Derive the three SOFT relationship layers the UBG doesn't model directly,
 * exactly per the prototype's helpers:
 *
 *  • ACOUSTIC — a separation relation between a LOUD room (living/service) and a
 *    QUIET room (sleeping/wet): the bigger the noise gap, the stronger the spring
 *    (so the field pushes them apart when the layer is on). Added only for rooms
 *    that are ADJACENT or close in the existing topology (you only need to
 *    separate neighbours), falling back to all loud↔quiet pairs when topology is
 *    sparse.
 *  • ENVIRONMENTAL — sun-rich rooms (high sunExposure) cluster: a relation
 *    between two daylight-hungry rooms so they gravitate to the same aspect.
 *  • STRUCTURAL — wet/service rooms cluster (shared risers / wet stack): a
 *    relation between any two wet-or-service rooms.
 */
function augmentEdges(
  nodes: GraphNode[],
  _byId: Map<string, GraphNode>,
  edgeMap: Map<string, GraphEdge>,
  addLayer: (a: string, b: string, layer: EdgeLayer, weight: number) => void,
): void {
  const adjacentPairs = new Set<string>();
  for (const e of edgeMap.values()) {
    if (e.layers.includes('adjacency') || e.layers.includes('circulation')) {
      adjacentPairs.add(pairKey(e.a, e.b));
    }
  }
  const hasTopology = adjacentPairs.size > 0;

  const isLoud = (n: GraphNode): boolean => n.noiseLevel >= 0.6;
  const isQuiet = (n: GraphNode): boolean => n.noiseLevel <= 0.35;
  const wantsSun = (n: GraphNode): boolean => n.sunExposure >= 0.7;
  const isWetService = (n: GraphNode): boolean => n.type === 'wet' || n.type === 'service';

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      const key = pairKey(a.id, b.id);
      const adjacent = adjacentPairs.has(key);

      // ACOUSTIC — loud ↔ quiet separation.
      if ((isLoud(a) && isQuiet(b)) || (isLoud(b) && isQuiet(a))) {
        // Only when adjacent (you separate neighbours), or — if the model has no
        // topology yet — for every loud↔quiet pair so the layer still does work.
        if (adjacent || !hasTopology) {
          const gap = Math.abs(a.noiseLevel - b.noiseLevel);
          addLayer(a.id, b.id, 'acoustic', 0.5 + gap);
        }
      }

      // ENVIRONMENTAL — sun-rich rooms cluster.
      if (wantsSun(a) && wantsSun(b)) {
        const shared = Math.min(a.sunExposure, b.sunExposure);
        addLayer(a.id, b.id, 'environmental', shared);
      }

      // STRUCTURAL — wet/service clustering (shared risers / wet stack).
      if (isWetService(a) && isWetService(b)) {
        addLayer(a.id, b.id, 'structural', 1);
      }

      // §49 FIVE-GRAPH — SEPARATION (the founder's "currently missing" negative
      // graph). A "should-NOT-touch" relation between rooms whose PRIVACY gradient
      // clashes (Master--X--Living, Bathroom--X--Dining, Bedroom--X--Entrance):
      // derived from the RoomKind privacy class on the nodes (no programRules
      // import — L5 stays clean). Weight = the clash severity. The render shows it
      // as a RED edge so the eye reads "keep these apart", not "connect these".
      const sep = separationWeight(a.type, b.type);
      if (sep > 0) addLayer(a.id, b.id, 'separation', sep);
    }
  }
}

/**
 * §49 — the SEPARATION weight (0 = no separation desired, →1.5 = strong "keep
 * apart") between two room kinds, from the privacy gradient. Mirrors the engine's
 * `accessFrom`/privacy doctrine (`programRules.ts`) but over the coarse RoomKind
 * the Living Graph already carries, so it needs no L2 import:
 *
 *  • PRIVATE sleeping/wet rooms must not touch PUBLIC living or the ENTRY —
 *    that's the privacy-gradient violation the founder names.
 *  • WET rooms must not touch a social/eating space (bathroom--X--dining).
 *
 * Pure + symmetric + deterministic. Returns 0 for any pair with no clash (most
 * pairs), keeping the Separation graph SPARSE — exactly the founder's intent.
 */
export function separationWeight(a: RoomKind, b: RoomKind): number {
  const isPrivate = (t: RoomKind): boolean => t === 'sleeping' || t === 'wet';
  const isPublic = (t: RoomKind): boolean => t === 'living' || t === 'service';
  const isEntry = (t: RoomKind): boolean => t === 'entry';

  // Bedroom / bathroom directly off the entrance — the sharpest violation.
  if ((isPrivate(a) && isEntry(b)) || (isPrivate(b) && isEntry(a))) return 1.5;
  // Wet room next to a social / eating space (bathroom--X--dining/living/kitchen).
  if ((a === 'wet' && isPublic(b)) || (b === 'wet' && isPublic(a))) return 1.2;
  // Sleeping room next to a loud public space (master--X--living/kitchen).
  if ((a === 'sleeping' && isPublic(b)) || (b === 'sleeping' && isPublic(a))) return 1.0;
  return 0;
}

export { ROOM_TYPE_COLOUR };
