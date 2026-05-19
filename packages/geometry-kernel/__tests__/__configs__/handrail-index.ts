// Handrail fixture catalog (S14-T6).  Covering set per
// `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14:
//   { round, square, flat } × { straight 2pt, polyline 4pt }
//   sized to ~ 4 representative configurations.

import type { Handrail } from '@pryzm/protocol';

export interface HandrailFixture {
  readonly id: string;
  readonly description: string;
  readonly handrail: Handrail;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };

function baseRail(overrides: Partial<Handrail> & { id: string }): Handrail {
  return {
    id: overrides.id,
    type: 'handrail' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    path: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    shape: 'round',
    height: 1.0,
    diameter: 0.045,
    ...overrides,
  } as Handrail;
}

export const HANDRAIL_FIXTURES: readonly HandrailFixture[] = [
  {
    id: 'round-straight',
    description: 'straight 4 m round timber rail, 1 m height',
    handrail: baseRail({ id: 'handrail:rnd-str' }),
    worldY: 0,
  },
  {
    id: 'square-stair-rake',
    description: 'square 50 mm rail along a raked stair edge (3-segment polyline)',
    handrail: baseRail({
      id: 'handrail:sq-rake',
      shape: 'square',
      diameter: 0.05,
      height: 0.9,
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 1.5, y: 1.2, z: 0 },
        { x: 3.0, y: 2.4, z: 0 },
        { x: 4.5, y: 2.4, z: 0 },
      ],
    }),
    worldY: 0,
  },
  {
    id: 'flat-tall-commercial',
    description: 'flat-bar industrial rail, 1.1 m height, 6 m straight',
    handrail: baseRail({
      id: 'handrail:fl-com',
      shape: 'flat',
      diameter: 0.06,
      height: 1.1,
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 6, y: 0, z: 0 },
      ],
    }),
    worldY: 2.5,
  },
  {
    id: 'round-l-shape',
    description: 'round rail tracking an L-shape stair (4-pt polyline)',
    handrail: baseRail({
      id: 'handrail:rnd-l',
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 1.6, z: 0 },
        { x: 2, y: 1.6, z: 1.5 },
        { x: 2, y: 1.6, z: 3.5 },
      ],
    }),
    worldY: 0,
  },
  // ── W-1C-4 top-up: 2 additional fixtures (4 → 6) ──────────────────────
  {
    id: 'square-straight-commercial',
    description: 'square 50 mm commercial rail, 1.1 m height, 8 m straight',
    handrail: baseRail({
      id: 'handrail:sq-com',
      shape: 'square',
      diameter: 0.05,
      height: 1.1,
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 8, y: 0, z: 0 },
      ],
    }),
    worldY: 3.5,
  },
  {
    id: 'round-u-shape',
    description: 'round rail tracking a U-shape stair (5-pt polyline)',
    handrail: baseRail({
      id: 'handrail:rnd-u',
      shape: 'round',
      diameter: 0.045,
      height: 1.0,
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1.4, z: 0 },
        { x: 1.2, y: 1.4, z: 0 },
        { x: 1.2, y: 0, z: 0 },
        { x: 2.4, y: 0, z: 0 },
      ],
    }),
    worldY: 0,
  },
];

export function getHandrailFixture(id: string): HandrailFixture {
  const f = HANDRAIL_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown handrail fixture: ${id}`);
  return f;
}
