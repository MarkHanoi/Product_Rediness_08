// Residential building (multi-family) — console trigger + feature gate (P3.3).
//
// Registers the DevTools console command so the multi-family building generator
// can be driven without UI, MIRRORING installHouseLayoutConsoleTrigger. ADDITIVE:
// it touches NONE of the apartment/house trigger state — it owns its own
// ResidentialBuildingController singleton.
//
// FEATURE GATE: the whole feature is OFF by default. It only activates when
// `globalThis.__PRYZM_RESIDENTIAL_BUILDING__ === true`. Until that flag is flipped,
// the console command refuses (with a one-line hint) and no entry point does
// anything — so existing house/apartment users are completely unaffected. Flip it
// in the console:  globalThis.__PRYZM_RESIDENTIAL_BUILDING__ = true
//
//   window.pryzmGenerateResidentialBuilding(opts?)
//       — gather the footprint from the active level's drawn shell, run the
//         residential orchestrator, open the per-floor preview modal, and (on
//         Build) build the core (stair + lift) + corridors + each apartment.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    ResidentialBuildingController,
    type ResidentialBuildingRequest,
} from './ResidentialBuildingController.js';

/** Options the console command accepts (a partial of the request — sensible
 *  defaults applied by the controller). `floors` is the number of UPPER levels. */
export interface ResidentialBuildingConsoleOptions {
    readonly floors?: number;
    readonly minApartmentAreaM2?: number;
    readonly maxApartmentAreaM2?: number;
    readonly typologies?: { readonly T1?: boolean; readonly T2?: boolean; readonly T3?: boolean; readonly T4?: boolean };
    readonly coreWidthM?: number;
    readonly coreDepthM?: number;
    readonly corridorWidthM?: number;
    readonly floorToFloorM?: number;
    readonly siteLatitudeDeg?: number;
    readonly footprint?: ReadonlyArray<{ x: number; z: number }>;
    /** §RESI-ROOF-GARDEN (2026-06-24) — OPTIONAL roof amenity deck. Default OFF. */
    readonly roofGarden?: boolean;
    /** §RESI-BALCONIES (2026-06-24) — projecting balconies. Default ON (absent ⇒ ON). */
    readonly balconies?: boolean;
    /** §RESI-FACADE-COLOUR (2026-06-24) — building finish colour (hex `#rrggbb`). Default white. */
    readonly facadeColor?: string;
    /** §RESI-GROUND-COMMERCIAL-CURTAIN (2026-06-24) — ground shopfront style. Default false ⇒ solid
     *  shell + big commercial windows; true ⇒ the curtain-wall shopfront. */
    readonly groundCommercialCurtain?: boolean;
}

declare global {
    interface Window {
        pryzmGenerateResidentialBuilding?: (opts?: ResidentialBuildingConsoleOptions) => void;
    }
}

/** The feature gate. OFF unless `globalThis.__PRYZM_RESIDENTIAL_BUILDING__ === true`. */
export function isResidentialBuildingEnabled(): boolean {
    return (globalThis as unknown as { __PRYZM_RESIDENTIAL_BUILDING__?: boolean }).__PRYZM_RESIDENTIAL_BUILDING__ === true;
}

/** Map the loose console options to a typed request (defaults filled by controller). */
function toRequest(opts?: ResidentialBuildingConsoleOptions): ResidentialBuildingRequest {
    return {
        upperLevels: Math.max(1, Math.min(20, Math.floor(opts?.floors ?? 4))),
        ...(typeof opts?.minApartmentAreaM2 === 'number' ? { minApartmentAreaM2: opts.minApartmentAreaM2 } : {}),
        ...(typeof opts?.maxApartmentAreaM2 === 'number' ? { maxApartmentAreaM2: opts.maxApartmentAreaM2 } : {}),
        // Default to T2 + T3 enabled (the typology pack's default mix) when unspecified.
        typologies: opts?.typologies ?? { T1: false, T2: true, T3: true, T4: false },
        ...(typeof opts?.coreWidthM === 'number' ? { coreWidthM: opts.coreWidthM } : {}),
        ...(typeof opts?.coreDepthM === 'number' ? { coreDepthM: opts.coreDepthM } : {}),
        ...(typeof opts?.corridorWidthM === 'number' ? { corridorWidthM: opts.corridorWidthM } : {}),
        ...(typeof opts?.floorToFloorM === 'number' ? { floorToFloorM: opts.floorToFloorM } : {}),
        ...(typeof opts?.siteLatitudeDeg === 'number' ? { siteLatitudeDeg: opts.siteLatitudeDeg } : {}),
        ...(opts?.footprint && opts.footprint.length >= 3 ? { footprint: opts.footprint } : {}),
        ...(opts?.roofGarden === true ? { roofGarden: true } : {}),
        // §RESI-BALCONIES — default ON; only thread the flag when explicitly turned off.
        ...(opts?.balconies === false ? { balconies: false } : {}),
        ...(typeof opts?.facadeColor === 'string' ? { facadeColor: opts.facadeColor } : {}),
        ...(opts?.groundCommercialCurtain === true ? { groundCommercialCurtain: true } : {}),
    };
}

/** Shared controller singleton (one per editor session). */
const _controller = new ResidentialBuildingController();

/** Run the generator. Resolves the runtime from the argument or `window.runtime`.
 *  Refuses (toast/console) when the feature gate is OFF. Never throws. */
export async function generateResidentialBuilding(
    runtimeArg: PryzmRuntime | null | undefined,
    opts?: ResidentialBuildingConsoleOptions,
): Promise<void> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    if (!isResidentialBuildingEnabled()) {
        console.warn('[resi-building] feature is OFF — set globalThis.__PRYZM_RESIDENTIAL_BUILDING__ = true to enable, then re-run.');
        rt?.events?.emit('pryzm:toast', { message: 'Residential building is disabled (set globalThis.__PRYZM_RESIDENTIAL_BUILDING__ = true).', severity: 'warn' });
        return;
    }
    if (!rt) { console.warn('[resi-building] no runtime — open a project first.'); return; }
    await _controller.request(rt, toRequest(opts));
}

/** Register the console command. Idempotent. The command itself enforces the gate. */
export function installResidentialBuildingConsoleTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window === 'undefined') return;
    window.pryzmGenerateResidentialBuilding = (opts?: ResidentialBuildingConsoleOptions) =>
        void generateResidentialBuilding(runtime, opts);
    console.log(
        '[resi-building] console command ready (feature OFF by default) — to test: ' +
        'globalThis.__PRYZM_RESIDENTIAL_BUILDING__ = true; then pryzmGenerateResidentialBuilding({ floors: 4 }).',
    );
}
