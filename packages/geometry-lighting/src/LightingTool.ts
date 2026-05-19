/**
 * @file LightingTool.ts
 *
 * Click-to-place tool for parametric lighting fixtures.
 *
 * Placement rules:
 *  - Ceiling-mounted fixtures (pendant, downlight, linear_led, pendant_pebble,
 *    pendant_ceramic_bell, pendant_conical): raycasts onto ceiling / slab meshes;
 *    fallback to Y = levelCeilingHeight.
 *  - Floor-mounted fixtures (floor_wood_post, floor_arc_brass, floor_tripod_black):
 *    raycasts onto floor / slab-top meshes; fallback to Y = levelElevation.
 *  - Table/surface fixtures (table_terracotta): raycasts onto furniture / floor
 *    surfaces; fallback to Y = levelElevation.
 *  - ESC cancels active placement.
 *
 * Contract compliance:
 *  §01 §2   — all writes via events dispatched to EngineBootstrap listener.
 *  §01 §4   — builder NOT called here; only command event fired.
 *  §05      — no UI created here; tool is pure canvas interaction logic.
 *
 * Sprint AD (2026-05-12): extracted from src/engine/subsystems/lighting/
 * to packages/geometry-lighting/ per 47-EXTRACTION-SUBPHASES-5.1-5.2.md §8.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { LightingFixtureType, FLOOR_MOUNTED_FIXTURES } from '@pryzm/core-app-model';
import { LightingStore } from './LightingStore.js';
import { LightingFragmentBuilder } from './LightingFragmentBuilder.js';
import { CreateLightingCommand } from '@pryzm/command-registry';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class LightingTool {

    private _active = false;
    private _fixtureType: LightingFixtureType = 'downlight';
    private _previewGroup: THREE.Group | null = null;

    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onKeyDown:     ((e: KeyboardEvent) => void) | null = null;

    private readonly _raycaster = new THREE.Raycaster();
    private readonly _pointer   = new THREE.Vector2();

    constructor(
        private readonly _world:   OBC.World,
        private readonly _store:   LightingStore,
        private readonly _builder: LightingFragmentBuilder,
    ) {}

    get active(): boolean { return this._active; }

    setFixtureType(type: LightingFixtureType): void {
        this._fixtureType = type;
        // Mirror to plan-view tool (LightingPlanToolHandler reads this flag)
        window._pryzmActiveLightingType = type;
        if (this._active) {
            this._removePreview();
            this._createPreview();
        }
    }

    activate(): void {
        if (this._active) return;
        this._active = true;
        this._createPreview();
        this._attachListeners();
        _bus.emit('bim-tool-changed', { tool: 'lighting' }); // F.events.18
    }

    deactivate(): void {
        if (!this._active) return;
        this._active = false;
        this._removePreview();
        this._detachListeners();
        _bus.emit('bim-tool-changed', { tool: null }); // F.events.18
    }

    // ── Preview mesh ─────────────────────────────────────────────────────────

    private _createPreview(): void {
        this._removePreview();
        const isFloor = FLOOR_MOUNTED_FIXTURES.has(this._fixtureType);
        const geo = isFloor
            ? new THREE.CylinderGeometry(0.15, 0.15, 0.04, 16)  // flat disc for floor lamps
            : new THREE.CylinderGeometry(0.065, 0.065, 0.12, 16); // canister for ceiling
        const mat = new THREE.MeshStandardMaterial({
            color: 0x00ccff,
            transparent: true,
            opacity: 0.45,
            wireframe: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isPreview = true;
        const group = new THREE.Group();
        group.add(mesh);
        mesh.position.y = isFloor ? 0.02 : -0.06;

        const scene = (this._world.scene as any)?.three as THREE.Scene | undefined;
        if (scene) scene.add(group);
        this._previewGroup = group;
    }

    private _removePreview(): void {
        if (!this._previewGroup) return;
        const scene = (this._world.scene as any)?.three as THREE.Scene | undefined;
        if (scene) scene.remove(this._previewGroup);
        this._previewGroup.traverse((obj: THREE.Object3D) => {
            if ((obj as THREE.Mesh).isMesh) {
                const m = obj as THREE.Mesh;
                if (!Array.isArray(m.geometry)) m.geometry.dispose();
                if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
                else (m.material as THREE.Material).dispose();
            }
        });
        this._previewGroup = null;
    }

    // ── Raycasting ───────────────────────────────────────────────────────────

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

        const isFloor = FLOOR_MOUNTED_FIXTURES.has(this._fixtureType);
        const scene = (this._world.scene as any)?.three as THREE.Scene | undefined;

        if (scene) {
            const targets: THREE.Object3D[] = [];
            scene.traverse((obj: THREE.Object3D) => {
                if (!(obj as THREE.Mesh).isMesh || obj.userData.isPreview) return;
                const et = obj.userData.elementType as string | undefined;
                if (isFloor) {
                    // Floor lamps: hit floor, slab-top, or furniture surfaces
                    if (et === 'floor' || et === 'slab' || et === 'furniture') targets.push(obj);
                } else {
                    // Ceiling lamps: hit ceiling or slab-underside
                    if (et === 'ceiling' || et === 'slab') targets.push(obj);
                }
            });
            if (targets.length > 0) {
                const hits = this._raycaster.intersectObjects(targets, false);
                if (hits.length > 0) return hits[0].point.clone();
            }
        }

        // Fallback horizontal planes
        const planeY = isFloor
            ? this._getLevelFloorElevation()
            : this._getLevelCeilingHeight();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        const target = new THREE.Vector3();
        this._raycaster.ray.intersectPlane(plane, target);
        return target.y !== undefined ? target : null;
    }

    private _getLevelCeilingHeight(): number {
        try {
            const bm = window.projectContext?.bimManager;
            const level = bm?.getActiveLevel?.();
            if (level) {
                const elev = typeof level.elevation === 'number' ? level.elevation : 0;
                const ht   = typeof level.height    === 'number' ? level.height    : 3.0;
                return elev + ht;
            }
        } catch { /* ignore */ }
        return 3.0;
    }

    private _getLevelFloorElevation(): number {
        try {
            const bm = window.projectContext?.bimManager;
            const level = bm?.getActiveLevel?.();
            if (level && typeof level.elevation === 'number') {
                return level.elevation;
            }
        } catch { /* ignore */ }
        return 0.0;
    }

    // ── Event listeners ──────────────────────────────────────────────────────

    private _attachListeners(): void {
        const canvas = (this._world.renderer as any)?.three?.domElement as HTMLElement | null;
        if (!canvas) return;

        this._onPointerMove = (e: PointerEvent) => {
            if (!this._previewGroup) return;
            const pt = this._getHitPoint(e);
            if (pt) this._previewGroup.position.copy(pt);
        };

        this._onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            const pt = this._getHitPoint(e);
            if (!pt) return;
            this._placeLighting(pt);
        };

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

    // ── Placement ────────────────────────────────────────────────────────────

    private _placeLighting(position: THREE.Vector3): void {
        const pc = window.projectContext;
        const bm = pc?.bimManager ?? window.bimManager;
        const levels: any[] = bm?.getLevels?.() ?? bm?.getAllLevels?.() ?? [];
        const resolvedLevelId: string | null =
            pc?.activeLevelId
            ?? bm?.getActiveLevel?.()?.id
            ?? levels.find((l: any) => l?.isActive)?.id
            ?? levels[0]?.id
            ?? null;

        if (!resolvedLevelId) {
            console.error('[LightingTool] No active level — cannot place fixture. Create or activate a level first.');
            return;
        }
        const levelId: string = resolvedLevelId;

        const cm = window.commandManager; // TODO(TASK-06)
        if (cm) {
            const result = cm.execute(new CreateLightingCommand({
                fixtureType: this._fixtureType,
                position: { x: position.x, y: position.y, z: position.z },
                levelId,
            }));
            if (!result?.success) {
                console.error('[LightingTool] CreateLightingCommand failed:',
                    result?.info?.join(', ') ?? result?.error ?? 'unknown error');
            }
            return;
        }

        // Fallback (commandManager not yet attached): direct write.
        // Contract 45 §7.1 — UUID for collision-free element IDs. The legacy
        // `light_${Date.now()}_${rand36(6)}` scheme could collide when two
        // fixtures were placed within the same millisecond, causing the
        // store to silently overwrite the older entry.
        const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const id = `light_${uuid}`;
        this._store.add({
            id, type: 'lighting', levelId,
            fixtureType: this._fixtureType,
            position: { x: position.x, y: position.y, z: position.z },
        });
        this._builder.add(this._store.get(id)!);
        try { if (bm && levelId !== 'default') bm.registerElement(id, levelId); } catch { /* ignore */ }
        _bus.emit('bim-lighting-placed', { id, fixtureType: this._fixtureType }); // F.events.18
    }
}
