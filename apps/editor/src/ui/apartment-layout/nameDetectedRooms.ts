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

interface DetectedRoomLike {
    id: string;
    boundary?: { polygon?: Array<{ x: number; z: number }> };
}
interface RoomStoreLike {
    getByLevel?: (id: string) => DetectedRoomLike[];
    subscribe?: (fn: () => void) => (() => void);
}

function pointInPolygon(px: number, pz: number, poly: Array<{ x: number; z: number }>): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]!.x, zi = poly[i]!.z, xj = poly[j]!.x, zj = poly[j]!.z;
        if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) hit = !hit;
    }
    return hit;
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

            const renames: Array<{ roomId: string; name: string; occupancy?: string }> = [];
            for (const room of detected) {
                const poly = room.boundary?.polygon ?? [];
                if (poly.length < 3) continue;
                let matches = tgl.filter(t => pointInPolygon(t.cx, t.cz, poly));
                if (matches.length === 0) {
                    // §ROOM-NAME-NEAREST — on skewed builds the D-TGL centroid can
                    // land just outside the detected polygon → fall back to the
                    // nearest D-TGL room so every detected room still gets a name.
                    let cx = 0, cz = 0;
                    for (const p of poly) { cx += p.x; cz += p.z; }
                    cx /= poly.length; cz /= poly.length;
                    let best: (typeof tgl)[number] | null = null;
                    let bestD = Infinity;
                    for (const t of tgl) {
                        const d = (t.cx - cx) * (t.cx - cx) + (t.cz - cz) * (t.cz - cz);
                        if (d < bestD) { bestD = d; best = t; }
                    }
                    if (best) matches = [best];
                }
                if (matches.length === 0) continue;
                const compoundName = matches.map(m => m.name).filter(Boolean).join(' / ');
                if (!compoundName) continue;
                const dominantOccupancy = matches[0]!.occupancy;
                renames.push({ roomId: room.id, name: compoundName, ...(dominantOccupancy ? { occupancy: dominantOccupancy } : {}) });
            }
            if (renames.length === 0) return;

            // §A.21.D40 — room.rename is PURE METADATA (name + occupancy tag); it
            // adds NO new geometry, so the post-batch synchronous geometry-compile
            // pass (§FIX-POST-GEOMETRY-COMPILE-V2, which fires for batches ≤32
            // elements with skipPbrUpgrade=false) is wasted work here — and on a
            // large generated scene that single rpm.render() pass measured ~972 ms.
            // Mark the rename batch skipPbrUpgrade so it never triggers that pass.
            batchCoordinator.runBatch(() => {
                for (const r of renames) {
                    try { void runtime.bus.executeCommand('room.rename', r); }
                    catch (e) { console.warn(`${logTag} room.rename failed (skipped):`, e); }
                }
            }, { levelIds: [levelId], totalElementCount: renames.length, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log(`${logTag} named ${renames.length} room(s) on ${levelId}`);
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
