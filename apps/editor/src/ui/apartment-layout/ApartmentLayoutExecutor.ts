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
import { CreateWallOpeningCommand, CreateRoomBoundingLineCommand } from '@pryzm/command-registry';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { ScoredLayoutOption, IdPrefix, LayoutExecuteOptions, LayoutCommandSet } from '@pryzm/ai-host';
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

            // §INTERIOR-HEIGHT-MATCH (2026-05-29 audit follow-up): the
            // partition height is now plumbed through the LayoutOption.
            // gatherLayoutPayload reads the max wall height on the active
            // level + writes it to constraints.floorToCeiling (mm), and
            // runDeterministicLayout threads it onto option.floorToCeilingMm.
            // The executor just READS it here — no wall-store reach-around.
            // Fallback chain: option.floorToCeilingMm → level.height →
            // executePlan default (2.7 m).
            const wallHeightM = typeof option.floorToCeilingMm === 'number' && option.floorToCeilingMm > 0
                ? option.floorToCeilingMm / 1000
                : (level.height ?? undefined);
            console.log(
                '[apartment-layout] §INTERIOR-HEIGHT-MATCH ' +
                `option_h=${option.floorToCeilingMm ? (option.floorToCeilingMm / 1000).toFixed(2) : 'n/a'} ` +
                `level_h=${level.height?.toFixed(2) ?? 'n/a'} ` +
                `→ partition_h=${wallHeightM?.toFixed(2) ?? '(default)'}`,
            );

            const opts: LayoutExecuteOptions = {
                levelId: level.id,
                // No wallTypeId → walls use the editor's DEFAULT wall type. Passing an
                // id the wall system-type store doesn't know (e.g. 'partition') makes
                // wall.batch.create reject the whole batch ("unknown systemTypeId").
                baseElevationM: level.elevation ?? 0,
                ...(wallHeightM ? { wallHeightM } : {}),
                // The shell already exists — build INTERIOR partitions only; the
                // perimeter walls (flagged isExternal, shown in the preview) are
                // skipped so we never duplicate the shell (would corrupt detection).
                skipExteriorWalls: true,
            };
            const set = buildLayoutCommands(option, opts, (p: IdPrefix) => createId(p));

            // §PREVIEW-VS-BUILD diagnostics (2026-05-27, live-fix): every wall the
            // preview drew is in `option.walls`; the build drops 3 categories:
            //   (1) exterior walls — by design (the shell already exists)
            //   (2) walls shorter than MIN_WALL_LENGTH_M (0.05 m, surfaced as warnings)
            //   (3) walls that the wall.batch.create handler rejects (counted by
            //       wallFail below; usually canExecute failures)
            // Without surfacing the count breakdown the user sees "preview doesn't
            // match execution" with no signal as to which filter ate which wall.
            const previewCount  = option.walls.length;
            const externalCount = option.walls.filter(w => w.isExternal).length;
            const submitted     = set.wallIds.length;
            const drops_from_warnings = set.warnings.length;
            console.log(
                '[apartment-layout] §PREVIEW-VS-BUILD ' +
                `preview=${previewCount} external_skip=${externalCount} ` +
                `length_drop=${drops_from_warnings} submitted=${submitted}`,
            );
            if (set.warnings.length > 0) {
                for (const w of set.warnings) console.warn('[apartment-layout] plan warning:', w);
                runtime.events?.emit('pryzm:toast', {
                    message: `${set.warnings.length} wall(s) dropped (degenerate). See console for details.`,
                    severity: 'warn',
                });
            }

            // The bus is ASYNC: a command's promise resolves only when the batch
            // DRAINS, and wall.createOpening's canExecute READS the wall store — which
            // isn't populated until that drain. So walls + openings cannot share one
            // batch (openings run first → "wall not found" → no doors, the confirmed
            // bug), and we must NOT await (awaiting deadlocks the drain). Instead:
            // create the WALLS in one batch, then dispatch openings + doors ONCE the
            // walls have actually landed in the store (subscribe + settle).
            let wallFail = 0;
            try {
                batchCoordinator.runBatch(() => {
                    const r = runtime.bus.executeCommand(set.wallBatch.command, set.wallBatch.payload) as unknown;
                    if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                        (r as Promise<unknown>).catch((e: unknown) => {
                            wallFail++;
                            console.warn('[apartment-layout] wall.batch.create failed (skipped):', e);
                            runtime.events?.emit('pryzm:toast', {
                                message: 'wall.batch.create rejected — some walls did not build. See console.',
                                severity: 'error',
                            });
                        });
                    }
                }, { levelIds: [level.id], totalElementCount: set.wallIds.length, skipRedetectRooms: false });
            } catch (e) {
                wallFail++;
                console.warn('[apartment-layout] wall.batch.create threw (skipped):', e);
                runtime.events?.emit('pryzm:toast', {
                    message: 'wall.batch.create threw — layout build aborted. See console.',
                    severity: 'error',
                });
            }

            runtime.ai.layoutOptions.clear();                       // option consumed
            this._finishLayout(runtime, level.id, set, option);
        } catch (err) {
            console.warn('[ApartmentLayoutExecutor] execute failed (non-fatal):', err);
            runtime.events?.emit('pryzm:toast', { message: 'Failed to build the layout.', severity: 'error' });
        }
    }

    /**
     * Once the interior walls are committed to the wall store, create the doors —
     * D-TGL's reconciliation openings, realised via the LEGACY `CreateWallOpeningCommand`
     * (the same synchronous path manual doors use: it reads `context.stores.wallStore`,
     * creates the opening void + the door store record + spatial registration). The async
     * PLUGIN `wall.createOpening` failed "wall not found" because it ran before the walls
     * landed.
     *
     * GATE: we poll the SAME wall store the command reads (`storeRegistry.getStoreForType
     * ('wall')` === `wallTool.getWallStore()` === `context.stores.wallStore`) until EVERY
     * wall a door is hosted on actually exists by id. This is the precise readiness signal
     * — the earlier "≥1 room detected" proxy was wrong: a pre-existing shell already yields
     * one room, so the gate could fire BEFORE the new interior partition walls landed,
     * and every door then failed "wall not found". Best-effort + telemetry; one coalesced
     * undo unit. Then name the rooms.
     */
    private _finishLayout(runtime: PryzmRuntime, levelId: string, set: LayoutCommandSet, option: ScoredLayoutOption): void {
        // Build the sub-zone payload once — emitted on apartment.layout-executed
        // so FurnishLayoutExecutor can constrain each open-plan sub-program
        // (kitchen, dining, living) to its own polygon instead of furnishing
        // the whole merged detected room. mm → m for downstream consumers.
        const subZones = option.rooms
            .filter(r => r.polygon && r.polygon.length >= 3 && r.centroid && r.occupancy)
            .map(r => ({
                name: r.name,
                occupancy: r.occupancy as string,
                area: r.area,
                centroid: { x: (r.centroid!.x ?? 0) / 1000, z: (r.centroid!.y ?? 0) / 1000 },
                polygon: r.polygon!.map(p => ({ x: p.x / 1000, z: p.y / 1000 })),
            }));

        const emitDone = (doorCount: number): void => {
            // §PREVIEW-VS-BUILD — surface the drops on the completion event too so
            // downstream automation (tests, telemetry, AI follow-ups) can observe
            // partial builds without scraping the console.
            runtime.events.emit('apartment.layout-executed', {
                createdWallCount: set.wallIds.length,
                createdDoorCount: doorCount,
                previewWallCount: option.walls.length,
                droppedWallCount: set.warnings.length,
                warnings: [...set.warnings],
                levelId,
                subZones,
            });
            runtime.events?.emit('pryzm:toast', { message: `Built layout — ${set.wallIds.length} walls, ${doorCount} doors.`, severity: 'success' });
        };

        // Unique host-wall ids the doors need — the build is done when these exist.
        const neededWallIds = [...new Set(set.openingCommands.map(op => (op.payload as { wallId: string }).wallId))];
        if (neededWallIds.length === 0) { this._nameDetectedRooms(runtime, levelId, option); emitDone(0); return; }

        const wallStore = storeRegistry.getStoreForType('wall') as unknown as {
            getById?: (id: string) => unknown;
        } | undefined;
        const wallsReady = (): boolean =>
            !!wallStore?.getById && neededWallIds.every(id => wallStore.getById!(id) != null);

        let done = false;
        let poll: ReturnType<typeof setTimeout> | undefined;
        // §POLL-TELEMETRY (2026-05-29 audit follow-up): observe the wall
        // readiness wait. The earlier code logged only a single "doors built"
        // line at the end; the polling duration + iteration count + whether
        // the deadline was hit were invisible. Now: capture start + iterations,
        // emit `apartment.wall-poll-completed` with metrics + a single
        // structured log so a CI scrape (or human eye) can spot regressions.
        const pollStartMs = performance.now();
        let pollIterations = 0;

        const go = (force: boolean): void => {
            if (done) return;
            if (!force && !wallsReady()) return;                  // interior walls not committed yet — wait
            done = true; if (poll) clearTimeout(poll);

            const landed = wallStore?.getById ? neededWallIds.filter(id => wallStore.getById!(id) != null).length : 0;
            const pollElapsedMs = Math.round(performance.now() - pollStartMs);
            const wallReadyAtEnd = landed === neededWallIds.length;
            console.log(
                '[apartment-layout] §POLL-TELEMETRY wall-poll-completed ' +
                `elapsed_ms=${pollElapsedMs} iters=${pollIterations} ` +
                `walls_ready=${landed}/${neededWallIds.length} ` +
                `forced=${force && !wallReadyAtEnd}`,
            );
            try {
                runtime.events.emit('apartment.wall-poll-completed', {
                    levelId,
                    elapsedMs: pollElapsedMs,
                    iterations: pollIterations,
                    wallsReady: landed,
                    wallsNeeded: neededWallIds.length,
                    forced: force && !wallReadyAtEnd,
                });
            } catch { /* event bus failures must never break the executor */ }
            // Doors + boundaries via the legacy synchronous commands (read the
            // committed legacy stores). Boundaries are the virtual splitters between
            // open-plan rooms (hall↔living, kitchen↔living, …) — without them the
            // RoomDetectionEngine merges the whole open-plan zone into one big room.
            let doorsMade = 0; let firstErr = '';
            let boundariesMade = 0; let firstBoundaryErr = '';
            const cm = (window as unknown as { commandManager?: { execute(c: unknown): void } }).commandManager;
            if (cm && (set.openingCommands.length > 0 || set.boundaryCommands.length > 0)) {
                try {
                    batchCoordinator.runBatch(() => {
                        for (const op of set.openingCommands) {
                            const p = op.payload as { wallId: string; opening: unknown };
                            try { cm.execute(new CreateWallOpeningCommand({ wallId: p.wallId, openingData: p.opening })); doorsMade++; }
                            catch (e) { firstErr ||= String(e); console.warn('[apartment-layout] door (createOpening) failed (skipped):', e); }
                        }
                        for (const bc of set.boundaryCommands) {
                            const p = bc.payload as { id: string; levelId: string; start: { x: number; z: number }; end: { x: number; z: number } };
                            try { cm.execute(new CreateRoomBoundingLineCommand({ id: p.id, levelId: p.levelId, start: p.start, end: p.end })); boundariesMade++; }
                            catch (e) { firstBoundaryErr ||= String(e); console.warn('[apartment-layout] boundary failed (skipped):', e); }
                        }
                    }, {
                        levelIds: [levelId],
                        totalElementCount: set.openingCommands.length + set.boundaryCommands.length,
                        skipRedetectRooms: false,
                    });
                } catch (e) { console.warn('[apartment-layout] doors+boundaries batch failed (non-fatal):', e); }
            } else if (!cm) {
                console.warn('[apartment-layout] commandManager unavailable — doors+boundaries skipped');
            }
            console.log(`[apartment-layout] doors built — ${doorsMade}/${set.openingCommands.length} (host walls present ${landed}/${neededWallIds.length})${force && landed < neededWallIds.length ? ' — FORCED before all walls landed' : ''}`, firstErr || '');
            console.log(`[apartment-layout] boundaries built — ${boundariesMade}/${set.boundaryCommands.length}`, firstBoundaryErr || '');

            // Post-build room-detection diagnostic. After the door+boundary batch
            // settles, the RoomDetectionEngine should produce ~one detected room per
            // D-TGL space. A large mismatch (e.g. 5 detected vs 9 expected) is the
            // open-plan-merge defect — boundary lines didn't split the zone.
            setTimeout(() => {
                const rs = storeRegistry.getStoreForType('room') as unknown as { getByLevel?: (id: string) => Array<unknown> } | undefined;
                const detected = rs?.getByLevel?.(levelId)?.length ?? -1;
                const expected = option.rooms.length;
                console.log(`[apartment-layout] room-detection diagnostic — detected=${detected} / D-TGL expected=${expected}${detected >= 0 && detected < expected ? ' ⚠ open-plan rooms may be merging (boundary lines not splitting)' : ''}`);
            }, 500);

            emitDone(doorsMade);
            this._nameDetectedRooms(runtime, levelId, option);
        };

        // Poll the wall store (~150 ms cadence). Fire as soon as the walls are present;
        // after the budget (~6 s) force a best-effort attempt so we never silently hang.
        const tick = (n: number): void => {
            if (done) return;
            pollIterations++;
            if (wallsReady() || n <= 0) { go(true); return; }
            poll = setTimeout(() => tick(n - 1), 150);
        };
        tick(40);
    }

    /**
     * Apply D-TGL's semantic room names to the rooms the engine just detected.
     * Each detected room is matched to ALL D-TGL rooms whose footprint centroid
     * falls inside it. When several D-TGL rooms merge into one detected room (the
     * open-plan zone: hall + living + kitchen + dining), we build a COMPOUND
     * name like "Living Room / Kitchen / Dining" so each program room is visible
     * in the editor — the prior largest-only rule made the kitchen "disappear"
     * because living always won on area weight. Occupancy = the dominant
     * (largest-area) sub-room's occupancy so the editor still colours the zone.
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
            //
            // §POLL-TELEMETRY (2026-05-29): tag the rename pass with its TRIGGER
            // SOURCE — 'subscription' when the room-store events arrived in time;
            // 'hard-timeout' when the 2.5 s fallback fired first. Without this, a
            // silent subscription regression looks identical to the happy path. The
            // source is logged + emitted on `apartment.room-name-completed`.
            let done = false;
            let unsub: () => void = () => { /* no-op until set */ };
            let settle: ReturnType<typeof setTimeout> | undefined;
            let hard: ReturnType<typeof setTimeout> | undefined;
            const renameStartMs = performance.now();

            const apply = (source: 'subscription' | 'hard-timeout'): void => {
                if (done) return;
                const detected = roomStore.getByLevel!(levelId);
                if (detected.length === 0) return;                 // redetect not run yet — keep waiting
                done = true;
                unsub();
                if (settle) clearTimeout(settle);
                if (hard) clearTimeout(hard);
                const renameElapsedMs = Math.round(performance.now() - renameStartMs);
                console.log(
                    '[apartment-layout] §POLL-TELEMETRY room-name-completed ' +
                    `source=${source} elapsed_ms=${renameElapsedMs} detected_rooms=${detected.length}`,
                );
                try {
                    runtime.events.emit('apartment.room-name-completed', {
                        levelId, source, elapsedMs: renameElapsedMs, detectedRooms: detected.length,
                    });
                } catch { /* event bus failures must never break the executor */ }

                const renames: Array<{ roomId: string; name: string; occupancy?: string }> = [];
                for (const room of detected) {
                    const poly = room.boundary?.polygon ?? [];
                    if (poly.length < 3) continue;
                    // ALL D-TGL rooms whose centroid is inside this detected room.
                    // `tgl` is sorted by area desc so matches[0] is the dominant one.
                    const matches = tgl.filter(t => inside(t.cx, t.cz, poly));
                    if (matches.length === 0) continue;
                    const compoundName = matches.map(m => m.name).filter(Boolean).join(' / ');
                    if (!compoundName) continue;
                    const dominantOccupancy = matches[0]!.occupancy;
                    renames.push({ roomId: room.id, name: compoundName, ...(dominantOccupancy ? { occupancy: dominantOccupancy } : {}) });
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
                unsub = roomStore.subscribe(() => {
                    if (settle) clearTimeout(settle);
                    settle = setTimeout(() => apply('subscription'), 80);
                });
            }
            hard = setTimeout(() => apply('hard-timeout'), 2500);   // fallback if no room events fire
        } catch (e) {
            console.warn('[apartment-layout] room naming failed (non-fatal):', e);
        }
    }
}
