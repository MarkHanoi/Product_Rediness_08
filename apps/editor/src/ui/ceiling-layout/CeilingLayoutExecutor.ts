// Ceiling Layout — A6-style executor for the D-CE engine.
//
// Mirrors FurnishLayoutExecutor / LightingLayoutExecutor: subscribes to
// 'ceiling.layout-execute', reads every ceilable room on the active level
// from the room store, assembles `CeilingRoomInput` per room, runs
// `ceilingForRoom`, and dispatches the resulting `ceiling.batch.create`
// command INSIDE ONE `batchCoordinator.runBatch` — one undo unit,
// skipRedetectRooms because ceiling slabs aren't room-bounding.
//
// PURE wiring: the engine is dynamic-imported on first invoke (lazy chunk).

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { CeilingRoomInput, PlacedCeiling } from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';

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

            const { ceilingForRoom, buildCeilingCommands } = await import('@pryzm/ai-host');

            const allPlaced: PlacedCeiling[] = [];
            let ceiled = 0, skipped = 0;
            for (const r of allRooms) {
                const poly = (r.boundary?.polygon ?? []) as readonly Pt[];
                if (poly.length < 3) { skipped++; continue; }
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
                `rooms_skipped=${skipped} ceilings_placed=${allPlaced.length}`,
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
}
