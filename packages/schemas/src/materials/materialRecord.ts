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
import type { MaterialCarbonFacts } from './materialCarbon.js';
import type { MaterialSurface } from './materialSurfaces.js';
import type { MaterialUpstreamId } from './materialProvenance.js';

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

  // ── §MATERIAL-CARBON-FACTS (L-3100) — C100 §1.1, the 6D half ──────────────
  // OPTIONAL and ADDITIVE, exactly as `maps`/`tiling` were: every existing row
  // stays valid unchanged, and this facet lands without rewriting the catalogue.
  //
  // ⭐ THE FIELD IS ON THE RECORD, NOT IN A SIDE TABLE, ON PURPOSE. A parallel
  // `Record<materialId, factor>` living beside the catalogue would be a SEVENTH
  // material vocabulary — the exact defect C100 was written to stop — and it
  // would rot the first time a material was renamed. The VALUES are authored in
  // `carbonFactorTable.ts` for legibility and merged onto the rows at module
  // load by `materialCatalog.ts`; what a consumer reads is one record.
  //
  // ⛔ ABSENT MEANS NOT MEASURED, NEVER ZERO. Most rows carry nothing here and
  // that is the intended state — see the header of `carbonFactorTable.ts`.

  /**
   * Embodied-carbon factor and density, each inseparable from its citation.
   * See `materialCarbon.ts`; reduce it with `carbonPerCubicMetre()`, which
   * refuses rather than assumes when a half is missing.
   */
  readonly carbon?: MaterialCarbonFacts;

  // ── §MATERIAL-DECLARED-SURFACES (L-9702) — C100 §10.7 S25 ─────────────────
  // OPTIONAL and ADDITIVE, exactly as `maps`/`tiling`/`carbon` were.
  //
  // ⛔ ABSENT MEANS **NOT DECLARED**, NEVER "SUITABLE EVERYWHERE". The reference
  // product spells this facet "Absent = universal"; we deliberately do not, and
  // `materialSurfaces.ts` carries the full argument. In one line: under
  // "absent = universal" an unclassified row silently claims every slot, so the
  // first picker that filters offers polished marble for a roof.
  //
  // ⭐ AND IT IS A DIFFERENT FACT FROM THE SCHEDULE'S ELEMENT AXIS. That axis is
  // DERIVED (`materialUsageRegistry`, C100 §10.13.d) and measures what a family
  // ACTUALLY REFERENCES. This one is AUTHORED and states what the product SUITS.
  // A material can be suitable for a roof and used on none. Collapsing the two
  // is the "two facts, one value" defect §10.13.b was written after.

  /**
   * Which surface slots this finish is DECLARED suitable for.
   * `undefined` = not declared — see `isDeclaredForSurface()`, which returns
   * `null` for that case rather than guessing on the material's behalf.
   */
  readonly surfaces?: readonly MaterialSurface[];

  // ── §MATERIAL-UPSTREAM-LEDGER (L-9700) — C100 §10.6 / §10.14 ──────────────
  // ⛔ A ROW MAY ONLY NAME AN UPSTREAM WHOSE LICENCE HAS BEEN READ AND CLEARED.
  // `isUpstreamClearedToShip()` is the predicate; ARM F of
  // `check-material-single-source.ts` is the enforcement. Absent means the row
  // predates the ledger and is `pryzm-authored` by construction (scalars only,
  // no bytes) — which is why the field is optional rather than required: making
  // it required would have meant touching 245 rows to state a fact that is
  // already true of every one of them.

  /** Where this row's DATA or BYTES came from. See `materialProvenance.ts`. */
  readonly upstream?: MaterialUpstreamId;
}
