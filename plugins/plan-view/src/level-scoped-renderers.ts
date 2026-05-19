// level-scoped-renderers — pure helpers that scope element collections to a
// single level (active level OR a linked level).
//
// Spec: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S33 G1–G3 (lines 622-624).
// Subordinate ADR: `docs/architecture/adr/0025-plan-view-svp-parity-contract-44.md`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// The plan-view host previously inlined `wall.levelId === activeLevel`
// filters across walls, slabs, doors, structural footprints, room
// polygons, and annotations.  Inlined filters drift: when the host
// added structural footprints in S31, doors briefly leaked from the
// previous level (Contract 44 G2).  This module formalises the contract
// so every renderer takes the level scoping through a single, unit-tested
// path.
//
// PURE: no DOM, no THREE, no `window` — runs unchanged in Node tests.
//
// LINKED-LEVEL CONVENTION (Contract 44 G3)
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM 1 represents linked-model levels as `<modelId>:<levelId>` (colon
// separator).  When the host renders a stacked-building view, the active
// level is the local one (`L_active`) AND a set of linked levels
// (`linkedLevels: ['linkedA:L1', 'linkedB:L0']`).  The `scopeToActiveLevels`
// helper accepts the active level + the readonly linked-level set and
// returns elements whose `keyOf(...)` falls in the union.
//
// We deliberately do NOT auto-strip the colon prefix — callers must opt in
// explicitly via `prefixOf` if they want the local-level fallback.  The
// kernel of plan-view (S29) treats levelIds opaquely, and stripping would
// risk collisions between local and linked levels that share a suffix.

/** Branded level id — opaque string for the helpers. */
export type ScopedLevelId = string;

/**
 * Filter `items` to those whose `keyOf(item)` matches `levelId`.
 * Returns a stable, allocation-light array.
 *
 * ```ts
 * scopeToLevel(walls, 'L1', (w) => w.levelId)
 * ```
 */
export function scopeToLevel<T>(
  items: Iterable<T>,
  levelId: ScopedLevelId,
  keyOf: (item: T) => string,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (keyOf(item) === levelId) out.push(item);
  }
  return out;
}

/**
 * Filter `items` to those whose `keyOf(item)` matches the active level OR
 * any of the linked levels.  Stable, allocation-light.
 *
 * `linkedLevels` may be an iterable, an array, or an empty set.  Order is
 * not significant; matching is by string equality.
 */
export function scopeToActiveLevels<T>(
  items: Iterable<T>,
  activeLevelId: ScopedLevelId,
  linkedLevels: Iterable<ScopedLevelId>,
  keyOf: (item: T) => string,
): T[] {
  const allowed = new Set<string>();
  allowed.add(activeLevelId);
  for (const l of linkedLevels) allowed.add(l);
  const out: T[] = [];
  for (const item of items) {
    if (allowed.has(keyOf(item))) out.push(item);
  }
  return out;
}

/**
 * Filter `items` to those whose `keyOf(item)` starts with `prefix + ':'`
 * — the linked-model convention.  Useful when the host needs all linked
 * elements regardless of which sub-level they live on.
 */
export function scopeToLinkedModel<T>(
  items: Iterable<T>,
  prefix: string,
  keyOf: (item: T) => string,
): T[] {
  const needle = `${prefix}:`;
  const out: T[] = [];
  for (const item of items) {
    if (keyOf(item).startsWith(needle)) out.push(item);
  }
  return out;
}

/**
 * Resolve a `Door` to its host wall's level.  Doors don't carry a `levelId`
 * directly — they hang off `wallId`, so the host previously had to do an
 * indirect lookup.  This helper centralises that into one tested path so
 * G2 (cross-level structural elements bleeding through) cannot regress.
 *
 * Returns `undefined` if the wall is unknown — callers should drop the
 * door (defence-in-depth: stale references would otherwise render at the
 * world origin).
 */
export function levelOfDoor<W extends { readonly id: string; readonly levelId: string }>(
  doorWallId: string,
  wallsById: ReadonlyMap<string, W>,
): string | undefined {
  return wallsById.get(doorWallId)?.levelId;
}

/**
 * Build a `wallId → levelId` index from an iterable of walls.  Useful for
 * `levelOfDoor` callers that don't already have a Map.
 */
export function indexWallsById<W extends { readonly id: string; readonly levelId: string }>(
  walls: Iterable<W>,
): Map<string, W> {
  const out = new Map<string, W>();
  for (const w of walls) out.set(w.id, w);
  return out;
}
