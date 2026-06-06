// @pryzm/building-graph — human labels + element RATIONALE (GRAPH.5 / A.21.D16).
//
// PURE, P5-/L2-safe (no THREE, no DOM, no I/O). This module turns the opaque UBG
// node/edge data into the architecturally MEANINGFUL surface the founder asked
// for (2026-06-06): "room relationships, element relationships, REASONS WHY those
// elements are or have been located in such location."
//
// Three pure read-only projections over a {@link BuildingGraph}:
//   • {@link humanNodeLabel}    — what the node IS ("Master Bedroom",
//                                  "Window · south façade", "Door · Bed↔Corridor").
//   • {@link roomRelationshipSentences} — plain-language neighbour list for a room
//                                  ("connects to Corridor via a door", "adjacent to Kitchen").
//   • {@link nodeRationale}     — WHY the element is where it is, derived ONLY from
//                                  data already on the node/graph (façade orientation,
//                                  room pairing, program role). Never fabricated:
//                                  where no specific reason is derivable we return null.
//
// Every "reason" documents its DATA SOURCE so the rationale is auditable
// (ADR-0058 read-only projection; reasons are computed, not invented).
//
// Spec: docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md §4.2.

import type { BuildingGraph } from './BuildingGraph.js';
import type { UbgNode } from './types.js';
import { withUbgSpan } from './tracing.js';

// ── prop access (tolerant — props are opaque `unknown`) ───────────────────────

function props(node: UbgNode): Record<string, unknown> {
  return (node.props ?? {}) as Record<string, unknown>;
}

function str(node: UbgNode, key: string): string | undefined {
  const v = props(node)[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(node: UbgNode, key: string): number | undefined {
  const v = props(node)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(node: UbgNode, key: string): boolean | undefined {
  const v = props(node)[key];
  return typeof v === 'boolean' ? v : undefined;
}

/** Humanise a slug: `curtain_wall` / `curtain-wall` → `Curtain Wall`. */
export function humanize(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function clip(s: string, max = 30): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ── façade orientation (compass label) ────────────────────────────────────────

/**
 * The eight compass façade labels. The editor stamps `facade` on window nodes by
 * computing the host wall's OUTWARD normal (away from the room centroid) — the
 * same CONCEPT as ai-host's solarOrientation.outwardNormal, mirrored (not
 * imported) to respect the layer boundary.
 */
export type Facade =
  | 'north' | 'south' | 'east' | 'west'
  | 'northeast' | 'northwest' | 'southeast' | 'southwest';

const FACADE_LABELS = new Set<string>([
  'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
]);

/** True when the node carries a recognised `facade` compass slug. */
function facadeOf(node: UbgNode): Facade | undefined {
  const f = str(node, 'facade')?.toLowerCase();
  return f && FACADE_LABELS.has(f) ? (f as Facade) : undefined;
}

// ── human node label — "what it is" ───────────────────────────────────────────

/**
 * The human, architecturally-meaningful label for a node — NEVER the bare generic
 * kind "Element". Reads the richest descriptor available on the node's props.
 *
 *   room   → its name ("Master Bedroom") or occupancy ("Bathroom").
 *   window → "Window · {façade} façade" when a façade is known, else "Window".
 *   door   → "Door · {RoomA} ↔ {RoomB}" when the two rooms it links are known,
 *            else its name, else "Door".
 *   wall   → "Wall · exterior"/"interior" when known, else "Wall".
 *   rule   → its ruleName.
 *   else   → name/label/type prop, else the humanised kind.
 *
 * `graph` is optional — passed so a door can resolve the NAMES of the rooms it
 * links (its `refs`/`connectsTo` endpoints). Without it the label degrades to the
 * door's own props.
 */
export function humanNodeLabel(node: UbgNode, graph?: BuildingGraph): string {
  const name = str(node, 'name') ?? str(node, 'label');

  switch (node.kind) {
    case 'room':
    case 'space': {
      const base = name ?? str(node, 'occupancy') ?? str(node, 'roomType');
      return clip(base ? humanize(base) : humanize(node.kind));
    }
    case 'window': {
      const f = facadeOf(node);
      return f ? `Window · ${f} façade` : (name ?? 'Window');
    }
    case 'door': {
      const pair = graph ? doorRoomPair(node, graph) : null;
      if (pair) return clip(`Door · ${pair[0]} ↔ ${pair[1]}`, 30);
      return name ?? 'Door';
    }
    case 'wall': {
      const role = wallRole(node);
      return role ? `Wall · ${role}` : (name ?? 'Wall');
    }
    case 'rule':
    case 'constraint':
      return clip(str(node, 'ruleName') ?? name ?? humanize(node.kind));
    default: {
      const base =
        name ?? str(node, 'type') ?? str(node, 'category') ?? str(node, 'elementType');
      return clip(base ? humanize(base) : humanize(node.kind));
    }
  }
}

/** `'exterior'` / `'interior'` when derivable from props, else undefined. */
function wallRole(node: UbgNode): 'exterior' | 'interior' | undefined {
  const explicit = str(node, 'role')?.toLowerCase();
  if (explicit === 'exterior' || explicit === 'interior') return explicit;
  const ext = bool(node, 'isExterior');
  if (ext === true) return 'exterior';
  if (ext === false) return 'interior';
  return undefined;
}

/**
 * The two room NAMES a door links, derived from the graph. A door's two ROOM
 * endpoints come from its `refs` (the roomGraph adapter stamps
 * `refs: [fromRoom, toRoom]` on each door) or its `connectsTo` neighbours.
 * Returns `[labelA, labelB]` or null when fewer than two rooms are resolvable.
 */
export function doorRoomPair(node: UbgNode, graph: BuildingGraph): [string, string] | null {
  const roomIds = new Set<string>();
  // 1. the door's own `refs` (roomGraph adapter: refs = [fromRoom, toRoom]).
  for (const r of node.refs ?? []) {
    const n = safeNode(graph, r);
    if (n && (n.kind === 'room' || n.kind === 'space')) roomIds.add(r);
  }
  // 2. fall back to any room reached by an edge in EITHER direction.
  if (roomIds.size < 2) {
    try {
      for (const e of graph.outEdges(node.id)) {
        const n = safeNode(graph, e.to);
        if (n && (n.kind === 'room' || n.kind === 'space')) roomIds.add(e.to);
      }
      for (const e of graph.inEdges(node.id)) {
        const n = safeNode(graph, e.from);
        if (n && (n.kind === 'room' || n.kind === 'space')) roomIds.add(e.from);
      }
    } catch {
      /* ignore */
    }
  }
  const labels = [...roomIds].slice(0, 2).map((id) => {
    const n = safeNode(graph, id);
    return n ? humanNodeLabel(n) : id;
  });
  return labels.length === 2 ? [labels[0]!, labels[1]!] : null;
}

function safeNode(graph: BuildingGraph, id: string): UbgNode | undefined {
  try {
    return graph.getNode(id);
  } catch {
    return undefined;
  }
}

// ── room relationships — "how the spaces connect", in plain language ──────────

/** One plain-language relationship line for a room (verb + neighbour name). */
export interface RelationshipSentence {
  /** human sentence, e.g. "connects to Corridor via a door". */
  readonly text: string;
  /** the neighbour node id (so the overlay can cross-link). */
  readonly neighbourId: string;
}

/**
 * Plain-language neighbour list for a ROOM, answering "how do the spaces connect".
 * Derived from the room's UBG edges:
 *   • `connectsTo`         → "connects to {Name} via a door"
 *   • `adjacentTo`         → "adjacent to {Name}"
 *   • `circulatesVia` (in) → "reached via {Corridor}"
 * Deduplicated by neighbour+verb, neighbour names humanised. Returns [] for a
 * non-room node or a room with no spatial neighbours.
 */
export function roomRelationshipSentences(
  node: UbgNode,
  graph: BuildingGraph,
): RelationshipSentence[] {
  if (node.kind !== 'room' && node.kind !== 'space') return [];
  const out: RelationshipSentence[] = [];
  const seen = new Set<string>();
  const push = (neighbourId: string, verb: string) => {
    const n = safeNode(graph, neighbourId);
    if (!n) return;
    const key = `${neighbourId}|${verb}`;
    if (seen.has(key)) return;
    seen.add(key);
    const tail = verb === 'connects to' ? ' via a door' : '';
    out.push({ neighbourId, text: `${verb} ${humanNodeLabel(n, graph)}${tail}` });
  };
  try {
    for (const e of graph.outEdges(node.id, 'connectsTo')) push(e.to, 'connects to');
    for (const e of graph.inEdges(node.id, 'connectsTo')) push(e.from, 'connects to');
    for (const e of graph.outEdges(node.id, 'adjacentTo')) push(e.to, 'adjacent to');
    for (const e of graph.inEdges(node.id, 'adjacentTo')) push(e.from, 'adjacent to');
    for (const e of graph.inEdges(node.id, 'circulatesVia')) push(e.from, 'reached via');
  } catch {
    /* ignore */
  }
  return out;
}

// ── element RATIONALE — "why it's here" ───────────────────────────────────────

/** The "why" for one node — the reason + where the reason CAME FROM (auditable). */
export interface NodeRationale {
  /** plain-language reason the element is located where it is. */
  readonly reason: string;
  /** which data drove the reason (for auditability + the inspect card subtitle). */
  readonly source: string;
}

/**
 * WHY this element is where it is — generated purely from data already on the
 * node/graph. Returns null when no SPECIFIC reason is derivable (we omit rather
 * than fabricate, per the brief).
 *
 * Data sources, by kind:
 *   • window → `facade` (+ optional `orientationReason`/`latDeg`) stamped by the
 *     editor from the host wall's outward normal vs the equator-facing direction
 *     (the ai-host solarOrientation CONCEPT, mirrored — see editor extractor).
 *   • door   → the two ROOMS it links (graph refs/edges) + an optional
 *     `programReason` (program-rules access requirement) stamped by the editor.
 *   • room   → `occupancy`/`roomType` mapped to its program role (private / wet /
 *     social / circulation), plus a `placementReason` when the editor derives one.
 *
 * P8: emits a `pryzm.ubg.describe` span at this read boundary.
 */
export function nodeRationale(node: UbgNode, graph: BuildingGraph): NodeRationale | null {
  return withUbgSpan(
    'describe',
    () => {
      switch (node.kind) {
        case 'window':
          return windowRationale(node);
        case 'door':
          return doorRationale(node, graph);
        case 'room':
        case 'space':
          return roomRationale(node);
        default:
          return null;
      }
    },
    { 'ubg.node.kind': node.kind },
  );
}

/**
 * Compass label → the daylight/solar phrase. The equator-facing façade (south in
 * the northern hemisphere, north in the southern) gets the strongest passive-solar
 * daylight; we pick it from latitude when known (mirrors ai-host equatorFacingDir),
 * else describe the orientation generically.
 */
function facadeReason(f: Facade, latDeg?: number): string {
  const equatorFacing = latDeg === undefined ? null : latDeg >= 0 ? 'south' : 'north';
  if (equatorFacing && f === equatorFacing) {
    return `Placed on the ${f} façade — the equator-facing side — for the best daylight and passive solar gain.`;
  }
  if (f === 'north' || f === 'south') {
    return `Placed on the ${f} façade for daylight.`;
  }
  if (f === 'east') return 'Placed on the east façade for morning daylight.';
  if (f === 'west') return 'Placed on the west façade for afternoon daylight.';
  return `Placed on the ${f} façade for daylight and view.`;
}

/** Window: orientation reason from the stamped `facade` + optional latitude. */
function windowRationale(node: UbgNode): NodeRationale | null {
  // Prefer an explicit reason the editor already computed (richest provenance).
  const explicit = str(node, 'orientationReason');
  if (explicit) {
    return { reason: explicit, source: 'window orientation (host-wall normal vs sun)' };
  }
  const f = facadeOf(node);
  if (f) {
    const lat = num(node, 'latDeg');
    return {
      reason: facadeReason(f, lat),
      source: 'host-wall outward normal' + (lat !== undefined ? ' + site latitude' : ''),
    };
  }
  return null;
}

/** Door: "links A ↔ B" + an optional program-rules access reason. */
function doorRationale(node: UbgNode, graph: BuildingGraph): NodeRationale | null {
  const pair = doorRoomPair(node, graph);
  const program = str(node, 'programReason'); // editor stamps this from program-rules.
  if (pair) {
    const base = `Links ${pair[0]} ↔ ${pair[1]}`;
    return {
      reason: program ? `${base} — ${program}` : `${base}.`,
      source: program ? 'room pairing + program rules' : 'room pairing (graph)',
    };
  }
  if (program) return { reason: program, source: 'program rules' };
  return null;
}

// Program-role classification of a room from its occupancy/roomType tag.
const PRIVATE_ROOMS = new Set(['bedroom', 'master_bedroom', 'master', 'study', 'office']);
const WET_ROOMS = new Set(['bathroom', 'wc', 'toilet', 'ensuite', 'utility', 'laundry']);
const SOCIAL_ROOMS = new Set([
  'living', 'living_room', 'lounge', 'dining', 'kitchen', 'open_plan', 'family',
]);
const CIRCULATION_ROOMS = new Set(['corridor', 'hall', 'hallway', 'entrance', 'lobby', 'foyer']);

/** Room: program role placement reason from occupancy/roomType. */
function roomRationale(node: UbgNode): NodeRationale | null {
  // An explicit placement reason the editor derived always wins.
  const explicit = str(node, 'placementReason');
  if (explicit) return { reason: explicit, source: 'layout engine' };

  const tag = (str(node, 'occupancy') ?? str(node, 'roomType') ?? '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!tag) return null;
  // Source = the room's occupancy/roomType tag (program classification).
  if (CIRCULATION_ROOMS.has(tag)) {
    return {
      reason: 'A circulation space — links the other rooms together.',
      source: 'room occupancy',
    };
  }
  if (PRIVATE_ROOMS.has(tag)) {
    return {
      reason: 'A private room — placed away from the entrance for quiet and seclusion.',
      source: 'room occupancy',
    };
  }
  if (WET_ROOMS.has(tag)) {
    return { reason: 'A wet room — clustered with the plumbing core.', source: 'room occupancy' };
  }
  if (SOCIAL_ROOMS.has(tag)) {
    return {
      reason: 'A social space — placed near the entrance and shared circulation.',
      source: 'room occupancy',
    };
  }
  return null;
}
