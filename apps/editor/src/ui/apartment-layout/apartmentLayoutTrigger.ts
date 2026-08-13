// Apartment Layout — single shared trigger (SPEC §11, used by the AI-panel leaf
// AND the window.pryzmGenerateApartmentLayout() console command).
//
// Owns the per-session controller + executor singletons so attaching is
// idempotent no matter which entry point fires. Bulletproof + diagnostic: always
// logs a [apartment-layout] marker + always surfaces a toast, so the trigger can
// never silently do nothing.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { ApartmentProgram } from '@pryzm/ai-host';
import { ApartmentLayoutController, requestApartmentLayout } from './ApartmentLayoutController.js';
import { ApartmentLayoutExecutor } from './ApartmentLayoutExecutor.js';
import { gatherLayoutPayload, type GatherLayoutRefusal } from './gatherLayoutPayload.js';
import { relationshipUndeterminedLabel } from '../relationshipDetermination.js';
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
 *
 * O.12.c — `programOverride` lets the onboarding chain thread the STRUCTURED RAC
 * brief straight into the request (resolved via `resolveApartmentBrief`). When
 * omitted, `gatherLayoutPayload` falls back to the active-brief stash, then to
 * DEFAULT_PROGRAM — so a no-arg call (AI panel / console) still honours the
 * captured brief.
 */
export function triggerApartmentLayout(
    runtimeArg?: PryzmRuntime | null,
    programOverride?: Partial<ApartmentProgram>,
): void {
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

        // GR-10 / C75 §1.4 — a gather REFUSAL (unrecorded opening sets) is a
        // different fact from "no shell yet", and the user is told which one
        // happened rather than being asked to draw walls that already exist.
        let gatherRefusal: GatherLayoutRefusal | null = null;
        const payload = gatherLayoutPayload(lid, programOverride, (r) => { gatherRefusal = r; });
        console.log('[apartment-layout] payload', payload);
        if (gatherRefusal !== null) {
            toast(`Can't generate — ${relationshipUndeterminedLabel(gatherRefusal)}`, 'error');
            return;
        }
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

/** §GEN-CHAT-APARTMENT — the chat path's result shape. */
export type ApartmentLayoutChatResult =
    | { readonly ok: true; readonly report: readonly string[] }
    | { readonly ok: false; readonly reason: string };

/**
 * §GEN-CHAT-APARTMENT (RAC U5b.2, founder P0 2026-08-10) — "create a 3 bedroom
 * apartment", from the chat.
 *
 * The SAME pipeline `triggerApartmentLayout` runs (same controller/executor
 * singletons, same `gatherLayoutPayload` shell read, same
 * `requestApartmentLayout` submit) — this only RETURNS the outcome instead of
 * swallowing it into a toast, so the chat transcript can state the engine's own
 * refusal rather than the "I'm not sure how to help with that yet" dead end the
 * founder hit. Every refusal below is a real, checkable site fact:
 *
 *   • no runtime / no active level  → "open a project" / "create a level"
 *   • fewer than 3 exterior walls   → "draw the walls first" (with the count found)
 *   • the AI runtime is stale       → the existing restart instruction
 *
 * The layout OPTIONS themselves arrive asynchronously on `ai.layoutOptions` and
 * open the shipped §11 picker — that modal IS the post-run report on this path
 * (headless auto-pick is the deliberate U5c deferral recorded in
 * `generationRequest.ts`'s apartment arm), so the transcript says so honestly
 * instead of claiming rooms were built.
 */
export async function generateApartmentLayoutForChat(
    runtimeArg: PryzmRuntime | null | undefined,
    programOverride: Partial<ApartmentProgram>,
): Promise<ApartmentLayoutChatResult> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        const lid = resolveActiveLevelId();
        if (!rt || !lid) {
            return { ok: false, reason: 'there is no active level — create or open a level first.' };
        }
        const hasStore = !!(rt.ai as { layoutOptions?: unknown } | undefined)?.layoutOptions;
        if (!hasStore) {
            return { ok: false, reason: 'the AI runtime is stale — restart the dev server (npm run dev) and reload.' };
        }

        // GR-10 / C75 §1.4 — surface a gather refusal as its own reason; it is
        // not "draw more walls".
        let gatherRefusal: GatherLayoutRefusal | null = null;
        const payload = gatherLayoutPayload(lid, programOverride, (r) => { gatherRefusal = r; });
        if (gatherRefusal !== null) {
            return { ok: false, reason: relationshipUndeterminedLabel(gatherRefusal) };
        }
        const wallCount = payload?.shellWallIds.length ?? 0;
        if (!payload || wallCount < 3) {
            return {
                ok: false,
                reason:
                    `there is no closed shell on this level to lay out — I found ${wallCount} exterior wall` +
                    `${wallCount === 1 ? '' : 's'} and need at least 3. Draw the walls first, ` +
                    `or say "generate a 2-storey house" and I'll build the shell too.`,
            };
        }

        _controller.attach(rt); // idempotent
        _executor.attach(rt);   // idempotent
        _controller.setLastPayload(payload, {});
        toast('Generating apartment layouts…', 'info');
        const r = await requestApartmentLayout(rt, payload);
        if (!r.ok) {
            return { ok: false, reason: r.reason ?? 'the layout engine refused without a reason.' };
        }
        const p = payload.program;
        const asked = [
            `${p.bedrooms} bedroom${p.bedrooms === 1 ? '' : 's'}`,
            `${p.bathrooms} bathroom${p.bathrooms === 1 ? '' : 's'}`,
            ...(p.masterEnSuite === true ? ['a master en-suite'] : []),
            ...(p.openPlanKitchenDining === true ? ['an open-plan kitchen/dining'] : []),
        ].join(', ');
        return {
            ok: true,
            report: [
                `Laying out ${asked} inside the ${wallCount}-wall shell on this level — ` +
                `the layout picker opens with the options the engine finds, and anything it has to ` +
                `drop is named there with its reason.`,
            ],
        };
    } catch (err) {
        console.error('[apartment-layout] chat path threw:', err);
        return { ok: false, reason: `the apartment layout engine failed: ${String((err as Error)?.message ?? err)}` };
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
