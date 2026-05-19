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
 * Clipping is applied two ways in parallel:
 *   (a) renderer.clippingPlanes (global) for WebGL paths
 *   (b) per-material mat.clippingPlanes for the WebGPU node pipeline used
 *       by this app — the same path the wall-cutaway and Z-Slicer rely on.
 *
 * If neither path produces a visible cut we fall back to per-mesh visibility
 * culling (any mesh whose centre lies on the clipped side is hidden) so the
 * user always sees something happen on click.
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

    // ── Per-material backup so we can restore on disable ────────────────
    private _matBackup: Map<THREE.Material, THREE.Plane[] | null> = new Map();
    private _hiddenMeshes: Set<THREE.Mesh> = new Set();    // fallback culling

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

        // Restore every material we touched.
        //
        // 3D-VIEW-AUDIT-2026 §F15 — was `original ?? []`, which permanently
        // converted any material whose pre-section state was `clippingPlanes = null`
        // into `clippingPlanes = []`.  In Three.js these are NOT equivalent:
        //   • `null`  — material participates in the renderer's GLOBAL clipping set
        //               (`renderer.clippingPlanes`).
        //   • `[]`    — material is ISOLATED from clipping entirely.
        // The bug therefore silently disabled global clipping (used by the V07
        // SectionViewService) on every material the SectionBoxTool ever touched.
        // This is the sibling of V07 §F15.1 (already fixed in SectionViewService).
        this._matBackup.forEach((original, mat) => {
            try {
                (mat as any).clippingPlanes = original ?? null;
                mat.needsUpdate = true;
            } catch { /* ignore */ }
        });
        this._matBackup.clear();

        // Restore meshes that were culled as a visual fallback
        this._hiddenMeshes.forEach(m => { m.visible = true; });
        this._hiddenMeshes.clear();

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

        this._renderer.localClippingEnabled = true;
        this._renderer.clippingPlanes = [plane];

        // Per-material apply
        let meshCount = 0;
        let matCount  = 0;
        let firstMat  = '';
        this._scene.traverse(o => {
            if (!this._isCuttable(o)) return;
            const mesh = o as THREE.Mesh;
            meshCount++;
            const mats: THREE.Material[] = Array.isArray(mesh.material)
                ? mesh.material
                : (mesh.material ? [mesh.material] : []);
            mats.forEach(mat => {
                if (!mat) return;
                if (!firstMat) firstMat = (mat as any).constructor?.name ?? 'unknown';
                if (!this._matBackup.has(mat)) {
                    const orig = (mat as any).clippingPlanes as THREE.Plane[] | undefined;
                    this._matBackup.set(mat, orig ? orig.slice() : null);
                }
                (mat as any).clippingPlanes = [plane];
                (mat as any).clipShadows    = true;
                mat.needsUpdate = true;
                matCount++;
            });
        });

        // Visual fallback: hide any mesh whose AABB centre is on the cut
        // (camera-side) of the plane. Restore previously-hidden meshes whose
        // centre is now back on the kept side. This guarantees the user sees
        // SOMETHING change immediately on click, even if the WebGPU pipeline
        // ignores material clipping for whatever reason.
        const box = new THREE.Box3();
        const centre = new THREE.Vector3();
        const previouslyHidden = new Set(this._hiddenMeshes);
        this._hiddenMeshes.clear();
        this._scene.traverse(o => {
            const isOurs = (o as any).userData?.isSectionBoxGizmo;
            if (isOurs) return;
            // Restore any previously-hidden mesh by default
            if (previouslyHidden.has(o as any)) (o as THREE.Mesh).visible = true;
            if (!(o instanceof THREE.Mesh)) return;
            if (!o.geometry) return;
            // Use bounding box of the geometry
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            box.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld);
            box.getCenter(centre);
            // Distance from centre to plane in plane.normal direction
            // plane.distanceToPoint > 0 means kept side
            const d = plane.distanceToPoint(centre);
            if (d < -0.05) {
                // Centre clearly on the clipped side — hide it.
                if (o.visible && !previouslyHidden.has(o)) {
                    // Was visible before our culling — record so we restore later
                    o.visible = false;
                    this._hiddenMeshes.add(o);
                } else if (previouslyHidden.has(o)) {
                    o.visible = false;
                    this._hiddenMeshes.add(o);
                }
            }
        });

        console.log(
            `[SectionBoxTool] cut applied: meshes=${meshCount} mats=${matCount} ` +
            `firstMat=${firstMat} hiddenFallback=${this._hiddenMeshes.size}`,
        );

        this._requestRender();
    }
}
