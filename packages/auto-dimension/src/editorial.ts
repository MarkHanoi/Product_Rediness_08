// @pryzm/auto-dimension — §GA-EDITORIAL-LAYER (L-1620) — THE EDITORIAL LAYER.
//
// SPEC-AUTODIMENSION §12.3, and the enclosure classification it needs.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SHAPE OF THE DEFECT (SPEC §13, measured 2026-08-20)
// ─────────────────────────────────────────────────────────────────────────────
// "The engine has a sound PLACEMENT-GEOMETRY layer and NO EDITORIAL layer." Every stage
// that exists — perimeter, runs, openings, tiers, placement, conflicts — answers WHERE a
// dimension goes. Nothing answers WHETHER IT SHOULD EXIST. §12 is almost entirely the
// second question, and §12.3 is its sharpest form:
//
//     Allowed: corridor widths · stair widths · bathroom layouts · kitchen runs ·
//              critical clearances · structural wall spacing.
//     Avoid:   duplicate dimensions · EVERY ROOM EDGE · cosmetic dimensions.
//     MAXIMUM ONE WIDTH AND ONE LENGTH PER ROOM.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY INTERIOR DIMENSIONS EXIST AT ALL — THE ROOT, NOT THE SYMPTOM
// ─────────────────────────────────────────────────────────────────────────────
// The plan planner never asks for interior dimensions. It dimensions the outer face of
// every BUILDING (`partitionBuildings`, L-268). The interior flood arrives because the
// shipped layout generators emit interior partitions as CLOSED WALL LOOPS that touch the
// shell only by coordinate coincidence:
//
//   • `ResidentialBuildingExecutor._buildCellPerimeter` emits a 4-wall rectangle per
//     apartment cell; `§RESI-NO-DOUBLE-WALL` skips the façade edges, so an interior cell
//     keeps all four and its loop is CLOSED.
//   • `weldPartitionsToShell` welds a partition endpoint onto the shell wall's
//     CENTRELINE and never cuts the shell wall — a mid-span T with NO SHARED ENDPOINT.
//     (`HouseLayoutExecutor` L-2153; the shell is "the authoritative perimeter".)
//
// So each interior loop is its own CONNECTED COMPONENT with its own closed face, and
// L-268's rule "one outer face per connected component" — correct for two buildings on a
// site — classifies each of them as A BUILDING and dimensions it in full: an overall X,
// an overall Z and a chain per side, drawn INSIDE the shell. Twelve rooms produce dozens
// of interior dimensions, which is exactly the founder's screenshot.
//
// ⭐ THE CORRECTION IS THEREFORE A CLASSIFICATION, NOT A FILTER THRESHOLD: **an enclosure
// contained inside another enclosure is not a building, it is a ROOM.** `classifyEnclosures`
// makes that distinction, and once it exists §12.3 is a small, readable rule on top of it.
// Deleting interior strings without it would have been a cosmetic fix that also deleted a
// genuine second building standing in a courtyard.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT §12.3 CANNOT BE MEASURED FROM WALLS ALONE — SAID OUT LOUD
// ─────────────────────────────────────────────────────────────────────────────
// The allow-list is written in ROOM SEMANTICS ("bathroom layouts", "kitchen runs"). This
// engine's input (`AutoDimSnapshot`) is walls and openings; it has no room names and no
// programme. The construction-critical test below is therefore GEOMETRIC, and it is
// deliberately conservative — it keeps a dimension only where the geometry itself says
// the space is tight or circulatory:
//
//   corridor width   ← long-and-thin enclosure, narrow axis at/under `corridorMaxWidthM`
//   stair width /    ← any extent at/under `criticalClearanceM`
//   critical clearance
//   bathroom layout  ← small service enclosure at/under `serviceRoomMaxAreaM2` (both axes)
//   ordinary room    ← NOTHING. §12.3's "avoid every room edge" is the default.
//
// ⛔ NOT IMPLEMENTED, and not pretended: **kitchen runs** and **structural wall spacing**.
// Both need semantics this engine is not given — a kitchen is a programme fact, and
// "structural" is a system-type fact (`AutoDimWall.thickness` is a proxy, not the answer;
// C84/C67 own the attribute). They are recorded in SPEC-AUTODIMENSION §13 as still open.
//
// PURE (INV-2) + DETERMINISTIC (INV-1): frozen defaults, total orders everywhere, no
// clock, no RNG, no Map/Set iteration order trusted for output.

import type { BuildingFootprint } from './buildings.js';
import type { RoomFace } from './perimeter.js';
import type { PlacedString, PlannedString, DimNode, TickRef } from './types.js';
import type { PtXZ } from './geometry.js';
import { dedupKey } from './planners.js';
import { tierOfRank } from './tiers.js';
import { withAutoDimSpan } from './tracing.js';

// ── Enclosure classification (building vs room) ─────────────────────────────

export interface EnclosureClassification {
  /** Real BUILDINGS — enclosures contained in no other enclosure. Dimensioned in full. */
  readonly envelopes: readonly BuildingFootprint[];
  /** ROOMS — enclosures wholly inside another enclosure. §12.3 governs these. */
  readonly rooms: readonly BuildingFootprint[];
  /** roomId → the id of the envelope that contains it. */
  readonly containerOf: ReadonlyMap<string, string>;
}

/** Shoelace area. Sign carries winding; callers take the absolute value. */
function polygonAreaAbs(poly: readonly PtXZ[]): number {
  const n = poly.length;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a / 2);
}

/** Even-odd ray cast, winding-agnostic (mirrors `buildings.ts`, deliberately). */
function pointInPolygon(pt: PtXZ, poly: readonly PtXZ[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const straddles = a.z > pt.z !== b.z > pt.z;
    if (!straddles) continue;
    const xAtZ = a.x + ((pt.z - a.z) / (b.z - a.z)) * (b.x - a.x);
    if (pt.x < xAtZ) inside = !inside;
  }
  return inside;
}

/** Every vertex of `inner` lies inside `outer`, and `inner` is strictly smaller. */
function polygonContains(outer: readonly PtXZ[], inner: readonly PtXZ[]): boolean {
  if (outer.length < 3 || inner.length < 3) return false;
  if (polygonAreaAbs(inner) >= polygonAreaAbs(outer)) return false;
  for (const v of inner) if (!pointInPolygon(v, outer)) return false;
  return true;
}

/**
 * Split the level's enclosures into BUILDINGS and ROOMS.
 *
 * An enclosure is a ROOM when its whole footprint lies inside another enclosure's
 * footprint. It is otherwise a BUILDING — so two detached buildings on a site both stay
 * buildings (L-268 is preserved, and it is pinned by `twoBuildings.test.ts`), while an
 * apartment cell inside a shell becomes what it always was.
 *
 * Deterministic: containers are chosen SMALLEST-AREA-FIRST with an id tiebreak, so a room
 * inside a room inside a shell attaches to its immediate container, always the same way.
 *
 * P8 (INV-6) — opens a `pryzm.autodim.graph` span (this refines stage 1's output).
 */
export function classifyEnclosures(
  buildings: readonly BuildingFootprint[],
): EnclosureClassification {
  return withAutoDimSpan('graph', (span): EnclosureClassification => {
    const envelopes: BuildingFootprint[] = [];
    const rooms: BuildingFootprint[] = [];
    const containerOf = new Map<string, string>();

    // Total order: by area descending, then id — so the container search is stable.
    const byId = [...buildings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    for (const candidate of byId) {
      let best: BuildingFootprint | null = null;
      let bestArea = Infinity;
      for (const other of byId) {
        if (other.id === candidate.id) continue;
        if (!polygonContains(other.perimPolygon, candidate.perimPolygon)) continue;
        const area = polygonAreaAbs(other.perimPolygon);
        if (area < bestArea || (area === bestArea && best !== null && other.id < best.id)) {
          best = other;
          bestArea = area;
        }
      }
      if (best) {
        rooms.push(candidate);
        containerOf.set(candidate.id, best.id);
      } else {
        envelopes.push(candidate);
      }
    }

    span.setAttribute('pryzm.autodim.envelope_count', envelopes.length);
    span.setAttribute('pryzm.autodim.room_count', rooms.length);
    return { envelopes, rooms, containerOf };
  });
}

// ── §12.3 — the interior-dimension editorial policy ─────────────────────────

/**
 * The thresholds that turn §12.3's ROOM-SEMANTIC allow-list into a geometric test.
 *
 * These are DEFAULTS, not literals buried in the algorithm: like `minSegmentM` they are
 * `AutoDimOptions` fields, because "how narrow is a corridor" is a drafting-office
 * convention (C34) and not the engine's to declare. The values below are the ordinary
 * residential/commercial GA reading of §12.3.
 */
export interface InteriorDimensionPolicy {
  /** An enclosure narrower than this on its short axis reads as circulation (m). */
  readonly corridorMaxWidthM: number;
  /** …and only when it is at least this many times longer than it is wide. */
  readonly corridorMinAspect: number;
  /** Any extent at or under this is a CRITICAL CLEARANCE (stair width, WC width) (m). */
  readonly criticalClearanceM: number;
  /** An enclosure at or under this area is a service room — BOTH axes are critical (m²). */
  readonly serviceRoomMaxAreaM2: number;
  /** §12.3's cap. One width. */
  readonly maxWidthDimsPerRoom: number;
  /** §12.3's cap. One length. */
  readonly maxLengthDimsPerRoom: number;
  /** Enclosed faces below this are slivers, not rooms (m²). */
  readonly minRoomAreaM2: number;
}

export const DEFAULT_INTERIOR_POLICY: InteriorDimensionPolicy = Object.freeze({
  corridorMaxWidthM: 2.0,
  corridorMinAspect: 2.0,
  criticalClearanceM: 1.5,
  serviceRoomMaxAreaM2: 6.0,
  maxWidthDimsPerRoom: 1,
  maxLengthDimsPerRoom: 1,
  minRoomAreaM2: 1.0,
});

/** Why a room's axis is (or is not) construction-critical — carried into `skipped`. */
export type InteriorCriticality =
  | 'service-room'         // §12.3 "bathroom layouts" — small enclosure, both axes
  | 'critical-clearance'   // §12.3 "stair widths" / "critical clearances" — short axis
  | 'corridor-width'       // §12.3 "corridor widths" — short axis
  | 'not-construction-critical';

export interface RoomDimensionBudget {
  readonly roomId: string;
  readonly extentX: number;
  readonly extentZ: number;
  readonly areaM2: number;
  /** May a HORIZONTAL (width) dimension be kept for this room? */
  readonly allowX: boolean;
  /** May a VERTICAL (length) dimension be kept for this room? */
  readonly allowZ: boolean;
  readonly reason: InteriorCriticality;
}

/**
 * §12.3 applied to ONE room: which of its two axes, if either, is construction-critical.
 *
 * The rules are evaluated in a fixed order and the FIRST match wins, so the reason a
 * dimension survived is a single, quotable sentence rather than the residue of several
 * overlapping conditions.
 *
 * P8 (INV-6) — opens a `pryzm.autodim.chain` span.
 */
export function roomDimensionBudget(
  roomId: string,
  polygon: readonly PtXZ[],
  policy: InteriorDimensionPolicy = DEFAULT_INTERIOR_POLICY,
): RoomDimensionBudget {
  return withAutoDimSpan('chain', (): RoomDimensionBudget => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const extentX = Number.isFinite(minX) ? maxX - minX : 0;
    const extentZ = Number.isFinite(minZ) ? maxZ - minZ : 0;
    const areaM2 = polygonAreaAbs(polygon);
    const short = Math.min(extentX, extentZ);
    const long = Math.max(extentX, extentZ);
    const aspect = short > 1e-9 ? long / short : Infinity;
    // Ties (a perfect square) resolve to X — a total order, never a coin toss.
    const shortIsX = extentX <= extentZ;

    if (areaM2 > 0 && areaM2 <= policy.serviceRoomMaxAreaM2) {
      return { roomId, extentX, extentZ, areaM2, allowX: true, allowZ: true, reason: 'service-room' };
    }
    if (short > 0 && short <= policy.criticalClearanceM) {
      return {
        roomId, extentX, extentZ, areaM2,
        allowX: shortIsX, allowZ: !shortIsX, reason: 'critical-clearance',
      };
    }
    if (short > 0 && aspect >= policy.corridorMinAspect && short <= policy.corridorMaxWidthM) {
      return {
        roomId, extentX, extentZ, areaM2,
        allowX: shortIsX, allowZ: !shortIsX, reason: 'corridor-width',
      };
    }
    return {
      roomId, extentX, extentZ, areaM2,
      allowX: false, allowZ: false, reason: 'not-construction-critical',
    };
  });
}

export interface InteriorFilterResult {
  readonly kept: readonly PlacedString[];
  readonly dropped: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * §12.3 — THE INTERIOR-DIMENSION EDITORIAL FILTER.
 *
 * ⛔ THE ONE THING THIS MUST NEVER DO is touch an EXTERIOR string. §12.2's three
 * perimeter strings are a separate, stricter contract and the tier model that places them
 * (`tiers.ts`, L-281) is hard-won. An exterior string is returned BY IDENTITY — not
 * rebuilt, not re-ranked, not re-ordered. The test suite pins that on a plate with no
 * rooms at all, where this function must be a byte-for-byte no-op.
 *
 * The rule, on a plate that HAS rooms, is §12.3 read literally:
 *
 *   1. A string planned from a ROOM ENCLOSURE — an apartment-cell loop, or a partition
 *      network that L-268's per-component rule called a "building" — is DROPPED. Those
 *      are the "every room edge" chains and the room-outline overalls the founder is
 *      looking at, and none of them is on §12.3's allow-list: an enclosure outline is not
 *      a corridor width, a stair width or a bathroom layout.
 *   2. A ROOM EXTENT deliberately planned by `planRoomExtents` — a construction-critical
 *      width or length, carrying `autoMode: 'room-bounding'` — is KEPT, subject to
 *      §12.3's cap of one width and one length per room. The cap is enforced twice on
 *      purpose: the planner proposes at most one per axis, and this re-checks, because a
 *      cap that is only implicit is a cap a later planner breaks without noticing.
 *   3. Everything else is EXTERIOR and is untouched.
 *
 * Nothing is dropped silently (INV-3): every removal is returned in `dropped` with the
 * §12.3 clause responsible, and the pipeline puts those into `AutoDimReport.skipped`.
 *
 * P8 (INV-6) — opens a `pryzm.autodim.conflict` span.
 */
export function filterInteriorDimensions(
  placed: readonly PlacedString[],
  classification: EnclosureClassification,
  policy: InteriorDimensionPolicy = DEFAULT_INTERIOR_POLICY,
): InteriorFilterResult {
  return withAutoDimSpan('conflict', (span): InteriorFilterResult => {
    const roomEnclosureIds = new Set(classification.rooms.map((r) => r.id));
    const kept: PlacedString[] = [];
    const dropped: { id: string; reason: string }[] = [];
    // roomId|orientation → the strings competing for that room's single §12.3 slot.
    const contenders = new Map<string, PlacedString[]>();

    for (const p of placed) {
      if (p.autoMode === 'room-bounding') {
        const key = `${p.buildingId ?? '(none)'}|${p.orientation}`;
        const list = contenders.get(key);
        if (list) list.push(p); else contenders.set(key, [p]);
        continue;
      }
      if (p.buildingId !== undefined && roomEnclosureIds.has(p.buildingId)) {
        dropped.push({
          id: dedupKey(p),
          reason: p.kind === 'overall'
            ? '§12.3 room-outline-overall — not a construction-critical dimension'
            : '§12.3 every-room-edge — not a construction-critical dimension',
        });
        continue;
      }
      kept.push(p);   // ⛔ EXTERIOR — untouched, by identity.
    }

    for (const key of [...contenders.keys()].sort()) {
      const ranked = [...contenders.get(key)!].sort((a, b) => {
        const aLen = Math.abs(a.stationSpan[1] - a.stationSpan[0]);
        const bLen = Math.abs(b.stationSpan[1] - b.stationSpan[0]);
        if (aLen !== bLen) return bLen - aLen;               // the fuller extent wins
        return dedupKey(a) < dedupKey(b) ? -1 : 1;           // total-order tiebreak
      });
      const isWidth = key.endsWith('|horizontal');
      const cap = isWidth ? policy.maxWidthDimsPerRoom : policy.maxLengthDimsPerRoom;
      ranked.forEach((p, i) => {
        if (i < cap) kept.push(p);
        else {
          dropped.push({
            id: dedupKey(p),
            reason: `§12.3 cap — max ${cap} ${isWidth ? 'width' : 'length'} dim per room`,
          });
        }
      });
    }

    span.setAttribute('pryzm.autodim.interior_dropped', dropped.length);
    return { kept, dropped };
  });
}

// ── §12.3's ALLOW-LIST, as a PLANNER ────────────────────────────────────────

/** Deterministic extreme-node pick along one axis (mirrors `planners.extreme`). */
function extremeNode(
  nodes: readonly DimNode[],
  axis: 'x' | 'z',
  pick: 'min' | 'max',
): DimNode | null {
  let best: DimNode | null = null;
  for (const n of nodes) {
    if (best === null) { best = n; continue; }
    const v = n.point[axis];
    const bv = best.point[axis];
    if (pick === 'min' ? v < bv : v > bv) { best = n; continue; }
    if (v === bv && n.id < best.id) best = n;
  }
  return best;
}

export interface RoomExtentPlan {
  readonly room: RoomFace;
  readonly strings: readonly PlannedString[];
}

/**
 * §12.3's ALLOW-LIST, PLANNED rather than filtered.
 *
 * ⭐ THE MEASUREMENT THAT MADE THIS NECESSARY. Before this lane, the corridor width and
 * the stair width — two of the six things §12.3 explicitly ALLOWS — appeared nowhere in
 * the engine's output on the GA plate. The plate carried SIXTY-EIGHT interior dimensions
 * and not one of them was a corridor width. §12.3 was therefore failing in BOTH
 * directions at once: over-supplied with room edges, and under-supplied with the
 * construction-critical set. A filter can only fix the first half. The second half has to
 * be planned, or the drawing is merely emptier rather than drafted.
 *
 * For each ROOM (`traceRoomFaces`), `roomDimensionBudget` decides which of its two axes
 * are construction-critical, and this emits AT MOST ONE dimension per critical axis —
 * §12.3's cap satisfied by construction. The references are the room's own extreme corner
 * NODES, so the dimension stays live (INV-4) and measures the structural centreline
 * extent an architect dimensions to.
 *
 * P8 (INV-6) — opens a `pryzm.autodim.chain` span.
 */
export function planRoomExtents(
  rooms: readonly RoomFace[],
  policy: InteriorDimensionPolicy = DEFAULT_INTERIOR_POLICY,
): { readonly plans: readonly RoomExtentPlan[]; readonly budgets: readonly RoomDimensionBudget[] } {
  return withAutoDimSpan('chain', (span) => {
    const plans: RoomExtentPlan[] = [];
    const budgets: RoomDimensionBudget[] = [];
    for (const room of [...rooms].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const budget = roomDimensionBudget(room.id, room.polygon, policy);
      budgets.push(budget);
      const strings: PlannedString[] = [];

      const emit = (axis: 'x' | 'z'): void => {
        const lo = extremeNode(room.nodes, axis, 'min');
        const hi = extremeNode(room.nodes, axis, 'max');
        if (!lo || !hi) return;
        const stationSpan: [number, number] = [lo.point[axis], hi.point[axis]];
        if (Math.abs(stationSpan[1] - stationSpan[0]) < 1e-3) return;
        const a: TickRef = { ...lo.ref, station: stationSpan[0] };
        const b: TickRef = { ...hi.ref, station: stationSpan[1] };
        strings.push({
          // An INTERNAL dimension measures ONE extent of ONE room; it is not, and never
          // was, a building `overall`. `autoMode: 'room-bounding'` is the schema's own
          // word for it, and it is what stops QA-3 from comparing a room width against
          // the BUILDING extent. `rank: 4` puts it in tier 0 — read against its own wall.
          kind: 'linear-element',
          orientation: axis === 'x' ? 'horizontal' : 'vertical',
          refs: [a, b],
          axisId: `${room.id}|${axis}`,
          rank: 4,
          rowIndex: tierOfRank(4),
          stationSpan,
          p1: lo.point,
          p2: hi.point,
          autoMode: 'room-bounding',
        });
      };

      if (budget.allowX) emit('x');
      if (budget.allowZ) emit('z');
      if (strings.length > 0) plans.push({ room, strings });
    }
    span.setAttribute(
      'pryzm.autodim.room_extent_count',
      plans.reduce((n, r) => n + r.strings.length, 0),
    );
    return { plans, budgets };
  });
}
