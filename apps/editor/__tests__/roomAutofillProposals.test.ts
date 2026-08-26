// §ROOMTYPE142 — buildRoomAutofillProposals: the preview step behind the
// "Autofill Room Names…" button (RoomAutoOrganiser.ts). Proves the two
// safety arms the founder's brief called out by name:
//   • the CLOBBER arm — a room a human already renamed is left untouched
//     (both name and occupancy), never silently overwritten;
//   • the naming scheme — "<Label> <NN>", sequential per level, reusing
//     the SAME primitives the L-905 chat-rename gesture already ships
//     (@pryzm/ai-host's nextAutoLabelIndex/formatAutoLabelName).
// No DOM is exercised here — only the pure preview builder.
//
// ⚠ MODULE LOADING IS DELIBERATELY DEFERRED (via a dynamic `import()` inside
// `beforeAll`, AFTER `globalThis.window` is stubbed) — mirrors the codebase's
// own established "§BARREL-LAZY" fix (see houseModalHtml.liveModal.test.ts):
// RoomAutoOrganiser.ts statically imports `@pryzm/ai-host`'s VALUE barrel,
// which transitively constructs a `ConstraintEngineImpl` singleton at module
// scope (`packages/ai-host/src/generative/LayoutGenerator.ts` →
// `ConstraintEngine.ts`) that references the bare identifier `window`
// unconditionally. This suite's `environment: 'node'` (apps/editor/vitest.config.ts)
// has NO `window` global by default, and ES module imports are hoisted ABOVE
// any of this file's own top-level statements — so a STATIC top-level import of
// RoomAutoOrganiser.ts would evaluate ai-host's chain before this file's own
// `globalThis.window = {}` line ever ran, and crash with "window is not defined"
// (a ReferenceError on the bare identifier, not a property access — the
// production code's own `?.` guards on `window.runtime` etc. are otherwise fine
// once the identifier itself exists). Deferring the import via `await import(...)`
// inside `beforeAll`, after the stub is in place, sidesteps this without any
// production-code change.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { storeRegistry } from '@pryzm/core-app-model';

interface FakeRoom {
    id: string;
    name: string;
    roomNumber: string;
    levelId: string;
    occupancyType: string;
}

function makeRoomStore(rooms: FakeRoom[]) {
    return {
        getAll: () => rooms,
        getById: (id: string) => rooms.find((r) => r.id === id),
        getByLevel: (levelId: string) => rooms.filter((r) => r.levelId === levelId),
    };
}

/** Wires window.roomContentsService.getContents for a fixed map of roomId → furniture names. */
function setContentsMap(byRoom: Record<string, string[]>): void {
    (globalThis as any).window.roomContentsService = {
        getContents: (id: string) => {
            const names = byRoom[id];
            if (names === undefined) return null;
            return {
                contained: {
                    furniture: names.map((n, i) => ({ id: `${id}-f${i}`, label: n })),
                    plumbing: [],
                    stairs: [],
                },
            };
        },
    };
}

function setFurnitureStore(byRoom: Record<string, string[]>): void {
    const records: Array<{ id: string; name: string }> = [];
    for (const [roomId, names] of Object.entries(byRoom)) {
        names.forEach((n, i) => records.push({ id: `${roomId}-f${i}`, name: n }));
    }
    storeRegistry.register('furniture', { getAll: () => records });
}

describe('buildRoomAutofillProposals — §ROOMTYPE142', () => {
    let buildRoomAutofillProposals: (
        roomIds: readonly string[],
    ) => import('../src/ui/property-inspector/RoomAutoOrganiser').RoomAutofillPreview;

    beforeAll(async () => {
        // Must exist BEFORE the dynamic import below runs — RoomAutoOrganiser.ts
        // transitively imports @pryzm/ai-host's value barrel, which constructs a
        // ConstraintEngineImpl singleton at module scope
        // (packages/constraint-solver/src/ConstraintEngine.ts) that calls
        // `window.addEventListener` unconditionally in its constructor. This node
        // suite has no real DOM, so a minimal no-op stub is enough — nothing under
        // test here ever depends on those listeners actually firing.
        (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };
        ({ buildRoomAutofillProposals } = await import('../src/ui/property-inspector/RoomAutoOrganiser'));
    }, 60_000); // the transitive ai-host/workflow module graph is large to transform on first import

    beforeEach(() => {
        (globalThis as any).window = { ...((globalThis as any).window ?? {}) };
        storeRegistry.register('plumbing', { getAll: () => [] });
    });

    afterEach(() => {
        // Keep `window` itself defined (module-level singletons in the imported
        // chain still reference it), just clear the per-test service stub.
        delete (globalThis as any).window.roomContentsService;
    });

    it('the CLOBBER arm: a user-renamed room is reported as authoredSkip, never renamed or reclassified', () => {
        const rooms: FakeRoom[] = [
            { id: 'r1', name: 'My Reading Nook', roomNumber: '00-001', levelId: 'L0', occupancyType: 'unclassified' },
        ];
        storeRegistry.register('room', makeRoomStore(rooms));
        setFurnitureStore({ r1: ['Double Bed'] }); // matches Bedroom, but the name is authored
        setContentsMap({ r1: ['Double Bed'] });

        const result = buildRoomAutofillProposals(['r1']);
        expect(result.toApply).toEqual([]);
        expect(result.authoredSkipIds).toEqual(['r1']);
        expect(result.unclassifiedIds).toEqual([]);
    });

    it('the HONESTY arm: an empty room is unclassified and not proposed for rename', () => {
        const rooms: FakeRoom[] = [
            { id: 'r1', name: 'Room 00-001', roomNumber: '00-001', levelId: 'L0', occupancyType: 'unclassified' },
        ];
        storeRegistry.register('room', makeRoomStore(rooms));
        setFurnitureStore({ r1: [] });
        setContentsMap({ r1: [] });

        const result = buildRoomAutofillProposals(['r1']);
        expect(result.toApply).toEqual([]);
        expect(result.unclassifiedIds).toEqual(['r1']);
        expect(result.authoredSkipIds).toEqual([]);
    });

    it('an auto-default-named room with a bed is proposed for rename to Bedroom 01', () => {
        const rooms: FakeRoom[] = [
            { id: 'r1', name: 'Room 02-009', roomNumber: '02-009', levelId: 'L2', occupancyType: 'unclassified' },
        ];
        storeRegistry.register('room', makeRoomStore(rooms));
        setFurnitureStore({ r1: ['Double Bed'] });
        setContentsMap({ r1: ['Double Bed'] });

        const result = buildRoomAutofillProposals(['r1']);
        expect(result.toApply).toEqual([
            { roomId: 'r1', currentName: 'Room 02-009', ruleLabel: 'Bedroom', proposedName: 'Bedroom 01', occupancyType: 'bedroom' },
        ]);
    });

    it('naming scheme: two auto-default bedrooms on the SAME level number sequentially (Bedroom 01, Bedroom 02)', () => {
        const rooms: FakeRoom[] = [
            { id: 'r1', name: 'Room 02-001', roomNumber: '02-001', levelId: 'L2', occupancyType: 'unclassified' },
            { id: 'r2', name: 'Room 02-002', roomNumber: '02-002', levelId: 'L2', occupancyType: 'unclassified' },
        ];
        storeRegistry.register('room', makeRoomStore(rooms));
        setFurnitureStore({ r1: ['Double Bed'], r2: ['Single Bed'] });
        setContentsMap({ r1: ['Double Bed'], r2: ['Single Bed'] });

        const result = buildRoomAutofillProposals(['r1', 'r2']);
        const names = result.toApply.map((p) => p.proposedName).sort();
        expect(names).toEqual(['Bedroom 01', 'Bedroom 02']);
    });

    it('a room already named "Bedroom 01" (deterministically) reserves that index for the next room', () => {
        const rooms: FakeRoom[] = [
            // Not an auto-default name (does not match the minted shape), so it is
            // AUTHORED and left alone — but its name still occupies "Bedroom 01"
            // for collision purposes, same discipline as roomAutoLabel.ts's own
            // nextAutoLabelIndex over "taken" names.
            { id: 'r1', name: 'Bedroom 01', roomNumber: '02-001', levelId: 'L2', occupancyType: 'bedroom' },
            { id: 'r2', name: 'Room 02-002', roomNumber: '02-002', levelId: 'L2', occupancyType: 'unclassified' },
        ];
        storeRegistry.register('room', makeRoomStore(rooms));
        setFurnitureStore({ r1: ['Double Bed'], r2: ['Single Bed'] });
        setContentsMap({ r1: ['Double Bed'], r2: ['Single Bed'] });

        const result = buildRoomAutofillProposals(['r1', 'r2']);
        // r1 is authored (name doesn't match the minted shape) — skipped.
        expect(result.authoredSkipIds).toEqual(['r1']);
        // r2 is proposed, and must NOT collide with r1's existing "Bedroom 01".
        expect(result.toApply).toEqual([
            { roomId: 'r2', currentName: 'Room 02-002', ruleLabel: 'Bedroom', proposedName: 'Bedroom 02', occupancyType: 'bedroom' },
        ]);
    });
});
