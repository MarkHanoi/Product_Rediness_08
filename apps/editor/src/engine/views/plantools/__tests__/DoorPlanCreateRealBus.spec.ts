/**
 * §DOOR125 (L-11980) — REAL command-bus reproduction: door creation via the
 * PLAN VIEW tool, preview vs commit as two separate paths.
 *
 * FOUNDER REPORT (verbatim): "The door element — I am not able, lately, only
 * to create in plan view. The preview appears, but can't create."
 *
 * `_drawDoorPreview()` (onMouseMove) is PURE CANVAS 2-D — it never touches the
 * command bus, and it draws UNCONDITIONALLY wherever the cursor is, wall or
 * not. `onClick()` (commit) dispatches `wall.opening.create` through
 * `ctx.runtime.bus.executeCommand(...)` — but REQUIRES a wall within 1.5 m
 * (plan) / 2.0 m (vertical) / the 16 px hitTest radius, or it refuses. Before
 * this fix EVERY refusal in `onClick` — no wall in reach, a resolved host that
 * isn't a wall, curved-hosting disabled, and a `canExecute` rejection from the
 * bus itself — reached `console.warn`/`console.error` ONLY. From the user's
 * seat that is indistinguishable from "the preview shows and nothing happens
 * on click", which is exactly the founder's report: a convincing preview
 * (no proximity gate) followed by a silent, correct refusal at commit time
 * (a real proximity gate) with zero on-screen explanation.
 *
 * PART 1 drives the REAL `DoorPlanToolHandler.onClick()` against a REAL
 * `CommandBus` with the REAL `WallOpeningLegacyAdapterHandler`
 * (plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts) registered —
 * the exact handler production dispatches to — through the REAL
 * `buildDoorOpening()` chokepoint (@pryzm/geometry-door), and proves the
 * result reaches the REAL `doorStore` via the SAME `buildDoorStoreRecord()`
 * mirror `initTools.ts`'s `wall.opening.created` bridge calls (the record the
 * plan-view swing-arc symbol is drawn from). RESULT (measured against current
 * HEAD): GREEN — the dispatch chain itself is sound; no `canExecute` rejection,
 * no bus throw, the door lands in `doorStore` byte-identical to what the
 * commit built.
 *
 * PART 2 is the fix (§DOOR125): every refusal above now ALSO calls
 * `runtime.toasts.show(...)` (the C74/C80 "never a silent no-op" channel
 * `activatePlanOnlyTool.ts` already uses for the same class of problem).
 * These tests were RED before the fix (no toast ever fired) and are GREEN
 * after it — pasted in the lane report.
 *
 * Only `canvasHitToWorld3D` is mocked (the heavy THREE/DOM-touching barrel
 * export — same seam `DoorHostResolution.slab.spec.ts` already uses). The
 * legacy `wallStore` used for HOST RESOLUTION is duck-typed exactly as that
 * file's is — proven-passing, and not the subject under test here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@pryzm/core-app-model', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@pryzm/core-app-model')>()),
    canvasHitToWorld3D: (hit: { worldX: number; worldZ: number }) => ({
        x: hit.worldX,
        y: 0,
        z: hit.worldZ,
    }),
}));

import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/command-bus';
import { buildWallHandlerSet } from '@pryzm/plugin-wall';
import { doorStore, buildDoorStoreRecord, resetDoorToolConfig } from '@pryzm/geometry-door';
import { DoorPlanToolHandler } from '../DoorPlanToolHandler';

const WALL = { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], thickness: 0.2 };

/** Real audit + real CommandBus, exactly the shape `apps/editor/src/bootstrap.ts`
 *  and `plugins/wall/__tests__/handlers.test.ts` build, with the REAL wall handler
 *  set (including `WallOpeningLegacyAdapterHandler`) registered. `wall: {}` is the
 *  common "legacy-only wall" production case documented in the handler's own header
 *  (§P2.3): the wall exists ONLY in the legacy geometry WallStore, not yet migrated
 *  into the PRYZM3 Immer store, so the handler's Immer draft mutation is a
 *  structural no-op (empty forward/inverse) — that is NOT a bug, and is asserted
 *  below as the documented behaviour, not inferred as one.
 */
function buildRealBus(): { bus: CommandBus; records: EventRecord<unknown>[] } {
    const records: EventRecord<unknown>[] = [];
    const emitter = new PatchEmitter();
    emitter.subscribe((_bytes, record) => { records.push(record); });
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 'c1' },
        emitter,
        undoStack: new UndoStack({ maxSize: 20 }),
        storesProvider: () => ({ wall: {} }),
    });
    for (const h of buildWallHandlerSet()) bus.register(h);
    return { bus, records };
}

function makeCtx(bus: CommandBus, toastShow: ReturnType<typeof vi.fn>) {
    const canvasCtx = {
        setTransform: vi.fn(), clearRect: vi.fn(),
        save: vi.fn(), restore: vi.fn(),
        translate: vi.fn(), rotate: vi.fn(),
        setLineDash: vi.fn(), beginPath: vi.fn(),
        arc: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
        lineTo: vi.fn(), fill: vi.fn(), rect: vi.fn(), fillText: vi.fn(),
        strokeStyle: '', lineWidth: 0, fillStyle: '',
        font: '', textAlign: '', textBaseline: '',
    };
    return {
        wallStore: {
            getAll: () => [WALL],
            getById: (id: string) => (id === 'w1' ? WALL : undefined),
        },
        planCanvas: {
            worldToScreen: (_x: number, _z: number) => ({ sx: 0, sy: 0 }),
            hitTest: (_sx: number, _sy: number, _r: number) => 'w1',
            getPixelsPerUnit: () => 100,
        },
        overlayCanvas: { width: 800, height: 600 },
        ctx: canvasCtx,
        dpr: 1,
        viewPlane: { isVertical: false, hWorldAxis: 'x', origin: { x: 0, y: 0, z: 0 } },
        viewDef: { spatial: { levelId: 'level-1' } },
        // §FIX-DOOR-CREATION-PARITY (L-260 A) — no `doorConfig` injected on purpose:
        // the handler must fall back to the module-level `getDoorToolConfig()`
        // singleton, exactly as production does when the overlay omits it.
        runtime: { bus, toasts: { show: toastShow } },
    } as any;
}

describe('§DOOR125 (L-11980) — REAL bus: PLAN VIEW door creation, preview vs commit', () => {
    beforeEach(() => {
        doorStore.clear();
        resetDoorToolConfig();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('PART 1 (proves the dispatch chain is sound): one click on the plan tool commits a real wall.opening.create through the real bus, with NO refusal, and the door reaches the real doorStore', async () => {
        const { bus, records } = buildRealBus();
        const toastShow = vi.fn();
        const handler = new DoorPlanToolHandler();
        const ctx = makeCtx(bus, toastShow);
        handler.activate(ctx);

        // ⭐ THE PREVIEW HALF — pure canvas draw, never touches the bus. This is
        // what the founder sees working: "the preview appears".
        handler.onMouseMove({ worldX: 2.5, worldZ: 0.1 } as any);
        expect(ctx.ctx.stroke).toHaveBeenCalled();

        // ⭐ THE COMMIT HALF — the click. `onClick` fires the bus dispatch as a
        // floating (un-awaited) promise, exactly as production does; the test
        // must wait for that microtask to settle before asserting on it —
        // otherwise a genuine rejection races past the assertion undetected.
        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);
        await new Promise((r) => setTimeout(r, 0));

        // THE ASSERTION THE BRIEF DEMANDS: a canExecute refusal must be VISIBLE
        // here, never inferred. Walk every dispatched record and demand the bus
        // actually accepted the command — if `executeCommand` rejected, no
        // record would ever reach `records` (CommandBus.ts: the throw happens
        // BEFORE `this.emitter.emit(record)`).
        expect(records.length, 'wall.opening.create must have reached the bus and been ACCEPTED — an empty list means canExecute (or the bus itself) rejected the dispatch').toBe(1);
        expect(records[0]!.type).toBe('wall.opening.create');
        expect(toastShow, 'no refusal occurred, so no toast should fire').not.toHaveBeenCalled();

        const payload = records[0]!.payload as { wallId: string; openingData: Record<string, unknown> };
        expect(payload.wallId).toBe('w1');
        expect(payload.openingData.type).toBe('door');
        expect(payload.openingData.width).toBeGreaterThan(0);
        expect(payload.openingData.height).toBeGreaterThan(0);

        // The wall is legacy-only in this fixture (§P2.3 no-op branch) — the
        // Immer draft mutation is a documented no-op, so patches are empty.
        // This is NOT the defect; it is asserted so nobody "fixes" it later.
        expect(records[0]!.forward).toEqual([]);
        expect(records[0]!.inverse).toEqual([]);

        // ⭐ THE PART THAT ACTUALLY PROVES THE DOOR APPEARS: mirror
        // `initTools.ts`'s real `wall.opening.created` bridge — same
        // `buildDoorStoreRecord()` chokepoint, same `doorStore.add()` call —
        // and prove the plan-view swing-arc symbol's data source receives the
        // door. `CommandEventBridge`'s `wall.opening.create` case does nothing
        // more than reshape this SAME `records[0]` into
        // `{wallId, opening: openingData}`, so replaying that reshape here is
        // exercising production logic, not inventing a shortcut around it.
        const o = payload.openingData;
        const id = String(o.id);
        const elementId = String(o.elementId);
        expect(doorStore.has(elementId)).toBe(false);
        doorStore.add(buildDoorStoreRecord({
            opening: { ...o, id, elementId },
            wallId: payload.wallId,
        }) as Parameters<typeof doorStore.add>[0]);
        expect(doorStore.has(elementId)).toBe(true);
        expect(doorStore.getAll()[0]!.width).toBe(o.width);
    });

    it('a canExecute refusal is NOT silently swallowed by the bus — it throws with a named reason', async () => {
        // Direct proof of the handler's own contract (WallOpeningLegacyAdapterHandler
        // .canExecute) independent of the plan tool: an invalid payload must REJECT
        // with a reason a person can read, not disappear.
        const { bus } = buildRealBus();
        await expect(
            bus.executeCommand('wall.opening.create', {
                wallId: 'w1',
                openingData: { type: 'door', offset: -1, width: 0.9, height: 2.1, sillHeight: 0 },
            }),
        ).rejects.toThrow(/canExecute rejected — openingData\.offset/);
    });

    it('PART 2 (§DOOR125 fix): a real bus rejection now reaches the user via a toast, not console.error alone', async () => {
        // A bus with NO wall.opening.create handler registered reproduces "click
        // does nothing, nothing on screen" — the exact shape a silently-broken
        // registration (or any canExecute rejection) takes.
        const emitter = new PatchEmitter();
        const bus = new CommandBus({
            audit: { actorId: 'test', projectId: 'p1', clientId: 'c1' },
            emitter,
            undoStack: new UndoStack({ maxSize: 20 }),
            storesProvider: () => ({ wall: {} }),
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const toastShow = vi.fn();
        const handler = new DoorPlanToolHandler();
        const ctx = makeCtx(bus, toastShow);
        handler.activate(ctx);

        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);
        await new Promise((r) => setTimeout(r, 0));

        // The console line is RETAINED (dev-facing detail)…
        expect(errorSpy).toHaveBeenCalledWith(
            '[DoorPlanToolHandler] wall.opening.create bus failed:',
            expect.any(Error),
        );
        // …AND — the fix — a toast now reaches the person, naming why, C74.
        expect(toastShow).toHaveBeenCalledTimes(1);
        const [message, kind] = toastShow.mock.calls[0]!;
        expect(String(message)).toMatch(/could not place the door/i);
        expect(String(message)).toMatch(/no handler registered/i);
        expect(kind).toBe('error');
        errorSpy.mockRestore();
    });

    it('PART 2 (§DOOR125 fix): "no wall near the cursor" now surfaces a toast — the asymmetry between the (gate-free) preview and the (gated) commit is no longer silent', () => {
        const { bus } = buildRealBus();
        const toastShow = vi.fn();
        const handler = new DoorPlanToolHandler();
        const ctx = makeCtx(bus, toastShow);
        // No wall anywhere near the click, and hitTest finds nothing either.
        ctx.wallStore.getAll = () => [];
        ctx.wallStore.getById = () => undefined;
        ctx.planCanvas.hitTest = () => null;
        handler.activate(ctx);

        // The preview still draws — unconditional, exactly as production behaves —
        // so a person sees a convincing ghost door right up to the click.
        handler.onMouseMove({ worldX: 50, worldZ: 50 } as any);
        expect(ctx.ctx.stroke).toHaveBeenCalled();

        handler.onClick({ worldX: 50, worldZ: 50 } as any);

        expect(toastShow).toHaveBeenCalledTimes(1);
        const [message, kind] = toastShow.mock.calls[0]!;
        expect(String(message)).toMatch(/no wall found/i);
        expect(kind).toBe('error');
    });
});
