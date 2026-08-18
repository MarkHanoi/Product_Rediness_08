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

  // ── EI-7e (C84 §9) — PASS 0: reserve every USER-AUTHORED number first ──────
  //
  // A human-typed number is kept VERBATIM and is never renumbered. It must be
  // reserved BEFORE any number is generated, or a generated '00-001' could be
  // handed out and then collide with an authored '00-001' later in the list.
  //
  // Authorship is READ, never inferred. `metadata.roomNumberAuthored` is stamped
  // by RenameRoomCommand — the one user-facing number path. The old code tested
  // the VALUE's shape instead, which silently destroyed the user's '101' /
  // 'G.04' on every re-detect (RoomTopologyObserver.resume() → ReDetectRoomsCommand
  // → here) while looking indistinguishable from the generator seeds ('01', '02')
  // it legitimately must renumber.
  const authoredKept = new Set<number>();
  rooms.forEach((room, i) => {
    if (room.metadata?.roomNumberAuthored !== true) return;
    const authored = String(room.roomNumber ?? '').trim();
    if (!authored) return;          // blank ⇒ authorship surrendered, auto-number it
    if (used.has(authored)) return; // a genuine collision still yields to uniqueness
    used.add(authored);
    authoredKept.add(i);
  });

  let nextSeq = 1;
  const nextRoomNumber = (): string => {
    let candidate = '';
    do {
      candidate = `${levelPrefix}-${String(nextSeq++).padStart(3, '0')}`;
    } while (used.has(candidate));
    used.add(candidate);
    return candidate;
  };

  return rooms.map((room, i) => {
    const incoming = String(room.roomNumber ?? '').trim();

    // PASS 0 already reserved this one — keep the human's value untouched, and
    // leave `name` alone too (the default-name rewrite below is only for rooms
    // that are being GIVEN a number by the system).
    if (authoredKept.has(i)) {
      return incoming === room.roomNumber ? room : { ...room, roomNumber: incoming };
    }

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