// §L-905 — the room LABEL follows the occupancy ("make room 003 a bedroom"
// also renames the auto-default `Room 00-003` to `Bedroom 01`), driven through
// the REAL chat path (grammar → SemanticIntent → applySemanticIntent → bus
// commands) with the editor's rooms snapshot injected, exactly as
// ZeroTokenChatBridge injects it.
//
// The contract lines under test:
//   · C81 §2.2 — an AUTHORED name is protected and the reply SAYS SO;
//   · C78 §12  — occupancy + rename ride ONE `room.rename` command per room
//     (the one-undo half is executed against the legacy command manager in
//     packages/command-registry/__tests__/renameRoomOccupancyOneUndo.test.ts);
//   · numbering — next FREE zero-padded index among same-labelled rooms on the
//     LEVEL, deterministic, never renumbering an existing room;
//   · vocabulary — the label is derived from the SAME canonical enum
//     RoomStore.update() validates against; unclassified/unknown ⇒ no rename.

import { describe, it, expect } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type RoomLabelRow,
} from '../src/intents/ZeroTokenResolver.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';
import {
  isAutoDefaultRoomName,
  occupancyAutoLabel,
  nextAutoLabelIndex,
  planRoomOccupancyFanOut,
} from '../src/intents/roomAutoLabel.js';
import { CANONICAL_OCCUPANCIES, UNCLASSIFIED_OCCUPANCY } from '../src/intents/roomOccupancyRef.js';

// The founder's project shape: auto-default names minted by RoomNumbering
// (`Room ${roomNumber}`), plus one AUTHORED name and one name that DRIFTED
// from its number (the schedule screenshot's 00-004 named "Room 00-001").
const ROOMS: RoomLabelRow[] = [
  { id: 'r-a', roomNumber: '00-001', name: 'Room 00-001', levelId: 'L0' },
  { id: 'r-b', roomNumber: '00-002', name: 'Room 00-002', levelId: 'L0' },
  { id: 'r-c', roomNumber: '00-003', name: 'Room 00-003', levelId: 'L0' },
  { id: 'r-d', roomNumber: '00-004', name: 'Room 00-001', levelId: 'L0' }, // drifted, still minted
  { id: 'r-e', roomNumber: '00-005', name: 'Studio',      levelId: 'L0' }, // AUTHORED
];

/** The editor's injected room-scope resolver, matched by NUMBER (tiered:
 *  exact → trailing segment) exactly as ZeroTokenChatBridge's room arm does. */
function makeRoomScopeResolver(rooms: readonly RoomLabelRow[]): (s: ScopeDescriptor) => ScopeResult {
  return (scope: ScopeDescriptor): ScopeResult => {
    if (scope.kind !== 'room') return { error: 'only the room scope is stubbed here' };
    const refs = scope.roomRef.split(/\s*(?:,|\band\b|&)\s*/i).map((p) => p.trim()).filter(Boolean);
    const hits: RoomLabelRow[] = [];
    for (const ref of refs) {
      const key = ref.replace(/^rooms?\s+/i, '').toLowerCase();
      const exact = rooms.filter((r) => (r.roomNumber ?? '').toLowerCase() === key);
      const tail = rooms.filter((r) => (r.roomNumber ?? '').split('-').pop() === key);
      const found = exact.length > 0 ? exact : tail;
      if (found.length === 0) return { error: `I can't find a room "${ref}".` };
      for (const r of found) if (!hits.includes(r)) hits.push(r);
    }
    const ids = hits.map((r) => r.id);
    return {
      ids,
      kindCounts: { room: ids.length },
      skipped: [],
      diagnostics: [hits.map((r) => r.roomNumber).join(' + ')],
    };
  };
}

function ctx(rooms: readonly RoomLabelRow[] = ROOMS, overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [{ id: 'L0', name: 'Level 0' }, { id: 'L1', name: 'Level 1' }],
    activeLevelId: 'L0',
    mintId: () => 'generated-id',
    resolveScope: makeRoomScopeResolver(rooms),
    rooms,
    ...overrides,
  } as ResolverContext;
}

function say(utterance: string, c: ResolverContext = ctx()) {
  const resolution = resolveUtterance(utterance.toLowerCase().trim(), c);
  expect(resolution, `the grammar did not claim "${utterance}"`).not.toEqual({ kind: 'miss' });
  return resolution as Exclude<typeof resolution, { kind: 'miss' }>;
}

describe('§L-905 — the minting pattern, matched exactly (C81 §2.2 authored protection)', () => {
  it('recognises exactly what RoomNumbering mints, nothing more', () => {
    // The minted shape: `Room ${levelPrefix(2+)}-${seq(3+)}`.
    expect(isAutoDefaultRoomName('Room 00-003', '00-003')).toBe(true);
    expect(isAutoDefaultRoomName('Room 01-012', '01-012')).toBe(true);
    // Drifted-but-minted (the founder's schedule: 00-004 named "Room 00-001").
    expect(isAutoDefaultRoomName('Room 00-001', '00-004')).toBe(true);
    // The pre-mint placeholder states the minting code itself replaces.
    expect(isAutoDefaultRoomName('', '00-003')).toBe(true);
    expect(isAutoDefaultRoomName(undefined, '00-003')).toBe(true);
    expect(isAutoDefaultRoomName('Room', '00-003')).toBe(true);
    // `Room ${roomNumber}` for the room's OWN number, whatever its shape.
    expect(isAutoDefaultRoomName('Room 7', '7')).toBe(true);
    // AUTHORED — everything a human plausibly typed is protected.
    expect(isAutoDefaultRoomName('Studio', '00-005')).toBe(false);
    expect(isAutoDefaultRoomName('Master Bedroom', '00-002')).toBe(false);
    expect(isAutoDefaultRoomName('Bedroom 01', '00-002')).toBe(false); // already labelled
    expect(isAutoDefaultRoomName('Room with a view', '00-002')).toBe(false);
    expect(isAutoDefaultRoomName('Room 1-1', '00-002')).toBe(false); // not the minted shape
  });

  it('maps EVERY canonical occupancy to a label except unclassified; unknown → none', () => {
    for (const member of CANONICAL_OCCUPANCIES) {
      const label = occupancyAutoLabel(member);
      if (member === UNCLASSIFIED_OCCUPANCY) {
        expect(label).toBeNull();
      } else {
        expect(label, `no label for enum member "${member}"`).toBeTruthy();
        expect(label![0]).toBe(label![0]!.toUpperCase());
        expect(label).not.toContain('-');
      }
    }
    expect(occupancyAutoLabel('bedroom')).toBe('Bedroom');
    expect(occupancyAutoLabel('living-room')).toBe('Living Room');
    expect(occupancyAutoLabel('wc')).toBe('WC');
    expect(occupancyAutoLabel('accessible-wc')).toBe('Accessible WC');
    // NOT a member of the vocabulary ⇒ no label, never a guess.
    expect(occupancyAutoLabel('wine-cellar')).toBeNull();
    expect(occupancyAutoLabel('')).toBeNull();
  });
});

describe('§L-905 — default name renames, in the SAME command (C78 §12)', () => {
  it('"make room 003 a bedroom" emits ONE room.rename carrying BOTH fields', () => {
    const r = say('make room 003 a bedroom');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('room.rename');
    expect(r.commands[0]!.payload).toEqual({
      roomId: 'r-c',
      name: 'Bedroom 01',
      occupancy: 'bedroom',
    });
    // The reply states BOTH actions.
    expect(r.summary).toContain('bedroom');
    expect(r.summary).toContain('renamed room 00-003 to "Bedroom 01"');
  });

  it('the SECOND bedroom on the level gets 02 — existing labels are taken, never renumbered', () => {
    const rooms: RoomLabelRow[] = [
      { id: 'r-x', roomNumber: '00-001', name: 'Bedroom 01', levelId: 'L0' },
      { id: 'r-c', roomNumber: '00-003', name: 'Room 00-003', levelId: 'L0' },
    ];
    const r = say('make room 003 a bedroom', ctx(rooms));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.payload).toEqual({
      roomId: 'r-c',
      name: 'Bedroom 02',
      occupancy: 'bedroom',
    });
    // The existing Bedroom 01 is untouched — no command addresses it.
    expect(r.commands.some((c) => c.payload['roomId'] === 'r-x')).toBe(false);
  });

  it('multiple rooms in ONE gesture number consecutively (002 → 01, 003 → 02)', () => {
    const r = say('make rooms 002 and 003 bedrooms');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(2);
    expect(r.commands.map((c) => c.payload)).toEqual([
      { roomId: 'r-b', name: 'Bedroom 01', occupancy: 'bedroom' },
      { roomId: 'r-c', name: 'Bedroom 02', occupancy: 'bedroom' },
    ]);
    expect(new Set(r.commands.map((c) => c.type))).toEqual(new Set(['room.rename']));
  });

  it('numbering is PER LEVEL — a Bedroom 01 on another level does not consume the index', () => {
    const rooms: RoomLabelRow[] = [
      { id: 'r-up', roomNumber: '01-001', name: 'Bedroom 01', levelId: 'L1' },
      { id: 'r-c', roomNumber: '00-003', name: 'Room 00-003', levelId: 'L0' },
    ];
    const r = say('make room 003 a bedroom', ctx(rooms));
    expect(r.kind === 'commands' && r.commands[0]!.payload['name']).toBe('Bedroom 01');
  });

  it('is deterministic — the same ask plans the same commands every time', () => {
    const a = say('make rooms 002 and 003 bedrooms');
    const b = say('make rooms 002 and 003 bedrooms');
    expect(a).toEqual(b);
  });
});

describe('§L-905 — authored names are protected AND disclosed (C81 §2.2)', () => {
  it('"make room 005 a bedroom" keeps "Studio" and says so', () => {
    const r = say('make room 005 a bedroom');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(1);
    // NOT a rename — the plain occupancy verb, exactly as before L-905.
    expect(r.commands[0]!.type).toBe('room.setOccupancy');
    expect(r.commands[0]!.payload).toEqual({ roomId: 'r-e', occupancy: 'bedroom' });
    expect(r.summary).toContain('kept your name "Studio" for room 00-005');
  });
});

describe('§L-905 — no rename without a defensible label', () => {
  it('unclassified never mints a label ("set room 003 to unassigned")', () => {
    const r = say('set room 003 to unassigned');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.type).toBe('room.setOccupancy');
    expect(r.commands[0]!.payload).toEqual({ roomId: 'r-c', occupancy: 'unclassified' });
    expect(r.summary).not.toContain('renamed');
  });

  it('an occupancy OUTSIDE the vocabulary plans no rename (plan-level pin)', () => {
    // The value stage refuses "wine cellar" before any plan runs; this pins the
    // plan itself so the invariant holds even if a caller bypasses the stage.
    const plan = planRoomOccupancyFanOut(['r-c'], 'wine-cellar', ROOMS);
    expect(plan.commands).toEqual([
      { type: 'room.setOccupancy', payload: { roomId: 'r-c', occupancy: 'wine-cellar' } },
    ]);
    expect(plan.notes).toEqual([]);
  });

  it('with NO rooms snapshot the capability degrades to occupancy-only (pre-L-905 shape)', () => {
    const r = say('make room 003 a bedroom', ctx(ROOMS, { rooms: undefined }));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.type).toBe('room.setOccupancy');
    expect(r.commands[0]!.payload).toEqual({ roomId: 'r-c', occupancy: 'bedroom' });
    expect(r.summary).not.toContain('renamed');
  });

  it('a resolved id missing from the snapshot is occupancy-only, no claim made', () => {
    const plan = planRoomOccupancyFanOut(['ghost'], 'bedroom', ROOMS);
    expect(plan.commands).toEqual([
      { type: 'room.setOccupancy', payload: { roomId: 'ghost', occupancy: 'bedroom' } },
    ]);
    expect(plan.notes).toEqual([]);
  });
});

describe('§L-905 — numbering primitives', () => {
  it('fills the smallest free index and zero-pads to two digits', () => {
    expect(nextAutoLabelIndex('Bedroom', [])).toBe(1);
    expect(nextAutoLabelIndex('Bedroom', ['Bedroom 01', 'Bedroom 02'])).toBe(3);
    // A hole is filled — deterministic, and existing rooms keep their numbers.
    expect(nextAutoLabelIndex('Bedroom', ['Bedroom 01', 'Bedroom 03'])).toBe(2);
    // Other labels and non-matching names do not count.
    expect(nextAutoLabelIndex('Bedroom', ['Bathroom 01', 'Bedroom X', 'Room 00-001'])).toBe(1);
    // Unpadded human-typed "Bedroom 1" still counts as index 1.
    expect(nextAutoLabelIndex('Bedroom', ['Bedroom 1'])).toBe(2);
  });
});
