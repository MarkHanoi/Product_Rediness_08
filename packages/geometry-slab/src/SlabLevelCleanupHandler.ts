import { SlabStore } from './SlabStore.js';
import { RemoveSlabsOnLevelCommand } from '@pryzm/command-registry';
import { CommandManager } from '@pryzm/command-registry';

/**
 * CommandManagerRef — shared lazy reference resolved at event-fire time.
 * Identical shape to the one used by SlabDependencyTracker.
 */
export interface CommandManagerRef {
    current: CommandManager | undefined;
}

/**
 * SlabLevelCleanupHandler
 *
 * Contract §01 §2.1 / §3.5 Compliance:
 * Handles cascading deletion of slabs when a level is removed.
 * Extracted OUT of SlabStore (which must remain data-only per §3.5)
 * and placed here as an external orchestration handler.
 *
 * FIX-8 (W2 §01 §2.1 / §01 §2.3):
 *
 * Previously this handler called slabStore.remove() directly, bypassing
 * the command layer and making level-cleanup non-undoable. Slabs were
 * permanently lost if a level deletion was undone.
 *
 * The handler now dispatches RemoveSlabsOnLevelCommand via commandManager,
 * making the batch deletion fully undoable: Ctrl+Z on a level deletion
 * restores the level AND all slabs that were on it.
 *
 * A CommandManagerRef (lazy ref object) is used so this handler can be
 * instantiated before commandManager is created in EngineBootstrap.
 * By the time the 'bim-level-removed' DOM event fires (which is only
 * possible after full user interaction), commandManager is always live.
 *
 * Fallback: If commandManagerRef.current is unexpectedly null (should never
 * happen in normal operation), the handler falls back to direct store removal
 * and logs a warning so the gap is immediately visible in the console.
 *
 * Note on practical deadpath: DeleteLevelCommand.canExecute() blocks level
 * deletion when level.childrenIds.length > 0 and slabs are registered via
 * bimManager.registerElement(). In standard workflows the user must delete
 * or reassign slabs first. RemoveSlabsOnLevelCommand handles the edge case
 * where slabs are NOT in childrenIds (e.g. unregistered or batch-imported)
 * and for future paths where level deletion is permitted with children.
 */
export class SlabLevelCleanupHandler {
    private slabStore: SlabStore;
    private commandManagerRef: CommandManagerRef;

    constructor(slabStore: SlabStore, commandManagerRef: CommandManagerRef) {
        this.slabStore = slabStore;
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
                '[SlabLevelCleanupHandler] §01 §2.1 FIX-8: commandManager not yet available. ' +
                'Falling back to direct slabStore.remove() for level cleanup. ' +
                'Slab removal will NOT be undoable. This should never happen in normal operation.'
            );
            const slabsOnLevel = this.slabStore.getAll().filter(s => s.levelId === levelId);
            slabsOnLevel.forEach(slab => {
                this.slabStore.remove(slab.id);
            });
            return;
        }

        const cmd = new RemoveSlabsOnLevelCommand({ levelId });

        const validation = cmd.canExecute(cm.getContext());
        if (!validation.ok) {
            console.warn(
                `[SlabLevelCleanupHandler] RemoveSlabsOnLevelCommand.canExecute() failed ` +
                `for level "${levelId}": ${validation.reason}`
            );
            return;
        }

        cm.execute(cmd);
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
