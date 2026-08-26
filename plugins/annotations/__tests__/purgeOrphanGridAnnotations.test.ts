/**
 * §GRID106 — purgeOrphanGridAnnotations: projects saved BEFORE the
 * RemoveGridCommand sweep carry immortal ghost grid bubbles (the founder's
 * screenshot). The load-time purge removes exactly those — annotations whose
 * `parameters.gridId` names a grid that no longer exists — and nothing else.
 */

import { describe, it, expect } from 'vitest';
import { AnnotationStore } from '../src/subsystem/AnnotationStore';
import { makeAnnotationElement } from '../src/subsystem/AnnotationTypes';
import { purgeOrphanGridAnnotations } from '../src/subsystem/purgeOrphanGridAnnotations';

function bubble(id: string, gridId: string, label: string) {
    const p = { x: 1, y: 0, z: 2 };
    return makeAnnotationElement(
        id, 'grid-bubble', 'view-plan-L0',
        [{ elementId: `pt-${id}`, elementType: 'point', stableKey: `pt-${id}`, cachedPosition: p } as never],
        { modelPoints: [p], offset: 0 },
        { gridId, gridName: label, axis: 'Y', position: 2, endIndex: 1, cachedLabel: label },
        { lineColor: '#4b5563', textColor: '#374151', lineWeight: 0.25 },
    );
}

describe('§GRID106 — purgeOrphanGridAnnotations (pre-fix saved ghosts)', () => {
    it('removes ONLY annotations claiming a dead grid; live-grid bubbles and grid-less annotations survive', () => {
        const store = new AnnotationStore();
        // The founder's saved-project shape: bubbles whose grids were deleted…
        store.add(bubble('ghost-L', 'grid_dead_L', 'L'));
        store.add(bubble('ghost-K', 'grid_dead_K', 'K'));
        // …a bubble whose grid is ALIVE…
        store.add(bubble('live-A', 'grid_live_A', 'A'));
        // …and a plain annotation with no grid claim.
        store.add(makeAnnotationElement(
            'note-1', 'text-note', 'view-plan-L0',
            [], { modelPoints: [{ x: 0, y: 0, z: 0 }], offset: 0 },
            { text: 'keep me' }, {},
        ));

        const removed = purgeOrphanGridAnnotations(new Set(['grid_live_A']), store);

        expect(removed.sort()).toEqual(['ghost-K', 'ghost-L']);
        expect(store.has('ghost-L')).toBe(false);
        expect(store.has('ghost-K')).toBe(false);
        expect(store.has('live-A')).toBe(true);
        expect(store.has('note-1')).toBe(true);
    });

    it('a clean store is untouched and reports an empty removal set', () => {
        const store = new AnnotationStore();
        store.add(bubble('live-A', 'grid_live_A', 'A'));
        const removed = purgeOrphanGridAnnotations(new Set(['grid_live_A']), store);
        expect(removed).toEqual([]);
        expect(store.getAll()).toHaveLength(1);
    });

    it('an empty live set (no grids in the project) purges every grid-claiming annotation', () => {
        const store = new AnnotationStore();
        store.add(bubble('ghost-1', 'grid_gone', '1'));
        const removed = purgeOrphanGridAnnotations(new Set(), store);
        expect(removed).toEqual(['ghost-1']);
        expect(store.getAll()).toHaveLength(0);
    });
});
