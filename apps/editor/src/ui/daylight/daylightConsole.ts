// §27 / §61 — read-only daylight console command (`window.pryzmComputeDaylight()`).
//
// The thin editor wiring for the OFFLINE per-room daylight analytic pass
// (`@pryzm/ai-host` daylight). READ-ONLY: it reads the live room + wall stores,
// assembles `RoomDaylightInput[]` from the detected rooms + their external-wall
// window openings, runs `computeBuildingDaylight` with a default sun set (the
// site latitude when one is set, else a UK-ish 51.5° N), and console.logs a
// per-room daylight table. It NEVER dispatches a command / mutates a store.
//
// Mirrors FurnishLayoutExecutor's store-reading (same room.boundary.polygon +
// wall.baseLine + openings shapes, same world-metres XZ frame) but emits no
// commands — daylight is a metric, not a placement. The result is the data
// source for the §27 DAYLIGHT-GRAPH + the §59 kitchen "natural-light" scorecard.

import { storeRegistry } from '@pryzm/core-app-model';
import {
    computeBuildingDaylight,
    defaultSunSamples,
} from '@pryzm/ai-host';
import type {
    BuildingDaylightResult,
    RoomDaylightInput,
} from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';
import {
    assembleRoomDaylightInput,
    type RoomDaylightAssembly,
    type RoomLike,
    type WallLike,
} from './roomDaylightAssembly.js';

interface FacadeLike {
    getFacades?: (levelId: string) => Map<string, { isExterior?: boolean }> | undefined;
}

/** A room the daylight pass REFUSED to score (GR-10 / C75 §1.4). */
export type UndeterminedRoomDaylight = Extract<RoomDaylightAssembly, { kind: 'undetermined' }>;

/** Assemble RoomDaylightInput[] from the live room + wall stores for `levelId`.
 *  External-wall WINDOW openings become WindowAperture rects; non-window or
 *  interior-wall openings are ignored (no sky behind them).
 *
 *  GR-10 — the per-room assembly is the PURE `assembleRoomDaylightInput`
 *  (roomDaylightAssembly.ts, node-tested). Rooms touching a wall whose opening
 *  set was never recorded come back in `undetermined`, NOT in `inputs`: scoring
 *  them would treat unknown windows as none and report the room darker than
 *  anyone measured. The caller excludes them and says so. */
export function buildRoomDaylightInputs(levelId: string): {
    inputs: RoomDaylightInput[];
    undetermined: UndeterminedRoomDaylight[];
} {
    const roomStore = storeRegistry.getStoreForType('room') as unknown as { getAll?(): RoomLike[] } | undefined;
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getAll?(): WallLike[] } | undefined;
    const allRooms = (roomStore?.getAll?.() ?? []).filter(r => r.levelId === levelId);
    const allWalls = (wallStore?.getAll?.() ?? []).filter(w => w.levelId === levelId);

    // Façade orientation — optional. A wall is treated as a window host only
    // when it is exterior (a window on an interior wall sees the next room, not
    // the sky). When the service is absent we fall back to "any wall with a
    // window opening is a host" so the command still produces a result.
    let facades: Map<string, { isExterior?: boolean }> | undefined;
    try {
        const w = window as unknown as { facadeOrientationService?: FacadeLike };
        facades = w.facadeOrientationService?.getFacades?.(levelId);
    } catch { facades = undefined; }

    const inputs: RoomDaylightInput[] = [];
    const undetermined: UndeterminedRoomDaylight[] = [];
    for (const r of allRooms) {
        const assembled = assembleRoomDaylightInput(r, allWalls, facades);
        if (assembled.kind === 'input') inputs.push(assembled.input);
        else if (assembled.kind === 'undetermined') undetermined.push(assembled);
        // 'skipped-degenerate' — nothing to score (legacy skip, a real non-room)
    }
    return { inputs, undetermined };
}

/** Resolve the site latitude (decimal degrees) for the default sun set, or a
 *  UK-ish fallback when no real site location is pinned. */
function resolveSiteLatitude(): { lat: number; source: 'site' | 'default' } {
    try {
        const origin = getCurrentSiteOrigin();
        if (origin && Number.isFinite(origin.lat) && (origin.lat !== 0 || origin.lon !== 0)) {
            return { lat: origin.lat, source: 'site' };
        }
    } catch { /* fall through */ }
    return { lat: 51.5, source: 'default' };
}

/** Run the read-only per-room daylight pass on the active level + log a table.
 *  Returns the result (or null when there's no active level / no rooms) so a
 *  caller / future panel can consume it. NEVER mutates a store. */
export function computeDaylightForActiveLevel(): BuildingDaylightResult | null {
    const level = resolveActiveLevel();
    if (!level?.id) {
        console.warn('[daylight] §DIAG-DAYLIGHT no active level — open a project first.');
        return null;
    }
    const { inputs, undetermined } = buildRoomDaylightInputs(level.id);
    // GR-10 / C78 §5 — the refusals are VISIBLE and named, never silently
    // folded into the scored set (or worse, scored as windowless).
    for (const u of undetermined) {
        console.warn(
            `[daylight] §DIAG-DAYLIGHT REFUSED room=${u.name}: ${u.reason} — ${u.detail} ` +
            `(excluded from the table; its daylight is UNKNOWN, not 0)`,
        );
    }
    if (inputs.length === 0) {
        if (undetermined.length > 0) {
            console.warn(
                `[daylight] §DIAG-DAYLIGHT no scorable rooms — all ${undetermined.length} room(s) on the ` +
                `active level were refused (unrecorded opening sets). This is NOT "no rooms".`,
            );
        } else {
            console.warn('[daylight] §DIAG-DAYLIGHT no rooms detected on the active level — generate or draw walls first.');
        }
        return null;
    }
    const { lat, source } = resolveSiteLatitude();
    const sun = defaultSunSamples(lat);
    const result = computeBuildingDaylight(inputs, sun);

    console.log(
        `[daylight] §DIAG-DAYLIGHT level=${level.id} rooms=${result.rooms.length} ` +
        `lat=${lat.toFixed(2)}° (${source}) meanScore=${result.meanScore.toFixed(2)} ` +
        `brightest=${result.brightestRoomId ?? '—'} darkest=${result.darkestRoomId ?? '—'}`,
    );
    for (const r of result.rooms) {
        console.log(
            `[daylight] §DIAG-DAYLIGHT room=${r.name ?? r.roomId} score=${r.score.toFixed(2)} ` +
            `windows=${r.windows.length} sunlit=${(r.sunlitFraction * 100).toFixed(0)}% ` +
            `samples=${r.sampleCount} raw=${r.raw.toFixed(2)}`,
        );
    }
    // A compact console.table when available (DevTools) — falls back silently.
    try {
        const rows = result.rooms.map(r => ({
            room: r.name ?? r.roomId,
            score: Number(r.score.toFixed(3)),
            windows: r.windows.length,
            sunlitPct: Number((r.sunlitFraction * 100).toFixed(0)),
        }));
        (console as unknown as { table?: (d: unknown) => void }).table?.(rows);
    } catch { /* ignore */ }

    return result;
}

declare global {
    interface Window {
        pryzmComputeDaylight?: () => BuildingDaylightResult | null;
    }
}

/** Install the read-only `window.pryzmComputeDaylight()` console command.
 *  Idempotent + side-effect-free until invoked. */
export function installDaylightConsole(): void {
    if (typeof window === 'undefined') return;
    window.pryzmComputeDaylight = () => computeDaylightForActiveLevel();
    console.log('[daylight] §DIAG-DAYLIGHT console command ready — run pryzmComputeDaylight() to score per-room daylight on the active level.');
}
