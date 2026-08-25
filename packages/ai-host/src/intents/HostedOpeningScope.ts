// @pryzm/ai-host — HostedOpeningScope (§FIX-HOSTED-LEVEL-SCOPE, L-1201)
// =============================================================================
//
// ⭐ **THE LEVEL ARM FOR WINDOWS AND DOORS WAS UNSATISFIABLE.** Not slow, not
// flaky — it could never return a single element, and the sentence the module
// header of `DimensionFamilies` advertises as a WORKED EXAMPLE was one of the
// sentences it could not answer.
//
// ── THE MEASUREMENT ─────────────────────────────────────────────────────────
//
// The editor-side scope resolver's level arm (`ZeroTokenChatBridge`,
// `makeScopeResolver`) resolves a level scope as:
//
//     store.getIdsByLevel?.(level.id)
//       ?? store.getByLevel?.(level.id).map(e => e.id)
//       ?? store.getAll().filter(e => e.levelId === level.id).map(e => e.id)
//
// Measured 2026-08-19:
//   • `WindowStore` exposes `getById` / `getIdsByWallId` / `getByWallId` /
//     `getAll` / `has`. **No `getIdsByLevel`, no `getByLevel`, no `getAllIds`.**
//   • `DoorStore` — the same.
//   • `WindowOpening` and `DoorOpening` carry **no `levelId` field at all**
//     (`grep -n levelId packages/geometry-window/src/WindowTypes.ts` → 0 hits).
//     A window's level is a property of its **host wall**, and the codebase
//     already says so everywhere else: `WindowBuilder` mirrors
//     `levelId: wallData.levelId` onto the mesh, and `WindowLevelCleanupHandler`
//     finds a level's windows by `wallStore.getById(win.wallId).levelId`.
//
// So the third branch compared `undefined === 'level-2-id'` for every window in
// the project and produced `[]`, every time, on every project. The reply was
// *"There are no windows on Level 2 — nothing was changed."* on a level full of
// windows: **failure and empty were the same value** (§CONTEXT-DATA-HONESTY),
// and the answer looked like a fact about the model.
//
// ⭐ ASK "CAN THIS CONDITION EVER BE TRUE?" BEFORE ASKING "WHY IS IT WRONG?".
// Ten defects this week were unsatisfiable rather than broken. This is the
// eleventh, and it was reachable by reading two store class declarations.
//
// ── THE FIX, AND WHY IT IS DERIVED RATHER THAN ENUMERATED ───────────────────
//
// The obvious fix — a `HOSTED_KINDS = ['door', 'window']` set — is the very
// defect class that produced the scope-tail bug next door: an enumerated list
// that must be REMEMBERED. A railing, a curtain-wall panel or any future hosted
// opening would be silently missing from it, and nothing would fail loudly.
//
// This resolver DERIVES the answer from the RECORD instead:
//
//   • the record carries its own `levelId`  → use it (walls, slabs, columns …)
//   • it carries a `wallId` and no `levelId` → derive from the HOST WALL
//   • it carries neither                     → **COUNTED SKIP WITH ITS REASON**
//
// The third arm is not a formality. An opening whose host wall the wall store
// no longer holds is exactly the stale-id hazard ADR-0299 §RECOVERY-MUST-REFUSE
// and C13 §3.12 exist about: it is reported as a skip with its reason, never
// repaired, never silently dropped, and never counted into the Confirm card's
// denominator as if it had been included.
//
// PURE — the caller supplies the rows and the host-wall lookup, so this is
// testable against real store SHAPES without importing a store (L0 discipline,
// and the reason a test here can actually falsify the claim).

import type { ScopeSkip } from './ScopeDescriptor.js';

/** The minimum an element row must expose for its level to be decided. Both
 *  fields are optional ON PURPOSE — which one is present is the decision. */
export interface LevelBearingRow {
  readonly id: string;
  /** The element's OWN level, when it has one (walls, slabs, columns). */
  readonly levelId?: string | null;
  /** The HOST wall, when the element is an opening hosted in one. */
  readonly wallId?: string | null;
}

export type HostedLevelResolution =
  | { readonly kind: 'resolved'; readonly ids: readonly string[]; readonly skipped: readonly ScopeSkip[] }
  | { readonly kind: 'refused'; readonly error: string };

/**
 * Resolve "the `kind`s on this level" from element rows, deriving a hosted
 * opening's level through its host wall.
 *
 * @param kind          element kind, for refusal/skip copy ("window").
 * @param rows          every row of that kind in the project.
 * @param levelId       the resolved level's id.
 * @param levelName     the resolved level's display name, for copy.
 * @param wallLevelOf   host-wall → levelId. Returns `undefined` when the wall
 *                      store does not hold that wall; `null` when there is no
 *                      wall store at all (the two are NOT the same, and
 *                      collapsing them is what this module refuses to do).
 */
export function resolveLevelScopeByHost(
  kind: string,
  rows: readonly LevelBearingRow[],
  levelId: string,
  levelName: string,
  wallLevelOf: (wallId: string) => string | null | undefined,
): HostedLevelResolution {
  const ids: string[] = [];
  let orphaned = 0;
  let unplaceable = 0;
  let noWallStore = false;

  for (const row of rows) {
    const own = typeof row.levelId === 'string' ? row.levelId.trim() : '';
    if (own.length > 0) {
      if (own === levelId) ids.push(row.id);
      continue;
    }
    const host = typeof row.wallId === 'string' ? row.wallId.trim() : '';
    if (host.length === 0) {
      // Neither its own level nor a host: nothing about this element's level is
      // KNOWN. Absence of a fact is not the fact "not on this level".
      unplaceable += 1;
      continue;
    }
    const hostLevel = wallLevelOf(host);
    if (hostLevel === null) { noWallStore = true; break; }
    if (hostLevel === undefined) { orphaned += 1; continue; }
    if (hostLevel === levelId) ids.push(row.id);
  }

  if (noWallStore) {
    return {
      kind: 'refused',
      error:
        `I can't tell which ${kind}s are on ${levelName} — a ${kind} takes its level from the ` +
        `wall that hosts it, and the wall store isn't available here. Nothing was changed, and ` +
        `nothing about the model is confirmed.`,
    };
  }

  const skipped: ScopeSkip[] = [];
  if (orphaned > 0) {
    skipped.push({
      kind,
      count: orphaned,
      reason:
        `the host wall is no longer in the model, so which level they are on is unknown — ` +
        `they were NOT included`,
    });
  }
  if (unplaceable > 0) {
    skipped.push({
      kind,
      count: unplaceable,
      reason: `no level and no host wall is recorded for them, so they could not be placed`,
    });
  }
  return { kind: 'resolved', ids, skipped };
}

/** True when NO row in the set can state its own level — i.e. the whole kind is
 *  host-derived and the plain `levelId` filter would return an empty set for
 *  every level in the project. Exported so a caller can decide whether the
 *  derivation is needed at all without hard-coding which kinds are hosted. */
export function isHostDerivedKind(rows: readonly LevelBearingRow[]): boolean {
  let sawHost = false;
  for (const row of rows) {
    if (typeof row.levelId === 'string' && row.levelId.trim().length > 0) return false;
    if (typeof row.wallId === 'string' && row.wallId.trim().length > 0) sawHost = true;
  }
  return sawHost;
}

// ─── §CHAT-ORIENTATION-HOSTED-OPENINGS (L-10946) ─────────────────────────────
//
// ⭐ THE FOUNDER TYPED **"Make all windows in the south facade 0.1 meters sill
// height, 3 meters height and 1.5 meters wide"** and was told *"I can't find a
// room 'south'"*.
//
// Two things were wrong, one grammar and one semantic, and they had to be fixed
// in different files:
//
//   1. The shared scope tail had no compass noun class, so "south facade" fell
//      through to ROOM. Fixed in `SpatialScopeTail.readSpatialTail`.
//   2. ⭐ THE ORIENTATION SCOPE COULD ONLY EVER MEAN WALLS. The editor's arm
//      answers a compass direction with `facadesByOrientation(...)` → WALL ids,
//      so a window capability scoped that way would have resized WALLS.
//      `DimensionFamilies` records that in as many words and declares
//      `spatialKinds: ['level','room']` rather than claiming reach that exists
//      only as a defect — *"declaring reach no sentence can reach is the same
//      lie in the other direction"* (C68 §6.3-G3).
//
// That second half is this function. It is the HOP, not a second orientation
// arm: the caller still resolves the facade through the ONE θ-threaded
// `FacadeOrientationService`, and this maps the wall ids it returns to the
// openings hosted in them.
//
// ── THE DEFINITION, STATED EXPLICITLY ───────────────────────────────────────
//
// **AN OPENING FACES WHERE ITS HOST WALL FACES.** A window has no independent
// facade — it is a void cut through one wall, and its outward direction IS that
// wall's. So:
//
//   • the compass math is `FacadeOrientationMath.orientationFromNormal`'s, not
//     a second implementation;
//   • the TOLERANCE is that function's ±45° QUADRANT, so the four directions
//     partition the circle and every exterior wall has exactly one — a wall 35°
//     off south IS south. ⛔ No tolerance constant is declared here, because a
//     second one would be a second answer to one question;
//   • a CURVED or FACETED facade is answered PER WALL: each segment classifies
//     on its own normal, so a faceted bay contributes its south-ish segments and
//     not its east-ish ones, and the openings follow their own segment.
//
// ⛔ AN OPENING WHOSE HOST WALL IS NOT IN THE FACADE SET IS SIMPLY NOT IN
// SCOPE — that is an ordinary non-match, not a skip. What IS a counted skip is
// an opening whose host wall the model no longer holds: its orientation is
// UNKNOWN, and unknown is not "not south" (§CONTEXT-DATA-HONESTY, the same
// distinction the level arm above exists for).

export type HostedOrientationResolution =
  | { readonly kind: 'resolved'; readonly ids: readonly string[]; readonly skipped: readonly ScopeSkip[] }
  | { readonly kind: 'refused'; readonly error: string };

/**
 * Resolve "the `kind`s on the <compass> facade" from element rows, deriving a
 * hosted opening's facade through its host wall.
 *
 * @param kind        element kind, for refusal/skip copy ("window").
 * @param rows        every row of that kind in the project.
 * @param facadeWallIds  the wall ids the facade service classified as facing
 *                    this direction. EMPTY means the caller already refused;
 *                    it is never conflated with "unknown" here.
 * @param compassWord the direction as a word ("south"), for copy.
 * @param wallExists  does the model still hold this wall? `null` ⇒ there is no
 *                    wall store at all (REFUSE); `true`/`false` ⇒ a fact.
 */
export function resolveOrientationScopeByHost(
  kind: string,
  rows: readonly LevelBearingRow[],
  facadeWallIds: readonly string[],
  compassWord: string,
  wallExists: (wallId: string) => boolean | null,
): HostedOrientationResolution {
  const facade = new Set(facadeWallIds);
  const ids: string[] = [];
  let orphaned = 0;
  let unplaceable = 0;
  let noWallStore = false;

  for (const row of rows) {
    const host = typeof row.wallId === 'string' ? row.wallId.trim() : '';
    if (host.length === 0) {
      // No host wall recorded: which way this opening faces is not KNOWN.
      // Absence of a fact is not the fact "not on the south facade".
      unplaceable += 1;
      continue;
    }
    if (facade.has(host)) { ids.push(row.id); continue; }
    // Not in the facade set. Before calling that a non-match, check the host is
    // actually in the model — a wall the store no longer holds could not have
    // been classified at all, and reporting it as "faces another way" would be
    // a claim nobody measured.
    const exists = wallExists(host);
    if (exists === null) { noWallStore = true; break; }
    if (!exists) { orphaned += 1; continue; }
    // A real wall that faces another way (or is interior). An ordinary
    // non-match — deliberately NOT a skip, or every project-wide facade ask
    // would report thousands of them.
  }

  if (noWallStore) {
    return {
      kind: 'refused',
      error:
        `I can't tell which ${kind}s are on the ${compassWord} facade — a ${kind} faces the way ` +
        `the wall that hosts it faces, and the wall store isn't available here. Nothing was ` +
        `changed, and nothing about the model is confirmed.`,
    };
  }

  const skipped: ScopeSkip[] = [];
  if (orphaned > 0) {
    skipped.push({
      kind,
      count: orphaned,
      reason:
        `the host wall is no longer in the model, so which way they face is unknown — ` +
        `they were NOT included`,
    });
  }
  if (unplaceable > 0) {
    skipped.push({
      kind,
      count: unplaceable,
      reason: `no host wall is recorded for them, so which way they face could not be decided`,
    });
  }
  return { kind: 'resolved', ids, skipped };
}
