/**
 * projectRoomsToProgramme — read the rooms the PROJECT already holds into the room
 * programme, so the panel shows the design that exists instead of an empty graph.
 *
 * Layer Affected:  UI — room programme (L7). PURE. No DOM, no THREE, no store handle,
 *                  no clock, no RNG — it takes room records and returns a programme.
 * File:            apps/editor/src/ui/room-programme/projectRoomsToProgramme.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.5
 * Contracts:       C114 (occupancy is the room-topology spelling) · C83 §1.2 (a refusal
 *                  carries its numbers) · C19 §5.6 (a panel HOSTS producers)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE DEFECT THIS CLOSES (L-13024)
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder: *"the room programme ALWAYS should have the rooms on the project!"* His
 * ROOM PROGRAMME panel read `RELATIONSHIPS — 0 PLUGGED, 0 ROOMS`, `No rooms yet — drag
 * one in`, `PROGRAMME — 0 ROOMS, 0.0 M²`, and offered *"Start from the example ground
 * floor"* — an EXAMPLE — while the same session's model held a generated house and the
 * same session's console printed `RoomDetectionEngine detected 1 room(s)` and
 * `RoomGraphService Built graph for level 'L0': 1 nodes`.
 *
 * ROOT CAUSE, and it is the repo's recurring shape rather than a subtle bug: the panel
 * read ONE source — `getRoomProgramme()`, the session brief, which starts empty — and
 * had no read of the project's rooms at all. The data existed; the surface did not look
 * at it. [[authored-but-unwired-is-the-bottleneck]] — audit REACHABILITY, not existence.
 *
 * ⛔ WHAT THIS MUST NOT DO. An EMPTY project must still say "no rooms yet", honestly.
 * This module NEVER invents a room: given no rooms it returns an empty programme, and
 * the panel then shows exactly what it shows today. The defect was only ever that a
 * NON-empty project read as empty.
 *
 * ⭐ IDS ARE THE ROOM'S OWN. `RoomProgrammeEntry.id` is minted by the caller and is
 * stable across renames — that is why it exists (`roomProgrammeModel.ts`). Seeding an
 * entry with the ROOM's id makes the join to the project exact and idempotent: loading
 * twice cannot produce two entries for one room, and a later pass can match a programme
 * entry back to the room it came from without going through a display name (the
 * `§ROOM-ADJACENCY-NAME-MISS` failure the model header calls out).
 */

import {
  RESIDENTIAL_ROOM_LIBRARY,
  type ResidentialRoomKind,
} from './residentialRoomLibrary';
import type { RoomProgramme, RoomProgrammeEntry } from './roomProgrammeModel';

/**
 * One project room, structurally. Deliberately NOT `RoomData` from
 * `@pryzm/room-topology`: every field this module reads is optional, because the record
 * arrives from a legacy `window.roomStore` whose shape this file must not assume, and a
 * structural type keeps `apps/editor` from importing a package type for four fields.
 * Anything missing degrades to a named default — never to a thrown read.
 */
export interface ProjectRoomLike {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly levelId?: unknown;
  /** The room-topology occupancy spelling, e.g. `'bedroom'`, `'living-room'`. */
  readonly occupancyType?: unknown;
  /** Derived metrics. `computed.area` is m² (RoomComputedMetrics). */
  readonly computed?: { readonly area?: unknown } | undefined;
  /** Some records carry a flat area instead; read as a fallback, never preferred. */
  readonly area?: unknown;
  /**
   * §26.6.4 (L-13046) — the room's DETECTED FOOTPRINT, `RoomBoundary` in `@pryzm/room-topology`
   * (`RoomTypes.ts:158-181`): `polygon` is a closed-by-implication CCW ring of `{ x, z }` in world
   * XZ metres, ≥ 3 vertices by schema.
   *
   * ⚠ DECLARED HERE ONLY SO A ROW CAN SAY WHETHER THERE IS A SHAPE TO POINT AT. This module still
   * reads nothing from it — the programme is about counts and areas — but `roomsPerLevelModel`
   * needs the VERTEX COUNT to decide, per room, between *"nothing has detected this room's outline
   * yet"* and *"an outline was recorded and it is not a polygon"*. Those are different facts and
   * the row prints a different sentence for each (§CONTEXT-DATA-HONESTY).
   *
   * ⛔ `unknown`, not a typed polygon: this interface's whole contract is that it assumes NOTHING
   * about a record that arrives from the legacy `window.roomStore`, and the one consumer counts
   * the array through `roomOutlineVertexCount`, which treats "no array" and "empty array" as
   * different answers.
   */
  readonly boundary?: { readonly polygon?: unknown } | undefined;
}

/** The smallest positive area an imported room may carry, m². Below this the record is
 *  not a room the user can reason about, and the library default is used instead. */
const MIN_IMPORTED_AREA_M2 = 0.5;

/**
 * occupancy → kind, derived FROM the library table rather than restated beside it, so a
 * new library row cannot fall out of sync with this map (C84 EI-9: one fact, one place).
 *
 * ⚠ TWO KINDS SHARE ONE OCCUPANCY — `ensuite` and `bathroom` both map to `'bathroom'`,
 * and `wc` is its own member. The tie-break is FIRST-WINS in library order, which would
 * pick `ensuite`; that is the wrong default (most bathrooms are not en-suites), so the
 * table below is built LAST-WINS and the library's `bathroom` row, which sits after
 * `ensuite`, takes it. An en-suite is still recovered by name, which runs first.
 */
const KIND_BY_OCCUPANCY: ReadonlyMap<string, ResidentialRoomKind> = (() => {
  const m = new Map<string, ResidentialRoomKind>();
  for (const e of RESIDENTIAL_ROOM_LIBRARY) {
    if (e.mapping.kind !== 'mapped') continue;
    m.set(e.mapping.occupancy, e.kind);
  }
  return m;
})();

/**
 * Reduce a display name (or a library label) to a comparable stem: lowercase, no digits,
 * no punctuation, single-spaced.
 *
 * ⭐ HYPHENS ARE REMOVED, NOT TURNED INTO SPACES, and that is the load-bearing line.
 * The library's label is `Ensuite`; the house executor's naming pass emits `En-suite`.
 * Turning the hyphen into a space gives "en suite", which matches neither — measured,
 * and it is why this function has a test of its own. Removing it gives "ensuite" on both
 * sides. The same normalisation runs over the LABELS, so the two are always compared in
 * the same alphabet.
 */
function nameStem(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-')     // unicode dashes → ASCII first
    .replace(/-/g, '')                     // then out entirely: "en-suite" → "ensuite"
    .replace(/[^a-z ]+/g, ' ')             // digits and remaining punctuation out
    .replace(/\s+/g, ' ')
    .trim();
}

/** label → kind, longest label first so a longer label wins over a shorter substring. */
const KIND_BY_LABEL: ReadonlyArray<readonly [string, ResidentialRoomKind]> =
  [...RESIDENTIAL_ROOM_LIBRARY]
    .map((e) => [nameStem(e.label), e.kind] as const)
    .filter(([label]) => label.length > 0)
    .sort((a, b) => b[0].length - a[0].length);

/**
 * Which library kind a project room is. NAME first, then OCCUPANCY, then `'other'`.
 *
 * Name runs first deliberately. The generator's own naming pass produces exactly the
 * library's vocabulary ("Master Bedroom", "En-suite", "Bathroom 1", "Entrance Hall"),
 * and it is the only signal that separates the two kinds sharing occupancy `'bathroom'`.
 * Occupancy is the fallback because it survives a user rename, and `'other'` is the
 * honest floor: a room PRYZM cannot classify is imported as itself, never guessed into
 * a kind it might not be.
 */
export function residentialKindForRoom(room: ProjectRoomLike): ResidentialRoomKind {
  const rawName = typeof room.name === 'string' ? room.name : '';
  const stem = nameStem(rawName);
  if (stem.length > 0) {
    for (const [label, kind] of KIND_BY_LABEL) {
      // `startsWith` handles "Bathroom 1"; `includes` handles "Master Bedroom".
      if (stem === label || stem.startsWith(`${label} `) || stem.endsWith(` ${label}`)) return kind;
    }
    for (const [label, kind] of KIND_BY_LABEL) {
      if (label.length >= 4 && stem.includes(label)) return kind;
    }
  }
  const occ = typeof room.occupancyType === 'string' ? room.occupancyType : '';
  return KIND_BY_OCCUPANCY.get(occ) ?? 'other';
}

/** The area to carry into the programme: the room's own measured area when it has one,
 *  else the library default for its kind. Never 0 — a 0 m² row is not a brief. */
function areaFor(room: ProjectRoomLike, kind: ResidentialRoomKind): number {
  const raw = room.computed?.area ?? room.area;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  if (n >= MIN_IMPORTED_AREA_M2) return Math.round(n * 10) / 10;
  return RESIDENTIAL_ROOM_LIBRARY.find((e) => e.kind === kind)?.targetAreaM2 ?? 10;
}

/** What a load produced — counts the panel states verbatim, per C83 §1.2. */
export interface ProjectRoomsImport {
  readonly programme: RoomProgramme;
  /** Records handed in. */
  readonly seen: number;
  /** Records that became a programme entry. */
  readonly imported: number;
  /** Records skipped for want of a usable id (the only reason a room is skipped). */
  readonly skipped: number;
  /** Distinct level ids across the imported rooms — for the panel's sentence. */
  readonly levelIds: readonly string[];
}

/**
 * Build a programme from the project's rooms. PURE and total: it never throws, never
 * mints an id, and never invents a room.
 *
 * `levelId`, when given, filters to that storey. When it is null every room is taken —
 * a whole-house programme is a truer answer than an empty one, and the panel says which
 * levels it read from.
 *
 * ⛔ NO RELATIONSHIPS ARE INVENTED. `links` is always empty. The project's room
 * adjacency lives in the door graph / `RoomGraphService`, and deriving a plugged
 * relationship from a shared wall is a claim about the design the user did not make.
 * The panel reads `0 plugged, N rooms`, and both halves are then TRUE.
 */
export function programmeFromProjectRooms(
  rooms: readonly ProjectRoomLike[],
  levelId: string | null = null,
): ProjectRoomsImport {
  const source = Array.isArray(rooms) ? rooms : [];
  const entries: RoomProgrammeEntry[] = [];
  const levels = new Set<string>();
  const seenIds = new Set<string>();
  let skipped = 0;

  for (const room of source) {
    if (!room || typeof room !== 'object') { skipped += 1; continue; }
    const lvl = typeof room.levelId === 'string' ? room.levelId : '';
    if (levelId !== null && lvl !== levelId) continue;
    const id = typeof room.id === 'string' && room.id.length > 0 ? room.id : '';
    if (id === '' || seenIds.has(id)) { skipped += 1; continue; }
    seenIds.add(id);
    const kind = residentialKindForRoom(room);
    const rawName = typeof room.name === 'string' ? room.name.trim() : '';
    entries.push({
      id,
      kind,
      // An unnamed room keeps its kind's label rather than an empty row — the store's
      // own contract says an empty name is valid, so the panel must render something.
      name: rawName.length > 0
        ? rawName
        : (RESIDENTIAL_ROOM_LIBRARY.find((e) => e.kind === kind)?.label ?? 'Room'),
      targetAreaM2: areaFor(room, kind),
    });
    if (lvl.length > 0) levels.add(lvl);
  }

  return {
    programme: { entries, links: [] },
    seen: source.length,
    imported: entries.length,
    skipped,
    levelIds: [...levels].sort(),
  };
}

/**
 * The sentence the panel shows after a load. Carries BOTH numbers on every arm — the
 * count that arrived and the count that landed — so "0 rooms" is never ambiguous
 * between "your project is empty" and "PRYZM could not read it".
 */
export function describeProjectRoomsImport(imp: ProjectRoomsImport, levelId: string | null): string {
  if (imp.seen === 0) {
    return levelId === null
      ? 'This project has no rooms yet, so the programme starts empty. Drag rooms in to '
        + 'declare one, or generate a house and load it back here.'
      : `This project has no rooms on the active storey (${levelId}), so the programme `
        + 'starts empty. Drag rooms in to declare one.';
  }
  if (imp.imported === 0) {
    return `PRYZM found ${imp.seen} room record${imp.seen === 1 ? '' : 's'} but could not `
      + `import ${imp.skipped === imp.seen ? 'any of them' : `${imp.skipped}`} — every one is `
      + 'missing the id the programme joins on. This is a gap in PRYZM’s wiring, not a '
      + 'statement about your design.';
  }
  const where = imp.levelIds.length === 1
    ? `storey ${imp.levelIds[0]}`
    : imp.levelIds.length > 1
      ? `${imp.levelIds.length} storeys (${imp.levelIds.join(', ')})`
      : 'this project';
  const total = imp.programme.entries.reduce((s, e) => s + e.targetAreaM2, 0);
  return `Loaded ${imp.imported} room${imp.imported === 1 ? '' : 's'} from ${where} — `
    + `${total.toFixed(1)} m² in total`
    + (imp.skipped > 0 ? `, and skipped ${imp.skipped} record${imp.skipped === 1 ? '' : 's'} with no id` : '')
    + '. Relationships are not imported: plug them on the graph and the plan re-solves.';
}
