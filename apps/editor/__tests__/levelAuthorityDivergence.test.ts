// @vitest-environment happy-dom
//
// MT-07 / ADR-0327 — the level-authority divergence, pinned at the layer the
// user experiences (the Inspect panel's rendered Model Tree DOM).
//
// WHAT THIS PINS, AND WHY IT IS NOT THE PHANTOM
//
// ADR-0327 sorted the "rival level records" into two real authorities
// (`hierarchyStore`, `BimKernel`), one phantom (`window.levelStore` — DECLARED
// on the window, never assigned, six dead reads, deleted at 31346724), and two
// miscounted non-rivals. This suite is about a SIXTH record that census names
// as a non-rival and does not follow to its consumers:
//
//   `packages/stores/src/LevelStore.ts`, the C20 level ENTITY store.
//
// It is not a phantom. It is CONSTRUCTED in production —
// `composeRuntime.ts:1028` `new LevelStore()`, published as
// `runtime.levelStore` (`runtime-composer/src/types.ts:3783`), disposed at
// `composeRuntime.ts:1707`. It is typed, and `packages/stores/__tests__/
// level-commands.test.ts` exercises it green. And it is **permanently EMPTY in
// production**, because its only writers are the four aggregate commands
// `levelCreate` / `levelUpdate` / `levelSetActive` / `levelDelete`, and those
// have ZERO production callers — measured repo-wide, they are reachable only
// from `packages/stores/src/index.ts` re-exports and four test files.
//
// Two production surfaces read it as their level authority:
//   · `apps/editor/src/ui/inspect/ModelTree.ts:434`            (Inspect tree)
//   · `apps/editor/src/ui/inspect/buildModelElementLocations.ts:119`
//     (the `ElementLocation` projection that feeds `buildIsolationIntent`,
//      and — via `livingGraphSelection.ts` — room→element resolution)
//
// Meanwhile the LIVE authority always has at least one level: `BimManager`'s
// constructor seeds `{ id: 'L0', name: 'Ground', elevation: 0 }` at
// `packages/core-app-model/src/BimKernel.ts:166`, and `window.bimManager` is
// assigned at `apps/editor/src/engine/initScene.ts:757`.
//
// So the two records DISAGREE in every production session, and the user-facing
// tree reads the empty one. `modelTree.test.ts` never caught it because its
// harness hand-stubs `levelStore: { list: () => opts.levels }` — a shape
// production never produces. That is the same "a suite passes green over a
// branch that cannot execute in production" defect ADR-0327 found at the
// phantom, in a second place.
//
// Every assertion below runs against the REAL `@pryzm/stores` LevelStore, in
// exactly the state `composeRuntime` leaves it in.

import { describe, it, expect, beforeEach } from 'vitest';
import { LevelStore } from '@pryzm/stores';
import { ModelTreeComponent, type ModelTreeRuntime } from '../src/ui/inspect/ModelTree.js';
import { buildModelElementLocations } from '../src/ui/inspect/buildModelElementLocations.js';

/** The L0 level `BimManager`'s constructor seeds — BimKernel.ts:166, verbatim. */
const SEEDED_GROUND = { id: 'L0', name: 'Ground', elevation: 0, childrenIds: [] as string[] };

/** `window.bimManager` as `initScene.ts:757` publishes it, narrowed to the
 *  level API ADR-0327 §Decision 2 names as the live authority. */
function installLiveAuthority(levels: ReadonlyArray<typeof SEEDED_GROUND> = [SEEDED_GROUND]): void {
    (globalThis as unknown as { window: Record<string, unknown> }).window['bimManager'] = {
        getLevels: () => [...levels],
        getLevelById: (id: string) => levels.find((l) => l.id === id),
    };
}

function clearLiveAuthority(): void {
    delete (globalThis as unknown as { window: Record<string, unknown> }).window['bimManager'];
}

/** The runtime shape `composeRuntime` actually produces: a REAL, unwritten
 *  `@pryzm/stores` LevelStore in the `levelStore` slot. */
function productionShapedRuntime(): ModelTreeRuntime & { levelStore: LevelStore } {
    return {
        projectContext: { projectName: 'Test Project', projectId: 'proj-1' },
        bus: { registry: new Map<string, unknown>(), dispatch: () => undefined },
        levelStore: new LevelStore(),
        roomStore: { getAll: () => [] },
    } as unknown as ModelTreeRuntime & { levelStore: LevelStore };
}

function makeContainer(): HTMLElement {
    const c = document.createElement('div');
    document.body.appendChild(c);
    return c;
}

/** Mount the tree and expand the synthetic building so level children render.
 *  Mirrors `modelTree.test.ts`'s own expansion step. */
function mountAndExpand(runtime: ModelTreeRuntime): HTMLElement {
    const container = makeContainer();
    new ModelTreeComponent(runtime, container).mount();
    const synth = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="building"]');
    const toggle = synth?.querySelector('[data-role="toggle"]') as HTMLElement | null;
    toggle?.click();
    return container;
}

beforeEach(() => {
    document.body.replaceChildren();
    clearLiveAuthority();
});

describe('MT-07 · the C20 LevelStore is constructed, read, and permanently empty', () => {
    it('the LevelStore composeRuntime builds lists ZERO levels, and nothing in production can change that', () => {
        // Exactly `composeRuntime.ts:1028`. No production code path writes it:
        // `add`/`update`/`remove` are called only from the four aggregate
        // commands, whose only non-test callers are index.ts re-exports.
        const store = new LevelStore();
        expect(store.size()).toBe(0);
        expect(store.list()).toEqual([]);
    });

    it('the live authority reports a level in the same session — the two records DISAGREE', () => {
        installLiveAuthority();
        const runtime = productionShapedRuntime();

        const live = (window as unknown as { bimManager: { getLevels(): unknown[] } }).bimManager.getLevels();
        expect(live.length).toBe(1);            // BimKernel.ts:166 seeds Ground
        expect(runtime.levelStore.size()).toBe(0);  // …and the store the tree reads is empty
    });
});

describe('MT-07 · what the divergence costs the user', () => {
    it('the Inspect Model Tree renders ZERO level rows even though the live authority has one', () => {
        installLiveAuthority();
        const container = mountAndExpand(productionShapedRuntime());

        const levelNodes = container.querySelectorAll('li.pmt-node[data-kind="level"]');
        // PIN — the tree's level tier is empty in every production session.
        expect(levelNodes.length).toBe(0);
    });

    it('buildModelElementLocations emits ZERO kind:"level" locations, so isolation has no level tier', () => {
        installLiveAuthority();
        const locations = buildModelElementLocations(productionShapedRuntime());

        const levels = locations.filter((l) => l.kind === 'level');
        // PIN — `buildIsolationIntent` can never resolve a level scope, and
        // rooms fall back to `firstLevelId === undefined`.
        expect(levels.length).toBe(0);
        // The project + synthetic building tiers DO render, which is why this
        // reads as "a model with no floors" rather than as a broken panel.
        expect(locations.some((l) => l.kind === 'project')).toBe(true);
        expect(locations.some((l) => l.kind === 'building')).toBe(true);
    });
});
