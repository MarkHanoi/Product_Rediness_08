/**
 * StairPath3DToolHandler — sketch the modern polyline stair (I / L / U / curved)
 * directly in the 3D view, on the active level's ground plane.
 *
 * SPEC-STAIR-3D-CREATION (2026-05-22). Stair creation used to be plan-only
 * because the StairPathToolController's only view coupling was
 * `PlanViewCanvas.worldToScreen`. With that abstracted behind
 * `StairSketchCoordinateProvider` (§3 S1), this handler supplies a 3D provider
 * (project through the perspective camera) and forwards canvas pointer events as
 * world points resolved by a ground-plane raycast — exactly the slab/floor 3D
 * pattern (SlabTool.getPlanPoint, StairTool._getWorldPoint). Commit is the SAME
 * CreateStairCommand the plan path uses, so geometry, auto-opening, railings,
 * persistence and undo are identical (§3 S4).
 *
 * THREE is reached via the sanctioned `@pryzm/renderer-three/three` facade
 * (P2 — the same import StairTool/geometry packages already use).
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    StairPathToolController,
    type StairSketchCoordinateProvider,
    type StairLevelOption,
} from '@pryzm/geometry-stair';

/** The minimal slice of the OBC `world` this handler reads (resolved live). */
interface World3DRefs {
    camera: { three: THREE.Camera };
    scene: { three: THREE.Object3D };
    renderer: { three: { domElement: HTMLCanvasElement } };
}

interface StairPath3DDeps {
    /** The live OBC world — camera/canvas read at activate() time. */
    getWorld: () => World3DRefs | null | undefined;
    /**
     * CommandManager for CreateStairCommand dispatch (StairPathToolController).
     * Method syntax (not an arrow property) so the concrete `CommandManager`
     * — whose `execute` takes a specific Command type — is assignable here
     * (method parameters are checked bivariantly).
     */
    commandManager: { execute(cmd: unknown): void };
    /** Resolve the active level id (base of the stair). */
    getActiveLevelId: () => string | null | undefined;
    /** Level catalogue accessor (sorted ascending by elevation is NOT required). */
    getLevels: () => Array<{ id: string; name?: string; label?: string; elevation?: number; height?: number }>;
}

export class StairPath3DToolHandler {
    private _ctrl: StairPathToolController | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onDblClick:    ((e: MouseEvent) => void) | null = null;
    private _onContextMenu: ((e: MouseEvent) => void) | null = null;

    constructor(private _deps: StairPath3DDeps) {}

    /** True when the handler currently owns an active controller. */
    get active(): boolean { return this._ctrl !== null; }

    activate(shape?: 'I' | 'L' | 'U'): boolean {
        // Re-entrancy guard — destroy any prior controller first.
        this.deactivate();

        const world = this._deps.getWorld();
        if (!world) {
            console.error('[StairPath3DToolHandler] no 3D world available');
            return false;
        }
        const camera = world.camera.three;
        const canvas = world.renderer.three.domElement;
        this._canvas = canvas;

        const lvl = this._resolveStairLevels();
        if (!lvl) {
            console.error('[StairPath3DToolHandler] could not resolve two levels for stair');
            return false;
        }

        const groundY = lvl.baseLevelElevation;

        // 3D coordinate provider — project world XZ on the ground plane through
        // the perspective camera into canvas-local px for the overlay polyline.
        // The overlay canvas is sized to the 3D canvas rect, so canvas-local px
        // (0..width / 0..height) is the correct space.
        const provider: StairSketchCoordinateProvider = {
            worldToScreen: (x: number, z: number) => {
                const v = new THREE.Vector3(x, groundY, z);
                v.project(camera);                       // → NDC (-1..1)
                const rect = canvas.getBoundingClientRect();
                return {
                    sx: (v.x * 0.5 + 0.5) * rect.width,
                    sy: (-v.y * 0.5 + 0.5) * rect.height,
                };
            },
        };

        this._ctrl = new StairPathToolController({
            container:          document.body,
            coordinateCanvas:   canvas,             // overlay aligns to the 3D viewport
            coordinateProvider: provider,
            commandManager:     this._deps.commandManager,
            baseLevelId:        lvl.baseLevelId,
            topLevelId:         lvl.topLevelId,
            baseLevelElevation: lvl.baseLevelElevation,
            topLevelElevation:  lvl.topLevelElevation,
            levelOptions:       lvl.levels,
            width:              1.2,
            turnDirection:      'left',
            secondRunSide:      'left',
            initialShape:       shape,
            onCancel: () => this.deactivate(),
            onComplete: () => this.deactivate(),
        });
        this._ctrl.activate();

        this._bindPointerEvents(camera, canvas, groundY);

        // Parity with the plan handler — expose the public API global so the
        // ribbon param relays (window.stairPathTool.updateParams) still work.
        window.stairPathTool = this._getPublicApi();
        window.runtime?.events?.emit('stair-path-tool:activated', {});
        console.log(`[StairPath3DToolHandler] activated in 3D (shape=${shape ?? 'free'}, groundY=${groundY})`);
        return true;
    }

    deactivate(): void {
        if (this._canvas) {
            if (this._onPointerDown) this._canvas.removeEventListener('pointerdown', this._onPointerDown);
            if (this._onPointerMove) this._canvas.removeEventListener('pointermove', this._onPointerMove);
            if (this._onDblClick)    this._canvas.removeEventListener('dblclick',    this._onDblClick);
            if (this._onContextMenu) this._canvas.removeEventListener('contextmenu', this._onContextMenu);
        }
        this._onPointerDown = this._onPointerMove = null;
        this._onDblClick = this._onContextMenu = null;
        this._canvas = null;

        if (this._ctrl) {
            this._ctrl.deactivate();
            this._ctrl.destroy();
            this._ctrl = null;
        }
        if (window.stairPathTool) window.stairPathTool = undefined;
        window.runtime?.events?.emit('stair-path-tool:deactivated', {});
    }

    // ── Pointer → world (ground-plane raycast) ────────────────────────────────

    private _bindPointerEvents(camera: THREE.Camera, canvas: HTMLCanvasElement, groundY: number): void {
        const raycaster = new THREE.Raycaster();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);

        const toWorld = (e: MouseEvent): { x: number; z: number } | null => {
            const rect = canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1,
            );
            raycaster.setFromCamera(ndc, camera);
            const target = new THREE.Vector3();
            // intersectPlane returns null when the ray is parallel/behind — honour it.
            return raycaster.ray.intersectPlane(plane, target) ? { x: target.x, z: target.z } : null;
        };

        this._onPointerMove = (e: PointerEvent) => {
            const p = toWorld(e);
            if (p) this._ctrl?.feedMove(p.x, p.z);
        };
        this._onPointerDown = (e: PointerEvent) => {
            if (e.button === 2) return;          // right-click handled by contextmenu
            const p = toWorld(e);
            if (p) this._ctrl?.feedClick(p.x, p.z);
        };
        this._onDblClick = (e: MouseEvent) => {
            const p = toWorld(e);
            if (p) this._ctrl?.feedDoubleClick(p.x, p.z);
        };
        this._onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            this._ctrl?.feedRightClick();
        };

        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('dblclick',    this._onDblClick);
        canvas.addEventListener('contextmenu', this._onContextMenu);
    }

    private _getPublicApi() {
        const ctrl = this._ctrl;
        return {
            get state() { return ctrl?.state ?? 'idle'; },
            activate:     () => ctrl?.activate?.(),
            deactivate:   () => ctrl?.deactivate?.(),
            updateParams: (p: Parameters<StairPathToolController['updateParams']>[0]) =>
                ctrl?.updateParams(p),
        };
    }

    // ── Level resolution (base = active level; top = adjacent above) ──────────

    private _resolveStairLevels(): {
        baseLevelId: string;
        topLevelId: string;
        baseLevelElevation: number;
        topLevelElevation: number;
        levels: StairLevelOption[];
    } | null {
        const raw = this._deps.getLevels();
        if (!raw || raw.length < 2) return null;

        const sorted = [...raw].sort(
            (a, b) => (a.elevation ?? a.height ?? 0) - (b.elevation ?? b.height ?? 0),
        );
        const levels: StairLevelOption[] = sorted.map((l, i) => ({
            id:        String(l.id),
            name:      String(l.name ?? l.label ?? `Level ${i + 1}`),
            elevation: Number(l.elevation ?? l.height ?? 0),
        }));

        const activeId = this._deps.getActiveLevelId() ?? levels[0]?.id ?? '';
        let baseIdx = levels.findIndex(l => l.id === activeId);
        if (baseIdx < 0) baseIdx = 0;
        // If the active level is the topmost, drop one so base < top stays valid.
        if (baseIdx >= levels.length - 1) baseIdx = levels.length - 2;

        const base = levels[baseIdx];
        const top  = levels[baseIdx + 1];
        if (!base || !top) return null;

        return {
            baseLevelId:        base.id,
            topLevelId:         top.id,
            baseLevelElevation: base.elevation,
            topLevelElevation:  top.elevation,
            levels,
        };
    }
}
