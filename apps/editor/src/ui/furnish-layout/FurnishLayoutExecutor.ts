// Furnish Layout — A6-style executor for the D-FLE engine.
//
// Mirrors ApartmentLayoutExecutor: subscribes to a runtime event
// ('furnish.layout-execute'), pulls every furnishable room on the active level
// out of the live wall/room/door/window stores, builds the per-room
// `FurnishRoomInput`, runs `furnishRoom`, and dispatches the resulting
// `furniture.create` commands INSIDE ONE `batchCoordinator.runBatch` so the
// whole furnishing is ONE undo unit + the room redetect is skipped (furniture
// doesn't change room topology).
//
// PURE wiring: the pure engine (`@pryzm/ai-host` furnishLayout) is imported
// STATICALLY (§SW-LAZY-CHUNK-404, 2026-06-10) — `@pryzm/ai-host` is already in
// the eager graph (engineLauncher imports `aiService` from the same barrel), so
// a lazy `await import` only duplicated the engine into a separate chunk hash
// that 404'd for returning clients after a deploy. Console command
// `window.pryzmFurnishAllRooms()` bypasses the AI panel for testing.

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    furnishRoom, furnishRoomCompound, buildFurnishCommands,
    validateFurnishedRoom,
} from '@pryzm/ai-host';
import type {
    FurnishRoomInput,
    OpeningPose,
    PlacedFurniture,
    RoomWallSeg,
} from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { getActiveDesignMetadata } from '../apartment-layout/activeBrief.js';
import { occupanciesForRoom, primaryOccupancy } from './furnishOccupancy.js';

interface Pt { x: number; z: number }

interface RoomLike {
    id: string;
    levelId: string;
    name?: string;
    occupancyType?: string;
    boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }>; height?: number };
    computed?: { area?: number; centroid?: { x: number; z: number } };
    boundingWallIds?: string[];
}

interface WallLike {
    id: string;
    levelId: string;
    thickness?: number;
    baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
    openings?: ReadonlyArray<{
        type: 'door' | 'window';
        elementId?: string;
        offset?: number;       // m along baseLine[0] → baseLine[1]
        width?: number;        // m
    }>;
}
interface FacadeLike {
    getFacades?: (levelId: string) => Map<string, { isExterior?: boolean }>;
}

const EPS = 1e-6;

function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.z - b.z); }
function dot(a: Pt, b: Pt): number  { return a.x * b.x + a.z * b.z; }
function sub(a: Pt, b: Pt): Pt      { return { x: a.x - b.x, z: a.z - b.z }; }
function add(a: Pt, b: Pt): Pt      { return { x: a.x + b.x, z: a.z + b.z }; }
function mul(a: Pt, k: number): Pt  { return { x: a.x * k, z: a.z * k }; }
function unit(a: Pt): Pt { const L = Math.hypot(a.x, a.z) || 1; return { x: a.x / L, z: a.z / L }; }
function leftPerp(a: Pt): Pt { return { x: -a.z, z: a.x }; }

/** Find the wall (from `walls`) whose centerline lies along the polygon edge
 *  `a → b`. A match means the edge endpoints are within `tol` (default 0.2 m,
 *  half a typical wall thickness) of the wall's two endpoints in either order. */
function matchWallToEdge(
    a: Pt, b: Pt, walls: readonly WallLike[], tol: number,
): WallLike | undefined {
    for (const w of walls) {
        const bl = w.baseLine;
        if (!bl || bl.length < 2) continue;
        const wa: Pt = { x: bl[0]!.x, z: bl[0]!.z };
        const wb: Pt = { x: bl[1]!.x, z: bl[1]!.z };
        // Edges match if BOTH endpoints are within tol (in either order).
        if ((dist(a, wa) < tol && dist(b, wb) < tol) ||
            (dist(a, wb) < tol && dist(b, wa) < tol)) {
            return w;
        }
        // Polygon edge may also LIE ALONG a longer wall (passthrough at T/X).
        // Detect: both `a` and `b` project onto the wall segment AND have
        // negligible perpendicular distance.
        const wd = sub(wb, wa);
        const wlen = Math.hypot(wd.x, wd.z) || 1;
        const u: Pt = { x: wd.x / wlen, z: wd.z / wlen };
        const projA = dot(sub(a, wa), u);
        const projB = dot(sub(b, wa), u);
        const perpA = Math.abs(dot(sub(a, wa), leftPerp(u)));
        const perpB = Math.abs(dot(sub(b, wa), leftPerp(u)));
        const onLine = perpA < tol && perpB < tol;
        const onSegA = projA > -tol && projA < wlen + tol;
        const onSegB = projB > -tol && projB < wlen + tol;
        if (onLine && onSegA && onSegB) return w;
    }
    return undefined;
}

function shoelaceCentroid(poly: readonly Pt[]): { centroid: Pt; area: number } {
    if (poly.length < 3) return { centroid: { x: 0, z: 0 }, area: 0 };
    let cx = 0, cz = 0, A = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!;
        const q = poly[(i + 1) % poly.length]!;
        const cross = p.x * q.z - q.x * p.z;
        A += cross;
        cx += (p.x + q.x) * cross;
        cz += (p.z + q.z) * cross;
    }
    A *= 0.5;
    if (Math.abs(A) < EPS) return { centroid: { x: 0, z: 0 }, area: 0 };
    return { centroid: { x: cx / (6 * A), z: cz / (6 * A) }, area: Math.abs(A) };
}

/** §SUB-ZONE: a single D-TGL space within an apartment layout — used to
 *  furnish each sub-program (kitchen, dining, living) in its OWN polygon
 *  even when the editor's room detection merged them into one open-plan room. */
interface SubZone {
    readonly name: string;
    readonly occupancy: string;
    readonly area: number;
    readonly centroid: { x: number; z: number };
    readonly polygon: ReadonlyArray<{ x: number; z: number }>;
}

/** Ray-cast point-in-polygon (world XZ). */
function pointInPolygon(p: Pt, poly: ReadonlyArray<{ x: number; z: number }>): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]!.x, zi = poly[i]!.z, xj = poly[j]!.x, zj = poly[j]!.z;
        if (((zi > p.z) !== (zj > p.z)) && (p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi)) hit = !hit;
    }
    return hit;
}

export class FurnishLayoutExecutor {
    private _dispose: (() => void) | null = null;
    /** Last apartment.layout-executed sub-zones (cached so the next furnish run
     *  can constrain each sub-program to its own polygon — see §SUB-ZONE). */
    private _subZones: { levelId: string; zones: SubZone[] } | null = null;

    /** Subscribe to 'furnish.layout-execute'. Idempotent. */
    attach(runtime: PryzmRuntime): void {
        if (this._dispose) return;
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        const subFurnish = events.on?.('furnish.layout-execute', () => {
            void this._execute(runtime);
        });
        // §SUB-ZONE: cache D-TGL sub-zones emitted by the apartment generator
        // so the furnish run can split a merged open-plan detected room back
        // into its underlying program rooms (kitchen, dining, living, hall).
        const subApt = events.on?.('apartment.layout-executed', (payload) => {
            const p = payload as { levelId?: string; subZones?: SubZone[] } | undefined;
            if (p && typeof p.levelId === 'string' && Array.isArray(p.subZones)) {
                this._subZones = { levelId: p.levelId, zones: p.subZones };
            }
        });
        const disp1 = typeof subFurnish === 'function' ? subFurnish : () => { /* */ };
        const disp2 = typeof subApt === 'function' ? subApt : () => { /* */ };
        this._dispose = () => { disp1(); disp2(); };
    }
    detach(): void { this._dispose?.(); this._dispose = null; this._subZones = null; }

    private async _execute(runtime: PryzmRuntime): Promise<void> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };
        try {
            const level = resolveActiveLevel();
            if (!level?.id) { toast('No active level — open a project first.', 'error'); return; }

            const wallStore = storeRegistry.getStoreForType('wall') as unknown as
                { getAll?(): WallLike[] } | undefined;
            const roomStore = storeRegistry.getStoreForType('room') as unknown as
                { getAll?(): RoomLike[] } | undefined;
            const allRooms = (roomStore?.getAll?.() ?? []).filter(r => r.levelId === level.id);
            const allWalls = (wallStore?.getAll?.() ?? []).filter(w => w.levelId === level.id);
            if (allRooms.length === 0) {
                toast('No rooms detected on the active level — generate or draw walls first.', 'warn');
                return;
            }

            // Facade orientation (for isExterior flag). Lazy + optional.
            let facades: Map<string, { isExterior?: boolean }> | undefined;
            try {
                const w = window as unknown as { facadeOrientationService?: FacadeLike };
                facades = w.facadeOrientationService?.getFacades?.(level.id);
            } catch { facades = undefined; }

            // §SW-LAZY-CHUNK-404 (2026-06-10): the pure engine
            // (`furnishRoom`/`buildFurnishCommands`/…) is imported STATICALLY at
            // module top now, NOT via `await import('@pryzm/ai-host')`. The
            // dynamic split bought nothing — `@pryzm/ai-host` is ALREADY in the
            // eager graph (engineLauncher.ts imports `aiService` from the same
            // barrel), so the lazy split merely DUPLICATED the engine into a
            // fragile `index-<hash>.js` chunk. A returning client holding a stale
            // shell would 404 that hash after a deploy and the feature would die
            // ("Failed to fetch dynamically imported module"). Static import
            // folds the code into the main eager graph → no separate chunk hash
            // to go missing. See report + tracker DEPLOY-LAZY-CHUNK-404.

            // A.21.D20 — kitchen/wardrobe run-shape options from the brief.
            // `kitchenLayout` / `wardrobeLayout` chips → planKitchen/planWardrobe.
            // A kitchen-mounted washing machine is added when the layout has NO
            // separate utility room (otherwise the washer lives there).
            const briefMd = (() => {
                try { return getActiveDesignMetadata(); } catch { return null; }
            })();
            const hasUtilityRoom = allRooms.some(
                r => occupanciesForRoom(r).includes('utility-room'),
            );
            const furnishOptions = {
                kitchenLayout: typeof briefMd?.kitchenLayout === 'string' ? briefMd.kitchenLayout : 'auto',
                wardrobeLayout: typeof briefMd?.wardrobeLayout === 'string' ? briefMd.wardrobeLayout : 'auto',
                kitchenWashingMachine: !hasUtilityRoom,
            };

            const levelElevation = level.elevation ?? 0;
            const allPlaced: PlacedFurniture[] = [];
            let roomsProcessed = 0;
            let roomsSkipped = 0;
            // §F-Sprint-5 circulation gate (2026-05-29): collect soft warnings
            // per furnished room — door-blocked path, footprint outside polygon,
            // overlap — and surface them on `furnish.layout-executed` so the
            // editor (or a future ranked-arrangement pass) can prefer warnings-
            // free arrangements. Validator is pure (`validateFurnishedRoom`,
            // 23695d3); this is the wiring half.
            const validationWarnings: string[] = [];
            const runValidation = (inp: FurnishRoomInput, placed: readonly PlacedFurniture[]): void => {
                if (placed.length === 0) return;
                try {
                    const v = validateFurnishedRoom(inp, placed);
                    if (!v.ok) {
                        for (const w of v.warnings) {
                            const tagged = `[${inp.roomId}] ${w}`;
                            validationWarnings.push(tagged);
                            console.warn('[furnish-layout] §VALIDATE', tagged);
                        }
                    }
                } catch (e) {
                    console.warn('[furnish-layout] validate failed (skipped):', e);
                }
            };

            /** Build a FurnishRoomInput from any polygon (detected-room or
             *  D-TGL sub-zone). Each polygon edge becomes a wall seg; edges
             *  that match a real editor wall carry that wall's openings, edges
             *  that don't (boundary lines between sub-zones) carry none. */
            const buildInput = (
                poly: readonly Pt[], occupancy: string, roomId: string,
                cxIn?: number, czIn?: number, areaIn?: number,
            ): FurnishRoomInput | null => {
                if (poly.length < 3) return null;
                const { centroid, area } = shoelaceCentroid(poly);
                const cx = cxIn ?? centroid.x;
                const cz = czIn ?? centroid.z;
                const areaM2 = areaIn ?? area;
                const wallSegs: RoomWallSeg[] = [];
                const doors: OpeningPose[] = [];
                const windows: OpeningPose[] = [];
                for (let i = 0; i < poly.length; i++) {
                    const a = poly[i]!;
                    const b = poly[(i + 1) % poly.length]!;
                    const len = dist(a, b);
                    if (len < EPS) continue;
                    const dirU = unit(sub(b, a));
                    const perp = leftPerp(dirU);
                    const mid = mul(add(a, b), 0.5);
                    const toCent = sub({ x: cx, z: cz }, mid);
                    const inwardSign = dot(perp, toCent) > 0 ? 1 : -1;
                    const inwardNormal: Pt = mul(perp, inwardSign);

                    const w = matchWallToEdge(a, b, allWalls, 0.2);
                    const isExterior = w ? (facades?.get(w.id)?.isExterior ?? false) : false;
                    wallSegs.push({ a, b, inwardNormal, length: len, isExterior });

                    if (w) {
                        for (const op of w.openings ?? []) {
                            if (typeof op.offset !== 'number' || typeof op.width !== 'number') continue;
                            const bl = w.baseLine!;
                            const ws: Pt = { x: bl[0]!.x, z: bl[0]!.z };
                            const we: Pt = { x: bl[1]!.x, z: bl[1]!.z };
                            const wdir = unit(sub(we, ws));
                            const centerWorld = add(ws, mul(wdir, op.offset + op.width / 2));
                            const pose: OpeningPose = {
                                type: op.type,
                                center: centerWorld,
                                normal: inwardNormal,
                                width: op.width,
                            };
                            if (op.type === 'door') doors.push(pose);
                            else windows.push(pose);
                        }
                    }
                }
                return {
                    roomId, levelId: level.id, occupancy,
                    polygon: poly, centroid: { x: cx, z: cz }, areaM2,
                    walls: wallSegs, doors, windows, levelElevation,
                };
            };

            // §SUB-ZONE cache for THIS level — index sub-zones whose centroid
            // falls inside each detected room polygon. Lets a merged open-plan
            // detected room be furnished as several independent sub-rooms.
            //
            // STALENESS GUARD: the cache is populated by `apartment.layout-
            // executed`. If the user manually edits walls/rooms between the
            // apartment build and this furnish run, the cached sub-zone
            // polygons may no longer match the detected rooms. Soft check:
            // verify each cached sub-zone's centroid still lies inside SOME
            // detected room on this level; if NO sub-zone matches (whole
            // cache obsolete), discard the cache and fall back to the
            // compound-name path. Per-zone misses are tolerated — those just
            // don't contribute. After consumption the cache is single-use:
            // cleared so the next furnish run re-acquires fresh data on a
            // fresh apartment build.
            let subZones = (this._subZones?.levelId === level.id ? this._subZones.zones : [])
                .filter(sz => sz.polygon.length >= 3);
            if (subZones.length > 0) {
                const liveAny = subZones.some(sz =>
                    allRooms.some(r => {
                        const rp = (r.boundary?.polygon ?? []) as readonly Pt[];
                        return rp.length >= 3 && pointInPolygon(sz.centroid, rp);
                    }),
                );
                if (!liveAny) {
                    console.warn('[furnish-layout] §SUB-ZONE cache STALE (no sub-zone centroid lies inside any detected room) — falling back to compound-name path');
                    subZones = [];
                }
            }

            for (const r of allRooms) {
                const poly = (r.boundary?.polygon ?? []) as readonly Pt[];
                if (poly.length < 3) { roomsSkipped++; continue; }
                // A.21.D24 — occupancyType first, then name-derived fallback so a
                // room whose naming pass hasn't applied yet (or a manually-drawn
                // room) still resolves to a furnishable archetype.
                const occupancy = primaryOccupancy(r);
                const { centroid, area } = shoelaceCentroid(poly);
                const cx = r.computed?.centroid?.x ?? centroid.x;
                const cz = r.computed?.centroid?.z ?? centroid.z;
                const areaM2 = r.computed?.area ?? area;

                // Which D-TGL sub-zones (if any) sit inside this detected room?
                const contained = subZones.filter(sz => pointInPolygon(sz.centroid, poly));

                // Open-plan + sub-zones available: furnish each sub-zone with
                // its OWN polygon (kitchen run anchors against the kitchen
                // sub-zone's walls, dining table at the dining sub-zone's
                // centroid). Boundary-line edges between sub-zones become
                // wall segs with no openings — perfectly fine for D-FLE.
                if (contained.length > 1) {
                    let placedAny = false;
                    for (const sz of contained) {
                        const inp = buildInput(sz.polygon, sz.occupancy, `${r.id}::${sz.name}`, sz.centroid.x, sz.centroid.z, sz.area);
                        if (!inp) continue;
                        const placed = furnishRoom(inp, furnishOptions);
                        if (placed.length > 0) { placedAny = true; allPlaced.push(...placed); }
                        runValidation(inp, placed);
                    }
                    if (placedAny) roomsProcessed++; else roomsSkipped++;
                    continue;
                }

                const input = buildInput(poly, occupancy, r.id, cx, cz, areaM2);
                if (!input) { roomsSkipped++; continue; }

                // Compound name fallback — sub-zones missing (e.g. manual edits)
                // but the room is named "Living Room / Kitchen / Dining". Run
                // each archetype in the merged polygon with shared obstacles.
                const occupancies = occupanciesForRoom(r);
                const placed = occupancies.length > 1
                    ? furnishRoomCompound(input, occupancies, furnishOptions)
                    : furnishRoom(input, furnishOptions);
                if (placed.length > 0) { roomsProcessed++; allPlaced.push(...placed); }
                else roomsSkipped++;
                runValidation(input, placed);
            }

            // §SUB-ZONE single-use cache: discard once consumed. A subsequent
            // furnish run after manual wall/room edits will then take the
            // compound-name fallback path; the user can refresh via a new
            // apartment.layout-execute. Prevents stale sub-zones being applied
            // to a layout the user edited between the two phases.
            if (this._subZones?.levelId === level.id) this._subZones = null;

            console.log(
                '[furnish-layout] §FURNISH-SUMMARY ' +
                `rooms_total=${allRooms.length} rooms_furnished=${roomsProcessed} ` +
                `rooms_skipped=${roomsSkipped} items_placed=${allPlaced.length} ` +
                `validation_warnings=${validationWarnings.length}`,
            );

            if (allPlaced.length === 0) {
                // A.21.D24 — make the no-op LOUD, never silent. Dump per-room
                // resolved occupancy so the cause is obvious (e.g. every room
                // resolves to '' → the room-naming pass never set occupancyType,
                // or 'corridor'/unknown → no archetype by design).
                const breakdown = allRooms.map(r => {
                    const occ = primaryOccupancy(r) || '(none)';
                    return `${r.name ?? r.id}→${occ}`;
                }).join(', ');
                console.warn(
                    '[furnish-layout] §FURNISH-EMPTY — 0 items placed across ' +
                    `${allRooms.length} room(s) on level ${level.id}. Per-room occupancy: ${breakdown}. ` +
                    'If every room shows (none), the room-naming pass did not set occupancyType ' +
                    '(generate the layout, or ensure rooms carry a recognised name).',
                );
                toast('No furniture placed — rooms have no recognised occupancy type. See console.', 'warn');
                runtime.events.emit('furnish.layout-executed', {
                    placedCount: 0, roomCount: allRooms.length, levelId: level.id,
                    validationWarnings: [],
                });
                return;
            }

            // A.21.D4 — pass the brief style chip (modern/classic/minimal/warm) so
            // the furniture gets style-driven colour + finish (previously a no-op).
            const briefStyle = (() => {
                try {
                    // §A.6.c — typology-agnostic: a house brief drives the same style.
                    const md = getActiveDesignMetadata();
                    return typeof md?.style === 'string' ? md.style : undefined;
                } catch { return undefined; }
            })();
            const set = buildFurnishCommands(allPlaced, level.id, levelElevation, () => createId('furniture'), briefStyle);
            if (set.warnings.length > 0) {
                for (const w of set.warnings) console.warn('[furnish-layout] warning:', w);
            }

            // Dispatch every furniture.create inside one runBatch — ONE undo unit,
            // skip room redetect (furniture isn't a room-bounding element).
            let fails = 0;
            try {
                batchCoordinator.runBatch(() => {
                    for (const cmd of set.commands) {
                        const r = runtime.bus.executeCommand(cmd.command, cmd.payload) as unknown;
                        if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                            (r as Promise<unknown>).catch((e: unknown) => {
                                fails++; console.warn('[furnish-layout] furniture.create failed:', e);
                            });
                        }
                    }
                }, { levelIds: [level.id], totalElementCount: set.commands.length, skipRedetectRooms: true });
            } catch (e) {
                console.warn('[furnish-layout] runBatch threw:', e);
                toast('Furnishing failed — see console.', 'error');
                return;
            }

            // §F-Sprint-5: surface validation warnings on a brief toast — the
            // user can ignore them or open the console for the full list. The
            // warnings array is also emitted on the layout-executed event so
            // downstream automation (a future quality-pass that re-rolls when
            // warnings appear) can react.
            if (validationWarnings.length > 0) {
                toast(
                    `Furnished with ${validationWarnings.length} circulation warning(s) — see console.`,
                    'warn',
                );
            }
            runtime.events.emit('furnish.layout-executed', {
                placedCount: set.commands.length,
                roomCount: allRooms.length,
                levelId: level.id,
                validationWarnings: [...validationWarnings],
            });
            toast(
                `Furnished ${roomsProcessed}/${allRooms.length} rooms — ${set.commands.length} items placed.`,
                'success',
            );
        } catch (err) {
            console.warn('[FurnishLayoutExecutor] execute failed (non-fatal):', err);
            runtime.events?.emit('pryzm:toast', { message: 'Furnishing failed.', severity: 'error' });
        }
    }
}
