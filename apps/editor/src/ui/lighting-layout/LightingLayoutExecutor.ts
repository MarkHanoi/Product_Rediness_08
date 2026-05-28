// Lighting Layout — A6-style executor for the D-LE engine.
//
// Mirrors FurnishLayoutExecutor: subscribes to 'lighting.layout-execute',
// reads every furnishable room on the active level from the wall/room/door
// stores, assembles `LightRoomInput` per room, runs `lightRoom`, and
// dispatches the resulting `lighting.create` commands INSIDE ONE
// `batchCoordinator.runBatch` — one undo unit, skipRedetectRooms because
// lighting fixtures aren't room-bounding.
//
// PURE wiring: the engine is dynamic-imported on first invoke (lazy chunk).

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
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

            const { lightRoom, buildLightingCommands } = await import('@pryzm/ai-host');

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

            // ONE runBatch — single undo unit. Lighting doesn't bound rooms,
            // so skip the redetect sweep.
            try {
                batchCoordinator.runBatch(() => {
                    for (const cmd of set.commands) {
                        const r = runtime.bus.executeCommand(cmd.command, cmd.payload) as unknown;
                        if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                            (r as Promise<unknown>).catch((e: unknown) =>
                                console.warn('[lighting-layout] lighting.create failed:', e));
                        }
                    }
                }, { levelIds: [level.id], totalElementCount: set.commands.length, skipRedetectRooms: true });
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
        } catch (err) {
            console.warn('[LightingLayoutExecutor] execute failed (non-fatal):', err);
            runtime.events?.emit('pryzm:toast', { message: 'Lighting auto-place failed.', severity: 'error' });
        }
    }
}
