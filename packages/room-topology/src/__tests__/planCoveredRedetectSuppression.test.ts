/**
 * @vitest-environment happy-dom
 *
 * SAFE MODE ROOM RESHAPE — the observer's plan-covered redetect suppression.
 *
 * WHAT IS BEING PROVEN. When a consequence plan has just written a level's room
 * geometry from the PREDICTED values the human approved,
 * `RoomTopologyObserver` must NOT run `ReDetectRoomsCommand` over that level —
 * `RoomDetectionEngine` is a DIFFERENT algorithm (level-wide re-partition, 0.05 m
 * weld vs the predictor's 1 mm `COINCIDENT_M`), and its answer would silently
 * overwrite the approved rings. That is the founder's named non-negotiable:
 * "no second room-detection algorithm may silently replace the prediction".
 *
 * WHAT MUST NOT REGRESS. C72 §4 — a suppression whose release drops what it
 * suppressed is irreversible suppression wearing a release's name. The repo has
 * already paid for that once (§FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED, where the
 * old bare `resume()` produced 0 redetects against 1 unpaused for the identical
 * event). So this suite asserts BOTH halves: held ⇒ 0 redetects, released ⇒ the
 * deferred commit is DISCHARGED, not forgotten.
 *
 * And the third property, which is the honesty one: a level that was NOT covered
 * by the plan — because its rooms came back UNDETERMINED — must keep redetecting
 * normally. Suppressing it would convert "we could not predict this" into
 * "nothing changed", which is the exact defect the UNDETERMINED discipline exists
 * to forbid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomTopologyObserver } from '../RoomTopologyObserver';

function makeObserver() {
  const execute = vi.fn();
  const observer = new RoomTopologyObserver(
    { subscribe: () => () => {} } as any,
    {} as any,
    { execute } as any,
    {} as any,
    {
      getLevelById: (id: string) => ({ id, elevation: 0, height: 3.0 }),
      getLevels: () => [{ id: 'L0' }, { id: 'L1' }],
    } as any,
  );
  return { observer, execute };
}

/** Drive the level's redetect through the execution chokepoint. */
const fire = (observer: RoomTopologyObserver, levelId: string): void =>
  (observer as any)._executeRedetect(levelId);

describe('SAFE MODE ROOM RESHAPE — plan-covered redetect suppression (C72 §4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a HELD level does NOT redetect — the second algorithm never runs', () => {
    const { observer, execute } = makeObserver();
    observer.markPlanCoveredLevels(['L0']);
    fire(observer, 'L0');
    fire(observer, 'L0');
    expect(execute).not.toHaveBeenCalled();
    expect(observer.planCoveredLevelCount).toBe(1);
  });

  it('RELEASE DISCHARGES what the hold swallowed — it is not dropped (C72 §4)', () => {
    const { observer, execute } = makeObserver();
    observer.markPlanCoveredLevels(['L0']);
    fire(observer, 'L0');           // swallowed, but RECORDED
    expect(execute).not.toHaveBeenCalled();

    observer.releasePlanCoveredLevels(['L0']);
    // EXACTLY ONE — the deferred commit is discharged, and a coalesced burst of
    // swallowed commits still costs one redetect, not N.
    expect(execute).toHaveBeenCalledTimes(1);
    expect(observer.planCoveredLevelCount).toBe(0);
  });

  it('a release with NOTHING swallowed fires nothing (no phantom redetect)', () => {
    const { observer, execute } = makeObserver();
    observer.markPlanCoveredLevels(['L0']);
    observer.releasePlanCoveredLevels(['L0']);
    expect(execute).not.toHaveBeenCalled();
  });

  it('the hold is PER LEVEL — an uncovered level keeps redetecting normally', () => {
    // This is the UNDETERMINED-honesty property at the observer layer: a level
    // whose rooms could not be predicted was never marked, so its fallback
    // redetect must still run.
    const { observer, execute } = makeObserver();
    observer.markPlanCoveredLevels(['L0']);
    fire(observer, 'L1');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('REFCOUNTED — an inner release cannot unsuppress an outer execution', () => {
    const { observer, execute } = makeObserver();
    observer.markPlanCoveredLevels(['L0']);
    observer.markPlanCoveredLevels(['L0']);   // a nested/concurrent execution

    observer.releasePlanCoveredLevels(['L0']); // inner one finishes
    fire(observer, 'L0');
    expect(execute).not.toHaveBeenCalled();   // still held by the outer

    observer.releasePlanCoveredLevels(['L0']); // outer finishes
    expect(execute).toHaveBeenCalledTimes(1); // and discharges
  });

  it('POSITIVE CONTROL — WITHOUT the hold the redetect DOES fire', () => {
    // Proves the assertions above measure the suppression rather than a harness
    // in which nothing ever fires. A gate that cannot fire cannot pass.
    const { observer, execute } = makeObserver();
    fire(observer, 'L0');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('a disposed observer holds nothing and discharges nothing', () => {
    const { observer, execute } = makeObserver();
    observer.markPlanCoveredLevels(['L0']);
    fire(observer, 'L0');
    observer.dispose();
    observer.releasePlanCoveredLevels(['L0']);
    expect(execute).not.toHaveBeenCalled();
    expect(observer.planCoveredLevelCount).toBe(0);
  });
});
