// Shared room-naming pass — names + occupancy-tags the rooms the editor
// detected on a level from the deterministic layout option that built them.
//
// Extracted from ApartmentLayoutExecutor._nameDetectedRooms (2026-06-06,
// A.21.D24) so the HOUSE executor can reuse it. Without this, house storeys
// got rooms with NO `occupancyType` + NO semantic name → the furnish engine
// (`furnishRoom('')`) returned [] for every room → "furnish does nothing".
//
// P6: every mutation flows through the command bus verb `room.rename` (which
// applies the name via RenameRoomCommand + the occupancy via
// SetRoomOccupancyCommand). No direct store writes.

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { ScoredLayoutOption } from '@pryzm/ai-host';
import { matchDetectedRooms } from './matchDetectedRooms.js';
import { logExecRoomDiagnostics } from '../house-layout/houseExecDiagnostics.js';
import { getStairRects } from '../house-layout/houseStairRects.js';
import { getShellWalls } from '../house-layout/houseShellWalls.js';
import { resolveStairRooms, type DetectedRoomLite } from '../house-layout/resolveStairRooms.js';

interface DetectedRoomLike {
    id: string;
    boundary?: { polygon?: Array<{ x: number; z: number }> };
    computed?: { area?: number; centroid?: { x: number; z: number } };
}
interface RoomStoreLike {
    getByLevel?: (id: string) => DetectedRoomLike[];
    subscribe?: (fn: () => void) => (() => void);
}

/**
 * Name + occupancy-tag the detected rooms on `levelId` from the layout `option`
 * that produced them. The editor's room redetect is DEFERRED (runs in a
 * scheduled onComplete after the build batch), so the rooms may not exist
 * synchronously — this subscribes to the room store and applies once rooms
 * settle, with a hard-timeout fallback. Never throws; best-effort.
 *
 * @param logTag  prefix for console lines ('[apartment-layout]' / '[house-layout]').
 */
export function nameDetectedRooms(
    runtime: PryzmRuntime,
    levelId: string,
    option: ScoredLayoutOption,
    logTag = '[apartment-layout]',
): void {
    try {
        const roomStore = storeRegistry.getStoreForType('room') as unknown as RoomStoreLike | undefined;
        if (!roomStore?.getByLevel) return;

        // D-TGL rooms with world centroids (mm→m, plan-y = world-z), largest first.
        const tgl = option.rooms
            .filter(r => r.centroid)
            .map(r => ({ name: r.name, occupancy: r.occupancy, area: r.area, cx: r.centroid!.x / 1000, cz: r.centroid!.y / 1000 }))
            .sort((a, b) => b.area - a.area);
        if (tgl.length === 0) return;

        let done = false;
        let unsub: () => void = () => { /* no-op until set */ };
        let settle: ReturnType<typeof setTimeout> | undefined;
        let hard: ReturnType<typeof setTimeout> | undefined;
        const renameStartMs = performance.now();

        const apply = (source: 'subscription' | 'hard-timeout' | 'already-present'): void => {
            if (done) return;
            const detected = roomStore.getByLevel!(levelId);
            if (detected.length === 0) return;                 // redetect not run yet — keep waiting
            done = true;
            unsub();
            if (settle) clearTimeout(settle);
            if (hard) clearTimeout(hard);
            const renameElapsedMs = Math.round(performance.now() - renameStartMs);
            console.log(
                `${logTag} §POLL-TELEMETRY room-name-completed ` +
                `level=${levelId} source=${source} elapsed_ms=${renameElapsedMs} detected_rooms=${detected.length}`,
            );
            try {
                runtime.events.emit('apartment.room-name-completed', {
                    levelId, source, elapsedMs: renameElapsedMs, detectedRooms: detected.length,
                });
            } catch { /* event bus failures must never break the executor */ }

            // §ROOM-NAME-BIJECTIVE (founder duplicate-Stair bug, 2026-06-10) — the
            // matching must be a one-to-one assignment: each D-TGL room names AT MOST
            // ONE detected room. The previous single-pass matcher had no "used"
            // tracking, so a single engine room could name MANY detected rooms — the
            // duplicate "Stair" the founder saw (the lone minted `stair` room was
            // assigned to its own detected cell by direct containment AND to a second
            // neighbouring cell by the §ROOM-NAME-NEAREST fallback, which scanned ALL
            // engine rooms with no exclusion). A detected cell that loses the contest
            // then had no engine partner left → it kept its empty name → the UI's
            // "Room 00-00x" fallback label. The pure `matchDetectedRooms` encodes the
            // two-pass bijective fix (direct containment → nearest-unused fallback) so
            // the contract is unit-testable without the runtime.
            // §STAIR-VOID-EXCLUDE (founder defect #7, 2026-06-10) — collapse the
            // detected rooms inside the stair void to EXACTLY ONE non-habitable
            // `stair` room BEFORE the engine→detected name matcher runs. The editor's
            // redetect traces the BUILT wall graph: the stair body spans a wall line,
            // so the footprint splits into TWO enclosed faces (the founder's 8.1 m² +
            // 25.3 m²). §ROOM-NAME-BIJECTIVE stops the duplicate NAME, but the second
            // cell survives as a ~25 m² habitable-looking fallback room. Here we (a)
            // KEEP the centre-nearest cell, name it "Stair" + occupancy `stair`, (b)
            // DELETE every other cell in the void, and (c) EXCLUDE both keep + dropped
            // ids from the matcher input so no engine room re-names a stair cell. The
            // stair keep-out rects come from `houseStairRects` (empty for the apartment
            // path ⇒ stairResolution is empty ⇒ byte-identical, ADR-0061). Governance:
            // ADR-0063 (one non-habitable stair void) · C53 · C11 (post-detection
            // reconciliation) — completes §STAIR-ROOM-TYPE at the DETECTION boundary.
            const stairRects = getStairRects(levelId);
            const detectedLite: DetectedRoomLite[] = detected.map(room => {
                const poly = room.boundary?.polygon ?? [];
                let cx = room.computed?.centroid?.x ?? 0;
                let cz = room.computed?.centroid?.z ?? 0;
                if (!room.computed?.centroid && poly.length > 0) {
                    cx = 0; cz = 0;
                    for (const p of poly) { cx += p.x; cz += p.z; }
                    cx /= poly.length; cz /= poly.length;
                }
                return { id: room.id, cx, cz, area: room.computed?.area ?? 0 };
            });
            const stairResolution = resolveStairRooms(detectedLite, stairRects);
            const stairExcluded = stairResolution.excludedRoomIds;

            // §DIAG-STAIR-VOID-EXCLUDE (founder defect #7 verification, 2026-06-10) —
            // per level: detected rooms that fell in each stair void + the action taken
            // (kept-as-Stair vs deleted). After this pass the §DIAG-EXEC-STAIR rollup
            // must read roomsOverStairVoid=1 with NO ⚠ HABITABLE-ON-STAIR. Logging only.
            if (stairRects.length > 0) {
                const counts = stairResolution.perRectCounts.join(',');
                const ok = stairResolution.keep.length === stairRects.length && stairResolution.drop.length === 0;
                console.log(
                    `${logTag} §DIAG-STAIR-VOID-EXCLUDE level=${levelId} stairRects=${stairRects.length} ` +
                    `roomsInVoidPerRect=[${counts}] kept=${stairResolution.keep.length} dropped=${stairResolution.drop.length} ` +
                    `${ok ? '✓' : `⚠ ${stairResolution.drop.length}-PHANTOM-ROOM(S)-MERGED`}`,
                );
            }

            // Engine→detected name matcher runs over the NON-stair detected rooms only
            // (the stair cells are typed below from the resolution, not from an engine
            // pairing — so an engine `stair` room never double-names a kept cell and a
            // habitable engine room never reaches a dropped cell).
            const detectedPolys = detected
                .filter(room => !stairExcluded.has(room.id))
                .map(room => ({
                    id: room.id,
                    polygon: room.boundary?.polygon ?? [],
                }));
            // The engine `stair` room(s) are EXCLUDED from the matcher when we have
            // resolved the stair void ourselves above — otherwise the matcher's Pass-2
            // nearest-unused fallback could name a NON-stair detected cell "Stair" (the
            // stair detected cell it belonged to is no longer in `detectedPolys`). With
            // no stair rects (apartment) `stairRects` is empty so we keep `tgl` whole
            // (byte-identical). `stair`-typed engine rooms are matched only through the
            // resolution's keeps above.
            const tglForMatch = stairRects.length > 0 ? tgl.filter(r => r.occupancy !== 'stair') : tgl;
            const { renames, unmatched: fallbackCount } = matchDetectedRooms(tglForMatch, detectedPolys);

            // Prepend the stair keeps (name "Stair" + occupancy `stair`) so the single
            // retained void cell is typed non-habitable. The drops are deleted below.
            for (const k of stairResolution.keep) {
                renames.push({ roomId: k.roomId, name: k.name, occupancy: k.occupancy });
            }

            // §DIAG-STAIR-NAME (founder verification, 2026-06-10) — exactly ONE detected
            // room must end up named "Stair" (vertical-circulation, non-habitable), and
            // every detected room should match an engine room (no "Room 00-00x"
            // fallback). Surface the stair count + the unmatched (→ fallback-named)
            // detected-room count so a regression to the duplicate-Stair / unnamed-room
            // defect is loud in the console. Logging only — no behaviour change.
            {
                const stairNamed = renames.filter(r => r.occupancy === 'stair').length;
                const stairOk = stairNamed <= 1;
                console.log(
                    `${logTag} §DIAG-STAIR-NAME level=${levelId} detected=${detected.length} ` +
                    `named=${renames.length} stairRooms=${stairNamed} unmatched=${fallbackCount} ` +
                    `${stairOk && fallbackCount === 0 ? '✓' : '⚠'}` +
                    `${stairNamed > 1 ? ' DUPLICATE-STAIR' : ''}` +
                    `${fallbackCount > 0 ? ` ${fallbackCount}-ROOM-FALLBACK` : ''}`,
                );
            }

            // §DIAG-EXEC-* (founder 2026-06-10) — the EXECUTION-BOUNDARY diagnostics:
            // compare what the engine DESIGNED (this `option`) against what the editor
            // DETECTED (the room store, just read above) for THIS level — room
            // count/area/door/window/stair divergence. Logging only; runs once per
            // generation per level (this `apply` fires once, guarded by `done`). Stair
            // keep-out AABBs (world XZ) are supplied by the HouseLayoutExecutor via
            // houseStairRects (empty for the apartment path ⇒ EXEC-STAIR is skipped).
            // §DIAG-EXEC-* false-positive fixes (founder v106): pass (a) the executor's
            // authoritative SHELL wall-id set so WINDOW-ON-PARTITION is decided by real
            // shell membership (not the mis-marking façade service), and (b) the resolver's
            // KEEP ids so HABITABLE-ON-STAIR treats the just-decided (not-yet-committed)
            // stair room as the stair instead of reading its uncommitted `unclassified`
            // occupancy. The apartment path records no shell walls + no stair keeps ⇒ both
            // are empty ⇒ byte-identical behaviour (ADR-0061).
            const stairKeepIds = new Set(stairResolution.keep.map(k => k.roomId));
            logExecRoomDiagnostics(
                levelId, option, logTag, getStairRects(levelId),
                getShellWalls(levelId), stairKeepIds,
            );

            const stairDrops = stairResolution.drop;
            if (renames.length === 0 && stairDrops.length === 0) return;

            // §A.21.D40 — room.rename is PURE METADATA (name + occupancy tag); it
            // adds NO new geometry, so the post-batch synchronous geometry-compile
            // pass (§FIX-POST-GEOMETRY-COMPILE-V2, which fires for batches ≤32
            // elements with skipPbrUpgrade=false) is wasted work here — and on a
            // large generated scene that single rpm.render() pass measured ~972 ms.
            // Mark the rename batch skipPbrUpgrade so it never triggers that pass.
            // §STAIR-VOID-EXCLUDE — the phantom stair cells (`stairDrops`) are DELETED
            // in the SAME batch so the footprint resolves to exactly one `stair` room.
            // `room.delete` removes a detected room record (no geometry change). Both
            // pass skipRedetectRooms:true so the delete is NOT undone by a re-detect.
            const totalOps = renames.length + stairDrops.length;
            batchCoordinator.runBatch(() => {
                for (const r of renames) {
                    try { void runtime.bus.executeCommand('room.rename', r); }
                    catch (e) { console.warn(`${logTag} room.rename failed (skipped):`, e); }
                }
                for (const roomId of stairDrops) {
                    try { void runtime.bus.executeCommand('room.delete', { roomId }); }
                    catch (e) { console.warn(`${logTag} room.delete (stair-void) failed (skipped):`, e); }
                }
            }, { levelIds: [levelId], totalElementCount: totalOps, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log(
                `${logTag} named ${renames.length} room(s) on ${levelId}` +
                `${stairDrops.length > 0 ? ` + dropped ${stairDrops.length} phantom stair-void room(s)` : ''}`,
            );
        };

        // §A.21.D40 FAST-PATH — the editor's room redetect is DEFERRED, but the
        // HOUSE / apartment callers only invoke naming AFTER the finalizing batch
        // (skipRedetectRooms:false) has already run the redetect + settled. In that
        // common case the rooms are ALREADY in the store synchronously, so the
        // subscription never fires a fresh change and we used to burn the full
        // 2500 ms hard-timeout (then the orchestrator's 3500 ms wait) per storey —
        // pure dead wait, the §POLL-TELEMETRY `source=hard-timeout` lines. Check
        // synchronously first: if rooms are present, resolve NOW. Only fall back to
        // the subscription + hard-timeout when the redetect genuinely hasn't run.
        if ((roomStore.getByLevel(levelId)?.length ?? 0) > 0) {
            apply('already-present');
            return;
        }

        if (roomStore.subscribe) {
            unsub = roomStore.subscribe(() => {
                if (settle) clearTimeout(settle);
                settle = setTimeout(() => apply('subscription'), 80);
            });
        }
        hard = setTimeout(() => apply('hard-timeout'), 2500);   // fallback if no room events fire
    } catch (e) {
        console.warn(`${logTag} room naming failed (non-fatal):`, e);
    }
}
