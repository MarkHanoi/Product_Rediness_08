import { doorStore } from './DoorStore';
import type { WallStore } from '@pryzm/geometry-wall';

/**
 * §DOOR-AUDIT-2026 P2 #12 — DoorLevelCleanupHandler
 *
 * Mirrors `SlabLevelCleanupHandler` for the door element type. On a
 * `bim-level-removed` DOM event, walks `doorStore` and removes any door
 * whose host wall lived on the deleted level.
 *
 * In normal flows the wall cascade has already removed the wall (which
 * removed the door via `WallStore.removeOpening` → `doorStore.remove`).
 * This handler is the safety net for edge cases where:
 *   - a door's wall was unregistered or batch-imported without participating
 *     in the level's `childrenIds`, OR
 *   - a level is force-deleted with `cascade: true`.
 */
/** Minimal duck-type — accepts any CommandManager without coupling to a specific declaration. */
export interface DoorCleanupCommandManagerRef {
    current: { execute: (cmd: any, metadata?: any) => any } | undefined;
}

export class DoorLevelCleanupHandler {
    private commandManagerRef: DoorCleanupCommandManagerRef;
    private wallStore: any;

    constructor(wallStore: WallStore, commandManagerRef: DoorCleanupCommandManagerRef) {
        this.wallStore = wallStore;
        this.commandManagerRef = commandManagerRef;
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const orphans: string[] = [];
        for (const door of doorStore.getAll()) {
            const wall = this.wallStore.getById(door.wallId);
            // Either the host wall is gone, or it was on the deleted level.
            if (!wall || wall.levelId === levelId) {
                orphans.push(door.id);
            }
        }
        if (orphans.length === 0) return;

        const cm = this.commandManagerRef.current;
        if (!cm) {
            console.warn(
                '[DoorLevelCleanupHandler] commandManager unavailable — falling back to ' +
                'direct doorStore.remove() for orphan cleanup. Removal will NOT be undoable.',
            );
            orphans.forEach(id => doorStore.remove(id));
            return;
        }

        // Use the canonical wall-store removal path so both stores stay in sync.
        for (const id of orphans) {
            try {
                this.wallStore.removeDoor(id);
            } catch {
                doorStore.remove(id);
            }
        }
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
