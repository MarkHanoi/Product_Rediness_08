/**
 * @file KitchenCabinetTool.ts
 *
 * Placement tool for parametric kitchen cabinet runs.
 *
 * UI flow:
 *   1. User selects a layout (Straight / L / U) + sets parameters in the
 *      floating config panel (depth, length, height, numUnits, arm lengths).
 *   2. A ghost preview follows the cursor on the floor plane. The ghost is the
 *      REAL parametric run (KitchenCabinetEngine), not a bounding box, so it is
 *      the exact configured footprint + massing (§FEAT-KITCHEN-ACCURATE-PREVIEW).
 *   3. Each click places a cabinet run at the cursor position.
 *   4. The tool STAYS ARMED for continuous placement (§FIX-KITCHEN-SECOND-PLACE):
 *      after a commit it resets the SPACE yaw + rebuilds the ghost so the next
 *      click places another run. Esc / tool-switch deactivates. Users select
 *      individual units via the normal selection system + KitchenUnitInspector.
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
    buildDefaultUnits,
    mergeUnits,
    buildDefaultKitchenConfig,
    KitchenCabinetEngine,
} from '@pryzm/geometry-furniture';
import { createObjectPreviewMaterial } from '@pryzm/core-app-model';
// §FIX-PARAMETRIC-SPACE-ROTATE (ADR-0107 / §FEAT-PLACEMENT-SPACEBAR-ROTATE) —
// converge the parametric kitchen-run placement on the SAME shared SPACE-to-
// rotate state used by FurnitureTool / FurnitureDragDropHandler / the plan
// handlers, replacing the forked local "R" key. SPACE = +90° cumulative; the
// accumulated yaw is applied to the live ghost (onChange) AND committed on the
// furniture.create payload so preview orientation ≡ placed orientation.
import { PrePlacementRotation } from '@pryzm/core-app-model';

let _idCounter = 0;
/**
 * §FIX-KITCHEN-SECOND-PLACE (ADR-0112, founder L-33) — mint a UNIQUE id per run.
 * A monotonic counter (not just Date.now()) guarantees distinctness even for two
 * runs placed in the same millisecond — critical now the tool re-arms and a user
 * can place a second kitchen immediately after the first. Exported for testing.
 */
export function newKitchenRunId(): string { return `kitchen_${Date.now()}_${_idCounter++}`; }
const newId = newKitchenRunId;

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

    // §FEAT-KITCHEN-ACCURATE-PREVIEW (ADR-0112, founder L-34) — the ghost is the
    // REAL parametric run built by the SAME engine the committed geometry uses
    // (KitchenCabinetEngine), so the preview is the exact L/U/galley/single-wall
    // footprint + massing, never a bounding box. Single source of truth: preview
    // ≡ placed geometry by construction (they call the same `create(cfg)`).
    private readonly _engine = new KitchenCabinetEngine();

    // §FIX-PARAMETRIC-SPACE-ROTATE — cumulative +90°/SPACE-press yaw about
    // world-up. onChange re-orients the live ghost even when the pointer is
    // stationary. Installed via attach()/detach() on activate/deactivate so
    // SPACE never leaks after commit / Esc / tool-switch.
    private readonly _rotation = new PrePlacementRotation({
        onChange: () => this._applyPreviewRotation(),
    });

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
        // §FIX-PARAMETRIC-SPACE-ROTATE — start each session at 0° and install the
        // shared SPACE key handler (removed on deactivate → no leak). §FIX-
        // PLACEMENT-PREVIEW (L-20): the ghost is built here on activate — BEFORE
        // the first pointer-move/click — so the preview is visible immediately.
        this._rotation.reset();
        this._rotation.attach();
        this._buildPreview();
        this._attachListeners();
        window.runtime?.events?.emit('bim-tool-changed', { tool: 'kitchen_cabinet' }); // F.events.8
    }

    deactivate(): void {
        if (!this._active) return;
        this._active = false;
        // §FIX-PARAMETRIC-SPACE-ROTATE — remove SPACE handler + reset yaw.
        this._rotation.detach();
        this._rotation.reset();
        this._removePreview();
        this._detachListeners();
        window.runtime?.events?.emit('bim-tool-changed', { tool: null }); // F.events.8
    }

    // ── Preview ───────────────────────────────────────────────────────────────

    private _buildPreview(): void {
        this._removePreview();
        const scene = this._getScene();
        if (!scene) return;

        // §FEAT-KITCHEN-ACCURATE-PREVIEW (ADR-0112, founder L-34) — build the ghost
        // from the REAL engine that produces the committed run, then re-skin every
        // mesh with the shared preview material. The ghost is therefore the exact
        // configured footprint (main + left/right arms following the true L / U /
        // galley / single-wall / island shape) and massing — never a bounding box —
        // and it tracks the config live because _rebuildPreview() re-runs create().
        const cfg = this._buildEffectiveConfig();
        const group = this._engine.create(cfg);

        // Contract §41 §3.1 — Object Placement Preview Standard.
        // PRYZM purple #8B5CF6 @ 0.55 opacity, shared by every carousel ghost
        // (FurnitureTool, FurnitureDragDropHandler, PlumbingTool). One shared
        // instance across the whole ghost (disposed with the meshes' geometry in
        // _removePreview — the material itself is a shared singleton so we leave it).
        const mat = createObjectPreviewMaterial();
        group.traverse((obj: THREE.Object3D) => {
            const m = obj as THREE.Mesh;
            if (m.isMesh) {
                m.material = mat;
                m.castShadow = false;
                m.receiveShadow = false;
                m.userData.isPreview = true;
                // Never let the preview register as a pickable / plan element.
                m.userData.skipInPlan = true;
            }
        });

        group.userData.isPreview = true;
        // §FIX-PARAMETRIC-SPACE-ROTATE — carry the current SPACE yaw onto the
        // freshly-built ghost so a config change (rebuild) keeps the orientation.
        group.rotation.y = this._rotation.rotationY();
        scene.add(group);
        this._preview = group;
    }

    /**
     * §FEAT-KITCHEN-ACCURATE-PREVIEW / §FIX-KITCHEN-SECOND-PLACE — the single
     * canonical config used for BOTH the preview ghost and the committed run, so
     * they can never drift. Ensures the per-unit `units` array is populated to
     * match the current arm counts (the same normalisation _placeKitchen commits).
     */
    private _buildEffectiveConfig(): KitchenCabinetConfig {
        const existing = this._config.units ?? [];
        let units = mergeUnits(
            existing,
            this._config.numUnits,
            this._config.numUnitsLeft  ?? 0,
            this._config.numUnitsRight ?? 0,
            this._defaultFront,
        );
        if (units.length === 0) {
            units = buildDefaultUnits(this._config.numUnits, 'main', 0, this._defaultFront);
        }
        return { ...this._config, units };
    }

    private _rebuildPreview(): void {
        this._removePreview();
        this._buildPreview();
    }

    /**
     * §FIX-PARAMETRIC-SPACE-ROTATE — re-apply the current yaw to the live ghost
     * when SPACE is pressed while the pointer is stationary (PrePlacementRotation
     * onChange). Reuses the renderer's MANUAL-mode needsUpdate hook (no new rAF —
     * P3), guarded off the WebGPU/ShadowDepthTexture path.
     */
    private _applyPreviewRotation(): void {
        if (!this._preview) return;
        this._preview.rotation.y = this._rotation.rotationY();
        const renderer = this._world.renderer as any;
        if (renderer && renderer.mode === OBC.RendererMode.MANUAL && 'needsUpdate' in renderer && !window.pryzmCanvas) {
            renderer.needsUpdate = true;
        }
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

        // §FIX-PARAMETRIC-SPACE-ROTATE — Esc still deactivates here; the +90°
        // rotation is now handled by the shared PrePlacementRotation SPACE
        // listener (installed in activate()), so the forked local "R" key is
        // removed and rotation is consistent with every other placement flow.
        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.deactivate();
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

        // §FIX-PARAMETRIC-SPACE-ROTATE — read the accumulated yaw from the shared
        // PrePlacementRotation state (single source of truth) so the committed
        // run carries exactly the orientation the user chose via SPACE.
        const rotY = this._rotation.rotationY();

        // §FEAT-KITCHEN-ACCURATE-PREVIEW / §FIX-KITCHEN-SECOND-PLACE — commit the
        // SAME normalised config the ghost is built from (single source of truth).
        const cfg = this._buildEffectiveConfig();

        const id = newId();

        // [F-1.3] Bus-primary: commandManager exfiltrated to CreateFurnitureHandler (plugins/furniture).
        // §FIX-KITCHEN-SECOND-PLACE (ADR-0112, founder L-33) — `rotation` MUST be a
        // SCALAR yaw (radians): CreateFurnitureHandler.canExecute validates
        // `Number.isFinite(rotation)`, and the CommandBus THROWS `canExecute
        // rejected — rotation must be finite` for a { x, y, z } object. Passing the
        // Euler object silently rejected EVERY kitchen placement (the `.catch`
        // swallowed the throw while the tool still "deactivated" as if it had
        // placed), so no run was ever committed via this 3D path. Mirrors
        // FurniturePlanToolHandler / wardrobe-plan which already commit a scalar yaw.
        window.runtime?.bus?.executeCommand('furniture.create', {
            id,
            furnitureType:  this._config.layoutType as any,
            position:       { x: position.x, y: position.y, z: position.z },
            rotation:       rotY,
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

        // §FIX-KITCHEN-SECOND-PLACE — RE-ARM for continuous placement instead of
        // deactivating. Before: the tool called deactivate() after one commit, so a
        // SECOND kitchen could not be placed (listeners + ghost were torn down and
        // the parent's activeKitchenType wired via ToolManager was left stale, so a
        // subsequent floor-click did nothing until the user re-picked the carousel).
        // Now the tool stays armed: reset the SPACE yaw to 0° for the fresh run and
        // rebuild the ghost so it immediately follows the cursor for the next place.
        // Esc / tool-switch still deactivate() cleanly (unchanged).
        this._rotation.reset();
        this._rebuildPreview();
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
