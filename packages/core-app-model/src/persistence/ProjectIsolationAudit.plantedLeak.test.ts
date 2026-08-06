// §L-676 / C13 §3.10 — PLANTED-LEAK SUITE for the RUNTIME project-isolation audit.
//
// WHY THIS FILE EXISTS, and why it is not a duplicate of
// `apps/editor/__tests__/siteProjectScopeIsolation.test.ts`.
//
// That suite proves the PURE detector (`detectLeaks`) returns a report when it is
// HANDED a contaminated world. It never exercises the runtime: it never installs
// the audit, never emits `pryzm-project-loaded`, and never touches the gather
// functions that decide WHAT the detector is handed. So it cannot distinguish:
//
//     (a) the audit inspected the world and it was clean, from
//     (b) the audit inspected nothing and therefore found nothing.
//
// (a) and (b) produce the identical value — `null` — and the identical console
// line, `✓ … loaded clean`. That equivalence IS the L-224/L-676 defect: the audit
// was dead for months (listener on the wrong bus) while printing a clean verdict,
// and later was alive but structurally blind to the whole GIS half. Both times a
// green audit was the evidence that nothing was wrong.
//
// The only test that can tell (a) from (b) is one that plants a REAL leak in the
// REAL surfaces the runtime reads (`window.scene`, the fifteen `window.*Store`
// globals, the window singletons, the scope probes), fires the REAL event on the
// REAL bus, and asserts the audit FAILS. If any assertion below can be satisfied
// by an audit that read nothing, the assertion is worthless.
//
// Contract: C13 §3.9 (listeners subscribe on the typed bus that actually emits),
// C13 §3.10 (a switch is a full teardown with named owners; the audit enumerates
// owners and must fail loudly).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeRafAdapter, getFrameScheduler, _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import {
    installProjectIsolationAudit,
    getIsolationLeakHistory,
    registerProjectScopeProbe,
    _resetProjectIsolationAuditForTest,
    _resetProjectScopeProbesForTest,
    type IsolationLeakReport,
} from './ProjectIsolationAudit';

// ── test harness ─────────────────────────────────────────────────────────────

interface FakeBus {
    on(ev: string, cb: (p: unknown) => void): () => void;
    emit(ev: string, p: unknown): void;
}

function makeBus(): FakeBus {
    const handlers = new Map<string, Array<(p: unknown) => void>>();
    return {
        on(ev, cb) {
            const list = handlers.get(ev) ?? [];
            list.push(cb);
            handlers.set(ev, list);
            return () => handlers.set(ev, (handlers.get(ev) ?? []).filter(h => h !== cb));
        },
        emit(ev, p) { for (const h of [...(handlers.get(ev) ?? [])]) h(p); },
    };
}

/** A minimal stand-in for an element store as the audit reads it. */
function fakeStore(ids: string[]): { getAll(): Array<{ id: string }> } {
    return { getAll: () => ids.map(id => ({ id })) };
}

/** A minimal stand-in for a THREE.Scene as the audit reads it. */
function fakeScene(objects: Array<{ name?: string; userData?: Record<string, unknown> }>) {
    return { traverse: (cb: (o: unknown) => void) => { for (const o of objects) cb(o); } };
}

const W = () => globalThis as unknown as Record<string, unknown>;

/** The fifteen store globals the runtime audit reads (AUDITED_STORE_GLOBALS). */
const AUDITED_STORES = [
    'wallStore', 'slabStore', 'columnStore', 'beamStore', 'stairStore',
    'roofStore', 'furnitureStore', 'handrailStore', 'curtainWallStore',
    'plumbingStore', 'ceilingStore', 'floorStore', 'gridStore',
    'doorStore', 'windowStore',
];

/**
 * Expose every audited store on `window`, as a fully-booted app does, so the
 * audit has FULL COVERAGE. Tests that expect a clean verdict must call this:
 * after the §CONTEXT-DATA-HONESTY fix, "I could not read 15 stores" is itself a
 * finding, so a clean verdict is only reachable when the looking really happened.
 */
function plantFullStoreCoverage(overrides: Record<string, string[]> = {}): void {
    for (const s of AUDITED_STORES) W()[s] = fakeStore(overrides[s] ?? []);
}

/** Every window key this suite plants on, so teardown is exhaustive. */
const PLANTED_KEYS = [
    'scene', 'runtime', 'floorPlanUnderlayTool', '_ifcServerUploadIds',
    '__pryzmIsolationLeaks', '__pryzmLoadedProjectExpectation',
    'wallStore', 'slabStore', 'columnStore', 'beamStore', 'stairStore',
    'roofStore', 'furnitureStore', 'handrailStore', 'curtainWallStore',
    'plumbingStore', 'ceilingStore', 'floorStore', 'gridStore',
    'doorStore', 'windowStore',
];

let bus: FakeBus;
let raf: FakeRafAdapter;
let leakEvents: IsolationLeakReport[];
let onLeak: (e: Event) => void;

/**
 * Install the audit and run ONE project load end-to-end, exactly as the app does:
 * emit `pryzm-project-loaded` on the typed bus, then pump the frame scheduler so
 * the deferred audit body actually executes.
 *
 * Returns the report the audit produced, or null when it declared the load clean.
 */
function loadProject(projectId: string, opts: { empty?: boolean } = {}): IsolationLeakReport | null {
    installProjectIsolationAudit();
    bus.emit('pryzm-project-loaded', { projectId, empty: opts.empty ?? false });
    // The audit defers one frame (legitimate on-load geometry mounts first).
    raf.pumpFrames(2);
    const history = getIsolationLeakHistory();
    return history.length > 0 ? history[history.length - 1] : null;
}

/** Publish the loader's expectation, as `ProjectLoader` does on a real load. */
function expectElements(projectId: string, elementIds: string[]): void {
    W().__pryzmLoadedProjectExpectation = { projectId, elementIds };
}

const surfaces = (r: IsolationLeakReport | null): string[] => (r?.findings ?? []).map(f => f.surface);

beforeEach(() => {
    _resetProjectIsolationAuditForTest();
    _resetProjectScopeProbesForTest();
    _resetFrameSchedulerForTest();

    for (const k of PLANTED_KEYS) delete W()[k];

    raf = new FakeRafAdapter();
    getFrameScheduler().start(raf);

    bus = makeBus();
    W().runtime = { events: bus };
    // A clean, FULLY-INSPECTABLE baseline world: an empty scene, all fifteen
    // stores present and empty, no window globals. Individual tests contaminate
    // one surface at a time so each failure names exactly one cause.
    W().scene = fakeScene([]);
    plantFullStoreCoverage();

    leakEvents = [];
    onLeak = (e: Event) => leakEvents.push((e as CustomEvent<IsolationLeakReport>).detail);
    window.addEventListener('pryzm-project-isolation-leak', onLeak);

    vi.spyOn(console, 'error').mockImplementation(() => { /* silence expected violations */ });
    vi.spyOn(console, 'log').mockImplementation(() => { /* silence install chatter */ });
});

afterEach(() => {
    window.removeEventListener('pryzm-project-isolation-leak', onLeak);
    _resetProjectIsolationAuditForTest();
    _resetProjectScopeProbesForTest();
    _resetFrameSchedulerForTest();
    for (const k of PLANTED_KEYS) delete W()[k];
    vi.restoreAllMocks();
});

// ── 0. The harness itself must be able to tell clean from dirty ──────────────

describe('§L-676 — the audit is actually WIRED (C13 §3.9)', () => {
    it('a clean load produces no report and no leak event (the control)', () => {
        expectElements('proj-B', []);
        expect(loadProject('proj-B', { empty: true })).toBeNull();
        expect(leakEvents).toHaveLength(0);
    });

    it('the listener is on the TYPED bus — a window CustomEvent must NOT drive the audit', () => {
        // L-224: `pryzm-project-loaded` is emitted only on `runtime.events`. If a
        // future refactor re-points the audit at `window`, this test still passes
        // while the one below fails — which is the asymmetry that hid the defect.
        installProjectIsolationAudit();
        W().floorPlanUnderlayTool = { leaked: true };
        window.dispatchEvent(new CustomEvent('pryzm-project-loaded', { detail: { projectId: 'proj-B', empty: true } }));
        raf.pumpFrames(2);
        expect(getIsolationLeakHistory()).toHaveLength(0);

        // …and the typed bus DOES drive it, with the same contaminated world.
        bus.emit('pryzm-project-loaded', { projectId: 'proj-B', empty: true });
        raf.pumpFrames(2);
        expect(getIsolationLeakHistory()).toHaveLength(1);
    });
});

// ── 1. PLANTED LEAKS — one per surface the audit claims to cover ─────────────

describe('§L-676 — a DELIBERATELY PLANTED cross-project leak FAILS the audit (C13 §3.10)', () => {
    it('STORE: a wall from Project A surviving into Project B is reported', () => {
        // Project A authored wall_A1. Project B legitimately restored wall_B1.
        // wall_A1 is still in the live store: a textbook cross-project leak.
        W().wallStore = fakeStore(['wall_B1', 'wall_A1_LEAKED']);
        expectElements('proj-B', ['wall_B1']);

        const report = loadProject('proj-B');

        expect(report).not.toBeNull();
        expect(surfaces(report)).toContain('store.foreignElement');
        const detail = report!.findings.find(f => f.surface === 'store.foreignElement')!
            .details as Array<{ store: string; ids: string[] }>;
        expect(detail[0].store).toBe('wallStore');
        expect(detail[0].ids).toEqual(['wall_A1_LEAKED']);
        // …and it reached the app as an event, not just a console line.
        expect(leakEvents).toHaveLength(1);
    });

    it('SCENE: a foreign BIM mesh left in the THREE scene is reported', () => {
        W().scene = fakeScene([
            { name: 'wall_B1', userData: { elementId: 'wall_B1', elementType: 'wall' } },
            { name: 'wall_A9', userData: { elementId: 'wall_A9_LEAKED', elementType: 'wall' } },
        ]);
        expectElements('proj-B', ['wall_B1']);

        const report = loadProject('proj-B');

        expect(surfaces(report)).toContain('scene.foreignElement');
        expect(report!.findings.find(f => f.surface === 'scene.foreignElement')!.details)
            .toEqual(['wall_A9_LEAKED']);
    });

    it('SCENE: an underlay / IFC / DXF import surviving a fresh load is reported', () => {
        W().scene = fakeScene([
            { name: 'FloorPlanUnderlay_A', userData: { isFloorPlanUnderlay: true } },
            { name: 'ifc', userData: { isIfcGroup: true } },
            { name: 'dxf', userData: { dxfId: 'dxf_A' } },
        ]);
        expectElements('proj-B', []);

        const report = loadProject('proj-B', { empty: true });

        expect(surfaces(report)).toEqual(expect.arrayContaining(['scene.underlay', 'scene.ifc', 'scene.dxf']));
    });

    it('GLOBALS: window.floorPlanUnderlayTool / _ifcServerUploadIds surviving is reported', () => {
        W().floorPlanUnderlayTool = { projectId: 'proj-A' };
        W()._ifcServerUploadIds = { 'ifc-1': 'upload-A' };
        expectElements('proj-B', []);

        const report = loadProject('proj-B', { empty: true });

        expect(surfaces(report)).toContain('window.globals');
        expect(report!.findings.find(f => f.surface === 'window.globals')!.count).toBe(2);
    });

    it('SCOPE PROBE: the founder’s GIS case — an empty Project B while a probe still holds A', () => {
        // The exact reproduction: zero elements, zero scene objects, zero globals.
        // Every BIM surface is genuinely clean. Only the probe can see the leak.
        registerProjectScopeProbe({
            scope: 'gis.cesiumViewport',
            owningProjectId: () => 'proj-A',
            describe: () => ({ formaMassingOrigin: { lat: 37.888, lon: -4.779 } }),
        });
        expectElements('proj-B', []);

        const report = loadProject('proj-B', { empty: true });

        expect(surfaces(report)).toContain('scope.foreignProject');
        const d = report!.findings.find(f => f.surface === 'scope.foreignProject')!
            .details as Array<{ scope: string; owningProjectId: string }>;
        expect(d[0]).toMatchObject({ scope: 'gis.cesiumViewport', owningProjectId: 'proj-A' });
    });

    it('SCOPE PROBE: a probe that THROWS is a finding, never a silent pass', () => {
        registerProjectScopeProbe({
            scope: 'gis.broken',
            owningProjectId: () => { throw new Error('viewer destroyed'); },
        });
        expectElements('proj-B', []);

        expect(surfaces(loadProject('proj-B', { empty: true }))).toContain('scope.probeFailed');
    });
});

// ── 2. ZERO FALSE POSITIVES — the other half of a trustworthy audit ──────────

describe('§L-676 — a legitimately-restored project is NOT flagged', () => {
    it('every restored element is in the expectation → clean', () => {
        W().wallStore = fakeStore(['wall_B1', 'wall_B2']);
        W().doorStore = fakeStore(['door_B1']);
        W().scene = fakeScene([{ name: 'w', userData: { elementId: 'wall_B1', elementType: 'wall' } }]);
        registerProjectScopeProbe({ scope: 'gis.cesiumViewport', owningProjectId: () => 'proj-B' });
        expectElements('proj-B', ['wall_B1', 'wall_B2', 'door_B1']);

        expect(loadProject('proj-B')).toBeNull();
    });

    it('a probe holding NOTHING (null) is clean, not a leak', () => {
        registerProjectScopeProbe({ scope: 'gis.cesiumViewport', owningProjectId: () => null });
        expectElements('proj-B', []);
        expect(loadProject('proj-B', { empty: true })).toBeNull();
    });
});

// ── 3. THE HONESTY GATE — "read nothing" must NEVER read as "clean" ──────────
//
// This is the assertion the whole file exists for. Every test above plants a leak
// in a surface the audit CAN see. This block plants a leak in a surface the audit
// CANNOT see, and asserts the audit says so instead of printing ✓.
//
// The failure mode is concrete and live: `gatherStoreElements` walks a hard-coded
// list of fifteen `window.*Store` globals and does `if (!store) continue`. Every
// one of those assignments is marked `// TODO(TASK-08)` in `initTools.ts` /
// `initBuilders.ts` — i.e. they are scheduled for deletion. The day TASK-08 lands,
// the audit silently stops inspecting stores and reports every project clean
// forever, with no test, no CI check and no console line changing.

describe('§CONTEXT-DATA-HONESTY — an audit that could not look must not report clean', () => {
    it('a store the audit cannot reach is reported as COVERAGE LOSS, not as clean', () => {
        // The world is genuinely contaminated — proj-A's wall is live — but the
        // store is not exposed under the name the audit looks for (TASK-08 lands,
        // or a store is renamed). The audit must NOT return "clean".
        expectElements('proj-B', ['wall_B1']);
        // The store is no longer reachable under the name the audit looks for.
        delete W().wallStore;

        const report = loadProject('proj-B');

        expect(report).not.toBeNull();
        expect(surfaces(report)).toContain('audit.coverageLoss');
        const detail = report!.findings.find(f => f.surface === 'audit.coverageLoss')!.details as {
            unreadableStores?: string[];
        };
        expect(detail.unreadableStores).toContain('wallStore');
    });

    it('a missing THREE scene is reported as COVERAGE LOSS, not as clean', () => {
        // Stores stay fully readable (baseline) so ONLY the scene is blind.
        delete W().scene;
        expectElements('proj-B', []);

        const report = loadProject('proj-B', { empty: true });

        expect(surfaces(report)).toContain('audit.coverageLoss');
        expect((report!.findings.find(f => f.surface === 'audit.coverageLoss')!.details as {
            sceneReadable?: boolean;
        }).sceneReadable).toBe(false);
    });

    it('a store whose getAll() THROWS is coverage loss, not a silent skip', () => {
        W().wallStore = { getAll: () => { throw new Error('store disposed'); } };
        expectElements('proj-B', []);

        const report = loadProject('proj-B', { empty: true });

        expect(surfaces(report)).toContain('audit.coverageLoss');
        expect((report!.findings.find(f => f.surface === 'audit.coverageLoss')!.details as {
            unreadableStores?: string[];
        }).unreadableStores).toContain('wallStore');
    });

    it('full coverage + clean world → genuinely clean (coverage loss is not a permanent alarm)', () => {
        // Baseline already grants full coverage; assert the fix did not turn the
        // audit into an always-red alarm, which would be just as uninformative.
        expectElements('proj-B', []);
        expect(loadProject('proj-B', { empty: true })).toBeNull();
    });
});
