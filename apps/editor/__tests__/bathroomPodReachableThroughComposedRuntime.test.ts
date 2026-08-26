/**
 * @vitest-environment happy-dom
 */
// §BATH102 (L-11480..L-11486) — C109 §9 AXIS 1 (store constructed) AND AXIS 2
// (descriptor + dispatch), measured on the runtime `composeRuntime()` ACTUALLY
// PRODUCES. · C109 · C104 §13 · C02 · ADR-0318 · L-11064.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE CALLS `composeRuntime()` AND NOT `bootstrapWithEverything()` ALONE
// ═══════════════════════════════════════════════════════════════════════════════
//
// `boundaryLineFootprintThroughComposedRuntime.test.ts` records the measurement that
// makes this distinction load-bearing, and it is not a style preference:
//
//   composeRuntime()          -> Object.keys(rt.stores) = ['elements',
//                                'registerHydrator','hydrate','viewState','project']
//                                rt.stores.boundaryLine === undefined
//   bootstrapWithEverything() -> 29 keys, boundaryLine = a real store
//
// `boundaryLineReachableThroughComposedRuntime` was GREEN on all 13 of its cases
// while four production call sites read `undefined`, because the `StoresSlot`
// `composeRuntime` builds is a FRESH OBJECT that copied none of the data half's
// plugin stores. P1 (CLAUDE.md) makes `composeRuntime()` the only way production
// obtains a runtime, so it is the only object a reachability claim may be made
// against.
//
// ⭐ AND THAT IS EXACTLY THE STATE `lift` / `liftPart` WERE IN UNTIL THIS LANE.
// `liftUndoAdapter.ts`'s production resolver `resolveLiftStoresFromWindow()` reads
// `window.runtime.stores.lift` / `.liftPart` through a cast and returned `null` in
// every browser session, so `_applyOrThrow` threw a named per-store failure on every
// lift Ctrl+Z. That is **L-11064**, which `composeRuntime.ts` itself logged as *"the
// SAME latent unreachability … logged rather than fixed blind"*. ARM D below is the
// measurement that closes it.
//
// ⚠ WHAT THIS FILE DOES **NOT** PROVE, STATED SO NOBODY READS MORE INTO A GREEN RUN:
// it proves the store exists on the composed runtime and that `bathroomPod.create`
// is dispatchable and lands. It does **NOT** prove a person can click a row and get a
// pod. C109 R-9 (C104 R-10 adopted) declares that claim INADMISSIBLE without a
// pointer-layer proof, and that proof lives in
// `apps/editor/src/engine/views/plantools/__tests__/bathroomPodPointerReach.spec.ts`.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { BathroomPodStore } from '@pryzm/plugin-plumbing';
import {
    BATHROOM_POD_DEFAULT_MEMBERS,
    bathroomPodMemberOrder,
    type BathroomPod,
} from '@pryzm/geometry-plumbing';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

const POD_ID = 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H00';
const MEMBER_IDS = bathroomPodMemberOrder(BATHROOM_POD_DEFAULT_MEMBERS).map(
    (_k, i) => `plumbing_01ARZ3NDEKTSV4RRFFQ69G5H1${i}`,
);

/** A room the solver's own suite pins as fitting the default set on one wall. */
const PAYLOAD = {
    podId: POD_ID,
    levelId: 'level-1',
    room: { clearWidth: 2.6, clearDepth: 2.1, origin: { x: 0, y: 0, z: 0 }, rotation: 0 },
    handedness: 'left' as const,
    memberIds: MEMBER_IDS,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let priorRuntime: unknown;

beforeAll(async () => {
    priorRuntime = (window as unknown as { runtime?: unknown }).runtime;
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    (window as unknown as { runtime?: unknown }).runtime = rt;
});

afterAll(() => {
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    try { rt?.tearDown?.(); } catch { /* teardown must not fail the suite */ }
});

describe('§BATH102 — the bathroom pod is reachable through the REAL composition root', () => {
    // ── ARM A — axis 1: the store exists ON THE COMPOSED RUNTIME ────────────
    describe('ARM A — C109 §9 axis 1: store constructed', () => {
        it('A-1 `runtime.stores.bathroomPod` is a real BathroomPodStore, not undefined', () => {
            // ⛔ THE ASSERTION THE BOUNDARY LINE'S SUITE COULD NOT MAKE. `StoresSlot`
            // has no index signature, so before this lane `rt.stores.bathroomPod` was
            // a compile error AND a runtime `undefined`. Both had to move.
            expect(rt.stores.bathroomPod).toBeInstanceOf(BathroomPodStore);
        });

        it('A-2 it is the SAME INSTANCE the bus writes through — adopted, never constructed', async () => {
            await rt.bus.executeCommand('bathroomPod.create', PAYLOAD);
            // Identity is the property. A rival store constructed in `composeRuntime`
            // would satisfy A-1 and hold ZERO pods here, which is exactly how the
            // boundary line's chat seam read an empty store while the drawn line sat
            // in the other one.
            expect(rt.stores.bathroomPod.getState().get(POD_ID)).toBeDefined();
        });
    });

    // ── ARM B — axis 2: the command dispatches AND lands ────────────────────
    describe('ARM B — C109 §9 axis 2: descriptor + dispatch', () => {
        it('B-1 `bathroomPod.create` resolves rather than throwing on a missing store', async () => {
            // With no `bathroomPod` descriptor in `PluginRegistry.ts`,
            // `CommandBus.buildContext` throws *"required store \'bathroomPod\' is
            // missing from HandlerContext.stores"* BEFORE anything mutates. Delete the
            // descriptor and this line fails; that is the property being pinned.
            await expect(
                rt.bus.executeCommand('bathroomPod.create', {
                    ...PAYLOAD,
                    podId: 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H0B',
                }),
            ).resolves.toBeDefined();
        });

        it('B-2 the pod READS BACK from the store with every member (C67 rule 12)', async () => {
            const id = 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H0C';
            await rt.bus.executeCommand('bathroomPod.create', { ...PAYLOAD, podId: id });

            const pod = rt.stores.bathroomPod.getState().get(id) as BathroomPod | undefined;
            expect(pod, 'read back through the REAL store, never the command result').toBeDefined();
            expect(pod!.members.map((m) => m.id)).toEqual(MEMBER_IDS);
            // C109 §2 / R-2 — every member is a record in the family that owns
            // sanitaryware, never a pod-private object.
            for (const m of pod!.members) {
                expect(['toilet', 'sink', 'shower', 'bath', 'accessory']).toContain(m.fixtureType);
            }
        });

        it('B-3 `bathroomPod.delete` dispatches and the pod is gone', async () => {
            const id = 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H0D';
            await rt.bus.executeCommand('bathroomPod.create', { ...PAYLOAD, podId: id });
            expect(rt.stores.bathroomPod.getState().get(id)).toBeDefined();

            await rt.bus.executeCommand('bathroomPod.delete', { podId: id });
            expect(rt.stores.bathroomPod.getState().get(id)).toBeUndefined();
        });

        it('B-4 a room too small is REFUSED at the bus, and nothing lands', async () => {
            const id = 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H0E';
            // ⛔ C109 §5.4 / R-3 reaching a PERSON: the bus surfaces `canExecute`'s
            // reason verbatim, which is the sentence the plan tool puts on screen.
            await expect(
                rt.bus.executeCommand('bathroomPod.create', {
                    ...PAYLOAD,
                    podId: id,
                    room: { ...PAYLOAD.room, clearWidth: 1.4 },
                }),
            ).rejects.toThrow(/needs \d+\.\d{2} m of clear wall/);
            expect(rt.stores.bathroomPod.getState().get(id)).toBeUndefined();
        });
    });

    // ── ARM C — the pod does NOT write the plumbing store ───────────────────
    describe('ARM C — C109 §8 as amended: ONE declared store', () => {
        it('C-1 creating a pod leaves the `plumbing` DTO store untouched', async () => {
            // ⭐ THE AMENDMENT, MEASURED. `ctx.stores.plumbing` is the PIPE DTO store
            // (`Store<Plumbing>` — kind / diameter / bendRadius), and
            // `buildUndoStoreMap()` resolves the same key to the LEGACY FIXTURE store
            // on undo. A pod that wrote it would be putting sanitaryware in the pipe
            // half of the family AND arming C03 §4.6 U-2b's corrupting undo. Members
            // ride inside the pod record instead.
            const before = rt.stores.elements ? 0 : 0;
            void before;
            const plumbing = (rt as { stores: Record<string, { getState?: () => Map<string, unknown> }> })
                .stores['plumbing'];
            const sizeBefore = plumbing?.getState?.().size ?? 0;

            await rt.bus.executeCommand('bathroomPod.create', {
                ...PAYLOAD,
                podId: 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H0F',
            });

            expect(plumbing?.getState?.().size ?? 0).toBe(sizeBefore);
        });
    });

    // ── ARM D — L-11064: the LIFT's two stores are reachable too ────────────
    describe('ARM D — L-11064 closed: runtime.stores.lift / .liftPart', () => {
        it('D-1 both lift stores are present on the composed runtime', () => {
            // ⛔ BEFORE THIS LANE BOTH WERE `undefined` ON THE COMPOSED RUNTIME, so
            // `resolveLiftStoresFromWindow()` returned `null` and every lift Ctrl+Z
            // threw *"runtime.stores.lift is not reachable"* instead of reverting.
            expect(rt.stores.lift, 'runtime.stores.lift (L-11064)').toBeDefined();
            expect(rt.stores.liftPart, 'runtime.stores.liftPart (L-11064)').toBeDefined();
        });

        it('D-2 the lift undo adapter\'s PRODUCTION resolver now resolves', async () => {
            // ⭐ THE REAL RESOLVER, NOT A RE-IMPLEMENTATION OF IT. A test that
            // re-checked `window.runtime.stores.lift` itself would be a fake built
            // from the header; this imports the function the undo path actually calls.
            const { resolveLiftStoresFromWindow } = await import(
                '../src/engine/undo/liftUndoAdapter.js'
            );
            const live = resolveLiftStoresFromWindow();
            expect(live, 'resolveLiftStoresFromWindow() returned null — L-11064 is NOT closed').not.toBeNull();
            expect(typeof live!.lift.applyPatch).toBe('function');
            expect(typeof live!.liftPart.ids).toBe('function');
        });
    });
});
