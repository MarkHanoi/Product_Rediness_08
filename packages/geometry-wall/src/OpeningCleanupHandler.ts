import { OpeningStore } from '@pryzm/core-app-model/stores';

/**
 * OpeningCleanupHandler
 *
 * Contract §01 §2.1 / §3.5 Compliance:
 * Handles cascading deletion of openings when a level or host slab is removed.
 *
 * This logic is extracted OUT of OpeningStore (which must remain data-only per §3.5)
 * and placed here as an external orchestration handler, mirroring the pattern
 * established by SlabLevelCleanupHandler for slabs.
 *
 * Two cascades are handled:
 *   1. 'bim-level-removed'  → remove all openings on that level
 *   2. 'bim-slab-removed'   → remove all openings whose hostId matches the removed slab
 *
 * NOTE: This is an event-driven cleanup handler, not a command.
 * A fully contract-compliant implementation would use dedicated DeleteOpeningsOnLevelCommand
 * and DeleteOpeningsOnSlabCommand. This handler is a Phase 1 stop-gap that removes the
 * §3.5 store self-mutation violation.
 */
export class OpeningCleanupHandler {
    private openingStore: OpeningStore;

    constructor(openingStore: OpeningStore) {
        this.openingStore = openingStore;
        this.attach();
    }

    private attach(): void {
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
        window.addEventListener('bim-slab-removed', this.onSlabRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const openingsOnLevel = this.openingStore.getAll().filter(o => o.levelId === levelId);
        openingsOnLevel.forEach(o => {
            this.openingStore.remove(o.id);
        });
    };

    private onSlabRemoved = (e: Event): void => {
        const slabId = (e as CustomEvent).detail?.slabId;
        if (!slabId) return;

        const openingsOnSlab = this.openingStore.getAll().filter(o => o.hostId === slabId);
        openingsOnSlab.forEach(o => {
            this.openingStore.remove(o.id);
        });
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
        window.removeEventListener('bim-slab-removed', this.onSlabRemoved);
    }
}
