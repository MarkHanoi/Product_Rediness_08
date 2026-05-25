// Apartment Layout — single shared trigger (SPEC §11, used by the AI-panel leaf
// AND the window.pryzmGenerateApartmentLayout() console command).
//
// Owns the per-session controller + executor singletons so attaching is
// idempotent no matter which entry point fires. Bulletproof + diagnostic: always
// logs a [apartment-layout] marker + always surfaces a toast, so the trigger can
// never silently do nothing.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { ApartmentLayoutController, requestApartmentLayout } from './ApartmentLayoutController.js';
import { ApartmentLayoutExecutor } from './ApartmentLayoutExecutor.js';
import { gatherLayoutPayload } from './gatherLayoutPayload.js';
import { resolveActiveLevelId } from './activeLevel.js';

const _controller = new ApartmentLayoutController();
const _executor = new ApartmentLayoutExecutor();

/**
 * Generate AI apartment layouts for the active level's exterior shell. Resolves
 * the runtime from the argument or `window.runtime`. Safe to call from the AI
 * panel leaf or the DevTools console (`pryzmGenerateApartmentLayout()`).
 */
export function triggerApartmentLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[apartment-layout] trigger invoked');
        const lid = resolveActiveLevelId();
        const hasStore = !!(rt?.ai as { layoutOptions?: unknown } | undefined)?.layoutOptions;
        console.log('[apartment-layout] runtime?', !!rt, 'activeLevel?', lid, 'ai.layoutOptions?', hasStore);

        if (!rt || !lid) {
            toast('No active level — create or open a level first.', 'error');
            return;
        }
        if (!hasStore) {
            console.warn('[apartment-layout] runtime.ai.layoutOptions is undefined — the running composeRuntime predates the #51 changes. Restart the dev server (npm run dev) + hard-reload.');
            toast('AI runtime is stale — restart the dev server (npm run dev) and reload.', 'error');
            return;
        }

        const payload = gatherLayoutPayload(lid);
        console.log('[apartment-layout] payload', payload);
        if (!payload || payload.shellWallIds.length < 3) {
            toast(`Need at least 3 exterior walls on the active level (found ${payload?.shellWallIds.length ?? 0}).`, 'error');
            return;
        }

        _controller.attach(rt); // idempotent — modal shows on options-ready
        _executor.attach(rt);   // idempotent — commits on the user's pick
        toast('Generating apartment layouts…', 'info');
        void requestApartmentLayout(rt, payload).then(r => {
            console.log('[apartment-layout] requestApartmentLayout result', r);
            if (!r.ok) toast(r.reason ?? 'Layout generation failed', 'error');
        });
    } catch (err) {
        console.error('[apartment-layout] trigger threw:', err);
        toast(`Apartment layout failed: ${String(err)}`, 'error');
    }
}

/** Register the DevTools console command `window.pryzmGenerateApartmentLayout()`. */
export function installApartmentLayoutConsoleTrigger(runtime: PryzmRuntime | null): void {
    window.pryzmGenerateApartmentLayout = () => triggerApartmentLayout(runtime);
    console.log('[apartment-layout] console command ready — run pryzmGenerateApartmentLayout() to generate.');
}
