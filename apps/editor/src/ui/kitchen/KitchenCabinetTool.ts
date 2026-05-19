/**
 * @file KitchenCabinetTool.ts
 *
 * Placement tool for parametric kitchen cabinet runs.
 *
 * UI flow:
 *   1. User selects a layout (Straight / L / U) + sets parameters in the
 *      floating config panel (depth, length, height, numUnits, arm lengths).
 *   2. A ghost preview follows the cursor on the floor plane.
 *   3. First click places the cabinet run at the cursor position.
 *   4. After placement, the tool deactivates; user can select individual
 *      units via the normal selection system + KitchenUnitInspector.
 *
 * Contract:
 *  §01 §2  — all writes via command pipeline (undo/redo + store event).
 *  §01 §4  — builder NOT called here; dispatch triggers FurnitureFragmentBuilder.
 *  §05 §6  — no bim-* elements.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import {
    KitchenLayoutType,
    KitchenCabinetConfig,
    KitchenUnitFront,
    KITCHEN_DEFAULTS,
    buildDefaultUnits,
    mergeUnits,
    buildDefaultKitchenConfig,
} from '@pryzm/geometry-furniture';
import { createObjectPreviewMaterial } from '@pryzm/core-app-model';

let _idCounter = 0;
function newId(): string { return `kitchen_${Date.now()}_${_idCounter++}`; }

// ── KitchenCabinetTool ────────────────────────────────────────────────────────

export class KitchenCabinetTool {

    private _active    = false;
    private _config: KitchenCabinetConfig;
    private _defaultFront: KitchenUnitFront = 'door';
    private _preview: THREE.Group | null = null;

    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onKeyDown:     ((e: KeyboardEvent) => void) | null = null;

    private readonly _raycaster = new THREE.Raycaster();
    private readonly _pointer   = new THREE.Vector2();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _world:   OBC.World,
        _store:   any,   // FurnitureStore (duck-typed to avoid circular),
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this._config = this._defaultConfig('kitchen_straight');
    }

    get active(): boolean { return this._active; }

    /**
     * Set the default front type applied to every cabinet unit. Existing per-unit
     * overrides are preserved by merging — only units that still match the previous
     * default are bulk-updated. New units created from this point on will use the new front.
     */
    setDefaultFront(front: KitchenUnitFront): void {
        const previous = this._defaultFront;
        this._defaultFront = front;
        const units = (this._config.units ?? []).map(u => (
            u.front === previous ? { ...u, front } : u
        ));
        this._config = { ...this._config, units };
        if (this._active) this._rebuildPreview();
    }

    setLayout(layout: KitchenLayoutType): void {
        const defaults = this._defaultConfig(layout);
        this._config = {
            ...defaults,
            depth: this._config.depth,
            length: this._config.length,
            height: this._config.height,
            numUnits: this._config.numUnits,
            carcassColor: this._config.carcassColor,
            frontColor: this._config.frontColor,
            countertopColor: this._config.countertopColor,
            countertopMaterialId: this._config.countertopMaterialId,
            handleColor: this._config.handleColor,
            layoutType: layout,
            units: mergeUnits(
                this._config.units ?? defaults.units ?? [],
                this._config.numUnits,
                defaults.numUnitsLeft ?? 0,
                defaults.numUnitsRight ?? 0,
                this._defaultFront,
            ),
        };
        if (this._active) this._rebuildPreview();
    }

    updateConfig(patch: Partial<KitchenCabinetConfig>): void {
        this._config = { ...this._config, ...patch };
        // Rebuild units array to match new counts
        const existing = this._config.units ?? [];
        this._config = {
            ...this._config,
            units: mergeUnits(
                existing,
                this._config.numUnits,
                this._config.numUnitsLeft  ?? 0,
                this._config.numUnitsRight ?? 0,
                this._defaultFront,
            ),
        };
        if (this._active) this._rebuildPreview();
    }

    activate(): void {
        if (this._active) return;
        this._active = true;
        this._buildPreview();
        this._attachListeners();
        window.runtime?.events?.emit('bim-tool-changed', { tool: 'kitchen_cabinet' }); // F.events.8
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
        // Contract §41 §3.1 — Object Placement Preview Standard.
        // PRYZM purple #8B5CF6 @ 0.55 opacity, shared by every carousel ghost
        // (FurnitureTool, FurnitureDragDropHandler, PlumbingTool).
        const mat = createObjectPreviewMaterial();

        const cfg = this._config;
        const len = cfg.length;
        const dep = cfg.depth;
        const ht  = cfg.height;

        // Main arm box
        const mainGeo = new THREE.BoxGeometry(len, ht, dep);
        const mainMesh = new THREE.Mesh(mainGeo, mat);
        mainMesh.position.set(0, ht / 2, 0);
        mainMesh.userData.isPreview = true;
        group.add(mainMesh);

        // Left arm (L / U)
        if (cfg.layoutType !== 'kitchen_straight') {
            const leftLen = cfg.lengthLeft ?? KITCHEN_DEFAULTS.depth * 2;
            const leftGeo = new THREE.BoxGeometry(dep, ht, leftLen);
            const leftMesh = new THREE.Mesh(leftGeo, mat);
            leftMesh.position.set(-len / 2 + dep / 2, ht / 2, leftLen / 2 + dep / 2);
            leftMesh.userData.isPreview = true;
            group.add(leftMesh);
        }

        // Right arm (U)
        if (cfg.layoutType === 'kitchen_u_shape') {
            const rightLen = cfg.lengthRight ?? KITCHEN_DEFAULTS.depth * 2;
            const rightGeo = new THREE.BoxGeometry(dep, ht, rightLen);
            const rightMesh = new THREE.Mesh(rightGeo, mat);
            rightMesh.position.set(len / 2 - dep / 2, ht / 2, rightLen / 2 + dep / 2);
            rightMesh.userData.isPreview = true;
            group.add(rightMesh);
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
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelElev);
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
            this._placeKitchen(pt);
        };

        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.deactivate();
            if (e.key === 'r' || e.key === 'R') {
                if (this._preview) this._preview.rotation.y += Math.PI / 2;
            }
        };

        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerdown', this._onPointerDown);
        document.addEventListener('keydown',    this._onKeyDown);
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

    private _placeKitchen(position: THREE.Vector3): void {
        const commandManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        if (!commandManager) {
            console.error('[KitchenCabinetTool] commandManager not available');
            return;
        }

        const levelId = this._resolveLevelId(commandManager);
        if (!levelId) {
            console.error('[KitchenCabinetTool] No valid level available for kitchen placement');
            return;
        }

        const rotY = this._preview?.rotation.y ?? 0;

        // Ensure units array is properly populated
        const existing = this._config.units ?? [];
        const units = mergeUnits(
            existing,
            this._config.numUnits,
            this._config.numUnitsLeft  ?? 0,
            this._config.numUnitsRight ?? 0,
            this._defaultFront,
        );
        if (units.length === 0) {
            // Bootstrap defaults
            const def = buildDefaultUnits(this._config.numUnits, 'main', 0, this._defaultFront);
            units.push(...def);
        }

        const cfg: KitchenCabinetConfig = { ...this._config, units };

        const id = newId();

        // [F-1.3] Bus-primary: commandManager exfiltrated to CreateFurnitureHandler (plugins/furniture).
        window.runtime?.bus?.executeCommand('furniture.create', {
            id,
            furnitureType:  this._config.layoutType as any,
            position:       { x: position.x, y: position.y, z: position.z },
            rotation:       { x: 0, y: rotY, z: 0, order: 'XYZ' },
            levelId,
            baseOffset:     0,
            width:          this._config.length,
            length:         this._config.depth,
            height:         this._config.height,
            material:       'wood',
            metadata:       {},
            furnitureCategory: 'kitchen',
            kitchenConfig:  cfg,
        } as any).catch((e: Error) => {
            console.error('[KitchenCabinetTool] furniture.create failed:', e);
        });
        const result = { success: true }; // [F-1.3] kept for downstream compat; bus dispatches async.

        if (!result?.success) {
            console.error('[KitchenCabinetTool] CreateFurnitureCommand failed: (bus error above)');
            return;
        }

        this.deactivate();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _getScene(): THREE.Scene | null {
        return (this._world.scene as any)?.three ?? null;
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

    private _defaultConfig(layout: KitchenLayoutType): KitchenCabinetConfig {
        // Single source of truth shared with FurniturePlanToolHandler so the
        // 3D and plan-view placements produce identical cabinet RUNs.
        return buildDefaultKitchenConfig(layout, this._defaultFront);
    }
}
