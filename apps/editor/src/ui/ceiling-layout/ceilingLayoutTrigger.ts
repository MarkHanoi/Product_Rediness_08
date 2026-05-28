// Ceiling Layout — single shared trigger (mirrors furnish/lightingLayoutTrigger).
//
// Entry points:
//   • Console: `window.pryzmCeilAllRooms()` — manual test.
//   • Auto-fire: subscribes to 'apartment.layout-executed' and emits
//     'ceiling.layout-execute' on the next tick. The full apartment
//     pipeline now reads as: generate → walls/doors → redetect → CEIL →
//     furnish → light. Ceilings come BEFORE furniture so the architect
//     sees an enclosed shell as the first 3-D milestone after the walls.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { CeilingLayoutExecutor } from './CeilingLayoutExecutor.js';

const _executor = new CeilingLayoutExecutor();

declare global {
    interface Window {
        pryzmCeilAllRooms?: () => void;
    }
}

export function triggerCeilingLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[ceiling-layout] trigger invoked');
        if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }
        _executor.attach(rt);
        toast('Ceiling rooms…', 'info');
        rt.events.emit('ceiling.layout-execute', {});
    } catch (err) {
        console.error('[ceiling-layout] trigger threw:', err);
        toast(`Ceiling trigger failed: ${String(err)}`, 'error');
    }
}

/** Install the DevTools console command + auto-fire AFTER 'apartment.layout-
 *  executed'. Idempotent. */
export function installCeilingLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmCeilAllRooms = () => triggerCeilingLayout(runtime);
        console.log('[ceiling-layout] console command ready — run pryzmCeilAllRooms() to auto-ceiling all rooms.');
    }
    if (runtime) {
        _executor.attach(runtime);
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        events.on?.('apartment.layout-executed', () => {
            // Defer one tick so REDETECT_ROOMS finishes settling — same
            // pattern as furnishLayoutTrigger used to use here.
            setTimeout(() => {
                console.log('[ceiling-layout] apartment.layout-executed → auto-ceiling.');
                runtime.events.emit('ceiling.layout-execute', {});
            }, 0);
        });
        console.log('[ceiling-layout] auto-fire on apartment.layout-executed: wired.');
    }
}
