import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import * as BUI from '@thatopen/ui';
import { CreateSlabCommand } from '@pryzm/command-registry';
import { HostReferenceEdge } from './SketchTypes.js';
import { WallFaceResolver } from './WallFaceResolver.js';
import { projectContext, PREVIEW_COLOR } from '@pryzm/core-app-model';

const HUD_ID = 'pick-walls-hud';

/**
 * W2 §SLAB-SYSTEM-AUDIT-2026: Dependency injection contract.
 *
 * All previously-window.* accessed dependencies in SlabPickWallsController are
 * now provided at construction time via this interface (getter functions so
 * EngineBootstrap can pass them before the targets are fully initialised).
 *
 * getCommandManager  — executes CreateSlabCommand (replaces commandManager).
 * getBimManager      — used for level elevation in the preview path.
 * getActiveLevelId   — replaces window.projectContext?.activeLevelId.
 * getUnselectAll     — replaces window.unselectAll?.() called in enter().
 */
export interface SlabPickWallsControllerDeps {
    getCommandManager?: () => any;
    getBimManager?:     () => any;
    getActiveLevelId?:  () => string;
    getUnselectAll?:    () => (() => void) | undefined;
}

/**
 * SlabPickWallsController
 *
 * Implements the "Pick Walls" slab creation mode — the Revit-style workflow
 * where the user clicks on existing walls to define the slab boundary.
 *
 * Each picked wall contributes one HostReferenceEdge to the slab sketch.
 * The slab outline automatically updates whenever those walls are modified,
 * thanks to SlabDependencyTracker and the builder's sketch-resolution path.
 *
 * UI flow:
 *   1. User clicks "Pick Walls" in the Structure > Slab menu.
 *   2. HUD appears: "Click walls to define slab boundary (min 3)".
 *   3. Hovered walls highlight in orange; picked walls highlight green.
 *   4. A live preview polygon draws the current slab footprint.
 *   5. When ≥3 walls are picked, "Create Slab" button enables.
 *   6. Pressing "Create Slab" (or Enter) fires CreateSlabCommand with the sketch.
 *   7. Pressing "Cancel" (or Escape) aborts with no side effects.
 *
 * Contract compliance:
 * - §01 §2.1 Command-First: Slab creation is delegated to CreateSlabCommand.
 * - §02 Projection-Only: WallFaceResolver is used read-only for preview only.
 * - §03 §3.2: Sketch stores HostReferenceEdges; SlabDependencyTracker registers
 *   the wall→slab dependency automatically when the store 'bim-slab-added' event fires.
 * - W2 §SLAB-SYSTEM-AUDIT-2026: All window.* accesses replaced with injected deps.
 */
export class SlabPickWallsController {
    private world: OBC.World;
    private wallStore: any;
    private _deps: SlabPickWallsControllerDeps = {};

    private pickedWallIds: string[] = [];
    private hoveredWallId: string | null = null;

    private highlightMaterials = new Map<string, {
        meshes: THREE.Mesh[];
        originals: THREE.Material[];
    }>();

    private previewLine: THREE.Line | null = null;
    private previewFill: THREE.Mesh | null = null;

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();

    private onMoveBound = this.onMove.bind(this);
    private onClickBound = this.onClick.bind(this);
    private onKeyDownBound = this.onKeyDown.bind(this);

    private active = false;

    private readonly HOVER_COLOR = new THREE.Color(0xff8c00);
    private readonly PICKED_COLOR = new THREE.Color(0x22bb33);

    constructor(world: OBC.World, wallStore: any, deps?: SlabPickWallsControllerDeps) {
        this.world = world;
        this.wallStore = wallStore;
        if (deps) this._deps = deps;
    }

    get isActive(): boolean {
        return this.active;
    }

    enter(): void {
        if (this.active) this.exit();
        this.active = true;
        this.pickedWallIds = [];
        this.hoveredWallId = null;

        // W2: Use injected getUnselectAll dep; window.unselectAll fallback for legacy callers.
        const unselectAll = this._deps.getUnselectAll?.() ?? window.unselectAll;
        unselectAll?.();

        if (this.world.camera?.controls) {
            this.world.camera.controls.enabled = false;
        }

        const canvas = this.world.renderer!.three.domElement;
        canvas.style.touchAction = 'none';
        canvas.addEventListener('pointermove', this.onMoveBound, { passive: true });
        canvas.addEventListener('pointerdown', this.onClickBound, { passive: false });
        window.addEventListener('keydown', this.onKeyDownBound);

        this.showHUD();
    }

    exit(): void {
        if (!this.active) return;
        this.active = false;

        this.clearAllHighlights();
        this.removePreview();
        this.removeHUD();

        const canvas = this.world.renderer!.three.domElement;
        canvas.removeEventListener('pointermove', this.onMoveBound);
        canvas.removeEventListener('pointerdown', this.onClickBound);
        window.removeEventListener('keydown', this.onKeyDownBound);

        if (this.world.camera?.controls) {
            this.world.camera.controls.enabled = true;
        }

        canvas.style.touchAction = '';
        this.pickedWallIds = [];
        this.hoveredWallId = null;
    }

    private onMove(event: PointerEvent): void {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const camera = this.world.camera.three as THREE.PerspectiveCamera | THREE.OrthographicCamera;
        this.raycaster.setFromCamera(this.mouse, camera);

        const scene = this.world.scene.three as THREE.Scene;
        const intersects = this.raycaster.intersectObjects(scene.children, true);

        let hitWallId: string | null = null;
        for (const hit of intersects) {
            if ((hit.object.userData as any)?.isPreview) continue;
            const wallId = this.findWallId(hit.object);
            if (wallId) {
                hitWallId = wallId;
                break;
            }
        }

        if (hitWallId !== this.hoveredWallId) {
            if (this.hoveredWallId && !this.pickedWallIds.includes(this.hoveredWallId)) {
                this.clearHighlight(this.hoveredWallId);
            }
            this.hoveredWallId = hitWallId;
            if (hitWallId && !this.pickedWallIds.includes(hitWallId)) {
                this.applyHighlight(hitWallId, this.HOVER_COLOR);
            }
        }
    }

    private onClick(event: PointerEvent): void {
        if (event.button !== 0) return;
        if (!this.hoveredWallId) return;
        if (this.pickedWallIds.includes(this.hoveredWallId)) {
            this.unpickWall(this.hoveredWallId);
        } else {
            this.pickWall(this.hoveredWallId);
        }
        this.updateHUDStatus();
        this.updatePreview();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') { this.exit(); return; }
        if (event.key === 'Enter' && this.pickedWallIds.length >= 3) { this.complete(); }
    }

    private pickWall(wallId: string): void {
        this.pickedWallIds.push(wallId);
        this.applyHighlight(wallId, this.PICKED_COLOR);
    }

    private unpickWall(wallId: string): void {
        this.pickedWallIds = this.pickedWallIds.filter(id => id !== wallId);
        this.clearHighlight(wallId);
        if (this.hoveredWallId === wallId) {
            this.applyHighlight(wallId, this.HOVER_COLOR);
        }
    }

    complete(): void {
        if (this.pickedWallIds.length < 3) return;

        // W2 §SLAB-SYSTEM-AUDIT-2026: Use injected deps; window globals are the legacy fallback.
        const commandManager = this._deps.getCommandManager?.() ?? window.commandManager; // TODO(TASK-06)
        if (!commandManager) return;

        const levelId = this._deps.getActiveLevelId?.()
            ?? window.projectContext?.activeLevelId
            ?? projectContext.activeLevelId;

        // W2: Pre-generate both id and ifcGuid here (in the controller, not inside execute())
        // so the identifiers are stable across any potential undo/redo cycles.
        const slabId  = crypto.randomUUID();
        const ifcGuid = crypto.randomUUID();

        const edges: HostReferenceEdge[] = this.pickedWallIds.map(wallId => ({
            type: 'hostReference' as const,
            hostId: wallId,
            hostType: 'wall' as const,
            reference: 'centerLine' as const,
            offset: 0
        }));

        const sketch = { outerLoop: { edges } };

        const command = new CreateSlabCommand({
            id:       slabId,
            ifcGuid:  ifcGuid,
            width:    0,
            depth:    0,
            thickness: 0.2,
            position: { x: 0, y: 0, z: 0 },
            levelId,
            sketch
        });

        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('slab.update', {}).catch(() => {}); }
        const result = commandManager.execute(command);
        if (result.success) {
            console.log(`[SlabPickWalls] Created sketch-based slab referencing ${this.pickedWallIds.length} walls.`);
        } else {
            console.warn('[SlabPickWalls] CreateSlabCommand failed:', result.error);
        }

        this.exit();
    }

    private updatePreview(): void {
        this.removePreview();
        if (this.pickedWallIds.length < 2) return;

        const scene = this.world.scene.three as THREE.Scene;
        // W2 §SLAB-SYSTEM-AUDIT-2026: Use injected deps; window globals are the legacy fallback.
        const levelId = this._deps.getActiveLevelId?.()
            ?? window.projectContext?.activeLevelId
            ?? projectContext.activeLevelId;
        const bimManager = this._deps.getBimManager?.() ?? window.bimManager;
        const level = bimManager?.getLevelById(levelId);
        const elevation = level?.elevation ?? 0;

        const points3D: THREE.Vector3[] = [];

        for (const wallId of this.pickedWallIds) {
            const edge: HostReferenceEdge = {
                type: 'hostReference',
                hostId: wallId,
                hostType: 'wall',
                reference: 'centerLine',
                offset: 0
            };
            const seg = WallFaceResolver.resolve(edge);
            if (!seg) continue;
            points3D.push(new THREE.Vector3(seg.start.x, elevation + 0.05, seg.start.y));
        }

        if (points3D.length < 2) return;

        const closed = [...points3D, points3D[0].clone()];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(closed);
        const lineMat = new THREE.LineBasicMaterial({
            color: PREVIEW_COLOR.PRIMARY,  // §41 unified PRYZM purple
            depthTest: false,
            linewidth: 2
        });
        this.previewLine = new THREE.Line(lineGeo, lineMat);
        this.previewLine.userData.isPreview = true;
        scene.add(this.previewLine);

        if (points3D.length >= 3) {
            const shape = new THREE.Shape(points3D.map(p => new THREE.Vector2(p.x, -p.z)));
            const fillGeo = new THREE.ShapeGeometry(shape);
            const fillMat = new THREE.MeshBasicMaterial({
                color: PREVIEW_COLOR.PRIMARY,  // §41 unified PRYZM purple
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false
            });
            this.previewFill = new THREE.Mesh(fillGeo, fillMat);
            this.previewFill.rotation.x = -Math.PI / 2;
            this.previewFill.position.y = elevation + 0.04;
            this.previewFill.userData.isPreview = true;
            scene.add(this.previewFill);
        }
    }

    private removePreview(): void {
        const scene = this.world.scene.three as THREE.Scene;
        if (this.previewLine) {
            this.previewLine.geometry.dispose();
            (this.previewLine.material as THREE.Material).dispose();
            scene.remove(this.previewLine);
            this.previewLine = null;
        }
        if (this.previewFill) {
            this.previewFill.geometry.dispose();
            (this.previewFill.material as THREE.Material).dispose();
            scene.remove(this.previewFill);
            this.previewFill = null;
        }
    }

    private applyHighlight(wallId: string, color: THREE.Color): void {
        const scene = this.world.scene.three as THREE.Scene;
        const wallRoot = this.findWallRoot(wallId, scene);
        if (!wallRoot) return;

        const meshes: THREE.Mesh[] = [];
        const originals: THREE.Material[] = [];

        wallRoot.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                if (mesh.userData?.isPreview) return;
                const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                if (!mat) return;
                originals.push(mat.clone());
                meshes.push(mesh);
                const highlight = (mat as THREE.MeshStandardMaterial).clone?.() ?? new THREE.MeshStandardMaterial();
                (highlight as THREE.MeshStandardMaterial).color = color.clone();
                (highlight as THREE.MeshStandardMaterial).emissive = color.clone().multiplyScalar(0.3);
                mesh.material = highlight;
            }
        });

        if (meshes.length > 0) {
            this.highlightMaterials.set(wallId, { meshes, originals });
        }
    }

    private clearHighlight(wallId: string): void {
        const data = this.highlightMaterials.get(wallId);
        if (!data) return;
        data.meshes.forEach((mesh, i) => {
            const cur = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            if (cur) (cur as THREE.Material).dispose();
            mesh.material = data.originals[i];
        });
        this.highlightMaterials.delete(wallId);
    }

    private clearAllHighlights(): void {
        const ids = [...this.highlightMaterials.keys()];
        ids.forEach(id => this.clearHighlight(id));
    }

    private findWallId(object: THREE.Object3D): string | null {
        let current: THREE.Object3D | null = object;
        while (current) {
            const data = current.userData as any;
            // §WALL-MOVE-CASE-FIX (Apr 2026): WallFragmentBuilder stamps
            // `elementType = 'wall'` (lowercase, frozen). Case-normalise the
            // comparison so slab pick-walls works on the canonical lowercase
            // form (and any legacy capitalised stamps that may still be in
            // play during a session that pre-dates the fix).
            const t = (data?.elementType ?? '').toString().toLowerCase();
            if (t === 'wall' && data?.id) return data.id;
            if (data?.parentId && this.isWallId(data.parentId)) return data.parentId;
            current = current.parent;
        }
        return null;
    }

    private isWallId(id: string): boolean {
        return !!this.wallStore?.getById?.(id);
    }

    private findWallRoot(wallId: string, scene: THREE.Scene): THREE.Object3D | null {
        let found: THREE.Object3D | null = null;
        scene.traverse(obj => {
            // §WALL-MOVE-CASE-FIX (Apr 2026): match canonical lowercase
            // `elementType = 'wall'` stamped by WallFragmentBuilder.
            const t = (obj.userData?.elementType ?? '').toString().toLowerCase();
            if (!found && obj.userData?.id === wallId && t === 'wall') {
                found = obj;
            }
        });
        return found;
    }

    private showHUD(): void {
        const existing = document.getElementById(HUD_ID);
        if (existing) existing.remove();

        const comp = BUI.Component.create(() => BUI.html`
            <div id="${HUD_ID}" class="th-overlay" style="z-index:999999; min-width:360px;">
                <div class="th-row">
                    <div class="th-text">
                        <strong>Pick Walls:</strong>
                        <span id="pick-walls-status">Click walls to define the slab boundary (min 3)</span>
                    </div>
                    <div class="th-btn-row" style="flex:0 0 auto;">
                        <button
                            id="pick-walls-create-btn"
                            class="th-btn th-btn--success"
                            style="display:none;"
                            @click=${() => this.complete()}>
                            ✓ Create Slab
                        </button>
                        <button
                            class="th-btn th-btn--neutral"
                            @click=${() => this.exit()}>
                            Cancel
                        </button>
                    </div>
                </div>
                <span class="th-hint">Click to pick • Click again to unpick • Enter to create • Esc to cancel</span>
            </div>
        `);

        document.body.appendChild(comp);
    }

    private updateHUDStatus(): void {
        const status = document.getElementById('pick-walls-status');
        const btn = document.getElementById('pick-walls-create-btn') as HTMLElement | null;
        const count = this.pickedWallIds.length;

        if (status) {
            if (count === 0) {
                status.textContent = 'Click walls to define the slab boundary (min 3)';
            } else if (count < 3) {
                status.textContent = `${count} wall${count > 1 ? 's' : ''} selected — pick at least ${3 - count} more`;
            } else {
                status.textContent = `${count} walls selected — press "Create Slab" or Enter to finish`;
            }
        }

        if (btn) {
            btn.style.display = count >= 3 ? 'inline-flex' : 'none';
        }
    }

    private removeHUD(): void {
        const hud = document.getElementById(HUD_ID);
        if (hud) hud.remove();
    }
}
