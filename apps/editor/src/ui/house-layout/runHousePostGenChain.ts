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
import { triggerFloorLayout } from '../floor-layout/floorLayoutTrigger.js';
import { beginHouseFanout, endHouseFanout } from './houseFanoutGuard.js';

interface ProjectContextLike { activeLevelId?: string | null }
interface EventsLike {
    on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
    emit: (k: string, p: unknown) => void;
}

/** Per-stage settle budgets. The chain is async (command-bus drains + the
 *  redetect already ran in the house batch) — generous fallbacks so one slow /
 *  silent stage never strands the per-storey fan-out, but the happy path
 *  advances the instant the stage's `*.layout-executed` event lands. */
const FLOOR_CEILING_SETTLE_MS = 6_000;   // floor+ceiling have no joint terminus
const FURNISH_TIMEOUT_MS = 12_000;
const LIGHTING_TIMEOUT_MS = 12_000;

/** Set the active level the way the level panels do (the per-stage executors
 *  read `window.projectContext.activeLevelId` via `resolveActiveLevelId`). */
function setActiveLevel(levelId: string): void {
    try {
        const pc = (window as unknown as { projectContext?: ProjectContextLike }).projectContext;
        if (pc) pc.activeLevelId = levelId;
    } catch (e) { console.warn('[house-postgen] could not set active level', levelId, e); }
}

/** Wait for a one-shot runtime event, or resolve after `timeoutMs` regardless. */
function waitForEvent(events: EventsLike, key: string, timeoutMs: number): Promise<void> {
    return new Promise<void>(resolve => {
        let done = false;
        const sub = events.on?.(key, () => finish());
        const off: () => void = typeof sub === 'function' ? sub : () => { /* */ };
        function finish(): void { if (done) return; done = true; off(); resolve(); }
        setTimeout(finish, timeoutMs);
    });
}

/** Run the full finish chain (floor + ceiling → furnish → light) for ONE storey
 *  level. Sets the level active first so every unchanged per-stage executor
 *  resolves THIS level, then drives + awaits each stage. */
async function runChainForLevel(runtime: PryzmRuntime, levelId: string): Promise<void> {
    const events = runtime.events as unknown as EventsLike;
    setActiveLevel(levelId);

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

    // 2. Furnish — after the shell is enclosed (apartment ordering).
    console.log('[house-postgen] storey', levelId, '→ furnish');
    const furnishDone = waitForEvent(events, 'furnish.layout-executed', FURNISH_TIMEOUT_MS);
    events.emit('furnish.layout-execute', {});
    await furnishDone;

    // 3. Lighting — the chain terminus for this storey.
    console.log('[house-postgen] storey', levelId, '→ lighting');
    const lightingDone = waitForEvent(events, 'lighting.layout-executed', LIGHTING_TIMEOUT_MS);
    events.emit('lighting.layout-execute', {});
    await lightingDone;

    console.log('[house-postgen] storey', levelId, '✓ finish chain complete');
}

/**
 * Fan the post-generation finish chain out across EVERY storey of a generated
 * house, in sequence (so storeys don't race on the shared active-level + stores).
 * Restores the originally-active level when done. Never throws.
 *
 * @param runtime  the live runtime (event bus + toasts).
 * @param levelIds the storey level ids the HouseLayoutExecutor built, ground-first.
 */
export async function runHousePostGenChain(
    runtime: PryzmRuntime,
    levelIds: readonly string[],
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
                await runChainForLevel(runtime, levelId);
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
