// @vitest-environment happy-dom
//
// §FURNISH-NO-LEVEL-TOUR (L-1395) + §LIGHT-LEVEL-IS-EXPLICIT (L-1394).
//
// ⭐ THE DEFECT: `triggerFurnishAllFloors` assigned `projectContext.activeLevelId`
// once per storey — plus one restore — for a gesture whose per-floor result nobody
// watches. `ProjectContext`'s setter fans out synchronously into a plan-view
// re-activation (full `PlanViewManager.deactivate()` + DOM rebuild + a COLD
// `EdgeProjectorService` pass, seven distinct plan view ids ⇒ seven cold caches),
// FIVE full `scene.traverse` over the model's 6113 meshes from the `view-activated`
// visibility gates, a second `roomTagAutoPopulator.populate()`, and an animated
// camera slide. Eight times.
//
// The line was documented as cosmetic ("so the UI/HUD follows along, but correctness
// does not hinge on it"). That was true of FURNISH and false one stage downstream:
// `LightingLayoutExecutor` read `resolveActiveLevel()` and nothing else, so the
// cosmetic write was silently the ONLY thing telling lighting which floor to light —
// while the driver's `finally` restored the original level underneath lighting's
// pending `setTimeout(0)`.
//
// ⛔ These tests must not assert that a comment exists. Test 1 asserts the WRITE does
// not happen; test 2 asserts the storey still reaches lighting anyway. Neither can
// pass by accident, and test 2 is the one that stops test 1 being a regression.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./FurnishLayoutExecutor.js', () => ({
    FurnishLayoutExecutor: class {
        attach(): void { /* stub */ }
        detach(): void { /* stub */ }
    },
}));
vi.mock('../house-layout/houseFanoutGuard.js', () => ({ isHouseFanoutActive: () => false }));
vi.mock('./furnishScopeModal.js', () => ({ FurnishScopeModal: class { show(): void { /* stub */ } } }));

/** A ProjectContext stand-in that RECORDS every write to `activeLevelId` — the exact
 *  mutation whose fan-out is the cost under test. */
function installProjectContext(initial: string): { writes: string[] } {
    const writes: string[] = [];
    let value = initial;
    const pc = {
        get activeLevelId(): string { return value; },
        set activeLevelId(v: string) { writes.push(v); value = v; },
        levels: [
            { id: 'L0', elevation: 0 },
            { id: 'L1', elevation: 3 },
            { id: 'L2', elevation: 6 },
        ],
    };
    (window as unknown as { projectContext?: unknown }).projectContext = pc;
    (window as unknown as { bimManager?: unknown }).bimManager = undefined;
    (window as unknown as { wallStore?: unknown }).wallStore = undefined;
    return { writes };
}

function makeRuntime() {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    const emitted: Array<{ key: string; payload: unknown }> = [];
    const events = {
        on(k: string, fn: (p: unknown) => void): () => void {
            if (!handlers.has(k)) handlers.set(k, new Set());
            handlers.get(k)!.add(fn);
            return () => handlers.get(k)?.delete(fn);
        },
        emit(k: string, payload: unknown): void {
            emitted.push({ key: k, payload });
            for (const fn of [...(handlers.get(k) ?? [])]) fn(payload);
            // Stand in for FurnishLayoutExecutor: answer every execute with the
            // executed event for that same storey, exactly as the real one does.
            if (k === 'furnish.layout-execute') {
                const levelId = (payload as { levelId?: string } | undefined)?.levelId;
                events.emit('furnish.layout-executed', {
                    levelId, placedCount: 3, roomCount: 2, roomsFurnished: 2,
                    roomsSkipped: 0, skipped: [], validationWarnings: [],
                    outcome: { state: 'completed', placedCount: 3, roomCount: 2 },
                });
            }
        },
    };
    const runtime = { events, bus: { executeCommand: () => undefined } } as unknown as
        import('@pryzm/runtime-composer').PryzmRuntime;
    return { runtime, events, emitted };
}

describe('§FURNISH-NO-LEVEL-TOUR (L-1395)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
        vi.spyOn(console, 'error').mockImplementation(() => { /* quiet */ });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

    it('⭐ furnishing every floor writes projectContext.activeLevelId ZERO times', async () => {
        const { writes } = installProjectContext('L0');
        const { runtime } = makeRuntime();
        vi.resetModules();
        const mod = await import('./furnishLayoutTrigger.js');

        const outcome = await mod.triggerFurnishAllFloors(runtime);

        // The gesture still did its job across all three storeys…
        expect(outcome.status).toBe('covered');
        expect(outcome.status === 'covered' && outcome.summary.floors).toBe(3);
        // …without ONE active-level cascade. Previously: 3 switches + 1 restore.
        expect(writes).toEqual([]);
    });

    it('every storey is still furnished EXPLICITLY (the switch was not carrying the level)', async () => {
        installProjectContext('L0');
        const { runtime, emitted } = makeRuntime();
        vi.resetModules();
        const mod = await import('./furnishLayoutTrigger.js');

        await mod.triggerFurnishAllFloors(runtime);

        const targeted = emitted
            .filter(e => e.key === 'furnish.layout-execute')
            .map(e => (e.payload as { levelId?: string }).levelId);
        expect(targeted).toEqual(['L0', 'L1', 'L2']);
    });

    it('⭐ the furnished storey reaches LIGHTING on the event, not via the active level', async () => {
        // The load-bearing half. `LightingLayoutExecutor` used to recover the storey
        // from `projectContext.activeLevelId`; if the cascade does not carry `levelId`,
        // removing the switch above would light the wrong floor N times.
        installProjectContext('L0');
        const { runtime, events } = makeRuntime();
        vi.resetModules();
        vi.doMock('../lighting-layout/LightingLayoutExecutor.js', () => ({
            LightingLayoutExecutor: class { attach(): void { /* stub */ } detach(): void { /* stub */ } },
        }));
        const lighting = await import('../lighting-layout/lightingLayoutTrigger.js');

        const lit: Array<string | undefined> = [];
        events.on('lighting.layout-execute', (p) => {
            lit.push((p as { levelId?: string } | undefined)?.levelId);
        });
        lighting.installLightingLayoutTrigger(runtime);

        vi.useFakeTimers();
        try {
            events.emit('furnish.layout-executed', {
                levelId: 'L2', placedCount: 5, roomCount: 4,
                outcome: { state: 'completed', placedCount: 5, roomCount: 4 },
            });
            vi.runAllTimers();
        } finally {
            vi.useRealTimers();
        }

        expect(lit).toEqual(['L2']);
    });
});
