// §FEAT-CHAT-ROOM-OCCUPANCY — the founder's sentence, driven end to end through
// the REAL chat path (grammar → SemanticIntent → applySemanticIntent → bus
// commands), not through a hand-built intent.
//
// The founder asked: "if i want to go to the RAC and say i want a bathroom in
// the room 001, a bedroom in room 002 and 003 and a living room — can that be
// done?" Each `it` below is one clause of that question, plus the two refusals
// that keep it honest.

import { describe, it, expect } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';
import {
  resolveOccupancyRef,
  CANONICAL_OCCUPANCIES,
  allOccupancyNames,
} from '../src/intents/roomOccupancyRef.js';

// The founder's project, as their Room Schedule screenshot shows it — INCLUDING
// the duplicate name defect: 00-001 and 00-004 are different rooms (85.73 m²
// and 61.32 m²) that share the name "Room 00-001".
const ROOMS = [
  { id: 'r-a', roomNumber: '00-001', name: 'Room 00-001' },
  { id: 'r-b', roomNumber: '00-002', name: 'Room 00-002' },
  { id: 'r-c', roomNumber: '00-003', name: 'Room 00-003' },
  { id: 'r-d', roomNumber: '00-004', name: 'Room 00-001' },
];

/** A stand-in for the editor's injected resolver, matching by NUMBER the way
 *  ZeroTokenChatBridge's room arm does (tiered: exact → trailing segment). */
function makeRoomScopeResolver(): (s: ScopeDescriptor) => ScopeResult {
  return (scope: ScopeDescriptor): ScopeResult => {
    if (scope.kind !== 'room') return { error: 'only the room scope is stubbed here' };
    const refs = scope.roomRef.split(/\s*(?:,|\band\b|&)\s*/i).map((p) => p.trim()).filter(Boolean);
    const hits: typeof ROOMS = [];
    for (const ref of refs) {
      const key = ref.replace(/^rooms?\s+/i, '').toLowerCase();
      const exact = ROOMS.filter((r) => r.roomNumber.toLowerCase() === key);
      const tail = ROOMS.filter((r) => r.roomNumber.split('-').pop() === key);
      const found = exact.length > 0 ? exact : tail;
      if (found.length === 0) {
        return {
          error:
            `I can't find a room "${ref}". The rooms here are: ` +
            `${ROOMS.map((r) => `${r.roomNumber} (${r.name})`).join(', ')}.`,
        };
      }
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

function ctx(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [{ id: 'L0', name: 'Level 0' }],
    activeLevelId: 'L0',
    mintId: () => 'generated-id',
    resolveScope: makeRoomScopeResolver(),
    ...overrides,
  } as ResolverContext;
}

/** Drive the REAL grammar, exactly as the chat panel does. */
function say(utterance: string, c: ResolverContext = ctx()) {
  const resolution = resolveUtterance(utterance.toLowerCase().trim(), c);
  expect(resolution, `the grammar did not claim "${utterance}"`).not.toEqual({ kind: 'miss' });
  return resolution as Exclude<typeof resolution, { kind: 'miss' }>;
}

describe('§FEAT-CHAT-ROOM-OCCUPANCY — the vocabulary is the store\'s own', () => {
  it('is read off the canonical enum, not retyped (no second source of truth)', () => {
    // If this ever drifts, the chat would accept words RoomStore.update rejects.
    expect(CANONICAL_OCCUPANCIES.length).toBeGreaterThan(40);
    expect(CANONICAL_OCCUPANCIES).toContain('bathroom');
    expect(CANONICAL_OCCUPANCIES).toContain('bedroom');
    expect(CANONICAL_OCCUPANCIES).toContain('living-room');
    expect(CANONICAL_OCCUPANCIES).toContain('kitchen');
    expect(CANONICAL_OCCUPANCIES).toContain('unclassified');
  });

  it('resolves the four words the founder named, however they are spoken', () => {
    expect(resolveOccupancyRef('bathroom')).toBe('bathroom');
    expect(resolveOccupancyRef('a bathroom')).toBe('bathroom');
    expect(resolveOccupancyRef('bedroom')).toBe('bedroom');
    expect(resolveOccupancyRef('living room')).toBe('living-room');
    expect(resolveOccupancyRef('living-room')).toBe('living-room');
    expect(resolveOccupancyRef('Living Room')).toBe('living-room');
    expect(resolveOccupancyRef('kitchen')).toBe('kitchen');
    // Synonyms reach the vocabulary; they never widen it.
    expect(resolveOccupancyRef('lounge')).toBe('living-room');
    expect(resolveOccupancyRef('toilet')).toBe('wc');
  });

  it('refuses an unknown word rather than guessing a member', () => {
    expect(resolveOccupancyRef('wine cellar')).toBeNull();
    expect(resolveOccupancyRef('')).toBeNull();
  });
});

describe('§FEAT-CHAT-ROOM-OCCUPANCY — the founder\'s sentence', () => {
  it('"make room 001 a bathroom" reaches room.setOccupancy on the RIGHT room', () => {
    const r = say('make room 001 a bathroom');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('room.setOccupancy');
    // 00-001, NOT 00-004 — the two share a name, so this is the duplicate-name
    // defect being survived by resolving on the unique NUMBER column.
    expect(r.commands[0]!.payload).toEqual({ roomId: 'r-a', occupancy: 'bathroom' });
    expect(r.summary.toLowerCase()).toContain('bathroom');
  });

  it('"i want a bathroom in room 001" — the founder\'s exact phrasing', () => {
    const r = say('i want a bathroom in room 001');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ roomId: 'r-a', occupancy: 'bathroom' });
  });

  it('"set room 002 to bedroom" and "room 003 is a living room"', () => {
    const a = say('set room 002 to bedroom');
    expect(a.kind === 'commands' && a.commands[0]!.payload).toEqual({
      roomId: 'r-b', occupancy: 'bedroom',
    });
    const b = say('room 003 is a living room');
    expect(b.kind === 'commands' && b.commands[0]!.payload).toEqual({
      roomId: 'r-c', occupancy: 'living-room',
    });
  });

  it('MULTIPLE rooms in one instruction fan out to one command per room', () => {
    const r = say('make rooms 002 and 003 bedrooms');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(2);
    expect(r.commands.map((c) => c.payload)).toEqual([
      { roomId: 'r-b', occupancy: 'bedroom' },
      { roomId: 'r-c', occupancy: 'bedroom' },
    ]);
    // Every command is the SAME registered verb — no parallel occupancy path.
    expect(new Set(r.commands.map((c) => c.type))).toEqual(new Set(['room.setOccupancy']));
  });

  it('works on the SELECTION too, with no room named', () => {
    const r = say('set the occupancy to kitchen', ctx({
      selection: [{ elementId: 'r-c', elementType: 'room' }],
    }));
    expect(r.kind === 'commands' && r.commands[0]!.payload).toEqual({
      roomId: 'r-c', occupancy: 'kitchen',
    });
  });
});

describe('§FEAT-CHAT-ROOM-OCCUPANCY — it refuses instead of guessing', () => {
  it('an UNRESOLVABLE room reference refuses and says which rooms it can see', () => {
    const r = say('make room 009 a bathroom');
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('009');
    // The rooms it CAN see, by their unique numbers.
    expect(r.reason).toContain('00-001');
    expect(r.reason).toContain('00-004');
  });

  it('an UNKNOWN room use refuses by listing real options, changing nothing', () => {
    const r = say('make room 001 a wine cellar');
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('wine cellar');
    expect(r.reason.toLowerCase()).toContain('bathroom');
    expect(r.reason).toContain(String(allOccupancyNames().length));
  });

  it('with NO scope resolver injected it refuses — it never widens to every room', () => {
    const si: SemanticIntent = {
      intent: 'set-room-occupancy',
      occupancyRef: 'bathroom',
      scope: { kind: 'room', roomRef: '001' },
    } as SemanticIntent;
    const r = applySemanticIntent(si, ctx({ resolveScope: undefined }));
    expect(r.kind).toBe('refusal');
  });

  it('an empty selection refuses with the how-to, not a silent no-op', () => {
    const r = say('set the occupancy to kitchen', ctx({ selection: [] }));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason.toLowerCase()).toContain('no room is selected');
  });

  it('does not steal sentences belonging to other grammars', () => {
    // The wall grammars run FIRST and must keep their utterances.
    const wall = resolveUtterance('make all walls white', ctx());
    expect(wall.kind === 'commands' && wall.commands[0]!.type).not.toBe('room.setOccupancy');
    // A dimension sentence on a selected room is not a room-use sentence.
    const dim = resolveUtterance('make this 3m tall', ctx({
      selection: [{ elementId: 'r-a', elementType: 'room' }],
    }));
    expect(dim.kind !== 'miss' && dim.kind === 'commands'
      ? dim.commands.every((c) => c.type !== 'room.setOccupancy')
      : true).toBe(true);
  });
});
