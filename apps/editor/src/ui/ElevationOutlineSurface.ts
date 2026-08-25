/**
 * ElevationOutlineSurface — §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE §6, C86 §10.6 rule 4).
 *
 * THE one SVG elevation-drawing surface, EXTRACTED from `WallProfileEditor.ts` so the wall
 * profile modal and the window outline section are two CALLERS of one surface rather than two
 * implementations of one idea. Everything dimensional here is the wall profile editor's own
 * proven machinery, moved verbatim (its chrome test still pins it through the modal):
 *
 *   • THE DIMENSIONAL CONTRACT (stated once, here, since the surface owns it now):
 *       x = pad + u * scale                 u = (x - pad) / scale
 *       y = pad + (height - v) * scale      v = height - (y - pad) / scale
 *     `scale` is ONE number for BOTH axes, so the drawing's aspect ratio IS the subject's at
 *     every size; `pad`/`scale` appear identically in both maps, so `toModel(toPx(p)) === p`.
 *     RESIZING CHANGES `scale` AND `pad` AND NOTHING ELSE — the ring is metres, never pixels.
 *   • vertex drag (snap unless Shift), midpoint insert, double-click delete with the
 *     min-vertex guard, `refitTo` as pure arithmetic over two numbers.
 *
 * NEW here — the three modes C86 §10.6 rule 2 names, fed from the L2 model
 * (`@pryzm/geometry-wall/outline-authoring`), never re-derived:
 *   • `polyline` — click-to-place; the caller closes the draft (Enter) via `closeDraft()`.
 *   • `arc` — 3-click start/through/end appending a 16-chord tessellated run.
 *   • ⛔ ORTHO ABSOLUTE while `orthoOn` (the founder's 2026-08-24 ruling) — decided in
 *     `outlinePlacePoint`, the L2 helper, so the surface cannot have its own opinion.
 * The wall profile modal simply never leaves `select` mode, which is how it keeps byte-
 * identical behaviour.
 *
 * ⛔ NO STORE, NO COMMAND BUS, NO THREE, NO rAF. The surface hands rings to callbacks; the
 * CALLER decides what a commit means (P6 — same split the modal already made).
 */

import type { WallProfileVertex } from '@pryzm/geometry-wall/profile';
import {
    outlineArcSegment,
    outlinePlacePoint,
} from '@pryzm/geometry-wall/outline-authoring';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Widest breathing space around the drawing, px. Shrinks with the box — see `_padFor`. */
const MAX_PAD_PX = 44;
/** ⛔ FLOOR. Below this the dashed extent rectangle touches the SVG edge and corner vertex
 *  handles are half-clipped, so a vertex the user can see becomes one they cannot grab. */
const MIN_PAD_PX = 10;
const HANDLE_R = 7;
/** Smallest canvas box `refitTo` will fit a drawing into. > `2 * MIN_PAD_PX`, so scale > 0. */
const MIN_CANVAS_PX = 64;
/** ⛔ A scale of 0 collapses every vertex onto one pixel and makes `_u`/`_v` divide by zero. */
const MIN_SCALE = 1e-3;

function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : x > hi ? hi : x;
}

export type OutlineSurfaceMode = 'select' | 'polyline' | 'arc';

export interface OutlineSurfaceOptions {
    /** The authoring extents, metres — `u ∈ [0, length]`, `v ∈ [0, height]`. */
    readonly extents: { readonly length: number; readonly height: number };
    /** The grid function (the L2 `wallProfileEditorSnap` for both current callers). */
    readonly snap: (value: number, on: boolean) => number;
    /** The floor below which a vertex delete is refused. */
    readonly minVertices: number;
    /** Fired after every ring/draft change — the caller updates its status line. */
    readonly onChanged: () => void;
    /** Fired when a delete is refused at the floor — the CALLER owns the refusal text. */
    readonly onDeleteRefused: () => void;
    /** data-* attribute prefix; the modal keeps its historical `wpe`. */
    readonly attrPrefix?: string;
}

export class ElevationOutlineSurface {
    readonly svg: SVGSVGElement;
    private readonly _bound: SVGRectElement;
    private readonly _poly: SVGPolygonElement;
    private readonly _draftPath: SVGPolylineElement;
    private readonly _handleLayer: SVGGElement;
    private readonly _opts: OutlineSurfaceOptions;
    private readonly _prefix: string;

    private _ring: WallProfileVertex[] = [];
    /** px per metre — ONE number for BOTH axes (see the dimensional contract above). */
    private _scale = 1;
    private _pad = MAX_PAD_PX;
    private _dragIndex: number | null = null;

    private _mode: OutlineSurfaceMode = 'select';
    /** The open polyline under construction (polyline/arc modes), metres. */
    private _draft: WallProfileVertex[] | null = null;
    /** Arc gesture state: the pending through-point (2nd click), if any. */
    private _arcThrough: WallProfileVertex | null = null;
    /** ⛔ ABSOLUTE while on — see the header. Placement-time only; drags keep snap semantics. */
    orthoOn = false;

    constructor(opts: OutlineSurfaceOptions) {
        this._opts = opts;
        this._prefix = opts.attrPrefix ?? 'wpe';

        this.svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
        this.svg.style.cssText =
            'display:block;background:#fafafe;border-radius:8px;touch-action:none;';

        // The subject's own extent — the box an outline may only CUT inside.
        this._bound = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
        this._bound.setAttribute('fill', 'none');
        this._bound.setAttribute('stroke', '#c9c9d6');
        this._bound.setAttribute('stroke-dasharray', '5 4');
        this.svg.appendChild(this._bound);

        this._poly = document.createElementNS(SVG_NS, 'polygon') as SVGPolygonElement;
        this._poly.setAttribute('fill', 'rgba(102,0,255,0.13)');
        this._poly.setAttribute('stroke', '#6600FF');
        this._poly.setAttribute('stroke-width', '2');
        this.svg.appendChild(this._poly);

        // The open draft (polyline/arc construction) — drawn as a line, not a closed shape,
        // so the author can see the ring is NOT yet committed.
        this._draftPath = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
        this._draftPath.setAttribute('fill', 'none');
        this._draftPath.setAttribute('stroke', '#6600FF');
        this._draftPath.setAttribute('stroke-width', '2');
        this._draftPath.setAttribute('stroke-dasharray', '6 4');
        this.svg.appendChild(this._draftPath);

        this._handleLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
        this.svg.appendChild(this._handleLayer);

        this.svg.addEventListener('pointermove', (e) => this._onPointerMove(e as PointerEvent));
        this.svg.addEventListener('pointerup', () => { this._dragIndex = null; });
        this.svg.addEventListener('pointerleave', () => { this._dragIndex = null; });
        this.svg.addEventListener('pointerdown', (e) => this._onSurfacePointerDown(e as PointerEvent));
    }

    // ── ring / mode access ───────────────────────────────────────────────────

    /** The committed working ring, METRES. Pixels derive from it, never the reverse. */
    get ring(): ReadonlyArray<WallProfileVertex> { return this._ring; }

    setRing(ring: ReadonlyArray<WallProfileVertex>): void {
        this._ring = ring.map((p) => ({ u: p.u, v: p.v }));
        this._cancelDraft(false);
        this.redraw();
    }

    get mode(): OutlineSurfaceMode { return this._mode; }

    setMode(mode: OutlineSurfaceMode): void {
        if (mode === this._mode) return;
        // Leaving a construction mode abandons the pending gesture but keeps a live draft:
        // polyline → arc continues the SAME open path (the founder's base-plus-arc-head shape
        // is drawn exactly that way).
        this._arcThrough = null;
        this._mode = mode;
        if (mode === 'select') this._cancelDraft(false);
        this.redraw();
    }

    /** The open draft (or null). Exposed for the caller's status line and tests. */
    get draft(): ReadonlyArray<WallProfileVertex> | null { return this._draft; }
    get pendingArcThrough(): WallProfileVertex | null { return this._arcThrough; }

    /**
     * Close the open draft into the working ring (Enter). Returns false — and keeps the
     * draft — when it cannot bound an area yet (< 3 vertices); the CALLER surfaces why.
     */
    closeDraft(): boolean {
        if (!this._draft || this._draft.length < 3) return false;
        this._ring = this._draft;
        this._draft = null;
        this._arcThrough = null;
        this._mode = 'select';
        this.redraw();
        return true;
    }

    /** Abandon the open draft (Esc within a construction mode). */
    cancelDraft(): void { this._cancelDraft(true); }

    private _cancelDraft(redraw: boolean): void {
        this._draft = null;
        this._arcThrough = null;
        if (redraw) this.redraw();
    }

    // ── geometry <-> pixels (moved verbatim from the modal) ──────────────────

    get pxPerMetre(): number { return this._scale; }
    get padPx(): number { return this._pad; }

    toPx(p: WallProfileVertex): { x: number; y: number } {
        return { x: this._x(p.u), y: this._y(p.v) };
    }
    toModel(x: number, y: number): WallProfileVertex {
        return { u: this._u(x), v: this._v(y) };
    }

    private _x(u: number): number { return this._pad + u * this._scale; }
    private _y(v: number): number { return this._pad + (this._opts.extents.height - v) * this._scale; }
    private _u(x: number): number { return (x - this._pad) / this._scale; }
    private _v(y: number): number { return this._opts.extents.height - (y - this._pad) / this._scale; }

    private _padFor(w: number, h: number): number {
        return clamp(Math.floor(Math.min(w, h) * 0.08), MIN_PAD_PX, MAX_PAD_PX);
    }

    /**
     * Re-fit the drawing into a new canvas box. PURE ARITHMETIC over two numbers — no DOM
     * reads — so a test can drive it at sizes no headless layout engine would produce.
     * ⛔ It must never touch the ring: the model is metres, the view is pixels, and only the
     * view is a function of the box.
     */
    refitTo(availW: number, availH: number): void {
        const s = this._opts.extents;
        const w = Math.max(MIN_CANVAS_PX, Number.isFinite(availW) ? availW : MIN_CANVAS_PX);
        const h = Math.max(MIN_CANVAS_PX, Number.isFinite(availH) ? availH : MIN_CANVAS_PX);
        const pad = this._padFor(w, h);
        this._pad = pad;
        this._scale = Math.max(MIN_SCALE, Math.min(
            (w - pad * 2) / Math.max(s.length, 1e-3),
            (h - pad * 2) / Math.max(s.height, 1e-3),
        ));
        this.svg.setAttribute('width', String(s.length * this._scale + pad * 2));
        this.svg.setAttribute('height', String(s.height * this._scale + pad * 2));
        this.redraw();
    }

    // ── interaction ──────────────────────────────────────────────────────────

    private _eventModel(e: PointerEvent): WallProfileVertex {
        const r = this.svg.getBoundingClientRect();
        return this.toModel(e.clientX - r.left, e.clientY - r.top);
    }

    /** Background press: in a construction mode, place a point / drive the arc gesture. */
    private _onSurfacePointerDown(e: PointerEvent): void {
        if (this._mode === 'select') return;
        const s = this._opts.extents;
        const raw = this._eventModel(e);
        const last = this._draft?.length ? this._draft[this._draft.length - 1]! : null;

        if (this._mode === 'polyline') {
            const placed = outlinePlacePoint(last, raw, s, {
                ortho: this.orthoOn,
                snap: !e.shiftKey,
            });
            this._draft = [...(this._draft ?? []), placed];
            this.redraw();
            return;
        }

        // arc — 3 clicks: start (or continue from the draft's last vertex) / through / end.
        const placedFree = outlinePlacePoint(null, raw, s, { ortho: false, snap: !e.shiftKey });
        if (!last) {
            this._draft = [placedFree];
            this.redraw();
            return;
        }
        if (!this._arcThrough) {
            // the THROUGH point is a point ON the curve — never ortho-constrained, never
            // snapped to the previous vertex's axes (an axis-aligned "through" would flatten
            // every arc); the plain grid still applies unless Shift.
            this._arcThrough = placedFree;
            this.redraw();
            return;
        }
        const run = outlineArcSegment(last, this._arcThrough, placedFree, s);
        this._draft = [...this._draft!, ...run];
        this._arcThrough = null;
        this.redraw();
    }

    private _onPointerMove(e: PointerEvent): void {
        if (this._dragIndex === null) return;
        const s = this._opts.extents;
        const m = this._eventModel(e);
        const u = clamp(this._opts.snap(m.u, !e.shiftKey), 0, s.length);
        const v = clamp(this._opts.snap(m.v, !e.shiftKey), 0, s.height);
        this._ring[this._dragIndex] = { u, v };
        this.redraw();
    }

    private _deleteVertex(idx: number): void {
        // A ring below the floor cannot bound an area — the gate would refuse it, so the
        // surface refuses to PRODUCE one rather than offering an edit that cannot commit.
        if (this._ring.length <= this._opts.minVertices) {
            this._opts.onDeleteRefused();
            return;
        }
        this._ring.splice(idx, 1);
        this.redraw();
    }

    // ── drawing ──────────────────────────────────────────────────────────────

    /** Keep the dashed extent rectangle exactly on the current pad/scale. */
    private _syncBound(): void {
        const s = this._opts.extents;
        this._bound.setAttribute('x', String(this._pad));
        this._bound.setAttribute('y', String(this._pad));
        this._bound.setAttribute('width', String(s.length * this._scale));
        this._bound.setAttribute('height', String(s.height * this._scale));
    }

    redraw(): void {
        this._syncBound();
        this._poly.setAttribute(
            'points',
            this._ring.map((p) => `${this._x(p.u)},${this._y(p.v)}`).join(' '),
        );
        const draftPts = this._draft ?? [];
        this._draftPath.setAttribute(
            'points',
            draftPts.map((p) => `${this._x(p.u)},${this._y(p.v)}`).join(' '),
        );

        this._handleLayer.replaceChildren();

        if (this._mode === 'select') {
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
                mid.setAttribute(`data-${this._prefix}-midpoint`, String(i));
                mid.style.cursor = 'copy';
                const at = i;
                mid.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    this._ring.splice(at + 1, 0, { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 });
                    this.redraw();
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
                c.setAttribute(`data-${this._prefix}-vertex`, String(i));
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
        } else {
            // Construction modes: placed draft vertices as plain markers (no drag/insert —
            // the gesture is the editor here), plus the pending arc through-point hollow.
            for (let i = 0; i < draftPts.length; i++) {
                const p = draftPts[i]!;
                const c = document.createElementNS(SVG_NS, 'circle');
                c.setAttribute('cx', String(this._x(p.u)));
                c.setAttribute('cy', String(this._y(p.v)));
                c.setAttribute('r', String(HANDLE_R - 2));
                c.setAttribute('fill', '#6600FF');
                c.setAttribute('stroke', '#fff');
                c.setAttribute(`data-${this._prefix}-draft`, String(i));
                this._handleLayer.appendChild(c);
            }
            if (this._arcThrough) {
                const t = document.createElementNS(SVG_NS, 'circle');
                t.setAttribute('cx', String(this._x(this._arcThrough.u)));
                t.setAttribute('cy', String(this._y(this._arcThrough.v)));
                t.setAttribute('r', String(HANDLE_R - 3));
                t.setAttribute('fill', '#fff');
                t.setAttribute('stroke', '#6600FF');
                t.setAttribute(`data-${this._prefix}-arc-through`, '');
                this._handleLayer.appendChild(t);
            }
        }

        this._opts.onChanged();
    }
}
