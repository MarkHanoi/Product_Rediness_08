// produceStair — pure-TS stair geometry producer (S14-T2).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.
// Stair is a multi-flight assembly: each tread is a thin horizontal
// box, each riser a thin vertical box.  Material slots: 'tread' +
// 'riser'.  Two-flight shapes ('l-shape', 'u-shape') split numRisers
// in half with a landing tread between them.  Spiral falls back to
// straight for v1 (carried into S15+ — see plugin README).
//
// Producer signature follows ADR-009: `(dto, joinData, worldY)`.
// Stair does not currently consume `joinData`; the slot is preserved
// so the L4 producer registry dispatches uniformly across families.

import type { Stair as StairData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { resolveMaterialColorSlot } from './_internal/composeMaterialKey.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { composeStairGeometryHash } from './_internal/stair/composeStairGeometryHash.js';
import { makeBoxGroup } from './_internal/stair/treadPrism.js';

export type StairProducer = (
  stair: Readonly<StairData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

const TREAD_THICKNESS_M = 0.04;
const RISER_THICKNESS_M = 0.02;
const _TREAD_FALLBACK_COLOR = '#b58a5e';
const _RISER_FALLBACK_COLOR = '#9a7a52';
void _TREAD_FALLBACK_COLOR;
void _RISER_FALLBACK_COLOR;

/**
 * The stair's family defaults, per slot — the colour of a stair naming NO
 * material (C100 §9.6.b: the DEFAULT stays local, the RESOLUTION is shared).
 * These two hexes are NOT new: they are `plugins/stair`'s existing
 * `TREAD_FALLBACK` / `RISER_FALLBACK`, moved UPSTREAM of the key so an
 * unmaterialled stair renders identically before and after.
 */
const STAIR_DEFAULT_BY_SLOT: Readonly<Record<'tread' | 'riser', string>> = Object.freeze({
  tread: '#b58a5e',
  riser: '#9a7a52',
});

/**
 * ⭐ C100 §9.6.b / S16 — the stair's colour slot now goes through THE master
 * resolver, and until this change THERE WAS NO COLOUR SLOT AT ALL.
 *
 * ⛔ WHAT WAS WRONG. The key was `stair|<materialId>|<slot>` — three fields,
 * none of them a colour — and `plugins/stair`'s bridge answered:
 *
 *     return slotOfStairMaterialKey(key) === 'riser' ? RISER_FALLBACK : TREAD_FALLBACK;
 *
 * i.e. the colour was a function of the SLOT and nothing else. The `materialId`
 * was carried the whole way and **never read by anybody**, so every stair in the
 * product was the same two browns regardless of what the architect chose. S14
 * had just made those ids resolvable (`wood.oak` → `wood-oak`); this makes the
 * resolution actually reach a pixel.
 *
 * ⚠ THE KEY LAYOUT CHANGES HERE, and that is a deliberate exception to C100
 * §9.6.b's "converge the VALUE, not the FORMAT". The rule presumes a colour slot
 * exists to converge; stair's did not, so one is inserted at index 2 and the slot
 * moves to index 3 — matching ceiling, wall and every other family. The bridge is
 * updated in the SAME commit; nothing else parses this key
 * (`grep colorOfStairMaterialKey slotOfStairMaterialKey` → the bridge and two
 * barrel re-exports, nothing more).
 */
function composeStairMaterialKey(
  input: { readonly materialId?: string | undefined; readonly materialColor?: string | undefined },
  slot: 'tread' | 'riser',
): MaterialKey {
  const colour = resolveMaterialColorSlot(input, STAIR_DEFAULT_BY_SLOT[slot]);
  return asMaterialKey(`stair|${input.materialId ?? 'default'}|${colour}|${slot}`);
}

interface StepCenter {
  /** Centre X of the tread top face (world). */
  readonly x: number;
  /** Top-of-tread Y (world). */
  readonly topY: number;
  /** Centre Z of the tread top face (world). */
  readonly z: number;
  /** Yaw (radians about Y) — direction the tread is pointing. */
  readonly yaw: number;
}

/**
 * Compute the world-space centre + heading of every tread for a stair.
 *
 * For 'l-shape' / 'u-shape', the run is split into two collinear
 * flights joined by a landing tread; the second flight is rotated by
 * +90° (l-shape) or +180° (u-shape) about the landing centre.
 *
 * Coordinate convention (BEFORE the stair's overall `rotation`):
 *   • Bottom of stair sits at `origin`.
 *   • First flight runs in the +Z direction.
 *   • Width is along ±X, centred on the first-flight's spine.
 */
function planSteps(s: StairData): StepCenter[] {
  const halfTread = s.treadDepth / 2;
  const flightSign1 = 1; // +Z
  const yaw1 = 0;

  // First-flight tread count (~half the risers, leaving the rest +
  // landing for the second flight when applicable).
  let n1: number;
  if (s.shape === 'straight' || s.shape === 'spiral') {
    n1 = s.numRisers; // single-flight
  } else {
    n1 = Math.max(2, Math.floor(s.numRisers / 2));
  }
  const n2 = s.numRisers - n1; // 0 for straight; else the rest

  const out: StepCenter[] = [];
  // First flight — tread i is at z = (i + 0.5) × treadDepth, top y =
  // (i + 1) × riserHeight (riser raises BEFORE its tread).
  for (let i = 0; i < n1; i++) {
    out.push({
      x: 0,
      topY: (i + 1) * s.riserHeight,
      z: (i + 0.5) * s.treadDepth * flightSign1,
      yaw: yaw1,
    });
  }

  if (n2 === 0) return out;

  // Landing centre = end of flight 1.
  const landingCx = 0;
  const landingCz = n1 * s.treadDepth + halfTread;
  const landingTopY = (n1 + 1) * s.riserHeight;
  const yaw2 = s.shape === 'l-shape' ? Math.PI / 2 : Math.PI;

  // Second-flight treads: spaced along the new heading from the
  // landing.  Use a rotation matrix about Y by yaw2.
  const cos2 = Math.cos(yaw2);
  const sin2 = Math.sin(yaw2);
  for (let j = 0; j < n2; j++) {
    const dz = (j + 1.5) * s.treadDepth; // skip the landing tread itself
    // Local offset (0, dz) from landing centre, rotated by yaw2.
    const lx = -dz * sin2 + 0 * cos2;   // sin/cos for +Z direction rotated by yaw2
    const lz = dz * cos2 + 0 * sin2;
    out.push({
      x: landingCx + lx,
      topY: landingTopY + (j + 1) * s.riserHeight,
      z: landingCz + lz,
      yaw: yaw2,
    });
  }
  return out;
}

export const produceStair: StairProducer = (stair, _joinData, worldY) => {
  if (stair.numRisers < 2) {
    throw new DescriptorInvariantError(
      `[produceStair] numRisers must be ≥ 2; got ${stair.numRisers}`,
    );
  }

  const matInput = {
    materialId: (stair as { materialId?: string }).materialId,
    materialColor: (stair as { materialColor?: string }).materialColor,
  };
  const treadKey = composeStairMaterialKey(matInput, 'tread');
  const riserKey = composeStairMaterialKey(matInput, 'riser');

  const steps = planSteps(stair);
  const halfTread = stair.treadDepth / 2;
  const halfWidth = stair.width / 2;
  const halfRiser = stair.riserHeight / 2;

  const groups: RawGroup[] = [];

  const cos = Math.cos(stair.rotation);
  const sin = Math.sin(stair.rotation);

  for (const step of steps) {
    // Apply outer stair rotation about origin Y to the step centre.
    const wx = stair.origin.x + (step.x * cos + step.z * sin);
    const wz = stair.origin.z + (-step.x * sin + step.z * cos);
    const wy = worldY + stair.origin.y + step.topY - TREAD_THICKNESS_M / 2;
    const treadYaw = stair.rotation + step.yaw;

    // Tread = thin box on top.
    groups.push(makeBoxGroup({
      cx: wx, cy: wy, cz: wz,
      hx: halfWidth, hy: TREAD_THICKNESS_M / 2, hz: halfTread,
      rotY: treadYaw,
      materialKey: treadKey,
    }));

    // Riser = thin vertical box at the BACK of the tread (the side the
    // stair came up from).  Backward direction in world XZ for the
    // tread's heading (treadYaw) is (-sin, -cos)·halfTread.
    const tcos = Math.cos(treadYaw);
    const tsin = Math.sin(treadYaw);
    const riserWx = wx + (-tsin) * halfTread;
    const riserWz = wz + (-tcos) * halfTread;
    const riserWy = worldY + stair.origin.y + step.topY - halfRiser;
    groups.push(makeBoxGroup({
      cx: riserWx, cy: riserWy, cz: riserWz,
      hx: halfWidth, hy: halfRiser, hz: RISER_THICKNESS_M / 2,
      rotY: treadYaw,
      materialKey: riserKey,
    }));
  }

  const concat = concatRaw(groups);
  return serializeDescriptor(concat, composeStairGeometryHash(stair));
};
