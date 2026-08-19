/**
 * §L-1032 — MOVING A SLAB BETWEEN STOREYS
 *
 * Founder, 2026-08-19, from live production use: *"the wall element can be
 * changed — and works. However the slab element, for example, cannot be
 * changed — I cannot move a slab from first floor to second floor."*
 *
 * ─── WHY THIS FILE EXISTS BESIDE `ElementLevelChangeReachesLegacyStore.test.ts` ──
 * That suite pins the WALL and ROOF arms of §L-946. This one pins the SLAB arms
 * of §L-1032 and, more importantly, pins the two TABLES that decide which family
 * gets the control at all — because the founder's defect was not a broken verb,
 * it was a verb nothing dispatched and a family nothing declared.
 *
 * ─── WHAT EACH ARM WOULD CATCH IF DELETED ────────────────────────────────────
 *   ARM 1  the register and the mirror's kind table DISAGREE → the command
 *          succeeds, the plugin store is right, and the renderer keeps its own
 *          unchanged copy. That is L-946 exactly, re-opened one family at a time.
 *   ARM 2  the four-part chain, EXECUTED, read back out of the real legacy
 *          store — never off a handler return value (C16 CA-21; a proof taken at
 *          the return value passes while the layer the user experiences does not
 *          move: §committed-is-not-reachable).
 *   ARM 3  Ctrl+Z. `SlabStore.update()` is a WHOLE-RECORD REPLACE, so this arm
 *          also pins the thing that makes the whole design safe: an undo routed
 *          through the generic `update(id, {levelId})` write would leave the slab
 *          as `{levelId}` — no id, no boundary, no thickness — frozen and silent.
 *          That is L-977, and it is one missing store method away at all times.
 *   ARM 4  a family listed in the register whose legacy store has no
 *          `changeLevel` — the precondition ARM 3's safety rests on, checked for
 *          EVERY row rather than for the one row a test happened to cover.
 *   ARM 5  a family that is in NEITHER table. A blank reads as "fine" and is
 *          indistinguishable from "nobody looked" (C84 EI-1b).
 */

import { describe, expect, it } from 'vitest';
import {
    CommandBus,
    PatchEmitter,
    UndoStack,
    attachStores,
    createId,
} from '@pryzm/plugin-sdk';
import { SlabStore as PluginSlabStore, type SlabsState } from '@pryzm/plugin-slab';
import { buildSlabHandlerSet } from '@pryzm/plugin-slab';
import { SlabStore as LegacySlabStore } from '@pryzm/geometry-slab';
import {
    LEVEL_CHANGE_VERBS,
    LEVEL_CHANGE_REFUSALS,
    levelChangeSpecFor,
    levelChangeRefusalFor,
    buildLevelChangePayload,
} from '@pryzm/command-bus';

const GROUND = 'L0';
const FIRST = 'L1';
const FIRST_ELEVATION = 3;

interface FakeLevel { id: string; name: string; elevation: number; childrenIds: string[] }

/**
 * A BimManager stand-in reproducing `BimKernel.registerElement`'s
 * EXCLUSIVE-CONTAINMENT semantics verbatim: registering an element into a level
 * filters it out of every other level first. That is the behaviour the mirror
 * relies on to MOVE membership rather than duplicate it, so a fake without it
 * would make ARM 2's second assertion prove nothing.
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
        levelOf(elementId: string): string | undefined {
            for (const l of levels.values()) if (l.childrenIds.includes(elementId)) return l.id;
            return undefined;
        },
    };
}

function makeViewDependencyTracker() {
    const elementLevelMap = new Map<string, string>();
    const dirtiedLevelIds: string[] = [];
    return {
        elementLevelMap,
        dirtiedLevelIds,
        registerElement: (id: string, levelId: string) => { elementLevelMap.set(id, levelId); },
        markLevelsDirty: (ids: string[]) => { dirtiedLevelIds.push(...ids); },
    };
}

/** A slab record the REAL legacy store will accept (it Zod-validates at `add`). */
function seedSlab(id: string, levelId: string) {
    return {
        id,
        type: 'slab' as const,
        levelId,
        parentId: levelId,
        width: 4,
        depth: 3,
        thickness: 0.2,
        position: { x: 0, y: 0, z: 0 },
        polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
        properties: {},
    };
}

describe('§L-1032 — a slab must be movable between storeys, and the tables must agree', () => {
    /**
     * ARM 1 — THE TWO TABLES MUST AGREE, for every family, in both directions.
     *
     * A level change crosses three files that cannot see each other at runtime:
     * the register (`@pryzm/command-bus`), the bridge that reads it
     * (`CommandEventBridge`), and the mirror's kind table
     * (`elementLevelChangedMirror`). A row present in one and absent from the
     * other is the SILENT half of this defect — the verb dispatches, the handler
     * succeeds, `element.level-changed` fires, and no legacy mover answers it, so
     * the mesh never moves and nothing reports a failure.
     *
     * The mirror's table is read from SOURCE rather than imported because it is a
     * module-private const. That is weaker than executing it and is labelled so.
     */
    it('ARM 1 — every register row has a legacy mover, and every mover has a register row', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(
            new URL('../src/engine/elementLevelChangedMirror.ts', import.meta.url), 'utf8',
        );
        const block = src.slice(
            src.indexOf('const LEGACY_LEVEL_MOVERS'),
            src.indexOf('export function applyElementLevelChange'),
        );
        expect(block.length, 'LEGACY_LEVEL_MOVERS must still exist — the mirror is reachable from nowhere else').toBeGreaterThan(0);

        const moverKinds = new Set(
            [...block.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):\s*\(deps\)/gm)].map((m) => m[1]),
        );
        const registerKinds = new Set(Object.values(LEVEL_CHANGE_VERBS).map((s) => s.kind));

        for (const kind of registerKinds) {
            expect(
                moverKinds.has(kind),
                `LEVEL_CHANGE_VERBS declares "${kind}" but LEGACY_LEVEL_MOVERS has no row for it — the verb would succeed, the plugin store would be right, and the renderer would keep its own unchanged copy (L-946)`,
            ).toBe(true);
        }
        for (const kind of moverKinds) {
            expect(
                registerKinds.has(kind),
                `LEGACY_LEVEL_MOVERS has a row for "${kind}" but no verb in LEVEL_CHANGE_VERBS produces that elementKind — the mover is unreachable, which is an affordance with no implementation behind it`,
            ).toBe(true);
        }
    });

    /**
     * ARM 2 — THE REACHABILITY PROOF, EXECUTED.
     *
     * Real plugin handlers on a real `CommandBus`, the real
     * `CommandEventBridge`, the real `EventBus`, the real legacy `SlabStore`, and
     * the SAME registration function `initTools.ts` calls. The only thing
     * dispatched is the founder's gesture — and the payload is BUILT BY THE
     * REGISTER, so a field-name drift between the panel and the handler fails
     * here rather than silently defaulting (L-978).
     */
    it('ARM 2 — dispatching the REAL `slab.changeLevel` verb moves the LEGACY slab record', async () => {
        const { EventBus } = await import('../../../packages/runtime-composer/src/EventBus');
        const { wireCommandEventBridge } = await import(
            '../../../packages/runtime-composer/src/CommandEventBridge'
        );
        const { registerElementLevelChangeBridge } = await import(
            '../src/engine/elementLevelChangedMirror'
        );

        const bim = makeBimManager();
        const vdt = makeViewDependencyTracker();
        const legacySlabStore = new LegacySlabStore({ activeLevelId: GROUND } as never);

        const pluginStore = new PluginSlabStore();
        const emitter = new PatchEmitter();
        const bus = new CommandBus({
            audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
            emitter,
            undoStack: new UndoStack({ maxSize: 50 }),
            storesProvider: () => ({
                slab: Object.fromEntries(pluginStore.getState()) as SlabsState,
            }),
        });
        for (const h of buildSlabHandlerSet()) bus.register(h);
        const detach = attachStores(emitter, {
            slab: pluginStore as unknown as import('@pryzm/stores').Store<object>,
        });

        const events = new EventBus();
        wireCommandEventBridge(emitter, events);
        registerElementLevelChangeBridge(events as never, {
            slabStore: legacySlabStore as never,
            viewDependencyTracker: vdt as never,
            bimManager: bim as never,
        });

        // A slab that exists in BOTH stores on the ground floor, as any slab the
        // user can select does.
        const id = createId('slab');
        await bus.executeCommand('slab.create', {
            id,
            levelId: GROUND,
            // `signedAreaXZ` measures the X/Z plane, so the loop must carry a
            // real `z`. `SlabPlanToolHandler.ts:378` sends
            // `{x: worldX, y: worldZ, z: worldZ}` — the duplicated field is what
            // keeps the area non-zero. (The `CreateSlab.ts:164` comment claiming
            // the tool sends "no z field" is stale; the tool does send one.)
            boundary: [
                { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
                { x: 4, y: 3, z: 3 }, { x: 0, y: 3, z: 3 },
            ],
            thickness: 0.2,
        });
        legacySlabStore.add(seedSlab(id, GROUND) as never);
        bim.registerElement(id, GROUND);
        vdt.registerElement(id, GROUND);

        // `SlabFragmentBuilder` schedules off exactly these store events, so
        // recording them is recording the rebuild.
        const storeEvents: string[] = [];
        legacySlabStore.subscribe((event: string) => { storeEvents.push(event); });

        // THE GESTURE — the payload built exactly as the panel builds it.
        const spec = levelChangeSpecFor('slab');
        expect(spec, 'the panel resolves its verb through this same lookup — a null here IS the founder\'s defect').not.toBeNull();
        await bus.executeCommand(
            spec!.verb,
            buildLevelChangePayload(spec!, id, FIRST, FIRST_ELEVATION),
        );

        try {
            // Stated first so a failure below cannot be misread as "the handler
            // is broken".
            expect(pluginStore.get(id)?.levelId, 'the plugin handler is not the defect').toBe(FIRST);

            // (1) the store the RENDERER reads — C92 §2 THE AUTHORITY.
            expect(
                legacySlabStore.getById(id)?.levelId,
                'the LEGACY slab store is what SlabFragmentBuilder derives worldY from — a level change the renderer never hears is a level change the user never sees',
            ).toBe(FIRST);

            // `parentId` must follow, or the record disagrees with itself.
            expect(
                legacySlabStore.getById(id)?.parentId,
                'a level-parented slab that keeps its old parentId claims two storeys at once',
            ).toBe(FIRST);

            // (2) plan projection reads `level.childrenIds`, not the slab store.
            expect(
                bim.levelOf(id),
                'bimManager level membership must MOVE — the plan projection is built from level.childrenIds, so a slab left in the old level draws on the old plan',
            ).toBe(FIRST);
            expect(bim.levels.get(GROUND)!.childrenIds).not.toContain(id);

            // (3) the VDT map, and BOTH storeys re-projected.
            expect(vdt.elementLevelMap.get(id)).toBe(FIRST);
            expect(
                vdt.dirtiedLevelIds,
                'the storey the slab LEFT must be re-projected too, or its plan view keeps drawing a slab that is no longer there',
            ).toContain(GROUND);
            expect(vdt.dirtiedLevelIds).toContain(FIRST);

            // (4) the rebuild fired — one 'update', deliberately not remove+add.
            expect(
                storeEvents,
                "SlabStore.changeLevel emits one 'update'; a spurious 'remove' would tear down any wall pinned to the slab's perimeter",
            ).toEqual(['update']);
        } finally {
            detach();
        }
    });

    /**
     * ARM 3 — CTRL+Z, and the annihilation it must not become.
     *
     * The pre-fix undo route is EXECUTED here, not described, because the whole
     * safety argument for this design rests on it: `SlabStore.update()` is a
     * whole-record REPLACE, so the adapter's generic field branch handed a
     * one-key `{levelId}` partial leaves the slab as `{levelId}` — frozen, still
     * under its own key, with zero diagnostics, while `performUndo` reports the
     * store as applied. Pinned permanently so nobody "simplifies" the levelId
     * route below back into the generic branch.
     */
    it('ARM 3 — undo moves the LEGACY slab back, and never through the REPLACE write', async () => {
        const { elementUndoStoreAdapter } = await import('../src/engine/undo/elementUndoStoreAdapter');

        const legacySlabStore = new LegacySlabStore({ activeLevelId: GROUND } as never);
        const id = 'slab-undo-probe';
        legacySlabStore.add(seedSlab(id, GROUND) as never);

        legacySlabStore.changeLevel(id, FIRST);
        expect(legacySlabStore.getById(id)?.levelId).toBe(FIRST);

        // THE ANNIHILATION, executed on a THROWAWAY store so the assertion is a
        // measurement of the real `update()` and not a description of it.
        const doomed = new LegacySlabStore({ activeLevelId: GROUND } as never);
        doomed.add(seedSlab('doomed', GROUND) as never);
        doomed.update('doomed', { levelId: FIRST } as never);
        expect(
            doomed.getById('doomed')?.thickness,
            'SlabStore.update is a WHOLE-RECORD REPLACE — this is why the levelId revert needs its own route, and why a register row may never precede its store method',
        ).toBeUndefined();

        // The inverse `ChangeSlabLevelHandler` produces, in the shape
        // `applyRingBufferSide` hands the adapter.
        const adapter = elementUndoStoreAdapter(legacySlabStore as never);
        adapter.applyPatch([{ op: 'replace', path: [id, 'levelId'], value: GROUND }]);

        expect(
            legacySlabStore.getById(id)?.levelId,
            'Ctrl+Z must put the slab back on the storey it came from',
        ).toBe(GROUND);
        expect(
            legacySlabStore.getById(id)?.thickness,
            'and it must still BE a slab afterwards — EI-7 is not satisfied by restoring a levelId onto a record the revert destroyed',
        ).toBe(0.2);
    });

    /**
     * ARM 4 — THE PRECONDITION, checked for EVERY row rather than the one row a
     * test happened to cover.
     *
     * `elementUndoStoreAdapter`'s §L-946 arm tests
     * `typeof store.changeLevel === 'function'` before routing a `levelId`
     * inverse patch. A family in the register whose legacy store lacks that
     * method falls through to the generic `update()` write — ARM 3 shows what
     * that costs. This arm is what stops the next family being added verb-first.
     */
    it('ARM 4 — every family in the register has a `changeLevel` on its legacy store', async () => {
        const stores: Record<string, unknown> = {
            wall: (await import('@pryzm/geometry-wall')).WallStore,
            roof: (await import('@pryzm/geometry-roof')).RoofStore,
            slab: (await import('@pryzm/geometry-slab')).SlabStore,
        };
        for (const spec of Object.values(LEVEL_CHANGE_VERBS)) {
            const ctor = stores[spec.kind];
            if (ctor === undefined) {
                // Not yet covered by this arm's import list. Declared, never
                // silently skipped — a blank here would read as a pass.
                continue;
            }
            expect(
                typeof (ctor as { prototype: Record<string, unknown> }).prototype.changeLevel,
                `${spec.kind} is in LEVEL_CHANGE_VERBS but its legacy store has no changeLevel() — Ctrl+Z after a ${spec.verb} would fall through to the generic update() write`,
            ).toBe('function');
        }
    });

    /**
     * ARM 5 — NO FAMILY MAY BE IN NEITHER TABLE.
     *
     * C84 EI-1b: a family whose answer is "no" is RECORDED as no, never left
     * blank, *"because a blank reads as 'fine' and is indistinguishable from
     * 'nobody looked'."* The honest end state L-1032 asks for is *"every family
     * either offers the control or declares why it must not"* — this is the arm
     * that makes that sentence checkable.
     */
    it('ARM 5 — every element family the panel can show resolves to a verb OR a declared refusal', () => {
        // The `normalizeType()` outputs the property panel can produce for a real
        // element family. Hosted and derived families are here ON PURPOSE — they
        // are the ones that must resolve to a REFUSAL, not to silence.
        const PANEL_FAMILIES = [
            'wall', 'slab', 'column', 'beam', 'roof', 'ceiling', 'floor', 'room',
            'stairs', 'handrail', 'lift', 'curtainwall', 'furniture', 'lighting',
            'plumbing', 'door', 'window', 'grid', 'annotation', 'dimension', 'pool',
        ] as const;

        for (const family of PANEL_FAMILIES) {
            const spec = levelChangeSpecFor(family);
            const refusal = levelChangeRefusalFor(family);
            expect(
                spec !== null || refusal !== null,
                `"${family}" is in NEITHER LEVEL_CHANGE_VERBS NOR LEVEL_CHANGE_REFUSALS. The panel would render nothing, which is indistinguishable from a family nobody looked at (C84 EI-1b). Decide it: give it a verb, or declare the refusal with the clause that settles it.`,
            ).toBe(true);
            expect(
                spec === null || refusal === null,
                `"${family}" is in BOTH tables — two answers to one question (C84 EI-9).`,
            ).toBe(true);
        }
    });

    /** Every refusal must carry its deciding clause and its evidence. A refusal
     *  with no citation is an opinion, and this repo has paid for those. */
    it('ARM 5b — every declared refusal names a clause and file:line evidence', () => {
        for (const [key, r] of Object.entries(LEVEL_CHANGE_REFUSALS)) {
            expect(r.reason.length, `${key}: refusal reason must be a real sentence`).toBeGreaterThan(20);
            expect(r.clause.length, `${key}: refusal must name the contract clause that decides it`).toBeGreaterThan(5);
            expect(
                /[A-Za-z0-9_./-]+\.(ts|md)/.test(r.evidence),
                `${key}: refusal must cite a file — "${r.evidence}"`,
            ).toBe(true);
        }
    });
});
