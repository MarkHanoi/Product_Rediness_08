// Furnish Layout — single shared trigger (mirrors apartmentLayoutTrigger).
//
// Used by:
//   • The console command `window.pryzmFurnishAllRooms()`.
//   • Auto-fire after `apartment.layout-executed` so the apartment-generator
//     hand-off into furnishing is one continuous flow (architect-friendly).
//   • Any future AI-panel UI button.
//
// Owns the per-session executor singleton so attaching is idempotent no matter
// which entry point fires. Always logs a [furnish-layout] marker + always
// surfaces a toast, so the trigger can never silently do nothing.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { FurnishLayoutExecutor } from './FurnishLayoutExecutor.js';

const _executor = new FurnishLayoutExecutor();

declare global {
    interface Window {
        // `runtime` is already declared as `any` elsewhere — don't re-declare it.
        pryzmFurnishAllRooms?: () => void;
    }
}

/** Fire the deterministic furniture-layout engine on every furnishable room
 *  on the active level. Safe from the AI panel or the DevTools console. */
export function triggerFurnishLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[furnish-layout] trigger invoked');
        if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }
        _executor.attach(rt);
        toast('Furnishing rooms…', 'info');
        rt.events.emit('furnish.layout-execute', {});
    } catch (err) {
        console.error('[furnish-layout] trigger threw:', err);
        toast(`Furnish trigger failed: ${String(err)}`, 'error');
    }
}

/** Install the DevTools console command `window.pryzmFurnishAllRooms()`,
 *  AND auto-fire furnishing after every apartment-layout build. Idempotent. */
export function installFurnishLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmFurnishAllRooms = () => triggerFurnishLayout(runtime);
        console.log('[furnish-layout] console command ready — run pryzmFurnishAllRooms() to furnish all rooms.');
        // §FULL-PIPELINE shortcut: chain furniture + lighting on demand for the
        // manual-walls test case (architect drew walls themselves; the
        // apartment generator never fired, so the auto-chain didn't start).
        const w = window as unknown as {
            pryzmLightAllRooms?: () => void;
            pryzmFurnishAndLightAllRooms?: () => void;
        };
        w.pryzmFurnishAndLightAllRooms = (): void => {
            triggerFurnishLayout(runtime);
            // The furnish run emits 'furnish.layout-executed' which auto-fires
            // the lighting trigger — no explicit lighting call needed.
        };
        console.log('[furnish-layout] full-pipeline shortcut ready — run pryzmFurnishAndLightAllRooms() to furnish + auto-light in one go.');
    }
    if (runtime) {
        _executor.attach(runtime);
        // Auto-fire AFTER the apartment-layout build settles. The apartment-
        // layout executor emits `apartment.layout-executed` AFTER the room
        // redetect, so the room store is populated when we kick off.
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        events.on?.('apartment.layout-executed', () => {
            // Defer one tick so REDETECT_ROOMS finishes settling.
            setTimeout(() => {
                console.log('[furnish-layout] apartment.layout-executed → auto-furnishing.');
                runtime.events.emit('furnish.layout-execute', {});
            }, 0);
        });
        console.log('[furnish-layout] auto-fire on apartment.layout-executed: wired.');
    }
}
