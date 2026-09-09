/**
 * @vitest-environment happy-dom
 */
// siteworksRailTools — the Master planning rail entries ACTIVATE, they do not merely
// render. C82 · C116 · ADR-0384 D7 · P6 · C16 CA-2.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHY AN ACTIVATION TEST AND NOT A RENDER TEST
// ═══════════════════════════════════════════════════════════════════════════════
//
// C82's ribbon census measured **267 of 280 toolbar pairs SILENTLY DEAD**. Every one
// of them rendered. A test that asserted "the Master planning category has three
// entries with the right labels" would have passed on all 267 of those too — which is
// precisely why this file presses each entry and reads the record back OUT of a REAL
// store, through a REAL `CommandBus`, driven by the REAL handlers.
//
// ⚠ WHAT IS SUBSTITUTED, DECLARED: the bus here is hand-built rather than
// `composeRuntime`'s, because this file's subject is the RAIL ENTRY and booting the
// whole composition root for it would make the suite minutes long. The composed-runtime
// leg — that `rt.stores.siteworks` exists and the same verbs dispatch against it — is
// proven separately and in full by
// `apps/editor/__tests__/siteworksReachableThroughComposedRuntime.test.ts`. Neither
// file is sufficient alone and both are named here so nobody reads one as both.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores } from '@pryzm/plugin-sdk';
import { RingBufferUndoStack } from '@pryzm/command-bus';
import { SiteworksStore, buildSiteworksHandlerSet } from '@pryzm/plugin-siteworks';
import { SITEWORKS_DEFAULT_WIDTH_M } from '@pryzm/schemas';
import {
    masterPlanningTools,
    registerMasterPlanningTool,
    __resetMasterPlanningToolsForTest,
} from '../masterPlanningRailRegistry.js';
import { registerSiteworksRailTools } from '../siteworksRailTools.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
let store: SiteworksStore;
let bus: any;
let detach: () => void;

beforeEach(() => {
    __resetMasterPlanningToolsForTest();
    store = new SiteworksStore();
    const emitter = new PatchEmitter();
    bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack: new UndoStack({ maxSize: 50 }),
        storesProvider: () => ({ siteworks: Object.fromEntries(store.getState()) }),
    } as any);
    bus.setRingBuffer(new RingBufferUndoStack());
    for (const h of buildSiteworksHandlerSet()) bus.register(h);
    detach = attachStores(emitter, {
        siteworks: store as unknown as import('@pryzm/stores').Store<object>,
    });
    registerSiteworksRailTools(() => ({ bus }) as never);
});

afterEach(() => {
    detach?.();
    __resetMasterPlanningToolsForTest();
    delete (window as any).projectContext;
});

const byKey = (k: string) => masterPlanningTools().find((e) => e.key === k)!;
const only = () => [...store.getState().values()][0] as any;

describe('the Master planning registry (ADR-0384 D7)', () => {
    it('carries the three siteworks entries', () => {
        expect(masterPlanningTools().map((e) => e.key)).toEqual([
            'siteworks.road', 'siteworks.parking', 'siteworks.pedestrian',
        ]);
    });

    it('⭐ is a REGISTRY the other master-planning lane can join without touching the rail', () => {
        registerMasterPlanningTool({
            key: 'massing.block', label: 'Block', icon: 'x', action: () => {},
        });
        expect(masterPlanningTools().map((e) => e.key)).toContain('massing.block');
        expect(masterPlanningTools()).toHaveLength(4);
    });

    it('⛔ re-registering a key REPLACES rather than duplicating — one owner per key', () => {
        const before = masterPlanningTools().length;
        registerSiteworksRailTools(() => ({ bus }) as never);
        expect(masterPlanningTools()).toHaveLength(before);
    });
});

describe('⛔ THE C82 BAR — each entry ACTIVATES and a surface reaches the store', () => {
    it('Road places a LINEAR surface at the CITED default width', async () => {
        expect(store.getState().size).toBe(0);
        byKey('siteworks.road').action();
        await new Promise((r) => setTimeout(r, 0));

        expect(store.getState().size).toBe(1);
        const rec = only();
        expect(rec.role).toBe('road');
        expect(rec.form).toBe('linear');
        // ⭐ The width comes from the CITED record, not from a literal in the UI.
        expect(rec.widthM).toBe(SITEWORKS_DEFAULT_WIDTH_M.road.valueM);
        expect(rec.widthM).toBe(7);
        expect(rec.centreline).toHaveLength(2);
        expect(rec.boundary).toEqual([]);
    });

    it('Parking Area places an AREAL surface', async () => {
        byKey('siteworks.parking').action();
        await new Promise((r) => setTimeout(r, 0));
        const rec = only();
        expect(rec.role).toBe('parking');
        expect(rec.form).toBe('areal');
        expect(rec.boundary).toHaveLength(4);
        expect(rec.centreline).toEqual([]);
    });

    it('Pedestrian Area places an AREAL surface — the founder\'s "similar to slabs"', async () => {
        byKey('siteworks.pedestrian').action();
        await new Promise((r) => setTimeout(r, 0));
        const rec = only();
        expect(rec.role).toBe('pedestrian');
        expect(rec.form).toBe('areal');
    });

    it('⭐ every entry mints a DISTINCT caller-side id (C16 CA-2)', async () => {
        for (const e of masterPlanningTools()) { e.action(); await new Promise((r) => setTimeout(r, 0)); }
        const ids = [...store.getState().keys()];
        expect(ids).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
        for (const i of ids) expect(i).toMatch(/^siteworks_[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('pressing Road twice makes TWO surfaces, not one overwritten', async () => {
        byKey('siteworks.road').action();
        await new Promise((r) => setTimeout(r, 0));
        byKey('siteworks.road').action();
        await new Promise((r) => setTimeout(r, 0));
        expect(store.getState().size).toBe(2);
    });
});

describe('the active level, and §CONTEXT-DATA-HONESTY', () => {
    it('seats the surface on the ACTIVE level when one is resolvable', async () => {
        (window as any).projectContext = { activeLevelId: 'level-3' };
        byKey('siteworks.road').action();
        await new Promise((r) => setTimeout(r, 0));
        expect(only().levelId).toBe('level-3');
    });

    it('⛔ an UNRESOLVED level yields the schema default, never a fabricated id', async () => {
        // "we could not tell which storey is active" and "the ground storey" must not
        // share a value (L-581 / L-616). Inventing 'L0' here would seat a road on a
        // level that may not exist.
        delete (window as any).projectContext;
        byKey('siteworks.road').action();
        await new Promise((r) => setTimeout(r, 0));
        expect(only().levelId).toBe('');
        expect(only().levelId).not.toBe('L0');
    });
});

describe('the bus is missing', () => {
    it('⛔ reports LOUDLY and writes nothing — never a silent dead button (C82)', async () => {
        __resetMasterPlanningToolsForTest();
        registerSiteworksRailTools(() => undefined);
        const warned: unknown[] = [];
        const prev = console.warn;
        console.warn = (...a: unknown[]) => { warned.push(a); };
        try {
            byKey('siteworks.road').action();
            await new Promise((r) => setTimeout(r, 0));
        } finally { console.warn = prev; }
        expect(store.getState().size).toBe(0);
        expect(warned.length).toBeGreaterThan(0);
    });
});
