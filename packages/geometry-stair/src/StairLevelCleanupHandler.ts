import { StairStore } from './StairStore';

/**
 * StairLevelCleanupHandler
 *
 * Contract §01 §2.1 / §3.5 Compliance:
 * Handles cascading deletion of stairs when a level is removed.
 * Extracted OUT of StairStore (which must remain data-only per §3.5)
 * and placed here as an external orchestration handler, mirroring the
 * pattern established by SlabLevelCleanupHandler and OpeningCleanupHandler.
 *
 * Note: StairStore previously used eventBus.on('bim-level-removed', ...).
 * This handler normalises to window 'bim-level-removed' CustomEvent, which
 * is the canonical DOM bridge used by all other level-removal cleanup paths.
 */
export class StairLevelCleanupHandler {
    private stairStore: StairStore;

    constructor(stairStore: StairStore) {
        this.stairStore = stairStore;
        this.attach();
    }

    private attach(): void {
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const stairsOnLevel = this.stairStore.getByLevel(levelId);
        stairsOnLevel.forEach(stair => {
            this.stairStore.remove(stair.id);
        });
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
