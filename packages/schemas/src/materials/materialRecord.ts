// C84 §1.1 — the ONE material record shape.
//
// ─── Why this type exists, and why it is HERE ───────────────────────────────
// `packages/core-app-model/src/materialLibrary.ts` line 1 is
// `import * as THREE from '@pryzm/renderer-three/three'`, and every entry's colour
// is a live `THREE.Color` built at module load. That single fact made the master
// UNREACHABLE from every THREE-free consumer — including `geometry-kernel`, which
// has zero THREE imports by design and is the package that composes the material
// key and therefore DECIDES THE RENDERED COLOUR.
//
// Four of the six rival material vocabularies exist because of it. `finishRef.ts`
// says so in its own header: "Transcribed, not imported: materialLibrary constructs
// THREE.Color instances at module load." An honest comment explaining a copy is
// still a copy — and proof the copy was FORCED. See ADR-0333.
//
// So the DATA lives here, at L0, beneath every consumer: plain scalars, no THREE,
// no DOM, no I/O (P5 / C03 §1.2). The THREE-typed library becomes a projection.
//
// ⚠ This shape is ADOPTED, not invented. `UserMaterialStore.UserMaterialDef` was
// already exactly this — its own docstring reads "deliberately NOT a THREE.Material,
// so the store stays pure and persistable". Minting a rival record shape here was
// this work's largest risk, and C84 §4.6 records that it was avoided by measurement
// rather than by care.

import type { MaterialMaps, MaterialTiling } from './materialMaps.js';

/** C84 §1.1 — the built-in category vocabulary. */
export type MaterialCategory =
  | 'Ceramic & Tile'
  | 'Concrete'
  | 'Fabric & Soft'
  | 'Glass'
  | 'Gypsum & Plaster'
  | 'Insulation'
  | 'Landscape & Ground'
  | 'Masonry'
  | 'Membrane & Waterproofing'
  | 'Metal'
  | 'Paint & Coating'
  | 'Plastic & Polymer'
  | 'Roofing'
  | 'Specialty Surfaces'
  | 'Stone'
  | 'Timber Engineered'
  | 'Wood';

/**
 * One material, in the ONE shape both tiers use (C84 §1.1).
 *
 * Tiers, per C65 §2 — same shape, discriminated by `source`:
 *   T1 `'builtin'` — `MATERIAL_CATALOG`, code, not user-editable.
 *   T2 `'user'`    — `UserMaterialStore`, per project, persisted.
 *
 * ⛔ NOT a global cross-project library: that is a T3 claim and C65 §2.1 defers T3.
 */
export interface MaterialRecord {
  /** Stable id. THIS is what an element references (C84 §2.1 / ADR-0217). */
  readonly id: string;
  /** Display name. */
  readonly label: string;
  readonly category: MaterialCategory | string;
  /** Base colour, '#rrggbb' lower-case. A hex, never a THREE.Color. */
  readonly color: string;
  /** PBR metalness 0..1. */
  readonly metalness: number;
  /** PBR roughness 0..1. */
  readonly roughness: number;
  /** Opacity 0..1 (1 = opaque). */
  readonly opacity: number;
  readonly transparent: boolean;
  /** Uploaded texture (data-URL or asset path). T2 only today. */
  readonly textureUrl?: string;
  readonly source: 'builtin' | 'user';

  // ── §MATERIAL-MAPS-AND-TILING (L-1700) — C100 §10.2.c / §10.9 ─────────────
  // Both fields are OPTIONAL and ADDITIVE: every one of the existing rows stays
  // valid unchanged, which is why this facet could land without touching the
  // catalogue. See `materialMaps.ts` for the full rationale — in particular why
  // the scale is a REAL-WORLD SIZE IN METRES and not a UV repeat count.
  //
  // ⛔ THEY ARE A PAIR. A record carrying `maps` MUST carry a usable `tiling`;
  // `materialMapsDefect()` is the one spelling of that rule and
  // `tools/ga-gate/check-material-maps-tiling.ts` enforces it. A texture with no
  // scale is wallpaper — the same product reading as a different product on every
  // surface it lands on.

  /** PBR texture maps, as LOGICAL asset paths. Never a CDN URL (see the type). */
  readonly maps?: MaterialMaps;
  /** Real-world footprint of one repetition of `maps`. Required whenever `maps` is set. */
  readonly tiling?: MaterialTiling;
}
