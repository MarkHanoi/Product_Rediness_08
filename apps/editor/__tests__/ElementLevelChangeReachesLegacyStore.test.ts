/**
 * §L-946 — CHANGING AN ELEMENT'S LEVEL FROM THE PROPERTIES PANEL
 *
 * Founder: *"the user selects an element (e.g. a wall) and in the properties
 * panel changes the element's level — it doesn't work."*
 *
 * ─── WHY EVERY ASSERTION BELOW READS A LEGACY STORE ──────────────────────────
 * The dispatch is CORRECT and the handler is CORRECT.
 * `PropertyPanelSections.ts:152` sends `{ id, newLevelId, newElevationY }`,
 * which byte-matches `ChangeWallLevelPayload`, and
 * `plugins/wall/__tests__/s10-handlers.test.ts:526` already proves the handler
 * rewrites `levelId` and rebases `baseLine.y`. Both are green. The gesture still
 * does nothing.
 *
 * It does nothing because the handler writes the **PLUGIN** store
 * (`plugins/wall/src/store.ts`) while the renderer reads the **LEGACY** store
 * (`packages/geometry-wall/src/WallStore.ts`) — the one `WallRebuildCoordinator`
 * subscribes to and `WallFragmentBuilder` derives `worldY` from. Every bridge
 * between the two in `initTools.ts` is a `.created` event; there are TWELVE of
 * them and NOT ONE for a mutation.
 *
 * This is §committed-is-not-reachable exactly: a proof taken at the handler's
 * return value passes while the layer the user experiences keeps its own copy.
 * So nothing here asserts on a handler result. Arm 2 and Arm 3 read the record
 * back out of the real `@pryzm/geometry-wall` / `@pryzm/geometry-roof` stores,
 * after a dispatch through the REAL bus verb.
 *
 * ─── THE FOUR THINGS THAT MUST ALL MOVE ──────────────────────────────────────
 *   (1) the legacy store's `levelId`      → the 3D mesh rebuilds on the new storey
 *   (2) `bimManager` level membership     → `level.childrenIds` drives the plan
 *                                            projection (NativeElementMeshExporter)
 *   (3) the VDT element→level map         → plan views on BOTH storeys re-project
 *   (4) a rebuild actually fires          → 'remove' then 'add' on the legacy store
 * A fix that moves only (1) leaves plan view and visibility disagreeing with 3D,
 * which is the same defect wearing different clothes.
 */

import { describe, expect, it } from 'vitest';
import {
    CommandBus,
    PatchEmitter,
    UndoStack,
    attachStores,
    createId,
} from '@pryzm/plugin-sdk';
import { WallStore as PluginWallStore, type WallsState } from '@pryzm/plugin-wall';
import { buildWallHandlerSet } from '@pryzm/plugin-wall';
import { RoofStore as PluginRoofStore, type RoofsState } from '@pryzm/plugin-roof';
import { buildRoofHandlerSet } from '@pryzm/plugin-roof';
import { WallStore as LegacyWallStore } from '@pryzm/geometry-wall';
import { RoofStore as LegacyRoofStore } from '@pryzm/geometry-roof';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const GROUND = 'L0';
const FIRST = 'L1';
const FIRST_ELEVATION = 3;

interface FakeLevel { id: string; name: string; elevation: number; childrenIds: string[] }

/**
 * A BimManager stand-in that reproduces `BimKernel.registerElement`'s
 * EXCLUSIVE-CONTAINMENT semantics verbatim (`BimKernel.ts:257-265`): registering
 * an element into a level filters it out of every other level first. That is the
 * behaviour the fix relies on to MOVE membership rather than duplicate it, so the
 * fake must have it or arm 2's assertion would prove nothing.
 */
function makeBimManager() {
    const levels = new Map<string, FakeLevel>([
        [GROUND, { id: GROUND, name: 'Ground', elevation: 0, childrenIds: [] }],
        [FIRST, { id: FIRST, name: 'First', elevation: FIRST_ELEVATION, childrenIds: [] }],
    ]);
    return {
        levels,
        getLevelById: (id: string) => levels.get(id),
        getLevels: () => [...levels.values()],
        registerElement(elementId: string, levelId: string): void {
            const target = levels.get(levelId);
            if (!target) throw new Error(`Target Level "${levelId}" not found`);
            levels.forEach((l) => {
                if (l.id !== levelId) l.childrenIds = l.childrenIds.filter((i) => i !== elementId);
            });
            if (!target.childrenIds.includes(elementId)) target.childrenIds.push(elementId);
        },
        unregisterElement(elementId: string): void {
            levels.forEach((l) => { l.childrenIds = l.childrenIds.filter((i) => i !== elementId); });
        },
        /** Which storey currently CONTAINS this element, per `level.childrenIds`. */
        levelOf(elementId: string): string | undefined {
            for (const l of levels.values()) if (l.childrenIds.includes(elementId)) return l.id;
            return undefined;
        },
    };
}

/** A ViewDependencyTracker stand-in — only the two calls the mirror makes. */
function makeViewDependencyTracker() {
    const elementLevelMap = new Map<string, string>();
    const dirtiedLevelIds: string[] = [];
    return {
        elementLevelMap,
        dirtiedLevelIds,
        registerElement: (id: string, levelId: string) => { elementLevelMap.set(id, levelId); },
        unregisterElement: (id: string) => { elementLevelMap.delete(id); },
        markLevelsDirty: (ids: string[]) => { dirtiedLevelIds.push(...ids); },
    };
}

/** The real legacy WallStore, attached to a level authority (ADR-0318). */
function makeLegacyWallStore(bim: ReturnType<typeof makeBimManager>): LegacyWallStore {
    return new LegacyWallStore({ activeLevelId: GROUND } as never, bim as never);
}

/** A minimal `EventRecord` of the shape `PatchEmitter` hands the bridge. */
function makeRecord(type: string, payload: unknown) {
    return {
        id: 'evt-l946',
        type,
        payload,
        affectedStores: [type.split('.')[0]],
        audit: { actorId: 'probe', projectId: 'p1' },
        forward: [],
        inverse: [],
    };
}

/** Drive the REAL `CommandEventBridge` and collect every event name it emits.
 *  Imported from source, not the barrel: `@pryzm/runtime-composer`'s index
 *  transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at module scope
 *  and cannot load under this suite's `node` environment. */
async function emitsFor(type: string, payload: unknown): Promise<Map<string, unknown>> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    const seen = new Map<string, unknown>();
    let deliver!: (bytes: unknown, record: unknown) => void;
    const patches = {
        subscribe: (cb: (b: unknown, r: unknown) => void) => { deliver = cb; return () => {}; },
    };
    const events = { emit: (name: string, p: unknown) => { seen.set(name, p); } };
    wireCommandEventBridge(patches as never, events as never);
    deliver(new Uint8Array(), makeRecord(type, payload));
    return seen;
}

// ── Arms ─────────────────────────────────────────────────────────────────────

describe('§L-946 — a level change must reach the store the RENDERER reads', () => {
    /**
     * ARM 1 — THE EMIT GAP, measured on the real bridge.
     *
     * `initTools.ts`'s twelve legacy-store bridges are driven ENTIRELY by
     * `runtime.events`. A verb that emits no domain event can therefore never
     * reach the legacy store however correct its handler is — no subscriber,
     * however well written, has anything to subscribe to. This arm needs no
     * stores at all; it asks only whether the channel exists.
     */
    it('ARM 1 — `wall.changeLevel` emits a MUTATION event, not just `command.executed`', async () => {
        const seen = await emitsFor('wall.changeLevel', {
            id: 'w-probe', newLevelId: FIRST, newElevationY: FIRST_ELEVATION,
        });

        expect(
            [...seen.keys()],
            'the generic relay always fires — its presence is what makes the absence of a typed event silent',
        ).toContain('command.executed');

        expect(
            [...seen.keys()],
            'wall.changeLevel must emit a typed mutation event — every bus→legacy bridge is event-driven, so a verb that emits nothing is unbridgeable by construction',
        ).toContain('element.level-changed');

        const ev = seen.get('element.level-changed') as {
            elementKind?: string; elementId?: string; newLevelId?: string; newElevationY?: number;
        };
        expect(ev.elementKind).toBe('wall');
        expect(ev.elementId).toBe('w-probe');
        expect(ev.newLevelId).toBe(FIRST);
    });

    /**
     * ARM 2 — THE REACHABILITY PROOF, wall.
     *
     * Real plugin handlers on a real `CommandBus`, the real
     * `CommandEventBridge`, the real `EventBus`, the real legacy `WallStore`,
     * and the SAME registration function `initTools.ts` calls. The only thing
     * dispatched is the founder's gesture: the bus verb the properties panel
     * sends.
     */
    it('ARM 2 — dispatching the REAL `wall.changeLevel` verb moves the LEGACY wall record', async () => {
        const { EventBus } = await import('../../../packages/runtime-composer/src/EventBus');
        const { wireCommandEventBridge } = await import(
            '../../../packages/runtime-composer/src/CommandEventBridge'
        );
        const { registerElementLevelChangeBridge } = await import(
            '../src/engine/elementLevelChangedMirror'
        );

        const bim = makeBimManager();
        const vdt = makeViewDependencyTracker();
        const legacyWallStore = makeLegacyWallStore(bim);

        // The bus half — exactly `plugins/wall/__tests__/s10-handlers.test.ts`'s env.
        const pluginStore = new PluginWallStore();
        const emitter = new PatchEmitter();
        const bus = new CommandBus({
            audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
            emitter,
            undoStack: new UndoStack({ maxSize: 50 }),
            storesProvider: () => ({
                wall: Object.fromEntries(pluginStore.getState()) as WallsState,
            }),
        });
        for (const h of buildWallHandlerSet({})) bus.register(h);
        const detach = attachStores(emitter, {
            wall: pluginStore as unknown as import('@pryzm/stores').Store<object>,
        });

        // The bridge half — production wiring.
        const events = new EventBus();
        wireCommandEventBridge(emitter, events);
        registerElementLevelChangeBridge(events as never, {
            wallStore: legacyWallStore as never,
            viewDependencyTracker: vdt as never,
            bimManager: bim as never,
        });

        // Seed a wall that exists in BOTH stores on the ground floor, as any
        // wall the user can select does.
        const id = createId('wall');
        await bus.executeCommand('wall.create', {
            id,
            levelId: GROUND,
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
        });
        legacyWallStore.add({
            id, type: 'wall', levelId: GROUND,
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
            height: 2.7, thickness: 0.2, properties: {},
        } as never);
        bim.registerElement(id, GROUND);
        vdt.registerElement(id, GROUND);

        // (4) the rebuild signal. `WallRebuildCoordinator` schedules off exactly
        // these store events, so recording them is recording the rebuild.
        const storeEvents: string[] = [];
        legacyWallStore.subscribe((event: string) => { storeEvents.push(event); });

        // THE GESTURE — byte-identical to PropertyPanelSections.ts:155-159.
        await bus.executeCommand('wall.changeLevel', {
            id, newLevelId: FIRST, newElevationY: FIRST_ELEVATION,
        });

        try {
            // The command itself works — stated so a failure below cannot be
            // misread as "the handler is broken".
            expect(pluginStore.get(id)?.levelId, 'the plugin handler is not the defect').toBe(FIRST);

            // (1) THE DEFECT.
            expect(
                legacyWallStore.getById(id)?.levelId,
                'the LEGACY store is what WallRebuildCoordinator subscribes to and what WallFragmentBuilder derives worldY from — a level change the renderer never hears is a level change the user never sees',
            ).toBe(FIRST);

            // (2) plan projection reads `level.childrenIds`, not the wall store.
            expect(
                bim.levelOf(id),
                'bimManager level membership must MOVE — NativeElementMeshExporter builds the plan projection from level.childrenIds, so a wall left in the old level draws on the old plan',
            ).toBe(FIRST);
            expect(bim.levels.get(GROUND)!.childrenIds).not.toContain(id);

            // (3) the VDT map, and BOTH storeys re-projected.
            expect(
                vdt.elementLevelMap.get(id),
                'the VDT element→level map must move or every later store event on this wall dirties the wrong storey',
            ).toBe(FIRST);
            expect(
                vdt.dirtiedLevelIds,
                'the storey the wall LEFT must be re-projected too, or its plan view keeps drawing a wall that is no longer there',
            ).toContain(GROUND);
            expect(vdt.dirtiedLevelIds).toContain(FIRST);

            // (4) the rebuild fired.
            expect(
                storeEvents,
                "WallStore.changeLevel emits 'remove' then 'add' — that pair is what tears the mesh off the old storey and builds it on the new one",
            ).toEqual(['remove', 'add']);
        } finally {
            detach();
        }
    });

    /**
     * ARM 3 — THE SAME PROOF FOR `roof.changeLevel`.
     *
     * Roof has the identical hole and one extra trap: the legacy
     * `RoofStore.update()` THROWS `levelId is immutable after creation`, so a
     * mirror written as a plain `update({ levelId })` fails loudly at runtime
     * and silently in a suite that never runs it.
     */
    it('ARM 3 — dispatching the REAL `roof.changeLevel` verb moves the LEGACY roof record', async () => {
        const { EventBus } = await import('../../../packages/runtime-composer/src/EventBus');
        const { wireCommandEventBridge } = await import(
            '../../../packages/runtime-composer/src/CommandEventBridge'
        );
        const { registerElementLevelChangeBridge } = await import(
            '../src/engine/elementLevelChangedMirror'
        );

        const bim = makeBimManager();
        const vdt = makeViewDependencyTracker();
        const legacyRoofStore = new LegacyRoofStore({ activeLevelId: GROUND } as never);

        const pluginStore = new PluginRoofStore();
        const emitter = new PatchEmitter();
        const bus = new CommandBus({
            audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
            emitter,
            undoStack: new UndoStack({ maxSize: 50 }),
            storesProvider: () => ({
                roof: Object.fromEntries(pluginStore.getState()) as RoofsState,
            }),
        });
        for (const h of buildRoofHandlerSet()) bus.register(h);
        const detach = attachStores(emitter, {
            roof: pluginStore as unknown as import('@pryzm/stores').Store<object>,
        });

        const events = new EventBus();
        wireCommandEventBridge(emitter, events);
        registerElementLevelChangeBridge(events as never, {
            roofStore: legacyRoofStore as never,
            viewDependencyTracker: vdt as never,
            bimManager: bim as never,
        });

        const id = createId('roof');
        await bus.executeCommand('roof.create', {
            id,
            levelId: GROUND,
            boundary: [
                { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 },
                { x: 5, y: 0, z: 5 }, { x: 0, y: 0, z: 5 },
            ],
        });
        legacyRoofStore.add({
            id, type: 'roof', levelId: GROUND,
            footprint: { polygon: [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]], centroid: [2.5, 2.5] },
            roofType: 'flat', overhang: 0.3, baseOffset: 0, thickness: 0.2, properties: {},
        } as never);
        bim.registerElement(id, GROUND);
        vdt.registerElement(id, GROUND);

        const storeEvents: string[] = [];
        legacyRoofStore.on('update', () => { storeEvents.push('update'); });
        legacyRoofStore.on('add', () => { storeEvents.push('add'); });
        legacyRoofStore.on('remove', () => { storeEvents.push('remove'); });

        await bus.executeCommand('roof.changeLevel', { roofId: id, levelId: FIRST });

        try {
            expect(pluginStore.get(id)?.levelId, 'the plugin handler is not the defect').toBe(FIRST);
            expect(
                legacyRoofStore.getById(id)?.levelId,
                'RoofFragmentBuilder positions the roof at `getLevelById(data.levelId).elevation + baseOffset` — the legacy record IS the roof\'s storey',
            ).toBe(FIRST);
            expect(bim.levelOf(id)).toBe(FIRST);
            expect(vdt.elementLevelMap.get(id)).toBe(FIRST);
            expect(
                storeEvents.length,
                'the legacy roof store must EMIT, or initBuilders\' `bim-roof-updated` listener never calls roofBuilder.updateRoof and the mesh stays on the old storey',
            ).toBeGreaterThan(0);
        } finally {
            detach();
        }
    });

    /**
     * ARM 4 — CTRL+Z, and why closing the forward direction ALONE would have been
     * a regression with a fix attached.
     *
     * `performUndoRedo` routes a command's inverse patches into the LEGACY store
     * through `elementUndoStoreAdapter` (`buildUndoStoreMap()` maps
     * `wall → window.wallStore`). `wall.changeLevel`'s inverse is a field-level
     * `replace` at `[id, 'levelId']`, and the adapter's generic branch answers
     * that with `store.update(id, { levelId })` — which the legacy WallStore
     * REFUSES (levelId is a spatial anchor; `RoofStore.update` throws outright).
     *
     * Before L-946 that cost nothing: no gesture moved an element between storeys,
     * so no inverse ever carried a levelId. The moment the forward direction
     * works, an unrouted undo reverts the PLUGIN store and leaves the legacy
     * record upstairs — the same two-copy divergence, pointing the other way.
     * This arm drives the REAL adapter with the REAL inverse patch shape.
     *
     * NOT COVERED HERE: the bimManager / VDT half of the revert. Both are reached
     * through `_bim()` / `_vdt()`, which return `undefined` when `window` is
     * undefined — and this suite runs under `environment: 'node'` deliberately
     * (`vitest.config.ts` says so, and `bootstrap.data.test.ts` asserts on it).
     * Defining a global `window` here to reach them would be a cross-file hazard
     * worse than the gap. The store revert is the half that decides what the user
     * sees; the two spatial calls beside it are try/caught optional chains.
     */
    it('ARM 4 — undoing the level change moves the LEGACY record back', async () => {
        const { elementUndoStoreAdapter } = await import('../src/engine/undo/elementUndoStoreAdapter');

        const bim = makeBimManager();
        const legacyWallStore = makeLegacyWallStore(bim);

        const id = 'wall-undo-probe';
        legacyWallStore.add({
            id, type: 'wall', levelId: GROUND,
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
            height: 2.7, thickness: 0.2, properties: {},
        } as never);

        // Forward — the storey move the mirror performs.
        legacyWallStore.changeLevel(id, FIRST);
        expect(legacyWallStore.getById(id)?.levelId).toBe(FIRST);

        // THE PRE-FIX UNDO, EXECUTED rather than described. This is verbatim what
        // the adapter's generic field-level branch did with a `levelId` patch, and
        // it does not fail quietly — it THROWS, into the adapter's per-patch
        // try/catch, where it became one console.error and a wall that never came
        // downstairs. Pinned permanently so nobody "simplifies" the route below
        // back into the generic branch.
        expect(
            () => legacyWallStore.update(id, { levelId: GROUND } as never),
            'the generic `update({levelId})` path is REFUSED by the store — this is why the revert needs its own route, and the throw is why the failure was invisible',
        ).toThrow(/levelId cannot be modified/);
        expect(legacyWallStore.getById(id)?.levelId).toBe(FIRST);

        // The inverse `ChangeWallLevelHandler` produces, in the shape
        // `applyRingBufferSide` hands the adapter.
        const adapter = elementUndoStoreAdapter(legacyWallStore as never);
        adapter.applyPatch([{ op: 'replace', path: [id, 'levelId'], value: GROUND }]);

        expect(
            legacyWallStore.getById(id)?.levelId,
            'Ctrl+Z must put the wall back on the storey it came from — `update({levelId})` is REFUSED by the legacy store, so an unrouted undo leaves the mesh upstairs while the plugin store says it came down',
        ).toBe(GROUND);
    });

    /**
     * ARM 5 — STRUCTURAL PIN, and labelled as one because it is WEAKER than the
     * four above and must not be mistaken for them.
     *
     * WHAT IT DOES NOT PROVE: that this line runs at boot. `initTools` is a
     * ~2600-line function needing a THREE world, a components registry and
     * twenty stores before its first statement, so no suite in this repo
     * executes it — the same residue the twelve `.created` bridges already rest
     * on, inherited here rather than newly created.
     *
     * WHAT IT DOES PROVE: that the registration is still present. Arms 1-4 would
     * ALL stay green if this call were deleted, and the product would be silently
     * back to a properties-panel level change that does nothing.
     */
    it('ARM 5 — STRUCTURAL: initTools still registers the level-change mutation bridge', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../src/engine/initTools.ts', import.meta.url), 'utf8');

        expect(
            /registerElementLevelChangeBridge\(/.test(src),
            'initTools must REGISTER the mutation bridge — the mirror is reachable from nowhere else',
        ).toBe(true);
        expect(
            /wallStore:\s*\w+/.test(src) && /registerElementLevelChangeBridge\(/.test(src),
            'the bridge must be handed the legacy stores, not the plugin ones',
        ).toBe(true);
    });
});
