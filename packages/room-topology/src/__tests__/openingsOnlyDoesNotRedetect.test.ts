/**
 * @vitest-environment happy-dom
 *
 * §OPENINGS-ONLY-NO-REDETECT (L-1015) — a batch window edit drove a redetect storm.
 *
 * FOUNDER (prod 2026-08-18): one `UPDATE_ELEMENT_DIMENSIONS_BATCH` over ~64
 * windows produced `REDETECT_ROOMS` about once per 13 windows — five whole-level
 * room re-detections inside ONE user gesture — each announced by:
 *
 *   [RoomTopologyObserver] forced fire (deadline=2000ms, elapsed≈90ms, resets=12)
 *
 * TWO SEPARATE DEFECTS, and this suite pins both.
 *
 * (1) THE STORM. `WallStore.updateWindow` rewrites the host wall's `openings[]`
 *     and emits a wall `'update'`, once per window. The observer subscribes to
 *     that event and schedules a redetect from it unconditionally — the ONLY
 *     discriminator is the event NAME. So 64 window edits look exactly like 64
 *     structural wall edits, the 150 ms debounce is reset 13 times, and the
 *     anti-starvation deadline force-fires a redetect. Repeat, five times.
 *
 *     But a window is an APERTURE IN a wall. Room boundaries are wall
 *     centrelines/faces, so an opening cannot change room topology — and this
 *     file ALREADY SAYS SO in code: `_computeWallSig`, the no-progress
 *     signature, hashes `id + baseline + thickness + height` and deliberately
 *     excludes openings. ADR-0129 states the same invariant in prose. The
 *     subscription simply never got the memo. `WallStore.emit` passes the
 *     pre-mutation wall as a third argument precisely so this can be told apart
 *     (it was added for `WallDeltaClassifier`'s `kind:'openings-only'` fast
 *     path) — and the observer's listener dropped that argument on the floor.
 *
 * (2) THE LOG LIED ABOUT WHY. `elapsed≈90ms` against `deadline=2000ms` reads as
 *     self-contradictory. It is not: the forced fire has TWO arms, `elapsed >=
 *     MAX_DEADLINE_MS || resets >= MAX_DEBOUNCE_RESETS`, and the message
 *     hard-codes the deadline no matter which one tripped. Here it was the
 *     RESETS arm. A diagnostic that names a cause it did not measure sent every
 *     reader hunting a 2-second stall that never happened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomTopologyObserver } from '../RoomTopologyObserver';

type WallListener = (event: string, wall: unknown, prev?: unknown) => void;

function makeObserver(stubScheduler = true) {
  const listeners: WallListener[] = [];
  const wallStore = {
    subscribe: (fn: WallListener) => { listeners.push(fn); return () => {}; },
    getByLevel: () => [],
  };
  const scheduleSpy = vi.fn();
  const observer = new RoomTopologyObserver(
    wallStore as never,
    {} as never,
    { execute: vi.fn() } as never,
    {} as never,
    {
      getLevelById: (id: string) => ({ id, elevation: 0, height: 3.0 }),
      getLevels: () => [{ id: 'L0' }],
    } as never,
  );
  observer.attach();
  // Observe the scheduler itself: this suite is about whether a redetect is
  // SCHEDULED at all, not about what the debounce does afterwards. The
  // forced-fire suite below needs the REAL scheduler, so it opts out.
  if (stubScheduler) {
    (observer as unknown as Record<string, unknown>)._scheduleRedetect = scheduleSpy;
  }
  const emit = (event: string, wall: unknown, prev?: unknown) => {
    for (const l of listeners) l(event, wall, prev);
  };
  return { observer, emit, scheduleSpy };
}

/** A wall record shaped like WallStore's, at a fixed baseline. */
function wall(openings: Array<Record<string, unknown>>) {
  return {
    id: 'w1',
    levelId: 'L0',
    baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }],
    thickness: 0.2,
    height: 3.0,
    openings,
  };
}

describe('§OPENINGS-ONLY-NO-REDETECT (L-1015)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('THE FOUNDER CASE: 64 window-dimension edits schedule ZERO redetects', () => {
    const { emit, scheduleSpy } = makeObserver();
    for (let i = 0; i < 64; i++) {
      const before = wall([{ id: `win-${i}`, width: 1.0, offset: i * 0.1 }]);
      const after = wall([{ id: `win-${i}`, width: 1.2, offset: i * 0.1 }]);
      emit('update', after, before);
    }
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('adding or removing an opening is still openings-only — the wall did not move', () => {
    const { emit, scheduleSpy } = makeObserver();
    emit('update', wall([{ id: 'w', width: 1 }]), wall([]));
    emit('update', wall([]), wall([{ id: 'w', width: 1 }]));
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('a REAL structural edit still schedules — the guard has not disabled redetect', () => {
    const { emit, scheduleSpy } = makeObserver();

    // Baseline moved.
    const moved = { ...wall([]), baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] };
    emit('update', moved, wall([]));
    expect(scheduleSpy).toHaveBeenCalledTimes(1);

    // Thickness changed.
    emit('update', { ...wall([]), thickness: 0.3 }, wall([]));
    expect(scheduleSpy).toHaveBeenCalledTimes(2);

    // Height changed.
    emit('update', { ...wall([]), height: 2.5 }, wall([]));
    expect(scheduleSpy).toHaveBeenCalledTimes(3);
  });

  it('add and remove ALWAYS schedule — there is no prevState to compare', () => {
    const { emit, scheduleSpy } = makeObserver();
    emit('add', wall([]), undefined);
    emit('remove', wall([]), undefined);
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
  });

  it('an UPDATE with no prevState schedules — unknown delta is not assumed harmless', () => {
    // Failure and emptiness are not the same value: "the store did not tell us
    // what changed" must not be read as "nothing structural changed".
    const { emit, scheduleSpy } = makeObserver();
    emit('update', wall([]), undefined);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });
});

describe('§OPENINGS-ONLY-NO-REDETECT (L-1015) — the forced-fire log must name the arm that fired', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('says reason=resets when the reset count tripped it, not the untouched deadline', () => {
    const { observer } = makeObserver(/* stubScheduler */ false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(observer as never, '_executeRedetect').mockImplementation(() => {});

    // 13 schedules in the same tick: resets reaches MAX_DEBOUNCE_RESETS while
    // `elapsed` stays near zero — the founder's exact shape.
    for (let i = 0; i < 14; i++) {
      (observer as unknown as { _scheduleRedetect: (l: string, d: number) => void })
        ._scheduleRedetect('L0', 150);
    }

    const forced = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('forced fire'));
    expect(forced.length).toBeGreaterThan(0);
    expect(forced[0]).toContain('reason=resets');
  });
});
