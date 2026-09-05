// material-bridge — component `MaterialKey` → a pooled `THREE.Material` factory.
// §COMPONENT-RENDER (audit §12 Phase 4E) · C100 §5 · C84 EI-6.
//
// ─── ⛔ WHAT THIS FILE REFUSES TO DO ──────────────────────────────────────────
// It does NOT hash an id into a palette. `plugins/furniture`'s bridge did exactly
// that for months: 205 master materials through a djb2 modulo an EIGHT-entry
// palette, so oak and walnut painted the same grey-teal and — because a hash is
// stable — the wrong colour came back identically every session and read as a
// design decision. C100 §5 is the rule that came out of it and it is followed
// here from the first commit rather than retrofitted.
//
// ─── ⚠ WHAT IS DECLARED ABSENT (C84 EI-6) ────────────────────────────────────
// THE COMPONENT FAMILY HAS NO MATERIAL LADDER. `Component.materialId` exists in
// the L0 schema, is optional, and NOTHING resolves it — not this file, not the
// bake, not a catalogue. Today `produceExtrude` emits exactly one key,
// `'extrude|default'`, for every solid it builds, and that is what arrives here.
//
// So this bridge answers two keys and no more:
//   • a key carrying C100 §5's `unresolved:` marker  → MAGENTA, always;
//   • anything else                                   → the kernel's DEFAULT grey.
//
// ⛔ The default grey is NOT a resolved material and must never be described as
//    one. It is the colour of "this family has no material pipeline yet", and the
//    day `materialId` starts resolving, the resolver belongs in the PRODUCER (the
//    one ladder, C100 §2.1), not in another copy here.

import * as THREE from '@pryzm/renderer-three/three';

/** C100 §5's marker prefix. A literal, not an import: this is L6 reading an L2
 *  WIRE FORMAT, exactly as the door, window and furniture bridges do. */
const UNRESOLVED_PREFIX = 'unresolved:';

/** Magenta, on purpose (C100 §5). "Your material was lost" must never look like
 *  a design choice. */
export const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/** The kernel's `'extrude|default'` — a real DEFAULT, not a resolved answer. */
export const DEFAULT_COMPONENT_COLOR = '#b8bec8';

const ROUGHNESS = 0.65;
const METALNESS = 0.05;

/** True when the key names a material that could not be resolved. */
export function isUnresolvedComponentMaterialKey(key: string): boolean {
  return key.includes(UNRESOLVED_PREFIX);
}

export function colorOfComponentMaterialKey(key: string): string {
  return isUnresolvedComponentMaterialKey(key)
    ? UNRESOLVED_MATERIAL_COLOR
    : DEFAULT_COMPONENT_COLOR;
}

export function makeComponentMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfComponentMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: ROUGHNESS,
      metalness: METALNESS,
      side: THREE.DoubleSide,
    });
}
