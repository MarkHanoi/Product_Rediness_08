/**
 * DetailViewTool — DOC-1.12
 *
 * A two-click tool that lets the user define a detail view crop region by
 * clicking two XZ points in the active plan view. On commit it dispatches
 * `CreateDetailViewCommand` with the picked crop region.
 *
 * State machine (§02 §6.1):
 *   IDLE → (first click) → DRAWING → (second click) → COMMITTED → IDLE
 *
 * Contract compliance:
 *   §01 §2    — All store mutations via CommandManager.execute(); tool never
 *               writes to any store directly
 *   §02 §6.1  — Tool reads scene/world only; dispatch via command; no store writes
 *   §05       — No DOM except optional preview rectangle on the same canvas; no @thatopen/ui
 *   §07       — No server routes; fully client-side
 *
 * Usage (from UI / toolbar):
 *   toolManager.setActiveTool('detail-view', { parentViewId: 'view-id-here' });
 *   // Tool guides the user through two clicks, then auto-deactivates.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { BaseTool } from './BaseTool.js';
import { ToolState } from './types.js';
import type { ToolContext } from './types.js';
import { CreateDetailViewCommand } from '@pryzm/command-registry';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_DETAIL_SCALE = 20;  // 1:20
const PREVIEW_COLOR_FILL   = 'rgba(59, 130, 246, 0.08)';
const PREVIEW_COLOR_STROKE = 'rgba(59, 130, 246, 0.85)';
const PREVIEW_LINE_WIDTH   = 1.5;

// ── Tool ──────────────────────────────────────────────────────────────────────

export class DetailViewTool extends BaseTool {
    readonly name = 'detail-view' as const;

    // State
    private _parentViewId: string | null = null;
    private _firstCorner:  THREE.Vector3 | null = null;
    private _previewEl:    HTMLDivElement | null = null;

    constructor(context: ToolContext) {
        super(context);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    activate(options?: Record<string, unknown>): void {
        this._parentViewId = typeof options?.['parentViewId'] === 'string'
            ? options['parentViewId']
            : null;

        if (!this._parentViewId) {
            console.warn('[DetailViewTool] activate() called without parentViewId option — deactivating immediately.');
            this.deactivate();
            return;
        }

        this.onActivate();
        this.setState(ToolState.IDLE);
        this._firstCorner = null;
        this._destroyPreview();

        // Disable orbital camera while picking points (§02 §6.1)
        this.enableCameraControls(false);

        const onPointerDown = (e: PointerEvent) => this._onPointerDown(e);
        const onPointerMove = (e: PointerEvent) => this._onPointerMove(e);
        const onKeyDown     = (e: KeyboardEvent) => this._onKeyDown(e);

        this.attachListener(this.canvas, 'pointerdown', onPointerDown as EventListener);
        this.attachListener(this.canvas, 'pointermove', onPointerMove as EventListener);
        this.attachListener(document,    'keydown',     onKeyDown     as EventListener);

        console.log(`[DetailViewTool] Activated — parentViewId=${this._parentViewId}. Click first corner.`);
        this._showStatusHint('Click the first corner of the detail region');
    }

    deactivate(): void {
        this.enableCameraControls(true);
        this._destroyPreview();
        this._hideStatusHint();
        this._firstCorner  = null;
        this._parentViewId = null;
        this.onDeactivate();
        console.log('[DetailViewTool] Deactivated.');
    }

    cancel(): void {
        this._destroyPreview();
        this._hideStatusHint();
        this._firstCorner = null;
        this.setState(ToolState.IDLE);
        this.enableCameraControls(true);
        console.log('[DetailViewTool] Cancelled.');
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    private _onPointerDown(e: PointerEvent): void {
        if (e.button !== 0) return; // left-click only
        e.stopPropagation();

        const hit = this.getWorldPoint(e, 0);
        if (!hit) return;

        if (this._state === ToolState.IDLE) {
            // First corner picked
            this._firstCorner = hit.clone();
            this.setState(ToolState.DRAWING);
            this._showStatusHint('Click the second corner of the detail region');
            console.log(
                `[DetailViewTool] First corner: x=${hit.x.toFixed(3)} z=${hit.z.toFixed(3)}`,
            );
        } else if (this._state === ToolState.DRAWING && this._firstCorner) {
            // Second corner picked — commit
            this._commit(this._firstCorner, hit);
        }
    }

    private _onPointerMove(e: PointerEvent): void {
        if (this._state !== ToolState.DRAWING || !this._firstCorner) return;

        const hit = this.getWorldPoint(e, 0);
        if (!hit) return;

        this._updatePreviewRect(this._firstCorner, hit, e);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.cancel();
        }
    }

    // ── Commit ────────────────────────────────────────────────────────────────

    private _commit(cornerA: THREE.Vector3, cornerB: THREE.Vector3): void {
        const minX = Math.min(cornerA.x, cornerB.x);
        const maxX = Math.max(cornerA.x, cornerB.x);
        const minZ = Math.min(cornerA.z, cornerB.z);
        const maxZ = Math.max(cornerA.z, cornerB.z);

        if ((maxX - minX) < 0.1 || (maxZ - minZ) < 0.1) {
            console.warn('[DetailViewTool] Crop region too small — minimum 0.1 m in each axis.');
            this.cancel();
            return;
        }

        const viewId   = crypto.randomUUID();
        const viewName = `Detail ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        const cmd = new CreateDetailViewCommand({
            id:           viewId,
            name:         viewName,
            parentViewId: this._parentViewId!,
            cropRegion:   { minX, minZ, maxX, maxZ },
            scale:        DEFAULT_DETAIL_SCALE,
        });

        // §01 §2 — dispatch via CommandManager; never mutate store directly
        const commandManager = window.commandManager; // TODO(TASK-06)
        if (commandManager && typeof commandManager.execute === 'function') {
            // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
            if (window.runtime?.bus) { window.runtime.bus.executeCommand('detail-view.create', {}).catch(() => {}); }
            commandManager.execute(cmd);
            console.log(
                `[DetailViewTool] Committed detail view id=${viewId} ` +
                `crop=[${minX.toFixed(2)},${minZ.toFixed(2)} → ${maxX.toFixed(2)},${maxZ.toFixed(2)}]`,
            );
        } else {
            console.error('[DetailViewTool] commandManager not found on window — command not executed.');
        }

        this._destroyPreview();
        this._hideStatusHint();
        this.setState(ToolState.IDLE);
        this.enableCameraControls(true);

        // Auto-deactivate after a successful pick
        this.deactivate();
    }

    // ── Preview rectangle ─────────────────────────────────────────────────────

    /**
     * Draws a 2D overlay rectangle on the canvas DOM element showing the
     * crop region being picked. Uses absolute-positioned DOM overlay for
     * simplicity (no WebGL draw calls; no scene mutation).
     */
    private _updatePreviewRect(
        cornerA: THREE.Vector3,
        cornerB: THREE.Vector3,
        _event:  PointerEvent,
    ): void {
        // Project 3D world points to screen using the camera
        const cam = this.world.camera.three;
        const toScreen = (pt: THREE.Vector3): { x: number; y: number } => {
            const ndc = pt.clone().project(cam);
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: ((ndc.x + 1) / 2) * rect.width,
                y: ((1 - ndc.y) / 2) * rect.height,
            };
        };

        const sA = toScreen(cornerA);
        const sB = toScreen(cornerB);

        const left   = Math.min(sA.x, sB.x);
        const top    = Math.min(sA.y, sB.y);
        const width  = Math.abs(sB.x - sA.x);
        const height = Math.abs(sB.y - sA.y);

        if (!this._previewEl) {
            this._previewEl = document.createElement('div');
            Object.assign(this._previewEl.style, {
                position:      'absolute',
                pointerEvents: 'none',
                zIndex:        '9999',
                boxSizing:     'border-box',
            });

            const canvasRect = this.canvas.getBoundingClientRect();
            this._previewEl.style.top  = `${canvasRect.top  + window.scrollY}px`;
            this._previewEl.style.left = `${canvasRect.left + window.scrollX}px`;

            const wrapper = document.createElement('div');
            Object.assign(wrapper.style, {
                position: 'relative',
                width:    `${canvasRect.width}px`,
                height:   `${canvasRect.height}px`,
                overflow: 'hidden',
            });

            const rect = document.createElement('div');
            rect.id = 'detail-view-preview-rect';
            Object.assign(rect.style, {
                position:        'absolute',
                background:      PREVIEW_COLOR_FILL,
                border:          `${PREVIEW_LINE_WIDTH}px solid ${PREVIEW_COLOR_STROKE}`,
                boxSizing:       'border-box',
                pointerEvents:   'none',
            });

            wrapper.appendChild(rect);
            this._previewEl.appendChild(wrapper);
            document.body.appendChild(this._previewEl);
        }

        const rect = this._previewEl.querySelector<HTMLDivElement>('#detail-view-preview-rect');
        if (rect) {
            rect.style.left   = `${left}px`;
            rect.style.top    = `${top}px`;
            rect.style.width  = `${width}px`;
            rect.style.height = `${height}px`;
        }
    }

    private _destroyPreview(): void {
        if (this._previewEl && this._previewEl.parentNode) {
            this._previewEl.parentNode.removeChild(this._previewEl);
        }
        this._previewEl = null;
    }

    // ── Status hint ───────────────────────────────────────────────────────────

    private _showStatusHint(message: string): void {
        this._hideStatusHint();
        const el = document.createElement('div');
        el.id = 'detail-view-tool-hint';
        Object.assign(el.style, {
            position:    'fixed',
            bottom:      '80px',
            left:        '50%',
            transform:   'translateX(-50%)',
            background:  'rgba(15,23,42,0.85)',
            color:       '#f8fafc',
            padding:     '6px 14px',
            borderRadius: '6px',
            fontSize:    '12px',
            fontFamily:  'system-ui, sans-serif',
            zIndex:      '10000',
            pointerEvents: 'none',
            whiteSpace:  'nowrap',
        });
        el.textContent = message;
        document.body.appendChild(el);
    }

    private _hideStatusHint(): void {
        const el = document.getElementById('detail-view-tool-hint');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // ── BaseTool abstract ─────────────────────────────────────────────────────

    protected clearAllPreviews(): void {
        this._destroyPreview();
        this._hideStatusHint();
    }
}
