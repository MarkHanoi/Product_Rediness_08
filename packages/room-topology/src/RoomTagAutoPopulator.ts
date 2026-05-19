/**
 * RoomTagAutoPopulator — DOC-2.5b
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. Import remapping:
 *   ../commands                       → @pryzm/command-registry
 *   ../core/views/ViewDefinitionTypes → @pryzm/core-app-model
 */

import * as THREE from '@pryzm/renderer-three/three';
import { makeAnnotationElement } from '@pryzm/plugin-annotations';
import { makePointRef } from '@pryzm/plugin-annotations';
import { CreateAnnotationCommand } from '@pryzm/command-registry';
import { DeleteAnnotationCommand } from '@pryzm/command-registry';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { RoomStore } from './RoomStore';

type IAnnotationStoreLite = { getByView: (viewId: string) => any[] };
type ICommandManagerLite  = { execute: (cmd: any) => any };

export interface RoomTagAutoPopulatorDeps {
    roomStore?:        RoomStore;
    annotationStore?:  IAnnotationStoreLite;
    commandManager?:   ICommandManagerLite;
}

export class RoomTagAutoPopulator {
    private readonly _roomStore?: RoomStore;
    private readonly _annotationStore?: IAnnotationStoreLite;
    private readonly _commandManager?: ICommandManagerLite;

    constructor(deps: RoomTagAutoPopulatorDeps = {}) {
        this._roomStore       = deps.roomStore;
        this._annotationStore = deps.annotationStore;
        this._commandManager  = deps.commandManager;
    }

    populate(viewDef: ViewDefinition): void {
        const roomStore       = this._roomStore       ?? (window as any).roomStore;
        const annotationStore = this._annotationStore ?? (window as any).annotationStore;
        const commandManager  = this._commandManager  ?? (window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined);

        if (!roomStore || !annotationStore || !commandManager) {
            console.warn('[RoomTagAutoPopulator] Missing store(s) or commandManager — skipping.');
            return;
        }

        const levelId = viewDef.spatial.levelId;
        if (!levelId) return;

        const rooms = roomStore.getByLevel(levelId);
        const liveRoomIds = new Set<string>(rooms.map((r: any) => r.id));

        const existingRoomIds = new Set<string>();
        const existingAnns: any[] = annotationStore.getByView(viewDef.id);
        const tagsByRoomId = new Map<string, any[]>();
        for (const ann of existingAnns) {
            if (ann.type === 'room-tag' && typeof ann.parameters?.roomId === 'string') {
                const roomId = ann.parameters.roomId as string;
                const tags = tagsByRoomId.get(roomId) ?? [];
                tags.push(ann);
                tagsByRoomId.set(roomId, tags);
            }
        }

        let removedDuplicates = 0;
        let removedOrphans = 0;
        for (const [roomId, tags] of tagsByRoomId) {
            if (tags.length === 0) continue;

            if (!liveRoomIds.has(roomId)) {
                for (const orphan of tags) {
                    const cmd = new DeleteAnnotationCommand(orphan.id);
                    const valid = cmd.canExecute({} as any);
                    if (valid.ok) {
                        if ((window as any).runtime?.bus) { (window as any).runtime.bus.executeCommand('room.create', {}).catch(() => {}); }
                        commandManager.execute(cmd);
                        removedOrphans++;
                    }
                }
                continue;
            }

            existingRoomIds.add(roomId);
            for (const duplicate of tags.slice(1)) {
                const cmd = new DeleteAnnotationCommand(duplicate.id);
                const valid = cmd.canExecute({} as any);
                if (valid.ok) {
                    if ((window as any).runtime?.bus) { (window as any).runtime.bus.executeCommand('room.create', {}).catch(() => {}); }
                    commandManager.execute(cmd);
                    removedDuplicates++;
                }
            }
        }

        if (rooms.length === 0) {
            console.log(
                `[RoomTagAutoPopulator] viewId=${viewDef.id} level=${levelId}: ` +
                `0 room-tag(s) created, ${removedDuplicates} duplicate(s) removed, ` +
                `${removedOrphans} orphan(s) removed — no live rooms.`
            );
            return;
        }

        let created = 0;
        for (const room of rooms) {
            if (existingRoomIds.has(room.id)) continue;

            const cx = room.computed.centroid.x;
            const cz = room.computed.centroid.z;
            const worldPos = new THREE.Vector3(cx, 0, cz);

            const cachedLabel = room.name || room.roomNumber || 'Room';
            const areaLabel   = `${room.computed.area.toFixed(1)} m²`;

            const ann = makeAnnotationElement(
                crypto.randomUUID(),
                'room-tag',
                viewDef.id,
                [makePointRef(worldPos)],
                { modelPoints: [{ x: cx, y: 0, z: cz }], offset: 0 },
                {
                    roomId:      room.id,
                    roomName:    room.name,
                    roomNumber:  room.roomNumber,
                    area:        room.computed.area,
                    cachedLabel,
                    areaLabel,
                },
            );

            const cmd = new CreateAnnotationCommand(ann);
            const valid = cmd.canExecute({} as any);
            if (valid.ok) {
                if ((window as any).runtime?.bus) { (window as any).runtime.bus.executeCommand('room.create', {}).catch(() => {}); }
                commandManager.execute(cmd);
                created++;
            }
        }

        console.log(
            `[RoomTagAutoPopulator] viewId=${viewDef.id} level=${levelId}: ` +
            `${created} room-tag(s) created, ${removedDuplicates} duplicate(s) removed, ` +
            `${removedOrphans} orphan(s) removed out of ${rooms.length} live room(s).`
        );
    }
}
