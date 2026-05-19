/**
 * RoomLevelCleanupHandler — cascades room cleanup when a level is removed.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. Import remapping:
 *   ../core/SemanticGraph → @pryzm/core-app-model
 *   ../core/SpatialIndex  → @pryzm/core-app-model
 *
 * Note: roomStore is typed `any` to avoid dual-class type-mismatch when the
 * caller's RoomStore is imported from src/ (which re-exports from the package
 * but still produces a distinct declaration path in incremental TSC).
 */

import type { BimManager } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { roomSpatialIndex } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export class RoomLevelCleanupHandler {
    constructor(
        private readonly roomStore: any,
        private readonly bimManager?: BimManager,
    ) {
        this.attach();
    }

    private attach(): void {
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId as string | undefined;
        if (!levelId) return;

        const rooms = this.roomStore.getByLevel(levelId);
        if (rooms.length === 0) return;

        for (const room of rooms) {
            try { this.roomStore.remove(room.id); } catch { /* best-effort */ }
            try { this.bimManager?.unregisterElement(room.id); } catch { /* best-effort */ }
            try { elementRegistry.unregister(room.id); } catch { /* best-effort */ }
            try { semanticGraphManager.removeAllRelationshipsForElement(room.id); } catch { /* best-effort */ }
            try { roomSpatialIndex.remove(room.id); } catch { /* best-effort */ }
        }

        console.log(
            `[RoomLevelCleanupHandler] Level '${levelId}' removed → ` +
            `${rooms.length} room(s) cascaded out (store, graph, spatial, registry).`,
        );
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
