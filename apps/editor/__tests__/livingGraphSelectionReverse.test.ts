// A.26.5b — Living Graph SELECT-IN-3D → HIGHLIGHT-IN-GRAPH: the REVERSE of
// `elementIdsForRoom`. Covers `roomIdForElement`, the read-only mapping that
// drives the inverse projection — a 3D/plan pick → the room whose graph node we
// highlight. It reuses `buildModelElementLocations(window.runtime)` (the same
// projection the forward path + Inspect tree use) and returns the room id off the
// element's parent chain. Pure mapping; no DOM/canvas needed.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roomIdForElement, elementIdsForRoom } from '../src/ui/living-graph/livingGraphSelection';

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

function installModel(): void {
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
}

beforeEach(() => installRuntime(undefined));
afterEach(() => installRuntime(undefined));

describe('roomIdForElement (A.26.5b inverse projection)', () => {
  it('returns null when no runtime / no model is present', () => {
    expect(roomIdForElement('wall_1')).toBeNull();
  });

  it('returns null for an empty/blank element id', () => {
    installModel();
    expect(roomIdForElement('')).toBeNull();
  });

  it('maps an element id → the room it belongs to (via the parent chain)', () => {
    installModel();
    expect(roomIdForElement('wall_1')).toBe('room_a');
    expect(roomIdForElement('door_1')).toBe('room_a');
    expect(roomIdForElement('win_1')).toBe('room_a');
    expect(roomIdForElement('wall_2')).toBe('room_b');
  });

  it('returns the id itself when the id IS a room node', () => {
    installModel();
    expect(roomIdForElement('room_a')).toBe('room_a');
    expect(roomIdForElement('room_b')).toBe('room_b');
  });

  it('returns null for an element that maps to no room', () => {
    installModel();
    expect(roomIdForElement('not_an_element')).toBeNull();
  });

  it('is the exact inverse of elementIdsForRoom', () => {
    installModel();
    // Every element the forward path attributes to room_a maps back to room_a.
    for (const id of elementIdsForRoom('room_a')) {
      expect(roomIdForElement(id)).toBe('room_a');
    }
    for (const id of elementIdsForRoom('room_b')) {
      expect(roomIdForElement(id)).toBe('room_b');
    }
  });

  it('never throws on a malformed runtime (degrades to null)', () => {
    installRuntime({ roomStore: 123, elementStore: 'nope' });
    expect(() => roomIdForElement('wall_1')).not.toThrow();
    expect(roomIdForElement('wall_1')).toBeNull();
  });
});
