/**
 * viewRegionGeometry.spec.ts — §VIEW-REGION-HAS-ONE-OWNER
 * (C59 §2 invariant 10 + §2.10.4 · STR §26.1.2 · L-13030)
 *
 * ⭐ THIS IS THE ACCEPTANCE TEST C59 §2.10.4 REQUIRES, AND A LANE MAY NOT CLAIM §2.10
 * WITHOUT IT: *"From Author, split → two views. Switch to Analysis → the panel takes its
 * share and the split survives inside the remaining region, still two views, now narrower.
 * Switch back to Author → the panel yields and the two views expand to fill the shell.
 * Repeat the cycle three times."*
 *
 * ── WHY THE PIXEL ASSERTIONS ARE THE WEAKER HALF ─────────────────────────────
 * The defect (L-13030) was an OSCILLATION, not a wrong number: `DataWorkbench` wrote
 * `50%` to `#container.style.width` for its split mode while `SplitViewManager._buildDOM`
 * wrote `(1-ratio)*100%` plus four flex overrides to the same property; each write resized
 * the canvas, and each resize ran the settle/placement pass that re-asserted the other's
 * value. The founder's console caught the result — `Split view activated` → resize
 * 836→501 → autoframe → `Split view deactivated` → resize 501→836 — repeating SIX times
 * consecutively for ZERO user input. Any single snapshot of that loop can be the "right"
 * pixel width; the loop is still there.
 *
 * ⛔ SO THE PROPERTY THAT CATCHES IT IS TERMINATION, AND IT IS ASSERTED DIRECTLY
 * (C59 §2.10.3, last bullet): *"Every geometry transition is idempotent and terminating —
 * applying it twice equals applying it once, and applying it once triggers no further
 * application."* Both halves are pinned below:
 *
 *   · IDEMPOTENT — `computeViewRegionBoxes` is pure, so applying a transition twice writes
 *     the identical strings. Proved on the model AND on the DOM.
 *   · TERMINATING — a second `applyViewRegion()` after a settled transition changes no
 *     property value at all, so it can fire no `ResizeObserver` and start no second pass.
 *     Counted with a MutationObserver-equivalent (a style snapshot diff), because "it
 *     changed nothing" is the observable, not "it ran once".
 *
 * ⛔ AND WHAT IS DELIBERATELY NOT TESTED, because testing it would bless the forbidden fix
 * (C59 §2.10.2): there is no debounce, no throttle, no re-entrancy guard and no
 * `if (alreadyApplied) return` in the subject, so there is nothing to assert about a guard
 * window. Termination here is a property of the SHAPE — one owner, one pure derivation —
 * which is why it holds at any speed, including an async Cesium mount on a WebGL box.
 *
 * Runs under the ROOT vitest config (happy-dom), which claims
 * `apps/editor/src/engine/__tests__/**\/*.spec.ts` — the same config `PaneHost.spec.ts`
 * runs under. ⚠ `ui/layout/__tests__/` is in NO config's include list, which is why this
 * file is not filed beside its subject: NEVER RAN and PASSED print the same value (§L-849).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    CLAIM_ALL,
    CLAIM_NONE,
    EMPTY_VIEW_REGION_STATE,
    SPLIT_DIVIDER_ID,
    SPLIT_SECONDARY_PANE_ID,
    VIEW_REGION_ELEMENT_ID,
    applyViewRegion,
    computeViewRegionBoxes,
    effectiveClaim,
    fractionClaim,
    pxClaim,
    readViewRegionState,
    resetViewRegionState,
    setViewRegionClaim,
    setViewRegionPanelDrag,
    setViewRegionSplit,
    viewRegionPanelWidth,
    type ViewRegionState,
} from '../../ui/layout/viewRegionGeometry';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — the real shell, in the shape `index.html` builds it.
// ─────────────────────────────────────────────────────────────────────────────

interface Shell {
    region: HTMLElement;
    pane: HTMLElement;
    divider: HTMLElement;
}

/** `#dck-workspace` flex row › `#container`, plus the split's two body-level nodes. */
function mountShell(): Shell {
    const row = document.createElement('div');
    row.id = 'dck-workspace';
    const region = document.createElement('div');
    region.id = VIEW_REGION_ELEMENT_ID;
    row.appendChild(region);
    document.body.appendChild(row);

    // `SplitViewManager._buildDOM` appends both of these to `document.body`, not to the
    // region: `.svp-pane` is `position: fixed; right: 0`. That is WHY "the split divides
    // the region" has to be arithmetic rather than nesting.
    const pane = document.createElement('div');
    pane.id = SPLIT_SECONDARY_PANE_ID;
    document.body.appendChild(pane);
    const divider = document.createElement('div');
    divider.id = SPLIT_DIVIDER_ID;
    document.body.appendChild(divider);

    return { region, pane, divider };
}

/** Every property this lane put under one owner, as one comparable snapshot. */
function snapshot(shell: Shell): string {
    const r = shell.region.style;
    return JSON.stringify({
        region: [r.display, r.width, r.maxWidth, r.flexGrow, r.flexShrink, r.flexBasis],
        pane: [shell.pane.style.width, shell.pane.style.right],
        divider: [shell.divider.style.right, shell.divider.style.left],
    });
}

const state = (over: Partial<ViewRegionState> = {}): ViewRegionState => ({
    ...EMPTY_VIEW_REGION_STATE,
    ...over,
});

let shell: Shell;

beforeEach(() => {
    document.body.innerHTML = '';
    resetViewRegionState();
    shell = mountShell();
});

afterEach(() => {
    resetViewRegionState();
    document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
// §2.10.3 — the model. Pure, so these need no DOM at all.
// ─────────────────────────────────────────────────────────────────────────────

describe('§2.10.3 item 2 — the WORKSPACE MODE sizes the region, and nothing else', () => {
    it('Author (no claim, no split) RELEASES the box rather than writing 100%', () => {
        const b = computeViewRegionBoxes(state());
        // ⛔ A written `100%` plus `flex-grow: 0` is NOT the same box as no box at all: it
        // stops the region tracking a dock that opens beside it. That is the founder's
        // *"the single view doesn't cover the complete screen"* wearing its other hat.
        expect(b.region).toEqual({
            display: '', width: '', maxWidth: '', flexGrow: '', flexShrink: '', flexBasis: '',
        });
    });

    it('a half-canvas mode leaves the region at the complement of the panel', () => {
        const b = computeViewRegionBoxes(state({ claims: { 'workspace-mode': fractionClaim(0.5) } }));
        expect(b.region.width).toBe('50%');
        // ⭐ AND THE FLEX TRIPLE, WHICH IS THE HALF THAT WAS MISSING IN PRODUCTION.
        // `#container` is `flex: 1 1 0`, so `WorkspaceController`'s lone `width: '50%'`
        // was overridden by flex-grow and the viewport stayed FULL width with the panel
        // merely covering its right half. The mode has been declaring a half canvas and
        // rendering a whole one.
        expect(b.region.maxWidth).toBe('50%');
        expect(b.region.flexGrow).toBe('0');
        expect(b.region.flexShrink).toBe('0');
        expect(b.region.flexBasis).toBe('auto');
    });

    it('a pixel claim (the 420 px DataWorkbench panel) stays a calc, not a resolved number', () => {
        const b = computeViewRegionBoxes(state({ claims: { 'data-workbench': pxClaim(420) } }));
        // Resolving it against a live `innerWidth` would be wrong the instant the window
        // resized; a `calc` is re-evaluated by the browser for free.
        expect(b.region.width).toBe('calc(100% - 420px)');
    });

    it('Data mode collapses the region and says so with display:none', () => {
        const b = computeViewRegionBoxes(state({ claims: { 'workspace-mode': CLAIM_ALL } }));
        expect(b.region.display).toBe('none');
        expect(b.region.width).toBe('0px');
    });

    it('the WIDEST claim wins when two panels are up — they overlap at right:0, they do not stack', () => {
        const s = state({ claims: { 'workspace-mode': fractionClaim(0.5), 'data-workbench': pxClaim(420) } });
        expect(effectiveClaim(s, 1600)).toEqual(fractionClaim(0.5)); // 800px > 420px
        expect(effectiveClaim(s, 700)).toEqual(pxClaim(420));        // 350px < 420px
    });
});

describe('§2.10.3 item 3 — the SPLIT divides the REGION, never the window', () => {
    it('in Author the region halves into two panes and the pair still covers the shell', () => {
        const b = computeViewRegionBoxes(state({ split: 0.4 }));
        expect(b.region.width).toBe('60%');
        expect(b.secondaryPane.width).toBe('40%');
        expect(b.secondaryPane.right).toBe('0%');
        expect(b.divider.right).toBe('40%');
    });

    it('⭐ THE FOUNDER\'S SENTENCE, AS ARITHMETIC — in Analysis the split divides the REMAINING half', () => {
        // STR §26.1.2, verbatim: *"if in AUTHOR, then split view will divide the view in 2.
        // But in ANALYSE view, then split view will divide THE LEFT HAND SIDE VIEW in 2."*
        const b = computeViewRegionBoxes(state({
            claims: { 'workspace-mode': fractionClaim(0.5) },
            split: 0.4,
        }));
        // The region is half the shell; 60/40 OF THAT is 30 % and 20 %.
        expect(b.region.width).toBe('30%');
        expect(b.secondaryPane.width).toBe('20%');
        // ⛔ AND THIS IS THE LINE THAT DISSOLVES L-12915. The pane's outer edge is the
        // panel's edge, so it sits BESIDE the Analysis surface (z-index 50, `right: 0`)
        // instead of underneath it. `halfCanvasSplitViewPolicy` existed only to close the
        // pane before it could be occluded; with the offset there is nothing to close, and
        // therefore no unrequested activate/deactivate pair.
        expect(b.secondaryPane.right).toBe('50%');
        expect(b.divider.right).toBe('70%');
    });

    it('⛔ the analysis panel is never one half of the split — the three widths tile the shell', () => {
        const b = computeViewRegionBoxes(state({
            claims: { 'workspace-mode': fractionClaim(0.5) },
            split: 0.4,
        }));
        const region = parseFloat(b.region.width);
        const pane = parseFloat(b.secondaryPane.width);
        const panel = 50;
        expect(region + pane + panel).toBeCloseTo(100, 5);
    });

    it('composes a pixel panel with a fractional split without losing either term', () => {
        const b = computeViewRegionBoxes(
            state({ claims: { 'data-workbench': pxClaim(420) }, split: 0.25 }),
        );
        expect(b.region.width).toBe('calc(75% - 315px)');
        expect(b.secondaryPane.width).toBe('calc(25% - 105px)');
        expect(b.secondaryPane.right).toBe('420px');
        // 420 + (25% - 105px) — the pixel terms partly cancel, which is exactly the sign
        // error an additive Length representation exists to prevent.
        expect(b.divider.right).toBe('calc(25% + 315px)');
    });

    it('the panel width the resizer writes is the SAME number the pane is offset by', () => {
        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        setViewRegionSplit(0.4);
        const b = computeViewRegionBoxes(readViewRegionState());
        // One number, two renderings. A gap or an overlap between the panel's left edge and
        // the split pane's right edge is the first failure mode a two-writer boundary has.
        expect(viewRegionPanelWidth(0)).toBe(b.secondaryPane.right);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2.10.4 — THE ACCEPTANCE TEST, on the real DOM, three cycles.
// ─────────────────────────────────────────────────────────────────────────────

describe('§2.10.4 — the acceptance cycle: Author ⇄ Analysis with a live split, three times', () => {
    it('the split SURVIVES the mode change, narrower, and the shell is fully covered in every state', () => {
        // From Author, split → two views.
        setViewRegionClaim('workspace-mode', CLAIM_NONE);
        setViewRegionSplit(0.4);
        expect(shell.region.style.width).toBe('60%');
        expect(shell.pane.style.width).toBe('40%');

        for (let cycle = 1; cycle <= 3; cycle++) {
            // → Analysis. The ONLY thing the mode says is how big the region is.
            setViewRegionClaim('workspace-mode', fractionClaim(0.5));

            // ⭐ THE COUNT OF VIEWS NEVER CHANGES. The split is still declared, and both
            // pane boxes are still non-zero — no pane blanks, and nothing had to be closed
            // and reopened to get here.
            expect(readViewRegionState().split, `cycle ${cycle}`).toBe(0.4);
            expect(shell.region.style.width, `cycle ${cycle}`).toBe('30%');
            expect(shell.pane.style.width, `cycle ${cycle}`).toBe('20%');
            expect(shell.pane.style.right, `cycle ${cycle}`).toBe('50%');
            // Fully covered: 30 (view) + 20 (view) + 50 (panel) = 100.
            expect(
                parseFloat(shell.region.style.width) + parseFloat(shell.pane.style.width) + 50,
                `cycle ${cycle} coverage`,
            ).toBeCloseTo(100, 5);

            // → back to Author. The panel yields and the two views expand to fill the shell.
            setViewRegionClaim('workspace-mode', CLAIM_NONE);
            expect(readViewRegionState().split, `cycle ${cycle}`).toBe(0.4);
            expect(shell.region.style.width, `cycle ${cycle}`).toBe('60%');
            expect(shell.pane.style.width, `cycle ${cycle}`).toBe('40%');
            expect(shell.pane.style.right, `cycle ${cycle}`).toBe('0%');
            expect(
                parseFloat(shell.region.style.width) + parseFloat(shell.pane.style.width),
                `cycle ${cycle} coverage`,
            ).toBeCloseTo(100, 5);
        }
    });

    it('⭐ IDEMPOTENT — applying a transition twice equals applying it once', () => {
        setViewRegionSplit(0.4);
        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        const once = snapshot(shell);

        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        expect(snapshot(shell)).toBe(once);

        // …and a bare re-apply, which is what every settle / placement / ResizeObserver
        // pass in the shell ultimately triggers.
        applyViewRegion();
        applyViewRegion();
        expect(snapshot(shell)).toBe(once);
    });

    it('⭐ TERMINATING — a settled transition changes NO property on a second pass', () => {
        // ⛔ THIS IS THE ONE THAT CATCHES THE OSCILLATION. A style write whose value is
        // unchanged moves no box, so it fires no `ResizeObserver`, so it starts no settle
        // pass, so nothing re-asserts anything. The old shape could not have this property
        // at any speed: `DataWorkbench` wrote 50 % and `SplitViewManager` wrote 60 % to the
        // same node, so every pass genuinely changed the value and genuinely re-triggered.
        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        setViewRegionSplit(0.4);

        const settled = snapshot(shell);
        for (let i = 0; i < 10; i++) {
            applyViewRegion();
            expect(snapshot(shell), `pass ${i}`).toBe(settled);
        }
    });

    it('⭐ ORDER-INDEPENDENT — mode-then-split and split-then-mode reach the same geometry', () => {
        // The founder's console showed the two orders producing different resting points
        // ("Author still split on the left" / "non-split is already split" / "single view
        // doesn't cover the screen" were three of them). With one derivation there is one
        // answer: the state is a set of declarations, not a sequence of writes.
        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        setViewRegionSplit(0.4);
        const modeFirst = snapshot(shell);

        resetViewRegionState();
        setViewRegionSplit(0.4);
        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        expect(snapshot(shell)).toBe(modeFirst);
    });

    it('closing the split releases the region entirely — Author covers the whole shell', () => {
        setViewRegionSplit(0.4);
        setViewRegionSplit(null);
        expect(shell.region.style.width).toBe('');
        expect(shell.region.style.maxWidth).toBe('');
        expect(shell.region.style.flexGrow).toBe('');
        expect(shell.pane.style.width).toBe('');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2.10.3 item 5 — reads go up, writes go down.
// ─────────────────────────────────────────────────────────────────────────────

describe('§2.10.3 item 5 — each level writes only its own', () => {
    it('a mode declaration discards a panel drag that refined the PREVIOUS mode', () => {
        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        setViewRegionPanelDrag(0.62);
        expect(shell.region.style.width).toBe('38%');

        // Analysis → Author. The new mode declares its own share; a 62 % drag carried into
        // it would pin the Author viewport at 38 % with nothing beside it.
        setViewRegionClaim('workspace-mode', CLAIM_NONE);
        expect(readViewRegionState().panelDrag).toBeNull();
        expect(shell.region.style.width).toBe('');
    });

    it('the SPLIT never names a claim and the CLAIM never names a split', () => {
        setViewRegionSplit(0.4);
        expect(readViewRegionState().claims).toEqual({});
        setViewRegionClaim('workspace-mode', fractionClaim(0.5));
        expect(readViewRegionState().split).toBe(0.4);
    });

    it('is total on a shell that has not been built yet — a missing node is a normal state', () => {
        document.body.innerHTML = '';
        expect(() => {
            setViewRegionClaim('workspace-mode', fractionClaim(0.5));
            setViewRegionSplit(0.4);
            applyViewRegion();
        }).not.toThrow();
    });

    it('a nonsense split is no split, and a nonsense claim is no claim', () => {
        expect(computeViewRegionBoxes(state({ split: Number.NaN })).region.width).toBe('');
        expect(computeViewRegionBoxes(state({ split: 0 })).region.width).toBe('');
        expect(fractionClaim(Number.NaN)).toEqual(CLAIM_NONE);
        expect(fractionClaim(-1)).toEqual(CLAIM_NONE);
        expect(fractionClaim(2)).toEqual(CLAIM_ALL);
        expect(pxClaim(0)).toEqual(CLAIM_NONE);
    });
});
