// material-bridge — plumbing MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/plumbing.ts):
//   `plumbing|<kind>|<systemTag>|<color>|<materialId>|body`

import * as THREE from '@pryzm/renderer-three/three';

// ─── ⚠ A DEAD RIVAL TABLE, AND IT DISAGREES WITH THE LIVE ONE ────────────────
//
// MEASURED 2026-08-19 (C100 §9 / L-1127 S16). This table is a SECOND copy of the
// service-colour convention, and it does not agree with the copy in
// `producers/plumbing.ts` on four of its five rows:
//
//   tag          producer (LIVE)   this table (DEAD)
//   cold-water   #4a9bd1           #3aa0ff
//   hot-water    #d14a4a           #ff5a3a
//   waste        #5b4a3a           #5a3a2a
//   gas          #d1a44a           #f5d142
//   vent         #9aa3b0           #9aa3b0   (the only agreement)
//
// It is UNREACHABLE for any key the producer mints: `composePlumbingMaterialKey`
// has ALWAYS written a non-empty slot 3, so the `explicit` branch below always
// returns first. Two tables, one concept, four disagreements, and the one nobody
// could see is the one that would have been read.
//
// ⭐ RECORDED AS DEAD, NOT DELETED, AND NOT COUNTED AS A FIX — C100 §9.7's
// discipline (a finding that evaporates under measurement is removed as a
// measurement error, never re-labelled as something repaired). It is retained
// because a key composed before this slice — a cached descriptor, a pooled
// material, a fixture — can still arrive with an empty slot 3, and answering that
// with black would be a regression dressed as a cleanup.
//
// ⛔ It is NOT the fallback for a material that failed to resolve — that is
// `unresolved:` below (C100 §5).
const SYSTEM_COLORS: Readonly<Record<string, string>> = {
  'cold-water': '#3aa0ff',
  'hot-water': '#ff5a3a',
  'waste': '#5a3a2a',
  'vent': '#9aa3b0',
  'gas': '#f5d142',
};

const FALLBACK_COLOR = '#9aa3b0';

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present and
 * names nothing in `MATERIAL_CATALOG`. A literal rather than an import from
 * `geometry-kernel/_internal`: this is L6 reading an L2 WIRE FORMAT. Same choice
 * the door, window, furniture and lighting bridges make.
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/** Magenta, on purpose (C100 §5). A lost material must never look like a service colour. */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedPlumbingMaterialKey(key: string): boolean {
  return (key.split('|')[3] ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedPlumbingMaterialId(key: string): string | null {
  const slot = key.split('|')[3] ?? '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function colorOfPlumbingMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  // Prefer explicit color token, otherwise look up by systemTag.
  const explicit = parts[3];
  // ⭐ C100 §5 — a NAMED failure outranks every fallback below, INCLUDING the
  // service colour. Slot 3 arrives already resolved by `resolveMaterialColorSlot`;
  // `unresolved:` means the run names a material that no longer exists, and
  // painting a confident engineering blue over that is the silent failure this
  // contract exists to prevent — it would read as "this is cold water", which is a
  // claim about the BUILDING, not about a missing catalogue row.
  if (explicit && explicit.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
  if (explicit && explicit.length > 0 && explicit !== 'default') {
    if (explicit.startsWith('#')) return explicit;
    if (/^[0-9a-fA-F]{6}$/.test(explicit)) return `#${explicit}`;
  }
  // Legacy / empty slot 3 only — see the DEAD RIVAL TABLE note above.
  const systemTag = parts[2];
  if (systemTag === undefined) return FALLBACK_COLOR;
  return SYSTEM_COLORS[systemTag] ?? FALLBACK_COLOR;
}

export function makePlumbingMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfPlumbingMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.5,
      metalness: 0.4,
      side: THREE.DoubleSide,
    });
}
