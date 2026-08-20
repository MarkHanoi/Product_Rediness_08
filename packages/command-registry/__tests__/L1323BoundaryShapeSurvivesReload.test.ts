/**
 * §FEAT-BOUNDARY-SHAPE-DESCRIPTOR (L-1323) — a circular slab must still KNOW it is a
 * circle after a save/open cycle, and must STOP knowing it the moment a vertex moves.
 *
 * ── WHY THIS FILE HAS A "REACHABILITY" ARM AT ALL ────────────────────────────
 *
 * ⭐ The nearest prior art, `L1178SlabAssemblySurvivesReload.test.ts`, hand-builds
 * "exactly the payload ProjectLoader builds" and drives `CreateSlabCommand` directly.
 * `ImportProjectCommand:690` records what that cost: **`ProjectLoader` is OFF BY
 * DEFAULT** (`_useImportCommandPath()` returns true unless someone sets an env var), so
 * three separate fixes landed against a branch production does not take and a slab still
 * came back wrong. §COMMITTED-IS-NOT-REACHABLE in its purest form.
 *
 * A behaviour arm alone would repeat that exactly: it would prove `CreateSlabCommand`
 * ACCEPTS the field while saying nothing about whether the shipping restore path PASSES
 * it. So ARM A reads the two production sources and requires BOTH to name it. It is a
 * source assertion, which is weak evidence of behaviour and STRONG evidence of
 * reachability — and reachability is the thing that was missing five times this week.
 *
 * ── WHERE THE BEHAVIOUR ARMS ASSERT ──────────────────────────────────────────
 *
 * On the STORE RECORD the command produces — what the builder reads, and therefore what
 * the user sees — never on the payload just passed in, which would only prove the test
 * can construct an object.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateSlabCommand } from '../src/slabs/CreateSlabCommand';
import { UpdateSlabPolygonCommand } from '../src/slabs/UpdateSlabPolygonCommand';
import { boundaryLoopVertices, describeBoundaryLoop } from '@pryzm/geometry-slab';

const REPO = join(__dirname, '..', '..', '..');
const src = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

const CENTRE = { x: 5, z: 5 };
const RIM = { x: 9, z: 5 };
/** Polygon space is `{x, y}` with `y` = worldZ. */
const RING = boundaryLoopVertices('circular', CENTRE, RIM).map((v) => ({ x: v.x, y: v.z }));
const SHAPE = describeBoundaryLoop('circular', CENTRE, RIM)!;

const SAVED_CIRCULAR_SLAB = {
    id: 'slab-drum-1',
    levelId: 'L0',
    width: 8, depth: 8, thickness: 0.3,
    position: { x: 0, y: 0, z: 0 },
    polygon: RING,
    boundaryShape: SHAPE,
    ifcData: { guid: 'guid-drum-1', ifcClass: 'IfcSlab' },
};

function makeContext() {
    const added: any[] = [];
    return {
        added,
        ctx: {
            projectContext: { activeLevelId: 'L0' },
            bimManager: {
                getLevelById: (id: string) => ({ id, elevation: 0 }),
                registerElement: () => {}, unregisterElement: () => {},
            },
            stores: {
                slabStore: {
                    add: (d: any) => { added.push(d); },
                    getAll: () => added,
                    getById: (id: string) => added.find((a) => a.id === id),
                    update: (id: string, next: any) => {
                        const i = added.findIndex((a) => a.id === id);
                        if (i >= 0) added[i] = next;
                    },
                    remove: () => {},
                },
                openingStore: { getAll: () => [], add: () => {}, remove: () => {} },
                stairStore: { getAll: () => [] },
            },
        } as any,
    };
}

const restorePayload = (s: typeof SAVED_CIRCULAR_SLAB) => ({
    id: s.id, ifcGuid: s.ifcData?.guid,
    width: s.width, depth: s.depth, thickness: s.thickness,
    position: s.position, levelId: s.levelId, polygon: s.polygon,
    boundaryShape: s.boundaryShape,
} as any);

// ─────────────────────────────────────────────────────────────────────────────

describe('L-1323 ARM A — REACHABILITY: both restore twins name the field', () => {
    // ⭐ THE ONE THAT MATTERS. This is the shipping path.
    it('⭐ ImportProjectCommand — the DEFAULT-ON path — passes boundaryShape to CreateSlabCommand', () => {
        const s = src('packages/command-registry/src/project/ImportProjectCommand.ts');
        const at = s.indexOf('new CreateSlabCommand({');
        expect(at).toBeGreaterThan(-1);
        expect(s.slice(at, at + 3000)).toMatch(/boundaryShape:/);
    });

    it('ProjectLoader — the other twin — passes it too, so the two cannot disagree', () => {
        expect(src('apps/editor/src/engine/persistence/ProjectLoader.ts')).toMatch(/boundaryShape:/);
    });

    it('ProjectSerializer WRITES it, and declares it on SerializedSlab', () => {
        const s = src('apps/editor/src/engine/persistence/ProjectSerializer.ts');
        expect(s).toMatch(/boundaryShape:\s*s\.boundaryShape/);
        expect(s).toMatch(/boundaryShape:\s*SlabData\[/);
    });

    // ⛔ The field must NOT be excused as transient — that list is for things a stale
    // copy would make worse. An authored shape is not recoverable from the polygon.
    it('⛔ is NOT parked on the TransientSlabKey excuse list', () => {
        const s = src('apps/editor/src/engine/persistence/ProjectSerializer.ts');
        const from = s.indexOf('type TransientSlabKey =');
        expect(from).toBeGreaterThan(-1);
        expect(s.slice(from, s.indexOf('childrenIds', from) + 20)).not.toMatch(/boundaryShape/);
    });
});

describe('L-1323 ARM B — a reloaded circular slab still knows it is a circle', () => {
    it('⭐ the STORE RECORD carries the descriptor with the AUTHORED values', () => {
        const { ctx, added } = makeContext();
        new CreateSlabCommand(restorePayload(SAVED_CIRCULAR_SLAB)).execute(ctx);
        const rec = added[0];
        expect(rec.boundaryShape).toBeTruthy();
        expect(rec.boundaryShape.kind).toBe('circular');
        // On VALUE, not merely presence — a defaulted descriptor would pass a presence check.
        expect(rec.boundaryShape.rx).toBeCloseTo(4, 6);
        expect(rec.boundaryShape.centre).toEqual(CENTRE);
    });

    it('the descriptor is CLONED, not aliased — a restore must not share mutable state', () => {
        const { ctx, added } = makeContext();
        const payload = restorePayload(SAVED_CIRCULAR_SLAB);
        new CreateSlabCommand(payload).execute(ctx);
        expect(added[0].boundaryShape).not.toBe(payload.boundaryShape);
        expect(added[0].boundaryShape).toEqual(payload.boundaryShape);
    });

    it('ABSENCE stays absence — a hand-drawn polyline slab restores as a free polygon', () => {
        const { ctx, added } = makeContext();
        const { boundaryShape, ...noShape } = SAVED_CIRCULAR_SLAB;
        void boundaryShape;
        new CreateSlabCommand(restorePayload(noShape as typeof SAVED_CIRCULAR_SLAB)).execute(ctx);
        expect(added[0].boundaryShape).toBeUndefined();
    });
});

describe('L-1323 ARM C — the intent is DROPPED by an edit that changes the shape', () => {
    const seed = () => {
        const { ctx, added } = makeContext();
        new CreateSlabCommand(restorePayload(SAVED_CIRCULAR_SLAB)).execute(ctx);
        return { ctx, added };
    };

    it('⭐⛔ dragging ONE vertex through UpdateSlabPolygonCommand drops the descriptor', () => {
        const { ctx, added } = seed();
        const dragged = RING.map((p, i) => (i === 4 ? { x: p.x + 0.4, y: p.y } : p));
        new UpdateSlabPolygonCommand({ slabId: SAVED_CIRCULAR_SLAB.id, polygon: dragged }).execute(ctx);
        expect(added[0].polygon).toHaveLength(RING.length);
        expect(added[0].boundaryShape).toBeUndefined();
    });

    it('⛔ deleting a vertex drops it — even though every survivor is still ON the circle', () => {
        const { ctx, added } = seed();
        const shortened = RING.filter((_, i) => i !== 7);
        new UpdateSlabPolygonCommand({ slabId: SAVED_CIRCULAR_SLAB.id, polygon: shortened }).execute(ctx);
        expect(added[0].boundaryShape).toBeUndefined();
    });

    it('⭐ an UNCHANGED ring KEEPS it — an invalidation that always fires is not a gate', () => {
        const { ctx, added } = seed();
        new UpdateSlabPolygonCommand({
            slabId: SAVED_CIRCULAR_SLAB.id,
            polygon: RING.map((p) => ({ ...p })),
        }).execute(ctx);
        expect(added[0].boundaryShape).toBeTruthy();
        expect(added[0].boundaryShape.kind).toBe('circular');
    });

    it('a slab that never had a descriptor does not acquire one from an edit', () => {
        const { ctx, added } = makeContext();
        const { boundaryShape, ...noShape } = SAVED_CIRCULAR_SLAB;
        void boundaryShape;
        new CreateSlabCommand(restorePayload(noShape as typeof SAVED_CIRCULAR_SLAB)).execute(ctx);
        new UpdateSlabPolygonCommand({
            slabId: SAVED_CIRCULAR_SLAB.id,
            polygon: RING.map((p) => ({ ...p })),
        }).execute(ctx);
        expect(added[0].boundaryShape).toBeUndefined();
    });
});
