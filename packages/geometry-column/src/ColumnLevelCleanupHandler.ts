import { ColumnStore } from './ColumnStore';
import { RemoveColumnsOnLevelCommand } from '@pryzm/command-registry';

/**
 * CommandManagerRef — shared lazy reference resolved at event-fire time.
 * Identical shape to the one used by SlabLevelCleanupHandler.
 * Duck-typed to avoid coupling to a specific CommandManager class declaration.
 */
export interface CommandManagerRef {
    current: { execute: (cmd: any, metadata?: any) => any; getContext: () => any } | undefined;
}

/**
 * ColumnLevelCleanupHandler
 *
 * §COLUMN-AUDIT-2026 §C1 — Non-undoable level-cascade FIX.
 *
 * When a level is deleted, all columns on that level must be removed from
 * the columnStore, bimManager, elementRegistry AND the SemanticGraph.
 * Previously this handler called `columnStore.remove()` directly, bypassing
 * the command layer and making the cascade non-undoable. Worse, it leaked
 * registrations in bimManager + elementRegistry + SemanticGraph.
 *
 * The handler now dispatches `RemoveColumnsOnLevelCommand` via
 * `commandManager`, making the batch deletion fully undoable: Ctrl+Z on a
 * level deletion restores the level AND all columns that were on it (with
 * their bimManager / elementRegistry / SemanticGraph registrations).
 *
 * A `CommandManagerRef` (lazy ref object) is used so this handler can be
 * instantiated in `initBuilders.ts` BEFORE `commandManager` is created in
 * `EngineBootstrap`. By the time `bim-level-removed` fires (only possible
 * after full user interaction), `commandManager` is always live.
 *
 * Fallback: If `commandManagerRef.current` is unexpectedly null (should
 * never happen in normal operation), the handler falls back to direct store
 * removal AND emits `bimManager.unregisterElement` so the spatial registry
 * does not leak — and logs a warning so the gap is visible in the console.
 *
 * Mirrors `SlabLevelCleanupHandler` exactly.
 */
export class ColumnLevelCleanupHandler {
    private columnStore: any;
    private commandManagerRef: CommandManagerRef;

    constructor(columnStore: ColumnStore, commandManagerRef: CommandManagerRef) {
        this.columnStore = columnStore;
        this.commandManagerRef = commandManagerRef;
        this.attach();
    }

    private attach(): void {
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const cm = this.commandManagerRef.current;

        if (!cm) {
            console.warn(
                '[ColumnLevelCleanupHandler] §COLUMN-AUDIT-2026 §C1 FALLBACK: ' +
                    'commandManager not yet available. Falling back to direct ' +
                    'columnStore.remove() for level cleanup. Column removal will ' +
                    'NOT be undoable. This should never happen in normal operation.',
            );

            const bimManager = window.bimManager;
            const columnsOnLevel = this.columnStore
                .getAll()
                .filter((c: any) => c.levelId === levelId);

            for (const col of columnsOnLevel) {
                this.columnStore.remove(col.id);
                try {
                    bimManager?.unregisterElement?.(col.id);
                } catch {
                    /* ignore */
                }
            }
            return;
        }

        const cmd = new RemoveColumnsOnLevelCommand({ levelId });

        const validation = cmd.canExecute(cm.getContext());
        if (!validation.ok) {
            console.warn(
                `[ColumnLevelCleanupHandler] RemoveColumnsOnLevelCommand.canExecute() ` +
                    `failed for level "${levelId}": ${validation.reason}`,
            );
            return;
        }

        cm.execute(cmd);
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
