import { describe, it, expect } from 'vitest';
import { snapCursor, type SnapKind } from '../../src/sketch/snap.js';
import { createSketchDocStore } from '../../src/stores/sketchDocStore.js';

const RADIUS = 10;
const GRID = 100;

function entitiesFromStore(): { entities: ReturnType<ReturnType<typeof createSketchDocStore>['get']>['entities'] } {
  const store = createSketchDocStore();
  return { entities: store.get().entities };
}

describe('snapCursor — S52 D1', () => {
  it('returns "none" when no entity is in range and grid snap is far', () => {
    const { entities } = entitiesFromStore();
    // Cursor at (50, 50) with grid = 100 → nearest grid is (0, 0) which is
    // sqrt(5000) ≈ 70.7 mm away — far outside radius 10.
    const hit = snapCursor({ cursorX: 50, cursorZ: 50, entities, snapRadiusMm: RADIUS, gridSizeMm: GRID });
    expect(hit.kind).toBe('none');
    expect(hit.x).toBe(50);
    expect(hit.z).toBe(50);
  });

  it('snaps to a grid intersection when the cursor is within radius', () => {
    const { entities } = entitiesFromStore();
    const hit = snapCursor({ cursorX: 102, cursorZ: 99, entities, snapRadiusMm: RADIUS, gridSizeMm: GRID });
    expect(hit.kind).toBe('grid');
    expect(hit.x).toBe(100);
    expect(hit.z).toBe(100);
  });

  it('snaps to the closest endpoint over a competing grid hit', () => {
    const store = createSketchDocStore();
    store.addPoint(99, 99);
    const hit = snapCursor({
      cursorX: 102, cursorZ: 99,
      entities: store.get().entities,
      snapRadiusMm: RADIUS, gridSizeMm: GRID,
    });
    expect(hit.kind).toBe('endpoint');
    expect(hit.x).toBe(99);
    expect(hit.z).toBe(99);
  });

  it('snaps to a midpoint when no endpoint is in range', () => {
    const store = createSketchDocStore();
    store.addLineByCoords(0, 0, 200, 0); // midpoint at (100, 0)
    const hit = snapCursor({
      cursorX: 102, cursorZ: 1,
      entities: store.get().entities,
      snapRadiusMm: RADIUS, gridSizeMm: GRID,
    });
    expect(hit.kind).toBe('midpoint');
    expect(hit.x).toBe(100);
    expect(hit.z).toBe(0);
  });

  it('snaps to on-line when only the line is near', () => {
    const store = createSketchDocStore();
    store.addLineByCoords(0, 0, 200, 0);
    const hit = snapCursor({
      cursorX: 50, cursorZ: 3,
      entities: store.get().entities,
      snapRadiusMm: RADIUS, gridSizeMm: GRID,
    });
    expect(hit.kind).toBe('on-line');
    expect(hit.z).toBe(0);
    expect(hit.x).toBeCloseTo(50, 5);
  });

  it('on-line snap clamps to segment endpoints', () => {
    const store = createSketchDocStore();
    store.addLineByCoords(0, 0, 100, 0);
    // Cursor far past the line's right endpoint (300, 0) — projection
    // would land at (300, 0) but clamping pulls it back to (100, 0).
    // That puts the projected point too far from the cursor, so on-line
    // snap should NOT trigger — falls through to grid (300, 0).
    const hit = snapCursor({
      cursorX: 300, cursorZ: 0,
      entities: store.get().entities,
      snapRadiusMm: RADIUS, gridSizeMm: GRID,
    });
    expect(hit.kind).toBe('grid');
    expect(hit.x).toBe(300);
    expect(hit.z).toBe(0);
  });

  it('respects enabledKinds filter', () => {
    const store = createSketchDocStore();
    store.addPoint(99, 99);
    const onlyGrid = new Set<SnapKind>(['grid']);
    const hit = snapCursor({
      cursorX: 102, cursorZ: 99,
      entities: store.get().entities,
      snapRadiusMm: RADIUS, gridSizeMm: GRID,
      enabledKinds: onlyGrid,
    });
    expect(hit.kind).toBe('grid');
    expect(hit.x).toBe(100);
    expect(hit.z).toBe(100);
  });

  it('returns "none" when grid is disabled and no entity is in range', () => {
    const { entities } = entitiesFromStore();
    const hit = snapCursor({
      cursorX: 102, cursorZ: 99,
      entities, snapRadiusMm: RADIUS, gridSizeMm: GRID,
      enabledKinds: new Set<SnapKind>(['endpoint', 'midpoint', 'on-line']),
    });
    expect(hit.kind).toBe('none');
  });

  it('endpoint hit reports the entity id', () => {
    const store = createSketchDocStore();
    const id = store.addPoint(0, 0);
    const hit = snapCursor({
      cursorX: 1, cursorZ: 1,
      entities: store.get().entities,
      snapRadiusMm: RADIUS, gridSizeMm: GRID,
    });
    expect(hit.entityId).toBe(id);
  });
});
