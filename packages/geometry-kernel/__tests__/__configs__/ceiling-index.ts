// Ceiling fixture catalog (S14-T8).  Covering set:
//   { 4-pt rect, 6-pt L-shape, 5-pt pentagon, 4-pt above-grade }
//   per `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.

import type { Ceiling } from '@pryzm/protocol';

export interface CeilingFixture {
  readonly id: string;
  readonly description: string;
  readonly ceiling: Ceiling;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };

function baseCeiling(overrides: Partial<Ceiling> & { id: string }): Ceiling {
  return {
    id: overrides.id,
    type: 'ceiling' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 3 },
      { x: 0, y: 0, z: 3 },
    ],
    ceilingHeight: 2.7,
    thickness: 0.05,
    ...overrides,
  } as Ceiling;
}

export const CEILING_FIXTURES: readonly CeilingFixture[] = [
  {
    id: 'rect-residential',
    description: 'residential 4×3 plaster ceiling, 2.4 m height',
    ceiling: baseCeiling({
      id: 'ceiling:rect-res',
      ceilingHeight: 2.4,
      thickness: 0.012,
      materialId: 'plaster.painted',
      materialColor: '#f5f5f5',
    }),
    worldY: 0,
  },
  {
    id: 'l-shape-office',
    description: 'L-shape office ceiling, 6×6 m envelope, 2.7 m commercial gypsum',
    ceiling: baseCeiling({
      id: 'ceiling:lsh-off',
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 6, y: 0, z: 0 },
        { x: 6, y: 0, z: 3 },
        { x: 3, y: 0, z: 3 },
        { x: 3, y: 0, z: 6 },
        { x: 0, y: 0, z: 6 },
      ],
      ceilingHeight: 2.7,
      thickness: 0.015,
      materialId: 'gypsum.standard',
      materialColor: '#ebebe8',
    }),
    worldY: 0,
  },
  {
    id: 'pentagon-acoustic',
    description: 'pentagonal acoustic-tile ceiling',
    ceiling: baseCeiling({
      id: 'ceiling:pent-aco',
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 5, y: 0, z: 2 },
        { x: 2, y: 0, z: 4 },
        { x: -1, y: 0, z: 2 },
      ],
      ceilingHeight: 2.7,
      thickness: 0.020,
      materialId: 'acoustic.tile',
      materialColor: '#e2e2dd',
    }),
    worldY: 0,
  },
  {
    id: 'rect-second-floor',
    description: 'rectangular ceiling on level 2, residential plaster',
    ceiling: baseCeiling({
      id: 'ceiling:rect-l2',
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
        { x: 5, y: 0, z: 4 },
        { x: 0, y: 0, z: 4 },
      ],
      ceilingHeight: 2.4,
      thickness: 0.012,
      materialId: 'plaster.painted',
      materialColor: '#f5f5f5',
    }),
    worldY: 5.4,
  },
  // ── W-1C-4 top-up: 2 additional fixtures (4 → 6) ──────────────────────
  {
    id: 'l-shape-second-floor',
    description: 'L-shape ceiling on level 2, commercial gypsum',
    ceiling: baseCeiling({
      id: 'ceiling:lsh-l2',
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
        { x: 5, y: 0, z: 3 },
        { x: 3, y: 0, z: 3 },
        { x: 3, y: 0, z: 6 },
        { x: 0, y: 0, z: 6 },
      ],
      ceilingHeight: 2.7,
      thickness: 0.015,
      materialId: 'gypsum.standard',
      materialColor: '#ebebe8',
    }),
    worldY: 5.4,
  },
  {
    id: 'pentagon-residential',
    description: 'pentagonal residential ceiling with plaster finish',
    ceiling: baseCeiling({
      id: 'ceiling:pent-res',
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 4, y: 0, z: 1.5 },
        { x: 1.5, y: 0, z: 3 },
        { x: -1, y: 0, z: 1.5 },
      ],
      ceilingHeight: 2.4,
      thickness: 0.012,
      materialId: 'plaster.painted',
      materialColor: '#f5f5f5',
    }),
    worldY: 0,
  },
];

export function getCeilingFixture(id: string): CeilingFixture {
  const f = CEILING_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown ceiling fixture: ${id}`);
  return f;
}
