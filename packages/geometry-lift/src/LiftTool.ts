/**
 * LiftTool — interactive placement tool for the vertical-circulation (lift)
 * element. §LIFT-CREATE-TOOL.
 *
 * Until now a lift (verticalCirculation) could only be created by the
 * residential-building generator. This tool lets the user place ONE lift with a
 * single click, exactly the way `ColumnTool` places a column and `StairTool`
 * spans levels:
 *   - activates from a toolbar button (Structure → Lift), via ToolManager;
 *   - shows a ghost shaft preview that follows the cursor (PreviewStyle purple);
 *   - on click, resolves base level = active level + top level = the level above
 *     (sorted by elevation); a single-level project falls back to a degenerate
 *     base===top cab (LiftMeshBuilder already supports that span — see
 *     CreateVerticalCirculationCommand §RESI-LIFT-TOP-CAB);
 *   - dispatches the EXISTING `CreateVerticalCirculationCommand` via the
 *     commandManager so it is ONE command = ONE undo (P6 — command-only mutation).
 *
 * Reuse, not reinvention: the create COMMAND, the LiftStore, the LiftTypeStore
 * and the LiftMeshBuilder are the same ones the residential executor drives. The
 * tool only assembles the command payload from a placement + the active level.
 *
 * P-rule compliance:
 *   - P2: THREE only via `@pryzm/renderer-three/three` (preview ghost geometry).
 *   - P4: no `(window as any)`; window globals are read through typed deps with a
 *     narrow `Record<string, unknown>` cast in `_resolve` (mirrors ColumnTool).
 *   - P6: the ONLY mutation is `commandManager.execute(createCommand(payload))`.
 *   - P8: `buildLiftCommandInput` (the new exported pure helper) emits a span.
 *
 * To avoid a static circular import (command-registry already imports
 * @pryzm/geometry-lift), the create-command CONSTRUCTOR is INJECTED via
 * `LiftToolDeps.createCommand`. The composition root (apps/editor initTools)
 * supplies `(input) => new CreateVerticalCirculationCommand(input)`.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import {
    PREVIEW_COLOR,
    createGhostBodyMaterial,
    tagPreview,
    disposePreviewObject,
} from '@pryzm/core-app-model';
import { LiftStore } from './LiftStore.js';
import { LiftTypeStore } from './LiftTypeStore.js';
import { LiftKind } from './LiftTypes.js';
import {
    buildLiftCommandInput,
    DEFAULT_KIND,
    DEFAULT_TYPE_ID,
    type LiftCommandInput,
    type LiftToolLevel,
} from './LiftToolPlacement.js';

/** A command-like object (subset of the command-registry `Command`). */
export interface LiftToolCommand {
    execute?: (...args: any[]) => any;
}

/**
 * §LIFT-CREATE-TOOL — lazy dependency resolvers, mirroring `ColumnToolDeps`.
 * Each entry is a getter so the bootstrap can register the tool BEFORE the
 * dependency is available; the getter resolves lazily at call time. Getters fall
 * back to their respective window globals where one exists.
 */
export interface LiftToolDeps {
    /** Build the (already-existing) CreateVerticalCirculationCommand. Injected to
     *  avoid a static command-registry import cycle. */
    createCommand: (input: LiftCommandInput) => LiftToolCommand;
    getCommandManager?: () => any;
    getLiftStore?: () => LiftStore | undefined;
    getLiftTypeStore?: () => LiftTypeStore | undefined;
    /** Active level id (where the shaft starts). Resolved at click time. */
    getActiveLevelId?: () => string | null | undefined;
    /** All project levels (for base→top span resolution). */
    getLevels?: () => LiftToolLevel[];
    getToolManager?: () => any;
    getCanvas?: () => any;
}

export class LiftTool {
    private world: OBC.World;
    private callbacks: any;
    private _deps: LiftToolDeps;
    private _isActive = false;
    private previewMesh: THREE.Object3D | null = null;
    private _disposed = false;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    // ── Placement state ──────────────────────────────────────────────────────
    private _kind: LiftKind = DEFAULT_KIND;
    private _typeId = DEFAULT_TYPE_ID;
    private _rotation = 0;

    constructor(world: OBC.World, callbacks: any, deps: LiftToolDeps) {
        this.world = world;
        this.callbacks = callbacks ?? {};
        this._deps = deps;
    }

    /** Late-bind for dependencies that resolve after construction. */
    public setDeps(deps: Partial<LiftToolDeps>): void {
        this._deps = { ...this._deps, ...deps };
    }

    /** Resolve a dependency: deps getter → window global → undefined. */
    private _resolve<T>(getter: keyof LiftToolDeps, globalName: string): T | undefined {
        const fn = this._deps[getter] as (() => T | undefined) | undefined;
        const v = fn?.();
        if (v !== undefined && v !== null) return v;
        return (window as unknown as Record<string, unknown>)[globalName] as T | undefined;
    }

    get isActive(): boolean {
        return this._isActive;
    }

    /** Configure the lift kind/type before placement (toolbar sub-menu hook). */
    setLiftType(config: { kind?: LiftKind; typeId?: string; rotation?: number }): void {
        if (config.kind) this._kind = config.kind;
        if (config.typeId) this._typeId = config.typeId;
        if (config.rotation != null) this._rotation = config.rotation;
        this.clearPreview();
    }

    activate(options?: { kind?: LiftKind; typeId?: string }): void {
        if (options) this.setLiftType(options);
        if (this._isActive) return;
        this._isActive = true;
        if (this.world.camera?.controls) this.world.camera.controls.enabled = false;
        this.attachListeners();
        this._escListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.deactivate();
                return;
            }
            if (e.key.toLowerCase() === 'r') {
                e.preventDefault();
                this.rotatePreview(Math.PI / 2);
            }
        };
        document.addEventListener('keydown', this._escListener);
    }

    deactivate(): void {
        if (!this._isActive) return;
        this._isActive = false;
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
        if (this.world.camera?.controls) this.world.camera.controls.enabled = true;
        this.detachListeners();
        this.clearPreview();

        const tm = this._resolve<any>('getToolManager', 'toolManager');
        if (tm) tm.currentTool = null;

        const canvas = this.world.renderer?.three.domElement;
        if (canvas) canvas.style.pointerEvents = 'auto';

        this.callbacks.onCancel?.();
        setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 100);
    }

    cleanup(): void { this.deactivate(); this.clearPreview(); }
    dispose(): void { if (this._disposed) return; this._disposed = true; this.cleanup(); }

    // ── Pointer events ───────────────────────────────────────────────────────

    private attachListeners(): void {
        const canvas = this.world.renderer?.three.domElement;
        if (!canvas) return;
        canvas.addEventListener('pointerdown', this.onPointerDown, true);
        canvas.addEventListener('pointermove', this.onPointerMove, true);
    }

    private detachListeners(): void {
        const canvas = this.world.renderer?.three.domElement;
        if (!canvas) return;
        canvas.removeEventListener('pointerdown', this.onPointerDown, true);
        canvas.removeEventListener('pointermove', this.onPointerMove, true);
    }

    private onPointerDown = (e: PointerEvent): void => {
        if (e.button !== 0) return;

        const point = this.getPoint(e);
        if (!point) return;

        const activeLevelId =
            this._resolve<string>('getActiveLevelId', '') ??
            this._resolve<LiftStore>('getLiftStore', 'liftStore')?.activeLevelId;
        if (!activeLevelId) {
            console.warn('[LiftTool] No active level selected for lift creation.');
            return;
        }

        const levels = this._deps.getLevels?.() ?? [];
        const input = buildLiftCommandInput(
            { x: point.x, y: point.y, z: point.z },
            activeLevelId,
            levels,
            { kind: this._kind, typeId: this._typeId, rotation: this._rotation },
        );

        const cm = this._resolve<any>('getCommandManager', 'commandManager');
        if (!cm) {
            console.error('[LiftTool] commandManager not available');
            return;
        }

        // P6 — the ONLY mutation path. One command = one undo.
        const command = this._deps.createCommand(input);
        const result = cm.execute(command);
        if (result && result.success === false) {
            console.error(
                '[LiftTool] CreateVerticalCirculationCommand failed:',
                result.info?.join(', ') ?? result.error ?? 'unknown error',
            );
            return;
        }

        const createdId = result?.affectedElementIds?.[0];
        if (createdId) {
            const mesh = elementRegistry.getRoot(createdId);
            if (mesh) {
                this.callbacks.applyHighlight?.(mesh);
                this.callbacks.updateInspector?.(mesh);
            }
        }

        const renderer = this.world.renderer as any;
        if (
            renderer &&
            renderer.mode === OBC.RendererMode.MANUAL &&
            'needsUpdate' in renderer &&
            !this._resolve<any>('getCanvas', 'pryzmCanvas')
        ) {
            renderer.needsUpdate = true;
        }
    };

    private onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        const point = this.getPoint(e);
        if (!point) return;
        this.updatePreview(point);
    };

    private getPoint(e: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer?.three.domElement;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);
        // Cast against the active level datum (mirror of ColumnTool.getPoint).
        const baseElev = this.getActiveLevelElevation();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -baseElev);
        const intersect = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, intersect)) return null;
        intersect.y = baseElev;
        return intersect;
    }

    private getActiveLevelElevation(): number {
        const activeLevelId =
            this._resolve<string>('getActiveLevelId', '') ??
            this._resolve<LiftStore>('getLiftStore', 'liftStore')?.activeLevelId;
        if (!activeLevelId) return 0;
        const levels = this._deps.getLevels?.() ?? [];
        return levels.find((l) => l.id === activeLevelId)?.elevation ?? 0;
    }

    private resolveShaftDims(): { width: number; depth: number } {
        const typeStore = this._resolve<LiftTypeStore>('getLiftTypeStore', 'liftTypeStore');
        const d = typeStore?.resolveDefaults(this._typeId);
        return { width: d?.shaftWidth ?? 1.8, depth: d?.shaftDepth ?? 1.8 };
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    private updatePreview(point: THREE.Vector3): void {
        if (!this.previewMesh) {
            this.previewMesh = this._buildPreviewMesh();
            this.world.scene.three.add(this.previewMesh);
        }
        this.previewMesh.position.set(point.x, point.y, point.z);
        this.previewMesh.rotation.y = this._rotation;
    }

    private _buildPreviewMesh(): THREE.Object3D {
        // §41 — PreviewStyle is the single source of truth: a lift shaft is a
        // point-placed volume → PREVIEW_COLOR.VOLUME (purple ghost body).
        const mat = createGhostBodyMaterial({ color: PREVIEW_COLOR.VOLUME });
        const { width, depth } = this.resolveShaftDims();
        // A nominal one-storey-tall shaft box so the preview reads as a shaft;
        // the committed mesh resolves its true span from the base→top elevations.
        const HEIGHT = 3;
        const geo = new THREE.BoxGeometry(width, HEIGHT, depth);
        geo.translate(0, HEIGHT / 2, 0);
        return tagPreview(new THREE.Mesh(geo, mat));
    }

    private clearPreview(): void {
        disposePreviewObject(this.previewMesh);
        this.previewMesh = null;
    }

    private rotatePreview(delta: number): void {
        const tau = Math.PI * 2;
        this._rotation = ((this._rotation + delta) % tau + tau) % tau;
        if (this.previewMesh) this.previewMesh.rotation.y = this._rotation;
    }
}
