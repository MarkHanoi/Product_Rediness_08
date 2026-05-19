/**
 * @file UnderlayReferenceRotateTool.ts
 *
 * Revit-style 3-point reference rotate for PDF/image underlays.
 *
 * Workflow (mirrors UnderlayReferenceScaleTool):
 *   1. User clicks Rotate button while a floor_plan_underlay is selected.
 *   2. Click Point 1 — pivot of rotation.
 *   3. Click Point 2 — reference end (defines the current direction P1→P2).
 *   4. Click Point 3 — target end (defines the desired direction P1→P3).
 *      Rotation = angle(P1→P3) − angle(P1→P2), applied around the pivot.
 *
 * Works in BOTH the 3D viewport (ground plane intersection) AND the 2D plan
 * view (PlanViewCanvas.screenToWorld). A transparent overlay canvas draws the
 * markers, the two reference rays, and the live arc preview.
 *
 * Activation:    listens for 'underlay:reference-rotate-activate' custom event
 * Completion:    dispatches 'underlay:rotation-applied' and 'underlay:reference-rotate-done'
 * Cancellation:  Escape → dispatches 'bim-operation-cancelled'
 *
 * Mode HUD (Linear / Orthogonal — default Orthogonal, mirrors Scale tool):
 *   • Orthogonal — applies pure-ortho snapping to BOTH picks:
 *       – P2 snaps to the horiz/vert ray through P1 (axis-aligned reference).
 *       – P3 snaps the resulting delta to 90° increments (pure orthogonal
 *         rotation: 0° / 90° / 180° / 270°). Use this when the floor plan
 *         is already axis-aligned.
 *   • Linear     — free-form, no snapping. Use this when the floor plan is
 *     angled or you need a fine rotation under 15° / non-multiple of 90°.
 *
 * Direction convention:
 *   The mesh rotates from P2 toward P3 around the pivot P1, matching the
 *   visual direction the user dragged on screen. (PlanViewCanvas displays
 *   world +Z as screen-down, so the call into applyRotation negates the
 *   raw world-delta to keep screen-visual chirality consistent with the
 *   user's pick.)
 *
 * Typed-angle entry (during pick_p3):
 *   The user may type a delta angle in degrees and press Enter instead of
 *   clicking Point 3. Sign matches the direction implied by P2 (CCW positive).
 *
 * Contract compliance:
 *   §00 §01 — Tool layer; no direct store writes (mesh transform is a non-BIM
 *             overlay, mutation is delegated to FloorPlanUnderlayTool.applyRotation
 *             which is the canonical owner of the underlay mesh).
 *   §05    — Native HTML only; HUD reuses wdh- and th-dim-overlay tokens.
 *   §16    — Selection state preserved (selection disabled during pick to avoid
 *             accidental deselect, re-enabled on finish/cancel).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
// Sprint AH — UnderlayScaleMode/Callbacks defined locally; HUD dispatched via DOM event
export type UnderlayScaleMode = 'linear' | 'orthogonal';
export interface UnderlayScaleHUDCallbacks {
    onSwitchLinear: () => void;
    onSwitchOrtho: () => void;
}
import { captureUnderlaySnapshot } from '@pryzm/command-registry';

type RotatePhase = 'idle' | 'pick_p1' | 'pick_p2' | 'pick_p3';

interface SvpMarker {
    worldX: number;
    worldZ: number;
    color:  string;
    label:  string;
}

/**
 * Orthogonal-mode rotation snap step (degrees).
 *
 * 90° = pure orthogonal — only allows 0° / 90° / 180° / 270° rotations.
 * Use Linear mode for any non-multiple of 90°, including angles smaller
 * than the previous 15° floor.
 */
const ORTHO_STEP_DEG = 90;

export class UnderlayReferenceRotateTool {
    private _phase: RotatePhase = 'idle';
    private _underlayMesh: THREE.Mesh | null = null;
    private _underlayTool: any = null;

    private _p1: THREE.Vector3 | null = null;   // pivot
    private _p2: THREE.Vector3 | null = null;   // reference end

    private _scene:      THREE.Scene  | null = null;
    private _camera:     THREE.Camera | null = null;
    private _domElement: HTMLElement  | null = null;

    // Plan-view (SVP) state
    private _svpCanvas:      HTMLCanvasElement | null = null;
    private _planViewCanvas: any | null = null;
    private _svpOverlay:     HTMLCanvasElement | null = null;
    private _svpMarkers:     SvpMarker[] = [];
    // D.7.5 batch #5: rAF handle replaced by FrameScheduler disposer.
    private _raf: TickListenerDisposer | null = null;

    private _hud: HTMLElement | null = null;
    private _markers:     THREE.Object3D[] = [];
    private _segmentLine: THREE.Line | null = null;

    private readonly _raycaster = new THREE.Raycaster();
    private readonly _mouse     = new THREE.Vector2();

    private _boundClick:    (e: MouseEvent)    => void;
    private _boundSvpClick: (e: MouseEvent)    => void;
    private _boundSvpMove:  (e: MouseEvent)    => void;
    private _boundSvpLeave: (e: MouseEvent)    => void;
    private _boundKeyDown:  (e: KeyboardEvent) => void;
    private readonly _boundSvpAttach = () => this._lateBoundSvp();

    private _cursorSx: number | null = null;
    private _cursorSy: number | null = null;

    private _drawMode: UnderlayScaleMode = 'orthogonal';


    // Typed-angle (degrees) input during pick_p3
    private _angBuffer: string = '';
    private _angOverlay: HTMLElement | null = null;
    private _angSign: 1 | -1 = 1;   // toggled with '-' key

    constructor() {
        this._boundClick    = this._onClick.bind(this);
        this._boundSvpClick = this._onSvpClick.bind(this);
        this._boundSvpMove  = this._onSvpMove.bind(this);
        this._boundSvpLeave = this._onSvpLeave.bind(this);
        this._boundKeyDown  = this._onKeyDown.bind(this);

        // F.events.15 — runtime.events.on replaces window.addEventListener.
        (window as any).runtime?.events?.on('underlay:reference-rotate-activate', (detail: { underlayTool: unknown }) => {
            this._underlayTool = detail.underlayTool ?? null;
            this._underlayMesh = this._underlayTool?.getState()?.mesh ?? null;

            if (!this._underlayMesh) {
                console.warn('[UnderlayReferenceRotateTool] No underlay mesh — cannot start');
                return;
            }

            const world = window.world;
            this._scene      = world?.scene?.three ?? null;
            this._camera     = world?.camera?.three ?? null;
            this._domElement = (world?.renderer?.three as THREE.WebGLRenderer | undefined)?.domElement
                ?? document.getElementById('container')
                ?? document.body;

            const svm = window.splitViewManager;
            this._svpCanvas      = svm?.getSvpCanvas?.()  ?? null;
            this._planViewCanvas = svm?.getPlanCanvas?.() ?? null;

            // Fall back to PlanViewManager when:
            //   (a) no svpCanvas at all, OR
            //   (b) svpCanvas came from SplitViewManager but planViewCanvas is
            //       null (split view was previously activated then deactivated —
            //       its DOM canvas persists but _planCanvas was torn down).
            // NOTE: isActive guard removed — it was too strict and prevented
            // canvas resolution in normal plan view when isActive reports false.
            if (!this._svpCanvas || !this._planViewCanvas) {
                const pvm = window.planViewManager;
                const mainCanvas = document.getElementById('svp-plan-view-canvas') as HTMLCanvasElement | null;
                if (mainCanvas && pvm?.planViewCanvas) {
                    this._svpCanvas      = mainCanvas;
                    this._planViewCanvas = pvm.planViewCanvas;
                    console.log('[UnderlayReferenceRotateTool] Using main plan-view canvas (isActive guard bypassed)');
                }
            }

            this._start();
        });
    }

    private _start(): void {
        this._phase = 'pick_p1';
        this._p1 = null;
        this._p2 = null;
        this._clearScene();
        this._clearSvpOverlay();

        window.__underlayScaleActive = true;   // reuse the global guard

        const selMgr = window.selectionManager;
        if (selMgr) selMgr.setEnabled(false);

        this._showHud('🔄 Reference Rotate — Click Point 1 (pivot of rotation)');

        // Mode toggle bar — dispatched via event to UI layer.
        window.dispatchEvent(new CustomEvent('pryzm:underlay-hud:show', { // TODO(TASK-11)
            detail: {
                mode: this._drawMode,
                callbacks: {
                    onSwitchLinear: () => {
                        this._drawMode = 'linear';
                        this._redrawSvpOverlay();
                        console.log('[UnderlayReferenceRotateTool] Mode → Linear');
                    },
                    onSwitchOrtho: () => {
                        this._drawMode = 'orthogonal';
                        this._redrawSvpOverlay();
                        console.log('[UnderlayReferenceRotateTool] Mode → Orthogonal (axis-locked P2 + 90° snap on P3)');
                    },
                },
            },
        }));

        this._domElement!.addEventListener('click', this._boundClick);

        if (this._svpCanvas) {
            this._svpCanvas.addEventListener('click', this._boundSvpClick);
            this._svpCanvas.addEventListener('mousemove', this._boundSvpMove);
            this._svpCanvas.addEventListener('mouseleave', this._boundSvpLeave);
            this._svpCanvas.style.cursor = 'crosshair';
            this._mountSvpOverlay();
        }

        window.addEventListener('splitview:activated', this._boundSvpAttach, { once: true });
        window.addEventListener('keydown', this._boundKeyDown);

        console.log('[UnderlayReferenceRotateTool] Started — waiting for pivot');
    }

    private _lateBoundSvp(): void {
        const svm = window.splitViewManager;
        const svp: HTMLCanvasElement | null = svm?.getSvpCanvas?.() ?? null;
        if (svp && svp !== this._svpCanvas) {
            this._svpCanvas      = svp;
            this._planViewCanvas = svm?.getPlanCanvas?.() ?? null;
            svp.addEventListener('click', this._boundSvpClick);
            svp.addEventListener('mousemove', this._boundSvpMove);
            svp.addEventListener('mouseleave', this._boundSvpLeave);
            svp.style.cursor = 'crosshair';
            this._mountSvpOverlay();
        }
    }

    // ── 3D viewport click ────────────────────────────────────────────────────

    private _onClick(e: MouseEvent): void {
        if (e.button !== 0 || !this._underlayMesh || !this._camera || !this._domElement) return;

        const rect = this._domElement.getBoundingClientRect();
        this._mouse.set(
            ((e.clientX - rect.left) / rect.width)  * 2 - 1,
            -((e.clientY - rect.top)  / rect.height) * 2 + 1,
        );
        this._raycaster.setFromCamera(this._mouse, this._camera);

        const underlayY = this._underlayMesh.position.y;
        const plane     = new THREE.Plane(new THREE.Vector3(0, 1, 0), -underlayY);
        const worldPt   = new THREE.Vector3();
        if (!this._raycaster.ray.intersectPlane(plane, worldPt)) return;

        // Apply ortho angle snap during pick_p3 (3D view too)
        const snapped = this._maybeSnapToOrtho(worldPt);
        this._handlePoint(snapped, null);
    }

    // ── Plan-view (SVP) click ────────────────────────────────────────────────

    private _onSvpClick(e: MouseEvent): void {
        if (e.button !== 0 || !this._underlayMesh) return;

        console.log('[UnderlayReferenceRotateTool] SVP click received, phase:', this._phase, 'hasPlanViewCanvas:', !!this._planViewCanvas);

        if (!this._planViewCanvas) {
            const svm = window.splitViewManager;
            this._planViewCanvas = svm?.getPlanCanvas?.() ?? null;
        }
        if (!this._planViewCanvas) {
            const pvm = window.planViewManager;
            // Try planViewManager unconditionally (isActive guard was too strict)
            this._planViewCanvas = pvm?.planViewCanvas ?? null;
        }
        if (!this._planViewCanvas) {
            console.warn('[UnderlayReferenceRotateTool] _onSvpClick: planViewCanvas still null — cannot place point');
            return;
        }

        const target = e.currentTarget as HTMLCanvasElement;
        const rect   = target.getBoundingClientRect();
        const sx     = e.clientX - rect.left;
        const sy     = e.clientY - rect.top;

        const w = this._planViewCanvas.screenToWorld(sx, sy);
        const underlayY = this._underlayMesh.position.y;
        let worldPt = new THREE.Vector3(w.worldX, underlayY, w.worldZ);

        worldPt = this._maybeSnapToOrtho(worldPt);

        const sxOut = this._planViewCanvas.worldToScreen(worldPt.x, worldPt.z);
        this._handlePoint(worldPt, { sx: sxOut.sx, sy: sxOut.sy });
    }

    private _onSvpMove(e: MouseEvent): void {
        if (this._phase === 'idle' || !this._planViewCanvas) return;
        const target = e.currentTarget as HTMLCanvasElement;
        const rect   = target.getBoundingClientRect();
        this._cursorSx = e.clientX - rect.left;
        this._cursorSy = e.clientY - rect.top;
        this._redrawSvpOverlay();
    }

    private _onSvpLeave(_e: MouseEvent): void {
        this._cursorSx = null;
        this._cursorSy = null;
        this._redrawSvpOverlay();
    }

    /**
     * Apply Orthogonal-mode snapping to a candidate world point. Behaviour
     * depends on the current pick phase:
     *
     *   • pick_p2 — snaps the candidate to the horizontal or vertical ray
     *     through P1 (whichever is closer), so the reference direction is
     *     axis-aligned. Mirrors the Scale tool's "horiz / vert" snap and
     *     allows the user to pick P2 along a strict X or Z axis through P1.
     *
     *   • pick_p3 — snaps the resulting rotation delta to ORTHO_STEP_DEG
     *     increments (currently 90°), giving pure orthogonal rotations.
     *
     * In Linear mode (or any other phase) the input is returned unchanged so
     * the user can pick freely — including small rotations under the old
     * 15° floor.
     */
    private _maybeSnapToOrtho(worldPt: THREE.Vector3): THREE.Vector3 {
        if (this._drawMode !== 'orthogonal' || !this._p1) return worldPt;

        // ── Phase pick_p2: lock to horiz/vert axis through P1 ────────────────
        if (this._phase === 'pick_p2') {
            const dx = worldPt.x - this._p1.x;
            const dz = worldPt.z - this._p1.z;
            // Choose the axis the cursor is closer to (larger projection wins)
            if (Math.abs(dx) >= Math.abs(dz)) {
                // Horizontal lock — keep X, pin Z to P1
                return new THREE.Vector3(worldPt.x, worldPt.y, this._p1.z);
            }
            // Vertical lock — keep Z, pin X to P1
            return new THREE.Vector3(this._p1.x, worldPt.y, worldPt.z);
        }

        // ── Phase pick_p3: snap rotation delta to ORTHO_STEP_DEG increments ──
        if (this._phase === 'pick_p3' && this._p2) {
            const refAng = Math.atan2(this._p2.z - this._p1.z, this._p2.x - this._p1.x);
            const rawAng = Math.atan2(worldPt.z - this._p1.z, worldPt.x - this._p1.x);

            let delta = rawAng - refAng;
            while (delta >  Math.PI) delta -= 2 * Math.PI;
            while (delta < -Math.PI) delta += 2 * Math.PI;

            const stepRad = ORTHO_STEP_DEG * Math.PI / 180;
            const snappedDelta = Math.round(delta / stepRad) * stepRad;
            const snappedAng = refAng + snappedDelta;

            // Preserve the cursor's distance from pivot
            const r = Math.hypot(worldPt.x - this._p1.x, worldPt.z - this._p1.z);
            return new THREE.Vector3(
                this._p1.x + r * Math.cos(snappedAng),
                worldPt.y,
                this._p1.z + r * Math.sin(snappedAng),
            );
        }

        return worldPt;
    }

    // ── Shared point logic ───────────────────────────────────────────────────

    private _handlePoint(
        worldPt: THREE.Vector3,
        svpCoord: { sx: number; sy: number } | null,
    ): void {
        if (this._phase === 'pick_p1') {
            this._p1 = worldPt.clone();
            this._addMarker(worldPt, 0x00e5ff, '1');
            if (svpCoord) this._addSvpMarker(worldPt.x, worldPt.z, '#00e5ff', '1');
            this._phase = 'pick_p2';
            this._showHud('🔄 Reference Rotate — Click Point 2 (current direction from pivot)');

        } else if (this._phase === 'pick_p2') {
            this._p2 = worldPt.clone();
            this._addMarker(worldPt, 0x00e5ff, '2');
            if (svpCoord) this._addSvpMarker(worldPt.x, worldPt.z, '#00e5ff', '2');
            this._drawSegment(this._p1!, this._p2, 0x00e5ff);

            this._phase = 'pick_p3';
            this._showHud('🔄 Reference Rotate — Click Point 3 (target direction) OR type angle (°) + Enter');
            this._mountAngOverlay();

        } else if (this._phase === 'pick_p3') {
            const p3 = worldPt.clone();
            const refAng = Math.atan2(this._p2!.z - this._p1!.z, this._p2!.x - this._p1!.x);
            const tgtAng = Math.atan2(p3.z      - this._p1!.z, p3.x      - this._p1!.x);
            let delta = tgtAng - refAng;
            while (delta >  Math.PI) delta -= 2 * Math.PI;
            while (delta < -Math.PI) delta += 2 * Math.PI;

            this._addMarker(p3, 0xff9100, '3');
            if (svpCoord) this._addSvpMarker(p3.x, p3.z, '#ff9100', '3');
            this._drawSegment(this._p1!, p3, 0xff9100);

            this._applyRotation(delta);
            this._finish(`✓ Rotated ${(delta * 180 / Math.PI).toFixed(2)}°`);
        }
    }

    // ── SVP overlay ──────────────────────────────────────────────────────────

    private _mountSvpOverlay(): void {
        if (!this._svpCanvas) return;
        this._unmountSvpOverlay();

        const overlay = document.createElement('canvas');
        overlay.width  = this._svpCanvas.width  || this._svpCanvas.clientWidth;
        overlay.height = this._svpCanvas.height || this._svpCanvas.clientHeight;
        overlay.style.cssText = [
            'position:absolute', 'top:0', 'left:0',
            'width:100%', 'height:100%',
            'pointer-events:none', 'z-index:10',
        ].join(';');

        const parent = this._svpCanvas.parentElement;
        if (parent) {
            if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
            parent.appendChild(overlay);
        }
        this._svpOverlay = overlay;
    }

    private _unmountSvpOverlay(): void {
        if (this._svpOverlay) {
            this._svpOverlay.remove();
            this._svpOverlay = null;
        }
    }

    private _addSvpMarker(worldX: number, worldZ: number, color: string, label: string): void {
        this._svpMarkers.push({ worldX, worldZ, color, label });
        this._redrawSvpOverlay();
    }

    private _redrawSvpOverlay(): void {
        // D.7.5 batch #5: coalesced redraw — cancel any pending tick, then
        // schedule a fresh one. Repeated calls within the same frame collapse
        // into a single _drawSvpOverlay() invocation (preserves the original
        // cancelAnimationFrame + requestAnimationFrame coalescing semantics).
        if (this._raf !== null) this._raf();
        this._raf = getFrameScheduler().scheduleOnce(
            'underlay-rotate-svp-redraw',
            () => this._drawSvpOverlay(),
        );
    }

    private _drawSvpOverlay(): void {
        const overlay = this._svpOverlay;
        const pvc     = this._planViewCanvas;
        if (!overlay || !pvc) return;

        const w = this._svpCanvas?.clientWidth  ?? overlay.clientWidth;
        const h = this._svpCanvas?.clientHeight ?? overlay.clientHeight;
        if (overlay.width !== w || overlay.height !== h) {
            overlay.width = w;
            overlay.height = h;
        }

        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);

        // ── Reference ray P1→P2 ──
        if (this._p1 && this._p2) {
            const a = pvc.worldToScreen(this._p1.x, this._p1.z);
            const b = pvc.worldToScreen(this._p2.x, this._p2.z);
            ctx.save();
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
            ctx.restore();
        }

        // ── Live target ray + arc preview during pick_p3 ──
        if (this._phase === 'pick_p3' && this._p1 && this._p2 && this._cursorSx != null && this._cursorSy != null) {
            const cursorWorld = pvc.screenToWorld(this._cursorSx, this._cursorSy);
            const cursorPt = new THREE.Vector3(cursorWorld.worldX, 0, cursorWorld.worldZ);
            const previewPt = this._maybeSnapToOrtho(cursorPt);

            const a = pvc.worldToScreen(this._p1.x, this._p1.z);
            const c = pvc.worldToScreen(previewPt.x, previewPt.z);

            // Target ray (orange, dashed)
            ctx.save();
            ctx.strokeStyle = '#ff9100';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy); ctx.lineTo(c.sx, c.sy);
            ctx.stroke();
            ctx.restore();

            // Arc + delta angle readout
            const refAng = Math.atan2(this._p2.z - this._p1.z, this._p2.x - this._p1.x);
            const tgtAng = Math.atan2(previewPt.z - this._p1.z, previewPt.x - this._p1.x);
            let delta = tgtAng - refAng;
            while (delta >  Math.PI) delta -= 2 * Math.PI;
            while (delta < -Math.PI) delta += 2 * Math.PI;

            // Convert world angles to screen angles (PlanViewCanvas may flip Z)
            const refScreen = pvc.worldToScreen(
                this._p1.x + Math.cos(refAng), this._p1.z + Math.sin(refAng),
            );
            const tgtScreen = pvc.worldToScreen(
                this._p1.x + Math.cos(tgtAng), this._p1.z + Math.sin(tgtAng),
            );
            const refScrAng = Math.atan2(refScreen.sy - a.sy, refScreen.sx - a.sx);
            const tgtScrAng = Math.atan2(tgtScreen.sy - a.sy, tgtScreen.sx - a.sx);

            const arcR = 36;
            ctx.save();
            ctx.strokeStyle = '#ff9100';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            // Arc direction (CCW vs CW) — pick the shorter side that matches delta sign
            const ccw = delta >= 0;
            ctx.arc(a.sx, a.sy, arcR, refScrAng, tgtScrAng, !ccw);
            ctx.stroke();
            ctx.restore();

            // Angle readout pill
            const deg = (delta * 180 / Math.PI);
            const txt = `${deg >= 0 ? '+' : ''}${deg.toFixed(1)}°`;
            ctx.save();
            ctx.font = 'bold 12px system-ui,sans-serif';
            const tw = ctx.measureText(txt).width;
            const tx = a.sx + 14;
            const ty = a.sy - arcR - 4;
            ctx.fillStyle = 'rgba(0,0,0,0.78)';
            ctx.fillRect(tx - 4, ty - 12, tw + 10, 18);
            ctx.fillStyle = '#fff';
            ctx.fillText(txt, tx + 1, ty + 2);
            ctx.restore();
        }

        // ── Markers ──
        for (const m of this._svpMarkers) {
            const { sx, sy } = pvc.worldToScreen(m.worldX, m.worldZ);
            const r = 8;
            ctx.save();
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.fillStyle = m.color + '55';
            ctx.beginPath(); ctx.arc(sx, sy, r - 1, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px system-ui,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(m.label, sx, sy);
            ctx.restore();
        }

        // ── Cursor crosshair ──
        if (this._cursorSx != null && this._cursorSy != null) {
            ctx.save();
            ctx.strokeStyle = 'rgba(124, 58, 237, 0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this._cursorSx - 10, this._cursorSy);
            ctx.lineTo(this._cursorSx + 10, this._cursorSy);
            ctx.moveTo(this._cursorSx, this._cursorSy - 10);
            ctx.lineTo(this._cursorSx, this._cursorSy + 10);
            ctx.stroke();
            ctx.restore();
        }
    }

    private _clearSvpOverlay(): void {
        // D.7.5 batch #5: dispose any pending FrameScheduler tick.
        if (this._raf !== null) { this._raf(); this._raf = null; }
        this._svpMarkers = [];
        if (this._svpOverlay) {
            const ctx = this._svpOverlay.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, this._svpOverlay.width, this._svpOverlay.height);
        }
    }

    // ── Apply ────────────────────────────────────────────────────────────────

    private _applyRotation(deltaRad: number): void {
        if (!this._underlayTool || !this._p1) return;

        // Contract 01 §2.1 — capture BEFORE so the rotation is recorded as
        // a TransformUnderlayCommand and Ctrl+Z can reverse it.
        const before = captureUnderlaySnapshot();

        // Direction-correction (PlanViewCanvas chirality):
        //   `deltaRad` is computed in screen-CCW positive convention from the
        //   user's P2 → P3 pick (or typed angle). PlanViewCanvas displays
        //   world +Z as screen-DOWN, which means world atan2(z,x) increases
        //   visually CW on screen. Rotating the mesh by +deltaRad around
        //   world +Y therefore moves it OPPOSITE to the user's pick.
        //   Negate so the underlay rotates from P2 → P3 around P1, matching
        //   the visual direction the user dragged.
        const worldDelta = -deltaRad;

        if (typeof this._underlayTool.applyRotation === 'function') {
            this._underlayTool.applyRotation(worldDelta, this._p1.x, this._p1.z);
        } else if (this._underlayMesh) {
            // Fallback if older underlay tool: rotate mesh in place around world Y.
            this._underlayMesh.rotation.z += worldDelta;
        }

        // Push the command (idempotent first execute; undo restores `before`).
        if (typeof this._underlayTool.pushTransformCommand === 'function') {
            this._underlayTool.pushTransformCommand(before, 'reference-rotate');
        }

        window.dispatchEvent(new CustomEvent('underlay:rotation-applied', { // TODO(TASK-11)
            detail: { deltaRad, deltaDeg: deltaRad * 180 / Math.PI, pivot: this._p1.clone() },
        }));
        // Reuse the persistence trigger used by scale so the new transform is saved.
        window.dispatchEvent(new CustomEvent('underlay:scale-applied', { // TODO(TASK-11)
            detail: { factor: 1, source: 'rotate' },
        }));
        console.log('[UnderlayReferenceRotateTool] Applied:', (deltaRad * 180 / Math.PI).toFixed(2), '°');
    }

    private _finish(message: string): void {
        this._phase = 'idle';
        this._showHud(message, 2500);

        setTimeout(() => {
            this._cleanup();

            const selMgr = window.selectionManager;
            if (selMgr) selMgr.setEnabled(true);

            window.dispatchEvent(new CustomEvent('bim-operation-cancelled', { // TODO(TASK-11)
                detail: { operationId: 'rotate' },
            }));
            window.dispatchEvent(new CustomEvent('underlay:reference-rotate-done')); // TODO(TASK-11)

            const mesh = this._underlayMesh;
            if (mesh) {
                const updateInspector = window.updateInspector;
                if (typeof updateInspector === 'function') updateInspector(mesh);
                window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { object: mesh } })); // keep DOM for plugins
                (window as any).runtime?.events?.emit('bim-selection-changed', { object: mesh }); // F.events.16 bridge
            }
        }, 2500);
    }

    cancel(): void {
        this._cleanup();
        const selMgr = window.selectionManager;
        if (selMgr) selMgr.setEnabled(true);
        window.dispatchEvent(new CustomEvent('bim-operation-cancelled', { // TODO(TASK-11)
            detail: { operationId: 'rotate' },
        }));
        console.log('[UnderlayReferenceRotateTool] Cancelled by user');
    }

    private _cleanup(): void {
        this._phase = 'idle';
        this._clearScene();
        this._clearSvpOverlay();
        this._unmountSvpOverlay();
        this._hideHud();
        window.dispatchEvent(new CustomEvent('pryzm:underlay-hud:dismiss')); // TODO(TASK-11)
        this._unmountAngOverlay();
        this._domElement?.removeEventListener('click', this._boundClick);
        this._svpCanvas?.removeEventListener('click', this._boundSvpClick);
        this._svpCanvas?.removeEventListener('mousemove', this._boundSvpMove);
        this._svpCanvas?.removeEventListener('mouseleave', this._boundSvpLeave);
        if (this._svpCanvas) this._svpCanvas.style.cursor = '';
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('splitview:activated', this._boundSvpAttach);
        window.__underlayScaleActive = false;
        this._cursorSx = null;
        this._cursorSy = null;
        this._svpCanvas      = null;
        this._planViewCanvas = null;
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────

    private _onKeyDown(e: KeyboardEvent): void {
        const tgt = e.target as HTMLElement | null;
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

        if (e.key === 'Escape') {
            if (this._angBuffer.length > 0) {
                e.preventDefault();
                this._angBuffer = '';
                this._angSign = 1;
                this._updateAngOverlay();
                return;
            }
            this.cancel();
            return;
        }

        if (this._phase !== 'pick_p3') return;

        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            this._angBuffer += e.key;
            this._updateAngOverlay();
            return;
        }
        if (e.key === '.' && !this._angBuffer.includes('.')) {
            e.preventDefault();
            this._angBuffer += e.key;
            this._updateAngOverlay();
            return;
        }
        if (e.key === '-') {
            e.preventDefault();
            this._angSign = (this._angSign === 1 ? -1 : 1);
            this._updateAngOverlay();
            return;
        }
        if (e.key === 'Backspace' && this._angBuffer.length > 0) {
            e.preventDefault();
            this._angBuffer = this._angBuffer.slice(0, -1);
            this._updateAngOverlay();
            return;
        }
        if (e.key === 'Enter' && this._angBuffer.length > 0) {
            e.preventDefault();
            this._applyTypedAngle();
            return;
        }
    }

    private _applyTypedAngle(): void {
        const mag = parseFloat(this._angBuffer);
        if (!isFinite(mag) || mag <= 0) {
            this._showHud('⚠ Enter a positive angle in degrees', 1500);
            return;
        }
        const deg = this._angSign * mag;
        const rad = deg * Math.PI / 180;

        this._applyRotation(rad);
        this._finish(`✓ Rotated ${deg.toFixed(2)}°`);
    }

    // ── Typed-angle .th-dim-overlay (reuses wall dim styling) ───────────────

    private _mountAngOverlay(): void {
        if (this._angOverlay) return;
        const el = document.createElement('div');
        el.className = 'th-dim-overlay';
        el.setAttribute('data-underlay-rotate-ang', '1');
        el.style.bottom = '210px';
        el.style.display = 'none';
        document.body.appendChild(el);
        this._angOverlay = el;
        this._updateAngOverlay();
    }

    private _updateAngOverlay(): void {
        const el = this._angOverlay;
        if (!el) return;

        const sign = this._angSign === -1 ? '−' : '+';
        if (this._angBuffer.length === 0) {
            el.innerHTML =
                `<span class="th-dim-label">Angle</span>` +
                `<span style="opacity:0.55;letter-spacing:1px;">${sign}type degrees…</span>` +
                `<span class="th-dim-cursor">|</span>` +
                ` <span class="th-dim-unit">°</span>`;
            el.style.display = 'block';
            return;
        }

        const safe = this._angBuffer
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        el.innerHTML =
            `<span class="th-dim-label">Angle</span>` +
            `<span style="letter-spacing:1px;">${sign}${safe}</span>` +
            `<span class="th-dim-cursor">|</span>` +
            ` <span class="th-dim-unit">°</span>` +
            ` <span class="th-dim-mm">(press − to flip sign)</span>`;
        el.style.display = 'block';
    }

    private _unmountAngOverlay(): void {
        this._angBuffer = '';
        this._angSign = 1;
        if (this._angOverlay) {
            this._angOverlay.remove();
            this._angOverlay = null;
        }
    }

    // ── 3D scene helpers ─────────────────────────────────────────────────────

    private _addMarker(pos: THREE.Vector3, color: number, label: string): void {
        if (!this._scene) return;
        const geo    = new THREE.SphereGeometry(0.18, 10, 10);
        const mat    = new THREE.MeshBasicMaterial({ color, depthTest: false });
        const sphere = new THREE.Mesh(geo, mat);
        sphere.position.copy(pos);
        sphere.renderOrder       = 999;
        sphere.userData.isHelper = true;
        this._scene.add(sphere);
        this._markers.push(sphere);
        console.log(`[UnderlayReferenceRotateTool] Marker P${label} at (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
    }

    private _drawSegment(p1: THREE.Vector3, p2: THREE.Vector3, color: number): void {
        if (!this._scene) return;
        this._removeSegmentLine();
        const geo  = new THREE.BufferGeometry().setFromPoints([p1.clone(), p2.clone()]);
        const mat  = new THREE.LineBasicMaterial({ color, depthTest: false });
        const line = new THREE.Line(geo, mat);
        line.renderOrder       = 998;
        line.userData.isHelper = true;
        this._scene.add(line);
        this._segmentLine = line;
    }

    private _removeSegmentLine(): void {
        if (!this._segmentLine || !this._scene) return;
        this._scene.remove(this._segmentLine);
        (this._segmentLine.material as THREE.Material).dispose();
        this._segmentLine.geometry.dispose();
        this._segmentLine = null;
    }

    private _clearScene(): void {
        if (!this._scene) return;
        for (const m of this._markers) {
            this._scene.remove(m);
            const mesh = m as THREE.Mesh;
            mesh.geometry?.dispose?.();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach(mm => mm.dispose());
            else (mat as THREE.Material | undefined)?.dispose();
        }
        this._markers = [];
        this._removeSegmentLine();
    }

    // ── HUD message pill ─────────────────────────────────────────────────────

    private _showHud(text: string, autoHideMs?: number): void {
        if (!this._hud) {
            const hud = document.createElement('div');
            hud.className = 'th-overlay';
            hud.setAttribute('data-underlay-rotate-hud', '1');
            hud.style.zIndex = '999999';
            document.body.appendChild(hud);
            this._hud = hud;
        }
        this._hud.textContent = text;
        this._hud.style.display = 'block';
        if (autoHideMs) {
            setTimeout(() => this._hideHud(), autoHideMs);
        }
    }

    private _hideHud(): void {
        if (this._hud) {
            this._hud.remove();
            this._hud = null;
        }
    }
}
