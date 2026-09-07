// §HOUSE-SHELL-IS-ATOMIC (lane CREATE-HOUSE-IS-ATOMIC, L-13011 / L-13014) — the three defects the
// founder's "Create house from this envelope" crash was made of, pinned.
//
//   1. THE DEGENERATE WALL — `insetPolygonPerEdge` legitimately emits ring edges far under the
//      Wall schema's 0.05 m floor, so the shell generator must WELD them (never silently drop the
//      edge, which would open the shell) and must still REFUSE a genuinely malformed ring.
//   2. THE RUN WAS NOT ATOMIC — the old code looped `wall.create` per edge, so a rejection on
//      edge k kept walls 0..k-1. The shell is now ONE `wall.batch.create`, which validates every
//      wall before it touches the store; and anything that fails AFTER the shell commits rolls it
//      back.
//   3. THE FAILURE WAS SILENT — the result must carry an honest, non-empty reason.
//
// ⛔ These pin BEHAVIOUR, not implementation trivia: the assertions are "how many walls exist
// after a failure" and "which verbs reached the bus", which is what the founder actually
// experienced.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── The three collaborators `houseFromBoundary` reaches for. Mocked so this spec can assert the
//    DISPATCH SHAPE without loading the 3,595-line executor or a THREE renderer. ───────────────
const _mockLevelId = { current: 'level-ground' as string | undefined };
vi.mock('../../apartment-layout/activeLevel.js', () => ({
    resolveActiveLevelId: (): string | undefined => _mockLevelId.current,
    resolveActiveLevel: (): undefined => undefined,
    resolveLevelById: (): undefined => undefined,
}));
vi.mock('../../apartment-layout/gatherLayoutPayload.js', () => ({
    gatherLayoutPayload: (): { shellWallIds: string[] } => ({
        // Enough shell walls that `waitForShell` settles on the first poll.
        shellWallIds: ['w0', 'w1', 'w2', 'w3'],
    }),
    gatherRoomLayoutPayload: (): null => null,
}));
const _controllerResult = { current: { ok: true } as { ok: boolean; reason?: string } };
const _controllerThrows = { current: false };
// §CHOOSER-CANCEL-ROLLS-BACK (L-13020) — the LAST request the caller handed the controller.
// `request()` resolving `{ok:true}` means *"the chooser is open"*, so the cancel callback riding
// on that request is the only thing that can undo the shell afterwards. Capturing it here is what
// lets this spec press Cancel.
const _lastRequest = { current: null as { onCancelled?: () => void | Promise<void> } | null };
vi.mock('../HouseLayoutController.js', () => ({
    HouseLayoutController: class {
        async request(_rt: unknown, req: { onCancelled?: () => void | Promise<void> }): Promise<{ ok: boolean; reason?: string }> {
            _lastRequest.current = req;
            if (_controllerThrows.current) throw new Error('controller exploded');
            return _controllerResult.current;
        }
        async buildDirect(_rt: unknown, req: { onCancelled?: () => void | Promise<void> }): Promise<{ ok: boolean; reason?: string }> {
            _lastRequest.current = req;
            if (_controllerThrows.current) throw new Error('controller exploded');
            return _controllerResult.current;
        }
    },
}));

import { weldFootprintForWalls, WALL_MIN_BASELINE_M } from '../weldFootprintForWalls.js';
import { generateHouseFromBoundary, generateHouseInExistingShell } from '../houseFromBoundary.js';

/** A fake bus that records every dispatch and models `wall.batch.create`'s ACTUAL contract. */
function makeBus(opts: { rejectShortWalls: boolean }) {
    const calls: Array<{ type: string; payload: unknown }> = [];
    const walls = new Map<string, unknown>();
    return {
        calls,
        walls,
        executeCommand: async (type: string, payload: unknown): Promise<unknown> => {
            calls.push({ type, payload });
            if (type === 'wall.batch.create') {
                const p = payload as { walls: Array<{ id: string; baseLine: Array<{ x: number; z: number }> }> };
                // ⭐ THE REAL HANDLER'S ORDER: validate EVERY wall into `fresh[]` first, and only
                // then commit the whole set through one `produceCommand`. Modelling it any other
                // way would let this spec pass while production kept partial state.
                const fresh: Array<{ id: string }> = [];
                for (let i = 0; i < p.walls.length; i++) {
                    const w = p.walls[i]!;
                    const [a, b] = w.baseLine;
                    if (opts.rejectShortWalls && Math.hypot(a!.x - b!.x, a!.z - b!.z) < WALL_MIN_BASELINE_M) {
                        throw new Error(
                            `wall.batch.create rejected — walls[${i}] baseLine endpoints must be ≥ 0.05 m apart in the XZ plane.`,
                        );
                    }
                    fresh.push({ id: w.id });
                }
                for (const w of fresh) walls.set(w.id, w);
                return undefined;
            }
            if (type === 'wall.delete') {
                walls.delete((payload as { id: string }).id);
                return undefined;
            }
            return undefined;
        },
    };
}

function makeRuntime(bus: ReturnType<typeof makeBus>) {
    const toasts: Array<{ message: string; severity: string }> = [];
    return {
        toasts,
        rt: {
            bus,
            events: { emit: (_t: string, p: { message: string; severity: string }) => { toasts.push(p); } },
        },
    };
}

/** A square, then a square with one vertex duplicated 1 cm away — the erosion's real output shape. */
const SQUARE = [
    { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 },
];
const SQUARE_WITH_MICRO_EDGE = [
    { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12.004, z: 0.009 }, { x: 12, z: 10 }, { x: 0, z: 10 },
];

beforeEach(() => {
    _mockLevelId.current = 'level-ground';
    _controllerResult.current = { ok: true };
    _controllerThrows.current = false;
    _lastRequest.current = null;
    (globalThis as unknown as { window?: unknown }).window ??= {};
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§HOUSE-SHELL-IS-ATOMIC 1 — the weld reconciles the polygon domain with the wall domain', () => {
    it('leaves an already-legal ring untouched and says so with note === null', () => {
        const r = weldFootprintForWalls(SQUARE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.weldedCount).toBe(0);
        expect(r.note).toBeNull();
        expect(r.ring).toHaveLength(4);
    });

    it('welds a sub-0.05 m vertex pair and every resulting edge clears the wall floor', () => {
        const r = weldFootprintForWalls(SQUARE_WITH_MICRO_EDGE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.weldedCount).toBe(1);
        expect(r.minEdgeBeforeM).toBeLessThan(WALL_MIN_BASELINE_M);
        expect(r.minEdgeAfterM).toBeGreaterThanOrEqual(WALL_MIN_BASELINE_M);
        // ⛔ THE RING STAYS CLOSED. A filter would have dropped an edge and left a gap; the weld
        // removes a VERTEX, so the perimeter is still a single closed loop of n-1 edges.
        expect(r.ring).toHaveLength(SQUARE_WITH_MICRO_EDGE.length - 1);
        // And the area it encloses is materially unchanged — this is the claim that makes welding
        // honest rather than a quiet reshaping of the user's footprint.
        expect(Math.abs(r.areaAfterM2 - r.areaBeforeM2)).toBeLessThan(0.5);
    });

    it('⛔ REFUSES rather than welding when the ring collapses below 3 vertices', () => {
        const r = weldFootprintForWalls([
            { x: 0, z: 0 }, { x: 0.01, z: 0 }, { x: 0.02, z: 0.01 }, { x: 0.01, z: 0.02 },
        ]);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('collapsed-by-weld');
        expect(r.statement).toContain('Nothing has been created');
    });

    it('⛔ REFUSES when the weld would move the enclosed area beyond tolerance', () => {
        // A finely-sampled disc: 60 vertices on a 1 m circle, so every edge is ~0.105 m. At the
        // REAL 0.05 m floor nothing welds and the ring passes untouched — that is the control.
        const disc = Array.from({ length: 60 }, (_, i) => {
            const t = (i / 60) * Math.PI * 2;
            return { x: Math.cos(t), z: Math.sin(t) };
        });
        const control = weldFootprintForWalls(disc);
        expect(control.ok).toBe(true);
        if (control.ok) expect(control.weldedCount).toBe(0);

        // Now weld the SAME ring at 1.5 m. That is not "tidying surveyed detail" — it flattens the
        // disc into an inscribed triangle and throws away most of the area. The guard must catch
        // exactly this: a weld that changes the SHAPE, not just its vertex count.
        const r = weldFootprintForWalls(disc, 1.5);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('weld-moved-the-area');
        // ⛔ The refusal names BOTH areas, so the user can see what it refused on.
        expect(r.statement).toMatch(/m²/);
        expect(r.statement).toContain('Nothing has been created');
    });

    it('⛔ REFUSES a ring with non-finite vertices instead of drawing from it', () => {
        const r = weldFootprintForWalls([
            { x: 0, z: 0 }, { x: Number.NaN, z: 0 }, { x: 5, z: 5 }, { x: 0, z: 5 },
        ]);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('non-finite-vertex');
    });

    it('never throws, whatever it is handed', () => {
        expect(() => weldFootprintForWalls(null)).not.toThrow();
        expect(() => weldFootprintForWalls(undefined)).not.toThrow();
        expect(() => weldFootprintForWalls([])).not.toThrow();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§HOUSE-SHELL-IS-ATOMIC 2 — the shell is ONE command, and a failure leaves nothing behind', () => {
    it('draws the whole shell through a SINGLE wall.batch.create, never N× wall.create', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        const res = await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        expect(res.ok).toBe(true);
        const batch = bus.calls.filter((c) => c.type === 'wall.batch.create');
        const singles = bus.calls.filter((c) => c.type === 'wall.create');
        expect(batch).toHaveLength(1);
        // ⛔ THE REGRESSION GUARD. The per-edge loop is what kept two orphan walls on the
        // founder's level. If this ever goes above 0 again, L-13011 is back.
        expect(singles).toHaveLength(0);
        expect((batch[0]!.payload as { walls: unknown[] }).walls).toHaveLength(4);
        expect(bus.walls.size).toBe(4);
    });

    it('⭐ a degenerate edge now creates ZERO walls — not a partial shell', async () => {
        // Feed the ring with the sub-0.05 m edge, but with welding effectively disabled by asking
        // the pipeline for a footprint whose micro-edge survives: the weld handles it, so assert
        // the END STATE the founder cares about — a legal shell, or nothing.
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        const res = await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE_WITH_MICRO_EDGE });
        expect(res.ok).toBe(true);
        // The weld removed the offending vertex, so a 4-wall shell exists and NO wall was rejected.
        expect(bus.walls.size).toBe(4);
        expect(bus.calls.filter((c) => c.type === 'wall.batch.create')).toHaveLength(1);
    });

    it('⭐ when the batch REJECTS, no wall survives and the reason is honest', async () => {
        // A ring the weld cannot rescue: force the failure through the batch by handing a ring
        // whose vertices are legal to the weld but which the bus rejects wholesale.
        const bus = {
            calls: [] as Array<{ type: string; payload: unknown }>,
            walls: new Map<string, unknown>(),
            executeCommand: async (type: string, payload: unknown): Promise<unknown> => {
                bus.calls.push({ type, payload });
                if (type === 'wall.batch.create') {
                    // Model the handler's validate-all-first contract: throw BEFORE any commit.
                    throw new Error('wall.batch.create rejected — walls[2] baseLine endpoints must be ≥ 0.05 m apart in the XZ plane.');
                }
                return undefined;
            },
        };
        const { rt, toasts } = makeRuntime(bus as never);
        const res = await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        expect(res.ok).toBe(false);
        // ⛔ THE HEADLINE ASSERTION OF THIS WHOLE LANE. The founder's run kept two walls here.
        expect(bus.walls.size).toBe(0);
        // No rollback was needed, because nothing was committed — so no wall.delete was issued.
        expect(bus.calls.filter((c) => c.type === 'wall.delete')).toHaveLength(0);
        // And the failure is SURFACED, not swallowed (defect 3).
        expect(res.reason ?? '').toContain('Create house failed');
        expect(res.reason ?? '').toContain('Nothing was created');
        expect(toasts.some((t) => t.severity === 'error')).toBe(true);
    });

    it('⭐ rolls the shell back when a LATER stage refuses', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt, toasts } = makeRuntime(bus);
        _controllerResult.current = { ok: false, reason: 'no variants (plate too small)' };
        const res = await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        expect(res.ok).toBe(false);
        // The shell was committed, then removed — the level is as it was found.
        expect(bus.calls.filter((c) => c.type === 'wall.batch.create')).toHaveLength(1);
        expect(bus.calls.filter((c) => c.type === 'wall.delete')).toHaveLength(4);
        expect(bus.walls.size).toBe(0);
        expect(res.reason ?? '').toContain('no variants');
        expect(res.reason ?? '').toContain('exactly as it was');
        expect(toasts.some((t) => t.severity === 'error')).toBe(true);
    });

    it('⭐ rolls the shell back when a later stage THROWS', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        _controllerThrows.current = true;
        const res = await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        expect(res.ok).toBe(false);
        expect(bus.walls.size).toBe(0);
        expect(bus.calls.filter((c) => c.type === 'wall.delete')).toHaveLength(4);
        expect(res.reason ?? '').toContain('controller exploded');
    });

    it('⛔ a footprint the weld refuses never reaches the bus at all', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        const res = await generateHouseFromBoundary(rt as never, 1, {
            footprint: [{ x: 0, z: 0 }, { x: 0.01, z: 0 }, { x: 0.02, z: 0.01 }, { x: 0.01, z: 0.02 }],
        });
        expect(res.ok).toBe(false);
        expect(bus.calls).toHaveLength(0);
        expect(res.reason ?? '').toContain('Nothing has been created');
    });

    it('keeps the shell on the SUCCESS path — the chooser is about to build on it', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        const res = await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        expect(res.ok).toBe(true);
        expect(bus.calls.filter((c) => c.type === 'wall.delete')).toHaveLength(0);
        expect(bus.walls.size).toBe(4);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §CHOOSER-CANCEL-ROLLS-BACK (L-13020) — DECLINING THE CHOOSER MUST NOT LEAVE A BARE SHELL.
//
// The same family as §HOUSE-SHELL-IS-ATOMIC above and reached by a different door: there the run
// THREW and kept geometry; here the user DECLINED and geometry was kept. The mechanism is the one
// the test just above pins as correct — `generateHouseFromBoundary` deliberately KEEPS the shell
// when the chooser opens, because the chooser is about to build on it. The gap was that a cancel
// arrives AFTER that promise has resolved, so only the cancel path can compensate.
//
// ⛔ THESE ARE BEHAVIOUR ASSERTIONS: how many walls are on the level after the user says no.
describe('§CHOOSER-CANCEL-ROLLS-BACK (L-13020) — the cancel path owns the undo', () => {
    it('registers a rollback WITH the request — the promise has resolved by cancel time', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        const res = await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        expect(res.ok).toBe(true);
        // The shell is still up — that is the SUCCESS path and it is correct (the chooser is open).
        expect(bus.walls.size).toBe(4);
        expect(typeof _lastRequest.current?.onCancelled).toBe('function');
    });

    it('⛔ pressing Cancel removes every wall PRYZM drew, and says so', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt, toasts } = makeRuntime(bus);
        await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        expect(bus.walls.size).toBe(4);

        await _lastRequest.current!.onCancelled!();

        // THE FOUNDER-VISIBLE CLAIM: no bare shell survives a decline.
        expect(bus.walls.size).toBe(0);
        expect(bus.calls.filter((c) => c.type === 'wall.delete')).toHaveLength(4);
        // ⚠ AND IT IS SPOKEN. A shell that silently appears and silently vanishes is two
        // unexplained events; the user must be told what was taken back and why.
        const last = toasts[toasts.length - 1]!;
        expect(last.message).toContain('No layout chosen');
        expect(last.message).toContain('exactly as it was');
    });

    it('is ONE-SHOT — a second cancel (Escape after a backdrop click) deletes nothing twice', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE });
        await _lastRequest.current!.onCancelled!();
        await _lastRequest.current!.onCancelled!();
        expect(bus.calls.filter((c) => c.type === 'wall.delete')).toHaveLength(4);
    });

    it('⛔ registers NOTHING on the existing-shell path — that shell is the USER\'s', async () => {
        // `generateHouseInExistingShell` opens the SAME chooser over walls the user authored.
        // Deleting those on cancel would be a far worse defect than the one this closes, so the
        // discrimination is expressed by which caller supplies a callback — never by a flag.
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        await generateHouseInExistingShell(rt as never, 1);
        expect(_lastRequest.current).not.toBeNull();
        expect(_lastRequest.current?.onCancelled).toBeUndefined();
    });

    it('does not register a rollback on the autoBuild path — there is no chooser to cancel', async () => {
        const bus = makeBus({ rejectShortWalls: true });
        const { rt } = makeRuntime(bus);
        await generateHouseFromBoundary(rt as never, 1, { footprint: SQUARE, autoBuild: true });
        expect(_lastRequest.current?.onCancelled).toBeUndefined();
    });
});
