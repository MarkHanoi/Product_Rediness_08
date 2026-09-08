// §SITE-SCOPE (L-645 re-opened 2026-09-07; C12 §13; ADR-0382 D8) — THE SCOPE SLIDER.
//
// Founder, verbatim: *"I want to have a slide of the scope on 3D Site view — like cityweft does —
// basically we have a scope — could be circular or rectangular whatever is easier for you — and
// then we crop everything — absolutely everything — but within the scope should be sound — really
// detailed and completed."*
//
// This module is the CONTROL. It owns no scope value, no Cesium object, no store and no global: it
// is handed `SiteScopeSliderPorts` by the composition layer (`SiteAuthoringPaneShell`), exactly as
// `PaneViewPicker` is handed its camera/basemap ports, so it is headless-testable and P1/P4 hold.
//
// ⭐ THE FOUR RULES IT IMPLEMENTS, each from C12 §13:
//   §13.4 — a pointer MOVE previews (one ring, re-positioned in place) and NEVER loads; the RELEASE
//           dispatches `site.setScope`. A load per pointer move would re-read tiles at 60 Hz.
//   §13.5 — the track carries the COMPLETE mark (`completeScopeRadiusM`), and past it the control
//           prints the cap verdict WITH ITS NUMBERS. "Within the scope should be sound" means a cap
//           that would drop something inside the scope is STATED, never silent (C57 §1.5/§1.9).
//   §13.1 — the range is the ONE measured range object (`SITE_SCOPE_RANGE`), passed in; this file
//           re-states no ceiling of its own.
//   §13.2 — the value on the track is the scope's CIRCUMSCRIBING radius — the one number every
//           radial limit reduces to, the same number `capVerdict` and `completeScopeRadiusM` speak.
//           A rectangle at value `r` is the SQUARE inscribed in that disc (half-extent r/√2), so
//           the shape toggle never moves the knob and never changes what the range means.
//
// ⛔ NOT AN UNDO ENTRY (ADR-0382 D8). `site.setScope` is a persisted VIEW-EXTENT fact, like the
// split fraction and the camera: a Ctrl-Z after a slide must undo the last MODEL edit, not the slab
// size. Stated here so it reads as a decision rather than an omission; the founder may overrule.
//
// ⛔ MOUNTED INSIDE ITS PANE, never on `document.body` (C59 §2.10.3 clause 4 / L-13027, and the
// `shellFloatBudget.spec.ts` budget): `position:absolute` in `paneEl`, so `left:50%` is arithmetic
// on its OWN pane and survives a divider drag, a solo collapse and a workspace-mode resize without
// reading a single shell variable.

import type { PaneId, ViewType } from './paneViewModel';
import type { PaneLayoutStore } from './paneLayoutStore';
import type { SiteScope, SiteScopeShape } from '@pryzm/schemas';
// ⭐ ONE BODY for the scope's geometry arithmetic. The circumscribing radius and the shape
// conversion live in `siteScope.ts` (C12 §13 reference list); re-deriving either here would be the
// second owner L-645 exists to remove. `engine/views` → `ui/*` is the established direction
// (`PlanViewManager` → `ui/site/siteSnapContext`).
import { scopeOuterRadiusM } from '../../ui/geospatial/siteScope';

/** The view type this control belongs to. It hides itself on every other pane. */
const SITE_3D: ViewType = 'site-3d';

const BRAND = '#6600FF';
const INK = '#2a2340';
const MUTED = '#6b6480';
const BORDER = '#ece7fb';

/**
 * What the slider needs from the world. Every entry is a QUESTION or a COMMAND — never a value the
 * control caches, because the scope has one owner and it is not this file.
 */
export interface SiteScopeSliderPorts {
    /** The LIVE resolved scope (`resolveSiteScope(store.getScope(), SITE_SCOPE_RANGE)`), or `null`
     *  when no 3D-Site surface is up yet. `null` renders the control DISABLED with a reason, never
     *  a fabricated 0 (§CONTEXT-DATA-HONESTY: "not measured" and "zero" are different values). */
    getScope(): SiteScope | null;
    /** The ONE measured slider range (`SITE_SCOPE_RANGE`). */
    getRange(): { readonly minRadiusM: number; readonly maxRadiusM: number };
    /** The floor the parcel imposes (`minimumScopeContainingRing(parcel, 25 m)`), or `null` when no
     *  parcel is committed. The slab may never be tighter than the plot it presents (ADR-0382 D8). */
    getFloorRadiusM?(): number | null;
    /** §13.4 — the live preview ring while dragging. NEVER a load. `null` removes it. */
    preview(scope: SiteScope | null): void;
    /** §13.4 — the release. Dispatches `site.setScope` (P6). `false` = it could not be dispatched
     *  (no site yet), and the control says so instead of pretending the slab moved. */
    commit(scope: SiteScope): boolean;
    /** §13.5 — the largest scope at which every MAPPED cap holds, from the last load's measured
     *  densities. `null` = nothing has been measured yet, which is said rather than assumed clean. */
    getCompleteMark?(): {
        readonly radiusM: number;
        readonly boundBy: string;
        /**
         * WHY the mark sits there — and the two are NOT interchangeable to a user:
         *   `cap`  — a render cap: past the mark the rim is THINNED (the nearest N are drawn).
         *   `read` — the z16 tile read. ⛔ CORRECTED 2026-09-07 (lane SCOPE-FILL, L-13098): this
         *            read *"past the mark the bake has already DELETED features from dense cores,
         *            so the rim is MISSING, not thinned. A bigger slab draws FEWER buildings"* —
         *            measured false for buildings and for every polygon/linestring layer, whose
         *            feature sets are identical from z16 down to z13. It is TRUE for the POINT
         *            layers (trees), which lose 60 % per zoom step to tippecanoe's default
         *            `--drop-rate 2.5` — so the tree read is CLAMPED at this radius rather than
         *            stepped, and what this mark now means is "the trees stop here", not "the
         *            buildings thin out here".
         *   `none` — nothing bites at the measured scope.
         */
        readonly kind: 'cap' | 'read' | 'none';
    } | null;
    /** §13.5 — the per-layer cap verdicts for the CURRENT scope. */
    getCapVerdicts?(): ReadonlyArray<{ readonly layer: string; readonly complete: boolean; readonly line: string }>;
}

export interface SiteScopeSliderOptions {
    readonly paneId: PaneId;
    readonly paneEl: HTMLElement;
    /** The pane-layout store — the control shows itself only while ITS pane holds the 3D Site. */
    readonly store: PaneLayoutStore;
    readonly ports: SiteScopeSliderPorts;
}

export interface SiteScopeSliderHandle {
    readonly element: HTMLElement;
    /** Repaint from the ports (also called on every store change). */
    refresh(): void;
    dispose(): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// The pure half — exported so the arithmetic and the sentences are testable without a DOM
// ─────────────────────────────────────────────────────────────────────────────────────────

/** √2, named because it is the whole relationship between the track value and a rectangle. */
const ROOT2 = Math.SQRT2;

/**
 * The scope whose CIRCUMSCRIBING radius is `radiusM`, in `shape`.
 *
 * ⭐ A rectangle is the SQUARE INSCRIBED in the disc of that radius (half-extent = r/√2), NOT the
 * square that contains it. That is what makes the track value mean ONE thing in both shapes: the
 * knob does not jump when the shape toggles, the measured range keeps its meaning, and every
 * `f(scope)` radius in `contextExtentBudget.ts` — all of which reduce the scope to this same
 * circumscribing radius — reads the same number before and after the toggle.
 *
 * ⚠ THIS IS NOT `convertScopeShape`, AND THE DIFFERENCE IS DELIBERATE. That helper is
 * CONTAINMENT-preserving (circle → the square that CONTAINS the disc), which is right for
 * converting an authored value but wrong for a slider: it multiplies the circumscribing radius by
 * √2, so a toggle at the top of the range would immediately be clamped back and the "nothing you
 * could see is lost" promise it exists to make would be broken by the clamp. On a live slider the
 * user can see the change and undo it with one drag; a silent clamp he cannot.
 */
export function scopeAtRadius(radiusM: number, shape: SiteScopeShape): SiteScope {
    const r = Math.max(1, radiusM);
    if (shape === 'circle') return { shape: 'circle', radiusM: r };
    const half = r / ROOT2;
    return { shape: 'rectangle', halfWidthM: half, halfDepthM: half };
}

/**
 * `1781` -> `1 781`. Grouped with a plain ASCII space so a four-digit metre count reads at a glance.
 *
 * WARNING - NOT `toLocaleString`. That is ICU-dependent: the same call returns a comma, a narrow
 * no-break space (U+202F) or a non-breaking space depending on the Node build and the locale data
 * present, which makes the rendered string un-assertable AND makes the readout drift between the
 * founder's browser and CI for no reason anybody could see. One separator, chosen here.
 */
export function formatMetres(m: number): string {
    return String(Math.round(m)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * What the readout says. The SHAPE decides the words, because "900 m" means a different slab in
 * each: a disc of radius 900, or a square 1 273 m on a side. Saying only the track value would
 * make the rectangle read 40 % smaller than it is.
 */
export function describeScope(scope: SiteScope): string {
    if (scope.shape === 'circle') return `◯ ${formatMetres(scope.radiusM)} m radius`;
    return `▭ ${formatMetres(scope.halfWidthM * 2)} × ${formatMetres(scope.halfDepthM * 2)} m`;
}

/**
 * §13.5 — the completeness sentence, with its numbers.
 *
 * THREE DIFFERENT FACTS, and collapsing any two of them is the failure this exists to prevent:
 *   · nothing measured yet          → say that. Not "complete".
 *   · measured and the caps hold    → say it is complete, and at what.
 *   · measured and a cap bites      → the cap's OWN line (eligible / drawn / dropped / the scope at
 *                                     which it would hold), never a bare "some were dropped".
 */
export function completenessCaption(
    scope: SiteScope,
    mark: {
        readonly radiusM: number;
        readonly boundBy: string;
        readonly kind: 'cap' | 'read' | 'none';
    } | null,
    verdicts: ReadonlyArray<{ readonly layer: string; readonly complete: boolean; readonly line: string }>,
): string {
    const r = scopeOuterRadiusM(scope);
    const biting = verdicts.filter((v) => !v.complete);
    const parts: string[] = [];

    // ⭐ THE READ SENTENCE COMES FIRST AND IS NEVER REPLACED BY A CAP LINE (lane SCOPE-CUT,
    // 2026-09-07). It reports a DIFFERENT fact from any cap and the two must not queue behind each
    // other: a cap THINS a rim that is present, a read ceiling says a layer is not there at all.
    //
    // ⛔⛔ THE SENTENCE ITSELF WAS REPLACED 2026-09-07 (lane SCOPE-FILL, L-13098) BECAUSE IT WAS
    // FALSE, AND FALSE IN THE ONE DIRECTION THAT COSTS THE PRODUCT ITS OWN FEATURE. It read:
    //
    //   "Past ~1 781 m, the zoom-16 building + canopy read steps to a coarser zoom — and the bake
    //    deletes footprints from dense cores rather than coarsening them, so a wider slab draws
    //    FEWER buildings, not more. The slab still crops exactly where you set it."
    //
    // Measured against the SHIPPED tiles (`buildings.pmtiles?v=L663a`), one z15 tile against its
    // four z16 children over identical ground: Barcelona **953 footprints vs 953**, Madrid
    // **1 305 vs 1 305**, clipped footprint area agreeing to 0.02 %, height provenance identical to
    // the last unit; and it holds down to z13. `--drop-densest-as-needed` fires only above
    // tippecanoe's ~500 KB tile limit, and the largest z15 buildings tile sampled is 13 % of it. The
    // flag was passed and never fired. **A wider slab does not draw fewer buildings.** The product
    // was apologising, in its own copy, for a limit it did not have — and the apology had been
    // hard-wired into the READ as well, which is why the founder's 5 035 m slab really was empty:
    // not because the bake had deleted anything, but because the fetch bbox was frozen at 1 781 m.
    //
    // WHAT IS TRUE, and is what this sentence now says: the CANOPY is a point layer, and a point
    // layer loses a measured 60 % of its features per zoom step to tippecanoe's DEFAULT
    // `--drop-rate 2.5` (0.400 at Barcelona AND Madrid AND at z14/z15 — three pairs, one constant).
    // A zoom step thins the trees in the WHOLE box, including beside the site, so the tree read is
    // CLAMPED at this ceiling rather than stepped. The trees therefore stop; nothing is thinned.
    if (mark !== null && mark.kind === 'read' && r > mark.radiusM + 0.5) {
        parts.push(
            `Buildings, roads, rail, water and parks fill the whole slab. Trees stop at ` +
                `~${formatMetres(mark.radiusM)} m — past that the canopy tiles coarsen and drop ~60 % of their ` +
                'points everywhere in the box, including beside your site, so the tree ring is held at the ' +
                'last radius that reads complete instead. Street furniture and people stop at 2 500 m.',
        );
    }
    if (biting.length > 0) parts.push(...biting.map((v) => v.line));
    if (parts.length > 0) return parts.join(' · ');

    if (mark === null) {
        return 'Completeness inside the scope has not been measured yet — it is reported after the context loads.';
    }
    if (r <= mark.radiusM + 0.5) {
        // ⚠ THE WORD "COMPLETE" IS A PROMISE AND IT IS SCOPED TO WHAT WAS MEASURED. `mark` is
        // min(the measured per-layer cap densities from the LAST load, the per-site z16 canopy
        // ceiling). It says nothing about a layer that has never reported a density — which is why
        // the `mark === null` branch above says "not measured yet" rather than "complete"
        // (§CONTEXT-DATA-HONESTY: a failure and an empty are different values, and so are an
        // unmeasured and a clean one).
        // ⛔⛔ §FULL-PLATE-HONESTY (L-13124) — THE `none` ARM'S NUMBER IS THE SCOPE ITSELF, SO THE
        // OLD SENTENCE WAS A TAUTOLOGY DRESSED AS A MEASUREMENT. `completeScopeRadiusM` returns
        // `{ radiusM: outer, boundBy: 'none (every cap holds…)', kind: 'none' }` when no cap bites —
        // `outer` being the CURRENT scope. So the caption printed *"measured to ~3 020 m"* at 3 020 m,
        // *"~7 071 m"* at 7 071 m, and so on: the mark could never fall short of the slider, and the
        // founder read a number he had just dialled in as a survey result. The mark's own doc says
        // it plainly — *"the mark is a lower bound, not a maximum"* — and the caption said the
        // opposite. `cap` and `read` marks ARE real ceilings and keep their sentence.
        //
        // ⛔ AND "EVERY MAPPED FEATURE" WAS ALWAYS TOO BROAD. Exactly TWO layers ever report a
        // density (`scopeCapReports` holds `buildings` and `trees`); roads, rail, water, parks,
        // land use, street furniture and the TERRAIN report nothing, so the sentence spoke for six
        // layers it had not measured. At the founder's Dubai site three of them (trees, rail, parks)
        // are not baked for that region at all and the terrain tileset 404s — and the caption still
        // said everything was drawn. It now names what it measured and disclaims the rest
        // (§CONTEXT-DATA-HONESTY: an unmeasured layer and a clean one are different values).
        if (mark.kind === 'none') {
            const measured = verdicts.map((v) => v.layer).filter((s) => s.length > 0);
            const names = measured.length > 0 ? measured.join(' and ') : 'the layers that reported';
            return (
                `Complete at this scope for what was measured: every ${names} feature inside the plate ` +
                'is drawn and no cap bites here. Layers that report no density — and the terrain — are ' +
                'not covered by this line.'
            );
        }
        return `Complete at this scope — every ${mark.boundBy} feature inside it is drawn (that limit is measured to ~${formatMetres(mark.radiusM)} m).`;
    }
    return (
        `Past the complete mark: beyond ~${formatMetres(mark.radiusM)} m the ${mark.boundBy} cap thins the rim — ` +
        'the nearest are kept, so nothing near you is lost. Drag back to the mark, or read the per-layer ' +
        'numbers in the console.'
    );
}

/**
 * ⭐⭐ §SCOPE-PANEL-50 (L-13189 · C12 §13.5 · §CONTEXT-DATA-HONESTY) — MAY THE COMPLETENESS
 * SENTENCE BE FOLDED AWAY, OR MUST THE USER SEE IT?
 *
 * Founder 2026-09-07, red box drawn round this panel: *"Make the panel Scope … smaller - the panel
 * should be 50%"*. Measured, the panel cannot lose half its footprint while the caption stays in
 * flow — the caption IS most of the height. Progressive disclosure is the only way to pay for it,
 * and progressive disclosure applied to an honesty statement is how a product quietly stops
 * disclosing. So the fold is not offered on every reading; it is offered on exactly the readings
 * that are REASSURANCES, and refused on every reading that carries a limit or an absence.
 *
 * THE THREE THAT MUST STAY OPEN, and each is read off a fact the producer already computed rather
 * than re-judged here:
 *   · `mark === null`                   — nothing has been measured. An unmeasured layer and a
 *                                         clean one are DIFFERENT VALUES, and a folded "not
 *                                         measured yet" is a panel that looks complete and is not.
 *   · a verdict with `complete: false`  — a cap is biting. Its line carries the numbers.
 *   · the scope is past the mark        — the rim is thinned, or the canopy has stopped.
 *
 * ⛔ IT IS A RIVAL OF `completenessCaption` AND IT IS PINNED AS ONE, NOT LEFT TO DRIFT. Two
 * routines that judge the same three facts is the rival-solver shape this repo has paid for
 * repeatedly, so `siteScopeSlider.spec.ts` asserts the BICONDITIONAL against the caption's own
 * output across every arm — `false` here if and only if the sentence begins "Complete at this
 * scope". Move an arm boundary in either function and the equivalence arm says so; keeping a
 * private copy of the rule here and hoping is what that arm exists to forbid.
 */
export function captionNeedsAttention(
    scope: SiteScope,
    mark: { readonly radiusM: number; readonly kind: 'cap' | 'read' | 'none' } | null,
    verdicts: ReadonlyArray<{ readonly complete: boolean }>,
): boolean {
    if (mark === null) return true;
    if (verdicts.some((v) => !v.complete)) return true;
    return scopeOuterRadiusM(scope) > mark.radiusM + 0.5;
}

/** The floor the control enforces: the measured minimum, raised by the parcel's own when known. */
export function resolveFloorRadiusM(minRadiusM: number, parcelFloorM: number | null | undefined): number {
    if (parcelFloorM == null || !Number.isFinite(parcelFloorM)) return minRadiusM;
    return Math.max(minRadiusM, parcelFloorM);
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// The mount
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Mount the scope slider into `paneEl`. Idempotent per pane: an existing slider is removed first,
 * so a re-mount after a re-parent never leaves two controls.
 */
export function mountSiteScopeSlider(opts: SiteScopeSliderOptions): SiteScopeSliderHandle {
    const { paneId, paneEl, store, ports } = opts;

    paneEl.querySelector(`[data-pane-scope-slider="${paneId}"]`)?.remove();

    const root = document.createElement('div');
    root.setAttribute('data-pane-scope-slider', paneId);
    root.setAttribute('data-testid', `site-scope-slider-${paneId}`);
    Object.assign(root.style, {
        position: 'absolute',
        bottom: '14px',
        left: '50%',
        // The centring is PANE arithmetic — this element is absolutely positioned inside `paneEl`,
        // so 50% is 50% OF THE PANE (C59 §2.10.3 clause 4). No `--shell-canvas-cx`, no `fixed`.
        transform: 'translateX(-50%)',
        // 60 clears every surface a pane can host (Cesium's 15, the MapLibre overlay's 40) — the
        // same value and the same reason as the pane view picker (§PANE-DROPDOWN-VISIBLE, L-13052).
        zIndex: '60',
        display: 'none',
        boxSizing: 'border-box',
        // ⭐⭐ §SCOPE-PANEL-50 (L-13189) — HALF THE FOOTPRINT, PAID FOR BY DENSITY, NEVER BY
        // DELETING THE HONESTY SENTENCE. Founder 2026-09-07, red box round this panel: *"Make the
        // panel Scope Rectangular or circular smaller - the panel should be 50%"*.
        //
        // ⚠ "50%" IS HALF THE CURRENT FOOTPRINT, NOT 50% OF THE PANE — resolved by measurement
        // against his own screenshot, because the house precedent points the other way and would
        // have made the panel BIGGER. `--map2d-parcel-card-w` read his earlier *"20%"* as 20% OF
        // THE PANE; 50% of the ~948px pane he marked up is ~474px, wider than the 420px this
        // panel already was, which contradicts *"smaller"* in the same sentence. So: half the box.
        //
        // Every one of these numbers is a step DOWN from what was here (420 → 300 wide,
        // 10/14/8 → 7/10/6 padding, 12px → 11px type, 12 → 10 radius), and the height comes off
        // in the rows below plus the caption's fold. What did NOT change is what the panel SAYS.
        width: 'min(300px, calc(100% - 24px))',
        padding: '7px 10px 6px',
        borderRadius: '10px',
        border: `1px solid ${BORDER}`,
        background: 'rgba(255,255,255,0.94)',
        boxShadow: '0 6px 18px rgba(20,10,60,0.16)',
        font: '600 11px/1.3 system-ui, sans-serif',
        color: INK,
    } satisfies Partial<CSSStyleDeclaration>);

    // ── row 1: the shape toggle + the readout + the caption's disclosure ───────
    const head = document.createElement('div');
    Object.assign(head.style, {
        display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px',
    } satisfies Partial<CSSStyleDeclaration>);

    const shapeBtns = new Map<SiteScopeShape, HTMLButtonElement>();
    const shapeWrap = document.createElement('div');
    Object.assign(shapeWrap.style, {
        display: 'flex', border: `1px solid ${BORDER}`, borderRadius: '8px', overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    // ⭐ RECTANGLE FIRST — it is the default (ADR-0382 D2 / Q-5): it is what the founder's reference
    // shows, it matches the parcel's own frame, and it has no sagitta question. The circle stays.
    for (const [shape, glyph, label] of [
        ['rectangle', '▭', 'Rectangular scope'],
        ['circle', '◯', 'Circular scope'],
    ] as ReadonlyArray<readonly [SiteScopeShape, string, string]>) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = glyph;
        b.title = label;
        b.setAttribute('data-testid', `site-scope-shape-${shape}-${paneId}`);
        Object.assign(b.style, {
            appearance: 'none', cursor: 'pointer', border: 'none', background: '#ffffff',
            // §SCOPE-PANEL-50 — 13px/6×9 → 12px/3×7. The glyph is still the largest thing in the
            // row and still reads as a segmented control; it just stops setting the panel's height.
            color: MUTED, font: '600 12px/1 system-ui, sans-serif', padding: '3px 7px',
        } satisfies Partial<CSSStyleDeclaration>);
        b.addEventListener('click', () => { onShape(shape); });
        shapeWrap.appendChild(b);
        shapeBtns.set(shape, b);
    }

    const readout = document.createElement('span');
    readout.setAttribute('data-testid', `site-scope-readout-${paneId}`);
    Object.assign(readout.style, { flex: '1', textAlign: 'right', whiteSpace: 'nowrap' } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('span');
    title.textContent = 'Scope';
    Object.assign(title.style, { color: MUTED, letterSpacing: '0.02em' } satisfies Partial<CSSStyleDeclaration>);

    /**
     * ⭐ §SCOPE-PANEL-50 — THE FOLD, AND THE CONTROL THAT REFUSES TO FOLD.
     *
     * This is what buys the founder his 50%: the completeness sentence leaves the flow in the one
     * state where it is a reassurance, and it is one click away — never edited, never shortened,
     * never conditional on space. `captionNeedsAttention` decides; when it says the reading carries
     * a limit or an absence, this control is DISABLED and says why in its own title rather than
     * disappearing, because a fold that silently stops being offered teaches nothing.
     */
    const captionToggle = document.createElement('button');
    captionToggle.type = 'button';
    captionToggle.textContent = 'ⓘ';
    captionToggle.setAttribute('data-testid', `site-scope-caption-toggle-${paneId}`);
    Object.assign(captionToggle.style, {
        appearance: 'none', border: 'none', background: 'transparent', padding: '0 1px',
        font: '600 12px/1 system-ui, sans-serif', color: MUTED, cursor: 'pointer', flex: '0 0 auto',
    } satisfies Partial<CSSStyleDeclaration>);

    head.appendChild(shapeWrap);
    head.appendChild(title);
    head.appendChild(readout);
    head.appendChild(captionToggle);

    // ── row 2: the track, with the COMPLETE mark drawn on it ───────────────────
    const trackWrap = document.createElement('div');
    // §SCOPE-PANEL-50 — `2px 0 4px` → `0 0 2px`; the track's own breathing room came out of the
    // panel's height without touching the hit target, which the input's height below governs.
    Object.assign(trackWrap.style, { position: 'relative', padding: '0 0 2px' } satisfies Partial<CSSStyleDeclaration>);

    const input = document.createElement('input');
    input.type = 'range';
    input.step = '5';
    input.setAttribute('data-testid', `site-scope-range-${paneId}`);
    input.setAttribute('aria-label', 'Site scope radius in metres');
    // §SCOPE-PANEL-50 — a bare `input[type=range]` carries a UA height of ~21px PLUS ~2px of UA
    // margin top and bottom, none of it declared here and all of it counted in the panel's box.
    // Declaring the height and zeroing the margin is the single largest saving in this row.
    Object.assign(input.style, {
        width: '100%', accentColor: BRAND, cursor: 'pointer',
        display: 'block', height: '14px', margin: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    /** §13.5 — the "complete" mark: a tick ON the track at `completeScopeRadiusM`. */
    const mark = document.createElement('div');
    mark.setAttribute('data-testid', `site-scope-complete-mark-${paneId}`);
    Object.assign(mark.style, {
        // §SCOPE-PANEL-50 — 10px → 8px, to stay inside the 14px track rather than over-running it.
        position: 'absolute', top: '3px', width: '2px', height: '8px',
        background: BRAND, borderRadius: '1px', display: 'none', pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    trackWrap.appendChild(input);
    trackWrap.appendChild(mark);

    // ── row 3: the completeness sentence, with its numbers ─────────────────────
    const caption = document.createElement('div');
    caption.setAttribute('data-testid', `site-scope-caption-${paneId}`);
    Object.assign(caption.style, {
        // ⛔ THE TYPE GOT SMALLER; THE SENTENCE DID NOT. 11px → 10px is the ONLY thing this lane
        // did to the caption's own box — its text is `completenessCaption`'s and is untouched.
        font: '500 10px/1.35 system-ui, sans-serif', color: MUTED, marginTop: '3px',
        // Starts folded. `paintCaption` is the one writer of this property and it re-opens on any
        // reading that carries a limit or an absence (see `captionNeedsAttention`).
        display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    root.appendChild(head);
    root.appendChild(trackWrap);
    root.appendChild(caption);
    paneEl.appendChild(root);

    // ── state: ONLY what the control itself owns ────────────────────────────────
    // The scope lives in the SiteModel. What lives here is the in-flight DRAG (a value the store
    // must not see until release) and the shape the user last chose, which is a property of the
    // control until it is committed.
    let dragging = false;
    let dragRadiusM: number | null = null;
    let shape: SiteScopeShape = 'rectangle';
    let disposed = false;
    /**
     * §SCOPE-PANEL-50 — the user's OWN choice about the fold, and nothing else. It is an override
     * that can only ever OPEN: `paintCaption` ORs it with the pinned reading, so a limit or an
     * absence stays on screen whatever this holds. Per control, not per pane and not persisted —
     * the panel is transient chrome and a remembered fold would outlive the reading that justified
     * it, which is how a stale "everything is fine" gets shown over a scope that has since moved.
     */
    let captionOpen = false;

    const liveScope = (): SiteScope | null => ports.getScope();

    /** The radius the track is showing right now: the drag if one is in flight, else the live value. */
    const shownRadiusM = (): number | null => {
        if (dragRadiusM !== null) return dragRadiusM;
        const s = liveScope();
        return s ? scopeOuterRadiusM(s) : null;
    };

    /**
     * ⭐ §SCOPE-PANEL-50 (L-13189) — THE ONE WRITER OF THE CAPTION'S TEXT **AND** OF ITS FOLD.
     *
     * `pinned` means *this reading must be seen*: it is `captionNeedsAttention`'s verdict on the
     * three §CONTEXT-DATA-HONESTY facts, or `true` outright for the states the caption reports
     * directly (no site yet, a refused commit) — those are not completeness readings at all and
     * there is nothing to weigh them against, so they are never folded.
     *
     * ⛔ THE FOLD CAN ONLY EVER OPEN. `pinned || captionOpen` — the user's collapse is an override
     * on a REASSURANCE and has no power over a limit. Wiring it the other way round is how a
     * panel comes to be small and quiet about a scope that is dropping features.
     */
    function paintCaption(text: string, pinned: boolean): void {
        caption.textContent = text;
        const open = pinned || captionOpen;
        caption.style.display = open ? 'block' : 'none';
        captionToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        // A control that refuses states its reason; one that vanishes teaches nothing.
        captionToggle.disabled = pinned;
        captionToggle.style.cursor = pinned ? 'default' : 'pointer';
        captionToggle.style.color = pinned ? BRAND : MUTED;
        captionToggle.title = pinned
            ? 'This reading names a limit or an unmeasured layer, so it stays open.'
            : open
                ? 'Hide the completeness reading'
                : 'Show the completeness reading — what this scope actually draws';
        captionToggle.setAttribute('aria-label', 'Completeness reading');
    }

    function paint(): void {
        if (disposed) return;
        const onThisPane = store.getLayout()[paneId] === SITE_3D;
        const scope = liveScope();
        root.style.display = onThisPane ? 'block' : 'none';
        if (!onThisPane) return;

        const range = ports.getRange();
        const floor = resolveFloorRadiusM(range.minRadiusM, ports.getFloorRadiusM?.());
        input.min = String(Math.round(floor));
        input.max = String(Math.round(range.maxRadiusM));

        if (!scope) {
            // ⚠ NOT a fabricated 0 and NOT a hidden control: "the 3D Site is not up yet" is a fact
            // the user can act on, and hiding the slider would make it look unavailable for good.
            input.disabled = true;
            readout.textContent = 'not available';
            paintCaption('The 3D Site view is not showing a site yet — the scope applies once it is.', true);
            mark.style.display = 'none';
            return;
        }
        input.disabled = false;
        if (!dragging) shape = scope.shape;

        const r = shownRadiusM() ?? scopeOuterRadiusM(scope);
        input.value = String(Math.round(Math.min(range.maxRadiusM, Math.max(floor, r))));
        readout.textContent = describeScope(dragRadiusM === null ? scope : scopeAtRadius(dragRadiusM, shape));

        for (const [s, b] of shapeBtns) {
            const on = s === shape;
            b.style.background = on ? BRAND : '#ffffff';
            b.style.color = on ? '#ffffff' : MUTED;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }

        const completeMark = ports.getCompleteMark?.() ?? null;
        if (completeMark && completeMark.radiusM >= floor && completeMark.radiusM <= range.maxRadiusM) {
            const t = (completeMark.radiusM - floor) / Math.max(1, range.maxRadiusM - floor);
            mark.style.display = 'block';
            mark.style.left = `calc(${(t * 100).toFixed(2)}% - 1px)`;
            mark.title =
                completeMark.kind === 'read'
                    ? `Complete to ~${formatMetres(completeMark.radiusM)} m — bound by ${completeMark.boundBy}; ` +
                      'past it the tile read coarsens and the bake has already deleted footprints from dense cores'
                    : `Complete to ~${formatMetres(completeMark.radiusM)} m (bound by ${completeMark.boundBy})`;
        } else {
            mark.style.display = 'none';
        }

        // ⛔ ONE SCOPE AND ONE VERDICT SET FEED BOTH THE SENTENCE AND THE FOLD. Reading the drag
        // scope twice, or the verdicts twice, is how the caption comes to describe one radius while
        // the fold was decided on another — the panel would then hide a limit it is printing.
        const captionScope = dragRadiusM === null ? scope : scopeAtRadius(dragRadiusM, shape);
        const verdicts = ports.getCapVerdicts?.() ?? [];
        paintCaption(
            completenessCaption(captionScope, completeMark, verdicts),
            captionNeedsAttention(captionScope, completeMark, verdicts),
        );
    }

    /** §13.4 — a pointer MOVE previews. It never loads and never touches the store. */
    function onInput(): void {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        dragging = true;
        dragRadiusM = v;
        ports.preview(scopeAtRadius(v, shape));
        paint();
    }

    /** §13.4 — the RELEASE commits, once, through `site.setScope`. */
    function onRelease(): void {
        if (!dragging || dragRadiusM === null) return;
        const next = scopeAtRadius(dragRadiusM, shape);
        dragging = false;
        dragRadiusM = null;
        ports.preview(null);
        const ok = ports.commit(next);
        if (!ok) {
            paintCaption(
                'The scope could not be saved — no site is loaded, so there is nothing to store it on. ' +
                'The view is unchanged.',
                true,
            );
            return;
        }
        paint();
    }

    /** The shape toggle commits immediately: there is no drag to release. */
    function onShape(next: SiteScopeShape): void {
        if (next === shape) return;
        shape = next;
        const r = shownRadiusM();
        if (r === null) { paint(); return; }
        // A toggle mid-drag stays a preview; a toggle at rest is its own release.
        if (dragging) { ports.preview(scopeAtRadius(r, shape)); paint(); return; }
        const ok = ports.commit(scopeAtRadius(r, shape));
        if (!ok) {
            paintCaption('The scope shape could not be saved — no site is loaded. The view is unchanged.', true);
            return;
        }
        paint();
    }

    /** §SCOPE-PANEL-50 — the fold is a VIEW preference: it never previews and never commits. */
    function onCaptionToggle(): void {
        captionOpen = !captionOpen;
        paint();
    }

    captionToggle.addEventListener('click', onCaptionToggle);
    input.addEventListener('input', onInput);
    // `change` is the release for a range input in every browser; `pointerup`/`keyup` are the belt
    // and braces for a drag that ends outside the element. `onRelease` is idempotent (it early-outs
    // once `dragging` is false), so three listeners commit once.
    input.addEventListener('change', onRelease);
    input.addEventListener('pointerup', onRelease);
    input.addEventListener('keyup', onRelease);

    const unsubscribe = store.subscribe(() => { paint(); });
    paint();

    return {
        element: root,
        refresh: paint,
        dispose: () => {
            if (disposed) return;
            disposed = true;
            try { unsubscribe(); } catch { /* already gone */ }
            captionToggle.removeEventListener('click', onCaptionToggle);
            input.removeEventListener('input', onInput);
            input.removeEventListener('change', onRelease);
            input.removeEventListener('pointerup', onRelease);
            input.removeEventListener('keyup', onRelease);
            try { ports.preview(null); } catch { /* viewport already torn down */ }
            if (root.parentElement) root.parentElement.removeChild(root);
        },
    };
}
