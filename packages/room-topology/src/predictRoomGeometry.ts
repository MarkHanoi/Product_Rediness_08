// predictRoomGeometry — the PURE `(walls, proposedMove, rooms) → predicted polygon + area`
// recompute. Roadmap Phase 6b; consumed by the `wall.move` consequence planner so the
// founder's safe-mode preview can say `Kitchen area: 12.4 m² → 10.8 m²` BEFORE anything
// executes (STR-06: preview NEVER executes).
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────────────────
// This function PREDICTS the polygon of ALREADY-KNOWN rooms under a proposed change to one
// wall's baseline. It is NOT room detection. `RoomDetectionEngine` is PROTECTED
// (docs/04-reference/BIM30-DO-NOT-REBUILD.md) and — more importantly for this file — it is
// a MUTATING, level-wide, store-writing pass. A consequence planner must not run it
// (STR-06 purity, ADR-0322 §2). So:
//
//   • We re-derive the ring of a room from the CURRENT baselines of the walls the room
//     already declares in `boundingWallIds`, substituting the proposed baseline for the
//     moved wall. That is a prediction over a KNOWN membership.
//   • We do NOT discover new rooms, and we do NOT re-partition the level. If the move would
//     SPLIT a room in two, MERGE two rooms, or make a room disappear, this function CANNOT
//     see it — the room's declared wall membership is unchanged, so the recompute yields a
//     ring that no longer corresponds to reality. That case is reported as
//     `TOPOLOGY_CHANGE_POSSIBLE` (see the heuristic below), never as a confident area.
//   • Every room is determined INDEPENDENTLY. One room that cannot be re-derived does not
//     poison the rooms that can. There is no all-or-nothing verdict.
//
// ── WHY THE POLYGON DERIVATION IS RE-STATED HERE RATHER THAN IMPORTED ────────────────
// `RoomDetectionEngine._polygonFromBoundaryWalls` does the same chain-tracing, but it is a
// PRIVATE method on a class whose module imports THREE (for curved-wall arc tessellation)
// and whose construction reaches for stores. Extracting it wholesale would either drag THREE
// into this pure module or force a behaviour-changing edit to a PROTECTED file. Neither is
// acceptable, so this module implements the STRAIGHT-SEGMENT subset of that trace and
// REFUSES on anything else:
//
//   • a curved wall in the boundary set → `CURVED_WALL_UNSUPPORTED` (the arc sampling lives
//     in the THREE-bearing path; predicting it here would be a second, divergent algorithm).
//   • area/perimeter/centroid/AABB come from `RoomPolygonUtils` — the SAME pure helpers the
//     detection engine's metrics use. There is exactly one shoelace in this package.
//
// ── TOLERANCE POLICY (C73 §2) ────────────────────────────────────────────────────────
// Endpoint identity is `COINCIDENT_M`; degenerate-length guards are `EPSILON_ZERO`. Both are
// IMPORTED from `@pryzm/geometry-kernel` — this module declares no epsilon of its own.
//
// NOTE on the 1 mm weld: `RoomDetectionEngine._traceConnectedChain` snaps at 0.05 m. That
// looser number is a DETECTION heuristic tolerant of un-joined draft geometry. A prediction
// that welds 50 mm apart would silently close a real 40 mm gap and report a confident area
// for a room that is not closed — the overstatement-on-partial-data defect. Here, a gap wider
// than `COINCIDENT_M` is an OPEN LOOP and is refused. This is intentionally stricter than
// detection and is why a room detection accepted can still come back UNDETERMINED.
//
// ── PURITY ───────────────────────────────────────────────────────────────────────────
// No store access, no `window.*`, no `Date.now()`, no `Math.random()`, no mutation of any
// input. Same inputs → byte-identical output. Enforced by
// `tools/rac-conformance/certification/gates/check-preview-purity.ts` and by the
// determinism test in `__tests__/predictRoomGeometry.test.ts`.

import { COINCIDENT_M, EPSILON_ZERO } from '@pryzm/geometry-kernel';
import type { RoomVertex } from './RoomTypes';
import {
  polygonAreaM2,
  polygonPerimeterM,
  polygonCentroid,
  polygonAABB,
  isSimple,
} from './RoomPolygonUtils';

// ─── Inputs (structurally minimal — this module does not depend on WallData/RoomData) ──

/** A 2-D point on a wall centreline, in world XZ metres. */
export interface PredictPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * The minimum a wall must expose to participate. Deliberately structural, not
 * `WallData`: the planner clones records, tests use literals, and neither should have to
 * satisfy the full element schema. A wall carrying a `curve` is REFUSED (see header).
 */
export interface PredictWall {
  readonly id: string;
  readonly baseLine: readonly [PredictPoint, PredictPoint];
  readonly curve?: unknown;
}

/**
 * The minimum a room must expose. `boundingWallIds` is the CANONICAL persisted linkage
 * (`RoomDataSchema` — required on every stored room); `boundaryWallIds` is tolerated
 * because floorplan-import DTOs and the detection engine's internal DTO use that spelling.
 */
export interface PredictRoom {
  readonly id: string;
  readonly boundingWallIds?: readonly string[];
  readonly boundaryWallIds?: readonly string[];
  readonly boundary?: { readonly polygon?: readonly RoomVertex[]; readonly height?: number };
  readonly computed?: { readonly area?: number };
}

/** The proposed change: wall `wallId`'s centreline becomes `baseLine`. */
export interface ProposedWallMove {
  readonly wallId: string;
  readonly baseLine: readonly [PredictPoint, PredictPoint];
}

// ─── Output ────────────────────────────────────────────────────────────────────────────

/**
 * Why a room's geometry could not be predicted. Every one of these is a REFUSAL with a
 * cause, never an empty or fabricated polygon.
 */
export type RoomPredictionRefusal =
  /** The room declares no wall linkage at all — membership is unknowable without detection. */
  | 'NO_WALL_LINKAGE'
  /** One or more declared bounding walls are absent from the supplied wall set. */
  | 'MISSING_BOUNDING_WALL'
  /** A declared bounding wall is curved; arc prediction is out of this module's scope. */
  | 'CURVED_WALL_UNSUPPORTED'
  /** Fewer than 3 usable segments — nothing that could be a ring. */
  | 'DEGENERATE_BOUNDARY'
  /** The traced chain does not close within `COINCIDENT_M`: a dangling gap or open loop. */
  | 'OPEN_LOOP'
  /** The predicted ring self-intersects — the move folded the boundary over itself. */
  | 'SELF_INTERSECTING'
  /** The predicted ring has (near-)zero area — the move collapsed the room. */
  | 'COLLAPSED'
  /**
   * The move plausibly SPLITS or MERGES rooms (the moved wall crosses the room's current
   * ring rather than bounding it). Beyond a per-room recompute — re-detection would be
   * required, and re-detection is a mutation.
   */
  | 'TOPOLOGY_CHANGE_POSSIBLE';

/** A room whose predicted geometry was computed. */
export interface RoomGeometryDetermined {
  readonly roomId: string;
  readonly kind: 'determined';
  /** The predicted ring, CCW-normalised order as traced. */
  readonly polygon: readonly RoomVertex[];
  /** Predicted net floor area, m² (shoelace — the same helper the stored metric uses). */
  readonly area: number;
  readonly perimeter: number;
  readonly centroid: RoomVertex;
  readonly boundingBox: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** The room's area BEFORE the move, as recorded on the room record (undefined if absent). */
  readonly areaBefore: number | undefined;
  /** `area - areaBefore`, or undefined when `areaBefore` is unknown. */
  readonly areaDelta: number | undefined;
}

/** A room whose predicted geometry could NOT be computed, with the reason. */
export interface RoomGeometryUndetermined {
  readonly roomId: string;
  readonly kind: 'undetermined';
  readonly reason: RoomPredictionRefusal;
  readonly detail: string;
  readonly areaBefore: number | undefined;
}

export type RoomGeometryPrediction = RoomGeometryDetermined | RoomGeometryUndetermined;

export interface PredictRoomGeometryResult {
  /** One entry per room that DECLARES the moved wall in its bounding linkage. */
  readonly rooms: readonly RoomGeometryPrediction[];
  /**
   * True when at least one supplied room carried a wall-linkage array. False means the
   * whole room set is link-less, which is the honest "membership is unknowable" blind
   * spot — distinct from "no room touches this wall".
   */
  readonly anyStructuralLink: boolean;
}

// ─── Internals ─────────────────────────────────────────────────────────────────────────

const boundingIdsOf = (room: PredictRoom): readonly string[] | null => {
  if (Array.isArray(room.boundingWallIds)) return room.boundingWallIds;
  if (Array.isArray(room.boundaryWallIds)) return room.boundaryWallIds;
  return null;
};

const same = (a: PredictPoint, b: PredictPoint): boolean =>
  Math.abs(a.x - b.x) <= COINCIDENT_M && Math.abs(a.z - b.z) <= COINCIDENT_M;

const segLen = (a: PredictPoint, b: PredictPoint): number =>
  Math.hypot(b.x - a.x, b.z - a.z);

/** Do segments p→p2 and q→q2 properly cross (interior intersection)? Pure predicate. */
function segmentsProperlyCross(
  p: PredictPoint, p2: PredictPoint, q: PredictPoint, q2: PredictPoint,
): boolean {
  const d = (a: PredictPoint, b: PredictPoint, c: PredictPoint): number =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d1 = d(p, p2, q);
  const d2 = d(p, p2, q2);
  const d3 = d(q, q2, p);
  const d4 = d(q, q2, p2);
  // Strict sign change on BOTH — touching endpoints (a wall that BOUNDS the room) do not
  // count as a crossing, only a wall driven THROUGH the interior does.
  return ((d1 > EPSILON_ZERO && d2 < -EPSILON_ZERO) || (d1 < -EPSILON_ZERO && d2 > EPSILON_ZERO))
      && ((d3 > EPSILON_ZERO && d4 < -EPSILON_ZERO) || (d3 < -EPSILON_ZERO && d4 > EPSILON_ZERO));
}

interface Seg { readonly a: PredictPoint; readonly b: PredictPoint }

/**
 * Trace an ordered closed ring from an unordered segment set, welding at `COINCIDENT_M`.
 * Returns null when the chain cannot be closed (open loop / dangling gap / fork).
 */
function traceClosedRing(segments: readonly Seg[]): RoomVertex[] | null {
  const first = segments[0];
  if (segments.length < 3 || !first) return null;
  const remaining = segments.slice(1);
  const start: PredictPoint = first.a;
  const ring: RoomVertex[] = [{ x: first.a.x, z: first.a.z }];
  let tail: PredictPoint = first.b;

  while (remaining.length > 0) {
    ring.push({ x: tail.x, z: tail.z });
    let advanced = false;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      if (!s) continue;
      if (same(s.a, tail)) { tail = s.b; remaining.splice(i, 1); advanced = true; break; }
      if (same(s.b, tail)) { tail = s.a; remaining.splice(i, 1); advanced = true; break; }
    }
    if (!advanced) return null; // dangling gap — the chain cannot continue
  }
  // The last consumed segment must land back on the start, or the loop is open.
  if (!same(tail, start)) return null;
  return ring.length >= 3 ? ring : null;
}

// ─── The function ──────────────────────────────────────────────────────────────────────

/**
 * Predict the polygon + area of each room bounded by `move.wallId`, under the proposed
 * baseline, WITHOUT mutating anything and WITHOUT re-running detection.
 *
 * Rooms that do not declare the moved wall are omitted entirely (they are not affected by
 * a per-room recompute over declared membership). Rooms that DO declare it always appear —
 * either `determined` with numbers, or `undetermined` with a typed reason.
 */
export function predictRoomGeometry(
  walls: readonly PredictWall[],
  move: ProposedWallMove,
  rooms: readonly PredictRoom[],
): PredictRoomGeometryResult {
  const wallById = new Map<string, PredictWall>();
  for (const w of walls) wallById.set(w.id, w);

  // The proposed world: the moved wall's baseline substituted. Never mutates `walls`.
  const baselineOf = (wallId: string): readonly [PredictPoint, PredictPoint] | null => {
    if (wallId === move.wallId) return move.baseLine;
    const w = wallById.get(wallId);
    return w ? w.baseLine : null;
  };

  let anyStructuralLink = false;
  const out: RoomGeometryPrediction[] = [];

  for (const room of rooms) {
    const ids = boundingIdsOf(room);
    if (ids === null) continue; // no linkage array at all — see `anyStructuralLink`
    anyStructuralLink = true;
    if (!ids.includes(move.wallId)) continue; // this room does not bound the moved wall

    const areaBefore = typeof room.computed?.area === 'number' ? room.computed.area : undefined;
    const refuse = (reason: RoomPredictionRefusal, detail: string): void => {
      out.push({ roomId: room.id, kind: 'undetermined', reason, detail, areaBefore });
    };

    // Collect the segment set from the DECLARED membership, under the proposed baseline.
    const segments: Seg[] = [];
    let bad = false;
    for (const wid of ids) {
      const w = wallById.get(wid);
      if (wid !== move.wallId && !w) {
        refuse('MISSING_BOUNDING_WALL', `room ${room.id} declares wall ${wid}, which is not in the supplied wall set`);
        bad = true; break;
      }
      if (w?.curve) {
        refuse('CURVED_WALL_UNSUPPORTED', `room ${room.id} is bounded by curved wall ${wid}; arc prediction is out of scope for the pure predictor`);
        bad = true; break;
      }
      const bl = baselineOf(wid);
      if (!bl) {
        refuse('MISSING_BOUNDING_WALL', `room ${room.id} declares wall ${wid}, whose baseline is unavailable`);
        bad = true; break;
      }
      if (segLen(bl[0], bl[1]) <= EPSILON_ZERO) continue; // zero-length wall contributes nothing
      segments.push({ a: bl[0], b: bl[1] });
    }
    if (bad) continue;

    if (segments.length < 3) {
      refuse('DEGENERATE_BOUNDARY', `room ${room.id} yields ${segments.length} usable boundary segment(s) under the proposed move; a ring needs ≥ 3`);
      continue;
    }

    // Split/merge heuristic: if the MOVED baseline properly crosses any OTHER boundary
    // segment of this room, the wall is being driven through the room rather than moved
    // along its edge — the resulting partition is a detection question, not a recompute.
    const movedBl = move.baseLine;
    let crosses = false;
    for (const s of segments) {
      if (s.a === movedBl[0] && s.b === movedBl[1]) continue;
      if (segmentsProperlyCross(movedBl[0], movedBl[1], s.a, s.b)) { crosses = true; break; }
    }
    if (crosses) {
      refuse('TOPOLOGY_CHANGE_POSSIBLE', `the proposed baseline of wall ${move.wallId} crosses another boundary wall of room ${room.id}; the move may SPLIT or MERGE rooms, which only re-detection (a mutation) can resolve`);
      continue;
    }

    const ring = traceClosedRing(segments);
    if (!ring) {
      refuse('OPEN_LOOP', `the boundary walls of room ${room.id} do not form a closed ring under the proposed move (welding at ${COINCIDENT_M} m); a dangling gap or fork was reached`);
      continue;
    }
    if (!isSimple(ring)) {
      refuse('SELF_INTERSECTING', `the predicted ring for room ${room.id} self-intersects under the proposed move`);
      continue;
    }
    const area = polygonAreaM2(ring);
    if (area <= EPSILON_ZERO) {
      refuse('COLLAPSED', `the predicted ring for room ${room.id} has zero area under the proposed move`);
      continue;
    }

    out.push({
      roomId: room.id,
      kind: 'determined',
      polygon: ring,
      area,
      perimeter: polygonPerimeterM(ring),
      centroid: polygonCentroid(ring),
      boundingBox: polygonAABB(ring),
      areaBefore,
      areaDelta: areaBefore === undefined ? undefined : area - areaBefore,
    });
  }

  // Stable order — the planner hashes this, so ordering must not depend on input order.
  out.sort((a, b) => a.roomId.localeCompare(b.roomId));
  return { rooms: out, anyStructuralLink };
}
