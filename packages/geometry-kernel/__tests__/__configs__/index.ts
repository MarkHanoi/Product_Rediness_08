// Wall fixture catalog used by every S08 producer test (unit,
// snapshot, headless-node parity, bench).  30 configurations cover
// the matrix from `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`
// §1.4 (lines 130-136):
//
//   straight × { single-layer, 2-layer, 3-layer, 5-layer }
//                  × { no-openings, 1 door, 1 window, 2 windows + door }
//                  × { no-join, miter-start, miter-end, miter-both }
//   curved   × { single-layer, 2-layer } × { no-openings }
//
// Each config is a fully-resolved Wall DTO (the schema's defaults
// have been folded in) plus pre-resolved JoinData and worldY.
//
// The configs are also written out to JSON in `tests/parity/wall/
// configs/*.json` (the exporter test in `wall-snapshot.test.ts`
// regenerates them on demand).

import type { Wall } from '@pryzm/protocol';
import type { JoinData } from '../../src/types/JoinData.js';

export interface WallFixture {
  readonly id: string;
  readonly description: string;
  readonly wall: Wall;
  readonly joinData: JoinData;
  readonly worldY: number;
}

const ULID_PAD = '01HZS00000000000000';
function id(name: string): string {
  // Deterministic, 26-char ULID-shaped string for fixtures.
  const b32 = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(7, '0').slice(0, 7);
  return ULID_PAD + b32;
}
function wid(name: string): string {
  return `wall:${id(name)}`;
}

const META = {
  createdAt: 0,
  modifiedAt: 0,
  createdBy: 'fixture',
  version: 1,
};

function baseWall(overrides: Partial<Wall> & { id: string }): Wall {
  return {
    id: overrides.id,
    type: 'wall' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    height: 2.5,
    thickness: 0.2,
    baseOffset: 0,
    openings: [],
    ...overrides,
  } as Wall;
}

const door1 = (offset = 1.2) => ({
  id: 'op-d1', type: 'door' as const, doorType: 'single' as const,
  offset, width: 0.9, height: 2.1, sillHeight: 0,
  elementId: `door:${id('D1' + Math.round(offset * 100))}`,
});
const window1 = (offset = 2.6, sill = 1.0) => ({
  id: 'op-w1', type: 'window' as const, windowType: 'single' as const,
  offset, width: 1.2, height: 1.0, sillHeight: sill,
  elementId: `window:${id('W1' + Math.round(offset * 100))}`,
});
const window2 = (offset = 3.4, sill = 1.0) => ({
  id: 'op-w2', type: 'window' as const, windowType: 'single' as const,
  offset, width: 0.8, height: 1.0, sillHeight: sill,
  elementId: `window:${id('W2' + Math.round(offset * 100))}`,
});

const layers2 = [
  { name: 'cmu', function: 'structure' as const, thickness: 0.15, materialColor: '#a3a3a3' },
  { name: 'drywall', function: 'finish-interior' as const, thickness: 0.013, materialColor: '#f5f5f0' },
];
const layers3 = [
  { name: 'cladding', function: 'finish-exterior' as const, thickness: 0.025, materialColor: '#9c8d72' },
  ...layers2,
];
const layers5 = [
  { name: 'cladding', function: 'finish-exterior' as const, thickness: 0.025, materialColor: '#9c8d72' },
  { name: 'air-gap', function: 'air-barrier' as const, thickness: 0.025, materialColor: '#cccccc' },
  { name: 'insulation', function: 'insulation' as const, thickness: 0.05, materialColor: '#fff7c2' },
  ...layers2,
];

function withId<T extends { id: string }>(arr: T[], suffix: string): T[] {
  return arr.map((o, i) => ({ ...o, id: `${o.id}-${suffix}-${i}`, elementId: (o as unknown as { elementId?: string }).elementId ? `${(o as unknown as { elementId: string }).elementId}-${suffix}-${i}` : undefined }));
}

const childrenFor = (openings: { elementId: string }[]): string[] =>
  openings.map((o) => o.elementId);

function build(
  name: string,
  patch: Partial<Wall>,
  joinData: JoinData = {},
  worldY = 0,
  description = name,
): WallFixture {
  const openings = (patch.openings ?? []) as { elementId: string }[];
  const wall = baseWall({
    id: wid(name),
    childrenIds: childrenFor(openings),
    ...patch,
  });
  return { id: name, description, wall, joinData, worldY };
}

const MITER_45 = Math.PI / 4;

export const FIXTURES: readonly WallFixture[] = [
  // ── Straight, single-layer, no openings ────────────────────────────
  build('straight-single-no-op', {}),
  build('straight-single-tall', { height: 4 }, {}, 0, 'tall single-layer wall'),
  build('straight-single-thick', { thickness: 0.4 }, {}, 0, 'thick single-layer wall'),
  build('straight-single-baseoffset', { baseOffset: 0.5 }),
  build('straight-single-worldY', {}, {}, 12.5, 'single-layer above grade'),

  // ── Straight, layered ──────────────────────────────────────────────
  build('straight-2layer', { layers: layers2, thickness: 0.163 }),
  build('straight-3layer', { layers: layers3, thickness: 0.188 }),
  build('straight-5layer', { layers: layers5, thickness: 0.263 }),
  build('straight-2layer-tall', { layers: layers2, thickness: 0.163, height: 3.5 }),

  // ── Straight, openings ─────────────────────────────────────────────
  build('open-1door', { openings: [door1(1.2)] }),
  build('open-1window', { openings: [window1(2.0)] }),
  build('open-2doors', {
    openings: withId([door1(1.0), door1(3.0)], 'pair') as Wall['openings'],
  }),
  build('open-door-window', { openings: [door1(1.0), window1(2.5)] }),
  build('open-edge-start', {
    openings: [{ ...door1(0.5) }],
  }, {}, 0, 'opening near wall start'),
  build('open-edge-end', {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    openings: [{ ...door1(4.5) }],
  }, {}, 0, 'opening near wall end'),
  build('open-2windows-door', {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    openings: [door1(1.0), window1(3.0), window2(4.5)],
  }),

  // ── Layered + openings ─────────────────────────────────────────────
  build('layered-open-door', {
    layers: layers2, thickness: 0.163,
    openings: [door1(1.5)],
  }),
  build('layered-open-window-door', {
    layers: layers3, thickness: 0.188,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    openings: [door1(1.2), window1(3.5)],
  }),

  // ── Miter / junction matrix ────────────────────────────────────────
  build('miter-start-only', {}, {
    start: { miterAngleRad: MITER_45, neighbourId: wid('NB-A') as Wall['id'] },
  }, 0, '45° miter at start'),
  build('miter-end-only', {}, {
    end: { miterAngleRad: MITER_45, neighbourId: wid('NB-B') as Wall['id'] },
  }, 0, '45° miter at end'),
  build('miter-both-90deg', {}, {
    start: { miterAngleRad: MITER_45, neighbourId: wid('NB-C') as Wall['id'] },
    end: { miterAngleRad: -MITER_45, neighbourId: wid('NB-D') as Wall['id'] },
  }, 0, 'L-junction both ends'),
  build('miter-acute', {}, {
    start: { miterAngleRad: Math.PI / 8, neighbourId: wid('NB-E') as Wall['id'] },
  }, 0, 'acute 22.5° miter (T-junction left)'),
  build('miter-tjunction-right', {}, {
    end: { miterAngleRad: -Math.PI / 8, neighbourId: wid('NB-F') as Wall['id'] },
  }, 0, 'T-junction right'),

  // ── Curved walls ───────────────────────────────────────────────────
  build('curved-single-90deg', {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    curve: { control: { x: 2, y: 0, z: 1.5 }, segments: 16 },
  }, {}, 0, '90° single-layer arc'),
  build('curved-single-large', {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: 2.5 }, segments: 24 },
  }, {}, 0, 'large-radius single-layer arc'),
  build('curved-2layer', {
    layers: layers2, thickness: 0.163,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    curve: { control: { x: 2, y: 0, z: 1.0 }, segments: 16 },
  }, {}, 0, '2-layer curved wall'),
  build('curved-miter-start', {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    curve: { control: { x: 2, y: 0, z: 1.5 }, segments: 16 },
  }, {
    start: { miterAngleRad: MITER_45, neighbourId: wid('NB-G') as Wall['id'] },
  }, 0, 'curved with start miter'),

  // ── Diagonal baselines (rotation invariance) ───────────────────────
  build('diagonal-no-op', {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }],
  }),
  build('diagonal-with-door', {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }],
    openings: [door1(2.0)],
  }),

  // ── Spec-30 padding: high-Y level + diagonal layered ───────────────
  build('diagonal-layered', {
    layers: layers2,
    thickness: 0.163,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }],
  }, {}, 8.5, 'diagonal 2-layer above grade'),
];

export function getFixture(idStr: string): WallFixture {
  const f = FIXTURES.find((x) => x.id === idStr);
  if (!f) throw new Error(`Unknown wall fixture id: ${idStr}`);
  return f;
}
