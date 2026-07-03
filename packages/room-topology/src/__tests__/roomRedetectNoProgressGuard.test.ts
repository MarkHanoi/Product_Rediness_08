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
interface Wall { id: string; levelId: string; baseLine: Bl; thickness: number }

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

function wall(id: string, ax: number, az: number, bx: number, bz: number, t = 0.2): Wall {
  return { id, levelId: 'L0', baseLine: [{ x: ax, y: 0, z: az }, { x: bx, y: 0, z: bz }], thickness: t };
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
