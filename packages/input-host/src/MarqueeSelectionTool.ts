/**
 * MarqueeSelectionTool — §MARQUEE-SELECT-2026
 *
 * Implements Shift + left-mouse-button DRAG on the 3D viewport to draw a
 * rubber-band rectangle and bulk-select every BIM element whose screen
 * footprint falls inside (window mode) or touches (crossing mode) the
 * rectangle.  Result is dispatched through `SelectionBus.selectMany()`.
 *
 * ## Conventions (industry-standard, AutoCAD / Revit / Rhino / SketchUp)
 *
 * | Drag direction       | Mode      | Rule                                | Visual          |
 * |----------------------|-----------|-------------------------------------|-----------------|
 * | LEFT  → RIGHT (Δx>0) | Window    | Element fully ENCLOSED by the rect  | Solid border    |
 * | RIGHT → LEFT  (Δx<0) | Crossing  | Element TOUCHES the rect at all     | Dashed border   |
 *
 * The DRAG_THRESHOLD_PX guard (4 px) ensures a Shift+single-click is NOT
 * mistaken for a marquee — it falls through to whatever Shift+click means
 * in other contexts.
 *
 * ## Architectural compliance
 *
 *   §11 — Keyboard Shortcuts:  claims `Shift + LeftDrag` (3D viewport scope).
 *   §16 — Selection Highlight: secondary highlights handled by
 *                              `SelectionManager.applyMarqueeHighlights()`.
 *   §27 — Selection Orchestration: this tool is a SOURCE; the only mutation
 *         of selection state goes through `selectionBus.selectMany()`.
 *
 * ## Hard guarantees
 *
 *   • Listener is attached in the CAPTURE phase so it runs BEFORE camera-controls'
 *     mousedown handler and can `stopPropagation()` to suppress orbit/pan when
 *     a marquee drag is in progress.
 *   • If the user releases without crossing the drag threshold, NO event is
 *     consumed — Shift+click still propagates normally.
 *   • The HTML overlay is appended to the viewport container, not document.body,
 *     so it cannot leak across panels.
 *   • A single set-id is reused for all hits — no duplicates can ever appear.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { SelectionManager } from './SelectionManager.js';
import { selectionBus }          from '@pryzm/core-app-model';

const DRAG_THRESHOLD_PX = 4;

interface MarqueeDeps {
    /** The 3D viewport's <canvas> element — listener target for pointer events. */
    domElement:  HTMLElement;
    /** Three.js perspective camera used for world→screen projection. */
    camera:      THREE.Camera;
    /** Selection manager — exposes `getSelectableCache()` and the highlight API. */
    selection:   SelectionManager;
    /** Optional predicate to gate marquee activation (e.g. only in 3D mode). */
    isEnabled?:  () => boolean;
}

export class MarqueeSelectionTool {
    private readonly _dom:       HTMLElement;
    private readonly _camera:    THREE.Camera;
    private readonly _selection: SelectionManager;
    private readonly _isEnabled: () => boolean;

    /** Overlay <div> shown while dragging; null when idle. */
    private _overlay: HTMLDivElement | null = null;

    /** Drag origin in client-space (event.clientX/Y), null when idle. */
    private _start: { x: number; y: number } | null = null;
    /** Pointer ID of the active drag — used to capture and release. */
    private _pointerId: number | null = null;
    /** True once the pointer has moved past DRAG_THRESHOLD_PX. */
    private _dragging  = false;

    constructor(deps: MarqueeDeps) {
        this._dom       = deps.domElement;
        this._camera    = deps.camera;
        this._selection = deps.selection;
        this._isEnabled = deps.isEnabled ?? (() => true);

        // CAPTURE phase so we run BEFORE camera-controls / OrbitControls.
        this._dom.addEventListener('pointerdown', this._onPointerDown, { capture: true });
        // Bound on window so we still see the move/up if the cursor leaves the canvas.
        window.addEventListener('pointermove', this._onPointerMove, { capture: true });
        window.addEventListener('pointerup',   this._onPointerUp,   { capture: true });
        // Cancel cleanly if the page loses focus mid-drag.
        window.addEventListener('blur',        this._onBlur);
    }

    // ── Event handlers (arrow funcs so `this` binds without bind()) ───────

    private _onPointerDown = (e: PointerEvent): void => {
        if (!this._isEnabled())     return;
        if (e.button !== 0)         return;   // left button only
        if (!e.shiftKey)            return;   // Shift modifier required
        // Skip if user is over a UI element layered above the canvas (HUDs).
        const tgt = e.target as HTMLElement | null;
        if (tgt && tgt !== this._dom && tgt.closest('input, textarea, button, [contenteditable]')) {
            return;
        }

        this._start     = { x: e.clientX, y: e.clientY };
        this._pointerId = e.pointerId;
        this._dragging  = false;

        // Don't stop propagation YET — wait until threshold is exceeded.
        // This way a Shift+single-click still falls through to whatever
        // downstream handler is interested in it.
    };

    private _onPointerMove = (e: PointerEvent): void => {
        if (!this._start || e.pointerId !== this._pointerId) return;

        const dx = e.clientX - this._start.x;
        const dy = e.clientY - this._start.y;

        if (!this._dragging) {
            const dist2 = dx * dx + dy * dy;
            if (dist2 < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
            // Threshold crossed → commit to marquee mode.
            this._dragging = true;
            this._mountOverlay();
            try { this._dom.setPointerCapture(e.pointerId); } catch { /* noop */ }
        }

        this._updateOverlay(e.clientX, e.clientY);
        // Now actively suppress camera-controls — we own this drag.
        e.stopPropagation();
        e.preventDefault();
    };

    private _onPointerUp = (e: PointerEvent): void => {
        if (!this._start || e.pointerId !== this._pointerId) return;

        const wasDragging = this._dragging;
        const start       = this._start;
        const end         = { x: e.clientX, y: e.clientY };

        // Reset state BEFORE running selection so any errors don't leak.
        this._start     = null;
        this._pointerId = null;
        this._dragging  = false;
        this._unmountOverlay();
        try { this._dom.releasePointerCapture(e.pointerId); } catch { /* noop */ }

        if (!wasDragging) return;   // Shift+single-click — don't consume.

        e.stopPropagation();
        e.preventDefault();

        const dragRightward = end.x >= start.x;   // L→R = window; R→L = crossing.
        const ids = this._collectHits(start, end, dragRightward);

        // Always route through the bus (single source of truth — §27).
        selectionBus.selectMany(ids, '3d-canvas', /* additive */ false);
    };

    private _onBlur = (): void => {
        if (!this._start) return;
        this._start     = null;
        this._pointerId = null;
        this._dragging  = false;
        this._unmountOverlay();
    };

    // ── Overlay management ──────────────────────────────────────────────────

    private _mountOverlay(): void {
        if (this._overlay) return;
        const div = document.createElement('div');
        div.className = 'pryzm-marquee-overlay';
        Object.assign(div.style, {
            position:       'fixed',
            left:           '0px',
            top:            '0px',
            width:          '0px',
            height:         '0px',
            pointerEvents:  'none',
            zIndex:         '99999',
            border:         '1px solid #00ff66',
            background:     'rgba(0, 255, 102, 0.10)',
            boxSizing:      'border-box',
        } as Partial<CSSStyleDeclaration>);
        document.body.appendChild(div);
        this._overlay = div;
    }

    private _updateOverlay(curX: number, curY: number): void {
        if (!this._overlay || !this._start) return;
        const x  = Math.min(this._start.x, curX);
        const y  = Math.min(this._start.y, curY);
        const w  = Math.abs(curX - this._start.x);
        const h  = Math.abs(curY - this._start.y);
        const rightward = curX >= this._start.x;
        const s = this._overlay.style;
        s.left   = `${x}px`;
        s.top    = `${y}px`;
        s.width  = `${w}px`;
        s.height = `${h}px`;
        // Window mode = solid border; Crossing mode = dashed border (CAD convention).
        s.borderStyle = rightward ? 'solid' : 'dashed';
    }

    private _unmountOverlay(): void {
        if (!this._overlay) return;
        this._overlay.remove();
        this._overlay = null;
    }

    // ── Hit testing ─────────────────────────────────────────────────────────

    /**
     * For every selectable in the scene, project its 8 world-AABB corners to
     * screen space, build the 2D screen AABB, and test against the marquee
     * rect.  Returns the de-duplicated list of element IDs.
     *
     * Performance: O(N) with N = selectable count (typically tens to a few
     * hundred).  Each test is 8 matrix multiplies + 4 comparisons — cheap.
     */
    private _collectHits(
        start:     { x: number; y: number },
        end:       { x: number; y: number },
        windowMode: boolean,
    ): string[] {
        const cache = this._selection.getSelectableCache();
        if (cache.length === 0) return [];

        // Marquee rect in CLIENT coordinates.
        const rect = this._dom.getBoundingClientRect();
        const rL = Math.min(start.x, end.x) - rect.left;
        const rR = Math.max(start.x, end.x) - rect.left;
        const rT = Math.min(start.y, end.y) - rect.top;
        const rB = Math.max(start.y, end.y) - rect.top;

        const W = rect.width;
        const H = rect.height;

        const cam = this._camera;
        // Pre-allocated working vector — one alloc per call, not per object.
        const v = new THREE.Vector3();
        const corners = new Array(8).fill(0).map(() => new THREE.Vector3());

        const hits = new Set<string>();

        for (const obj of cache) {
            const id = obj.userData?.id;
            if (!id) continue;

            let box: THREE.Box3;
            try {
                box = new THREE.Box3().setFromObject(obj);
            } catch {
                continue;
            }
            if (box.isEmpty()) continue;

            corners[0].set(box.min.x, box.min.y, box.min.z);
            corners[1].set(box.max.x, box.min.y, box.min.z);
            corners[2].set(box.min.x, box.max.y, box.min.z);
            corners[3].set(box.max.x, box.max.y, box.min.z);
            corners[4].set(box.min.x, box.min.y, box.max.z);
            corners[5].set(box.max.x, box.min.y, box.max.z);
            corners[6].set(box.min.x, box.max.y, box.max.z);
            corners[7].set(box.max.x, box.max.y, box.max.z);

            // E1: Project to NDC then convert to canvas pixel coordinates.
            // Only include corners within the view frustum (v.z in [-1, 1]).
            // Corners behind the near plane (v.z < -1) have flipped NDC x/y
            // after perspective divide, producing a misleading screen AABB that
            // can cover the entire viewport and select wrong elements.
            // If an element spans the near plane (some corners behind, some in
            // front) we conservatively expand to the full viewport — better to
            // over-select than to silently discard a visible element.
            let minSx =  Infinity, minSy =  Infinity;
            let maxSx = -Infinity, maxSy = -Infinity;
            let inFront = 0;
            let clipped = 0;

            for (let i = 0; i < 8; i++) {
                v.copy(corners[i]).project(cam);
                // v.z in NDC: -1 = near plane, +1 = far plane.
                if (v.z < -1 || v.z > 1) { clipped++; continue; }
                inFront++;
                const sx = (v.x * 0.5 + 0.5) * W;
                const sy = (1 - (v.y * 0.5 + 0.5)) * H;
                if (sx < minSx) minSx = sx;
                if (sy < minSy) minSy = sy;
                if (sx > maxSx) maxSx = sx;
                if (sy > maxSy) maxSy = sy;
            }

            // Skip elements with no corners inside the view frustum.
            if (inFront === 0) continue;

            // Element spans the near plane: some corners are behind the camera.
            // Conservative expansion to full viewport prevents missed selections.
            if (clipped > 0) { minSx = 0; minSy = 0; maxSx = W; maxSy = H; }

            if (windowMode) {
                // Window: element FULLY enclosed.
                if (minSx >= rL && maxSx <= rR && minSy >= rT && maxSy <= rB) {
                    hits.add(id);
                }
            } else {
                // Crossing: any overlap between projected AABB and marquee rect.
                const overlapX = maxSx >= rL && minSx <= rR;
                const overlapY = maxSy >= rT && minSy <= rB;
                if (overlapX && overlapY) hits.add(id);
            }
        }

        return Array.from(hits);
    }

    /** Tear down listeners (called only on engine shutdown — not during normal use). */
    public dispose(): void {
        this._dom.removeEventListener('pointerdown', this._onPointerDown, { capture: true } as any);
        window.removeEventListener('pointermove',    this._onPointerMove, { capture: true } as any);
        window.removeEventListener('pointerup',      this._onPointerUp,   { capture: true } as any);
        window.removeEventListener('blur',           this._onBlur);
        this._unmountOverlay();
    }
}
