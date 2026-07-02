/**
 * @vitest-environment happy-dom
 *
 * §FIX-WALLMOVE-REDETECT-DEFER (ADR-0098 finding F3 / queue Q6, 2026-07-02) —
 * regression for the "move a wall that hosts a door/window → app FREEZES" report.
 *
 * ROOT CAUSE this suite pins: a wall MOVE fires an intermediate stream of wall
 * mutations — the 3D gizmo defers its whole-level rebuild, but the plan-view
 * `PlanElementDragController._moveWall` live-updates the WallStore per mousemove,
 * and each such update reached the RoomTopologyObserver:
 *   • directly via the WallStore `update` subscription → `_scheduleRedetect`, which
 *     after MAX_DEBOUNCE_RESETS (12) FORCE-FIRES `_executeRedetect` mid-drag; and
 *   • via `bim-wall-mutation-committed` → the 300 ms soft-coalesce → `_executeRedetect`.
 * A whole-level RoomDetection ran per intermediate frame → main-thread peg → freeze.
 *
 * The fix gates BOTH `_onWallMutationCommitted` and the `_executeRedetect`
 * execution chokepoint on `window.__wallDragInProgress`. While a wall drag is in
 * flight EVERY redetect path is a no-op; the drag-END release drives EXACTLY ONE
 * redetect. This suite asserts: N intermediate updates during a drag → ZERO
 * redetects; release → ONE redetect. Fails if either guard is removed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomTopologyObserver } from '../RoomTopologyObserver';

function makeObserver() {
  const execute = vi.fn();
  const wallStore = { subscribe: () => () => {} };
  const roomStore = {};
  const commandManager = { execute };
  const roomDetectionEngine = {};
  const bimManager = {
    getLevelById: (id: string) => ({ id, elevation: 0, height: 3.0 }),
    getLevels: () => [{ id: 'L0' }],
  };
  const observer = new RoomTopologyObserver(
    wallStore as any,
    roomStore as any,
    commandManager as any,
    roomDetectionEngine as any,
    bimManager as any,
  );
  return { observer, execute };
}

function setDrag(on: boolean): void {
  (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = on;
}

describe('§FIX-WALLMOVE-REDETECT-DEFER — redetect deferred during a wall drag', () => {
  beforeEach(() => { vi.useFakeTimers(); setDrag(false); });
  afterEach(() => { vi.useRealTimers(); setDrag(false); });

  it('N intermediate committed events during a drag → ZERO redetect; release → ONE', () => {
    const { observer, execute } = makeObserver();

    // ── Drag in flight: simulate the per-mousemove commit stream. ──────────────
    setDrag(true);
    for (let i = 0; i < 20; i++) {
      (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
      vi.advanceTimersByTime(16); // one animation frame between mousemoves
    }
    vi.advanceTimersByTime(400); // past SOFT_COALESCE_MS — nothing may have fired
    expect(execute).not.toHaveBeenCalled();

    // ── Drag ends: the single authoritative commit fires ONE committed event. ──
    setDrag(false);
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400); // past SOFT_COALESCE_MS
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('the forced-fire execution chokepoint (_executeRedetect) is also gated by the drag flag', () => {
    const { observer, execute } = makeObserver();
    setDrag(true);
    // The plan-view `ws.update` storm force-fires _executeRedetect after 12 debounce
    // resets — that DIRECT call must be suppressed while the drag is in flight.
    (observer as any)._executeRedetect('L0');
    expect(execute).not.toHaveBeenCalled();

    setDrag(false);
    (observer as any)._executeRedetect('L0');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('with NO drag in flight the committed event redetects once (isolation)', () => {
    const { observer, execute } = makeObserver();
    setDrag(false);
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
