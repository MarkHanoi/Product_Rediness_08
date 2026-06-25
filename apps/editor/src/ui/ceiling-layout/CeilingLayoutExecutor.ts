// Ceiling Layout — A6-style executor for the D-CE engine.
//
// Mirrors FurnishLayoutExecutor / LightingLayoutExecutor: subscribes to
// 'ceiling.layout-execute', reads every ceilable room on the active level
// from the room store, assembles `CeilingRoomInput` per room, runs
// `ceilingForRoom`, and dispatches the resulting `ceiling.batch.create`
// command INSIDE ONE `batchCoordinator.runBatch` — one undo unit,
// skipRedetectRooms because ceiling slabs aren't room-bounding.
//
// PURE wiring: the engine is imported STATICALLY (§SW-LAZY-CHUNK-404,
// 2026-06-10). `@pryzm/ai-host` is already eager (engineLauncher imports
// `aiService` from the same barrel), so a lazy `await import` only duplicated
// the engine into a separate chunk hash that 404'd for returning clients after
// a deploy. Static import folds it into the main graph — no lazy chunk to miss.

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { ceilingForRoom, buildCeilingCommands } from '@pryzm/ai-host';
import type { CeilingRoomInput, PlacedCeiling } from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { getStairVoidsForLevel } from '../house-layout/houseStairVoids.js';

interface Pt { x: number; z: number }

// §RESI-CEILING-CLEARHEIGHT (2026-06-25) — the finished ceiling sits at the room's CLEAR
// height, NOT the structural floor-to-floor (ftf). Previously the executor passed `level.height`
// (the ftf, e.g. 3.0 m) verbatim as the ceiling-height override, so the ceiling slab was placed
// at the full storey height instead of a realistic finished-ceiling level — visually wrong and
// it left no service zone for the floor build-up / ducts / down-stand above.
//
// We reserve a service/structure zone below the slab above and place the ceiling at
// `ftf - SERVICE_ZONE_M`, clamped to a sane band. A typical UK/EU residential ftf of 3.0 m with
// a ~0.6 m zone gives the standard ~2.4 m clear ceiling.
const CEILING_SERVICE_ZONE_M = 0.6;   // floor build-up + structure + MEP service void below the slab above
// §RESI-CEILING-DOOR-HEAD (audit 2026-06-25 D3) — the ceiling must clear the door HEAD, never sit
// flush on / below it. Standard residential door leaves are 2.1 m (every CreateWallOpenings door in
// the resi pipeline uses height 2.1), so the minimum clear ceiling is the door head + a small gap.
// Before this the floor was a bare 2.1 m, so a short storey (ftf ≤ ~2.7 m) clamped the ceiling to
// exactly 2.1 m = flush on the door head (visual/physical clash). 2.15 m keeps the ceiling above it.
const DOOR_HEAD_M = 2.1;               // standard residential door leaf height (matches the door builders)
const CEILING_DOOR_CLEARANCE_M = 0.05; // keep the ceiling strictly above the door head
const MIN_CLEAR_CEILING_M = DOOR_HEAD_M + CEILING_DOOR_CLEARANCE_M; // 2.15 — clear the door head, never flush
const DEFAULT_CLEAR_CEILING_M = 2.4;  // fallback clear height when the level reports no ftf

/** §RESI-CEILING-CLEARHEIGHT — convert a floor-to-floor height to a finished clear ceiling
 *  height. `undefined`/invalid ftf (level didn't report one) → `DEFAULT_CLEAR_CEILING_M` so the
 *  ceiling still lands at a realistic finished height (never the raw storey height). A reported
 *  ftf is reduced by the service zone and clamped to [MIN_CLEAR_CEILING_M, ftf). On a very short
 *  storey the ceiling sits just above the door head (MIN_CLEAR_CEILING_M) but never exceeds the
 *  ftf itself. Exported for unit test. */
export function clearCeilingHeightFromFtf(ftf: number | undefined): number {
    if (typeof ftf !== 'number' || !Number.isFinite(ftf) || ftf <= 0) return DEFAULT_CLEAR_CEILING_M;
    const clear = ftf - CEILING_SERVICE_ZONE_M;
    if (clear < MIN_CLEAR_CEILING_M) {
        // Very low storey — sit just above the door head (§RESI-CEILING-DOOR-HEAD) but never exceed
        // the ftf itself. A storey so short that even the door head doesn't fit is an upstream defect.
        return Math.min(ftf, MIN_CLEAR_CEILING_M);
    }
    return clear;
}

interface RoomLike {
    id: string;
    levelId: string;
    occupancyType?: string;
    boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }> };
}

export class CeilingLayoutExecutor {
    private _dispose: (() => void) | null = null;

    attach(runtime: PryzmRuntime): void {
        if (this._dispose) return;
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        const sub = events.on?.('ceiling.layout-execute', () => {
            void this._execute(runtime);
        });
        this._dispose = typeof sub === 'function' ? sub : () => { /* */ };
    }
    detach(): void { this._dispose?.(); this._dispose = null; }

    private async _execute(runtime: PryzmRuntime): Promise<void> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };
        try {
            const level = resolveActiveLevel();
            if (!level?.id) { toast('No active level — open a project first.', 'error'); return; }

            const roomStore = storeRegistry.getStoreForType('room') as unknown as
                { getAll?(): RoomLike[] } | undefined;
            const allRooms = (roomStore?.getAll?.() ?? []).filter(r => r.levelId === level.id);
            if (allRooms.length === 0) {
                toast('No rooms detected — build walls first.', 'warn');
                return;
            }

            // §RESI-CEILING-CLEARHEIGHT — derive the finished CLEAR ceiling height from the level's
            // floor-to-floor height (subtract the service/structure zone), NOT the raw ftf. Passing
            // ftf verbatim (the old behaviour) placed the slab at the full storey height. When the
            // level reports no ftf, a realistic default clear height is used (DEFAULT_CLEAR_CEILING_M).
            const levelElevation = level.elevation ?? 0;
            const ceilingOverrideM = clearCeilingHeightFromFtf(level.height);

            // §SW-LAZY-CHUNK-404: engine imported statically at module top.

            // §A.21.D29 #1 — stairwell voids on THIS level. The ceiling producer
            // (produceCeiling) fans a SOLID polygon from its centroid and cannot carry
            // a hole, so a ceiling tile over the stair room would re-cover the open
            // stairwell. Pragmatic correct fix: SKIP the ceiling for the room that hosts
            // a void (its centroid falls inside the room boundary). Empty for the
            // apartment + single-storey paths (no stairs) → every room is ceiled as
            // before. (Floors DO cut a true hole — produceFloor extrudes a Shape with
            // holes; ceilings don't have that path, hence skip-not-cut here.)
            const voids = getStairVoidsForLevel(level.id);
            const roomHostsVoid = (poly: readonly Pt[]): boolean => {
                if (voids.length === 0 || poly.length < 3) return false;
                return voids.some(v => {
                    if (v.polygon.length < 3) return false;
                    const c = this._polyCentroid(v.polygon);
                    return this._pointInPoly(c, poly);
                });
            };

            const allPlaced: PlacedCeiling[] = [];
            let ceiled = 0, skipped = 0, voidSkipped = 0, degenerateSkipped = 0;
            for (const r of allRooms) {
                const rawPoly = (r.boundary?.polygon ?? []) as readonly Pt[];
                if (rawPoly.length < 3) { skipped++; continue; }
                // §RESI-CEILING-DEGENERATE-GUARD-2 (2026-06-25) — CLEAN the room polygon (drop near-
                // coincident + collinear vertices) and AREA-GUARD it BEFORE emitting a ceiling. A room
                // can carry a ≥3-point but zero-area / collinear boundary mid-detection; a ceiling built
                // on it persists with <3 distinct corners → load-fails `validatePolygon` and freezes
                // project-open (the "120 elements failed" bug). SKIP such rooms; pass the CLEAN polygon.
                const poly = this._cleanRing(rawPoly);
                if (poly.length < 3 || Math.abs(this._signedArea(poly)) < 0.05) {
                    degenerateSkipped++; skipped++;
                    continue;
                }
                if (roomHostsVoid(poly)) {
                    voidSkipped++; skipped++;
                    console.log('[ceiling-layout] §VOID-FINISH skipping ceiling for stairwell-void room', r.id);
                    continue;
                }
                const input: CeilingRoomInput = {
                    roomId: r.id,
                    levelId: level.id,
                    occupancy: r.occupancyType ?? '',
                    polygon: poly,
                    levelElevation,
                    ...(ceilingOverrideM !== undefined ? { ceilingHeightM: ceilingOverrideM } : {}),
                };
                const placed = ceilingForRoom(input);
                if (placed) { ceiled++; allPlaced.push(placed); }
                else skipped++;
            }
            if (degenerateSkipped > 0) {
                console.warn(`[ceiling-layout] §RESI-CEILING-DEGENERATE-GUARD-2 skipped ${degenerateSkipped} room(s) with a degenerate (collinear/zero-area) boundary — no ceiling emitted for them.`);
            }

            console.log(
                '[ceiling-layout] §CEILING-SUMMARY ' +
                `rooms_total=${allRooms.length} rooms_ceiled=${ceiled} ` +
                `rooms_skipped=${skipped} (void_skipped=${voidSkipped}) ceilings_placed=${allPlaced.length}`,
            );

            if (allPlaced.length === 0) {
                toast('No ceilings placed — no rooms match a ceiling archetype.', 'warn');
                runtime.events.emit('ceiling.layout-executed', {
                    placedCount: 0, roomCount: allRooms.length, levelId: level.id,
                });
                return;
            }

            const set = buildCeilingCommands(allPlaced, level.id, () => createId('ceiling'));
            for (const w of set.warnings) console.warn('[ceiling-layout] warning:', w);

            // ONE runBatch — single undo unit. Ceilings don't bound rooms,
            // so skip the redetect sweep.
            try {
                batchCoordinator.runBatch(() => {
                    for (const cmd of set.commands) {
                        const r = runtime.bus.executeCommand(cmd.command, cmd.payload) as unknown;
                        if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                            (r as Promise<unknown>).catch((e: unknown) =>
                                console.warn('[ceiling-layout] ceiling.batch.create failed:', e));
                        }
                    }
                }, { levelIds: [level.id], totalElementCount: set.totalElementCount, skipRedetectRooms: true, skipPbrUpgrade: true });  // §POSTGEN-PERF: finish batch adds no walls + PBR-ready meshes → skip the wasted full-scene PBR render
            } catch (e) {
                console.warn('[ceiling-layout] runBatch threw:', e);
                toast('Ceiling auto-place failed — see console.', 'error');
                return;
            }

            runtime.events.emit('ceiling.layout-executed', {
                placedCount: set.totalElementCount,
                roomCount: allRooms.length,
                levelId: level.id,
            });
            toast(
                `Ceiled ${ceiled}/${allRooms.length} rooms — ${set.totalElementCount} slabs placed.`,
                'success',
            );
        } catch (err) {
            console.warn('[CeilingLayoutExecutor] execute failed (non-fatal):', err);
            runtime.events?.emit('pryzm:toast', { message: 'Ceiling auto-place failed.', severity: 'error' });
        }
    }

    /** Vertex-average centroid of a polygon (world X-Z). */
    private _polyCentroid(poly: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
        let sx = 0, sz = 0;
        for (const p of poly) { sx += p.x; sz += p.z; }
        const n = poly.length || 1;
        return { x: sx / n, z: sz / n };
    }

    /** Ray-cast point-in-polygon test in world X-Z. */
    private _pointInPoly(pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i]!, b = poly[j]!;
            const intersects = (a.z > pt.z) !== (b.z > pt.z)
                && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x;
            if (intersects) inside = !inside;
        }
        return inside;
    }

    /** §RESI-CEILING-DEGENERATE-GUARD-2 — clean a ring: drop consecutive near-coincident points
     *  (< 1 mm) AND collinear vertices (zero cross-product), close the wrap. Returns the distinct
     *  corners; a degenerate (line/point) input collapses to < 3 so the caller can skip it. */
    private _cleanRing(poly: ReadonlyArray<{ x: number; z: number }>): Array<{ x: number; z: number }> {
        const dedup: Array<{ x: number; z: number }> = [];
        for (const p of poly) {
            const prev = dedup[dedup.length - 1];
            if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 1e-3) continue;
            dedup.push({ x: p.x, z: p.z });
        }
        if (dedup.length >= 2) {
            const a = dedup[0]!, z = dedup[dedup.length - 1]!;
            if (Math.hypot(a.x - z.x, a.z - z.z) < 1e-3) dedup.pop();
        }
        if (dedup.length < 3) return dedup;
        // Drop collinear vertices (a→b→c with zero cross-product).
        const out: Array<{ x: number; z: number }> = [];
        for (let i = 0; i < dedup.length; i++) {
            const a = dedup[(i - 1 + dedup.length) % dedup.length]!, b = dedup[i]!, c = dedup[(i + 1) % dedup.length]!;
            const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
            if (Math.abs(cross) > 1e-6) out.push(b);
        }
        return out.length >= 3 ? out : dedup;
    }

    /** §RESI-CEILING-DEGENERATE-GUARD-2 — shoelace signed area of an XZ ring (m²). */
    private _signedArea(poly: ReadonlyArray<{ x: number; z: number }>): number {
        let s = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
            s += a.x * b.z - b.x * a.z;
        }
        return s * 0.5;
    }
}
