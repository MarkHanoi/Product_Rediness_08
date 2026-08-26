/**
 * §GRID106 — load-time purge of ORPHAN grid-linked annotations.
 *
 * WHY THIS EXISTS ALONGSIDE THE RemoveGridCommand SWEEP
 * ─────────────────────────────────────────────────────
 * Until 2026-08-26, deleting a grid removed only the GridStore record; the
 * grid's bubble AnnotationElements (linked solely by `parameters.gridId` —
 * GridPlanToolHandler._createPlanBubble, GridBubbleTool) survived AND were
 * persisted by ProjectSerializer. Projects saved before the fix therefore
 * carry immortal ghost bubbles — the founder's screenshot showed nine of
 * them floating with no grid lines attached. The command-side sweep stops
 * NEW ghosts; this purge removes the ones already baked into saved projects,
 * run once per project load (engineLauncher, 'pryzm-project-loaded').
 *
 * WHAT IT REMOVES — and, as importantly, what it does NOT
 * ───────────────────────────────────────────────────────
 * Removed: any annotation whose `parameters.gridId` is a non-empty string
 * naming a grid that no longer exists. The gridId link is the ownership key
 * both producers write; nothing else mints it.
 * Kept:   annotations with NO gridId parameter (manually placed notes, tags,
 *         dimensions — no grid claim, no orphan verdict), and every
 *         annotation whose grid is alive.
 *
 * This is a load-time normalisation, not a user gesture — it produces no
 * undo entry, exactly like ProjectLoader's own store writes.
 */

import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { annotationStore as defaultAnnotationStore } from './AnnotationStore.js';

/** The two methods the purge needs — injectable for tests. */
export interface PurgeableAnnotationStore {
    getAll(): Array<{ id: string; parameters?: Record<string, unknown> }>;
    remove(id: string): void;
}

/**
 * Remove every annotation claiming a grid that is not in `liveGridIds`.
 * Returns the removed annotation ids (empty array when the store is clean).
 */
export function purgeOrphanGridAnnotations(
    liveGridIds: ReadonlySet<string>,
    store: PurgeableAnnotationStore = defaultAnnotationStore,
): string[] {
    return withHandlerSpan(
        'annotation.purgeOrphanGridAnnotations',
        { 'pryzm.annotation.liveGridCount': liveGridIds.size },
        () => {
            const removed: string[] = [];
            for (const ann of store.getAll()) {
                const gridId = ann.parameters?.gridId;
                if (typeof gridId === 'string' && gridId.length > 0 && !liveGridIds.has(gridId)) {
                    store.remove(ann.id);
                    removed.push(ann.id);
                }
            }
            if (removed.length > 0) {
                console.log(
                    `[purgeOrphanGridAnnotations] §GRID106 — removed ${removed.length} orphan ` +
                    `grid annotation(s) whose grid no longer exists:`, removed,
                );
            }
            return removed;
        },
    );
}
