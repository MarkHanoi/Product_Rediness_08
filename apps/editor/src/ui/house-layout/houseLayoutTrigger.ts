// Casa Unifamiliar — house-layout console trigger (tracker A.21.d–g).
//
// Registers DevTools console commands so the multi-storey house generator can be
// driven without UI (mirrors installApartmentLayoutConsoleTrigger). ADDITIVE: it
// touches NONE of the apartment trigger/controller/executor state — it owns its
// own HouseLayoutExecutor (via houseFromBoundary's module singleton).
//
//   window.pryzmGenerateHouse(storeyCount = 2, opts?)
//       — draw a default 10×8 m shell (or pass {footprint:[{x,z}…]}) then build
//         an N-storey house: levels + per-storey rooms + a stair connecting them
//         + a stairwell void in the upper slab + a roof on top.
//   window.pryzmGenerateHouseFromBoundary(storeyCount = 2)
//       — build an N-storey house from a shell ALREADY drawn on the active level
//         (no drawing step).

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    generateHouseFromBoundary,
    generateHouseInExistingShell,
    type HouseFromBoundaryOptions,
} from './houseFromBoundary.js';

declare global {
    interface Window {
        pryzmGenerateHouse?: (storeyCount?: number, opts?: HouseFromBoundaryOptions) => void;
        pryzmGenerateHouseFromBoundary?: (storeyCount?: number) => void;
    }
}

/** Register the console commands. Idempotent. */
export function installHouseLayoutConsoleTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window === 'undefined') return;
    window.pryzmGenerateHouse = (storeyCount = 2, opts?: HouseFromBoundaryOptions) =>
        void generateHouseFromBoundary(runtime, Math.max(1, Math.floor(storeyCount || 1)), opts);
    window.pryzmGenerateHouseFromBoundary = (storeyCount = 2) =>
        void generateHouseInExistingShell(runtime, Math.max(1, Math.floor(storeyCount || 1)));
    console.log('[house-layout] console command ready — run pryzmGenerateHouse(2) to draw a shell + build a 2-storey house.');
    console.log('[house-layout] console command ready — run pryzmGenerateHouseFromBoundary(2) to build inside an existing shell.');
}
