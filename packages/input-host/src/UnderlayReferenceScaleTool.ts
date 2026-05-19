/**
 * @file UnderlayReferenceScaleTool.ts
 *
 * Revit-style 3-point reference scale for PDF/image underlays.
 *
 * Workflow:
 *   1. User clicks Scale button while underlay is selected
 *   2. Click Point 1 — reference start
 *   3. Click Point 2 — reference end (defines existing "1-2" segment)
 *   4. Click Point 3 — target end (segment "1-2" scales to equal length "1-3")
 *   5. Scale factor = dist(P1,P3) / dist(P1,P2) applied to underlay mesh
 *
 * Works in BOTH the 3D viewport AND the 2D plan view (SVP canvas).
 *   • 3D viewport  — THREE.js ray/plane intersection against the underlay's Y plane.
 *   • Plan view     — PlanViewCanvas.screenToWorld() (canvas-relative pixels → world XZ).
 *                     A transparent overlay canvas draws the 2D markers and segment.
 *
 * Activation:  listens for 'underlay:reference-scale-activate' custom event
 * Completion:  dispatches 'underlay:scale-applied' and 'underlay:reference-scale-done'
 * Cancellation: Escape key → dispatches 'bim-operation-cancelled'
 *
 * Contract compliance:
 *   §01 §2.1 — No direct store writes
 *   §04 §3.1 — Pure Tool Layer object; no UI panel imports
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

type ScalePhase = 'idle' | 'pick_p1' | 'pick_p2' | 'pick_p3';

/** Marker descriptor for redrawing on the SVP overlay. */
interface SvpMarker {
    worldX: number;
    worldZ: number;
    color:  string;
    label:  string;
}

export class UnderlayReferenceScaleTool {
    private _phase: ScalePhase = 'idle';
    private _underlayMesh: THREE.Mesh | null = null;
    private _underlayTool: any = null;

    private _p1: THREE.Vector3 | null = null;
    private _p2: THREE.Vector3 | null = null;

    private _scene:      THREE.Scene  | null = null;
    private _camera:     THREE.Camera | null = null;
    private _domElement: HTMLElement  | null = null;

    // ── Plan-view (SVP) state ────────────────────────────────────────────────
    private _svpCanvas:      HTMLCanvasElement | null = null;
    private _planViewCanvas: any | null = null;         // PlanViewCanvas instance
    private _svpOverlay:     HTMLCanvasElement | null = null;   // transparent 2D overlay
    private _svpMarkers:     SvpMarker[] = [];
    private _svpSegP1:       SvpMarker | null = null;
    private _svpSegP2:       SvpMarker | null = null;
    // D.7.5 batch #5: rAF handle replaced by FrameScheduler disposer.
    private _raf: TickListenerDisposer | null = null;

    private _hud: HTMLElement | null = null;
    // 3D scene markers/line
    private _markers:     THREE.Object3D[] = [];
    private _segmentLine: THREE.Line | null = null;

    private readonly _raycaster = new THREE.Raycaster();
    private readonly _mouse     = new THREE.Vector2();

    private _boundClick:     (e: MouseEvent)   => void;
    private _boundSvpClick:  (e: MouseEvent)   => void;
    private _boundSvpMove:   (e: MouseEvent)   => void;
    private _boundSvpLeave:  (e: MouseEvent)   => void;
    private _boundKeyDown:   (e: KeyboardEvent) => void;
    private readonly _boundSvpAttach = () => this._lateBoundSvp();

    // ── Precision picker state ───────────────────────────────────────────────
    /** Current cursor position on the SVP canvas (or null when off-canvas). */
    private _cursorSx: number | null = null;
    private _cursorSy: number | null = null;
    /** Snap candidates within radius of cursor, sorted by distance (closest first). */
    private _snapCandidates: { worldX: number; worldZ: number; sx: number; sy: number; kind: string; label: string }[] = [];
    /** Index into _snapCandidates currently chosen (Tab cycles through). */
    private _snapIndex: number = 0;
    private readonly _SNAP_RADIUS_PX = 28;

    /** Pick mode: 'orthogonal' snaps P2 to H/V through P1, 'linear' is free. */
    private _drawMode: UnderlayScaleMode = 'orthogonal';


    // ── Typed known-distance input (active during pick_p3) ──────────────────
    // Lets the user type the real-world length of segment 1–2 in metres
    // and press Enter, instead of clicking a third reference point.
    // Uses the same .th-dim-overlay visual treatment as WallDimensionInput
    // (Contract §05 — th- prefix, native HTML, design tokens).
    private _dimBuffer: string = '';
    private _dimOverlay: HTMLElement | null = null;

    constructor() {
        this._boundClick     = this._onClick.bind(this);
        this._boundSvpClick  = this._onSvpClick.bind(this);
        this._boundSvpMove   = this._onSvpMove.bind(this);
        this._boundSvpLeave  = this._onSvpLeave.bind(this);
        this._boundKeyDown   = this._onKeyDown.bind(this);

        // F.events.15 — runtime.events.on replaces window.addEventListener.
        (window as any).runtime?.events?.on('underlay:reference-scale-activate', (detail: { underlayTool: unknown }) => {
            this._underlayTool = detail.underlayTool ?? null;
            this._underlayMesh = this._underlayTool?.getState()?.mesh ?? null;

            if (!this._underlayMesh) {
                console.warn('[UnderlayReferenceScaleTool] No underlay mesh — cannot start');
                return;
            }

            const world = window.world;
            this._scene      = world?.scene?.three ?? null;
            this._camera     = world?.camera?.three ?? null;
            this._domElement = (world?.renderer?.three as THREE.WebGLRenderer | undefined)?.domElement
                ?? document.getElementById('container')
                ?? document.body;

            // Plan-view references — try split view first, then main plan view
            const svm = window.splitViewManager;
            this._svpCanvas      = svm?.getSvpCanvas?.()  ?? null;
            this._planViewCanvas = svm?.getPlanCanvas?.() ?? null;

            // Fall back to PlanViewManager when:
            //   (a) no svpCanvas at all, OR
            //   (b) svpCanvas came from SplitViewManager but planViewCanvas is
            //       null (split view was previously activated then deactivated —
            //       its DOM canvas persists but _planCanvas was torn down).
            // NOTE: isActive guard removed — too strict; blocked canvas resolution
            // in normal plan view when isActive reports false.
            if (!this._svpCanvas || !this._planViewCanvas) {
                const pvm = window.planViewManager;
                const mainCanvas = document.getElementById('svp-plan-view-canvas') as HTMLCanvasElement | null;
                if (mainCanvas && pvm?.planViewCanvas) {
                    this._svpCanvas      = mainCanvas;
                    this._planViewCanvas = pvm.planViewCanvas;
                    console.log('[UnderlayReferenceScaleTool] Using main plan view canvas (isActive guard bypassed)');
                }
            }

            this._start();
        });
    }

    private _start(): void {
        this._phase = 'pick_p1';
        this._p1    = null;
        this._p2    = null;
        this._clearScene();
        this._clearSvpOverlay();

        // Prevent PlanViewInteraction from triggering selection during scale pick workflow
        window.__underlayScaleActive = true;

        const selMgr = window.selectionManager;
        if (selMgr) selMgr.setEnabled(false);

        this._showHud('📐 Reference Scale — Click Point 1 on the plan (reference start)');

        // Mode toggle bar (Linear / Orthogonal) — dispatched via event to UI layer.
        window.dispatchEvent(new CustomEvent('pryzm:underlay-hud:show', { // TODO(TASK-11)
            detail: {
                mode: this._drawMode,
                callbacks: {
                    onSwitchLinear: () => {
                        this._drawMode = 'linear';
                        this._computeSnapCandidates();
                        this._redrawSvpOverlay();
                        console.log('[UnderlayReferenceScaleTool] Mode → Linear');
                    },
                    onSwitchOrtho: () => {
                        this._drawMode = 'orthogonal';
                        this._computeSnapCandidates();
                        this._redrawSvpOverlay();
                        console.log('[UnderlayReferenceScaleTool] Mode → Orthogonal');
                    },
                },
            },
        }));

        // 3D canvas listener
        this._domElement!.addEventListener('click', this._boundClick);

        // SVP plan-view listeners
        if (this._svpCanvas) {
            this._svpCanvas.addEventListener('click', this._boundSvpClick);
            this._svpCanvas.addEventListener('mousemove', this._boundSvpMove);
            this._svpCanvas.addEventListener('mouseleave', this._boundSvpLeave);
            this._svpCanvas.style.cursor = 'crosshair';
            this._mountSvpOverlay();
        }

        // In case the split view opens after activation
        window.addEventListener('splitview:activated', this._boundSvpAttach, { once: true });
        window.addEventListener('keydown', this._boundKeyDown);

        console.log('[UnderlayReferenceScaleTool] Started — waiting for P1',
            this._svpCanvas ? '(SVP available)' : '(SVP not open)');
    }

    /** Attach to the SVP canvas if it became available after _start(). */
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
            console.log('[UnderlayReferenceScaleTool] Late-bound to SVP canvas');
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

        this._handlePoint(worldPt, null);
    }

    // ── Plan-view (SVP) click ────────────────────────────────────────────────

    private _onSvpClick(e: MouseEvent): void {
        if (e.button !== 0 || !this._underlayMesh) return;

        // Re-fetch PlanViewCanvas if it wasn't ready at start — try split view then main plan view
        if (!this._planViewCanvas) {
            const svm = window.splitViewManager;
            this._planViewCanvas = svm?.getPlanCanvas?.() ?? null;
        }
        if (!this._planViewCanvas) {
            const pvm = window.planViewManager;
            // isActive guard removed — too strict; resolve unconditionally
            if (pvm?.planViewCanvas) {
                this._planViewCanvas = pvm.planViewCanvas;
            }
        }
        if (!this._planViewCanvas) {
            console.warn('[UnderlayReferenceScaleTool] PlanViewCanvas not available');
            return;
        }

        const target = e.currentTarget as HTMLCanvasElement;
        const rect   = target.getBoundingClientRect();
        let sx       = e.clientX - rect.left;
        let sy       = e.clientY - rect.top;

        // ── Snap commit: if a snap candidate is active under the cursor, use it ──
        const snap = this._snapCandidates[this._snapIndex];
        let worldX: number, worldZ: number;
        if (snap) {
            worldX = snap.worldX;
            worldZ = snap.worldZ;
            sx = snap.sx;
            sy = snap.sy;
            console.log('[UnderlayReferenceScaleTool] Snapped to', snap.kind, snap.label);
        } else {
            const w = this._planViewCanvas.screenToWorld(sx, sy);
            worldX = w.worldX;
            worldZ = w.worldZ;
        }
        const underlayY = this._underlayMesh.position.y;
        const worldPt   = new THREE.Vector3(worldX, underlayY, worldZ);

        // Reset snap state for next pick
        this._snapCandidates = [];
        this._snapIndex = 0;

        // Canvas-relative coords for the SVP overlay dot
        const svpCoord = { sx, sy };

        console.log('[UnderlayReferenceScaleTool] SVP click → world:', worldX.toFixed(2), worldZ.toFixed(2));
        this._handlePoint(worldPt, svpCoord);
    }

    // ── Plan-view (SVP) mousemove — precision picker ─────────────────────────

    private _onSvpMove(e: MouseEvent): void {
        if (this._phase === 'idle' || !this._underlayMesh || !this._planViewCanvas) return;
        const target = e.currentTarget as HTMLCanvasElement;
        const rect   = target.getBoundingClientRect();
        this._cursorSx = e.clientX - rect.left;
        this._cursorSy = e.clientY - rect.top;
        this._computeSnapCandidates();
        this._redrawSvpOverlay();
    }

    private _onSvpLeave(_e: MouseEvent): void {
        this._cursorSx = null;
        this._cursorSy = null;
        this._snapCandidates = [];
        this._snapIndex = 0;
        this._redrawSvpOverlay();
    }

    /**
     * Build a list of snap-candidate world points within SNAP_RADIUS_PX of the cursor.
     * Candidates: underlay 4 corners, 4 edge midpoints, previously placed markers,
     * and an ortho-from-P1 projection during pick_p2.
     * Sorted closest-first.
     */
    private _computeSnapCandidates(): void {
        this._snapCandidates = [];
        if (this._cursorSx == null || this._cursorSy == null || !this._underlayMesh || !this._planViewCanvas) {
            this._snapIndex = 0;
            return;
        }

        const mesh = this._underlayMesh;
        // Compute the underlay's 4 corners in world XZ from its mesh.geometry + transform.
        // PlaneGeometry is in mesh-local XY plane; world position uses position+rotation+scale.
        const geo = mesh.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        if (!pos) return;
        mesh.updateWorldMatrix(true, false);

        const cornerLocals: THREE.Vector3[] = [
            new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)),
            new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1)),
            new THREE.Vector3(pos.getX(2), pos.getY(2), pos.getZ(2)),
            new THREE.Vector3(pos.getX(3), pos.getY(3), pos.getZ(3)),
        ];
        const cornersWorld = cornerLocals.map(v => v.clone().applyMatrix4(mesh.matrixWorld));
        const cornerLabels = ['BL', 'BR', 'TL', 'TR'];

        const candidates: { worldX: number; worldZ: number; sx: number; sy: number; kind: string; label: string }[] = [];

        for (let i = 0; i < cornersWorld.length; i++) {
            const w = cornersWorld[i];
            const { sx, sy } = this._planViewCanvas.worldToScreen(w.x, w.z);
            const dx = sx - this._cursorSx;
            const dy = sy - this._cursorSy;
            if (Math.hypot(dx, dy) <= this._SNAP_RADIUS_PX) {
                candidates.push({ worldX: w.x, worldZ: w.z, sx, sy, kind: 'corner', label: cornerLabels[i] ?? '' });
            }
        }

        // Edge midpoints (between adjacent corners using PlaneGeometry triangle order: BL,BR,TL,TR)
        const edges: [number, number, string][] = [[0, 1, 'B'], [1, 3, 'R'], [3, 2, 'T'], [2, 0, 'L']];
        for (const [a, b, lbl] of edges) {
            const mid = cornersWorld[a].clone().add(cornersWorld[b]).multiplyScalar(0.5);
            const { sx, sy } = this._planViewCanvas.worldToScreen(mid.x, mid.z);
            const dx = sx - this._cursorSx;
            const dy = sy - this._cursorSy;
            if (Math.hypot(dx, dy) <= this._SNAP_RADIUS_PX) {
                candidates.push({ worldX: mid.x, worldZ: mid.z, sx, sy, kind: 'midpoint', label: 'mid-' + lbl });
            }
        }

        // Previously placed markers (P1, P2)
        for (const m of this._svpMarkers) {
            const { sx, sy } = this._planViewCanvas.worldToScreen(m.worldX, m.worldZ);
            const dx = sx - this._cursorSx;
            const dy = sy - this._cursorSy;
            if (Math.hypot(dx, dy) <= this._SNAP_RADIUS_PX) {
                candidates.push({ worldX: m.worldX, worldZ: m.worldZ, sx, sy, kind: 'point', label: 'P' + m.label });
            }
        }

        // Ortho snap from P1 during pick_p2 — ONLY in orthogonal mode.
        // Linear mode lets the user pick P2 in any direction without H/V locking.
        if (this._drawMode === 'orthogonal' && this._phase === 'pick_p2' && this._p1) {
            const p1Screen = this._planViewCanvas.worldToScreen(this._p1.x, this._p1.z);
            const dxc = this._cursorSx - p1Screen.sx;
            const dyc = this._cursorSy - p1Screen.sy;
            // Horizontal lock
            if (Math.abs(dyc) <= this._SNAP_RADIUS_PX && Math.abs(dxc) > 4) {
                const sx = this._cursorSx;
                const sy = p1Screen.sy;
                const { worldX, worldZ } = this._planViewCanvas.screenToWorld(sx, sy);
                candidates.push({ worldX, worldZ, sx, sy, kind: 'ortho', label: 'horiz' });
            }
            // Vertical lock
            if (Math.abs(dxc) <= this._SNAP_RADIUS_PX && Math.abs(dyc) > 4) {
                const sx = p1Screen.sx;
                const sy = this._cursorSy;
                const { worldX, worldZ } = this._planViewCanvas.screenToWorld(sx, sy);
                candidates.push({ worldX, worldZ, sx, sy, kind: 'ortho', label: 'vert' });
            }
        }

        // Sort closest first (by screen distance)
        candidates.sort((a, b) => {
            const da = Math.hypot(a.sx - this._cursorSx!, a.sy - this._cursorSy!);
            const db = Math.hypot(b.sx - this._cursorSx!, b.sy - this._cursorSy!);
            return da - db;
        });
        this._snapCandidates = candidates;
        if (this._snapIndex >= candidates.length) this._snapIndex = 0;
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
            this._showHud('📐 Reference Scale — Click Point 2 (reference end — defines known distance)');
            console.log('[UnderlayReferenceScaleTool] P1:', worldPt);

        } else if (this._phase === 'pick_p2') {
            this._p2 = worldPt.clone();
            this._addMarker(worldPt, 0x00e5ff, '2');
            if (svpCoord) {
                this._addSvpMarker(worldPt.x, worldPt.z, '#00e5ff', '2');
                // record the two points for segment drawing
                this._svpSegP1 = this._svpMarkers[this._svpMarkers.length - 2] ?? null;
                this._svpSegP2 = this._svpMarkers[this._svpMarkers.length - 1] ?? null;
            }
            this._drawSegment(this._p1!, this._p2);
            this._redrawSvpOverlay();

            const d12 = this._p1!.distanceTo(this._p2);
            this._phase = 'pick_p3';
            this._showHud(
                `📐 Reference Scale — 1–2 = ${d12.toFixed(3)} m  •  Click Point 3 OR type known length + Enter`,
            );
            this._mountDimOverlay();
            console.log('[UnderlayReferenceScaleTool] P2:', worldPt, '| dist 1-2:', d12.toFixed(3), 'm');

        } else if (this._phase === 'pick_p3') {
            const p3  = worldPt.clone();
            const d12 = this._p1!.distanceTo(this._p2!);
            const d13 = this._p1!.distanceTo(p3);

            if (d12 < 0.001) {
                this._showHud('⚠ Points 1 and 2 are too close — press Esc and try again');
                return;
            }

            const factor = d13 / d12;
            this._addMarker(p3, 0xff9100, '3');
            if (svpCoord) this._addSvpMarker(p3.x, p3.z, '#ff9100', '3');
            this._redrawSvpOverlay();

            console.log('[UnderlayReferenceScaleTool] P3:', worldPt,
                '| dist 1-3:', d13.toFixed(3), 'm | scale factor:', factor.toFixed(4));

            this._applyScale(factor);
            this._finish(`✓ Scale applied ×${factor.toFixed(3)}  (${(factor * 100).toFixed(1)}%)`);
        }
    }

    // ── SVP 2D overlay ───────────────────────────────────────────────────────

    /** Create a transparent canvas element positioned over the SVP canvas. */
    private _mountSvpOverlay(): void {
        if (!this._svpCanvas) return;
        this._unmountSvpOverlay();

        const overlay       = document.createElement('canvas');
        overlay.width       = this._svpCanvas.width  || this._svpCanvas.clientWidth;
        overlay.height      = this._svpCanvas.height || this._svpCanvas.clientHeight;
        overlay.style.cssText = [
            'position:absolute',
            'top:0','left:0',
            'width:100%','height:100%',
            'pointer-events:none',   // pass through all mouse events to the SVP canvas
            'z-index:10',
        ].join(';');

        // Overlay must live inside the same parent as svp-canvas
        const parent = this._svpCanvas.parentElement;
        if (parent) {
            if (getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }
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
        // If this is point 2, record both points for the segment
        if (label === '2' && this._svpMarkers.length >= 2) {
            this._svpSegP1 = this._svpMarkers[this._svpMarkers.length - 2];
            this._svpSegP2 = this._svpMarkers[this._svpMarkers.length - 1];
        }
        this._redrawSvpOverlay();
    }

    private _redrawSvpOverlay(): void {
        // D.7.5 batch #5: coalesced redraw — cancel any pending tick, then
        // schedule a fresh one. Repeated calls within the same frame collapse
        // into a single _drawSvpOverlay() invocation (preserves the original
        // cancelAnimationFrame + requestAnimationFrame coalescing semantics).
        if (this._raf !== null) this._raf();
        this._raf = getFrameScheduler().scheduleOnce(
            'underlay-scale-svp-redraw',
            () => this._drawSvpOverlay(),
        );
    }

    private _drawSvpOverlay(): void {
        const overlay = this._svpOverlay;
        const pvc     = this._planViewCanvas;
        if (!overlay || !pvc) return;

        // Resize if needed
        const w = this._svpCanvas?.clientWidth  ?? overlay.clientWidth;
        const h = this._svpCanvas?.clientHeight ?? overlay.clientHeight;
        if (overlay.width !== w  || overlay.height !== h) {
            overlay.width  = w;
            overlay.height = h;
        }

        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);

        // Draw segment line between p1 and p2 (if both are SVP-picked)
        if (this._svpSegP1 && this._svpSegP2) {
            const a = pvc.worldToScreen(this._svpSegP1.worldX, this._svpSegP1.worldZ);
            const b = pvc.worldToScreen(this._svpSegP2.worldX, this._svpSegP2.worldZ);
            ctx.save();
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth   = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
            ctx.restore();
        }

        // ── Live preview line from P1 → cursor (during pick_p2 / pick_p3) ────
        const cx = this._cursorSx;
        const cy = this._cursorSy;
        const previewSnap = this._snapCandidates[this._snapIndex];
        const previewSx = previewSnap ? previewSnap.sx : cx;
        const previewSy = previewSnap ? previewSnap.sy : cy;
        if (cx != null && cy != null && previewSx != null && previewSy != null) {
            if ((this._phase === 'pick_p2' || this._phase === 'pick_p3') && this._p1) {
                const a = pvc.worldToScreen(this._p1.x, this._p1.z);
                ctx.save();
                ctx.strokeStyle = this._phase === 'pick_p2' ? '#00e5ff' : '#ff9100';
                ctx.lineWidth   = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(previewSx, previewSy);
                ctx.stroke();
                ctx.restore();
            }
        }

        // Draw markers
        for (const m of this._svpMarkers) {
            const { sx, sy } = pvc.worldToScreen(m.worldX, m.worldZ);
            const r = 8;

            // Outer ring
            ctx.save();
            ctx.strokeStyle = m.color;
            ctx.lineWidth   = 2.5;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Fill
            ctx.save();
            ctx.fillStyle = m.color + '55';
            ctx.beginPath();
            ctx.arc(sx, sy, r - 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Label
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.font       = 'bold 10px system-ui,sans-serif';
            ctx.textAlign  = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(m.label, sx, sy);
            ctx.restore();
        }

        // ── Snap badge + cursor crosshair + magnifier ───────────────────────
        if (cx != null && cy != null) {
            const snap = this._snapCandidates[this._snapIndex];

            // Crosshair under raw cursor
            ctx.save();
            ctx.strokeStyle = 'rgba(124, 58, 237, 0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
            ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
            ctx.stroke();
            ctx.restore();

            // Snap glyph at the snapped point
            if (snap) {
                ctx.save();
                ctx.strokeStyle = '#7c3aed';
                ctx.fillStyle   = 'rgba(124, 58, 237, 0.18)';
                ctx.lineWidth = 2;
                // Square for corner, diamond for midpoint, circle for point/ortho
                if (snap.kind === 'corner') {
                    ctx.beginPath();
                    ctx.rect(snap.sx - 7, snap.sy - 7, 14, 14);
                    ctx.fill(); ctx.stroke();
                } else if (snap.kind === 'midpoint') {
                    ctx.beginPath();
                    ctx.moveTo(snap.sx, snap.sy - 8);
                    ctx.lineTo(snap.sx + 8, snap.sy);
                    ctx.lineTo(snap.sx, snap.sy + 8);
                    ctx.lineTo(snap.sx - 8, snap.sy);
                    ctx.closePath();
                    ctx.fill(); ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.arc(snap.sx, snap.sy, 8, 0, Math.PI * 2);
                    ctx.fill(); ctx.stroke();
                }

                // Tag text
                const tag = `${snap.kind}: ${snap.label}` + (this._snapCandidates.length > 1 ? ` (${this._snapIndex + 1}/${this._snapCandidates.length} — Tab)` : '');
                ctx.fillStyle = 'rgba(0,0,0,0.78)';
                const padding = 4;
                ctx.font = '11px system-ui,sans-serif';
                const tw = ctx.measureText(tag).width;
                ctx.fillRect(snap.sx + 12, snap.sy - 18, tw + padding * 2, 16);
                ctx.fillStyle = '#fff';
                ctx.fillText(tag, snap.sx + 12 + padding, snap.sy - 6);
                ctx.restore();
            }

            // Magnifier loupe intentionally removed — the large circular preview
            // in the top-right corner of the plan view was being mistaken for a
            // duplicate cursor and overlapped with the ViewCube. The crosshair
            // and snap badge above already give precise feedback.
        }
    }

    private _clearSvpOverlay(): void {
        // D.7.5 batch #5: dispose any pending FrameScheduler tick.
        if (this._raf !== null) { this._raf(); this._raf = null; }
        this._svpMarkers = [];
        this._svpSegP1   = null;
        this._svpSegP2   = null;
        if (this._svpOverlay) {
            const ctx = this._svpOverlay.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, this._svpOverlay.width, this._svpOverlay.height);
        }
    }

    // ── Scale application ────────────────────────────────────────────────────

    private _applyScale(factor: number): void {
        if (!this._underlayTool || !this._underlayMesh) return;

        // Contract 01 §2.1 — capture BEFORE so the scale is recorded as a
        // TransformUnderlayCommand and Ctrl+Z can reverse it (was missing → undo broke).
        const captureFn = (this._underlayTool && typeof (this._underlayTool as any).pushTransformCommand === 'function')
            ? captureUnderlaySnapshot
            : null;
        const before = captureFn ? captureFn() : null;

        if (typeof this._underlayTool.applyScale === 'function') {
            this._underlayTool.applyScale(factor);
        } else {
            this._underlayMesh.scale.x *= factor;
            this._underlayMesh.scale.y *= factor;
        }

        if (typeof (this._underlayTool as any).pushTransformCommand === 'function') {
            (this._underlayTool as any).pushTransformCommand(before, 'reference-scale');
        }

        window.dispatchEvent(new CustomEvent('underlay:scale-applied', { detail: { factor } })); // TODO(TASK-11)
        console.log('[UnderlayReferenceScaleTool] Scale applied:', factor);
    }

    private _finish(message: string): void {
        this._phase = 'idle';
        this._showHud(message, 2500);

        setTimeout(() => {
            this._cleanup();

            const selMgr = window.selectionManager;
            if (selMgr) selMgr.setEnabled(true);

            window.dispatchEvent(new CustomEvent('bim-operation-cancelled', { // TODO(TASK-11)
                detail: { operationId: 'scale' },
            }));
            window.dispatchEvent(new CustomEvent('underlay:reference-scale-done')); // TODO(TASK-11)

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
            detail: { operationId: 'scale' },
        }));

        console.log('[UnderlayReferenceScaleTool] Cancelled by user');
    }

    private _cleanup(): void {
        this._phase = 'idle';
        this._clearScene();
        this._clearSvpOverlay();
        this._unmountSvpOverlay();
        this._hideHud();
        window.dispatchEvent(new CustomEvent('pryzm:underlay-hud:dismiss')); // TODO(TASK-11)
        this._unmountDimOverlay();
        this._domElement?.removeEventListener('click', this._boundClick);
        this._svpCanvas?.removeEventListener('click', this._boundSvpClick);
        this._svpCanvas?.removeEventListener('mousemove', this._boundSvpMove);
        this._svpCanvas?.removeEventListener('mouseleave', this._boundSvpLeave);
        if (this._svpCanvas) this._svpCanvas.style.cursor = '';
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('splitview:activated', this._boundSvpAttach);
        // Clear the scale-active guard flag so PlanViewInteraction resumes normal selection
        window.__underlayScaleActive = false;
        this._cursorSx = null;
        this._cursorSy = null;
        this._snapCandidates = [];
        this._snapIndex = 0;
        this._svpCanvas      = null;
        this._planViewCanvas = null;
    }

    private _onKeyDown(e: KeyboardEvent): void {
        // Don't hijack typing in form fields (search bars, property editors, etc.)
        const tgt = e.target as HTMLElement | null;
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
            return;
        }

        if (e.key === 'Escape') {
            // Escape clears the typed buffer first; second Escape cancels the tool.
            if (this._dimBuffer.length > 0) {
                e.preventDefault();
                this._dimBuffer = '';
                this._updateDimOverlay();
                return;
            }
            this.cancel();
            return;
        }
        if (e.key === 'Tab' && this._snapCandidates.length > 1) {
            e.preventDefault();
            this._snapIndex = (this._snapIndex + (e.shiftKey ? -1 : 1) + this._snapCandidates.length) % this._snapCandidates.length;
            this._redrawSvpOverlay();
            console.log('[UnderlayReferenceScaleTool] Tab → snap candidate', this._snapIndex + 1, '/', this._snapCandidates.length);
            return;
        }

        // Typed-distance input — only meaningful during pick_p3 phase
        if (this._phase !== 'pick_p3') return;

        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            this._dimBuffer += e.key;
            this._updateDimOverlay();
            return;
        }
        if (e.key === '.' && !this._dimBuffer.includes('.')) {
            e.preventDefault();
            this._dimBuffer += e.key;
            this._updateDimOverlay();
            return;
        }
        if (e.key === 'Backspace' && this._dimBuffer.length > 0) {
            e.preventDefault();
            this._dimBuffer = this._dimBuffer.slice(0, -1);
            this._updateDimOverlay();
            return;
        }
        if (e.key === 'Enter' && this._dimBuffer.length > 0) {
            e.preventDefault();
            this._applyTypedDistance();
            return;
        }
    }

    /**
     * Compute scale factor from the typed known-length and finish the tool —
     * equivalent to clicking Point 3 along the segment direction at that length.
     */
    private _applyTypedDistance(): void {
        const known = parseFloat(this._dimBuffer);
        if (!isFinite(known) || known <= 0) {
            this._showHud('⚠ Enter a positive length in metres', 1500);
            return;
        }
        if (!this._p1 || !this._p2) return;

        const d12 = this._p1.distanceTo(this._p2);
        if (d12 < 0.001) {
            this._showHud('⚠ Points 1 and 2 are too close — press Esc and try again');
            return;
        }

        const factor = known / d12;
        console.log(
            '[UnderlayReferenceScaleTool] Typed length:', known.toFixed(3),
            'm | dist 1-2:', d12.toFixed(3),
            'm | scale factor:', factor.toFixed(4),
        );

        this._applyScale(factor);
        this._finish(`✓ Scale applied ×${factor.toFixed(3)}  (1–2 set to ${known.toFixed(3)} m)`);
    }

    // ── Typed-distance HUD overlay (.th-dim-overlay) ─────────────────────────

    private _mountDimOverlay(): void {
        if (this._dimOverlay) return;
        const el = document.createElement('div');
        el.className = 'th-dim-overlay';
        el.setAttribute('data-underlay-scale-dim', '1');
        // Sit slightly higher than the wall dim overlay so they never collide
        // if both are ever visible (defensive — they aren't today).
        el.style.bottom = '210px';
        el.style.display = 'none';
        document.body.appendChild(el);
        this._dimOverlay = el;
        this._updateDimOverlay();
    }

    private _updateDimOverlay(): void {
        const el = this._dimOverlay;
        if (!el) return;

        if (this._dimBuffer.length === 0) {
            // Show a hint placeholder so the user knows they can type.
            el.innerHTML =
                `<span class="th-dim-label">Known length</span>` +
                `<span style="opacity:0.55;letter-spacing:1px;">type metres…</span>` +
                `<span class="th-dim-cursor">|</span>` +
                ` <span class="th-dim-unit">m</span>`;
            el.style.display = 'block';
            return;
        }

        const m = parseFloat(this._dimBuffer);
        const mmText = isFinite(m)
            ? `<span class="th-dim-mm">(${Math.round(m * 1000)} mm)</span>`
            : '';
        const safe = this._dimBuffer
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        el.innerHTML =
            `<span class="th-dim-label">Known length</span>` +
            `<span style="letter-spacing:1px;">${safe}</span>` +
            `<span class="th-dim-cursor">|</span>` +
            ` <span class="th-dim-unit">m</span> ${mmText}`;
        el.style.display = 'block';
    }

    private _unmountDimOverlay(): void {
        this._dimBuffer = '';
        if (this._dimOverlay) {
            this._dimOverlay.remove();
            this._dimOverlay = null;
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

        console.log(`[UnderlayReferenceScaleTool] Marker P${label} at (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
    }

    private _drawSegment(p1: THREE.Vector3, p2: THREE.Vector3): void {
        if (!this._scene) return;
        this._removeSegmentLine();

        const geo  = new THREE.BufferGeometry().setFromPoints([p1.clone(), p2.clone()]);
        const mat  = new THREE.LineBasicMaterial({ color: 0x00e5ff, depthTest: false });
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
        for (const m of this._markers) {
            this._scene?.remove(m);
            if (m instanceof THREE.Mesh) {
                m.geometry.dispose();
                (m.material as THREE.Material).dispose();
            }
        }
        this._markers = [];
        this._removeSegmentLine();
    }

    // ── HUD ──────────────────────────────────────────────────────────────────

    private _showHud(message: string, autoDismissMs?: number): void {
        this._hideHud();

        const hud = document.createElement('div');
        hud.style.cssText = [
            'position:fixed',
            'top:56px',
            'left:50%',
            'transform:translateX(-50%)',
            'background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%)',
            'color:#fff',
            'font:600 13px/1.4 var(--app-font,system-ui,-apple-system,sans-serif)',
            'padding:9px 22px',
            'border-radius:10px',
            'box-shadow:0 4px 18px rgba(102,0,255,0.45)',
            'z-index:99999',
            'pointer-events:none',
            'white-space:nowrap',
            'letter-spacing:0.01em',
        ].join(';');
        hud.textContent = message;
        document.body.appendChild(hud);
        this._hud = hud;

        if (autoDismissMs !== undefined) {
            setTimeout(() => this._hideHud(), autoDismissMs);
        }
    }

    private _hideHud(): void {
        if (this._hud) {
            this._hud.remove();
            this._hud = null;
        }
    }
}
