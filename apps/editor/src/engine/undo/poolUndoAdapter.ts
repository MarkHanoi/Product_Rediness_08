// poolUndoAdapter — undo/redo coverage for the ADR-0124 POOL ASSEMBLY's two own stores.
//
// §POOL95 (L-11350) · closes the pool half of L-980 · C03 §4.7-4.8 · ADR-0124 §3/§6 ·
// C16 §8.6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ THE DEFECT: THE HOLE DID NOT VANISH ON CTRL+Z, AND THE PATCHES WERE FINE.
// ═══════════════════════════════════════════════════════════════════════════════
// `plugins/pool/__tests__/poolOneUndoEntry.test.ts` T-3 proves — against the REAL
// `CommandBus`, the REAL `RingBufferUndoStack` and the REAL multi-store router — that
// undoing a `pool.create` restores the host slab's `holes` array to its EXACT prior
// state, pre-existing stair void and all. The inverse patch has been correct since
// L-292.
//
// It was never routed. `pool.create` declares FOUR affected stores
// (`['pool','wall','slab','water']`). Two of them — `wall` and `slab` — are legacy
// element stores and ARE adapted by `adaptElementStoreMap`. The two that are NOT are
// the two the pool itself lives in. `_covered()` is ALL-OR-NOTHING, so the entire
// entry was declined and `performUndoRedo` fell through to the legacy `commandManager`,
// which has never heard of `pool.create`.
//
// **Ctrl+Z after drawing a pool was a TOTAL NO-OP: the pool stayed, and so did the
// void punched through the floor plate.** That is not a failed undo — it is silent
// data retention reported to the user as success, and it is the exact shape the
// §POOL95 brief names as "worse than no feature".
//
// ── ⚠ WHY THIS SAT UNFIXED: THE ROWS SAID IT COULD NOT HAPPEN ────────────────────
// `performUndoRedo.ts` carried `pool` and `water` as `{ owner: 'nothing' }` with a
// four-axis measurement (L-980, 2026-08-18) concluding the family was UNREACHABLE, so
// "Ctrl+Z after a pool is therefore not a live defect". That measurement was HONEST
// AND IS NOW STALE — three of its four axes have since been closed by other lanes:
//
//   (1) *"`new PoolStore()` appears ZERO times repo-wide"* → FALSE.
//       `PluginRegistry.ts` builds `new PoolStore()` and `new WaterStore()`.
//   (2) *"PluginRegistry declares no `pool`/`water` storeKey, so the bus THROWS"* →
//       FALSE. Both descriptors are declared; `buildContext` resolves.
//   (3) *"no tool, toolbar entry or plan handler dispatches `pool.create`"* → FALSE.
//       `PoolPlanToolHandler._commit()` dispatches it, and the LANDSCAPE section of
//       the create panel has a live "Swimming Pool" button.
//   (4) AI chat class B — STILL TRUE, and untouched here.
//
// So the pool moved into exactly the state that comment describes as "the OPPOSITE":
// fully REACHABLE, and therefore actually stranded. The rows did not move with it.
// ⭐ A stale honest measurement outranks no measurement right up until the world
// changes underneath it, which is why the fix updates the ROWS in the same commit as
// the adapters — never one without the other.
//
// ── ⭐ BUILT ON §LIFT94's SHAPE, NOT FORKED FROM IT ─────────────────────────────
// `liftUndoAdapter.ts` (L-11340) closed the identical defect for the C104 lift one day
// earlier, itself following the boundary-line adapter (L-11160). This module is that
// pattern applied to a third family — lazy store resolution off the composed runtime at
// APPLY time, a registered render sink rather than a re-emitted bus event, and a NAMED
// throw when the runtime is absent. Nothing here is a new mechanism; if a fourth
// compound needs one, it needs THIS, not a fourth spelling of it.
//
// ── WHERE THIS IS SIMPLER THAN THE LIFT, AND WHY THAT IS NOT AN OVERSIGHT ────────
// The lift defers its render to a microtask because `applyRingBufferSide` walks
// `affectedStores` IN DECLARATION ORDER, so its compound adapter runs before
// `liftPart` has landed and a redo would draw an empty shaft.
//
// ⛔ THE POOL HAS NO SUCH COUPLING, BY CONSTRUCTION. A `water` record is
// SELF-SUFFICIENT for rendering: `boundary`, `surfaceElevation`, `bottomElevation`,
// `color` and `opacity` are all on the record, all absolute, and none of them is
// derived from another store at draw time. That is not luck — it is the property
// ADR-0124 §4 bought when it refused to model water as a slab. So the render happens
// synchronously, immediately after this store's own patch has applied, and it cannot
// be made wrong by reordering `affectedStores`.
//
// ── WHAT THIS MODULE DELIBERATELY DOES **NOT** RENDER ───────────────────────────
// ⛔ NOT the basin walls, NOT the pool floor, NOT the hole in the host slab. Those are
// real `wall` and `slab` records in the LEGACY element stores, already covered by
// `adaptElementStoreMap`, and re-drawn by their own families' undo path. ADR-0124 §3's
// whole argument is that a pool wall IS a wall; drawing it a second time from here
// would be the double-render C104 §13 forbids for the lift, for the same reason.
// ⛔ And NOT the `pool` record itself — it "carries NO geometry of its own"
// (ADR-0124 §3, and `PoolAssembly.ts` has no builder). Its adapter below therefore
// emits nothing, and says so rather than leaving a reader to wonder.

import type { Patch } from '@pryzm/command-bus';
import type { PatchApplicableAdapter } from './elementUndoStoreAdapter.js';
import type { PatchableRecordStore } from './pluginStoreUndoAdapter.js';

/**
 * The render payload — structurally identical to `WaterRenderInput` in
 * `WaterMeshBuilder` and to the `water.created` bus payload the §FT-WATER subscriber
 * builds. Declared structurally so the undo module and the builder stay decoupled.
 */
export interface WaterRenderInputLike {
    readonly id: string;
    readonly levelId?: string;
    readonly poolId?: string;
    readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
    readonly surfaceElevation?: number;
    readonly bottomElevation?: number;
    readonly color?: string;
    readonly opacity?: number;
}

/**
 * The seam `initTools.ts` fills with the live `WaterMeshBuilder`. Two methods, both of
 * which that builder already has (`updateWater` / `removeWater`) — this adapter mints
 * no new render capability, it only reaches the existing one from the undo path.
 */
export interface WaterRenderSink {
    update(input: WaterRenderInputLike): void;
    remove(waterId: string): void;
}

let _sink: WaterRenderSink | null = null;

/**
 * Called once from `initTools.ts` (§FT-WATER), where the builder is in scope.
 *
 * ⚠ An absent sink is NOT an error: headless runs, unit tests and the server bundle
 * have no scene. The PATCH still applies — the model reverts correctly — and only the
 * redraw is skipped. That is the honest split, and it is the lift adapter's rule
 * verbatim: a missing RENDERER must not fail an undo, and a missing STORE must.
 */
export function registerWaterRenderSink(sink: WaterRenderSink | null): void {
    _sink = sink;
}

/** Test-only reset so one spec's sink cannot leak into the next. */
export function __resetWaterRenderSinkForTests(): void {
    _sink = null;
}

/** What both adapters need at apply time. */
export interface PoolUndoStores {
    readonly pool: PatchableRecordStore;
    readonly water: PatchableRecordStore;
}

function _applyOrThrow(
    storeKey: 'pool' | 'water',
    patches: readonly Patch[],
    live: PoolUndoStores | null,
): { added: ReadonlySet<string>; updated: ReadonlySet<string>; removed: ReadonlySet<string> } {
    if (live === null) {
        // ⛔ NEVER a silent no-op. `_covered()` saw a working `applyPatch` and promised
        // this side would land; if the runtime is genuinely absent, the promise is
        // broken and `applyRingBufferSide` must report it as a per-store FAILURE.
        // Returning empty sets here would make a broken undo indistinguishable from a
        // successful one — L-980's rule, kept rather than bent.
        throw new Error(
            '[undo] ' + storeKey + ': runtime.stores.' + storeKey + ' is not reachable — the ' +
            'composed runtime is absent, so the inverse was NOT applied (L-11350, C03 §4.7 B1).',
        );
    }
    return live[storeKey].applyPatch(patches);
}

/**
 * Adapter for storeKey `pool` — the ADR-0124 assembly PARENT record.
 *
 * ⭐ IT RENDERS NOTHING, AND THAT IS THE CONTRACT, NOT A GAP. The pool record is
 * "identity, parametric intent, and the OWNER of four kinds of part" (ADR-0124 §3) and
 * carries no geometry; every one of its parts is a record in another store with its own
 * undo coverage. This adapter exists solely so `_covered()` can see a real `applyPatch`
 * for the `pool` key — which is the entire reason the four-store PatchPair was being
 * declined.
 */
export function poolUndoAdapter(resolve: () => PoolUndoStores | null): PatchApplicableAdapter {
    return {
        applyPatch(patches: readonly Patch[]): void {
            _applyOrThrow('pool', patches, resolve());
        },
    };
}

/**
 * Adapter for storeKey `water` — the one pool member with a mesh of its own.
 *
 * Renders synchronously off the record it has just applied. See the header for why no
 * microtask deferral is needed here and is needed for the lift.
 */
export function waterUndoAdapter(resolve: () => PoolUndoStores | null): PatchApplicableAdapter {
    return {
        applyPatch(patches: readonly Patch[]): void {
            const live = resolve();
            const diff = _applyOrThrow('water', patches, live);
            flushWaterRender([...diff.removed, ...diff.added, ...diff.updated], resolve);
        },
    };
}

/**
 * Redraw (or tear down) every water id touched by the patch side just applied.
 *
 * Exported so a test can drive it directly against the REAL function the adapter calls,
 * rather than a re-implementation of it — the "fake built from the header cannot
 * falsify the header" trap.
 */
export function flushWaterRender(waterIds: readonly string[], resolve: () => PoolUndoStores | null): void {
    const sink = _sink;
    if (sink === null) return;
    const live = resolve();
    if (live === null) return;

    for (const waterId of waterIds) {
        const rec = live.water.get?.(waterId) as Record<string, unknown> | undefined;
        if (rec === undefined) {
            // The inverse removed the water record — tear the body down. This is the
            // half that makes "Ctrl+Z removes the pool" true on SCREEN and not only in
            // the store.
            try { sink.remove(waterId); }
            catch (err) { console.error('[undo] water: removeWater failed for ' + waterId + ':', err); }
            continue;
        }
        try {
            sink.update({
                id:               waterId,
                levelId:          rec['levelId'] as string | undefined,
                poolId:           rec['poolId'] as string | undefined,
                boundary:         rec['boundary'] as WaterRenderInputLike['boundary'],
                // ⚠ Read as stored. NEVER re-derived from a depth and a freeboard: the
                // two elevations are independent by design and recomputing either here
                // would rebuild the blue slab inside the undo path (ADR-0124 §4.1).
                surfaceElevation: rec['surfaceElevation'] as number | undefined,
                bottomElevation:  rec['bottomElevation'] as number | undefined,
                color:            rec['color'] as string | undefined,
                opacity:          rec['opacity'] as number | undefined,
            });
        } catch (err) {
            console.error('[undo] water: updateWater failed for ' + waterId + ':', err);
        }
    }
}

/** The production resolver: both stores off the composed runtime. */
export function resolvePoolStoresFromWindow(): PoolUndoStores | null {
    if (typeof window === 'undefined') return null;
    const rt = (window as unknown as {
        runtime?: { stores?: { pool?: unknown; water?: unknown } };
    }).runtime;
    const pool = rt?.stores?.pool as PatchableRecordStore | undefined;
    const water = rt?.stores?.water as PatchableRecordStore | undefined;
    if (!pool || typeof pool.applyPatch !== 'function') return null;
    if (!water || typeof water.applyPatch !== 'function') return null;
    return { pool, water };
}
