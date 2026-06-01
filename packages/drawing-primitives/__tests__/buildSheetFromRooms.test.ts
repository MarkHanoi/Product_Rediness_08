// C24 — Sheet composition engine (SHT-α-5) — buildSheetFromRooms tests.
//
// Pure-data assertions only: the helper is L2 so the tests stay L2. The
// round-trip test pipes the result through `sheetToSvgWithContent` to prove
// the shape is composer-ready.

import { describe, expect, it } from 'vitest';
import {
  PAPER_SIZES_MM,
  _pickScale,
  buildSheetFromRooms,
  sheetToSvgWithContent,
  type RoomForSheet,
} from '../src/index.js';

// ── fixtures ────────────────────────────────────────────────────────────────

function squareRoom(
  id: string,
  cx: number,
  cy: number,
  sizeMm: number,
  extra?: Partial<RoomForSheet>,
): RoomForSheet {
  const h = sizeMm / 2;
  return {
    id,
    points: [
      { x: cx - h, y: cy - h },
      { x: cx + h, y: cy - h },
      { x: cx + h, y: cy + h },
      { x: cx - h, y: cy + h },
    ],
    ...(extra ?? {}),
  };
}

const FIXED_NOW = (): Date => new Date('2026-06-01T00:00:00Z');

// ── empty rooms ─────────────────────────────────────────────────────────────

describe('buildSheetFromRooms — empty input', () => {
  it('produces a valid sheet with one (degenerate) viewport and empty content', () => {
    const { sheet, contentByViewportId } = buildSheetFromRooms([], { now: FIXED_NOW });
    expect(sheet.id).toBe('sheet-1');
    expect(sheet.viewports).toHaveLength(1);
    expect(sheet.viewports[0]!.bounds.widthMm).toBe(0);
    expect(sheet.viewports[0]!.bounds.heightMm).toBe(0);

    // ONE content entry keyed by the viewport's id.
    expect(contentByViewportId.size).toBe(1);
    const content = contentByViewportId.get(sheet.viewports[0]!.id);
    expect(content).toBeDefined();
    expect(content!.polygons).toEqual([]);
  });
});

// ── single room ─────────────────────────────────────────────────────────────

describe('buildSheetFromRooms — single 1000×1000 mm room on A3 landscape', () => {
  it('emits one polygon and selects a 1:50 architectural scale', () => {
    const room = squareRoom('r1', 0, 0, 1000);
    const { sheet, contentByViewportId } = buildSheetFromRooms([room], {
      paperName: 'A3',
      orientation: 'landscape',
      now: FIXED_NOW,
    });

    expect(sheet.viewports).toHaveLength(1);
    const vp = sheet.viewports[0]!;
    // 1000 mm / 50 = 20 mm on paper — well within an A3 landscape minus margins.
    expect(vp.scale).toBe(50);
    // Title block scale string should be derived from the picked scale.
    expect(sheet.titleBlock.scale).toBe('1:50');

    const content = contentByViewportId.get(vp.id);
    expect(content).toBeDefined();
    expect(content!.polygons).toHaveLength(1);
    expect(content!.polygons![0]!.points).toHaveLength(4);
  });
});

// ── multiple rooms + bbox ───────────────────────────────────────────────────

describe('buildSheetFromRooms — multiple rooms', () => {
  it('computes the combined bbox across every room', () => {
    const rooms: RoomForSheet[] = [
      squareRoom('a', 0, 0, 1000),
      squareRoom('b', 3000, 0, 1000),
      squareRoom('c', 0, 3000, 1000),
    ];
    const { contentByViewportId, sheet } = buildSheetFromRooms(rooms, { now: FIXED_NOW });
    const content = contentByViewportId.get(sheet.viewports[0]!.id);
    expect(content?.modelBounds).toBeDefined();
    expect(content!.modelBounds!.minX).toBe(-500);
    expect(content!.modelBounds!.maxX).toBe(3500);
    expect(content!.modelBounds!.minY).toBe(-500);
    expect(content!.modelBounds!.maxY).toBe(3500);
  });
});

// ── fills ───────────────────────────────────────────────────────────────────

describe('buildSheetFromRooms — fills', () => {
  it('per-room fill takes precedence; default fills the rest', () => {
    const rooms: RoomForSheet[] = [
      squareRoom('a', 0, 0, 1000, { fill: '#ff0000' }),
      squareRoom('b', 2000, 0, 1000),
    ];
    const { sheet, contentByViewportId } = buildSheetFromRooms(rooms, {
      defaultRoomFill: '#0000ff',
      now: FIXED_NOW,
    });
    const polys = contentByViewportId.get(sheet.viewports[0]!.id)!.polygons!;
    expect(polys[0]!.fill).toBe('#ff0000');
    expect(polys[1]!.fill).toBe('#0000ff');
  });

  it('uses the documented default room fill when no override is given', () => {
    const rooms: RoomForSheet[] = [squareRoom('a', 0, 0, 1000)];
    const { sheet, contentByViewportId } = buildSheetFromRooms(rooms, { now: FIXED_NOW });
    const polys = contentByViewportId.get(sheet.viewports[0]!.id)!.polygons!;
    expect(polys[0]!.fill).toBe('#e2e8f0');
  });
});

// ── labels ──────────────────────────────────────────────────────────────────

describe('buildSheetFromRooms — labels', () => {
  it('room.name flows through to the polygon label', () => {
    const rooms: RoomForSheet[] = [
      squareRoom('a', 0, 0, 1000, { name: 'Living' }),
      squareRoom('b', 2000, 0, 1000),
    ];
    const { sheet, contentByViewportId } = buildSheetFromRooms(rooms, { now: FIXED_NOW });
    const polys = contentByViewportId.get(sheet.viewports[0]!.id)!.polygons!;
    expect(polys[0]!.label).toBe('Living');
    expect(polys[1]!.label).toBeUndefined();
  });
});

// ── paper / orientation ─────────────────────────────────────────────────────

describe('buildSheetFromRooms — paper + orientation', () => {
  it('A4 portrait sets the correct paper dimensions', () => {
    const { sheet } = buildSheetFromRooms([squareRoom('a', 0, 0, 1000)], {
      paperName: 'A4',
      orientation: 'portrait',
      now: FIXED_NOW,
    });
    expect(sheet.paper.name).toBe('A4');
    expect(sheet.paper.widthMm).toBe(PAPER_SIZES_MM.A4.width);
    expect(sheet.paper.heightMm).toBe(PAPER_SIZES_MM.A4.height);
    expect(sheet.paper.orientation).toBe('portrait');
  });
});

// ── title block flow-through ────────────────────────────────────────────────

describe('buildSheetFromRooms — title block', () => {
  it('projectName + sheetNumber + sheetName + author flow into the title block', () => {
    const { sheet } = buildSheetFromRooms([squareRoom('a', 0, 0, 1000)], {
      projectName: 'PRYZM Demo',
      sheetNumber: 'A-201',
      sheetName: 'Apartment Layout',
      author: 'Mark',
      now: FIXED_NOW,
    });
    expect(sheet.titleBlock.projectName).toBe('PRYZM Demo');
    expect(sheet.titleBlock.sheetNumber).toBe('A-201');
    expect(sheet.titleBlock.sheetName).toBe('Apartment Layout');
    expect(sheet.titleBlock.author).toBe('Mark');
    expect(sheet.titleBlock.date).toBe('2026-06-01');
  });
});

// ── default sheetId ─────────────────────────────────────────────────────────

describe('buildSheetFromRooms — default sheetId', () => {
  it('defaults to "sheet-1"', () => {
    const { sheet } = buildSheetFromRooms([], { now: FIXED_NOW });
    expect(sheet.id).toBe('sheet-1');
  });

  it('honours a custom sheetId', () => {
    const { sheet } = buildSheetFromRooms([], { sheetId: 'sheet-42', now: FIXED_NOW });
    expect(sheet.id).toBe('sheet-42');
    expect(sheet.viewports[0]!.id.startsWith('sheet-42')).toBe(true);
  });
});

// ── margin ──────────────────────────────────────────────────────────────────

describe('buildSheetFromRooms — margin', () => {
  it('default margin of 25 mm is reflected in the viewport bounds', () => {
    const { sheet } = buildSheetFromRooms([squareRoom('a', 0, 0, 1000)], {
      paperName: 'A3',
      orientation: 'landscape',
      now: FIXED_NOW,
    });
    const vp = sheet.viewports[0]!;
    expect(vp.bounds.xMm).toBe(25);
    // The viewport's TOP edge sits at paper.heightMm - margin.
    expect(vp.bounds.yMm + vp.bounds.heightMm).toBeCloseTo(sheet.paper.heightMm - 25, 4);
  });

  it('honours a custom marginMm', () => {
    const { sheet } = buildSheetFromRooms([squareRoom('a', 0, 0, 1000)], {
      paperName: 'A3',
      orientation: 'landscape',
      marginMm: 40,
      now: FIXED_NOW,
    });
    expect(sheet.viewports[0]!.bounds.xMm).toBe(40);
  });
});

// ── scale picker ────────────────────────────────────────────────────────────

describe('_pickScale', () => {
  it('picks the first candidate that fits', () => {
    // 1000 mm model on a 300 × 300 mm region → 1:50 (= 20 mm) fits.
    expect(_pickScale(1000, 1000, 300, 300)).toBe(50);
  });

  it('falls back to 1:100 when 1:50 does NOT fit', () => {
    // 1:50 needs 200 mm of paper; the region only has 150 mm available
    // along x. 1:100 needs 100 mm → fits.
    expect(_pickScale(10000, 10000, 150, 150)).toBe(100);
  });

  it('falls back to 1:200 when 1:50 + 1:100 are both too big', () => {
    // 20 m model on a 150 mm region — 1:50 = 400 mm (no), 1:100 = 200 mm (no),
    // 1:200 = 100 mm (yes).
    expect(_pickScale(20000, 20000, 150, 150)).toBe(200);
  });

  it('returns the largest candidate when nothing fits (clip rather than crash)', () => {
    expect(_pickScale(100_000_000, 100_000_000, 50, 50)).toBe(1000);
  });

  it('uses a caller-supplied scale list', () => {
    expect(_pickScale(1000, 1000, 300, 300, [25, 50, 100])).toBe(25);
  });
});

// ── large model on a small paper ────────────────────────────────────────────

describe('buildSheetFromRooms — large model on A4', () => {
  it('a huge >50 m model on A4 falls back to 1:500 or 1:1000', () => {
    // 60 m wide room — 1:50 = 1200 mm (no), 1:100 = 600 mm (no),
    // 1:200 = 300 mm (no on A4 landscape's ~ 247 mm wide region),
    // 1:500 = 120 mm (yes).
    const rooms: RoomForSheet[] = [squareRoom('big', 0, 0, 60_000)];
    const { sheet } = buildSheetFromRooms(rooms, {
      paperName: 'A4',
      orientation: 'landscape',
      now: FIXED_NOW,
    });
    expect([500, 1000]).toContain(sheet.viewports[0]!.scale);
  });
});

// ── round-trip via sheetToSvgWithContent ────────────────────────────────────

describe('buildSheetFromRooms — round-trip', () => {
  it('result feeds straight into sheetToSvgWithContent and produces a valid SVG', () => {
    const rooms: RoomForSheet[] = [
      squareRoom('a', 0, 0, 1000, { name: 'Living', fill: '#fde68a' }),
      squareRoom('b', 2000, 0, 1500, { name: 'Bedroom' }),
    ];
    const { sheet, contentByViewportId } = buildSheetFromRooms(rooms, {
      projectName: 'RT-Demo',
      now: FIXED_NOW,
    });
    const svg = sheetToSvgWithContent(sheet, contentByViewportId);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg.includes('<svg')).toBe(true);
    expect(svg.includes('</svg>')).toBe(true);
    // The project name should appear somewhere (title block).
    expect(svg.includes('RT-Demo')).toBe(true);
  });
});

// ── input immutability ──────────────────────────────────────────────────────

describe('buildSheetFromRooms — input is not mutated', () => {
  it('does not mutate the rooms array OR any room.points list', () => {
    const points0 = [
      { x: -500, y: -500 },
      { x: 500, y: -500 },
      { x: 500, y: 500 },
      { x: -500, y: 500 },
    ];
    const points1 = [
      { x: 1500, y: -500 },
      { x: 2500, y: -500 },
      { x: 2500, y: 500 },
      { x: 1500, y: 500 },
    ];
    const rooms: RoomForSheet[] = [
      { id: 'a', name: 'A', points: points0 },
      { id: 'b', name: 'B', points: points1 },
    ];
    const snapshotRooms = [...rooms];
    const snapshotPts0 = [...points0];
    const snapshotPts1 = [...points1];

    buildSheetFromRooms(rooms, { now: FIXED_NOW });

    expect(rooms).toEqual(snapshotRooms);
    expect(points0).toEqual(snapshotPts0);
    expect(points1).toEqual(snapshotPts1);
  });
});

// ── degenerate rooms ────────────────────────────────────────────────────────

describe('buildSheetFromRooms — degenerate rooms', () => {
  it('skips rooms with zero points', () => {
    const rooms: RoomForSheet[] = [
      squareRoom('a', 0, 0, 1000),
      { id: 'empty', points: [] },
    ];
    const { sheet, contentByViewportId } = buildSheetFromRooms(rooms, { now: FIXED_NOW });
    const polys = contentByViewportId.get(sheet.viewports[0]!.id)!.polygons!;
    expect(polys).toHaveLength(1);
  });
});
