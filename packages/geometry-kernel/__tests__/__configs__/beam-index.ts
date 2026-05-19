// Beam fixture catalog — W-1C-2 parity promotion.
//
// 6 fixtures covering the `produceBeam` input matrix:
//   { rectangular, circular, i-section }
//   × { standard span, long span, rotated, diagonal, elevated-worldY }

import type { Beam as BeamData } from '@pryzm/schemas';

export interface BeamFixture {
  readonly id: string;
  readonly description: string;
  readonly beam: BeamData;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };
const ULID_PAD = '01HZS000000000000BEM';

function bid(name: string): BeamData['id'] {
  const tail = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  return `beam:${ULID_PAD}${tail}` as BeamData['id'];
}

function baseBeam(overrides: Partial<BeamData> & { id: BeamData['id'] }): BeamData {
  return {
    id: overrides.id,
    type: 'beam' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    shape: 'rectangular' as const,
    width: 0.2,
    depth: 0.4,
    rotation: 0,
    ...overrides,
  } as BeamData;
}

export const BEAM_FIXTURES: readonly BeamFixture[] = [
  {
    id: 'F01.rectangular-4m',
    description: '0.2×0.4 rectangular beam, 4 m span along X',
    beam: baseBeam({ id: bid('F01'), baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }], shape: 'rectangular', width: 0.2, depth: 0.4 }),
    worldY: 0,
  },
  {
    id: 'F02.rectangular-8m-wide',
    description: '0.3×0.6 rectangular beam, 8 m long span',
    beam: baseBeam({ id: bid('F02'), baseLine: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }], shape: 'rectangular', width: 0.3, depth: 0.6 }),
    worldY: 0,
  },
  {
    id: 'F03.circular-diagonal',
    description: '0.3 m circular beam along a diagonal baseline',
    beam: baseBeam({ id: bid('F03'), baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }], shape: 'circular', width: 0.3, depth: 0.3 }),
    worldY: 0,
  },
  {
    id: 'F04.i-section-6m',
    description: '0.2×0.6 steel I-section beam, 6 m span',
    beam: baseBeam({ id: bid('F04'), baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }], shape: 'i-section', width: 0.2, depth: 0.6 }),
    worldY: 0,
  },
  {
    id: 'F05.rotated-90deg',
    description: '0.2×0.4 beam along Z axis (rotated 90° in plan)',
    beam: baseBeam({ id: bid('F05'), baseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 }], shape: 'rectangular', width: 0.2, depth: 0.4 }),
    worldY: 0,
  },
  {
    id: 'F06.elevated-world-y',
    description: '0.2×0.4 beam at elevated worldY = 3.0 m',
    beam: baseBeam({ id: bid('F06'), baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }], shape: 'rectangular', width: 0.2, depth: 0.4 }),
    worldY: 3.0,
  },
];

export function getBeamFixture(id: string): BeamFixture {
  const f = BEAM_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown beam fixture: ${id}`);
  return f;
}
