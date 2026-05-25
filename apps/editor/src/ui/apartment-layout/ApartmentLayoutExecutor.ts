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

import { batchCoordinator } from '@pryzm/core-app-model';
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
            };
            const set = buildLayoutCommands(option, opts, (p: IdPrefix) => createId(p));

            // Best-effort dispatch: a bus verb may reject SYNC (throw) or ASYNC
            // (returns a rejecting promise → "Uncaught (in promise)"). Catch both +
            // per-command, so a failed door never aborts the walls and never spams
            // uncaught rejections. Walls are the structural layout; openings/doors
            // are best-effort.
            const dispatch = (cmd: string, payload: unknown, label: string): void => {
                try {
                    const r = runtime.bus.executeCommand(cmd, payload) as unknown;
                    if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                        (r as Promise<unknown>).catch((e: unknown) =>
                            console.warn(`[apartment-layout] ${label} failed (skipped):`, e));
                    }
                } catch (e) {
                    console.warn(`[apartment-layout] ${label} threw (skipped):`, e);
                }
            };

            // One coalesced undo unit; rooms redetect after (walls define boundaries).
            batchCoordinator.runBatch(() => {
                dispatch(set.wallBatch.command, set.wallBatch.payload, 'wall.batch.create');
                for (const op of set.openingCommands) dispatch(op.command, op.payload, 'wall.createOpening');
                if (set.doorBatch) dispatch(set.doorBatch.command, set.doorBatch.payload, 'door.batch.create');
            }, {
                levelIds: [level.id],
                totalElementCount: set.totalElementCount,
                skipRedetectRooms: false,
            });

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
}
