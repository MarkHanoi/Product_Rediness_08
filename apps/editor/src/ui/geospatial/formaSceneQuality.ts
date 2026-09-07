/**
 * formaSceneQuality.ts — §FORMA-SCENE-QUALITY (ADR-0089)
 *
 * Small helpers for the "professional architectural model" look
 * of the Forma (Cesium flat-ground) site view — the Spacio / Autodesk-Forma
 * reference: clean neutral light-grey massing, soft gradient shadowing, a subtle
 * ground, and a soft vertical sky/background gradient.
 *
 * This module is intentionally Cesium-free and DOM-light: it only owns the
 * tuned palette/quality CONSTANTS and the pure CSS-gradient string builder, so
 * the heavy scene wiring stays in CesiumViewport.ts. No THREE, no `(window as
 * any)`, no I/O. Its ONE import is the pure 2D/3D colour table (`formaPaletteV2`),
 * because the backdrop's horizon must EQUAL the ground paper rather than agree
 * with it by hand — see `skyHorizon`. The single exported function carries no OpenTelemetry span by
 * design — it is a pure string builder with no side effects and no async work
 * (the file's CesiumViewport callers are themselves span-free UI methods, per
 * the existing convention in that file).
 */

// §SITE-SCOPE-CITYWEFT — the backdrop's horizon is the SAME paper as the ground inside the cut, so
// the scope edge stands on continuous empty ground rather than in front of a grey sky. One value,
// referenced, never copied (L-12965 / L-12987 are two recorded drifts of exactly this tone).
import { FORMA_PALETTE_V2 } from './formaPaletteV2';

/**
 * §FORMA-SCENE-QUALITY — the refined "architectural model" quality constants.
 * Kept here (not in CesiumViewport's FORMA_PALETTE) so the look can be tuned in
 * one obvious place without scrolling the 5k-line viewport file. CesiumViewport
 * imports these and feeds them into the scene/fog/shadow/light wiring.
 */
export const FORMA_QUALITY = {
  /**
   * The backdrop BEHIND the cut — the vertical gradient painted on the container and revealed
   * through the alpha canvas (`scene.backgroundColor = TRANSPARENT` on the Forma surface).
   *
   * ⚠ §SITE-SCOPE-CITYWEFT (founder 2026-09-07, on build `2c12b8d5`): *"it is not a proper cut — it
   * should look like cityweft — white background clean cut — also for the terrain."* THIS BLOCK
   * PREVIOUSLY READ `skyTop: '#F2F3F6'` / `skyHorizon: '#E4E3E0'` with the rationale *"never a harsh
   * sky, never pure white"*. That rationale was authored for a scene with NO CUT, where the backdrop
   * was a horizon the far terrain melted into. It is superseded, not deleted, because it was right
   * about the scene it described.
   *
   * ⭐ WHAT CHANGED UNDER IT. Once `globe.cartographicLimitRectangle` is applied, everything outside
   * the scope is a fragment `discard` (CesiumUnminified `TILE_LIMIT_RECTANGLE`, index.js:207387) and
   * whole tiles outside it return `Visibility.NONE` (:211328) — so the backdrop is no longer a
   * distant horizon, it is THE SURFACE THE CUT EDGE STANDS ON. #E4E3E0 read as a grey sky behind a
   * floating model; the founder's reference reads as a model standing on clean empty ground.
   *
   * So the horizon is now the SAME paper as the ground inside the scope (`FORMA_PALETTE_V2.land`,
   * the one the 2D map and `FORMA_GROUND_URBAN` already share), and the top lifts to white. A
   * REFERENCE, not a copied literal — three tones authored to agree have drifted here twice
   * already (L-12965, L-12987).
   */
  skyTop: '#FFFFFF',
  skyHorizon: FORMA_PALETTE_V2.land,
  /**
   * Subtle ground-contact fog tint - a touch of the horizon grey so building
   * bases melt softly into the ground plane instead of meeting a hard line.
   * This is the robust, GPU-agnostic half of the "gradient shadowing" ask: it
   * reads as gentle atmospheric/ambient depth even when AO can't compile.
   */
  fogColor: '#E6E5E2',
  /**
   * Cesium `scene.fog.density` - VERY light. High enough to soften far massing
   * and give a depth gradient toward the horizon; low enough that the near
   * building stays crisp. (Cesium fog is exponential-squared in eye distance.)
   */
  fogDensity: 0.00018,
  /**
   * Fog minimum brightness - keeps shaded fog from crushing toward black on the
   * far side of the scene (brand: no black).
   */
  fogMinBrightness: 0.92,
  /**
   * Shadow map darkness (fraction of light remaining IN shadow). Slightly softer
   * than a hard graphite cast so the contact shadows read as a *gradient* under
   * eaves/crevices rather than a stark black silhouette - the founder's "soft
   * gradient shadowing" #1 ask. Still clearly present.
   */
  shadowDarkness: 0.34,
  /** Soft-shadow PCF blur radius (px in the shadow map). Larger = softer edges. */
  shadowSoftBlur: 3.0,
} as const;

/**
 * §FORMA-SCENE-QUALITY — build the CSS backdrop gradient applied to the Cesium
 * container while in Forma mode. A gentle vertical linear gradient from a cool
 * off-white top to a faintly warmer horizon, with a barely-there radial lift in
 * the centre so the model sits in a soft "studio" pool of light (the Spacio /
 * Forma reference look). Pure: returns a CSS `background` shorthand value.
 *
 * Span-free: pure string builder, no side effects (see module header).
 */
export function buildFormaSkyGradientCss(
  top: string = FORMA_QUALITY.skyTop,
  horizon: string = FORMA_QUALITY.skyHorizon,
): string {
  // Radial centre-lift (subtle, ~35% white pool) layered OVER the vertical
  // gradient. Order matters: the radial is listed first so it composites on top.
  const radial =
    `radial-gradient(120% 90% at 50% 38%, ` +
    `rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.0) 60%)`;
  const vertical = `linear-gradient(180deg, ${top} 0%, ${horizon} 100%)`;
  return `${radial}, ${vertical}`;
}
