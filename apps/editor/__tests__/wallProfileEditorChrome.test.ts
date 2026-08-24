// @vitest-environment happy-dom
/**
 * §WPE-CHROME-LAYER (L-10200/L-10201) — the wall profile editor's OVERLAY: everything it did
 * before the move to L7, plus the drag/resize chrome the founder asked for, plus the one
 * thing that can silently break while every other test still passes.
 *
 * ⭐ THE RISK THIS SUITE EXISTS FOR, stated first because it is not the obvious one.
 *
 * "Make the panel resizable" sounds like chrome. It is not. This panel draws a wall to scale
 * — the founder's screenshot reads *"Edit Wall Profile — 10.106 m long, 2.700 m high"* and
 * *"4 vertices, enclosed area 25.666 m2"* — and the vertices the user drags are read back
 * OUT of pixels, through the same map that put them there. If a resize changed the aspect
 * ratio, or changed `pad` in the forward map but not the inverse, the panel would keep
 * looking right and start producing WRONG METRES. A drag test would not notice. A snapshot
 * test would not notice. So the resize assertions below are dimensional, not visual:
 *
 *   • the reported enclosed area is IDENTICAL at every size (and it is the founder's 25.666);
 *   • not one vertex moves;
 *   • the drawn wall-extent rectangle keeps the wall's own aspect ratio EXACTLY;
 *   • `toModel(toPx(p)) === p` for every vertex at every size;
 *   • and a real vertex drag AFTER a resize lands on the metres it was aimed at.
 *
 * ⚠ AND THE SCALE MUST ACTUALLY CHANGE. An invariance test over a value that never moved is
 * vacuous — [[fake-more-capable-than-real]] in miniature. `pxPerMetre` is asserted to differ
 * between sizes BEFORE the invariants are asserted across them.
 *
 * ⚠ GEOMETRY IS STUBBED DELIBERATELY, the same way `makeDraggableOffsetParent.test.ts` does
 * it and for the same reason: happy-dom has no layout engine, so every
 * `getBoundingClientRect()` returns zeros and a drag assertion would pass no matter what the
 * code did. Stubbing real numbers is what makes these able to FAIL.
 *
 * ⚠ WHAT THIS SUITE CANNOT PROVE, stated rather than implied: that the CSS flexbox actually
 * keeps the action row on screen at the minimum size. happy-dom does not lay out. What is
 * proved instead is the mechanism that makes it true — the only `overflow:hidden` box is the
 * canvas wrapper, the action row is a `flex:0 0 auto` sibling outside it, `makeResizable`
 * receives the declared floors, and **Apply still commits after the most extreme resize this
 * panel can reach**. The last of those is behavioural, and it is the one that matters.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallProfileEditor } from '../src/ui/WallProfileEditor';

/** Give an element a fixed on-screen box that happy-dom would otherwise report as all-zero. */
function stubRect(el: Element, left: number, top: number, width: number, height: number): void {
    el.getBoundingClientRect = () => ({
        left, top, width, height, right: left + width, bottom: top + height,
        x: left, y: top, toJSON: () => ({}),
    }) as DOMRect;
}

const root = () => document.getElementById('wall-profile-editor')!;
const svgEl = () => document.querySelector('#wall-profile-editor svg') as SVGSVGElement;
const titleBar = () => document.querySelector('.wpe-titlebar') as HTMLElement;
const grip = () => document.querySelector('.wpe-resize-grip') as HTMLElement;
const wrap = () => document.querySelector('.wpe-canvas-wrap') as HTMLElement;
const boundRect = () => document.querySelector('#wall-profile-editor svg rect') as SVGRectElement;

function handleLayerChildren(): Element[] {
    return Array.from(document.querySelector('#wall-profile-editor svg g')!.children);
}
/** Midpoints are appended first, one per edge, then one vertex handle per vertex. */
function midHandles(): Element[] {
    const c = handleLayerChildren();
    return c.slice(0, c.length / 2);
}
function vertexHandles(): Element[] {
    const c = handleLayerChildren();
    return c.slice(c.length / 2);
}
function clickButton(label: string): void {
    const btn = Array.from(document.querySelectorAll('#wall-profile-editor button'))
        .find((b) => b.textContent === label) as HTMLButtonElement | undefined;
    if (!btn) throw new Error(`no "${label}" button in the profile editor overlay`);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

let editor: WallProfileEditor;

beforeEach(() => {
    document.body.replaceChildren();
    editor = new WallProfileEditor();
});
afterEach(() => {
    editor.deactivate();
});

const subject = { wallId: 'w1', length: 4, height: 3, ring: null };

// ─────────────────────────────────────────────────────────────────────────────
// (3)+(4) — MOVED VERBATIM IN INTENT from
// packages/geometry-wall/__tests__/WPE1WallProfileEditMode.test.ts. Nothing was dropped in
// the L2 → L7 move; these are the same behaviours, asserted at the layer that now owns them.
// ─────────────────────────────────────────────────────────────────────────────
describe('§FEAT-WALL-PROFILE-EDIT (3+4) — the overlay opens, edits and commits', () => {
    it('activate puts a real overlay in the document, seeded with the wall rectangle', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        expect(root()).not.toBeNull();
        expect(root().getAttribute('data-wall-id')).toBe('w1');
        // The absent profile IS the rectangle — WallProfile.ts's round-trip guarantee, and
        // therefore the only honest starting outline.
        expect(editor.ring.map((p) => [p.u, p.v])).toEqual([[0, 0], [4, 0], [4, 3], [0, 3]]);
    });

    it('an existing ring is loaded rather than replaced by the rectangle', () => {
        editor.activate(
            { ...subject, ring: [{ u: 0, v: 0 }, { u: 4, v: 0 }, { u: 2, v: 3 }] },
            { onCommit: () => {}, onCancel: () => {} },
        );
        expect(editor.ring).toHaveLength(3);
    });

    it('Apply hands the tool the working ring', () => {
        const onCommit = vi.fn();
        editor.activate(subject, { onCommit, onCancel: () => {} });
        clickButton('Apply');
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0]![0]).toEqual([
            { u: 0, v: 0 }, { u: 4, v: 0 }, { u: 4, v: 3 }, { u: 0, v: 3 },
        ]);
    });

    it('§UNDO-ORDERING-KEY (L-7300) — an N-vertex edit is ONE commit, not one per vertex', () => {
        // C03 §4.6: one gesture is one Ctrl+Z. The only route from this overlay to the model
        // is `onCommit` — so "one undo step per profile edit" is a property of THIS callback
        // firing once, not of anything downstream.
        const onCommit = vi.fn();
        editor.activate(subject, { onCommit, onCancel: () => {} });

        for (let i = 0; i < 3; i++) {
            midHandles()[0]!.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
        }
        expect(editor.ring).toHaveLength(7);
        expect(onCommit).not.toHaveBeenCalled();   // nothing reaches the model mid-gesture

        clickButton('Apply');
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0]![0]).toHaveLength(7);   // the WHOLE ring, once
    });

    it('Clear profile commits NULL — the field is removed, not set to a rectangle ring', () => {
        const onCommit = vi.fn();
        editor.activate(subject, { onCommit, onCancel: () => {} });
        clickButton('Clear profile');
        expect(onCommit).toHaveBeenCalledWith(null);
    });

    it('Cancel commits nothing', () => {
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        editor.activate(subject, { onCommit, onCancel });
        clickButton('Cancel');
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('inserting a vertex on an edge adds it BETWEEN its endpoints, not at the end', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        midHandles()[0]!.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
        expect(editor.ring.map((p) => [p.u, p.v])).toEqual([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]]);
    });

    it('deactivate removes the overlay and is safe to call twice', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        editor.deactivate();
        editor.deactivate();
        expect(document.getElementById('wall-profile-editor')).toBeNull();
        expect(editor.isActive).toBe(false);
    });

    it('activating twice never leaves two overlays in the document', () => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        editor.activate({ ...subject, wallId: 'w2' }, { onCommit: () => {}, onCancel: () => {} });
        expect(document.querySelectorAll('#wall-profile-editor')).toHaveLength(1);
    });

    it('a degenerate outline is REFUSED at Apply, not committed (C84 EI-2)', () => {
        const onCommit = vi.fn();
        editor.activate(
            { ...subject, ring: [{ u: 0, v: 0 }, { u: 2, v: 0 }, { u: 4, v: 0 }] },
            { onCommit, onCancel: () => {} },
        );
        clickButton('Apply');
        expect(onCommit).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// A. DRAGGABLE — BY THE TITLE BAR, AND ONLY BY IT
// ─────────────────────────────────────────────────────────────────────────────
describe('§WPE-CHROME-LAYER A — the panel drags by its title bar, never by its canvas', () => {
    beforeEach(() => {
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        stubRect(root(), 300, 200, 500, 400);
        stubRect(svgEl(), 320, 240, 460, 300);
    });

    it('a press on the TITLE BAR starts a drag and the panel follows the cursor', () => {
        titleBar().dispatchEvent(new window.MouseEvent('mousedown', {
            bubbles: true, clientX: 360, clientY: 210,
        }));
        expect(root().classList.contains('vg-panel--dragging')).toBe(true);

        document.dispatchEvent(new window.MouseEvent('mousemove', {
            bubbles: true, clientX: 460, clientY: 260,
        }));
        // grab offset was (60, 10); the panel's origin therefore tracks cursor - offset.
        expect(root().style.left).toBe('400px');
        expect(root().style.top).toBe('250px');

        document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
        expect(root().classList.contains('vg-panel--dragging')).toBe(false);
    });

    it('⛔ a press on the CANVAS does NOT start a drag — the canvas is the editing surface', () => {
        const before = root().style.left;
        svgEl().dispatchEvent(new window.MouseEvent('mousedown', {
            bubbles: true, clientX: 400, clientY: 300,
        }));
        expect(root().classList.contains('vg-panel--dragging')).toBe(false);

        document.dispatchEvent(new window.MouseEvent('mousemove', {
            bubbles: true, clientX: 700, clientY: 600,
        }));
        expect(root().style.left).toBe(before);
    });

    it('⛔ dragging a VERTEX reshapes the outline and leaves the panel exactly where it was', () => {
        const posBefore = { left: root().style.left, top: root().style.top };

        vertexHandles()[0]!.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
        const target = editor.toPx({ u: 1, v: 1 });
        svgEl().dispatchEvent(new window.PointerEvent('pointermove', {
            bubbles: true, clientX: 320 + target.x, clientY: 240 + target.y,
        }));

        expect(editor.ring[0]!.u).toBeCloseTo(1, 6);
        expect(editor.ring[0]!.v).toBeCloseTo(1, 6);
        expect(root().style.left).toBe(posBefore.left);
        expect(root().style.top).toBe(posBefore.top);
        expect(root().classList.contains('vg-panel--dragging')).toBe(false);
    });

    it('⛔ a press on the RESIZE GRIP does not start a drag either', () => {
        grip().dispatchEvent(new window.MouseEvent('mousedown', {
            bubbles: true, clientX: 795, clientY: 595,
        }));
        expect(root().classList.contains('vg-panel--dragging')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. RESIZABLE — AND DIMENSIONALLY HONEST AT EVERY SIZE
// ─────────────────────────────────────────────────────────────────────────────
describe('§WPE-CHROME-LAYER B — the founder\'s wall survives every resize unchanged', () => {
    /**
     * The founder's screen: a 10.106 m × 2.700 m wall carrying a FOUR-vertex outline whose
     * enclosed area reads 25.666 m². The rectangle would be 27.286 m², so the outline on his
     * screen is an authored one — this trapezoid encloses 25.6657 m², which is what the panel
     * prints as `25.666`. Those are the numbers every assertion below is pinned to.
     */
    const FOUNDER = {
        wallId: 'w-founder',
        length: 10.106,
        height: 2.700,
        ring: [
            { u: 0,      v: 0      },
            { u: 10.106, v: 0      },
            { u: 10.106, v: 2.3793 },
            { u: 0,      v: 2.700  },
        ],
    };
    const AREA_LINE = '4 vertices, enclosed area 25.666 m2';
    /** Deliberately extreme: the panel at its largest, at its floor, and past its floor. */
    const SIZES: ReadonlyArray<readonly [number, number]> = [
        [880, 460], [640, 320], [420, 250], [300, 180], [120, 90], [64, 64],
    ];

    beforeEach(() => {
        editor.activate(FOUNDER, { onCommit: () => {}, onCancel: () => {} });
    });

    it('the panel reports the founder\'s numbers when it opens', () => {
        expect(editor.ring).toHaveLength(4);
        expect(editor.statusText).toBe(AREA_LINE);
        expect(titleBar().textContent)
            .toBe('Edit Wall Profile - 10.106 m long, 2.700 m high');
    });

    it('⚠ the scale REALLY CHANGES across these sizes — otherwise the invariants below are vacuous', () => {
        const scales = SIZES.map(([w, h]) => { editor.refitTo(w, h); return editor.pxPerMetre; });
        expect(new Set(scales).size).toBeGreaterThan(1);
        expect(scales[0]!).toBeGreaterThan(scales[scales.length - 1]!);
        for (const s of scales) expect(s).toBeGreaterThan(0);
    });

    it('⭐ the enclosed area and every vertex are IDENTICAL at every size', () => {
        const ringBefore = editor.ring.map((p) => ({ ...p }));
        for (const [w, h] of SIZES) {
            editor.refitTo(w, h);
            expect(editor.statusText).toBe(AREA_LINE);
            expect(editor.ring.map((p) => ({ ...p }))).toEqual(ringBefore);
        }
        // …and back at the top, still the same. A one-way drift would pass a monotonic sweep.
        editor.refitTo(880, 460);
        expect(editor.statusText).toBe(AREA_LINE);
        expect(editor.ring.map((p) => ({ ...p }))).toEqual(ringBefore);
    });

    it('⭐ the drawn wall extent keeps the WALL\'s aspect ratio exactly, at every size', () => {
        const wallAspect = FOUNDER.length / FOUNDER.height;
        for (const [w, h] of SIZES) {
            editor.refitTo(w, h);
            const drawnW = Number(boundRect().getAttribute('width'));
            const drawnH = Number(boundRect().getAttribute('height'));
            expect(drawnW).toBeGreaterThan(0);
            expect(drawnH).toBeGreaterThan(0);
            expect(drawnW / drawnH).toBeCloseTo(wallAspect, 10);
        }
    });

    it('⭐ pixels round-trip back to the same metres at every size (the map is a true inverse)', () => {
        for (const [w, h] of SIZES) {
            editor.refitTo(w, h);
            for (const p of FOUNDER.ring) {
                const px = editor.toPx(p);
                const back = editor.toModel(px.x, px.y);
                expect(back.u).toBeCloseTo(p.u, 9);
                expect(back.v).toBeCloseTo(p.v, 9);
            }
        }
    });

    it('⭐ a vertex drag AFTER a resize lands on the metres it was aimed at', () => {
        // This is the assertion a "wrong scale" bug fails and every other test here passes.
        editor.refitTo(420, 250);
        stubRect(svgEl(), 90, 70, 400, 200);

        vertexHandles()[2]!.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
        const aim = editor.toPx({ u: 7.5, v: 1.85 });   // both exact multiples of the 50 mm grid
        svgEl().dispatchEvent(new window.PointerEvent('pointermove', {
            bubbles: true, clientX: 90 + aim.x, clientY: 70 + aim.y,
        }));

        expect(editor.ring[2]!.u).toBeCloseTo(7.5, 6);
        expect(editor.ring[2]!.v).toBeCloseTo(1.85, 6);
    });

    it('the SVG box tracks the fit, so the drawing is never cropped by its own canvas', () => {
        for (const [w, h] of SIZES) {
            editor.refitTo(w, h);
            const sw = Number(svgEl().getAttribute('width'));
            const sh = Number(svgEl().getAttribute('height'));
            expect(sw).toBeCloseTo(FOUNDER.length * editor.pxPerMetre + editor.padPx * 2, 9);
            expect(sh).toBeCloseTo(FOUNDER.height * editor.pxPerMetre + editor.padPx * 2, 9);
        }
    });

    it('⛔ no box, however absurd, can produce a zero or negative scale', () => {
        for (const [w, h] of [[0, 0], [-500, -500], [NaN, NaN], [1, 1]] as const) {
            editor.refitTo(w, h);
            expect(editor.pxPerMetre).toBeGreaterThan(0);
            expect(Number.isFinite(editor.pxPerMetre)).toBe(true);
            expect(editor.padPx).toBeGreaterThan(0);
            expect(editor.statusText).toBe(AREA_LINE);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// B (wiring) + C. THE RESIZE ACTUALLY REACHES THE DRAWING, AND APPLY STAYS REACHABLE
// ─────────────────────────────────────────────────────────────────────────────
describe('§WPE-CHROME-LAYER B/C — the grip resizes the panel and the drawing follows', () => {
    beforeEach(() => {
        editor.activate({ wallId: 'w1', length: 10.106, height: 2.7, ring: null },
            { onCommit: () => {}, onCancel: () => {} });
        stubRect(root(), 100, 100, 700, 460);
    });

    it('dragging the grip changes the panel\'s px box', () => {
        grip().dispatchEvent(new window.MouseEvent('mousedown', {
            bubbles: true, clientX: 795, clientY: 555,
        }));
        document.dispatchEvent(new window.MouseEvent('mousemove', {
            bubbles: true, clientX: 895, clientY: 635,
        }));
        expect(root().style.width).toBe('800px');
        expect(root().style.height).toBe('540px');
        document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    });

    it('⛔ the grip never shrinks the panel below the floors that keep the buttons reachable', () => {
        grip().dispatchEvent(new window.MouseEvent('mousedown', {
            bubbles: true, clientX: 795, clientY: 555,
        }));
        document.dispatchEvent(new window.MouseEvent('mousemove', {
            bubbles: true, clientX: -4000, clientY: -4000,
        }));
        expect(parseFloat(root().style.width)).toBeGreaterThanOrEqual(360);
        expect(parseFloat(root().style.height)).toBeGreaterThanOrEqual(300);
        document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    });

    it('a measurable canvas box re-fits the drawing — the DOM→refit link, not just the arithmetic', () => {
        // happy-dom reports every client box as 0, which is exactly the state `_refitFromLayout`
        // is written to no-op on. Give the wrapper a real box and the link becomes observable.
        const before = editor.pxPerMetre;
        Object.defineProperty(wrap(), 'clientWidth',  { value: 300, configurable: true });
        Object.defineProperty(wrap(), 'clientHeight', { value: 160, configurable: true });
        window.dispatchEvent(new window.Event('resize'));
        expect(editor.pxPerMetre).not.toBe(before);
        expect(editor.pxPerMetre).toBeCloseTo((300 - editor.padPx * 2) / 10.106, 9);
    });

    it('an UNMEASURABLE canvas box changes nothing — 0 is "cannot measure", not "shrink to nothing"', () => {
        // [[context-data-honesty-family]]: failure and empty must not be the same value.
        const before = editor.pxPerMetre;
        window.dispatchEvent(new window.Event('resize'));
        expect(editor.pxPerMetre).toBe(before);
    });

    it('⭐ C — Apply still commits after the panel has been squeezed to its floor', () => {
        const onCommit = vi.fn();
        editor.deactivate();
        editor.activate({ wallId: 'w1', length: 10.106, height: 2.7, ring: null },
            { onCommit, onCancel: () => {} });
        editor.refitTo(64, 64);

        // The action row is a `flex:0 0 auto` sibling of the canvas wrapper, not a child of it,
        // so the only box that shrank is the one that is supposed to.
        const actions = document.querySelector('.wpe-actions') as HTMLElement;
        expect(actions.parentElement).toBe(root());
        expect(actions.style.flex).toBe('0 0 auto');
        expect(wrap().style.overflow).toBe('hidden');
        expect(actions.style.overflow).toBe('');

        clickButton('Apply');
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0]![0]).toHaveLength(4);
    });

    it('the chrome is released on deactivate — no listener outlives the overlay', () => {
        editor.deactivate();
        // A leaked document-level mousemove from makeDraggable/makeResizable would throw here
        // (the panel is gone) or silently keep writing to a detached node.
        expect(() => {
            document.dispatchEvent(new window.MouseEvent('mousemove', {
                bubbles: true, clientX: 10, clientY: 10,
            }));
            window.dispatchEvent(new window.Event('resize'));
        }).not.toThrow();
        expect(document.getElementById('wall-profile-editor')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// REUSE — the point of the whole move
// ─────────────────────────────────────────────────────────────────────────────
describe('§WPE-CHROME-LAYER — the panel reuses the shared chrome and mints no rival', () => {
    it('it imports makeDraggable and makeResizable and defines neither', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const url = await import('node:url');
        const here = path.dirname(url.fileURLToPath(import.meta.url));
        const src = fs.readFileSync(path.join(here, '../src/ui/WallProfileEditor.ts'), 'utf8');

        expect(src).toMatch(/import \{ makeDraggable \} from '\.\/makeDraggable'/);
        expect(src).toMatch(/import \{ makeResizable \} from '\.\/makeResizable'/);
        // ⛔ No second dragger. The repo already carries five rival panel-chrome
        // implementations; a sixth would be the cheapest way to make "architecturally sound"
        // false.
        expect(src).not.toMatch(/function\s+_?make(Draggable|Resizable)/);
        expect(src).not.toMatch(/addEventListener\('mousemove'/);
    });

    it('it declares the resize floors rather than leaving makeResizable\'s defaults', () => {
        // makeResizable's own defaults are 280 × 180 — below this panel's hint line + buttons.
        const el = document.createElement('div');
        expect(el).toBeTruthy();
        editor.activate(subject, { onCommit: () => {}, onCancel: () => {} });
        expect(root().style.minWidth).toBe('360px');
        expect(root().style.minHeight).toBe('300px');
    });
});
