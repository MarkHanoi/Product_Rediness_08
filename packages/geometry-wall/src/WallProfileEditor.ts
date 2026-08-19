/**
 * WallProfileEditor — §FEAT-WALL-PROFILE-EDIT (the founder's "I REQUIRED A PROFILE EDIT
 * FEATURE (MODE)" for WALLS).
 *
 * WHAT WAS MISSING, stated plainly. `WallProfile.ts` has owned the MODEL, the ONE
 * authorability gate and the persistence since Slice 1; `WallProfileBodyBuilder.ts` made
 * the body DRAW. Nothing authored the field. `ContextualEditBar.ts:1002` recorded the
 * absence in those words and deliberately withheld the button, because floor and ceiling
 * had already shipped an "Edit Profile" button that did nothing. This file is the thing
 * whose absence that comment was describing.
 *
 * ─── WHY A DOM/SVG EDITOR AND NOT A COPY OF SlabProfileEditor ─────────────────
 *
 * `SlabProfileEditor` drags vertices in the WORLD XZ plane: the slab's authoring frame IS
 * a horizontal plane in the scene, so a 3-D handle at (x, 0, z) and an authored vertex are
 * the same point, and a plan camera looks straight down it. A wall profile is authored in
 * the wall's OWN ELEVATION frame (u along the baseline, v above the base plane —
 * `WallProfile.ts` fixes that convention and this file does not re-derive it). There is no
 * camera in this repo guaranteed to be looking at that plane, so a 3-D handle editor would
 * have had to first BUILD an elevation view of an arbitrary wall, align a camera to it,
 * and keep the two in sync — three unbuilt things standing between the founder and a
 * feature whose model, gate, persistence and geometry are already finished.
 *
 * So the proven pattern is mirrored where it is the same and only where it is the same:
 * ONE editor object, an `activate` / `deactivate` pair that is idempotent, a commit
 * callback that the TOOL turns into a command (this class never touches a store or a bus —
 * the same split `SlabProfileEditor` makes when it hands `_commitProfileEdit` a polygon and
 * knows nothing about `UpdateSlabPolygonCommand`), and a cancel callback. What differs is
 * the surface: an SVG of the wall's elevation, drawn to scale, which is exactly the drawing
 * a profile IS.
 *
 * ⛔ NO THREE, NO STORE, NO COMMAND BUS in this file. P2 (`import * as THREE` outside
 * `renderer-three` fails CI) is satisfied by construction, and P6 is satisfied because the
 * only way anything here reaches the model is the `onCommit` callback the tool supplies.
 */

import type { WallProfileVertex } from './WallProfile';
import { wallProfileSignedArea2, PROFILE_MIN_AREA_M2, PROFILE_MIN_VERTICES } from './WallProfile';

/** Everything the editor needs to draw a wall's elevation. Deliberately NOT a WallData —
 *  the editor must not be able to read anything it has no business reading. */
export interface WallProfileEditorSubject {
    readonly wallId: string;
    /** Planar (XZ) centreline length, metres — the `u` axis extent. */
    readonly length: number;
    /** Wall height, metres — the `v` axis extent. A profile may only CUT inside this. */
    readonly height: number;
    /** The wall's current ring, or `null` for the implicit rectangle. */
    readonly ring: ReadonlyArray<WallProfileVertex> | null;
}

export interface WallProfileEditorCallbacks {
    /** Commit a ring. `null` means "clear the profile — restore the implicit rectangle". */
    onCommit(ring: WallProfileVertex[] | null): void;
    onCancel(): void;
}

const PAD_PX = 44;
const HANDLE_R = 7;
/** Authoring grid, metres. Hold Shift while dragging for a free value. */
const SNAP_M = 0.05;

function snap(x: number, on: boolean): number {
    return on ? Math.round(x / SNAP_M) * SNAP_M : x;
}
function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : x > hi ? hi : x;
}

export class WallProfileEditor {
    private _root: HTMLElement | null = null;
    private _svg: SVGSVGElement | null = null;
    private _poly: SVGPolygonElement | null = null;
    private _handleLayer: SVGGElement | null = null;
    private _status: HTMLElement | null = null;
    private _subject: WallProfileEditorSubject | null = null;
    private _cbs: WallProfileEditorCallbacks | null = null;

    private _ring: WallProfileVertex[] = [];
    private _scale = 1;          // px per metre
    private _dragIndex: number | null = null;
    private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;

    get isActive(): boolean { return this._root !== null; }

    /** TEST SEAM — the working ring, so a headless test can assert edits without pointers. */
    get ring(): ReadonlyArray<WallProfileVertex> { return this._ring; }

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
            : this._rectangle(subject);
        this._build();
        this._redraw();
    }

    /** Close the overlay and drop every listener. Safe to call any number of times. */
    deactivate(): void {
        if (this._onKeyDown) {
            window.removeEventListener('keydown', this._onKeyDown, true);
            this._onKeyDown = null;
        }
        this._root?.remove();
        this._root = null;
        this._svg = null;
        this._poly = null;
        this._handleLayer = null;
        this._status = null;
        this._subject = null;
        this._cbs = null;
        this._ring = [];
        this._dragIndex = null;
    }

    private _rectangle(s: WallProfileEditorSubject): WallProfileVertex[] {
        return [
            { u: 0, v: 0 },
            { u: s.length, v: 0 },
            { u: s.length, v: s.height },
            { u: 0, v: s.height },
        ];
    }

    // ── geometry <-> pixels ──────────────────────────────────────────────────
    private _x(u: number): number { return PAD_PX + u * this._scale; }
    private _y(v: number): number { return PAD_PX + (this._subject!.height - v) * this._scale; }
    private _u(x: number): number { return (x - PAD_PX) / this._scale; }
    private _v(y: number): number { return this._subject!.height - (y - PAD_PX) / this._scale; }

    // ── UI ───────────────────────────────────────────────────────────────────
    private _build(): void {
        const s = this._subject!;
        const maxW = Math.min(920, Math.max(420, window.innerWidth - 160));
        const maxH = Math.min(520, Math.max(240, window.innerHeight - 320));
        this._scale = Math.min(
            (maxW - PAD_PX * 2) / Math.max(s.length, 1e-3),
            (maxH - PAD_PX * 2) / Math.max(s.height, 1e-3),
        );
        const w = s.length * this._scale + PAD_PX * 2;
        const h = s.height * this._scale + PAD_PX * 2;

        const root = document.createElement('div');
        root.id = 'wall-profile-editor';
        root.setAttribute('data-wall-id', s.wallId);
        root.style.cssText =
            'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000000;' +
            'background:#fff;color:#1a1a1a;border:1px solid #d8d8e0;border-radius:12px;' +
            'box-shadow:0 18px 60px rgba(0,0,0,.28);padding:16px 18px 14px;' +
            'font:13px/1.4 system-ui,sans-serif;';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600;margin-bottom:8px;';
        title.textContent =
            `Edit Wall Profile - ${s.length.toFixed(3)} m long, ${s.height.toFixed(3)} m high`;
        root.appendChild(title);

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
        svg.setAttribute('width', String(w));
        svg.setAttribute('height', String(h));
        svg.style.cssText = 'display:block;background:#fafafe;border-radius:8px;touch-action:none;';

        // The wall's own extent — the box a profile may only CUT inside (`WallProfile.ts`:
        // "A profile SUBTRACTS from the rectangle; it never grows it").
        const bound = document.createElementNS(svgNS, 'rect');
        bound.setAttribute('x', String(PAD_PX));
        bound.setAttribute('y', String(PAD_PX));
        bound.setAttribute('width', String(s.length * this._scale));
        bound.setAttribute('height', String(s.height * this._scale));
        bound.setAttribute('fill', 'none');
        bound.setAttribute('stroke', '#c9c9d6');
        bound.setAttribute('stroke-dasharray', '5 4');
        svg.appendChild(bound);

        const poly = document.createElementNS(svgNS, 'polygon') as SVGPolygonElement;
        poly.setAttribute('fill', 'rgba(102,0,255,0.13)');
        poly.setAttribute('stroke', '#6600FF');
        poly.setAttribute('stroke-width', '2');
        svg.appendChild(poly);

        const handles = document.createElementNS(svgNS, 'g') as SVGGElement;
        svg.appendChild(handles);

        svg.addEventListener('pointermove',  (e) => this._onPointerMove(e as PointerEvent));
        svg.addEventListener('pointerup',    () => this._onPointerUp());
        svg.addEventListener('pointerleave', () => this._onPointerUp());
        root.appendChild(svg);

        const status = document.createElement('div');
        status.style.cssText = 'margin:8px 2px 4px;color:#555;min-height:16px;';
        root.appendChild(status);

        const hint = document.createElement('div');
        hint.style.cssText = 'margin:2px 2px 10px;color:#8a8a96;font-size:12px;max-width:640px;';
        hint.textContent =
            'Drag a vertex to reshape. Click a hollow midpoint to insert a vertex. ' +
            'Double-click a vertex to delete it. Shift = free (no 50 mm grid). ' +
            'Esc = cancel, Enter = apply.';
        root.appendChild(hint);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
        row.appendChild(this._button('Reset to rectangle', '#f2f2f7', '#1a1a1a', () => {
            this._ring = this._rectangle(this._subject!);
            this._redraw();
        }));
        row.appendChild(this._button('Clear profile', '#f2f2f7', '#1a1a1a', () => {
            this._cbs?.onCommit(null);
        }));
        row.appendChild(this._button('Cancel', '#f2f2f7', '#1a1a1a', () => this._cbs?.onCancel()));
        row.appendChild(this._button('Apply', '#6600FF', '#fff', () => this._commit()));
        root.appendChild(row);

        document.body.appendChild(root);
        this._root = root;
        this._svg = svg;
        this._poly = poly;
        this._handleLayer = handles;
        this._status = status;

        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); this._cbs?.onCancel(); }
            else if (e.key === 'Enter') { e.stopPropagation(); this._commit(); }
        };
        window.addEventListener('keydown', this._onKeyDown, true);
    }

    private _button(label: string, bg: string, fg: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText =
            `background:${bg};color:${fg};border:1px solid rgba(0,0,0,.08);border-radius:7px;` +
            'padding:7px 13px;cursor:pointer;font:inherit;font-weight:600;';
        b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
        return b;
    }

    private _redraw(): void {
        if (!this._poly || !this._handleLayer) return;
        this._poly.setAttribute(
            'points',
            this._ring.map((p) => `${this._x(p.u)},${this._y(p.v)}`).join(' '),
        );

        const svgNS = 'http://www.w3.org/2000/svg';
        this._handleLayer.replaceChildren();

        // Edge-insertion targets first, so the vertex handles sit above them.
        for (let i = 0; i < this._ring.length; i++) {
            const a = this._ring[i]!;
            const b = this._ring[(i + 1) % this._ring.length]!;
            const mid = document.createElementNS(svgNS, 'circle');
            mid.setAttribute('cx', String((this._x(a.u) + this._x(b.u)) / 2));
            mid.setAttribute('cy', String((this._y(a.v) + this._y(b.v)) / 2));
            mid.setAttribute('r', String(HANDLE_R - 2));
            mid.setAttribute('fill', '#fff');
            mid.setAttribute('stroke', '#b9a2ff');
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
            const c = document.createElementNS(svgNS, 'circle');
            c.setAttribute('cx', String(this._x(p.u)));
            c.setAttribute('cy', String(this._y(p.v)));
            c.setAttribute('r', String(HANDLE_R));
            c.setAttribute('fill', '#6600FF');
            c.setAttribute('stroke', '#fff');
            c.setAttribute('stroke-width', '2');
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
        const u = clamp(snap(this._u(e.clientX - r.left), !e.shiftKey), 0, s.length);
        const v = clamp(snap(this._v(e.clientY - r.top),  !e.shiftKey), 0, s.height);
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
