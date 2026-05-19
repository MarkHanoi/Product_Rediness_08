// produceStructural — second-tier structural producer (S26 / ADR-0023).
//
// Sub-types:
//   - `brace`            — linear member origin → origin+endOffset, circular profile (radius)
//   - `footing`           — short rectangular pad: width × depth × thickness
//   - `foundation-slab`  — thick rectangular pad below grade (same shape, larger thickness)
//   - `connection`        — small circular node (radius × thickness)
//
// Pure-TS (no THREE).  Uses `buildLinearExtrusion` for every shape so
// the cross-section dispatcher remains the canonical place that
// converts (shape, width, depth) → vertex polygon.

import type { Structural } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import {
  buildLinearExtrusion,
  type StructuralProfile,
} from './_shared/linear-structural.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import {
  composeStructuralGeometryHash,
  STRUCTURAL_HASH_SCHEMA_VERSION,
} from './_internal/composeStructuralGeometryHash.js';

export type StructuralProducer = (
  s: Readonly<Structural>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

const FALLBACK_COLORS: Record<Structural['kind'], string> = {
  'brace': '#5a6470',
  'footing': '#8a8276',
  'foundation-slab': '#7a716a',
  'connection': '#3d4554',
};

function matKey(kind: Structural['kind'], materialId: string | undefined): string {
  return `structural|${kind}|${materialId ?? ''}|${FALLBACK_COLORS[kind]}|body`;
}

export const produceStructural: StructuralProducer = (s, _joinData, worldY) => {
  const baseY = worldY + s.baseOffset;
  const key = asMaterialKey(matKey(s.kind, s.materialId));

  let parts: readonly RawGroup[];

  if (s.kind === 'brace') {
    const profile: StructuralProfile = {
      shape: 'circular',
      width: s.radius * 2,
      depth: s.radius * 2,
    };
    parts = buildLinearExtrusion(
      profile,
      {
        start: { x: s.origin.x, y: baseY + s.origin.y, z: s.origin.z },
        end: {
          x: s.origin.x + s.endOffset.x,
          y: baseY + s.origin.y + s.endOffset.y,
          z: s.origin.z + s.endOffset.z,
        },
        rotation: s.rotation,
      },
      key,
    );
  } else if (s.kind === 'connection') {
    const profile: StructuralProfile = {
      shape: 'circular',
      width: s.radius * 2,
      depth: s.radius * 2,
    };
    parts = buildLinearExtrusion(
      profile,
      {
        start: { x: s.origin.x, y: baseY + s.origin.y - s.thickness / 2, z: s.origin.z },
        end:   { x: s.origin.x, y: baseY + s.origin.y + s.thickness / 2, z: s.origin.z },
        rotation: s.rotation,
      },
      key,
    );
  } else {
    // footing / foundation-slab — vertical rectangular extrusion.
    const profile: StructuralProfile = {
      shape: 'rectangular',
      width: s.width,
      depth: s.depth,
    };
    parts = buildLinearExtrusion(
      profile,
      {
        start: { x: s.origin.x, y: baseY + s.origin.y, z: s.origin.z },
        end:   { x: s.origin.x, y: baseY + s.origin.y + s.thickness, z: s.origin.z },
        rotation: s.rotation,
      },
      key,
    );
  }

  const concat = concatRaw(parts);
  return serializeDescriptor(concat, composeStructuralGeometryHash(s, worldY));
};

export { STRUCTURAL_HASH_SCHEMA_VERSION };
