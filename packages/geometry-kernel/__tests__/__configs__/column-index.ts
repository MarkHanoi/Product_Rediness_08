// Column fixture catalog — W-1C-2 parity promotion.
//
// 6 fixtures covering the `produceColumn` input matrix:
//   { rectangular, circular, i-section }
//   × { standard height, tall, with-base-offset, elevated-worldY }

import type { Column as ColumnData } from '@pryzm/schemas';

export interface ColumnFixture {
  readonly id: string;
  readonly description: string;
  readonly column: ColumnData;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };
const ULID_PAD = '01HZS000000000000COL';

function cid(name: string): ColumnData['id'] {
  const tail = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  return `column:${ULID_PAD}${tail}` as ColumnData['id'];
}

function baseColumn(overrides: Partial<ColumnData> & { id: ColumnData['id'] }): ColumnData {
  return {
    id: overrides.id,
    type: 'column' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    origin: { x: 0, y: 0, z: 0 },
    shape: 'rectangular' as const,
    width: 0.4,
    depth: 0.4,
    height: 3.0,
    rotation: 0,
    baseOffset: 0,
    ...overrides,
  } as ColumnData;
}

export const COLUMN_FIXTURES: readonly ColumnFixture[] = [
  {
    id: 'F01.rectangular-default',
    description: '0.4×0.4×3.0 m rectangular concrete column',
    column: baseColumn({ id: cid('F01'), shape: 'rectangular', width: 0.4, depth: 0.4, height: 3.0, origin: { x: 0, y: 0, z: 0 } }),
    worldY: 0,
  },
  {
    id: 'F02.rectangular-wide',
    description: '0.6×0.4×3.5 m rectangular column at offset origin',
    column: baseColumn({ id: cid('F02'), shape: 'rectangular', width: 0.6, depth: 0.4, height: 3.5, origin: { x: 5, y: 0, z: 5 } }),
    worldY: 0,
  },
  {
    id: 'F03.circular',
    description: '0.5 m diameter circular column, 4.0 m tall',
    column: baseColumn({ id: cid('F03'), shape: 'circular', width: 0.5, depth: 0.5, height: 4.0, origin: { x: 0, y: 0, z: 0 } }),
    worldY: 0,
  },
  {
    id: 'F04.i-section',
    description: '0.3×0.6×5.0 m steel I-section column',
    column: baseColumn({ id: cid('F04'), shape: 'i-section', width: 0.3, depth: 0.6, height: 5.0, origin: { x: 0, y: 0, z: 0 } }),
    worldY: 0,
  },
  {
    id: 'F05.with-base-offset',
    description: '0.4×0.4×3.0 m column with 150 mm base offset',
    column: baseColumn({ id: cid('F05'), shape: 'rectangular', width: 0.4, depth: 0.4, height: 3.0, baseOffset: 0.15, origin: { x: 0, y: 0, z: 0 } }),
    worldY: 0,
  },
  {
    id: 'F06.elevated-world-y',
    description: '0.4×0.4×3.0 m column at elevated worldY = 2.8 m',
    column: baseColumn({ id: cid('F06'), shape: 'rectangular', width: 0.4, depth: 0.4, height: 3.0, origin: { x: 0, y: 0, z: 0 } }),
    worldY: 2.8,
  },
];

export function getColumnFixture(id: string): ColumnFixture {
  const f = COLUMN_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown column fixture: ${id}`);
  return f;
}
