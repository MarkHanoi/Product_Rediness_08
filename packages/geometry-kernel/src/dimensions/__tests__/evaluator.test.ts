// DimensionEvaluator tests (S33 Track C exit criterion).
//
// Verifies:
//   • All 10 DimAnchor kinds resolved across Wall / Door / Window / Room.
//   • Metres → mm unit conversion at the schema boundary.
//   • Override + flag logic (5% threshold).
//   • formatDimension across mm/cm/m/ft/in/ft-in.
//   • Witness + dim-line geometry math.
//   • Pure: no node:fs, no DOM globals (test runs in default vitest Node env).

import { describe, expect, it } from 'vitest';
import {
  DimensionStringSchema,
  type DimensionString,
} from '@pryzm/schemas/annotation/dimension';
import {
  evaluateDimensions,
  formatDimension,
  type DoorLikeEvaluator,
  type ElementSnapshotForDim,
  type RoomLikeEvaluator,
  type WallLikeEvaluator,
  type WindowLikeEvaluator,
} from '../evaluator.js';

// ── Test fixtures ──────────────────────────────────────────────────────────
//
// 5m horizontal wall along +X at y=0, height 3m, base 0m.
const wall: WallLikeEvaluator = {
  id: 'wall_01J7ABCDEFGHJKMNPQRSTVWXYZ',
  baseLine: [
    { x: 0, y: 0, z: 0 },
    { x: 5, y: 0, z: 0 },
  ],
  height: 3,
  baseOffset: 0,
};

// Door 1m wide × 2.1m tall, hosted on `wall`, 2m along the wall, sill 0.
const door: DoorLikeEvaluator = {
  id: 'door_01J9ABCDEFGHJKMNPQRSTVWXYZ',
  wallId: wall.id,
  offset: 2,
  width: 1,
  height: 2.1,
  sillHeight: 0,
};

// Window 1.2m wide × 1.2m tall, sill 0.9m, on `wall` at offset 4m.
const win: WindowLikeEvaluator = {
  id: 'win_01JAABCDEFGHJKMNPQRSTVWXYZ',
  wallId: wall.id,
  offset: 4,
  width: 1.2,
  height: 1.2,
  sillHeight: 0.9,
};

// 4m × 6m rectangular room.
const room: RoomLikeEvaluator = {
  id: 'room_01JBABCDEFGHJKMNPQRSTVWXYZ',
  boundary: [
    { x: 1, y: 0, z: 1 },
    { x: 5, y: 0, z: 1 },
    { x: 5, y: 0, z: 7 },
    { x: 1, y: 0, z: 7 },
  ],
};

const snapshot: ElementSnapshotForDim = {
  walls: new Map([[wall.id, wall]]),
  doors: new Map([[door.id, door]]),
  windows: new Map([[win.id, win]]),
  rooms: new Map([[room.id, room]]),
};

const projectUnits = { unit: 'mm' as const, decimalPlaces: 0 };

function makeDim(overrides: Record<string, unknown>): DimensionString {
  return DimensionStringSchema.parse({
    id: 'dim-test',
    kind: 'linear-element',
    references: [
      { elementId: wall.id, anchor: 'start' },
      { elementId: wall.id, anchor: 'end' },
    ],
    orientation: 'aligned',
    viewId: 'view_001',
    ...overrides,
  });
}

// ── Wall anchor tests (10 kinds) ───────────────────────────────────────────

describe('Wall anchor resolution', () => {
  const cases: Array<[string, [number, number]]> = [
    ['start',      [0,    0]],
    ['end',        [5000, 0]],
    ['center',     [2500, 0]],
    ['centerline', [2500, 0]],
    ['left',       [0,    0]],
    ['right',      [5000, 0]],
    ['bottom',     [2500, 0]],
    ['top',        [2500, 3000]],
    ['face-outer', [2500, 0]],
    ['face-inner', [2500, 0]],
  ];
  for (const [anchor, expected] of cases) {
    it(`resolves wall ${anchor}`, () => {
      const dim = makeDim({
        references: [
          { elementId: wall.id, anchor: anchor as 'start' },
          { elementId: wall.id, anchor: 'end' },
        ],
      });
      const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
      expect(evald.p1World[0]).toBeCloseTo(expected[0], 5);
      expect(evald.p1World[1]).toBeCloseTo(expected[1], 5);
    });
  }
});

// ── Door anchor tests ──────────────────────────────────────────────────────

describe('Door anchor resolution', () => {
  it('center: 2m along the wall = (2000mm, 0mm)', () => {
    const dim = makeDim({
      references: [
        { elementId: door.id, anchor: 'center' },
        { elementId: door.id, anchor: 'right' },
      ],
      orientation: 'horizontal',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.p1World[0]).toBeCloseTo(2000, 5);
    expect(evald.p1World[1]).toBeCloseTo(0, 5);
  });

  it('left/right span = 1m door width = 1000mm', () => {
    const dim = makeDim({
      references: [
        { elementId: door.id, anchor: 'left' },
        { elementId: door.id, anchor: 'right' },
      ],
      orientation: 'horizontal',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.valueMm).toBeCloseTo(1000, 5);
  });

  it('top: door bottom + height = 2100mm', () => {
    const dim = makeDim({
      references: [
        { elementId: door.id, anchor: 'bottom' },
        { elementId: door.id, anchor: 'top' },
      ],
      orientation: 'vertical',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.valueMm).toBeCloseTo(2100, 5);
  });
});

// ── Window anchor tests ────────────────────────────────────────────────────

describe('Window anchor resolution', () => {
  it('window left/right span = 1.2m = 1200mm', () => {
    const dim = makeDim({
      references: [
        { elementId: win.id, anchor: 'left' },
        { elementId: win.id, anchor: 'right' },
      ],
      orientation: 'horizontal',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.valueMm).toBeCloseTo(1200, 5);
  });

  it('window bottom (sill 0.9m) = 900mm; top = 900+1200=2100mm; span = 1200mm', () => {
    const dim = makeDim({
      references: [
        { elementId: win.id, anchor: 'bottom' },
        { elementId: win.id, anchor: 'top' },
      ],
      orientation: 'vertical',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.p1World[1]).toBeCloseTo(900, 5);
    expect(evald.p2World[1]).toBeCloseTo(2100, 5);
    expect(evald.valueMm).toBeCloseTo(1200, 5);
  });
});

// ── Room anchor tests (bbox-based) ─────────────────────────────────────────

describe('Room anchor resolution', () => {
  it('left/right span = X-extent = 4m = 4000mm', () => {
    const dim = makeDim({
      references: [
        { elementId: room.id, anchor: 'left' },
        { elementId: room.id, anchor: 'right' },
      ],
      orientation: 'horizontal',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.valueMm).toBeCloseTo(4000, 5);
  });

  it('top/bottom span = Z-extent = 6m = 6000mm', () => {
    const dim = makeDim({
      references: [
        { elementId: room.id, anchor: 'bottom' },
        { elementId: room.id, anchor: 'top' },
      ],
      orientation: 'vertical',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.valueMm).toBeCloseTo(6000, 5);
  });

  it('center is bbox center', () => {
    const dim = makeDim({
      references: [
        { elementId: room.id, anchor: 'center' },
        { elementId: room.id, anchor: 'right' },
      ],
      orientation: 'horizontal',
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.p1World[0]).toBeCloseTo(3000, 5);
    expect(evald.p1World[1]).toBeCloseTo(4000, 5);
  });
});

// ── Override + flag logic ──────────────────────────────────────────────────

describe('Override + flag logic', () => {
  it('isOverride=false when override is null', () => {
    const dim = makeDim({});
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.isOverride).toBe(false);
    expect(evald.isFlagged).toBe(false);
  });

  it('isOverride=true & not flagged when override matches geometry', () => {
    const dim = makeDim({ override: 5000 });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.isOverride).toBe(true);
    expect(evald.isFlagged).toBe(false);
    expect(evald.valueText).toBe('5000');
  });

  it('isFlagged=true when override differs by > 5% from geometry', () => {
    // wall is 5000mm; override 5500mm = +10% → flagged
    const dim = makeDim({ override: 5500 });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.isFlagged).toBe(true);
    expect(evald.valueText).toBe('5500');
  });

  it('isFlagged=false when override differs by < 5%', () => {
    // wall is 5000mm; override 5100mm = +2% → not flagged
    const dim = makeDim({ override: 5100 });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.isFlagged).toBe(false);
  });
});

// ── Witness + dim-line geometry ────────────────────────────────────────────

describe('Witness and dim-line geometry', () => {
  it('horizontal: lineY = max(p1.y, p2.y) + offsetMm', () => {
    const dim = makeDim({
      references: [
        { elementId: room.id, anchor: 'left' },
        { elementId: room.id, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: 50,
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    // Both points have y = room center Z = 4000mm; lineY = 4000 + 50 = 4050.
    expect(evald.lineY).toBeCloseTo(4050, 5);
    // Witness extension default = 2; witness y = 4000 + 50 + 2 = 4052.
    expect(evald.witnessP1[1]).toBeCloseTo(4052, 5);
  });

  it('vertical: lineY (= line X) = max(p1.x, p2.x) + offsetMm', () => {
    const dim = makeDim({
      references: [
        { elementId: room.id, anchor: 'bottom' },
        { elementId: room.id, anchor: 'top' },
      ],
      orientation: 'vertical',
      offsetMm: 30,
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    // Both p1/p2 have x = bbox center X = 3000mm; lineY = 3000 + 30 = 3030.
    expect(evald.lineY).toBeCloseTo(3030, 5);
  });
});

// ── formatDimension ────────────────────────────────────────────────────────

describe('formatDimension', () => {
  const fmt = (v: number, unit: 'mm' | 'cm' | 'm' | 'ft' | 'in' | 'ft-in', dp = 2) =>
    formatDimension(v, {
      unit,
      decimalPlaces: dp,
      suppressTrailingZeros: true,
      prefix: '',
      suffix: '',
    });

  it('mm', () => expect(fmt(3200, 'mm')).toBe('3200'));
  it('cm', () => expect(fmt(3200, 'cm')).toBe('320'));
  it('m',  () => expect(fmt(3200, 'm')).toBe('3.2'));
  it('ft', () => expect(fmt(3048, 'ft', 2)).toBe("10'"));
  it('in', () => expect(fmt(254, 'in', 2)).toBe('10"'));
  it('ft-in', () => expect(fmt(3200, 'ft-in', 0)).toMatch(/'-\d+"/));
  it('honours suppressTrailingZeros=false', () => {
    expect(formatDimension(3200, {
      unit: 'm',
      decimalPlaces: 3,
      suppressTrailingZeros: false,
      prefix: '',
      suffix: '',
    })).toBe('3.200');
  });
  it('honours prefix/suffix', () => {
    expect(formatDimension(3200, {
      unit: 'mm',
      decimalPlaces: 0,
      suppressTrailingZeros: true,
      prefix: 'CLR: ',
      suffix: ' approx',
    })).toBe('CLR: 3200 approx');
  });
});

// ── Missing / degenerate inputs ────────────────────────────────────────────

describe('Defensive paths', () => {
  it('returns [0,0] for unknown element id', () => {
    const dim = makeDim({
      references: [
        { elementId: 'wall_NONEXISTENTABCDEFGHIJKLMN', anchor: 'start' },
        { elementId: wall.id, anchor: 'end' },
      ],
    });
    const evald = evaluateDimensions([dim], snapshot, projectUnits)[0]!;
    expect(evald.p1World).toEqual([0, 0]);
  });

  it('does not throw for empty dimension list', () => {
    expect(evaluateDimensions([], snapshot, projectUnits)).toEqual([]);
  });
});
