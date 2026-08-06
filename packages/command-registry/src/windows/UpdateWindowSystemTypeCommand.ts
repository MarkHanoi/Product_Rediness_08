/**
 * UpdateWindowSystemTypeCommand — §FIX-HOSTED-TYPE-CHANGE (L-620).
 *
 * The exact mirror of `UpdateDoorSystemTypeCommand` (read that file's header for the
 * full root-cause account): the properties-panel "Window Type" dropdown routed through
 * `element.changeType` → the plugin-bus `window.setType` handler, which mutates the
 * DETACHED plugin Immer DTO store rather than the geometry `windowStore` that
 * `WindowBuilder` subscribes to and that `WindowTool` / the plan bridge populate. For a
 * placed window `canExecute` returned `window not found: <id>` and nothing changed.
 *
 * This is the window twin of the proven `UpdateWallSystemTypeCommand` path:
 *   `windowStore.update()` → `'update'` event → `WindowBuilder` rebuild;
 *   undo → the EXACT pre-image via `windowStore.replace()` (a merge-patch cannot UNSET a
 *   field, so it cannot reverse a stamp onto a previously untyped window — C03 §4.5).
 *
 * C15 — id, `openingId`, host `wallId` and the structural void are preserved by
 * `planWindowTypeChange`, so the host wall's CSG opening is never disturbed. This command
 * writes NOTHING to the wall store.
 *
 * P8 — execute/undo emit spans; the planner emits its own.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { trace, type Tracer } from '@opentelemetry/api';
import { windowStore, planWindowTypeChange, type WindowOpening } from '@pryzm/geometry-window';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

export interface UpdateWindowSystemTypeInput {
    readonly windowId: string;
    readonly systemTypeId: string;
}

export class UpdateWindowSystemTypeCommand implements Command {
    readonly affectedStores = ['window', 'wall'] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_WINDOW_SYSTEM_TYPE;
    timestamp: number = Date.now();
    targetIds: string[];

    /** EXACT pre-change record — the undo restores this verbatim. */
    private prevSnapshot: WindowOpening | null = null;

    constructor(private input: UpdateWindowSystemTypeInput) {
        this.targetIds = [input.windowId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const win = windowStore.getById(this.input.windowId);
        if (!win) return { ok: false, reason: `Window ${this.input.windowId} not found` };
        const plan = planWindowTypeChange(win, this.input.systemTypeId);
        if (plan.blockedReason) return { ok: false, reason: plan.blockedReason };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.window.updateSystemType', (span) => {
            try {
                const win = windowStore.getById(this.input.windowId);
                if (!win) { span.end(); return { success: false, affectedElementIds: [] }; }

                const plan = planWindowTypeChange(win, this.input.systemTypeId);
                if (plan.blockedReason) {
                    console.warn(plan.blockedReason);
                    span.setAttribute('pryzm.window.typeChange.blocked', true);
                    span.end();
                    return { success: false, affectedElementIds: [], info: [plan.blockedReason] };
                }

                this.prevSnapshot = structuredClone(win);
                windowStore.update(this.input.windowId, plan.patch as Partial<WindowOpening>);

                span.setAttribute('pryzm.window.id', this.input.windowId);
                span.setAttribute('pryzm.window.systemTypeId.from', plan.from ?? '<none>');
                span.setAttribute('pryzm.window.systemTypeId.to', plan.to);
                span.end();
                return { success: true, affectedElementIds: [this.input.windowId, win.wallId] };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    undo(_ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.window.updateSystemType.undo', (span) => {
            try {
                if (!this.prevSnapshot) { span.end(); return { success: false, affectedElementIds: [] }; }
                windowStore.replace(this.prevSnapshot);
                span.end();
                return {
                    success: true,
                    affectedElementIds: [this.prevSnapshot.id, this.prevSnapshot.wallId],
                };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: { windowId: this.input.windowId, systemTypeId: this.input.systemTypeId },
        };
    }
}
