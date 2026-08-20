// @vitest-environment happy-dom
//
// §ROOMTAG-ONE-COMMAND (L-1396).
//
// ⭐ THE DEFECT: `RoomTagAutoPopulator.populate` dispatched one
// `CreateAnnotationCommand` PER ROOM. The founder's model has 24 rooms per level and
// seven levels, so one "Furnish all rooms (AI)" gesture drove ~168 separate command
// dispatches for automatic tag placement — each with its own `[CommandManager]
// EXECUTE:` + `snapshot … elapsed=` console pair, and each its own UNDO ENTRY.
//
// The undo half is the part that is not merely noise: undoing one automatic tag pass
// took twenty-four presses of Ctrl-Z, which C11 / C24.1 §1.2 says a generated SET must
// never require. `CreateManyAnnotationsCommand` had existed since L-145 (ADR-0119)
// solving exactly this for AutoDimension, with one consumer.
//
// ⛔ The store here is a real Map-backed stand-in, not a stub of the thing under test:
// what is measured is how many commands the populator HANDS the manager, and what the
// store ends up holding. Both are observable facts, not prose.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomTagAutoPopulator } from '../RoomTagAutoPopulator';
import type { ViewDefinition } from '@pryzm/core-app-model';

const VIEW_ID = 'vd-plan-L0';
const LEVEL = 'L0';

interface AnnLike { id: string; ownerViewId: string; parameters?: Record<string, unknown> }

/** A Map-backed annotation store with the surface the commands actually call. */
function makeAnnotationStore() {
    const byId = new Map<string, AnnLike>();
    return {
        byId,
        has: (id: string) => byId.has(id),
        add: (el: AnnLike) => { byId.set(el.id, el); },
        remove: (id: string) => { byId.delete(id); },
        getByView: (viewId: string) => [...byId.values()].filter(a => a.ownerViewId === viewId),
    };
}

function makeRooms(n: number) {
    return Array.from({ length: n }, (_, i) => ({
        id: `room_${i}`,
        levelId: LEVEL,
        name: `Room ${i}`,
        roomNumber: String(100 + i),
        computed: { area: 10 + i, centroid: { x: i, z: 0 } },
    }));
}

function run(roomCount: number) {
    const annotationStore = makeAnnotationStore();
    const rooms = makeRooms(roomCount);
    const executed: Array<{ type: unknown; targetIds: string[] }> = [];
    const ctx = { stores: { annotationStore }, annotationStore };
    const commandManager = {
        execute(cmd: any) {
            executed.push({ type: cmd.type, targetIds: cmd.targetIds });
            return cmd.execute(ctx);
        },
    };
    // `canExecute` is called by the populator with `{}`; both annotation commands
    // fall back to `window.annotationStore` when the context carries none.
    (window as unknown as { annotationStore?: unknown }).annotationStore = annotationStore;
    (window as unknown as { viewDefinitionStore?: unknown }).viewDefinitionStore = {
        has: (id: string) => id === VIEW_ID,
    };

    const populator = new RoomTagAutoPopulator({
        roomStore: { getByLevel: (l: string) => (l === LEVEL ? rooms : []) } as never,
        annotationStore,
        commandManager,
    });
    const viewDef = { id: VIEW_ID, spatial: { levelId: LEVEL } } as unknown as ViewDefinition;
    populator.populate(viewDef);
    return { executed, annotationStore, viewDef, populator };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('§ROOMTAG-ONE-COMMAND (L-1396)', () => {
    it('⭐ 24 rooms produce ONE command, not 24', () => {
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        const { executed, annotationStore } = run(24);

        // The measurement that matters: dispatches, not tags.
        expect(executed.length).toBe(1);
        // …and it really is the whole set — a single command that tagged one room
        // would satisfy the count above while destroying the feature.
        expect(executed[0]!.targetIds.length).toBe(24);
        expect(annotationStore.byId.size).toBe(24);
    });

    it('every room still gets its own tag, with its own room id', () => {
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        const { annotationStore } = run(24);
        const roomIds = [...annotationStore.byId.values()]
            .map(a => (a.parameters as { roomId?: string } | undefined)?.roomId)
            .sort();
        expect(new Set(roomIds).size).toBe(24);
        expect(roomIds).toContain('room_0');
        expect(roomIds).toContain('room_23');
    });

    it('⭐ a settled view still writes NOTHING (§A.21.D25 loop-cut preserved)', () => {
        // The idempotent no-op is what stops projection feeding itself an annotation
        // write. Batching must not turn "nothing to do" into "one empty command".
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        const { executed, populator, viewDef } = run(24);
        expect(executed.length).toBe(1);
        executed.length = 0;

        populator.populate(viewDef);          // second pass over a settled view
        expect(executed).toEqual([]);
    });

    it('zero rooms dispatches nothing at all', () => {
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        const { executed, annotationStore } = run(0);
        expect(executed).toEqual([]);
        expect(annotationStore.byId.size).toBe(0);
    });
});
