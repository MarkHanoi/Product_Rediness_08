// Office building (tower) — console trigger + feature gate.
//
// Registers the DevTools console command so the office-tower generator can be driven
// without UI, MIRRORING installResidentialBuildingConsoleTrigger. ADDITIVE: it owns
// its own OfficeBuildingController singleton and touches no other typology state.
//
// FEATURE GATE: §OFFICE-ONBOARDING-WIRE (2026-06-30) — now ON by default, mirroring
// the residential-building SELECTION-opt-in posture: picking "Commercial building —
// office" in the typology picker IS the opt-in, so the UI path needs no console flag.
// `globalThis.__PRYZM_OFFICE_BUILDING__ === false` is an explicit opt-OUT (force-disable);
// any other value (incl. undefined) leaves the feature ON. The console command stays:
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

/** §OFFICE-ONBOARDING-WIRE — the feature gate. ON by default; only an EXPLICIT
 *  `globalThis.__PRYZM_OFFICE_BUILDING__ === false` force-disables it (opt-OUT). Any
 *  other value (incl. undefined) ⇒ enabled, so the typology-picker UI path needs no flag. */
export function isOfficeBuildingEnabled(): boolean {
    return (globalThis as unknown as { __PRYZM_OFFICE_BUILDING__?: boolean }).__PRYZM_OFFICE_BUILDING__ !== false;
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

/** §OFFICE-ONBOARDING-WIRE — shared singleton accessor so the onboarding flow can
 *  drive the SAME controller (open the office setup modal / emit the plate) with a
 *  derived circular footprint, rather than re-instantiating a parallel controller.
 *  Span-free: a trivial getter (no I/O); the request() it returns owns the OTel span. */
export function getOfficeBuildingController(): OfficeBuildingController {
    return _controller;
}

/** Run the office generator. Resolves the runtime from the argument or `window.runtime`.
 *  Refuses (toast/console) when the feature gate is OFF. Never throws. */
export async function generateOfficeBuilding(
    runtimeArg: PryzmRuntime | null | undefined,
    opts?: OfficeBuildingConsoleOptions,
): Promise<void> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    if (!isOfficeBuildingEnabled()) {
        console.warn('[office-building] feature force-disabled — globalThis.__PRYZM_OFFICE_BUILDING__ === false; set it to true (or delete it) to re-enable.');
        rt?.events?.emit('pryzm:toast', { message: 'Office building is force-disabled (globalThis.__PRYZM_OFFICE_BUILDING__ === false).', severity: 'warn' });
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
        '[office-building] console command ready (feature ON by default — §OFFICE-ONBOARDING-WIRE) — ' +
        'pryzmGenerateOfficeBuilding({ stories: 40, radiusM: 22 }); set globalThis.__PRYZM_OFFICE_BUILDING__ = false to force-disable.',
    );
}
