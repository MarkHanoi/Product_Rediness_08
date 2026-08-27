/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model (Store layer)
 * File:              packages/room-topology/src/RoomDepartment.ts (NEW)
 * Contract:          C84 EI-9 (ONE authority per concept) · C47 (additive-optional)
 *
 * §DEPT153 (L-12540+). Founder: *"I still don't see the button to auto generate
 * the department of the rooms based on the elements within — why?"* Diagnosis:
 * `department` (`RoomDataSchema.ts` — an optional string, carried by
 * `roomSnapshotUtils.ts`, read by the Room Schedule's ScheduleExtractor) has NEVER
 * had a writer or an editor anywhere in the codebase — not the property panel, not
 * the §ROOMTYPE142 autofill, nothing.
 *
 * ── VOCABULARY: REUSED, NOT INVENTED ────────────────────────────────────────
 *
 * `department` is a programmatic GROUPING — Residential / Office / Retail / … —
 * and it is NOT the same axis as `occupancyType` (Bedroom, Kitchen, …). Before
 * inventing a vocabulary for it, this codebase was searched for one that already
 * exists, and one does: `RoomOccupancyType` (`RoomTypes.ts`) is ALREADY authored
 * in eleven commented groups —
 *
 *   Residential · Commercial Office · Retail · Healthcare · Education ·
 *   Hospitality · Industrial / Warehouse · Circulation · Amenity / Shared ·
 *   Outdoor / Transitional · Default (unclassified)
 *
 * — and `RoomColourSystem.ts`'s `ROOM_CSS_TOKENS` independently names the SAME
 * eleven groups as CSS custom properties (`--room-residential`, `--room-office`,
 * `--room-retail`, `--room-healthcare`, `--room-education`, `--room-hospitality`,
 * `--room-industrial`, `--room-circulation`, `--room-amenity`, `--room-outdoor`,
 * `--room-unclassified`), in the SAME order, count-for-count. Two independent
 * places in this package already agree on this exact grouping; this file is the
 * first to make it a queryable `Record<RoomOccupancyType, string>` rather than a
 * comment header and a CSS token name that nothing had yet joined together.
 *
 * `packages/core-app-model/src/requirements/RequirementSchema.ts` also has a
 * `department` field (on `RoomRequirement`, a DIFFERENT object — a space-
 * programme brief line, not a placed room) but it is a bare optional string with
 * no enum anywhere near it; it contributes no vocabulary.
 *
 * ── DERIVED FROM OCCUPANCY, NOT RE-DERIVED FROM CONTENTS ────────────────────
 *
 * A bedroom is Residential whichever way the room came to be classified as a
 * bedroom — by the §ROOMTYPE142 contents classifier, by hand from the Properties
 * panel, or by chat (`room.setOccupancy`). Department is therefore a PURE
 * FUNCTION of the room's ALREADY-RESOLVED `occupancyType`, never a second
 * independent read of the room's contents. Two rival classifiers disagreeing
 * about the same room (one says "bedroom" from the bed, the other says
 * "Circulation" from something else in the room) would be indefensible; one
 * inference, two labels, is not.
 *
 * ⛔ Do NOT mint new `RoomOccupancyType` enum members here or anywhere else —
 * there is an OPEN founder decision (L-12323) on three already-proposed ones
 * (`RoomAutoFillClassifier.ts`'s header). This file works with the existing
 * 51-member enum exactly as it stands.
 *
 * ── "UNKNOWN" ≠ "NONE" (§CONTEXT-DATA-HONESTY) ──────────────────────────────
 *
 * `department` stays `undefined` for a room nobody has ever touched — the
 * Schedule already renders that as `—` (`ScheduleExtractor.ts`'s
 * `r.department || '—'`) and that reading must not change: it means "this field
 * was never populated", not "we tried and failed".
 *
 * `DEPARTMENT_UNCLASSIFIED` ('Unclassified') is the DIFFERENT, honest answer for
 * "occupancy itself is unclassified, so department cannot be derived — this is
 * not a guess". It reuses the occupancy axis's OWN sentinel word rather than
 * minting a second word ("Unknown") for the identical state, per C84 EI-9. It is
 * a real, visible string — never rendered as `—` — so a room that was PROCESSED
 * and found unclassifiable stays visually distinct from a room nobody has
 * touched at all.
 */

import type { RoomOccupancyType } from './RoomTypes';

/**
 * The honest placeholder for "occupancy is `unclassified`, so department cannot
 * be derived". Distinct from `undefined` (never touched — renders as the
 * Schedule's own `—`) by design; see the file header's §CONTEXT-DATA-HONESTY note.
 */
export const DEPARTMENT_UNCLASSIFIED = 'Unclassified';

/**
 * Every real (non-sentinel) department a room can be assigned, in the SAME
 * order as `RoomTypes.ts`'s occupancy comment groups and `ROOM_CSS_TOKENS`.
 * Exported for the manual Department field's autocomplete list — a hint, not a
 * closed enum: `department` remains a free string on the schema (C47).
 */
export const CANONICAL_DEPARTMENTS: readonly string[] = [
  'Residential',
  'Commercial Office',
  'Retail',
  'Healthcare',
  'Education',
  'Hospitality',
  'Industrial / Warehouse',
  'Circulation',
  'Amenity / Shared',
  'Outdoor / Transitional',
] as const;

/**
 * Occupancy → department. EXHAUSTIVE `Record<RoomOccupancyType, string>` —
 * mirrors `OCCUPANCY_PALETTE`'s own exhaustive-record style (`RoomColourSystem.ts`)
 * so a future occupancy member that is not also given a department fails to
 * compile, rather than silently falling through to the sentinel.
 */
export const DEPARTMENT_FOR_OCCUPANCY: Record<RoomOccupancyType, string> = {
  // ── Residential ──────────────────────────────────────────────────────────
  'bedroom':             'Residential',
  'living-room':         'Residential',
  'kitchen':             'Residential',
  'bathroom':            'Residential',
  'dining-room':         'Residential',
  'utility-room':        'Residential',
  'garage':              'Residential',
  'storage-residential': 'Residential',

  // ── Commercial Office ─────────────────────────────────────────────────────
  'open-office':    'Commercial Office',
  'private-office': 'Commercial Office',
  'meeting-room':   'Commercial Office',
  'reception':      'Commercial Office',
  'breakout':       'Commercial Office',
  'server-room':    'Commercial Office',

  // ── Retail ────────────────────────────────────────────────────────────────
  'retail-floor':  'Retail',
  'stockroom':     'Retail',
  'changing-room': 'Retail',

  // ── Healthcare ────────────────────────────────────────────────────────────
  'patient-room':      'Healthcare',
  'operating-theatre': 'Healthcare',
  'waiting-room':      'Healthcare',
  'consultation-room': 'Healthcare',
  'pharmacy':          'Healthcare',

  // ── Education ─────────────────────────────────────────────────────────────
  'classroom':    'Education',
  'laboratory':   'Education',
  'lecture-hall': 'Education',
  'library':      'Education',
  'staff-room':   'Education',

  // ── Hospitality ───────────────────────────────────────────────────────────
  'hotel-bedroom': 'Hospitality',
  'restaurant':    'Hospitality',
  'bar':           'Hospitality',
  'function-room': 'Hospitality',
  'spa':           'Hospitality',

  // ── Industrial / Warehouse ────────────────────────────────────────────────
  'warehouse':       'Industrial / Warehouse',
  'loading-bay':     'Industrial / Warehouse',
  'plant-room':      'Industrial / Warehouse',
  'electrical-room': 'Industrial / Warehouse',

  // ── Circulation ───────────────────────────────────────────────────────────
  'corridor':       'Circulation',
  'stairwell':      'Circulation',
  'lift-lobby':     'Circulation',
  'entrance-lobby': 'Circulation',
  'foyer':          'Circulation',

  // ── Amenity / Shared ──────────────────────────────────────────────────────
  'wc':             'Amenity / Shared',
  'accessible-wc':  'Amenity / Shared',
  'shower-room':    'Amenity / Shared',
  'kitchen-shared': 'Amenity / Shared',
  'prayer-room':    'Amenity / Shared',

  // ── Outdoor / Transitional ────────────────────────────────────────────────
  'terrace':   'Outdoor / Transitional',
  'balcony':   'Outdoor / Transitional',
  'atrium':    'Outdoor / Transitional',
  'courtyard': 'Outdoor / Transitional',

  // ── Default ───────────────────────────────────────────────────────────────
  'unclassified': DEPARTMENT_UNCLASSIFIED,
};

/**
 * The department a room's occupancy implies. Pure, deterministic, total (every
 * `RoomOccupancyType` member has an entry, including `unclassified`, which maps
 * to the honest sentinel rather than throwing or guessing).
 */
export function departmentForOccupancy(occupancyType: RoomOccupancyType): string {
  return DEPARTMENT_FOR_OCCUPANCY[occupancyType] ?? DEPARTMENT_UNCLASSIFIED;
}
