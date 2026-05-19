import { RoofStore } from './RoofStore';

/**
 * RoofLevelCleanupHandler
 *
 * Contract §01 §2.1 / §3.5 Compliance:
 * Handles cascading deletion of roofs when a level is removed.
 * Extracted OUT of RoofStore (which must remain data-only per §3.5)
 * and placed here as an external orchestration handler, mirroring the
 * pattern established by SlabLevelCleanupHandler and OpeningCleanupHandler.
 */
export class RoofLevelCleanupHandler {
    private roofStore: RoofStore;

    constructor(roofStore: RoofStore) {
        this.roofStore = roofStore;
        this.attach();
    }

    private attach(): void {
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const roofsOnLevel = this.roofStore.getByLevel(levelId);
        roofsOnLevel.forEach(roof => {
            this.roofStore.remove(roof.id);
        });
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
