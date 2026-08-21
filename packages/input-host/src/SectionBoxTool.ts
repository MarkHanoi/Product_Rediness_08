/**
 * SectionBoxTool — Qonic-style face-pick section tool.
 *
 *   Phase 1 (hover): the cursor highlights the face it's over with a purple
 *                    quad oriented to that face's normal.
 *   Phase 2 (placed): clicking commits the highlighted face as the section
 *                     plane. A 3D arrow gizmo appears at the cut centre,
 *                     pointing along the plane normal — the user can grab
 *                     and drag the arrow to push/pull the cut along its
 *                     normal. The hover highlight stays parked on the cut
 *                     surface so the cut location is always visible.
 *
 * ── CLIPPING MECHANISM — §SECTION-3D-CAPABILITY (L-1760..L-1762, 2026-08-21) ──
 *
 * ONE mechanism: `renderer.clippingPlanes` on the LIVE renderer, which must be
 * a genuine `THREE.WebGLRenderer`. The caller establishes both preconditions
 * with `resolveSectionClipCapability()` and does not enable this tool otherwise.
 *
 * This header previously described three parallel paths — global planes,
 * per-material planes "for the WebGPU node pipeline", and a per-mesh visibility
 * cull "so the user always sees something happen on click". Measured against
 * `three@0.183.2`, only the first was ever real, and it was aimed at the wrong
 * object:
 *
 *   • The renderer passed in was `world.renderer.three`, the OBC
 *     PostproductionRenderer — which Phase 5 silences and which never renders
 *     again. Both plane writes landed on a dead object (ISSUE-LOG L-1486).
 *   • Per-material planes are NOT a WebGPU path. `three/src/renderers/common/
 *     Renderer.js` (the base of `WebGPURenderer`, used for BOTH the 'webgpu'
 *     and 'webgl-fallback' backends) never reads `material.clippingPlanes` and
 *     has no `clippingPlanes` / `localClippingEnabled` property at all. WebGPU
 *     clipping flows ONLY through `THREE.ClippingGroup` scene objects, which
 *     this repo does not use.
 *   • So on every Phase-5 backend the only path that did anything was the
 *     visibility cull — hiding whole meshes instead of cutting them. That is
 *     what made the feature look UNRELIABLE rather than UNAVAILABLE, and it is
 *     the C84 EI-1b defect: failure and success rendering as the same value.
 *
 * A WebGPU section is therefore a real, separate piece of work (reparent the
 * model under a `ClippingGroup`, owned by `packages/renderer-three` under P2) —
 * NOT a matter of pointing this tool at `window.pryzmRenderer`. Doing only that
 * would swap one silent no-op for another.
 */

import * as THREE from '@pryzm/renderer-three/three';

const COLOR_ACCENT = '#6600ff';
const ACCENT_HEX   = 0x6600ff;
const HOVER_SIZE_M = 0.55;

export class SectionBoxTool {
    enabled = false;

    // ── Refs set on enable ──────────────────────────────────────────────
    private _renderer: THREE.WebGLRenderer | null = null;
    private _scene: THREE.Scene | null = null;
    private _camera: THREE.Camera | null = null;
    private _container: HTMLElement | null = null;

    // ── Plane state (live) ──────────────────────────────────────────────
    private _phase: 'hover' | 'placed' = 'hover';
    private _normal = new THREE.Vector3(0, 1, 0);   // points toward camera
    private _origin = new THREE.Vector3();          // current cut origin
    private _origAtPlace = new THREE.Vector3();     // origin at click time


    // ── Indicator (purple face quad) ────────────────────────────────────
    private _indicator: THREE.Group | null = null;
    private _indicatorFace: THREE.Mesh | null = null;

    // ── Arrow drag gizmo (visible only after placement) ─────────────────
    private _arrow: THREE.Group | null = null;
    private _arrowShaft: THREE.Mesh | null = null;
    private _arrowHead:  THREE.Mesh | null = null;

    // ── Hint banner ─────────────────────────────────────────────────────
    private _hint: HTMLElement | null = null;

    // ── Drag state ──────────────────────────────────────────────────────
    private _dragging       = false;
    private _dragStartParam = 0;
    private _dragOrigin     = new THREE.Vector3();

    // ── Raycast scratch ─────────────────────────────────────────────────
    private _raycaster = new THREE.Raycaster();
    private _mouse     = new THREE.Vector2();
    private _tmpQuat   = new THREE.Quaternion();
    private _tmpVec    = new THREE.Vector3();
    private _zAxis     = new THREE.Vector3(0, 0, 1);
    private _yAxis     = new THREE.Vector3(0, 1, 0);

    private _onDown:  (e: PointerEvent) => void;
    private _onMove:  (e: PointerEvent) => void;
    private _onUp:    (e: PointerEvent) => void;

    constructor() {
        this._onDown = this._handleDown.bind(this);
        this._onMove = this._handleMove.bind(this);
        this._onUp   = this._handleUp.bind(this);
    }

    // ── Public API ──────────────────────────────────────────────────────

    enable(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        container: HTMLElement,
    ): void {
        if (this.enabled) this.disable();
        this._renderer  = renderer;
        this._scene     = scene;
        this._camera    = camera;
        this._container = container;
        this._phase     = 'hover';

        container.style.cursor = 'crosshair';
        this._showHint('Hover over a surface, then click to cut a section from that plane');

        container.addEventListener('pointerdown', this._onDown, true);
        container.addEventListener('pointermove', this._onMove);
        container.addEventListener('pointerup',   this._onUp,   true);

        this.enabled = true;
        console.log('[SectionBoxTool] enabled — hover then click a face');
    }

    disable(): void {
        if (!this.enabled) return;

        if (this._container) {
            this._container.removeEventListener('pointerdown', this._onDown, true);
            this._container.removeEventListener('pointermove', this._onMove);
            this._container.removeEventListener('pointerup',   this._onUp,   true);
            this._container.style.cursor = '';
        }

        // §SECTION-3D-CAPABILITY (L-1761) — nothing per-material to restore and
        // no culled meshes to un-hide: this tool no longer writes either (see
        // `_applyPlane`). Clearing the one renderer-level slot is the whole
        // teardown.
        //
        // ⚠ That slot is SHARED with `LevelClipPlaneCache` (plan-view level
        // cuts) and with `ViewController._clearClipping()`. Clearing it here is
        // correct while the section is the last writer, but the surface has five
        // producers and no owner — C06 §13.3. Recorded as the open half of
        // L-1762; do not add a sixth writer.
        if (this._renderer) {
            this._renderer.clippingPlanes = [];
        }

        this._destroyIndicator();
        this._destroyArrow();
        this._removeHint();

        this._dragging = false;
        this._phase    = 'hover';
        this.enabled   = false;

        this._requestRender();
        console.log('[SectionBoxTool] disabled');
    }

    // ── Hint banner (PRYZM contract tokens) ─────────────────────────────

    private _showHint(text: string): void {
        this._removeHint();
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = [
            'position:absolute',
            'bottom:96px',
            'left:50%',
            'transform:translateX(-50%)',
            'background:var(--app-panel-bg,#ffffff)',
            `color:${COLOR_ACCENT}`,
            'padding:10px 18px',
            `border:1.5px solid ${COLOR_ACCENT}`,
            'border-radius:var(--app-radius-sm,8px)',
            'font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif',
            'font-weight:600',
            'z-index:10000',
            'pointer-events:none',
            'box-shadow:0 6px 24px rgba(102,0,255,0.18),0 1px 2px rgba(0,0,0,0.06)',
            'letter-spacing:0.2px',
            'white-space:nowrap',
            'max-width:90%',
        ].join(';');
        this._container?.appendChild(el);
        this._hint = el;
    }

    private _updateHint(text: string): void {
        if (this._hint) this._hint.textContent = text;
    }

    private _removeHint(): void {
        this._hint?.remove();
        this._hint = null;
    }

    // ── Indicator (purple face quad on hover & on cut) ──────────────────

    private _ensureIndicator(): THREE.Group {
        if (this._indicator) return this._indicator;
        const group = new THREE.Group();
        group.userData.isSectionBoxGizmo = true;
        group.userData.isHelper          = true;

        const faceGeo = new THREE.PlaneGeometry(HOVER_SIZE_M, HOVER_SIZE_M);
        const faceMat = new THREE.MeshBasicMaterial({
            color: ACCENT_HEX,
            transparent: true,
            opacity: 0.32,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
        });
        (faceMat as any).clippingPlanes = [];
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.renderOrder = 9998;
        face.userData.isSectionBoxGizmo = true;
        face.userData.isHelper          = true;
        group.add(face);
        this._indicatorFace = face;

        const edges = new THREE.EdgesGeometry(faceGeo);
        const lineMat = new THREE.LineBasicMaterial({
            color: ACCENT_HEX,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
        });
        (lineMat as any).clippingPlanes = [];
        const outline = new THREE.LineSegments(edges, lineMat);
        outline.renderOrder = 9999;
        outline.userData.isSectionBoxGizmo = true;
        outline.userData.isHelper          = true;
        group.add(outline);

        this._scene?.add(group);
        this._indicator = group;
        return group;
    }

    private _destroyIndicator(): void {
        if (!this._indicator) return;
        this._indicator.traverse(obj => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
                obj.geometry?.dispose();
                const m = obj.material as THREE.Material | THREE.Material[];
                if (Array.isArray(m)) m.forEach(x => x.dispose());
                else m?.dispose();
            }
        });
        this._scene?.remove(this._indicator);
        this._indicator     = null;
        this._indicatorFace = null;
    }

    private _placeIndicator(point: THREE.Vector3, worldNormal: THREE.Vector3): void {
        const g = this._ensureIndicator();
        const offset = worldNormal.clone().multiplyScalar(0.002);
        g.position.copy(point).add(offset);
        this._tmpQuat.setFromUnitVectors(this._zAxis, worldNormal);
        g.quaternion.copy(this._tmpQuat);
        g.visible = true;
    }

    private _hideIndicator(): void {
        if (this._indicator) this._indicator.visible = false;
    }

    private _setIndicatorIntent(intent: 'hover' | 'placed'): void {
        if (!this._indicatorFace) return;
        const mat = this._indicatorFace.material as THREE.MeshBasicMaterial;
        mat.opacity = intent === 'placed' ? 0.45 : 0.32;
    }

    // ── Arrow (3D push/pull gizmo) ──────────────────────────────────────

    private _ensureArrow(): THREE.Group {
        if (this._arrow) return this._arrow;
        const grp = new THREE.Group();
        grp.userData.isSectionBoxGizmo = true;
        grp.userData.isHelper          = true;

        // Shaft = thin cylinder along +Y in local space; the group is then
        // rotated so that local +Y aligns with the plane normal.
        const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 16);
        shaftGeo.translate(0, 0.55 / 2, 0);
        const shaftMat = new THREE.MeshBasicMaterial({
            color: ACCENT_HEX,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
        });
        (shaftMat as any).clippingPlanes = [];
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.renderOrder = 10001;
        shaft.userData.isSectionBoxGizmo = true;
        shaft.userData.isHelper          = true;
        grp.add(shaft);
        this._arrowShaft = shaft;

        // Head = cone at the tip
        const headGeo = new THREE.ConeGeometry(0.09, 0.22, 24);
        headGeo.translate(0, 0.55 + 0.22 / 2, 0);
        const headMat = new THREE.MeshBasicMaterial({
            color: ACCENT_HEX,
            depthTest: false,
            transparent: true,
            opacity: 1,
        });
        (headMat as any).clippingPlanes = [];
        const head = new THREE.Mesh(headGeo, headMat);
        head.renderOrder = 10002;
        head.userData.isSectionBoxGizmo = true;
        head.userData.isHelper          = true;
        grp.add(head);
        this._arrowHead = head;

        // Base socket (small white sphere where shaft meets the cut surface)
        const baseGeo = new THREE.SphereGeometry(0.045, 18, 12);
        const baseMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            depthTest: false,
            transparent: true,
            opacity: 1,
        });
        (baseMat as any).clippingPlanes = [];
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.renderOrder = 10000;
        base.userData.isSectionBoxGizmo = true;
        base.userData.isHelper          = true;
        grp.add(base);

        this._scene?.add(grp);
        this._arrow = grp;
        return grp;
    }

    private _placeArrow(): void {
        const g = this._ensureArrow();
        g.position.copy(this._origin);
        // Local +Y → plane normal
        this._tmpQuat.setFromUnitVectors(this._yAxis, this._normal);
        g.quaternion.copy(this._tmpQuat);
        g.visible = true;
    }

    private _destroyArrow(): void {
        if (!this._arrow) return;
        this._arrow.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry?.dispose();
                const m = obj.material as THREE.Material | THREE.Material[];
                if (Array.isArray(m)) m.forEach(x => x.dispose());
                else m?.dispose();
            }
        });
        this._scene?.remove(this._arrow);
        this._arrow      = null;
        this._arrowShaft = null;
        this._arrowHead  = null;
    }

    private _intersectsArrow(): boolean {
        if (!this._arrow) return false;
        const targets: THREE.Object3D[] = [];
        if (this._arrowShaft) targets.push(this._arrowShaft);
        if (this._arrowHead)  targets.push(this._arrowHead);
        return this._raycaster.intersectObjects(targets, false).length > 0;
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private _ndc(e: PointerEvent): THREE.Vector2 {
        const r = this._container!.getBoundingClientRect();
        return new THREE.Vector2(
            ((e.clientX - r.left) / r.width)  *  2 - 1,
            ((e.clientY - r.top)  / r.height) * -2 + 1,
        );
    }

    private _isCuttable(obj: any): obj is THREE.Mesh {
        if (!(obj instanceof THREE.Mesh)) return false;
        if (!obj.visible) return false;
        const u = obj.userData ?? {};
        if (u.isHelper || u.isPreview || u.isSectionBoxGizmo) return false;
        if (u.role === 'edges') return false;
        return true;
    }

    private _collectTargets(): THREE.Mesh[] {
        const out: THREE.Mesh[] = [];
        this._scene?.traverse(o => { if (this._isCuttable(o)) out.push(o as THREE.Mesh); });
        return out;
    }

    private _raycast(): THREE.Intersection | null {
        if (!this._camera || !this._scene) return null;
        const targets = this._collectTargets();
        if (targets.length === 0) return null;
        const hits = this._raycaster.intersectObjects(targets, false);
        return hits.length ? hits[0] : null;
    }

    private _faceWorldNormal(hit: THREE.Intersection): THREE.Vector3 {
        if (!hit.face) return new THREE.Vector3(0, 1, 0);
        const n = hit.face.normal.clone()
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
            .normalize();
        // 3D-VIEW-AUDIT-2026 §F32 — degenerate object scale (zero or extreme)
        // can produce a (0,0,0) world normal which `.normalize()` then turns
        // into NaN.  A NaN normal propagates into THREE.Plane, and the GPU
        // clipping shader returns NaN-tinted pixels (visually: the entire
        // scene goes black).  Fall back to world-up so the section box still
        // produces a valid cut even on malformed geometry.
        if (!isFinite(n.x) || !isFinite(n.y) || !isFinite(n.z) || n.lengthSq() < 1e-8) {
            return new THREE.Vector3(0, 1, 0);
        }
        return n;
    }

    private _orientNormalToCamera(n: THREE.Vector3, point: THREE.Vector3): THREE.Vector3 {
        if (!this._camera) return n;
        this._camera.getWorldPosition(this._tmpVec);
        const toCam = this._tmpVec.sub(point).normalize();
        if (n.dot(toCam) < 0) n.negate();
        return n;
    }

    private _requestRender(): void {
        const w = window.world;
        if (w?.renderer && 'needsUpdate' in w.renderer) {
            w.renderer.needsUpdate = true;
        }
    }

    // ── Pointer events ──────────────────────────────────────────────────

    private _handleMove(e: PointerEvent): void {
        if (!this._camera) return;
        this._mouse.copy(this._ndc(e));
        this._raycaster.setFromCamera(this._mouse, this._camera);

        if (this._dragging) {
            this._dragArrow();
            return;
        }

        if (this._phase === 'placed') {
            // Cursor feedback over the arrow gizmo
            if (this._container) {
                this._container.style.cursor = this._intersectsArrow() ? 'grab' : '';
            }
            return;
        }

        // Hover phase — update the highlight quad
        const hit = this._raycast();
        if (!hit || !hit.face) {
            this._hideIndicator();
            return;
        }
        const n = this._orientNormalToCamera(this._faceWorldNormal(hit), hit.point);
        this._placeIndicator(hit.point, n);
    }

    private _handleDown(e: PointerEvent): void {
        if (!this._camera || !this._scene || e.button !== 0) return;
        this._mouse.copy(this._ndc(e));
        this._raycaster.setFromCamera(this._mouse, this._camera);

        // ── Drag arrow has priority once a section is placed ────────────
        if (this._phase === 'placed' && this._intersectsArrow()) {
            this._beginDrag(e);
            return;
        }

        if (this._phase === 'placed') return;          // ignore clicks elsewhere

        const hit = this._raycast();
        if (!hit || !hit.face) {
            console.log('[SectionBoxTool] click missed any face — ignored');
            return;
        }

        const worldNormal = this._orientNormalToCamera(this._faceWorldNormal(hit), hit.point);
        this._normal.copy(worldNormal);
        this._origin.copy(hit.point);
        this._origAtPlace.copy(hit.point);

        this._applyPlane();
        this._placeIndicator(hit.point, worldNormal);
        this._setIndicatorIntent('placed');
        this._placeArrow();
        this._phase = 'placed';
        this._updateHint('Drag the purple arrow to push or pull. Click the section box button again to clear.');
        e.stopPropagation();
        e.preventDefault();
    }

    private _handleUp(e: PointerEvent): void {
        if (!this._dragging) return;
        this._dragging = false;
        const camControls = window.cameraControls;
        if (camControls) camControls.enabled = true;
        if (this._container) {
            this._container.releasePointerCapture(e.pointerId);
            this._container.style.cursor = 'grab';
        }
    }

    private _beginDrag(e: PointerEvent): void {
        if (!this._container) return;
        this._dragging = true;
        this._dragOrigin.copy(this._origin);
        this._dragStartParam = this._screenParamAlongNormal();
        const camControls = window.cameraControls;
        if (camControls) camControls.enabled = false;
        this._container.setPointerCapture(e.pointerId);
        this._container.style.cursor = 'grabbing';
        e.stopPropagation();
        e.preventDefault();
    }

    /**
     * Project the current pointer ray onto a plane that contains the cut
     * origin and is perpendicular to the camera's view but parallel to the
     * cut normal — that gives us a 1-D parameter along the normal axis.
     */
    private _screenParamAlongNormal(): number {
        if (!this._camera) return 0;
        const camDir = new THREE.Vector3();
        this._camera.getWorldDirection(camDir);
        // Build a plane that contains _normal and is roughly perpendicular
        // to the camera so the drag is stable.
        const tangent = new THREE.Vector3().crossVectors(this._normal, camDir);
        if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
        tangent.normalize();
        const planeNormal = new THREE.Vector3().crossVectors(this._normal, tangent).normalize();
        const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this._dragOrigin);
        const hit = new THREE.Vector3();
        if (!this._raycaster.ray.intersectPlane(dragPlane, hit)) return 0;
        return hit.sub(this._dragOrigin).dot(this._normal);
    }

    private _dragArrow(): void {
        const param = this._screenParamAlongNormal();
        const delta = param - this._dragStartParam;
        this._origin.copy(this._dragOrigin).addScaledVector(this._normal, delta);
        this._applyPlane();
        if (this._arrow)     this._arrow.position.copy(this._origin);
        if (this._indicator) this._indicator.position.copy(this._origin)
            .addScaledVector(this._normal, 0.002);
    }

    // ── Plane application ───────────────────────────────────────────────

    private _applyPlane(): void {
        if (!this._renderer || !this._scene) return;

        // 3D-VIEW-AUDIT-2026 §F32 — guard against NaN/Inf in the plane normal
        // and origin.  A bad normal produces a degenerate Plane that the
        // clipping shader silently rejects (the scene appears un-clipped) on
        // some GPUs and produces black pixels on others.  Bail out early so
        // we leave the prior clipping state intact.
        const nx = this._normal.x, ny = this._normal.y, nz = this._normal.z;
        if (
            !isFinite(nx) || !isFinite(ny) || !isFinite(nz) ||
            (nx * nx + ny * ny + nz * nz) < 1e-8 ||
            !isFinite(this._origin.x) || !isFinite(this._origin.y) || !isFinite(this._origin.z)
        ) {
            console.warn('[SectionBoxTool] §F32 — degenerate plane normal/origin; skipping clip apply.', {
                normal: this._normal.toArray(), origin: this._origin.toArray(),
            });
            return;
        }

        // Clip everything in front of the picked face (toward camera).
        // THREE.Plane keeps points where (n · p + c) >= 0.
        const n = this._normal.clone().negate();
        const c = this._normal.dot(this._origin);
        const plane = new THREE.Plane(n, c);

        // §SECTION-3D-CAPABILITY (L-1761) — RENDERER-LEVEL PLANES ONLY.
        //
        // The caller guarantees `_renderer` is the LIVE renderer and that it is
        // a genuine THREE.WebGLRenderer (see the class header). On that renderer
        // the global `clippingPlanes` set clips every material with no shader
        // permutation per material — which is the whole reason LevelClipPlaneCache
        // exists, and the reason the two writes this used to make are now gone:
        //
        //   ⛔ `localClippingEnabled = true` — BANNED (QF-1 / LevelClipPlaneCache):
        //      it forces EVERY material in the scene to recompile its shader with
        //      the CLIPPING_PLANES variant — measured at up to 15 SECONDS on a
        //      20-level model. `ViewController` and `LevelClipPlaneCache` both
        //      re-assert it to false; this tool was the last writer of `true`.
        //   ⛔ per-material `mat.clippingPlanes` — pointless AND expensive: with
        //      renderer-level planes it adds nothing, it carries `needsUpdate` on
        //      every material (the same recompile), and on the Phase-5 backends
        //      the live renderer never reads it at all.
        //
        // Removing the per-material path also retires the §F15 hazard that used
        // to live here (restoring `[]` where the original was `null` isolated a
        // material from global clipping forever): nothing is stamped, so nothing
        // needs restoring, and the bug is now unreachable rather than guarded.
        this._renderer.clippingPlanes = [plane];

        // ⛔ NO VISIBILITY FALLBACK. This used to hide every mesh whose AABB
        // centre sat on the cut side "so the user always sees SOMETHING happen
        // on click". That is exactly the failure C84 EI-1b forbids — it made a
        // FAILED cut and a SUCCESSFUL cut render as the same thing, which is why
        // the feature was remembered as "unreliable" rather than "unavailable".
        // It was also wrong where clipping worked: a wall straddling the plane
        // whose centre fell past it VANISHED WHOLE instead of being sliced.
        // Availability is now decided up front by resolveSectionClipCapability()
        // and disclosed on the button; when we get here, clipping really works.
        console.log('[SectionBoxTool] cut applied via renderer-level clip plane');

        this._requestRender();
    }
}
