/**
 * @vitest-environment happy-dom
 *
 * ADR-0069 GR1 regression — the graph-authoritative suppression must hold at the
 * EXECUTION chokepoint (`_executeRedetect`), not only in `_scheduleRedetect`.
 *
 * The house generator's post-openings §OPENING-VOID-WHOLE-LEVEL whole-level wall
 * rebuild emits `bim-wall-mutation-committed`, whose soft-coalesce timer calls
 * `_executeRedetect` DIRECTLY (bypassing the scheduler's guard). Before this fix
 * that path re-detected a graph-authoritative level → the fragmented "Room NN"
 * faces were re-created ALONGSIDE the engine's named graph rooms (the founder's
 * duplicated / generic room labels on the built result). This test fails if the
 * guard is removed from `_executeRedetect`.
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

describe('RoomTopologyObserver — ADR-0069 GR1 graph-authoritative suppression', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT auto-redetect a graph-authoritative level (direct _executeRedetect)', () => {
    const { observer, execute } = makeObserver();
    observer.markGraphAuthoritative('L0');
    (observer as any)._executeRedetect('L0');
    expect(execute).not.toHaveBeenCalled();
  });

  it('suppresses the bim-wall-mutation-committed soft-coalesce path (the house rebuild bypass)', () => {
    const { observer, execute } = makeObserver();
    observer.markGraphAuthoritative('L0');
    // Mimic the whole-level rebuild's committed event for the graph level.
    (observer as any)._onWallMutationCommitted({ levelIds: ['L0'] });
    vi.advanceTimersByTime(400); // past SOFT_COALESCE_MS (300ms)
    expect(execute).not.toHaveBeenCalled();
  });

  it('re-detects again once graph authority is surrendered (GR2 / explicit clear)', () => {
    const { observer, execute } = makeObserver();
    observer.markGraphAuthoritative('L0');
    observer.clearGraphAuthoritative('L0');
    (observer as any)._executeRedetect('L0');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('a non-authoritative level still auto-redetects normally', () => {
    const { observer, execute } = makeObserver();
    (observer as any)._executeRedetect('L0');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
