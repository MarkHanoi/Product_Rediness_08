/**
 * PlanViewInteraction — Contract 19, Phase 3
 *
 * Handles mouse interaction on the Canvas2D plan view:
 *   - Click-to-select: dispatches `pryzm-element-selected` via hitTest()
 *   - Hover snap indicator: finds the nearest projected segment endpoint within
 *     a pixel radius and passes it to PlanViewCanvas.setSnapIndicator()
 *   - Hover highlight: finds the nearest projected segment within a pixel
 *     radius and calls PlanViewCanvas.setHoveredElementId() so the render
 *     pass can draw the blue hover stroke. (Phase 3 — Sprint 2)
 *
 * Architecture rules (Contract 19 §7):
 *   - Never modifies the scene graph.
 *   - Never imports from ViewController or UnifiedFrameLoop.
 *   - UUID tag lookup is purely arithmetic over cached vertex arrays.
 *   - Endpoint cache is pre-built once per drawing, not on every frame.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { PlanViewCanvas } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { lookupElementUUID } from '@pryzm/core-app-model';
import { PlanSnapEngine, type PlanSnapType } from '@pryzm/core-app-model';
// Re-export for downstream consumers that import PlanSnapType from here.
export type { PlanSnapType } from '@pryzm/core-app-model';
import { planElementDragController } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { floorPlanUnderlayRef } from '@pryzm/core-app-model';
import type { AnnotationElement } from '@pryzm/plugin-annotations';
import type { ViewDefinition, ViewSectionVolume } from '@pryzm/core-app-model';
// Phase 1 — Cross-View Selection Parity (Contract 27 §4 / Contract 38 §"Selection Parity").
// Routing standalone-plan-view picks through SelectionBus is what brings the
// surface to feature parity with the SVP: it triggers SelectionManager.selectById,
// which (a) highlights the element in the 3D scene, (b) fires bim-selection-changed
// so the Properties Panel opens, and (c) lets every other surface (SVP, browser,
// schedule, workbench …) react.  Previously this surface only dispatched the raw
// pryzm-element-selected event, which bypassed SelectionManager entirely.
import { selectionBus } from '@pryzm/core-app-model';
import { UpdateAnnotationCommand } from '@pryzm/command-registry';
import { DRAGGABLE_ANNOTATION_TYPES } from '@pryzm/core-app-model';

/**
 * Hover-highlight radius (separate from snap radius — hover is tighter so the
 * blue-stroke highlight only fires on direct passes).
 */
const HOVER_RADIUS_PX = 10;
const CLICK_MAX_DRAG_PX = 5;
const GRID_HIT_RADIUS_PX = 12;

/**
 * Snap families and snap algorithm live in `PlanSnapEngine` (Contract 32).
 * This class only delegates to that engine via `querySnap` / `prewarmSnap`.
 */

const _tmpV  = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

export class PlanViewInteraction {
    private _planCanvas: PlanViewCanvas | null = null;
    private _viewId: string | null = null;

    /**
     * Universal snap engine — Contract 32.  Owns endpoint/segment cache,
     * drawing-identity invalidation, prewarm, and the 7-family snap pipeline.
     */
    private readonly _snapEngine = new PlanSnapEngine();

    private _pointerDownX = 0;
    private _pointerDownY = 0;
    private _isDragging = false;
    private _scopeDrag: { annotationId: string; linkedViewId: string; handle: 'depth' | 'width-left' | 'width-right' | 'cut-plane'; lastUpdate: number } | null = null;
    private _levelDrag: { levelId: string; startSy: number; startElevation: number } | null = null;
    private _annotDrag: {
        annotationId: string;
        startWorldX: number;
        startWorldZ: number;
        startSx: number;
        startSy: number;
        origGeometry2D: AnnotationElement['geometry2D'];
        origReferences: AnnotationElement['references'];
    } | null = null;
    private _underlayDrag: {
        startWorldX: number;
        startWorldZ: number;
        startMeshX: number;
        startMeshZ: number;
    } | null = null;

    /** Currently hovered element UUID, or null. Updated on every mousemove. */
    private _hoveredElementId: string | null = null;

    /** True while planElementDragController owns the current drag. */
    private _elementDragActive = false;

    private readonly _boundMouseMove   = this._onMouseMove.bind(this);
    private readonly _boundMouseDown   = this._onMouseDown.bind(this);
    private readonly _boundMouseUp     = this._onMouseUp.bind(this);
    private readonly _boundContextMenu = this._onContextMenu.bind(this);
    private readonly _boundKeyDown     = this._onKeyDown.bind(this);

    private _canvas: HTMLCanvasElement | null = null;

    attach(canvas: HTMLCanvasElement, planCanvas: PlanViewCanvas, viewId: string): void {
        this.detach();
        this._canvas = canvas;
        this._planCanvas = planCanvas;
        this._viewId = viewId;
        this._snapEngine.attach(planCanvas, viewId);
        this._hoveredElementId = null;

        canvas.addEventListener('mousedown', this._boundMouseDown, true);
        canvas.addEventListener('contextmenu', this._boundContextMenu);
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('mouseup', this._boundMouseUp);
        window.addEventListener('keydown',  this._boundKeyDown);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && this._elementDragActive) {
            this._elementDragActive = false;
            if (this._canvas) this._canvas.style.cursor = '';
            planElementDragController.cancel();
            console.log('[PlanDrag] Escape key — drag cancelled');
        }
    }

    detach(): void {
        this._canvas?.removeEventListener('mousedown', this._boundMouseDown, true);
        this._canvas?.removeEventListener('contextmenu', this._boundContextMenu);
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup',   this._boundMouseUp);
        window.removeEventListener('keydown',   this._boundKeyDown);
        this._planCanvas?.clearSnapIndicator();
        this._planCanvas?.setHoveredElementId(null);
        if (this._elementDragActive) {
            planElementDragController.cancel();
            this._elementDragActive = false;
        }
        this._canvas = null;
        this._planCanvas = null;
        this._viewId = null;
        this._snapEngine.detach();
        this._isDragging = false;
        this._scopeDrag = null;
        this._levelDrag = null;
        this._hoveredElementId = null;
    }

    notifyDrawingChanged(viewId: string): void {
        this._viewId = viewId;
        this._snapEngine.notifyDrawingChanged(viewId);
    }

    /**
     * Eagerly warm the snap cache.  Called by tool overlays at activation time
     * (Contract 32) so the very first hover and very first click see live snap
     * candidates instead of an empty cache.
     */
    prewarmSnap(): void {
        this._snapEngine.prewarmCache();
    }

    private _onMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return;
        if (!this._canvas || !this._planCanvas) return;
        const rect = this._canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // ── Level datum line drag (section/elevation views) ───────────────────
        // Only allow dragging the line itself, not the head (head is for click-to-edit).
        const levelHeadHit = this._planCanvas.hitTestLevelHead?.(sx, sy) ?? null;
        if (!levelHeadHit) {
            const levelLineId = this._planCanvas.hitTestLevel?.(sx, sy, 10) ?? null;
            if (levelLineId) {
                const bimManager = window.bimManager;
                const levels = bimManager?.getLevels?.() ?? [];
                const level = levels.find((l: any) => l.id === levelLineId);
                const elevation = level?.elevation ?? level?.height ?? 0;
                this._levelDrag = { levelId: levelLineId, startSy: sy, startElevation: elevation };
                this._isDragging = true;
                this._canvas.style.cursor = 'ns-resize';
                (e as any).__pryzmToolHandled = true;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        const scopeHit = this._planCanvas.hitTestScopeHandle(sx, sy, 10);
        if (scopeHit) {
            this._scopeDrag = { annotationId: scopeHit.annotationId, linkedViewId: scopeHit.linkedViewId, handle: scopeHit.handle, lastUpdate: 0 };
            this._isDragging = true;
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // ── Draggable annotation tag (room-tag, door-tag, etc.) ───────────────
        const annotHitId = this._planCanvas.hitTestAnnotation(sx, sy, 14);
        if (annotHitId) {
            const ann = annotationStore.getById(annotHitId);
            if (ann && DRAGGABLE_ANNOTATION_TYPES.has(ann.type)) {
                const pt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
                if (pt) {
                    this._annotDrag = {
                        annotationId: annotHitId,
                        startWorldX: pt.x,
                        startWorldZ: pt.z,
                        startSx: sx,
                        startSy: sy,
                        origGeometry2D: {
                            ...ann.geometry2D,
                            modelPoints: ann.geometry2D.modelPoints?.map(p => ({ ...p })) ?? [],
                        },
                        origReferences: ann.references.map(r => ({
                            ...r,
                            cachedPosition: r.cachedPosition ? { ...r.cachedPosition } : undefined,
                        })),
                    };
                    this._isDragging = true;
                    (e as any).__pryzmToolHandled = true;
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PlanViewInteraction] Annotation drag started:', annotHitId, ann.type);
                    return;
                }
            }
        }

        // ── Floor plan underlay drag (move PDF/JPG on plan view) ─────────────
        // Active only when the underlay is selected and not locked.
        if (!this._isDragging && this._hitTestUnderlay(sx, sy)) {
            const underlayTool = window.floorPlanUnderlayTool;
            const uState = underlayTool?.getState?.();
            if (uState && !uState.locked && uState.isSelected && uState.mesh) {
                const { worldX, worldZ } = this._planCanvas.screenToWorld(sx, sy);
                this._underlayDrag = {
                    startWorldX: worldX,
                    startWorldZ: worldZ,
                    startMeshX: uState.mesh.position.x,
                    startMeshZ: uState.mesh.position.z,
                };
                this._isDragging = true;
                this._canvas.style.cursor = 'move';
                (e as any).__pryzmToolHandled = true;
                e.preventDefault();
                e.stopPropagation();
                console.log('[PlanViewInteraction] Underlay drag started');
                return;
            }
        }

        // ── Plan-view element drag (wall / door / window) ─────────────────────
        // Check BEFORE saving _pointerDownX so the controller owns the gesture.
        // Skip entirely when a scale/rotate underlay tool is active — its own
        // click listener must receive the unmodified click event (calling
        // preventDefault on mousedown suppresses the subsequent click event).
        if (!this._isDragging && this._planCanvas) {
            const tm2 = window.toolManager;
            if (!tm2?.isAnyToolActive?.() && !window.__underlayScaleActive) {
                const rect2 = this._canvas!.getBoundingClientRect();
                const hsx = e.clientX - rect2.left;
                const hsy = e.clientY - rect2.top;
                const hit = planElementDragController.hitTestDraggable(hsx, hsy, this._planCanvas);
                if (hit) {
                    const started = planElementDragController.startDrag(hit, hsx, hsy, this._planCanvas, this._canvas!);
                    if (started) {
                        this._elementDragActive = true;
                        (e as any).__pryzmToolHandled = true;
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                }
            }
        }

        this._pointerDownX = e.clientX;
        this._pointerDownY = e.clientY;
        this._isDragging = false;
    }

    private _onMouseMove(e: MouseEvent): void {
        if (!this._canvas || !this._planCanvas || !this._viewId) return;

        if (this._levelDrag) {
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            this._canvas.style.cursor = 'ns-resize';
            return;
        }

        if (this._scopeDrag) {
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            this._canvas.style.cursor = this._scopeDrag.handle === 'cut-plane' ? 'move' : this._scopeDrag.handle === 'depth' ? 'ns-resize' : 'ew-resize';
            this._applyScopeDragFromPointer(e, false);
            return;
        }

        // ── Floor plan underlay drag ──────────────────────────────────────────
        if (this._underlayDrag) {
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            this._canvas.style.cursor = 'move';
            const drag = this._underlayDrag;
            const rect = this._canvas.getBoundingClientRect();
            const curSx = e.clientX - rect.left;
            const curSy = e.clientY - rect.top;
            const cur = this._planCanvas.screenToWorld(curSx, curSy);
            const dx = cur.worldX - drag.startWorldX;
            const dz = cur.worldZ - drag.startWorldZ;
            const underlayTool = window.floorPlanUnderlayTool;
            const mesh = underlayTool?.getState?.()?.mesh;
            if (mesh) {
                mesh.position.x = drag.startMeshX + dx;
                mesh.position.z = drag.startMeshZ + dz;
            }
            return;
        }

        // ── Live annotation drag preview ──────────────────────────────────────
        if (this._annotDrag) {
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            this._canvas.style.cursor = 'move';
            const drag = this._annotDrag;
            const rect = this._canvas.getBoundingClientRect();
            const curSx = e.clientX - rect.left;
            const curSy = e.clientY - rect.top;
            const startWorld = this._planCanvas.screenToWorld(drag.startSx, drag.startSy);
            const curWorld   = this._planCanvas.screenToWorld(curSx, curSy);
            const dWorldX = curWorld.worldX - startWorld.worldX;
            const dWorldZ = curWorld.worldZ - startWorld.worldZ;
            const ann = annotationStore.getById(drag.annotationId);
            if (ann) {
                // Move ALL model points by the same delta so multi-point annotations
                // (matchline, revision-cloud, linear-dimension, etc.) move as a unit.
                const origPts = drag.origGeometry2D.modelPoints ?? [];
                const movedPts = origPts.length > 0
                    ? origPts.map(p => ({ x: p.x + dWorldX, y: p.y, z: p.z + dWorldZ }))
                    : [{ x: drag.startWorldX + dWorldX, y: 0, z: drag.startWorldZ + dWorldZ }];
                // Direct store update for live preview (no command — ephemeral until mouseup).
                annotationStore.update({
                    id: drag.annotationId,
                    geometry2D: { ...ann.geometry2D, modelPoints: movedPts },
                    references: ann.references.map((r, i) => {
                        const mp = movedPts[i] ?? movedPts[0];
                        return { ...r, cachedPosition: mp ?? r.cachedPosition };
                    }),
                });
            }
            return;
        }

        // ── Plan-view element drag move ───────────────────────────────────────
        if (this._elementDragActive) {
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            const dragRect = this._canvas.getBoundingClientRect();
            const dragSx = e.clientX - dragRect.left;
            const dragSy = e.clientY - dragRect.top;
            planElementDragController.onMove(dragSx, dragSy);
            this._canvas.style.cursor = planElementDragController.isActivated ? 'move' : 'grab';
            return;
        }

        const dx = e.clientX - this._pointerDownX;
        const dy = e.clientY - this._pointerDownY;
        if (Math.hypot(dx, dy) > CLICK_MAX_DRAG_PX) {
            this._isDragging = true;
        }

        const rect = this._canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // ── Geometry snap indicator (delegates to PlanSnapEngine) ────────────
        const snap = this._snapEngine.querySnap(sx, sy);
        if (snap) {
            const { sx: snapSx, sy: snapSy } = this._planCanvas.worldToScreen(snap.worldX, snap.worldZ);
            this._planCanvas.setSnapIndicator(snapSx, snapSy);
        } else {
            this._planCanvas.clearSnapIndicator();
        }

        // ── Hover highlight (blue stroke over hovered element) ────────────────
        // Skip while a tool is active — tool previews take over the visual layer.
        const tm = window.toolManager;
        const toolActive = tm?.isAnyToolActive?.() ?? false;
        const newHoveredId = toolActive ? null : this._queryHoveredElement(sx, sy);
        if (newHoveredId !== this._hoveredElementId) {
            this._hoveredElementId = newHoveredId;
            this._planCanvas.setHoveredElementId(newHoveredId);
        }
    }

    private _onMouseUp(e: MouseEvent): void {
        if (e.button !== 0) {
            this._showOverrideContextMenu(e);
            return;
        }

        // ── Plan-view element drag commit ─────────────────────────────────────
        if (this._elementDragActive) {
            this._elementDragActive = false;
            if (this._canvas) this._canvas.style.cursor = '';
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            e.stopPropagation();
            const wasActivated = planElementDragController.isActivated;
            void planElementDragController.onEnd();

            // If threshold was crossed → treat as a move (no selection event).
            // If never crossed → treat as a click → dispatch selection.
            if (!wasActivated && this._canvas && this._planCanvas) {
                const rect = this._canvas.getBoundingClientRect();
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;
                const elementId = this._planCanvas.hitTest(sx, sy, 10);
                if (elementId) {
                    // Phase 1 — route through SelectionBus so the 3D viewport
                    // highlights, the Properties Panel opens, and every other
                    // surface syncs.  Replaces the bypass-style raw event.
                    selectionBus.select(elementId, 'plan-view');
                }
            }
            return;
        }

        // ── Floor plan underlay drag commit ───────────────────────────────────
        if (this._underlayDrag) {
            this._underlayDrag = null;
            this._isDragging = false;
            if (this._canvas) this._canvas.style.cursor = '';
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            e.stopPropagation();
            const underlayTool = window.floorPlanUnderlayTool;
            const mesh = underlayTool?.getState?.()?.mesh;
            if (mesh) {
                console.log('[PlanViewInteraction] Underlay moved to', mesh.position.x.toFixed(3), mesh.position.z.toFixed(3));
                // F.events.2d — DOM dispatch removed; listener migrated to runtime.events
                window.runtime?.events?.emit('underlay:transform-changed', { x: mesh.position.x, z: mesh.position.z });
            }
            return;
        }

        // ── Level drag commit ─────────────────────────────────────────────────
        if (this._levelDrag) {
            const drag = this._levelDrag;
            this._levelDrag = null;
            this._isDragging = false;
            if (this._canvas) this._canvas.style.cursor = '';
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            e.stopPropagation();

            if (this._planCanvas) {
                const rect = this._canvas!.getBoundingClientRect();
                const endSy = e.clientY - rect.top;
                const newElevation = this._planCanvas.screenYToElevation(endSy);
                const rounded = Math.round(newElevation * 1000) / 1000;
                if (Math.abs(rounded - drag.startElevation) > 0.001) {
                    // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
                    window.runtime?.bus?.executeCommand('level.update', {
                        levelId: drag.levelId,
                        updates: { elevation: rounded },
                    })?.catch((e: Error) => console.error('[PlanViewInteraction] level.update failed:', e));
                    console.log('[PlanViewInteraction] Level elevation updated:', drag.levelId, rounded);
                }
                this._planCanvas.setSelectedLevelId?.(drag.levelId);
            }
            return;
        }

        if (this._scopeDrag) {
            this._applyScopeDragFromPointer(e, true);
            this._scopeDrag = null;
            this._isDragging = false;
            if (this._canvas) this._canvas.style.cursor = '';
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // ── Annotation drag commit (UpdateAnnotationCommand) ──────────────────
        if (this._annotDrag) {
            const drag = this._annotDrag;
            this._annotDrag = null;
            this._isDragging = false;
            if (this._canvas) this._canvas.style.cursor = '';
            (e as any).__pryzmToolHandled = true;
            e.preventDefault();
            e.stopPropagation();

            const ann = annotationStore.getById(drag.annotationId);
            if (ann) {
                // Capture final position from the live-preview store state
                const finalGeometry2D = { ...ann.geometry2D, modelPoints: ann.geometry2D.modelPoints?.map(p => ({ ...p })) ?? [] };
                const finalReferences = ann.references.map(r => ({
                    ...r,
                    cachedPosition: r.cachedPosition ? { ...r.cachedPosition } : undefined,
                }));

                // Restore original in the store so UpdateAnnotationCommand captures
                // the correct prevSnapshot (the pre-drag position).
                annotationStore.update({
                    id: drag.annotationId,
                    geometry2D: drag.origGeometry2D,
                    references: drag.origReferences,
                });

                // Commit final position through the command bus (undoable).
                // [P6-E.5.2] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
                // Note: { source: 'HUMAN_DIRECT' } logged; embed in UpdateAnnotationCommand ctor per TODO(E.5.x).
                const _annotCmd = new UpdateAnnotationCommand(drag.annotationId, {
                    geometry2D: finalGeometry2D,
                    references: finalReferences,
                });
                if (window.runtime?.bus) {
                    console.log('[PlanViewInteraction] dispatch source: HUMAN_DIRECT — TODO(E.5.x): embed in ctor');
                    window.runtime.bus.executeCommand(_annotCmd.type, _annotCmd);
                    console.log('[PlanViewInteraction] Annotation moved:', drag.annotationId);
                }

                // Keep annotation selected after move
                window.__pryzmSelectedAnnotationId = drag.annotationId;
                window.runtime?.events?.emit('pryzm-element-selected', { elementId: drag.annotationId, annotationId: drag.annotationId, source: 'plan-view' });
            }
            return;
        }

        if (this._isDragging) {
            this._isDragging = false;
            return;
        }

        if (!this._canvas || !this._planCanvas || !this._viewId) return;

        // §C19-P16: Do not fire selection while a plan tool is active.
        // Tool handlers intercept the same click to place elements; running
        // hitTest on top would both place and immediately re-select the element
        // under the cursor from the old drawing, producing confusing behaviour.
        const tm = window.toolManager;
        if (tm?.isAnyToolActive?.()) return;

        // Do not fire selection while the underlay scale/rotate tool is active.
        // Those tools own the click to place reference points; element selection
        // would fight them for the same event.
        if (window.__underlayScaleActive) return;

        const rect = this._canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // ── Level head click → rename editor (section/elevation views) ───────
        const levelHeadClick = this._planCanvas.hitTestLevelHead?.(sx, sy);
        if (levelHeadClick) {
            this._planCanvas.setSelectedLevelId?.(levelHeadClick.levelId);
            window.runtime?.events?.emit('pryzm-level-selected', { levelId: levelHeadClick.levelId, source: 'plan-view' });
            this._openLevelNameEditor(levelHeadClick, sx, sy);
            return;
        }

        // ── Level datum line click → select + elevation editor ────────────────
        const levelLineId = this._planCanvas.hitTestLevel?.(sx, sy, 10) ?? null;
        if (levelLineId) {
            const bimManager = window.bimManager;
            const levels = bimManager?.getLevels?.() ?? [];
            const level = levels.find((l: any) => l.id === levelLineId);
            this._planCanvas.setSelectedLevelId?.(levelLineId);
            window.runtime?.events?.emit('pryzm-level-selected', { levelId: levelLineId, level, source: 'plan-view' });
            if (level) this._openLevelElevEditor({ levelId: levelLineId, elevation: level.elevation ?? level.height ?? 0 }, sx, sy);
            return;
        }

        // ── Grid dimension label click → inline editor ────────────────────────
        const dimHit = this._planCanvas.hitTestGridDim?.(sx, sy);
        if (dimHit) {
            this._openGridDimInlineEditor(dimHit, sx, sy);
            return;
        }

        // ── Grid line click → select grid ──────────────────────────────────
        const gridId = this._planCanvas.hitTestGrid?.(sx, sy, GRID_HIT_RADIUS_PX) ?? null;
        if (gridId) {
            const bimManager = window.bimManager;
            const grids = bimManager?.getGrids?.() ?? [];
            const grid = grids.find((g: any) => g.id === gridId);
            this._planCanvas.setSelectedGridId?.(gridId);
            console.log('[PlanViewInteraction] Grid selected:', gridId);
            // F.events.2d — DOM dispatch removed; listener migrated to runtime.events
            window.runtime?.events?.emit('pryzm-grid-selected', { gridId, grid, source: 'plan-view' });
            return;
        }

        const annotationId = this._planCanvas.hitTestAnnotation(sx, sy, 12);
        if (annotationId) {
            window.__pryzmSelectedAnnotationId = annotationId;
            this._planCanvas.setSelectedGridId?.(null);
            window.runtime?.events?.emit('pryzm-element-selected', { elementId: annotationId, annotationId, source: 'plan-view' });
            return;
        }

        const elementId = this._planCanvas.hitTest(sx, sy, 10);
        if (elementId) {
            window.__pryzmSelectedAnnotationId = null;
            this._planCanvas.setSelectedGridId?.(null);
            console.log('[PlanViewInteraction] Element selected via plan view click:', elementId);
            // Phase 1 — Cross-View Selection Parity.  Bus.select():
            //   1. Calls SelectionManager.selectById() → 3D viewport highlight
            //      + transform gizmo + 'bim-selection-changed' event.
            //   2. Properties Panel auto-opens (subscribed to bim-selection-changed).
            //   3. SVP / Project Browser / Schedule / Workbench all stay in sync
            //      because they subscribe to either the bus or the raw event that
            //      SelectionManager.select() re-emits with source='3d'.
            //   4. PlanViewManager's own bim-selection-changed handler (line 141)
            //      schedules a re-render so this canvas paints the highlight too.
            selectionBus.select(elementId, 'plan-view');
        } else if (this._hitTestUnderlay(sx, sy)) {
            // Hit the floor plan underlay — select it via the underlay tool
            const underlayTool = window.floorPlanUnderlayTool;
            if (underlayTool) {
                console.log('[PlanViewInteraction] Floor plan underlay selected via plan view click');
                underlayTool.select();
            }
        } else {
            // Clicked empty space — clear grid selection and deselect underlay if selected
            this._planCanvas.setSelectedGridId?.(null);
            // Do not deselect underlay while the reference scale tool is picking points
            if (!window.__underlayScaleActive) {
                const underlayTool = window.floorPlanUnderlayTool;
                if (underlayTool?.getState()?.isSelected) {
                    underlayTool.deselect();
                }
            }
        }
    }

    /**
     * Hit-test the floor plan underlay in plan view.
     * Converts screen coordinates to world XZ and checks if the click falls
     * within the underlay mesh's bounding rectangle (handling rotation and scale).
     */
    private _hitTestUnderlay(sx: number, sy: number): boolean {
        // Do not intercept clicks while the reference scale tool is in pick mode
        if (window.__underlayScaleActive) return false;
        const ref = floorPlanUnderlayRef.current;
        if (!ref || ref.visible === false || !this._planCanvas) return false;
        const { mesh, planWidthMeters, planHeightMeters } = ref;
        if (!mesh) return false;

        const { worldX, worldZ } = this._planCanvas.screenToWorld(sx, sy);

        // Convert world XZ point into mesh local space.
        // worldToLocal() inverts the full world matrix (position + rotation + scale),
        // so the result is in the original PlaneGeometry coordinate space.
        // The geometry half-extents in local space are:
        //   halfW = planWidthMeters(ref) / (2 * scale.x)   [= original half-width]
        //   halfH = planHeightMeters(ref) / (2 * scale.y)  [= original half-height]
        mesh.updateWorldMatrix(true, false);
        const worldPt = new THREE.Vector3(worldX, mesh.position.y, worldZ);
        const local = mesh.worldToLocal(worldPt.clone());

        const sx1 = Math.abs(mesh.scale.x) > 1e-6 ? mesh.scale.x : 1;
        const sy1 = Math.abs(mesh.scale.y) > 1e-6 ? mesh.scale.y : 1;
        const halfW = planWidthMeters  / (2 * sx1);
        const halfH = planHeightMeters / (2 * sy1);

        return Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH;
    }

    /**
     * Opens a tiny inline editor positioned over the dimension label so the user
     * can type a new absolute position for the target grid.
     */
    private _openGridDimInlineEditor(
        hit: { gridId: string; targetPosition: number },
        sx: number,
        sy: number,
    ): void {
        const canvas = this._canvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();

        document.getElementById('__pryzm-dim-editor')?.remove();

        const input = document.createElement('input');
        input.id = '__pryzm-dim-editor';
        input.type = 'number';
        input.step = '0.001';
        input.value = String(hit.targetPosition);
        Object.assign(input.style, {
            position: 'fixed',
            left:   `${rect.left + sx - 36}px`,
            top:    `${rect.top  + sy - 10}px`,
            width:  '80px',
            height: '20px',
            fontSize: '11px',
            padding: '1px 4px',
            borderRadius: '3px',
            border: '1.5px solid #7c3aed',
            background: '#fff',
            color: '#1f2937',
            zIndex: '99999',
            outline: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        });

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            if (input.parentNode) input.remove();
            const newPos = parseFloat(input.value);
            if (!Number.isFinite(newPos) || newPos === hit.targetPosition) return;
            // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
            window.runtime?.bus?.executeCommand('grid.update', { gridId: hit.gridId, updates: { position: newPos } })
                ?.catch((e: Error) => console.error('[PlanViewInteraction] grid.update failed:', e));
        };

        input.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter') { commit(); }
            if (ev.key === 'Escape') { committed = true; if (input.parentNode) input.remove(); }
            ev.stopPropagation();
        });
        input.addEventListener('blur', () => { commit(); });
        document.body.appendChild(input);
        input.select();
        input.focus();
    }

    /**
     * Opens a floating numeric input for editing a level's elevation in-place.
     * Called when the user clicks on a level datum line in a section/elevation view.
     */
    private _openLevelElevEditor(
        hit: { levelId: string; elevation: number },
        sx: number, sy: number,
    ): void {
        if (!this._canvas) return;
        document.querySelector('#__pryzm-level-elev-editor')?.remove();
        const rect = this._canvas.getBoundingClientRect();
        const input = document.createElement('input');
        input.id = '__pryzm-level-elev-editor';
        input.type = 'number';
        input.step = '0.001';
        input.value = String(hit.elevation);
        Object.assign(input.style, {
            position: 'fixed',
            left:   `${rect.left + sx - 36}px`,
            top:    `${rect.top  + sy - 10}px`,
            width:  '90px',
            height: '20px',
            fontSize: '11px',
            padding: '1px 4px',
            borderRadius: '3px',
            border: '1.5px solid #1e3a8a',
            background: '#fff',
            color: '#1f2937',
            zIndex: '99999',
            outline: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        });

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            if (input.parentNode) input.remove();
            const newElev = parseFloat(input.value);
            if (!Number.isFinite(newElev) || Math.abs(newElev - hit.elevation) < 0.001) return;
            // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
            window.runtime?.bus?.executeCommand('level.update', {
                levelId: hit.levelId,
                updates: { elevation: Math.round(newElev * 1000) / 1000 },
            })?.catch((e: Error) => console.error('[PlanViewInteraction] level.update (inline) failed:', e));
            console.log('[PlanViewInteraction] Level elevation edited inline:', hit.levelId, newElev);
        };

        input.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter') { commit(); }
            if (ev.key === 'Escape') { committed = true; if (input.parentNode) input.remove(); }
            ev.stopPropagation();
        });
        input.addEventListener('blur', () => { commit(); });
        document.body.appendChild(input);
        input.select();
        input.focus();
    }

    /**
     * Opens a floating text input for renaming a level.
     * Called when the user clicks on a level head bubble in a section/elevation view.
     */
    private _openLevelNameEditor(
        hit: { levelId: string; elevation: number },
        sx: number, sy: number,
    ): void {
        if (!this._canvas) return;
        document.querySelector('#__pryzm-level-name-editor')?.remove();
        const rect = this._canvas.getBoundingClientRect();
        const bimManager = window.bimManager;
        const levels = bimManager?.getLevels?.() ?? [];
        const level = levels.find((l: any) => l.id === hit.levelId);
        if (!level) return;

        const input = document.createElement('input');
        input.id = '__pryzm-level-name-editor';
        input.type = 'text';
        input.value = level.name ?? '';
        Object.assign(input.style, {
            position: 'fixed',
            left:   `${rect.left + sx + 16}px`,
            top:    `${rect.top  + sy - 22}px`,
            width:  '110px',
            height: '20px',
            fontSize: '11px',
            padding: '1px 4px',
            borderRadius: '3px',
            border: '1.5px solid #1e3a8a',
            background: '#fff',
            color: '#1f2937',
            zIndex: '99999',
            outline: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        });

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            if (input.parentNode) input.remove();
            const newName = input.value.trim();
            if (!newName || newName === level.name) return;
            // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
            window.runtime?.bus?.executeCommand('level.update', {
                levelId: hit.levelId,
                updates: { name: newName },
            })?.catch((e: Error) => console.error('[PlanViewInteraction] level.update (rename) failed:', e));
            console.log('[PlanViewInteraction] Level renamed:', hit.levelId, newName);
        };

        input.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter') { commit(); }
            if (ev.key === 'Escape') { committed = true; if (input.parentNode) input.remove(); }
            ev.stopPropagation();
        });
        input.addEventListener('blur', () => { commit(); });
        document.body.appendChild(input);
        input.select();
        input.focus();
    }

    private _onContextMenu(e: MouseEvent): void {
        e.preventDefault();
        e.stopPropagation();
    }

    private _showOverrideContextMenu(e: MouseEvent): void {
        if (!this._canvas || !this._planCanvas || !this._viewId) return;
        const rect = this._canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const elementId = this._planCanvas.hitTest(sx, sy, 10);
        if (!elementId) return;
        e.preventDefault();
        e.stopPropagation();

        document.querySelector('.svp-override-context-menu')?.remove();
        const menu = document.createElement('div');
        menu.className = 'svp-override-context-menu';
        const hide = document.createElement('button');
        hide.type = 'button';
        hide.textContent = 'Hide in View';
        const isolate = document.createElement('button');
        isolate.type = 'button';
        isolate.textContent = 'Isolate in View';
        const ghost = document.createElement('button');
        ghost.type = 'button';
        ghost.textContent = 'Ghost in View';
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = 'Clear Overrides';
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary (inline per override type)
        hide.addEventListener('click', () => {
            window.runtime?.bus?.executeCommand('view.hideElement', { viewId: this._viewId!, elementId })
                ?.catch((e: Error) => console.error('[PlanViewInteraction] view.hideElement failed:', e));
            menu.remove();
        });
        isolate.addEventListener('click', () => {
            window.runtime?.bus?.executeCommand('view.isolateElement', { viewId: this._viewId!, elementId })
                ?.catch((e: Error) => console.error('[PlanViewInteraction] view.isolateElement failed:', e));
            menu.remove();
        });
        ghost.addEventListener('click', () => {
            window.runtime?.bus?.executeCommand('view.setGraphicOverride', {
                viewId: this._viewId!,
                targetKind: 'element',
                targetId: elementId,
                state: 'projection',
                patch: { visible: true, line: { opacity: 0.35 }, fill: { opacity: 0.15 }, ghostStyle: 'fade', ghostOpacity: 0.25 },
            })?.catch((e: Error) => console.error('[PlanViewInteraction] view.setGraphicOverride failed:', e));
            menu.remove();
        });
        clear.addEventListener('click', () => {
            window.runtime?.bus?.executeCommand('view.clearOverride', { viewId: this._viewId!, targetKind: 'element', targetId: elementId })
                ?.catch((e: Error) => console.error('[PlanViewInteraction] view.clearOverride failed:', e));
            menu.remove();
        });
        menu.appendChild(hide);
        menu.appendChild(isolate);
        menu.appendChild(ghost);
        menu.appendChild(clear);
        menu.style.left = `${Math.min(e.clientX + 4, window.innerWidth - 170)}px`;
        menu.style.top = `${Math.min(e.clientY + 4, window.innerHeight - 140)}px`;
        document.body.appendChild(menu);
        const dismiss = (event: MouseEvent) => {
            if (!menu.contains(event.target as Node)) {
                menu.remove();
                document.removeEventListener('mousedown', dismiss);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
    }

    private _applyScopeDragFromPointer(e: MouseEvent, final: boolean): void {
        if (!this._scopeDrag || !this._canvas || !this._planCanvas) return;
        const now = performance.now();
        if (!final && now - this._scopeDrag.lastUpdate < 80) return;
        this._scopeDrag.lastUpdate = now;
        const ann = annotationStore.getById(this._scopeDrag.annotationId);
        const viewDef = viewDefinitionStore.get(this._scopeDrag.linkedViewId);
        if (!ann || !viewDef) return;

        const rect = this._canvas.getBoundingClientRect();
        const p = this._planCanvas.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const volume = this._resolveSectionVolumeForDrag(ann, viewDef);
        if (!volume) return;
        const origin = { x: volume.origin[0], y: volume.origin[1], z: volume.origin[2] };
        const dir = this._normalize2({ x: volume.direction[0], z: volume.direction[2] });
        const right = { x: -dir.z, z: dir.x };
        const rel = { x: p.worldX - origin.x, z: p.worldZ - origin.z };
        const along = rel.x * dir.x + rel.z * dir.z;
        const side = rel.x * right.x + rel.z * right.z;
        let nextVolume: ViewSectionVolume = {
            ...volume,
            origin: [volume.origin[0], volume.origin[1], volume.origin[2]],
            direction: [volume.direction[0], volume.direction[1], volume.direction[2]],
        };
        let nextCrop: ViewDefinition['crop'] = viewDef.crop;

        if (this._scopeDrag.handle === 'depth') {
            const depth = Math.max(nextVolume.near + 0.25, Number(along.toFixed(3)));
            nextVolume = { ...nextVolume, far: depth };
            nextCrop = {
                ...(viewDef.crop ?? { enabled: true }),
                enabled: true,
                farClip: {
                    ...(viewDef.crop?.farClip ?? {}),
                    offset: depth,
                },
            };
        } else if (this._scopeDrag.handle === 'width-left' || this._scopeDrag.handle === 'width-right') {
            const width = Number(Math.max(0.5, Math.abs(side) * 2).toFixed(3));
            const half = width / 2;
            nextVolume = { ...nextVolume, width };
            // For section/elevation views, the crop region horizontal axis (min[0], max[0])
            // must be stored as ABSOLUTE world-H coordinates so that PlanViewCanvas._applyCropClip()
            // can pass them directly to worldToScreen().
            // worldH = world X when the view looks mostly along ±Z (|dir.z| ≥ |dir.x|),
            // worldH = world Z when the view looks mostly along ±X (|dir.x| > |dir.z|).
            // originH is the section/elevation origin's component on that axis.
            const isVerticalView = viewDef.viewType === 'section' || viewDef.viewType === 'elevation';
            const hAxisIsX = Math.abs(dir.z) >= Math.abs(dir.x);
            const originH = isVerticalView ? (hAxisIsX ? origin.x : origin.z) : 0;
            nextCrop = {
                ...(viewDef.crop ?? { enabled: true }),
                enabled: true,
                region: {
                    min: [Number((originH - half).toFixed(3)), viewDef.crop?.region?.min?.[1] ?? origin.y],
                    max: [Number((originH + half).toFixed(3)), viewDef.crop?.region?.max?.[1] ?? origin.y + nextVolume.height],
                },
                farClip: {
                    ...(viewDef.crop?.farClip ?? {}),
                    offset: nextVolume.far,
                },
            };
        } else if (this._scopeDrag.handle === 'cut-plane') {
            const shift = Number(along.toFixed(3));
            const nx = Number((origin.x + dir.x * shift).toFixed(3));
            const nz = Number((origin.z + dir.z * shift).toFixed(3));
            nextVolume = { ...nextVolume, origin: [nx, origin.y, nz] };
        }

        const nextCropRegion = this._cropRegionFromSectionVolume(nextVolume);
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('view.updateDefinition', {
            viewId: viewDef.id,
            updates: {
                spatial: {
                    sectionVolume: nextVolume,
                    cropRegion: nextCropRegion,
                    sectionPlane: {
                        normal: [dir.x, 0, dir.z],
                        constant: -(dir.x * nextVolume.origin[0] + dir.z * nextVolume.origin[2]),
                    },
                },
            },
        })?.catch((e: Error) => console.error('[PlanViewInteraction] view.updateDefinition failed:', e));
        if (nextCrop !== viewDef.crop) {
            window.runtime?.bus?.executeCommand('view.setCrop', { viewId: viewDef.id, crop: nextCrop ?? null })
                ?.catch((e: Error) => console.error('[PlanViewInteraction] view.setCrop failed:', e));
        }
    }

    private _resolveSectionVolumeForDrag(ann: AnnotationElement, viewDef: ViewDefinition): ViewSectionVolume | null {
        if (viewDef.spatial.sectionVolume) return viewDef.spatial.sectionVolume;
        const far = Math.max(0.25, viewDef.crop?.farClip?.offset ?? viewDef.spatial.viewRange?.farOffset ?? 8);
        const height = Math.max(
            0.25,
            (viewDef.crop?.region?.max?.[1] ?? viewDef.spatial.boundingBox?.max?.[1] ?? 3) -
            (viewDef.crop?.region?.min?.[1] ?? viewDef.spatial.boundingBox?.min?.[1] ?? 0),
        );
        if (ann.type === 'section-mark') {
            const pts = ann.geometry2D.modelPoints;
            if (!pts || pts.length < 2) return null;
            const a = { x: pts[0].x, z: pts[0].z };
            const b = { x: pts[1].x, z: pts[1].z };
            const fallback = this._normalize2({ x: -(b.z - a.z), z: b.x - a.x });
            const dir = this._normalize2((ann.parameters.tailDirection as { x: number; z: number } | undefined) ?? fallback);
            return {
                origin: [Number(((a.x + b.x) / 2).toFixed(3)), viewDef.crop?.region?.min?.[1] ?? 0, Number(((a.z + b.z) / 2).toFixed(3))],
                direction: [dir.x, 0, dir.z],
                width: Math.max(0.5, Math.hypot(b.x - a.x, b.z - a.z)),
                height,
                near: 0,
                far,
            };
        }
        if (ann.type === 'elevation-mark') {
            const pt = ann.geometry2D.modelPoints?.[0];
            if (!pt) return null;
            const dir = this._normalize2((ann.parameters.facingDirection as { x: number; z: number } | undefined) ?? { x: 0, z: -1 });
            const width = Math.max(0.5, (viewDef.crop?.region?.max?.[0] ?? 3) - (viewDef.crop?.region?.min?.[0] ?? -3));
            return {
                origin: [Number(pt.x.toFixed(3)), viewDef.crop?.region?.min?.[1] ?? 0, Number(pt.z.toFixed(3))],
                direction: [dir.x, 0, dir.z],
                width,
                height,
                near: 0,
                far,
            };
        }
        return null;
    }

    private _normalize2(v: { x: number; z: number }): { x: number; z: number } {
        const len = Math.hypot(v.x, v.z) || 1;
        return { x: v.x / len, z: v.z / len };
    }

    private _cropRegionFromSectionVolume(volume: ViewSectionVolume): NonNullable<ViewDefinition['spatial']['cropRegion']> {
        const origin = { x: volume.origin[0], z: volume.origin[2] };
        const dir = this._normalize2({ x: volume.direction[0], z: volume.direction[2] });
        const right = { x: -dir.z, z: dir.x };
        const half = Math.max(0.005, volume.width / 2);
        const near = Math.max(0, volume.near);
        const far = Math.max(near, volume.far);
        const depths = [near, far];
        const sides = [-half, half];
        const xs: number[] = [];
        const zs: number[] = [];
        for (const depth of depths) {
            for (const side of sides) {
                xs.push(origin.x + dir.x * depth + right.x * side);
                zs.push(origin.z + dir.z * depth + right.z * side);
            }
        }
        const padding = 0.05;
        return {
            minX: Number((Math.min(...xs) - padding).toFixed(3)),
            minZ: Number((Math.min(...zs) - padding).toFixed(3)),
            maxX: Number((Math.max(...xs) + padding).toFixed(3)),
            maxZ: Number((Math.max(...zs) + padding).toFixed(3)),
        };
    }

    /**
     * Public snap query — delegates to the universal PlanSnapEngine
     * (Contract 32).  Surfaces all 7 snap families:
     *   endpoint, midpoint, perpendicular, grid-line, grid-intersection,
     *   intersection, nearest.
     */
    querySnap(sx: number, sy: number): { worldX: number; worldZ: number; snapType: PlanSnapType; sourceId?: string } | null {
        return this._snapEngine.querySnap(sx, sy);
    }

    /**
     * Phase 3 (Sprint 2) — Hover element detection.
     *
     * Traverses all LineSegments in the current drawing and finds the element
     * whose projected geometry comes closest to the cursor. Returns the UUID
     * of the nearest element within HOVER_RADIUS_PX, or null.
     *
     * This runs on every mousemove. Performance is acceptable for typical plan
     * drawings (< 2 000 segments → < 1 ms per call on modern hardware).
     */
    private _queryHoveredElement(sx: number, sy: number): string | null {
        if (!this._viewId || !this._planCanvas) return null;
        const drawing = viewTechnicalDrawingCache.get(this._viewId);
        if (!drawing) return null;

        let bestId: string | null = null;
        let bestDist = HOVER_RADIUS_PX;

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            const uuid = (
                lookupElementUUID(drawing as object, child)
                ?? child.userData?.elementUUID
                ?? child.userData?.elementId
                ?? child.parent?.userData?.elementUUID
                ?? child.parent?.userData?.elementId
            ) as string | undefined;
            if (!uuid) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;

            for (let i = 0; i < posAttr.count - 1; i += 2) {
                _tmpV.set(posAttr.getX(i),     posAttr.getY(i),     posAttr.getZ(i)).applyMatrix4(mat);
                _tmpV2.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);

                const p1 = this._planCanvas!.worldToScreen(_tmpV.x,  _tmpV.z);
                const p2 = this._planCanvas!.worldToScreen(_tmpV2.x, _tmpV2.z);

                const dist = _distToSegment(sx, sy, p1.sx, p1.sy, p2.sx, p2.sy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestId   = uuid;
                }
            }
        });

        return bestId;
    }
}

function _distToSegment(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number,
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
