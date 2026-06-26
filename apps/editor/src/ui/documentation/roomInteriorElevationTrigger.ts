// §DOC-ROOM-INTERIOR-ELEVATIONS — single shared trigger that opens the scope modal
// and runs the generator (2026-06-26).
//
// Used by the AI Design Assistant → Documentation set pill "Interior elevations per
// room". Gathers the live levels + rooms, shows the scope picker, and on Generate
// dispatches the chosen scope through `generateRoomInteriorElevations` (P6, one undo).
// Always surfaces a toast / console marker so the pill can never silently do nothing.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    generateRoomInteriorElevations,
    gatherDocLevels,
    gatherDocRooms,
    getActiveLevelId,
} from './generateRoomInteriorElevations.js';
import { RoomInteriorElevationModal } from './roomInteriorElevationModal.js';

const _modal = new RoomInteriorElevationModal();

/** Open the scope picker, then generate the interior elevations for the chosen scope. */
export function triggerRoomInteriorElevations(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window as unknown as { runtime?: PryzmRuntime }).runtime) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void =>
        rt?.events?.emit('pryzm:toast', { message, severity });

    if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }

    const rooms = gatherDocRooms();
    if (rooms.length === 0) {
        toast('No rooms detected yet — detect rooms first.', 'warn');
        return;
    }

    const levels = gatherDocLevels();
    _modal.show(
        {
            levels,
            rooms: rooms.map(r => ({ id: r.id, name: r.name, levelId: r.levelId })),
            activeLevelId: getActiveLevelId(),
        },
        {
            onGenerate: (scope) => {
                console.log('[documentation] §DOC-ROOM-INTERIOR-ELEVATIONS generate requested, scope:', scope);
                generateRoomInteriorElevations(rt, scope);
            },
        },
    );
}
