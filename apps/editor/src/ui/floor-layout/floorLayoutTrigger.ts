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
    execute?: (cmd: unknown, opts?: { source?: string }) => { success?: boolean; info?: string[] } | undefined;
}

/** Run the deterministic floor-finish pass for the active level. Safe from
 *  the AI panel or the DevTools console. */
export function triggerFloorLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[floor-layout] trigger invoked');
        if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }
        const lid = resolveActiveLevelId();
        if (!lid) { toast('No active level — create or open a level first.', 'error'); return; }

        const cm = (window as unknown as { commandManager?: CommandManagerLike }).commandManager;
        if (!cm?.execute) {
            console.warn('[floor-layout] commandManager.execute not available — skipping floor finish.');
            toast('Command system not ready — try again in a moment.', 'error');
            return;
        }
        // §A.21.D-FLOOR — read the brief style so floors get a realistic, style-
        // appropriate finish (wood plank / porcelain tile) per room type.
        const style = (getActiveDesignMetadata()?.style as string | undefined);
        // §A.21.D29 #1 — any stairwell void(s) the house executor recorded for THIS
        // level (the stair pierced its slab; we cut the matching hole in the finish so
        // the stairwell stays open through the floor plate, not just the structure).
        // Empty for the apartment + single-storey paths (no stairs) → no holes.
        const voids = getStairVoidsForLevel(lid);
        const cmd = new CreateFloorsByRoomTypeCommand(lid, style, voids);
        if (voids.length > 0) console.log('[floor-layout] §VOID-FINISH cutting', voids.length, 'stairwell void(s) into the finish on', lid);
        const res = cm.execute(cmd, { source: 'APARTMENT_PIPELINE_FLOOR' });
        if (res?.success) {
            console.log('[floor-layout]', (res.info ?? []).join(' '));
        } else {
            console.warn('[floor-layout] CreateFloorsByRoomType returned non-success:', res);
        }
    } catch (err) {
        console.error('[floor-layout] trigger threw:', err);
        toast(`Floor-finish trigger failed: ${String(err)}`, 'error');
    }
}

/** Install the DevTools console command + auto-fire AFTER 'apartment.layout-
 *  executed'. Idempotent. */
export function installFloorLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmFloorAllRooms = () => triggerFloorLayout(runtime);
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
