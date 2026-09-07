/**
 * §BIM-FROM-THE-DESIGN — the DISPATCH: a plan becomes real BIM elements through the EXISTING
 * verbs, and every way it can go wrong is a sentence rather than a throw.
 *
 * ⭐ THE TESTS THAT CARRY THIS FILE ARE THE TWO ORDER ONES.
 *
 * (1) ONE `wall.batch.create` FOR SHELL AND PARTITIONS TOGETHER. `CreateWallBatchHandler`
 *     validates every wall into `fresh[]` before touching the store and commits the set through a
 *     single `produceCommand`, so one command is one undo entry AND a rejected wall means zero
 *     walls created. Splitting the dispatch would make undo three steps and would let a partition
 *     batch fail on top of a shell that had already committed.
 *
 * (2) A REFUSED SLAB DOES NOT ROLL THE WALLS BACK. `generateHouseFromBoundary` deletes its shell
 *     when a later stage fails, and that is right there — the shell existed only to ask the user a
 *     question. Here the walls ARE the deliverable: they are the design the founder drew. Deleting
 *     them to tidy up a floor plate he did not ask about would destroy the thing he did.
 *     (`wall.batch.delete` is measured ABSENT anyway, so a rollback would cost N undo entries.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    executeBuildFromDesign,
    defaultBuildFromDesignExecutorDeps,
    type BuildFromDesignBus,
    type BuildFromDesignExecutorDeps,
} from '../buildFromDesignExecutor';
import { planBuildFromDesign, type DesignEnvelopeDatum, type DesignVertex } from '../buildFromDesignPlan';
import type { EnvelopeWallLinkGraph } from '../designEnvelopeWallLink';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

const rect = (x0: number, z0: number, x1: number, z1: number): DesignVertex[] =>
    [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

const env = (over: Partial<DesignEnvelopeDatum> & { id: string }): DesignEnvelopeDatum => ({
    levelId: 'L0', name: null, role: 'room', withinId: null, baseOffset: 0, height: 3,
    footprint: [], footprintAreaM2: 0, occupancy: null, ...over,
});

const PLAN = (() => {
    const out = planBuildFromDesign({
        envelopes: [
            env({ id: 'E-g', role: 'level', name: 'Ground envelope', footprint: rect(0, 0, 15, 12.682), footprintAreaM2: 190.23 }),
            env({ id: 'R-k', role: 'room', name: 'Kitchen', withinId: 'E-g', footprint: rect(1, 1, 5, 4.2), footprintAreaM2: 12.8 }),
        ],
        activeLevelId: 'L0',
        authoredWallCountOnActiveLevel: 0,
    });
    if (!out.ok) throw new Error('fixture must plan');
    return out.plan;
})();

interface Dispatch { readonly type: string; readonly payload: Record<string, unknown> }

function harness(over: {
    onWall?: () => void;
    onSlab?: () => void;
    graph?: EnvelopeWallLinkGraph | null;
    bus?: BuildFromDesignBus | null;
} = {}): { deps: BuildFromDesignExecutorDeps; calls: Dispatch[]; edges: Array<Record<string, unknown>> } {
    const calls: Dispatch[] = [];
    const edges: Array<Record<string, unknown>> = [];
    let n = 0;
    const bus: BuildFromDesignBus = {
        executeCommand: async (type, payload) => {
            calls.push({ type, payload: payload as Record<string, unknown> });
            if (type === 'wall.batch.create') over.onWall?.();
            if (type === 'slab.batch.create') over.onSlab?.();
            return undefined;
        },
    };
    const graph: EnvelopeWallLinkGraph = {
        addRelationship: (rel) => { edges.push(rel as unknown as Record<string, unknown>); return `rel-${edges.length}`; },
        getSources: () => [], getTargets: () => [], getAll: () => [],
    };
    return {
        calls, edges,
        deps: {
            bus: () => (over.bus === undefined ? bus : over.bus),
            graph: () => (over.graph === undefined ? graph : over.graph),
            mintId: (prefix) => `${prefix.toUpperCase()}-${++n}`,
        },
    };
}

const RT = {} as unknown as PryzmRuntime;

let warn: ReturnType<typeof vi.spyOn>;
let err: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    err = vi.spyOn(console, 'error').mockImplementation(() => { /* quiet */ });
    log = vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
});
afterEach(() => { warn.mockRestore(); err.mockRestore(); log.mockRestore(); });

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('the dispatch — the EXISTING verbs, in the order that makes undo honest', () => {
    it('⭐ ONE wall.batch.create carries shell AND partitions; the slab is a SECOND command', async () => {
        const { deps, calls } = harness();
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        expect(res.ok).toBe(true);
        expect(calls.map((c) => c.type)).toEqual(['wall.batch.create', 'slab.batch.create']);

        const walls = calls[0]!.payload.walls as Array<Record<string, unknown>>;
        expect(walls).toHaveLength(PLAN.walls.length);
        expect(calls[0]!.payload.levelId).toBe('L0');
        expect(res.shellWallCount).toBe(4);
        expect(res.partitionWallCount).toBe(4);
    });

    it('every dispatched baseLine is a 2-point XZ segment at y = 0, with the plan\'s own dimensions', async () => {
        const { deps, calls } = harness();
        await executeBuildFromDesign(RT, PLAN, deps);
        const walls = calls[0]!.payload.walls as Array<Record<string, unknown>>;
        walls.forEach((w, i) => {
            const line = w.baseLine as Array<{ x: number; y: number; z: number }>;
            expect(line).toHaveLength(2);
            expect(line[0]!.y).toBe(0);
            expect(line[1]!.y).toBe(0);
            expect(line[0]!.x).toBe(PLAN.walls[i]!.a.x);
            expect(line[1]!.z).toBe(PLAN.walls[i]!.b.z);
            expect(w.height).toBe(PLAN.walls[i]!.heightM);
            expect(w.thickness).toBe(PLAN.walls[i]!.thicknessM);
            expect(w.levelId).toBe('L0');
        });
    });

    it('the slab carries the plate ring as an OPEN boundary — no duplicated closing vertex', async () => {
        const { deps, calls } = harness();
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        const slabs = calls[1]!.payload.slabs as Array<Record<string, unknown>>;
        expect(slabs).toHaveLength(1);
        const boundary = slabs[0]!.boundary as Array<{ x: number; z: number }>;
        expect(boundary).toHaveLength(4);
        expect(boundary[0]).not.toEqual(boundary[boundary.length - 1]);
        expect(res.slabId).toBe(slabs[0]!.id);
    });

    it('⭐ the minted ids are dispatched AND returned, so the link pairs the same walls', async () => {
        const { deps, calls } = harness();
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        const walls = calls[0]!.payload.walls as Array<Record<string, unknown>>;
        expect(walls.map((w) => w.id)).toEqual(res.wallIds);
        expect(res.wallIds![0]).toMatch(/^WALL-/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('the refusals — every one is a sentence carrying the store\'s OWN words', () => {
    it('⛔ a refused WALL batch creates nothing, and says the level is untouched', async () => {
        const { deps, calls } = harness({ onWall: () => { throw new Error('WallDimensionsError: 0.004 m'); } });
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        expect(res.ok).toBe(false);
        expect(res.reason).toContain('WallDimensionsError: 0.004 m');
        expect(res.reason).toContain('NOTHING was created');
        expect(calls.map((c) => c.type)).toEqual(['wall.batch.create']);   // no slab after a dead batch
    });

    it('⭐⛔ a refused SLAB KEEPS THE WALLS — they are the design, not scaffolding', async () => {
        const { deps, calls } = harness({ onSlab: () => { throw new Error('boundary self-intersects'); } });
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        expect(res.ok).toBe(true);                       // ⭐ the walls stand
        expect(res.slabId).toBeNull();
        expect(res.slabRefusal).toContain('boundary self-intersects');
        expect(calls.map((c) => c.type)).toEqual(['wall.batch.create', 'slab.batch.create']);
        expect(res.wallIds).toHaveLength(PLAN.walls.length);
    });

    it('no runtime refuses without dispatching', async () => {
        const { deps, calls } = harness();
        const res = await executeBuildFromDesign(null, PLAN, deps);
        expect(res.ok).toBe(false);
        expect(res.reason).toContain('no runtime');
        expect(calls).toHaveLength(0);
    });

    it('⛔ an absent bus says it is a WIRING failure, not a finding about the design', async () => {
        const { deps } = harness({ bus: null });
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        expect(res.ok).toBe(false);
        expect(res.reason).toContain('wiring failure, not a finding about your design');
    });

    it('a plan with no walls refuses rather than dispatching an empty batch', async () => {
        const { deps, calls } = harness();
        const res = await executeBuildFromDesign(RT, { ...PLAN, walls: [] }, deps);
        expect(res.ok).toBe(false);
        expect(res.reason).toContain('no walls');
        expect(calls).toHaveLength(0);
    });

    it('the refused rooms named before the click are named again after it', async () => {
        const { deps } = harness();
        const res = await executeBuildFromDesign(RT, {
            ...PLAN,
            refusedRooms: [{ envelopeId: 'R-x', name: 'Utility', code: 'area-below-floor', text: '"Utility" encloses 0.16 m²…' }],
        }, deps);
        expect(res.refusedRoomNames).toEqual(['Utility']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('the link leg — written the moment the ids are real, and never fatal', () => {
    it('⭐ writes two edges per claim against the ids that were actually dispatched', async () => {
        const { deps, edges } = harness();
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        expect(res.link).not.toBeNull();
        expect(res.link!.wallsLinked).toBe(PLAN.walls.length);
        expect(edges.filter((e) => e.type === 'boundedBy')).toHaveLength(res.link!.edgesWritten / 2);
        expect(edges.filter((e) => e.type === 'contains')).toHaveLength(res.link!.edgesWritten / 2);
        expect(edges[0]!.sourceId).toBe(res.wallIds![0]);
        expect(edges[0]!.targetId).toBe('E-g');
        expect((edges[0]!.metadata as Record<string, unknown>).edgeIndex).toBe(0);
    });

    it('⛔ an unavailable graph does NOT stop the build — the walls exist, and `link` is null', async () => {
        const { deps, calls } = harness({ graph: null });
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        expect(res.ok).toBe(true);
        expect(res.link ?? null).toBeNull();
        expect(calls.map((c) => c.type)).toEqual(['wall.batch.create', 'slab.batch.create']);
        // ⛔ …and it is not silent: the host prints "these walls will not follow the envelope".
        expect(warn).toHaveBeenCalled();
    });

    it('a graph that throws is non-fatal and leaves the geometry alone', async () => {
        const hostile: EnvelopeWallLinkGraph = {
            addRelationship: () => { throw new Error('graph closed'); },
            getSources: () => [], getTargets: () => [], getAll: () => [],
        };
        const { deps } = harness({ graph: hostile });
        const res = await executeBuildFromDesign(RT, PLAN, deps);
        expect(res.ok).toBe(true);
        expect(res.link!.unlinked.length).toBeGreaterThan(0);
        expect(res.link!.unlinked[0]!.reason).toContain('graph closed');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('the production wiring', () => {
    it('resolves a bus off the runtime, a real graph and a real id mint — and never throws', () => {
        const deps = defaultBuildFromDesignExecutorDeps();
        expect(deps.bus(null as unknown as PryzmRuntime)).toBeNull();
        expect(deps.graph()).not.toBeNull();
        expect(deps.mintId('wall')).toMatch(/wall/i);
        expect(deps.mintId('wall')).not.toBe(deps.mintId('wall'));   // ids are unique
    });
});
