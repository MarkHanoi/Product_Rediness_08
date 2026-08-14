// @pryzm/ai-host — auto-label follow-through for room occupancy (§L-905).
// =============================================================================
//
// WHY THIS EXISTS. The founder, after `0a2dbd84` shipped "make room 001 a
// bathroom": *"I want the label to be changed also — to Bedroom 01 for example.
// QUEUE IT!"* The occupancy lands but the schedule still reads `Room 00-003`.
//
// This module is the WHOLE decision, pure (no DOM, no stores, no I/O — the
// caller injects a rooms snapshot through ResolverContext):
//
//   1. AUTHORED-NAME PROTECTION (C81 §2.2 / C80 §2.2). A name a human typed is
//      AUTHORED even on a generated room. We rename ONLY when the current name
//      matches the auto-default MINTING pattern, read off the one place that
//      mints it — `packages/command-registry/src/rooms/RoomNumbering.ts`
//      `assignUniqueRoomNumbers`, which writes `Room ${roomNumber}` with
//      `roomNumber = `${levelPrefix(2+ digits)}-${seq(3+ digits)}``, and only
//      over names that were empty, exactly 'Room', or equal to the incoming
//      number. Anything else is kept, and the chat reply SAYS SO.
//
//   2. OCCUPANCY → LABEL, for EVERY member of the vocabulary. The label is
//      DERIVED from the canonical enum member (`living-room` → "Living Room"),
//      never a hand-copied table that could drift from the 51-member Zod enum
//      RoomStore.update() validates against (the same one-vocabulary rule as
//      roomOccupancyRef.ts). `unclassified` and non-members yield NO rename.
//
//   3. NUMBERING — "Bedroom 01": the next FREE zero-padded index among rooms on
//      the SAME level whose name already carries that label, deterministic,
//      never renumbering an existing room. Names assigned earlier in the SAME
//      gesture ("make rooms 002 and 003 bedrooms" → Bedroom 01, Bedroom 02) are
//      counted as taken.
//
// ONE GESTURE = ONE UNDO (C78 §12): a room that renames dispatches ONE
// `room.rename` bus command carrying BOTH `name` and `occupancy` — the handler
// applies both in a single legacy RenameRoomCommand patch, so one Ctrl+Z
// reverts both. A room that keeps its authored name dispatches the plain
// `room.setOccupancy`, exactly as before.

import { CANONICAL_OCCUPANCIES, UNCLASSIFIED_OCCUPANCY } from './roomOccupancyRef.js';

/** The room fields the rename decision reads — a snapshot row the editor
 *  injects (ResolverContext.rooms), never a live store. */
export interface RoomLabelRow {
  readonly id: string;
  readonly name?: string;
  readonly roomNumber?: string;
  readonly levelId?: string;
}

/** One command of the planned fan-out (mirrors BusCommandRef structurally —
 *  kept local so this module depends on nothing above it). */
export interface RoomFanOutCommand {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RoomFanOutPlan {
  readonly commands: readonly RoomFanOutCommand[];
  /** Human sentences for the reply's notes tail — one per rename ("renamed
   *  room 00-003 to \"Bedroom 01\"") or per protected name ("kept your name
   *  \"Studio\" for room 00-002"). Empty when nothing about names changed. */
  readonly notes: readonly string[];
}

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_OCCUPANCIES);

/**
 * The minted default-name shape, matched EXACTLY against the minting code
 * (RoomNumbering.assignUniqueRoomNumbers): `Room ${levelPrefix}-${seq}` where
 * the prefix is `String(idx).padStart(2,'0')` and the sequence
 * `String(n).padStart(3,'0')` — so 2-or-more digits, dash, 3-or-more digits.
 */
const MINTED_NAME_RE = /^Room \d{2,}-\d{3,}$/;

/**
 * Is this name the auto-default the generator minted (renameable), as opposed
 * to something a human typed (protected)?
 *
 * TRUE for exactly the states the minting code itself treats as "no real name":
 * empty/missing, the literal 'Room', the minted `Room NN-NNN` shape (even when
 * the embedded number has DRIFTED from the room's current number — the
 * founder's schedule shows `Room 00-001` sitting on room 00-004; that name was
 * still minted, not authored), or `Room ${roomNumber}` for this room's own
 * number. Everything else is AUTHORED and must be kept.
 */
export function isAutoDefaultRoomName(name: string | undefined, roomNumber: string | undefined): boolean {
  const n = (name ?? '').trim();
  if (n.length === 0 || n === 'Room') return true;
  if (MINTED_NAME_RE.test(n)) return true;
  const num = (roomNumber ?? '').trim();
  if (num.length > 0 && n === `Room ${num}`) return true;
  return false;
}

/** Acronym members that title-casing would mangle. */
const LABEL_ACRONYMS: Readonly<Record<string, string>> = { wc: 'WC' };

/**
 * The label a canonical occupancy renames a room TO ("bedroom" → "Bedroom",
 * "living-room" → "Living Room", "accessible-wc" → "Accessible WC"), or `null`
 * when no rename should happen: `unclassified` (clearing a use is not naming
 * one) and anything that is NOT a member of the canonical vocabulary — an
 * unknown word must never mint a label (§CONTEXT-DATA-HONESTY: no guessing).
 */
export function occupancyAutoLabel(occupancy: string): string | null {
  if (!CANONICAL_SET.has(occupancy)) return null;
  if (occupancy === UNCLASSIFIED_OCCUPANCY) return null;
  return occupancy
    .split('-')
    .map((w) => LABEL_ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** `Bedroom` + 3 → `Bedroom 03` (two-digit floor, wider only past 99). */
export function formatAutoLabelName(label: string, index: number): string {
  return `${label} ${String(index).padStart(2, '0')}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The next FREE index for `label` given the names already in use: the smallest
 * positive integer no `"${label} <digits>"` name carries. Deterministic in its
 * inputs; existing rooms are NEVER renumbered — their indices are simply taken.
 */
export function nextAutoLabelIndex(label: string, takenNames: Iterable<string | undefined>): number {
  const re = new RegExp(`^${escapeRegExp(label)} (\\d+)$`);
  const used = new Set<number>();
  for (const raw of takenNames) {
    const m = re.exec((raw ?? '').trim());
    if (m) used.add(Number.parseInt(m[1]!, 10));
  }
  let i = 1;
  while (used.has(i)) i += 1;
  return i;
}

/** Same-level test that never merges levels it cannot prove distinct: a side
 *  with no levelId is conservatively "same" (worst case an index is skipped —
 *  never a duplicate name minted). */
function sameLevel(a: string | undefined, b: string | undefined): boolean {
  return a === undefined || b === undefined || a === b;
}

/** How a note speaks a room: by its unique NUMBER when it has one (the column
 *  the Room Schedule keys on), falling back to the id. */
function speakRoom(row: RoomLabelRow): string {
  const num = (row.roomNumber ?? '').trim();
  return num.length > 0 ? `room ${num}` : `room ${row.id}`;
}

/**
 * Plan the per-room command fan-out for a `set-room-occupancy` gesture (§L-905).
 *
 * Per resolved room, in the resolver's deterministic order:
 *   · auto-default name + labelable occupancy → ONE `room.rename` carrying
 *     BOTH the new name and the occupancy (one undo entry for both);
 *   · authored name → plain `room.setOccupancy` + a "kept your name" note;
 *   · no label (unclassified / unknown), no snapshot, or room not found in the
 *     snapshot → plain `room.setOccupancy`, no note — exactly the pre-L-905
 *     behaviour, and the reply then claims nothing about names.
 */
export function planRoomOccupancyFanOut(
  ids: readonly string[],
  occupancy: string,
  rooms: readonly RoomLabelRow[] | undefined,
): RoomFanOutPlan {
  const commands: RoomFanOutCommand[] = [];
  const notes: string[] = [];
  const label = occupancyAutoLabel(occupancy);
  /** Names minted earlier in THIS gesture, so "rooms 002 and 003" become
   *  Bedroom 01 and Bedroom 02 even though the store has not updated yet. */
  const assigned: { levelId?: string; name: string }[] = [];

  for (const id of ids) {
    const occupancyOnly: RoomFanOutCommand = {
      type: 'room.setOccupancy',
      payload: { roomId: id, occupancy },
    };
    const row = rooms?.find((r) => r.id === id);
    if (row === undefined || label === null) {
      commands.push(occupancyOnly);
      continue;
    }
    if (!isAutoDefaultRoomName(row.name, row.roomNumber)) {
      // AUTHORED — keep it, and say so (C81 §2.2: never silently overwrite,
      // and never silently keep either).
      commands.push(occupancyOnly);
      notes.push(`kept your name "${(row.name ?? '').trim()}" for ${speakRoom(row)}`);
      continue;
    }
    const taken = [
      ...(rooms ?? [])
        .filter((r) => r.id !== id && sameLevel(r.levelId, row.levelId))
        .map((r) => r.name),
      ...assigned.filter((a) => sameLevel(a.levelId, row.levelId)).map((a) => a.name),
    ];
    const name = formatAutoLabelName(label, nextAutoLabelIndex(label, taken));
    assigned.push({ ...(row.levelId !== undefined ? { levelId: row.levelId } : {}), name });
    commands.push({
      type: 'room.rename',
      payload: { roomId: id, name, occupancy },
    });
    notes.push(`renamed ${speakRoom(row)} to "${name}"`);
  }
  return { commands, notes };
}
