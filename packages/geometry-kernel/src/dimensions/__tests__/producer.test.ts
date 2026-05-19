// DimensionProducer tests (S33 Track C exit criterion).
//
// Verifies:
//   • All 5 modes (`per-element`, `room-bounding`, `elevation`, `section`,
//     `rcp`) produce the right cardinality + reference shape.
//   • Output parses cleanly via DimensionStringSchema.parse (round-trip).
//   • Same inputs → byte-identical output (deterministic id factory).

import { describe, expect, it } from 'vitest';
import { DimensionStringSchema } from '@pryzm/schemas/annotation/dimension';
import {
  makeMonotonicDimensionIdFactory,
  produceDimensions,
  type DimensionElementSnapshot,
} from '../producer.js';

const SNAP: DimensionElementSnapshot = {
  walls: [{ id: 'wall_01J7', levelId: 'level_L1' }, { id: 'wall_02J8' }],
  doors: [{ id: 'door_01J9' }],
  windows: [{ id: 'window_01JA' }],
  rooms: [{ id: 'room_01JB', levelId: 'level_L1' }],
};

describe('produceDimensions', () => {
  it('per-element: emits 1 dim per wall + 1 per door + 1 per window', () => {
    const dims = produceDimensions(
      { mode: 'per-element', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    // 2 walls + 1 door + 1 window = 4 dims
    expect(dims).toHaveLength(4);
    expect(dims.filter((d) => d.autoMode === 'per-element')).toHaveLength(4);
  });

  it('per-element wall dim is "aligned" with start/end refs', () => {
    const [wallDim] = produceDimensions(
      { mode: 'per-element', viewId: 'view_001' },
      { walls: [{ id: 'wall_01J7' }] },
      makeMonotonicDimensionIdFactory(),
    );
    expect(wallDim.kind).toBe('linear-element');
    expect(wallDim.orientation).toBe('aligned');
    expect(wallDim.references[0].anchor).toBe('start');
    expect(wallDim.references[1].anchor).toBe('end');
    expect(wallDim.witnessLines.weight).toBe(0.18);
  });

  it('per-element opening dim is "horizontal" with left/right refs + light witness', () => {
    const [doorDim] = produceDimensions(
      { mode: 'per-element', viewId: 'view_001' },
      { doors: [{ id: 'door_01J9' }] },
      makeMonotonicDimensionIdFactory(),
    );
    expect(doorDim.orientation).toBe('horizontal');
    expect(doorDim.references[0].anchor).toBe('left');
    expect(doorDim.references[1].anchor).toBe('right');
    expect(doorDim.witnessLines.weight).toBe(0.13);
  });

  it('room-bounding: emits 2 dims per room (X-extent + Z-extent)', () => {
    const dims = produceDimensions(
      { mode: 'room-bounding', viewId: 'view_001' },
      { rooms: [{ id: 'r1' }, { id: 'r2' }] },
      makeMonotonicDimensionIdFactory(),
    );
    expect(dims).toHaveLength(4);
    expect(dims[0].orientation).toBe('horizontal');
    expect(dims[1].orientation).toBe('vertical');
    expect(dims.every((d) => d.autoMode === 'room-bounding')).toBe(true);
  });

  it('elevation: 1 height dim per wall + 1 per window', () => {
    const dims = produceDimensions(
      { mode: 'elevation', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    // 2 walls + 1 window = 3
    expect(dims).toHaveLength(3);
    expect(dims.every((d) => d.orientation === 'vertical')).toBe(true);
    expect(dims.every((d) => d.autoMode === 'elevation')).toBe(true);
  });

  it('section: elevation dims + per-element width dims', () => {
    const dims = produceDimensions(
      { mode: 'section', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    // elevation: 2 walls + 1 window = 3 vertical
    // per-element: 2 walls + 1 door + 1 window = 4
    expect(dims).toHaveLength(7);
    const verticals = dims.filter((d) => d.orientation === 'vertical');
    expect(verticals).toHaveLength(3);
  });

  it('rcp: re-uses room-bounding (2 dims per room)', () => {
    const dims = produceDimensions(
      { mode: 'rcp', viewId: 'view_001' },
      { rooms: [{ id: 'r1' }] },
      makeMonotonicDimensionIdFactory(),
    );
    expect(dims).toHaveLength(2);
    // autoMode is 'room-bounding' because RCP delegates to that producer.
    expect(dims.every((d) => d.autoMode === 'room-bounding')).toBe(true);
  });

  it('off mode: returns empty', () => {
    const dims = produceDimensions(
      { mode: 'off', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    expect(dims).toHaveLength(0);
  });

  it('honours request.levelId override over per-element levelId', () => {
    const [wallDim] = produceDimensions(
      { mode: 'per-element', viewId: 'view_001', levelId: 'level_OVERRIDE' },
      { walls: [{ id: 'wall_01J7', levelId: 'level_INNER' }] },
      makeMonotonicDimensionIdFactory(),
    );
    expect(wallDim.levelId).toBe('level_OVERRIDE');
  });

  it('honours request.offsetMm override', () => {
    const [wallDim] = produceDimensions(
      { mode: 'per-element', viewId: 'view_001', offsetMm: 25 },
      { walls: [{ id: 'wall_01J7' }] },
      makeMonotonicDimensionIdFactory(),
    );
    expect(wallDim.offsetMm).toBe(25);
  });

  it('output parses through DimensionStringSchema (round-trip)', () => {
    const dims = produceDimensions(
      { mode: 'per-element', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    for (const d of dims) {
      expect(() => DimensionStringSchema.parse(d)).not.toThrow();
    }
  });

  it('is deterministic across calls with the same id factory', () => {
    const a = produceDimensions(
      { mode: 'per-element', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    const b = produceDimensions(
      { mode: 'per-element', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    expect(a).toEqual(b);
  });

  it('uses unique ids across multiple dims', () => {
    const dims = produceDimensions(
      { mode: 'section', viewId: 'view_001' },
      SNAP,
      makeMonotonicDimensionIdFactory(),
    );
    const ids = new Set(dims.map((d) => d.id));
    expect(ids.size).toBe(dims.length);
  });
});
