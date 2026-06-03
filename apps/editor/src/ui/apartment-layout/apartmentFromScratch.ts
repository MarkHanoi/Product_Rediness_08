// A.5.g.2 — Apartment from a footprint polygon (the "site → plan" gap-closer).
//
// WHY THIS EXISTS
// ---------------
// The shipped generator (`triggerApartmentLayout`) lays out INSIDE an existing
// exterior wall shell: it reads the active level's walls via `gatherLayoutPayload`
// and needs ≥3 exterior (facade) walls. An empty project therefore can't generate
// — the trigger correctly toasts "need 3 walls". This helper closes that gap for
// the onboarding pipeline: it DRAWS a closed exterior shell from a footprint
// polygon, waits for the shell to register (walls + facade flags), then runs the
// existing generator inside it.
//
// FORWARD COMPATIBILITY (the real goal)
// -------------------------------------
// The founder's pipeline is RAC → GIS (draw a site boundary) → scene → "create
// the apartment layout from the 3D boundary lines". This function takes a polygon
// precisely so the GIS site-boundary (A.8.c) can feed it directly: the default
// rectangle is only the no-boundary fallback. `generateApartmentFromScratch({
// footprint })` IS "generate from a boundary polygon".
//
// SAFETY
// ------
// Self-contained DevTools console command (`window.pryzmGenerateApartmentFromScratch`).
// It does not touch the auth/onboarding flow — it only dispatches the same
// `wall.create` bus command the wall tool uses, then calls the same generator the
// AI panel does. Always logs `[apartment-from-scratch]` + toasts; never silent.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { createId } from '@pryzm/schemas';
import { triggerApartmentLayout } from './apartmentLayoutTrigger.js';
import { resolveActiveLevelId } from './activeLevel.js';
import { gatherLayoutPayload } from './gatherLayoutPayload.js';

// Matches the wall-tool defaults (WallPlanToolHandler.ts) so the drawn shell is
// indistinguishable from a hand-drawn one.
const WALL_DEFAULT_HEIGHT = 2.7;
const WALL_DEFAULT_THICKNESS = 0.2;

export interface FootprintPoint {
    readonly x: number;
    readonly z: number;
}

export interface ApartmentFromScratchOptions {
    /** Closed footprint polygon in metres on the (x,z) ground plane. Consecutive
     *  points become exterior walls; the last point connects back to the first.
     *  When omitted, a `width`×`depth` rectangle centred on the origin is used.
     *  This is the seam the GIS site-boundary (A.8.c) feeds. */
    readonly footprint?: ReadonlyArray<FootprintPoint>;
    /** Rectangle width in metres — used only when `footprint` is omitted. */
    readonly width?: number;
    /** Rectangle depth in metres — used only when `footprint` is omitted. */
    readonly depth?: number;
}

/** A centred axis-aligned rectangle footprint (x,z), wound counter-clockwise. */
function rectangleFootprint(width: number, depth: number): FootprintPoint[] {
    const hw = width / 2;
    const hd = depth / 2;
    return [
        { x: -hw, z: -hd },
        { x: hw, z: -hd },
        { x: hw, z: hd },
        { x: -hw, z: hd },
    ];
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until the level has ≥`minShell` exterior shell walls (walls registered
 *  AND facade orientation computed), or time out. Returns true when ready. */
async function waitForShell(levelId: string, minShell: number): Promise<boolean> {
    const MAX_ITERS = 40; // ~4s at 100ms — generous for the rebuild + facade pass
    const INTERVAL_MS = 100;
    for (let i = 0; i < MAX_ITERS; i++) {
        const payload = gatherLayoutPayload(levelId);
        const shell = payload?.shellWallIds.length ?? 0;
        if (shell >= minShell) {
            console.log(`[apartment-from-scratch] shell ready: ${shell} exterior walls after ${i * INTERVAL_MS}ms`);
            return true;
        }
        await delay(INTERVAL_MS);
    }
    const final = gatherLayoutPayload(levelId)?.shellWallIds.length ?? 0;
    console.warn(`[apartment-from-scratch] timeout — only ${final}/${minShell} exterior shell walls after ${MAX_ITERS * INTERVAL_MS}ms (facade orientation may not have flagged the new walls exterior).`);
    return false;
}

/**
 * Draw a closed exterior shell from a footprint polygon, then run the apartment
 * generator inside it. Resolves the runtime from the argument or `window.runtime`.
 */
export async function generateApartmentFromScratch(
    runtimeArg?: PryzmRuntime | null,
    opts?: ApartmentFromScratchOptions,
): Promise<void> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[apartment-from-scratch] invoked', opts ?? '(defaults)');
        const levelId = resolveActiveLevelId();
        if (!rt || !levelId) {
            console.warn('[apartment-from-scratch] runtime?', !!rt, 'activeLevel?', levelId);
            toast('No active level — create or open a project first.', 'error');
            return;
        }

        // Loose-typed access to the bus command — mirrors the wall tool's
        // `window.runtime?.bus?.executeCommand('wall.create', …)` call site.
        const bus = (rt as { bus?: { executeCommand?(type: string, payload: unknown): Promise<unknown> | undefined } }).bus;
        if (!bus?.executeCommand) {
            toast('Command bus unavailable — restart the dev server (npm run dev).', 'error');
            return;
        }

        const footprint = opts?.footprint && opts.footprint.length >= 3
            ? opts.footprint
            : rectangleFootprint(opts?.width ?? 10, opts?.depth ?? 8);
        console.log('[apartment-from-scratch] footprint', footprint);

        // 1) Draw the closed shell — one `wall.create` per edge (last → first).
        //    `id` MUST be `createId('wall')` (wall_<ulid>, passes the handler regex);
        //    baseLine points are full Vec3 with y carrying the level elevation (0);
        //    `systemTypeId` is omitted so the editor default is used (an unknown id
        //    makes the batch handler reject — see ApartmentLayoutExecutor §).
        toast('Drawing exterior shell…', 'info');
        const wallIds: string[] = [];
        for (let i = 0; i < footprint.length; i++) {
            const a = footprint[i]!;
            const b = footprint[(i + 1) % footprint.length]!;
            const id = createId('wall');
            wallIds.push(id);
            await bus.executeCommand('wall.create', {
                id,
                baseLine: [
                    { x: a.x, y: 0, z: a.z },
                    { x: b.x, y: 0, z: b.z },
                ],
                height: WALL_DEFAULT_HEIGHT,
                thickness: WALL_DEFAULT_THICKNESS,
                levelId,
            });
        }
        console.log(`[apartment-from-scratch] dispatched ${wallIds.length} shell walls`, wallIds);

        // 2) Wait for the shell to register (walls + facade flags) so the
        //    generator's `gatherLayoutPayload` sees ≥3 exterior walls.
        const ready = await waitForShell(levelId, Math.min(3, footprint.length));
        if (!ready) {
            toast('Shell drawn but exterior walls did not settle — run pryzmGenerateApartmentLayout() once they appear.', 'error');
            return;
        }

        // 3) Run the existing generator inside the freshly-drawn shell.
        console.log('[apartment-from-scratch] shell ready — running apartment generator');
        triggerApartmentLayout(rt);
    } catch (err) {
        console.error('[apartment-from-scratch] threw:', err);
        toast(`Apartment-from-scratch failed: ${String(err)}`, 'error');
    }
}
