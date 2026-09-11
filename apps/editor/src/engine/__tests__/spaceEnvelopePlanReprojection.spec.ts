/**
 * §COMMITTED-ENVELOPE-ON-EVERY-VIEW + §PLAN-SYMBOL-ONLY-STOREY (L-13310) — a COMMITTED space
 * envelope reaches the PRYZM PLAN, including on a storey that holds nothing else.
 *
 * Founder, 2026-09-11: *"the envelopes (no matter if created on plan view or 3d view) dont render
 * on plan view - they should!"*
 *
 * TWO ROOT CAUSES (measured, not assumed), both between a correct store and a correct symbol:
 *   1. NOTHING ASKED THE PLAN TO LOOK AGAIN. `ViewDependencyTracker._onStoreEvent` drops any type
 *      outside `GEOMETRY_ELEMENT_TYPES` (no `spaceEnvelope`), the plugin store emits nothing on
 *      `storeEventBus`, and `registerElement` only records id→level — so a WARM plan stayed warm.
 *   2. AND WHEN IT DID LOOK, AN ENVELOPE-ONLY STOREY WAS BLANKED. Every plan driver skipped
 *      `EdgeProjectorService.project()` when models, native groups and IFC/Rhino scene groups were
 *      all empty; an envelope is never a native group (no `elementRegistry` root), so on every
 *      storey *Create all blocks* adds, `project()` — and the injector inside it — never ran.
 *
 * ✅ ESTABLISHES, through a REAL `CommandBus`, the REAL `SpaceEnvelopeStore` + handlers and the REAL
 *    `attachSpaceEnvelopeRender`: (1) a create/delete dirties the storey's PLAN views on the
 *    production path (and only those — no elevation/section sweep), coalescing through a
 *    generation hold; (2) the ONE project-or-blank decision says PROJECT for an envelope-only
 *    storey with zero groups and BLANK again after the delete; (3) what the projection then
 *    injects for that view is the envelope on A-AREA, registered for selection; (4) THE JOIN —
 *    every plan driver asks that decision (the triple-empty guard is gone from all five sites) and
 *    `project()` reaches the injector with no early return in front of it.
 * ⛔ DOES NOT ESTABLISH: that a pixel was stroked — `EdgeProjectorService` needs a WebGL world and
 *    the drivers need a live OBC scene. Links (2)–(4) are the ones that were broken.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/command-bus';
import { attachStores, type Store } from '@pryzm/stores';
import {
    SpaceEnvelopeStore,
    buildSpaceEnvelopeHandlerSet,
    type SpaceEnvelopesState,
} from '@pryzm/plugin-space-envelope';
import {
    lookupElementUUID,
    viewDefinitionStore,
    viewDependencyTracker,
    type ViewDefinition,
} from '@pryzm/core-app-model';
import { attachSpaceEnvelopeRender, type DirtySpaceEnvelopeStore } from '../attachSpaceEnvelopeRender';
import * as planSymbols from '../SpaceEnvelopePlanSymbolBuilder';
import {
    decidePlanProjection,
    hasPlanSymbolOnlyContent,
    type PlanProjectionView,
} from '../views/planProjectionDecision';

const LEVEL = 'level-1';
const ID_A = 'spaceEnvelope_01J0000000000000000000000A';

/** The real bus → store road, exactly as the plugin's own round-trip suite builds it. */
function buildEnv() {
    const spaceEnvelope = new SpaceEnvelopeStore();
    const emitter = new PatchEmitter();
    const undoStack = new UndoStack({ maxSize: 50 });
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack,
        storesProvider: () => ({
            spaceEnvelope: Object.fromEntries(spaceEnvelope.getState()) as SpaceEnvelopesState,
        }),
    });
    for (const h of buildSpaceEnvelopeHandlerSet()) bus.register(h as Parameters<typeof bus.register>[0]);
    const detach = attachStores(emitter, { spaceEnvelope: spaceEnvelope as unknown as Store<object> });
    return { spaceEnvelope, bus, detach };
}

/** A 10 m × 10 m level envelope on LEVEL, named the way Lane C names them. */
function levelSpec(id: string) {
    return {
        spaceEnvelopeId: id,
        levelId: LEVEL,
        role: 'level' as const,
        name: 'ENV_L1_001',
        baseOffset: 0,
        height: 3,
        footprint: [
            { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 },
            { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 },
        ],
    };
}

const storeOf = (s: SpaceEnvelopeStore): DirtySpaceEnvelopeStore => s as unknown as DirtySpaceEnvelopeStore;
const noPlanRequest = (): void => { /* this arm observes something else */ };

describe('§COMMITTED-ENVELOPE-ON-EVERY-VIEW — the plan is asked to re-project', () => {
    it('⭐ PRODUCTION PATH: a real create dirties the storey\'s PLAN views — never an elevation or section', async () => {
        const made = [
            { id: 'vd-l13310-plan-l1', viewType: 'plan', levelId: LEVEL },
            { id: 'vd-l13310-splan-l1', viewType: 'structural-plan', levelId: LEVEL },
            { id: 'vd-l13310-rcp-l1', viewType: 'ceiling-plan', levelId: LEVEL },
            { id: 'vd-l13310-plan-l2', viewType: 'plan', levelId: 'level-2' },
            { id: 'vd-l13310-sect', viewType: 'section', levelId: LEVEL },
            { id: 'vd-l13310-elev', viewType: 'elevation', levelId: null },
        ] as const;
        for (const v of made) {
            viewDefinitionStore.create({
                id: v.id, name: v.id, viewType: v.viewType,
                ...(v.levelId !== null ? { spatial: { levelId: v.levelId } } : {}),
            });
        }
        const dirty = vi.spyOn(viewDependencyTracker, 'markDirty').mockImplementation(() => { /* observe only */ });
        const levels = vi.spyOn(viewDependencyTracker, 'markLevelsDirty').mockImplementation(() => { /* observe only */ });
        const env = buildEnv();
        // No `markPlanLevelsDirty` dep — exactly what `initTools` passes.
        const detachRender = attachSpaceEnvelopeRender({ store: storeOf(env.spaceEnvelope), scene: new THREE.Scene() });
        try {
            expect(dirty).not.toHaveBeenCalled(); // an empty store asks for nothing
            await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
            expect(env.spaceEnvelope.get(ID_A)).toBeDefined();
            const dirtied = new Set(dirty.mock.calls.map((c) => c[0]));
            expect(dirtied.has('vd-l13310-plan-l1')).toBe(true);
            expect(dirtied.has('vd-l13310-splan-l1')).toBe(true);
            // ⛔ Not the views that never draw this family, and not another storey.
            for (const id of ['vd-l13310-rcp-l1', 'vd-l13310-plan-l2', 'vd-l13310-sect', 'vd-l13310-elev']) {
                expect(dirtied.has(id), `${id} was dirtied`).toBe(false);
            }
            // ⛔ And not the level-wide sweep, which coarse-marks EVERY section and elevation.
            expect(levels).not.toHaveBeenCalled();

            const before = dirty.mock.calls.length;
            await env.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ID_A });
            // The removed record's storey is REMEMBERED — it cannot be read back from the store.
            expect(dirty.mock.calls.slice(before).map((c) => c[0])).toContain('vd-l13310-plan-l1');
        } finally {
            detachRender();
            env.detach();
            dirty.mockRestore();
            levels.mockRestore();
            for (const v of made) viewDefinitionStore.delete(v.id);
        }
    });

    it('during a building-generation hold the request goes in as LEVELS, so the hold still coalesces it', async () => {
        viewDefinitionStore.create({ id: 'vd-l13310-hold', name: 'hold', viewType: 'plan', spatial: { levelId: LEVEL } });
        const dirty = vi.spyOn(viewDependencyTracker, 'markDirty').mockImplementation(() => { /* observe only */ });
        const levels = vi.spyOn(viewDependencyTracker, 'markLevelsDirty').mockImplementation(() => { /* observe only */ });
        const env = buildEnv();
        const detachRender = attachSpaceEnvelopeRender({ store: storeOf(env.spaceEnvelope), scene: new THREE.Scene() });
        viewDependencyTracker.beginGenerationHold();
        try {
            await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
            expect(levels.mock.calls.flatMap((c) => c[0])).toContain(LEVEL);
            expect(dirty).not.toHaveBeenCalled(); // a per-view mark would bypass the hold
        } finally {
            // The spy swallowed the levels, so nothing is held and the release flushes nothing.
            viewDependencyTracker.endGenerationHold();
            detachRender();
            env.detach();
            dirty.mockRestore();
            levels.mockRestore();
            viewDefinitionStore.delete('vd-l13310-hold');
        }
    });

    it('create and delete each request the envelope\'s storey; the linework follows the store', async () => {
        const requests: string[][] = [];
        const env = buildEnv();
        const detachRender = attachSpaceEnvelopeRender({
            store: storeOf(env.spaceEnvelope),
            scene: new THREE.Scene(),
            markPlanLevelsDirty: (ids) => { requests.push([...ids]); },
        });
        try {
            await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
            expect(requests.length).toBeGreaterThanOrEqual(1);
            expect(requests.flat()).toContain(LEVEL);

            // ⭐ What the NEXT projection injects for this storey — read live through the reader.
            const plan = planSymbols.spaceEnvelopePlanSymbolBuilder.planLinework(LEVEL);
            expect(plan.readerInstalled).toBe(true);
            const mine = plan.linework.find((l) => l.id === ID_A);
            expect(mine, 'the committed envelope is absent from its storey\'s plan linework').toBeDefined();
            expect(mine!.role).toBe('level');
            // A closed 4-corner ring: four edges × two endpoints × xyz. An open ring would be 18.
            expect(mine!.outline).toHaveLength(24);
            // ⛔ And only on ITS storey — the reader's level filter is what keeps it off the others.
            expect(planSymbols.spaceEnvelopePlanSymbolBuilder.planLinework('level-2').linework).toHaveLength(0);

            const before = requests.length;
            await env.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ID_A });
            expect(env.spaceEnvelope.get(ID_A)).toBeUndefined();
            expect(requests.length).toBeGreaterThan(before);
            expect(requests.slice(before).flat()).toContain(LEVEL);
            expect(planSymbols.spaceEnvelopePlanSymbolBuilder.planLinework(LEVEL).linework
                .find((l) => l.id === ID_A)).toBeUndefined();
        } finally {
            detachRender();
            env.detach();
        }
    });

    it('records already in the store when the reader installs ask for their storey too', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
        const requests: string[][] = [];
        const detachRender = attachSpaceEnvelopeRender({
            store: storeOf(env.spaceEnvelope),
            scene: new THREE.Scene(),
            markPlanLevelsDirty: (ids) => { requests.push([...ids]); },
        });
        try {
            // A plan projected BEFORE the reader existed was drawn by the no-reader stub.
            expect(requests.flat()).toContain(LEVEL);
        } finally {
            detachRender();
            env.detach();
        }
        // ⛔ And the reader goes with the runtime — the next project must not draw these.
        expect(planSymbols.spaceEnvelopePlanSymbolBuilder.planLinework(LEVEL).readerInstalled).toBe(false);
    });
});

describe('§PLAN-SYMBOL-ONLY-STOREY — an envelope-only storey is PROJECTED, not blanked', () => {
    const NONE = { models: 0, nativeGroups: 0, ifcSceneGroups: 0 } as const;
    const view = (viewType: string, levelId: string | null = LEVEL): PlanProjectionView =>
        ({ viewType, spatial: levelId === null ? {} : { levelId } });

    it('⭐ with ZERO models/native/IFC groups, a real create flips the ONE decision to project; a delete flips it back', async () => {
        const env = buildEnv();
        const detachRender = attachSpaceEnvelopeRender({
            store: storeOf(env.spaceEnvelope), scene: new THREE.Scene(), markPlanLevelsDirty: noPlanRequest,
        });
        try {
            // The pre-fix answer for EVERY envelope-only storey — and still right for an empty one.
            expect(decidePlanProjection(view('plan'), NONE)).toBe('blank');

            await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
            expect(hasPlanSymbolOnlyContent(view('plan'))).toBe(true);
            for (const vt of ['plan', 'detail', 'structural-plan']) {
                expect(decidePlanProjection(view(vt), NONE), vt).toBe('project');
            }
            // ⛔ No producer there — a prism seen edge-on in an elevation says nothing.
            for (const vt of ['elevation', 'section', 'ceiling-plan', '3d']) {
                expect(decidePlanProjection(view(vt), NONE), vt).toBe('blank');
            }
            expect(decidePlanProjection(view('plan', 'level-2'), NONE)).toBe('blank');
            expect(decidePlanProjection(view('plan', null), NONE)).toBe('blank');

            await env.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ID_A });
            // The last envelope gone ⇒ the correct content is NOTHING again (the drivers blank it).
            expect(decidePlanProjection(view('plan'), NONE)).toBe('blank');
        } finally {
            detachRender();
            env.detach();
        }
    });

    it('any collected source still projects — the decision only ever ADDS the symbol-only case', () => {
        expect(decidePlanProjection(view('elevation'), { ...NONE, models: 1 })).toBe('project');
        expect(decidePlanProjection(view('plan', 'nowhere'), { ...NONE, nativeGroups: 3 })).toBe('project');
        expect(decidePlanProjection(view('section'), { ...NONE, ifcSceneGroups: 1 })).toBe('project');
    });

    it('with the reader uninstalled (runtime torn down) the storey is blank — never a stale answer', async () => {
        const env = buildEnv();
        const detachRender = attachSpaceEnvelopeRender({
            store: storeOf(env.spaceEnvelope), scene: new THREE.Scene(), markPlanLevelsDirty: noPlanRequest,
        });
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
        expect(decidePlanProjection(view('plan'), NONE)).toBe('project');
        detachRender();
        expect(decidePlanProjection(view('plan'), NONE)).toBe('blank');
        env.detach();
    });

    it('⭐ and what that projection injects for the storey is the committed envelope, on A-AREA, selectable', async () => {
        const env = buildEnv();
        const detachRender = attachSpaceEnvelopeRender({
            store: storeOf(env.spaceEnvelope), scene: new THREE.Scene(), markPlanLevelsDirty: noPlanRequest,
        });
        try {
            await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
            // The three members of `OBC.TechnicalDrawing` that `inject()` touches, and nothing else.
            const layerNames = new Set<string>();
            const added: { ls: THREE.LineSegments; layer: string }[] = [];
            const drawing = {
                three: new THREE.Group(),
                layers: {
                    has: (n: string): boolean => layerNames.has(n),
                    create: (n: string): void => { layerNames.add(n); },
                },
                addProjectionLines: (ls: THREE.LineSegments, layer: string): void => { added.push({ ls, layer }); },
            };
            const planView = { id: 'vd-l13310-inject', viewType: 'plan', spatial: { levelId: LEVEL } } as unknown as ViewDefinition;
            const outcome = planSymbols.spaceEnvelopePlanSymbolBuilder.inject(
                drawing as unknown as Parameters<planSymbols.SpaceEnvelopePlanSymbolBuilder['inject']>[0],
                planView,
            );
            expect(outcome.injected).toBe(1);
            expect(layerNames.has(planSymbols.SPACE_ENVELOPE_LAYER)).toBe(true);
            expect(added).toHaveLength(1); // a LEVEL envelope: outline only, no hatch
            expect(added[0]!.layer).toBe('A-AREA');
            expect(added[0]!.ls.userData['elementUUID']).toBe(ID_A);
            // ⭐ Registered in the selection index — visible AND clickable in plan.
            expect(lookupElementUUID(drawing, added[0]!.ls)).toBe(ID_A);
        } finally {
            detachRender();
            env.detach();
        }
    });
});

// ─── THE JOIN — every plan driver asks the ONE decision (source, comments stripped) ─────────────
const codeOnly = (t: string): string =>
    t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const src = (rel: string): string => codeOnly(readFileSync(resolve(__dirname, rel), 'utf8'));

describe('THE JOIN — the plan drivers ask the ONE decision, and project() reaches the injector', () => {
    // The guard that blanked every envelope-only storey. Any surviving copy re-opens the defect in
    // whichever driver the founder happens to be looking at.
    const OLD_GUARD = /models\.length === 0 && nativeGroups\.length === 0/;
    const drivers = [
        { file: '../initScene.ts', calls: 1 },
        { file: '../views/PlanViewManager.ts', calls: 3 },
        { file: '../ViewController.ts', calls: 1 },
    ] as const;
    for (const d of drivers) {
        it(`${d.file} — the triple-empty guard is gone and the decision is asked ${d.calls}×`, () => {
            const code = src(d.file);
            expect(code).not.toMatch(OLD_GUARD);
            expect(code).toMatch(/import \{ decidePlanProjection \} from '\.\/(views\/)?planProjectionDecision'/);
            expect(code.match(/decidePlanProjection\(viewDef, \{/g)?.length ?? 0).toBe(d.calls);
        });
    }

    it('EdgeProjectorService.project() reaches the space-envelope injector with no early return before it', () => {
        const code = src('../views/EdgeProjectorService.ts');
        const start = code.indexOf('async project(');
        const inject = code.indexOf("if (_symbolGate('spaceEnvelope')) spaceEnvelopePlanSymbolBuilder.inject(drawing, viewDef);");
        expect(start).toBeGreaterThan(-1);
        expect(inject).toBeGreaterThan(start);
        const body = code.slice(start, inject);
        // A method-level return (8-space body indent) would let an empty-input projection skip it.
        expect(body).not.toMatch(/^ {8}return\b/m);
        expect(body).not.toMatch(/^ {8}if \([^\n]*\) return\b/m);
    });
});
