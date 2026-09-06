/**
 * viewRegionGeometry.ts — §VIEW-REGION-HAS-ONE-OWNER (C59 §2 invariant 10 / §2.10 ·
 * STR §26.1.2 · L-13030)
 *
 * Layer Affected:  UI — shell layout (L7)
 * File:            apps/editor/src/ui/layout/viewRegionGeometry.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.1.2
 * Contracts:       C59 §2 invariant 10 + §2.10 · C06 §15 (float budget) · C84 EI-9
 * Issue log:       L-13030 (this file's reason for existing), L-12915, L-12983, L-12988
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE ONE WRITER OF THE VIEW REGION'S BOX. THERE IS NO SECOND ONE.
 * ═════════════════════════════════════════════════════════════════════════════
 * C59 §2.10.3, normatively:
 *
 *   1. There is a VIEW REGION — the part of the shell that holds panes. Today it is
 *      implemented by `#container`; that is an implementation fact, not a definition.
 *   2. The WORKSPACE MODE sizes the region and nothing else.
 *   3. The SPLIT divides the region — always, and only. It writes pane boxes INSIDE
 *      the region, as fractions of it. It never writes the region's own box.
 *   4. A PANE hosts one view and owns its own chrome.
 *   5. Reads go up, writes go down. No level re-asserts another level's value.
 *
 * This module is level (1). The mode and the split both express an INTENT to it —
 * `setViewRegionClaim()` and `setViewRegionSplit()` — and it derives every box from
 * that state in one pure function. Nothing else in the app writes
 * `#container.style.{width,maxWidth,flexGrow,flexShrink,flexBasis,display}`,
 * `#svp-secondary-pane`'s width/right, or `#svp-divider`'s right.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACED, MEASURED (L-13030, 2026-09-06)
 * ═════════════════════════════════════════════════════════════════════════════
 * SEVEN write sites across FIVE modules, all on `#container`'s box:
 *
 *   · `WorkspaceController._applyLayout`      `''` / `'50%'` / `display:none`
 *   · `DataWorkbench._applyMode`              `''` / `calc(100% - 420px)` / `'50%'` / `'0'`
 *   · `SplitViewManager._buildDOM`            `(1-ratio)*100%` + maxWidth + 3 flex props
 *   · `SplitViewManager._teardownDOM`         `''` ×5
 *   · `SplitViewManager._applyDragRatio`      `(1-ratio)*100%` + maxWidth
 *   · `svpPlanPaneMounter.mount`              `''` ×5
 *   · `halfCanvasResizer.apply` / `dispose`   `(1-f)*100%` + maxWidth, conditionally cleared
 *
 * plus a stylesheet rival, `#container.svp-active { width: 60%; max-width: 60% }`.
 *
 * ⛔ AND THE FAILURE WAS AN OSCILLATION, NOT A RACE — which is what decides the fix.
 * `DataWorkbench` (split) wrote `50%`; `SplitViewManager` wrote `60%` plus flex
 * overrides. Each write resized the canvas; each resize ran a settle/placement pass
 * that re-asserted the other's value. The founder's console showed
 * `Split view activated` → resize 836→501 → autoframe → `Split view deactivated` →
 * resize 501→836, SIX times consecutively, for zero user input.
 *
 * ⛔ THE FORBIDDEN FIXES, named so a future lane does not spend a week on one
 * (C59 §2.10.2): a debounce, a throttle, a re-entrancy guard, an
 * `if (alreadyApplied) return`, or a harder re-assert pass. Each makes the
 * oscillation settle faster while leaving two modules disagreeing about the value,
 * and the loop returns the first time a transition is slower than the guard window —
 * which it will be, on a WebGL box, on an async Cesium mount.
 *
 * ⭐ SO THERE IS NO GUARD IN THIS FILE, DELIBERATELY. `applyViewRegion()` writes
 * unconditionally, every time it is called. Termination is a property of the SHAPE,
 * not of a latch: the boxes are a PURE FUNCTION of the state, so applying a
 * transition twice writes the same strings twice, and assigning a style property the
 * value it already holds changes no box, so it fires no `ResizeObserver` and starts
 * no second pass. Idempotence and termination are therefore testable without a
 * renderer — see `viewRegionGeometry.spec.ts`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THE SPLIT PANE'S BOX IS COMPUTED HERE AND NOT BY THE SPLIT
 * ═════════════════════════════════════════════════════════════════════════════
 * `.svp-pane` is `position: fixed; right: 0` at BODY level — it is not a child of the
 * region. So "the split divides the region" cannot be expressed by nesting; it has to
 * be expressed by ARITHMETIC, and the arithmetic needs the region's size. Reads go up:
 * the split declares only its FRACTION (`setViewRegionSplit(0.4)`) and this module —
 * the level that knows the region — turns that into `#container`'s width, the pane's
 * width AND the pane's `right` offset. That last one is the fix for the L-12915
 * occlusion: in a half-canvas mode the pane now sits at `right: 50%`, BESIDE the
 * Analysis panel rather than underneath it, so there is nothing to close.
 *
 * ⛔ WHICH IS WHY `halfCanvasSplitViewPolicy.ts` IS DELETED, NOT RETAINED. It closed
 * the split on entering a half-canvas mode and reopened it on leaving — the source of
 * the unrequested `Split view activated` / `deactivated` pairs, and a direct
 * contradiction of C59 §2.10.3 ("split state is orthogonal to workspace mode and
 * survives a mode change"). Its premise — the pane rendering behind the panel — is
 * dissolved by the `right` offset above, so the policy is not worked around; it has
 * no subject any more.
 *
 * L7 file. The model half is PURE (no DOM, no THREE (P2), no rAF (P3), no
 * `(window as any)` (P4), no store writes (P6)); the applier half touches only the
 * three elements named above and `publishShellCanvasRegion()`.
 */

import { publishShellCanvasRegion } from './shellCanvasBudget';

// ─────────────────────────────────────────────────────────────────────────────
// Element identity — the region and the legacy split's two body-level nodes.
// ─────────────────────────────────────────────────────────────────────────────

/** The element that IMPLEMENTS the view region today (C59 §2.10.3 item 1). */
export const VIEW_REGION_ELEMENT_ID = 'container';
/** `SplitViewManager`'s secondary pane — `position: fixed`, so it is placed by arithmetic. */
export const SPLIT_SECONDARY_PANE_ID = 'svp-secondary-pane';
/** `SplitViewManager`'s divider — likewise fixed, likewise placed here. */
export const SPLIT_DIVIDER_ID = 'svp-divider';

// ─────────────────────────────────────────────────────────────────────────────
// The model (pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How much of the shell a workspace-mode surface claims, leaving the rest as the
 * view region.
 *
 * `'px'` exists because the DataWorkbench `'panel'` mode is a 420 px strip, not a
 * fraction. It is kept as its own kind rather than converted at the call site: a
 * fraction computed from a live `window.innerWidth` would be wrong the instant the
 * window is resized, and the whole point of emitting CSS expressions is that the
 * browser re-evaluates them for free.
 */
export type RegionClaim =
    /** Nothing is claimed — the region is the whole shell. */
    | { readonly kind: 'none' }
    /** A fraction of the shell, `0 … 1`, taken from the RIGHT edge. */
    | { readonly kind: 'fraction'; readonly value: number }
    /** A fixed pixel width taken from the RIGHT edge. */
    | { readonly kind: 'px'; readonly value: number }
    /** The whole shell — the region collapses and `#container` is `display: none`. */
    | { readonly kind: 'all' };

export const CLAIM_NONE: RegionClaim = Object.freeze({ kind: 'none' });
export const CLAIM_ALL: RegionClaim = Object.freeze({ kind: 'all' });

/** A fraction claim, clamped to `[0, 1]`; a non-finite input claims nothing. */
export function fractionClaim(value: number): RegionClaim {
    if (!Number.isFinite(value) || value <= 0) return CLAIM_NONE;
    if (value >= 1) return CLAIM_ALL;
    return { kind: 'fraction', value };
}

/** A pixel claim; a non-finite or non-positive input claims nothing. */
export function pxClaim(value: number): RegionClaim {
    if (!Number.isFinite(value) || value <= 0) return CLAIM_NONE;
    return { kind: 'px', value };
}

/**
 * Who may size the region.
 *
 * ⚠ TWO, AND THEY ARE GENUINELY INDEPENDENT — this is not a list waiting to be
 * collapsed. `WorkspaceController` owns `#anl-surface` / `#aud-stack` (the Analysis
 * and Inspect surfaces); `DataWorkbench` owns `.dw`, which the user can open with
 * `pryzm-toggle-workbench` in ANY mode. Both are `position: fixed; right: 0`
 * overlays, so when both are up the WIDER one is what the user actually sees beside
 * the region — see `effectiveClaim()`.
 */
export type ViewRegionClaimantId = 'workspace-mode' | 'data-workbench';

export interface ViewRegionState {
    /** Each claimant's current claim. Absent === `CLAIM_NONE`. */
    readonly claims: Readonly<Partial<Record<ViewRegionClaimantId, RegionClaim>>>;
    /**
     * A live drag of the panel edge (`halfCanvasResizer`), as the panel's fraction of
     * the shell. It OVERRIDES the effective claim while set, and is cleared by the
     * next mode declaration — a mode change re-declares its own share, so a drag that
     * refined the previous mode's share has no meaning under the new one (C59 §2.10.3
     * item 5: each level writes only its own).
     */
    readonly panelDrag: number | null;
    /**
     * The SPLIT: the secondary pane's fraction OF THE REGION, or `null` for no split.
     * ⚠ Of the REGION, never of the window. That is the whole of STR §26.1.2.
     */
    readonly split: number | null;
}

export const EMPTY_VIEW_REGION_STATE: ViewRegionState = Object.freeze({
    claims: Object.freeze({}),
    panelDrag: null,
    split: null,
});

/** The five inline properties that decide `#container`'s box, plus its display. */
export interface RegionBox {
    readonly display: string;
    readonly width: string;
    readonly maxWidth: string;
    readonly flexGrow: string;
    readonly flexShrink: string;
    readonly flexBasis: string;
}

export interface ViewRegionBoxes {
    /** `#container` — the region itself. */
    readonly region: RegionBox;
    /** `#svp-secondary-pane` — the split's secondary pane, placed inside the region. */
    readonly secondaryPane: { readonly width: string; readonly right: string };
    /** `#svp-divider` — the seam between the two, at the pane's outer edge. */
    readonly divider: { readonly right: string; readonly left: string };
}

/**
 * A length as `pct% + px·1px`. Every box here reduces to that shape: a fraction of the
 * shell, plus or minus a fixed panel strip. Kept ADDITIVE so the two terms compose by
 * plain addition — a subtractive spelling made the pixel term change sign between the
 * region (which loses the strip) and the pane's offset (which gains it), which is
 * exactly the kind of arithmetic that is wrong in only one of four states.
 */
interface Length { readonly pct: number; readonly px: number }

const ZERO_LENGTH: Length = { pct: 0, px: 0 };

function addLengths(a: Length, b: Length): Length {
    return { pct: a.pct + b.pct, px: a.px + b.px };
}

function scaleLength(a: Length, k: number): Length {
    return { pct: a.pct * k, px: a.px * k };
}

/**
 * Render a `Length` as CSS. Emitting a plain `A%` whenever the pixel term is zero is
 * not cosmetic — `calc()` is dropped silently by some CSSOM implementations (happy-dom
 * among them), and the cases that actually run (Author, Analysis, Inspect, the legacy
 * split) have no pixel term at all.
 */
function lengthExpr(len: Length): string {
    const a = trim(len.pct);
    const b = trim(len.px);
    if (b === 0) return `${a}%`;
    if (a === 0) return `${b}px`;
    return b < 0 ? `calc(${a}% - ${-b}px)` : `calc(${a}% + ${b}px)`;
}

/** Round to 4 dp and drop trailing zeros, so `0.5` reads `50%` and not `50.0000%`. */
function trim(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(4));
}

/**
 * The claim that actually decides the region, given every claimant plus any live drag.
 *
 * ⚠ THE WIDEST CLAIM WINS, and it is a MEASURED rule rather than a preference: every
 * claimant's surface is `position: fixed; right: 0`, so two live claims do not stack —
 * they overlap, and the wider surface covers the narrower one. The region must
 * therefore be what remains beside the WIDER one, or the view would be drawn into
 * pixels the user cannot see.
 *
 * `shellWidthPx` is used ONLY to compare a pixel claim against a fractional one. With
 * no measurable shell (a test DOM, a pre-layout frame) the comparison falls back to
 * ranking by kind — `all` > `fraction` > `px` > `none` — which is correct for every
 * claim this app actually makes (the one px claim is 420 px; the fractional claims are
 * ≥ 20 %, i.e. wider on any shell under 2100 px) and is stated rather than hidden.
 */
export function effectiveClaim(state: ViewRegionState, shellWidthPx = 0): RegionClaim {
    if (state.panelDrag != null && Number.isFinite(state.panelDrag)) {
        return fractionClaim(state.panelDrag);
    }
    const claims: RegionClaim[] = [];
    for (const id of Object.keys(state.claims) as ViewRegionClaimantId[]) {
        const c = state.claims[id];
        if (c) claims.push(c);
    }
    let best: RegionClaim = CLAIM_NONE;
    for (const c of claims) if (claimWidthRank(c, shellWidthPx) > claimWidthRank(best, shellWidthPx)) best = c;
    return best;
}

/** Comparable width of a claim. Kind-ranked when the shell is unmeasurable. */
function claimWidthRank(c: RegionClaim, shellWidthPx: number): number {
    switch (c.kind) {
        case 'none': return 0;
        case 'all': return Number.MAX_SAFE_INTEGER;
        case 'px': return shellWidthPx > 0 ? c.value : 1;
        case 'fraction': return shellWidthPx > 0 ? c.value * shellWidthPx : 2;
    }
}

/** Everything cleared — `#container` returns to the stylesheet's `flex: 1 1 0`. */
const RELEASED_REGION: RegionBox = Object.freeze({
    display: '', width: '', maxWidth: '', flexGrow: '', flexShrink: '', flexBasis: '',
});
const CLEARED_PANE = Object.freeze({ width: '', right: '' });
const CLEARED_DIVIDER = Object.freeze({ right: '', left: '' });

/**
 * ⭐ THE DERIVATION. Every box in the shell's view area, from one state, in one pass.
 *
 * PURE — no DOM, no globals, no clock. This is what makes the acceptance property
 * (C59 §2.10.4) provable rather than observable: applying a transition twice equals
 * applying it once BECAUSE the boxes are a function of the state and of nothing else.
 */
export function computeViewRegionBoxes(
    state: ViewRegionState,
    shellWidthPx = 0,
): ViewRegionBoxes {
    const claim = effectiveClaim(state, shellWidthPx);

    // A collapsed region has no box to divide. `display: none` is the mode's own
    // statement (Data), not a visibility trick: there is no viewport in that mode.
    if (claim.kind === 'all') {
        return {
            region: {
                display: 'none', width: '0px', maxWidth: '0px',
                flexGrow: '0', flexShrink: '0', flexBasis: 'auto',
            },
            secondaryPane: CLEARED_PANE,
            divider: CLEARED_DIVIDER,
        };
    }

    // THE REGION = the shell minus the claim. `A% + Bpx`, B negative for a px claim.
    const region: Length = claim.kind === 'fraction'
        ? { pct: (1 - claim.value) * 100, px: 0 }
        : claim.kind === 'px'
            ? { pct: 100, px: -claim.value }
            : { pct: 100, px: 0 };
    // THE CLAIM ITSELF, measured from the right edge — the pane's outer offset.
    const claimEdgeLen: Length = claim.kind === 'fraction'
        ? { pct: claim.value * 100, px: 0 }
        : claim.kind === 'px'
            ? { pct: 0, px: claim.value }
            : ZERO_LENGTH;

    const split = normaliseSplit(state.split);

    // ⭐ THE RELEASE CASE, AND IT IS LOAD-BEARING. Nothing claims the shell and nothing
    // divides it, so the region is handed back to `flex: 1 1 0` by CLEARING the
    // properties rather than by writing `100%`. A written `100%` plus `flex-grow: 0`
    // is not the same box as no box at all — it stops the region tracking a dock that
    // opens beside it, which is the founder's *"single view doesn't cover the complete
    // screen"* wearing its other hat.
    if (claim.kind === 'none' && split == null) {
        return { region: RELEASED_REGION, secondaryPane: CLEARED_PANE, divider: CLEARED_DIVIDER };
    }

    const paneShare = split ?? 0;

    // ⭐ THE SPLIT DIVIDES THE REGION, AS A FRACTION OF IT — never of the window.
    const regionWidth = lengthExpr(scaleLength(region, 1 - paneShare));
    const paneLen = scaleLength(region, paneShare);
    const paneWidth = lengthExpr(paneLen);
    // The pane's OUTER edge is the claim: it sits BESIDE the panel, never under it.
    const claimEdge = lengthExpr(claimEdgeLen);
    // The divider sits at the pane's INNER edge: the claim plus the pane's own width.
    const dividerEdge = lengthExpr(addLengths(claimEdgeLen, paneLen));

    return {
        region: {
            display: '',
            width: regionWidth,
            maxWidth: regionWidth,
            // `#container` is `flex: 1 1 0`, so a width alone is NOT binding — the item
            // grows past it. This is the same pair the legacy `_buildDOM` wrote, for the
            // same measured reason, and it is why `WorkspaceController`'s lone
            // `width: '50%'` never actually halved anything.
            flexGrow: '0',
            flexShrink: '0',
            flexBasis: 'auto',
        },
        secondaryPane: split == null
            ? CLEARED_PANE
            : { width: paneWidth, right: claimEdge },
        divider: split == null
            ? CLEARED_DIVIDER
            : { right: dividerEdge, left: 'auto' },
    };
}

/** Clamp a split fraction into a usable band; anything unusable means "no split". */
function normaliseSplit(split: number | null): number | null {
    if (split == null || !Number.isFinite(split)) return null;
    if (split <= 0) return null;
    return Math.min(split, 0.95);
}

// ─────────────────────────────────────────────────────────────────────────────
// The owner (imperative) — module state + the ONE applier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ MODULE STATE, ON PURPOSE, and the precedent is `SplitViewManager._splitRatio` and
 * `halfCanvasResizer`'s `rememberedFraction`. The claimants are three singletons that
 * never see each other (`WorkspaceController`, `DataWorkbench`, `SplitViewManager`) and
 * live in different layers; threading a store through all three is the P6 shape, but
 * this is SHELL GEOMETRY, not domain state — it is not persisted, not undoable, and not
 * broadcast. C59 §2.10.3's requirement is ONE OWNER, and this is it.
 */
let state: ViewRegionState = EMPTY_VIEW_REGION_STATE;

/** The current state — for tests and for a caller that needs to read the level above it. */
export function readViewRegionState(): ViewRegionState {
    return state;
}

/** Test hygiene only. Nothing in production calls this. */
export function resetViewRegionState(): void {
    state = EMPTY_VIEW_REGION_STATE;
}

function shellWidth(): number {
    return typeof window === 'undefined' ? 0 : window.innerWidth || 0;
}

/**
 * ⭐ THE ONE PLACE THE VIEW REGION'S BOX IS WRITTEN.
 *
 * Total: a missing element is a normal state (the split's nodes exist only while it is
 * open), not an error. Never throws into its caller — it is called from the middle of a
 * workspace-mode switch, and a layout writer that could throw would be able to abort the
 * mode change that follows it (the `publishShellCanvasRegion` rule, one level up).
 */
export function applyViewRegion(): void {
    try {
        if (typeof document === 'undefined') return;
        const boxes = computeViewRegionBoxes(state, shellWidth());

        const region = document.getElementById(VIEW_REGION_ELEMENT_ID);
        if (region) {
            const s = region.style;
            s.display = boxes.region.display;
            s.width = boxes.region.width;
            s.maxWidth = boxes.region.maxWidth;
            s.flexGrow = boxes.region.flexGrow;
            s.flexShrink = boxes.region.flexShrink;
            s.flexBasis = boxes.region.flexBasis;
        }

        const pane = document.getElementById(SPLIT_SECONDARY_PANE_ID);
        if (pane) {
            pane.style.width = boxes.secondaryPane.width;
            pane.style.right = boxes.secondaryPane.right;
        }

        const divider = document.getElementById(SPLIT_DIVIDER_ID);
        if (divider) {
            divider.style.right = boxes.divider.right;
            divider.style.left = boxes.divider.left;
        }

        // C06 §15 — the region moved, so every canvas-anchored bar's budget is stale.
        // `publishShellCanvasRegion` measures rather than enumerates and is idempotent;
        // `DockingLayout`'s `ResizeObserver` calls the same function on the same node.
        publishShellCanvasRegion();
    } catch (e) {
        console.warn('[view-region] apply failed (non-fatal):', e);
    }
}

/**
 * The WORKSPACE MODE level's write: how much of the shell this claimant's panel takes.
 *
 * ⛔ A mode declaration also clears any live panel drag. The drag refined the PREVIOUS
 * mode's share; carrying it into a mode that declares its own is how a 62 % Analysis
 * panel ends up pinning the Author viewport to 38 % with nothing beside it.
 */
export function setViewRegionClaim(id: ViewRegionClaimantId, claim: RegionClaim): void {
    state = { ...state, claims: { ...state.claims, [id]: claim }, panelDrag: null };
    applyViewRegion();
}

/**
 * The SPLIT level's write: the secondary pane's fraction OF THE REGION, or `null`.
 *
 * ⛔ The split may not name a claim, a panel, or a window width. It says how the region
 * is divided; this module knows how big the region is. That separation IS §26.1.2.
 */
export function setViewRegionSplit(split: number | null): void {
    state = { ...state, split };
    applyViewRegion();
}

/**
 * A live drag of the panel edge — an override of the effective claim, cleared by the
 * next mode declaration (see `setViewRegionClaim`) or by passing `null`.
 */
export function setViewRegionPanelDrag(fraction: number | null): void {
    state = { ...state, panelDrag: fraction };
    applyViewRegion();
}

/**
 * The panel's own width, as the CSS expression it must be given so it abuts the region
 * exactly. `halfCanvasResizer` writes this onto its surface; nobody derives it twice.
 */
export function viewRegionPanelWidth(shellWidthPx = shellWidth()): string {
    const claim = effectiveClaim(state, shellWidthPx);
    switch (claim.kind) {
        case 'none': return '';
        case 'all': return '100%';
        case 'fraction': return lengthExpr({ pct: claim.value * 100, px: 0 });
        case 'px': return lengthExpr({ pct: 0, px: claim.value });
    }
}
