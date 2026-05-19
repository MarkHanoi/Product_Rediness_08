import {
    Command, CommandContext, CommandType,
    CommandValidationResult, CommandResult, SerializedCommand,
} from '../types';
import { windowStore } from '@pryzm/geometry-window';
import { WindowOpening, WindowOpeningSchema } from '@pryzm/geometry-window';

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
        if (!this.prevCapturedAtExecute) {
            const captured: Partial<WindowOpening> = {};
            for (const key of Object.keys(this.patch) as (keyof WindowOpening)[]) {
                (captured as any)[key] = current[key];
            }
            this.prev = deepFreeze(captured);
            this.prevCapturedAtExecute = true;
        }
        windowStore.update(this.windowId, this.patch);
        this._syncWallStore(context, this.patch);
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

    private _syncWallStore(context: CommandContext, delta: Partial<WindowOpening>): void {
        try {
            const ws = context.stores.wallStore;
            if (!ws.getWindow(this.windowId)) return;
            ws.updateWindow(this.windowId, delta as any);
        } catch {
        }
    }
}
