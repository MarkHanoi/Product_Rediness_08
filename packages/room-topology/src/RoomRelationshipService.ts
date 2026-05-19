/**
 * RoomRelationshipService — spatial relationship resolution between elements and Rooms.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. No import remapping required — all relative deps
 * (RoomPolygonUtils, RoomColourSystem, RoomTypes) are same-package.
 */

import { pointInPolygon } from './RoomPolygonUtils';
import { RoomColourSystem } from './RoomColourSystem';
import type { RoomData } from './RoomTypes';

export interface RoomRef {
  id: string;
  name: string;
  roomNumber: string;
  colour: string;
}

export interface DoorRoomRelationship {
  roomFrom: RoomRef | null;
  roomTo:   RoomRef | null;
}

export interface WindowRoomRelationship {
  roomId:         RoomRef | null;
  adjacentRoomId: RoomRef | null;
}

const SAMPLE_OFFSET_M = 0.55;

type IRoomStoreLite = {
  getRoomsContainingPoint?: (px: number, pz: number, levelId: string) => RoomData[];
  getByLevel?:              (levelId: string) => RoomData[];
};

export class RoomRelationshipService {

  private static _roomStore: IRoomStoreLite | undefined;

  static setRoomStore(roomStore: IRoomStoreLite | undefined): void {
    RoomRelationshipService._roomStore = roomStore;
  }

  private static _store(): IRoomStoreLite | undefined {
    return RoomRelationshipService._roomStore ?? (window as any).roomStore;
  }

  static getRoomAtPoint(px: number, pz: number, levelId: string): RoomRef | null {
    const roomStore = RoomRelationshipService._store();
    if (!roomStore) return null;

    let rooms: RoomData[];

    if (typeof roomStore.getRoomsContainingPoint === 'function') {
      rooms = roomStore.getRoomsContainingPoint(px, pz, levelId);
    } else if (typeof roomStore.getByLevel === 'function') {
      rooms = (roomStore.getByLevel(levelId) as RoomData[])
        .filter(r => pointInPolygon(px, pz, r.boundary.polygon));
    } else {
      rooms = [];
    }

    if (rooms.length === 0) return null;

    const best = rooms.reduce((a, b) => (a.computed.area < b.computed.area ? a : b));
    return RoomRelationshipService._toRef(best);
  }

  static getDoorRelationships(doorData: any, wallData: any): DoorRoomRelationship {
    if (!wallData?.baseLine) return { roomFrom: null, roomTo: null };

    const { center, leftNormal, rightNormal } = RoomRelationshipService._openingGeometry(doorData, wallData);
    const levelId: string = wallData.levelId;

    const sL = { x: center.x + leftNormal.x  * SAMPLE_OFFSET_M, z: center.z + leftNormal.z  * SAMPLE_OFFSET_M };
    const sR = { x: center.x + rightNormal.x * SAMPLE_OFFSET_M, z: center.z + rightNormal.z * SAMPLE_OFFSET_M };

    return {
      roomFrom: RoomRelationshipService.getRoomAtPoint(sL.x, sL.z, levelId),
      roomTo:   RoomRelationshipService.getRoomAtPoint(sR.x, sR.z, levelId),
    };
  }

  static getWindowRelationships(windowData: any, wallData: any): WindowRoomRelationship {
    if (!wallData?.baseLine) return { roomId: null, adjacentRoomId: null };

    const { center, leftNormal, rightNormal } = RoomRelationshipService._openingGeometry(windowData, wallData);
    const levelId: string = wallData.levelId;

    const sL = { x: center.x + leftNormal.x  * SAMPLE_OFFSET_M, z: center.z + leftNormal.z  * SAMPLE_OFFSET_M };
    const sR = { x: center.x + rightNormal.x * SAMPLE_OFFSET_M, z: center.z + rightNormal.z * SAMPLE_OFFSET_M };

    const roomLeft  = RoomRelationshipService.getRoomAtPoint(sL.x, sL.z, levelId);
    const roomRight = RoomRelationshipService.getRoomAtPoint(sR.x, sR.z, levelId);

    if (roomLeft && roomRight && roomLeft.id !== roomRight.id) {
      return { roomId: roomLeft, adjacentRoomId: roomRight };
    }
    return { roomId: roomLeft ?? roomRight, adjacentRoomId: null };
  }

  static getWallAdjacentRooms(wallData: any): RoomRef[] {
    if (!wallData?.baseLine) return [];

    const b0 = wallData.baseLine[0];
    const b1 = wallData.baseLine[1];
    if (!b0 || !b1) return [];

    const dx = (b1.x ?? 0) - (b0.x ?? 0);
    const dz = (b1.z ?? 0) - (b0.z ?? 0);
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return [];

    const midX = ((b0.x ?? 0) + (b1.x ?? 0)) / 2;
    const midZ = ((b0.z ?? 0) + (b1.z ?? 0)) / 2;

    const lnx = -dz / len;
    const lnz =  dx / len;

    const levelId: string = wallData.levelId ?? '';
    const sL = { x: midX + lnx * SAMPLE_OFFSET_M, z: midZ + lnz * SAMPLE_OFFSET_M };
    const sR = { x: midX - lnx * SAMPLE_OFFSET_M, z: midZ - lnz * SAMPLE_OFFSET_M };

    const roomL = RoomRelationshipService.getRoomAtPoint(sL.x, sL.z, levelId);
    const roomR = RoomRelationshipService.getRoomAtPoint(sR.x, sR.z, levelId);

    const result: RoomRef[] = [];
    if (roomL) result.push(roomL);
    if (roomR && roomR.id !== roomL?.id) result.push(roomR);
    return result;
  }

  static getContainingRoom(px: number, pz: number, levelId: string): RoomRef | null {
    return RoomRelationshipService.getRoomAtPoint(px, pz, levelId);
  }

  private static _openingGeometry(
    openingData: any,
    wallData: any,
  ): {
    center:      { x: number; z: number };
    leftNormal:  { x: number; z: number };
    rightNormal: { x: number; z: number };
  } {
    const b0 = wallData.baseLine[0];
    const b1 = wallData.baseLine[1];

    const dx = (b1.x ?? 0) - (b0.x ?? 0);
    const dz = (b1.z ?? 0) - (b0.z ?? 0);
    const len = Math.sqrt(dx * dx + dz * dz);

    if (len < 0.001) {
      return {
        center:      { x: b0.x ?? 0, z: b0.z ?? 0 },
        leftNormal:  { x:  0, z:  1 },
        rightNormal: { x:  0, z: -1 },
      };
    }

    const ndx = dx / len;
    const ndz = dz / len;

    let t: number;
    if (openingData?.anchor?.t !== undefined) {
      t = openingData.anchor.t;
    } else if (openingData?.offset !== undefined) {
      t = openingData.offset / len;
    } else {
      t = 0.5;
    }

    t = Math.max(0, Math.min(1, t));

    const cx = (b0.x ?? 0) + t * dx;
    const cz = (b0.z ?? 0) + t * dz;

    return {
      center:      { x: cx,   z: cz   },
      leftNormal:  { x: -ndz, z:  ndx },
      rightNormal: { x:  ndz, z: -ndx },
    };
  }

  private static _toRef(room: RoomData): RoomRef {
    return {
      id:         room.id,
      name:       room.name || '',
      roomNumber: room.roomNumber || '',
      colour:     RoomColourSystem.resolve(room),
    };
  }
}
