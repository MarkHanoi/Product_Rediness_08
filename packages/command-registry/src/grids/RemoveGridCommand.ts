/**
 * RemoveGridCommand
 *
 * Removes a BIM structural grid from both the semantic store (GridStore)
 * and the visual layer (BimManager).
 *
 * §01 §2.1  Single Source of Mutation — replaces the fragile optional-chain
 *            call in AddGridCommand.undo() that previously called
 *            bimManager.removeGrid?.() without error handling.
 * §01 §2.2  Snapshot Rule — full Grid snapshot captured before removal for undo.
 * §01 §2.3  Undo re-adds the grid to both stores.
 * §01 §3.8  GridStore.remove() emits StoreEventBus 'delete' event.
 *
 * §GRID106 (founder ghost-bubble report, 2026-08-26) — a grid's plan bubbles
 * are SEPARATE AnnotationElements in the ADR-0119 subsystem annotationStore,
 * linked to the grid ONLY by `parameters.gridId` (GridPlanToolHandler.
 * _createPlanBubble, GridBubbleTool). This command removed only the Grid
 * record; the bubble annotations survived forever — rendered in every plan
 * view, hit-testable, and PERSISTED by ProjectSerializer. Delete now sweeps
 * every annotation whose `parameters.gridId` names the removed grid, inside
 * this SAME command so one gesture stays one undo entry (C16 §8.6), and undo
 * restores grid + bubbles together. `affectedStores` names the measured write
 * set — 'grid' AND 'annotation' (C84 EI-7).
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Grid } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';

/**
 * Minimal duck-typed view of the subsystem AnnotationStore — resolved via
 * ctx first, window fallback, exactly like AnnotateViewCommand (A1 pattern).
 */
interface AnnotationStoreLike {
    getAll(): Array<{ id: string; parameters?: Record<string, unknown> }>;
    has(id: string): boolean;
    add(record: unknown): void;
    remove(id: string): void;
}

function resolveAnnotationStore(context: CommandContext): AnnotationStoreLike | null {
    return (context?.stores?.annotationStore as unknown as AnnotationStoreLike | undefined)
        ?? (typeof window !== 'undefined'
            ? (window.annotationStore as unknown as AnnotationStoreLike | undefined) ?? null
            : null); // TODO(TASK-08)
}
// TODO(TASK-08): store-unification debt (ADR-0318) — the GridStore StoreEventBus
// emission noted in §01 §3.8 above is the surface TASK-08 unifies. Work note
// relocated from the file header, where it read to the C74 §3.4 M-B gate as a
// module-scaffold claim; this command is production, not a stand-in
// (CO-06, 2026-08-14).
const _bus = new DOMEventBus();

export interface RemoveGridPayload {
    gridId: string;
}

export class RemoveGridCommand implements Command {
    // §GRID106 / C84 EI-7 — 'annotation' is in the measured write set: the
    // grid-bubble sweep below writes the subsystem annotationStore.
    readonly affectedStores = ["grid", "annotation"] as const;
    readonly id: string;
    readonly type = CommandType.REMOVE_GRID;
    readonly timestamp: number;
    readonly targetIds: string[];

    private payload: RemoveGridPayload;
    private prevSnapshot: Grid | null = null;
    /** §GRID106 — snapshots of the grid-linked annotations removed by execute(). */
    private prevAnnotationSnapshots: Array<{ id: string }> = [];

    constructor(payload: RemoveGridPayload) {
        this.id = `cmd-remove-grid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.gridId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { gridStore } = context.stores;

        if (!gridStore.has(this.payload.gridId)) {
            return { ok: false, reason: `Grid "${this.payload.gridId}" not found.` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        // §01 §2.7 Builder Isolation: only mutate GridStore. The renderer is
        // updated by BimManager's StoreEventBus listener.
        const { gridStore } = context.stores;

        const grid = gridStore.get(this.payload.gridId);
        if (!grid) {
            return { success: false, affectedElementIds: [], error: `Grid "${this.payload.gridId}" not found.` };
        }

        // §01 §2.2: Capture full snapshot before removal.
        this.prevSnapshot = structuredClone(grid);

        // Single store write (emits StoreEventBus 'delete' — §01 §3.8).
        gridStore.remove(this.payload.gridId);

        // §GRID106 — sweep the grid's bubble annotations. They are separate
        // AnnotationElements linked only by parameters.gridId; leaving them
        // produced immortal ghost bubbles in every plan view AND in the saved
        // project (ProjectSerializer persists the subsystem annotationStore).
        // Snapshot each one so undo() restores grid + bubbles as ONE entry.
        this.prevAnnotationSnapshots = [];
        const annotationStore = resolveAnnotationStore(context);
        if (annotationStore) {
            for (const ann of annotationStore.getAll()) {
                if (ann?.parameters?.gridId === this.payload.gridId) {
                    this.prevAnnotationSnapshots.push(structuredClone(ann));
                    annotationStore.remove(ann.id);
                }
            }
        }

        _bus.emit('grid-removed', { id: this.payload.gridId }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        return {
            success: true,
            affectedElementIds: [
                this.payload.gridId,
                ...this.prevAnnotationSnapshots.map(a => a.id),
            ],
            info: [
                `Grid "${grid.name}" removed.`,
                ...(this.prevAnnotationSnapshots.length > 0
                    ? [`${this.prevAnnotationSnapshots.length} linked grid annotation(s) removed.`]
                    : []),
            ]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
        }

        const { gridStore } = context.stores;

        // §01 §2.3 + §2.7: Restore full snapshot through the store only.
        gridStore.add(this.prevSnapshot);

        // §GRID106 — restore the swept bubble annotations with the grid, so
        // undo of a grid delete brings back the WHOLE element (C16 §8.6).
        const annotationStore = resolveAnnotationStore(context);
        if (annotationStore) {
            for (const snap of this.prevAnnotationSnapshots) {
                if (!annotationStore.has(snap.id)) {
                    annotationStore.add(structuredClone(snap));
                }
            }
        }

        _bus.emit('grid-added', { id: this.prevSnapshot.id }); // F.events.17

        return {
            success: true,
            affectedElementIds: [
                this.payload.gridId,
                ...this.prevAnnotationSnapshots.map(a => a.id),
            ],
            info: [`Grid "${this.prevSnapshot.name}" restored.`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
