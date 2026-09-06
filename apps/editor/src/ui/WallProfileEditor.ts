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
// §OUTLINE81 (C86 §10.6 rule 4) — the SVG drawing surface is EXTRACTED so this modal and the
// window outline section are two CALLERS of one surface. Everything dimensional this file used
// to own (px↔metre map, refit arithmetic, handles, drag/snap/clamp) lives there now, verbatim;
// this file keeps what is the MODAL's: chrome, buttons, keyboard, status text, the commit gate.
import { ElevationOutlineSurface } from './ElevationOutlineSurface';

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
/** Used only when the host cannot measure (happy-dom reports every box as 0). */
const FALLBACK_CHROME_PX = 168;
const PANEL_PAD_X = 18;

function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : x > hi ? hi : x;
}

export class WallProfileEditor implements WallProfileEditorPort {
    private _root: HTMLElement | null = null;
    private _surface: ElevationOutlineSurface | null = null;
    private _canvasWrap: HTMLElement | null = null;
    private _status: HTMLElement | null = null;
    private _subject: WallProfileEditorSubject | null = null;
    private _cbs: WallProfileEditorCallbacks | null = null;

    private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
    private _onWinResize: (() => void) | null = null;
    private _disposers: Array<() => void> = [];
    private _ro: ResizeObserver | null = null;
    private _refitting = false;

    get isActive(): boolean { return this._root !== null; }

    // ── TEST SEAMS ───────────────────────────────────────────────────────────
    // Every one of these is a READ. They exist because the dimensional half of this panel is
    // the half that can silently produce WRONG COORDINATES, and a drag test would not notice.
    // Since §OUTLINE81 they FORWARD to the extracted surface — same numbers, same meanings.

    /** The working ring, in METRES. Pixels are derived from it; it is never derived from them. */
    get ring(): ReadonlyArray<WallProfileVertex> { return this._surface?.ring ?? []; }
    /** Current uniform scale, px per metre. */
    get pxPerMetre(): number { return this._surface?.pxPerMetre ?? 1; }
    /** Current drawing inset, px. */
    get padPx(): number { return this._surface?.padPx ?? 44; }
    /** The panel root, or null when closed. */
    get rootElement(): HTMLElement | null { return this._root; }
    /** Exactly what the status line is telling the author right now. */
    get statusText(): string { return this._status?.textContent ?? ''; }
    /**
     * §PL-ENVELOPE-AUTHORING — which authoring mode the surface is in (`'select'` for every
     * subject that did not ask for `drawModes`). A READ, forwarded, exactly like `ring` above.
     */
    get mode(): 'select' | 'polyline' | 'arc' { return this._surface?.mode ?? 'select'; }
    /** §PL-ENVELOPE-AUTHORING — whether ABSOLUTE ortho is armed. A READ, forwarded. */
    get orthoOn(): boolean { return this._surface?.orthoOn ?? false; }
    /** Model (metres) → SVG pixels. */
    toPx(p: WallProfileVertex): { x: number; y: number } {
        return this._surface!.toPx(p);
    }
    /** SVG pixels → model (metres). The exact inverse of {@link toPx} at every panel size. */
    toModel(x: number, y: number): WallProfileVertex {
        return this._surface!.toModel(x, y);
    }

    /**
     * Open the editor over the given wall. Idempotent: activating while already active on
     * ANY wall closes the previous session first, so two overlays can never co-exist.
     */
    activate(subject: WallProfileEditorSubject, cbs: WallProfileEditorCallbacks): void {
        this.deactivate();
        this._subject = subject;
        this._cbs = cbs;
        this._build(
            subject.ring && subject.ring.length >= PROFILE_MIN_VERTICES
                ? subject.ring.map((p) => ({ u: p.u, v: p.v }))
                : wallProfileEditorRectangle(subject),
        );
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
        this._surface = null;
        this._canvasWrap = null;
        this._status = null;
        this._subject = null;
        this._cbs = null;
    }

    // ── geometry <-> pixels ──────────────────────────────────────────────────
    // ⭐ THE DIMENSIONAL CONTRACT lives in `ElevationOutlineSurface` now (§OUTLINE81 moved it
    // verbatim, comment and all); this method stays as the modal's public seam and delegates.

    /**
     * B. RE-FIT THE DRAWING INTO A NEW CANVAS BOX. Delegates to the surface — still pure
     * arithmetic over two numbers, still never touching the ring (the model is metres, the
     * view is pixels, and only the view is a function of the box).
     */
    refitTo(availW: number, availH: number): void {
        if (!this._subject || !this._surface) return;
        this._surface.refitTo(availW, availH);
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
    private _build(initialRing: WallProfileVertex[]): void {
        const s = this._subject!;
        const maxW = clamp(window.innerWidth - 160, 420, 920);
        const maxH = clamp(window.innerHeight - 320, 240, 520);

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
        // §RESI-STAGE-G (2026-09-06) — the SUBJECT names itself when it is not a wall.
        // ⛔ The fallback is the wall sentence VERBATIM, and it is what every existing
        // caller still produces: `wallProfileEditorChrome.test.ts:285` asserts this exact
        // string, and a subject with no `title` must not change one byte of it. The space
        // envelope supplies its own because a footprint is wide and deep, not long and
        // high — a dialog that calls a storey outline a wall is the naming-vs-behaviour
        // defect C114 §0.2 forbids (see `WallProfileEditorSubject.title`).
        title.textContent = s.title
            ?? `Edit Wall Profile - ${s.length.toFixed(3)} m long, ${s.height.toFixed(3)} m high`;
        root.appendChild(title);

        // ⭐ §PL-ENVELOPE-AUTHORING (2026-09-06) — THE DRAWING MODES, FOR SUBJECTS THAT ASK.
        //
        // ⛔ BUILT ONLY WHEN `subject.drawModes` IS TRUE, and that guard is the whole reason this
        // is additive rather than a rewrite: a wall subject omits the flag, this block does not
        // run, and the panel is byte-identical (`wallProfileEditorChrome.test.ts` measures its
        // exact box and its exact title). The same discipline as `subject.title` above.
        //
        // ⛔ AND IT IS NOT A NEW SURFACE. `ElevationOutlineSurface` already implements click-to-
        // place polylines, 3-click arcs and ABSOLUTE ortho (§OUTLINE81, C86 §10.6 rule 2); the
        // wall modal simply never left `'select'`. `WindowOutlineEditorDialog` is the proven
        // caller of exactly these three controls and this row mirrors its vocabulary, so a user
        // who has drawn a window outline already knows this bar. C114 §10b: JOINED, NOT REBUILT.
        if (s.drawModes === true) {
            const modeBar = document.createElement('div');
            modeBar.className = 'wpe-mode-bar';
            modeBar.style.cssText =
                'flex:0 0 auto;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;';
            const modeBtn = (label: string, onClick: () => void): HTMLButtonElement => {
                const b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('data-wpe-mode', label);
                b.style.cssText =
                    'padding:5px 10px;border:1px solid #d8d8e0;border-radius:6px;background:#fff;'
                    + 'color:#1a1a1a;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;';
                b.textContent = label;
                b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
                return b;
            };
            modeBar.appendChild(modeBtn('Move points', () => this._surface?.setMode('select')));
            modeBar.appendChild(modeBtn('Straight', () => this._surface?.setMode('polyline')));
            modeBar.appendChild(modeBtn('Curved', () => this._surface?.setMode('arc')));
            const orthoWrap = document.createElement('label');
            orthoWrap.style.cssText =
                'display:flex;gap:5px;align-items:center;font-size:11.5px;cursor:pointer;';
            const orthoBox = document.createElement('input');
            orthoBox.type = 'checkbox';
            orthoBox.className = 'wpe-ortho';
            orthoBox.style.accentColor = '#6600FF';
            // ⛔ ABSOLUTE while on — the founder's 2026-08-24 ruling, enforced in the L2 helper,
            // not here. This checkbox only carries the intent.
            orthoBox.addEventListener('change', () => {
                if (this._surface) this._surface.orthoOn = orthoBox.checked;
            });
            orthoWrap.append(orthoBox, document.createTextNode('Orthogonal'));
            modeBar.appendChild(orthoWrap);
            root.appendChild(modeBar);
        }

        const wrap = document.createElement('div');
        wrap.className = 'wpe-canvas-wrap';
        // `min-height:0` is load-bearing: without it a flex child refuses to shrink below its
        // content and the panel's fixed rows get pushed out of the box instead.
        wrap.style.cssText =
            'flex:1 1 auto;min-height:0;min-width:0;overflow:hidden;' +
            'display:flex;align-items:center;justify-content:center;';
        root.appendChild(wrap);

        // §OUTLINE81 — THE surface, shared with the window outline section. The wall modal
        // never leaves 'select' mode, which is what keeps its behaviour byte-identical.
        // (The wall's own extent — "a profile SUBTRACTS from the rectangle; it never grows
        // it" — is the surface's dashed bound rectangle.)
        const surface = new ElevationOutlineSurface({
            extents: { length: s.length, height: s.height },
            snap: wallProfileEditorSnap,
            minVertices: PROFILE_MIN_VERTICES,
            onChanged: () => this._setStatus(),
            onDeleteRefused: () =>
                this._setStatus(`A profile needs at least ${PROFILE_MIN_VERTICES} vertices.`),
            attrPrefix: 'wpe',
        });
        wrap.appendChild(surface.svg);

        const status = document.createElement('div');
        status.className = 'wpe-status';
        status.style.cssText = 'flex:0 0 auto;margin:8px 2px 4px;color:#555;min-height:16px;';
        root.appendChild(status);

        const hint = document.createElement('div');
        hint.className = 'wpe-hint';
        hint.style.cssText = 'flex:0 0 auto;margin:2px 2px 10px;color:#8a8a96;font-size:12px;';
        // ⛔ The wall sentence is UNCHANGED for a subject with no `drawModes` — a hint that
        // described modes the panel does not offer would be the naming-vs-behaviour defect.
        hint.textContent = s.drawModes === true
            ? 'Move points, or draw a new perimeter: Straight places corners, Curved takes three '
              + 'clicks (start, through, end), Orthogonal locks each segment to an axis. '
              + 'Click a hollow midpoint to insert a vertex. Double-click a vertex to delete it. '
              + `Shift = free (no ${Math.round(WALL_PROFILE_SNAP_M * 1000)} mm grid). `
              + 'While drawing: Enter closes the outline, Esc abandons it. Otherwise Esc = cancel, '
              + 'Enter = apply.'
            : 'Drag a vertex to reshape. Click a hollow midpoint to insert a vertex. ' +
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
            this._surface?.setRing(wallProfileEditorRectangle(this._subject!));
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
        this._surface = surface;
        this._canvasWrap = wrap;
        this._status = status;

        // The initial fit + ring — the same arithmetic the old inline build ran (refitTo IS
        // that arithmetic), so pad/scale for a given box are byte-identical.
        surface.refitTo(maxW, maxH);
        surface.setRing(initialRing);
        const w = parseFloat(surface.svg.getAttribute('width') ?? '0');
        const h = parseFloat(surface.svg.getAttribute('height') ?? '0');

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
            // ⭐ §PL-ENVELOPE-AUTHORING — mid-GESTURE, the two keys are about the DRAFT, not the
            // dialog. Closing the panel on Esc while a user is halfway through an outline would
            // throw away the whole edit to cancel one click. `WindowOutlineEditorDialog` decided
            // this the same way; the branch exists only for subjects that can be in a draft.
            const drawing = s.drawModes === true && this._surface !== null
                && this._surface.mode !== 'select';
            if (e.key === 'Escape') {
                e.stopPropagation();
                if (drawing) { this._surface!.cancelDraft(); this._surface!.setMode('select'); }
                else this._cbs?.onCancel();
            } else if (e.key === 'Enter') {
                e.stopPropagation();
                if (drawing) {
                    if (!this._surface!.closeDraft()) {
                        this._setStatus(
                            `An outline needs at least ${PROFILE_MIN_VERTICES} placed points before it can close.`,
                        );
                    }
                    return;
                }
                this._commit();
            }
        };
        window.addEventListener('keydown', this._onKeyDown, true);
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

    /** Enclosed area of the working ring, square metres. */
    private _area(): number {
        return Math.abs(wallProfileSignedArea2([...this.ring])) / 2;
    }

    private _setStatus(msg?: string): void {
        if (!this._status) return;
        this._status.textContent = msg
            ?? `${this.ring.length} vertices, enclosed area ${this._area().toFixed(3)} m2`;
        this._status.style.color = msg ? '#b3261e' : '#555';
    }

    /**
     * Hand the working ring to the tool. Pre-checks only what the editor can answer
     * LOCALLY (vertex count and enclosed area); every other judgement — bounds, curve,
     * layers, hosted openings — belongs to `profileAuthorability`, which the command path
     * consults, and is NOT re-implemented here (C84 EI-9: one answer per question).
     */
    private _commit(): void {
        // ⭐ §PL-ENVELOPE-AUTHORING — Apply mid-GESTURE closes the DRAFT, exactly as Enter does.
        // Committing an open polyline would silently drop the points the user has placed since
        // the last closed ring, which is a well-formed wrong answer with no symptom.
        if (this._subject?.drawModes === true && this._surface !== null && this._surface.mode !== 'select') {
            if (!this._surface.closeDraft()) {
                this._setStatus(
                    `An outline needs at least ${PROFILE_MIN_VERTICES} placed points before it can close.`,
                );
            }
            return;
        }
        if (this.ring.length < PROFILE_MIN_VERTICES) {
            this._setStatus(`A profile needs at least ${PROFILE_MIN_VERTICES} vertices.`);
            return;
        }
        if (!(this._area() > PROFILE_MIN_AREA_M2)) {
            this._setStatus('This outline encloses no area - the wall would render as nothing.');
            return;
        }
        this._cbs?.onCommit(this.ring.map((p) => ({ u: p.u, v: p.v })));
    }

    /** Surface a refusal the TOOL obtained from the gate. The editor owns no refusal text. */
    showRefusal(text: string): void {
        this._setStatus(text);
    }
}
