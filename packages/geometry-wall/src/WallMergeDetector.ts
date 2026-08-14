/**
 * WallMergeDetector — §C83-MERGE (ISSUE-LOG L-903, 2026-08-14)
 *
 * ── THE DEFECT THIS DETECTS (founder, production 2026-08-14) ─────────────────
 * Move a wall so its baseline becomes collinear and contiguous with a
 * neighbouring parallel wall — the intent is plainly "these are now ONE wall".
 * What happens instead: the two collinear walls remain two independent elements
 * butted end-to-end, and the perpendicular connector that used to join them —
 * which after the move separates NOTHING — survives as a redundant stub. The
 * founder's framing: *"the building needs to behave like a living entity …
 * we should have a result of a single combined wall."*
 *
 * ── WHAT THIS MODULE IS ──────────────────────────────────────────────────────
 * The PURE detector, and nothing else. It answers two questions:
 *
 *  (a) **Collinear-merge candidates** — which wall, if any, has become
 *      mergeable with the MOVED wall: same axis within kernel tolerance,
 *      contiguous/overlapping span, a shared junction, same type + thickness.
 *      For a defensible candidate it also computes the full MERGE PLAN: the
 *      merged baseline, the station shift the survivor's own openings need,
 *      and every hosted opening on the absorbed wall re-stationed onto the
 *      merged baseline — EACH transfer validated through
 *      `WallOccupancyStore.canPlace` before the plan may be offered. One
 *      unplaceable opening refuses the WHOLE merge atomically (a merge that
 *      silently destroys a door is C78 §1.2(a)).
 *
 *  (b) **Redundant stub** — a wall whose two faces bound the SAME room.
 *      `room.boundingWallIds` is the authority (C83 §0.2 table: top-level on
 *      the schema, written by RoomDetectionEngine, persisted verbatim; the
 *      graph edge is a mirror). The face test then uses the room's OWN
 *      recorded polygon: both face-side probe points inside one same room ⇒
 *      the wall separates nothing. This is the SEMANTIC test for redundancy,
 *      not a geometry-proximity test (C83 §2).
 *
 * ── HONESTY RULES, load-bearing ──────────────────────────────────────────────
 *  • UNDETERMINED room data → NO stub finding (C83 §5.3). A room with an empty
 *    `boundingWallIds` is a hand-drawn room whose list was never recorded
 *    (C83 §0.2.1 defect 3) — empty means UNKNOWN there, never "no walls", so
 *    no wall may be called redundant on its evidence. No rooms at all on the
 *    level → no stub findings, with the reason carried as data.
 *  • Curved walls are OUT — the station model is chord-based; a curved
 *    candidate or partner produces no finding, never a guess.
 *  • Tolerances are CONSUMED from `@pryzm/geometry-kernel`, never minted
 *    (C73 §2.2): `COINCIDENT_M` for span contiguity and thickness identity,
 *    `arePointsCoincident2D` for shared junctions, `isParallel` on unit
 *    directions for the axis test, `isNumericallyZero` for degenerate guards.
 *
 * PURE: no store singletons read for detection state (the occupancy validation
 * calls `wallOccupancyStore.canPlace`, itself a pure query over the wall record
 * passed to it), no window, no THREE, no DOM, no clock. Every input is a
 * parameter — the same property that lets `WallCrossesOpening` serve three
 * layers from one predicate.
 *
 * Detection is intended to run on wall MOVES only — the caller owns that
 * scoping; this module judges whatever state it is handed.
 *
 * @file packages/geometry-wall/src/WallMergeDetector.ts
 */

import {
  COINCIDENT_M,
  arePointsCoincident2D,
  isCoincidentDistanceM,
  isNumericallyZero,
  isParallel,
} from '@pryzm/geometry-kernel';
import type { Opening, WallData } from './WallTypes';
import { wallOccupancyStore } from './WallOccupancyStore';

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** A point in the world XZ plane; `y` carries level elevation. */
export interface MergePlanPoint {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
}

/**
 * The room facts the stub test consumes — deliberately NOT `RoomData`: this
 * package sits below `room-topology`, so the caller (the editor wiring) hands
 * the authority fields down as plain data.
 */
export interface MergeRoomLike {
  readonly id: string;
  readonly name?: string;
  readonly levelId: string;
  /** THE authority for wall↔room bounding (C83 §0.2). Empty ⇒ UNDETERMINED, not "none". */
  readonly boundingWallIds: readonly string[];
  /** The room's recorded boundary polygon, world XZ. */
  readonly polygon: readonly { readonly x: number; readonly z: number }[];
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

/** One hosted opening on the absorbed wall, re-stationed onto the merged baseline. */
export interface MergeOpeningTransfer {
  readonly opening: Opening;
  readonly fromWallId: string;
  /** Station of the opening's start edge from `mergedBaseLine[0]`, metres. */
  readonly newOffsetM: number;
}

export interface CollinearMergeCandidate {
  readonly kind: 'collinear-merge';
  /** The MOVED wall — it keeps its identity and absorbs the other. */
  readonly survivorId: string;
  readonly absorbedId: string;
  /** Survivor direction preserved; spans the union of both walls. */
  readonly mergedBaseLine: readonly [MergePlanPoint, MergePlanPoint];
  /**
   * How far the survivor's OWN openings must shift (+, metres) to keep their
   * physical position when the merge extends the survivor's START. Zero when
   * the absorbed wall lies beyond the survivor's end.
   */
  readonly survivorOpeningShiftM: number;
  /** Every opening the absorbed wall hosts, each already validated by canPlace. */
  readonly openingTransfers: readonly MergeOpeningTransfer[];
}

/** A merge that was geometrically found and then REFUSED — with the reason. */
export interface CollinearMergeRefusal {
  readonly kind: 'merge-refused';
  readonly survivorId: string;
  readonly absorbedId: string;
  readonly reason: string;
}

export interface RedundantStubFinding {
  readonly kind: 'redundant-stub';
  readonly stubWallId: string;
  /** The ONE room both faces of the stub bound. */
  readonly roomId: string;
  readonly roomName?: string;
  /** Openings hosted ON the stub — deleting the stub deletes these; the offer must name them. */
  readonly hostedOpenings: readonly Opening[];
}

export interface WallMergeDetection {
  readonly candidates: readonly CollinearMergeCandidate[];
  readonly refusals: readonly CollinearMergeRefusal[];
  readonly stubs: readonly RedundantStubFinding[];
  /**
   * True when the stub half could not be judged (no room data, or every room's
   * `boundingWallIds` unrecorded). Carried so a caller can declare the blind
   * spot instead of inheriting it as silence — never conflated with "no stubs".
   */
  readonly stubsUndetermined: boolean;
  readonly stubsUndeterminedReason?: string;
}

// ─── Vector helpers (local, pure, no tuning constants) ────────────────────────

interface V2 {
  readonly x: number;
  readonly z: number;
}

const sub = (a: MergePlanPoint | V2, b: MergePlanPoint | V2): V2 => ({ x: a.x - b.x, z: a.z - b.z });
const dot = (a: V2, b: V2): number => a.x * b.x + a.z * b.z;
const cross2 = (a: V2, b: V2): number => a.x * b.z - a.z * b.x;
const len = (a: V2): number => Math.hypot(a.x, a.z);

/** Even-odd ray cast. Pure algorithm — no tolerance is involved in its answer. */
function pointInPolygon(
  x: number,
  z: number,
  polygon: readonly { readonly x: number; readonly z: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (
      pi.z > z !== pj.z > z &&
      x < ((pj.x - pi.x) * (z - pi.z)) / (pj.z - pi.z) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── (a) The collinear-merge detector ─────────────────────────────────────────

/**
 * Which wall, if any, has the MOVED wall become mergeable with?
 *
 * All four predicate arms must hold (each is named in L-903):
 *   1. SAME AXIS — parallel unit directions AND the partner's endpoints within
 *      `COINCIDENT_M` perpendicular distance of the moved wall's line;
 *   2. CONTIGUOUS/OVERLAPPING SPANS along that shared axis;
 *   3. SHARED JUNCTION — an endpoint of one coincident with an endpoint of the
 *      other (two walls merely passing collinearly do not merge);
 *   4. SAME TYPE + THICKNESS — `systemTypeId` identical (both-absent counts as
 *      identical) and thickness within the coincidence tolerance.
 *
 * A geometric candidate whose opening transfer cannot be validated is returned
 * as a REFUSAL naming the opening — never silently dropped, never offered.
 */
export function detectCollinearMerge(
  movedWallId: string,
  walls: readonly WallData[],
): { candidates: readonly CollinearMergeCandidate[]; refusals: readonly CollinearMergeRefusal[] } {
  const candidates: CollinearMergeCandidate[] = [];
  const refusals: CollinearMergeRefusal[] = [];

  const mover = walls.find((w) => w.id === movedWallId);
  if (!mover?.baseLine?.[0] || !mover.baseLine[1]) return { candidates, refusals };
  // Curved subject ⇒ the chord-station model does not apply. No finding, no guess.
  if ((mover as { curve?: unknown }).curve != null) return { candidates, refusals };

  const a0 = mover.baseLine[0];
  const a1 = mover.baseLine[1];
  const dir = sub(a1, a0);
  const lenM = len(dir);
  if (isNumericallyZero(lenM)) return { candidates, refusals };
  const axis: V2 = { x: dir.x / lenM, z: dir.z / lenM };
  const normal: V2 = { x: -axis.z, z: axis.x };

  const moverThickness = typeof mover.thickness === 'number' ? mover.thickness : 0;
  const moverSystemType = mover.systemTypeId ?? null;

  const partners = walls
    .filter((w) => w.levelId === mover.levelId && w.id !== mover.id)
    .slice()
    .sort((x, y) => String(x.id).localeCompare(String(y.id)));

  for (const partner of partners) {
    const b = partner.baseLine;
    if (!b?.[0] || !b[1]) continue;
    if ((partner as { curve?: unknown }).curve != null) continue; // out of the model, not "clear"

    // 4 — SAME TYPE + THICKNESS. Checked first: cheapest, and the most common
    // honest reason two butted walls are NOT one wall (a partition meeting a
    // structural wall end-on is a junction, not a fragment).
    const partnerThickness = typeof partner.thickness === 'number' ? partner.thickness : 0;
    if (!isCoincidentDistanceM(Math.abs(partnerThickness - moverThickness))) continue;
    if ((partner.systemTypeId ?? null) !== moverSystemType) continue;

    // 1 — SAME AXIS.
    const pd = sub(b[1], b[0]);
    const plen = len(pd);
    if (isNumericallyZero(plen)) continue;
    const paxis: V2 = { x: pd.x / plen, z: pd.z / plen };
    if (!isParallel(cross2(axis, paxis))) continue;
    // Perpendicular offset of BOTH partner endpoints from the mover's line.
    const off0 = Math.abs(dot(sub(b[0], a0), normal));
    const off1 = Math.abs(dot(sub(b[1], a0), normal));
    if (off0 > COINCIDENT_M || off1 > COINCIDENT_M) continue;

    // 2 — CONTIGUOUS/OVERLAPPING SPANS along the mover's axis.
    const s0 = dot(sub(b[0], a0), axis);
    const s1 = dot(sub(b[1], a0), axis);
    const p0 = Math.min(s0, s1);
    const p1 = Math.max(s0, s1);
    if (p0 > lenM + COINCIDENT_M || p1 < -COINCIDENT_M) continue; // a gap is not contiguity

    // 3 — SHARED JUNCTION.
    const sharesEndpoint =
      arePointsCoincident2D(a0.x, a0.z, b[0].x, b[0].z) ||
      arePointsCoincident2D(a0.x, a0.z, b[1].x, b[1].z) ||
      arePointsCoincident2D(a1.x, a1.z, b[0].x, b[0].z) ||
      arePointsCoincident2D(a1.x, a1.z, b[1].x, b[1].z);
    if (!sharesEndpoint) continue;

    // ── The MERGE PLAN ───────────────────────────────────────────────────────
    const mMin = Math.min(0, p0);
    const mMax = Math.max(lenM, p1);
    const y = a0.y ?? 0;
    const mergedBaseLine: readonly [MergePlanPoint, MergePlanPoint] = [
      { x: a0.x + axis.x * mMin, y, z: a0.z + axis.z * mMin },
      { x: a0.x + axis.x * mMax, y, z: a0.z + axis.z * mMax },
    ];
    const survivorOpeningShiftM = -mMin; // 0 when the extension is beyond the end

    // Openings on the absorbed wall, re-stationed via WORLD positions (the
    // partner's direction may oppose the survivor's).
    const bStart = b[0];
    const bAxis = paxis;
    const transfers: MergeOpeningTransfer[] = [];
    let transferRefusal: string | null = null;

    // The hypothetical merged wall the validation runs against: survivor's
    // record, merged baseline, survivor's own openings pre-shifted. Each
    // accepted transfer is appended before the next is asked, so two
    // transferred openings cannot silently overlap each other.
    const hypoOpenings: Opening[] = (mover.openings ?? []).map((o) => ({
      ...o,
      offset: o.offset + survivorOpeningShiftM,
    }));
    const hypo = {
      ...mover,
      baseLine: [
        { x: mergedBaseLine[0].x, y, z: mergedBaseLine[0].z },
        { x: mergedBaseLine[1].x, y, z: mergedBaseLine[1].z },
      ],
      openings: hypoOpenings,
    } as WallData;

    for (const o of partner.openings ?? []) {
      const eStartW = { x: bStart.x + bAxis.x * o.offset, z: bStart.z + bAxis.z * o.offset };
      const eEndW = {
        x: bStart.x + bAxis.x * (o.offset + o.width),
        z: bStart.z + bAxis.z * (o.offset + o.width),
      };
      const t0 = dot(sub(eStartW, mergedBaseLine[0]), axis);
      const t1 = dot(sub(eEndW, mergedBaseLine[0]), axis);
      const newOffsetM = Math.min(t0, t1);

      const verdict = wallOccupancyStore.canPlace(hypo, newOffsetM, o.width);
      if (!verdict.valid) {
        transferRefusal =
          `the ${o.type} ${o.elementId} on wall ${partner.id} cannot be re-hosted on the ` +
          `merged wall at ${newOffsetM.toFixed(3)}–${(newOffsetM + o.width).toFixed(3)} m` +
          (verdict.reason ? ` — ${verdict.reason}` : '');
        break;
      }
      transfers.push({ opening: o, fromWallId: partner.id, newOffsetM });
      hypoOpenings.push({ ...o, offset: newOffsetM });
    }

    if (transferRefusal !== null) {
      // ATOMIC refusal: one unplaceable opening refuses the whole merge
      // (C73 §4 — with the element named), rather than a merge that quietly
      // drops a door.
      refusals.push({
        kind: 'merge-refused',
        survivorId: mover.id,
        absorbedId: partner.id,
        reason: transferRefusal,
      });
      continue;
    }

    candidates.push({
      kind: 'collinear-merge',
      survivorId: mover.id,
      absorbedId: partner.id,
      mergedBaseLine: [
        { x: a0.x + axis.x * mMin, y, z: a0.z + axis.z * mMin },
        { x: a0.x + axis.x * mMax, y, z: a0.z + axis.z * mMax },
      ],
      survivorOpeningShiftM,
      openingTransfers: transfers,
    });
  }

  return { candidates, refusals };
}

// ─── (b) The redundant-stub detector ──────────────────────────────────────────

/**
 * Which of `scopeWallIds` (walls touching the merge site — the caller scopes;
 * this module does not sweep the level) now has BOTH faces in the SAME room?
 *
 * The association authority is `room.boundingWallIds`; the face-side test uses
 * that room's own recorded polygon. Probe points sit one coincidence-tolerance
 * beyond each face at the wall's midpoint.
 *
 * UNDETERMINED is a first-class answer: no rooms, or no room with a recorded
 * (non-empty) `boundingWallIds`, means the question cannot be asked — reported
 * as such, never as "no stubs" (C83 §5.3, §0.2.1).
 */
export function detectRedundantStubs(
  scopeWallIds: readonly string[],
  walls: readonly WallData[],
  rooms: readonly MergeRoomLike[],
  levelId: string,
): {
  stubs: readonly RedundantStubFinding[];
  undetermined: boolean;
  undeterminedReason?: string;
} {
  const levelRooms = rooms.filter((r) => r.levelId === levelId);
  if (levelRooms.length === 0) {
    return {
      stubs: [],
      undetermined: true,
      undeterminedReason:
        'no room data on this level — whether any wall separates nothing cannot be judged',
    };
  }
  // C83 §0.2.1 defect 3: an empty boundingWallIds list means UNRECORDED, not
  // "bounded by nothing". Rooms without the record cannot testify.
  const recorded = levelRooms.filter(
    (r) => r.boundingWallIds.length > 0 && r.polygon.length >= 3,
  );
  if (recorded.length === 0) {
    return {
      stubs: [],
      undetermined: true,
      undeterminedReason:
        'no room on this level carries a recorded boundingWallIds list — empty means ' +
        'unknown there, so no wall can be called redundant on its evidence',
    };
  }

  const stubs: RedundantStubFinding[] = [];
  for (const wallId of scopeWallIds) {
    const wall = walls.find((w) => w.id === wallId);
    if (!wall?.baseLine?.[0] || !wall.baseLine[1]) continue;
    if (wall.levelId !== levelId) continue;
    if ((wall as { curve?: unknown }).curve != null) continue;

    const d = sub(wall.baseLine[1], wall.baseLine[0]);
    const l = len(d);
    if (isNumericallyZero(l)) continue;
    const n: V2 = { x: -d.z / l, z: d.x / l };
    const mid = {
      x: (wall.baseLine[0].x + wall.baseLine[1].x) / 2,
      z: (wall.baseLine[0].z + wall.baseLine[1].z) / 2,
    };
    const half = (typeof wall.thickness === 'number' ? wall.thickness : 0) / 2;
    const probe = half + COINCIDENT_M; // one tolerance beyond the face
    const faceA = { x: mid.x + n.x * probe, z: mid.z + n.z * probe };
    const faceB = { x: mid.x - n.x * probe, z: mid.z - n.z * probe };

    // The authority first: only rooms that LIST this wall may testify about it.
    const listing = recorded.filter((r) => r.boundingWallIds.includes(wallId));
    if (listing.length === 0) continue; // unlisted ⇒ no claim, not "redundant"

    const bothFaces = listing.find(
      (r) =>
        pointInPolygon(faceA.x, faceA.z, r.polygon) &&
        pointInPolygon(faceB.x, faceB.z, r.polygon),
    );
    if (!bothFaces) continue;

    stubs.push({
      kind: 'redundant-stub',
      stubWallId: wallId,
      roomId: bothFaces.id,
      ...(bothFaces.name !== undefined ? { roomName: bothFaces.name } : {}),
      hostedOpenings: (wall.openings ?? []).map((o) => ({ ...o })),
    });
  }
  return { stubs, undetermined: false };
}

// ─── The one entry point ──────────────────────────────────────────────────────

/**
 * Run both halves for one MOVED wall. The stub scope is every wall sharing an
 * endpoint with the mover or with an absorbed candidate — the walls the
 * founder's gesture actually touched, not a level sweep.
 */
export function detectWallMerge(
  movedWallId: string,
  walls: readonly WallData[],
  rooms: readonly MergeRoomLike[],
): WallMergeDetection {
  const { candidates, refusals } = detectCollinearMerge(movedWallId, walls);

  const mover = walls.find((w) => w.id === movedWallId);
  if (!mover?.baseLine?.[0] || !mover.baseLine[1]) {
    return { candidates, refusals, stubs: [], stubsUndetermined: true, stubsUndeterminedReason: 'moved wall not found' };
  }

  // Scope: walls junctioned to the mover or to an absorbed partner.
  const anchors: MergePlanPoint[] = [mover.baseLine[0], mover.baseLine[1]];
  for (const c of candidates) {
    const absorbed = walls.find((w) => w.id === c.absorbedId);
    if (absorbed?.baseLine?.[0] && absorbed.baseLine[1]) {
      anchors.push(absorbed.baseLine[0], absorbed.baseLine[1]);
    }
  }
  const involved = new Set<string>([movedWallId, ...candidates.map((c) => c.absorbedId)]);
  const scope = walls
    .filter((w) => {
      if (involved.has(w.id)) return false;
      if (w.levelId !== mover.levelId) return false;
      const b = w.baseLine;
      if (!b?.[0] || !b[1]) return false;
      return anchors.some(
        (p) =>
          arePointsCoincident2D(p.x, p.z, b[0].x, b[0].z) ||
          arePointsCoincident2D(p.x, p.z, b[1].x, b[1].z),
      );
    })
    .map((w) => w.id);

  const stubResult = detectRedundantStubs(scope, walls, rooms, mover.levelId);
  return {
    candidates,
    refusals,
    stubs: stubResult.stubs,
    stubsUndetermined: stubResult.undetermined,
    ...(stubResult.undeterminedReason !== undefined
      ? { stubsUndeterminedReason: stubResult.undeterminedReason }
      : {}),
  };
}
