// ─── MODIFICATION DECLARATION ───────────────────────────────────────────────
// §WALL-Y-DATUM — THE wall vertical datum authority (L-968, C84 §9).
//
// C84 §9 asked for "ONE wall-Y authority, not deduping the extrusion builders".
// This file is it. Before it existed, SIX expressions computed a wall-related
// world Y and no two of them were required to agree:
//
//   1. `WallFragmentBuilder.updateWall`  elevation + slabBaseOffset + baseOffset
//   2. the wall GROUP origin              (1), and then every body arm added
//                                         `baseOffset` AGAIN in group-local space
//   3. `WallInstanceBridge`               (1) + height/2 + baseOffset
//   4. `DoorBuilder` / `WindowBuilder`    elevation + sill + height/2
//   5. `WallJunctionInfill`               the wall BASELINE y
//   6. `SpatialAuthority`                 elevation + baseOffset (no slab)
//
// At zero offsets all six collapse to one number, which is why the divergence
// survived so long. At a 150 mm plinth they do not: a door sat
// `slabBaseOffset + 2 × wall.baseOffset` below the hole cut for it.
//
// ── THE TWO PLANES, NAMED ────────────────────────────────────────────────────
//
//   SEAT PLANE   = level.elevation + slabBaseOffset
//                  The finished floor the wall stands ON. It is the WALL GROUP's
//                  origin, because group-local geometry is authored in the
//                  documented convention `y ∈ [baseOffset, baseOffset + height]`
//                  (`WallHoleBodyBuilder.ts:26`, `MiterPrismBuilder.ts:99`,
//                  `CurvedWallLayerBuilder.ts:49`, `LayeredWallOpeningBuilder.ts:206`).
//
//   BASE PLANE   = SEAT PLANE + wall.baseOffset  ⟵ `wallBaseY()`
//                  The underside of the wall body in WORLD space. Everything that
//                  is NOT a child of the wall group — the instanced body, the
//                  junction infill, the hosted door/window leaves — measures from
//                  this, and must obtain it from here.
//
// The bug was seating the group on the BASE plane while its children were authored
// against the SEAT plane. `wallBaseY` is applied EXACTLY ONCE on every path now:
// once by the group transform for group-local geometry, once by this function for
// everything in world space.
//
// ── WHY A PUBLISHED REGISTRY AND NOT A PURE FUNCTION EVERYWHERE ──────────────
//
// `slabBaseOffset` is resolved by `SlabWallCoupling.resolveSlabBaseOffsetForWall`,
// which reads the SLAB store. `SlabWallCoupling`'s own contract forbids builders
// from calling it ("Builders must NOT call this function — that would violate the
// No-Store-Read invariant"), and `@pryzm/geometry-door` / `@pryzm/geometry-window`
// do not depend on `@pryzm/geometry-slab` at all. So a hosted leaf CANNOT re-derive
// the slab term, and any attempt to make it do so would be a second implementation
// of a number that already exists.
//
// Instead the ONE site that already resolves it — `WallFragmentBuilder.buildWall`,
// which receives the resolved `worldY` — PUBLISHES it here, and every world-space
// consumer READS it. One writer, many readers, one number.
//
// ── WHY A CHANGE NOTIFICATION ────────────────────────────────────────────────
//
// A publication that consumers only read at their own rebuild time is a race: the
// door tracker's cascade fires from `wallStore.update()`, which can run BEFORE the
// wall's geometry flush re-publishes. Subscribers are therefore notified when — and
// only when — the value actually CHANGES, so a hosted leaf re-anchors after the
// number it depends on has moved, never before. `slabBaseOffset` changes reach the
// leaves through the same channel, which nothing carried before.
//
// Layer: L1-ish pure module inside `@pryzm/geometry-wall`. No THREE, no DOM, no
// store reads, no I/O.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerce a possibly-`undefined` / non-finite offset to a usable number.
 *
 * §WALL-NAN-GUARD lineage — `wall.baseOffset` is optional and the generator/batch
 * paths leave it `undefined`; `undefined + n === NaN` used to seed NaN into every
 * vertex Y. Absence means "no offset", which IS zero here — unlike the context-data
 * family, a missing plinth is not an unknown plinth.
 */
function _finite(v: number | undefined | null): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * THE SEAT PLANE — the finished floor a wall stands on, in world space.
 *
 * This is the wall GROUP's origin. Group-local wall geometry is authored as
 * `y ∈ [baseOffset, baseOffset + height]`, so the group must NOT be seated on the
 * base plane or `baseOffset` lands twice (L-968 defect A).
 */
export function wallSeatY(
    levelElevation: number,
    slabBaseOffset: number | undefined,
): number {
    return _finite(levelElevation) + _finite(slabBaseOffset);
}

/**
 * THE BASE PLANE — the underside of the wall BODY in world space.
 *
 *     wallBaseY = level.elevation + slabBaseOffset + wall.baseOffset
 *
 * Identical to the expression at `WallFragmentBuilder.ts:745` and its restatement
 * in `WallRebuildCoordinator.ts:546`, which is deliberate: this function does not
 * introduce a new number, it NAMES the one that was already authoritative and was
 * then applied a second time by accident.
 */
export function wallBaseY(
    levelElevation: number,
    slabBaseOffset: number | undefined,
    wallBaseOffset: number | undefined,
): number {
    return wallSeatY(levelElevation, slabBaseOffset) + _finite(wallBaseOffset);
}

/**
 * The world-space CENTRE Y of a hosted leaf (door / window) in its own hole.
 *
 * `sillHeight` is measured from the host wall's BASE plane — which is what the
 * wall body's own carve does (`LayeredWallOpeningBuilder` cuts the void band at
 * group-local `baseOffset + sillHeight`), so the leaf and the hole are two
 * readings of ONE expression rather than two expressions kept in agreement.
 */
export function hostedLeafCentreY(
    hostWallBaseY: number,
    sillHeight: number,
    leafHeight: number,
): number {
    return hostWallBaseY + _finite(sillHeight) + _finite(leafHeight) / 2;
}

// ─── The published per-wall base plane ───────────────────────────────────────

const _baseY = new Map<string, number>();
type BaseYListener = (wallId: string, baseY: number) => void;
const _listeners = new Set<BaseYListener>();

/**
 * Records the resolved world BASE plane of a wall.
 *
 * Called by `WallFragmentBuilder.buildWall` with the same `resolvedY` it seats the
 * geometry from — never with a separately-derived value, or this file would become
 * the seventh rival datum instead of the one that retires the other six.
 *
 * @returns `true` when the value CHANGED (and listeners were notified).
 */
export function publishWallBaseY(wallId: string, baseY: number): boolean {
    if (!wallId || !Number.isFinite(baseY)) return false;
    const prev = _baseY.get(wallId);
    if (prev !== undefined && Math.abs(prev - baseY) < 1e-9) return false;
    _baseY.set(wallId, baseY);
    for (const l of _listeners) {
        try { l(wallId, baseY); } catch { /* a listener must not break a rebuild */ }
    }
    return true;
}

/**
 * The published world BASE plane of a wall, or `undefined` when the wall has not
 * been built yet.
 *
 * ⚠ `undefined` means NOT MEASURED, and callers MUST keep it distinguishable from
 * a measured `0` (§context-data-honesty). Do not `?? 0` this — fall back to the
 * best datum the caller itself can construct, and say so at the call site.
 */
export function resolveWallBaseY(wallId: string): number | undefined {
    return _baseY.get(wallId);
}

/**
 * The BASE plane of a wall, falling back to the level datum a hosted consumer can
 * see for itself when the host has never been built.
 *
 * The fallback omits `slabBaseOffset` — a consumer outside `@pryzm/geometry-wall`
 * has no lawful way to read the slab store — so it is NOT silently equivalent to
 * the published value. It is the honest best available and it is strictly closer
 * than the pre-L-968 expression, which omitted `wall.baseOffset` as well.
 */
export function resolveWallBaseYOrLevel(
    wallId: string,
    levelElevation: number,
    wallBaseOffset: number | undefined,
): number {
    const published = _baseY.get(wallId);
    if (published !== undefined) return published;
    return wallBaseY(levelElevation, 0, wallBaseOffset);
}

/** Drops a wall's published datum — called from the wall builder's removal path. */
export function forgetWallBaseY(wallId: string): void {
    _baseY.delete(wallId);
}

/** Test/project-teardown hook. */
export function clearWallBaseY(): void {
    _baseY.clear();
}

/**
 * Subscribe to base-plane changes. Returns the unsubscribe function.
 *
 * The hosted-element dependency trackers use this to re-anchor doors and windows
 * when their host wall's base plane moves — including when it moves because a SLAB
 * base offset changed, which no wall-record diff can see.
 */
export function onWallBaseYChanged(listener: BaseYListener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
}
