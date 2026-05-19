import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreatePlumbingFixtureCommand } from '@pryzm/command-registry';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { PlumbingFragmentBuilder } from '@pryzm/geometry-plumbing';
import { PlumbingFixtureType } from '@pryzm/geometry-plumbing';
import {
    createToiletGeometry,
    DEFAULT_TOILET_VARIANT,
    TOILET_VARIANT_LABELS,
    ToiletVariant,
} from '@pryzm/geometry-plumbing';
import {
    createShowerGeometry,
    DEFAULT_SHOWER_VARIANT,
    SHOWER_VARIANT_LABELS,
    ShowerVariant,
} from '@pryzm/geometry-plumbing';
import { plumbingSystemTypeStore } from '@pryzm/geometry-plumbing';

export class PlumbingTool {
    private isActive = false;
    private previewMesh: THREE.Mesh | null = null;
    private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
    private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;
    private fixtureType: PlumbingFixtureType = 'toilet';
    private toiletVariant: ToiletVariant = DEFAULT_TOILET_VARIANT;
    private showerVariant: ShowerVariant = DEFAULT_SHOWER_VARIANT;
    private startPoint: THREE.Vector3 | null = null;
    private isDrawing = false;

    constructor(
        private world: OBC.World,
        public store: PlumbingStore,
        public builder: PlumbingFragmentBuilder
    ) {}

    setFixtureType(type: PlumbingFixtureType) {
        this.fixtureType = type;
        if (this.isActive) {
            this.removePreview();
            this.createPreview();
            this.updateUI();
        }
    }

    /** Set the LOD400 toilet sub-family. Triggers a preview rebuild. */
    setToiletVariant(variant: ToiletVariant) {
        this.toiletVariant = variant;
        window._pryzmActiveToiletVariant = variant;
        if (this.isActive && this.fixtureType === 'toilet') {
            this.removePreview();
            this.createPreview();
            this.updateUI();
        }
    }

    /** Set the LOD400 shower sub-family. Triggers a preview rebuild. */
    setShowerVariant(variant: ShowerVariant) {
        this.showerVariant = variant;
        window._pryzmActiveShowerVariant = variant;
        if (this.isActive && this.fixtureType === 'shower') {
            this.removePreview();
            this.createPreview();
            this.updateUI();
        }
    }

    activate() {
        if (this.isActive) return;
        this.isActive = true;
        this.startPoint = null;
        this.isDrawing = false;
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        this.attachListeners();
        this.createPreview();
    }

    deactivate() {
        if (!this.isActive) return;
        this.isActive = false;
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
        this.detachListeners();
        this.removePreview();
        if (this.world.camera.controls) this.world.camera.controls.enabled = true;
        
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
    }

    private createPreview() {
        let group: THREE.Group;

        // PRYZM brand purple for valid placement preview (Contract 05/06 palette).
        // Red is reserved for invalid placement (toggled in setPreviewColor).
        const PRYZM_PURPLE = 0x8B5CF6;

        if (this.fixtureType === 'toilet') {
            // Geometry parity (Contract 36 §5): preview shares the LOD400
            // factory used by the committed mesh. Translucent purple = valid,
            // red = invalid (toggled by setPreviewColor).
            group = createToiletGeometry(this.toiletVariant, {
                ceramicColor: PRYZM_PURPLE,
                metalColor:   PRYZM_PURPLE,
                transparent:  true,
                opacity:      0.55,
            });
        } else if (this.fixtureType === 'shower') {
            // Geometry parity (Contracts 36 §5 / 39 §5): preview shares the
            // LOD400 factory used by the committed mesh.
            group = createShowerGeometry(this.showerVariant, {
                metalColor:   PRYZM_PURPLE,
                ceramicColor: PRYZM_PURPLE,
                glassColor:   PRYZM_PURPLE,
                transparent:  true,
                opacity:      0.55,
            });
        } else if (this.fixtureType === 'sink') {
            group = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color: PRYZM_PURPLE, transparent: true, opacity: 0.5 });
            this.addSinkGeometry(group, mat);
        } else if (this.fixtureType === 'bath') {
            group = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color: PRYZM_PURPLE, transparent: true, opacity: 0.5 });
            const bodyGeo = new THREE.BoxGeometry(1.7, 0.6, 0.75);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.3;
            group.add(body);
        } else {
            group = new THREE.Group();
        }

        this.previewMesh = group as any;
        this.world.scene.three.add(this.previewMesh!);
    }

    private addSinkGeometry(group: THREE.Group, mat: THREE.Material) {
        // 1. Main Basin Body
        const basinShape = new THREE.BoxGeometry(0.6, 0.2, 0.45);
        const basin = new THREE.Mesh(basinShape, mat);
        basin.position.set(0, 0.8, -0.225);
        group.add(basin);

        // 2. Interior Bowl
        const bowlGeo = new THREE.SphereGeometry(0.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const bowl = new THREE.Mesh(bowlGeo, mat);
        bowl.scale.set(1.1, 0.7, 0.8);
        bowl.rotation.x = Math.PI;
        bowl.position.set(0, 0.89, -0.25);
        group.add(bowl);

        // 3. Countertop / Rim
        const rimGeo = new THREE.BoxGeometry(0.65, 0.05, 0.5);
        const rim = new THREE.Mesh(rimGeo, mat);
        rim.position.set(0, 0.9, -0.25);
        group.add(rim);

        // 4. Backsplash
        const backsplashGeo = new THREE.BoxGeometry(0.65, 0.3, 0.05);
        const backsplash = new THREE.Mesh(backsplashGeo, mat);
        backsplash.position.set(0, 1.0, -0.025);
        group.add(backsplash);

        // 8. Pedestal
        const pedestalGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.7, 32);
        const pedestal = new THREE.Mesh(pedestalGeo, mat);
        pedestal.position.set(0, 0.35, -0.15);
        group.add(pedestal);
    }

    private removePreview() {
        if (this.previewMesh) {
            this.world.scene.three.remove(this.previewMesh);
            this.previewMesh = null;
        }
    }

    private attachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        this.pointerMoveHandler = (e) => {
            // Only stop propagation if we are actually interacting with the placement
            // e.stopPropagation(); 
            this.onPointerMove(e);
        };
        this.pointerDownHandler = (e) => {
            if (e.button === 0) {
                // e.stopPropagation();
                this.onPointerDown(e);
            }
        };
        canvas.addEventListener('pointermove', this.pointerMoveHandler, true);
        canvas.addEventListener('pointerdown', this.pointerDownHandler, true);
        
        console.log("PlumbingTool listeners attached");
        // The bottom-of-canvas HUD is intentionally NOT created here. Type
        // selection and the Esc/Finish hint live in the right-side
        // PropertyPanel pre-draw card (PropertyPanel.showPlumbingPreDraw),
        // matching the standardized "NEW WALL / NEW DOOR / NEW WINDOW" UX
        // (see Contracts 05/06 + 39 §2).
    }

    private updateUI() {
        const text = document.querySelector('#plumbing-placement-ui span') as HTMLElement;
        if (text) text.innerText = this.placementLabel();
    }

    private placementLabel(): string {
        if (this.fixtureType === 'toilet') {
            const variantLabel = TOILET_VARIANT_LABELS[this.toiletVariant] ?? 'Toilet';
            return `Toilet — ${variantLabel} Placement Mode`;
        }
        if (this.fixtureType === 'shower') {
            const variantLabel = SHOWER_VARIANT_LABELS[this.showerVariant] ?? 'Shower';
            return `Shower — ${variantLabel} Placement Mode`;
        }
        const name = this.fixtureType.charAt(0).toUpperCase() + this.fixtureType.slice(1);
        return `${name} Placement Mode`;
    }

    // @ts-expect-error retained for reference; replaced by PropertyPanel.showPlumbingPreDraw
    private createPlacementUI() {
        const existing = document.getElementById('plumbing-placement-ui');
        if (existing) existing.remove();
        // Use placementLabel() so the variant name is shown on first render too.
        const initialLabel = this.placementLabel();

        const ui = document.createElement('div');
        ui.id = 'plumbing-placement-ui';
        ui.style.cssText = 'position:absolute; bottom:20px; left:50%; transform:translateX(-50%); padding:10px 20px; background:var(--app-bg); color:var(--app-text); border:1px solid var(--app-border); border-radius:var(--app-radius-md); box-shadow:var(--app-shadow-panel); display:flex; align-items:center; gap:15px; z-index:1000; font-family:var(--app-font); font-size:13px;';

        const text = document.createElement('span');
        text.innerText = initialLabel;
        ui.appendChild(text);

        // Contract 39 §2 — Type-picker shown at creation time.
        // Mirrors the doors/walls type-as-data pattern: variants come from the
        // PlumbingSystemTypeStore and selecting one swaps the live preview via
        // setToiletVariant() (geometry parity with committed mesh).
        const variants = plumbingSystemTypeStore.getByFamily(this.fixtureType);
        if (variants.length > 1) {
            const typeLabel = document.createElement('span');
            typeLabel.innerText = 'Type:';
            typeLabel.style.cssText = 'opacity:0.7;';
            ui.appendChild(typeLabel);

            const sel = document.createElement('select');
            sel.id = 'plumbing-placement-type-select';
            sel.style.cssText = 'padding:4px 8px; background:rgba(255,255,255,0.06); color:var(--app-text); border:1px solid var(--app-border); border-radius:var(--app-radius-sm); font-family:var(--app-font); font-size:12px;';
            variants.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.variant;
                opt.textContent = v.name;
                if (this.fixtureType === 'toilet' && v.variant === this.toiletVariant) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', (e) => {
                e.stopPropagation();
                if (this.fixtureType === 'toilet') {
                    this.setToiletVariant(sel.value as ToiletVariant);
                }
            });
            sel.addEventListener('pointerdown', (e) => e.stopPropagation());
            ui.appendChild(sel);
        }

        const finishBtn = document.createElement('button');
        finishBtn.innerText = 'Finish';
        finishBtn.style.cssText = 'padding:6px 18px; cursor:pointer; background:var(--app-gradient); border:none; color:#fff; border-radius:var(--app-radius-sm); font-family:var(--app-font); font-size:12px; font-weight:600; box-shadow:var(--app-shadow-glow);';
        finishBtn.onclick = (e) => {
            e.stopPropagation();
            this.deactivate();
        };
        ui.appendChild(finishBtn);

        document.body.appendChild(ui);
    }

    private removePlacementUI() {
        const ui = document.getElementById('plumbing-placement-ui');
        if (ui) ui.remove();
    }

    private detachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        if (this.pointerMoveHandler) canvas.removeEventListener('pointermove', this.pointerMoveHandler, true);
        if (this.pointerDownHandler) canvas.removeEventListener('pointerdown', this.pointerDownHandler, true);
        this.pointerMoveHandler = null;
        this.pointerDownHandler = null;
        this.removePlacementUI();
    }

    private onPointerMove(e: PointerEvent) {
        const PRYZM_PURPLE = 0x8B5CF6;
        const INVALID_RED  = 0xff0000;

        const point = this.getWorldPoint(e);
        if (point && this.previewMesh) {
            if (this.fixtureType === 'bath' && this.isDrawing && this.startPoint) {
                const distance = this.startPoint.distanceTo(point);
                const angle = Math.atan2(point.x - this.startPoint.x, point.z - this.startPoint.z);

                this.previewMesh.scale.x = distance / 1.7 || 0.001;
                this.previewMesh.position.set(
                    (this.startPoint.x + point.x) / 2,
                    this.startPoint.y,
                    (this.startPoint.z + point.z) / 2
                );
                this.previewMesh.rotation.y = angle + Math.PI / 2;
                this.setPreviewColor(PRYZM_PURPLE);
            } else {
                this.previewMesh.position.copy(point);
                this.previewMesh.scale.set(1, 1, 1);
                
                if (this.fixtureType === 'bath') {
                    this.previewMesh.rotation.set(0, 0, 0);
                    this.setPreviewColor(PRYZM_PURPLE);
                } else {
                    const wallResult = this.getNearestWall(point);
                    if (wallResult) {
                        const lookAtTarget = point.clone().add(wallResult.normal);
                        this.previewMesh.lookAt(lookAtTarget);
                        // Toilet, sink and shower local +Z faces away from the
                        // back wall (see ToiletGeometry / ShowerGeometry headers).
                        // lookAt aims -Z toward the target, so flip 180° around Y
                        // to keep the back of the bowl/basin/column against the wall.
                        if (this.fixtureType === 'sink' || this.fixtureType === 'toilet' || this.fixtureType === 'shower') {
                            this.previewMesh.rotateY(Math.PI);
                        }
                        const offset = wallResult.normal.clone().multiplyScalar(0.02);
                        this.previewMesh.position.add(offset);
                        this.setPreviewColor(PRYZM_PURPLE);
                    } else {
                        this.setPreviewColor(INVALID_RED);
                    }
                }
            }
            
            // Phase 5 guard: skip needsUpdate when WebGPU canvas is active.
            // Triggering OBC's WebGL render in Phase 5 destroys PRYZM's ShadowDepthTexture.
            const renderer = this.world.renderer as any;
            if (renderer && renderer.mode === OBC.RendererMode.MANUAL && 'needsUpdate' in renderer && !window.pryzmCanvas) {
                renderer.needsUpdate = true;
            }
        }
    }

    private setPreviewColor(color: number) {
        if (!this.previewMesh) return;
        this.previewMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                (child.material as THREE.MeshStandardMaterial).color.set(color);
            }
        });
    }

    private onPointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        const point = this.getWorldPoint(e);
        if (!point) return;

        const commandManager = window.commandManager; // TODO(TASK-06)
        const projectContext = window.projectContext;
        const levelId = projectContext.activeLevelId;
        const bimManager = projectContext.bimManager || window.bimManager;

        if (!levelId) {
            console.error("No active level selected");
            return;
        }

        if (this.fixtureType === 'bath') {
            if (!this.isDrawing) {
                this.startPoint = point.clone();
                this.isDrawing = true;
                return;
            } else if (this.startPoint) {
                const endPoint = point.clone();
                const distance = this.startPoint.distanceTo(endPoint);
                const angle = Math.atan2(endPoint.x - this.startPoint.x, endPoint.z - this.startPoint.z);
                const center = new THREE.Vector3().addVectors(this.startPoint, endPoint).multiplyScalar(0.5);

                // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('plumbing.create', {}).catch(() => {}); }
                commandManager.execute(new CreatePlumbingFixtureCommand({
                    fixtureType: 'bath',
                    position: { x: center.x, y: center.y, z: center.z },
                    rotation: { x: 0, y: angle + Math.PI / 2, z: 0 },
                    levelId: levelId,
                    baseOffset: 0,
                    width: distance,
                    length: 0.75,
                    height: 0.6,
                    color: '#ffffff',
                    startPoint: { x: this.startPoint.x, y: this.startPoint.y, z: this.startPoint.z },
                    endPoint: { x: endPoint.x, y: endPoint.y, z: endPoint.z }
                }));

                this.startPoint = null;
                this.isDrawing = false;
            }
        } else {
            const wallResult = this.getNearestWall(point);
            if (wallResult && this.previewMesh) {
                const offset = wallResult.normal.clone().multiplyScalar(0.02);
                const finalPos = point.clone().add(offset);
                const slabPoint = this.getSlabPoint(e);
                if (slabPoint) finalPos.y = Math.max(slabPoint.y, finalPos.y);
                const rotation = this.previewMesh.rotation.clone();

                // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('plumbing.create', {}).catch(() => {}); }
                commandManager.execute(new CreatePlumbingFixtureCommand({
                    fixtureType: this.fixtureType as any,
                    toiletVariant: this.fixtureType === 'toilet' ? this.toiletVariant : undefined,
                    showerVariant: this.fixtureType === 'shower' ? this.showerVariant : undefined,
                    position: { x: finalPos.x, y: finalPos.y, z: finalPos.z },
                    rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
                    levelId: levelId,
                    baseOffset: finalPos.y - (bimManager.getLevelById(levelId)?.elevation || 0)
                }));
            }
        }

        // Phase 5 guard: skip needsUpdate when WebGPU canvas is active.
        const renderer = this.world.renderer as any;
        if (renderer && renderer.mode === OBC.RendererMode.MANUAL && 'needsUpdate' in renderer && !window.pryzmCanvas) {
            renderer.needsUpdate = true;
        }
    }

    private getSlabPoint(e: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);
        const slabs = this.world.scene.three.children.filter(c => c.userData.elementType === 'Slab');
        const intersects = raycaster.intersectObjects(slabs);
        return intersects.length > 0 ? intersects[0].point : null;
    }

    private getWorldPoint(e: PointerEvent): THREE.Vector3 | null {
        const slabPoint = this.getSlabPoint(e);
        if (slabPoint) return slabPoint;

        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const result = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, result) ? result : null;
    }

    /**
     * Find the nearest wall to `point` using `wallStore.getAll()` baseLine math.
     * This is far more reliable than mesh-raycasting (which fails when the
     * preview group's tall column geometry occludes the rays from the cursor),
     * and mirrors the snap logic used by `PlumbingPlanToolHandler._findWallSnap`
     * so 3D and plan-view placement behave identically (geometry parity).
     *
     * Returns the outward (room-side) horizontal normal of the wall — i.e. the
     * direction you would walk to leave the wall — so the caller can use
     * lookAt(point + normal) + rotateY(PI) to seat the fixture's back against
     * the wall with its +Z facing into the room (Contracts 36/39 §5).
     */
    private getNearestWall(point: THREE.Vector3): { normal: THREE.Vector3, quaternion: THREE.Quaternion } | null {
        const ws = window.wallStore; // TODO(TASK-08)
        if (!ws?.getAll) return null;

        const projectContext = window.projectContext;
        const activeLevelId  = projectContext?.activeLevelId;

        const SNAP_RANGE = 1.5; // metres — must match plan-view _findWallSnap
        let bestDist = SNAP_RANGE;
        let bestNormal: THREE.Vector3 | null = null;

        for (const wall of ws.getAll() as any[]) {
            if (activeLevelId && wall.levelId && wall.levelId !== activeLevelId) continue;
            const bl = wall.baseLine;
            if (!bl || bl.length < 2) continue;

            const ax = bl[0].x, az = bl[0].z;
            const bx = bl[1].x, bz = bl[1].z;
            const dx = bx - ax, dz = bz - az;
            const lenSq = dx * dx + dz * dz;
            if (lenSq < 1e-10) continue;

            // Closest point on the wall baseLine segment to the cursor.
            const t  = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / lenSq));
            const cx = ax + t * dx, cz = az + t * dz;
            const dist = Math.hypot(point.x - cx, point.z - cz);
            if (dist >= bestDist) continue;

            // Outward (room-side) normal — perpendicular to baseLine on the
            // half-plane facing the cursor.
            const len = Math.sqrt(lenSq);
            const nx =  dz / len;
            const nz = -dx / len;
            const dot = (point.x - cx) * nx + (point.z - cz) * nz;
            const sign = dot >= 0 ? 1 : -1;

            bestDist   = dist;
            bestNormal = new THREE.Vector3(sign * nx, 0, sign * nz);
        }

        if (!bestNormal) return null;

        // Quaternion is unused by current callers but kept for API parity.
        const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            bestNormal,
        );
        return { normal: bestNormal, quaternion: quat };
    }
}
