/**
 * §PROJECT-ROOMS-ARE-THE-PROGRAMME (L-13024) — the ROOM PROGRAMME panel must show the
 * rooms the PROJECT holds.
 *
 * Subject:   apps/editor/src/ui/room-programme/projectRoomsToProgramme.ts
 *            apps/editor/src/ui/room-programme/roomProgrammePanel.ts
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.5
 * Contracts: C83 §1.2 (a statement carries its numbers) · C19 §5.6
 *
 * THE REPORT. Founder: *"the room programme ALWAYS should have the rooms on the
 * project!"* His panel read `RELATIONSHIPS — 0 PLUGGED, 0 ROOMS`, `No rooms yet — drag
 * one in`, `PROGRAMME — 0 ROOMS, 0.0 M²`, and offered *"Start from the example ground
 * floor"* — while the same session's model held a generated house and the same
 * session's console printed `RoomDetectionEngine detected 1 room(s)`.
 *
 * ⛔ THE OTHER HALF OF THE BRIEF IS ASSERTED JUST AS HARD: an EMPTY project must still
 * read as empty. A panel that fabricates a programme out of nothing would be a worse
 * defect than the one being fixed, so "no rooms in, no rooms out" has its own arm.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  describeProjectRoomsImport,
  programmeFromProjectRooms,
  residentialKindForRoom,
  type ProjectRoomLike,
} from '../room-programme/projectRoomsToProgramme';
import {
  ROOM_PROGRAMME_LIST_TESTID,
  ROOM_PROGRAMME_LOAD_BTN_TESTID,
  ROOM_PROGRAMME_SEED_BTN_TESTID,
  mountRoomProgrammePanel,
  type RoomProgrammePanelDeps,
} from '../room-programme/roomProgrammePanel';
import { clearRoomProgramme, getRoomProgramme } from '../room-programme/roomProgrammeModel';

/** The founder's own plan, as room records: a generated house on level `L0`. */
const HOUSE_ROOMS: readonly ProjectRoomLike[] = [
  { id: 'r-1', name: 'Bedroom 1', levelId: 'L0', occupancyType: 'bedroom', computed: { area: 14.2 } },
  { id: 'r-2', name: 'Corridor', levelId: 'L0', occupancyType: 'corridor', computed: { area: 6.4 } },
  { id: 'r-3', name: 'Bathroom 1', levelId: 'L0', occupancyType: 'bathroom', computed: { area: 5.1 } },
  { id: 'r-4', name: 'Living Room', levelId: 'L0', occupancyType: 'living-room', computed: { area: 28.9 } },
  { id: 'r-5', name: 'En-suite', levelId: 'L0', occupancyType: 'bathroom', computed: { area: 3.8 } },
];

function deps(over: Partial<RoomProgrammePanelDeps> = {}): RoomProgrammePanelDeps {
  let n = 0;
  return {
    resolveRuntime: () => null,
    readSpaceEnvelopes: () => [],
    readActiveLevelId: () => 'L0',
    mintId: () => `mint-${(n += 1)}`,
    readProjectRooms: () => [],
    ...over,
  };
}

describe('§PROJECT-ROOMS-ARE-THE-PROGRAMME — the mapping', () => {
  it('classifies the generator\'s own room names', () => {
    expect(residentialKindForRoom({ name: 'Bedroom 1' })).toBe('bedroom');
    expect(residentialKindForRoom({ name: 'Master Bedroom' })).toBe('bedroom');
    expect(residentialKindForRoom({ name: 'En-suite' })).toBe('ensuite');
    expect(residentialKindForRoom({ name: 'Bathroom 2' })).toBe('bathroom');
    expect(residentialKindForRoom({ name: 'Entrance Hall' })).toBe('hall');
    expect(residentialKindForRoom({ name: 'Living Room' })).toBe('living');
    expect(residentialKindForRoom({ name: 'Corridor' })).toBe('corridor');
  });

  it('falls back to OCCUPANCY when the name says nothing, and to `other` when neither does', () => {
    // A renamed room keeps its occupancy, and that still classifies it.
    expect(residentialKindForRoom({ name: 'Grandma’s place', occupancyType: 'bedroom' })).toBe('bedroom');
    // ⭐ The ambiguous occupancy: `ensuite` and `bathroom` share `'bathroom'`. Without a
    // name the answer must be the ordinary one, not the en-suite.
    expect(residentialKindForRoom({ name: '', occupancyType: 'bathroom' })).toBe('bathroom');
    // Nothing to go on ⇒ imported as itself, never guessed.
    expect(residentialKindForRoom({ name: 'Zone 4' })).toBe('other');
    expect(residentialKindForRoom({})).toBe('other');
  });

  it('imports the house with each room\'s OWN id, name and measured area', () => {
    const imp = programmeFromProjectRooms(HOUSE_ROOMS, 'L0');
    expect(imp.imported).toBe(5);
    expect(imp.skipped).toBe(0);
    expect(imp.levelIds).toEqual(['L0']);
    expect(imp.programme.entries.map((e) => e.id)).toEqual(['r-1', 'r-2', 'r-3', 'r-4', 'r-5']);
    expect(imp.programme.entries.map((e) => e.name)).toEqual(
      ['Bedroom 1', 'Corridor', 'Bathroom 1', 'Living Room', 'En-suite']);
    expect(imp.programme.entries.map((e) => e.kind)).toEqual(
      ['bedroom', 'corridor', 'bathroom', 'living', 'ensuite']);
    expect(imp.programme.entries.map((e) => e.targetAreaM2)).toEqual([14.2, 6.4, 5.1, 28.9, 3.8]);
  });

  it('invents NO relationships — 0 plugged is the true reading, not a placeholder', () => {
    expect(programmeFromProjectRooms(HOUSE_ROOMS, 'L0').programme.links).toEqual([]);
  });

  it('is idempotent — loading twice cannot double a room', () => {
    const once = programmeFromProjectRooms(HOUSE_ROOMS, 'L0');
    const twice = programmeFromProjectRooms([...HOUSE_ROOMS, ...HOUSE_ROOMS], 'L0');
    expect(twice.programme.entries).toEqual(once.programme.entries);
    expect(twice.skipped).toBe(5);
  });

  it('filters to the active storey, and takes them all when no storey is named', () => {
    const twoLevels: ProjectRoomLike[] = [
      ...HOUSE_ROOMS,
      { id: 'u-1', name: 'Bedroom 2', levelId: 'L1', occupancyType: 'bedroom', computed: { area: 12 } },
    ];
    expect(programmeFromProjectRooms(twoLevels, 'L0').imported).toBe(5);
    expect(programmeFromProjectRooms(twoLevels, 'L1').imported).toBe(1);
    const all = programmeFromProjectRooms(twoLevels, null);
    expect(all.imported).toBe(6);
    expect(all.levelIds).toEqual(['L0', 'L1']);
  });

  it('⛔ an EMPTY project imports NOTHING and says so — no fabrication', () => {
    const imp = programmeFromProjectRooms([], 'L0');
    expect(imp.imported).toBe(0);
    expect(imp.programme.entries).toEqual([]);
    expect(describeProjectRoomsImport(imp, 'L0')).toContain('no rooms on the active storey');
  });

  it('never throws on a malformed record, and reports the skip with its number', () => {
    const junk = [
      null, undefined, 42, 'nope',
      { name: 'no id here', levelId: 'L0' },
      { id: 'ok-1', name: 'Kitchen', levelId: 'L0', computed: { area: 'bad' } },
    ] as unknown as ProjectRoomLike[];
    const imp = programmeFromProjectRooms(junk, 'L0');
    expect(imp.imported).toBe(1);
    // A record with no readable area falls back to the library default, never 0.
    expect(imp.programme.entries[0]!.targetAreaM2).toBeGreaterThan(0);
    expect(imp.skipped).toBeGreaterThanOrEqual(1);
    expect(describeProjectRoomsImport(imp, 'L0')).toContain('Loaded 1 room');
  });

  it('the statement carries BOTH numbers (C83 §1.2)', () => {
    const imp = programmeFromProjectRooms(HOUSE_ROOMS, 'L0');
    const said = describeProjectRoomsImport(imp, 'L0');
    expect(said).toContain('Loaded 5 rooms');
    expect(said).toContain('storey L0');
    expect(said).toContain('58.4 m²');
    expect(said).toContain('Relationships are not imported');
  });
});

describe('§PROJECT-ROOMS-ARE-THE-PROGRAMME — the panel', () => {
  beforeEach(() => { clearRoomProgramme(); });

  it('⭐ THE FOUNDER\'S DEFECT: a project WITH rooms no longer opens empty', () => {
    const host = document.createElement('div');
    const panel = mountRoomProgrammePanel(host, deps({ readProjectRooms: () => HOUSE_ROOMS }));
    try {
      expect(getRoomProgramme().entries).toHaveLength(5);
      const list = host.querySelector(`[data-testid="${ROOM_PROGRAMME_LIST_TESTID}"]`);
      expect(list?.textContent ?? '').toContain('Programme — 5 rooms');
      // … and the EXAMPLE is no longer what it offers.
      expect(host.querySelector(`[data-testid="${ROOM_PROGRAMME_SEED_BTN_TESTID}"]`)).toBeNull();
    } finally { panel.dispose(); }
  });

  it('⛔ a project with NO rooms still says "no rooms yet" — honestly', () => {
    const host = document.createElement('div');
    const panel = mountRoomProgrammePanel(host, deps({ readProjectRooms: () => [] }));
    try {
      expect(getRoomProgramme().entries).toHaveLength(0);
      const list = host.querySelector(`[data-testid="${ROOM_PROGRAMME_LIST_TESTID}"]`);
      expect(list?.textContent ?? '').toContain('Programme — 0 rooms');
      expect(list?.textContent ?? '').toContain('no rooms yet');
      // The example is still offered — for an empty project it is the right offer, and
      // it is the ONLY thing offered, because there is nothing to load.
      expect(host.querySelector(`[data-testid="${ROOM_PROGRAMME_SEED_BTN_TESTID}"]`)).not.toBeNull();
      expect(host.querySelector(`[data-testid="${ROOM_PROGRAMME_LOAD_BTN_TESTID}"]`)).toBeNull();
    } finally { panel.dispose(); }
  });

  it('a store that throws is survivable — the panel mounts and says nothing false', () => {
    const host = document.createElement('div');
    const panel = mountRoomProgrammePanel(host, deps({
      readProjectRooms: () => { throw new Error('store exploded'); },
    }));
    try {
      expect(getRoomProgramme().entries).toHaveLength(0);
      expect(host.querySelector(`[data-testid="${ROOM_PROGRAMME_LIST_TESTID}"]`)).not.toBeNull();
    } finally { panel.dispose(); }
  });

  it('offers an explicit RE-READ once a programme exists, so the load is never one-shot', () => {
    const host = document.createElement('div');
    const panel = mountRoomProgrammePanel(host, deps({ readProjectRooms: () => HOUSE_ROOMS }));
    try {
      const btn = host.querySelector(`[data-testid="${ROOM_PROGRAMME_LOAD_BTN_TESTID}"]`);
      expect(btn).not.toBeNull();
      expect(btn?.textContent ?? '').toContain('5 rooms');
    } finally { panel.dispose(); }
  });

  it('the automatic load NEVER overwrites a programme the user already has', () => {
    const host1 = document.createElement('div');
    const first = mountRoomProgrammePanel(host1, deps({ readProjectRooms: () => HOUSE_ROOMS }));
    first.dispose();
    // Simulate the user renaming a room, then re-opening the panel.
    const before = getRoomProgramme();
    expect(before.entries).toHaveLength(5);
    const host2 = document.createElement('div');
    const second = mountRoomProgrammePanel(host2, deps({
      readProjectRooms: () => [HOUSE_ROOMS[0]!],   // the project now reads as ONE room
    }));
    try {
      // The mount-time load is gated on an EMPTY programme, so the five survive.
      expect(getRoomProgramme().entries).toHaveLength(5);
    } finally { second.dispose(); }
  });
});
