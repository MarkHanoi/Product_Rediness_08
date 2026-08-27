// §CESIUMENV167 (L-12760) — the SHARED visual-language constants for the INDICATIVE STUDY MASSING
// (§ENV3D164 / §MANUALENV159 / §ENVAMS148), hoisted out of `ParcelBoundarySceneRenderer.ts` (where
// §ENV3D164 first defined them, commit 465c65b0) so the THREE.js scene (BIM/plan) and the Cesium
// globe (3D Site — §CESIUMENV167) read the IDENTICAL hue + fill weight for the SAME study, rather
// than a hand-copied second literal that could silently drift. Founder, 2026-08-27: "the goal was
// always to display it in Cesium AS WELL AS in PRYZM … the same 24.5 m study must produce … the
// same visual language in both viewports."
//
// Colour/opacity are UNIT-INDEPENDENT (a CSS hex + a 0..1 alpha mean the same thing whether THREE
// or Cesium consumes them), so they belong here. Anything UNIT-DEPENDENT does NOT: THREE's dashed
// rim tunes `dashSize`/`gapSize` in WORLD METRES (still local consts in
// `ParcelBoundarySceneRenderer.ts`); Cesium's `PolylineDashMaterialProperty.dashLength` is SCREEN
// PIXELS (a local literal in `CesiumViewport.ts`, matching its own existing parcel-boundary dashed
// line rather than a metre-to-pixel conversion that would mean nothing). See each renderer's own
// comment at its dashed-rim construction for that explicit, intentional divergence.
//
// No THREE, no Cesium, no DOM, no I/O — a pure leaf so either renderer can import it without
// pulling the OTHER renderer's rendering stack along (P2 — THREE stays owned by `renderer-three`
// alone; this module must never import THREE, or CesiumViewport.ts importing it would violate P2
// by transitive association).
//
// ⛔ NON-NEGOTIABLE (see `ParcelBoundarySceneRenderer.ts`'s own header for the full reasoning): a
// study massing must never be visually confusable with the plan-backed `BuildableEnvelope` volume
// (`envelopeRenderStyle.ts`'s confident-violet / provisional-grey / suggested-amber family). Teal
// is deliberately outside that family, in EVERY renderer that draws a study.

/** Teal — deliberately outside the confident-violet / provisional-grey / suggested-amber family
 *  `envelopeRenderStyle.ts` already owns, so a study massing cannot be mistaken for any of them. */
export const STUDY_MASSING_TEAL = 0x00a99a;

/** The SAME teal, as a CSS hex string — Cesium's colour APIs take CSS strings where THREE takes a
 *  numeric hex; both must resolve to the identical colour, so this is DERIVED from the number
 *  above rather than typed out a second time (the exact hand-copy risk this module exists to
 *  remove, one level down). */
export const STUDY_MASSING_TEAL_CSS = `#${STUDY_MASSING_TEAL.toString(16).padStart(6, '0')}`;

/** Near-wireframe fill — well below the plan-backed envelope's normal 0.16, matching the weight
 *  `ParcelBoundarySceneRenderer.ts` already uses for an upper-bound / open-top plan envelope
 *  (0.05), so a study reads at least as tentative as PRYZM's own least-confident plan-backed
 *  rendering, never more solid. */
export const STUDY_MASSING_FILL_ALPHA = 0.05;

/** The study's own ground-shade weight — lighter than the real envelope's `GROUND_SHADE_FILL_ALPHA`
 *  (0.22): the shade underneath an indicative study must read as the LESSER claim of the two. */
export const STUDY_GROUND_SHADE_FILL_ALPHA = 0.12;
