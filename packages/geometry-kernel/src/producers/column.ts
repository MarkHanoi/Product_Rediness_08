// produceColumn — pure-TS column geometry producer (S12).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 line 1387.
// Column = vertical extrusion of a structural profile from baseOffset
// up `height` metres.  Uses the shared `linear-structural` builder so
// columns and beams share the section-shape code.

import type { Column as ColumnData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { concatRaw } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import {
  buildLinearExtrusion,
  composeStructuralMaterialKey,
  type StructuralProfile,
} from './_shared/linear-structural.js';

export type ColumnProducer = (
  column: Readonly<ColumnData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

const FALLBACK_COLOR = '#7d7d82';

export function composeColumnGeometryHash(c: ColumnData, worldY: number): string {
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : '_');
  return [
    'column:v1',
    c.id,
    c.shape,
    f(c.width),
    f(c.depth),
    f(c.height),
    f(c.baseOffset),
    f(c.rotation),
    f(c.origin.x), f(c.origin.y), f(c.origin.z),
    c.materialId ?? '_',
    c.levelId,
    f(worldY),
  ].join('|');
}

export const produceColumn: ColumnProducer = (column, _joinData, worldY) => {
  const profile: StructuralProfile = {
    shape: column.shape,
    width: column.width,
    depth: column.depth,
  };
  const baseY = worldY + column.baseOffset;
  const topY = baseY + column.height;

  const matKey = composeStructuralMaterialKey(
    'column',
    '',
    column.materialId ?? '',
    FALLBACK_COLOR,
  );

  const parts = buildLinearExtrusion(
    profile,
    {
      start: { x: column.origin.x, y: baseY, z: column.origin.z },
      end: { x: column.origin.x, y: topY, z: column.origin.z },
      rotation: column.rotation,
    },
    matKey,
  );
  const concat = concatRaw(parts);
  return serializeDescriptor(concat, composeColumnGeometryHash(column, worldY));
};
