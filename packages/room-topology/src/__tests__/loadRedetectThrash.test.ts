/**
 * @vitest-environment happy-dom
 *
 * §PERF2-LOAD-REDETECT-THRASH (L-1154) — room redetection must not fire while a
 * project snapshot is being replayed.
 *
 * THE FOUNDER'S CONSOLE, opening an 11-level / 341-wall / 1815-window project on
 * the deployed build (2026-08-19), repeated twenty-plus times MID-IMPORT:
 *
 *   [RoomTopologyObserver] forced fire (level=L-04…, reason=resets,
 *                                       elapsed=19ms/2000ms, resets=12/12)
 *   [CommandManager] EXECUTE: REDETECT_ROOMS
 *
 * ⭐ READ `elapsed=19ms/2000ms` — THE DEBOUNCE INVERTED. Every arriving wall
 * resets the 2000 ms timer; 12 resets exhausts MAX_DEBOUNCE_RESETS; the
 * starvation guard then force-fires after NINETEEN MILLISECONDS, during exactly
 * the burst the debounce exists to coalesce, against walls still arriving. The
 * heavier the load, the MORE often it fires — so no value of the constant fixes
 * it. That is why these tests assert on the LOAD FLAG and not on a timing.
 *
 * `ProjectLoader:568` already pauses the observer, and the §FIX-ROOMOBSERVER-PAUSE
 * comment records this same defect being fixed that way once before. It is applied
 * as `window.roomTopologyObserver?.pause?.()` — optional-chained on both the object
 * and the method — so if that property is not published yet, or resume lands early,
 * the suppression silently does nothing. These tests pin the guard that does NOT
 * depend on a remote caller.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomTopologyObserver } from '../RoomTopologyObserver';

type G = { __pryzmProjectLoadActive?: boolean };

function makeObserver() {
  const execute = vi.fn();
  const observer = new RoomTopologyObserver(
    { subscribe: () => () => {} } as any,
    {} as any,
    { execute } as any,
    {} as any,
    {
      getLevelById: (id: string) => ({ id, elevation: 0, height: 3.0 }),
      getLevels: () => [{ id: 'L0' }],
    } as any,
  );
  return { observer, execute };
}

/** Drive the scheduler the way an import burst does: N wall arrivals on one level. */
function burst(observer: RoomTopologyObserver, n: number, levelId = 'L0') {
  for (let i = 0; i < n; i++) (observer as any)._scheduleRedetect(levelId);
}

describe('§PERF2-LOAD-REDETECT-THRASH — no redetect while a snapshot is replaying', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as G).__pryzmProjectLoadActive;
  });

  it('CONTROL — with NO load in flight, a 20-wall burst DOES force-fire (the defect is real and reachable)', () => {
    const { observer, execute } = makeObserver();
    expect((globalThis as G).__pryzmProjectLoadActive).toBeUndefined(); // precondition, measured
    burst(observer, 20);
    // 12 resets exhausts MAX_DEBOUNCE_RESETS and force-fires SYNCHRONOUSLY —
    // no timer advance needed, which is exactly why it lands mid-import.
    expect(execute).toHaveBeenCalled();
  });

  it('SCHEDULER chokepoint — with the load flag set, the same burst fires NOTHING', () => {
    const { observer, execute } = makeObserver();
    (globalThis as G).__pryzmProjectLoadActive = true;
    burst(observer, 40); // more than three times the reset budget
    vi.advanceTimersByTime(5000); // and well past the 2000 ms deadline arm
    expect(execute).not.toHaveBeenCalled();
  });

  it('EXECUTION chokepoint — the direct path bypassing the scheduler is suppressed too', () => {
    // The observer's own comment records FOUR paths that reach _executeRedetect
    // without passing _scheduleRedetect. Every other suppression in the file is
    // mirrored at both chokepoints; this asserts the load guard is as well, so a
    // future scheduler-only "simplification" fails here rather than in a project open.
    const { observer, execute } = makeObserver();
    (globalThis as G).__pryzmProjectLoadActive = true;
    (observer as any)._executeRedetect('L0');
    expect(execute).not.toHaveBeenCalled();
  });

  it('THE ESCAPE HATCH — once the load flag clears, redetection works again', () => {
    // Suppression that never lifts is not an optimisation, it is a silent data
    // defect: rooms would simply never be detected. ProjectLoader clears the flag
    // in its `finally` (:2625), and its post-load sweep dispatches
    // `bus.executeCommand('room.redetect')` — a path that does not touch this
    // observer at all. This asserts the half that IS this file's responsibility.
    const { observer, execute } = makeObserver();
    (globalThis as G).__pryzmProjectLoadActive = true;
    burst(observer, 20);
    expect(execute).not.toHaveBeenCalled();

    (globalThis as G).__pryzmProjectLoadActive = false;
    (observer as any)._executeRedetect('L0');
    expect(execute).toHaveBeenCalled();
  });

  it('the flag is read LIVE, not latched at construction', () => {
    // The observer is built in initTools long before any project is opened, so a
    // value captured in the constructor would be false forever.
    const { observer, execute } = makeObserver();
    burst(observer, 20);
    expect(execute).toHaveBeenCalled();          // no load: fires
    execute.mockClear();

    (globalThis as G).__pryzmProjectLoadActive = true;
    (observer as any)._executeRedetect('L0');
    expect(execute).not.toHaveBeenCalled();      // load starts: suppressed
  });
});
