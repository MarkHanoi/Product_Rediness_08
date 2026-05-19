// produceLighting — lighting fixture body geometry (S26 / ADR-0023).
//
// The kernel emits the *visible fixture body* only.  The lighting
// committer is responsible for attaching the actual `THREE.PointLight`
// (or RectAreaLight for `strip`) using the parameters carried in the
// material key.
//
// Sub-types share a small extruded body; `kind` only changes the
// extrusion axis and aspect ratio:
//
//   - `downlight`     — small disc set into ceiling
//   - `pendant`       — disc + drop-line offset (drop modelled as Y shift)
//   - `strip`         — long rectangular body
//   - `wall-sconce`   — small box mounted against a wall
//   - `emergency`     — same body as downlight, isEmergency = true
//
// All variants are vertical extrusions of (width × depth) × thickness
// at (origin + dropLength downward).  The committer converts the
// material key into the emitter parameters.

import type { Lighting } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { concatRaw } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import {
  buildLinearExtrusion,
  type StructuralProfile,
} from './_shared/linear-structural.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import {
  composeLightingGeometryHash,
  LIGHTING_HASH_SCHEMA_VERSION,
} from './_internal/composeLightingGeometryHash.js';

export type LightingProducer = (
  l: Readonly<Lighting>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

function rgbToHex(c: readonly [number, number, number]): string {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * 255))).toString(16).padStart(2, '0');
  const g = Math.max(0, Math.min(255, Math.round(c[1] * 255))).toString(16).padStart(2, '0');
  const b = Math.max(0, Math.min(255, Math.round(c[2] * 255))).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/**
 * Emitter parameters travel inside the material key so the committer
 * can rebuild the `THREE.PointLight` / `RectAreaLight` deterministically:
 *
 *   `lighting|<kind>|<materialId>|<color>|<intensity>|<range>|<emergency>|body`
 *
 * The colour is hex-encoded so the standard
 * `colorOf<Family>MaterialKey(parts[3])` extractor still works for
 * non-emitter committer logic.
 */
export function composeLightingMaterialKey(l: Lighting): string {
  const color = rgbToHex(l.color);
  return `lighting|${l.kind}|${l.materialId ?? ''}|${color}|${l.intensity.toFixed(4)}|${l.range.toFixed(4)}|${l.isEmergency ? '1' : '0'}|body`;
}

export const produceLighting: LightingProducer = (l, _joinData, worldY) => {
  const baseY = worldY + l.origin.y - l.dropLength;
  const profile: StructuralProfile = {
    shape: l.kind === 'downlight' || l.kind === 'emergency' ? 'circular' : 'rectangular',
    width: l.width,
    depth: l.depth,
  };

  const key = asMaterialKey(composeLightingMaterialKey(l));
  const parts = buildLinearExtrusion(
    profile,
    {
      start: { x: l.origin.x, y: baseY,                z: l.origin.z },
      end:   { x: l.origin.x, y: baseY + l.thickness,  z: l.origin.z },
      rotation: l.rotation,
    },
    key,
  );

  const concat = concatRaw(parts);
  return serializeDescriptor(concat, composeLightingGeometryHash(l, worldY));
};

export { LIGHTING_HASH_SCHEMA_VERSION };
