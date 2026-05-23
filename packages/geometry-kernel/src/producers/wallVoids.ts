// produceWallWithVoids — subtract each opening box from a wall solid, in order,
// yielding ONE manifold descriptor with clean voids (no abutting segment seams).
//
// SPEC-WALL-SINGLE-VOLUME-CSG §2.1 / phase 2 (#96). A wall-with-opening today is
// emitted as ~3 abutting box volumes (before-opening / lintel / sill / after),
// whose coplanar shared faces show as division lines in 3D and IFC. The
// BIM-correct model is one solid minus one void box per opening.
//
// This is the PURE kernel core: descriptor → descriptor, async (KernelCSG
// lazy-loads the manifold-3d WASM). It is intentionally NOT wired into
// WallFragmentBuilder / LayeredWallOpeningBuilder — that is phase 3, which routes
// the booled descriptor on the async path behind a feature flag with the
// segmented mesh as a fallback (SPEC §3.3 / §4). Shipping the helper + its tests
// first lets the boolean be validated in isolation without touching the working
// render path.
//
// MATERIAL: produceBoolean collapses its result to a SINGLE material group, so
// this helper operates on a single-material solid (a plain wall, or ONE layer of
// a layered wall). Layered walls subtract per layer (SPEC §2.1) and concatenate
// the per-layer results — that composition is the builder's job, not this helper.
//
// L4 PURE — no THREE, no DOM, no Node primitives (only the kernel's sanctioned
// lazy manifold-3d import, inside produceBoolean).

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { MaterialKey } from '../types/MaterialKey.js';
import { produceBoolean } from './boolean.js';

export interface WallVoidsOptions {
  /**
   * Material key for the booled result. Defaults to the wall solid's first
   * material key (so the cut wall keeps its material), else produceBoolean's
   * 'boolean|default'.
   */
  readonly material?: MaterialKey;
}

/**
 * Subtract `openingBoxes` from `wallSolid`, one after another, returning a single
 * descriptor. With no openings the wall solid is returned unchanged (it is
 * already one volume).
 *
 * If an intermediate subtract empties the solid (a degenerate opening that
 * swallows the wall), the loop stops early and returns the empty descriptor —
 * KernelCSG cannot lift an empty operand, and the caller is expected to validate
 * the result (`index.length > 0`) and fall back to the segmented path rather than
 * ship an empty wall (SPEC §4).
 */
export async function produceWallWithVoids(
  wallSolid: BufferGeometryDescriptor,
  openingBoxes: readonly BufferGeometryDescriptor[],
  options: WallVoidsOptions = {},
): Promise<BufferGeometryDescriptor> {
  if (!wallSolid) {
    throw new DescriptorInvariantError('produceWallWithVoids: wallSolid required.');
  }
  if (!openingBoxes || openingBoxes.length === 0) {
    return wallSolid;
  }

  const material = options.material ?? wallSolid.materialKeys?.[0];
  const boolOpts = material ? { material } : {};

  let result = wallSolid;
  for (const box of openingBoxes) {
    if (!box) continue;
    // An emptied solid cannot be a CSG operand again — bail so the caller can
    // detect the empty result and fall back (SPEC §4); never feed empty in.
    if (result.index.length === 0) break;
    result = await produceBoolean('subtract', result, box, boolOpts);
  }
  return result;
}
