/**
 * @file apps/editor/src/ui/styles/categoricalPalette.ts
 *
 * §QTYHL132 (L-12120..L-12123) — THE CATEGORICAL SCALE, AUTHORED IN TYPESCRIPT,
 * WITH THE CSS CUSTOM PROPERTIES GENERATED FROM IT.
 *
 * Layer: L7 UI (apps/editor). No THREE (P2), no rAF (P3), no `(window as any)`
 * (P4), no store writes (P6). Nothing here touches `document` AT MODULE SCOPE —
 * the one DOM read lives inside `resolveCssColour` and is reached only for a
 * token this module does not itself own.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ THE DEFECT THIS FILE EXISTS TO CLOSE, MEASURED 2026-08-26
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder's console, on the Analysis surface, hundreds of lines:
 *
 *     THREE.Color: Unknown color model var(--app-cat-1)
 *     THREE.Color: Unknown color model var(--app-cat-2)
 *     THREE.Color: Unknown color model var(--app-cat-4)
 *
 * The chain, every hop measured:
 *
 *   `AnalysisTypes.ts:321` CAT_TOKENS = ['var(--app-cat-1)', …]  ← REFERENCES
 *   → `widgetRenderers.ts:991` nodeColour / `:992` edgeColour = seriesColour(…)
 *   → `graphViewState.ts:360/371`  node.colour / link.colour
 *   → `ElementPreviewRenderer.ts:613` `c.set(n.colour)` · `:632` `c.set(l.colour)`
 *
 * `THREE.Color.set(string)` is `setStyle`, and THREE has no CSS engine: it cannot
 * resolve a `var()`. The parse fails, the instance keeps its default (WHITE), and
 * the mark is drawn in a colour nobody chose. `SubjectInputs.nodeColour` in
 * `graphViewState.ts:287` had ALREADY declared its contract — *"Resolved CSS
 * colour per node id"* — and the caller was handing it an unresolved reference.
 *
 * ⚠ WHY IT SURVIVED A TEST SUITE: `graph3dViewState.spec.ts:63` passes
 * `nodeColour: () => '#6600FF'`. The fake was MORE CAPABLE THAN THE REAL CALLER
 * (memory: [[fake-more-capable-than-real]]) — a literal hex where production
 * passes a `var()` — so no arm could ever see the failure.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE SHAPE CHOSEN: TS IS THE SOURCE, CSS IS GENERATED (option b, not a)
 * ═════════════════════════════════════════════════════════════════════════════
 * The rejected alternative was to keep the hexes in `tokens.ts` and resolve them
 * at runtime with `getComputedStyle(document.documentElement)`. That works in a
 * browser and is wrong three ways here:
 *
 *   1. IT CANNOT ANSWER OUTSIDE A LIVE, THEMED DOCUMENT. Headless, SSR, a
 *      pre-`injectAppTheme()` frame, an offscreen render — all return `''`, and
 *      the honest answer then has to be a refusal for a colour that is perfectly
 *      well known. A palette that needs a painted page to know its own values is
 *      not an authority, it is a cache.
 *   2. IT MAKES THE 3-D PATH DEPEND ON THE DOM. `graphViewState` builds a subject
 *      for an offscreen WebGL blit; making that a DOM read couples the renderer's
 *      correctness to stylesheet injection order.
 *   3. IT LEAVES TWO WRITEABLE COPIES. `tokens.ts` would hold nine literals and
 *      any TS consumer wanting a number would hold nine more. C84 EI-9: one
 *      authority per concept. Here the concept is "what colour is category N",
 *      and it is answered exactly once, below.
 *
 * So: the nine values live here; `tokens.ts` interpolates {@link CATEGORICAL_TOKEN_CSS}
 * into `:root`; DOM/CSS consumers keep using `var(--app-cat-N)` unchanged; the
 * WebGL/canvas consumers call {@link resolveCssColour}, which is a TABLE LOOKUP for
 * these tokens and needs no document at all. The two consumers cannot disagree,
 * because one of them is generated from the other.
 *
 * ⚠ THEME — MEASURED, NOT ASSUMED. `grep -rn 'app-cat-' --include='*.ts'` finds
 * these tokens DECLARED in exactly one place (`tokens.ts` `:root`) and redeclared
 * under no media query, no `[data-theme]`, no `.dark` class. The editor's "night
 * mode" (`BottomActionMenu.ts:720` → `RenderPipelineManager.setTheme`) repaints
 * the 3-D BACKGROUND and does not touch this sheet. So there is no theme variance
 * to go stale — and, more durably, generation makes staleness UNREPRESENTABLE for
 * these nine: a resolved value is read from the same constant the CSS was printed
 * from. ⚠ OPEN: if a future theme redefines `--app-cat-*` per mode, this module
 * must become a per-theme table and `CATEGORICAL_TOKEN_CSS` must emit both blocks;
 * a runtime `getComputedStyle` read would be the WRONG fix, because it would
 * reintroduce (1) above.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * §CONTEXT-DATA-HONESTY — A FAILURE AND AN ANSWER ARE NEVER THE SAME VALUE
 * ═════════════════════════════════════════════════════════════════════════════
 * `new THREE.Color('var(--app-cat-1)')` does not throw. It warns and leaves the
 * instance WHITE — so "this category is white" and "this category's colour was
 * lost" printed the same pixels, which is precisely the founder's report ("not
 * all the categories highlight"). {@link resolveCssColour} therefore never
 * returns a plausible colour on failure: it returns {@link UNRESOLVED_COLOUR},
 * the magenta `ElementPreviewRenderer.ts:71` already designates for C100 §5, and
 * emits ONE console warning naming the unresolved token — once per distinct
 * token, not once per mark, or a 320-node graph would print 320 lines and the
 * signal would be the noise again.
 */

/**
 * The eight SERIES colours, in rotation order. ⭐ THE AUTHORITY. Every other
 * statement of these values in the product — the CSS custom properties, the
 * legend swatches, the Chart.js datasets, the 3-D instance colours — is derived
 * from this array.
 *
 * ⚠ PROVENANCE AND THE CVD ARGUMENT LIVE WITH THE VALUES, in `tokens.ts`'s
 * §CHART-CATEGORICAL-SCALE block, which is still the prose home of the decision
 * and still carries the measured ΔE00 floors. The guard that RE-RUNS that
 * simulation is `__tests__/chartPalette.spec.ts`, and it now measures this array,
 * which is what the product actually ships.
 *
 * ⛔ Do NOT add a ninth. Eight is where the CVD floor stops clearing ΔE00 10; a
 * ninth series is a "+N others" bucket, not a colour.
 */
export const CATEGORICAL_SERIES: readonly string[] = Object.freeze([
  '#6600FF', // 1 — the brand accent; the scale leaves monochrome, not the brand
  '#E69F00', // 2 ┐
  '#009E73', // 3 │
  '#56B4E9', // 4 │ Okabe-Ito (Wong, Nature Methods 8:441, 2011)…
  '#D55E00', // 5 │
  '#CC79A7', // 6 │
  '#005F73', // 7 ┘ …with #0072B2 → #005F73, which lifted the tritan floor to 11.13
  '#F0E442', // 8 — the light end; its lightness is what makes the floor work
]);

/**
 * The named neutral. ⛔ NOT part of the rotation: `unassigned` / `untyped` /
 * `unmeasured` are real ANSWERS about the model and must never be mistaken for a
 * category (SPEC-ANALYSIS-SURFACE-AND-WIDGETS §4.1 W2).
 */
export const CATEGORICAL_UNASSIGNED = '#C4CDE0';

/** The custom-property NAME for series `index` (0-based, as `seriesColour` uses). */
export function catSeriesTokenName(index: number): string {
  return `--app-cat-${(index % CATEGORICAL_SERIES.length) + 1}`;
}

/** The custom-property name of the named neutral. */
export const CAT_UNASSIGNED_TOKEN_NAME = '--app-cat-unassigned';

/**
 * Every categorical custom property, name → literal value. ONE map, built from
 * the arrays above, so a token this app declares can always be answered without
 * a document.
 */
export const CATEGORICAL_TOKEN_VALUES: ReadonlyMap<string, string> = new Map<string, string>([
  ...CATEGORICAL_SERIES.map((hex, i) => [`--app-cat-${i + 1}`, hex] as const),
  [CAT_UNASSIGNED_TOKEN_NAME, CATEGORICAL_UNASSIGNED] as const,
]);

/**
 * The `:root` declarations for the scale, GENERATED. `tokens.ts` interpolates
 * this; nothing else may restate a categorical hex in CSS.
 *
 * Indented to sit inside `DESIGN_TOKENS`' `:root` block. ⚠ No backticks and no
 * `${` may appear in any value — `DESIGN_TOKENS` is itself a template literal.
 */
export const CATEGORICAL_TOKEN_CSS: string = [
  ...CATEGORICAL_SERIES.map((hex, i) => `        --app-cat-${i + 1}:                ${hex};`),
  `        ${CAT_UNASSIGNED_TOKEN_NAME}:       ${CATEGORICAL_UNASSIGNED};`,
].join('\n');

/**
 * §CONTEXT-DATA-HONESTY — the designated UNRESOLVED colour, the SAME magenta
 * `ElementPreviewRenderer.ts:71` uses for C100 §5's "the material was lost".
 * Chosen to be VISIBLY WRONG: it is in neither the rotation nor any building
 * palette, so a mark drawn in it cannot be read as a legitimate category.
 *
 * ⛔ It is NOT a fallback in the "sensible default" sense. A sensible default is
 * what THREE already did (silent white), and that is the defect.
 */
export const UNRESOLVED_COLOUR = '#FF00FF';

/** One line per distinct dead token, never one per mark. */
const warnedTokens = new Set<string>();

/** Test seam + reporting seam: which tokens have refused so far, in order seen. */
export function unresolvedTokensSoFar(): readonly string[] {
  return [...warnedTokens];
}

/** Test seam — clear the warn-once ledger. */
export function _resetUnresolvedWarningsForTest(): void {
  warnedTokens.clear();
}

function refuse(token: string, why: string): string {
  if (!warnedTokens.has(token)) {
    warnedTokens.add(token);
    console.warn(
      `[categoricalPalette] UNRESOLVED colour token "${token}" — ${why}. Drawn in the designated `
      + `UNRESOLVED magenta ${UNRESOLVED_COLOUR}, NOT in a plausible colour: a mark whose colour `
      + 'was lost must not be readable as a mark whose colour is that value.',
    );
  }
  return UNRESOLVED_COLOUR;
}

/** `var(--name)` or `var(--name, fallback)`. Anything else is not a reference. */
const VAR_EXPR = /^var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([\s\S]+?)\s*)?\)$/i;

/**
 * ⭐ THE ONE RESOLVER. Turn any CSS colour EXPRESSION into a literal a
 * non-CSS consumer — `THREE.Color`, a 2-D canvas `fillStyle`, a GPU uniform —
 * can actually parse.
 *
 * ⛔ CALL IT AT THE BOUNDARY, ONCE. Do not scatter `getComputedStyle` at call
 * sites: that is how a repo acquires four rival ideas of what `--app-cat-3` is,
 * three of which are stale. The boundary for the 3-D graph is
 * `graphViewState.buildGraphSubject`, where the subject that crosses into the
 * renderer is minted.
 *
 * The ladder, in order:
 *   1. not a `var()` → it is already a literal; returned UNCHANGED (THREE parses
 *      `#rgb`, `#rrggbb`, `rgb()`, `hsl()` and the CSS colour names).
 *   2. a categorical token → answered from {@link CATEGORICAL_TOKEN_VALUES}. No
 *      DOM is touched, so this arm works headless and cannot go stale.
 *   3. any other token → read once from the live cascade, if there IS one.
 *   4. the expression's own `var(--x, fallback)` fallback, if it carried one.
 *   5. REFUSE — {@link UNRESOLVED_COLOUR} plus one warning naming the token.
 *
 * Never throws: a colour failure must not take out a dashboard render.
 */
export function resolveCssColour(value: string, _depth = 0): string {
  const raw = (value ?? '').trim();
  if (raw.length === 0) return refuse('(empty)', 'the caller supplied no colour at all');

  const m = VAR_EXPR.exec(raw);
  if (!m) return raw; // (1) already a literal — hex, rgb(), hsl(), a colour name

  const name = m[1]!;
  const inlineFallback = m[2];

  // (2) THE AUTHORITY. This app declares these nine; it does not need to ask the
  // browser what it itself decided.
  const owned = CATEGORICAL_TOKEN_VALUES.get(name);
  if (owned) return owned;

  // (3) A token owned by some other block of `tokens.ts`. There is no TS
  // authority for those yet, so the live cascade is the only source — and it is
  // consulted ONCE, here, rather than at each call site.
  if (_depth < 4 && typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
    let live = '';
    try {
      live = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    } catch {
      live = ''; // a detached/atypical document is a failure to resolve, not a crash
    }
    if (live.length > 0) return resolveCssColour(live, _depth + 1);
  }

  // (4) The expression's own declared fallback — the author already said what
  // they wanted if the token was missing, so honour it before refusing.
  if (inlineFallback && inlineFallback.length > 0 && _depth < 4) {
    return resolveCssColour(inlineFallback, _depth + 1);
  }

  // (5) §CONTEXT-DATA-HONESTY.
  return refuse(
    name,
    typeof document === 'undefined'
      ? 'this module does not own it and there is no document to read it from (headless/SSR)'
      : 'this module does not own it and the live cascade has no value for it '
        + '(the theme may not be injected yet, or the token is not declared)',
  );
}
