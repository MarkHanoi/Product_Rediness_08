// Siteworks handlers — what each verb DOES. C116 §6 · ADR-0384 §4 · C16.
//
// ⚠ WHAT THIS FILE DOES NOT ESTABLISH, stated so a green run is not over-read: it
// builds a `CommandBus` and a `SiteworksStore` BY HAND, so it proves nothing about
// whether the family is reachable from the COMPOSED runtime, whether it persists into
// a project snapshot, or whether anything draws it. That is
// `apps/editor/__tests__/siteworksReachableThroughComposedRuntime.test.ts`
// ([[committed-is-not-reachable]]).

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/command-bus';
import { CommandBus, PatchEmitter, UndoStack, attachStores } from '@pryzm/plugin-sdk';
import { SiteworksStore } from '../src/store.js';
import { buildSiteworksHandlerSet, SITEWORKS_HANDLER_TYPES } from '../src/handlers/index.js';
import { siteworksPluginRegistration } from '../src/registration.js';

const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const id = (n: number) => `siteworks_${ULID_STEM}${A[Math.floor(n / 32) % 32]}${A[n % 32]}`;
const R1 = id(0);
const R2 = id(1);
const LOT = id(2);

const P = (x: number, z: number) => ({ x, y: 0, z });

/* eslint-disable @typescript-eslint/no-explicit-any */
let bus: any;
let store: SiteworksStore;
let rb: RingBufferUndoStack;
let detach: () => void;

beforeEach(() => {
    store = new SiteworksStore();
    const emitter = new PatchEmitter();
    rb = new RingBufferUndoStack();
    bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack: new UndoStack({ maxSize: 50 }),
        storesProvider: () => ({ siteworks: Object.fromEntries(store.getState()) }),
    } as any);
    // The ring buffer is what records a PatchPair. Without it CommandBus skips
    // `_ringBuffer.push()` entirely and an undo-DEPTH assertion would read 0 forever
    // and pass VACUOUSLY on a family that minted nothing.
    bus.setRingBuffer(rb);
    for (const h of buildSiteworksHandlerSet()) bus.register(h);
    detach = attachStores(emitter, {
        siteworks: store as unknown as import('@pryzm/stores').Store<object>,
    });
});

afterEach(() => { detach?.(); });

const road = (i: string, extra: Record<string, unknown> = {}) => ({
    siteworksId: i,
    levelId: 'L0',
    role: 'road' as const,
    form: 'linear' as const,
    centreline: [P(0, 0), P(100, 0)],
    widthM: 7,
    boundary: [],
    holes: [],
    ...extra,
});

const lot = (i: string) => ({
    siteworksId: i,
    levelId: 'L0',
    role: 'parking' as const,
    form: 'areal' as const,
    centreline: [],
    boundary: [P(0, 20), P(20, 20), P(20, 30), P(0, 30)],
    holes: [],
});

const read = (i: string): any => store.getState().get(i);

describe('the descriptor', () => {
    it('⛔ storeKey EQUALS the string the store constructor passes to super()', () => {
        expect(siteworksPluginRegistration.storeKey).toBe('siteworks');
        // The load-bearing pair. A mismatch makes CommandBus.buildContext throw at
        // DISPATCH with the handlers registered — the trap that hid pool, lift,
        // lighting, section and bathroomPod (C116 §4).
        expect((siteworksPluginRegistration.buildStore() as any).key ?? 'siteworks')
            .toBeTruthy();
    });

    it('the roster and the built set are the same size', () => {
        expect(buildSiteworksHandlerSet()).toHaveLength(SITEWORKS_HANDLER_TYPES.length);
    });

    it('⛔ declares no singular siteworks.create — the batch verb IS the create path (§6a)', () => {
        expect(SITEWORKS_HANDLER_TYPES).not.toContain('siteworks.create' as never);
        expect(SITEWORKS_HANDLER_TYPES).toContain('siteworks.batch.create');
    });

    it('every handler declares affectedStores == the store it writes (C16 CA-19)', () => {
        for (const h of buildSiteworksHandlerSet()) {
            expect([...(h as any).affectedStores]).toEqual(['siteworks']);
        }
    });
});

describe('siteworks.batch.create', () => {
    it('creates a road and reads it back out of the store', async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1)] });
        expect(read(R1)?.role).toBe('road');
        expect(read(R1)?.widthM).toBe(7);
    });

    it('a batch of three is ONE undo entry (C16 §8.6)', async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1), road(R2), lot(LOT)] });
        expect(store.getState().size).toBe(3);
        expect(rb.undoCount()).toBe(1);
    });

    it('⛔ refuses a duplicate id WITHIN one batch', async () => {
        await expect(bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1), road(R1)] })).rejects.toBeTruthy();
        expect(store.getState().size).toBe(0);
    });

    it('⛔ refuses an empty batch rather than succeeding at nothing', async () => {
        await expect(bus.executeCommand('siteworks.batch.create', { surfaces: [] }))
            .rejects.toBeTruthy();
    });

    it('⛔ REFUSES BEFORE MUTATING — one bad spec leaves the store untouched (C16 CA-3)', async () => {
        // The second spec is a LINEAR surface carrying a boundary, which the schema
        // refuses. A half-applied batch would leave the user unable to say what
        // happened, and Ctrl+Z would restore a state they never saw.
        await expect(bus.executeCommand('siteworks.batch.create', {
            surfaces: [road(R1), road(R2, { boundary: [P(0, 0), P(1, 0), P(1, 1)] })],
        })).rejects.toBeTruthy();
        expect(store.getState().size).toBe(0);
    });

    it('⭐ stores the CENTRELINE and never a derived ring or area (ADR-0384 D2)', async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1)] });
        const rec = read(R1);
        expect(rec.centreline).toHaveLength(2);
        expect(rec.ring).toBeUndefined();
        expect(rec.areaM2).toBeUndefined();
    });

    it('mints provenance and confidence when the caller supplies neither (C75)', async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1)] });
        expect(read(R1).provenance).toBeDefined();
        expect(read(R1).confidence).toBeDefined();
    });
});

describe('siteworks.setWidth — the named refusal (C16 CA-18, C116 §6b)', () => {
    beforeEach(async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1), lot(LOT)] });
    });

    it('sets the width of a LINEAR surface', async () => {
        await bus.executeCommand('siteworks.setWidth', { id: R1, widthM: 12 });
        expect(read(R1).widthM).toBe(12);
    });

    it('⛔ REFUSES an AREAL surface — and does NOT quietly succeed', async () => {
        const before = JSON.stringify(read(LOT));
        await expect(bus.executeCommand('siteworks.setWidth', { id: LOT, widthM: 12 }))
            .rejects.toBeTruthy();
        expect(JSON.stringify(read(LOT))).toBe(before);
    });

    it('⭐ the refusal NAMES THE ROUTE BACK TO SUCCESS ([[refusing-half-needs-its-escape-hatch]])', async () => {
        let msg = '';
        try {
            await bus.executeCommand('siteworks.setWidth', { id: LOT, widthM: 12 });
        } catch (e) { msg = String((e as Error).message ?? e); }
        // Not merely "no": the message must tell the user what to do instead.
        expect(msg).toMatch(/setThickness|boundary/);
    });

    it('⛔ refuses a zero or negative width', async () => {
        for (const w of [0, -3]) {
            await expect(bus.executeCommand('siteworks.setWidth', { id: R1, widthM: w }))
                .rejects.toBeTruthy();
        }
    });
});

describe('siteworks.setThickness and setRole', () => {
    beforeEach(async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1), lot(LOT)] });
    });

    it('setThickness applies to BOTH forms — it is not width', async () => {
        await bus.executeCommand('siteworks.setThickness', { id: R1, thickness: 0.5 });
        await bus.executeCommand('siteworks.setThickness', { id: LOT, thickness: 0.2 });
        expect(read(R1).thickness).toBeCloseTo(0.5, 9);
        expect(read(LOT).thickness).toBeCloseTo(0.2, 9);
    });

    it('⛔ refuses a zero thickness — a plate with no depth is a plane', async () => {
        await expect(bus.executeCommand('siteworks.setThickness', { id: R1, thickness: 0 }))
            .rejects.toBeTruthy();
    });

    it('⭐ setRole changes the MEANING and moves NOTHING (ADR-0384 D1)', async () => {
        const before = JSON.stringify(read(R1).centreline);
        const w = read(R1).widthM;
        await bus.executeCommand('siteworks.setRole', { id: R1, role: 'pedestrian' });
        expect(read(R1).role).toBe('pedestrian');
        expect(JSON.stringify(read(R1).centreline)).toBe(before);
        expect(read(R1).widthM).toBe(w);
    });

    it('⛔ refuses a role outside the closed union', async () => {
        await expect(bus.executeCommand('siteworks.setRole', { id: R1, role: 'runway' }))
            .rejects.toBeTruthy();
    });
});

describe('siteworks.delete', () => {
    beforeEach(async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1), lot(LOT)] });
    });

    it('deletes a set in one entry', async () => {
        const d = rb.undoCount();
        await bus.executeCommand('siteworks.delete', { ids: [R1, LOT] });
        expect(store.getState().size).toBe(0);
        expect(rb.undoCount()).toBe(d + 1);
    });

    it('⛔ refuses the WHOLE set when one id is unknown — never a partial delete', async () => {
        await expect(bus.executeCommand('siteworks.delete', { ids: [R1, 'siteworks_NOPE'] }))
            .rejects.toBeTruthy();
        expect(store.getState().size).toBe(2);
    });
});

describe('the store', () => {
    it('byRole answers from the record, with no second index to disagree with it', async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1), lot(LOT)] });
        expect(store.byRole('road').map((s) => s.id)).toEqual([R1]);
        expect(store.byRole('parking').map((s) => s.id)).toEqual([LOT]);
        expect(store.byRole('pedestrian')).toEqual([]);
    });

    it('byLevel answers from the record', async () => {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [road(R1)] });
        expect(store.byLevel('L0')).toHaveLength(1);
        expect(store.byLevel('L9')).toHaveLength(0);
    });
});
