// Apartment Layout — A6 execute handler (SPEC §12, A6-wire).
//
// Subscribes to 'apartment.layout-execute' {optionIndex} → reads the chosen
// option from the AIStore → builds the dispatchable command set (pre-minted ids,
// no read-back; A6-core) → dispatches wall.batch.create + per-door
// wall.createOpening + door.batch.create through runtime.bus INSIDE
// batchCoordinator.runBatch → ONE undo unit + automatic room redetect
// (skipRedetectRooms:false) → emits 'apartment.layout-executed' + clears the store.
//
// P6: all mutation flows through the command bus. ai-host stays lazy (K3-A):
// the pure buildLayoutCommands is DYNAMIC-imported (the chunk is already loaded by
// the generate step); only batchCoordinator (core-app-model) + createId (schemas,
// L0) are static — both already in the editor graph.

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { ScoredLayoutOption, IdPrefix, LayoutExecuteOptions } from '@pryzm/ai-host';
import { resolveActiveLevel } from './activeLevel.js';

export class ApartmentLayoutExecutor {
    private _dispose: (() => void) | null = null;

    /** Subscribe to apartment.layout-execute. Idempotent. */
    attach(runtime: PryzmRuntime): void {
        if (this._dispose) return;
        const sub = runtime.events.on('apartment.layout-execute', (payload: { optionIndex: number }) => {
            void this._execute(runtime, payload.optionIndex);
        });
        this._dispose = typeof sub === 'function' ? sub : () => { /* non-disposer */ };
    }

    detach(): void { this._dispose?.(); this._dispose = null; }

    private async _execute(runtime: PryzmRuntime, optionIndex: number): Promise<void> {
        try {
            console.log('[apartment-layout] executor: building option', optionIndex);
            const option = runtime.ai.layoutOptions.optionAt(optionIndex) as ScoredLayoutOption | null;
            if (!option) {
                console.warn('[apartment-layout] executor: no option at index', optionIndex);
                return;
            }

            // Robust active-level resolution (project context first) — the same
            // resolver the trigger uses; bimManager.getActiveLevel() returns
            // undefined in the white-UI runtime.
            const level = resolveActiveLevel();
            if (!level?.id) {
                runtime.events?.emit('pryzm:toast', { message: 'No active level — cannot build the layout.', severity: 'error' });
                return;
            }
            console.log('[apartment-layout] executor: level', level.id, 'walls', option.walls.length, 'doors', option.doors.length);

            // Pure command-set (dynamic import keeps ai-host off first-paint).
            const { buildLayoutCommands } = await import('@pryzm/ai-host');
            const opts: LayoutExecuteOptions = {
                levelId: level.id,
                // No wallTypeId → walls use the editor's DEFAULT wall type. Passing an
                // id the wall system-type store doesn't know (e.g. 'partition') makes
                // wall.batch.create reject the whole batch ("unknown systemTypeId").
                baseElevationM: level.elevation ?? 0,
                ...(level.height ? { wallHeightM: level.height } : {}),
                // The shell already exists — build INTERIOR partitions only; the
                // perimeter walls (flagged isExternal, shown in the preview) are
                // skipped so we never duplicate the shell (would corrupt detection).
                skipExteriorWalls: true,
            };
            const set = buildLayoutCommands(option, opts, (p: IdPrefix) => createId(p));

            // Best-effort dispatch: a bus verb may reject SYNC (throw) or ASYNC
            // (returns a rejecting promise → "Uncaught (in promise)"). Catch both +
            // per-command, so a failed door never aborts the walls and never spams
            // uncaught rejections. Walls are the structural layout; openings/doors
            // are best-effort.
            // Telemetry: tally outcomes so a build that "loses" doors is diagnosable
            // (failure reason distinguishes ordering ["wall not found"] vs fit
            // ["occupancy"/"does not fit"] vs render).
            const fail: Record<string, number> = { wall: 0, opening: 0, door: 0 };
            const firstErr: Record<string, string> = {};
            const runAwait = async (cmd: string, payload: unknown, label: string, kind: 'wall' | 'opening' | 'door'): Promise<void> => {
                try { await runtime.bus.executeCommand(cmd, payload); }
                catch (e) { fail[kind]++; firstErr[kind] ??= String(e); console.warn(`[apartment-layout] ${label} failed (skipped):`, e); }
            };

            // ORDERING (critical): runtime.bus is ASYNC, so wall.createOpening's
            // canExecute (which reads the wall store) would run BEFORE a fire-and-forget
            // wall.batch.create commits its walls → "wall not found" → every opening
            // fails → no doors (manual doors work because they use the synchronous
            // commandManager). So we AWAIT the walls first; then the openings + doors
            // (each awaited in sequence, preserving the C15 opening→door order).
            await runAwait(set.wallBatch.command, set.wallBatch.payload, 'wall.batch.create', 'wall');
            for (const op of set.openingCommands) await runAwait(op.command, op.payload, 'wall.createOpening', 'opening');
            if (set.doorBatch) await runAwait(set.doorBatch.command, set.doorBatch.payload, 'door.batch.create', 'door');

            console.log(
                `[apartment-layout] build telemetry — walls:${set.wallIds.length}(fail ${fail.wall}) ` +
                `openings:${set.openingCommands.length}(fail ${fail.opening}) doors:${set.doorIds.length}(fail ${fail.door})`,
                fail.opening || fail.door || fail.wall ? firstErr : '',
            );

            // Name the freshly-detected rooms with D-TGL's semantic names (matched
            // by centroid). Runs after the batch — the rooms only exist once the
            // batch's room-redetect has run.
            this._nameDetectedRooms(runtime, level.id, option);

            runtime.ai.layoutOptions.clear();
            runtime.events.emit('apartment.layout-executed', {
                createdWallCount: set.wallIds.length,
                createdDoorCount: set.doorIds.length,
            });
            runtime.events?.emit('pryzm:toast', {
                message: `Built layout — ${set.wallIds.length} walls, ${set.doorIds.length} doors.`,
                severity: 'success',
            });
        } catch (err) {
            console.warn('[ApartmentLayoutExecutor] execute failed (non-fatal):', err);
            runtime.events?.emit('pryzm:toast', { message: 'Failed to build the layout.', severity: 'error' });
        }
    }

    /**
     * Apply D-TGL's semantic room names to the rooms the engine just detected.
     * Each detected room is matched to the LARGEST D-TGL room whose footprint
     * centroid falls inside it — so an open-plan zone (one detected room spanning
     * several D-TGL spaces) takes the dominant space's name (e.g. "Living Room").
     * Best-effort + its own undo unit (cosmetic; no geometry change).
     */
    private _nameDetectedRooms(runtime: PryzmRuntime, levelId: string, option: ScoredLayoutOption): void {
        try {
            const roomStore = storeRegistry.getStoreForType('room') as unknown as {
                getByLevel?: (id: string) => Array<{ id: string; boundary?: { polygon?: Array<{ x: number; z: number }> } }>;
                subscribe?: (fn: () => void) => (() => void);
            } | undefined;
            if (!roomStore?.getByLevel) return;

            // D-TGL rooms with world centroids (mm→m, plan-y = world-z), largest first.
            const tgl = option.rooms
                .filter(r => r.centroid)
                .map(r => ({ name: r.name, occupancy: r.occupancy, area: r.area, cx: r.centroid!.x / 1000, cz: r.centroid!.y / 1000 }))
                .sort((a, b) => b.area - a.area);
            if (tgl.length === 0) return;

            const inside = (px: number, pz: number, poly: Array<{ x: number; z: number }>): boolean => {
                let hit = false;
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    const xi = poly[i]!.x, zi = poly[i]!.z, xj = poly[j]!.x, zj = poly[j]!.z;
                    if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) hit = !hit;
                }
                return hit;
            };

            // The build's room-redetect is DEFERRED (runBatch drains via endBatchYielded;
            // REDETECT_ROOMS fires in a scheduled onComplete). So the rooms DON'T exist
            // synchronously here — apply names when the room store settles after the
            // redetect (debounced so all rooms land first), with a hard-timeout fallback.
            let done = false;
            let unsub: () => void = () => { /* no-op until set */ };
            let settle: ReturnType<typeof setTimeout> | undefined;
            let hard: ReturnType<typeof setTimeout> | undefined;

            const apply = (): void => {
                if (done) return;
                const detected = roomStore.getByLevel!(levelId);
                if (detected.length === 0) return;                 // redetect not run yet — keep waiting
                done = true;
                unsub();
                if (settle) clearTimeout(settle);
                if (hard) clearTimeout(hard);

                const renames: Array<{ roomId: string; name: string; occupancy?: string }> = [];
                for (const room of detected) {
                    const poly = room.boundary?.polygon ?? [];
                    if (poly.length < 3) continue;
                    const match = tgl.find(t => inside(t.cx, t.cz, poly));   // largest contained D-TGL room
                    if (match?.name) renames.push({ roomId: room.id, name: match.name, ...(match.occupancy ? { occupancy: match.occupancy } : {}) });
                }
                if (renames.length === 0) return;

                // Coalesce the rename reprojection into one (no redetect needed — names
                // don't change boundaries).
                batchCoordinator.runBatch(() => {
                    for (const r of renames) {
                        try { void runtime.bus.executeCommand('room.rename', r); }
                        catch (e) { console.warn('[apartment-layout] room.rename failed (skipped):', e); }
                    }
                }, { levelIds: [levelId], totalElementCount: renames.length, skipRedetectRooms: true });
                console.log('[apartment-layout] named', renames.length, 'room(s)');
            };

            if (roomStore.subscribe) {
                unsub = roomStore.subscribe(() => { if (settle) clearTimeout(settle); settle = setTimeout(apply, 80); });
            }
            hard = setTimeout(apply, 2500);   // fallback if no room events fire
        } catch (e) {
            console.warn('[apartment-layout] room naming failed (non-fatal):', e);
        }
    }
}
