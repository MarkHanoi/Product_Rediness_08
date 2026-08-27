/**
 * hopEmphasis — SELECTED vs CONNECTED vs UNRELATED, for the relationship
 * graph's OWN renderers (the 2-D SVG node-link diagram, and the 3-D-in-card
 * viewport's canvas overlay).
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/hopEmphasis.ts
 * ADR:             ADR-0343 §D.5 (colour) · §D.3 (click-through is the join)
 * Contracts:       C84 EI-9 (one authority per concept)
 * Issue log:       §GRAPH154 (L-12560..)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS EXISTS: THE FOUNDER'S SCREENSHOTS, READ LITERALLY
 * ═════════════════════════════════════════════════════════════════════════════
 * Founder, on the graph card: *"clearly distinguish between the element
 * selected with colours and the connected — maybe use the blue + purple from
 * inspect? the selected stronger?"* His Inspect screenshot splits the two roles
 * across TWO CHANNELS already: a crisp CYAN wireframe EDGE on the highlighted
 * element, and a soft PURPLE/VIOLET translucent VOLUME wash around it. That is
 * the language borrowed here — not a third, invented one:
 *
 *   SELECTED  → the EDGE/RING channel, cyan, at full strength ("the selected
 *               stronger").
 *   CONNECTED → the same ring channel, violet, weaker, RAMPED BY HOP DISTANCE.
 *   UNRELATED → recedes (fill-opacity down), never removed.
 *
 * ⛔ THE NODE'S FILL NEVER CHANGES HUE. The legend's claim — "colour = element
 * category" (`nodeLinkSvg.ts` `renderNodeLegend`) — stays true in BOTH states
 * because selection lives on a DIFFERENT channel (a ring/halo drawn around the
 * mark, plus fill-OPACITY, never fill-HUE). That is the explicit resolution to
 * the two-things-want-one-channel conflict §GRAPH154's brief calls out: option
 * "selection uses a different channel, leaving fill to category" — not the
 * "override fill and say so" alternative. See `renderNodeLegend`'s selection
 * note for how the legend stays honest about it while a selection is active.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ SAME HOP DATA, SAME RAMP AS THE 3-D SCENE (§HILITE140) — BY CONSTRUCTION
 * ═════════════════════════════════════════════════════════════════════════════
 * `focusNeighbourhood()` (`packages/building-graph/src/hierarchy.ts:443`) is the
 * ONE BFS that produces `hopOf` (seed = 0, first ring = 1, …) — the graph card
 * (`widgetRenderers.ts` `renderGraph`) already computes it via `focus =
 * focusNeighbourhood(...)` for the model-selection join. This module does not
 * run a second BFS; every function below takes a `hop` number that CAME FROM
 * that map, via `nodeLinkSvg.ts` (the 2-D SVG) and `GraphViewport.ts` (the
 * 3-D-in-card canvas overlay) — both consumers call the SAME `hopEmphasisFor()`
 * below, so "the graph ramp and the 3-D scene ramp tell the same story" is
 * provable by shared code, not by matching two hand-copied formulas.
 *
 * ⛔ THE NUMBERS MIRROR, RATHER THAN IMPORT, `DiagnosticMaterialManager.ts` (the
 * MAIN 3-D VIEWPORT'S own analysis-lens ramp, §HILITE140, L-12292). That file is
 * a THREE consumer (`import * as THREE from 'three'`, P2's single owner is
 * `packages/renderer-three/`); this one is an L7 UI file whose OWN header
 * (`widgetRenderers.ts`) declares "No THREE (P2)". Importing across that
 * boundary would drag THREE into the Analysis surface's dependency graph even
 * though no THREE *type* is named here — the P2 violation is architectural, not
 * textual. So the four constants below are COPIES, cited by file:line, and
 * `__tests__/hopEmphasisMirrorsInspect.spec.ts` reads
 * `DiagnosticMaterialManager.ts`'s SOURCE TEXT (never imports it) and asserts
 * the two sets of literals stay equal — the guard against silent drift a plain
 * copy-paste comment cannot give you.
 *
 *   RELATED_HOP_TINT_STEP  mirrors DiagnosticMaterialManager.ts:339 (0.28)
 *   RELATED_HOP_ALPHA_DECAY mirrors DiagnosticMaterialManager.ts:340 (0.75)
 *   RELATED_RING_COLOUR    mirrors DiagnosticMaterialManager.ts:245
 *                          (ANALYSIS_SELECTED_COLOR, #6600FF — PRYZM purple)
 *   RELATED_RING_BASE_ALPHA mirrors DiagnosticMaterialManager.ts:302
 *                          (ANALYSIS_SELECTED_OPACITY, 0.72)
 *   SELECTED_RING_COLOUR   is DiagnosticMaterialManager.ts:211
 *                          (GHOST_EDGE_COLOR, #00e5ff — cyan) — the Inspect
 *                          EDGE channel, confirmed at source rather than
 *                          assumed from the founder's screenshot description.
 *
 * ⚠ `relatedRingColour()` below reproduces `_lerpColor()` +
 * `relatedHopColor()`'s ARITHMETIC (`t = 1 - (1 - TINT_STEP) ** hop`, a
 * straight per-channel lerp toward white) — not THREE's `Color.lerp`, which
 * operates in THREE's internal colour-management space. The two are not
 * guaranteed bit-identical; they are the SAME FORMULA over the SAME inputs,
 * which is what "the same story" means for a UI ramp two different paint
 * back-ends (SVG attributes vs a 2-D canvas overlay) both have to render.
 *
 * ⛔ NO THREE, NO DOM AT MODULE SCOPE. Pure string/number functions only, so
 * both the SVG renderer and the canvas-2D overlay in `GraphViewport.ts` (itself
 * THREE-free — it blits a shared WebGL context, see that file's own header) can
 * import this without pulling anything heavier in.
 */

/** DiagnosticMaterialManager.ts:211 `GHOST_EDGE_COLOR` — the Inspect EDGE/ring channel. */
export const SELECTED_RING_COLOUR = '#00e5ff';

/** DiagnosticMaterialManager.ts:245 `ANALYSIS_SELECTED_COLOR` — PRYZM purple. */
export const RELATED_RING_COLOUR = '#6600FF';

/** DiagnosticMaterialManager.ts:339 — fraction blended toward white, PER hop. */
export const RELATED_HOP_TINT_STEP = 0.28;

/** DiagnosticMaterialManager.ts:340 — opacity multiplier, PER hop. */
export const RELATED_HOP_ALPHA_DECAY = 0.75;

/** DiagnosticMaterialManager.ts:302 `ANALYSIS_SELECTED_OPACITY` — the ramp's hop-0 base. */
export const RELATED_RING_BASE_ALPHA = 0.72;

/**
 * The SELECTED ring's own alpha. ⚠ CHOSEN, NOT MEASURED, and deliberately
 * FULL STRENGTH (1) rather than `RELATED_RING_BASE_ALPHA` — the founder's
 * "the selected stronger" is a ring that never shares its opacity with the
 * decay the CONNECTED ring uses; hop 0 is not "hop -1 of the same curve", it
 * is the thing the curve ramps away FROM.
 */
export const SELECTED_RING_ALPHA = 1;

/**
 * A dimmed-but-legible fill for a node the active neighbourhood does not
 * reach. ⚠ CHOSEN, NOT MEASURED — same spirit as `seriesFocus.DORMANT_ALPHA`
 * (0.22) and `graphViewState.DORMANT_3D` (0.30); this sits at the 3-D value
 * because the graph card's 2-D and 3-D tabs must recede by the same amount for
 * "the same story" to hold across a mode toggle, not only across the 2-D/3-D
 * viewports of one mode.
 */
export const UNRELATED_FILL_OPACITY = 0.30;

/** The floor `relatedFillOpacity()` decays toward — never so low the fill hue
 *  (still category, never selection) stops being legible on a connected node. */
export const RELATED_MIN_FILL_OPACITY = 0.55;

/** Per-hop fade on the fill, shallower than the ring's — the fill's job is
 *  still "which category", the ring's job is "how close to the selection". */
const RELATED_FILL_FADE_PER_HOP = 0.10;

/** Parse `#rrggbb`; anything else is returned unrecognised (`null`). */
function hexChannels(hex: string): readonly [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Blend `hex` toward white by fraction `t` (0 = unchanged, 1 = white),
 * per-channel — the same shape as `DiagnosticMaterialManager._lerpColor`
 * (see this file's header). A colour this cannot parse is returned unchanged
 * rather than guessed (§D.5 — nothing here mints a colour).
 */
export function lerpTowardWhite(hex: string, t: number): string {
  const ch = hexChannels(hex);
  if (!ch) return hex;
  const clampT = Math.max(0, Math.min(1, t));
  const mix = (c: number): string =>
    Math.round(c + (255 - c) * clampT).toString(16).padStart(2, '0');
  return `#${mix(ch[0])}${mix(ch[1])}${mix(ch[2])}`;
}

/**
 * PRYZM purple, progressively lightened toward white as `hop` grows.
 * `hop` >= 1. Mirrors `DiagnosticMaterialManager.relatedHopColor` — see header.
 */
export function relatedRingColour(hop: number): string {
  const t = 1 - Math.pow(1 - RELATED_HOP_TINT_STEP, hop);
  return lerpTowardWhite(RELATED_RING_COLOUR, t);
}

/**
 * The related ring's own alpha, decayed once per hop. `hop` >= 1. Mirrors
 * `DiagnosticMaterialManager.relatedHopAlpha` — see header.
 */
export function relatedRingAlpha(hop: number): number {
  return RELATED_RING_BASE_ALPHA * Math.pow(RELATED_HOP_ALPHA_DECAY, hop);
}

/** The fill's opacity at `hop` hops from the selection. `hop` >= 1. */
export function relatedFillOpacity(hop: number): number {
  return Math.max(RELATED_MIN_FILL_OPACITY, 1 - hop * RELATED_FILL_FADE_PER_HOP);
}

/** The ring's stroke-width multiplier at `hop` hops. `hop` >= 1 — thins with distance. */
export function relatedRingWidthScale(hop: number): number {
  return Math.max(1, 2.2 * Math.pow(RELATED_HOP_ALPHA_DECAY, hop - 1));
}

export type HopRole = 'inactive' | 'selected' | 'related' | 'unrelated';

export interface HopEmphasis {
  /** 'inactive' — no selection is active on this card at all: draw as before. */
  readonly role: HopRole;
  /** `null` when no ring should be drawn (inactive, or unrelated). */
  readonly ringColour: string | null;
  readonly ringAlpha: number;
  readonly ringWidthScale: number;
  /** 1 = full strength. Multiplies the mark's own fill-opacity; never its hue. */
  readonly fillOpacity: number;
  /** 1 = unchanged. The SELECTED mark alone grows — "the largest ring/halo". */
  readonly radiusScale: number;
}

const INACTIVE: HopEmphasis = Object.freeze({
  role: 'inactive', ringColour: null, ringAlpha: 0, ringWidthScale: 1, fillOpacity: 1, radiusScale: 1,
});

const UNRELATED: HopEmphasis = Object.freeze({
  role: 'unrelated', ringColour: null, ringAlpha: 0, ringWidthScale: 1, fillOpacity: UNRELATED_FILL_OPACITY, radiusScale: 1,
});

const SELECTED: HopEmphasis = Object.freeze({
  role: 'selected', ringColour: SELECTED_RING_COLOUR, ringAlpha: SELECTED_RING_ALPHA, ringWidthScale: 2.4, fillOpacity: 1, radiusScale: 1.22,
});

/**
 * THE single decision: given a node's hop distance from the active selection
 * (`undefined` when the node is not reached at all) and whether a selection is
 * active on this card right now, what does it draw?
 *
 * ⛔ `selectionActive` is passed explicitly rather than inferred from
 * `hop !== undefined`, because "no selection" and "selected but not reached"
 * are different facts a `hop` of `undefined` cannot tell apart on its own —
 * the same §CONTEXT-DATA-HONESTY shape this surface polices everywhere else.
 * Both callers (`nodeLinkSvg.ts`, `GraphViewport.ts`) pass `hopOf !== null`.
 */
export function hopEmphasisFor(hop: number | undefined, selectionActive: boolean): HopEmphasis {
  if (!selectionActive) return INACTIVE;
  if (hop === undefined) return UNRELATED;
  if (hop <= 0) return SELECTED;
  return {
    role: 'related',
    ringColour: relatedRingColour(hop),
    ringAlpha: relatedRingAlpha(hop),
    ringWidthScale: relatedRingWidthScale(hop),
    fillOpacity: relatedFillOpacity(hop),
    radiusScale: 1,
  };
}
