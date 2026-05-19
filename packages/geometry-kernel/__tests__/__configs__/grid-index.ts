// Grid fixture catalog — W-1C-2 parity promotion.
//
// 8 fixtures covering the `produceGrid` input matrix:
//   { empty, single-linear, 2×2 orthogonal, 5×4 office }
//   × { arc, mixed linear+arc, rotated, elevated-worldY }

import type { Grid as GridData } from '@pryzm/schemas';
import type { JoinData } from '../../src/types/JoinData.js';

export interface GridFixture {
  readonly id: string;
  readonly description: string;
  readonly grid: GridData;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };
const ULID_PAD = '01HZS000000000000GRD';

function gid(name: string): GridData['id'] {
  const tail = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  return `grid:${ULID_PAD}${tail}` as GridData['id'];
}

function baseGrid(overrides: Partial<GridData> & { id: GridData['id'] }): GridData {
  return {
    id: overrides.id,
    type: 'grid' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    rotation: 0,
    lines: [],
    ...overrides,
  } as GridData;
}

export const GRID_FIXTURES: readonly GridFixture[] = [
  {
    id: 'F01.empty-grid',
    description: 'empty grid (no lines — degenerate output)',
    grid: baseGrid({ id: gid('F01'), lines: [] }),
    worldY: 0,
  },
  {
    id: 'F02.single-linear-h',
    description: 'single horizontal linear axis',
    grid: baseGrid({ id: gid('F02'), lines: [{ id: 'h1', label: '1', kind: 'linear', start: { x: 0, y: 0, z: 5 }, end: { x: 10, y: 0, z: 5 } }] }),
    worldY: 0,
  },
  {
    id: 'F03.2x2-orthogonal',
    description: '2 vertical + 2 horizontal axes (2×2 grid)',
    grid: baseGrid({
      id: gid('F03'),
      lines: [
        { id: 'v1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 8 } },
        { id: 'v2', label: 'B', kind: 'linear', start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 8 } },
        { id: 'h1', label: '1', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
        { id: 'h2', label: '2', kind: 'linear', start: { x: 0, y: 0, z: 8 }, end: { x: 5, y: 0, z: 8 } },
      ],
    }),
    worldY: 0,
  },
  {
    id: 'F04.5x4-office',
    description: '5 columns × 4 rows office structural grid',
    grid: baseGrid({
      id: gid('F04'),
      lines: [
        ...([0, 2.5, 5, 7.5, 10] as number[]).map((x, i) => ({
          id: `v${i}`, label: String.fromCharCode(65 + i),
          kind: 'linear' as const, start: { x, y: 0, z: 0 }, end: { x, y: 0, z: 8 },
        })),
        ...([0, 2, 4, 6] as number[]).map((z, i) => ({
          id: `h${i}`, label: `${i + 1}`,
          kind: 'linear' as const, start: { x: 0, y: 0, z }, end: { x: 10, y: 0, z },
        })),
      ],
    }),
    worldY: 0,
  },
  {
    id: 'F05.single-arc',
    description: 'single radial arc grid line',
    grid: baseGrid({
      id: gid('F05'),
      lines: [{ id: 'a1', label: 'R1', kind: 'arc', start: { x: -5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 }, radius: 6 }],
    }),
    worldY: 0,
  },
  {
    id: 'F06.mixed-linear-arc',
    description: 'mixed linear + arc axes',
    grid: baseGrid({
      id: gid('F06'),
      lines: [
        { id: 'l1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 0 } },
        { id: 'l2', label: 'B', kind: 'linear', start: { x: 0, y: 0, z: 4 }, end: { x: 6, y: 0, z: 4 } },
        { id: 'a1', label: '1', kind: 'arc', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 4 }, radius: 3 },
        { id: 'a2', label: '2', kind: 'arc', start: { x: 6, y: 0, z: 0 }, end: { x: 6, y: 0, z: 4 }, radius: 3 },
      ],
    }),
    worldY: 0,
  },
  {
    id: 'F07.rotated-30deg',
    description: 'grid rotated 30° about Y',
    grid: baseGrid({
      id: gid('F07'),
      rotation: Math.PI / 6,
      lines: [
        { id: 'v1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 6 } },
        { id: 'h1', label: '1', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 0 } },
      ],
    }),
    worldY: 0,
  },
  {
    id: 'F08.elevated-world-y',
    description: 'grid at elevated worldY = 3.0 m',
    grid: baseGrid({
      id: gid('F08'),
      lines: [
        { id: 'v1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 6 } },
      ],
    }),
    worldY: 3.0,
  },
];

export function getGridFixture(id: string): GridFixture {
  const f = GRID_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown grid fixture: ${id}`);
  return f;
}
