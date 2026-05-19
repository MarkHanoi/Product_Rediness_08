// material-bridge — `MaterialKey` → `THREE.MeshStandardMaterial` factory.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09 blocker-row 1:
//   "100 walls of the same system-type should share 1 material" via
//   `MaterialPool.acquire(materialHash)`.
//
// The `MaterialKey` emitted by the kernel is a pipe-separated string:
//   `wall|<systemTypeId>|<materialId>|<color>|<layerName>`
// (see `composeMaterialKey` in
// `packages/geometry-kernel/src/producers/_internal/composeMaterialKey.ts`).
// We split on `|`, take the colour slot, and instantiate a
// `MeshStandardMaterial` with that colour.  `MaterialPool` keys on the
// raw key string so dedupe is exact: identical keys collapse to one
// Material instance pool-wide.
//
// `WallFragmentBuilder.ts:572-573` is the PRYZM 1 reference — the
// canonical wall material is `MeshStandardMaterial` with `roughness:
// 0.85`, `metalness: 0.05`.  We carry those values verbatim so the
// visual-diff gate vs PRYZM 1 lands within the 5-px budget.

import * as THREE from '@pryzm/renderer-three/three';

const PRYZM1_WALL_ROUGHNESS = 0.85;
const PRYZM1_WALL_METALNESS = 0.05;
const FALLBACK_COLOR = '#d4c5b0';

/** Parse the colour slot out of a kernel-emitted MaterialKey.  Returns
 *  `FALLBACK_COLOR` when the key is not in the expected wall format —
 *  defensive (the kernel always emits the same shape today, but we
 *  don't want a malformed key to crash the committer). */
export function colorOfWallMaterialKey(key: string): string {
  // wall | systemTypeId | materialId | color | layerName
  const parts = key.split('|');
  if (parts.length < 5 || parts[0] !== 'wall') return FALLBACK_COLOR;
  const col = parts[3];
  return col && col.length > 0 ? col : FALLBACK_COLOR;
}

/** Factory the WallCommitter passes to `MaterialPool.acquire(key, factory)`.
 *  Runs ONCE per pool lifetime per unique key — subsequent acquires
 *  reuse the cached Material and bump the ref count. */
export function makeWallMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfWallMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: PRYZM1_WALL_ROUGHNESS,
      metalness: PRYZM1_WALL_METALNESS,
      side: THREE.DoubleSide,
    });
}
