import { HandrailStore } from '@pryzm/core-app-model/stores';

/**
 * HandrailLevelCleanupHandler
 *
 * Contract §01 §2.1 / §3.5 Compliance:
 * Handles cascading deletion of handrails when a level is removed.
 * Extracted OUT of HandrailStore (which must remain data-only per §3.5)
 * and placed here as an external orchestration handler, mirroring the
 * pattern established by SlabLevelCleanupHandler and OpeningCleanupHandler.
 */
export class HandrailLevelCleanupHandler {
    private handrailStore: HandrailStore;

    constructor(handrailStore: HandrailStore) {
        this.handrailStore = handrailStore;
        this.attach();
    }

    private attach(): void {
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const handrailsOnLevel = this.handrailStore.getAll().filter(h => h.levelId === levelId);
        handrailsOnLevel.forEach(h => {
            this.handrailStore.remove(h.id);
        });
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
