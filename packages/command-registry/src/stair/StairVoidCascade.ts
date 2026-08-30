// ─── §STAIR-VOID-FOLLOWS-SPAN (L-1532 / closes L-1432) ───────────────────────
//
// L-1432, filed by lane STAIR1 and left OPEN: **"move / param-change does not
// follow the new voids."**
//
// L-1431 made a stair pierce EVERY horizontal family (slab, floor finish,
// ceiling) and L-1433 made it pierce every DECK it rises through — but both
// fixes landed on `CreateStairCommand` only. Measured 2026-08-20:
//
//   • `MoveStairCommand`             — re-reconciles the SLAB void
//                                      (`reconcileStairOpening`) and NOTHING else.
//                                      `pierceStairHorizontalHosts` has zero call
//                                      sites in that file, so a moved stair drags
//                                      its slab void along and leaves its
//                                      floor-finish and ceiling voids at the old
//                                      footprint, permanently.
//   • `UpdateStairParametersCommand` — identical: slab only.
//   • Both declare `affectedStores = ["stair","opening","slab"]` — so even the
//     floor/ceiling mutations they DON'T make would have been invisible to the
//     scoped snapshot (C03 §4.6 U-2), which is the same undeclared-cascade defect
//     `CreateStairCommand`'s own declaration was widened for in L-1431.
//
// ⭐ AND A THIRD GAP THAT ONLY APPEARS ONCE THE LEVEL SPAN CAN CHANGE (L-1530's
// Task 2). `reconcileStairOpening` iterates the CURRENT derived deck set and
// carves/updates a void on each. It has no concept of a deck LEAVING the set.
// Re-point a Ground→L5 stair at L2 and the voids on L3, L4 and L5 stay cut, in
// slabs the stair no longer reaches — three permanent holes in three finished
// floors. The reconciler is right not to guess this on its own (L-581: never
// delete a void on a failed measure), so the deck-set DIFFERENCE is computed
// here, from the id convention, and only ids this stair actually owns are removed.
//
// ── WHAT THIS MODULE IS ──────────────────────────────────────────────────────
//
// ONE verb — "make this stair's void set match this stair" — shared by every
// command that moves or re-parameterises a stair. It is deliberately NOT a
// fourth copy of the deck derivation: it calls `stairPiercedLevelIds` through the
// two owners (`StairSlabOpeningReconciler`, `StairHorizontalHostPiercing`) that
// L-1433 already made agree, and adds only the subtraction neither of them owns.
//
// ── UNDO ─────────────────────────────────────────────────────────────────────
//
// The two halves undo differently, and the difference is not an inconsistency:
//
//   • SLAB openings are first-class `opening` elements with their own lifecycle,
//     so they are SNAPSHOTTED and restored byte-for-byte (the same choice
//     `DeleteStairCommand._healHostSlab` makes).
//   • FLOOR / CEILING pierces are DERIVED and carry no authored state — the
//     piercing module says so explicitly and `DeleteStairCommand.undo` relies on
//     it. They are closed and RE-DERIVED from the restored stair, because
//     replaying a snapshot of a derived value is how a stale copy gets written
//     over a live host.
//
// The caller must therefore restore the stair record BEFORE calling
// `undoStairVoidCascade`, and pass the restored record in. That ordering is the
// contract; it is asserted by the tests, not merely documented.

import { trace, type Tracer } from '@opentelemetry/api';
import type { CommandContext } from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import type { OpeningData } from '@pryzm/core-app-model';
import {
    reconcileStairOpening,
    undoStairOpeningReconcile,
    type StairFootprintSource,
    type StairOpeningReconcile,
} from './StairSlabOpeningReconciler';
import {
    pierceStairHorizontalHosts,
    unpierceStairHorizontalHosts,
    findStairHorizontalHostPierces,
    stairPiercedLevelIds,
    type StairHostPierce,
} from './StairHorizontalHostPiercing';
import { stairAutoOpeningId, isStairAutoOpeningId } from './stairOpeningId';

/** Everything one cascade did, and everything its inverse needs. */
export interface StairVoidCascade {
    /** Per-deck carve/update records from the slab reconciler. */
    readonly openingReconciles: readonly StairOpeningReconcile[];
    /**
     * Slab voids REMOVED because their deck left the stair's span. Full records,
     * so undo restores them exactly (they are authored elements, not derived).
     */
    readonly removedOpenings: readonly OpeningData[];
    /** Floor/ceiling voids this pass cut, so undo can close them again. */
    readonly cutPierces: readonly StairHostPierce[];
    /** How many were closed before re-cutting — a shortfall is reported, not swallowed. */
    readonly closedPierceCount: number;
}

export const EMPTY_STAIR_VOID_CASCADE: StairVoidCascade = {
    openingReconciles: [],
    removedOpenings: [],
    cutPierces: [],
    closedPierceCount: 0,
};

/** The stair fields every void owner reads. Exactly `StairFootprintSource` + the base level. */
export type StairVoidSource = StairFootprintSource & { readonly baseLevelId?: string };

/** Narrow a live `StairData` down to what the void owners consume. */
export function toStairVoidSource(stair: {
    id: string; shape: string; width: number; treadDepth: number;
    startPosition: unknown; flights: unknown; landings?: unknown;
    topLevelId: string; baseLevelId?: string;
}): StairVoidSource {
    return {
        id: stair.id,
        shape: stair.shape,
        width: stair.width,
        treadDepth: stair.treadDepth,
        startPosition: stair.startPosition,
        flights: stair.flights,
        landings: stair.landings,
        topLevelId: stair.topLevelId,
        baseLevelId: stair.baseLevelId,
    } as StairVoidSource;
}

/**
 * Make every void this stair owns — in EVERY horizontal family, on EVERY deck —
 * match the stair as it now is. Call AFTER the stair record has been mutated.
 *
 * Never throws: a family with no store contributes nothing, which is the correct
 * answer for a project that has none.
 */
export function cascadeStairVoids(ctx: CommandContext, stair: StairVoidSource): StairVoidCascade {
    return _tracer().startActiveSpan('pryzm.stair.cascadeVoids', (span) => {
        try {
            const openingReconciles = _reconcileSlabVoids(ctx, stair);
            const removedOpenings = _removeVoidsOnDecksThatLeft(ctx, stair);
            const { cutPierces, closedPierceCount } = _repierceHorizontalHosts(ctx, stair);
            span.setAttribute('pryzm.stair.id', stair.id);
            span.setAttribute('pryzm.stair.topLevelId', stair.topLevelId);
            span.setAttribute('pryzm.stair.baseLevelId', stair.baseLevelId ?? '');
            // All four legs are emitted separately. "Never throws: a family with
            // no store contributes nothing" means every one of these can be 0
            // for a legitimate reason; a single total would make an absent store
            // indistinguishable from a stair that pierces nothing.
            span.setAttribute('pryzm.stair.openingReconciles', openingReconciles.length);
            span.setAttribute('pryzm.stair.removedOpenings', removedOpenings.length);
            span.setAttribute('pryzm.stair.cutPierces', cutPierces.length);
            span.setAttribute('pryzm.stair.closedPierces', closedPierceCount);
            return { openingReconciles, removedOpenings, cutPierces, closedPierceCount };
        } finally {
            span.end();
        }
    });
}

// P8 / C10 §2 — same tracer idiom as `DeleteElementsBatchCommand.ts` /
// `moveReweldPreflight.ts` in this package (C84 EI-9: one tracer authority per
// package, never a second wrapper).
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/**
 * Reverse {@link cascadeStairVoids}. `restoredStair` MUST already be back in the
 * store — the floor/ceiling half re-derives from it (see the module header).
 */
export function undoStairVoidCascade(
    ctx: CommandContext,
    cascade: StairVoidCascade,
    restoredStair: StairVoidSource | null,
): void {
    try {
        undoStairOpeningReconcile(ctx, cascade.openingReconciles);
    } catch (err) {
        console.warn('[StairVoidCascade.undo] slab-void reconcile inverse failed (non-fatal):', err);
    }
    _restoreRemovedOpenings(ctx, cascade.removedOpenings);

    if (cascade.cutPierces.length > 0 || cascade.closedPierceCount > 0) {
        try {
            unpierceStairHorizontalHosts(ctx, cascade.cutPierces);
        } catch (err) {
            console.warn('[StairVoidCascade.undo] un-piercing failed (non-fatal):', err);
        }
        if (restoredStair) {
            try {
                const recut = pierceStairHorizontalHosts(ctx, restoredStair);
                if (recut.length !== cascade.closedPierceCount) {
                    // The same honesty `DeleteStairCommand.undo` applies: a shortfall is
                    // a real difference in the model, not a rounding error to hide.
                    console.warn(
                        `[StairVoidCascade.undo] re-cut ${recut.length} horizontal-host void(s) but the ` +
                        `forward pass had closed ${cascade.closedPierceCount} — a host was removed or moved ` +
                        `in between. The difference is NOT restored.`,
                    );
                }
            } catch (err) {
                console.warn('[StairVoidCascade.undo] horizontal-host re-cut failed (non-fatal):', err);
            }
        }
    }
}

// ─── internals ───────────────────────────────────────────────────────────────

function _reconcileSlabVoids(ctx: CommandContext, stair: StairVoidSource): StairOpeningReconcile[] {
    try {
        return reconcileStairOpening(ctx, stair);
    } catch (err) {
        console.warn('[StairVoidCascade] slab-void reconcile failed (non-fatal):', err);
        return [];
    }
}

/**
 * ⭐ THE SUBTRACTION. `reconcileStairOpening` only ever visits the decks the
 * stair rises through NOW, so a deck that LEFT the span keeps its void.
 *
 * The set of ids this stair is still entitled to is derived from the SAME
 * `stairPiercedLevelIds` the reconciler used and the SAME `stairAutoOpeningId`
 * convention the carve wrote — never from a stored list, which is how the owner
 * and the sweeper drift apart. Anything matching `isStairAutoOpeningId` for this
 * stair and NOT in that set is a void on a deck the stair no longer reaches.
 *
 * ⛔ A void belonging to a DIFFERENT stair, or a hand-placed opening, can never
 * match `isStairAutoOpeningId(id, thisStairId)` — that predicate is a whole-id or
 * `--<levelId>`-suffix match, deliberately not a bare `startsWith`.
 */
function _removeVoidsOnDecksThatLeft(ctx: CommandContext, stair: StairVoidSource): OpeningData[] {
    const stores = ctx.stores as any;
    const openingStore = stores.openingStore;
    const slabStore = stores.slabStore;
    if (!openingStore?.getAll) return [];

    const { levelIds } = stairPiercedLevelIds(ctx, stair);
    const entitled = new Set(levelIds.map(l => stairAutoOpeningId(stair.id, l, stair.topLevelId)));

    let mine: OpeningData[];
    try {
        mine = (openingStore.getAll() as OpeningData[]).filter(o => isStairAutoOpeningId(o.id, stair.id));
    } catch (err) {
        console.warn('[StairVoidCascade] opening sweep failed (non-fatal):', err);
        return [];
    }
    const stale = mine.filter(o => !entitled.has(o.id));
    if (stale.length === 0) return [];

    for (const opening of stale) {
        try { openingStore.remove(opening.id); } catch { /* §SWALLOW-SIDE-INDEX */ }
        try { ctx.bimManager?.unregisterElement?.(opening.id); } catch { /* §SWALLOW-SIDE-INDEX */ }
        try { elementRegistry.unregister(opening.id); } catch { /* §SWALLOW-SIDE-INDEX */ }
    }
    // Rebuild each host slab ONCE, never once per void.
    if (slabStore?.triggerRebuild) {
        for (const hostId of new Set(stale.map(o => o.hostId).filter(Boolean))) {
            try { slabStore.triggerRebuild(hostId as string); } catch { /* §SWALLOW-SIDE-INDEX */ }
        }
    }
    console.log(
        `[StairVoidCascade] stair ${stair.id}: closed ${stale.length} slab void(s) on deck(s) the stair no ` +
        `longer reaches — ${stale.map(o => o.id).join(', ')}`,
    );
    return stale;
}

function _restoreRemovedOpenings(ctx: CommandContext, removed: readonly OpeningData[]): void {
    if (removed.length === 0) return;
    const stores = ctx.stores as any;
    const openingStore = stores.openingStore;
    const slabStore = stores.slabStore;
    if (!openingStore?.add) return;
    for (const snap of removed) {
        try { ctx.bimManager?.registerElement?.(snap.id, (snap as any).levelId); } catch { /* side index */ }
        try { elementRegistry.registerSemantic(snap.id, 'opening'); } catch { /* side index */ }
        try { openingStore.add(snap); } catch (err) {
            console.warn('[StairVoidCascade.undo] could not restore opening', snap.id, err);
        }
    }
    if (slabStore?.triggerRebuild) {
        for (const hostId of new Set(removed.map(o => o.hostId).filter(Boolean))) {
            try { slabStore.triggerRebuild(hostId as string); } catch { /* side index */ }
        }
    }
}

/**
 * §L-1432's other half. Floor-finish and ceiling voids are found by the id
 * convention — NOT by re-deriving containment — so a stair that has already
 * moved has the void it ACTUALLY cut closed, not the one it would cut now. Then
 * the new set is cut from the stair as it is.
 */
function _repierceHorizontalHosts(
    ctx: CommandContext,
    stair: StairVoidSource,
): { cutPierces: StairHostPierce[]; closedPierceCount: number } {
    let closedPierceCount = 0;
    try {
        const existing = findStairHorizontalHostPierces(ctx, stair.id);
        closedPierceCount = existing.length;
        if (existing.length > 0) unpierceStairHorizontalHosts(ctx, existing);
    } catch (err) {
        console.warn('[StairVoidCascade] horizontal-host close failed (non-fatal):', err);
    }
    let cutPierces: StairHostPierce[] = [];
    try {
        cutPierces = pierceStairHorizontalHosts(ctx, stair);
    } catch (err) {
        console.warn('[StairVoidCascade] horizontal-host re-pierce failed (non-fatal):', err);
    }
    return { cutPierces, closedPierceCount };
}
