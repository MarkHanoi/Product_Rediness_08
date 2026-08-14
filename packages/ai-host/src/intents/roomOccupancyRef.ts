// @pryzm/ai-host — room-occupancy reference resolution (§FEAT-CHAT-ROOM-OCCUPANCY).
// =============================================================================
//
// WHY THIS EXISTS. The founder asked, verbatim: "if i want to go to the RAC and
// say i want a bathroom in the room 001, a bedroom in room 002 and 003 and a
// living room — can that be done?" Everything needed to answer YES already
// existed EXCEPT the words-to-enum step and the chat registration:
//
//   · the verb  — `room.setOccupancy` (plugins/rooms/src/handlers/SetRoomOccupancy.ts
//     → SetRoomOccupancyCommand, LIVE, with a row in API-VERB-REGISTER);
//   · the value — `RoomOccupancyType`, a CLOSED 51-member enum that already
//     contains bathroom / bedroom / living-room / kitchen;
//   · the target — the U3 room spatial scope, already injected by the editor.
//
// ── THE VOCABULARY IS NOT RETYPED HERE ──────────────────────────────────────
//
// `CANONICAL_OCCUPANCIES` is read off `RoomOccupancyTypeSchema.options` — the
// Zod enum that RoomStore.update() itself validates against. A hand-copied list
// would be a second source of truth for the vocabulary, which is the exact
// defect ChatCapabilityRegistry's header calls "a capability table that lies":
// the chat would accept a word the store then rejects, or refuse one it would
// have taken. Reading the schema makes that class of drift unrepresentable —
// add a member to the enum and the chat can speak it the same day.
//
// What IS written by hand is `SYNONYMS`: spoken English that is NOT an enum
// member ("living room" for `living-room` is mechanical, but "lounge",
// "toilet", "master bedroom" are not). Every entry maps to a member proved to
// exist at module load; an entry pointing at a non-member is dropped rather
// than shipped, so this table can never widen the vocabulary — only reach it.
//
// PURITY: no DOM, no stores, no I/O — a table plus string normalisation, the
// same shape as colorRef.ts / finishRef.ts. `zod` and the schema import are
// type+value only.

import { RoomOccupancyTypeSchema } from '@pryzm/room-topology';

/** The canonical vocabulary, straight off the Zod enum RoomStore validates
 *  against. NEVER a hand-written copy — see the header. */
export const CANONICAL_OCCUPANCIES: readonly string[] = RoomOccupancyTypeSchema.options;

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_OCCUPANCIES);

/**
 * The occupancy a room carries when nobody has said what it is. This is the
 * value the founder's Room Schedule screenshot showed in every row, and it is
 * a REAL enum member (not a null), which is why "unclassified" round-trips.
 */
export const UNCLASSIFIED_OCCUPANCY = 'unclassified';

/**
 * Spoken English that is not itself an enum member. Keys are already
 * normalised (lower-case, single-spaced, hyphens → spaces); values MUST be
 * canonical members — non-members are dropped at load, never shipped.
 */
const RAW_SYNONYMS: Readonly<Record<string, string>> = {
  // Residential — the founder's four, plus the words people actually say.
  'living': 'living-room',
  'lounge': 'living-room',
  'sitting room': 'living-room',
  'front room': 'living-room',
  'family room': 'living-room',
  'bath': 'bathroom',
  'bathrooom': 'bathroom',
  'ensuite': 'bathroom',
  'en suite': 'bathroom',
  'en-suite': 'bathroom',
  'shower': 'shower-room',
  'master bedroom': 'bedroom',
  'main bedroom': 'bedroom',
  'guest bedroom': 'bedroom',
  'guest room': 'bedroom',
  'bed room': 'bedroom',
  'double bedroom': 'bedroom',
  'single bedroom': 'bedroom',
  'kitchenette': 'kitchen',
  'galley': 'kitchen',
  'shared kitchen': 'kitchen-shared',
  'dining': 'dining-room',
  'diner': 'dining-room',
  'utility': 'utility-room',
  'laundry': 'utility-room',
  'toilet': 'wc',
  'loo': 'wc',
  'powder room': 'wc',
  'restroom': 'wc',
  'accessible toilet': 'accessible-wc',
  'disabled toilet': 'accessible-wc',
  'store': 'storage-residential',
  'storage': 'storage-residential',
  'store room': 'storage-residential',
  'closet': 'storage-residential',
  'pantry': 'storage-residential',
  'carport': 'garage',

  // Circulation — the words a plan review uses.
  'hall': 'corridor',
  'hallway': 'corridor',
  'passage': 'corridor',
  'landing': 'corridor',
  'stairs': 'stairwell',
  'stair': 'stairwell',
  'staircase': 'stairwell',
  'lift lobby': 'lift-lobby',
  'elevator lobby': 'lift-lobby',
  'entrance': 'entrance-lobby',
  'entrance hall': 'entrance-lobby',
  'lobby': 'entrance-lobby',
  'porch': 'entrance-lobby',
  'vestibule': 'foyer',

  // Workplace / other — kept short; the canonical members carry the rest.
  'office': 'private-office',
  'study': 'private-office',
  'home office': 'private-office',
  'open plan office': 'open-office',
  'openplan office': 'open-office',
  'meeting': 'meeting-room',
  'boardroom': 'meeting-room',
  'conference room': 'meeting-room',
  'server': 'server-room',
  'comms room': 'server-room',
  'plant': 'plant-room',
  'plant space': 'plant-room',
  'electrical': 'electrical-room',
  'switch room': 'electrical-room',
  'roof terrace': 'terrace',
  'patio': 'terrace',
  'deck': 'terrace',
  'gym': 'spa',
  'classroom space': 'classroom',
  'lab': 'laboratory',
  'unassigned': UNCLASSIFIED_OCCUPANCY,
  'unclassified room': UNCLASSIFIED_OCCUPANCY,
  'none': UNCLASSIFIED_OCCUPANCY,
  'nothing': UNCLASSIFIED_OCCUPANCY,
};

/** Synonyms proved against the canonical enum at load. A synonym whose target
 *  is not a real member is DROPPED — this table may reach the vocabulary, it
 *  may never widen it. */
const SYNONYMS: ReadonlyMap<string, string> = new Map(
  Object.entries(RAW_SYNONYMS).filter(([, target]) => CANONICAL_SET.has(target)),
);

/**
 * Normalise a spoken occupancy phrase: lower-case, strip a leading article,
 * collapse whitespace, and treat hyphens/underscores as spaces so that
 * "living room", "living-room" and "Living_Room" are one key.
 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/^(?:an?|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A canonical member, spoken ("living-room" → "living room"). */
export function speakOccupancy(occupancy: string): string {
  return occupancy.replace(/-/g, ' ');
}

/**
 * Resolve a spoken room use to a canonical `RoomOccupancyType`, or `null` when
 * the vocabulary does not contain it. NEVER guesses: an unrecognised word
 * returns null so the caller can refuse by LISTING real options
 * (§CONTEXT-DATA-HONESTY), which is the whole reason this returns a nullable
 * instead of a best-effort string.
 */
export function resolveOccupancyRef(ref: string): string | null {
  const key = normalize(ref);
  if (key.length === 0) return null;
  // 1. An exact canonical member, spoken with spaces or hyphens.
  const hyphenated = key.replace(/\s+/g, '-');
  if (CANONICAL_SET.has(hyphenated)) return hyphenated;
  // 2. A hand-mapped synonym.
  const synonym = SYNONYMS.get(key);
  if (synonym !== undefined) return synonym;
  // 3. The plural a user naturally speaks ("bedrooms" → bedroom).
  if (key.endsWith('s')) {
    const singular = key.slice(0, -1);
    const singularHyphenated = singular.replace(/\s+/g, '-');
    if (CANONICAL_SET.has(singularHyphenated)) return singularHyphenated;
    const synonymSingular = SYNONYMS.get(singular);
    if (synonymSingular !== undefined) return synonymSingular;
  }
  return null;
}

/** The words a refusal offers. Deliberately the residential head of the list —
 *  the founder's four first — because a 51-item dump is not a suggestion. */
export function exampleOccupancyNames(): readonly string[] {
  return ['bathroom', 'bedroom', 'living room', 'kitchen', 'dining room', 'office', 'corridor'];
}

/** Every canonical member, spoken. Used by the refusal's long form and by the
 *  tests that prove the chat and the store share one vocabulary. */
export function allOccupancyNames(): readonly string[] {
  return CANONICAL_OCCUPANCIES.map(speakOccupancy);
}
