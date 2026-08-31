// §ROOMTYPE142 (L-12320+), 2026-08-26.
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Spatial Intelligence — Room Autofill Classifier
 * Contract:          C84 EI-9 (ONE authority per concept) · §CONTEXT-DATA-HONESTY
 *
 * PURPOSE (founder, verbatim): *"Create an easy algorithm in the room schedule
 * to autofill based on elements within the rooms. For example: if the room has
 * a bed → bedroom; shower/toilet → bathroom; stair → core / vertical
 * circulation; trees → outdoor area; kitchen → kitchen; sofa → living; if it
 * has both [kitchen and sofa] → kitchen-living, etc. ... run AD-HOC, not
 * always running."*
 *
 * ── WHY A NEW FILE, NOT A RIVAL OF `RoomTypeInferenceEngine.ts` ─────────────
 *
 * `RoomTypeInferenceEngine` (sibling file, same package) already exists and is
 * WIRED: it powers the single-room "Suggested: Bedroom (90%)" banner in
 * `RoomPropertySection.ts` and `RoomAutoOrganiser.ts`'s per-level "Auto-
 * Organise" modal. It picks ONE best-confidence rule per room — there is no
 * concept of "both kitchen AND sofa" in it, and its confidence scores are
 * exactly the kind of fuzziness the founder's "EASY algorithm" ask explicitly
 * asks to avoid. Reworking its scoring engine to also carry deterministic,
 * ordered, combination-aware rows would have made ONE file serve two
 * incompatible contracts (probabilistic best-guess vs. deterministic
 * first-match) — so this is a SEPARATE, small, table-driven classifier for the
 * bulk "autofill room names" feature, not a rival containment resolver: it
 * shares the room's underlying content signals with the sibling engine's own
 * extraction style (furniture/plumbing label cross-reference) and reads
 * containment from `window.roomContentsService` — the SAME authority
 * `RoomPropertySection.ts`'s "Contents" card (§11) and the Inspect by-room tree
 * (`projectTreeModel.ts`, §ROOMTREE139) already read. It does not re-derive
 * "which element is in which room".
 *
 * ── DOMINANCE / PRECEDENCE — RE-DESIGNED §DEPT153 (L-12540+, founder ruling
 * 2026-08-27) ─────────────────────────────────────────────────────────────
 *
 * ⛔ THIS USED TO BE "an ordered array, first match wins, and row 1 happens to
 * be bed" — true, but NOT the actual defect the founder hit. His plan view of
 * Level 1 showed rooms with a plainly-visible BED still labelled "Dressing".
 * `bedroom-bed` WAS already row 1 and `dressing-wardrobe` WAS already last —
 * array order was correct THE WHOLE TIME. The real defect was one layer
 * down: `BED_RE`/`SOFA_RE`/`KITCHEN_RE`/`DESK_RE` never MATCHED a real
 * furniture record (catalogue kinds are underscore-joined compounds —
 * 'kave_double_bed', 'kitchen_straight' — and JS's `\b` does not treat `_` as
 * a boundary), while `WARDROBE_RE` had no boundary check at all and kept
 * firing. Every furniture-based rule except wardrobe was going BLIND, not
 * losing a precedence fight. See `hasToken` below for the actual fix — the
 * table's ORDER did not need to change, its MATCHING did.
 *
 * That said, the founder's own words — *"if bed → bedroom no matter what"* —
 * are now enforced as something STRONGER than array position: bed is a
 * PRECONDITION in `classifyRoomForAutofill`, evaluated before
 * `ROOM_AUTOFILL_RULES` is even consulted, not a row inside it. It is not
 * "row 1 happens to win" any more; there is no row for a future edit to move.
 *
 * `ROOM_AUTOFILL_RULES` remains an ORDERED array for everything ELSE. The
 * FIRST rule whose `test()` passes wins; no lower rule is even evaluated:
 *
 *   1. Bathroom (wet fixtures)
 *   2. Core / vertical circulation (stair)
 *   3. Outdoor area (planting)
 *   4. Kitchen-Living (BOTH kitchen AND sofa signals, on the same room) —
 *      ABOVE the standalone Kitchen/Living rows so a room matching both
 *      signals takes the combined label — the founder's own rule 3, *"if
 *      sofa + kitchen [+ living] → kitchen."*
 *   5. Kitchen (alone) — founder's rule 4 ("kitchen must be recognised").
 *   6. Living (alone) — founder's rule 2, *"if sofa → living."*
 *   7. Study / Office (desk)
 *   8. Dining (dining table)
 *   9. Dressing (wardrobe) — LAST, by construction: every row above it runs
 *      first, AND the bed precondition already returned before this table is
 *      ever reached. Founder's rule 5, *"wardrobe ⇒ Dressing only when
 *      NOTHING higher matched."* Also demoted by area — see
 *      `WARDROBE_ONLY_AREA_CEILING_M2` — a SECONDARY tie-breaker that can
 *      only turn a weak, unopposed wardrobe match into `unclassified`, never
 *      into a different asserted type, and never applied when ANY stronger
 *      signal (bed, or anything above this row) is present.
 *
 * A room matching NEITHER the bed precondition NOR any table row is
 * UNCLASSIFIED — `classifyRoomForAutofill` returns `null`, and the caller
 * must leave the room's name and occupancy untouched (§CONTEXT-DATA-HONESTY:
 * an invented type is worse than a blank).
 *
 * ── OCCUPANCY MAPPING — TWO ROWS TARGET AN IMPERFECT FIT (stated, OPEN) ─────
 *
 * `RoomOccupancyType` (`@pryzm/room-topology`) is a CLOSED, already-51-member
 * enum. Minting a new member ("kitchen-living") for this lane was rejected on
 * purpose: it would touch the Zod schema, `OCCUPANCY_PALETTE` (an EXHAUSTIVE
 * `Record<RoomOccupancyType, string>`), `RoomSystemTypeStore` defaults, IFC
 * export mapping and more, all unverifiable here because this lane does not
 * run the root typecheck. Two rows below therefore map their combined/loose
 * CONCEPT onto the closest EXISTING member while keeping the founder's own
 * display label as the room NAME:
 *   • `kitchen-living` → occupancyType `'kitchen'` (the fitted, code-relevant
 *     function), name label "Kitchen-Living".
 *   • outdoor/planting → occupancyType `'courtyard'` (the closest existing
 *     outdoor-space member), name label "Outdoor Area".
 *   • wardrobe-only → occupancyType `'storage-residential'` (closest existing
 *     member for a storage-dominated room), name label "Dressing".
 * These three are OPEN — recorded as ISSUE-LOG rows — for the founder to
 * confirm or to mint dedicated enum members later.
 */

// §FIX-LAYER-ROOM-AUTOFILL-HOME (2026-08-30) — this module MOVED here from
// `packages/spatial-index/src/`. It was the newest of the six `Room*` modules
// sitting in an L1 spatial primitive while depending on L2 domain packages, and
// the two edges it added (`spatial-index → room-topology`, `spatial-index →
// core-app-model`) were over `check-layer-boundaries`'s upward-import baseline.
// Nothing inside `spatial-index` consumed it — only that package's barrel and its
// two test files — and the subject it classifies (`RoomOccupancyType`) is defined
// three files away in `./RoomTypes.ts`. Both edges disappear here because
// room-topology is L2 and core-app-model is L2.
//
// ⚠ Its five siblings (RoomQueryService, RoomGraphService, RoomTypeInferenceEngine,
// RoomValidationService, RoomAutoFillClassifier's neighbour FacadeOrientationService)
// still carry the same L1 → L2 edges INSIDE the baseline. They are the follow-up,
// not a licence to move this one back.
import type { RoomOccupancyType } from './RoomTypes';
import { storeRegistry } from '@pryzm/core-app-model';

// ── Signal gathering ──────────────────────────────────────────────────────────

/** Minimal shape this module needs from `window.roomContentsService`. Kept
 *  local/narrow (rather than importing the full `RoomContentsService` class)
 *  so this file only depends on the read it actually performs. */
interface MinRoomContentsService {
  getContents(roomId: string): {
    contained: {
      furniture: ReadonlyArray<{ id: string; label: string }>;
      plumbing:  ReadonlyArray<{ id: string; label: string }>;
      stairs:    ReadonlyArray<{ id: string; label: string }>;
    };
  } | null;
}

function readRoomContentsService(): MinRoomContentsService | null {
  if (typeof window === 'undefined') return null;
  const svc = (window as unknown as { roomContentsService?: MinRoomContentsService }).roomContentsService;
  return svc ?? null;
}

/** The signals every autofill rule tests against. Pure data — no store refs. */
export interface RoomContentSignals {
  /** Display names/types for every furniture item the room contains — reads
   *  `name ?? furnitureType ?? type`, cross-referenced against the live
   *  furniture store by id (mirrors `RoomTypeInferenceEngine.inferType`'s own
   *  furniture-label extraction), falling back to the containment service's
   *  own `ElementRef.label` when the store cannot be read. */
  readonly furnitureNames: readonly string[];
  /** Same idea for plumbing fixtures — reads `fixtureType ?? name ?? type`. */
  readonly plumbingTypes: readonly string[];
  /** True when the room's containment includes at least one stair element. */
  readonly hasStair: boolean;
  /** §DEPT153 (L-12540+) — the room's own gross area (`room.computed.area`),
   *  m². `undefined` when the room record carried no computed metrics. Read
   *  ONLY by the `dressing-wardrobe` demotion band below — never by anything
   *  that could out-rank a bed/sofa/kitchen/stair/wet-fixture match (the
   *  founder's own ruling: area is a tie-breaker/demotion, never an
   *  override). */
  readonly areaM2?: number;
}

/**
 * Gather the signals `classifyRoomForAutofill` reads for one room. Returns
 * `null` when the room cannot be identified at all (no room record, or the
 * containment authority is unavailable) — the caller must treat that as
 * UNCLASSIFIED, never as "no elements".
 */
export function gatherRoomAutofillSignals(roomId: string): RoomContentSignals | null {
  const roomStore = storeRegistry.getStoreForType('room') as { getById?(id: string): unknown } | undefined;
  if (!roomStore?.getById) return null;
  const room = roomStore.getById(roomId);
  if (!room) return null;

  const svc = readRoomContentsService();
  if (!svc) return null;
  const contents = svc.getContents(roomId);
  if (!contents) return null;

  const furnitureStore = storeRegistry.getStoreForType('furniture') as
    | { getAll?(): Array<{ id: string; name?: string; furnitureType?: string; type?: string }> }
    | undefined;
  const furnitureIds = new Set(contents.contained.furniture.map((r) => r.id));
  let furnitureNames: string[];
  if (furnitureStore && typeof furnitureStore.getAll === 'function') {
    furnitureNames = [];
    for (const f of furnitureStore.getAll()) {
      if (!furnitureIds.has(f.id)) continue;
      const label = f.name ?? f.furnitureType ?? f.type ?? '';
      if (label) furnitureNames.push(String(label));
    }
  } else {
    // Store unreachable — fall back to the containment service's own labels
    // rather than reporting zero furniture (§CONTEXT-DATA-HONESTY).
    furnitureNames = contents.contained.furniture.map((r) => r.label);
  }

  const plumbingStore = storeRegistry.getStoreForType('plumbing') as
    | { getAll?(): Array<{ id: string; fixtureType?: string; name?: string; type?: string }> }
    | undefined;
  const plumbingIds = new Set(contents.contained.plumbing.map((r) => r.id));
  let plumbingTypes: string[];
  if (plumbingStore && typeof plumbingStore.getAll === 'function') {
    plumbingTypes = [];
    for (const p of plumbingStore.getAll()) {
      if (!plumbingIds.has(p.id)) continue;
      const label = p.fixtureType ?? p.name ?? p.type ?? '';
      if (label) plumbingTypes.push(String(label));
    }
  } else {
    plumbingTypes = contents.contained.plumbing.map((r) => r.label);
  }

  // §DEPT153 — read defensively: `room` is `unknown` (this module narrows
  // nothing about RoomStore's record shape beyond `getById` existing), and an
  // absent/non-numeric area must become `undefined`, never `0` — a 0 m² room
  // is not the same claim as "area not recorded" (§CONTEXT-DATA-HONESTY).
  const rawArea = (room as { computed?: { area?: unknown } })?.computed?.area;
  const areaM2 = typeof rawArea === 'number' && Number.isFinite(rawArea) ? rawArea : undefined;

  return {
    furnitureNames,
    plumbingTypes,
    hasStair: contents.contained.stairs.length > 0,
    areaM2,
  };
}

// ── Rule table (DATA, not a chain of ifs — see the header for precedence) ────

export interface AutoFillRule {
  /** Stable id for debugging/telemetry — never shown to the user. */
  readonly id: string;
  /** The word the generated room NAME is built from, e.g. "Bedroom". */
  readonly label: string;
  /** The `RoomOccupancyType` this rule sets. See header for the two rows
   *  whose mapping is an open, documented compromise. */
  readonly occupancyType: RoomOccupancyType;
  readonly test: (signals: RoomContentSignals) => boolean;
}

// ── Token-aware matching (§DEPT153, L-12540+) ────────────────────────────────
//
// ⭐ ROOT CAUSE of "bedrooms called Dressing, sofa+kitchen+dining called
// Dressing, kitchen never recognised" (founder, plan-view evidence on Level 1:
// Dressing 02/03 both plainly contain a BED; "Dressing 01" at 75 m² contains a
// dining table, a sofa AND a kitchen run). It was NOT a rule-precedence bug —
// `bedroom-bed` was already row 1 and `dressing-wardrobe` already excluded a
// detected bed as belt-and-braces. It was that BED_RE/SOFA_RE/KITCHEN_RE/
// DESK_RE never matched a real furniture record at all, while WARDROBE_RE kept
// firing — so wardrobe wasn't WINNING, every other rule was going BLIND.
//
// Catalogue furniture kinds are compound identifiers joined by underscores —
// 'kitchen_straight', 'kave_double_bed', 'sofa_2seat', 'corner_wardrobe'
// (packages/geometry-furniture/src/FurnitureTypes.ts /
// FurnitureCategoryMap.ts — word lists MIRRORED here as literals, NOT
// imported: @pryzm/spatial-index is L1, @pryzm/geometry-furniture is L2, and
// importing it here would be an upward layer edge
// `tools/ga-gate/check-layer-boundaries.ts` forbids). `gatherRoomAutofillSignals`
// falls back to `furnitureType` whenever an item has no custom `.name`
// (the common case for a parametric/catalogue placement), so the SIGNAL this
// module actually reads is very often that compound identifier, not prose.
//
// JS's native `\b` treats `_` as a word character, so `/\bbed\b/` does NOT
// match 'kave_double_bed' or 'sofa_1seat' (no boundary either side of "bed"/
// "sofa" — both neighbours are word characters). `WARDROBE_RE` had NO `\b` at
// all, so it alone kept matching every wardrobe variant while its siblings
// silently matched nothing. `hasToken` fixes this ONE way for every signal:
// start/end-of-string and underscore/hyphen/space are ALL boundaries, so it
// matches a free-text name ("Queen size bed frame") and a catalogue kind
// ("kave_double_bed") through the SAME mechanism — this IS "match on the real
// element kind", not a label-string guess, because the kind string is exactly
// what the boundary-aware test is built to read correctly.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `word` bounded by start/end-of-string or an underscore/hyphen/space on
 *  either side — so it matches BOTH "bed" inside "kave_double_bed" (bounded
 *  by "_" and end) and "bed" inside "a queen bed frame" (bounded by spaces). */
function hasToken(text: string, word: string): boolean {
  return new RegExp(`(?:^|[_\\-\\s])${escapeRegExp(word)}(?:[_\\-\\s]|$)`, 'i').test(text);
}

/** True when ANY signal name contains ANY of `words` as a delimited token. */
function anyToken(names: readonly string[], words: readonly string[]): boolean {
  return names.some((n) => words.some((w) => hasToken(n, w)));
}

/** True when ONE signal name contains ALL of `words` as delimited tokens —
 *  for combinations that must land on the SAME item ("dining_table", not a
 *  dining chair in one item and an unrelated table in another). */
function allTokensOnOneName(names: readonly string[], words: readonly string[]): boolean {
  return names.some((n) => words.every((w) => hasToken(n, w)));
}

/** Free-text substrings kept boundary-FREE on purpose — `WARDROBE_WORDS`
 *  already proved (by accident) that a plain substring test survives every
 *  catalogue variant ('wardrobe', 'corner_wardrobe', 'wardrobe_glass_door', …
 *  all contain "wardrobe"); the same style is used here for stems/synonyms
 *  that have no catalogue-kind form to be boundary-strict about. */
function anySubstring(names: readonly string[], words: readonly string[]): boolean {
  return names.some((n) => words.some((w) => n.toLowerCase().includes(w)));
}

function furnitureMatchesTokens(signals: RoomContentSignals, words: readonly string[]): boolean {
  return anyToken(signals.furnitureNames, words);
}

function plumbingMatchesTokens(signals: RoomContentSignals, words: readonly string[]): boolean {
  return anyToken(signals.plumbingTypes, words);
}

const BED_WORDS      = ['bed'] as const;              // + 'bunk' handled separately (see isBedSignal)
const WET_WORDS       = ['toilet', 'wc', 'shower', 'bath', 'bathtub', 'sink', 'basin'] as const;
const OUTDOOR_WORDS   = ['tree', 'trees', 'planting', 'shrub', 'hedge'] as const;
const OUTDOOR_SUBSTR  = ['arbol', 'landscap'] as const; // stems: 'arbol(ito)', 'landscap(e/ing)'
const KITCHEN_WORDS   = ['kitchen', 'oven', 'hob', 'fridge', 'dishwasher', 'cooker'] as const;
const SOFA_WORDS      = ['sofa', 'couch', 'armchair', 'settee'] as const;
const DESK_WORDS      = ['desk', 'workstation'] as const;
const DINING_WORDS    = ['dining', 'table'] as const; // BOTH tokens on the SAME item
const WARDROBE_SUBSTR = ['wardrobe', 'closet', 'armoire'] as const;

/** §DOMINANCE-BED (founder, 2026-08-27, register L-12540+), verbatim: *"if bed
 *  -> bedroom no matter what."* A bed also matches 'bunk' as a plain
 *  substring — 'kave_bunkbed' is a real catalogue kind (BedPlanSymbolBuilder's
 *  own out-of-scope list) with NO separator between "bunk" and "bed", so it
 *  fails the boundary-strict token test on 'bed' alone. */
function isBedSignal(signals: RoomContentSignals): boolean {
  return furnitureMatchesTokens(signals, BED_WORDS) || anySubstring(signals.furnitureNames, ['bunk']);
}

// ── Rule table (DATA — first match wins AMONG THESE; bed is a PRECONDITION,
// not a row — see classifyRoomForAutofill) ──────────────────────────────────

export const ROOM_AUTOFILL_RULES: readonly AutoFillRule[] = [
  {
    id: 'bathroom-wet-fixtures', label: 'Bathroom', occupancyType: 'bathroom',
    test: (s) => plumbingMatchesTokens(s, WET_WORDS),
  },
  {
    id: 'core-stair', label: 'Core', occupancyType: 'stairwell',
    test: (s) => s.hasStair,
  },
  {
    id: 'outdoor-planting', label: 'Outdoor Area', occupancyType: 'courtyard',
    test: (s) => furnitureMatchesTokens(s, OUTDOOR_WORDS) || anySubstring(s.furnitureNames, [...OUTDOOR_SUBSTR]),
  },
  {
    // §DOMINANCE (founder, verbatim): "if sofa + kitchen + living -> kitchen."
    // Checked BEFORE the standalone kitchen/living rows so a room matching
    // both signals takes the combined label instead of whichever single rule
    // happened to be listed first.
    id: 'kitchen-living-combo', label: 'Kitchen-Living', occupancyType: 'kitchen',
    test: (s) => furnitureMatchesTokens(s, KITCHEN_WORDS) && furnitureMatchesTokens(s, SOFA_WORDS),
  },
  {
    id: 'kitchen', label: 'Kitchen', occupancyType: 'kitchen',
    test: (s) => furnitureMatchesTokens(s, KITCHEN_WORDS),
  },
  {
    // §DOMINANCE (founder, verbatim): "if sofa -> living."
    id: 'living-sofa', label: 'Living', occupancyType: 'living-room',
    test: (s) => furnitureMatchesTokens(s, SOFA_WORDS),
  },
  {
    id: 'study-office-desk', label: 'Office', occupancyType: 'private-office',
    test: (s) => furnitureMatchesTokens(s, DESK_WORDS),
  },
  {
    id: 'dining-table', label: 'Dining', occupancyType: 'dining-room',
    test: (s) => allTokensOnOneName(s.furnitureNames, DINING_WORDS),
  },
  {
    // §DOMINANCE (founder, verbatim): "wardrobe -> Dressing only when NOTHING
    // higher matched" — LAST row, by construction (every row above it is
    // checked first; the bed precondition already ran and returned before
    // this table is ever reached — see classifyRoomForAutofill).
    //
    // §AREA-DEMOTION (coordinator brief, L-12540+, demoted to SECONDARY —
    // never an override, only a tie-breaker/demotion for a WEAK, otherwise-
    // unopposed wardrobe-only match): a room whose ONLY signal is a wardrobe
    // but whose area is AT OR ABOVE `WARDROBE_ONLY_AREA_CEILING_M2` is more
    // plausibly a mis-signalled bedroom/living space (a wardrobe alone proves
    // nothing about room SIZE) than a genuine dressing room — left honestly
    // `unclassified` rather than asserted as Dressing (founder's own example:
    // a 224 m² "Dressing 01"). See the constant's own doc for where the
    // number comes from and why it is a demotion, not a cited standard.
    id: 'dressing-wardrobe', label: 'Dressing', occupancyType: 'storage-residential',
    test: (s) =>
      anySubstring(s.furnitureNames, [...WARDROBE_SUBSTR]) &&
      (s.areaM2 === undefined || s.areaM2 < WARDROBE_ONLY_AREA_CEILING_M2),
  },
];

/**
 * §AREA-DEMOTION (L-12540+) — reused, not invented: the SMALLEST habitable
 * room type's normative floor area, from `packages/ai-host/src/workflows/
 * apartmentLayout/rules/programRules.ts`'s `ROOM_RULES.living.minAreaM2`
 * (14 m², cited there as "DB-047, HQI mandatory"). Mirrored as a literal
 * rather than imported — @pryzm/spatial-index is L1, @pryzm/ai-host is L2,
 * and importing it would be an upward layer violation
 * `check-layer-boundaries.ts` forbids.
 *
 * `storage` (that database's closest existing type to "Dressing") declares a
 * MINIMUM (1.5 m²) but no documented MAXIMUM anywhere in that database — no
 * normative ceiling for a dressing room is on record in this repo. This
 * number is therefore an AUTHORED demotion threshold, not a cited standard:
 * "a room at least as large as the smallest room type this database
 * considers habitable at all, whose ONLY furniture signal is a wardrobe, is
 * more likely mis-signalled than genuinely a dressing room." It never
 * overturns a stronger match — bed/sofa/kitchen/stair/wet-fixture rules all
 * run first (bed as a hard precondition, the rest by table order), so this
 * value is consulted ONLY when wardrobe is the sole signal found.
 */
const WARDROBE_ONLY_AREA_CEILING_M2 = 14;

export interface RoomAutoFillClassification {
  readonly ruleId: string;
  readonly label: string;
  readonly occupancyType: RoomOccupancyType;
}

/**
 * Classify one room from its contents, deterministically. Same room, same
 * store state → same answer, every call (no randomness, no wall-clock read).
 *
 * §DOMINANCE-BED is enforced HERE, as a precondition evaluated before the
 * ordered table — not by the table's row order — so a future rule inserted
 * anywhere in `ROOM_AUTOFILL_RULES` cannot silently demote it. Pinned by
 * `RoomAutoFillClassifier.dominance.test.ts`.
 *
 * Returns `null` — UNCLASSIFIED — when the room's signals could not be read
 * at all, OR when every rule's `test()` returned false. The caller MUST leave
 * an unclassified room's name and occupancy untouched (§CONTEXT-DATA-HONESTY:
 * "we could not tell" must never be rendered indistinguishably from a real
 * classification).
 */
export function classifyRoomForAutofill(roomId: string): RoomAutoFillClassification | null {
  const signals = gatherRoomAutofillSignals(roomId);
  if (!signals) return null;

  // §DOMINANCE-BED — a PRECONDITION, evaluated before the ordered table, not a
  // row inside it. This is what makes "if bed -> bedroom no matter what" TRUE
  // BY CONSTRUCTION: no future insertion into ROOM_AUTOFILL_RULES can run
  // before this line, because this line is not part of that array.
  if (isBedSignal(signals)) {
    return { ruleId: 'bedroom-bed', label: 'Bedroom', occupancyType: 'bedroom' };
  }

  for (const rule of ROOM_AUTOFILL_RULES) {
    if (rule.test(signals)) {
      return { ruleId: rule.id, label: rule.label, occupancyType: rule.occupancyType };
    }
  }
  return null;
}
