// §GEN-SINGLE-REDETECT (L-377) — the wall.created → room.redetect subscription must be
// SUPPRESSED while a building generation is in flight (globalThis.__pryzmBuildingGenActive),
// and resume the instant the flag clears. This is the un-gated twin of the RoomTopologyObserver
// gate (L-369): during a resi/office/house generation the CommandEventBridge fans out one
// `wall.created` per wall, and each one used to dispatch a SYNCHRONOUS full-level REDETECT_ROOMS
// (O(walls) redetects). The executors' graph-authoritative rooms + the single release() sweep own
// the final state, so the per-wall redetect during generation is pure redundant work.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireRoomEventSubscriptions, type RoomEventRuntime } from '../src/contributions.js';

type Handler = (payload: unknown) => void | Promise<void>;

/** Minimal RoomEventRuntime stub: captures handlers by event name and spies executeCommand. */
function buildRuntime() {
  const handlers = new Map<string, Handler>();
  const executeCommand = vi.fn(() => undefined);
  const runtime: RoomEventRuntime = {
    events: {
      on(event: string, handler: Handler) {
        handlers.set(event, handler);
        return { dispose() { handlers.delete(event); } };
      },
    },
    bus: { executeCommand },
  };
  const fire = async (event: string, payload: unknown) => {
    const h = handlers.get(event);
    if (h) await h(payload);
  };
  return { runtime, executeCommand, fire };
}

function setGenActive(active: boolean): void {
  (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive = active;
}

describe('L-377 — room.redetect generation gate', () => {
  afterEach(() => {
    setGenActive(false);
    vi.restoreAllMocks();
  });

  it('dispatches room.redetect on wall.created when NO generation is active', async () => {
    const { runtime, executeCommand, fire } = buildRuntime();
    wireRoomEventSubscriptions(runtime);

    await fire('wall.created', { levelId: 'L0' });

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith('room.redetect', expect.objectContaining({ levelId: 'L0' }));
  });

  it('SUPPRESSES the per-wall room.redetect while __pryzmBuildingGenActive is true', async () => {
    const { runtime, executeCommand, fire } = buildRuntime();
    wireRoomEventSubscriptions(runtime);

    setGenActive(true);
    // Simulate the CEB fan-out: many wall.created events during generation.
    for (let i = 0; i < 25; i++) await fire('wall.created', { levelId: 'L0' });

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('also suppresses curtain-wall.created during generation', async () => {
    const { runtime, executeCommand, fire } = buildRuntime();
    wireRoomEventSubscriptions(runtime);

    setGenActive(true);
    await fire('curtain-wall.created', { levelId: 'L0' });

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('resumes the redetect the instant the generation flag clears (release() path)', async () => {
    const { runtime, executeCommand, fire } = buildRuntime();
    wireRoomEventSubscriptions(runtime);

    setGenActive(true);
    await fire('wall.created', { levelId: 'L0' });
    expect(executeCommand).not.toHaveBeenCalled();

    // buildingGenerationLifecycle.release() clears the flag, then fires ONE sweep separately.
    setGenActive(false);
    await fire('wall.created', { levelId: 'L1' });

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith('room.redetect', expect.objectContaining({ levelId: 'L1' }));
  });
});
