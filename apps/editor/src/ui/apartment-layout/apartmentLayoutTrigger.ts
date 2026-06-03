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
import { generateApartmentFromScratch, type ApartmentFromScratchOptions } from './apartmentFromScratch.js';
import { generateApartmentFromBoundary } from './apartmentFromBoundary.js';
import { createSiteFromRect } from '../site/createSiteFromRect.js';

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
        // §MODAL-DYNAMIC: seed the controller with the payload BEFORE submit so
        // the modal's program-edit form can re-trigger generation with the
        // SAME shell + opening spans but an EDITED program.
        _controller.setLastPayload(payload, {});
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

/** §HELP (2026-05-29) — print every pryzm…() console command for the
 *  apartment generation pipeline, with a one-line description so the
 *  architect can discover the full toolkit without grepping the source. */
function showApartmentHelp(): void {
    const rows: readonly { cmd: string; desc: string }[] = [
        { cmd: 'pryzmGenerateApartmentLayout()', desc: 'Generate AI apartment layouts for the active level (opens the §11 modal). Needs a ≥3-wall shell.' },
        { cmd: 'pryzmGenerateApartmentFromScratch()', desc: 'Draw a default 10×8 m shell (or pass {width,depth} / {footprint:[{x,z}…]}) THEN generate — no pre-drawn walls needed (A.5.g.2).' },
        { cmd: 'pryzmCreateSiteFromRect(addr?, w?, d?)', desc: 'Create a Site + set a rectangular parcel boundary (default 20×16 m) on the active project — the stub-GIS step (A.7.c.x).' },
        { cmd: 'pryzmGenerateApartmentFromBoundary()', desc: 'Generate an apartment from the authored Site parcel boundary — run pryzmCreateSiteFromRect() first (A.5.g.3).' },
        { cmd: 'pryzmFloorAllRooms()',           desc: 'Apply floor finish per room type — timber in living/bedroom, tile in kitchen/bathroom (#34).' },
        { cmd: 'pryzmCeilAllRooms()',            desc: 'Auto-build a ceiling slab in every ceilable room on the active level (D-CE).' },
        { cmd: 'pryzmFurnishAllRooms()',         desc: 'Auto-furnish every furnishable room on the active level (D-FLE).' },
        { cmd: 'pryzmLightAllRooms()',           desc: 'Auto-place ceiling lights in every lit room on the active level (D-LE).' },
        { cmd: 'pryzmFurnishAndLightAllRooms()', desc: 'Furnish + auto-chain lighting in one go (for the manual-walls case).' },
        { cmd: 'pryzmShowFurnishWarnings()',     desc: 'Print the last furnish run\'s circulation-gate warnings (§VALIDATE).' },
        { cmd: 'pryzmShowApartmentHelp()',       desc: 'Print this help.' },
    ];
    console.group('[apartment-layout] §HELP — pryzm…() console commands');
    console.log('Apartment-generation pipeline: apartment → (floor + ceiling) → furnish → lighting.');
    console.log('Each stage auto-fires on the prior stage\'s done-event; the commands below force a manual run.');
    console.table(rows);
    console.groupEnd();
}

/** Register the DevTools console commands `window.pryzmGenerateApartmentLayout()`
 *  + `window.pryzmShowApartmentHelp()`. */
export function installApartmentLayoutConsoleTrigger(runtime: PryzmRuntime | null): void {
    window.pryzmGenerateApartmentLayout = () => triggerApartmentLayout(runtime);
    window.pryzmGenerateApartmentFromScratch = (opts?: ApartmentFromScratchOptions) =>
        void generateApartmentFromScratch(runtime, opts);
    // A.7.c.x — site console helper (stub GIS). Typology-agnostic.
    window.pryzmCreateSiteFromRect = (address?: string, width?: number, depth?: number) =>
        createSiteFromRect(runtime, { address, width, depth });
    // A.5.g.3 — apartment from the authored Site parcel boundary.
    window.pryzmGenerateApartmentFromBoundary = () =>
        void generateApartmentFromBoundary(runtime);
    window.pryzmShowApartmentHelp = showApartmentHelp;
    console.log('[apartment-layout] console command ready — run pryzmGenerateApartmentLayout() to generate.');
    console.log('[apartment-from-scratch] console command ready — run pryzmGenerateApartmentFromScratch() to draw a default 10×8 m shell + generate (or pass {width,depth} / {footprint:[{x,z}…]}).');
    console.log('[site] console command ready — run pryzmCreateSiteFromRect(address?, width?, depth?) to create a Site + rectangular parcel boundary (the stub-GIS step).');
    console.log('[apartment-from-boundary] console command ready — run pryzmGenerateApartmentFromBoundary() to generate from the authored Site boundary.');
    console.log('[apartment-layout] §HELP console command ready — run pryzmShowApartmentHelp() to list every pryzm…() command.');
}
