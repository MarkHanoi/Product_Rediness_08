// Apartment Layout Generator — editor-side registration binding (SPEC §16, A5.3-wire-b).
//
// The L5 glue that binds the apartment-layout workflow onto the runtime's
// in-process AiPlane using the REAL editor stores/services. It is LAZY +
// idempotent: the §11 modal / the generate command calls this right before
// submitting, NOT at boot — calling it at boot would eagerly load the ai-host
// chunk and break the lazy K3-A "AI bytes off first-paint" budget.
//
// §SW-LAZY-CHUNK-404 (2026-06-10): the ai-host registration factories are now
// imported STATICALLY. The previous comment claimed a lazy `await import` kept
// "AI bytes off first-paint", but that budget is ALREADY spent — engineLauncher,
// BimService, initDataPlatform and the AI panels all statically import from the
// same `@pryzm/ai-host` barrel, so the package is unavoidably in the eager
// engineLauncher chunk. The lazy `await import('@pryzm/ai-host')` therefore
// bought nothing and only duplicated the barrel into a fragile `index-<hash>.js`
// chunk that 404'd for returning clients after a deploy. NOTE: `runtime.ai.getHost()`
// (below) is a SEPARATE, genuinely-lazy chunk (`AiHost.impl-*.js`) and stays lazy.

import { storeRegistry, apiFetch } from '@pryzm/core-app-model';
import { facadeOrientationService } from '@pryzm/spatial-index';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    createApartmentLayoutRegistration,
    createCfWorkerRelay,
} from '@pryzm/ai-host';
import type { ApartmentLayoutRegistrationResult } from '@pryzm/ai-host';
import { buildGetWall, type WallStoreLike } from './apartmentLayoutWallMapper.js';

/**
 * Ensure the apartment-layout workflow is registered on the runtime's AiPlane.
 * Lazy + idempotent (createApartmentLayoutRegistration guards via
 * workflowRegistry.has). Never throws — returns a result with a reason on any
 * failure so the caller (modal / command) can decide to proceed or surface it.
 */
export async function ensureApartmentLayoutRegistered(
    runtime: PryzmRuntime,
): Promise<ApartmentLayoutRegistrationResult> {
    try {
        // getHost loads the lazy ai-host chunk on first call — appropriate here
        // because the user is actively invoking the AI feature.
        const host = await runtime.ai.getHost();

        const wallStore = storeRegistry.getStoreForType('wall') as unknown as WallStoreLike | undefined;
        const getWall = buildGetWall(wallStore);

        return createApartmentLayoutRegistration({
            host: host as { plane?: unknown },
            // A7 — live relay through the server BFF (POST /api/anthropic/v1/messages
            // → CF Worker / Anthropic). MUST use the editor's authed apiFetch (adds
            // Authorization: Bearer <jwt>) — plain fetch returns 401 (the route is
            // behind authMiddleware). If the server has no AI upstream configured
            // (ANTHROPIC_API_KEY / CF_WORKER_URL) it returns 500 — and the offline
            // fallback below produces a real layout instead of failing.
            relay: createCfWorkerRelay(undefined, apiFetch),
            // Offline fallback: when the AI is unavailable (no key / 401 / 500),
            // run the deterministic D-TGL engine (SPEC-TGL-DETERMINISTIC-LAYOUT-
            // ENGINE) — a real rectilinear, space-syntax-ranked, semantically-rich
            // layout, NOT placeholder strips. So the feature always delivers.
            proceduralFallback: true,
            getWall,
            // SL-3: one wall's compass orientation (recomputes facades per call —
            // negligible for the handful of perimeter walls a shell has).
            getOrientation: (levelId: string, wallId: string) =>
                facadeOrientationService.getFacades(levelId).get(wallId)?.orientation ?? null,
            // AIStore persist (the §11 modal subscribes to this store).
            setPendingLayouts: (runId, options) => runtime.ai.layoutOptions.setLayouts(runId, options),
            // P4 — cross-cutting event via runtime.events, no window.dispatchEvent.
            emit: (event, payload) => {
                if (event === 'apartment.layout-options-ready') {
                    runtime.events.emit(
                        'apartment.layout-options-ready',
                        payload as { runId: string; options: readonly unknown[] },
                    );
                }
            },
        });
    } catch (err) {
        console.warn('[ensureApartmentLayoutRegistered] failed (non-fatal):', err);
        return { registered: false, workflowId: null, reason: String(err) };
    }
}
