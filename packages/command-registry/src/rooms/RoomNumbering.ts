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

// ── §MINTED-NAME-FOLLOWS-NUMBER (L-4510) ─────────────────────────────
//
// THE DEFECT (founder, 2026-08-21, over a Level 1 plan: *"why in Level 1 are the
// graphics not correct?"*). Two rooms on ONE level, both labelled `Room 01-002`,
// with DIFFERENT areas — 25.1 m² and 20.5 m². Already recorded once at L-896 with
// `Room 00-001` sitting on rooms 00-001 and 00-004; the mechanism was never closed.
//
// The mechanism is in this file. `assignUniqueRoomNumbers` MINTS `Room <number>`
// as a room name (below), but its "may I overwrite this name?" test recognised only
// '', 'Room', and the bare number string — **never the shape it had just minted
// itself**. So the instant a room is RENUMBERED (its incoming number is already
// taken, or fails `expectedPattern` because the level prefix moved — the prefix is
// the level INDEX in the elevation-sorted list, so inserting a level shifts every
// level above it) it gets a NEW number and KEEPS the OLD minted name. That name now
// belongs to a different room. Two rooms, one label, two areas.
//
// THE RULE: a SYSTEM-MINTED name must always name the room’s OWN number. An
// AUTHORED name ("Kitchen") is never touched by anything here.
//
// ⚠ A SECOND COPY of this predicate exists at
// `packages/ai-host/src/intents/roomAutoLabel.ts` (`MINTED_NAME_RE`,
// `isAutoDefaultRoomName`), whose own doc-comment names this exact bug. It is NOT
// imported here: ai-host and command-registry are BOTH L2, so the import would be
// sideways. Collapsing the two needs the predicate to move to a lower layer —
// recorded as the exit condition on L-4510, not done here.

/**
 * The exact shape `assignUniqueRoomNumbers` mints below: `Room <prefix>-<seq>`.
 * `\d{2,}` / `\d{3,}` rather than fixed widths because `levelPrefix` is
 * `padStart(2)` and the sequence is `padStart(3)` — both are MINIMA, and a project
 * with 100+ levels or 1000+ rooms on one level overflows them.
 */
const MINTED_NUMBER_SHAPE = String.raw`\d{2,}-\d{3,}`;

const MINTED_ROOM_NAME_RE = new RegExp(`^Room ${MINTED_NUMBER_SHAPE}$`);

/**
 * §L-10812 (C94 §TOBE.6 RM-0) — the NUMBER sibling of `isSystemMintedRoomName`.
 *
 * True when `roomNumber` has the shape `assignUniqueRoomNumbers` mints below, i.e.
 * the system produced it and it is NOT evidence that a human typed anything.
 *
 * ⭐ IT SHARES `MINTED_NUMBER_SHAPE` WITH ITS SIBLING RATHER THAN RESTATING IT.
 * This file's own header already records that a SECOND copy of the name predicate
 * exists (`ai-host/src/intents/roomAutoLabel.ts`) and that collapsing the two is the
 * open exit condition on L-4510. Minting a THIRD rival here — a hand-written
 * `/^\d{2,}-\d{3,}$/` two lines from the constant that already says it — would be the
 * same defect again, in the same file, with the warning visible on screen (C84 EI-9).
 *
 * ⚠ CONSERVATIVE BY DESIGN, and it is the direction that matters. A human who types
 * a number that happens to match the minted shape (`00-005`) is read as SYSTEM, so
 * the authored count in the census UNDERSTATES rather than overstates. An overstated
 * "authored" count would argue for persistent identity (C94 R-1) on evidence that was
 * never there; an understated one cannot.
 */
const MINTED_ROOM_NUMBER_RE = new RegExp(`^${MINTED_NUMBER_SHAPE}$`);

export function isSystemMintedRoomNumber(roomNumber: string | undefined | null): boolean {
  if (!roomNumber) return true;
  return MINTED_ROOM_NUMBER_RE.test(roomNumber);
}

/**
 * True when `name` is a name the SYSTEM produced and may therefore replace.
 *
 * `incoming` is the room’s pre-existing number string: a name equal to it is the
 * bare-number seed the generators write (`HouseLayoutExecutor` seeds "01", "02"…),
 * which is also system output.
 */
export function isSystemMintedRoomName(name: string | undefined | null, incoming: string): boolean {
  if (!name) return true;
  if (name === 'Room') return true;
  if (incoming !== '' && name === incoming) return true;
  return MINTED_ROOM_NAME_RE.test(name);
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
      // §MINTED-NAME-FOLLOWS-NUMBER (L-4510) — keeping the NUMBER is not enough. A
      // room can arrive holding a minted name that names a DIFFERENT number (it was
      // renumbered on an earlier pass and its name was stranded). Repair it here too,
      // or the stale label survives every subsequent re-detect untouched.
      const keptName = isSystemMintedRoomName(room.name, incoming) ? `Room ${incoming}` : room.name;
      if (incoming === room.roomNumber && keptName === room.name) return room;
      return { ...room, roomNumber: incoming, name: keptName };
    }

    const roomNumber = nextRoomNumber();
    // §MINTED-NAME-FOLLOWS-NUMBER (L-4510) — THE founder-screenshot line. This test
    // used to be `!room.name || room.name === 'Room' || room.name === incoming`, which
    // does not recognise `Room NN-NNN` — the shape minted on the very next line. A
    // renumbered room therefore kept a name naming someone else’s number.
    const name = isSystemMintedRoomName(room.name, incoming) ? `Room ${roomNumber}` : room.name;

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