// Casa Unifamiliar — house from a footprint boundary (tracker A.21.d–g).
//
// The HOUSE sibling of apartmentFromScratch + apartmentFromBoundary. Draws a
// closed exterior shell from a footprint polygon (one `wall.create` per edge,
// exactly like apartmentFromScratch), waits for the shell + facade flags to
// register, gathers the program/constraints/weights from the live stores (reusing
// the apartment payload gatherer), then runs HouseLayoutExecutor for `storeyCount`
// storeys. ADDITIVE — it shares only the apartment's pure helpers + draw path; it
// never invokes the apartment generator.
//
// Entry points (installed by installHouseLayoutConsoleTrigger):
//   • window.pryzmGenerateHouse(storeyCount?, opts?) — draw a default 10×8 shell
//     (or pass {footprint}) + build an N-storey house.
//   • window.pryzmGenerateHouseFromBoundary(storeyCount?) — read the authored
//     Site parcel boundary + build an N-storey house from it.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights } from '@pryzm/ai-host';
import { createId } from '@pryzm/schemas';
import { resolveActiveLevelId } from '../apartment-layout/activeLevel.js';
import { gatherLayoutPayload } from '../apartment-layout/gatherLayoutPayload.js';
import { HouseLayoutExecutor, type HouseExecuteResult } from './HouseLayoutExecutor.js';

const WALL_DEFAULT_HEIGHT = 2.7;
const WALL_DEFAULT_THICKNESS = 0.2;
const DEFAULT_CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition',
};
const DEFAULT_PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const DEFAULT_WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

export interface FootprintPoint { readonly x: number; readonly z: number }

export interface HouseFromBoundaryOptions {
    /** Closed footprint polygon (metres, XZ). Omit → a default rectangle. */
    readonly footprint?: ReadonlyArray<FootprintPoint>;
    readonly width?: number;
    readonly depth?: number;
    /** Floor-to-floor height (m). Default 3.0. */
    readonly floorToFloorM?: number;
    /** Roof form. Default 'gable'. */
    readonly roofKind?: 'flat' | 'gable' | 'hip';
    /** Partial program override (bedrooms/bathrooms/…). */
    readonly programOverride?: Partial<ApartmentProgram>;
}

const _executor = new HouseLayoutExecutor();

function rectangleFootprint(width: number, depth: number): FootprintPoint[] {
    const hw = width / 2, hd = depth / 2;
    return [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }];
}

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** Poll until the active level has ≥`minShell` exterior shell walls registered. */
async function waitForShell(levelId: string, minShell: number): Promise<boolean> {
    for (let i = 0; i < 40; i++) {
        const shell = gatherLayoutPayload(levelId)?.shellWallIds.length ?? 0;
        if (shell >= minShell) { console.log(`[house-from-boundary] shell ready: ${shell} exterior walls`); return true; }
        await delay(100);
    }
    console.warn('[house-from-boundary] timeout waiting for shell to settle.');
    return false;
}

/**
 * Draw a closed shell from a footprint, then build an N-storey house inside it.
 * Resolves the runtime from the argument or `window.runtime`. Never throws.
 */
export async function generateHouseFromBoundary(
    runtimeArg: PryzmRuntime | null | undefined,
    storeyCount: number,
    opts?: HouseFromBoundaryOptions,
): Promise<HouseExecuteResult> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[house-from-boundary] invoked', { storeyCount, opts: opts ?? '(defaults)' });
        const levelId = resolveActiveLevelId();
        if (!rt || !levelId) { toast('No active level — create or open a project first.', 'error'); return { ok: false, reason: 'no runtime/level' }; }

        const bus = (rt as { bus?: { executeCommand?(t: string, p: unknown): Promise<unknown> | undefined } }).bus;
        if (!bus?.executeCommand) { toast('Command bus unavailable — restart the dev server.', 'error'); return { ok: false, reason: 'no bus' }; }

        const footprint = opts?.footprint && opts.footprint.length >= 3
            ? opts.footprint
            : rectangleFootprint(opts?.width ?? 10, opts?.depth ?? 8);

        // 1) Draw the closed shell — one wall.create per edge (last → first).
        toast('Drawing house shell…', 'info');
        for (let i = 0; i < footprint.length; i++) {
            const a = footprint[i]!;
            const b = footprint[(i + 1) % footprint.length]!;
            await bus.executeCommand('wall.create', {
                id: createId('wall'),
                baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
                height: WALL_DEFAULT_HEIGHT,
                thickness: WALL_DEFAULT_THICKNESS,
                levelId,
            });
        }

        // 2) Wait for the shell to register (walls + facade flags).
        const ready = await waitForShell(levelId, Math.min(3, footprint.length));
        if (!ready) { toast('Shell drawn but exterior walls did not settle.', 'error'); return { ok: false, reason: 'shell not ready' }; }

        // 3) Gather the program/constraints/weights from the live stores (reusing
        //    the apartment payload gatherer so the house honours a captured brief),
        //    then run the multi-storey executor.
        const payload = gatherLayoutPayload(levelId, opts?.programOverride);
        const program: ApartmentProgram = { ...(payload?.program ?? DEFAULT_PROGRAM), ...(opts?.programOverride ?? {}) };
        const constraints: ApartmentConstraints = payload?.constraints ?? DEFAULT_CONSTRAINTS;
        const weights: ScoringWeights = payload?.options?.scoringWeights ?? DEFAULT_WEIGHTS;
        const siteLat = payload?.siteLatitudeDeg;

        toast(`Generating ${storeyCount}-storey house…`, 'info');
        return await _executor.execute(
            rt,
            {
                storeyCount,
                ...(opts?.floorToFloorM ? { floorToFloorM: opts.floorToFloorM } : {}),
                ...(opts?.roofKind ? { roofKind: opts.roofKind } : {}),
                ...(opts?.programOverride ? { program: opts.programOverride } : {}),
            },
            program,
            constraints,
            weights,
            siteLat,
        );
    } catch (err) {
        console.error('[house-from-boundary] threw:', err);
        toast(`House-from-boundary failed: ${String(err)}`, 'error');
        return { ok: false, reason: String(err) };
    }
}

/**
 * Build a house from an EXISTING shell already drawn on the active level (no
 * drawing step). Gathers the program from the stores + runs the executor.
 */
export async function generateHouseInExistingShell(
    runtimeArg: PryzmRuntime | null | undefined,
    storeyCount: number,
    opts?: Pick<HouseFromBoundaryOptions, 'floorToFloorM' | 'roofKind' | 'programOverride'>,
): Promise<HouseExecuteResult> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const levelId = resolveActiveLevelId();
    if (!rt || !levelId) {
        rt?.events?.emit('pryzm:toast', { message: 'No active level — draw a shell first.', severity: 'error' });
        return { ok: false, reason: 'no runtime/level' };
    }
    const payload = gatherLayoutPayload(levelId, opts?.programOverride);
    if (!payload || payload.shellWallIds.length < 3) {
        rt.events?.emit('pryzm:toast', { message: `Need ≥3 exterior walls (found ${payload?.shellWallIds.length ?? 0}).`, severity: 'error' });
        return { ok: false, reason: 'no shell' };
    }
    const program: ApartmentProgram = { ...(payload.program ?? DEFAULT_PROGRAM), ...(opts?.programOverride ?? {}) };
    return _executor.execute(
        rt,
        { storeyCount, ...(opts?.floorToFloorM ? { floorToFloorM: opts.floorToFloorM } : {}), ...(opts?.roofKind ? { roofKind: opts.roofKind } : {}), ...(opts?.programOverride ? { program: opts.programOverride } : {}) },
        program,
        payload.constraints ?? DEFAULT_CONSTRAINTS,
        payload.options?.scoringWeights ?? DEFAULT_WEIGHTS,
        payload.siteLatitudeDeg,
    );
}
