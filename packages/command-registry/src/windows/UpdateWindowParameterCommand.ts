import {
    Command, CommandContext, CommandType,
    CommandValidationResult, CommandResult, SerializedCommand,
} from '../types';
import { windowStore } from '@pryzm/geometry-window';
import { WindowOpening, WindowOpeningSchema } from '@pryzm/geometry-window';
import { wallOccupancyStore } from '@pryzm/geometry-wall';

/**
 * D4 — UpdateWindowParameterCommand
 *
 * Applies an arbitrary parameter patch to a WindowOpening in the rich
 * WindowStore and propagates compatible fields to the legacy WallStore so
 * both stores remain in sync (§03 two-store sync rule).
 *
 * §WIN-AUDIT-2026 P-EXEC-PREV (mirrors DOOR P2 #8):
 *   `prev` is captured at execute() time from the live store snapshot.
 *
 * §WIN-AUDIT-2026 P-CAN-EXEC-VALIDATE:
 *   `canExecute()` runs `WindowOpeningSchema.safeParse(merged)` so validation
 *   failures surface as `{ ok: false, reason }`.
 *
 * §WIN-AUDIT-2026 M2 deep-freeze:
 *   Both `patch` and the captured `prev` are deeply frozen so callers cannot
 *   mutate the historical record (e.g. nested arrays in `columnRatios`).
 */
function deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        const v = (obj as Record<string, unknown>)[key];
        if (v && typeof v === 'object') deepFreeze(v);
    }
    return Object.freeze(obj);
}

export class UpdateWindowParameterCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_WINDOW_PARAMETER;
    timestamp: number = Date.now();
    targetIds: string[];

    private prev: Partial<WindowOpening>;
    private prevCapturedAtExecute = false;

    constructor(
        private windowId: string,
        private patch: Partial<WindowOpening>,
        prev: Partial<WindowOpening> = {},
    ) {
        this.targetIds = [windowId];
        this.patch = deepFreeze({ ...patch });
        this.prev  = deepFreeze({ ...prev });
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        const current = windowStore.getById(this.windowId);
        if (!current) {
            return { ok: false, reason: `Window not found: ${this.windowId}` };
        }
        const merged = { ...current, ...this.patch };
        const parsed = WindowOpeningSchema.safeParse(merged);
        if (!parsed.success) {
            return { ok: false, reason: `Invalid window patch: ${parsed.error.issues.map(i => i.message).join('; ')}` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const current = windowStore.getById(this.windowId);
        if (!current) {
            return { success: false, affectedElementIds: [], info: [`Window not found: ${this.windowId}`] };
        }
        // §FIX-WINDOW-OOB-OPENING-RESTORE (L-82): clamp dimensional fields to the
        // host wall BEFORE writing, so the window frame (windowStore) and its wall
        // opening (wallStore) receive the SAME in-bounds values and stay consistent.
        // Without this, a width/height/offset/sill edit past the wall extent
        // orphaned the opening — the wall stopped being cut and the window could
        // neither recover nor be deleted. The clamp may add fields the caller did
        // not send (e.g. a too-wide width forces the offset inward), so prev is
        // captured over the EFFECTIVE patch keys — keeping the derived shift undoable.
        const patch = this._clampPatchToWall(context, current, this.patch);

        if (!this.prevCapturedAtExecute) {
            const captured: Partial<WindowOpening> = {};
            for (const key of Object.keys(patch) as (keyof WindowOpening)[]) {
                (captured as any)[key] = current[key];
            }
            this.prev = deepFreeze(captured);
            this.prevCapturedAtExecute = true;
        }

        windowStore.update(this.windowId, patch);
        this._syncWallStore(context, patch);
        return { success: true, affectedElementIds: [this.windowId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!windowStore.has(this.windowId)) {
            return { success: false, affectedElementIds: [], info: [`Window not found for undo: ${this.windowId}`] };
        }
        windowStore.update(this.windowId, this.prev);
        this._syncWallStore(context, this.prev);
        return { success: true, affectedElementIds: [this.windowId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            payload: { windowId: this.windowId, patch: this.patch, prev: this.prev },
            version: 2,
        };
    }

    /**
     * §FIX-WINDOW-OOB-OPENING-RESTORE (L-82) — return a copy of `patch` whose
     * dimensional fields are clamped so the frame span stays inside the host wall.
     * A colour-only / type-only edit (no dimensional field) is returned untouched,
     * as is any patch when the host wall cannot be resolved. When clamping DOES
     * fire, every dimensional field the clamp changed relative to the CURRENT
     * record is written back — including fields the caller did not send (e.g. a
     * too-wide width forces the offset inward), so the frame never exceeds the wall.
     */
    private _clampPatchToWall(
        context: CommandContext,
        current: WindowOpening,
        patch: Partial<WindowOpening>,
    ): Partial<WindowOpening> {
        const dimKeys = ['offset', 'width', 'height', 'sillHeight'] as const;
        if (!dimKeys.some(k => k in patch)) return patch;

        const wall = context.stores?.wallStore?.getById?.(current.wallId);
        if (!wall) return patch;

        const clamped = wallOccupancyStore.clampToWall(wall, {
            offset:     (patch.offset     ?? current.offset)     as number,
            width:      (patch.width      ?? current.width)      as number,
            height:     (patch.height     ?? current.height)     as number,
            sillHeight: (patch.sillHeight ?? current.sillHeight) as number,
        });
        if (!clamped.clamped) return patch;

        const out: Partial<WindowOpening> = { ...patch };
        for (const k of dimKeys) {
            // Write a clamped dimension when the caller sent it OR when the clamp
            // had to move it away from its current value to keep the frame in-bounds.
            if (k in patch || (clamped as any)[k] !== (current as any)[k]) {
                (out as any)[k] = (clamped as any)[k];
            }
        }
        return out;
    }

    private _syncWallStore(context: CommandContext, delta: Partial<WindowOpening>): void {
        try {
            const ws = context.stores.wallStore;
            if (!ws.getWindow(this.windowId)) return;
            ws.updateWindow(this.windowId, delta as any);
        } catch (err) {
            // §HONESTY — this used to be silent. The wall store holds a MIRROR of the
            // window opening; if the mirror write fails the two stores disagree and the
            // wall renders the OLD opening while the property panel shows the new one.
            // That divergence must not look identical to a successful sync.
            console.warn(
                `[UpdateWindowParameterCommand] wall-store mirror write FAILED for ${this.windowId} — ` +
                `wall geometry now disagrees with the window store.`,
                err,
            );
        }
    }
}
