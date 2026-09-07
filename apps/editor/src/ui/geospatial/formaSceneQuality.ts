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
 * that took it there, and for what carries the silhouette instead). The exported functions carry no OpenTelemetry span by
 * design — they are a pure string builder and a pure predicate, with no side effects and no async
 * work (the file's CesiumViewport callers are themselves span-free UI methods, per
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
   *   · slab TOP  — `FORMA_PALETTE_V2.land` #F5F2EA, ΔL* **4.48** against white. Faint, and it is the
   *     face the camera sees least at the rim.
   *   · slab SIDE — `SITE_SCOPE_SLAB_SIDE_CSS` #E6E6E3, ΔL* **8.78** against white, FLAT-shaded so it
   *     holds that value at every sun angle. This is the vertical face the cut edge is MADE of, and
   *     it is what keeps the silhouette. It is why the side may not be whitened with the backdrop.
   *   · context BUILDINGS — #E8E1D4, ΔL* **10.25**. Never at risk.
   *   · ⚠ PROPOSED MASSING — `FORMA_PALETTE.proposedFill` #F4F4F2, ΔL* **3.86**. THIS IS THE THINNEST
   *     STEP IN THE SCENE, and it belongs to the one thing the founder is actually looking at. Its
   *     edge is carried by the graphite silhouette POST-PROCESS (#2B2B2B), which `applyFormaMode`
   *     itself reports as possibly `silhouette=unavailable` on a GPU where the stage will not
   *     compile. **White backdrop + silhouette unavailable is the combination that loses the
   *     subject**, so the applied line now prints the backdrop tone and the silhouette verdict
   *     together — one line answers "is it white yet" and "did the edge survive".
   *
   * ⚠ THE FOUR NUMBERS ABOVE ARE MEASURED, NOT EYEBALLED (L-13100). CIE L* from sRGB with the
   * D65 luminance row (0.2126729, 0.7151522, 0.0721750); white is 100.00 exactly. This block
   * previously read "≈ 3.5" and "≈ 8.6" for the first two; both were wrong, and the TOP was wrong
   * in the direction that understates the risk. `formaPaletteParity.spec.ts` now recomputes them.
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
 * §FORMA-SCENE-QUALITY — build the CSS backdrop applied to the Cesium container while in Forma
 * mode. A vertical linear gradient between the two stops, with a barely-there white radial lift in
 * the centre so the model sits in a soft "studio" pool of light (the Spacio / Forma reference).
 * Pure: returns a CSS `background` shorthand value.
 *
 * ⚠ CORRECTED 2026-09-07 (L-13100) — this doc read *"a gentle vertical linear gradient from a cool
 * off-white top to a faintly warmer horizon"*, which described the SUPERSEDED #F2F3F6 → #E4E3E0
 * pair. Both stops are now flat #FFFFFF (the founder's *"make the background completely white"*),
 * so today this builds a flat white field and the radial lift composites to nothing. The SHAPE is
 * kept, not the description: `formaBackdropClearCss` detects the degeneracy rather than assuming
 * it, so restoring a real gradient here needs no other edit.
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

/**
 * The colour of the radial centre-lift in `buildFormaSkyGradientCss`, named rather than left as a
 * bare `rgba(255,255,255,…)` inside a template literal, so `formaBackdropClearCss` can REASON about
 * it instead of assuming it away. A white lift composites to nothing only over white; over any
 * other tone it is a real, non-flat highlight.
 */
export const FORMA_BACKDROP_RADIAL_LIFT_CSS = '#FFFFFF';

/**
 * §SITE-SCOPE-CITYWEFT-CLEAR (L-13100, founder 2026-09-07: *"the 3d site view is better — make the
 * background completely white if you can"*) — the OPAQUE SCENE CLEAR colour for the Forma site
 * surface, or `null` when the backdrop still needs the canvas to be see-through.
 *
 * ⭐ WHY THIS EXISTS AT ALL. The whole reason the Forma surface cleared `Cesium.Color.TRANSPARENT`
 * is stated in CesiumViewport's own comment and it was a good reason: *"Cesium's WebGL canvas clears
 * to `backgroundColor` (a single flat colour), so a true gradient sky is painted as a CSS background
 * on the container and revealed through the (alpha) canvas."* A flat clear cannot be a gradient —
 * so as long as the backdrop WAS a gradient, transparency was forced.
 *
 * ⭐⭐ THE FOUNDER'S SENTENCE REMOVED THE GRADIENT, AND THEREFORE REMOVED THE REASON. With
 * `skyTop === skyHorizon === #FFFFFF` the vertical gradient is degenerate and the radial lift is
 * white-on-white, so the CSS backdrop is now EXACTLY ONE FLAT COLOUR — which a scene clear can be.
 *
 * ⛔ AND THE TRANSPARENT CLEAR WAS NOT FREE. It made "the background is white" a property of a DOM
 * STYLE rather than of the scene, and the style underneath it is BLACK: `CesiumViewport.ts` sets
 * `container.style.background = "#000"` at construction, which `applyFormaSkyBackdrop` stashes and
 * overwrites. Every frame in which the backdrop has not been applied — or in which that best-effort
 * `try` caught — shows that black through the alpha canvas. Two further claims in the file were
 * measured FALSE while writing this: `FORMA_PALETTE.background` (#E9EAEC) is documented as the
 * "no-alpha fallback … instead of black", and **nothing read it** (`grep` → one definition, two
 * comments, zero uses), so on a context that ignores `alpha:true` the real fallback was the
 * container's #000 — the one colour §GLOBE-FIRST-FRAME-COLOUR exists to keep off the screen.
 *
 * ⭐ SELF-HEALING, WHICH IS THE POINT OF RETURNING `null` RATHER THAN A BOOLEAN. If a future author
 * restores a real gradient (either stop moved off white), this returns `null`, the surface table
 * puts the clear back to TRANSPARENT, and the CSS gradient shows through again — today's behaviour,
 * recovered without anyone remembering that it had to be. The CSS backdrop is left applied either
 * way, as belt-and-braces behind an opaque canvas.
 *
 * Pure; span-free (see module header).
 *
 * @returns the flat CSS colour to clear to, or `null` if the backdrop is a genuine gradient.
 */
export function formaBackdropClearCss(
  top: string = FORMA_QUALITY.skyTop,
  horizon: string = FORMA_QUALITY.skyHorizon,
): string | null {
  const norm = (css: string): string => css.trim().toUpperCase();
  // Flat ⇔ both stops agree AND they agree with the radial lift, which is what makes the lift a
  // no-op. Two stops that agree on #EEEEEE are still NOT flat: the 35 % white pool sits on top.
  const flat =
    norm(top) === norm(horizon) && norm(top) === norm(FORMA_BACKDROP_RADIAL_LIFT_CSS);
  return flat ? top : null;
}
