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
 * ── DETERMINISM / PRECEDENCE (stated, not emergent) ─────────────────────────
 *
 * `ROOM_AUTOFILL_RULES` is an ORDERED array. The FIRST rule whose `test()`
 * passes wins; no lower rule is even evaluated. This is the whole precedence
 * mechanism — a rule is a row, and moving a row up or down IS changing its
 * precedence. The order below is deliberate:
 *
 *   1. Bedroom (bed)            — the strongest single-purpose signal. A room
 *      with a bed AND a wardrobe is Bedroom, never Dressing, because this row
 *      is checked first and short-circuits every row below it. A room with a
 *      bed AND kitchen AND sofa is ALSO Bedroom — bed outranks the
 *      Kitchen-Living combination rule too. This is the one call in this table
 *      that is genuinely arguable; it is documented here rather than left to
 *      be reverse-engineered from array order.
 *   2. Bathroom (wet fixtures)
 *   3. Core / vertical circulation (stair)
 *   4. Outdoor area (planting)
 *   5. Kitchen-Living (BOTH kitchen appliances AND a sofa) — deliberately
 *      ABOVE the standalone Kitchen/Living rows so a room matching both
 *      signals takes the combined label instead of whichever single rule
 *      happened to be listed first.
 *   6. Kitchen (alone)
 *   7. Living (alone)
 *   8. Study / Office (desk)
 *   9. Dining (dining table)
 *  10. Dressing (wardrobe, and ONLY when no bed is present — belt-and-braces:
 *      row 1 already guarantees this, but the row's own test does not rely on
 *      array position alone, so re-ordering this table cannot silently make a
 *      bed+wardrobe room "Dressing").
 *
 * A room matching NONE of these rows is UNCLASSIFIED — `classifyRoomForAutofill`
 * returns `null`, and the caller must leave the room's name and occupancy
 * untouched (§CONTEXT-DATA-HONESTY: an invented type is worse than a blank).
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

import type { RoomOccupancyType } from '@pryzm/room-topology';
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

  return {
    furnitureNames,
    plumbingTypes,
    hasStair: contents.contained.stairs.length > 0,
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

function furnitureMatches(signals: RoomContentSignals, re: RegExp): boolean {
  return signals.furnitureNames.some((n) => re.test(n));
}

function plumbingMatches(signals: RoomContentSignals, re: RegExp): boolean {
  return signals.plumbingTypes.some((n) => re.test(n));
}

const BED_RE       = /\bbed\b|bunk|double\s*bed|single\s*bed/i;
const WET_RE       = /toilet|\bwc\b|shower|\bbath\b|bathtub|sink|basin/i;
const OUTDOOR_RE   = /\btree(s)?\b|arbol|planting|shrub|hedge|landscap/i;
const KITCHEN_RE   = /cooker|hob|\boven\b|fridge|dishwasher|kitchen\s*unit|kitchen\s*counter/i;
const SOFA_RE      = /\bsofa\b|couch|armchair|settee/i;
const DESK_RE      = /\bdesk\b|workstation/i;
const DINING_RE    = /dining\s*table/i;
const WARDROBE_RE  = /wardrobe|closet|armoire/i;

export const ROOM_AUTOFILL_RULES: readonly AutoFillRule[] = [
  {
    id: 'bedroom-bed', label: 'Bedroom', occupancyType: 'bedroom',
    test: (s) => furnitureMatches(s, BED_RE),
  },
  {
    id: 'bathroom-wet-fixtures', label: 'Bathroom', occupancyType: 'bathroom',
    test: (s) => plumbingMatches(s, WET_RE),
  },
  {
    id: 'core-stair', label: 'Core', occupancyType: 'stairwell',
    test: (s) => s.hasStair,
  },
  {
    id: 'outdoor-planting', label: 'Outdoor Area', occupancyType: 'courtyard',
    test: (s) => furnitureMatches(s, OUTDOOR_RE),
  },
  {
    id: 'kitchen-living-combo', label: 'Kitchen-Living', occupancyType: 'kitchen',
    test: (s) => furnitureMatches(s, KITCHEN_RE) && furnitureMatches(s, SOFA_RE),
  },
  {
    id: 'kitchen', label: 'Kitchen', occupancyType: 'kitchen',
    test: (s) => furnitureMatches(s, KITCHEN_RE),
  },
  {
    id: 'living-sofa', label: 'Living', occupancyType: 'living-room',
    test: (s) => furnitureMatches(s, SOFA_RE),
  },
  {
    id: 'study-office-desk', label: 'Office', occupancyType: 'private-office',
    test: (s) => furnitureMatches(s, DESK_RE),
  },
  {
    id: 'dining-table', label: 'Dining', occupancyType: 'dining-room',
    test: (s) => furnitureMatches(s, DINING_RE),
  },
  {
    id: 'dressing-wardrobe', label: 'Dressing', occupancyType: 'storage-residential',
    // Belt-and-braces (see header): even if this row were ever moved above
    // 'bedroom-bed', a room with a bed would still not classify as Dressing.
    test: (s) => furnitureMatches(s, WARDROBE_RE) && !furnitureMatches(s, BED_RE),
  },
];

export interface RoomAutoFillClassification {
  readonly ruleId: string;
  readonly label: string;
  readonly occupancyType: RoomOccupancyType;
}

/**
 * Classify one room from its contents, deterministically. Same room, same
 * store state → same answer, every call (no randomness, no wall-clock read).
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
  for (const rule of ROOM_AUTOFILL_RULES) {
    if (rule.test(signals)) {
      return { ruleId: rule.id, label: rule.label, occupancyType: rule.occupancyType };
    }
  }
  return null;
}
