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

            // Carry the level's clear height as the override default — the
            // pure engine still applies its archetype if no override is given.
            const levelElevation = level.elevation ?? 0;
            const ceilingOverrideM = typeof level.height === 'number' ? level.height : undefined;

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
            let ceiled = 0, skipped = 0, voidSkipped = 0;
            for (const r of allRooms) {
                const poly = (r.boundary?.polygon ?? []) as readonly Pt[];
                if (poly.length < 3) { skipped++; continue; }
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
                }, { levelIds: [level.id], totalElementCount: set.totalElementCount, skipRedetectRooms: true });
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
}
