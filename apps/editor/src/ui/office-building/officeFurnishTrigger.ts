// §OFFICE-ARCH-FURNISH-SPLIT (Phase 1) — Command 2 console/AI trigger: `pryzmFurnishOffice()`.
//
// Mirrors the furnish-layout console triggers (installFurnishLayoutTrigger / triggerFurnishLayout):
// registers `window.pryzmFurnishOffice()` + exports a `triggerFurnishOffice()` the AI Commands
// dropdown calls. It reads the office architecture Command 1 stashed (officeBuildContext) and runs
// the interior fit-out (desks/chairs/reception/collab/cafe) via the command bus — WITHOUT
// regenerating architecture (SPEC §1). If no office has been built this session it toasts + no-ops.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { getOfficeFurnishContext } from './officeBuildContext.js';
import { furnishOfficeInterior } from './officeFurnish.js';

declare global {
    interface Window {
        pryzmFurnishOffice?: () => void;
    }
}

/** §OFFICE-ARCH-FURNISH-SPLIT — Command 2. Furnish the LAST-built office architecture. Safe from
 *  the AI panel or the DevTools console. Never throws. */
export function triggerFurnishOffice(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[office-furnish] Furnish Office trigger invoked');
        const ctx = getOfficeFurnishContext();
        if (!ctx) {
            console.warn('[office-furnish] no office architecture found — generate an office first (Command 1).');
            toast('Generate an office first, then Furnish Office.', 'warn');
            return;
        }
        toast('Furnishing the office…', 'info');
        const res = furnishOfficeInterior(ctx);
        console.log(`[office-furnish] scheduled ${res.furnitureCount} furniture + ${res.lightCount} light(s)`);
        toast(`Office furnished — ${res.furnitureCount} furniture + ${res.lightCount} light(s) added.`, 'success');
    } catch (err) {
        console.error('[office-furnish] trigger threw:', err);
        toast(`Furnish Office failed: ${String(err)}`, 'error');
    }
}

/** Register the `pryzmFurnishOffice()` console command. Idempotent. */
export function installOfficeFurnishConsoleTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window === 'undefined') return;
    window.pryzmFurnishOffice = () => void triggerFurnishOffice(runtime);
    console.log('[office-furnish] console command ready — pryzmFurnishOffice() furnishes the last-built office.');
}
