/**
 * @vitest-environment happy-dom
 */
// ADR-0386 §THE-ARM — THE FOUNDER'S WHOLE GESTURE, MEASURED AT THE LAYER HE EXPERIENCES IT.
//
// ADR-0386 · ADR-0385 · ADR-0383 D1 / D4 · C114 §6a · C16 CA-2 · P1 · P6 ·
// [[committed-is-not-reachable]] · [[lane-must-verify-in-foreground]].
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS FILE EXISTS WHEN THE UNIT SUITES ARE ALREADY GREEN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `envelopeArrayAlongPath.spec.ts` proves what the GENERATOR computes.
// `envelopeArraySpineStroke.spec.ts` proves what the STROKE stores.
// Both are the right way to prove a rule, and neither proves the rule ever RUNS.
//
// [[committed-is-not-reachable]]: four fixes in one session ran nowhere. And tonight a spec in this
// repository measured a SIBLING code path and stayed green while its subject was broken. So this
// file starts at the pointer and ends at the building count:
//
//   1. a runtime obtained the ONE way production does — `composeRuntime()` (P1);
//   2. the REAL master-planning section, mounted from the PRODUCTION factory
//      `defaultMasterPlanSectionDeps(rt)` — so if that factory ever stops handing over the array
//      section's deps, this file goes red rather than the feature going quietly unreachable;
//   3. the prototype perimeter drawn through the REAL arming registry and the REAL
//      `BoundaryPathAuthor`, via a fake of the PORT (never a stub of `armEnvelopeDraw`);
//   4. a CURVING spine stroked through THAT SAME driver under the array intent;
//   5. the array's own **Add … blocks to the roster** button, clicked;
//   6. the master plan's existing **Create all blocks** button, clicked ONCE;
//   7. the answer read out of the REAL bus, the REAL ring buffer and the REAL massing-group
//      projection — the same `buildProjectTreeModel` the inspect tree renders and the same
//      `readBuildingSubstrate` the IFC exporter calls.
//
// ⚠ STUB LEDGER — nothing on the measured path is stubbed. Three declared substitutions:
//   1. `window.bimManager.getLevels()` is a literal. There is no BIM manager in this harness, and
//      the panel reads storeys through it; the SHAPE is exactly what `readLevelCandidates` parses.
//   2. the hierarchy store is a FRESH `HierarchyStore`, injected rather than the singleton, so this
//      file cannot leak projected rows into its neighbours.
//   3. `window.runtime = rt` — the REAL composed handle, assigned the one way production assigns it.
//
// ⚠ WHAT IS NOT PROVEN HERE: that the exported IFC FILE contains N `IfcBuilding` entities. That
// needs `web-ifc` and is measured in
// `packages/file-format/__tests__/massing-group-emits-n-buildings.test.ts`. The two meet on
// `readMassingGroupSubstrate` + `applyMassingGroupProjection`, so there is no unmeasured seam.

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/command-bus';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { HierarchyStore, readBuildingSubstrate } from '@pryzm/core-app-model';
import {
    attachMassingGroupHierarchy,
    type DirtyEnvelopeStore,
} from '../src/engine/attachMassingGroupHierarchy';
import { buildProjectTreeModel } from '../src/ui/inspect/audit/projectTreeModel';
import {
    defaultMasterPlanSectionDeps,
    mountMasterPlanSection,
    MASTER_PLAN_PROFILE_ROW_TESTID,
    MASTER_PLAN_STOREYS_INPUT_TESTID,
    MASTER_PLAN_CREATE_BTN_TESTID,
    type MasterPlanSectionHandle,
} from '../src/ui/site/masterPlanSection';
import {
    MP_ARRAY_SPINE_BTN_TESTID,
    MP_ARRAY_SPACING_TESTID,
    MP_ARRAY_APPLY_BTN_TESTID,
    MP_ARRAY_PREVIEW_TESTID,
    MP_ARRAY_REFUSAL_TESTID,
    MP_ARRAY_ORIENTATION_TESTID,
} from '../src/ui/site/masterPlanArraySection';
import {
    __resetEnvelopeDrawArmingForTests,
    armEnvelopeDraw,
    registerEnvelopeDrawSurface,
} from '../src/ui/site/siteEnvelopeDrawArming';
import { __resetDrawnEnvelopeFootprintForTests, getDrawnEnvelopeProfiles }
    from '../src/ui/site/drawnEnvelopeFootprintState';
import { __resetDrawnArrayPathForTests } from '../src/ui/site/envelopeArrayPathState';
import type { EnvelopeDrawSink, EnvelopeDrawSurface } from '../src/ui/site/envelopeDrawSurface';

const AUDIT = { actorId: 'array-path', projectId: 'array-path', clientId: 'node' } as const;
const BUDGET = 600_000;

/** The storeys every block in a master plan shares — `masterPlanAuthoringPlan` hands one list. */
const LEVELS = [
    { id: 'L1', name: 'Ground', elevation: 0, height: 3 },
    { id: 'L2', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'L3', name: 'Level 2', elevation: 6, height: 3 },
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let rb: RingBufferUndoStack;
let hs: HierarchyStore;
let detach: (() => void) | null = null;
let priorRuntime: unknown;
let priorBim: unknown;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    const w = window as unknown as { runtime?: unknown; bimManager?: unknown };
    priorRuntime = w.runtime;
    priorBim = w.bimManager;
    w.runtime = rt;
    w.bimManager = { getLevels: () => LEVELS.map((l) => ({ ...l })) };
    rb = new RingBufferUndoStack();
    rt.bus.setRingBuffer(rb);
}, BUDGET);

afterAll(() => {
    try { detach?.(); } catch { /* non-fatal */ }
    const w = window as unknown as { runtime?: unknown; bimManager?: unknown };
    w.runtime = priorRuntime;
    w.bimManager = priorBim;
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

function envelopeStore(): DirtyEnvelopeStore {
    const s = (rt.stores as Record<string, unknown>)['spaceEnvelope'];
    if (s === undefined) {
        throw new Error(
            '[test] runtime.stores.spaceEnvelope is undefined on the REAL composed runtime — the '
            + 'array would have nothing to create into.',
        );
    }
    return s as DirtyEnvelopeStore;
}

function wipe(): void {
    const store = envelopeStore() as unknown as {
        getState(): ReadonlyMap<string, unknown>;
        applyPatch(p: unknown[]): unknown;
    };
    const ids = [...store.getState().keys()];
    if (ids.length > 0) store.applyPatch(ids.map((id) => ({ op: 'remove', path: [id] })));
    rb.clear();
}

function treeBuildings() {
    return buildProjectTreeModel(LEVELS.map((l) => l.id), '', readBuildingSubstrate(hs)).buildings;
}

// ── the surface: a fake of the PORT, so the gesture runs the production driver ───────────────

let sink: EnvelopeDrawSink | null = null;
let unregister: (() => void) | null = null;

function registerSurface(): void {
    const surface: EnvelopeDrawSurface = {
        surfaceId: 'site-map-2d',
        groundPointFromPointer: (x, z) => ({ x, z }),
        drawPreview: () => {},
        clearPreview: () => {},
        drawSettledRing: () => {},
        clearSettledRing: () => {},
        arm: (s) => { sink = s; return true; },
        disarm: () => { sink = null; },
    };
    unregister = registerEnvelopeDrawSurface(surface);
}

const click = (x: number, z: number): void => {
    expect(sink, 'no surface is armed — the gesture never reached the port').not.toBeNull();
    sink!.onPoint({ x, z });
};
const finishStroke = (): void => { sink!.onFinish(); };

// ── the panel ────────────────────────────────────────────────────────────────────────────────

let host: HTMLElement;
let section: MasterPlanSectionHandle | null = null;

const q = (testid: string): HTMLElement | null =>
    host.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
const press = (testid: string): void => {
    const el = q(testid);
    expect(el, `the control "${testid}" does not exist`).not.toBeNull();
    (el as HTMLButtonElement).click();
};
const typeInto = (testid: string, v: string): void => {
    const el = q(testid) as HTMLInputElement | null;
    expect(el, `the field "${testid}" does not exist`).not.toBeNull();
    el!.value = v;
    el!.dispatchEvent(new Event('input'));
};

beforeEach(() => {
    __resetDrawnEnvelopeFootprintForTests();
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnArrayPathForTests();
    sink = null;
    hs = new HierarchyStore();
    detach?.();
    detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
    wipe();
    registerSurface();
    host = document.createElement('div');
    document.body.appendChild(host);
    // ⭐ THE PRODUCTION FACTORY, not a hand-built deps object. If `defaultMasterPlanSectionDeps`
    // ever stops supplying `arrayDeps`, the array controls below stop existing and this file goes
    // red — which is the [[authored-but-unwired-is-the-bottleneck]] arm.
    section = mountMasterPlanSection(host, defaultMasterPlanSectionDeps(rt));
});

afterEach(() => {
    try { section?.dispose(); } catch { /* teardown */ }
    section = null;
    host.remove();
    try { unregister?.(); } catch { /* teardown */ }
    unregister = null;
    __resetDrawnEnvelopeFootprintForTests();
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnArrayPathForTests();
});

/** Draw the prototype: a 10 × 10 m square whose ring centre is (5, 5). */
function drawPrototype(): void {
    armEnvelopeDraw();
    click(0, 0); click(10, 0); click(10, 10); click(0, 10);
    finishStroke();
    expect(getDrawnEnvelopeProfiles(), 'the prototype must be on the roster').toHaveLength(1);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ARM THAT MATTERS
// ═════════════════════════════════════════════════════════════════════════════════════════════

describe('ADR-0386 — a curving spine at 10 m becomes N independent buildings under ONE Ctrl+Z', () => {
    it('⭐⭐ prototype + curved spine + 10 m -> 6 profiles -> ONE create -> 6 IfcBuilding, undoCount 1', async () => {
        drawPrototype();

        // ── THE SPINE, stroked through the SAME driver under the array intent. An L from the
        // prototype's centre: 30 m east, then 30 m north. 60 m of ARC — a tool measuring chord
        // distance would place the later blocks somewhere else entirely.
        press(MP_ARRAY_SPINE_BTN_TESTID);
        click(5, 5); click(35, 5); click(35, 35);
        finishStroke();

        typeInto(MP_ARRAY_SPACING_TESTID, '10');

        // The preview states the answer BEFORE anything is added, and discloses the orientation
        // choice because this spine really does bend.
        const preview = q(MP_ARRAY_PREVIEW_TESTID);
        expect(preview?.textContent).toContain('6 more blocks at 10 m centre to centre');
        expect(preview?.textContent).toContain('7 in total with the first envelope');
        expect(q(MP_ARRAY_ORIENTATION_TESTID)?.hidden,
            'the spine bends, so the orientation choice must be on screen').toBe(false);

        // ── ADD. Profiles only — nothing is dispatched by this press.
        press(MP_ARRAY_APPLY_BTN_TESTID);
        expect(rb.undoCount(), 'adding profiles must cost NO Ctrl+Z — nothing was created').toBe(0);
        expect(envelopeStore().getState().size, 'and nothing reached the store').toBe(0);

        const profiles = getDrawnEnvelopeProfiles();
        expect(profiles, 'the prototype plus six copies').toHaveLength(7);

        // ⭐ AT THE RIGHT ARC POSITIONS. Centre of copy k is k × 10 m along the L from (5,5):
        // three along the east leg, three up the north leg.
        const centre = (ring: readonly { x: number; z: number }[]) => ({
            x: ring.reduce((t, p) => t + p.x, 0) / ring.length,
            z: ring.reduce((t, p) => t + p.z, 0) / ring.length,
        });
        const want = [
            { x: 15, z: 5 }, { x: 25, z: 5 }, { x: 35, z: 5 },
            { x: 35, z: 15 }, { x: 35, z: 25 }, { x: 35, z: 35 },
        ];
        for (const [i, w] of want.entries()) {
            const got = centre(profiles[i + 1]!.footprint.ring);
            expect(got.x, `copy ${i + 1} x`).toBeCloseTo(w.x, 6);
            expect(got.z, `copy ${i + 1} z`).toBeCloseTo(w.z, 6);
        }
        // …and every copy carries the prototype's own area figure, not a re-derived one.
        expect(profiles.every((p) => p.footprint.areaM2 === profiles[0]!.footprint.areaM2)).toBe(true);

        // ── THE FOUNDER'S LAST TWO ACTIONS: pick the levels, press Create ONCE.
        typeInto(MASTER_PLAN_STOREYS_INPUT_TESTID, '3');
        expect(host.querySelectorAll(`[data-testid="${MASTER_PLAN_PROFILE_ROW_TESTID}"]`))
            .toHaveLength(7);
        press(MASTER_PLAN_CREATE_BTN_TESTID);

        // `dispatch` does not await the bus, so let the executed command settle.
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));

        // ── ⭐ THE ANSWER. 7 blocks × 3 storeys = 21 envelopes, from ONE command.
        expect(envelopeStore().getState().size, '7 blocks × 3 storeys').toBe(21);
        expect(rb.undoCount(),
            '⭐ a seven-block array costs ONE Ctrl+Z — C114 §6a, one gesture one produceCommand')
            .toBe(1);

        const buildings = treeBuildings();
        expect(buildings, '⭐ seven INDEPENDENT buildings, which is the founder\'s "independent '
            + 'building IFC units"').toHaveLength(7);
        for (const b of buildings) {
            expect(b.kind, 'a projected building is CARRIED, never the derived fallback').toBe('carried');
            expect(b.levels.map((l) => l.levelId)).toEqual(['L1', 'L2', 'L3']);
        }
        expect(new Set(buildings.map((b) => b.buildingId)).size,
            'seven DISTINCT buildings, not one building named seven times').toBe(7);
        expect(hs.getBuildings()).toHaveLength(7);
        expect(hs.getLevels(), '7 blocks × 3 storeys').toHaveLength(21);
        expect(hs.getSites()).toHaveLength(1);
    }, BUDGET);

    it('⭐ hides the orientation choice on a STRAIGHT spine, where it would be a false choice', () => {
        drawPrototype();
        press(MP_ARRAY_SPINE_BTN_TESTID);
        click(5, 5); click(55, 5);
        finishStroke();
        typeInto(MP_ARRAY_SPACING_TESTID, '10');

        expect(q(MP_ARRAY_PREVIEW_TESTID)?.textContent).toContain('5 more blocks');
        expect(q(MP_ARRAY_ORIENTATION_TESTID)?.hidden,
            'a straight spine makes the two options the same drawing, so the control must be hidden')
            .toBe(true);
    }, BUDGET);

    it('⭐ states the leftover instead of squeezing a copy in — ADR-0386 D4', () => {
        drawPrototype();
        press(MP_ARRAY_SPINE_BTN_TESTID);
        click(5, 5); click(50, 5);           // 45 m
        finishStroke();
        typeInto(MP_ARRAY_SPACING_TESTID, '10');

        const text = q(MP_ARRAY_PREVIEW_TESTID)?.textContent ?? '';
        expect(text).toContain('4 more blocks');
        expect(text).toContain('5 m of spine is left over');
        press(MP_ARRAY_APPLY_BTN_TESTID);
        expect(getDrawnEnvelopeProfiles()).toHaveLength(5);   // prototype + 4
    }, BUDGET);

    it('⛔ refuses a spacing longer than the spine, with BOTH numbers, and creates nothing', () => {
        drawPrototype();
        press(MP_ARRAY_SPINE_BTN_TESTID);
        click(5, 5); click(35, 5);           // 30 m
        finishStroke();
        typeInto(MP_ARRAY_SPACING_TESTID, '50');

        // ⛔ THE REFUSAL HAS ITS OWN NODE, and this arm is why: the first draft renamed the
        // preview node's `data-testid` on a refusal, so a reader querying the preview got '' on
        // exactly the states that carry the numbers. Both nodes now exist for the life of the
        // section and one is hidden at a time.
        expect(q(MP_ARRAY_PREVIEW_TESTID)?.hidden, 'the plan line stands down for a refusal')
            .toBe(true);
        const text = q(MP_ARRAY_REFUSAL_TESTID)?.textContent ?? '';
        expect(text).toContain('30 m long');
        expect(text).toContain('50 m');
        press(MP_ARRAY_APPLY_BTN_TESTID);
        expect(getDrawnEnvelopeProfiles(), 'the roster is untouched').toHaveLength(1);
        expect(rb.undoCount()).toBe(0);
    }, BUDGET);

    it('⛔ the array never dispatches — the ONE create stays the only mutation path (P6)', () => {
        drawPrototype();
        press(MP_ARRAY_SPINE_BTN_TESTID);
        click(5, 5); click(45, 5);
        finishStroke();
        typeInto(MP_ARRAY_SPACING_TESTID, '10');
        press(MP_ARRAY_APPLY_BTN_TESTID);

        expect(getDrawnEnvelopeProfiles()).toHaveLength(5);
        expect(envelopeStore().getState().size, 'the array wrote NOTHING to the store').toBe(0);
        expect(rb.undoCount(), 'and cost no undo entry').toBe(0);
    }, BUDGET);
});
