// produceBeam — pure-TS beam geometry producer (S12).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 line 1395.
// Beam = extrusion of a structural profile along an arbitrary
// horizontal baseline.  Shares `_shared/linear-structural.ts` with
// columns; the only delta is axis orientation.

import type { Beam as BeamData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { concatRaw } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import {
  buildLinearExtrusion,
  composeStructuralMaterialKey,
  type StructuralProfile,
} from './_shared/linear-structural.js';

export type BeamProducer = (
  beam: Readonly<BeamData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

const FALLBACK_COLOR = '#6f6f74';

export function composeBeamGeometryHash(b: BeamData, worldY: number): string {
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : '_');
  const [s, e] = b.baseLine;
  return [
    'beam:v1',
    b.id,
    b.shape,
    f(b.width),
    f(b.depth),
    f(b.rotation),
    f(s.x), f(s.y), f(s.z),
    f(e.x), f(e.y), f(e.z),
    b.materialId ?? '_',
    b.levelId,
    f(worldY),
  ].join('|');
}

export const produceBeam: BeamProducer = (beam, _joinData, worldY) => {
  const profile: StructuralProfile = {
    shape: beam.shape,
    width: beam.width,
    depth: beam.depth,
  };
  const [s, e] = beam.baseLine;
  const matKey = composeStructuralMaterialKey(
    'beam',
    '',
    beam.materialId ?? '',
    FALLBACK_COLOR,
  );
  const parts = buildLinearExtrusion(
    profile,
    {
      start: { x: s.x, y: s.y + worldY, z: s.z },
      end: { x: e.x, y: e.y + worldY, z: e.z },
      rotation: beam.rotation,
    },
    matKey,
  );
  const concat = concatRaw(parts);
  return serializeDescriptor(concat, composeBeamGeometryHash(beam, worldY));
};
