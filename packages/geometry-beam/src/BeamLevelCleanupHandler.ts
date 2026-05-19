import { BeamStore } from '@pryzm/core-app-model/stores';

/**
 * BeamLevelCleanupHandler
 *
 * Contract §01 §2.1 / §3.5 Compliance:
 * Handles cascading deletion of beams when a level is removed.
 * Extracted OUT of BeamStore (which must remain data-only per §3.5)
 * and placed here as an external orchestration handler, mirroring the
 * pattern established by SlabLevelCleanupHandler and OpeningCleanupHandler.
 */
export class BeamLevelCleanupHandler {
    private beamStore: BeamStore;

    constructor(beamStore: BeamStore) {
        this.beamStore = beamStore;
        this.attach();
    }

    private attach(): void {
        window.addEventListener('bim-level-removed', this.onLevelRemoved);
    }

    private onLevelRemoved = (e: Event): void => {
        const levelId = (e as CustomEvent).detail?.levelId;
        if (!levelId) return;

        const beamsOnLevel = this.beamStore.getByLevel(levelId);
        beamsOnLevel.forEach(beam => {
            this.beamStore.remove(beam.id);
        });
    };

    dispose(): void {
        window.removeEventListener('bim-level-removed', this.onLevelRemoved);
    }
}
