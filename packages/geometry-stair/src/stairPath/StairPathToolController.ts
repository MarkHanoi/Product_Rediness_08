/**
 * StairPathToolController — orchestrator for the 2D stair path drawing tool.
 *
 * State machine:
 *   idle  ──── activate() ────→  drawing
 *   drawing ── feedDoubleClick / Enter → completed  ──── auto-deactivate
 *   drawing ── ESC / feedRightClick ──→ idle (cancelled)
 *
 * Straight mode (I / L / U):
 *   • feedClick    = add a committed point to the polyline.
 *   • feedDoubleClick / Enter = finish the stair and commit.
 *   • SHIFT        = 90° angle snap.
 *   • Backspace    = undo last point.
 *
 * Curved mode (C):
 *   • Phase 1 — feedClick to place CENTER.
 *   • Phase 2 — feedMove preview (radius ring); feedClick to fix inner radius + start angle.
 *   • Phase 3 — feedMove sweeps the arc; feedClick or Enter to commit.
 *   • Backspace = back one phase.
 *
 * Rendering:
 *   • An overlay <canvas> (absolute, pointer-events: NONE always) is created and
 *     appended to document.body. Event routing is handled exclusively by
 *     StairPathPlanToolHandler forwarding PlanToolHandler callbacks.
 *
 * 3D integration:
 *   • Straight: StairPathAdapter dispatches bim-stair-updated + CreateStairCommand.
 *   • Curved:   arc is decomposed into one micro-flight per step (tangent
 *               direction + per-step startOverride) and committed via the
 *               same CreateStairCommand path so all downstream systems
 *               (stairStore, semanticGraph, auto-opening, railing proposals)
 *               fire identically to a straight stair.  shape='spiral'.
 */

import { CreateStairCommand } from '@pryzm/command-registry';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { PolylineModel, type Point2D } from './PolylineModel';
import { StairSolver2D, type SolverResult2D } from './StairSolver2D';
import { StairPreviewRenderer } from './StairPreviewRenderer';
import { StairPathAdapter } from './StairPathAdapter';
import { StairPathHUD } from './StairPathHUD';
import { StairPathParamPanel, type StairLevelOption, type StairParams } from './StairPathParamPanel';
import { CurvedStairSolver } from './CurvedStairSolver';
import { CurvedStairRenderer } from './CurvedStairRenderer';
import type { PlanViewCanvas } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// ── State types ───────────────────────────────────────────────────────────────

export type StairPathState = 'idle' | 'drawing' | 'completed';

/** Sub-phase for curved stair drawing. */
type CurvedPhase = 'center' | 'radius' | 'sweep';

export interface StairPathToolConfig {
    /** Element that receives mouse events (typically document.body). */
    container: HTMLElement;
    /**
     * The plan view's base HTML canvas — used ONLY for getBoundingClientRect()
     * so the overlay is sized/positioned correctly even when a sidebar is present.
     */
    coordinateCanvas: HTMLElement;
    /** The active PlanViewCanvas — provides worldToScreen / screenToWorld. */
    planViewCanvas: PlanViewCanvas;
    /** CommandManager instance for CreateStairCommand dispatch. */
    commandManager: { execute: (cmd: unknown) => void };
    // ── Stair parameters ──────────────────────────────────────────────────
    baseLevelId:        string;
    topLevelId:         string;
    baseLevelElevation: number;   // metres
    topLevelElevation:  number;   // metres
    levelOptions?:      StairLevelOption[];
    width?:             number;   // default 1.2 m
    riserHeight?:       number;   // default 0.175 m
    riserCount?:        number;   // default 0 (auto from riser height)
    treadDepth?:        number;   // default 0.280 m
    risersBeforeLanding?: number; // default 0 (auto)
    risersInRun2?:      number;   // default 0 (auto)
    typeId?:            string;
    turnDirection?:     'left' | 'right';
    secondRunSide?:     'left' | 'right';
    /**
     * Shape hint from the ribbon (I / L / U).
     * I → auto-finish after 2 clicks (1 segment)
     * L → auto-finish after 3 clicks (2 segments)
     * U → auto-finish after 4 clicks (3 segments)
     */
    initialShape?:      'I' | 'L' | 'U';
    // ── Callbacks ─────────────────────────────────────────────────────────
    onComplete?: (input: ReturnType<StairPathAdapter['toCreateStairInput']>) => void;
    onCancel?:   () => void;
}

// ── Snap (90° only for plan accuracy) ────────────────────────────────────────
const SNAP_RAD = Math.PI / 2;

// ── Controller ────────────────────────────────────────────────────────────────

export class StairPathToolController {
    private _state: StairPathState = 'idle';

    // ── Sub-modules (straight mode) ───────────────────────────────────────────
    private _model:      PolylineModel;
    private _solver:     StairSolver2D;
    private _renderer:   StairPreviewRenderer;
    private _adapter:    StairPathAdapter;
    private _hud:        StairPathHUD;
    private _paramPanel: StairPathParamPanel;

    // ── Sub-modules (curved mode) ─────────────────────────────────────────────
    private _curvedSolver:   CurvedStairSolver;
    private _curvedRenderer: CurvedStairRenderer;
    private _curvedPhase:    CurvedPhase | null = null;
    private _curvedCenter:   Point2D | null = null;
    private _curvedStartAngle    = 0;

    // ── Canvas overlay ────────────────────────────────────────────────────────
    private _overlayCanvas: HTMLCanvasElement;

    // ── Live state ────────────────────────────────────────────────────────────
    private _cursor:     Point2D | null = null;
    private _shiftDown   = false;
    private _lastResult: SolverResult2D | null = null;
    get lastResult(): SolverResult2D | null { return this._lastResult; }

    // ── Shape-hint (I/L/U from ribbon) ────────────────────────────────────────
    private _expectedSegments = 0;
    private _currentStraightShape: 'I' | 'L' | 'U' | null = null;
    private _currentUVariant: '2-run' | '3-run' = '2-run';

    // ── rAF ───────────────────────────────────────────────────────────────────
    // D.7.5 batch #4: rAF handle replaced by FrameScheduler disposer.
    private _rafId: TickListenerDisposer | null = null;
    private _dirty  = true;

    // ── Event handlers (keyboard + resize only) ────────────────────────────────
    private _onKeyDown!: (e: KeyboardEvent) => void;
    private _onKeyUp!:   (e: KeyboardEvent) => void;
    private _onResize!:  () => void;

    constructor(private _config: StairPathToolConfig) {
        this._currentStraightShape = _config.initialShape ?? null;
        this._expectedSegments =
            _config.initialShape === 'I' ? 1 :
            _config.initialShape === 'L' ? 2 :
            _config.initialShape === 'U' ? 2 : 0;

        this._model  = new PolylineModel();
        this._solver = new StairSolver2D({
            width:               _config.width               ?? 1.2,
            riserHeight:         _config.riserHeight         ?? 0.175,
            treadDepth:          _config.treadDepth          ?? 0.280,
            totalHeight:         _config.topLevelElevation   - _config.baseLevelElevation,
            risersBeforeLanding: _config.risersBeforeLanding ?? 0,
            risersInRun2:        _config.risersInRun2        ?? 0,
        });

        const totalH = _config.topLevelElevation - _config.baseLevelElevation;

        this._curvedSolver = new CurvedStairSolver({
            width:       _config.width       ?? 1.2,
            riserHeight: _config.riserHeight ?? 0.175,
            totalHeight: totalH,
            innerRadius: 0.8,
            sweepAngle:  180,
        });

        const initialParams: StairParams = {
            baseLevelId:         _config.baseLevelId,
            topLevelId:          _config.topLevelId,
            typeId:              _config.typeId,
            width:               _config.width               ?? 1.2,
            riserHeight:         _config.riserHeight         ?? 0.175,
            riserCount:          _config.riserCount          ?? 0,
            treadDepth:          _config.treadDepth          ?? 0.280,
            risersBeforeLanding: _config.risersBeforeLanding ?? 0,
            risersInRun2:        _config.risersInRun2        ?? 0,
            turnDirection:       _config.turnDirection       ?? 'left',
            uVariant:            '2-run',
            stairMode:           'straight',
            innerRadius:         0.8,
            sweepAngle:          180,
        };

        this._paramPanel = new StairPathParamPanel(initialParams, (params) => {
            this._onParamChange(params);
        }, _config.levelOptions ?? [], (shape) => {
            // Shape button clicked — update expected segment count and reset drawing.
            // U-shape: 2 segments for 2-run variant (3 clicks), 3 for 3-run variant (4 clicks).
            this._currentStraightShape = shape;
            const uVar = this._paramPanel.getParams().uVariant;
            this._expectedSegments =
                shape === 'I' ? 1 :
                shape === 'L' ? 2 :
                shape === 'U' ? (uVar === '3-run' ? 3 : 2) : 0;
            this._hud.setShapeHint(shape);
            // Reset committed points so user re-draws for the new shape
            this._model.clear();
            this._cursor    = null;
            this._lastResult = null;
            this._hud.setPointCount(0);
            this._dirty = true;
            console.log(`[StairPathToolController] Shape changed → ${shape} (expectedSegments=${this._expectedSegments})`);
        });

        this._overlayCanvas = this._buildOverlayCanvas();
        document.body.appendChild(this._overlayCanvas);

        this._renderer       = new StairPreviewRenderer(this._overlayCanvas);
        this._curvedRenderer = new CurvedStairRenderer(this._overlayCanvas);
        this._hud            = new StairPathHUD();
        this._adapter        = new StairPathAdapter({
            baseLevelId:        _config.baseLevelId,
            topLevelId:         _config.topLevelId,
            baseLevelElevation: _config.baseLevelElevation,
            topLevelElevation:  _config.topLevelElevation,
            typeId:             _config.typeId,
            turnDirection:      _config.turnDirection ?? 'left',
            secondRunSide:      _config.secondRunSide ?? 'left',
        });

        this._bindHandlers();
        this._syncOverlaySize();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    get state(): StairPathState { return this._state; }

    activate(): void {
        if (this._state !== 'idle') return;
        this._state = 'drawing';
        this._model.clear();
        this._cursor = null;
        this._lastResult = null;
        this._curvedPhase  = null;
        this._curvedCenter = null;
        this._dirty = true;

        this._syncOverlaySize();
        this._hud.show();
        this._hud.setPointCount(0);
        this._hud.setShapeHint(this._config.initialShape ?? null);
        this._paramPanel.show(this._config.coordinateCanvas);

        // Overlay canvas is render-only — pointer events stay off
        this._overlayCanvas.style.pointerEvents = 'none';

        document.addEventListener('keydown', this._onKeyDown, { capture: true });
        document.addEventListener('keyup',   this._onKeyUp,   { capture: true });
        window.addEventListener('resize',    this._onResize);

        this._startRaf();
        _bus.emit('stair-path-tool:activated', {}); // F.events.18
    }

    deactivate(): void {
        if (this._state === 'idle') return;
        this._state = 'idle';

        document.removeEventListener('keydown', this._onKeyDown, { capture: true });
        document.removeEventListener('keyup',   this._onKeyUp,   { capture: true });
        window.removeEventListener('resize',    this._onResize);

        this._stopRaf();
        this._renderer.clear();
        this._curvedRenderer.clear();
        this._hud.hide();
        this._paramPanel.hide();
        this._adapter.clearLivePreview();

        _bus.emit('stair-path-tool:deactivated', {}); // F.events.18
    }

    destroy(): void {
        this.deactivate();
        this._hud.destroy();
        this._paramPanel.destroy();
        this._overlayCanvas.remove();
    }

    // ── Event feed API (called by StairPathPlanToolHandler) ───────────────────

    /** Feed a mouse-move world position. */
    feedMove(worldX: number, worldZ: number): void {
        if (this._state !== 'drawing') return;
        this._cursor = { x: worldX, z: worldZ };
        this._dirty  = true;
    }

    /** Feed a single click at world position. */
    feedClick(worldX: number, worldZ: number): void {
        if (this._state !== 'drawing') return;
        const pt: Point2D = { x: worldX, z: worldZ };

        if (this._isCurvedMode()) {
            this._handleCurvedClick(pt);
            return;
        }

        const snapped = this._shiftDown && this._model.count > 0
            ? this._snapTo90(pt)
            : pt;

        this._addPoint(snapped);
    }

    /** Feed a double-click — finish the stair. */
    feedDoubleClick(_worldX: number, _worldZ: number): void {
        if (this._state !== 'drawing') return;
        if (this._isCurvedMode()) {
            this._finish();
            return;
        }
        if (this._model.count >= 2) this._finish();
    }

    /** Feed a right-click — cancel. */
    feedRightClick(): void {
        if (this._state !== 'drawing') return;
        this._cancel();
    }

    updateParams(params: {
        baseLevelId?:         string;
        topLevelId?:          string;
        typeId?:              string;
        width?:               number;
        riserHeight?:         number;
        riserCount?:          number;
        treadDepth?:          number;
        risersBeforeLanding?: number;
        risersInRun2?:        number;
        turnDirection?:       'left' | 'right';
        secondRunSide?:       'left' | 'right';
    }): void {
        const next = { ...this._paramPanel.getParams(), ...params };
        this._applyConfigParams(next);
        const totalHeight = this._config.topLevelElevation - this._config.baseLevelElevation;
        const riserHeight = next.riserCount && next.riserCount > 0
            ? totalHeight / next.riserCount
            : next.riserHeight;
        this._solver.update({ ...params, totalHeight, riserHeight });
        this._curvedSolver.update({ ...params, totalHeight, riserHeight });
        this._adapter.updateConfig({
            baseLevelId: this._config.baseLevelId,
            topLevelId: this._config.topLevelId,
            baseLevelElevation: this._config.baseLevelElevation,
            topLevelElevation: this._config.topLevelElevation,
            typeId: next.typeId,
            turnDirection: params.turnDirection,
            secondRunSide: params.secondRunSide,
        });
        this._dirty = true;
    }

    // ── Mode helpers ──────────────────────────────────────────────────────────

    private _isCurvedMode(): boolean {
        return this._paramPanel.getParams().stairMode === 'curved';
    }

    // ── Param panel callback ──────────────────────────────────────────────────

    private _onParamChange(params: StairParams): void {
        this._applyConfigParams(params);
        const totalHeight = this._config.topLevelElevation - this._config.baseLevelElevation;
        const solverRiserHeight = params.riserCount > 0
            ? totalHeight / params.riserCount
            : params.riserHeight;

        this._solver.update({
            totalHeight,
            width:               params.width,
            riserHeight:         solverRiserHeight,
            treadDepth:          params.treadDepth,
            risersBeforeLanding: params.risersBeforeLanding,
            risersInRun2:        params.risersInRun2,
        });
        this._curvedSolver.update({
            totalHeight,
            width:       params.width,
            riserHeight: solverRiserHeight,
            innerRadius: params.innerRadius,
            sweepAngle:  params.stairMode === 'curved'
                ? (params.turnDirection === 'right' ? -params.sweepAngle : params.sweepAngle)
                : params.sweepAngle,
        });
        this._adapter.updateConfig({
            baseLevelId: this._config.baseLevelId,
            topLevelId: this._config.topLevelId,
            baseLevelElevation: this._config.baseLevelElevation,
            topLevelElevation: this._config.topLevelElevation,
            typeId: params.typeId,
            turnDirection: params.turnDirection,
        });

        // U-variant toggle (2-run ↔ 3-run): reset expected segment count and points.
        if (this._currentStraightShape === 'U' && params.uVariant !== this._currentUVariant) {
            this._currentUVariant = params.uVariant;
            this._expectedSegments = params.uVariant === '3-run' ? 3 : 2;
            this._model.clear();
            this._cursor    = null;
            this._lastResult = null;
            this._hud.setPointCount(0);
            console.log(`[StairPathToolController] U variant changed → ${params.uVariant} (expectedSegments=${this._expectedSegments})`);
        } else {
            this._currentUVariant = params.uVariant;
        }

        // Switching FROM curved to straight — reset curved state
        if (params.stairMode === 'straight' && this._curvedPhase !== null) {
            this._curvedPhase  = null;
            this._curvedCenter = null;
            this._model.clear();
            this._hud.setPointCount(0);
        }
        // Switching TO curved — reset straight state and enter curved phase
        if (params.stairMode === 'curved') {
            if (this._model.count > 0) this._model.clear();
            if (this._curvedPhase === null) {
                this._curvedPhase  = 'center';
                this._curvedCenter = null;
            }
            this._hud.setCurvedPhase(this._curvedPhase as CurvedPhase);
            this._hud.setPointCount(
                this._curvedPhase === 'center' ? 0 :
                this._curvedPhase === 'radius' ? 1 : 2
            );
        }

        this._dirty = true;
    }

    private _applyConfigParams(params: Pick<StairParams, 'baseLevelId' | 'topLevelId' | 'typeId'>): void {
        const levels = this._config.levelOptions ?? [];
        const base = levels.find(level => level.id === params.baseLevelId);
        const top  = levels.find(level => level.id === params.topLevelId);

        this._config.baseLevelId = params.baseLevelId;
        this._config.topLevelId  = params.topLevelId;
        this._config.typeId      = params.typeId;
        if (base) this._config.baseLevelElevation = base.elevation;
        if (top)  this._config.topLevelElevation  = top.elevation;
    }

    // ── Keyboard handler binding ───────────────────────────────────────────────

    private _bindHandlers(): void {
        this._onKeyDown = (e: KeyboardEvent) => {
            if (this._state !== 'drawing') return;
            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    this._cancel();
                    break;
                case 'Enter':
                    e.preventDefault();
                    this._finish();
                    break;
                case 'Backspace':
                case 'Delete':
                    e.preventDefault();
                    if (this._isCurvedMode()) {
                        this._curvedBackspace();
                    } else {
                        this._undoLastPoint();
                    }
                    break;
                case 'Shift':
                    this._shiftDown = true;
                    this._hud.setShiftSnap(true);
                    this._dirty = true;
                    break;
            }
        };

        this._onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                this._shiftDown = false;
                this._hud.setShiftSnap(false);
                this._dirty = true;
            }
        };

        this._onResize = () => {
            this._syncOverlaySize();
            this._dirty = true;
        };
    }

    // ── Curved mode click handling ────────────────────────────────────────────

    private _handleCurvedClick(pt: Point2D): void {
        if (this._curvedPhase === null || this._curvedPhase === 'center') {
            this._curvedCenter = pt;
            this._curvedPhase  = 'radius';
            this._hud.setPointCount(1);

        } else if (this._curvedPhase === 'radius') {
            if (!this._curvedCenter) return;
            const { radius, angle } = CurvedStairSolver.radiusAndAngle(this._curvedCenter, pt);
            this._curvedStartAngle  = angle;
            this._curvedSolver.update({ innerRadius: radius });
            this._curvedPhase = 'sweep';
            this._hud.setPointCount(2);

        } else if (this._curvedPhase === 'sweep') {
            this._finish();
        }

        this._dirty = true;
    }

    private _curvedBackspace(): void {
        if (this._curvedPhase === 'sweep') {
            this._curvedPhase = 'radius';
            this._hud.setPointCount(1);
        } else if (this._curvedPhase === 'radius') {
            this._curvedPhase  = null;
            this._curvedCenter = null;
            this._hud.setPointCount(0);
        } else {
            this._cancel();
        }
        this._dirty = true;
    }

    // ── Straight mode point management ───────────────────────────────────────

    private _addPoint(pt: Point2D): void {
        this._model.addPoint(pt);
        this._cursor = pt;
        this._dirty  = true;
        this._hud.setPointCount(this._model.count);

        if (this._lastResult) {
            this._paramPanel.updateShape(this._lastResult.shape);
        }

        const segments = this._model.count - 1;

        // Auto-finish when the expected number of segments is reached
        if (this._expectedSegments > 0 && segments >= this._expectedSegments) {
            setTimeout(() => this._finish(), 0);
        }
    }

    private _undoLastPoint(): void {
        if (this._model.count === 0) { this._cancel(); return; }
        this._model.removeLast();
        this._hud.setPointCount(this._model.count);
        this._dirty = true;
    }

    // ── Angle snapping (SHIFT = 90° for accurate plan geometry) ──────────────

    private _snapTo90(pt: Point2D): Point2D {
        const last = this._model.last;
        if (!last) return pt;

        const dx  = pt.x - last.x;
        const dz  = pt.z - last.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return pt;

        const angle   = Math.atan2(dz, dx);
        const snapped = Math.round(angle / SNAP_RAD) * SNAP_RAD;

        return {
            x: last.x + Math.cos(snapped) * len,
            z: last.z + Math.sin(snapped) * len,
        };
    }

    // ── Finish / cancel ───────────────────────────────────────────────────────

    private _finish(): void {
        if (this._state !== 'drawing') return;

        if (this._isCurvedMode()) {
            this._finishCurved();
            return;
        }

        if (this._model.count < 2) { this._cancel(); return; }

        const result = this._solver.solve(this._model.points);
        StairPreviewRenderer.annotateSegmentsWithWidth(result, this._solver.width);

        if (!result.isValid) {
            console.warn('[StairPathToolController] Cannot finish: invalid —', result.validationMessage);
            return;
        }

        const input = this._adapter.toCreateStairInput(result);
        if (!input) {
            console.warn('[StairPathToolController] Adapter returned null input');
            return;
        }

        this._state = 'completed';
        this.deactivate();

        const cmd = new CreateStairCommand(input);
        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('stair.create', {}).catch(() => {}); }
        this._config.commandManager.execute(cmd);

        this._config.onComplete?.(input);
    }

    private _finishCurved(): void {
        if (this._curvedPhase !== 'sweep' || !this._curvedCenter || !this._cursor) {
            console.warn('[StairPathToolController] Curved stair not ready to commit');
            return;
        }

        const sweepRad = CurvedStairSolver.sweepAngle(
            this._curvedCenter,
            this._curvedStartAngle,
            this._cursor,
        );
        const result = this._curvedSolver.solve(
            this._curvedCenter,
            this._curvedStartAngle,
            sweepRad,
        );

        if (!result.isValid) {
            console.warn('[StairPathToolController] Curved stair invalid:', result.validationMessage);
            return;
        }

        // ── Decompose the curved arc into one micro-flight per step ─────────
        // Each step is a single-riser flight whose direction is the arc tangent
        // at the step's mid-angle, and whose `startOverride` is positioned so
        // that the StairMeshBuilder's `position += dir * treadDepth` advance
        // lands the tread centre exactly on the centreline arc.
        // §01-BIM-ENGINE-CORE §1.5 — commit through CreateStairCommand so the
        // stair is registered in stairStore + elementRegistry + semanticGraph
        // (auto-opening + railing proposals come along for free).
        // §03-SEMANTIC-MODEL — shape='spiral' is the schema-valid label for
        // arc-based stairs; the per-step flights carry the full geometry.
        const center  = this._curvedCenter;
        const stepN   = result.stepCount;
        const sweepPerStep = result.sweepAngle / stepN;
        const walkR   = (result.innerRadius + result.outerRadius) / 2;
        const treadDepth = result.treadArcLength;        // chord ≈ arc per step
        const tangentSign = Math.sign(sweepPerStep) || 1;

        type FlightInput = { direction: { x: number; y: number; z: number }; riserCount: number; startOverride?: { x: number; y: number; z: number } };
        const flights: FlightInput[] = [];
        let firstStartPos: { x: number; y: number; z: number } | null = null;

        for (let i = 0; i < stepN; i++) {
            const midAngle = result.startAngle + (i + 0.5) * sweepPerStep;
            // Tread centre on the centreline arc.
            const treadCenter = {
                x: center.x + walkR * Math.cos(midAngle),
                z: center.z + walkR * Math.sin(midAngle),
            };
            // Tangent at midAngle (CCW sweep → +90° rotation of radial unit).
            const dir = {
                x: -Math.sin(midAngle) * tangentSign,
                y: 0,
                z:  Math.cos(midAngle) * tangentSign,
            };
            // Mesh builder advances by treadDepth before placing the tread, so
            // back the start position off by one treadDepth.
            const startOverride = {
                x: treadCenter.x - dir.x * treadDepth,
                y: this._config.baseLevelElevation,
                z: treadCenter.z - dir.z * treadDepth,
            };

            flights.push({ direction: dir, riserCount: 1, startOverride });
            if (i === 0) firstStartPos = { ...startOverride };
        }

        if (!firstStartPos) {
            console.warn('[StairPathToolController] Curved stair produced 0 flights');
            return;
        }

        const input = {
            baseLevelId:        this._config.baseLevelId,
            topLevelId:         this._config.topLevelId,
            shape:              'spiral' as const,
            riserHeight:        result.riserHeight,
            treadDepth,
            width:              result.width,
            startPosition:      firstStartPos,
            flights,
            typeId:             this._config.typeId,
        };

        this._state = 'completed';
        this.deactivate();

        const cmd = new CreateStairCommand(input as any);
        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('stair.create', {}).catch(() => {}); }
        this._config.commandManager.execute(cmd);
        console.log('[StairPathToolController] Curved stair committed:', stepN, 'steps,', `sweep=${(result.sweepAngle * 180 / Math.PI).toFixed(1)}°`);
    }

    private _cancel(): void {
        this._adapter.clearLivePreview();
        _bus.emit('bim-stair-removed', { id: 'stair-path-preview' }); // F.events.18
        this.deactivate();
        this._config.onCancel?.();
    }

    // ── rAF render loop ───────────────────────────────────────────────────────

    private _startRaf(): void {
        if (this._rafId !== null) return;
        // D.7.5 batch #4: continuous tick driven by FrameScheduler.
        // The scheduler re-invokes the callback every frame; the callback
        // self-disposes when the controller transitions back to 'idle'
        // (preserves the original loop's `if (state === 'idle') return;` early-out).
        const loop = () => {
            if (this._state === 'idle') {
                if (this._rafId !== null) { this._rafId(); this._rafId = null; }
                return;
            }
            if (!this._dirty) return;
            this._dirty = false;
            this._renderFrame();
        };
        this._rafId = getFrameScheduler().addTickListener(
            'stair-path-tool-loop',
            loop,
            'render',
        );
    }

    private _stopRaf(): void {
        // D.7.5 batch #4: dispose the FrameScheduler tick listener.
        if (this._rafId !== null) {
            this._rafId();
            this._rafId = null;
        }
    }

    private _renderFrame(): void {
        if (this._isCurvedMode()) {
            this._renderCurvedFrame();
            return;
        }
        this._renderStraightFrame();
    }

    private _renderStraightFrame(): void {
        const committed = this._model.points;
        const cursor    = this._cursor;

        const snappedCursor = cursor && this._shiftDown && this._model.count > 0
            ? this._snapTo90(cursor)
            : cursor;

        const previewPath = snappedCursor
            ? this._model.getPreviewPath(snappedCursor)
            : committed;

        const result = this._solver.solve(previewPath);
        StairPreviewRenderer.annotateSegmentsWithWidth(result, this._solver.width);
        this._lastResult = result;

        this._paramPanel.updateShape(result.shape);
        this._hud.setResult(result);

        this._renderer.render(
            result,
            committed,
            snappedCursor,
            (x, z) => {
                const s = this._config.planViewCanvas.worldToScreen(x, z);
                return { sx: s.sx, sy: s.sy };
            },
            this._state === 'drawing',
        );

        // Dispatch live 3D preview for all committed points (single segment or more)
        if (committed.length >= 1) {
            const committedResult = this._solver.solve(committed);
            StairPreviewRenderer.annotateSegmentsWithWidth(committedResult, this._solver.width);
            this._adapter.dispatchLivePreview(committedResult);
        }
    }

    private _renderCurvedFrame(): void {
        const cursor = this._cursor;

        const toScreen = (x: number, z: number) => {
            const s = this._config.planViewCanvas.worldToScreen(x, z);
            return { sx: s.sx, sy: s.sy };
        };

        if (this._curvedPhase === null) {
            this._curvedRenderer.clear();
            return;
        }

        if (this._curvedPhase === 'radius') {
            this._curvedRenderer.renderCenterPhase(this._curvedCenter!, cursor, toScreen);
            return;
        }

        if (this._curvedPhase === 'sweep') {
            if (!this._curvedCenter || !cursor) {
                this._curvedRenderer.clear();
                return;
            }
            const sweepRad = CurvedStairSolver.sweepAngle(
                this._curvedCenter,
                this._curvedStartAngle,
                cursor,
            );
            const result = this._curvedSolver.solve(
                this._curvedCenter,
                this._curvedStartAngle,
                sweepRad,
            );
            this._hud.setCurvedResult(result);
            this._curvedRenderer.renderSweepPhase(result, toScreen);
        }
    }

    // ── Overlay canvas setup ──────────────────────────────────────────────────

    private _buildOverlayCanvas(): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9990;
        `;
        canvas.setAttribute('aria-hidden', 'true');
        return canvas;
    }

    private _syncOverlaySize(): void {
        const ref  = this._config.coordinateCanvas;
        const rect = ref.getBoundingClientRect();

        this._overlayCanvas.style.top    = `${rect.top}px`;
        this._overlayCanvas.style.left   = `${rect.left}px`;
        this._overlayCanvas.style.width  = `${rect.width}px`;
        this._overlayCanvas.style.height = `${rect.height}px`;

        this._renderer.resize(rect.width, rect.height);
        this._curvedRenderer.resize(rect.width, rect.height);
        this._dirty = true;
    }
}
