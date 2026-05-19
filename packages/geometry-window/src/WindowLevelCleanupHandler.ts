import { windowStore } from './WindowStore';
import type { WallStore } from '@pryzm/geometry-wall';

/**
 * §WIN-AUDIT-2026 W9 — WindowLevelCleanupHandler
 *
 * Mirrors `DoorLevelCleanupHandler`. On `bim-level-removed`, removes any
 * window whose host wall lived on the deleted level. The wall cascade
 * normally handles this; the handler is a safety net for orphaned-wall edge
 * cases (force-delete, batch import without childrenIds).
 */
/** Minimal duck-type — accepts any CommandManager without coupling to a specific declaration. */
export interface WindowCleanupCommandManagerRef {
    current: { execute: (cmd: any, metadata?: any) => any } | undefined;
}

export class WindowLevelCleanupHandler {
    private commandManagerRef: WindowCleanupCommandManagerRef;
    private wallStore: any;

    constructor(wallStore: WallStore, commandManagerRef: WindowCleanupCommandManagerRef) {
        this.wallStore = wallStore;
        this.commandManagerRef = commandManagerRef;
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const orphans: string[] = [];
        for (const win of windowStore.getAll()) {
            const wall = this.wallStore.getById(win.wallId);
            if (!wall || wall.levelId === levelId) {
                orphans.push(win.id);
            }
        }
        if (orphans.length === 0) return;

        const cm = this.commandManagerRef.current;
        if (!cm) {
            console.warn(
                '[WindowLevelCleanupHandler] commandManager unavailable — falling back to ' +
                'direct windowStore.remove() for orphan cleanup. Removal will NOT be undoable.',
            );
            orphans.forEach(id => windowStore.remove(id));
            return;
        }

        for (const id of orphans) {
            try {
                this.wallStore.removeWindow(id);
            } catch {
                windowStore.remove(id);
            }
        }
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
