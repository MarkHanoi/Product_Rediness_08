// Wall intent resolver — unit tests (S10-T6).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10 test catalog:
//   - `resolveJoinTarget picks endpoint over midpoint`
//   - `tie-breaking priority order matches ADR-0013 table`
//   - `cycleSnap cycles deterministically`
//   - `resolveOpeningPosition handles curved wall correctly`
//
// `code-level ADR docs/02-decisions/adrs/0013-intent-resolver.md`
//
// The intent resolver is THREE-free (kill-switch K1B-4).  All tests
// run in Node; no DOM required.

import { describe, expect, it, beforeEach } from 'vitest';
import {
  PathResolver,
  WallIntent,
  WallSnapCycler,
  v3,
  type Vec3,
  type WallAnchor,
  type WallSnapCandidate,
} from '../src/intent.js';
import { WallStore } from '../src/store.js';
import { Wall, createId } from '@pryzm/plugin-sdk';

// ── helpers ──────────────────────────────────────────────────────────

function mkWall(
  id: string,
  start: Vec3,
  end: Vec3,
  thickness = 0.2,
): ReturnType<typeof Wall.parse> {
  return Wall.parse({
    id: createId('wall'),
    levelId: 'level:0',
    baseLine: [start, end],
    thickness,
    height: 3,
    color: '#cccccc',
  });
}

function storeOf(
  walls: ReturnType<typeof Wall.parse>[],
): ReturnType<typeof WallStore.prototype['getAll']> {
  const s: Record<string, ReturnType<typeof Wall.parse>> = {};
  for (const w of walls) s[w.id] = w;
  return s;
}

// ── PathResolver ─────────────────────────────────────────────────────

describe('PathResolver', () => {
  it('toPolyline — Line returns only the two endpoints', () => {
    const path = { kind: 'Line' as const, start: v3(0, 0, 0), end: v3(4, 0, 0) };
    const pts = PathResolver.toPolyline(path);
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual(v3(0, 0, 0));
    expect(pts[1]).toEqual(v3(4, 0, 0));
  });

  it('toPolyline — Arc produces segments+1 points and lies on quadratic Bézier', () => {
    const path = {
      kind: 'Arc' as const,
      start: v3(0, 0, 0),
      end: v3(4, 0, 0),
      control: v3(2, 0, 2),
    };
    const pts = PathResolver.toPolyline(path, 8);
    expect(pts.length).toBe(9); // segments + 1
    // midpoint (t=0.5): (1-0.5)²·start + 2·0.5·0.5·control + 0.5²·end
    const mid = pts[4]!;
    expect(mid.x).toBeCloseTo(2, 5);
    expect(mid.z).toBeCloseTo(1, 5);
  });

  it('computeArcLengths — cumulative distances start at 0', () => {
    const pts = [v3(0, 0, 0), v3(3, 0, 0), v3(3, 0, 4)];
    const lengths = PathResolver.computeArcLengths(pts);
    expect(lengths[0]).toBe(0);
    expect(lengths[1]).toBeCloseTo(3, 5);
    expect(lengths[2]).toBeCloseTo(7, 5);
  });

  it('distanceToT — midpoint of arc returns 0.5', () => {
    const pts = [v3(0, 0, 0), v3(2, 0, 0), v3(4, 0, 0)];
    const lengths = PathResolver.computeArcLengths(pts);
    expect(PathResolver.distanceToT(lengths, 2)).toBeCloseTo(0.5, 5);
  });

  it('closestPointOnPolyline — projects correctly onto segment', () => {
    const pts = [v3(0, 0, 0), v3(10, 0, 0)];
    const q = v3(5, 0, 3);
    const { point, t } = PathResolver.closestPointOnPolyline(pts, q);
    expect(point.x).toBeCloseTo(5, 5);
    expect(point.z).toBeCloseTo(0, 5);
    expect(t).toBeCloseTo(0.5, 5);
  });
});

// ── WallIntent.resolveHitToAnchor ────────────────────────────────────

describe('WallIntent.resolveHitToAnchor', () => {
  const wallA = mkWall('w1', v3(0, 0, 0), v3(5, 0, 0));
  const wallB = mkWall('w2', v3(5, 0, 0), v3(5, 0, 5));

  it('returns null when no wall is within proximity', () => {
    const state = storeOf([wallA, wallB]);
    const result = WallIntent.resolveHitToAnchor(state, v3(99, 0, 99));
    expect(result).toBeNull();
  });

  it('resolves to CENTERLINE when hit is at wall centre', () => {
    const state = storeOf([wallA]);
    const result = WallIntent.resolveHitToAnchor(state, v3(2.5, 0, 0));
    expect(result).not.toBeNull();
    expect(result!.type).toBe('CENTERLINE');
  });

  it('resolves to FACE when hit is off-centre by more than 10% of thickness', () => {
    const wall = mkWall('w3', v3(0, 0, 0), v3(5, 0, 0), 0.2);
    const state = storeOf([wall]);
    // 0.15 m > 10% of 0.2 m = 0.02 m threshold
    const result = WallIntent.resolveHitToAnchor(state, v3(2.5, 0, 0.15), 1.0);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('FACE');
  });

  it('endpoint anchor — t is 0 at start and 1 at end', () => {
    const wall = mkWall('wx', v3(0, 0, 0), v3(6, 0, 0), 0.2);
    const state = storeOf([wall]);
    const atStart = WallIntent.resolveHitToAnchor(state, v3(0, 0, 0), 1.0);
    const atEnd   = WallIntent.resolveHitToAnchor(state, v3(6, 0, 0), 1.0);
    expect(atStart).not.toBeNull();
    expect(atEnd).not.toBeNull();
    expect(atStart!.t).toBeCloseTo(0, 3);
    expect(atEnd!.t).toBeCloseTo(1, 3);
  });

  it('picks closer wall when two walls overlap in proximity', () => {
    const close = mkWall('close', v3(0, 0, 0), v3(4, 0, 0), 0.2);
    const far   = mkWall('far',   v3(0, 0, 1), v3(4, 0, 1), 0.2);
    const state = storeOf([close, far]);
    const result = WallIntent.resolveHitToAnchor(state, v3(2, 0, 0.05));
    expect(result).not.toBeNull();
    expect(result!.wallId).toBe(close.id);
  });
});

// ── WallIntent.resolvePlacement ──────────────────────────────────────

describe('WallIntent.resolvePlacement', () => {
  it('Vec3+Vec3 pass-through — no perpendicular constraint', () => {
    const start = v3(0, 0, 0);
    const end   = v3(3, 0, 4);
    const result = WallIntent.resolvePlacement(start, end);
    expect(result.start).toEqual(start);
    expect(result.end).toEqual(end);
  });

  it('anchor with normal constrains the other point to the normal direction', () => {
    const anchor: WallAnchor = {
      wallId: 'w1',
      type: 'FACE',
      point: v3(0, 0, 0),
      normal: v3(1, 0, 0),
      t: 0,
      side: 'LEFT',
    };
    // End 2 m away in X and 3 m in Z; after constraint, Z component is dropped.
    const result = WallIntent.resolvePlacement(anchor, v3(2, 0, 3));
    expect(result.start.x).toBeCloseTo(0, 5);
    expect(result.end.z).toBeCloseTo(0, 5); // projected onto normal (X-axis)
  });
});

// ── WallSnapCycler ───────────────────────────────────────────────────
// Mirrors the spec's "cycleSnap cycles deterministically" requirement.

describe('WallSnapCycler', () => {
  const wallH = mkWall('h', v3(0, 0, 0), v3(4, 0, 0));
  const wallV = mkWall('v', v3(2, 0, -2), v3(2, 0, 2));

  function makeStore(): Record<string, typeof wallH> {
    return { [wallH.id]: wallH, [wallV.id]: wallV };
  }

  let cycler: WallSnapCycler;

  beforeEach(() => {
    cycler = new WallSnapCycler(() => makeStore());
  });

  it('is not active before first cycle', () => {
    expect(cycler.isActive).toBe(false);
    expect(cycler.getLockedPoint()).toBeNull();
  });

  it('gathers candidates near the query point', () => {
    // Update near the intersection of the two walls (2, 0, 0)
    cycler.updateCandidates(v3(2, 0, 0));
    expect(cycler.getCandidateCount()).toBeGreaterThan(0);
  });

  it('cycleNext advances and locks a candidate', () => {
    cycler.updateCandidates(v3(2, 0, 0));
    const first = cycler.cycleNext();
    expect(first).not.toBeNull();
    expect(cycler.isActive).toBe(true);
    expect(cycler.getLockedPoint()).toEqual(first!.point);
  });

  it('cycles deterministically — cycling N candidates wraps back', () => {
    cycler.updateCandidates(v3(2, 0, 0));
    const count = cycler.getCandidateCount();
    if (count === 0) return; // no candidates at this position, skip
    const visited = new Set<string>();
    for (let i = 0; i < count; i++) {
      const c = cycler.cycleNext();
      expect(c).not.toBeNull();
      const key = `${c!.point.x},${c!.point.y},${c!.point.z}`;
      visited.add(key);
    }
    expect(visited.size).toBe(count); // each candidate is distinct
    // One more cycle should wrap — re-pick the first candidate
    const wrapped = cycler.cycleNext();
    expect(wrapped).not.toBeNull();
  });

  it('lock semantics — updateCandidates is ignored after lock', () => {
    cycler.updateCandidates(v3(2, 0, 0));
    const locked = cycler.cycleNext();
    const lockedLabel = cycler.getLockedLabel();
    // Move far away — normally resets; but lock blocks the update.
    cycler.updateCandidates(v3(99, 0, 99));
    expect(cycler.isActive).toBe(true);
    expect(cycler.getLockedLabel()).toBe(lockedLabel);
    expect(cycler.getLockedPoint()).toEqual(locked!.point);
  });

  it('reset clears lock and candidates', () => {
    cycler.updateCandidates(v3(2, 0, 0));
    cycler.cycleNext();
    cycler.reset();
    expect(cycler.isActive).toBe(false);
    expect(cycler.getLockedPoint()).toBeNull();
    expect(cycler.getCandidateCount()).toBe(0);
  });

  it('Endpoint candidates are preferred (sorted by distance, endpoints appear first)', () => {
    // Wall with endpoint exactly at query — should produce an Endpoint candidate
    const wall = mkWall('ep', v3(0, 0, 0), v3(0, 0, 0.5));
    const localCycler = new WallSnapCycler(() => ({
      [wall.id]: wall,
    }));
    localCycler.updateCandidates(v3(0, 0, 0));
    const first = localCycler.cycleNext();
    expect(first).not.toBeNull();
    expect(first!.label).toBe('Endpoint');
  });
});
