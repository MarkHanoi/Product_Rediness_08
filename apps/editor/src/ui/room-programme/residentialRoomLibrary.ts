/**
 * residentialRoomLibrary — the §8 RESIDENTIAL SPACE LIBRARY, and the declared mapping
 * between it and the room vocabularies this repo already ships.
 *
 * Layer Affected:  UI — room programme (L7). PURE: no DOM, no THREE, no store, no clock.
 * File:            apps/editor/src/ui/room-programme/residentialRoomLibrary.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §8 (the library, verbatim) · §25.5
 * Plan:            RESI-ORCHESTRATOR-PLAN §1 (§8 row: *"EXISTS — three times over,
 *                  unreconciled … A mapping layer between the three. This is the
 *                  reconciliation cost of §8"*) · §4 Stage F
 * Contracts:       C114 (space envelope `occupancy` is the room-topology spelling) ·
 *                  C84 EI-8a (a licensed copy is pinned by a TEST, never by a comment) ·
 *                  C58 / C57 §1.9 (a number carries where it came from)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SIXTEEN ARE THE FOUNDER'S OWN LIST, IN HIS OWN ORDER
 * ─────────────────────────────────────────────────────────────────────────────
 * STR §8: *"living · kitchen · dining · bedroom · ensuite · bathroom · WC · hall ·
 * corridor · studio · office · laundry · storage · stair · garage · other"*. That is
 * the roster below, unedited and unreordered. It is deliberately NOT
 * `RoomOccupancyType` (≈55 members spanning hospitals, warehouses and lecture halls)
 * and deliberately NOT `RoomType` (the generator's 19, which has no `office`, no
 * `laundry`, no `garage` and no `studio` — the plan measured that, and it is why the
 * generator's vocabulary cannot BE this library).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE MAPPING IS A DECLARED TABLE WITH AN EXPLICIT "NO MAPPING" ARM
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan §4 Stage F is explicit that this *"must be a declared, tested table with an
 * explicit 'no mapping' arm, never a name-similarity heuristic"*. So:
 *
 *  · every row states its `RoomOccupancyType` **and why that one**, and
 *  · `studio` states that the union has NO member for it and takes the consequence
 *    (`unclassified`, the same grey `RoomColourSystem` gives an untagged room) rather
 *    than being bent into `breakout` or `private-office` because the words rhyme.
 *
 * A silent near-match here would reach the user as a WRONG COLOUR on a 3-D volume and
 * a wrong department in every downstream census, and nothing would say so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ MEASURED: THE PRESET STORE SUPPLIES 6 OF THE 16 TARGET AREAS, NOT 16
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder's standing estimate is *"most of the engine already exists"*, and the
 * lane brief asks that it be TESTED per row rather than assumed. Tested here:
 * `RoomSystemTypeStore.BUILT_IN_TYPES` has 31 presets, of which **9 are residential**.
 * Six of them carry a `targetArea` this library can use AS IT STANDS —
 * `rt-living-room`, `rt-kitchen`, `rt-bedroom-double`, `rt-bathroom`, `rt-wc`,
 * `rt-utility` — plus `rt-corridor`'s `minArea`. Those rows cite the preset id, and
 * `__tests__/roomProgrammeLibrary.spec.ts` reads the number back out of the store and
 * fails if the two ever drift (C84 EI-8a).
 *
 * The other ten are `pryzm-default` and SAY SO, each with the reason the preset was
 * not used. Two of those reasons matter, because they are the shape of the whole
 * reconciliation problem: `rt-entrance-lobby` (15 m²) and `rt-private-office` (15 m²)
 * exist and are the nearest presets to `hall` and `office` — but they are sized for a
 * COMMERCIAL lobby and a COMMERCIAL private office. Citing them would have produced a
 * house whose entrance hall is bigger than its kitchen, with a citation attached.
 *
 * ⚠ AND WHAT IS NOT HERE, NAMED RATHER THAN LEFT SILENT: the jurisdictional
 * habitability minima (`ES_MALAGA_PGOU_2018`, `ES_CATALUNYA_DECRET_141_2012`,
 * `GB_ENG_NDSS_2015`) live in `@pryzm/ai-host`, which `apps/editor` does not depend on.
 * `minAreaM2` below is therefore a PRYZM default and is not a legal minimum for
 * anywhere; it is a sanity floor for the panel's own refusal. The third vocabulary the
 * plan names — the generator's `RoomType` — is for the same reason NOT copied into this
 * table: a copy no test can pin against its source is the defect C84 EI-8a exists to
 * prevent, and this file will not ship one.
 */

import {
  OCCUPANCY_PALETTE,
  UNCLASSIFIED_FILL,
  type ProgrammeRoomSpec,
  type RoomOccupancyType,
  type RoomProgrammeTemplate,
} from '@pryzm/room-topology';

// ─────────────────────────────────────────────────────────────────────────────
// THE ROSTER
// ─────────────────────────────────────────────────────────────────────────────

/** STR §8's list, verbatim and in the founder's order. A closed union. */
export const RESIDENTIAL_ROOM_KINDS = [
  'living',
  'kitchen',
  'dining',
  'bedroom',
  'ensuite',
  'bathroom',
  'wc',
  'hall',
  'corridor',
  'studio',
  'office',
  'laundry',
  'storage',
  'stair',
  'garage',
  'other',
] as const;

export type ResidentialRoomKind = (typeof RESIDENTIAL_ROOM_KINDS)[number];

/**
 * How this library row joins `RoomOccupancyType`. Two arms, and the second is the
 * point: a room the shipped union genuinely cannot name says so.
 */
export type RoomOccupancyMapping =
  | {
      readonly kind: 'mapped';
      readonly occupancy: RoomOccupancyType;
      /** Why THIS member. Read by the panel's tooltip; never a restatement of the name. */
      readonly why: string;
    }
  | {
      readonly kind: 'no-mapping';
      /** What the union lacks, and what the consequence is. */
      readonly why: string;
    };

/** Where a target area came from. C57 §1.9 — a number travels with its attribution. */
export type TargetAreaSource =
  | { readonly kind: 'preset'; readonly presetId: string }
  | { readonly kind: 'pryzm-default'; readonly why: string };

export interface ResidentialRoomLibraryEntry {
  readonly kind: ResidentialRoomKind;
  /** The chip's label. Title case, house language — "WC", not "wc-residential". */
  readonly label: string;
  readonly mapping: RoomOccupancyMapping;
  /** Default target area when this room is dragged in, m². Editable afterwards. */
  readonly targetAreaM2: number;
  /** Sanity floor for the panel's refusal. ⛔ NOT a habitability minimum — see header. */
  readonly minAreaM2: number;
  readonly targetAreaSource: TargetAreaSource;
  /** Circulation rooms are the ones the graph tends to hub around. */
  readonly circulation: boolean;
}

/**
 * ⭐ THE TABLE. One row per §8 member, every number attributed, every mapping argued.
 */
export const RESIDENTIAL_ROOM_LIBRARY: readonly ResidentialRoomLibraryEntry[] = [
  {
    kind: 'living',
    label: 'Living',
    mapping: { kind: 'mapped', occupancy: 'living-room', why: 'Exact member.' },
    targetAreaM2: 25,
    minAreaM2: 10,
    targetAreaSource: { kind: 'preset', presetId: 'rt-living-room' },
    circulation: false,
  },
  {
    kind: 'kitchen',
    label: 'Kitchen',
    mapping: { kind: 'mapped', occupancy: 'kitchen', why: 'Exact member.' },
    targetAreaM2: 12,
    minAreaM2: 5,
    targetAreaSource: { kind: 'preset', presetId: 'rt-kitchen' },
    circulation: false,
  },
  {
    kind: 'dining',
    label: 'Dining',
    mapping: { kind: 'mapped', occupancy: 'dining-room', why: 'Exact member.' },
    targetAreaM2: 12,
    minAreaM2: 6,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: 'No preset carries occupancy `dining-room`; the nearest, `rt-kitchen-diner`, is a '
        + 'COMBINED room (20 m²) and would double-count the kitchen if used for a separate one.',
    },
    circulation: false,
  },
  {
    kind: 'bedroom',
    label: 'Bedroom',
    mapping: { kind: 'mapped', occupancy: 'bedroom', why: 'Exact member.' },
    targetAreaM2: 12,
    minAreaM2: 7,
    targetAreaSource: { kind: 'preset', presetId: 'rt-bedroom-double' },
    circulation: false,
  },
  {
    kind: 'ensuite',
    label: 'Ensuite',
    mapping: {
      kind: 'mapped',
      occupancy: 'bathroom',
      why: 'An ensuite IS a bathroom. What makes it "ensuite" is its ADJACENCY to one bedroom, '
        + 'and adjacency is what the relationship graph records — so it is not duplicated as an '
        + 'occupancy member here.',
    },
    targetAreaM2: 4,
    minAreaM2: 2.5,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: '`rt-bathroom` (5 m²) is the family bathroom preset. An ensuite is smaller, and '
        + 'citing a preset while changing its number would be a citation to a value nobody set.',
    },
    circulation: false,
  },
  {
    kind: 'bathroom',
    label: 'Bathroom',
    mapping: { kind: 'mapped', occupancy: 'bathroom', why: 'Exact member.' },
    targetAreaM2: 5,
    minAreaM2: 3,
    targetAreaSource: { kind: 'preset', presetId: 'rt-bathroom' },
    circulation: false,
  },
  {
    kind: 'wc',
    label: 'WC',
    mapping: { kind: 'mapped', occupancy: 'wc', why: 'Exact member.' },
    targetAreaM2: 2,
    minAreaM2: 1.2,
    targetAreaSource: { kind: 'preset', presetId: 'rt-wc' },
    circulation: false,
  },
  {
    kind: 'hall',
    label: 'Hall',
    mapping: {
      kind: 'mapped',
      occupancy: 'entrance-lobby',
      why: 'The entrance hall of a house is the residential reading of `entrance-lobby`; the '
        + 'union has no house-specific member and inventing one is a schema change, not a '
        + 'library row.',
    },
    targetAreaM2: 6,
    minAreaM2: 2,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: '`rt-entrance-lobby` exists at 15 m² and is sized for a COMMERCIAL lobby. Citing it '
        + 'would give a house an entrance hall larger than its kitchen, with a citation attached.',
    },
    circulation: true,
  },
  {
    kind: 'corridor',
    label: 'Corridor',
    mapping: { kind: 'mapped', occupancy: 'corridor', why: 'Exact member.' },
    targetAreaM2: 6,
    // ⭐ FROM `rt-corridor`.defaults.minArea — the one preset MINIMUM this library reuses.
    minAreaM2: 1.2,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: '`rt-corridor` declares a `minArea` (1.2 m², reused as `minAreaM2`) but no '
        + '`targetArea` — a corridor is sized by what it connects, not by a brief.',
    },
    circulation: true,
  },
  {
    kind: 'studio',
    label: 'Studio',
    mapping: {
      kind: 'no-mapping',
      why: '`RoomOccupancyType` has NO member for a residential studio / atelier. It is not '
        + '`breakout` (commercial amenity) and not `private-office` (a workplace). The honest '
        + 'consequence is that a studio envelope renders in the UNCLASSIFIED grey rather than '
        + 'borrowing a colour that would assert a classification nothing established.',
    },
    targetAreaM2: 16,
    minAreaM2: 8,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: 'No preset and no occupancy member — there is nothing to cite.',
    },
    circulation: false,
  },
  {
    kind: 'office',
    label: 'Office',
    mapping: {
      kind: 'mapped',
      occupancy: 'private-office',
      why: 'A home study is a single-occupant work room, which is what `private-office` names. '
        + 'Its AREA is not borrowed with it — see the source below.',
    },
    targetAreaM2: 10,
    minAreaM2: 5,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: '`rt-private-office` is 15 m² at a 2.7 m ceiling — a commercial cellular office. A '
        + 'home study is smaller and sits under a residential ceiling.',
    },
    circulation: false,
  },
  {
    kind: 'laundry',
    label: 'Laundry',
    mapping: {
      kind: 'mapped',
      occupancy: 'utility-room',
      why: 'The union names the room by its function (`utility-room`); "laundry" is the house '
        + 'word for the same room.',
    },
    targetAreaM2: 4,
    minAreaM2: 2,
    targetAreaSource: { kind: 'preset', presetId: 'rt-utility' },
    circulation: false,
  },
  {
    kind: 'storage',
    label: 'Storage',
    mapping: {
      kind: 'mapped',
      occupancy: 'storage-residential',
      why: 'Exact member — the union already separates residential storage from `stockroom`.',
    },
    targetAreaM2: 3,
    minAreaM2: 1,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: 'No preset carries `storage-residential`.',
    },
    circulation: false,
  },
  {
    kind: 'stair',
    label: 'Stair',
    mapping: { kind: 'mapped', occupancy: 'stairwell', why: 'Exact member.' },
    targetAreaM2: 5,
    minAreaM2: 3,
    targetAreaSource: {
      kind: 'pryzm-default',
      why: '`rt-stairwell` exists but declares NO defaults at all (`{}`) — there is no number '
        + 'in it to cite.',
    },
    circulation: true,
  },
  {
    kind: 'garage',
    label: 'Garage',
    mapping: { kind: 'mapped', occupancy: 'garage', why: 'Exact member.' },
    targetAreaM2: 18,
    minAreaM2: 12,
    targetAreaSource: { kind: 'pryzm-default', why: 'No preset carries `garage`.' },
    circulation: false,
  },
  {
    kind: 'other',
    label: 'Other',
    mapping: {
      kind: 'mapped',
      occupancy: 'unclassified',
      why: 'The union\'s own default. "Other" is a room the user has not classified yet, and '
        + '`unclassified` is exactly that statement.',
    },
    targetAreaM2: 10,
    minAreaM2: 2,
    targetAreaSource: { kind: 'pryzm-default', why: 'An unclassified room has no brief to cite.' },
    circulation: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// READERS
// ─────────────────────────────────────────────────────────────────────────────

const BY_KIND: ReadonlyMap<ResidentialRoomKind, ResidentialRoomLibraryEntry> = new Map(
  RESIDENTIAL_ROOM_LIBRARY.map((e) => [e.kind, e]),
);

/** The library row for a kind. `undefined` for a string that is not a kind. */
export function residentialRoomEntry(
  kind: string,
): ResidentialRoomLibraryEntry | undefined {
  return BY_KIND.get(kind as ResidentialRoomKind);
}

/** Whether `v` is one of the sixteen. Narrowing guard for values off the DOM. */
export function isResidentialRoomKind(v: unknown): v is ResidentialRoomKind {
  return typeof v === 'string' && BY_KIND.has(v as ResidentialRoomKind);
}

/**
 * The value that goes into `SpaceEnvelope.occupancy` — the room-topology spelling, or
 * `undefined` for the no-mapping arm.
 *
 * ⭐ `undefined`, NOT `'unclassified'`, for the no-mapping arm. C114's schema makes the
 * field optional, and `resolveSpaceEnvelopeAppearance` already gives an untagged room
 * `UNCLASSIFIED_FILL` with `colourSource: 'unclassified'`. Writing the string would
 * make the record claim a classification was performed; leaving it absent says none was.
 */
export function occupancyTagFor(kind: ResidentialRoomKind): RoomOccupancyType | undefined {
  const e = BY_KIND.get(kind);
  if (!e) return undefined;
  return e.mapping.kind === 'mapped' ? e.mapping.occupancy : undefined;
}

/**
 * The colour the panel's chip, legend and plan preview draw with.
 *
 * ⭐ IT IS `OCCUPANCY_PALETTE`, READ AT CALL TIME, AND THAT IS THE WHOLE POINT: the
 * 3-D prism is coloured by `resolveSpaceEnvelopeAppearance`, which reads the SAME
 * palette by the SAME key. The legend and the volume therefore cannot disagree,
 * because there is one table and this function does not copy it (C84 EI-8a).
 */
export function libraryColourFor(kind: ResidentialRoomKind): string {
  const tag = occupancyTagFor(kind);
  if (!tag) return UNCLASSIFIED_FILL;
  return (OCCUPANCY_PALETTE as Record<string, string | undefined>)[tag] ?? UNCLASSIFIED_FILL;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DEFAULT BRIEF — and the DEAD TYPE it finally uses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * STR §8's worked example: *"Example ground floor: living, open kitchen, ensuite
 * bedroom, bathroom, staircase."* Rendered as a `RoomProgrammeTemplate`.
 *
 * ⭐ `RoomProgrammeTemplate` / `ProgrammeRoomSpec` ARE THE PLAN'S NAMED DEAD TYPES.
 * RESI-ORCHESTRATOR-PLAN §1 (§8 row) measures them **EXISTS-BUT-UNWIRED**, *"Zero
 * consumers repo-wide … an empty shell shaped exactly like §8"*. This is the first
 * consumer. Nothing about their shape needed changing, which is the finding: the
 * declaration was right and only the wiring was missing.
 *
 * `adjacencies` carries DISPLAY NAMES, matching the field's existing `string[]` shape
 * and the name-keyed convention `activeRoomAdjacencyOverrides` already uses.
 */
export function defaultResidentialGroundFloorTemplate(): RoomProgrammeTemplate {
  const rooms: ProgrammeRoomSpec[] = [
    spec('hall', 'Hall', ['Living', 'Stair']),
    spec('living', 'Living', ['Hall', 'Kitchen']),
    spec('kitchen', 'Kitchen', ['Living']),
    spec('bedroom', 'Bedroom', ['Ensuite', 'Hall']),
    spec('ensuite', 'Ensuite', ['Bedroom']),
    spec('bathroom', 'Bathroom', ['Hall']),
    spec('stair', 'Stair', ['Hall']),
  ];
  return {
    id: 'pryzm-residential-ground-floor',
    name: 'Residential ground floor',
    typology: 'residential',
    description:
      "STR §8's worked example — living, open kitchen, ensuite bedroom, bathroom, staircase — "
      + 'with the §9 relationships (Entrance→Hall, Hall→Living, Living→Kitchen, '
      + 'Bedroom→Ensuite) already plugged in. Every room and every relationship is editable.',
    rooms,
    totalArea: rooms.reduce((s, r) => s + r.targetArea * (r.quantity ?? 1), 0),
    notes:
      'Target areas are PRYZM defaults or preset citations — see `residentialRoomLibrary.ts`. '
      + 'None of them is a jurisdictional habitability minimum.',
  };
}

function spec(
  kind: ResidentialRoomKind,
  name: string,
  adjacencies: readonly string[],
): ProgrammeRoomSpec {
  const e = BY_KIND.get(kind)!;
  const occ = e.mapping.kind === 'mapped' ? e.mapping.occupancy : 'unclassified';
  return {
    occupancyType: occ,
    name,
    targetArea: e.targetAreaM2,
    minArea: e.minAreaM2,
    quantity: 1,
    adjacencies: [...adjacencies],
    mustBeOnLevel: 'ground',
  };
}
