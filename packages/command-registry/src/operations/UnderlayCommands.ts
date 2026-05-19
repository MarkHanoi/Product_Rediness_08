/**
 * @file UnderlayCommands.ts
 *
 * Class-A commands for the floor-plan underlay (PDF / JPG import overlay).
 *
 * WHY THESE EXIST
 * ───────────────
 * Per Contract 01 §2.1 every state mutation must run inside a Command so that
 * Ctrl+Z / Ctrl+Y reach it. The underlay used to mutate its THREE.Mesh and
 * the FloorPlanUnderlayTool's internal `state` object directly, completely
 * bypassing the CommandManager — undo therefore had nothing to do.
 *
 * The underlay is non-semantic (Contract 04 §3.1: it is NOT a BIM element and
 * is never registered in any ElementStore). These commands therefore manage
 * their own do/undo against the FloorPlanUnderlayTool singleton (exposed at
 * `window.floorPlanUnderlayTool`). They declare `affectedStores = ['underlay']`
 * which the CommandManager's snapshot scope simply ignores (no matching key),
 * so no extra store cloning happens.
 *
 * Commands provided:
 *   • CreateUnderlayCommand    — wraps the initial PDF/JPG placement
 *   • TransformUnderlayCommand — wraps drag, R-key 90° rotate, 3-pt scale, 3-pt rotate
 *   • DeleteUnderlayCommand    — wraps Delete-key / "Remove" button
 *
 * Notes on TransformUnderlayCommand for live gestures:
 *   The drag / R-key flow already mutates the mesh as the user interacts (so the
 *   user sees live feedback). We capture the BEFORE snapshot at gesture start
 *   and push the command at gesture end with both BEFORE and AFTER. The first
 *   `execute()` is therefore idempotent (mesh is already at AFTER); subsequent
 *   undo() restores BEFORE; redo() restores AFTER. This matches how Revit-style
 *   tools record interactive moves.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { floorPlanUnderlayRef } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// ── Snapshot of the underlay's full transform + dimensions ─────────────────
//
// All fields are captured because applyScale modifies pxPerMeter and
// planWidthMeters/planHeightMeters as well — a pure position+rotation+scale
// snapshot would forget the metric scale and break re-scaling on undo/redo.
export interface UnderlayTransformSnapshot {
    posX: number;
    posY: number;
    posZ: number;
    rotZ: number;          // mesh.rotation.z (the world-Y rotation; see FloorPlanUnderlayTool)
    scaleX: number;
    scaleY: number;
    pxPerMeter: number;
    planWidthMeters: number;
    planHeightMeters: number;
}

// ── Snapshot of the parameters required to recreate the mesh from scratch ──
export interface UnderlayCreateSnapshot {
    blobUrl:    string;
    pxPerMeter: number;
    widthPx:    number;
    heightPx:   number;
    elevationY: number;
    /** Optional transform to apply right after recreate (used by undo of Delete). */
    transform?: UnderlayTransformSnapshot;
    /** Whether the underlay was locked at the time of capture. */
    locked?:    boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function getTool(): any | null {
    return window.floorPlanUnderlayTool ?? null;
}

export function captureUnderlaySnapshot(): UnderlayTransformSnapshot | null {
    const tool = getTool();
    const st   = tool?.getState?.();
    if (!st) return null;
    const m = st.mesh;
    return {
        posX:             m.position.x,
        posY:             m.position.y,
        posZ:             m.position.z,
        rotZ:             m.rotation.z,
        scaleX:           m.scale.x,
        scaleY:           m.scale.y,
        pxPerMeter:       st.pxPerMeter,
        planWidthMeters:  st.planWidthMeters,
        planHeightMeters: st.planHeightMeters,
    };
}

function applySnapshot(snap: UnderlayTransformSnapshot): void {
    const tool = getTool();
    const st   = tool?.getState?.();
    if (!st) {
        console.warn('[applySnapshot] No underlay tool/state — snapshot not applied');
        return;
    }

    const m = st.mesh;
    console.log('[applySnapshot] Restoring → pos(', snap.posX.toFixed(3), snap.posY.toFixed(3), snap.posZ.toFixed(3),
        ') rotZ=', (snap.rotZ * 180 / Math.PI).toFixed(2), '° scale(', snap.scaleX.toFixed(3), snap.scaleY.toFixed(3), ')');

    m.position.set(snap.posX, snap.posY, snap.posZ);
    m.rotation.z = snap.rotZ;
    m.scale.x = snap.scaleX;
    m.scale.y = snap.scaleY;

    // Force THREE.js to recompute world matrix on the next render pass.
    m.matrixWorldNeedsUpdate = true;
    m.updateWorldMatrix(true, false);

    st.pxPerMeter       = snap.pxPerMeter;
    st.planWidthMeters  = snap.planWidthMeters;
    st.planHeightMeters = snap.planHeightMeters;

    m.userData.pxPerMeter       = snap.pxPerMeter;
    m.userData.planWidthMeters  = snap.planWidthMeters;
    m.userData.planHeightMeters = snap.planHeightMeters;

    // Mirror dimensions to the global FloorPlanUnderlayRef (consumed by
    // PDF→world coord conversion code) so they stay in sync after undo/redo.
    const ref = window.floorPlanUnderlayRef;
    const refCurrent = ref?.current ?? floorPlanUnderlayRef.current;
    if (refCurrent) {
        refCurrent.planWidthMeters  = snap.planWidthMeters;
        refCurrent.planHeightMeters = snap.planHeightMeters;
    }

    _bus.emit('underlay:transform-changed', {}); // F.events.17
}

// ──────────────────────────────────────────────────────────────────────────
//  CreateUnderlayCommand
// ──────────────────────────────────────────────────────────────────────────

export class CreateUnderlayCommand implements Command {
    readonly affectedStores = ['underlay'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_UNDERLAY;
    readonly timestamp: number;
    readonly targetIds: string[] = [];

    private _executed = false;
    /** Captured transform after first execute, used to faithfully reproduce on redo. */
    private _postExecuteSnap: UnderlayTransformSnapshot | null = null;

    constructor(private readonly input: UnderlayCreateSnapshot) {
        this.id        = crypto.randomUUID();
        this.timestamp = Date.now();
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.input.blobUrl)            return { ok: false, reason: 'NO_BLOB' };
        if (this.input.pxPerMeter <= 0)     return { ok: false, reason: 'BAD_SCALE' };
        if (this.input.widthPx <= 0 || this.input.heightPx <= 0) return { ok: false, reason: 'BAD_SIZE' };
        return { ok: true };
    }

    /**
     * Synchronous execute: we cannot await here (Command.execute is sync). The
     * Tool layer (FloorPlanImportPanel) is responsible for the FIRST creation
     * (which is async because of texture loading); on first run it calls
     * markExecuted() once the mesh exists. The synchronous redo path uses the
     * already-loaded blob URL — texture cache makes it cheap.
     */
    execute(_ctx: CommandContext): CommandResult {
        if (this._executed) {
            // Redo path — rebuild the mesh using stored params, then reapply transform.
            this._asyncRecreate(this.input, this._postExecuteSnap);
            return { success: true, affectedElementIds: [] };
        }
        // First execution: caller has already created the mesh asynchronously.
        // mark and snapshot now so a future redo can reproduce.
        this._executed = true;
        this._postExecuteSnap = captureUnderlaySnapshot();
        return { success: true, affectedElementIds: [] };
    }

    undo(_ctx: CommandContext): CommandResult {
        // Capture the latest snapshot before disposal so that a redo restores
        // the user's most recent transform (drag-then-undo would otherwise lose
        // the position). NOTE: subsequent transforms are recorded as their own
        // commands so this is a defensive snapshot only.
        const fresh = captureUnderlaySnapshot();
        if (fresh) this._postExecuteSnap = fresh;

        // Tear down the mesh + tool. handleRemoveUnderlay does the full cleanup
        // (controls bar, Import Manager, ImportRef) so prefer that path.
        const remover = window.__pryzmRemoveUnderlayInternal;
        if (typeof remover === 'function') {
            remover({ silent: true });
        } else {
            getTool()?.dispose?.();
        }
        return { success: true, affectedElementIds: [] };
    }

    /**
     * Internal async recreate used by redo(). Calls the public placement helper
     * the Import panel exposes on window so that ALL the side-effects fire
     * (Import Manager registration, controls bar, etc.) — staying single-source.
     */
    private async _asyncRecreate(
        input: UnderlayCreateSnapshot,
        snap: UnderlayTransformSnapshot | null,
    ): Promise<void> {
        const recreate = window.__pryzmRecreateUnderlayInternal;
        if (typeof recreate === 'function') {
            await recreate(input);
            if (snap) applySnapshot(snap);
        } else {
            console.warn('[CreateUnderlayCommand] No recreate hook — redo skipped');
        }
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { ...this.input } as Record<string, any>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────
//  TransformUnderlayCommand
// ──────────────────────────────────────────────────────────────────────────

export type UnderlayTransformReason =
    | 'drag'
    | 'rotate-90-key'
    | 'reference-scale'
    | 'reference-rotate'
    | 'opacity'         // future use; kept for completeness
    | 'lock-toggle';    // future use; kept for completeness

export class TransformUnderlayCommand implements Command {
    readonly affectedStores = ['underlay'] as const;
    readonly id: string;
    readonly type = CommandType.TRANSFORM_UNDERLAY;
    readonly timestamp: number;
    readonly targetIds: string[] = [];

    private _firstRun = true;

    constructor(
        private readonly before: UnderlayTransformSnapshot,
        private readonly after:  UnderlayTransformSnapshot,
        private readonly reason: UnderlayTransformReason,
    ) {
        this.id        = crypto.randomUUID();
        this.timestamp = Date.now();
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!getTool()?.getState?.()) {
            return { ok: false, reason: 'NO_UNDERLAY', blockingIssues: ['No underlay present'] };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        // First execution is idempotent — the gesture has already mutated the
        // mesh to `after`. Subsequent redo calls re-apply `after` for real.
        if (this._firstRun) {
            this._firstRun = false;
            console.log(`[TransformUnderlayCommand] EXECUTE (idempotent first run) reason=${this.reason}`);
        } else {
            console.log(`[TransformUnderlayCommand] REDO → restoring AFTER snapshot reason=${this.reason}`);
            applySnapshot(this.after);
        }
        return { success: true, affectedElementIds: [] };
    }

    undo(_ctx: CommandContext): CommandResult {
        console.log(`[TransformUnderlayCommand] UNDO → restoring BEFORE snapshot reason=${this.reason}`);
        applySnapshot(this.before);
        return { success: true, affectedElementIds: [] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { before: this.before, after: this.after, reason: this.reason },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────
//  DeleteUnderlayCommand
// ──────────────────────────────────────────────────────────────────────────

export class DeleteUnderlayCommand implements Command {
    readonly affectedStores = ['underlay'] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_UNDERLAY;
    readonly timestamp: number;
    readonly targetIds: string[] = [];

    private _captured: UnderlayCreateSnapshot | null = null;

    /**
     * @param creationParams the params last used to create the underlay; needed
     *                       for undo to recreate it. The Tool layer captures
     *                       these from the FloorPlanImportPanel state.
     */
    constructor(creationParams: UnderlayCreateSnapshot | null) {
        this.id        = crypto.randomUUID();
        this.timestamp = Date.now();
        this._captured = creationParams;
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!getTool()?.getState?.()) {
            return { ok: false, reason: 'NO_UNDERLAY', blockingIssues: ['Nothing to delete'] };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        // Snapshot the live transform now so undo restores exactly what the
        // user saw a moment before pressing Delete.
        const snap = captureUnderlaySnapshot();
        if (this._captured && snap) {
            this._captured = { ...this._captured, transform: snap, locked: getTool()?.getState?.()?.locked };
        }

        const remover = window.__pryzmRemoveUnderlayInternal;
        if (typeof remover === 'function') {
            remover({ silent: true });
        } else {
            getTool()?.dispose?.();
        }
        return { success: true, affectedElementIds: [] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this._captured) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo — no creation params captured'] };
        }
        this._asyncRestore(this._captured);
        return { success: true, affectedElementIds: [] };
    }

    private async _asyncRestore(input: UnderlayCreateSnapshot): Promise<void> {
        const recreate = window.__pryzmRecreateUnderlayInternal;
        if (typeof recreate !== 'function') {
            console.warn('[DeleteUnderlayCommand] No recreate hook — undo skipped');
            return;
        }
        await recreate(input);
        if (input.transform) applySnapshot(input.transform);
        if (input.locked) getTool()?.setLocked?.(true);
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   this._captured ? { ...this._captured } : {},
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
