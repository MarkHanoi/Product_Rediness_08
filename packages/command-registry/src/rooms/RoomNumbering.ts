import type { CommandContext } from '../types';
import type { RoomData } from '@pryzm/room-topology';

export function resolveRoomLevelPrefix(levelId: string, ctx: CommandContext): string {
  try {
    const sourceLevels = ctx.bimManager.getLevels?.()
      ?? ctx.stores.wallStore?.getLevels?.()
      ?? [];
    const sorted = [...sourceLevels].sort((a: any, b: any) => (a.elevation ?? 0) - (b.elevation ?? 0));
    const idx = sorted.findIndex((level: any) => level.id === levelId);
    return String(idx >= 0 ? idx : 0).padStart(2, '0');
  } catch {
    return '00';
  }
}

export function assignUniqueRoomNumbers(
  rooms: RoomData[],
  levelPrefix: string,
  reservedNumbers: Iterable<string> = [],
): RoomData[] {
  const expectedPattern = new RegExp(`^${levelPrefix}-\\d{3}$`);
  const used = new Set<string>();
  for (const raw of reservedNumbers) {
    const number = String(raw ?? '').trim();
    if (number && expectedPattern.test(number)) used.add(number);
  }

  let nextSeq = 1;
  const nextRoomNumber = (): string => {
    let candidate = '';
    do {
      candidate = `${levelPrefix}-${String(nextSeq++).padStart(3, '0')}`;
    } while (used.has(candidate));
    used.add(candidate);
    return candidate;
  };

  return rooms.map(room => {
    const incoming = String(room.roomNumber ?? '').trim();
    if (incoming && expectedPattern.test(incoming) && !used.has(incoming)) {
      used.add(incoming);
      return incoming === room.roomNumber ? room : { ...room, roomNumber: incoming };
    }

    const roomNumber = nextRoomNumber();
    const name = !room.name || room.name === 'Room' || room.name === incoming
      ? `Room ${roomNumber}`
      : room.name;

    return { ...room, roomNumber, name };
  });
}

export function assignUniqueRoomNumber(
  room: RoomData,
  ctx: CommandContext,
  reservedRooms: RoomData[] = [],
): RoomData {
  const levelPrefix = resolveRoomLevelPrefix(room.levelId, ctx);
  return assignUniqueRoomNumbers(
    [room],
    levelPrefix,
    reservedRooms
      .filter(existing => existing.id !== room.id)
      .map(existing => existing.roomNumber),
  )[0];
}