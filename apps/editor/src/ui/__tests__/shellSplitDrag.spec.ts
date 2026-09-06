/**
 * §SHELL-SPLIT-DRAG (L-12983) — the founder can drag the boundary between the view and
 * the Parcel Law / Analysis panel, and the drag cannot leave the shell broken behind it.
 *
 * Founder 2026-09-06, with a screenshot of the PARCEL LAW tab: *"the user shall be able to
 * DRAG THE WIDTH of the view left/right on demand — we can do that on split view already —
 * do it sound — the same (check if there are any bugs)."*
 *
 * ⛔ WHAT THIS SUITE IS ACTUALLY GUARDING, and it is not "a number goes up". The boundary
 * is TWO inline widths on TWO elements owned by THREE writers with no protocol between them
 * (`WorkspaceController._applyLayout`, `SplitViewManager._buildDOM`, and this handle —
 * `halfCanvasSplitViewPolicy.ts` documents the first two fighting over the same property).
 * The failure modes that cost the founder his viewport are therefore:
 *
 *   1. the two halves of the boundary disagreeing (a gap, or the panel over the canvas);
 *   2. a `max-width` left on `#container` after the handle is gone — `_applyLayout`'s
 *      full-canvas branch clears `width` and says NOTHING about `max-width`, so a leftover
 *      pins the Author viewport at the dragged fraction with no panel beside it;
 *   3. the handle clearing a width that belonged to somebody else (a split pane reopened by
 *      the same `_applyLayout` pass, one line before the mode event this handle hears).
 *
 * Cases 2 and 3 pull in opposite directions, which is why "restore what I found" and "clear
 * everything" are both wrong and the rule is "clear only the exact string I last wrote".
 *
 * Runs under the ROOT vitest config (happy-dom), which already claims
 * `apps/editor/src/ui/__tests__/**\/*.spec.ts`. ⚠ Deliberately NOT placed in
 * `ui/layout/__tests__/` — that directory is NOT in any config's include list, so a spec
 * there would never run, and NEVER RAN and PASSED print the same value (§L-849).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    SHELL_SPLIT_DEFAULT_RIGHT,
    SHELL_SPLIT_MAX_RIGHT,
    SHELL_SPLIT_MIN_RIGHT,
    clampSplitFraction,
    leftFractionFromPointerX,
    percent,
    rightFractionFromPointerX,
} from '../layout/shellSplitRatio';
import {
    HALF_CANVAS_RESIZER_TESTID,
    RESIZER_HALF_WIDTH_PX,
    RESIZER_Z_INDEX,
    mountHalfCanvasResizer,
    rememberedHalfCanvasFraction,
    resetRememberedHalfCanvasFractions,
    type HalfCanvasResizerHandle,
} from '../layout/halfCanvasResizer';

// ─────────────────────────────────────────────────────────────────────────────
// The PURE half — the arithmetic both dividers now share.
// ─────────────────────────────────────────────────────────────────────────────

describe('§SHELL-SPLIT-DRAG — the clamp has ONE owner', () => {
    it('reproduces SplitViewManager\'s own bounds (0.20 … 0.65)', () => {
        expect(SHELL_SPLIT_MIN_RIGHT).toBe(0.20);
        expect(SHELL_SPLIT_MAX_RIGHT).toBe(0.65);
        expect(clampSplitFraction(0.01)).toBe(0.20);
        expect(clampSplitFraction(0.99)).toBe(0.65);
        expect(clampSplitFraction(0.42)).toBeCloseTo(0.42, 10);
    });

    it('a NaN fraction returns the caller\'s fallback, NOT the minimum', () => {
        // Clamping NaN to `min` collapses the panel to its narrowest and looks deliberate.
        // The fallback leaves the drag where it was, which is the honest answer to
        // "I could not measure this pointer".
        expect(clampSplitFraction(Number.NaN, 0.2, 0.65, 0.5)).toBe(0.5);
        expect(clampSplitFraction(Number.POSITIVE_INFINITY, 0.2, 0.65, 0.33)).toBe(0.33);
    });

    it('rightFractionFromPointerX is (width - x) / width, clamped', () => {
        expect(rightFractionFromPointerX(600, 1000)).toBeCloseTo(0.40, 10);
        expect(rightFractionFromPointerX(0, 1000)).toBe(SHELL_SPLIT_MAX_RIGHT);
        expect(rightFractionFromPointerX(1000, 1000)).toBe(SHELL_SPLIT_MIN_RIGHT);
    });

    it('an UNMEASURABLE viewport is not "dragged to the edge"', () => {
        // happy-dom reports 0 for every layout box, and so does a detached element in a
        // real browser. Dividing by it yields Infinity, which clamps to a maximum the user
        // never asked for — a guess wearing a measurement (C57 §1.5).
        expect(rightFractionFromPointerX(500, 0, { fallback: 0.5 })).toBe(0.5);
        expect(leftFractionFromPointerX(500, { left: 0, width: 0 }, { fallback: 0.5 })).toBe(0.5);
    });

    it('leftFractionFromPointerX measures from the HOST RECT, not the viewport', () => {
        // The pane shell's divider lives inside a host that may not start at x=0. Folding
        // the two origins into one call with a flag is how the origin gets passed wrongly,
        // so they stay two functions.
        expect(leftFractionFromPointerX(600, { left: 200, width: 800 })).toBeCloseTo(0.5, 10);
    });

    it('percent() matches _applyDragRatio\'s two decimals', () => {
        expect(percent(0.4)).toBe('40.00%');
        expect(percent(SHELL_SPLIT_DEFAULT_RIGHT)).toBe('50.00%');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The DOM half — the handle.
// ─────────────────────────────────────────────────────────────────────────────

let handle: HalfCanvasResizerHandle | null = null;

function setup(): { surface: HTMLElement; canvas: HTMLElement } {
    const canvas = document.createElement('div');
    canvas.id = 'container';
    canvas.style.width = '50%'; // what `_applyLayout`'s 'half' branch has just written
    document.body.appendChild(canvas);

    const surface = document.createElement('div');
    surface.id = 'anl-surface';
    document.body.appendChild(surface);
    return { surface, canvas };
}

function mount(surface: HTMLElement, extra: Record<string, unknown> = {}): HalfCanvasResizerHandle {
    handle = mountHalfCanvasResizer({
        surface,
        viewportWidth: () => 1000,
        ...extra,
    });
    return handle;
}

/** Press, move to `x`, release — the whole gesture, exactly as a mouse produces it. */
function drag(h: HalfCanvasResizerHandle, x: number): void {
    h.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

beforeEach(() => {
    resetRememberedHalfCanvasFractions();
});

afterEach(() => {
    handle?.dispose();
    handle = null;
    document.body.innerHTML = '';
});

describe('§SHELL-SPLIT-DRAG — the handle exists and is reachable', () => {
    it('mounts a grab band on the seam, wider than the seam', () => {
        const { surface } = setup();
        const h = mount(surface);
        expect(h.element.getAttribute('data-testid')).toBe(HALF_CANVAS_RESIZER_TESTID);
        expect(h.element.style.cursor).toBe('col-resize');
        // 1 px seam + 6 px each side. A 1 px pointer target is the trap §SEAM-HAIRLINE-WHITE
        // exists to close, and it is the same trap here.
        expect(parseFloat(h.element.style.width)).toBe(RESIZER_HALF_WIDTH_PX * 2 + 1);
        expect(h.element.style.marginRight).toBe(`-${RESIZER_HALF_WIDTH_PX}px`);
    });

    it('⛔ sits ABOVE every surface that can occupy the canvas region', () => {
        // MEASURED, not chosen. Cesium's container is z-index 15 (`CESIUM_Z`), the
        // site-authoring pane shell root is 14, and `#anl-surface` is 50. A handle below
        // any of them is a handle the pointer never reaches — which is exactly the defect
        // this lane found in the pane shell's own 1 px seam (L-12984).
        const { surface } = setup();
        const h = mount(surface);
        expect(Number(h.element.style.zIndex)).toBe(RESIZER_Z_INDEX);
        expect(Number(h.element.style.zIndex)).toBeGreaterThan(50); // #anl-surface
        expect(Number(h.element.style.zIndex)).toBeGreaterThan(15); // CESIUM_Z
    });

    it('is keyboard-reachable — a pointer-only resize is unreachable (C43)', () => {
        const { surface } = setup();
        const h = mount(surface);
        expect(h.element.tabIndex).toBe(0);
        expect(h.element.getAttribute('role')).toBe('separator');
        expect(h.element.getAttribute('aria-orientation')).toBe('vertical');
    });
});

describe('§SHELL-SPLIT-DRAG — one fraction, BOTH halves of the boundary', () => {
    it('opens at the 50/50 the mode declares', () => {
        const { surface, canvas } = setup();
        const h = mount(surface);
        expect(h.fraction()).toBe(0.5);
        expect(surface.style.width).toBe('50.00%');
        expect(canvas.style.width).toBe('50.00%');
    });

    it('a drag moves the canvas and the panel to complementary widths', () => {
        const { surface, canvas } = setup();
        const h = mount(surface);
        drag(h, 700); // pointer at 700/1000 ⇒ the panel takes the remaining 30%
        expect(h.fraction()).toBeCloseTo(0.30, 5);
        expect(surface.style.width).toBe('30.00%');
        expect(canvas.style.width).toBe('70.00%');
        // The pair always sums to 100 — a gap or an overlap between the two halves is the
        // first failure mode this suite exists for.
        expect(parseFloat(surface.style.width) + parseFloat(canvas.style.width)).toBeCloseTo(100, 5);
    });

    it('sets max-width alongside width — #container is flex: 1 1 0', () => {
        const { surface, canvas } = setup();
        const h = mount(surface);
        drag(h, 700);
        expect(canvas.style.maxWidth).toBe('70.00%');
    });

    it('refuses to drag past the shared clamp', () => {
        const { surface } = setup();
        const h = mount(surface);
        drag(h, 5);
        expect(h.fraction()).toBe(SHELL_SPLIT_MAX_RIGHT);
        drag(h, 995);
        expect(h.fraction()).toBe(SHELL_SPLIT_MIN_RIGHT);
    });

    it('arrow keys move the seam and Home restores the 50/50', () => {
        const { surface } = setup();
        const h = mount(surface);
        h.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(h.fraction()).toBeCloseTo(0.52, 5);
        h.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(h.fraction()).toBe(0.5);
    });

    it('commits ONCE per gesture, not once per pointer event', () => {
        const { surface } = setup();
        let commits = 0;
        const h = mount(surface, { onCommit: () => { commits++; } });
        h.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500 }));
        for (const x of [520, 540, 560, 580, 600]) {
            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x }));
        }
        expect(commits).toBe(0);
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        expect(commits).toBe(1);
    });

    it('a mousemove with no press does nothing', () => {
        const { surface, canvas } = setup();
        mount(surface);
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 900 }));
        expect(canvas.style.width).toBe('50.00%');
    });
});

describe('§SHELL-SPLIT-DRAG — the width the founder chose survives leaving the tab', () => {
    it('remembers the fraction per surface for the session', () => {
        const { surface } = setup();
        const h = mount(surface);
        drag(h, 700);
        expect(rememberedHalfCanvasFraction('anl-surface')).toBeCloseTo(0.30, 5);
        h.dispose();
        handle = null;

        const again = mount(surface);
        expect(again.fraction()).toBeCloseTo(0.30, 5);
        expect(surface.style.width).toBe('30.00%');
    });
});

describe('§SHELL-SPLIT-DRAG — dispose clears its OWN marks and nothing else', () => {
    it('⛔ leaves no max-width behind — the one that pins the next mode\'s viewport', () => {
        const { surface, canvas } = setup();
        const h = mount(surface);
        drag(h, 700);
        expect(canvas.style.maxWidth).toBe('70.00%');
        h.dispose();
        handle = null;
        // `_applyLayout`'s full-canvas branch clears `width` and never mentions `max-width`.
        // A leftover here is invisible until the founder wonders why Author is 70 % wide.
        expect(canvas.style.maxWidth).toBe('');
        expect(canvas.style.width).toBe('');
    });

    it('⛔ does NOT clear a width another owner wrote after it', () => {
        // The exact production sequence: `_applyLayout` closes/opens the split pane and
        // writes `#container` BEFORE emitting `pryzm-workspace-mode`, which is what tears
        // this handle down. Whatever is on the node at dispose time may not be ours.
        const { surface, canvas } = setup();
        const h = mount(surface);
        drag(h, 700);
        canvas.style.width = '60.00%';      // SplitViewManager._buildDOM, one line later
        canvas.style.maxWidth = '60.00%';
        h.dispose();
        handle = null;
        expect(canvas.style.width).toBe('60.00%');
        expect(canvas.style.maxWidth).toBe('60.00%');
    });

    it('removes the handle and stops listening', () => {
        const { surface, canvas } = setup();
        const h = mount(surface);
        h.dispose();
        handle = null;
        expect(document.querySelector(`[data-testid="${HALF_CANVAS_RESIZER_TESTID}"]`)).toBeNull();
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 900 }));
        expect(canvas.style.width).toBe('');
    });

    it('is idempotent', () => {
        const { surface } = setup();
        const h = mount(surface);
        h.dispose();
        expect(() => h.dispose()).not.toThrow();
        handle = null;
    });
});
