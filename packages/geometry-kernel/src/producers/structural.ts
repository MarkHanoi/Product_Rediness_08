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
// ⭐ C100 §9.6.a / S16 — THE resolution authority. Not re-implemented here.
import { resolveMaterialColorSlot } from './_internal/composeMaterialKey.js';
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

/**
 * Material key shape:
 *   `structural|<kind>|<materialId>|<color>|body`
 *
 * ─── ⛔ THE DEFECT THIS CLOSES (C100 §2.1 / L-1127 S16) ─────────────────────
 *
 * `materialId` arrived as a PARAMETER of this function, was written into slot 2,
 * and was then IGNORED when computing slot 3 — which is the slot
 * `colorOfStructuralMaterialKey` actually reads. Slot 3 was always
 * `FALLBACK_COLORS[kind]`, a colour derived from the element's KIND.
 *
 * ⭐ So a steel brace and a timber brace were the same colour, and a C30 concrete
 * footing and a mass-concrete footing were the same colour. For STRUCTURE — where
 * "what is this made of" is close to the whole point of the element — the model
 * answered with a shape category. And the id was RIGHT THERE, one slot over,
 * having been passed in deliberately.
 *
 * ⚠ THE KIND COLOURS SURVIVE as the family default (C100 §9.6.b): they are the
 * correct answer for an element that names no material, which is every structural
 * element in every existing project. Only their RANK is now stated — C100 §2.1
 * puts an explicit `materialId` above a default.
 */
function matKey(kind: Structural['kind'], materialId: string | undefined): string {
  // ⭐ ONE ladder (C100 §9.6.a). An unknown id becomes `unresolved:<id>`, which the
  // bridge paints MAGENTA (§5) rather than a plausible structural grey.
  const color = resolveMaterialColorSlot({ materialId }, FALLBACK_COLORS[kind]);
  return `structural|${kind}|${materialId ?? ''}|${color}|body`;
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
