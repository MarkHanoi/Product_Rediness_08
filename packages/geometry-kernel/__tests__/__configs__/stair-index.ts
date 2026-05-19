// Stair fixture catalog (S14-T3).  Per
// `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14, the parity
// covering set is 6 representative configurations across the
// {straight, l-shape, u-shape, spiral} × {tread depth, riser height,
// width, riser count, world-Y} matrix.  Full 14-fixture sweep lands
// alongside the PRYZM 1 façade harness in S15.

import type { Stair } from '@pryzm/protocol';

export interface StairFixture {
  readonly id: string;
  readonly description: string;
  readonly stair: Stair;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };

function baseStair(overrides: Partial<Stair> & { id: string }): Stair {
  return {
    id: overrides.id,
    type: 'stair' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    topLevelId: 'level:1',
    shape: 'straight',
    origin: { x: 0, y: 0, z: 0 },
    rotation: 0,
    treadDepth: 0.28,
    riserHeight: 0.18,
    width: 1.0,
    numRisers: 15,
    ...overrides,
  } as Stair;
}

export const STAIR_FIXTURES: readonly StairFixture[] = [
  {
    id: 'straight-residential',
    description: 'straight 15-riser residential stair, 1 m wide',
    stair: baseStair({ id: 'stair:str-res' }),
    worldY: 0,
  },
  {
    id: 'straight-commercial-tall',
    description: 'straight 18-riser commercial stair, 1.2 m wide, on level 2',
    stair: baseStair({
      id: 'stair:str-com',
      numRisers: 18,
      treadDepth: 0.30,
      riserHeight: 0.17,
      width: 1.2,
    }),
    worldY: 5.4,
  },
  {
    id: 'l-shape-mid',
    description: 'L-shape 16-riser stair, mid-pitch, 0.9 m wide',
    stair: baseStair({
      id: 'stair:lsh-mid',
      shape: 'l-shape',
      numRisers: 16,
      treadDepth: 0.28,
      riserHeight: 0.18,
      width: 0.9,
    }),
    worldY: 0,
  },
  {
    id: 'u-shape-heavy',
    description: 'U-shape 20-riser stair, 1.4 m wide (commercial)',
    stair: baseStair({
      id: 'stair:ush-com',
      shape: 'u-shape',
      numRisers: 20,
      treadDepth: 0.30,
      riserHeight: 0.17,
      width: 1.4,
    }),
    worldY: 0,
  },
  {
    id: 'spiral-fallback',
    description: 'spiral stair (v1 falls back to straight projection)',
    stair: baseStair({
      id: 'stair:spr',
      shape: 'spiral',
      numRisers: 14,
      treadDepth: 0.25,
      riserHeight: 0.20,
      width: 0.8,
    }),
    worldY: 0,
  },
  {
    id: 'straight-rotated',
    description: 'straight stair rotated 30° in plan',
    stair: baseStair({
      id: 'stair:str-rot',
      rotation: Math.PI / 6,
      origin: { x: 2, y: 0, z: 1 },
    }),
    worldY: 0,
  },
  // ── W-1C-4 top-up: 4 additional fixtures (6 → 10) ─────────────────────
  {
    id: 'straight-narrow',
    description: 'straight stair with narrow 0.75 m width (minimum-clearance)',
    stair: baseStair({
      id: 'stair:str-nar',
      numRisers: 12,
      treadDepth: 0.25,
      riserHeight: 0.20,
      width: 0.75,
    }),
    worldY: 0,
  },
  {
    id: 'straight-wide-public',
    description: 'wide 2.0 m public stair with low pitch',
    stair: baseStair({
      id: 'stair:str-wid',
      numRisers: 10,
      treadDepth: 0.33,
      riserHeight: 0.15,
      width: 2.0,
    }),
    worldY: 0,
  },
  {
    id: 'u-shape-residential',
    description: 'U-shape 16-riser residential stair, 1.0 m wide, at grade',
    stair: baseStair({
      id: 'stair:ush-res',
      shape: 'u-shape',
      numRisers: 16,
      treadDepth: 0.28,
      riserHeight: 0.18,
      width: 1.0,
    }),
    worldY: 0,
  },
  {
    id: 'l-shape-commercial-high',
    description: 'L-shape 20-riser commercial stair elevated on level 2',
    stair: baseStair({
      id: 'stair:lsh-hi',
      shape: 'l-shape',
      numRisers: 20,
      treadDepth: 0.30,
      riserHeight: 0.17,
      width: 1.5,
    }),
    worldY: 5.4,
  },
];

export function getStairFixture(id: string): StairFixture {
  const f = STAIR_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown stair fixture: ${id}`);
  return f;
}
