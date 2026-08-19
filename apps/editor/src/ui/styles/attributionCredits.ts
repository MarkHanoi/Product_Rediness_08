/**
 * @file apps/editor/src/ui/styles/attributionCredits.ts
 *
 * §UX2-ATTRIBUTION-CHROME — the Cesium ion / Google Maps attribution, restyled
 * onto the panel idiom. **It is made quieter. It is NOT removed, and it may not
 * be.**
 *
 * ── THE ASK, AND WHY THE ANSWER IS "RESTYLE", NOT "REMOVE" ──────────────────
 * The founder asked for the Cesium and Google stamps to be removed. They cannot
 * be, and the reason is contractual rather than aesthetic:
 *
 *   · **Cesium ion.** CesiumJS the library is Apache-2.0 and asks for nothing on
 *     screen. The credits come from the ION SERVICE: every string in that strip
 *     is the `html` field of an entry in the `attributions[]` array that
 *     `https://api.cesium.com/v1/assets/<id>/endpoint` returns
 *     (`Cesium.js` — `IonResource.getCreditsFromEndpoint` →
 *     `Credit.getIonCredit`). The service's terms require those credits to stay
 *     visible and legible while the asset is on screen. Entries the server marks
 *     `collapsible: false` are the ones it requires PINNED rather than folded
 *     into the "Data attribution" lightbox.
 *   · **Google Maps Platform.** The tiles are Google Photorealistic 3D Tiles
 *     (ion asset 2275207). Google's terms require its mark and the per-tile data
 *     attributions to remain displayed on, or immediately adjacent to, the
 *     imagery, clearly legible, unobscured, and not presented as if the imagery
 *     were ours.
 *   · **This repo's own contract.** C55 §"Attribution MUST NOT be droppable by
 *     configuration". (That contract also names a hard-fail gate,
 *     `check-geodata-attribution.ts`, which DOES NOT EXIST in the tree — so the
 *     rule is currently unenforced. Recorded, not relied upon.)
 *
 * Both vendors permit what this file does: PLACEMENT, SIZE, FONT, COLOUR and
 * BACKGROUND are ours. `display:none`, `opacity:0`, zero size, clipping,
 * z-index burial and covering overlays are not.
 *
 * ⚠ AND THE PART THAT IS NOT A STYLING PROBLEM AT ALL. The stamp that reads
 * "Upgrade for commercial use" is not in this repository and not in CesiumJS
 * (grep both: zero hits). It is server-supplied, keyed to the TOKEN'S ACCOUNT
 * TIER — i.e. ion is telling us the token is on a free/Community plan. On a
 * commercial BIM SaaS the compliant way for that line to disappear is an ACCOUNT
 * UPGRADE, never CSS. Hiding it here would breach the terms AND misrepresent our
 * licence status to users. See ISSUE-LOG L-762, already open and already routed
 * to the founder.
 *
 * ── WHAT THIS FILE CHANGES, AND WHAT IT DELIBERATELY DOES NOT ───────────────
 * Cesium's own presentation is `color:#fff; font-size:10px; text-shadow: 0 0 2px
 * #000000` (`widgets.css` `.cesium-widget-credits`) — white type held up by a
 * BLACK halo, over a globe whose brightness changes as tiles stream. That is
 * both off-brand (this product's palette is white + purple, explicitly no black)
 * and unreliable: its legibility is a function of whatever imagery loaded.
 *
 * Replacing the halo with a small glass chip fixes both at once, and it makes
 * the contrast KNOWN instead of incidental — the type sits on our own surface at
 * a measured ratio rather than on an arbitrary photograph.
 *
 * ⭐ THE TYPE IS **NOT** MADE SMALLER. "Minimal and unobtrusive" is delivered by
 * weight — a quiet colour, a small chip, no halo, tight padding — and not by
 * size, because legibility is the one property the terms actually bind. Cesium's
 * 10px is already at the floor; going under it would trade a licence obligation
 * for a cosmetic gain. For the same reason the sizes here are fenced inside
 * `@no-scale` markers: the §UI-DENSITY-SCALE lever multiplies px literals, and a
 * legally-required element must not shrink because someone tuned chrome density.
 *
 * ── CORNER: bottom-RIGHT of the widget, and this is measured ────────────────
 * Cesium's default is bottom-LEFT, which `CesiumViewport.ts:1396-1414` already
 * records as a CONTESTED corner: `initScene.ts:195-202` mounts the "3D detail"
 * control at `position:fixed; bottom:12px; left:12px`, `padding:6px 9px` on
 * `font:11px/1.2` — so it occupies roughly 12→39px up the left edge, straight
 * through the band a credit strip sits in. Obscuring the attribution is the one
 * outcome the terms forbid, so the strip moves to the corner whose occupants are
 * KNOWN and clear of it: bottom-right holds `#perf-mode-trigger` at bottom:80px
 * and `#pryzm-view-properties-launcher` at bottom:122px, both far above a ~22px
 * chip at bottom:8px.
 *
 * ⚠ NOT VISUALLY CONFIRMED IN THE LIVE VIEWPORT. This corner is argued from the
 * two documented occupants above, not from a screenshot of the running globe —
 * the Cesium viewport needs a live ion token and a streaming tileset to render.
 * It needs one look before it is trusted.
 *
 * ── SPECIFICITY IS LOAD-BEARING HERE ────────────────────────────────────────
 * `CreditDisplay` injects its OWN `<style>` into `document.head` when the Viewer
 * is constructed — which is AFTER `injectAppTheme()` has run. So source order
 * loses, and every rule that has to beat one of Cesium's runtime rules
 * (`.cesium-credit-text`, `.cesium-credit-delimiter`, `.cesium-credit-wrapper`,
 * `.cesium-credit-textContainer a:hover`) is written one class deeper on purpose.
 * `!important` is used at exactly one place and is commented there.
 *
 * Contracts: C55 (attribution not droppable) · C06 §6 (colour from tokens) ·
 * C06 §7.2 (declared screen region) · C43 §1.5 (measured contrast) ·
 * C84 EI-8/EI-9 (one panel vocabulary).
 */

/**
 * Injected by `AppTheme.injectAppTheme()` — the ONE runtime CSS injection point
 * (§05 §2.1). Never mounted standalone.
 */
export const ATTRIBUTION_CREDITS_STYLES = `
/* @no-scale:start */
/* ── The credit strip ─────────────────────────────────────────────────────────
   '.cesium-viewer-bottom' is the container Cesium builds when no 'creditContainer'
   is passed to the Viewer (and none is). Repositioned, not hidden. */
.cesium-viewer .cesium-viewer-bottom,
.cesium-viewer-bottom {
  bottom: 8px;
  left: auto;
  right: 12px;
  padding-right: 0;
  display: flex;
  align-items: center;
  /* Google's per-tile attributions are a variable-length provider LIST, so this
     strip wraps in the real world whatever width it is given. Wrapping tidily is
     therefore part of "legible", not a nicety: it wraps to the right edge, and
     the atoms that must never be split mid-phrase (a provider name, the "Data
     attribution" link that is the route to the full list) are pinned nowrap
     below. */
  flex-wrap: wrap;
  justify-content: flex-end;
  text-align: right;
  gap: 6px;
  max-width: min(52vw, 560px);
  /* A quiet chip instead of a black halo: the contrast becomes a property of
     OUR surface rather than of whatever imagery happens to be behind it. */
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--app-panel-glass, rgba(255,255,255,0.92));
  border: 1px solid var(--app-border, #dde3f0);
  backdrop-filter: var(--app-panel-glass-blur, blur(18px) saturate(1.35));
  -webkit-backdrop-filter: var(--app-panel-glass-blur, blur(18px) saturate(1.35));
  box-shadow: 0 1px 6px rgba(20, 10, 60, 0.10);
  /* Never a pointer trap over the globe — but the links inside stay clickable,
     which the terms require: "Data attribution" is the route to the full
     provider list and must remain reachable. */
  pointer-events: none;
}
.cesium-viewer-bottom a,
.cesium-viewer-bottom .cesium-credit-expand-link { pointer-events: auto; }

/* Type. 10px is Cesium's own size and is KEPT — see the header: quieter, not
   smaller. --app-text-2 measures 5.26:1 on this glass, comfortably over AA,
   which is what "legible" has to mean if it is to mean anything. The black
   text-shadow is removed (brand: white + purple, no black) and is unnecessary
   once the type has its own surface. */
.cesium-viewer .cesium-widget-credits,
.cesium-viewer-bottom .cesium-widget-credits {
  position: static;
  display: inline;
  padding-right: 0;
  color: var(--app-text-2, #5a6a85);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 10px;
  line-height: 1.35;
  text-shadow: none;
}
/* One class deeper than Cesium's runtime-injected '.cesium-credit-text' rule,
   which is appended to <head> when the Viewer is constructed — i.e. after this
   sheet. Specificity, not order, is what wins here. */
.cesium-viewer-bottom .cesium-credit-text,
.cesium-viewer-bottom .cesium-credit-textContainer {
  color: var(--app-text-2, #5a6a85);
  text-shadow: none;
}
.cesium-viewer-bottom .cesium-credit-delimiter {
  color: var(--app-text-muted, #7a8aaa);
  padding: 0 4px;
}
.cesium-viewer-bottom .cesium-credit-wrapper:first-of-type { padding-left: 0; }
.cesium-viewer-bottom .cesium-credit-wrapper,
.cesium-viewer-bottom .cesium-credit-expand-link { white-space: nowrap; }
.cesium-viewer-bottom .cesium-credit-textContainer a,
.cesium-viewer-bottom .cesium-credit-expand-link {
  color: var(--app-accent, #6600FF);
  text-decoration: none;
  font-weight: 600;
}
.cesium-viewer-bottom .cesium-credit-textContainer a:hover,
.cesium-viewer-bottom .cesium-credit-expand-link:hover { text-decoration: underline; }
/* The ion logo. Capped in HEIGHT rather than faded: a washed-out mark is a step
   toward "obscured", which is the line these terms actually draw. 0.9 is a
   whisper, not a veil. */
.cesium-viewer-bottom .cesium-credit-logoContainer img,
.cesium-viewer-bottom .cesium-credit-logoContainer a img {
  max-height: 14px;
  width: auto;
  opacity: 0.9;
  vertical-align: middle;
}

/* ── The "Data attribution" lightbox ─────────────────────────────────────────
   Cesium's default is a dark modal. It is the FULL provider list — the thing the
   pinned strip points at — so it gets the same panel vocabulary as everything
   else rather than being a third idiom (C84 EI-8/EI-9). */
.cesium-credit-lightbox-overlay { background: var(--pryzm-panel-backdrop, rgba(28,12,60,0.26)); }
.cesium-credit-lightbox {
  background: var(--app-panel-bg, #ffffff);
  color: var(--app-text, #1a2035);
  border: 1px solid var(--app-border, #dde3f0);
  border-radius: var(--app-radius-md, 10px);
  box-shadow: var(--app-shadow-panel, 0 8px 32px rgba(30,50,120,0.13));
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.cesium-credit-lightbox-title {
  color: var(--app-text, #1a2035);
  border-bottom: 1px solid var(--app-border, #dde3f0);
  font-weight: 700;
}
.cesium-credit-lightbox a { color: var(--app-accent, #6600FF); }
.cesium-credit-lightbox-close {
  color: var(--app-text-2, #5a6a85);
  /* The ONE !important in this file. Cesium sets the close control's colour from
     its runtime-injected sheet at equal specificity and later in source order,
     and an unclosable lightbox would COVER the map — which is a worse
     attribution outcome than the one being fixed. */
  background: transparent !important;
  font-size: 18px;
}
.cesium-credit-lightbox-close:hover { color: var(--app-accent, #6600FF); }
/* @no-scale:end */
`;
