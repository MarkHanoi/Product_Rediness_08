/**
 * HandrailTool — the 3-D surface of handrail authoring.
 *
 * ═══ WHAT THIS FILE USED TO BE, AND WHY THAT WAS A LIVE C84 EI-3 BREACH ═════
 *
 * 255 lines, no `mode` anywhere, no import of the authoring store: a two-click
 * straight-line tool that resolved the armed TYPE and ignored the armed MODE.
 * Meanwhile `elementCreationMatrix`'s `railing` row declares `views: ['plan','3d']`
 * for all SEVEN modes and `activateHandrailTool` shows the `DrawingModeBar` in
 * either view — so in 3-D the bar offered **Square / Circular / Ellipse**, the user
 * picked one, and the next two clicks drew a straight line. **The UI offered, the
 * pipeline did not accept** (L-1106 / C95 §15.13).
 *
 * It diverged on the RECORD too, not only the gesture:
 *   · ids were `crypto.randomUUID()` here and `createId('handrail')` in plan;
 *   · the payload hand-listed NINE type fields and silently dropped
 *     `balusterShape`, `balusterWidth`, `balusterSpacing` and `infillMaxGap`.
 * The same catalogue type therefore produced a different element depending on
 * which view you drew it in — C84 **EI-9**, and the same shape as C95 §10.1's
 * `1.1` vs `1.0` height that this family already paid for once.
 *
 * ═══ WHAT IT IS NOW ════════════════════════════════════════════════════════
 *
 * A **thin surface adapter** over {@link HandrailSketchController} — the ONE
 * gesture implementation, shared verbatim with `RailingPlanToolHandler`. This file
 * owns exactly two things, and they are the only two that are genuinely 3-D:
 *
 *   1. **pointer event → world XZ** (a ray against the ground plane), and
 *   2. **how the ghost is painted** (footprint lines + translucent boxes).
 *
 * Everything else — which mode, vertex accumulation, the ortho constraint, the arc
 * construction, loop generation, post suppression, the refusal thresholds, the
 * readout, the commit and the id shape — lives in the controller, because C95
 * §15.13 forbids a second gesture implementation BY NAME and this is `stair-path`'s
 * shape (`StairPathToolController` + a plan handler + a 3-D handler).
 *
 * CONTRACTS: C84 EI-3 / EI-9 · C95 §15.13 (L-1106) · C11 · C16 §8.6 · P2 (THREE
 * only through the `@pryzm/renderer-three` facade) · Contract §41 (preview visual).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ProjectContext } from '@pryzm/core-app-model';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { SnapManager } from '@pryzm/snapping';
import { CommandManager } from '@pryzm/command-registry';
import { PREVIEW_COLOR, createGhostBoxBetween, createFootprintLine, disposePreviewObject } from '@pryzm/core-app-model';
import {
    HandrailSketchController,
    type HandrailSketchPreviewState,
} from './HandrailSketchController';
import { setActiveHandrailTypeId } from './handrailAuthoring';
import type { HandrailRunPoint } from './handrailRunGenerators';

/**
 * Above this many segments the ghost draws footprint LINES only.
 *
 * A `circular` loop emits up to 48 chords and the ghost is rebuilt on every
 * pointer-move, so 48 `BoxGeometry` allocations per mouse move is a frame-rate
 * defect waiting to be filed. The footprint line is the part that communicates the
 * shape; the extruded body is the part that communicates the profile, and on a
 * 48-chord ring one is redundant with the next. Lines always draw, bodies draw
 * while the run is small enough for them to mean something.
 */
const GHOST_BODY_SEGMENT_LIMIT = 8;

export class HandrailTool {
    private world: OBC.World;
    private projectContext: ProjectContext;
    private commandManager: CommandManager;
    private snapManager: SnapManager | null = null;
    private isActive = false;
    private previewObjects: THREE.Object3D[] = [];

    private readonly _sketch: HandrailSketchController;

    private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
    private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
    private dblClickHandler: ((e: MouseEvent) => void) | null = null;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(
        world: OBC.World,
        _handrailStore: HandrailStore,
        projectContext: ProjectContext,
        commandManager: CommandManager
    ) {
        this.world = world;
        this.projectContext = projectContext;
        this.commandManager = commandManager;
        this.snapManager = SnapManager.createWithDefaults(world.scene.three as THREE.Scene, null);

        // ⭐ THE WHOLE OF L-1106's FIX IS THIS OBJECT. Everything the 3-D surface
        // knows about handrail authoring it knows through the same controller the
        // plan surface uses; the two hooks below are the only 3-D-shaped code left.
        this._sketch = new HandrailSketchController({
            surface: '3d',
            dispatcher: () => this.commandManager,
            levelId: () => this.projectContext.activeLevelId ?? null,
            preview: {
                render: (state) => this._renderGhost(state),
                clear: () => this.clearPreview(),
            },
            onBySlab: (outcome) => {
                if (outcome.kind === 'no-slab') {
                    console.warn(
                        '[handrail/3d] BY SLAB — no slab is named. Select the slab BEFORE arming ' +
                        'the railing tool, or use the bar\'s By Slab action which captures the ' +
                        'selection first (C95 §15.12).',
                    );
                }
                this._setHudText();
            },
        });
    }

    /**
     * Arm a catalogue type.
     *
     * ⛔ IT NO LONGER KEEPS A LOCAL `_selectedTypeId`. That field WAS the second
     * answer to "which type is armed?" — `activeHandrailAuthoring` held the first,
     * and the two were kept in step by `setActiveHandrailTypeId` writing BOTH. A
     * write-through mirror is not a single source of truth, it is two sources with
     * a habit (C84 EI-9 / C84 §8.d). The store is now the only holder, and this
     * method is a forwarder so every existing caller
     * (`BimService.activateHandrailTool`, `PropertyPanelPreDraw`) keeps working.
     */
    setTypeId(id: string | undefined): void {
        setActiveHandrailTypeId(id);
        this._setHudText();
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._sketch.reset();
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        this.attachEventListeners();
        if (this.world.camera?.controls) this.world.camera.controls.enabled = false;
        this.showUI();
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
        this.detachEventListeners();
        this._sketch.cancel();
        this.clearPreview();
        if (this.world.camera?.controls) this.world.camera.controls.enabled = true;
        this.hideUI();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HUD
    // ─────────────────────────────────────────────────────────────────────────

    private showUI(): void {
        const existing = document.getElementById('handrail-tool-ui');
        if (existing) existing.remove();

        const ui = document.createElement('div');
        ui.id = 'handrail-tool-ui';
        ui.className = 'th-overlay';

        const text = document.createElement('div');
        text.id = 'handrail-tool-text';
        text.className = 'th-text';
        ui.appendChild(text);

        const hint = document.createElement('div');
        hint.id = 'handrail-tool-hint';
        hint.className = 'th-hint';
        ui.appendChild(hint);

        const buttons = document.createElement('div');
        buttons.className = 'th-btn-row';

        const finishBtn = document.createElement('button');
        finishBtn.type = 'button';
        finishBtn.className = 'th-btn th-btn--primary';
        finishBtn.textContent = 'Finish';
        finishBtn.onclick = () => this.deactivate();
        buttons.appendChild(finishBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'th-btn th-btn--neutral';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => {
            this._sketch.cancel();
            this.deactivate();
        };
        buttons.appendChild(cancelBtn);

        ui.appendChild(buttons);
        document.body.appendChild(ui);
        this._setHudText();
    }

    /**
     * ⭐ THE HUD NAMES THE MODE, WHICH IS THE PART A USER CAN CHECK.
     *
     * The old copy said *"Handrail — Click to set start point"* whatever the bar
     * was showing, so a user who armed CIRCULAR and got a straight line had nothing
     * on screen contradicting them. The readout now comes from the same controller
     * that will do the committing, so it cannot describe a gesture the tool will
     * not perform.
     */
    private _setHudText(): void {
        const text = document.getElementById('handrail-tool-text');
        const hint = document.getElementById('handrail-tool-hint');
        if (!text && !hint) return;
        const state = this._sketch.previewState();
        if (text) {
            text.innerHTML = `<strong>Handrail — ${state.mode}</strong> · ${state.spec.typeName}`;
        }
        if (hint) hint.textContent = HandrailTool._hintFor(state);
    }

    private static _hintFor(state: HandrailSketchPreviewState): string {
        if (state.mode === 'byslab') {
            return 'Click anywhere to guard the slab you selected before arming the tool · Esc to cancel';
        }
        if (state.mode === 'square' || state.mode === 'circular' || state.mode === 'ellipse') {
            return `Click the centre/first corner, then a second point to size the ${state.mode} run · Esc to cancel`;
        }
        if (state.mode === 'curved') {
            return 'Click start, then the arc mid-point, then the end · double-click to finish · Esc to cancel';
        }
        return 'Click start, then end · keep clicking to chain · double-click to finish · Esc to cancel';
    }

    private hideUI(): void {
        const ui = document.getElementById('handrail-tool-ui');
        if (ui) ui.remove();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pointer → world XZ (the FIRST of this file's two real jobs)
    // ─────────────────────────────────────────────────────────────────────────

    private attachEventListeners(): void {
        const canvas = this.world.renderer!.three.domElement;
        this.pointerDownHandler = (e: PointerEvent) => this.onPointerDown(e);
        this.pointerMoveHandler = (e: PointerEvent) => this.onPointerMove(e);
        this.dblClickHandler = () => this._sketch.onDoubleClick();
        canvas.addEventListener('pointerdown', this.pointerDownHandler);
        canvas.addEventListener('pointermove', this.pointerMoveHandler);
        canvas.addEventListener('dblclick', this.dblClickHandler);
    }

    private detachEventListeners(): void {
        const canvas = this.world.renderer!.three.domElement;
        if (this.pointerDownHandler) canvas.removeEventListener('pointerdown', this.pointerDownHandler);
        if (this.pointerMoveHandler) canvas.removeEventListener('pointermove', this.pointerMoveHandler);
        if (this.dblClickHandler) canvas.removeEventListener('dblclick', this.dblClickHandler);
    }

    private onPointerDown(event: PointerEvent): void {
        const pt = this._runPoint(event);
        if (!pt) return;
        this._sketch.onClick(pt);
        this._setHudText();
    }

    private onPointerMove(event: PointerEvent): void {
        const pt = this._runPoint(event);
        if (!pt) return;
        this._sketch.onMouseMove(pt);
        this._setHudText();
    }

    /** Snap-corrected world XZ for a pointer event, or `null` off the ground plane. */
    private _runPoint(event: PointerEvent | MouseEvent): HandrailRunPoint | null {
        if ('button' in event && event.type === 'pointerdown' && event.button !== 0) return null;
        const point = this.getWorldPoint(event);
        if (!point) return null;
        const snapped = this.snapManager?.snap(point, { x: event.clientX, y: event.clientY }).point || point;
        return { x: snapped.x, z: snapped.z };
    }

    private getWorldPoint(event: PointerEvent | MouseEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, intersection) ? intersection : null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ghost (the SECOND of this file's two real jobs)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Paint the run the controller says the current gesture would commit.
     *
     * ⚠ IT IS A POLYLINE NOW, NOT A SEGMENT. The old ghost took a single
     * `(start, end)` pair, which is precisely why 3-D could not preview a loop: the
     * drawing code could not express one, so no amount of mode-awareness upstream
     * would have shown the user a circle. Both halves had to move together.
     */
    private _renderGhost(state: HandrailSketchPreviewState): void {
        this.clearPreview();
        const { pts, closed, spec } = state;
        if (pts.length < 2) return;

        const elevation = spec.baseOffset;
        const edgeCount = closed ? pts.length : pts.length - 1;
        const withBodies = edgeCount <= GHOST_BODY_SEGMENT_LIMIT;

        for (let i = 0; i < edgeCount; i++) {
            const a = pts[i]!;
            const b = pts[(i + 1) % pts.length]!;
            const start = new THREE.Vector3(a.x, 0, a.z);
            const end = new THREE.Vector3(b.x, 0, b.z);
            const length = start.distanceTo(end);
            if (length < 0.05) continue;

            const line = createFootprintLine(start, end, elevation, PREVIEW_COLOR.PRIMARY);
            if (line) { this.world.scene.three.add(line); this.previewObjects.push(line); }

            if (!withBodies) continue;
            // Translucent 3D ghost body — same convention as Wall / CurtainWall
            // (Contract §41, docs/02-decisions/contracts/41-ELEMENT-PREVIEW-VISUAL-CONTRACT.md).
            const body = createGhostBoxBetween(start, end, elevation, {
                color: PREVIEW_COLOR.PRIMARY,
                length,
                height: spec.height,
                thickness: spec.thickness,
            });
            if (body) { this.world.scene.three.add(body); this.previewObjects.push(body); }
        }
    }

    private clearPreview(): void {
        for (const obj of this.previewObjects) disposePreviewObject(obj);
        this.previewObjects = [];
    }
}
