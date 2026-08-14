/**
 * C72 §5.1/§5.2/§7 · gap register PR-07 — RECONCILABLE_TYPES states the truth
 * AND is consumed.
 *
 * The set used to name 13 element types with zero consumers anywhere — the
 * §5.2 hazard (an exported whitelist that reads as coverage and is an opinion).
 * The real reconcile handles walls (per delivered id) and slabs (per level
 * query) only. The fix, per C72 §7 ("narrowing a claim to the truth is a
 * fix"): the set names exactly {'Wall', 'Slab'} and the reconciliation
 * listener CONSUMES it — every affected element is classified against it
 * before delivery.
 *
 * These are DIFFERENTIATING tests, not presence tests:
 *  · drop 'Wall' from RECONCILABLE_TYPES  → wall ids classify STRANDED, stop
 *    being delivered → "wall id is delivered" FAILS;
 *  · drop 'Slab' from RECONCILABLE_TYPES  → same for slab ids;
 *  · blanket-deliver everything (a fake "wiring" that ignores the set) →
 *    "column/roof ids are NOT delivered" FAILS.
 * A consumer that receives and ignores is the defect C72 names — both
 * directions are asserted so neither theatre survives.
 *
 * C78 §1.4 is asserted too: an id no store answers for is UNDETERMINED and is
 * DELIVERED (fail-open) — "unaffected" is never inferred from missing data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    SpatialAuthority,
    spatialAuthority,
    RECONCILABLE_TYPES,
} from '../SpatialAuthority';

// ── window-global store stubs (the established pattern of this test tree) ────
const w = globalThis as unknown as Record<string, unknown>;
const STORE_KEYS = [
    'wallStore', 'slabStore', 'columnStore', 'beamStore',
    'stairStore', 'curtainWallStore', 'furnitureStore', 'bimManager',
] as const;

function storeOf(ids: Record<string, object>, extras: Record<string, unknown> = {}) {
    return { get: (id: string) => ids[id] ?? null, ...extras };
}

const LEVEL_ID = 'L-reconcile';

/** Ids by kind. The wall carries enough semantic data for resolveWorldTransform. */
const WALL = { id: 'wall-1', levelId: LEVEL_ID, x: 1, z: 2, rotationY: 0 };
const IDS = {
    wall: 'wall-1',
    slab: 'slab-1',
    column: 'col-1',
    beam: 'beam-1',
    stair: 'stair-1',
    curtainWall: 'cw-1',
    roof: 'roof-1',
    furniture: 'furn-1',
    embeddedWindow: 'win-1',
    embeddedDoor: 'door-1',
    ghost: 'ghost-1', // registered on the level, answered by NO store
};

const ALL_CHILDREN = Object.values(IDS);

function makeBimManager() {
    const level = {
        id: LEVEL_ID,
        name: 'Reconcile',
        elevation: 3,
        height: 3,
        isVisible: true,
        order: 1,
        childrenIds: [...ALL_CHILDREN],
    };
    return {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined),
    };
}

const saved: Record<string, unknown> = {};

beforeEach(() => {
    for (const k of STORE_KEYS) saved[k] = w[k];

    w.wallStore = storeOf(
        { [IDS.wall]: WALL },
        {
            // Legacy embedded openings live inside the host wall's store record.
            getWindow: (id: string) => (id === IDS.embeddedWindow ? { id, wallId: IDS.wall } : null),
            getDoor: (id: string) => (id === IDS.embeddedDoor ? { id, wallId: IDS.wall } : null),
        },
    );
    w.slabStore = storeOf({ [IDS.slab]: { id: IDS.slab, levelId: LEVEL_ID } });
    w.columnStore = storeOf({ [IDS.column]: { id: IDS.column } });
    w.beamStore = storeOf({ [IDS.beam]: { id: IDS.beam } });
    w.stairStore = storeOf({ [IDS.stair]: { id: IDS.stair } });
    w.curtainWallStore = storeOf({ [IDS.curtainWall]: { id: IDS.curtainWall } });
    w.furnitureStore = storeOf({ [IDS.furniture]: { id: IDS.furniture } });
    w.bimManager = makeBimManager();

    spatialAuthority.setBimManager(makeBimManager() as never);
    spatialAuthority.setRoofStore(storeOf({ [IDS.roof]: { id: IDS.roof } }));
});

afterEach(() => {
    for (const k of STORE_KEYS) w[k] = saved[k];
    vi.restoreAllMocks();
});

/**
 * The listener registers on first successful resolveWorldTransform (existing
 * production timing — unchanged). Registering the callback then resolving the
 * wall once arms the reconcile path; the returned promise-less capture records
 * every delivery.
 */
function armReconcile(): Array<{ levelId: string; elementIds: string[] }> {
    const calls: Array<{ levelId: string; elementIds: string[] }> = [];
    spatialAuthority.registerLevelRebuildCallback((levelId, elementIds) => {
        calls.push({ levelId, elementIds });
    });
    spatialAuthority.resolveWorldTransform(IDS.wall); // registers the window listener
    calls.length = 0; // discard anything incidental — deliveries only from here on
    return calls;
}

function fireReconcile(): void {
    window.dispatchEvent(new CustomEvent('spatial-authority-reconcile', {
        detail: { levelId: LEVEL_ID, delta: 1.5 },
    }));
}

describe('RECONCILABLE_TYPES — the narrowed truth (C72 §5.1/§7)', () => {
    it('names exactly the types the reconcile consumer handles: Wall and Slab', () => {
        // The 11 removed entries are documented BY NAME at the declaration.
        // Re-widening requires a consumer that HANDLES the added type — this
        // assertion is the tripwire that makes silent re-widening fail loudly.
        expect([...RECONCILABLE_TYPES].sort()).toEqual(['Slab', 'Wall']);
    });
});

describe('the reconcile listener CONSUMES the set (C72 §5.2 — no consumer-less export)', () => {
    it('delivers wall and slab ids — FAILS if their type is dropped from RECONCILABLE_TYPES', () => {
        const calls = armReconcile();
        fireReconcile();

        expect(calls).toHaveLength(1);
        expect(calls[0]!.levelId).toBe(LEVEL_ID);
        // Differentiating direction 1: remove 'Wall' or 'Slab' from the set and
        // classification turns DETERMINED-STRANDED → id not delivered → these fail.
        expect(calls[0]!.elementIds).toContain(IDS.wall);
        expect(calls[0]!.elementIds).toContain(IDS.slab);
    });

    it('does NOT deliver determined-stranded kinds — FAILS if the filter ignores the set', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const calls = armReconcile();
        fireReconcile();

        // Differentiating direction 2: a fake consumer that receives the set and
        // delivers everything anyway (the C72 defect) fails here.
        const delivered = calls[0]!.elementIds;
        for (const strandedId of [IDS.column, IDS.beam, IDS.stair, IDS.curtainWall, IDS.roof, IDS.furniture]) {
            expect(delivered).not.toContain(strandedId);
        }

        // C72 §5.1 — the shortfall is RECORDED BY NAME, never silent: one warn
        // naming each stranded kind and the gap-register row.
        const shortfall = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('C72 §5.1 SHORTFALL'));
        expect(shortfall).toBeTruthy();
        for (const kind of ['Column', 'Beam', 'Stair', 'CurtainWall', 'Roof', 'Furniture']) {
            expect(shortfall).toContain(kind);
        }
        expect(shortfall).toContain('PR-07');
        expect(shortfall).toContain('PR-10'); // a Roof is among the stranded
    });

    it('hosted embedded openings are not delivered directly — they follow the host wall (C15)', () => {
        const calls = armReconcile();
        fireReconcile();
        expect(calls[0]!.elementIds).not.toContain(IDS.embeddedWindow);
        expect(calls[0]!.elementIds).not.toContain(IDS.embeddedDoor);
        // …while the host wall itself IS delivered (its rebuild re-renders them).
        expect(calls[0]!.elementIds).toContain(IDS.wall);
    });

    it('UNDETERMINED ids are DELIVERED fail-open (C78 §1.4 — never inferred unaffected)', () => {
        const calls = armReconcile();
        fireReconcile();
        expect(calls[0]!.elementIds).toContain(IDS.ghost);
    });

    it('passes the elevation delta through to the rebuild callback (PR-10 — the stranded-roof check needs the OLD elevation)', () => {
        // The BimKernel dispatch has ALWAYS carried `delta` (BimKernel.ts:374,
        // typed on the event-bus catalog since its entry), and the listener
        // dropped it on the floor. The roof→walls-beneath clash subscriber
        // (gap register PR-10) cannot classify a STRANDED roof without it:
        // the stranded roof's real origin is (newElevation − delta) + baseOffset,
        // and computing from the NEW elevation alone would read every strand
        // as clean — a false-clean, the dishonesty C72 §5.1 exists to name.
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const deltas: Array<number | undefined> = [];
        spatialAuthority.registerLevelRebuildCallback((_levelId, _elementIds, elevationDeltaM) => {
            deltas.push(elevationDeltaM);
        });
        spatialAuthority.resolveWorldTransform(IDS.wall); // registers the window listener
        deltas.length = 0;
        fireReconcile(); // dispatches detail { levelId, delta: 1.5 }
        expect(deltas).toEqual([1.5]);
    });

    it('still invokes the callback when every child is stranded (the slab half queries by level)', () => {
        // A level whose children are ALL stranded kinds must still trigger the
        // callback: the consumer's slab rebuild is a levelId query, independent
        // of the delivered ids. Delivering [] and not calling at all are
        // different facts — this pins the invocation semantics.
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const calls = armReconcile();
        // spatialAuthority holds its own bimManager stub (set in beforeEach) —
        // mutate THAT level, the one the listener will read.
        const saLevel = (spatialAuthority as unknown as {
            bimManager: { getLevelById(id: string): { childrenIds: string[] } };
        }).bimManager.getLevelById(LEVEL_ID);
        saLevel.childrenIds = [IDS.column, IDS.roof];

        fireReconcile();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.elementIds).toEqual([]);
    });
});

describe('classifyForReconcile — C78 §1.1 typed determinations', () => {
    const sa = () => spatialAuthority as SpatialAuthority;

    it('a wall id is DETERMINED-RECONCILED with kind Wall', () => {
        expect(sa().classifyForReconcile(IDS.wall)).toEqual({ outcome: 'DETERMINED-RECONCILED', kind: 'Wall' });
    });

    it('a slab id is DETERMINED-RECONCILED with kind Slab', () => {
        expect(sa().classifyForReconcile(IDS.slab)).toEqual({ outcome: 'DETERMINED-RECONCILED', kind: 'Slab' });
    });

    it('a column id is DETERMINED-STRANDED with a typed reason naming C72 §5.1 and PR-07', () => {
        const c = sa().classifyForReconcile(IDS.column);
        expect(c.outcome).toBe('DETERMINED-STRANDED');
        if (c.outcome !== 'DETERMINED-STRANDED') return;
        expect(c.kind).toBe('Column');
        expect(c.reason).toContain('C72 §5.1');
        expect(c.reason).toContain('PR-07');
        expect(c.reason).toContain('old elevation');
    });

    it('roof / beam / stair / curtain-wall / furniture ids are DETERMINED-STRANDED with their kind', () => {
        const kinds: Array<[string, string]> = [
            [IDS.roof, 'Roof'],
            [IDS.beam, 'Beam'],
            [IDS.stair, 'Stair'],
            [IDS.curtainWall, 'CurtainWall'],
            [IDS.furniture, 'Furniture'],
        ];
        for (const [id, kind] of kinds) {
            const c = sa().classifyForReconcile(id);
            expect(c.outcome, `${kind} id must classify STRANDED`).toBe('DETERMINED-STRANDED');
            if (c.outcome === 'DETERMINED-STRANDED') expect(c.kind).toBe(kind);
        }
    });

    it('an embedded opening id is DETERMINED-HOSTED with a C15 reason', () => {
        const win = sa().classifyForReconcile(IDS.embeddedWindow);
        expect(win.outcome).toBe('DETERMINED-HOSTED');
        if (win.outcome === 'DETERMINED-HOSTED') {
            expect(win.kind).toBe('Window');
            expect(win.reason).toContain('C15');
        }
        const door = sa().classifyForReconcile(IDS.embeddedDoor);
        expect(door.outcome).toBe('DETERMINED-HOSTED');
        if (door.outcome === 'DETERMINED-HOSTED') expect(door.kind).toBe('Door');
    });

    it('an unanswerable id is UNDETERMINED with a typed reason — never a silent skip', () => {
        const c = sa().classifyForReconcile(IDS.ghost);
        expect(c.outcome).toBe('UNDETERMINED');
        if (c.outcome === 'UNDETERMINED') {
            expect(c.reason).toContain('C78 §1.4');
            expect(c.reason).toContain('DELIVERED');
        }
    });
});
