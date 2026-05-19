/**
 * @file src/tools/operations/ReferenceEditTool.ts
 *
 * Reference Edit Mode — a point-collection orchestrator that lets the user
 * trace new elements along existing geometry as reference (per plan §6.8).
 *
 * Phase 1 scope: creates a new WALL by snapping start+end points to existing
 * element geometry.  The collected points are handed off to CreateWallCommand.
 *
 * Interaction flow:
 *   1. SelectionOverlay calls activate(elementId, elementType)
 *   2. Instruction: "Hover over elements to highlight — click to snap start point"
 *   3. Canvas hover → bim-canvas-mouse-move → hover highlight on nearest element
 *   4. User clicks → P1 (snapped to nearest element geometry) recorded
 *   5. Instruction: "Click end point — Enter to finish, Esc to cancel"
 *   6. User clicks → P2 recorded
 *   7. On Enter: CreateWallCommand executed with (P1, P2) + current level settings
 *   8. Esc: cancel, clear highlights
 *
 * Hover highlighting:
 *   Material emissive override on the hovered Three.js mesh (userData.elementId).
 *   The override is transient (no store mutation) and always reverted on tool exit.
 *
 * Contract:
 *   §01 §2.1 — mutations via commandManager.execute() only
 *   §04 §2   — Tool layer
 */

import { OperationToolBase } from './OperationToolBase.js';
import type { OperationId } from './ElementCapabilities.js';
import { CreateWallCommand } from '@pryzm/command-registry';
import type { CommandManager } from '@pryzm/command-registry';
import type { Point3D } from '@pryzm/core-app-model';

export class ReferenceEditTool extends OperationToolBase {
    get operationId(): OperationId { return 'reference-edit'; }

    private _points:        Point3D[] = [];
    private _hoveredMesh:   any       = null; // THREE.Mesh — typed as any to avoid THREE import at module level
    private _savedEmissive: any       = null; // Original emissive colour

    constructor(private readonly _cmd: CommandManager) {
        super();
    }

    activate(elementId: string, elementType: string): void {
        this._baseActivate(elementId, elementType);
        this._points = [];
        this._resetStep();

        this._setCursor('crosshair');
        this._showInstructions('Hover over elements to highlight — click to snap start point');

        // Hover highlight
        const onMove = (e: Event) => {
            const { mesh } = (e as CustomEvent).detail ?? {};
            this._updateHoverHighlight(mesh ?? null);
        };
        this._addListener('bim-canvas-mesh-hover', onMove as EventListener, window);

        // Click to collect point
        const onClick = (e: Event) => {
            const { worldPoint } = (e as CustomEvent).detail ?? {};
            if (!worldPoint) return;
            this._collectPoint(worldPoint as Point3D);
        };
        this._addListener('bim-canvas-world-click', onClick as EventListener, window);

        // Enter to finish
        const onKey = (e: Event) => {
            const ke = e as KeyboardEvent;
            if (ke.key === 'Enter') this._finish();
        };
        this._addListener('keydown', onKey as EventListener, window);
    }

    override cancel(): void {
        this._clearHoverHighlight();
        this._points = [];
        super.cancel();
    }

    private _collectPoint(p: Point3D): void {
        this._points.push({ ...p });
        console.log(`[ReferenceEditTool] Point ${this._points.length}:`, p);

        if (this._points.length === 1) {
            this._nextStep(`Start point set — click end point. Press Enter to finish or Esc to cancel`);
        } else {
            this._showInstructions(`${this._points.length} points — click more or press Enter to finish`);
        }
    }

    private _finish(): void {
        this._clearHoverHighlight();

        if (this._points.length < 2) {
            window.dispatchEvent(new CustomEvent('bim-operation-error', { // TODO(TASK-12)
                detail: { msg: 'At least 2 points needed — click start and end points first' },
            }));
            return;
        }

        // Use first 2 points as wall start/end
        const [p1, p2] = this._points;
        const levelId  = this._getActiveLevelId();

        if (!levelId) {
            window.dispatchEvent(new CustomEvent('bim-operation-error', { // TODO(TASK-12)
                detail: { msg: 'No active level — switch to a plan view first' },
            }));
            return;
        }

        const settings = this._getDefaultWallSettings();
        const wallId   = crypto.randomUUID();

        const cmd = new CreateWallCommand(wallId, {
            start:     { x: p1.x, z: p1.z },
            end:       { x: p2.x, z: p2.z },
            height:    settings.height,
            thickness: settings.thickness,
            levelId,
        });

        const result = this._cmd.execute(cmd);
        if (!result.success) {
            window.dispatchEvent(new CustomEvent('bim-operation-error', { // TODO(TASK-12)
                detail: { msg: 'Could not create wall — check level settings' },
            }));
            return;
        }

        console.log('[ReferenceEditTool] Wall created:', wallId);
        this._complete();
    }

    // ── Hover highlight ──────────────────────────────────────────────────────

    private _updateHoverHighlight(mesh: any | null): void {
        // Remove previous highlight
        if (this._hoveredMesh && this._savedEmissive !== null) {
            try {
                const mat = this._hoveredMesh.material;
                if (mat?.emissive) mat.emissive.setHex(this._savedEmissive);
            } catch (_) {}
            this._hoveredMesh  = null;
            this._savedEmissive = null;
        }

        if (!mesh) return;

        try {
            const mat = mesh.material;
            if (mat?.emissive) {
                this._savedEmissive = mat.emissive.getHex();
                mat.emissive.setHex(0x3300cc);  // Violet accent glow
                this._hoveredMesh = mesh;
            }
        } catch (_) {}
    }

    private _clearHoverHighlight(): void {
        this._updateHoverHighlight(null);
    }

    // ── Context helpers ──────────────────────────────────────────────────────

    private _getActiveLevelId(): string | null {
        const bimMgr = window.bimManager;
        if (!bimMgr) return null;
        const levels: any[] = bimMgr.getLevels?.() ?? [];
        const active  = levels.find((l: any) => l.isActive) ?? levels[0];
        return active?.id ?? null;
    }

    private _getDefaultWallSettings(): { height: number; thickness: number } {
        // Read the current active wall preset from the UI store if available
        const preset = window.wallPresetStore?.getActive?.(); // TODO(TASK-08)
        return {
            height:    preset?.height    ?? 3.0,
            thickness: preset?.thickness ?? 0.2,
        };
    }
}
