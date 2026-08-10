// ADR-0315 U2.3 — getElementsInRoom kind completion + curtain-wall boundary type.
// Editor (happy-dom) suite for the same barrel reason as facadeTrueNorthProvider.spec.

import { describe, expect, it } from 'vitest';
import { roomQueryService } from '@pryzm/spatial-index';
import { storeRegistry } from '@pryzm/core-app-model';

const ROOM = {
  id: 'room-1', levelId: 'L0',
  boundingWallIds: ['w1', 'cw1'],
  boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }] },
};

describe('RoomQueryService — U2.3 kind coverage', () => {
  it('windows hosted on a bounding wall are IN the room; others are not; boundary reports real kinds', () => {
    storeRegistry.register('room', { getAll: () => [ROOM], getById: (id: string) => (id === 'room-1' ? ROOM : undefined) } as never);
    storeRegistry.register('wall', { getAll: () => [{ id: 'w1', levelId: 'L0' }], getById: (id: string) => (id === 'w1' ? { id: 'w1', levelId: 'L0' } : undefined) } as never);
    storeRegistry.register('curtainwall', { getAll: () => [{ id: 'cw1', levelId: 'L0' }], getById: (id: string) => (id === 'cw1' ? { id: 'cw1', levelId: 'L0' } : undefined) } as never);
    storeRegistry.register('window', {
      getAll: () => [
        { id: 'win-in', wallId: 'w1', levelId: 'L0' },
        { id: 'win-out', wallId: 'w-elsewhere', levelId: 'L0' },
        { id: 'win-host-alias', hostWallId: 'cw1', levelId: 'L0' },
      ],
    } as never);
    // Door/furniture/plumbing/column/lighting/stair stores deliberately absent —
    // the query must skip them without throwing.
    for (const kind of ['door', 'furniture', 'plumbing', 'column', 'lighting', 'stair']) {
      storeRegistry.register(kind, { getAll: () => [] } as never);
    }

    const elements = roomQueryService.getElementsInRoom('room-1');
    const windows = elements.filter((e) => e.type === 'window').map((e) => e.id).sort();
    // 'win-in' (wallId) and 'win-host-alias' (hostWallId) both count; the
    // window on an unrelated wall does not.
    expect(windows).toEqual(['win-host-alias', 'win-in']);

    const boundary = roomQueryService.getBoundaryElements('room-1');
    expect(boundary).toContainEqual({ id: 'w1', type: 'wall', levelId: 'L0' });
    // Previously mislabelled 'wall' — the union always declared 'curtain-wall'.
    expect(boundary).toContainEqual({ id: 'cw1', type: 'curtain-wall', levelId: 'L0' });
  });
});
