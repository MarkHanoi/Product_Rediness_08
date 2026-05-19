import * as THREE from '@pryzm/renderer-three/three';
import { StairCreationController, StairCreationPhase } from './StairCreationController';
import { StairMeshBuilder } from './StairMeshBuilder';
import { StairShape } from './StairTypes';
import { StairToolDependencies } from './StairToolDependencies';
import { ToolName, ToolState } from '@pryzm/core-app-model';
import { CreateStairCommand, type CreateStairInput } from '@pryzm/command-registry';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// ── Placement HUD messages ───────────────────────────────────────────────────
const HUD_MSGS: Record<StairCreationPhase, string> = {
    [StairCreationPhase.StartPoint]:   'Click to place stair start point',
    [StairCreationPhase.FirstFlight]:  'Move mouse to set direction · Click to confirm',
    [StairCreationPhase.FirstLanding]: 'Click to place landing',
    [StairCreationPhase.SecondFlight]: 'Click to confirm second flight',
    [StairCreationPhase.Complete]:     '',
};

export class StairTool {
    // V-16 fix: 'stair' is a valid ToolName — no 'as any' needed
    public readonly name: ToolName = 'stair';
    private _active = false;
    private controller: StairCreationController | null = null;
    private container: HTMLElement;
    private meshBuilder: StairMeshBuilder;
    private deps: StairToolDependencies;

    private _hud: HTMLElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;

    // V-18 fix: stored bound handlers so they can be removed on deactivate
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;

    constructor(container: HTMLElement, meshBuilder: StairMeshBuilder, deps: StairToolDependencies) {
        this.container = container;
        this.meshBuilder = meshBuilder;
        this.deps = deps;
        this._bindListeners();
        console.log('[StairTool] Constructed. meshBuilder:', !!meshBuilder, 'deps:', !!deps);
    }

    get active() {
        return this._active;
    }

    get toolState() {
        return this._active ? ToolState.DRAWING : ToolState.IDLE;
    }

    activate(config: {
        shape: StairShape;
        baseLevelElevation: number;
        topLevelElevation: number;
        baseLevelId: string;
        topLevelId: string;
        width?: number;
        typeId?: string;
        mode?: 'linear' | 'ortho';
    }) {
        console.log('[StairTool] Activating with config:', config);
        this._active = true;

        // §STAIR-AUDIT-2026 F8 fix (FIXED 2026-04-25): pass a live elevation
        // provider so a level inserted/edited/deleted during placement is
        // reflected on the next preview tick (no stale primitive snapshot).
        const baseLevelId = config.baseLevelId;
        const topLevelId  = config.topLevelId;
        const baseFallback = config.baseLevelElevation;
        const topFallback  = config.topLevelElevation;
        const elevationProvider = () => {
            const bm: any = this.deps.bimManager;
            if (bm && typeof bm.getLevelById === 'function') {
                const baseLevel = bm.getLevelById(baseLevelId);
                const topLevel  = bm.getLevelById(topLevelId);
                return {
                    base: baseLevel?.elevation ?? baseFallback,
                    top:  topLevel?.elevation  ?? topFallback,
                };
            }
            return { base: baseFallback, top: topFallback };
        };

        this.controller = new StairCreationController(
            this.meshBuilder,
            config.baseLevelElevation,
            config.topLevelElevation,
            elevationProvider,
        );
        this.controller.setShape(config.shape);
        this.controller.setBaseLevelId(config.baseLevelId);
        this.controller.setTopLevelId(config.topLevelId);
        if (config.width != null) {
            this.controller.setWidth(config.width);
        }
        if (config.typeId != null) {
            this.controller.setTypeId(config.typeId);
        }
        if (config.mode != null) {
            this.controller.setDrawingMode(config.mode);
        }

        this._showHud(StairCreationPhase.StartPoint);
        this._registerEsc();

        _bus.emit('tool:activated', { toolId: this.name }); // F.events.18
    }

    deactivate() {
        this._active = false;
        if (this.controller) {
            this.controller.reset();
        }
        this.controller = null;
        this._removeHud();
        this._unregisterEsc();
        _bus.emit('tool:deactivated', { toolId: this.name }); // F.events.18
    }

    // V-18 fix: pointerdown + pointermove instead of mousedown + mousemove
    private _bindListeners() {
        this._onPointerDown = (e: PointerEvent) => {
            if (!this._active || !this.controller) return;

            if (e.button === 2) {
                this.deactivate();
                return;
            }

            const point = this._getWorldPoint(e);
            if (!point) return;

            const state = this.controller.getPhase();
            if (state === StairCreationPhase.StartPoint) {
                this.controller.onFirstClick(point);
                this._showHud(StairCreationPhase.FirstFlight);
            } else if (state === StairCreationPhase.FirstFlight || state === StairCreationPhase.SecondFlight) {
                this.controller.onConfirm();
                const nextState = this.controller.getPhase();
                if (nextState === StairCreationPhase.Complete) {
                    this._finish();
                } else {
                    this._showHud(nextState);
                }
            }
        };

        this._onPointerMove = (e: PointerEvent) => {
            if (!this._active || !this.controller) return;
            const point = this._getWorldPoint(e);
            if (!point) return;
            this.controller.onMouseMove(point);
        };

        this.container.addEventListener('pointerdown', this._onPointerDown);
        this.container.addEventListener('pointermove', this._onPointerMove);
    }

    // ── Placement guidance HUD ───────────────────────────────────────────────

    private _showHud(phase: StairCreationPhase): void {
        this._removeHud();
        const msg = HUD_MSGS[phase];
        if (!msg) return;

        const bar = document.createElement('div');
        bar.className = 'sth-bar';

        const icon = document.createElement('span');
        icon.className = 'sth-icon';
        icon.textContent = '⌖';

        const txt = document.createElement('span');
        txt.className = 'sth-msg';
        txt.textContent = msg;

        const escKey = document.createElement('span');
        escKey.className = 'sth-key';
        escKey.textContent = 'ESC  cancel';

        bar.appendChild(icon);
        bar.appendChild(txt);
        bar.appendChild(escKey);
        document.body.appendChild(bar);
        this._hud = bar;
    }

    private _removeHud(): void {
        if (this._hud) {
            this._hud.remove();
            this._hud = null;
        }
    }

    // ── ESC cancellation ─────────────────────────────────────────────────────

    private _registerEsc(): void {
        this._unregisterEsc();
        this._escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this._active) {
                console.log('[StairTool] ESC — cancelling stair placement');
                this.deactivate();
            }
        };
        document.addEventListener('keydown', this._escHandler, { capture: true });
    }

    private _unregisterEsc(): void {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler, { capture: true });
            this._escHandler = null;
        }
    }

    // ── Pointer → world coordinate ───────────────────────────────────────────

    private _getWorldPoint(e: PointerEvent): THREE.Vector3 | null {
        const camera = this.deps.camera;
        const scene = this.deps.scene;

        if (camera && scene) {
            const rect = this.container.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            const basePlaneY = this.controller
                ? (this.deps as any).baseLevelElevation ?? 0
                : 0;
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -basePlaneY);
            const target = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, target)) {
                return target;
            }

            const intersects = raycaster.intersectObjects(scene.children, true);
            if (intersects.length > 0) {
                return intersects[0].point;
            }
        }

        return null;
    }

    private async _finish() {
        if (!this.controller) return;

        const state = this.controller.getPhase();
        if (state !== StairCreationPhase.Complete) {
            console.warn('[StairTool] _finish() called but phase is not Complete:', state);
            return;
        }

        const rawInput = this.controller.getFinalInput();
        if (rawInput) {
            // Build a proper CreateStairInput — no 'as any' needed
            const input: CreateStairInput = {
                baseLevelId:         rawInput.baseLevelId,
                topLevelId:          rawInput.topLevelId,
                shape:               rawInput.shape,
                riserHeight:         rawInput.riserHeight,
                treadDepth:          rawInput.treadDepth,
                width:               rawInput.width,
                startPosition:       rawInput.startPosition,
                flights:             rawInput.flights,
                landings:            rawInput.landings,
                typeId:              rawInput.typeId,
                turnDirection:       rawInput.turnDirection,
                secondRunSide:       rawInput.secondRunSide,
                stepsBeforeLanding:  rawInput.stepsBeforeLanding,
            };

            const command = new CreateStairCommand(input);

            const commandManager = this.deps.commandManager;
            if (commandManager) {
                console.log('[StairTool] Executing CreateStairCommand', input);
                // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('stair.create', {}).catch(() => {}); }
                commandManager.execute(command);
            } else {
                console.error('[StairTool] CommandManager not found in deps');
            }
        }
        this.deactivate();
    }
}
