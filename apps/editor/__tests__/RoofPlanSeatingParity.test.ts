/**
 * §FIX-ROOF-BRIDGE-SEATING (C84 EI-2b · C84 §9 "the eleven unread `.created`
 * bridge bodies" · C79 §7.4 · C11 §3)
 *
 * ─── THE DEFECT, STATED AS A MECHANISM ──────────────────────────────────────
 * `apps/editor/src/engine/roofCreatedMirror.ts` — the extracted body of the
 * §P3.2-RF `roof.created` bridge — seats every roof it mirrors at
 *
 *     baseOffset: ev.baseOffset ?? 2.7
 *
 * and its own comment states the rule it is enforcing: *"use the caller-supplied
 * baseOffset. The hardcoded 2.7 placeholder ignored the command's own value,
 * putting every roof at the wrong elevation regardless of wall height."*
 *
 * `ev.baseOffset` IS ALWAYS `undefined`. It cannot be anything else:
 *   • `packages/schemas/src/elements/Roof.ts` declares NO `baseOffset` field, so
 *     Zod's default `strip` mode deletes it in transit while `parse()` succeeds;
 *   • `CommandEventBridge`'s `roof.create` case emits a NAMED SUBSET — `id`,
 *     `boundary`, `shape`, `overhang`, `thickness`, `pitch`, `boundingWallIds`
 *     — and `baseOffset` is not on that list;
 *   • `roof.created` has exactly ONE emitter in the tree (that case).
 *
 * So the `??`'s left arm is unreachable and the literal is a CONSTANT. That is
 * EI-2 mechanism (b) — *"comparison against a value the source cannot produce;
 * type-checks clean, the branch is a constant"* — the same shape as the handrail
 * `=== 'rectangular'` ternary, and equally invisible to `tsc` and to review,
 * because the fix was applied at a hop that never receives the field.
 *
 * ─── WHY IT IS A USER-VISIBLE DEFECT AND NOT A TIDY-UP ───────────────────────
 * `RoofFragmentBuilder.ts:291` computes `worldY = level.elevation + baseOffset`,
 * and NOTHING reads `autoBaseOffset` at render time — the mirror writes
 * `autoBaseOffset: true` and no consumer ever honours it. Meanwhile the 3-D path
 * (`CreateRoofCommand.ts:140-150`) resolves the same quantity as
 * `Math.max(...wallHeightsOnLevel, 2.7)`. So a roof drawn in PLAN over 3.5 m
 * walls floats 0.8 m clear of the wall tops while the SAME roof drawn in 3-D
 * lands on them — per-path divergence, which C79 §7.4 rates as worse than
 * uniform absence.
 *
 * ─── WHAT EACH ARM MEASURES ─────────────────────────────────────────────────
 * Every arm reads the number back out of a REAL `@pryzm/geometry-roof`
 * `RoofStore` — the store `RoofFragmentBuilder` meshes from — never off the
 * mapper's return value, per §committed-is-not-reachable.
 *
 *   MECHANISM — the real `CommandEventBridge`, driven with a `roof.create`
 *               record that DOES carry `baseOffset`, drops it. Passes before and
 *               after the fix: it is the evidence that the left arm is dead, not
 *               the regression pin.
 *   CONTROL   — 2.7 m walls: both paths seat at 2.7. Passes before and after.
 *               Without it, ARM 1 going green would be unfalsifiable — it could
 *               mean the mirror had simply started copying the 3-D number.
 *   ARM 1     — 3.5 m walls: the two paths must store the SAME seating. RED at
 *               HEAD (plan 2.7 vs 3-D 3.5).
 *   ARM 2     — no walls on the level: the mirror keeps 2.7, exactly as
 *               `CreateRoofCommand` keeps its payload value when
 *               `levelWalls.length === 0`. Pins the fix as strictly narrowing.
 */

import { describe, it, expect } from 'vitest';
import { RoofStore } from '@pryzm/geometry-roof';
import { WallStore } from '@pryzm/geometry-wall';

const LEVEL_ID = 'L0';
let _seq = 0;
const nextRoofId = (): string => `roof-seating-probe-${++_seq}`;

/** A plain 6 x 6 room, every wall `height` metres tall. */
function attachedWallStore(height: number): WallStore {
    const level = { id: LEVEL_ID, name: 'L0', elevation: 0 };
    const store = new WallStore(
        { activeLevelId: LEVEL_ID } as never,
        {
            getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined),
            getLevels: () => [level],
            registerElement: () => {},
            unregisterElement: () => {},
        } as never,
    );
    const ring: Array<[number, number, number, number]> = [
        [0, 0, 6, 0], [6, 0, 6, 6], [6, 6, 0, 6], [0, 6, 0, 0],
    ];
    ring.forEach(([x0, z0, x1, z1], i) => {
        store.add({
            id: `w-${i}`,
            type: 'wall',
            levelId: LEVEL_ID,
            baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }],
            height,
            thickness: 0.2,
            properties: {},
        } as never);
    });
    return store;
}

const SQUARE_BOUNDARY = [
    { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 6 }, { x: 0, y: 0, z: 6 },
];

/**
 * Drive the REAL `CommandEventBridge` with a `roof.create` record and hand back
 * the `roof.created` payload it emits. Imported from source rather than the
 * package barrel: `@pryzm/runtime-composer`'s index transitively pulls
 * `pdfjs-dist`, which touches `DOMMatrix` at module scope and cannot load under
 * this suite's environment. `CommandEventBridge.ts` imports nothing but types.
 */
async function roofCreatedEventFor(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    let ev: Record<string, unknown> | undefined;
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
    const events = {
        emit: (name: string, p: unknown) => {
            if (name === 'roof.created') ev = p as Record<string, unknown>;
        },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: 'evt-roof-seating', type: 'roof.create', payload,
        affectedStores: ['roof'], audit: { actorId: 'probe' }, forward: [],
    });
    if (!ev) throw new Error('CommandEventBridge emitted no roof.created for a roof.create record');
    return ev;
}

/** The dispatch `RoofPlanToolHandler._commit` makes, plus a `baseOffset` the
 *  caller would have to set for the mirror's `??` left arm ever to fire. */
function planDispatch(roofId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: roofId,
        levelId: LEVEL_ID,
        boundary: SQUARE_BOUNDARY,
        shape: 'flat',
        pitch: 0,
        overhang: 0.3,
        thickness: 0.35,
        ...extra,
    };
}

/** The PLAN path, end to end: bus record → real CEB → the §P3.2-RF mirror →
 *  the real `RoofStore`. Returns the seating as STORED. */
async function planPathStoredBaseOffset(walls: WallStore | undefined): Promise<number> {
    const roofId = nextRoofId();
    const ev = await roofCreatedEventFor(planDispatch(roofId, { baseOffset: 3.5 }));
    const { roofRecordFromCreatedEvent } = await import('../src/engine/roofCreatedMirror');
    const heights = walls?.getByLevel(LEVEL_ID).map((w) => (w as { height?: number }).height ?? 0);
    const record = roofRecordFromCreatedEvent(ev as never, heights);
    expect(record, 'the mirror must accept a well-formed roof.created event').not.toBeNull();
    const store = new RoofStore();
    store.add(record as never);
    const stored = store.getById(roofId);
    expect(stored, 'the mirrored roof must reach the RoofStore').toBeDefined();
    return stored!.baseOffset;
}

/** The 3-D path: `CreateRoofCommand` with `autoBaseOffset`, into a real
 *  `RoofStore`. Returns the seating as STORED. */
async function threeDPathStoredBaseOffset(walls: WallStore): Promise<number> {
    const { CreateRoofCommand } = await import('@pryzm/command-registry');
    const roofStore = new RoofStore();
    const level = { id: LEVEL_ID, name: 'L0', elevation: 0 };
    const ctx = {
        stores: { roofStore, wallStore: walls },
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined),
            getLevels: () => [level],
            registerElement: () => {},
        },
        projectContext: { activeLevelId: LEVEL_ID },
    };
    const roofId = nextRoofId();
    new CreateRoofCommand(roofId, {
        levelId: LEVEL_ID,
        footprint: { polygon: [[-3, -3], [3, -3], [3, 3], [-3, 3]], centroid: [3, 3] },
        roofType: 'flat',
        overhang: 0.3,
        // The 3-D tool's own placeholder; `autoBaseOffset` is what resolves it.
        baseOffset: 0,
        thickness: 0.35,
        autoBaseOffset: true,
    } as never).execute(ctx as never);
    const stored = roofStore.getById(roofId);
    expect(stored, 'CreateRoofCommand must have added the roof').toBeDefined();
    return stored!.baseOffset;
}

describe('§FIX-ROOF-BRIDGE-SEATING — the plan roof must seat where the 3-D roof seats', () => {
    it('MECHANISM — `roof.created` carries `thickness` but NEVER `baseOffset`, so the mirror\'s `??` left arm is dead', async () => {
        // Positive and negative on the SAME object, so the negative can fail:
        // if the emitter ever started listing baseOffset, this arm goes red and
        // the whole premise of the fix is re-opened.
        const ev = await roofCreatedEventFor(planDispatch(nextRoofId(), { baseOffset: 3.5 }));
        expect(ev['thickness'], 'thickness IS on the emitter\'s named subset').toBe(0.35);
        expect(
            ev['baseOffset'],
            'baseOffset is NOT on the emitter\'s named subset — it is dropped in flight however the caller dispatched it',
        ).toBeUndefined();
    });

    it('CONTROL — with 2.7 m walls both paths seat at 2.7 (green before AND after the fix)', async () => {
        const walls = attachedWallStore(2.7);
        const threeD = await threeDPathStoredBaseOffset(walls);
        const plan = await planPathStoredBaseOffset(walls);
        expect(threeD).toBe(2.7);
        expect(plan).toBe(2.7);
        expect(plan).toBe(threeD);
    });

    it('ARM 1 — with 3.5 m walls the PLAN-created roof must store the same seating as the 3-D one', async () => {
        const walls = attachedWallStore(3.5);
        const threeD = await threeDPathStoredBaseOffset(walls);
        expect(threeD, 'CreateRoofCommand resolves autoBaseOffset from the tallest wall').toBe(3.5);

        const plan = await planPathStoredBaseOffset(walls);
        expect(
            plan,
            'the §P3.2-RF mirror seats every roof at the literal 2.7 — a roof drawn in plan floats 0.8 m above the walls it caps',
        ).toBe(3.5);
        expect(plan, 'the literal must not survive').not.toBe(2.7);
        expect(plan).toBe(threeD);
    });

    it('ARM 2 — with NO walls on the level the mirror keeps 2.7, exactly as CreateRoofCommand keeps its payload value', async () => {
        const plan = await planPathStoredBaseOffset(undefined);
        expect(
            plan,
            'no walls = nothing to measure; the fix must be strictly narrowing, never inventing a seating',
        ).toBe(2.7);
    });
});
