/**
 * RoomTagAutoPopulator — DOC-2.5b
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology.
 *
 * §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — THIS CLASS NO LONGER OWNS THE LIFECYCLE.
 *
 * The four decisions it used to make inline — which live element still needs a tag,
 * which tag has drifted, which is a duplicate, which is an orphan — are now
 * `reconcileTagSet()` in @pryzm/core-app-model, parameterised by CATEGORY. Rooms are
 * simply its first consumer; doors, windows and walls (via `autoTagActiveView`) are
 * the others. One engine, N categories — a second populator per category would have
 * been four more copies of the same four decisions.
 *
 * What stays here, and only here, is what is genuinely ROOM-specific:
 *   • the room's LABEL rule (`desiredRoomLabel`) and its drift test (`roomTagNeedsRefresh`),
 *   • the room's ANCHOR rule (the centroid — a room tag has no leader),
 *   • the room's TRIGGER (view activation, per level), and the area sub-label.
 * Behaviour is unchanged, including the log line and the idempotent no-op on a
 * settled view (§A.21.D25 — the guard that stops the re-projection feedback loop).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { makeAnnotationElement } from '@pryzm/plugin-annotations';
import { makePointRef } from '@pryzm/plugin-annotations';
import { DeleteAnnotationCommand } from '@pryzm/command-registry';
import { UpdateAnnotationCommand } from '@pryzm/command-registry';
// §ROOMTAG-ONE-COMMAND (L-1396) — the composite that already existed. See `populate`.
// Imported from `@pryzm/command-registry` (a DECLARED dependency of this package)
// via the re-export shim, not from the plugin directly.
import { CreateManyAnnotationsCommand } from '@pryzm/command-registry';
import type { ViewDefinition } from '@pryzm/core-app-model';
// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the GENERIC tag lifecycle. Rooms consume it.
import { reconcileTagSet, type ExistingTagLike } from '@pryzm/core-app-model';
import type { RoomStore } from './RoomStore';
import { roomTagNeedsRefresh, desiredRoomLabel } from './roomTagIdempotency';

type IAnnotationStoreLite = { getByView: (viewId: string) => any[] };
type ICommandManagerLite  = { execute: (cmd: any) => any };

export interface RoomTagAutoPopulatorDeps {
    roomStore?:        RoomStore;
    annotationStore?:  IAnnotationStoreLite;
    commandManager?:   ICommandManagerLite;
}

/** A live room, adapted to the generic engine's `TagTargetLike` contract. */
interface RoomTagTarget {
    readonly targetId: string;
    readonly room: any;
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

        // ── THE GENERIC LIFECYCLE (L-265). Rooms bring only their own drift rule.
        const live: RoomTagTarget[] = rooms.map((r: any) => ({ targetId: r.id, room: r }));
        const plan = reconcileTagSet<RoomTagTarget>({
            category: 'room',
            existing: annotationStore.getByView(viewDef.id) as ExistingTagLike[],
            live,
            needsRefresh: (params, target) =>
                roomTagNeedsRefresh((params ?? {}) as any, target.room),
        });

        let removedOrphans = 0;
        for (const id of plan.orphanTagIds) {
            const cmd = new DeleteAnnotationCommand(id);
            if (cmd.canExecute({} as any).ok) { commandManager.execute(cmd); removedOrphans++; }
        }

        let removedDuplicates = 0;
        for (const id of plan.duplicateTagIds) {
            const cmd = new DeleteAnnotationCommand(id);
            if (cmd.canExecute({} as any).ok) { commandManager.execute(cmd); removedDuplicates++; }
        }

        // §A.21.D25 — IDEMPOTENT REFRESH. Only tags whose room's label/area actually
        // drifted are updated (e.g. the house post-gen chain renames rooms AFTER their
        // tags were placed). When nothing drifted, `toRefresh` is EMPTY — no command,
        // no store event — so a settled view's populate() writes nothing and cannot
        // feed a re-projection.
        let refreshed = 0;
        // §ROOMTAG-ONE-COMMAND (L-1396) — the `getByView(...).find(...)` that used to sit
        // INSIDE this loop re-read and re-scanned the whole view's annotation list once
        // per drifted tag: O(tags × annotations) for a lookup whose input never changes
        // within the loop. Indexed once, outside.
        const tagsById = new Map<string, any>(
            (annotationStore.getByView(viewDef.id) as any[]).map((a) => [a.id, a]),
        );
        for (const { tagId, target } of plan.toRefresh) {
            const liveRoom = target.room;
            const desiredLabel = desiredRoomLabel(liveRoom);
            const desiredArea  = liveRoom.computed?.area;
            const existingTag  = tagsById.get(tagId);
            const p = existingTag?.parameters ?? {};
            const cmd = new UpdateAnnotationCommand(tagId, {
                parameters: {
                    ...p,
                    roomName:    liveRoom.name,
                    roomNumber:  liveRoom.roomNumber,
                    ...(typeof desiredArea === 'number' ? { area: desiredArea } : {}),
                    cachedLabel: desiredLabel,
                    ...(typeof desiredArea === 'number' ? { areaLabel: `${desiredArea.toFixed(1)} m²` } : {}),
                },
            } as any);
            if (cmd.canExecute({} as any).ok) { commandManager.execute(cmd); refreshed++; }
        }

        if (rooms.length === 0) {
            console.log(
                `[RoomTagAutoPopulator] viewId=${viewDef.id} level=${levelId}: ` +
                `0 room-tag(s) created, ${removedDuplicates} duplicate(s) removed, ` +
                `${removedOrphans} orphan(s) removed — no live rooms.`
            );
            return;
        }

        // ⭐ §ROOMTAG-ONE-COMMAND (L-1396) — ONE COMPOSITE, NOT N.
        //
        // This loop used to `commandManager.execute(new CreateAnnotationCommand(ann))`
        // once PER ROOM. On the founder's model that is 24 dispatches per level: 24
        // `[CommandManager] EXECUTE: CREATE_ANNOTATION` + 24 `snapshot …elapsed=` console
        // writes, 24 `canExecute` passes, and — the part that is not merely noise — 24
        // separate entries on the undo stack for ONE automatic background action. Undoing
        // an auto-tag pass took twenty-four presses of Ctrl-Z.
        //
        // `CreateManyAnnotationsCommand` (plugins/annotations, L-145/ADR-0119) already
        // solves exactly this for AutoDimension, which emits whole SETS for the same
        // C11/C24.1 §1.2 reason. Rooms are the second consumer; nothing new was minted.
        // Its `execute` skips ids the store already holds, so the idempotent re-run
        // guarantee (§A.21.D25) is unchanged — and an EMPTY `toCreate` still dispatches
        // nothing at all, because `canExecute` refuses a zero-length set.
        const toCreate: ReturnType<typeof makeAnnotationElement>[] = [];
        for (const { room } of plan.toCreate) {
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

            toCreate.push(ann);
        }

        let created = 0;
        if (toCreate.length > 0) {
            const cmd = new CreateManyAnnotationsCommand(toCreate);
            if (cmd.canExecute({} as any).ok) {
                commandManager.execute(cmd);
                created = toCreate.length;
            }
        }

        console.log(
            `[RoomTagAutoPopulator] viewId=${viewDef.id} level=${levelId}: ` +
            `${created} room-tag(s) created, ${refreshed} refreshed, ${removedDuplicates} duplicate(s) removed, ` +
            `${removedOrphans} orphan(s) removed out of ${rooms.length} live room(s).`
        );
    }
}
