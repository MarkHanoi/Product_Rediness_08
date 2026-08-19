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
// ⭐ C100 §9.6.a / S16 — THE resolution authority. Not re-implemented here.
import { resolveMaterialColorSlot } from './_internal/composeMaterialKey.js';
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
 *   `lighting|<kind>|<materialId>|<color>|<intensity>|<range>|<emergency>|<bodyColor>|body`
 *
 * The colour is hex-encoded so the standard
 * `colorOf<Family>MaterialKey(parts[3])` extractor still works for
 * non-emitter committer logic.
 *
 * ─── ⛔ THE DEFECT slot 7 CLOSES (C100 §2.1 / L-1127 S16) ───────────────────
 *
 * `materialId` has sat in slot 2 since this key was written and **nothing has
 * ever read it**. `colorOfLightingMaterialKey` returns slot 3 — and slot 3 is
 * `rgbToHex(l.color)`, **the colour of the light the fixture EMITS**, which the
 * bridge then applied to the fixture's `color` *and* its `emissive`.
 *
 * ⭐ So a luminaire's BODY was painted the colour of its own beam. A black
 * anodised downlight emitting 2700 K warm white rendered as a WARM WHITE object,
 * and naming `metal-aluminium-anodised-black` on it changed nothing. The two are
 * genuinely different physical quantities — one is what the fixture is MADE OF,
 * the other is what comes OUT of it — and the key had a slot for only one.
 *
 * ⚠ SLOT 7 IS APPENDED, NOT INSERTED, and that is deliberate. This file's own
 * §FEAT-FIXTURE-PHOTOMETRY note records that slot INDICES are a contract
 * (*"slot indices are unchanged, so `colorOfLightingMaterialKey` (slot 3) is
 * unaffected"*). Indices 0–6 are therefore byte-identical, the key still ends
 * `|body`, and every existing reader keeps its meaning. A key with fewer than 9
 * parts is a legacy key and the bridge answers it exactly as before.
 *
 * ⚠ AND THE SLOT IS EMPTY WHEN NO MATERIAL IS NAMED — not filled with the light
 * colour "for symmetry". An empty slot means *"this fixture names no material"*,
 * which is what lets the bridge reproduce today's answer for every existing
 * fixture (C100 §9.6.b) instead of guessing at one.
 */
export function composeLightingMaterialKey(l: Lighting): string {
  const color = rgbToHex(l.color);
  // ⭐ ONE ladder (C100 §9.6.a). Empty when the fixture names no material; an
  // unknown id becomes `unresolved:<id>`, which the bridge paints MAGENTA (§5).
  const bodyColor = l.materialId
    ? resolveMaterialColorSlot({ materialId: l.materialId }, '')
    : '';
  // §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) — the emission slot now carries the
  // REAL photometry (lumens @ kelvin) rather than the derived renderer scalar.
  // `intensity` became an optional explicit override on the schema, so an
  // absent value must not crash the key; when present it still participates so
  // an overridden fixture gets its own material.
  const emission = `${l.lumens.toFixed(1)}@${l.kelvin.toFixed(0)}` +
    (typeof l.intensity === 'number' ? `!${l.intensity.toFixed(4)}` : '');
  return `lighting|${l.kind}|${l.materialId ?? ''}|${color}|${emission}|${l.range.toFixed(4)}|${l.isEmergency ? '1' : '0'}|${bodyColor}|body`;
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
