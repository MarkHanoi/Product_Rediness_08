// Lighting Layout — A6-style executor for the D-LE engine.
//
// Mirrors FurnishLayoutExecutor: subscribes to 'lighting.layout-execute',
// reads every furnishable room on the active level from the wall/room/door
// stores, assembles `LightRoomInput` per room, runs `lightRoom`, and
// dispatches the resulting `lighting.create` commands INSIDE ONE
// `batchCoordinator.runBatch` — one undo unit, skipRedetectRooms because
// lighting fixtures aren't room-bounding.
//
// PURE wiring: the engine is imported STATICALLY (§SW-LAZY-CHUNK-404,
// 2026-06-10). `@pryzm/ai-host` is already eager (engineLauncher imports
// `aiService` from the same barrel), so a lazy `await import` only duplicated
// the engine into a separate chunk hash that 404'd for returning clients after
// a deploy. Static import folds it into the main graph — no lazy chunk to miss.

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { lightRoom, buildLightingCommands } from '@pryzm/ai-host';
import type { LightRoomInput, PlacedLight } from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';

interface Pt { x: number; z: number }

interface RoomLike {
    id: string;
    levelId: string;
    occupancyType?: string;
    boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }>; height?: number };
    computed?: { area?: number; centroid?: { x: number; z: number } };
}

const EPS = 1e-6;

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

export class LightingLayoutExecutor {
    private _dispose: (() => void) | null = null;

    attach(runtime: PryzmRuntime): void {
        if (this._dispose) return;
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        const sub = events.on?.('lighting.layout-execute', () => {
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

            // Ceiling Y: level elevation + (level.height OR 2.7 m). The wiring
            // layer applies the default so the pure engine stays config-free.
            const levelElevation = level.elevation ?? 0;
            const ceilingY = levelElevation + (level.height ?? 2.7);

            // §SW-LAZY-CHUNK-404: engine imported statically at module top.

            const allPlaced: PlacedLight[] = [];
            let lit = 0, skipped = 0;
            for (const r of allRooms) {
                const poly = (r.boundary?.polygon ?? []) as readonly Pt[];
                if (poly.length < 3) { skipped++; continue; }
                const occupancy = r.occupancyType ?? '';
                const { centroid, area } = shoelaceCentroid(poly);
                const cx = r.computed?.centroid?.x ?? centroid.x;
                const cz = r.computed?.centroid?.z ?? centroid.z;
                const areaM2 = r.computed?.area ?? area;
                const input: LightRoomInput = {
                    roomId: r.id,
                    levelId: level.id,
                    occupancy,
                    polygon: poly,
                    centroid: { x: cx, z: cz },
                    areaM2,
                    levelElevation,
                    ceilingY,
                };
                const placed = lightRoom(input);
                if (placed.length > 0) { lit++; allPlaced.push(...placed); }
                else skipped++;
            }

            console.log(
                '[lighting-layout] §LIGHT-SUMMARY ' +
                `rooms_total=${allRooms.length} rooms_lit=${lit} ` +
                `rooms_skipped=${skipped} fixtures_placed=${allPlaced.length}`,
            );

            if (allPlaced.length === 0) {
                toast('No lighting placed — no rooms match a lighting archetype.', 'warn');
                runtime.events.emit('lighting.layout-executed', {
                    placedCount: 0, roomCount: allRooms.length, levelId: level.id,
                });
                return;
            }

            const set = buildLightingCommands(allPlaced, level.id, () => createId('lighting'));
            for (const w of set.warnings) console.warn('[lighting-layout] warning:', w);

            // §FIX-RUNBATCH-NESTING-DROPS-GUARDS (L-209) — commit the N `lighting.create`
            // commands inside ONE `runBatch` so they form ONE undo unit (C17 DI-6 / PS-3:
            // "each dispatch is exactly one undo unit") and the `skipRedetectRooms` /
            // `skipPbrUpgrade` opts are honoured.
            //
            // BUT `runBatch` refuses to nest: when this executor runs as the terminus of
            // the multi-storey HOUSE post-gen chain, the house's structural `runBatch`
            // (HouseLayoutExecutor.ts) is STILL draining, so `isBatching` is true and a
            // nested `runBatch` here would run its body UNGUARDED — the N fixtures become
            // N separate undo transactions and the opts are silently discarded (the
            // founder saw 59 fixtures = 59 undo steps). Making `runBatch` re-entrant is
            // rejected: it would change global semantics for every caller and still could
            // not fold nested work into one correct undo unit.
            //
            // Fix, caller-side: if a batch is already open, DEFER the commit via
            // `onNextSettle` so it opens a CLEAN, non-nested batch once the ambient batch
            // has fully settled. The ambient (structural) batch settles on its own
            // geometry drain — it never awaits this lighting commit — so the deferral can
            // never deadlock against the settle it waits on. If `isBatching` is false (the
            // apartment single-level path, invoked outside any batch) the commit runs
            // immediately, exactly as before — behaviour-preserving.
            //
            // `lighting.layout-executed` MUST fire AFTER the commit in BOTH paths: the
            // house chain sequences the next storey on it (runHousePostGenChain.ts). In
            // the deferred path it therefore fires later (after the ambient batch settles);
            // the chain's §CHAIN-TIMEOUT (12 000 ms) is the backstop if the ambient batch
            // never settles, so a missed settle degrades to "no fixtures" but never wedges.
            const commitAndAnnounce = (): void => {
                // ONE runBatch — single undo unit. Lighting doesn't bound rooms, so skip
                // the redetect sweep.
                try {
                    batchCoordinator.runBatch(() => {
                        for (const cmd of set.commands) {
                            const r = runtime.bus.executeCommand(cmd.command, cmd.payload) as unknown;
                            if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                                (r as Promise<unknown>).catch((e: unknown) =>
                                    console.warn('[lighting-layout] lighting.create failed:', e));
                            }
                        }
                    }, { levelIds: [level.id], totalElementCount: set.commands.length, skipRedetectRooms: true, skipPbrUpgrade: true });  // §POSTGEN-PERF: finish batch adds no walls + PBR-ready meshes → skip the wasted full-scene PBR render
                } catch (e) {
                    console.warn('[lighting-layout] runBatch threw:', e);
                    toast('Lighting auto-place failed — see console.', 'error');
                    return;
                }

                runtime.events.emit('lighting.layout-executed', {
                    placedCount: set.commands.length,
                    roomCount: allRooms.length,
                    levelId: level.id,
                });
                toast(
                    `Lit ${lit}/${allRooms.length} rooms — ${set.commands.length} fixtures placed.`,
                    'success',
                );
            };

            if (batchCoordinator.isBatching) {
                // A batch is already open (house post-gen chain). Defer so we open a
                // clean, non-nested batch after it settles. The `onNextSettle` callback
                // fires SYNCHRONOUSLY inside the settling batch's `onComplete` tail (which
                // is still unwinding its §G1/§G2 / view-suppression lift and re-reads its
                // own batch state); escape that tail onto a fresh macrotask before opening
                // our batch so we never re-enter `runBatch` mid-settle. P3: a macrotask
                // yield, no raw rAF (mirrors runHousePostGenChain's §POSTGEN-SETTLE).
                batchCoordinator.onNextSettle(() => { setTimeout(commitAndAnnounce, 0); });
            } else {
                commitAndAnnounce();
            }
        } catch (err) {
            console.warn('[LightingLayoutExecutor] execute failed (non-fatal):', err);
            runtime.events?.emit('pryzm:toast', { message: 'Lighting auto-place failed.', severity: 'error' });
        }
    }
}
