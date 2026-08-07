/**
 * @vitest-environment happy-dom
 *
 * §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — LevelPlanViewBinder.
 *
 * `DefaultViewsManager` guarantees a plan view EXISTS per level; this binder is
 * what makes the ACTIVE one follow the ACTIVE level. Everything downstream
 * (NativeElementMeshExporter's export band, EdgeProjectorService.resolveClipRange,
 * the edge projection, ViewTechnicalDrawingCache's key, the plan linework the user
 * SNAPS to via activePlanDrawingRef, and RoomTagAutoPopulator) is already
 * parametric on `viewDef.spatial.levelId`, so pinning WHICH view is mounted pins
 * every one of them.
 *
 * The suite therefore asserts the binder's decisions, not the downstream maths
 * (covered in packages/core-app-model/src/views/__tests__/levelRelativePlanViews.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import {
    initDefaultViewsManager, DEFAULT_PLAN_VIEW_ID, planViewIdForLevel, projectContext,
} from '@pryzm/core-app-model';
import { initLevelPlanViewBinder, __resetLevelPlanViewBinderForTests } from '../src/engine/views/LevelPlanViewBinder';

const GROUND = { id: 'L0', name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
const LEVEL1 = { id: 'level-1786049953381-mz28pv', name: 'Level 1', elevation: 3, height: 3, childrenIds: [] };

interface FakeViewController {
    currentMode: string;
    currentViewDefinitionId: string | null;
    setActiveViewDefinitionId(id: string): void;
    activate(mode: string): Promise<void>;
    activations: Array<{ mode: string; id: string | null }>;
}

function makeViewController(mode: string, viewId: string | null): FakeViewController {
    const vc: FakeViewController = {
        currentMode: mode,
        currentViewDefinitionId: viewId,
        activations: [],
        setActiveViewDefinitionId(id: string) { this.currentViewDefinitionId = id; },
        activate(m: string) {
            this.activations.push({ mode: m, id: this.currentViewDefinitionId });
            return Promise.resolve();
        },
    };
    return vc;
}

let dispose: (() => void) | null = null;

/** Minimal stand-in for the runtime's typed event bus (runtime-composer §14). */
function makeEventsBus(): { emit(e: string, p: unknown): void; on(e: string, h: (p: unknown) => void): () => void } {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    return {
        emit(event, payload) { handlers.get(event)?.forEach(h => h(payload)); },
        on(event, handler) {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(handler);
            return () => { handlers.get(event)?.delete(handler); };
        },
    };
}

function boot(levels = [GROUND, LEVEL1]): void {
    (window as unknown as { bimManager: unknown }).bimManager = {
        getLevels: () => levels,
        getLevelById: (id: string) => levels.find(l => l.id === id),
    };
    (window as unknown as { runtime: unknown }).runtime = { events: makeEventsBus() };
    viewDefinitionStore.reset();
    initDefaultViewsManager();
    __resetLevelPlanViewBinderForTests();
    dispose = initLevelPlanViewBinder();
}

function switchLevel(levelId: string): void {
    projectContext.activeLevelId = levelId; // emits 'activeLevelChanged' on window
}

describe('§FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — LevelPlanViewBinder', () => {
    beforeEach(() => {
        projectContext.activeLevelId = 'L0';
    });

    afterEach(() => {
        dispose?.();
        dispose = null;
        delete (window as unknown as { bimManager?: unknown }).bimManager;
        delete (window as unknown as { viewController?: unknown }).viewController;
        delete (window as unknown as { splitViewManager?: unknown }).splitViewManager;
        delete (window as unknown as { runtime?: unknown }).runtime;
        vi.restoreAllMocks();
    });

    it('switching to Level 1 while in a plan view activates the LEVEL-1 plan view', () => {
        boot();
        const vc = makeViewController('Top', DEFAULT_PLAN_VIEW_ID);
        (window as unknown as { viewController: unknown }).viewController = vc;

        switchLevel(LEVEL1.id);

        expect(vc.currentViewDefinitionId).toBe(planViewIdForLevel(LEVEL1.id));
        expect(vc.activations).toHaveLength(1);
        expect(vc.activations[0]).toEqual({ mode: 'Top', id: planViewIdForLevel(LEVEL1.id) });
        // The founder's defect, negated: the mounted view is no longer the ground plan.
        expect(vc.currentViewDefinitionId).not.toBe(DEFAULT_PLAN_VIEW_ID);
    });

    it('REGRESSION: switching back to Ground restores vd-sys-plan-l0 exactly', () => {
        boot();
        const vc = makeViewController('Top', DEFAULT_PLAN_VIEW_ID);
        (window as unknown as { viewController: unknown }).viewController = vc;

        switchLevel(LEVEL1.id);
        switchLevel(GROUND.id);

        expect(vc.currentViewDefinitionId).toBe(DEFAULT_PLAN_VIEW_ID);
        expect(viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!.spatial?.levelId).toBe('L0');
    });

    it('does NOT hijack the 3D view — a level switch in 3D activates nothing', () => {
        boot();
        const vc = makeViewController('3D', null);
        (window as unknown as { viewController: unknown }).viewController = vc;

        switchLevel(LEVEL1.id);

        expect(vc.activations).toHaveLength(0);
        expect(vc.currentViewDefinitionId).toBeNull();
    });

    it('does NOT hijack an elevation view — only level-scoped views are re-targeted', () => {
        boot();
        const vc = makeViewController('Front', 'vd-sys-elev-north');
        (window as unknown as { viewController: unknown }).viewController = vc;

        switchLevel(LEVEL1.id);

        expect(vc.activations).toHaveLength(0);
        expect(vc.currentViewDefinitionId).toBe('vd-sys-elev-north');
    });

    it('re-targets the split pane when it is showing a plan', () => {
        boot();
        const calls: string[] = [];
        (window as unknown as { splitViewManager: unknown }).splitViewManager = {
            isActive: true,
            activeViewId: DEFAULT_PLAN_VIEW_ID,
            setPlanViewId: (id: string) => calls.push(id),
        };

        switchLevel(LEVEL1.id);

        expect(calls).toEqual([planViewIdForLevel(LEVEL1.id)]);
    });

    it('leaves an inactive split pane alone', () => {
        boot();
        const calls: string[] = [];
        (window as unknown as { splitViewManager: unknown }).splitViewManager = {
            isActive: false,
            activeViewId: DEFAULT_PLAN_VIEW_ID,
            setPlanViewId: (id: string) => calls.push(id),
        };

        switchLevel(LEVEL1.id);

        expect(calls).toEqual([]);
    });

    it('the converse: activating a plan view adopts ITS level as the active level', () => {
        boot();
        expect(projectContext.activeLevelId).toBe('L0');

        window.runtime?.events?.emit('view-selected', { viewId: planViewIdForLevel(LEVEL1.id) });

        expect(projectContext.activeLevelId).toBe(LEVEL1.id);
    });

    it('the two directions do not loop: one level switch produces one activation', () => {
        boot();
        const vc = makeViewController('Top', DEFAULT_PLAN_VIEW_ID);
        (window as unknown as { viewController: unknown }).viewController = vc;
        const spy = vi.spyOn(projectContext, 'activeLevelId', 'set');

        switchLevel(LEVEL1.id);
        // Simulate the activation echo the real ViewController emits.
        window.runtime?.events?.emit('view-selected', { viewId: planViewIdForLevel(LEVEL1.id) });

        expect(vc.activations).toHaveLength(1);
        // The echo is a no-op — the level is already Level 1.
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it('dispose() unbinds — a later level switch does nothing', () => {
        boot();
        const vc = makeViewController('Top', DEFAULT_PLAN_VIEW_ID);
        (window as unknown as { viewController: unknown }).viewController = vc;

        dispose?.();
        dispose = null;
        switchLevel(LEVEL1.id);

        expect(vc.activations).toHaveLength(0);
    });
});
