/**
 * @file WardrobeCabinetTool.ts
 *
 * Placement tool for parametric wardrobe cabinet runs.
 *
 * UI flow:
 *   1. User selects a layout (Straight / L / U) + sets parameters in the
 *      floating config panel (depth, length, height, numSections, arm lengths).
 *   2. A ghost preview follows the cursor on the floor plane.
 *   3. First click places the wardrobe run at the cursor position.
 *   4. After placement, the tool deactivates.
 *
 * Contract:
 *  §01 §2  — all writes via CreateFurnitureCommand (undo/redo + store event).
 *  §05 §6  — no bim-* elements.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import {
    WardrobeLayoutType,
    WardrobeCabinetConfig,
    WARDROBE_CABINET_DEFAULTS,
    buildDefaultSections,
    mergeSections,
    isTallWardrobeLayout,
    baseWardrobeLayout,
    buildDefaultWardrobeCabinetConfig,
} from '@pryzm/geometry-furniture';

let _idCounter = 0;
function newId(): string { return `wardrobe_cab_${Date.now()}_${_idCounter++}`; }

export class WardrobeCabinetTool {

    private _active  = false;
    private _config: WardrobeCabinetConfig;
    private _preview: THREE.Group | null = null;

    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onKeyDown:     ((e: KeyboardEvent) => void) | null = null;

    private readonly _raycaster = new THREE.Raycaster();
    private readonly _pointer   = new THREE.Vector2();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _world: OBC.World,
        // Kept for backward compatibility with existing call sites; no longer used
        // since placement now flows through CreateFurnitureCommand.
        private readonly _store: any,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        void this._store;
        this._config = this._defaultConfig('wardrobe_straight');
    }

    get active(): boolean { return this._active; }

    setLayout(layout: WardrobeLayoutType): void {
        const defaults = this._defaultConfig(layout);
        this._config = {
            ...defaults,
            depth:         this._config.depth,
            length:        this._config.length,
            height:        this._config.height,
            numSections:   this._config.numSections,
            carcassColor:  this._config.carcassColor,
            frontColor:    this._config.frontColor,
            handleColor:   this._config.handleColor,
            layoutType:    layout,
            sections: mergeSections(
                this._config.sections ?? defaults.sections ?? [],
                this._config.numSections,
                defaults.numSectionsLeft ?? 0,
                defaults.numSectionsRight ?? 0,
            ),
        };
        if (this._active) this._rebuildPreview();
    }

    updateConfig(patch: Partial<WardrobeCabinetConfig>): void {
        this._config = { ...this._config, ...patch };
        const existing = this._config.sections ?? [];
        this._config = {
            ...this._config,
            sections: mergeSections(
                existing,
                this._config.numSections,
                this._config.numSectionsLeft  ?? 0,
                this._config.numSectionsRight ?? 0,
            ),
        };
        if (this._active) this._rebuildPreview();
    }

    activate(): void {
        if (this._active) return;
        this._active = true;
        this._buildPreview();
        this._attachListeners();
        window.runtime?.events?.emit('bim-tool-changed', { tool: 'wardrobe_cabinet' }); // F.events.8
    }

    deactivate(): void {
        if (!this._active) return;
        this._active = false;
        this._removePreview();
        this._detachListeners();
        window.runtime?.events?.emit('bim-tool-changed', { tool: null }); // F.events.8
    }

    // ── Preview ───────────────────────────────────────────────────────────────

    private _buildPreview(): void {
        this._removePreview();
        const scene = this._getScene();
        if (!scene) return;

        const group = new THREE.Group();
        const mat   = new THREE.MeshStandardMaterial({
            color: 0x8866ff, transparent: true, opacity: 0.35,
        });

        const cfg      = this._config;
        const len      = cfg.length;
        const dep      = cfg.depth;
        const ht       = cfg.height;
        const isTall   = isTallWardrobeLayout(cfg.layoutType);
        const topHt    = isTall ? (cfg.topModuleHeight ?? WARDROBE_CABINET_DEFAULTS.topModuleHeight ?? 0.40) : 0;
        const baseLayout = baseWardrobeLayout(cfg.layoutType);

        // Main arm box
        const mainMesh = new THREE.Mesh(new THREE.BoxGeometry(len, ht, dep), mat);
        mainMesh.position.set(0, ht / 2, 0);
        mainMesh.userData.isPreview = true;
        group.add(mainMesh);

        // Top module on main arm (tall only)
        if (isTall) {
            const topMesh = new THREE.Mesh(new THREE.BoxGeometry(len, topHt, dep), mat);
            topMesh.position.set(0, ht + topHt / 2, 0);
            topMesh.userData.isPreview = true;
            group.add(topMesh);
        }

        // Left arm (L / U)
        if (baseLayout !== 'wardrobe_straight') {
            const leftLen  = cfg.lengthLeft  ?? 1.20;
            const leftMesh = new THREE.Mesh(new THREE.BoxGeometry(dep, ht, leftLen), mat);
            leftMesh.position.set(-len / 2 + dep / 2, ht / 2, dep / 2 + leftLen / 2);
            leftMesh.userData.isPreview = true;
            group.add(leftMesh);
            if (isTall) {
                const topLeft = new THREE.Mesh(new THREE.BoxGeometry(dep, topHt, leftLen), mat);
                topLeft.position.set(-len / 2 + dep / 2, ht + topHt / 2, dep / 2 + leftLen / 2);
                topLeft.userData.isPreview = true;
                group.add(topLeft);
            }
        }

        // Right arm (U only)
        if (baseLayout === 'wardrobe_u_shape') {
            const rightLen  = cfg.lengthRight ?? 1.20;
            const rightMesh = new THREE.Mesh(new THREE.BoxGeometry(dep, ht, rightLen), mat);
            rightMesh.position.set(len / 2 - dep / 2, ht / 2, dep / 2 + rightLen / 2);
            rightMesh.userData.isPreview = true;
            group.add(rightMesh);
            if (isTall) {
                const topRight = new THREE.Mesh(new THREE.BoxGeometry(dep, topHt, rightLen), mat);
                topRight.position.set(len / 2 - dep / 2, ht + topHt / 2, dep / 2 + rightLen / 2);
                topRight.userData.isPreview = true;
                group.add(topRight);
            }
        }

        group.userData.isPreview = true;
        scene.add(group);
        this._preview = group;
    }

    private _rebuildPreview(): void {
        this._removePreview();
        this._buildPreview();
    }

    private _removePreview(): void {
        if (!this._preview) return;
        const scene = this._getScene();
        if (scene) scene.remove(this._preview);
        this._preview.traverse((obj: THREE.Object3D) => {
            if ((obj as THREE.Mesh).isMesh) {
                const m = obj as THREE.Mesh;
                if (!Array.isArray(m.geometry)) m.geometry.dispose();
            }
        });
        this._preview = null;
    }

    // ── Raycasting ────────────────────────────────────────────────────────────

    private _getHitPoint(e: PointerEvent): THREE.Vector3 | null {
        const canvas = (this._world.renderer as any)?.three?.domElement as HTMLCanvasElement | null;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        this._pointer.set(
            ((e.clientX - rect.left) / rect.width)  * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const camera = (this._world.camera as any)?.three as THREE.Camera | undefined;
        if (!camera) return null;
        this._raycaster.setFromCamera(this._pointer, camera);

        const levelElev = this._getLevelElevation();
        const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelElev);
        const target = new THREE.Vector3();
        this._raycaster.ray.intersectPlane(plane, target);
        return target.lengthSq() > 0 ? target : null;
    }

    private _getLevelElevation(): number {
        try {
            const bm = window.projectContext?.bimManager; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
            const lv = bm?.getActiveLevel?.();
            return typeof lv?.elevation === 'number' ? lv.elevation : 0;
        } catch { return 0; }
    }

    // ── Listeners ─────────────────────────────────────────────────────────────

    private _attachListeners(): void {
        const canvas = (this._world.renderer as any)?.three?.domElement as HTMLElement | null;
        if (!canvas) return;

        this._onPointerMove = (e: PointerEvent) => {
            const pt = this._getHitPoint(e);
            if (pt && this._preview) this._preview.position.copy(pt);
        };

        this._onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            const pt = this._getHitPoint(e);
            if (!pt) return;
            this._placeWardrobe(pt);
        };

        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.deactivate();
            if (e.key === 'r' || e.key === 'R') {
                if (this._preview) this._preview.rotation.y += Math.PI / 2;
            }
        };

        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerdown', this._onPointerDown);
        document.addEventListener('keydown',   this._onKeyDown);
    }

    private _detachListeners(): void {
        const canvas = (this._world.renderer as any)?.three?.domElement as HTMLElement | null;
        if (canvas) {
            if (this._onPointerMove) canvas.removeEventListener('pointermove', this._onPointerMove);
            if (this._onPointerDown) canvas.removeEventListener('pointerdown', this._onPointerDown);
        }
        if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
        this._onPointerMove = null;
        this._onPointerDown = null;
        this._onKeyDown     = null;
    }

    // ── Placement ─────────────────────────────────────────────────────────────

    private _placeWardrobe(position: THREE.Vector3): void {
        // P6 E.5.3: hard commandManager guard removed — placement flows through
        // window.runtime.bus.executeCommand('furniture.create') below (F-1.3).
        // _resolveLevelId still accepts a commandManager for context access but
        // falls back to window.bimManager / window.projectContext if null.
        const levelId = this._resolveLevelId(window.commandManager ?? null);
        if (!levelId) {
            console.error('[WardrobeCabinetTool] No valid level available for wardrobe placement');
            return;
        }

        const rotY = this._preview?.rotation.y ?? 0;

        const existing = this._config.sections ?? [];
        const sections = mergeSections(
            existing,
            this._config.numSections,
            this._config.numSectionsLeft  ?? 0,
            this._config.numSectionsRight ?? 0,
        );
        if (sections.length === 0) {
            sections.push(...buildDefaultSections(this._config.numSections, 'main'));
        }

        const cfg: WardrobeCabinetConfig = { ...this._config, sections };

        const id = newId();
        // [F-1.3] Bus-primary: commandManager exfiltrated to CreateFurnitureHandler (plugins/furniture).
        window.runtime?.bus?.executeCommand('furniture.create', {
            id,
            furnitureType:    this._config.layoutType as any,
            position:         { x: position.x, y: position.y, z: position.z },
            rotation:         { x: 0, y: rotY, z: 0, order: 'XYZ' },
            levelId,
            baseOffset:       0,
            width:            this._config.length,
            length:           this._config.depth,
            height:           this._config.height,
            material:         'wood',
            metadata:         {},
            furnitureCategory: 'bedroom',
            wardrobeCabinetConfig: cfg,
        } as any).catch((e: Error) => {
            console.error('[WardrobeCabinetTool] furniture.create failed:', e);
        });

        this.deactivate();
    }

    private _resolveLevelId(commandManager: any): string | null {
        const context = commandManager?.getContext?.();
        const managers = [
            context?.bimManager,
            window.bimManager, // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
            window.projectContext?.bimManager, // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
        ].filter(Boolean);

        const candidates = [
            window.projectContext?.activeLevelId, // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
            context?.projectContext?.activeLevelId,
            ...managers.map((bm: any) => bm?.getActiveLevel?.()?.id),
        ].filter((id): id is string => typeof id === 'string' && id.length > 0);

        for (const id of candidates) {
            if (managers.some((bm: any) => bm?.getLevelById?.(id))) return id;
        }

        for (const bm of managers) {
            const levels = bm?.getLevels?.() ?? [];
            const fallback = levels.find((level: any) => level?.id === 'L0') ?? levels[0];
            if (fallback?.id) {
                window.projectContext && (window.projectContext.activeLevelId = fallback.id); // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
                bm?.setActiveLevel?.(fallback.id);
                return fallback.id;
            }
        }

        return null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _getScene(): THREE.Scene | null {
        return (this._world.scene as any)?.three ?? null;
    }

    private _defaultConfig(layout: WardrobeLayoutType): WardrobeCabinetConfig {
        // Single source of truth shared with FurniturePlanToolHandler so the
        // 3D and plan-view placements produce identical wardrobe RUNs.
        return buildDefaultWardrobeCabinetConfig(layout);
    }
}
