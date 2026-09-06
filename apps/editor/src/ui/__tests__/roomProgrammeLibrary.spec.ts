/**
 * §ROOM-PROGRAMME — the residential room library and its DECLARED mapping.
 *
 * Subject:   apps/editor/src/ui/room-programme/residentialRoomLibrary.ts
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §8
 * Plan:      RESI-ORCHESTRATOR-PLAN §4 Stage F (*"a declared, tested table with an
 *            explicit 'no mapping' arm, never a name-similarity heuristic"*)
 * Contracts: C84 EI-8a — a licensed copy is pinned by a TEST, never by a comment.
 *
 * ⭐ THE LOAD-BEARING ARM IS `THE PRESET NUMBERS ARE READ BACK OUT OF THE STORE`.
 * The library states six target areas as coming from `RoomSystemTypeStore` presets. If
 * that is a comment rather than a check, the two drift and the library keeps citing a
 * number nobody set — which is the exact defect C84 EI-8a names. So this suite
 * instantiates the REAL store and compares.
 *
 * ⚠ It also asserts the NEGATIVE cases, because they are the ones a later "tidy-up"
 * would quietly break: `studio` must stay unmapped, and its colour must stay the
 * unclassified grey.
 */

import { describe, it, expect } from 'vitest';
import {
  OCCUPANCY_PALETTE,
  RoomSystemTypeStore,
  UNCLASSIFIED_FILL,
} from '@pryzm/room-topology';
import {
  RESIDENTIAL_ROOM_KINDS,
  RESIDENTIAL_ROOM_LIBRARY,
  defaultResidentialGroundFloorTemplate,
  isResidentialRoomKind,
  libraryColourFor,
  occupancyTagFor,
  residentialRoomEntry,
} from '../room-programme/residentialRoomLibrary';

describe('§ROOM-PROGRAMME — the library is STR §8, unedited', () => {
  it('carries the founder\'s sixteen, in his order', () => {
    expect([...RESIDENTIAL_ROOM_KINDS]).toEqual([
      'living', 'kitchen', 'dining', 'bedroom', 'ensuite', 'bathroom', 'wc', 'hall',
      'corridor', 'studio', 'office', 'laundry', 'storage', 'stair', 'garage', 'other',
    ]);
    expect(RESIDENTIAL_ROOM_LIBRARY).toHaveLength(16);
    expect(RESIDENTIAL_ROOM_LIBRARY.map((e) => e.kind)).toEqual([...RESIDENTIAL_ROOM_KINDS]);
  });

  it('names the four rooms the generator vocabulary does not have', () => {
    // The plan measures `RoomType` as missing office / laundry / garage / studio. This
    // library exists partly because of that, so the four must be present here.
    for (const k of ['office', 'laundry', 'garage', 'studio'] as const) {
      expect(isResidentialRoomKind(k)).toBe(true);
      expect(residentialRoomEntry(k)).toBeDefined();
    }
  });

  it('rejects a string that is not a kind', () => {
    expect(isResidentialRoomKind('conservatory')).toBe(false);
    expect(residentialRoomEntry('conservatory')).toBeUndefined();
  });
});

describe('§ROOM-PROGRAMME — the mapping is declared, and its numbers are pinned', () => {
  it('every MAPPED occupancy is a real RoomOccupancyType', () => {
    // `OCCUPANCY_PALETTE` is exhaustive over the union (`Record<RoomOccupancyType, string>`),
    // so a key that is present is a member and a key that is absent is not.
    for (const e of RESIDENTIAL_ROOM_LIBRARY) {
      if (e.mapping.kind !== 'mapped') continue;
      expect(
        Object.prototype.hasOwnProperty.call(OCCUPANCY_PALETTE, e.mapping.occupancy),
        `${e.kind} maps to '${e.mapping.occupancy}', which is not a RoomOccupancyType`,
      ).toBe(true);
    }
  });

  it('studio is the explicit NO-MAPPING arm, and takes the consequence', () => {
    const studio = residentialRoomEntry('studio')!;
    expect(studio.mapping.kind).toBe('no-mapping');
    expect(occupancyTagFor('studio')).toBeUndefined();
    // ⛔ Not a borrowed colour. The unclassified grey is the honest one.
    expect(libraryColourFor('studio')).toBe(UNCLASSIFIED_FILL);
  });

  it('every mapping states WHY, in more than a restatement of the name', () => {
    for (const e of RESIDENTIAL_ROOM_LIBRARY) {
      expect(e.mapping.why.length, `${e.kind} has no stated reason`).toBeGreaterThan(10);
    }
  });

  it('⭐ every PRESET-sourced target area is the store\'s own number', () => {
    const store = new RoomSystemTypeStore();
    const cited = RESIDENTIAL_ROOM_LIBRARY.filter((e) => e.targetAreaSource.kind === 'preset');
    // The library's own claim: six rows cite a preset. If that count changes, the header's
    // measured statement changed with it and must be re-read, not silently updated.
    expect(cited.map((e) => e.kind)).toEqual([
      'living', 'kitchen', 'bedroom', 'bathroom', 'wc', 'laundry',
    ]);
    for (const e of cited) {
      const presetId = (e.targetAreaSource as { presetId: string }).presetId;
      const preset = store.getById(presetId);
      expect(preset, `${e.kind} cites preset '${presetId}', which the store does not have`)
        .toBeDefined();
      expect(preset!.defaults.targetArea, `${e.kind} vs ${presetId}`).toBe(e.targetAreaM2);
    }
  });

  it('⭐ the corridor MINIMUM is the store\'s own number too', () => {
    const store = new RoomSystemTypeStore();
    expect(store.getById('rt-corridor')!.defaults.minArea)
      .toBe(residentialRoomEntry('corridor')!.minAreaM2);
  });

  it('a pryzm-default number says why the nearest preset was not used', () => {
    for (const e of RESIDENTIAL_ROOM_LIBRARY) {
      if (e.targetAreaSource.kind !== 'pryzm-default') continue;
      expect(e.targetAreaSource.why.length, `${e.kind} has an unexplained default`)
        .toBeGreaterThan(10);
    }
  });

  it('the two COMMERCIAL near-misses are deliberately not cited', () => {
    const store = new RoomSystemTypeStore();
    // Both presets exist and are the nearest match by occupancy — which is exactly why
    // a name-similarity mapping would have taken them.
    expect(store.getById('rt-entrance-lobby')!.defaults.targetArea).toBe(15);
    expect(store.getById('rt-private-office')!.defaults.targetArea).toBe(15);
    expect(residentialRoomEntry('hall')!.targetAreaM2).toBe(6);
    expect(residentialRoomEntry('office')!.targetAreaM2).toBe(10);
    expect(residentialRoomEntry('hall')!.targetAreaSource.kind).toBe('pryzm-default');
    expect(residentialRoomEntry('office')!.targetAreaSource.kind).toBe('pryzm-default');
  });
});

describe('§ROOM-PROGRAMME — the legend and the 3-D volume read ONE palette', () => {
  it('libraryColourFor is OCCUPANCY_PALETTE[tag], never a second table', () => {
    for (const e of RESIDENTIAL_ROOM_LIBRARY) {
      const tag = occupancyTagFor(e.kind);
      const expected = tag
        ? (OCCUPANCY_PALETTE as Record<string, string>)[tag]!
        : UNCLASSIFIED_FILL;
      expect(libraryColourFor(e.kind), e.kind).toBe(expected);
    }
  });

  it('the same key `resolveSpaceEnvelopeAppearance` uses is the key this emits', () => {
    // The renderer reads `OCCUPANCY_PALETTE[record.occupancy]`; `occupancyTagFor` is what
    // writes `record.occupancy`. Equal by construction only if this holds.
    expect(occupancyTagFor('bedroom')).toBe('bedroom');
    expect(occupancyTagFor('ensuite')).toBe('bathroom');
    expect(occupancyTagFor('laundry')).toBe('utility-room');
    expect(occupancyTagFor('hall')).toBe('entrance-lobby');
    expect(occupancyTagFor('stair')).toBe('stairwell');
  });
});

describe('§ROOM-PROGRAMME — the DEAD RoomProgrammeTemplate gets a consumer', () => {
  it('the default brief is STR §8\'s worked ground floor', () => {
    const t = defaultResidentialGroundFloorTemplate();
    expect(t.typology).toBe('residential');
    const names = t.rooms.map((r) => r.name);
    for (const n of ['Living', 'Kitchen', 'Bedroom', 'Ensuite', 'Bathroom', 'Stair']) {
      expect(names, `missing ${n}`).toContain(n);
    }
  });

  it('totalArea is the sum it claims to be', () => {
    const t = defaultResidentialGroundFloorTemplate();
    const sum = t.rooms.reduce((s, r) => s + r.targetArea * (r.quantity ?? 1), 0);
    expect(t.totalArea).toBeCloseTo(sum, 6);
  });

  it('the ensuite declares its adjacency to the bedroom — §9, as data', () => {
    const t = defaultResidentialGroundFloorTemplate();
    expect(t.rooms.find((r) => r.name === 'Ensuite')!.adjacencies).toContain('Bedroom');
    expect(t.rooms.find((r) => r.name === 'Living')!.adjacencies).toContain('Kitchen');
  });
});
