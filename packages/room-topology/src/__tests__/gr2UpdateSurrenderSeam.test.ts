/**
 * @vitest-environment happy-dom
 *
 * §PR-05-UPDATE-SURRENDER (founder decision 2026-08-14, gap register PR-05) —
 * THE SEAM TEST for the GR2 update-surrender, in the WallOpeningEmitSeam.test.ts
 * shape (C72 §3.4: never hand-build the value under test).
 *
 * ── Why this file drives a REAL WallStore, not the observer's private methods ──
 *
 * The defect this closes (C83 §0.2.1 defect 2): `clearGraphAuthoritative` had 0
 * production callers, and the GR2 release branch fired only on a manual wall
 * `add`/`remove` — so a hand-DRAGGED bounding wall on a generated level deleted
 * its rooms' boundedBy edges (§GR12) while the corrective re-detect stayed
 * suppressed at the GR1 chokepoint for the rest of the session. Every prior
 * observer suite invoked `(observer as any)._executeRedetect(...)` or the
 * subscription callback BY HAND — a test that constructs the very event the
 * store emits is, by construction, incapable of noticing that the real emit
 * path never reaches the surrender branch. So this suite:
 *
 *   • constructs a REAL `WallStore` (the production emitter),
 *   • attaches the observer through its production `attach()` subscription,
 *   • mutates through `store.update(...)` — the same entry point
 *     `PlanElementDragController._moveWall` / the gizmo commit path call,
 *   • and asserts surrender + re-detect from the OUTSIDE (commandManager).
 *
 * NEGATIVE controls prove the exclusions (C72 §4.4 — USER hand-edits only):
 * the identical `store.update` inside `batchCoordinator.runBatch` and under the
 * `__pryzmBuildingGenActive` generation lease must NOT surrender. Before the
 * fix, the positive test fails (authority retained after a hand update) and the
 * negatives pass — the suite is decided by the GR2 arm and by nothing else.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomTopologyObserver } from '../RoomTopologyObserver';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { ProjectContext, batchCoordinator } from '@pryzm/core-app-model';

const L0 = 'level-0'; // the generated (graph-authoritative) level
const L1 = 'level-1'; // the untouched neighbour level

function makeLevel(id: string) {
  return { id, name: id, elevation: 0, height: 3, childrenIds: [] };
}

const levelProvider = {
  getLevelById: (id: string) => ([L0, L1].includes(id) ? makeLevel(id) : undefined),
  getLevels: () => [makeLevel(L0), makeLevel(L1)],
};

/** A plain 6 m wall on the given level — no openings, so `update` takes no detours. */
function makeWall(id: string, levelId: string): WallData {
  return {
    id,
    type: 'wall',
    levelId,
    properties: {},
    childrenIds: [],
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 3,
    thickness: 0.2,
    baseOffset: 0,
    openings: [],
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
  } as unknown as WallData;
}

function makeHarness() {
  const store = new WallStore(
    new ProjectContext(),
    levelProvider as unknown as ConstructorParameters<typeof WallStore>[1],
  );
  store.add(makeWall('w0', L0));
  store.add(makeWall('w1', L1));

  const execute = vi.fn();
  const observer = new RoomTopologyObserver(
    store as any,
    {} as any,                 // roomStore — snapshot paths self-disable without getByLevel
    { execute } as any,        // commandManager — the OUTSIDE observation point
    {} as any,                 // roomDetectionEngine — unused by the observer itself
    levelProvider as any,      // bimManager
  );
  observer.attach();           // the PRODUCTION subscription — not a hand-wired callback
  return { store, observer, execute };
}

function authorityHeld(observer: RoomTopologyObserver, levelId: string): boolean {
  return (observer as any)._graphAuthoritativeLevels.has(levelId);
}

function setGenActive(on: boolean): void {
  (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive = on;
}

describe('§PR-05-UPDATE-SURRENDER — a hand wall update through the REAL WallStore surrenders GR1 authority', () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    vi.useFakeTimers();
    setGenActive(false);
    harness = makeHarness();
  });

  afterEach(() => {
    harness.observer.dispose();
    setGenActive(false);
    // The batch coordinator is a SINGLETON shared with the observer's module —
    // never leave `_isBatching` armed for the next test file.
    try { (batchCoordinator as any).forceReset?.(); } catch { /* not under test */ }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('POSITIVE — mark authoritative → real store.update → surrendered, ANNOUNCED, and the re-detect ran', () => {
    const { store, observer, execute } = harness;
    const debug = vi.spyOn(console, 'debug');
    observer.markGraphAuthoritative(L0);
    expect(authorityHeld(observer, L0)).toBe(true);

    // THE REAL EDIT — the same WallStore entry point a hand drag commits through.
    const updated = store.update('w0', { baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6.5, y: 0, z: 0 }] });
    expect(updated).toBeDefined(); // the store actually mutated — emptiness is never a pass

    // Surrendered at the emit, before any timer.
    expect(authorityHeld(observer, L0)).toBe(false);

    // C72 §4.4 — scoped + ANNOUNCED: the log names the level AND the cause.
    const announce = debug.mock.calls.map((c) => String(c[0])).find((m) => m.includes('authority surrendered'));
    expect(announce).toBeDefined();
    expect(announce).toContain(L0);
    expect(announce).toContain('hand wall update');

    // …and re-detection genuinely re-asserts: past the 150 ms debounce, the
    // observer dispatches ReDetectRooms for THIS level through commandManager.
    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);
    expect((execute.mock.calls[0]![0] as any).levelId).toBe(L0);
  });

  it('NEGATIVE — the identical update inside batchCoordinator.runBatch does NOT surrender', () => {
    const { store, observer, execute } = harness;
    observer.markGraphAuthoritative(L0);

    try {
      batchCoordinator.runBatch(() => {
        store.update('w0', { baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6.5, y: 0, z: 0 }] });
        // Store-local fan-out is SYNCHRONOUS inside the batch — the branch saw
        // the event while `isBatching` was true, and must not have released.
        expect(authorityHeld(observer, L0)).toBe(true);
      }, { levelIds: [L0], totalElementCount: 1, skipRedetectRooms: true });
    } catch {
      // The batch COMPLETION machinery (frame-scheduler resume flush) is not
      // under test and may be unwired in this harness; the synchronous phase —
      // where the wall event fanned out — already ran and already asserted.
    } finally {
      try { (batchCoordinator as any).forceReset?.(); } catch { /* singleton hygiene */ }
    }

    expect(authorityHeld(observer, L0)).toBe(true);
    vi.advanceTimersByTime(600);
    expect(execute).not.toHaveBeenCalled(); // still suppressed — GR1 holds
  });

  it('NEGATIVE — the identical update under the generation lease (__pryzmBuildingGenActive) does NOT surrender', () => {
    const { store, observer, execute } = harness;
    observer.markGraphAuthoritative(L0);

    // L-369: the generators' rebuild storms fire in the UNBATCHED gaps between
    // sub-batches — exactly where `isBatching` is false and only the lease guards.
    setGenActive(true);
    store.update('w0', { baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6.5, y: 0, z: 0 }] });
    expect(authorityHeld(observer, L0)).toBe(true);

    vi.advanceTimersByTime(600);
    expect(execute).not.toHaveBeenCalled();

    // The lease ends; the level is STILL authoritative — generation writes never
    // spent the flag, so the graph rooms survive generation settle by design.
    setGenActive(false);
    expect(authorityHeld(observer, L0)).toBe(true);
  });

  it('SCOPE — an update on a NON-authoritative level redetects normally and leaves the authoritative neighbour untouched', () => {
    const { store, observer, execute } = harness;
    observer.markGraphAuthoritative(L0);

    store.update('w1', { baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6.5, y: 0, z: 0 }] });

    // Per-level scope (C72 §4.4): the L1 edit spends NOTHING on L0.
    expect(authorityHeld(observer, L0)).toBe(true);

    vi.advanceTimersByTime(400);
    expect(execute).toHaveBeenCalledTimes(1);
    expect((execute.mock.calls[0]![0] as any).levelId).toBe(L1);
  });
});
