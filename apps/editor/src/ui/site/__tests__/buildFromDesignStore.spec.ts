/**
 * §BUILD-EVERY-STOREY — THE PROOF AT THE LAYER THE USER EXPERIENCES.
 *
 * ⛔ WHY THIS FILE EXISTS, AND WHY THE OTHER TWO SUITES ARE NOT ENOUGH.
 * `buildFromDesignPlan.spec.ts` asserts what a PURE function returned. `buildFromDesignExecutor.spec.ts`
 * asserts what payloads reached a FAKE bus. Neither can tell you that a wall exists. This repo has
 * repeatedly shipped green tests that asserted on a value the real pipeline discarded
 * ([[committed-is-not-reachable]], [[fake-more-capable-than-real]]) — a fake built from the header
 * cannot falsify the header.
 *
 * So this suite wires the REAL `CommandBus`, the REAL `WallStore` / `SlabStore` / `CeilingStore`
 * and the REAL `CreateWallBatchHandler` / `CreateSlabBatchHandler` / `CreateCeilingBatchHandler`,
 * dispatches through `executeBuildFromDesign`, and then asks the STORES what is in them.
 *
 * ⭐ THE ARM THAT CARRIES THE FILE: after the dispatch, `wallStore` must hold walls on FIVE
 * DIFFERENT `levelId`s, and the seven partitions must be on `LV4` — the storey the founder drew his
 * rooms on and the one every single room was refused from. If the per-entry `levelId` were dropped
 * anywhere between the planner and `Wall.parse`, every record would come back on one storey and
 * this suite would go red while the other two stayed green.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/command-bus';
import { createId } from '@pryzm/schemas';
import { attachStores } from '@pryzm/stores';
import type { Store } from '@pryzm/stores';
import { WallStore } from '@pryzm/plugin-wall/store';
import { buildWallHandlerSet } from '@pryzm/plugin-wall/handlers';
import { SlabStore } from '@pryzm/plugin-slab/store';
import { buildSlabHandlerSet } from '@pryzm/plugin-slab/handlers';
import { CeilingStore, buildCeilingHandlerSet } from '@pryzm/plugin-ceiling';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import {
    planBuildFromDesign,
    type BuildFromDesignPlan,
    type DesignEnvelopeDatum,
    type DesignVertex,
} from '../buildFromDesignPlan';
import {
    executeBuildFromDesign,
    type BuildFromDesignBus,
    type BuildFromDesignExecutorDeps,
} from '../buildFromDesignExecutor';

// ── the model, wired the way `engineLauncher` wires it ────────────────────────────────────────
interface Model {
    readonly wall: WallStore;
    readonly slab: SlabStore;
    readonly ceiling: CeilingStore;
    readonly bus: CommandBus;
    readonly detach: () => void;
}

function buildModel(): Model {
    const wall = new WallStore();
    const slab = new SlabStore();
    const ceiling = new CeilingStore();
    const emitter = new PatchEmitter();
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack: new UndoStack({ maxSize: 50 }),
        storesProvider: () => ({
            wall: Object.fromEntries(wall.getState()),
            slab: Object.fromEntries(slab.getState()),
            ceiling: Object.fromEntries(ceiling.getState()),
        }),
    });
    for (const h of buildWallHandlerSet()) bus.register(h);
    for (const h of buildSlabHandlerSet()) bus.register(h);
    for (const h of buildCeilingHandlerSet()) bus.register(h);
    const detach = attachStores(emitter, {
        wall: wall as unknown as Store<object>,
        slab: slab as unknown as Store<object>,
        ceiling: ceiling as unknown as Store<object>,
    });
    return { wall, slab, ceiling, bus, detach };
}

/** The executor's deps, pointed at the REAL bus. The graph leg is off — it is not the subject. */
function realDeps(bus: CommandBus): BuildFromDesignExecutorDeps {
    return {
        bus: () => bus as unknown as BuildFromDesignBus,
        graph: () => null,
        // ⛔ THE MINTER IS THE REAL `createId`, AND THIS SUITE IS THE REASON IT HAS TO BE.
        // A readable counter (`wall_001`) is the obvious thing to write here and it makes the
        // whole file lie: `Wall` pins `/^wall_[0-9A-HJKMNP-TV-Z]{26}$/`, so `CreateWallBatch`
        // rejects entry 0 on SCHEMA before it touches the store — every arm below then measures
        // an empty store and reports it as a per-storey defect. That is [[fake-more-capable-than-real]]
        // pointed the other way: the fake id was WEAKER than the real one, and the suite written to
        // catch a discarded `levelId` would instead have accused the planner of dropping it.
        // The point of this file is that nothing between the plan and the store is simulated —
        // the id minter is part of "nothing".
        mintId: (prefix) => createId(prefix),
    };
}

const RT = {} as unknown as PryzmRuntime;

const rect = (x0: number, z0: number, x1: number, z1: number): DesignVertex[] =>
    [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

const env = (over: Partial<DesignEnvelopeDatum> & { id: string }): DesignEnvelopeDatum => ({
    levelId: 'L0', name: null, role: 'room', withinId: null, baseOffset: 0, height: 3,
    footprint: [], footprintAreaM2: 0, occupancy: null, ...over,
});

// ── THE FOUNDER'S INSTANCE A, to his numbers ──────────────────────────────────────────────────
// Five storeys at 0 / 3 / 6 / 9 / 12 m, each a 366 m² plate on its own project level — exactly
// what `envelopeAuthoringPlan` mints and exactly what his console printed:
//   [BimManager] Registered element spaceEnvelope_… to level L0 / L1-… / L2-… / L3-… / L4-…
// Seven rooms, ALL of them seated on "Level envelope · Level 4 · 366 m²" at 12 m.
const PLATE_RING = rect(0, 0, 20, 18.3);                     // 366 m²
const LEVEL_IDS = ['L0', 'L1-abc', 'L2-abc', 'L3-abc', 'L4-abc'] as const;
const ROOM_NAMES = ['Living', 'Kitchen', 'Ensuite', 'Bedroom', 'Bathroom', 'Hall', 'Stair'];

const PLATES: DesignEnvelopeDatum[] = LEVEL_IDS.map((lid, i) => env({
    id: `E-L${i}`,
    levelId: lid,
    role: 'level',
    name: `Level envelope · ${i === 0 ? 'Ground' : `Level ${i}`} · 366 m²`,
    baseOffset: i * 3,
    height: 3,
    footprint: PLATE_RING,
    footprintAreaM2: 366,
}));

/** Seven rooms in a row on the TOP plate, inset from the perimeter so no edge lands on the shell. */
const ROOMS_ON_L4: DesignEnvelopeDatum[] = ROOM_NAMES.map((n, i) => env({
    id: `R-${i}`,
    levelId: 'L4-abc',
    role: 'room',
    name: n,
    withinId: 'E-L4',
    baseOffset: 12,
    height: 3,
    footprint: rect(1 + i * 2.6, 1, 3.5 + i * 2.6, 6),
    footprintAreaM2: 12.5,
}));

const CENSUS_ALL_EMPTY: Record<string, number> =
    Object.fromEntries(LEVEL_IDS.map((l) => [l, 0]));

function planFounderA(census: Record<string, number> = CENSUS_ALL_EMPTY): BuildFromDesignPlan {
    const out = planBuildFromDesign({
        envelopes: [...PLATES, ...ROOMS_ON_L4],
        activeLevelId: 'L4-abc',
        authoredWallCountOnActiveLevel: census['L4-abc'] ?? 0,
        authoredWallCountByLevelId: census,
    });
    if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}: ${out.refusal.text}`);
    return out.plan;
}

let model: Model;
let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    log = vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
    model = buildModel();
});
afterEach(() => { model?.detach(); warn.mockRestore(); log.mockRestore(); });

/** Every wall record in the store, as the store holds it. */
const wallsInStore = (): Array<{ id: string; levelId: string; height: number; thickness: number }> =>
    [...model.wall.getState().values()] as Array<{
        id: string; levelId: string; height: number; thickness: number;
    }>;

const countBy = <T,>(rows: readonly T[], key: (r: T) => string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
    return out;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("THE FOUNDER'S INSTANCE A, IN THE STORES — 7 rooms on Level 4 at 12 m", () => {
    it('⭐⭐ THE WALLS ARE IN THE WALL STORE, ON FIVE DIFFERENT STOREYS', async () => {
        const plan = planFounderA();
        const res = await executeBuildFromDesign(RT, plan, realDeps(model.bus));
        expect(res.ok).toBe(true);

        const rows = wallsInStore();
        expect(rows).toHaveLength(plan.walls.length);
        expect(model.wall.size()).toBe(plan.walls.length);

        // ⛔ THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT. Before this lane every
        // record landed on ONE level — and, worse, on `activeLevelId` rather than the plate's own.
        const byLevel = countBy(rows, (r) => r.levelId);
        expect(Object.keys(byLevel).sort()).toEqual([...LEVEL_IDS].sort());
        expect(byLevel['L0']).toBe(4);            // shell only
        expect(byLevel['L1-abc']).toBe(4);
        expect(byLevel['L2-abc']).toBe(4);
        expect(byLevel['L3-abc']).toBe(4);
        // ⭐ Level 4 carries its shell AND every partition, because that is where he drew.
        expect(byLevel['L4-abc']).toBe(4 + plan.partitionWallCount);
        expect(plan.partitionWallCount).toBeGreaterThan(0);
    });

    it('⭐ THE PARTITIONS ARE ON LEVEL 4 — the storey all 7 rooms were refused from', async () => {
        const plan = planFounderA();
        await executeBuildFromDesign(RT, plan, realDeps(model.bus));
        // Partitions are the 0.1 m walls; the shell is 0.2 m. Read from the STORE, not the plan.
        const partitions = wallsInStore().filter((w) => Math.abs(w.thickness - 0.1) < 1e-9);
        expect(partitions.length).toBe(plan.partitionWallCount);
        expect(partitions.every((w) => w.levelId === 'L4-abc')).toBe(true);
        expect(plan.rooms).toHaveLength(7);
        expect(plan.refusedRooms).toHaveLength(0);
    });

    it('⭐ THE SLABS ARE IN THE SLAB STORE — one per storey, each on its own level', async () => {
        const plan = planFounderA();
        const res = await executeBuildFromDesign(RT, plan, realDeps(model.bus));
        expect(res.slabIds).toHaveLength(5);
        const rows = [...model.slab.getState().values()] as Array<{
            levelId: string; thickness: number; baseOffset: number; boundary?: unknown[];
        }>;
        expect(rows).toHaveLength(5);
        expect(rows.map((r) => r.levelId).sort()).toEqual([...LEVEL_IDS].sort());
        expect(rows.every((r) => r.baseOffset === 0)).toBe(true);
        expect(rows.every((r) => r.thickness === 0.2)).toBe(true);
        expect(rows.every((r) => (r.boundary ?? []).length === 4)).toBe(true);
    });

    it('⭐ THE CEILINGS ARE IN THE CEILING STORE — one per drawn room, at the CLEAR height', async () => {
        const plan = planFounderA();
        const res = await executeBuildFromDesign(RT, plan, realDeps(model.bus));
        expect(res.ceilingIds).toHaveLength(7);
        const rows = [...model.ceiling.getState().values()] as Array<{
            levelId: string; ceilingHeight: number; thickness: number;
        }>;
        expect(rows).toHaveLength(7);
        expect(rows.every((r) => r.levelId === 'L4-abc')).toBe(true);
        // ⛔ 2.4 m, not the 3.0 m floor-to-floor. Passing the ftf verbatim is the defect
        // §RESI-CEILING-CLEARHEIGHT exists to remove, and this pass must not re-commit it.
        expect(rows.every((r) => Math.abs(r.ceilingHeight - 2.4) < 1e-9)).toBe(true);
        expect(rows.every((r) => r.thickness < r.ceilingHeight)).toBe(true);
    });

    it('⛔ every wall takes ITS OWN storey height, and the shells and partitions differ in thickness', async () => {
        const plan = planFounderA();
        await executeBuildFromDesign(RT, plan, realDeps(model.bus));
        const rows = wallsInStore();
        expect(rows.every((w) => w.height === 3)).toBe(true);
        expect(countBy(rows, (w) => String(w.thickness))['0.2']).toBe(20);   // 4 edges × 5 storeys
    });

    it('⭐ THREE COMMANDS FOR FIVE STOREYS — the undo stack does not grow with the building', async () => {
        const plan = planFounderA();
        const seen: string[] = [];
        const spy = new Proxy(model.bus, {
            get(t, prop, r) {
                if (prop === 'executeCommand') {
                    return (type: string, payload: unknown) => {
                        seen.push(type);
                        return (t as CommandBus).executeCommand(type, payload as never);
                    };
                }
                return Reflect.get(t, prop, r) as unknown;
            },
        });
        await executeBuildFromDesign(RT, plan, realDeps(spy as CommandBus));
        expect(seen).toEqual(['wall.batch.create', 'slab.batch.create', 'ceiling.batch.create']);
        expect(plan.undoStepCount).toBe(3);
        expect(plan.storeyCount).toBe(5);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('C80 §3 IN THE STORE — a protected storey gets NOTHING, the empty ones still build', () => {
    it('⛔ the storey carrying authored walls has no NEW wall, slab or ceiling on it', async () => {
        // Level 2 already carries 40 authored walls. It must be skipped — and only it.
        const plan = planFounderA({ ...CENSUS_ALL_EMPTY, 'L2-abc': 40 });
        expect(plan.storeyCount).toBe(4);
        expect(plan.refusedStoreys).toHaveLength(1);
        expect(plan.refusedStoreys[0]!.code).toBe('already-built');

        await executeBuildFromDesign(RT, plan, realDeps(model.bus));
        const byLevel = countBy(wallsInStore(), (w) => w.levelId);
        expect(byLevel['L2-abc']).toBeUndefined();          // ⭐ untouched
        expect(byLevel['L0']).toBe(4);
        expect(byLevel['L4-abc']).toBe(4 + plan.partitionWallCount);

        const slabLevels = [...model.slab.getState().values()]
            .map((s) => (s as { levelId: string }).levelId);
        expect(slabLevels).not.toContain('L2-abc');
        expect(slabLevels).toHaveLength(4);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('THE BATCH-KILLER, END TO END — the planner\'s refusal is what keeps the store non-empty', () => {
    it('⛔ a sub-0.05 m room edge is refused BY NAME and every OTHER room still reaches the store', async () => {
        // `CreateWallBatchHandler` validates every wall into `fresh[]` BEFORE touching the store and
        // throws on any baseLine under 0.05 m — so one bad edge reaching dispatch means ZERO walls
        // for the whole design. This proves the planner's per-room refusal is what stops that.
        const spike = env({
            id: 'R-spike', levelId: 'L4-abc', role: 'room', name: 'Utility', withinId: 'E-L4',
            baseOffset: 12,
            footprint: [
                { x: 12, z: 8 }, { x: 12.002, z: 8 }, { x: 16, z: 8.001 }, { x: 16, z: 11 },
                { x: 12, z: 11 },
            ],
            footprintAreaM2: 12,
        });
        const out = planBuildFromDesign({
            envelopes: [...PLATES, ...ROOMS_ON_L4, spike],
            activeLevelId: 'L4-abc',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: CENSUS_ALL_EMPTY,
        });
        if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}`);
        const plan = out.plan;

        const res = await executeBuildFromDesign(RT, plan, realDeps(model.bus));
        expect(res.ok).toBe(true);
        // ⭐ THE STORE IS NOT EMPTY — which is the whole point. Every planned wall committed.
        expect(model.wall.size()).toBe(plan.walls.length);
        expect(model.wall.size()).toBeGreaterThan(20);
        expect(plan.rooms.map((r) => r.name)).toContain('Living');

        // …and whatever the weld did with the spike, no wall in the STORE is under the minimum.
        const rows = [...model.wall.getState().values()] as Array<{
            baseLine?: ReadonlyArray<{ x: number; z: number }>;
        }>;
        for (const w of rows) {
            const line = w.baseLine;
            if (!line || line.length < 2) continue;
            expect(Math.hypot(line[0]!.x - line[1]!.x, line[0]!.z - line[1]!.z))
                .toBeGreaterThanOrEqual(0.05);
        }
    });
});
