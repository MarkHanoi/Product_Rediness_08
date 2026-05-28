// Lighting Layout — single shared trigger (mirrors furnishLayoutTrigger).
//
// Entry points:
//   • Console: `window.pryzmLightAllRooms()` — manual test.
//   • Auto-fire: subscribes to 'furnish.layout-executed' and emits
//     'lighting.layout-execute' on the next tick. The full apartment
//     pipeline now reads as: generate → walls/doors → redetect → furnish
//     → LIGHT — one continuous architect-friendly flow.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { LightingLayoutExecutor } from './LightingLayoutExecutor.js';

const _executor = new LightingLayoutExecutor();

declare global {
    interface Window {
        pryzmLightAllRooms?: () => void;
    }
}

export function triggerLightingLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[lighting-layout] trigger invoked');
        if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }
        _executor.attach(rt);
        toast('Lighting rooms…', 'info');
        rt.events.emit('lighting.layout-execute', {});
    } catch (err) {
        console.error('[lighting-layout] trigger threw:', err);
        toast(`Lighting trigger failed: ${String(err)}`, 'error');
    }
}

/** Install the DevTools console command + auto-fire AFTER 'furnish.layout-
 *  executed'. Idempotent. */
export function installLightingLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmLightAllRooms = () => triggerLightingLayout(runtime);
        console.log('[lighting-layout] console command ready — run pryzmLightAllRooms() to auto-light all rooms.');
    }
    if (runtime) {
        _executor.attach(runtime);
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        events.on?.('furnish.layout-executed', () => {
            // Defer one tick so furniture has finished settling in the store.
            setTimeout(() => {
                console.log('[lighting-layout] furnish.layout-executed → auto-lighting.');
                runtime.events.emit('lighting.layout-execute', {});
            }, 0);
        });
        console.log('[lighting-layout] auto-fire on furnish.layout-executed: wired.');
    }
}
