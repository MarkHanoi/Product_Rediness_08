// §DOC-ROOM-INTERIOR-ELEVATIONS — editor trigger for "Interior elevations per room"
// (2026-06-26).
//
// Realises the PURE room-interior-elevation plan (`buildScopedRoomInteriorElevations`,
// see ./roomInteriorElevations) over the LIVE model: gathers the detected rooms +
// levels from the stores, resolves the chosen scope (All / This level / one room),
// and creates one 'elevation' ViewDefinition per room wall via the command bus (P6,
// the SAME `view.createDefinition` verb the exterior "Building elevations" + the Views
// rail use). All dispatches run inside ONE `batchCoordinator.runBatch` so undo removes
// the whole generated set in a single step (C24.1 §1.2). Idempotent on the stable view
// id (re-running skips views that already exist). Best-effort + defensive: never throws
// to the caller; a missing store yields a graceful toast.
//
// Governing contract: C24.1 §1.2 (executor is the only mutation path; one run = one
// undo), §1.3 (per-room coverage; degenerate rooms are SKIPPED + logged, never silently
// omitted), §1.5 (rule-based centroid-anchored interior elevation marks).

import { storeRegistry, viewDefinitionStore, batchCoordinator } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    buildScopedRoomInteriorElevations,
    type ElevationRoomInput,
    type RoomElevationScope,
} from './roomInteriorElevations.js';

interface LevelLike { id: string; name?: string; elevation?: number }
interface RoomLike { id: string; name?: string; levelId?: string; boundary?: { polygon?: Array<{ x: number; z: number }> } }

type Toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn') => void;

/** Sorted (ground-first) levels from the live model — for the modal's "This level" picker. */
export function gatherDocLevels(): Array<{ id: string; name: string }> {
    const bim = (window as unknown as { bimManager?: { getLevels?: () => LevelLike[] } }).bimManager;
    return (bim?.getLevels?.() ?? [])
        .slice()
        .sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))
        .map(l => ({ id: l.id, name: l.name ?? l.id }));
}

/** Detected rooms (≥ 3-vertex boundary) from the room store — for scope resolution + the picker. */
export function gatherDocRooms(): ElevationRoomInput[] {
    const levels = gatherDocLevels();
    const fallbackLevelId = levels[0]?.id ?? '';
    const roomStore = storeRegistry.getStoreForType('room') as unknown as { getAll?(): RoomLike[] } | undefined;
    return (roomStore?.getAll?.() ?? [])
        .filter(r => (r.boundary?.polygon?.length ?? 0) >= 3)
        .map(r => ({
            id: r.id,
            name: r.name ?? 'Room',
            levelId: r.levelId ?? fallbackLevelId,
            polygon: r.boundary!.polygon!.map(p => ({ x: p.x, z: p.z })),
        }));
}

/** The active level id (for the modal's default "This level" target). */
export function getActiveLevelId(): string | null {
    const pc = (window as unknown as { projectContext?: { activeLevelId?: string | null } }).projectContext;
    return pc?.activeLevelId ?? gatherDocLevels()[0]?.id ?? null;
}

/**
 * §DOC-ROOM-INTERIOR-ELEVATIONS — generate the interior elevation views for the chosen
 * scope (All rooms / rooms on a level / one room). Resolves the pure plan, then creates
 * one 'elevation' ViewDefinition per room wall via `view.createDefinition` (P6), all in
 * ONE `runBatch` (one undo). Idempotent on the stable view id. Skipped degenerate rooms
 * are logged (§DIAG, C24.1 §1.3). Returns the number of views created. Never throws.
 */
export function generateRoomInteriorElevations(runtime: PryzmRuntime, scope: RoomElevationScope): number {
    const toast: Toast = (message, severity) => runtime.events?.emit('pryzm:toast', { message, severity });
    try {
        const rooms = gatherDocRooms();
        if (rooms.length === 0) {
            toast('Interior elevations: no rooms detected yet — detect rooms first.', 'warn');
            return 0;
        }

        const targetRooms = (
            scope.kind === 'all' ? rooms :
            scope.kind === 'level' ? rooms.filter(r => r.levelId === scope.levelId) :
            rooms.filter(r => r.id === scope.roomId)
        );
        const views = buildScopedRoomInteriorElevations(rooms, scope);

        // §DIAG (C24.1 §1.3) — any in-scope room that produced 0 views is a skip; log it.
        const producedRoomIds = new Set(views.map(v => v.roomId));
        for (const r of targetRooms) {
            if (!producedRoomIds.has(r.id)) {
                console.warn(`[documentation] §DOC-ROOM-INTERIOR-ELEVATIONS §DIAG skipped room "${r.name}" (${r.id}) — degenerate boundary, no interior elevation.`);
            }
        }

        if (views.length === 0) {
            toast('Interior elevations: no eligible rooms in the chosen scope.', 'warn');
            return 0;
        }

        const existing = new Set(viewDefinitionStore.getAll().map(v => v.id));
        let created = 0;
        // One batch = one undo unit (C24.1 §1.2).
        batchCoordinator.runBatch(() => {
            for (const v of views) {
                if (existing.has(v.id)) continue;
                try {
                    runtime.bus.executeCommand('view.createDefinition', {
                        id: v.id,
                        name: v.name,
                        viewType: v.viewType,
                        spatial: v.spatial,
                        crop: v.crop,
                    });
                    created += 1;
                } catch (e) {
                    console.warn('[documentation] §DOC-ROOM-INTERIOR-ELEVATIONS create failed for', v.name, e);
                }
            }
        }, {
            // View definitions create no room-defining geometry, so skip the
            // post-batch redetect + PBR sweeps (BatchOptions is required on main).
            levelIds: [],
            totalElementCount: views.length,
            skipRedetectRooms: true,
            skipPbrUpgrade: true,
        });

        const scopeLabel =
            scope.kind === 'all' ? 'all rooms' :
            scope.kind === 'level' ? 'this level' : 'this room';
        console.log(`[documentation] §DOC-ROOM-INTERIOR-ELEVATIONS created ${created}/${views.length} interior elevation view(s) for ${targetRooms.length} room(s) (${scopeLabel}).`);
        toast(
            created > 0
                ? `Interior elevations: created ${created} view${created === 1 ? '' : 's'} across ${targetRooms.length} room${targetRooms.length === 1 ? '' : 's'}.`
                : 'Interior elevations: views already exist for the chosen scope.',
            created > 0 ? 'success' : 'info',
        );
        return created;
    } catch (e) {
        console.error('[documentation] §DOC-ROOM-INTERIOR-ELEVATIONS generate failed:', e);
        toast('Interior-elevation generation failed — see console.', 'error');
        return 0;
    }
}
