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
    WindowAperture,
} from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';

interface Pt { x: number; z: number }

interface RoomLike {
    id: string;
    levelId: string;
    name?: string;
    occupancyType?: string;
    boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }> };
    computed?: { centroid?: { x: number; z: number } };
}
interface OpeningLike {
    type: 'door' | 'window';
    offset?: number;     // m along baseLine[0] → baseLine[1]
    width?: number;      // m
    height?: number;     // m
    sillHeight?: number; // m
}
interface WallLike {
    id: string;
    levelId: string;
    baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
    openings?: ReadonlyArray<OpeningLike>;
}
interface FacadeLike {
    getFacades?: (levelId: string) => Map<string, { isExterior?: boolean }> | undefined;
}

const EPS = 1e-6;

function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.z - b.z); }
function sub(a: Pt, b: Pt): Pt { return { x: a.x - b.x, z: a.z - b.z }; }
function dot(a: Pt, b: Pt): number { return a.x * b.x + a.z * b.z; }
function unit(a: Pt): Pt { const L = Math.hypot(a.x, a.z) || 1; return { x: a.x / L, z: a.z / L }; }
function leftPerp(a: Pt): Pt { return { x: -a.z, z: a.x }; }
function add(a: Pt, b: Pt): Pt { return { x: a.x + b.x, z: a.z + b.z }; }
function mul(a: Pt, k: number): Pt { return { x: a.x * k, z: a.z * k }; }

/** Centroid of a polygon (shoelace; falls back to vertex mean). */
function centroidOf(poly: readonly Pt[]): Pt {
    let cx = 0, cz = 0, A = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        const cr = p.x * q.z - q.x * p.z;
        A += cr; cx += (p.x + q.x) * cr; cz += (p.z + q.z) * cr;
    }
    A *= 0.5;
    if (Math.abs(A) < EPS) {
        let sx = 0, sz = 0;
        for (const p of poly) { sx += p.x; sz += p.z; }
        return { x: sx / poly.length, z: sz / poly.length };
    }
    return { x: cx / (6 * A), z: cz / (6 * A) };
}

/** Find the wall whose centreline lies along the polygon edge a→b (mirrors
 *  FurnishLayoutExecutor.matchWallToEdge). */
function matchWallToEdge(a: Pt, b: Pt, walls: readonly WallLike[], tol: number): WallLike | undefined {
    for (const w of walls) {
        const bl = w.baseLine;
        if (!bl || bl.length < 2) continue;
        const wa: Pt = { x: bl[0]!.x, z: bl[0]!.z };
        const wb: Pt = { x: bl[1]!.x, z: bl[1]!.z };
        if ((dist(a, wa) < tol && dist(b, wb) < tol) ||
            (dist(a, wb) < tol && dist(b, wa) < tol)) return w;
        const wd = sub(wb, wa);
        const wlen = Math.hypot(wd.x, wd.z) || 1;
        const u: Pt = { x: wd.x / wlen, z: wd.z / wlen };
        const projA = dot(sub(a, wa), u), projB = dot(sub(b, wa), u);
        const perpA = Math.abs(dot(sub(a, wa), leftPerp(u)));
        const perpB = Math.abs(dot(sub(b, wa), leftPerp(u)));
        if (perpA < tol && perpB < tol &&
            projA > -tol && projA < wlen + tol &&
            projB > -tol && projB < wlen + tol) return w;
    }
    return undefined;
}

/** Assemble RoomDaylightInput[] from the live room + wall stores for `levelId`.
 *  External-wall WINDOW openings become WindowAperture rects; non-window or
 *  interior-wall openings are ignored (no sky behind them). */
export function buildRoomDaylightInputs(levelId: string): RoomDaylightInput[] {
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
    for (const r of allRooms) {
        const poly = (r.boundary?.polygon ?? []) as readonly Pt[];
        if (poly.length < 3) continue;
        const centroid = r.computed?.centroid ?? centroidOf(poly);
        const windows: WindowAperture[] = [];

        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!;
            const b = poly[(i + 1) % poly.length]!;
            if (dist(a, b) < EPS) continue;
            const wall = matchWallToEdge(a, b, allWalls, 0.2);
            if (!wall || !wall.baseLine || wall.baseLine.length < 2) continue;

            // Host gate: prefer the façade service; fall back to "has a window".
            const isExterior = facades?.get(wall.id)?.isExterior;
            if (isExterior === false) continue; // known interior wall — skip

            const ws: Pt = { x: wall.baseLine[0]!.x, z: wall.baseLine[0]!.z };
            const we: Pt = { x: wall.baseLine[1]!.x, z: wall.baseLine[1]!.z };
            const wdir = unit(sub(we, ws));
            // Outward normal = the edge perpendicular pointing AWAY from the room
            // centroid (away from the interior).
            const perp = leftPerp(wdir);
            const mid = mul(add(a, b), 0.5);
            const toCent = sub(centroid, mid);
            const outward = dot(perp, toCent) > 0 ? mul(perp, -1) : perp;

            for (const op of wall.openings ?? []) {
                if (op.type !== 'window') continue;
                if (typeof op.offset !== 'number' || typeof op.width !== 'number') continue;
                const sill = typeof op.sillHeight === 'number' ? op.sillHeight : 0.9;
                const head = sill + (typeof op.height === 'number' ? op.height : 1.2);
                const startPt = add(ws, mul(wdir, op.offset));
                const endPt = add(ws, mul(wdir, op.offset + op.width));
                windows.push({
                    a: startPt, b: endPt, sillM: sill, headM: head, outwardNormal: outward,
                    label: `${r.name ?? r.id}#${windows.length}`,
                });
            }
        }

        inputs.push({
            roomId: r.id,
            name: r.name ?? r.id,
            polygon: poly,
            windows,
        });
    }
    return inputs;
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
    const inputs = buildRoomDaylightInputs(level.id);
    if (inputs.length === 0) {
        console.warn('[daylight] §DIAG-DAYLIGHT no rooms detected on the active level — generate or draw walls first.');
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
