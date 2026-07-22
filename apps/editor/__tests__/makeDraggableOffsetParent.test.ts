// @vitest-environment happy-dom
// §L-577b — a single CLICK on a draggable panel's header must not MOVE the panel.
//
// THE BUG THIS LOCKS DOWN. `makeDraggable` documented an assumption (`position: fixed`) that the
// buildable-envelope panel does not meet: it is `position: absolute` inside the 3D-Site right pane.
// `getBoundingClientRect()` is VIEWPORT-relative, but `style.left` on an absolutely-positioned
// element is measured from its OFFSET PARENT. Writing one into the other displaced the panel by the
// pane's own left edge — ~600–950 px in the real layout — so one click launched it off-screen.
// Reported as "as soon as I select the panel it disappears", and invisible to anyone who never
// clicked the header. The viewport clamp could not save it: a click produces no mousemove.
//
// ⚠ THE GEOMETRY IS STUBBED DELIBERATELY. happy-dom has no layout engine, so every
// `getBoundingClientRect()` would return zeros and the assertion below would pass no matter what
// the code did — a vacuous test, which is worse than no test. Stubbing real numbers is what makes
// this able to FAIL.

import { describe, it, expect, beforeEach } from 'vitest';
import { makeDraggable } from '../src/ui/makeDraggable';

/** Give an element a fixed on-screen box that happy-dom will otherwise report as all-zero. */
function stubRect(el: HTMLElement, left: number, top: number, width: number, height: number): void {
    el.getBoundingClientRect = () => ({
        left, top, width, height, right: left + width, bottom: top + height,
        x: left, y: top, toJSON: () => ({}),
    }) as DOMRect;
}

describe('§L-577b makeDraggable — offset-parent awareness', () => {
    let pane: HTMLElement;
    let panel: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = '';
        // The 3D-Site RIGHT PANE: an offset container whose left edge is far into the window.
        pane = document.createElement('div');
        pane.style.position = 'relative';
        document.body.appendChild(pane);
        stubRect(pane, 620, 0, 800, 1100);

        panel = document.createElement('div');
        panel.style.position = 'absolute';
        panel.style.top = '108px';
        panel.style.right = '16px';
        panel.innerHTML = '<div data-envelope-drag="1">header</div><div>body</div>';
        pane.appendChild(panel);
        // The panel sits near the right of the pane ⇒ viewport-left 1104, pane-relative left 484.
        stubRect(panel, 1104, 108, 300, 400);

        // happy-dom does not implement offsetParent — provide it, since it IS the thing under test.
        Object.defineProperty(panel, 'offsetParent', { value: pane, configurable: true });
    });

    it('a click on the handle pins the panel to its OFFSET-PARENT space, not viewport space', () => {
        makeDraggable(panel, '[data-envelope-drag]');
        const handle = panel.querySelector('[data-envelope-drag]') as HTMLElement;

        handle.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, clientX: 1150, clientY: 120,
        }));

        // 1104 (viewport) − 620 (pane origin) = 484. The OLD code wrote 1104 here, shoving the
        // panel 620 px further right — off the screen entirely.
        expect(panel.style.left).toBe('484px');
        expect(panel.style.top).toBe('108px');
    });

    it('⚠ THE REGRESSION ITSELF — a click must not move the panel on screen at all', () => {
        makeDraggable(panel, '[data-envelope-drag]');
        const handle = panel.querySelector('[data-envelope-drag]') as HTMLElement;

        handle.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, clientX: 1150, clientY: 120,
        }));

        // Where the pinned left/top place the panel back in VIEWPORT space.
        const paneLeft = pane.getBoundingClientRect().left;
        const paneTop = pane.getBoundingClientRect().top;
        const resultingViewportLeft = parseFloat(panel.style.left) + paneLeft;
        const resultingViewportTop = parseFloat(panel.style.top) + paneTop;

        expect(resultingViewportLeft).toBe(1104);   // exactly where it already was
        expect(resultingViewportTop).toBe(108);
    });

    it('still pins verbatim for a position:fixed panel — the original contract is unchanged', () => {
        panel.style.position = 'fixed';
        // A fixed element has no offset parent; left/top ARE viewport coordinates.
        Object.defineProperty(panel, 'offsetParent', { value: null, configurable: true });

        makeDraggable(panel, '[data-envelope-drag]');
        (panel.querySelector('[data-envelope-drag]') as HTMLElement).dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, clientX: 1150, clientY: 120 }),
        );

        expect(panel.style.left).toBe('1104px');
        expect(panel.style.top).toBe('108px');
    });

    it('neutralises the centring shorthands that would fight the pin (§DRAG-SHIFT-FIX)', () => {
        makeDraggable(panel, '[data-envelope-drag]');
        (panel.querySelector('[data-envelope-drag]') as HTMLElement).dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, clientX: 1150, clientY: 120 }),
        );
        // `right: 16px` was set above and would keep fighting the new `left`.
        expect(panel.style.right).toBe('auto');
        expect(panel.style.bottom).toBe('auto');
        expect(panel.style.transform).toBe('none');
    });

    it('does not start a drag from an excluded child', () => {
        panel.innerHTML = '<div data-envelope-drag="1">h<button data-testid="envelope-toggle">x</button></div>';
        makeDraggable(panel, '[data-envelope-drag]', ['[data-testid="envelope-toggle"]']);
        (panel.querySelector('[data-testid="envelope-toggle"]') as HTMLElement).dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, clientX: 1150, clientY: 120 }),
        );
        expect(panel.style.left).toBe('');   // untouched
    });
});
