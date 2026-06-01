// Wall intent resolver — S10-T6.
//
// `code-level ADR docs/02-decisions/adrs/0013-intent-resolver.md`
//
// THREE-free port of three PRYZM 1 modules
// (`src/elements/walls/{WallIntentResolver.ts:213, PathResolver.ts:94,
// WallSnapCycler.ts:196}`) consolidated under a single namespace so the
// wall plugin can drive its tool layer (and eventually its overlay
// layer) without any vector library.
//
// The plugin layer must NOT import THREE (kill-switch K1B-2 — only
// `packages/scene-committer/`, `packages/renderer/`, `apps/bench/**`,
// and `plugins/<elem>/committer.ts` may); this module fills the void
// PRYZM 1 created with `THREE.Vector3` arithmetic by exposing
// the pure XYZ math directly.
//
// THREE side mapping (for the committer / tool reviewer):
//   • `WallIntentResolver.resolveHitToAnchor` → {@link WallIntent.resolveHitToAnchor}
//   • `WallIntentResolver.resolvePlacement`   → {@link WallIntent.resolvePlacement}
//   • `PathResolver.toPolyline`               → {@link PathResolver.toPolyline}
//   • `PathResolver.computeArcLengths`        → {@link PathResolver.computeArcLengths}
//   • `PathResolver.distanceToT`              → {@link PathResolver.distanceToT}
//   • `PathResolver.closestPointOnPolyline`   → {@link PathResolver.closestPointOnPolyline}
//   • `WallSnapCycler` (whole class)          → {@link WallSnapCycler}
//
// PARITY: tested against PRYZM 1 outputs through the existing
// `tests/parity/wall/` harness — every fixture geometry begins with an
// intent-resolver hit, so any divergence in this module surfaces as a
// position/length parity failure on the producer side.

import type { WallData, WallsState } from './store.js';

// ── Pure XYZ helpers (no class, no allocation pressure on hot path) ──
//
// Every helper that returns a Vec3 returns a FRESH object — call sites
// are not allowed to mutate any input.  Hot-loop call sites (snap
// cycler) pre-allocate scratch via `mut*` helpers below.

export type Vec3 = { readonly x: number; readonly y: number; readonly z: number };

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const scl = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const lenSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 0 ? scl(a, 1 / l) : a;
};

// ── PathResolver — straight + arc tessellation, polyline math ────────
//
// 1:1 port of `src/elements/walls/PathResolver.ts:94`.  The arc helper
// uses an explicit quadratic-Bézier evaluator (B(t) = (1-t)²·a +
// 2(1-t)t·c + t²·b) instead of `THREE.QuadraticBezierCurve3.getPoint`
// to keep the package THREE-free; the math is identical so parity
// captures from PRYZM 1's curved-wall configs match byte-for-byte.

export type WallPath =
  | { readonly kind: 'Line'; readonly start: Vec3; readonly end: Vec3 }
  | { readonly kind: 'Arc';  readonly start: Vec3; readonly end: Vec3; readonly control: Vec3 };

export const PathResolver = {
  toPolyline(path: WallPath, segments = 16): readonly Vec3[] {
    if (path.kind === 'Line') return [path.start, path.end];
    // Arc — quadratic-Bézier sampled at `segments + 1` points.
    const out: Vec3[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const u = 1 - t;
      // (1-t)² · start
      const p0 = scl(path.start, u * u);
      // 2(1-t)t · control
      const p1 = scl(path.control, 2 * u * t);
      // t² · end
      const p2 = scl(path.end, t * t);
      out.push(add(add(p0, p1), p2));
    }
    return out;
  },

  computeArcLengths(points: readonly Vec3[]): readonly number[] {
    const out: number[] = [0];
    for (let i = 1; i < points.length; i += 1) {
      out.push(out[i - 1]! + dist(points[i - 1]!, points[i]!));
    }
    return out;
  },

  distanceToT(lengths: readonly number[], targetDist: number): number {
    const total = lengths[lengths.length - 1] ?? 0;
    if (total <= 0) return 0;
    const clamped = Math.max(0, Math.min(targetDist, total));
    for (let i = 1; i < lengths.length; i += 1) {
      if (lengths[i]! >= clamped) {
        const seg = lengths[i]! - lengths[i - 1]!;
        const frac = seg > 0 ? (clamped - lengths[i - 1]!) / seg : 0;
        return ((i - 1) + frac) / (lengths.length - 1);
      }
    }
    return 1;
  },

  closestPointOnPolyline(
    points: readonly Vec3[],
    query: Vec3,
  ): { point: Vec3; t: number; segmentIndex: number } {
    let bestDist = Infinity;
    let bestPoint: Vec3 = points[0] ?? v3(0, 0, 0);
    let bestT = 0;
    let bestSeg = 0;
    const n = points.length;
    for (let i = 0; i < n - 1; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const ab = sub(b, a);
      const aq = sub(query, a);
      const len2 = lenSq(ab);
      let u = len2 > 0 ? dot(aq, ab) / len2 : 0;
      u = Math.max(0, Math.min(1, u));
      const proj = add(a, scl(ab, u));
      const d = dist(query, proj);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = proj;
        bestT = (i + u) / (n - 1);
        bestSeg = i;
      }
    }
    return { point: bestPoint, t: bestT, segmentIndex: bestSeg };
  },
} as const;

// ── WallIntentResolver — anchor + placement resolution ───────────────
//
// 1:1 port of `src/elements/walls/WallIntentResolver.ts:213`.  Every
// `THREE.Vector3` becomes a {@link Vec3} DTO; every `wallStore.getAll()`
// becomes `Object.values(state)`.
//
// `WallData` does NOT carry a `curve` field at S10 (the curved-wall
// path lands in 1B Track B "Arc/Polyline" — DEFERRED per project goal).
// The straight-wall path is fully exercised; the curved branch is
// kept GUARDED behind `wall.curve !== undefined` so the port is a
// drop-in upgrade once the curve field arrives in the schema.

export type WallAnchorType = 'CENTERLINE' | 'FACE' | 'ENDPOINT';
export type WallAnchorSide = 'LEFT' | 'RIGHT' | 'CENTER';

export interface WallAnchor {
  readonly wallId: string;
  readonly type: WallAnchorType;
  readonly point: Vec3;
  readonly normal?: Vec3;
  /** Parameter along the baseline `[0, 1]`. */
  readonly t: number;
  readonly side?: WallAnchorSide;
}

interface WallWithCurve extends WallData {
  readonly curve?: { control: Vec3; segments: number } | undefined;
}

export const WallIntent = {
  /** Resolve a hit point (or proximity query) into a semantic anchor.
   *  Pure / read-only — never mutates the store. */
  resolveHitToAnchor(
    state: WallsState,
    hit: Vec3,
    proximityRadius = 0.3,
  ): WallAnchor | null {
    let target: WallWithCurve | null = null;
    let minDist = proximityRadius;
    for (const w of Object.values(state)) {
      const d = pointToWallDistance(hit, w);
      if (d < minDist) {
        minDist = d;
        target = w;
      }
    }
    if (target === null) return null;
    return resolveAnchorOnWall(target, hit);
  },

  /** Two-anchor placement resolver — perpendicular-snaps the OTHER
   *  endpoint onto the anchor's normal when an anchor carries a normal
   *  (matches PRYZM 1's "perpendicular-to-touched-wall" behaviour). */
  resolvePlacement(
    startAnchor: WallAnchor | Vec3,
    endAnchor: WallAnchor | Vec3,
  ): { start: Vec3; end: Vec3 } {
    const isAnchor = (x: WallAnchor | Vec3): x is WallAnchor =>
      (x as WallAnchor).wallId !== undefined;
    let start: Vec3 = isAnchor(startAnchor) ? startAnchor.point : startAnchor;
    let end:   Vec3 = isAnchor(endAnchor)   ? endAnchor.point   : endAnchor;

    // Priority is the START anchor (matches PRYZM 1's branch order).
    if (isAnchor(startAnchor) && startAnchor.normal !== undefined) {
      const toEnd = sub(end, start);
      const projection = dot(toEnd, startAnchor.normal);
      end = add(start, scl(startAnchor.normal, projection));
    } else if (isAnchor(endAnchor) && endAnchor.normal !== undefined) {
      const toStart = sub(start, end);
      const projection = dot(toStart, endAnchor.normal);
      start = add(end, scl(endAnchor.normal, projection));
    }
    return { start, end };
  },
} as const;

// ── private — wall geometry primitives ──────────────────────────────

function pointToWallDistance(p: Vec3, wall: WallWithCurve): number {
  const [a, b] = wall.baseLine;
  const query = v3(p.x, a.y, p.z); // project onto wall's elevation plane
  if (wall.curve !== undefined) {
    const pts = PathResolver.toPolyline(
      { kind: 'Arc', start: a, end: b, control: wall.curve.control },
      wall.curve.segments,
    );
    return dist(query, PathResolver.closestPointOnPolyline(pts, query).point);
  }
  return pointToSegmentDistance(query, a, b);
}

function pointToSegmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const v = sub(b, a);
  const w = sub(p, a);
  const c1 = dot(w, v);
  if (c1 <= 0) return dist(p, a);
  const c2 = dot(v, v);
  if (c2 <= c1) return dist(p, b);
  const proj = add(a, scl(v, c1 / c2));
  return dist(p, proj);
}

function resolveAnchorOnWall(wall: WallWithCurve, hit: Vec3): WallAnchor | null {
  const thickness = wall.thickness;
  const [a, b] = wall.baseLine;

  if (wall.curve !== undefined) {
    const pts = PathResolver.toPolyline(
      { kind: 'Arc', start: a, end: b, control: wall.curve.control },
      wall.curve.segments,
    );
    const query = v3(hit.x, a.y, hit.z);
    const { point: centerline, t, segmentIndex } =
      PathResolver.closestPointOnPolyline(pts, query);
    const segA = pts[segmentIndex]!;
    const segB = pts[Math.min(segmentIndex + 1, pts.length - 1)]!;
    const tangent = normalize(sub(segB, segA));
    const normal = v3(-tangent.z, 0, tangent.x); // left-hand normal
    const toHit = sub(query, centerline);
    const distFromCenter = dot(toHit, normal);
    return classifyAnchor(wall.id, centerline, normal, distFromCenter, thickness, t);
  }

  const lineDir = sub(b, a);
  const lineLen = len(lineDir);
  if (lineLen < 0.001) return null;
  const dir = scl(lineDir, 1 / lineLen);
  const query = v3(hit.x, a.y, hit.z);
  const v = sub(query, a);
  let t = dot(v, dir) / lineLen;
  t = Math.max(0, Math.min(1, t));
  const centerline = lerp(a, b, t);
  const normal = v3(-dir.z, 0, dir.x);
  const distFromCenter = dot(sub(query, centerline), normal);
  return classifyAnchor(wall.id, centerline, normal, distFromCenter, thickness, t);
}

function classifyAnchor(
  wallId: string,
  centerline: Vec3,
  normal: Vec3,
  distFromCenter: number,
  thickness: number,
  t: number,
): WallAnchor {
  // PRYZM 1 face threshold: > 10% of thickness off centre → snap to face.
  if (Math.abs(distFromCenter) > thickness * 0.1) {
    const side: WallAnchorSide = distFromCenter > 0 ? 'LEFT' : 'RIGHT';
    const offset = side === 'LEFT' ? thickness / 2 : -thickness / 2;
    return {
      wallId,
      type: 'FACE',
      point: add(centerline, scl(normal, offset)),
      normal: side === 'LEFT' ? normal : scl(normal, -1),
      t,
      side,
    };
  }
  return { wallId, type: 'CENTERLINE', point: centerline, t, side: 'CENTER' };
}

// ── WallSnapCycler — Tab-key snap reference cycling ─────────────────
//
// 1:1 port of `src/elements/walls/WallSnapCycler.ts:196`.  Behaviourally
// identical to PRYZM 1; thresholds + dedupe distance are kept in metres
// to mirror the source.  See the source's CONTRACT §04-13 header for
// the full state-machine semantics.
//
// LOCK SEMANTICS — mirrors PRYZM 1's §2.11 Bug-C1 fix: once a candidate
// is locked via `cycleNext()`, the cycler IGNORES `updateCandidates()`
// until `reset()` is called explicitly (otherwise mouse drift would
// silently drop the lock before the user pressed Enter).

export interface WallSnapCandidate {
  readonly point: Vec3;
  readonly label: 'Endpoint' | 'Midpoint' | 'Centerline';
}

const CYCLER_SEARCH_RADIUS = 1.5;
const CYCLER_DEDUPE_DIST = 0.05;
const CYCLER_RESET_THRESHOLD = 0.4;

export class WallSnapCycler {
  private candidates: WallSnapCandidate[] = [];
  private currentIndex = -1;
  private lockedCandidate: WallSnapCandidate | null = null;
  private gatherPosition: Vec3 | null = null;

  constructor(private readonly stateGetter: () => WallsState) {}

  updateCandidates(worldPoint: Vec3): void {
    if (this.lockedCandidate !== null) return;
    if (this.currentIndex >= 0) {
      if (this.gatherPosition !== null && dist(this.gatherPosition, worldPoint) > CYCLER_RESET_THRESHOLD) {
        this.reset();
      } else {
        return;
      }
    }
    this.candidates = this.gatherCandidates(worldPoint);
    this.gatherPosition = worldPoint;
  }

  cycleNext(): WallSnapCandidate | null {
    if (this.candidates.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % this.candidates.length;
    this.lockedCandidate = this.candidates[this.currentIndex] ?? null;
    return this.lockedCandidate;
  }

  get isActive(): boolean { return this.lockedCandidate !== null; }
  getLockedPoint(): Vec3 | null { return this.lockedCandidate?.point ?? null; }
  getLockedLabel(): string | null { return this.lockedCandidate?.label ?? null; }
  getCandidateCount(): number { return this.candidates.length; }

  reset(): void {
    this.candidates = [];
    this.currentIndex = -1;
    this.lockedCandidate = null;
    this.gatherPosition = null;
  }

  dispose(): void { this.reset(); }

  private gatherCandidates(origin: Vec3): WallSnapCandidate[] {
    const raw: WallSnapCandidate[] = [];
    const state = this.stateGetter();
    for (const wall of Object.values(state)) {
      const [a, b] = wall.baseLine;
      if (dist(a, origin) <= CYCLER_SEARCH_RADIUS) raw.push({ point: a, label: 'Endpoint' });
      if (dist(b, origin) <= CYCLER_SEARCH_RADIUS) raw.push({ point: b, label: 'Endpoint' });
      const mid = scl(add(a, b), 0.5);
      if (dist(mid, origin) <= CYCLER_SEARCH_RADIUS) raw.push({ point: mid, label: 'Midpoint' });
      const closest = closestPointOnSegment(origin, a, b);
      if (closest !== null && dist(closest, origin) <= CYCLER_SEARCH_RADIUS) {
        const dupNearKnown =
          dist(closest, a) < CYCLER_DEDUPE_DIST * 2 ||
          dist(closest, b) < CYCLER_DEDUPE_DIST * 2 ||
          dist(closest, mid) < CYCLER_DEDUPE_DIST * 2;
        if (!dupNearKnown) raw.push({ point: closest, label: 'Centerline' });
      }
    }
    raw.sort((x, y) => dist(x.point, origin) - dist(y.point, origin));
    const out: WallSnapCandidate[] = [];
    for (const c of raw) {
      const isDup = out.some((r) => dist(r.point, c.point) < CYCLER_DEDUPE_DIST);
      if (!isDup) out.push(c);
    }
    return out;
  }
}

function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 | null {
  const ab = sub(b, a);
  const len2 = lenSq(ab);
  if (len2 < 1e-10) return null;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return add(a, scl(ab, t));
}
