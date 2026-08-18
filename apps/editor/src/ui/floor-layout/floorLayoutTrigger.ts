// Floor Finish Layout — single shared trigger (mirrors ceilingLayoutTrigger).
//
// Entry points:
//   • Console: `window.pryzmFloorAllRooms()` — manual test.
//   • Auto-fire: subscribes to `apartment.layout-executed` and dispatches
//     `CreateFloorsByRoomTypeCommand` on the next tick. Reads the canonical
//     room semantic state (`room.occupancyType`) and lays a floor finish in
//     each room — timber in living/bedroom, tile in kitchen/bathroom — per
//     SPEC-SEMANTIC §10 prompt #34. Composes the existing CreateFloorCommand
//     in one batchCoordinator.runBatch unit (one undo).
//
// The pipeline now reads:
//   apartment generate → walls/doors → redetect rooms → FLOOR + CEIL →
//   furnish → LIGHT.
//
// FLOOR and CEIL fire in parallel after apartment.layout-executed; neither
// depends on the other (floor + ceiling are both room-bound finishes that
// don't bound rooms themselves).

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { CreateFloorsByRoomTypeCommand } from '@pryzm/command-registry';
import { resolveActiveLevelId } from '../apartment-layout/activeLevel.js';
import { getActiveDesignMetadata } from '../apartment-layout/activeBrief.js';
import { getStairVoidsForLevel } from '../house-layout/houseStairVoids.js';

declare global {
    interface Window {
        pryzmFloorAllRooms?: () => void;
    }
}

interface CommandManagerLike {
    execute?: (cmd: unknown, opts?: { source?: string }) => {
        success?: boolean;
        info?: string[];
        affectedElementIds?: string[];
        error?: string;
    } | undefined;
}

/**
 * §FLOOR-FINISH-REFUSAL-HONESTY — what the floor pass ACTUALLY did.
 *
 * This function used to return `void`. That is the whole defect the founder
 * reported: `CreateFloorsByRoomTypeCommand` refuses with a reason AND a remedy
 * ("No rooms with a floor-mappable type — run Auto-Organise (tag rooms)
 * first."), `CommandManagerImpl.execute()` returns that verbatim in
 * `info[0]` — and this function `console.warn`ed it and returned nothing. The
 * chat seam above therefore had NOTHING to consult, pushed a canned success
 * line, and the user was told a floor existed and offered Ctrl+Z for it.
 *
 * A refusal is DATA, not a log line. Every exit path below now produces one of
 * these, so no caller can report an outcome it did not read.
 */
export type FloorLayoutOutcome =
    /** The command ran and succeeded. `floorsCreated` is its own
     *  `affectedElementIds` count — 0 is a real answer (every room already had a
     *  finish), never dressed up as "applied N". */
    | { readonly ok: true; readonly floorsCreated: number; readonly info: readonly string[] }
    /** Nothing was created, and this is why — the command's own sentence where
     *  there is one, this module's where the refusal happened before dispatch. */
    | { readonly ok: false; readonly reason: string };

/** Run the deterministic floor-finish pass for the active level. Safe from
 *  the AI panel or the DevTools console.
 *
 *  Returns the outcome (§FLOOR-FINISH-REFUSAL-HONESTY). Callers that only fire
 *  and forget (the house/resi post-gen chains) may ignore it exactly as before;
 *  any caller that REPORTS to a user must derive its sentence from it. */
export function triggerFloorLayout(
    runtimeArg?: PryzmRuntime | null,
    /** §RESI-CORRIDOR-FINISH-NO-DOUBLE — the resi pipeline lays its public corridor as ONE merged
     *  finish, so it passes `skipCirculation` to stop this per-room pass double-coating the cross. */
    opts?: { readonly skipCirculation?: boolean },
): FloorLayoutOutcome {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[floor-layout] trigger invoked');
        if (!rt) {
            const reason = 'Runtime not ready — reload the project.';
            toast(reason, 'error');
            return { ok: false, reason };
        }
        const lid = resolveActiveLevelId();
        if (!lid) {
            const reason = 'No active level — create or open a level first.';
            toast(reason, 'error');
            return { ok: false, reason };
        }

        const cm = (window as unknown as { commandManager?: CommandManagerLike }).commandManager;
        if (!cm?.execute) {
            console.warn('[floor-layout] commandManager.execute not available — skipping floor finish.');
            const reason = 'Command system not ready — try again in a moment.';
            toast(reason, 'error');
            return { ok: false, reason };
        }
        // §A.21.D-FLOOR — read the brief style so floors get a realistic, style-
        // appropriate finish (wood plank / porcelain tile) per room type.
        const style = (getActiveDesignMetadata()?.style as string | undefined);
        // §A.21.D29 #1 — any stairwell void(s) the house executor recorded for THIS
        // level (the stair pierced its slab; we cut the matching hole in the finish so
        // the stairwell stays open through the floor plate, not just the structure).
        // Empty for the apartment + single-storey paths (no stairs) → no holes.
        const voids = getStairVoidsForLevel(lid);
        const cmd = new CreateFloorsByRoomTypeCommand(lid, style, voids, { skipCirculation: opts?.skipCirculation });
        if (voids.length > 0) console.log('[floor-layout] §VOID-FINISH cutting', voids.length, 'stairwell void(s) into the finish on', lid);
        const res = cm.execute(cmd, { source: 'APARTMENT_PIPELINE_FLOOR' });
        if (res?.success) {
            console.log('[floor-layout]', (res.info ?? []).join(' '));
            return {
                ok: true,
                floorsCreated: res.affectedElementIds?.length ?? 0,
                info: res.info ?? [],
            };
        }
        // §FLOOR-FINISH-REFUSAL-HONESTY — the refusal sentence is ALREADY here.
        // `CommandManagerImpl.execute()` puts the command author's human reason
        // (via `childRefusalText`) in `info[0]`; `error` carries a throw that was
        // rolled back. Both are the user's answer, so both are returned. The
        // `console.warn` stays — the console line was never the problem, the
        // fact that it was the ONLY destination was.
        console.warn('[floor-layout] CreateFloorsByRoomType returned non-success:', res);
        const stated = (res?.info ?? []).filter((l) => typeof l === 'string' && l.length > 0);
        const reason = stated.length > 0
            ? stated.join(' ')
            : (res?.error ?? 'the floor-finish command refused and gave no reason.');
        return { ok: false, reason };
    } catch (err) {
        console.error('[floor-layout] trigger threw:', err);
        const reason = `Floor-finish trigger failed: ${String(err)}`;
        toast(reason, 'error');
        return { ok: false, reason };
    }
}

/** Install the DevTools console command + auto-fire AFTER 'apartment.layout-
 *  executed'. Idempotent. */
export function installFloorLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmFloorAllRooms = () => {
            const outcome = triggerFloorLayout(runtime);
            // §FLOOR-FINISH-REFUSAL-HONESTY — the MANUAL entry point had the same
            // hole as the chat one: a refusal reached the console and nowhere
            // else, so "no floor appeared" and "the command refused, here is
            // why" looked identical from the editor. The three pre-dispatch
            // branches inside the trigger already toast; only the ENGINE's own
            // refusal did not. Scoped to this entry point deliberately — the
            // house/resi post-gen chains call the trigger per level and get
            // their refusals through their own reporting.
            if (!outcome.ok) {
                (runtime ?? (window.runtime as unknown as PryzmRuntime | undefined))
                    ?.events?.emit('pryzm:toast', {
                        message: `No floor finish was created — ${outcome.reason}`,
                        severity: 'error',
                    });
            }
            return outcome;
        };
        console.log('[floor-layout] console command ready — run pryzmFloorAllRooms() to floor-finish every room.');
    }
    if (runtime) {
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        events.on?.('apartment.layout-executed', () => {
            // Defer one tick so REDETECT_ROOMS finishes settling — same
            // pattern the ceiling trigger uses. The floor pass reads
            // room.occupancyType, which is set during redetect.
            setTimeout(() => {
                console.log('[floor-layout] apartment.layout-executed → auto-floor-finish.');
                triggerFloorLayout(runtime);
            }, 0);
        });
        console.log('[floor-layout] auto-fire on apartment.layout-executed: wired.');
    }
}
