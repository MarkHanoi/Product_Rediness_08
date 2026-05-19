// MaterialKey — content-addressed material name emitted by producers.
//
// The kernel never instantiates a `THREE.Material` (P1 from
// `01-TARGET-ARCHITECTURE.md §0`).  Each draw group in a
// `BufferGeometryDescriptor` carries an integer `materialIndex` which
// indexes into `descriptor.materialKeys`; the committer (L3) resolves
// each `MaterialKey` to a pooled `THREE.Material` via `MaterialPool`
// (1A S05).
//
// Two walls that share the same `(systemTypeId, materialColor)` hash
// MUST produce the same `MaterialKey` so that `MaterialPool` can
// dedupe them across the scene.  See `composeMaterialKey` in
// `producers/_internal/composeMaterialKey.ts` for the canonical hash.

export type MaterialKey = string & { readonly __brand: 'MaterialKey' };

/**
 * Cast a plain string to a `MaterialKey`.  No validation beyond
 * non-empty — the contract is that the caller already produced the
 * string via a deterministic hash function (`composeMaterialKey`).
 */
export function asMaterialKey(s: string): MaterialKey {
  if (typeof s !== 'string' || s.length === 0) {
    throw new TypeError('MaterialKey must be a non-empty string');
  }
  return s as MaterialKey;
}
