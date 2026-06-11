// Casa Unifamiliar — multi-storey HOUSE post-generation chain orchestrator (A.21.i).
//
// PROBLEM: the post-generation finish chain (floor → ceiling → furnish → light)
// is event-driven and EACH stage resolves the ACTIVE level internally
// (`resolveActiveLevel()` / `resolveActiveLevelId()`). The apartment path fires
// the chain ONCE on the active level — correct for a single plate. A multi-storey
// HOUSE builds walls/stairs/roof on every storey but the chain still ran on the
// active level only, so the upper storeys came out bare (no floors / ceilings /
// furniture / lights).
//
// FIX (ADDITIVE): a house-side orchestrator that fans the EXISTING per-level
// finish chain out across every storey level. For each storey, in sequence, it:
//   1. sets that storey ACTIVE (`window.projectContext.activeLevelId`), so the
//      unchanged per-stage executors resolve THAT level,
//   2. runs floor + ceiling (parallel, neither depends on the other),
//   3. then furnish, then lighting — preserving the apartment ordering,
//   4. waits for the chain terminus (`lighting.layout-executed`) before
//      advancing to the next storey, so storeys never race.
//
// It REUSES the existing per-level logic verbatim — it drives the SAME trigger
// entry points the apartment chain uses (`triggerFloorLayout`,
// `ceiling.layout-execute`, `furnish.layout-execute`, `lighting.layout-execute`)
// and sequences on the existing `*.layout-executed` completion events. It does
// NOT re-fire `apartment.layout-executed` (that would re-trigger the GIS/Forma
// massing + Cesium re-place + the auto-fire handlers per storey). The apartment
// single-level path is therefore byte-for-byte unchanged — this code only ever
// runs for a house build.
//
// P6: all mutation still flows through the per-stage executors' command bus
// dispatch (this orchestrator issues NO direct store writes — only the active-
// level setter, which the LevelManagerPanel / ActiveLevelHUD already use). P3:
// no raw rAF — sequencing uses the runtime event bus + a bounded setTimeout
// safety timer, mirroring the §CHAIN-TIMEOUT pattern the apartment triggers use.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { batchCoordinator } from '@pryzm/core-app-model';
import { triggerFloorLayout } from '../floor-layout/floorLayoutTrigger.js';
import { beginHouseFanout, endHouseFanout } from './houseFanoutGuard.js';

interface ProjectContextLike { activeLevelId?: string | null }
interface EventsLike {
    on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
    emit: (k: string, p: unknown) => void;
}

/**
 * §POSTGEN-SETTLE / §BN-07 (2026-06-11) — yield the main thread until the batch
 * the just-dispatched stage opened has FULLY SETTLED, then let its deferred work
 * drain a few frames before the next stage enqueues more geometry.
 *
 * WHY: each finish stage (ceiling / furnish / lighting) dispatches a
 * `batchCoordinator.runBatch`, then the executor emits its `*.layout-executed`
 * event SYNCHRONOUSLY the instant `runBatch` RETURNS. But `runBatch` returns long
 * before the batch's async tail runs: the deferred resume-flush rAF, the first
 * post-suppress render (WebGPU PSO compile LONGTASK), and the deferred PBR upgrade
 * (whole-scene traverse, skipPbrUpgrade defaults to false for these geometry
 * batches). The old chain `await`ed only the synchronous `*.layout-executed`
 * event, so it raced straight on to the next storey/stage — piling overlapping
 * batches whose PSO-compile + PBR passes saturated the main thread back-to-back.
 * The deferred resume-flush rAF could then not get a slot for tens of seconds
 * (`§BN-07 DEFERRED-RESUME-FLUSH delayed 51086ms`).
 *
 * FIX: after a batch-bearing stage, await `batchCoordinator.onNextSettle` (fires
 * after the batch's onComplete flips isBatching=false — all events delivered,
 * registrations drained, redetect kicked), then yield a couple of `post-render`
 * frames + one idle slot so the PSO-compile / PBR-upgrade tail can run BEFORE the
 * next batch opens. Serializing storeys against true completion (not the sync
 * event) is behaviour-preserving — the same batches run, the same final scene
 * results — it only spaces them so the rAF is never starved.
 *
 * Bounded so a missing/never-settling batch never strands the chain.
 *
 * Yielding is done with macrotask (`setTimeout(0)`) ticks rather than a raw
 * `requestAnimationFrame` (P3: the editor owns no rogue rAF). Each `setTimeout(0)`
 * returns control to the event loop, which lets the browser interleave its own
 * rAF callbacks — the deferred resume-flush, the first post-suppress render (PSO
 * compile) and the requestIdleCallback-scheduled PBR upgrade all get to run before
 * we resolve. Macrotask yields also keep the helper testable in a non-rAF node
 * env (no dependency on the frame-scheduler pump being live).
 */
function yieldBatchSettled(timeoutMs = 8_000): Promise<void> {
    return new Promise<void>(resolve => {
        let done = false;
        const finish = (): void => { if (done) return; done = true; clearTimeout(guard); resolve(); };
        const guard = setTimeout(finish, timeoutMs);
        try {
            batchCoordinator.onNextSettle(() => {
                // Batch settled. Let the deferred tail (resume-flush rAF, first
                // post-suppress render / PSO compile, PBR-upgrade traverse) get a
                // few event-loop turns before we resolve and the next stage enqueues
                // more work. A small fixed number of macrotask yields, then one idle
                // slot for the requestIdleCallback-scheduled PBR upgrade.
                let yields = 3;
                const drain = (): void => {
                    if (--yields > 0) { setTimeout(drain, 0); return; }
                    const settleIdle = (): void => finish();
                    if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(settleIdle, { timeout: 1_000 });
                    else setTimeout(settleIdle, 0);
                };
                setTimeout(drain, 0);
            });
        } catch (e) {
            console.warn('[house-postgen] §POSTGEN-SETTLE onNextSettle threw — advancing without settle wait:', e);
            finish();
        }
    });
}

/** Per-stage settle budgets. The chain is async (command-bus drains + the
 *  redetect already ran in the house batch) — generous fallbacks so one slow /
 *  silent stage never strands the per-storey fan-out, but the happy path
 *  advances the instant the stage's `*.layout-executed` event lands. */
const FLOOR_CEILING_SETTLE_MS = 6_000;   // floor+ceiling have no joint terminus
const FURNISH_TIMEOUT_MS = 12_000;
const LIGHTING_TIMEOUT_MS = 12_000;
/** §A.21.D25 — how long to wait for THIS storey's rooms to be NAMED (occupancy
 *  tagged) before furnishing it. The naming pass (`nameDetectedRooms`) is async
 *  (room-store subscription + 80 ms settle, or its own 2.5 s hard-timeout), and
 *  it emits `apartment.room-name-completed {levelId}` when done. We MUST await
 *  the GROUND storey's naming before its furnish runs — otherwise ground furnish
 *  fires against un-tagged rooms → 0 furniture on the ground floor while later
 *  (slower-to-furnish) storeys come out furnished. That was the "only the top
 *  floor has furniture" bug. The budget exceeds the naming pass's own 2.5 s hard-
 *  timeout so we never advance before naming has had its full chance. */
const ROOM_NAME_TIMEOUT_MS = 3_500;

/** Set the active level the way the level panels do (the per-stage executors
 *  read `window.projectContext.activeLevelId` via `resolveActiveLevelId`). */
function setActiveLevel(levelId: string): void {
    try {
        const pc = (window as unknown as { projectContext?: ProjectContextLike }).projectContext;
        if (pc) pc.activeLevelId = levelId;
    } catch (e) { console.warn('[house-postgen] could not set active level', levelId, e); }
}

/** Wait for a one-shot runtime event, or resolve after `timeoutMs` regardless.
 *  An optional `match` predicate filters payloads (e.g. only the event for THIS
 *  storey's levelId) — events that don't match are ignored, the wait continues. */
function waitForEvent(
    events: EventsLike,
    key: string,
    timeoutMs: number,
    match?: (payload: unknown) => boolean,
): Promise<void> {
    return new Promise<void>(resolve => {
        let done = false;
        const sub = events.on?.(key, (payload: unknown) => { if (!match || match(payload)) finish(); });
        const off: () => void = typeof sub === 'function' ? sub : () => { /* */ };
        function finish(): void { if (done) return; done = true; off(); resolve(); }
        setTimeout(finish, timeoutMs);
    });
}

/** Per-storey hook the executor supplies so the orchestrator can DRIVE this
 *  storey's room-naming pass at the right moment in the sequence (right before
 *  the storey is furnished), rather than naming every storey up-front with a
 *  flat wait. §A.21.D25. */
export type NameStoreyFn = (levelId: string) => void;

/** Run the full finish chain (name → floor + ceiling → furnish → light) for ONE
 *  storey level. Sets the level active first so every unchanged per-stage
 *  executor resolves THIS level, then drives + awaits each stage. */
async function runChainForLevel(
    runtime: PryzmRuntime,
    levelId: string,
    nameStorey?: NameStoreyFn,
): Promise<void> {
    const events = runtime.events as unknown as EventsLike;
    setActiveLevel(levelId);

    // §DIAG-POSTGEN-TIMING (2026-06-11) — per-step elapsed so the next prod run
    // quantifies which finish-chain step costs what main-thread time. Logged at
    // each step boundary (storey · step · elapsed ms since the storey started and
    // since the previous step). The numbers include the §POSTGEN-SETTLE yield, so
    // a high "settleMs" on furnish/lighting localises the PSO/PBR drain cost.
    const storeyT0 = performance.now();
    let lastStepT = storeyT0;
    const diagStep = (step: string): void => {
        const now = performance.now();
        console.log(
            `[house-postgen] §DIAG-POSTGEN-TIMING storey=${levelId} step=${step} ` +
            `stepMs=${(now - lastStepT).toFixed(0)} cumMs=${(now - storeyT0).toFixed(0)}`,
        );
        lastStepT = now;
    };

    // 0. §A.21.D25 — NAME this storey's rooms (occupancy-tag them) and AWAIT
    //    completion BEFORE furnishing. Furnish/floor/ceiling all key off each
    //    room's occupancy; if we furnish before naming finishes, the engine sees
    //    un-tagged rooms and places nothing. Naming all storeys up-front with one
    //    flat wait let the GROUND storey's furnish race ahead of its naming → the
    //    ground floor came out bare while later storeys (named by the time they
    //    ran) got furniture. Sequencing naming PER STOREY, inline, closes that
    //    race. `nameDetectedRooms` emits `apartment.room-name-completed {levelId}`
    //    when this level is tagged; we wait for THAT level's event (or the budget).
    if (nameStorey) {
        console.log('[house-postgen] storey', levelId, '→ naming rooms');
        const named = waitForEvent(
            events,
            'apartment.room-name-completed',
            ROOM_NAME_TIMEOUT_MS,
            (p) => (p as { levelId?: string } | undefined)?.levelId === levelId,
        );
        try { nameStorey(levelId); } catch (e) { console.warn('[house-postgen] nameStorey threw for', levelId, e); }
        await named;
        diagStep('name');
    }

    // 1. Floor + ceiling — parallel (neither bounds rooms; same as the apartment
    //    chain where both fire off apartment.layout-executed). Floor is a direct
    //    synchronous command dispatch; ceiling emits its execute event. There is
    //    no single joint "floor+ceiling done" event, so we await the ceiling
    //    terminus (the slower of the two) with a settle budget.
    console.log('[house-postgen] storey', levelId, '→ floor + ceiling');
    triggerFloorLayout(runtime);
    const ceilingDone = waitForEvent(events, 'ceiling.layout-executed', FLOOR_CEILING_SETTLE_MS);
    // Defer the ceiling execute one tick (mirrors the apartment trigger's
    // setTimeout(...,0) so any pending redetect microtasks settle first).
    await new Promise<void>(r => setTimeout(r, 0));
    events.emit('ceiling.layout-execute', {});
    await ceilingDone;
    // §POSTGEN-SETTLE — the ceiling executor opened a runBatch and emitted
    // `ceiling.layout-executed` the instant it RETURNED. Wait for that batch to
    // truly settle + drain its PSO-compile/PBR tail before furnish enqueues more.
    await yieldBatchSettled();
    diagStep('floor+ceiling');

    // 2. Furnish — after the shell is enclosed (apartment ordering).
    console.log('[house-postgen] storey', levelId, '→ furnish');
    const furnishDone = waitForEvent(events, 'furnish.layout-executed', FURNISH_TIMEOUT_MS);
    events.emit('furnish.layout-execute', {});
    await furnishDone;
    // §POSTGEN-SETTLE — furniture is the heaviest finish batch (dozens–hundreds of
    // meshes with many distinct material variants → the largest PSO-compile + PBR
    // pass). Let it fully settle before lighting/next storey stacks onto it.
    await yieldBatchSettled();
    diagStep('furnish');

    // 3. Lighting — the chain terminus for this storey.
    console.log('[house-postgen] storey', levelId, '→ lighting');
    const lightingDone = waitForEvent(events, 'lighting.layout-executed', LIGHTING_TIMEOUT_MS);
    events.emit('lighting.layout-execute', {});
    await lightingDone;
    // §POSTGEN-SETTLE — drain the lighting batch before the next storey begins, so
    // the per-storey loop never opens storey N+1's batches on top of storey N's
    // still-pending deferred resume-flush (the §BN-07 starvation).
    await yieldBatchSettled();
    diagStep('lighting');

    console.log(
        `[house-postgen] storey ${levelId} ✓ finish chain complete ` +
        `(§DIAG-POSTGEN-TIMING totalMs=${(performance.now() - storeyT0).toFixed(0)})`,
    );
}

/**
 * Fan the post-generation finish chain out across EVERY storey of a generated
 * house, in sequence (so storeys don't race on the shared active-level + stores).
 * Restores the originally-active level when done. Never throws.
 *
 * @param runtime  the live runtime (event bus + toasts).
 * @param levelIds the storey level ids the HouseLayoutExecutor built, ground-first.
 * @param nameStorey OPTIONAL §A.21.D25 — per-storey room-naming driver. When
 *   supplied, the orchestrator calls it for each storey AND awaits that storey's
 *   `apartment.room-name-completed` event BEFORE furnishing it, so rooms are
 *   occupancy-tagged before furnish runs on EVERY storey (ground included). When
 *   omitted, behaviour is unchanged (legacy callers that named up-front).
 */
export async function runHousePostGenChain(
    runtime: PryzmRuntime,
    levelIds: readonly string[],
    nameStorey?: NameStoreyFn,
): Promise<void> {
    const unique = [...new Set(levelIds)].filter(id => typeof id === 'string' && id.length > 0);
    if (unique.length === 0) { console.warn('[house-postgen] no storey levels — nothing to finish'); return; }

    const pc = (window as unknown as { projectContext?: ProjectContextLike }).projectContext;
    const originalActive = pc?.activeLevelId ?? undefined;
    console.log('[house-postgen] finishing', unique.length, 'storey(s):', unique);

    // Suppress the apartment cascade handlers (furnish-on-ceiling-done,
    // lighting-on-furnish-done) while WE drive each stage explicitly — otherwise
    // the executors' completion events would double-fire furnish/lighting.
    beginHouseFanout();
    try {
        for (const levelId of unique) {
            try {
                await runChainForLevel(runtime, levelId, nameStorey);
            } catch (e) {
                console.warn('[house-postgen] finish chain failed on storey', levelId, '(continuing):', e);
            }
        }
        runtime.events?.emit('pryzm:toast', {
            message: `Finished all ${unique.length} storey(s) — floors, ceilings, furniture & lighting placed.`,
            severity: 'success',
        });
    } finally {
        endHouseFanout();
        // Restore the storey the user was on before the fan-out (default: ground).
        if (typeof originalActive === 'string' && originalActive.length > 0) setActiveLevel(originalActive);
        else setActiveLevel(unique[0]!);
    }
}
