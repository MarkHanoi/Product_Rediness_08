// A.21.D37 — Living Graph SELECT-TO-3D: the room → 3D element-id projection.
//
// Covers `elementIdsForRoom`, the read-only mapping that drives both the SELECT
// (selectionBus highlight) and ISOLATE (Inspect isolation pipeline) modes. It
// reuses `buildModelElementLocations(window.runtime)` — the same projection the
// Inspect tree feeds the isolation resolver — and returns the element-instance
// ids whose parent chain contains the room. Pure mapping; no DOM/canvas needed.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { elementIdsForRoom } from '../src/ui/living-graph/livingGraphSelection';

function installRuntime(runtime: Record<string, unknown> | undefined): void {
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  g.window = g.window ?? {};
  if (runtime === undefined) delete g.window.runtime;
  else g.window.runtime = runtime;
}

/** A list-shaped store stub matching `buildModelElementLocations`'s probe. */
function listStore(items: Array<Record<string, unknown>>): { list: () => Array<Record<string, unknown>> } {
  return { list: () => items };
}

beforeEach(() => installRuntime(undefined));
afterEach(() => installRuntime(undefined));

describe('elementIdsForRoom', () => {
  it('returns [] when no runtime / no model is present', () => {
    expect(elementIdsForRoom('room_a')).toEqual([]);
  });

  it('returns [] for an empty/blank room id', () => {
    expect(elementIdsForRoom('')).toEqual([]);
  });

  it('maps a room id → only its element-instance ids (via the parent chain)', () => {
    installRuntime({
      projectContext: { projectId: 'proj-1' },
      roomStore: listStore([
        { id: 'room_a', levelId: 'level_1' },
        { id: 'room_b', levelId: 'level_1' },
      ]),
      levelStore: listStore([{ id: 'level_1' }]),
      elementStore: listStore([
        { id: 'wall_1', roomId: 'room_a' },
        { id: 'door_1', roomId: 'room_a' },
        { id: 'wall_2', roomId: 'room_b' },
        { id: 'win_1', roomId: 'room_a' },
      ]),
    });
    const ids = elementIdsForRoom('room_a');
    expect(ids.sort()).toEqual(['door_1', 'wall_1', 'win_1']);
    // room_b's element is excluded.
    expect(ids).not.toContain('wall_2');
  });

  it('returns [] for a room with no hosted elements', () => {
    installRuntime({
      projectContext: { projectId: 'proj-1' },
      roomStore: listStore([{ id: 'room_empty', levelId: 'level_1' }]),
      levelStore: listStore([{ id: 'level_1' }]),
      elementStore: listStore([{ id: 'wall_x', roomId: 'room_other' }]),
    });
    expect(elementIdsForRoom('room_empty')).toEqual([]);
  });

  it('never throws on a malformed runtime (degrades to [])', () => {
    installRuntime({ roomStore: 123, elementStore: 'nope' });
    expect(() => elementIdsForRoom('room_a')).not.toThrow();
    expect(elementIdsForRoom('room_a')).toEqual([]);
  });
});
