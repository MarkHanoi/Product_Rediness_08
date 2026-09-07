/**
 * formaSceneQuality.ts — §FORMA-SCENE-QUALITY (ADR-0089)
 *
 * Small, dependency-free helpers for the "professional architectural model" look
 * of the Forma (Cesium flat-ground) site view — the Spacio / Autodesk-Forma
 * reference: clean neutral light-grey massing, soft gradient shadowing, a subtle
 * ground, and a soft vertical sky/background gradient.
 *
 * This module is intentionally Cesium-free and DOM-light: it only owns the
 * tuned palette/quality CONSTANTS and the pure CSS-gradient string builder, so
 * the heavy scene wiring stays in CesiumViewport.ts. No THREE, no `(window as
 * any)`, no I/O — and no imports at all: the backdrop is now flat white at both
 * stops, so it references nothing (see `skyHorizon` for the two founder sentences
 * that took it there, and for what carries the silhouette instead). The single exported function carries no OpenTelemetry span by
 * design — it is a pure string builder with no side effects and no async work
 * (the file's CesiumViewport callers are themselves span-free UI methods, per
 * the existing convention in that file).
 */

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
   * ⭐⭐ AND IT IS NOW FLAT WHITE, BOTH STOPS — founder 2026-09-07, second sentence, after seeing the
   * cut: *"the 3d site view is better — make the background completely white if you can"*. The
   * intermediate step (top #FFFFFF, horizon = the ground paper #F5F2EA) is superseded by his own
   * next instruction. Kept in this comment because the reasoning behind it is still the reason the
   * OLD grey was wrong, and because it is the fallback if the risk below turns out to bite.
   *
   * ⚠ THE RISK, NAMED BEFORE IT WAS TAKEN — DOES THE SLAB LOSE ITS SILHOUETTE AGAINST WHITE?
   * Measured against the three tones that actually meet the backdrop at the cut edge:
   *   · slab TOP  — `FORMA_PALETTE_V2.land` #F5F2EA, ΔL* ≈ 3.5 against white. Faint, and it is the
   *     face the camera sees least at the rim.
   *   · slab SIDE — `SITE_SCOPE_SLAB_SIDE_CSS` #E6E6E3, ΔL* ≈ 8.6 against white, FLAT-shaded so it
   *     holds that value at every sun angle. This is the vertical face the cut edge is MADE of, and
   *     it is what keeps the silhouette. It is why the side may not be whitened with the backdrop.
   *   · context BUILDINGS — #E8E1D4 and darker. Never at risk.
   * ⛔ SO THE SIDE IS THE SILHOUETTE AND MUST STAY DARKER THAN THE BACKDROP. If the founder reports
   * the edge disappearing, deepen `SITE_SCOPE_SLAB_SIDE_CSS`, do NOT re-grey the backdrop — a grey
   * backdrop is the thing he has now asked twice to remove.
   */
  skyTop: '#FFFFFF',
  skyHorizon: '#FFFFFF',
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
