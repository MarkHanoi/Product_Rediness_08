// Office building (tower) — console trigger + feature gate.
//
// Registers the DevTools console command so the office-tower generator can be driven
// without UI, MIRRORING installResidentialBuildingConsoleTrigger. ADDITIVE: it owns
// its own OfficeBuildingController singleton and touches no other typology state.
//
// FEATURE GATE: OFF by default. It only activates when
// `globalThis.__PRYZM_OFFICE_BUILDING__ === true`. Until that flag is flipped, the
// console command refuses (with a one-line hint). Flip it in the console:
//   globalThis.__PRYZM_OFFICE_BUILDING__ = true
//
//   window.pryzmGenerateOfficeBuilding({ stories: 40, radiusM: 22, floorToFloorM: 4 })

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    OfficeBuildingController,
    type OfficeBuildingRequest,
} from './OfficeBuildingController.js';
import type { DeskMode, WorkplaceCulture } from '@pryzm/ai-host';

/** Options the console command accepts (a partial of the request). */
export interface OfficeBuildingConsoleOptions {
    readonly stories?: number;
    readonly radiusM?: number;
    readonly floorToFloorM?: number;
    readonly deskDensityPer1000Sqft?: number;
    readonly deskMode?: DeskMode;
    readonly culture?: WorkplaceCulture;
    readonly mechanicalEveryN?: number;
}

/** The feature gate. OFF unless `globalThis.__PRYZM_OFFICE_BUILDING__ === true`. */
export function isOfficeBuildingEnabled(): boolean {
    return (globalThis as unknown as { __PRYZM_OFFICE_BUILDING__?: boolean }).__PRYZM_OFFICE_BUILDING__ === true;
}

/** Map the loose console options to a typed request (defaults filled by controller). */
function toRequest(opts?: OfficeBuildingConsoleOptions): OfficeBuildingRequest {
    return {
        stories: Math.max(1, Math.min(60, Math.floor(opts?.stories ?? 40))),
        ...(typeof opts?.radiusM === 'number' ? { radiusM: opts.radiusM } : {}),
        ...(typeof opts?.floorToFloorM === 'number' ? { floorToFloorM: opts.floorToFloorM } : {}),
        ...(typeof opts?.deskDensityPer1000Sqft === 'number' ? { deskDensityPer1000Sqft: opts.deskDensityPer1000Sqft } : {}),
        ...(opts?.deskMode ? { deskMode: opts.deskMode } : {}),
        ...(opts?.culture ? { culture: opts.culture } : {}),
        ...(typeof opts?.mechanicalEveryN === 'number' ? { mechanicalEveryN: opts.mechanicalEveryN } : {}),
    };
}

const _controller = new OfficeBuildingController();

/** Run the office generator. Resolves the runtime from the argument or `window.runtime`.
 *  Refuses (toast/console) when the feature gate is OFF. Never throws. */
export async function generateOfficeBuilding(
    runtimeArg: PryzmRuntime | null | undefined,
    opts?: OfficeBuildingConsoleOptions,
): Promise<void> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    if (!isOfficeBuildingEnabled()) {
        console.warn('[office-building] feature is OFF — set globalThis.__PRYZM_OFFICE_BUILDING__ = true to enable, then re-run.');
        rt?.events?.emit('pryzm:toast', { message: 'Office building is disabled (set globalThis.__PRYZM_OFFICE_BUILDING__ = true).', severity: 'warn' });
        return;
    }
    if (!rt) { console.warn('[office-building] no runtime — open a project first.'); return; }
    await _controller.request(rt, toRequest(opts));
}

/** Register the console command. Idempotent. The command itself enforces the gate. */
export function installOfficeBuildingConsoleTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window === 'undefined') return;
    window.pryzmGenerateOfficeBuilding = (opts?: OfficeBuildingConsoleOptions) =>
        void generateOfficeBuilding(runtime, opts);
    console.log(
        '[office-building] console command ready (feature OFF by default) — to test: ' +
        'globalThis.__PRYZM_OFFICE_BUILDING__ = true; then pryzmGenerateOfficeBuilding({ stories: 40, radiusM: 22 }).',
    );
}
