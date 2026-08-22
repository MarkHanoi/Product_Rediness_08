/**
 * balconyProfileBridge — §FEAT-BALCONY-COMPOUND (L-5607) · C103 §4.3 · ADR-0333 §6.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S LAST SENTENCE, WIRED TO THE FEATURE HE NAMED.
 * ═══════════════════════════════════════════════════════════════════════════════
 *   *"The slab will be a rectangle by default, but as we do with the EDIT PROFILE
 *    feature, the user could after change the shape, and the floor finish and
 *    railings should adapt."*
 *
 * `balcony.updateProfile` already re-derives all three members from one polygon, in
 * one undo entry. This file is the only thing between that command and the gesture a
 * person actually makes.
 *
 * ─── THE SEAM, MEASURED RATHER THAN ASSUMED ────────────────────────────────────
 * "Edit Profile" is `SlabProfileEditor` → `UpdateSlabPolygonCommand`
 * (`packages/command-registry/src/slabs/`), and that command writes the LEGACY
 * `slabStore`, then relies on the store's own `bim-slab-updated` DOM event to drive
 * the rebuild (its §01 R-2 note: *"the builder is triggered exclusively by the
 * `bim-slab-updated` DOM event"*). It knows nothing about compounds, and there is no
 * reason it should.
 *
 * So the balcony listens for that event and asks ONE question: **is this slab a
 * balcony's plate?** If it is, the new outline is pushed back through
 * `balcony.updateProfile`, which re-derives the finish and the railings.
 *
 * ─── ⚠ WHAT THIS IS AND IS NOT ────────────────────────────────────────────────
 * ⭐ WITHIN THE COMPOUND, THE PROPAGATION IS A DERIVATION: one polygon in,
 * three members recomputed, no diffing, no second polygon that can be stale.
 *
 * ⛔ BUT THIS BRIDGE ITSELF IS A **SYNC EDGE**, and calling it a derivation would be
 * a lie. The Edit-Profile gesture writes the LEGACY slab record; the balcony's
 * authority is the PLUGIN balcony record; and those are two stores that this repo
 * already knows can diverge (the "detached-DTO-mirror condition"). A derived-at-READ
 * design — where the finish and rails are computed on demand from the balcony's
 * boundary — is not available today, because the renderer reads `Floor.boundary` and
 * `Handrail.path` out of the stores; making it available means teaching three mesh
 * builders to derive, which is a much larger change than this lane.
 *
 * The residual risk is therefore NAMED rather than hidden: if a slab's polygon is
 * changed by a path that does NOT emit `bim-slab-updated`, the finish and railings do
 * not follow. That is recorded as L-5615, and it is why the sync is keyed on the
 * STORE EVENT (which every writer of that store fires) rather than on the
 * `UpdateSlabPolygonCommand` class (which only one writer uses).
 *
 * ─── DEPENDENCY-INJECTED ON PURPOSE ────────────────────────────────────────────
 * Everything this module needs arrives through `BalconyProfileBridgeDeps`, so the
 * DECISION half — "is this a balcony plate, and what payload does it deserve?" — is
 * a pure function that a unit test can exercise without a DOM, a store or a bus.
 * `attach()` is the only part that touches `window`, and it is three lines.
 */

import { trace } from '@opentelemetry/api';
import { createId } from '@pryzm/schemas';
import { resolveFreeEdges, type HostWallSegment } from '@pryzm/geometry-balcony';

const _tracer = trace.getTracer('@pryzm/editor.balcony-profile-bridge', '0.1.0');

/** The narrowest view of a balcony record this bridge needs. */
export interface BalconyRecordLike {
  readonly id: string;
  readonly childrenIds: readonly string[];
  readonly hostWallId?: string;
}

/** The narrowest view of a wall this bridge needs, to re-resolve the host segment. */
export interface WallRecordLike {
  readonly id: string;
  readonly baseLine?: ReadonlyArray<{ x: number; z: number }>;
}

export interface BalconyProfileBridgeDeps {
  /** Every balcony currently in the model. */
  readonly balconies: () => readonly BalconyRecordLike[];
  /** Resolve a wall by id, for the host centreline. */
  readonly wallById: (id: string) => WallRecordLike | undefined;
  /** The legacy slab's CURRENT polygon, `{x, y}` with y carrying world Z. */
  readonly slabPolygon: (slabId: string) => ReadonlyArray<{ x: number; y: number }> | undefined;
  /** Dispatch a bus command. */
  readonly dispatch: (type: string, payload: unknown) => Promise<unknown> | unknown;
  /** Mint an id. Injected so a test can make the payload deterministic. */
  readonly mintRailingId?: () => string;
}

/** What the bridge decided to do about one `bim-slab-updated` event. */
export type BalconyProfileDecision =
  | { readonly kind: 'not-a-balcony' }
  /** The slab IS a balcony member, but not its PLATE (childrenIds[0]). */
  | { readonly kind: 'not-the-plate'; readonly balconyId: string }
  /** The plate's polygon could not be read, so nothing is guessed. */
  | { readonly kind: 'no-polygon'; readonly balconyId: string }
  /** The outline is degenerate — the command would refuse it anyway. */
  | { readonly kind: 'degenerate'; readonly balconyId: string }
  | {
      readonly kind: 'update';
      readonly balconyId: string;
      readonly payload: {
        readonly balconyId: string;
        readonly boundary: ReadonlyArray<{ x: number; y: number; z: number }>;
        readonly hostSegment?: HostWallSegment;
        readonly addedRailingIds?: readonly string[];
      };
    };

/** The minimum ring a balcony can have. A topology fact, not a dimension. */
const MIN_RING = 3;

/**
 * DECIDE what a `bim-slab-updated` on `slabId` means for the balcony compound.
 *
 * ⭐ PURE. No DOM, no store writes, no dispatch. This is the half worth testing, and
 * splitting it out is what makes it testable at all — the alternative (a single
 * `_onSlabUpdated` that reads globals and dispatches) is only observable through the
 * side effects it causes, which is how bridges in this repo have historically shipped
 * untested.
 *
 * P8: emits `pryzm.balcony.decide_profile_update`.
 */
export function decideBalconyProfileUpdate(
  slabId: string,
  deps: BalconyProfileBridgeDeps,
): BalconyProfileDecision {
  return _tracer.startActiveSpan('pryzm.balcony.decide_profile_update', (span) => {
    try {
      span.setAttribute('pryzm.balcony.slab_id', slabId);

      const owner = deps.balconies().find((b) => b.childrenIds.includes(slabId));
      if (!owner) {
        span.setAttribute('pryzm.balcony.decision', 'not-a-balcony');
        return { kind: 'not-a-balcony' } as const;
      }
      span.setAttribute('pryzm.balcony.id', owner.id);

      // ⚠ ONLY THE PLATE DRIVES THE COMPOUND. `childrenIds[0]` is the slab by
      // construction (`CreateBalcony` writes `[slabId, floorId, ...railingIds]`). A
      // balcony can own exactly one slab, so an event for any OTHER member id means
      // something else changed and re-deriving from it would be wrong.
      if (owner.childrenIds[0] !== slabId) {
        span.setAttribute('pryzm.balcony.decision', 'not-the-plate');
        return { kind: 'not-the-plate', balconyId: owner.id } as const;
      }

      const poly = deps.slabPolygon(slabId);
      if (!poly || poly.length < MIN_RING) {
        // ⛔ ABSENT IS NOT EMPTY. A polygon this bridge cannot read is NOT "a balcony
        // with no outline" — re-deriving from a guess would collapse a real balcony.
        // [[context-data-honesty-family]].
        span.setAttribute('pryzm.balcony.decision', 'no-polygon');
        return { kind: 'no-polygon', balconyId: owner.id } as const;
      }

      // The legacy slab polygon is `{x, y}` with y carrying WORLD Z (the plan
      // convention `UpdateSlabPolygonCommand` writes and `slabEditorTarget` reads).
      // The balcony boundary is `{x, y, z}` with y carrying the LEVEL DATUM. Getting
      // this wrong lays the balcony flat in the XY plane, so the mapping is written
      // once, here, and nowhere else.
      const boundary = poly.map((p) => ({ x: p.x, y: 0, z: p.y }));

      let area2 = 0;
      for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i]!;
        const b = boundary[(i + 1) % boundary.length]!;
        area2 += a.x * b.z - b.x * a.z;
      }
      if (Math.abs(area2 / 2) < 0.01) {
        // The same 0.01 m² floor `UpdateSlabPolygonCommand.canExecute` and the
        // `Balcony` schema both apply. Refusing here costs one rejected dispatch
        // rather than an exception the user sees seconds later with no context.
        span.setAttribute('pryzm.balcony.decision', 'degenerate');
        return { kind: 'degenerate', balconyId: owner.id } as const;
      }

      // ⭐ THE HOST IS RE-RESOLVED, NEVER REMEMBERED. The wall may have moved since
      // the balcony was placed, and the free-edge rule must be measured against where
      // the wall IS. This is the same reason there is no `hostEdgeIndex` field.
      const wall = owner.hostWallId ? deps.wallById(owner.hostWallId) : undefined;
      const bl = wall?.baseLine;
      const hostSegment: HostWallSegment | undefined =
        bl && bl.length >= 2
          ? { a: { x: bl[0]!.x, z: bl[0]!.z }, b: { x: bl[1]!.x, z: bl[1]!.z } }
          : undefined;

      // How many railings does the NEW shape need, and how many does the balcony
      // already have? Only the SHORTFALL needs fresh ids — the survivors are reused
      // by `UpdateBalconyProfileHandler` precisely so their per-member edits live.
      const need = resolveFreeEdges(boundary, hostSegment).length;
      const have = Math.max(owner.childrenIds.length - 2, 0);
      const mint = deps.mintRailingId ?? (() => createId('handrail') as string);
      const addedRailingIds =
        need > have ? Array.from({ length: need - have }, () => mint()) : undefined;

      span.setAttribute('pryzm.balcony.decision', 'update');
      span.setAttribute('pryzm.balcony.free_edges', need);
      span.setAttribute('pryzm.balcony.existing_rails', have);
      return {
        kind: 'update',
        balconyId: owner.id,
        payload: {
          balconyId: owner.id,
          boundary,
          ...(hostSegment ? { hostSegment } : {}),
          ...(addedRailingIds ? { addedRailingIds } : {}),
        },
      } as const;
    } finally {
      span.end();
    }
  });
}

/**
 * Act on one `bim-slab-updated`. Returns the decision so a caller (and a test) can
 * see what happened rather than inferring it from side effects.
 */
export function handleSlabUpdated(
  slabId: string,
  deps: BalconyProfileBridgeDeps,
): BalconyProfileDecision {
  const decision = decideBalconyProfileUpdate(slabId, deps);
  if (decision.kind !== 'update') return decision;

  const result = deps.dispatch('balcony.updateProfile', decision.payload);
  void Promise.resolve(result).catch((e: unknown) => {
    // ⭐ SURFACE THE REASON. A compound whose members silently stopped following its
    // plate is precisely the C84 §8.i defect, and a swallowed rejection is how it
    // would go unnoticed.
    console.error(
      '[balconyProfileBridge] balcony.updateProfile failed after a slab profile edit — ' +
        'the finish and railings may no longer match the plate:',
      e instanceof Error ? e.message : String(e),
    );
  });
  return decision;
}

/**
 * Wire the bridge to the live `bim-slab-updated` event.
 *
 * ⚠ RE-ENTRANCY. `balcony.updateProfile` writes the PLUGIN slab store; the legacy
 * store is written by `UpdateSlabPolygonCommand`. Those are different stores, so the
 * command this bridge dispatches does NOT itself re-fire `bim-slab-updated` and there
 * is no loop today. A guard is kept anyway, because "there is no loop today" is a
 * statement about the current wiring rather than an invariant, and an infinite
 * dispatch loop is not a failure mode worth discovering in production.
 *
 * @returns a dispose function.
 */
export function attachBalconyProfileBridge(deps: BalconyProfileBridgeDeps): () => void {
  let inFlight = false;
  const onSlabUpdated = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { id?: string; slab?: { id?: string } } | undefined;
    const slabId = detail?.id ?? detail?.slab?.id;
    if (!slabId || inFlight) return;
    inFlight = true;
    try {
      handleSlabUpdated(slabId, deps);
    } finally {
      inFlight = false;
    }
  };
  window.addEventListener('bim-slab-updated', onSlabUpdated);
  console.log('[balconyProfileBridge] §FEAT-BALCONY-COMPOUND — profile-edit bridge attached.');
  return () => window.removeEventListener('bim-slab-updated', onSlabUpdated);
}
