/**
 * §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) / ADR-0098 — plan-view stair creation.
 *
 * THE REGRESSION GUARD L-217 LACKED. L-217 was closed on routing evidence — which
 * handler runs — without ever driving the tool to a CREATED STAIR. These specs drive
 * the real `StairPathPlanToolHandler` (the handler the ribbon actually reaches in plan
 * view) end-to-end and assert a stair is COMMITTED.
 *
 * P0 evidence before the fix, on a fresh single-level project:
 *     executeCalls=0
 *     warns=["[StairPathToolController] Cannot finish: invalid — Riser too small (0 mm — min 100 mm)"]
 * The old `_resolveAdjacentLevel` returned `top = base` when no level sat above, giving a
 * ZERO floor-to-floor height; the solver rejected the stair; `_finish()` bailed with a bare
 * console.warn. No stair, no message. That silence was the founder's bug.
 *
 * Covers:
 *   (i)   a stair CAN be created in a FRESH SINGLE-LEVEL project  — the founder's scenario
 *   (ii)  plan-created and 3D-created stairs of the same config produce IDENTICAL records
 *   (iii) riserHeight × riserCount === height on every path
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StairPathPlanToolHandler } from '../StairPathPlanToolHandler';
import { StairPlanToolHandler } from '../StairPlanToolHandler';
import {
    setStairToolConfig,
    resetStairToolConfig,
    resolveStairVerticalSpan,
    deriveRisers,
} from '@pryzm/geometry-stair';

type Level = { id: string; name: string; elevation: number; height?: number };

// happy-dom ships no Canvas2D — stub a no-op context so the real chain can run.
const ctx2d: Record<string, unknown> = new Proxy({}, {
    get: (_t, prop) => {
        if (prop === 'canvas') return undefined;
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop: () => {} });
        }
        return () => {};
    },
    set: () => true,
});
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: unknown } } })
    .HTMLCanvasElement.prototype.getContext = () => ctx2d;

const win = () => (globalThis as unknown as { window: Record<string, unknown> }).window;

function makeCtx(levelId: string, extra: Record<string, unknown> = {}) {
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = 800; baseCanvas.height = 600;
    document.body.appendChild(baseCanvas);
    const overlayCanvas = document.createElement('canvas');
    return {
        overlayCanvas,
        baseCanvas,
        ctx: overlayCanvas.getContext('2d') as CanvasRenderingContext2D,
        planCanvas: {
            worldToScreen: (x: number, z: number) => ({ sx: 400 + x * 20, sy: 300 + z * 20 }),
            getPixelsPerUnit: () => 20,
        } as never,
        interaction: {} as never,
        viewDef: { id: 'v1', spatial: { levelId } } as never,
        dpr: 1,
        viewPlane: { isVertical: false } as never,
        ...extra,
    };
}

/**
 * A CommandManager stand-in whose level store MUTATES when AddLevelCommand runs —
 * so the "implied level above" path (ADR-0098) is exercised for real, not stubbed.
 */
function makeCm(levels: Level[]) {
    const store = [...levels];
    const executed: unknown[] = [];
    const cm = {
        execute: (cmd: unknown) => {
            executed.push(cmd);
            const payload = (cmd as { payload?: Level })?.payload;
            const type = (cmd as { type?: string })?.type;
            if (payload && String(type ?? '').toUpperCase().includes('LEVEL')) {
                store.push({
                    id: payload.id,
                    name: payload.name,
                    elevation: Number(payload.elevation ?? 0),
                });
            }
        },
        context: { stores: { wallStore: { getLevels: () => store } } },
    };
    return { cm, executed, store };
}

/** Extract the CreateStairInput from a captured CreateStairCommand. */
function inputOf(cmd: unknown): Record<string, unknown> {
    const c = cmd as { input?: Record<string, unknown> };
    return c.input ?? {};
}

/** Total risers across all flights. */
function totalRisers(input: Record<string, unknown>): number {
    const flights = (input.flights ?? []) as Array<{ riserCount: number }>;
    return flights.reduce((s, f) => s + f.riserCount, 0);
}

describe('L-243 — plan-view stair creation (ADR-0098)', () => {
    /** Every console.warn the tool emitted during a test — the refusal channel. */
    const warnings: string[] = [];

    let pathHandler: StairPathPlanToolHandler | null = null;

    beforeEach(() => {
        resetStairToolConfig();
        win().runtime = { events: { emit: vi.fn(), on: vi.fn() } };
        // Captured, not discarded: the refusal arm below asserts on the sentence the
        // tool prints when it declines to commit. A no-op spy would have made the
        // only evidence of a correct refusal unreadable.
        warnings.length = 0;
        vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
            warnings.push(a.map(String).join(' '));
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        pathHandler?.deactivate();
        pathHandler = null;
        resetStairToolConfig();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    /**
     * Drive the stair-path plan tool: two clicks on a straight run.
     *
     * `runLength` must give the solver a tread depth ≥ 220 mm (its MIN_TREAD) for the
     * rise being climbed — otherwise it legitimately rejects the stair as "Run too
     * short". 6 m comfortably clears a 3.0–3.3 m storey.
     */
    function drawStraightStair(cm: unknown, levelId = 'L0', runLength = 6) {
        const h = new StairPathPlanToolHandler();
        pathHandler = h;
        h.activate(makeCtx(levelId, { commandManager: cm }) as never);
        h.onClick({ worldX: 0, worldZ: 0 } as never);
        h.onMouseMove({ worldX: 0, worldZ: runLength } as never);
        h.onClick({ worldX: 0, worldZ: runLength } as never);
        return new Promise<void>(r => setTimeout(r, 20));   // auto-finish is setTimeout(0)
    }

    // ── (i) THE FOUNDER'S SCENARIO ────────────────────────────────────────────
    it('creates a stair in a FRESH SINGLE-LEVEL project (the L-217 regression guard)', async () => {
        const { cm, executed, store } = makeCm([{ id: 'L0', name: 'Ground', elevation: 0 }]);

        await drawStraightStair(cm);

        // The stair IMPLIED the level above, created it with AddLevelCommand (P6) ...
        expect(store.length).toBe(2);
        // ... and then committed the stair. Before the fix this was ZERO commands.
        const stairCmds = executed.filter(c => (c as { input?: unknown }).input !== undefined);
        expect(stairCmds.length).toBe(1);

        const input = inputOf(stairCmds[0]);
        expect(input.baseLevelId).toBe('L0');
        expect(input.topLevelId).toBe(store[1].id);
        expect(input.topLevelId).not.toBe(input.baseLevelId);   // the old zero-span lie
        expect(String(input.topLevelId)).not.toContain(':top'); // the old fabricated-id lie
    });

    it('surfaces a real top level that EXISTS in the store (CreateStairCommand.canExecute would reject otherwise)', async () => {
        const { cm, executed, store } = makeCm([{ id: 'L0', name: 'Ground', elevation: 0 }]);
        await drawStraightStair(cm);

        const input = inputOf(executed.filter(c => (c as { input?: unknown }).input !== undefined)[0]);
        expect(store.some(l => l.id === input.topLevelId)).toBe(true);
    });

    it('drawing on the TOPMOST level of a 2-level project also works (the gate that was too weak)', async () => {
        const { cm, executed, store } = makeCm([
            { id: 'L0', name: 'Ground',  elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
        ]);

        await drawStraightStair(cm, 'L1');   // base = the TOP level

        expect(store.length).toBe(3);        // a storey was implied above L1
        const stairCmds = executed.filter(c => (c as { input?: unknown }).input !== undefined);
        expect(stairCmds.length).toBe(1);
        expect(inputOf(stairCmds[0]).baseLevelId).toBe('L1');
    });

    it('an existing level above is USED, not duplicated', async () => {
        const { cm, executed, store } = makeCm([
            { id: 'L0', name: 'Ground',  elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
        ]);

        await drawStraightStair(cm, 'L0');

        expect(store.length).toBe(2);   // nothing implied
        const input = inputOf(executed.filter(c => (c as { input?: unknown }).input !== undefined)[0]);
        expect(input.topLevelId).toBe('L1');
    });

    // ── (iii) THE INVARIANT, ON EVERY PATH ───────────────────────────────────
    it('riserHeight × riserCount === height on the committed stair (single-level project)', async () => {
        const { cm, executed, store } = makeCm([{ id: 'L0', name: 'Ground', elevation: 0 }]);
        await drawStraightStair(cm);

        const input = inputOf(executed.filter(c => (c as { input?: unknown }).input !== undefined)[0]);
        const height = Number(store[1].elevation) - 0;
        const product = Number(input.riserHeight) * totalRisers(input);

        // CreateStairCommand.canExecute enforces this to within HEIGHT_TOLERANCE (50 mm).
        expect(Math.abs(product - height)).toBeLessThan(0.05);
    });

    it('riserHeight × riserCount === height on a 2-level project', async () => {
        // ⚠ THIS STOREY WAS 3.3 m AND THE TEST WAS WRONG, NOT THE PRODUCT. MEASURED
        // with the console left readable: the tool refuses, by name —
        //
        //   "Run 1 climbs 3.30 m in one flight (19 risers), above the maximum 3.04 m
        //    without a landing — add a landing to split it, or reduce the levels this
        //    stair spans"
        //
        // `maxFlightRise` is 3.04 m, DERIVED (StairGeometryLimits.ts §maxFlightRise)
        // as `MAX_RISERS_PER_FLIGHT × MAX_RISER_HEIGHT` = 16 × 0.190, so that
        // enforcing it can never refuse a stair the previously-unread riser COUNT
        // would have allowed. A 3.3 m storey genuinely needs a landing, and this test
        // was demanding that a single straight flight commit one that does not.
        //
        // ⛔ SO THE FIXTURE MOVED, NOT THE RULE. The subject here is the riser
        // invariant `riserHeight × riserCount === height`, not the number 3.3 — and
        // a fixture the product must legally refuse cannot exercise an invariant
        // about what it commits. The refused case is not discarded either: it is
        // asserted directly below, so the landing rule is PINNED rather than dodged.
        const { cm, executed } = makeCm([
            { id: 'L0', name: 'Ground',  elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
        ]);
        await drawStraightStair(cm, 'L0');

        const input = inputOf(executed.filter(c => (c as { input?: unknown }).input !== undefined)[0]);
        const product = Number(input.riserHeight) * totalRisers(input);
        expect(Math.abs(product - 3)).toBeLessThan(0.05);
    });

    // ── (iv) THE LANDING RULE, PINNED WHERE IT WAS FOUND ─────────────────────
    //
    // §STAIR-ONE-LIMIT-AUTHORITY / L-1433..L-1435 gave the tool a real
    // `maxFlightRise`, and the arm above discovered it the expensive way — as a
    // silent non-commit that read as "the stair pipeline is broken". It is not
    // broken; it is refusing correctly. This arm makes that a stated behaviour, so
    // the next reader meets an assertion instead of an absence.
    //
    // The founder's standing direction on rule gates is that a refusal must state
    // the value FOUND *and* the value REQUIRED. Both numbers are asserted.
    it('a storey too tall for ONE flight is REFUSED with both numbers, not silently dropped', async () => {
        const { cm, executed } = makeCm([
            { id: 'L0', name: 'Ground',  elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3.3 },   // > maxFlightRise 3.04 m
        ]);
        await drawStraightStair(cm, 'L0');

        // Nothing was committed — and that is the CORRECT outcome, not a failure.
        expect(executed.filter(c => (c as { input?: unknown }).input !== undefined)).toHaveLength(0);

        const said = warnings.join(' | ');
        expect(said, 'the refusal was silent — a stair that does not happen must say so').toContain('Cannot finish');
        expect(said, 'the refusal does not state the rise FOUND').toContain('3.30 m');
        expect(said, 'the refusal does not state the maximum REQUIRED').toContain('3.04 m');
        expect(said, 'the refusal does not name the remedy').toContain('landing');
    });

    // ── (ii) PLAN ↔ 3D CONFIG CONVERGENCE (the L-213 equality pattern) ────────
    describe('config converges at the chokepoint — no window.activeStairConfig', () => {
        it('the plan bounding-box handler reads shape/width/typeId from the INJECTED config', () => {
            // This is the handler that used to scavenge `window.activeStairConfig` — a global
            // only the 3D setup panel ever stamped, so plan stairs silently lost the choice.
            const busExec = vi.fn().mockReturnValue({ catch: () => {} });
            win().runtime = { events: { emit: vi.fn(), on: vi.fn() }, bus: { executeCommand: busExec } };
            const { cm } = makeCm([{ id: 'L0', name: 'Ground', elevation: 0 }]);

            const h = new StairPlanToolHandler();
            h.activate(makeCtx('L0', {
                commandManager: cm,
                stairConfig: { shape: 'L', width: 1.45, typeId: 'stair-type-concrete-01' },
            }) as never);
            h.onClick({ worldX: 0, worldZ: 0 } as never);
            h.onClick({ worldX: 3, worldZ: 5 } as never);

            expect(busExec).toHaveBeenCalledTimes(1);
            const payload = busExec.mock.calls[0][1] as Record<string, unknown>;
            expect(payload.shape).toBe('L');
            expect(payload.width).toBe(1.45);
            expect(payload.typeId).toBe('stair-type-concrete-01');   // L-216 plumbing
        });

        it('the SAME store feeds both paths: what the 3D setup panel writes, the plan tool reads', () => {
            // BimService.createStair's onConfirm now calls setStairToolConfig(...) instead of
            // stamping window.activeStairConfig. The plan overlay injects getStairToolConfig().
            setStairToolConfig({ shape: 'U', width: 1.3, typeId: 'stair-type-steel-02' });

            const busExec = vi.fn().mockReturnValue({ catch: () => {} });
            win().runtime = { events: { emit: vi.fn(), on: vi.fn() }, bus: { executeCommand: busExec } };
            const { cm } = makeCm([{ id: 'L0', name: 'Ground', elevation: 0 }]);

            const h = new StairPlanToolHandler();
            // NOTE: no `stairConfig` in the ctx — the handler falls back to the same store,
            // proving both paths converge on one source of truth rather than two.
            h.activate(makeCtx('L0', { commandManager: cm }) as never);
            h.onClick({ worldX: 0, worldZ: 0 } as never);
            h.onClick({ worldX: 3, worldZ: 5 } as never);

            const payload = busExec.mock.calls[0][1] as Record<string, unknown>;
            expect(payload.shape).toBe('U');
            expect(payload.width).toBe(1.3);
            expect(payload.typeId).toBe('stair-type-steel-02');
        });

        it('the plan-committed record agrees with the chokepoint resolver (same span, same risers)', () => {
            const busExec = vi.fn().mockReturnValue({ catch: () => {} });
            win().runtime = { events: { emit: vi.fn(), on: vi.fn() }, bus: { executeCommand: busExec } };
            const levels: Level[] = [
                { id: 'L0', name: 'Ground',  elevation: 0 },
                { id: 'L1', name: 'Level 1', elevation: 2.7 },
            ];
            const { cm } = makeCm(levels);

            const h = new StairPlanToolHandler();
            h.activate(makeCtx('L0', { commandManager: cm, stairConfig: { shape: 'I' } }) as never);
            h.onClick({ worldX: 0, worldZ: 0 } as never);
            h.onClick({ worldX: 1.2, worldZ: 5 } as never);

            const payload = busExec.mock.calls[0][1] as Record<string, unknown>;
            const span = resolveStairVerticalSpan(levels, 'L0');
            if (span.status !== 'ok') throw new Error('expected ok');
            const expected = deriveRisers(span.height);

            expect(payload.topLevelId).toBe('L1');
            expect(payload.riserHeight).toBeCloseTo(expected.riserHeight, 9);
            // 2.7 m is the exact case the old fixed-nominal-riser code got wrong
            // (15 × 0.175 = 2.625, 75 mm off, beyond the 50 mm tolerance).
            const flights = payload.flights as Array<{ riserCount: number }>;
            const risers = flights.reduce((s, f) => s + f.riserCount, 0);
            expect(Number(payload.riserHeight) * risers).toBeCloseTo(2.7, 9);
        });
    });
});
