/**
 * @vitest-environment happy-dom
 *
 * §FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63, 2026-07-03) — the wall-move-with-hosted-door
 * FREEZE safety net.
 *
 * THE founder blocker: create a wall with a hosted door, then MOVE it. The join resolver
 * square-caps the moved arm to a consensus point the room loop cannot close
 * (`§DIAG-ROOM-LOOP BREAK … EXCEEDS hostSnap → loop will NOT close`), and the resulting
 * `bim-wall-mutation-committed` re-armed a WHOLE-LEVEL room redetect every frame → the main
 * thread pegged → hard freeze.
 *
 * Room re-detection is a pure function of the level's wall geometry. Because a join is a
 * render-time footprint operation (§FIX-WALL-JOIN-BASELINE-IMMUTABLE), the STORE baselines
 * are stable across the loop — so a redetect requested on byte-identical wall geometry can
 * make NO progress. This suite pins the two bounds that break the loop:
 *   (1) committed-path no-progress gate — N committed events on UNCHANGED walls redetect at
 *       most ONCE; a genuine wall edit (changed signature) redetects again;
 *   (2) execution circuit-breaker — a per-frame runaway that reaches `_executeRedetect`
 *       directly (forced-fire / coalesce timer) with the SAME geometry is bounded, never
 *       infinite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomTopologyObserver } from '../RoomTopologyObserver';

type Bl = Array<{ x: number; y: number; z: number }>;
interface Wall {
  id: string; levelId: string; baseLine: Bl; thickness: number; height: number;
  properties?: Record<string, unknown>; materialId?: string;
}

function makeObserver(walls: Wall[]) {
  const execute = vi.fn();
  const wallStore = {
    subscribe: () => () => {},
    getByLevel: (id: string) => walls.filter(w => w.levelId === id),
  };
  const bimManager = {
    getLevelById: (id: string) => ({ id, elevation: 0, height: 3.0 }),
    getLevels: () => [{ id: 'L0' }],
  };
  const observer = new RoomTopologyObserver(
    wallStore as any, {} as any, { execute } as any, {} as any, bimManager as any,
  );
  return { observer, execute };
}

function wall(id: string, ax: number, az: number, bx: number, bz: number, t = 0.2, h = 3): Wall {
  return { id, levelId: 'L0', baseLine: [{ x: ax, y: 0, z: az }, { x: bx, y: 0, z: bz }], thickness: t, height: h };
}

function setDrag(on: boolean): void {
  (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = on;
}

describe('§FIX-ROOMREDETECT-NOPROGRESS-GUARD (L-63) — non-closing loop cannot re-arm redetect forever', () => {
  beforeEach(() => { vi.useFakeTimers(); setDrag(false); });
  afterEach(() => { vi.useRealTimers(); setDrag(false); });

  it('committed-path: N committed events on UNCHANGED walls → exactly ONE redetect (converges)', () => {
    const walls = [wall('A', 0, 0, 5, 0), wall('B', 5, 0, 5, 5)];
    const { observer, execute } = makeObserver(walls);

    // Simulate the runaway: the same committed event fires repeatedly (baseline-immutable →
    // wall geometry never changes). Only the FIRST can make progress.
    for (let i = 0; i < 30; i++) {
      (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
      vi.advanceTimersByTime(400); // past SOFT_COALESCE_MS each time
    }
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('a GENUINE wall edit (changed signature) releases the gate and redetects again', () => {
    const walls = [wall('A', 0, 0, 5, 0), wall('B', 5, 0, 5, 5)];
    const { observer, execute } = makeObserver(walls);

    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);

    // No-op repeat — suppressed.
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);

    // Genuine MOVE of wall A → signature changes → redetect runs again.
    walls[0]!.baseLine[1]!.x = 6;
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('execution circuit-breaker: a direct-call runaway on identical geometry is BOUNDED', () => {
    const walls = [wall('A', 0, 0, 5, 0), wall('B', 5, 0, 5, 5)];
    const { observer, execute } = makeObserver(walls);

    // The forced-fire / coalesce paths can call _executeRedetect directly, bypassing the
    // committed gate. A per-frame runaway must be bounded, not infinite.
    for (let i = 0; i < 60; i++) (observer as any)._executeRedetect('L0');
    expect(execute.mock.calls.length).toBeGreaterThan(0);
    expect(execute.mock.calls.length).toBeLessThanOrEqual(6); // NOPROGRESS_MAX — never 60
  });

  it('a minimal wallStore without getByLevel keeps the prior behaviour (guard inert)', () => {
    const execute = vi.fn();
    const observer = new RoomTopologyObserver(
      { subscribe: () => () => {} } as any, {} as any, { execute } as any, {} as any,
      { getLevelById: (id: string) => ({ id, elevation: 0, height: 3 }), getLevels: () => [{ id: 'L0' }] } as any,
    );
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

/**
 * §PR-09-WALLSIG-HEIGHT (founder ruling, 2026-08-17) — canonical wall HEIGHT is part of
 * the wall's geometric identity, so it MUST invalidate `_computeWallSig`.
 *
 * WHY THIS SUITE EXISTS. `check-propagation-trackers-reach` arm A8 measured a divergence
 * between the two halves of one propagation spine: `DoorDependencyTracker._wallGeometryChanged`
 * (DoorDependencyTracker.ts:131-139, and the window twin) treats a height change as a real
 * move and re-anchors every hosted opening for it, while `_computeWallSig` omitted height
 * entirely — so the SAME edit was "a move" to the trackers and "byte-identical geometry" to
 * the observer. The consequence is not theoretical: a height-only edit was DROPPED by the
 * committed-path no-progress gate (`_onWallMutationCommitted`) and counted as a
 * same-signature repeat toward the execution circuit-breaker (`_executeRedetect`).
 *
 * The founder ruled height IN, with the caveat *"use the canonical/normalized wall height —
 * NOT a derived value that can fluctuate because of representation or floating-point noise."*
 * Hence the encoding assertion below: height is folded as INTEGER MILLIMETRES via the
 * signature's existing `mm()` quantiser (`Math.round(m * 1000)`), exactly as thickness and
 * the baseline coordinates already are. That is what makes the last bits of a double
 * unable to flip the signature.
 *
 * BOTH DIRECTIONS ARE PINNED. A signature that changes too EAGERLY defeats the very gates
 * it feeds — the no-progress gate and the circuit-breaker exist to STOP runaway redetect
 * loops, and a field that flickers would mean they never trip. So the over-invalidation
 * direction is asserted too: representation-only noise and a non-geometric (properties /
 * materialId) patch must leave the signature byte-identical.
 *
 * NOT COVERED, DELIBERATELY: baseline `y`. See the handoff note in
 * tools/rac-conformance/certification/gates/tracker-pairs.json — the founder ruled on
 * HEIGHT, and `baseLine[*].y` is a separate question (WallTypes.ts §WALL-AUDIT-2026-M7
 * documents it as a world-space MIRROR of `level.elevation` that goes stale, while the
 * wall's authored vertical placement is `baseOffset`). That arm of A8 stays a declared
 * finding rather than being closed on a ruling nobody made.
 */
describe('§PR-09-WALLSIG-HEIGHT — canonical wall height is part of the no-progress signature', () => {
  beforeEach(() => { vi.useFakeTimers(); setDrag(false); });
  afterEach(() => { vi.useRealTimers(); setDrag(false); });

  const sigOf = (observer: unknown): string =>
    (observer as { _computeWallSig(l: string): string })._computeWallSig('L0');

  it('INVALIDATES: a HEIGHT-only edit changes the signature', () => {
    const walls = [wall('A', 0, 0, 5, 0), wall('B', 5, 0, 5, 5)];
    const { observer } = makeObserver(walls);

    const before = sigOf(observer);
    expect(before).not.toBe('');           // the guard is live, not inert
    walls[0]!.height = 4.2;                // nothing else touched
    expect(sigOf(observer)).not.toBe(before);
  });

  it('INVALIDATES at the layer the user experiences: a height-only edit releases the no-progress gate', () => {
    const walls = [wall('A', 0, 0, 5, 0), wall('B', 5, 0, 5, 5)];
    const { observer, execute } = makeObserver(walls);

    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);

    // No-op repeat — still suppressed by the no-progress gate.
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);

    // HEIGHT-only edit — the trackers call this a move; so must the observer.
    walls[0]!.height = 4.2;
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('ENCODING: height is quantised to integer millimetres — float noise cannot flip it, 1 mm can', () => {
    const walls = [wall('A', 0, 0, 5, 0)];
    const { observer } = makeObserver(walls);

    walls[0]!.height = 3;
    const canonical = sigOf(observer);

    // Representation noise only: (0.1 + 0.2) * 10 === 3.0000000000000004, a DIFFERENT double
    // with the same canonical millimetre value. The founder's caveat is exactly this case.
    walls[0]!.height = (0.1 + 0.2) * 10;
    expect(walls[0]!.height).not.toBe(3);                 // the doubles really do differ
    expect(sigOf(observer)).toBe(canonical);              // …the signature does not

    // One millimetre is a real authored change and DOES invalidate.
    walls[0]!.height = 3.001;
    expect(sigOf(observer)).not.toBe(canonical);
  });

  it('DOES NOT over-invalidate: a non-geometric patch leaves the signature byte-identical', () => {
    // Same direction as the gate's CONTROL N2 (`check-propagation-trackers-reach`): a wall
    // update carrying only a `properties` patch is an input the propagation spine MUST ignore.
    const walls = [wall('A', 0, 0, 5, 0), wall('B', 5, 0, 5, 5)];
    const { observer } = makeObserver(walls);

    const before = sigOf(observer);
    walls[0]!.properties = { note: 'cert' };
    walls[0]!.materialId = 'mat-2';
    expect(sigOf(observer)).toBe(before);
  });

  it('DOES NOT over-invalidate: the circuit-breaker still bounds a runaway after a height edit settles', () => {
    const walls = [wall('A', 0, 0, 5, 0), wall('B', 5, 0, 5, 5)];
    const { observer, execute } = makeObserver(walls);

    walls[0]!.height = 4.2;                               // one real edit, then stillness
    for (let i = 0; i < 60; i++) (observer as any)._executeRedetect('L0');
    expect(execute.mock.calls.length).toBeGreaterThan(0);
    expect(execute.mock.calls.length).toBeLessThanOrEqual(6);   // NOPROGRESS_MAX — never 60
  });
});
