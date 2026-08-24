/**
 * WallProfileEditor (L7 panel) — §FEAT-WALL-PROFILE-EDIT + §WPE-CHROME-LAYER (L-10200/L-10201).
 *
 * ─── WHY THIS FILE IS HERE AND NOT IN `packages/geometry-wall` ────────────────
 *
 * It WAS in `packages/geometry-wall/src/WallProfileEditor.ts` — 359 lines of
 * `document.createElement` inside an **L2 geometry package**. The founder asked for the
 * panel to be *"resizable and draggable — architecturally sound"*, and at HEAD that request
 * was **not expressible**:
 *
 *   • `apps/editor/src/ui/makeDraggable.ts`  — L7
 *   • `apps/editor/src/ui/makeResizable.ts`  — L7   (it already existed; the brief for this
 *                                                    lane did not know that, so "write a
 *                                                    resizer" would have minted a rival)
 *   • `packages/geometry-wall`               — L2, and L2 may not import L7.
 *
 * So the only ways to satisfy the ask from L2 were (i) an upward import the layer gate
 * catches, or (ii) a THIRD hand-rolled dragger. This repo already has FIVE rival panel-chrome
 * implementations — `makeDraggable`, `makeResizable`, and hand-rolled `_makeDraggable` copies
 * in `rooms/RoomGraphPanel.ts`, `rooms/EvacuationSimulatorPanel.ts`,
 * `property-inspector/RoomPathfinderPanel.ts` and `property-panel/PropertyPanel.ts` (which
 * also hand-rolls `_makeResizable`). A sixth would have been the cheapest possible way to
 * make the founder's phrase false.
 *
 * The DOM therefore moved UP, where both shared helpers are ordinary downward imports and
 * this panel adds **no chrome machinery of its own**. What stayed at L2 is what belongs
 * there — the SUBJECT, the CALLBACKS, the 50 mm authoring grid, the implicit rectangle and
 * the `WallProfileEditorPort` the tool holds. `WallTool` receives an implementation through
 * `WallToolCallbacks.createProfileEditor`, wired in `apps/editor/src/engine/initTools.ts`.
 *
 * ⚠ WHAT WAS REJECTED, and why — the alternative shapes are recorded so the next lane does
 *   not silently re-litigate them:
 *   (a) MOVE THE HELPERS DOWN TO `packages/ui-base`. **Refuted by measurement**, not by
 *       taste: `ui-base` is **L3** (`eslint.config.js:190`) and `geometry-wall` is **L2**
 *       (`:155`). L2 → L3 is upward. It would have swapped one violation for another.
 *   (a′) MOVE THE HELPERS DOWN TO A NEW ZERO-DEPENDENCY FLOOR PACKAGE (the `frame-scheduler`
 *       / `procedural-textures` precedent). Architecturally the nicest, and still the right
 *       eventual home for panel chrome — but a new workspace needs a tree-wide `pnpm install`
 *       to mint the `node_modules` symlink, and TWO SIBLING LANES WERE LIVE IN THIS TREE.
 *       Rewriting `pnpm-lock.yaml` and relinking under them is a collision this repo has
 *       already been bitten by. Deferred and logged (L-10202) rather than dropped.
 *   (c) INJECT THE CHROME: keep the panel at L2 and have the composition root attach drag +
 *       resize to an exposed root element. Same forgettable-wire risk as this option, for
 *       strictly less benefit — the DOM would still be at L2, so the NEXT chrome need repeats
 *       the whole argument. Dominated.
 *
 * ─── D. POSITION / SIZE PERSISTENCE: **NOT PERSISTED. DECIDED, NOT DEFERRED.** ─────
 *
 * This panel opens centred at a size fitted to the wall it is editing, every time.
 *   1. It is a MODAL EDIT SESSION, not a dockable tool window: it is opened from a contextual
 *      action on one wall and closed by Apply / Cancel / Esc. Its geometry is not a standing
 *      preference the user expressed.
 *   2. C78 §19.5 (U-INV-16, lane GRAPH48) — *a stored decision must record the universe it
 *      was made against*. A stored px box is only replayable against the viewport size, the
 *      device pixel ratio AND the aspect ratio of the wall it was sized for; a 10.106 × 2.700
 *      wall and a 1.2 × 4.0 wall want opposite boxes. Storing the box without that universe
 *      is precisely the defect U-INV-16 names, and storing it WITH that universe is a
 *      panel-layout subsystem, not a line in this file.
 *   3. `makeDraggable` already reserves the seam for exactly that subsystem — its `_runtime`
 *      parameter carries `TODO(F.6.5): wire drag-end position to runtime.persistence.panelLayout`.
 *      When F.6.5 lands, EVERY panel gets persistence under one universe-recording rule, which
 *      is the only way it can be right. Until then this panel stores nothing, and says so.
 *
 * ⛔ NO STORE AND NO COMMAND BUS. The only way anything here reaches the model is the
 * `onCommit` callback the tool supplies (P6). No THREE (P2). No `requestAnimationFrame` (P3).
 */

import type {
    WallProfileEditorCallbacks,
    WallProfileEditorPort,
    WallProfileEditorSubject,
} from '@pryzm/geometry-wall/profile-editor';
import {
    WALL_PROFILE_SNAP_M,
    wallProfileEditorRectangle,
    wallProfileEditorSnap,
} from '@pryzm/geometry-wall/profile-editor';
import type { WallProfileVertex } from '@pryzm/geometry-wall/profile';
import {
    PROFILE_MIN_AREA_M2,
    PROFILE_MIN_VERTICES,
    wallProfileSignedArea2,
} from '@pryzm/geometry-wall/profile';
import { makeDraggable } from './makeDraggable';
import { makeResizable } from './makeResizable';

/** Widest breathing space around the drawing, px. Shrinks with the panel — see `_padFor`. */
const MAX_PAD_PX = 44;
/** ⛔ FLOOR. Below this the dashed wall-extent rectangle touches the SVG edge and the corner
 *  vertex handles are half-clipped, so a vertex the user can see becomes one they cannot grab. */
const MIN_PAD_PX = 10;
const HANDLE_R = 7;

/**
 * C. MINIMUM PANEL SIZE — the floor below which the hint line or a button would become
 * unreachable. Handed to `makeResizable`, which clamps every mousemove against it.
 *
 * ⚠ The action row is `flex-wrap: wrap`, deliberately. A NON-wrapping row of four buttons is
 * ~430 px wide, so a hard 430 px floor would be the only way to guarantee **Apply** stays
 * clickable — a wide floor on a panel whose whole point is that it can be made small. Wrapping
 * lets the row become two lines instead of clipping, so the floor is set by legibility rather
 * than by the widest possible single line, and **Apply is reachable at every size the grip can
 * produce** because it is never inside an `overflow:hidden` box. The ONLY `overflow:hidden` box
 * in this panel is the canvas wrapper, and the canvas is the thing that is *supposed* to shrink.
 */
const MIN_PANEL_W = 360;
const MIN_PANEL_H = 300;
/** Smallest canvas box `refitTo` will fit a drawing into. > `2 * MIN_PAD_PX`, so scale > 0. */
const MIN_CANVAS_PX = 64;
/** ⛔ A scale of 0 collapses every vertex onto one pixel and makes `_u`/`_v` divide by zero. */
const MIN_SCALE = 1e-3;
/** Used only when the host cannot measure (happy-dom reports every box as 0). */
const FALLBACK_CHROME_PX = 168;
const PANEL_PAD_X = 18;

const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : x > hi ? hi : x;
}

export class WallProfileEditor implements WallProfileEditorPort {
    private _root: HTMLElement | null = null;
    private _svg: SVGSVGElement | null = null;
    private _bound: SVGRectElement | null = null;
    private _poly: SVGPolygonElement | null = null;
    private _handleLayer: SVGGElement | null = null;
    private _canvasWrap: HTMLElement | null = null;
    private _status: HTMLElement | null = null;
    private _subject: WallProfileEditorSubject | null = null;
    private _cbs: WallProfileEditorCallbacks | null = null;

    private _ring: WallProfileVertex[] = [];
    /** px per metre — ONE number for BOTH axes, which is what keeps the drawing to scale. */
    private _scale = 1;
    private _pad = MAX_PAD_PX;
    private _dragIndex: number | null = null;
    private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
    private _onWinResize: (() => void) | null = null;
    private _disposers: Array<() => void> = [];
    private _ro: ResizeObserver | null = null;
    private _refitting = false;

    get isActive(): boolean { return this._root !== null; }

    // ── TEST SEAMS ───────────────────────────────────────────────────────────
    // Every one of these is a READ. They exist because the dimensional half of this panel is
    // the half that can silently produce WRONG COORDINATES, and a drag test would not notice.

    /** The working ring, in METRES. Pixels are derived from it; it is never derived from them. */
    get ring(): ReadonlyArray<WallProfileVertex> { return this._ring; }
    /** Current uniform scale, px per metre. */
    get pxPerMetre(): number { return this._scale; }
    /** Current drawing inset, px. */
    get padPx(): number { return this._pad; }
    /** The panel root, or null when closed. */
    get rootElement(): HTMLElement | null { return this._root; }
    /** Exactly what the status line is telling the author right now. */
    get statusText(): string { return this._status?.textContent ?? ''; }
    /** Model (metres) → SVG pixels. */
    toPx(p: WallProfileVertex): { x: number; y: number } {
        return { x: this._x(p.u), y: this._y(p.v) };
    }
    /** SVG pixels → model (metres). The exact inverse of {@link toPx} at every panel size. */
    toModel(x: number, y: number): WallProfileVertex {
        return { u: this._u(x), v: this._v(y) };
    }

    /**
     * Open the editor over the given wall. Idempotent: activating while already active on
     * ANY wall closes the previous session first, so two overlays can never co-exist.
     */
    activate(subject: WallProfileEditorSubject, cbs: WallProfileEditorCallbacks): void {
        this.deactivate();
        this._subject = subject;
        this._cbs = cbs;
        this._ring = subject.ring && subject.ring.length >= PROFILE_MIN_VERTICES
            ? subject.ring.map((p) => ({ u: p.u, v: p.v }))
            : wallProfileEditorRectangle(subject);
        this._build();
        this._redraw();
    }

    /** Close the overlay and drop every listener. Safe to call any number of times. */
    deactivate(): void {
        if (this._onKeyDown) {
            window.removeEventListener('keydown', this._onKeyDown, true);
            this._onKeyDown = null;
        }
        if (this._onWinResize) {
            window.removeEventListener('resize', this._onWinResize);
            this._onWinResize = null;
        }
        this._ro?.disconnect();
        this._ro = null;
        for (const d of this._disposers) {
            try { d(); } catch (e) { console.warn('[wall-profile-editor] chrome dispose failed:', e); }
        }
        this._disposers = [];
        this._root?.remove();
        this._root = null;
        this._svg = null;
        this._bound = null;
        this._poly = null;
        this._handleLayer = null;
        this._canvasWrap = null;
        this._status = null;
        this._subject = null;
        this._cbs = null;
        this._ring = [];
        this._dragIndex = null;
    }

    // ── geometry <-> pixels ──────────────────────────────────────────────────
    // ⭐ THE DIMENSIONAL CONTRACT, stated once so a later edit cannot quietly break it:
    //
    //   x = pad + u * scale                 u = (x - pad) / scale
    //   y = pad + (height - v) * scale      v = height - (y - pad) / scale
    //
    // `scale` is ONE number applied to BOTH axes, so the drawing's aspect ratio IS the wall's
    // aspect ratio at every panel size. `pad` and `scale` appear identically in the forward and
    // inverse maps, so `toModel(toPx(p)) === p` for every p, at every size. RESIZING CHANGES
    // `scale` AND `pad` AND NOTHING ELSE — the ring is stored in metres and is never rescaled,
    // which is why the enclosed area reported after a resize is the area before it.
    private _x(u: number): number { return this._pad + u * this._scale; }
    private _y(v: number): number { return this._pad + (this._subject!.height - v) * this._scale; }
    private _u(x: number): number { return (x - this._pad) / this._scale; }
    private _v(y: number): number { return this._subject!.height - (y - this._pad) / this._scale; }

    private _padFor(w: number, h: number): number {
        return clamp(Math.floor(Math.min(w, h) * 0.08), MIN_PAD_PX, MAX_PAD_PX);
    }

    /**
     * B. RE-FIT THE DRAWING INTO A NEW CANVAS BOX. The whole of the resize behaviour, and
     * deliberately PURE ARITHMETIC over two numbers — no DOM reads — so a test can drive it
     * at sizes no headless layout engine would ever produce.
     *
     * ⛔ It must never touch `this._ring`. That is the invariant that makes a resize safe:
     * the model is metres, the view is pixels, and only the view is a function of the box.
     */
    refitTo(availW: number, availH: number): void {
        const s = this._subject;
        if (!s || !this._svg) return;
        const w = Math.max(MIN_CANVAS_PX, Number.isFinite(availW) ? availW : MIN_CANVAS_PX);
        const h = Math.max(MIN_CANVAS_PX, Number.isFinite(availH) ? availH : MIN_CANVAS_PX);
        const pad = this._padFor(w, h);
        this._pad = pad;
        this._scale = Math.max(MIN_SCALE, Math.min(
            (w - pad * 2) / Math.max(s.length, 1e-3),
            (h - pad * 2) / Math.max(s.height, 1e-3),
        ));
        this._svg.setAttribute('width',  String(s.length * this._scale + pad * 2));
        this._svg.setAttribute('height', String(s.height * this._scale + pad * 2));
        this._redraw();
    }

    /** Read the canvas wrapper's live box and re-fit into it. No-op where nothing is measurable. */
    private _refitFromLayout(): void {
        const wrap = this._canvasWrap;
        if (!wrap || this._refitting) return;
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        if (!(w > 0) || !(h > 0)) return;   // happy-dom / detached: keep the built-in fit
        this._refitting = true;
        try { this.refitTo(w, h); } finally { this._refitting = false; }
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    private _build(): void {
        const s = this._subject!;
        const maxW = clamp(window.innerWidth - 160, 420, 920);
        const maxH = clamp(window.innerHeight - 320, 240, 520);
        this._pad = this._padFor(maxW, maxH);
        this._scale = Math.max(MIN_SCALE, Math.min(
            (maxW - this._pad * 2) / Math.max(s.length, 1e-3),
            (maxH - this._pad * 2) / Math.max(s.height, 1e-3),
        ));
        const w = s.length * this._scale + this._pad * 2;
        const h = s.height * this._scale + this._pad * 2;

        const root = document.createElement('div');
        root.id = 'wall-profile-editor';
        root.className = 'wpe-panel';
        root.setAttribute('data-wall-id', s.wallId);
        // `display:flex; flex-direction:column` is what makes C true: every fixed row keeps its
        // height and only the canvas wrapper gives ground, so shrinking the panel can never
        // clip the hint or the buttons.
        root.style.cssText =
            'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000000;' +
            'display:flex;flex-direction:column;' +
            `min-width:${MIN_PANEL_W}px;min-height:${MIN_PANEL_H}px;` +
            'background:#fff;color:#1a1a1a;border:1px solid #d8d8e0;border-radius:12px;' +
            'box-shadow:0 18px 60px rgba(0,0,0,.28);' +
            `padding:16px ${PANEL_PAD_X}px 14px;` +
            'font:13px/1.4 system-ui,sans-serif;';

        // A. THE DRAG HANDLE — and ONLY this. The canvas is the editing surface: a pointer
        // press there is a vertex grab or a midpoint insert, and must never move the panel.
        const title = document.createElement('div');
        title.className = 'wpe-titlebar';
        title.style.cssText =
            'flex:0 0 auto;font-weight:600;margin-bottom:8px;cursor:move;' +
            'user-select:none;-webkit-user-select:none;touch-action:none;';
        title.textContent =
            `Edit Wall Profile - ${s.length.toFixed(3)} m long, ${s.height.toFixed(3)} m high`;
        root.appendChild(title);

        const wrap = document.createElement('div');
        wrap.className = 'wpe-canvas-wrap';
        // `min-height:0` is load-bearing: without it a flex child refuses to shrink below its
        // content and the panel's fixed rows get pushed out of the box instead.
        wrap.style.cssText =
            'flex:1 1 auto;min-height:0;min-width:0;overflow:hidden;' +
            'display:flex;align-items:center;justify-content:center;';
        root.appendChild(wrap);

        const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
        svg.setAttribute('width', String(w));
        svg.setAttribute('height', String(h));
        svg.style.cssText = 'display:block;background:#fafafe;border-radius:8px;touch-action:none;';

        // The wall's own extent — the box a profile may only CUT inside (`WallProfile.ts`:
        // "A profile SUBTRACTS from the rectangle; it never grows it").
        const bound = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
        bound.setAttribute('fill', 'none');
        bound.setAttribute('stroke', '#c9c9d6');
        bound.setAttribute('stroke-dasharray', '5 4');
        svg.appendChild(bound);

        const poly = document.createElementNS(SVG_NS, 'polygon') as SVGPolygonElement;
        poly.setAttribute('fill', 'rgba(102,0,255,0.13)');
        poly.setAttribute('stroke', '#6600FF');
        poly.setAttribute('stroke-width', '2');
        svg.appendChild(poly);

        const handles = document.createElementNS(SVG_NS, 'g') as SVGGElement;
        svg.appendChild(handles);

        svg.addEventListener('pointermove',  (e) => this._onPointerMove(e as PointerEvent));
        svg.addEventListener('pointerup',    () => this._onPointerUp());
        svg.addEventListener('pointerleave', () => this._onPointerUp());
        wrap.appendChild(svg);

        const status = document.createElement('div');
        status.className = 'wpe-status';
        status.style.cssText = 'flex:0 0 auto;margin:8px 2px 4px;color:#555;min-height:16px;';
        root.appendChild(status);

        const hint = document.createElement('div');
        hint.className = 'wpe-hint';
        hint.style.cssText = 'flex:0 0 auto;margin:2px 2px 10px;color:#8a8a96;font-size:12px;';
        hint.textContent =
            'Drag a vertex to reshape. Click a hollow midpoint to insert a vertex. ' +
            'Double-click a vertex to delete it. Shift = free ' +
            `(no ${Math.round(WALL_PROFILE_SNAP_M * 1000)} mm grid). ` +
            'Esc = cancel, Enter = apply.';
        root.appendChild(hint);

        const row = document.createElement('div');
        row.className = 'wpe-actions';
        // `flex-wrap:wrap` — see MIN_PANEL_W. The row becomes two lines before it clips.
        row.style.cssText =
            'flex:0 0 auto;display:flex;flex-wrap:wrap;gap:8px;row-gap:6px;justify-content:flex-end;';
        row.appendChild(this._button('Reset to rectangle', '#f2f2f7', '#1a1a1a', () => {
            this._ring = wallProfileEditorRectangle(this._subject!);
            this._redraw();
        }));
        row.appendChild(this._button('Clear profile', '#f2f2f7', '#1a1a1a', () => {
            this._cbs?.onCommit(null);
        }));
        row.appendChild(this._button('Cancel', '#f2f2f7', '#1a1a1a', () => this._cbs?.onCancel()));
        row.appendChild(this._button('Apply', '#6600FF', '#fff', () => this._commit()));
        root.appendChild(row);

        // B. THE RESIZE GRIP. Styled inline rather than via a stylesheet class because this
        // panel injects no <style> of its own (§05 §7) and owns no entry in the app stylesheet.
        const grip = document.createElement('div');
        grip.className = 'wpe-resize-grip';
        grip.setAttribute('aria-label', 'Resize');
        grip.style.cssText =
            'position:absolute;right:3px;bottom:3px;width:16px;height:16px;cursor:nwse-resize;' +
            'border-right:2px solid #c9c9d6;border-bottom:2px solid #c9c9d6;' +
            'border-bottom-right-radius:10px;touch-action:none;';
        root.appendChild(grip);

        document.body.appendChild(root);
        this._root = root;
        this._svg = svg;
        this._bound = bound;
        this._poly = poly;
        this._handleLayer = handles;
        this._canvasWrap = wrap;
        this._status = status;
        this._syncBound();

        // Pin an explicit box ONCE, from the natural content size. Two reasons, both required:
        //   • `makeResizable` drives width/height in px, so the panel must already be in that
        //     coordinate system for the first grip pixel to land where the cursor is;
        //   • a content-sized root would make the ResizeObserver below a FEEDBACK LOOP — refit
        //     shrinks the SVG, the root shrinks with it, the observer fires, refit shrinks
        //     again. With an explicit box the SVG lives inside an `overflow:hidden` flex child
        //     and cannot move the root at all.
        const naturalH = root.offsetHeight;
        const chromeH = naturalH > h ? naturalH - h : FALLBACK_CHROME_PX;
        root.style.width  = Math.max(MIN_PANEL_W, w + PANEL_PAD_X * 2) + 'px';
        root.style.height = Math.max(MIN_PANEL_H, h + chromeH) + 'px';

        // ⭐ REUSE, NOT NEW MACHINERY. Both helpers already exist and are already pinned by
        // their own suite (`apps/editor/__tests__/makeDraggableOffsetParent.test.ts`); this
        // panel adds neither a rival dragger nor a rival resizer.
        this._disposers.push(makeDraggable(root, '.wpe-titlebar', ['.wpe-resize-grip']));
        this._disposers.push(makeResizable(root, grip, {
            minWidth:  MIN_PANEL_W,
            minHeight: MIN_PANEL_H,
        }));

        if (typeof ResizeObserver === 'function') {
            this._ro = new ResizeObserver(() => this._refitFromLayout());
            this._ro.observe(root);
        }
        this._onWinResize = () => this._refitFromLayout();
        window.addEventListener('resize', this._onWinResize);

        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); this._cbs?.onCancel(); }
            else if (e.key === 'Enter') { e.stopPropagation(); this._commit(); }
        };
        window.addEventListener('keydown', this._onKeyDown, true);
    }

    /** Keep the dashed wall-extent rectangle exactly on the current pad/scale. */
    private _syncBound(): void {
        const s = this._subject;
        if (!this._bound || !s) return;
        this._bound.setAttribute('x', String(this._pad));
        this._bound.setAttribute('y', String(this._pad));
        this._bound.setAttribute('width',  String(s.length * this._scale));
        this._bound.setAttribute('height', String(s.height * this._scale));
    }

    private _button(label: string, bg: string, fg: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement('button');
        b.textContent = label;
        b.setAttribute('data-wpe-action', label);
        b.style.cssText =
            `background:${bg};color:${fg};border:1px solid rgba(0,0,0,.08);border-radius:7px;` +
            'padding:7px 13px;cursor:pointer;font:inherit;font-weight:600;white-space:nowrap;';
        b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
        return b;
    }

    private _redraw(): void {
        if (!this._poly || !this._handleLayer) return;
        this._syncBound();
        this._poly.setAttribute(
            'points',
            this._ring.map((p) => `${this._x(p.u)},${this._y(p.v)}`).join(' '),
        );

        this._handleLayer.replaceChildren();

        // Edge-insertion targets first, so the vertex handles sit above them.
        for (let i = 0; i < this._ring.length; i++) {
            const a = this._ring[i]!;
            const b = this._ring[(i + 1) % this._ring.length]!;
            const mid = document.createElementNS(SVG_NS, 'circle');
            mid.setAttribute('cx', String((this._x(a.u) + this._x(b.u)) / 2));
            mid.setAttribute('cy', String((this._y(a.v) + this._y(b.v)) / 2));
            mid.setAttribute('r', String(HANDLE_R - 2));
            mid.setAttribute('fill', '#fff');
            mid.setAttribute('stroke', '#b9a2ff');
            mid.setAttribute('data-wpe-midpoint', String(i));
            mid.style.cursor = 'copy';
            const at = i;
            mid.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this._ring.splice(at + 1, 0, { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 });
                this._redraw();
            });
            this._handleLayer.appendChild(mid);
        }

        for (let i = 0; i < this._ring.length; i++) {
            const p = this._ring[i]!;
            const c = document.createElementNS(SVG_NS, 'circle');
            c.setAttribute('cx', String(this._x(p.u)));
            c.setAttribute('cy', String(this._y(p.v)));
            c.setAttribute('r', String(HANDLE_R));
            c.setAttribute('fill', '#6600FF');
            c.setAttribute('stroke', '#fff');
            c.setAttribute('stroke-width', '2');
            c.setAttribute('data-wpe-vertex', String(i));
            c.style.cursor = 'grab';
            const idx = i;
            c.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this._dragIndex = idx;
            });
            c.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this._deleteVertex(idx);
            });
            this._handleLayer.appendChild(c);
        }

        this._setStatus();
    }

    private _deleteVertex(idx: number): void {
        // A ring below PROFILE_MIN_VERTICES cannot bound an area — the gate would refuse it,
        // so the editor refuses to PRODUCE one rather than offering an edit that cannot commit.
        if (this._ring.length <= PROFILE_MIN_VERTICES) {
            this._setStatus(`A profile needs at least ${PROFILE_MIN_VERTICES} vertices.`);
            return;
        }
        this._ring.splice(idx, 1);
        this._redraw();
    }

    private _onPointerMove(e: PointerEvent): void {
        if (this._dragIndex === null || !this._svg || !this._subject) return;
        const r = this._svg.getBoundingClientRect();
        const s = this._subject;
        const u = clamp(wallProfileEditorSnap(this._u(e.clientX - r.left), !e.shiftKey), 0, s.length);
        const v = clamp(wallProfileEditorSnap(this._v(e.clientY - r.top),  !e.shiftKey), 0, s.height);
        this._ring[this._dragIndex] = { u, v };
        this._redraw();
    }

    private _onPointerUp(): void {
        this._dragIndex = null;
    }

    /** Enclosed area of the working ring, square metres. */
    private _area(): number {
        return Math.abs(wallProfileSignedArea2(this._ring)) / 2;
    }

    private _setStatus(msg?: string): void {
        if (!this._status) return;
        this._status.textContent = msg
            ?? `${this._ring.length} vertices, enclosed area ${this._area().toFixed(3)} m2`;
        this._status.style.color = msg ? '#b3261e' : '#555';
    }

    /**
     * Hand the working ring to the tool. Pre-checks only what the editor can answer
     * LOCALLY (vertex count and enclosed area); every other judgement — bounds, curve,
     * layers, hosted openings — belongs to `profileAuthorability`, which the command path
     * consults, and is NOT re-implemented here (C84 EI-9: one answer per question).
     */
    private _commit(): void {
        if (this._ring.length < PROFILE_MIN_VERTICES) {
            this._setStatus(`A profile needs at least ${PROFILE_MIN_VERTICES} vertices.`);
            return;
        }
        if (!(this._area() > PROFILE_MIN_AREA_M2)) {
            this._setStatus('This outline encloses no area - the wall would render as nothing.');
            return;
        }
        this._cbs?.onCommit(this._ring.map((p) => ({ u: p.u, v: p.v })));
    }

    /** Surface a refusal the TOOL obtained from the gate. The editor owns no refusal text. */
    showRefusal(text: string): void {
        this._setStatus(text);
    }
}
