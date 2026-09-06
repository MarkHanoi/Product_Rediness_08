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
import type { HouseExecuteResult } from './HouseLayoutExecutor.js';
import { HouseLayoutController } from './HouseLayoutController.js';
import { weldFootprintForWalls } from './weldFootprintForWalls.js';

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
    /** §GEN-CHAT (RAC U5b.2) — skip the "Choose a house layout" modal and BUILD
     *  the best-scored variant directly (`HouseLayoutController.buildDirect`).
     *  The chat path sets this: its Confirm card already stood in for the
     *  preview. Default false = the modal path, byte-identical. */
    readonly autoBuild?: boolean;
}

/** §GEN-CHAT — the from-boundary result with the buildDirect honesty lines. */
export type HouseFromBoundaryResult = HouseExecuteResult & { readonly report?: readonly string[] };

/** A.21.k — shared controller singleton: drives the "Choose a house layout"
 *  modal so House gets layout-option parity with the apartment flow. */
const _controller = new HouseLayoutController();

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

/** The narrow bus surface this module dispatches through. Typed, never `any` (P4). */
interface HouseBus {
    executeCommand?(type: string, payload: unknown): Promise<unknown> | undefined;
}

/**
 * §HOUSE-SHELL-IS-ATOMIC (L-13011 defect 2) — COMPENSATING ROLLBACK for a shell that was
 * committed before a LATER stage failed.
 *
 * ⭐ WHY A COMPENSATION AND NOT A TRANSACTION. `batchCoordinator.runBatch` is EVENT batching and
 * is undo-neutral by its own declaration (`BatchCoordinator.ts:233`) — it cannot unwind a
 * committed command. The repo's actual atomicity unit is ONE COMMAND = ONE UNDO ENTRY, which the
 * `wall.batch.create` above now uses for the shell itself. Everything after the shell is a
 * separate command, so the only honest way to leave the model as it was found is to delete what
 * this run created. ⛔ `wall.batch.delete` is MEASURED ABSENT (`ConsequencePreviewService.ts:593`
 * records the measurement), so this dispatches `wall.delete` per id — still through the bus, so
 * P6 holds and every removal is a real command.
 *
 * Best-effort by construction: a failed rollback is REPORTED, never thrown, because it is already
 * running on a failure path and swallowing the original cause would be worse.
 */
async function rollbackShell(bus: HouseBus, ids: readonly string[] | null): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    let removed = 0;
    for (const id of ids) {
        try {
            await bus.executeCommand?.('wall.delete', { id });
            removed++;
        } catch (e) {
            console.warn(`[house-from-boundary] rollback: wall.delete failed for ${id}:`, e);
        }
    }
    console.log(`[house-from-boundary] §HOUSE-SHELL-IS-ATOMIC rollback: removed ${removed}/${ids.length} shell wall(s).`);
    return removed;
}

/** The sentence appended when a rollback could not remove everything it created. */
function rollbackNote(removed: number, total: number): string {
    return removed === total
        ? ' The shell PRYZM had drawn was removed, so your level is exactly as it was.'
        : ` ⚠ PRYZM removed ${removed} of the ${total} shell walls it had drawn — ${total - removed} `
          + 'could not be deleted and are still on the level. Delete them before running this again.';
}

/**
 * Draw a closed shell from a footprint, then build an N-storey house inside it.
 * Resolves the runtime from the argument or `window.runtime`. Never throws.
 */
export async function generateHouseFromBoundary(
    runtimeArg: PryzmRuntime | null | undefined,
    storeyCount: number,
    opts?: HouseFromBoundaryOptions,
): Promise<HouseFromBoundaryResult> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    // §HOUSE-SHELL-IS-ATOMIC — the ids this run committed, so every failure path below can put
    // the level back. `null` = nothing of ours is in the model.
    let shellCreated: readonly string[] | null = null;
    let busRef: HouseBus | null = null;
    try {
        console.log('[house-from-boundary] invoked', { storeyCount, opts: opts ?? '(defaults)' });
        const levelId = resolveActiveLevelId();
        if (!rt || !levelId) { toast('No active level — create or open a project first.', 'error'); return { ok: false, reason: 'no runtime/level' }; }

        const bus = (rt as { bus?: HouseBus }).bus;
        if (!bus?.executeCommand) { toast('Command bus unavailable — restart the dev server.', 'error'); return { ok: false, reason: 'no bus' }; }
        busRef = bus;

        const requested = opts?.footprint && opts.footprint.length >= 3
            ? opts.footprint
            : rectangleFootprint(opts?.width ?? 10, opts?.depth ?? 8);

        // 0) §HOUSE-SHELL-IS-ATOMIC — RECONCILE THE POLYGON DOMAIN WITH THE WALL DOMAIN BEFORE
        //    DRAWING ANYTHING (L-13011 defect 1). The ring arrives from `insetPolygonPerEdge`,
        //    whose coincidence band is 1e-6 m and which is contractually barred from widening it
        //    (C73 §2.5/E4); `Wall` requires a baseline ≥ 0.05 m. Measured on REAL Catastro
        //    geometry (Poblenou 29346), the erosion emits sub-50 mm edges at EVERY inset from
        //    0.1 m to 3 m — 15 of them, the shortest 0.16 mm. So a degenerate edge is VALID
        //    POLYGON INPUT, and the shell generator must reconcile it rather than trip over it.
        //    ⛔ It WELDS (merges the coincident vertices) rather than FILTERING the short edge:
        //    dropping an edge would leave the shell open by up to 50 mm. And it still REFUSES
        //    when the weld collapses the ring or moves its area — see `weldFootprintForWalls`.
        const welded = weldFootprintForWalls(requested);
        if (!welded.ok) {
            console.error('[house-from-boundary] footprint refused:', welded.reason, welded.statement);
            toast(welded.statement, 'error');
            return { ok: false, reason: welded.statement };
        }
        const footprint = welded.ring;
        if (welded.note !== null) {
            console.log('[house-from-boundary] §HOUSE-SHELL-IS-ATOMIC weld:', welded.note);
            toast(welded.note, 'info');
        }

        // 1) Draw the closed shell — ⭐ ONE `wall.batch.create` FOR THE WHOLE RING (L-13011
        //    defect 2). This is the repo's EXISTING atomicity mechanism, not a new one:
        //    `CreateWallBatchHandler` parses and validates EVERY wall into `fresh[]` before it
        //    touches the store, then commits the set through a SINGLE `produceCommand` — so a
        //    rejected wall throws with ZERO walls created, and a successful run is ONE undo
        //    entry. Its own header states the contract: *"Schema-level parse failures surface as
        //    WallSchemaError (thrown outward so the bus does NOT push a partial batch to the undo
        //    stack)."*
        //    ⛔ THE OLD CODE LOOPED `wall.create` PER EDGE. That is N commands, N undo entries,
        //    and a throw on edge k keeps walls 0..k-1 — which is exactly the wreck L-13011
        //    reports (two orphan walls, no slab, no finishes) and the debris that then tripped
        //    C80's "the active level already carries 2 authored walls" guard. Never restore the
        //    loop.
        toast('Drawing house shell…', 'info');
        const shellWallIds: string[] = footprint.map(() => createId('wall'));
        await bus.executeCommand('wall.batch.create', {
            levelId,
            walls: footprint.map((a, i) => {
                const b = footprint[(i + 1) % footprint.length]!;
                return {
                    id: shellWallIds[i]!,
                    baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
                    height: WALL_DEFAULT_HEIGHT,
                    thickness: WALL_DEFAULT_THICKNESS,
                    levelId,
                };
            }),
        });
        shellCreated = shellWallIds;

        // 2) Wait for the shell to register (walls + facade flags).
        const ready = await waitForShell(levelId, Math.min(3, footprint.length));
        if (!ready) {
            await rollbackShell(bus, shellCreated);
            shellCreated = null;
            toast('The house shell was drawn but its exterior walls never settled, so PRYZM removed '
                + 'it again. Nothing has been created.', 'error');
            return { ok: false, reason: 'shell not ready' };
        }

        // 3) Gather the program/constraints/weights from the live stores (reusing
        //    the apartment payload gatherer so the house honours a captured brief),
        //    then open the "Choose a house layout" modal (A.21.k). The controller
        //    computes N variants + builds the chosen one on the user's pick — House
        //    now gets the SAME layout-option modal the apartment flow shows.
        const payload = gatherLayoutPayload(levelId, opts?.programOverride);
        const program: ApartmentProgram = { ...(payload?.program ?? DEFAULT_PROGRAM), ...(opts?.programOverride ?? {}) };
        const constraints: ApartmentConstraints = payload?.constraints ?? DEFAULT_CONSTRAINTS;
        const weights: ScoringWeights = payload?.options?.scoringWeights ?? DEFAULT_WEIGHTS;
        const siteLat = payload?.siteLatitudeDeg;

        toast(`Generating ${storeyCount}-storey house options…`, 'info');
        const req = {
            storeyCount,
            program,
            constraints,
            weights,
            ...(opts?.floorToFloorM ? { floorToFloorM: opts.floorToFloorM } : {}),
            ...(opts?.roofKind ? { roofKind: opts.roofKind } : {}),
            ...(typeof siteLat === 'number' ? { siteLatitudeDeg: siteLat } : {}),
        };
        // §GEN-CHAT (RAC U5b.2) — the chat path builds the best variant
        // directly (its Confirm card was the preview); the modal path is
        // byte-identical to before.
        const res = opts?.autoBuild === true
            ? await _controller.buildDirect(rt, req)
            : await _controller.request(rt, req);
        // The build happens on the user's modal pick (or directly on the chat
        // path) — surface the request result in the HouseExecuteResult shape
        // the caller expects, with the buildDirect honesty lines when present.
        if (res.ok) {
            // ⚠ ON THE MODAL PATH `ok` MEANS "THE CHOOSER IS OPEN", NOT "THE HOUSE IS BUILT"
            // (`HouseLayoutController.request` returns as soon as `modal.show` is called). The
            // shell is DELIBERATELY kept here: it is the plate the user is about to choose a
            // layout for. ⛔ KNOWN GAP, stated rather than hidden: if the user then CANCELS the
            // chooser, that cancel happens after this promise has already resolved, so this
            // function cannot roll the shell back and the level keeps a bare shell. Closing that
            // needs the cancel path itself to compensate — see the lane report for L-13011.
            shellCreated = null;
            return { ok: true, ...(res.report !== undefined ? { report: res.report } : {}) };
        }
        // ⛔ THE GENERATOR FAILED AFTER COMMITTING A SHELL — PUT THE LEVEL BACK. Leaving it is
        // what produced L-13011's debris and then tripped C80's "already carries N authored
        // walls" guard on the user's next attempt.
        {
            const total = shellCreated?.length ?? 0;
            const removed = await rollbackShell(bus, shellCreated);
            shellCreated = null;
            const why = res.reason ?? 'no reason given';
            toast(`Create house failed: ${why}.${total > 0 ? rollbackNote(removed, total) : ' Nothing was created.'}`, 'error');
            return { ok: false, reason: `${why}${total > 0 ? rollbackNote(removed, total) : ''}` };
        }
    } catch (err) {
        // ⛔ SAME RULE ON A THROW. This is the exact path L-13011 took: the old per-edge loop
        // threw `WallSchemaError` on the third `wall.create` and kept the first two. The shell is
        // now one atomic command so a schema rejection creates nothing at all, but anything that
        // throws AFTER the shell commits still has to leave the model as it was found.
        console.error('[house-from-boundary] threw:', err);
        const total = shellCreated?.length ?? 0;
        const removed = busRef ? await rollbackShell(busRef, shellCreated) : 0;
        shellCreated = null;
        const detail = `Create house failed: ${String(err)}.`
            + (total > 0 ? rollbackNote(removed, total) : ' Nothing was created.');
        toast(detail, 'error');
        return { ok: false, reason: detail };
    }
}

/**
 * Build a house from an EXISTING shell already drawn on the active level (no
 * drawing step). Gathers the program from the stores + runs the executor.
 */
export async function generateHouseInExistingShell(
    runtimeArg: PryzmRuntime | null | undefined,
    storeyCount: number,
    opts?: Pick<HouseFromBoundaryOptions, 'floorToFloorM' | 'roofKind' | 'programOverride' | 'autoBuild'>,
): Promise<HouseFromBoundaryResult> {
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
    const siteLat = payload.siteLatitudeDeg;
    // A.21.k — open the "Choose a house layout" modal (parity with the apartment
    // flow) instead of building option[0] silently.
    const res = await _controller.request(rt, {
        storeyCount,
        program,
        constraints: payload.constraints ?? DEFAULT_CONSTRAINTS,
        weights: payload.options?.scoringWeights ?? DEFAULT_WEIGHTS,
        ...(opts?.floorToFloorM ? { floorToFloorM: opts.floorToFloorM } : {}),
        ...(opts?.roofKind ? { roofKind: opts.roofKind } : {}),
        ...(typeof siteLat === 'number' ? { siteLatitudeDeg: siteLat } : {}),
    });
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}
