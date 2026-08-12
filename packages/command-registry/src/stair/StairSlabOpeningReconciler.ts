// ─── §FIX-STAIR-SLAB-OPENING-SYMMETRY ────────────────────────────────────────
//
// THE INVARIANT, stated once and owned here:
//
//     For every stair, the slab at the stair's TOP level — if one exists — carries
//     exactly ONE opening whose profile is that stair's plan footprint.
//
// The invariant is symmetric in time: it must hold whichever element was authored
// first. Before this module only ONE direction was implemented, inside
// `CreateStairCommand.createAutoOpening()`:
//
//   • slab first, then stair  →  hole carved.                       (worked)
//   • stair first, then slab  →  "[CreateStairCommand] Auto-opening skipped:
//                                 no slab on top level …" and NEVER revisited.
//
// The founder saw the second case: `CREATE_SLABS_ON_ALL_FLOORS` created two slabs
// over levels that already hosted stairs, and not one `opening-stair-*` element was
// produced — a slab sitting on top of a stair with no void through it.
//
// ── Why the rule lives HERE and not in both commands (C11 / C16) ──────────────
//
// Copying the carve into the slab path would give one invariant TWO
// implementations that can drift — the same disease as the L-215 per-element-type
// `if` ladder and the L-233 event allowlist. Instead both directions call the SAME
// function, so the footprint maths, the host-slab choice, the id convention
// (`stairAutoOpeningId`) and the registration sequence are literally one code path.
// A test can therefore assert the two directions produce an IDENTICAL profile
// rather than merely "an opening exists".
//
// Ownership: `CreateStairCommand` (scope `[stair, opening, slab]` — the coupling is
// already contract-visible) reconciles ONE stair; `CreateSlabCommand` reconciles
// EVERY stair whose top level is the new slab's level. Both mutate through their
// own command's execute/undo, so the openings are undoable as part of the command
// that produced them (P6) and are removed when it is undone.
//
// ── Performance (the founder asked for it explicitly) ────────────────────────
// Slab creation runs inside BatchCoordinator's suppressed window. The slab-side
// reconcile is therefore O(stairs on that level) with ONE `slabStore.triggerRebuild`
// for the whole set — never one rebuild per hole — so a slab that swallows N stairs
// still costs a SINGLE SlabFragmentBuilder pass inside the existing batch.

import { trace, type Tracer } from '@opentelemetry/api';
import { computeStairFootprintRect, worldXZToSlabLocal } from '@pryzm/geometry-stair';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { stairAutoOpeningId } from './stairOpeningId';
import type { CommandContext } from '../types';

let _tracerCache: Tracer | null = null;
function _tracer(): Tracer {
    _tracerCache ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _tracerCache;
}

/** The stair fields the footprint maths needs — satisfied by StairData and by CreateStairInput. */
export interface StairFootprintSource {
    readonly id: string;
    readonly shape: string;
    readonly width: number;
    readonly treadDepth: number;
    readonly startPosition: { x: number; y: number; z: number };
    readonly flights: readonly unknown[];
    readonly landings?: readonly unknown[];
    readonly topLevelId: string;
}

export interface StairOpeningCarve {
    readonly openingId: string;
    readonly hostSlabId: string;
}

/**
 * Choose which slab on the stair's top level hosts the void: the one whose centre
 * is nearest the stair footprint's centroid. Extracted so both directions pick the
 * SAME slab given the same inputs.
 */
function resolveHostSlab(candidates: any[], cx: number, cz: number): any {
    let host = candidates[0];
    let bestD2 = Infinity;
    for (const s of candidates) {
        const dx = s.position.x - cx;
        const dz = s.position.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; host = s; }
    }
    return host;
}

/**
 * Carve (or confirm) the auto-opening for ONE stair. Returns the carve, or null when
 * the invariant is already satisfied or cannot be satisfied yet (no slab above).
 *
 * IDEMPOTENT by the shared id convention: if `opening-stair-<id>` already exists the
 * function is a no-op, so calling it from both directions can never double-carve.
 *
 * `triggerRebuild = false` lets a caller carve N openings and pay for ONE slab
 * rebuild afterwards (the batch path).
 */
export function carveStairOpening(
    ctx: CommandContext,
    stair: StairFootprintSource,
    opts: { triggerRebuild?: boolean } = {},
): StairOpeningCarve | null {
    const span = _tracer().startSpan('pryzm.stair.carve-slab-opening', {
        attributes: { 'pryzm.stair.id': stair.id, 'pryzm.level.id': stair.topLevelId },
    });
    try {
        const stores = ctx.stores as any;
        const slabStore = stores.slabStore;
        const openingStore = stores.openingStore;
        if (!slabStore || !openingStore) {
            span.setAttribute('pryzm.carve.skipped', 'no-stores');
            return null;
        }

        const openingId = stairAutoOpeningId(stair.id);
        // Already satisfied — the invariant says EXACTLY ONE opening per stair.
        if (openingStore.get?.(openingId) ?? openingStore.getById?.(openingId)) {
            span.setAttribute('pryzm.carve.skipped', 'already-present');
            return null;
        }

        const candidates = slabStore.getAll().filter((s: any) => s.levelId === stair.topLevelId);
        if (candidates.length === 0) {
            // NOT an error: the slab may simply not exist yet. The slab-side
            // reconcile picks this stair up the moment one is created.
            span.setAttribute('pryzm.carve.skipped', 'no-slab-on-top-level');
            return null;
        }

        const rect = computeStairFootprintRect({
            shape: stair.shape as any,
            width: stair.width,
            treadDepth: stair.treadDepth,
            startPosition: stair.startPosition,
            flights: stair.flights as any,
            landings: stair.landings as any,
        });
        if (!rect) {
            console.warn(`[StairSlabOpeningReconciler] degenerate footprint for stair ${stair.id} — no opening carved`);
            span.setAttribute('pryzm.carve.skipped', 'degenerate-footprint');
            return null;
        }

        const cx = (rect[0].x + rect[1].x + rect[2].x + rect[3].x) / 4;
        const cz = (rect[0].z + rect[1].z + rect[2].z + rect[3].z) / 4;
        const host = resolveHostSlab(candidates, cx, cz);

        const profile = rect.map(p => worldXZToSlabLocal(p, host.position));

        const opening = {
            id: openingId,
            type: 'opening' as const,
            hostId: host.id,
            levelId: stair.topLevelId,
            parentId: host.id,
            profile,
            baseOffset: 0,
            properties: {},
        };

        try {
            ctx.bimManager.registerElement(openingId, stair.topLevelId);
        } catch (e: any) {
            console.warn('[StairSlabOpeningReconciler] bimManager.registerElement failed:', e?.message);
        }
        try {
            elementRegistry.registerSemantic(openingId, 'opening');
        } catch {
            // already registered (redo path) — safe
        }
        openingStore.add(opening as any);
        if (opts.triggerRebuild !== false) slabStore.triggerRebuild(host.id);

        span.setAttribute('pryzm.opening.id', openingId);
        span.setAttribute('pryzm.slab.id', host.id);
        return { openingId, hostSlabId: host.id };
    } finally {
        span.end();
    }
}

/**
 * DIRECTION B — a slab was just created: satisfy the invariant for every stair whose
 * TOP level is this slab's level.
 *
 * Cost is O(stairs on that level) and ends in exactly ONE `slabStore.triggerRebuild`
 * for the whole set, so a slab that swallows N stairs is still one
 * SlabFragmentBuilder pass inside the caller's existing batch window.
 *
 * Returns the carves performed, so the calling command can undo them.
 */
export function reconcileStairOpeningsForSlab(
    ctx: CommandContext,
    slabId: string,
    levelId: string,
): StairOpeningCarve[] {
    const span = _tracer().startSpan('pryzm.stair.reconcile-openings-for-slab', {
        attributes: { 'pryzm.slab.id': slabId, 'pryzm.level.id': levelId },
    });
    try {
        const stores = ctx.stores as any;
        const stairStore = stores.stairStore;
        const slabStore = stores.slabStore;
        if (!stairStore?.getAll || !slabStore) {
            span.setAttribute('pryzm.reconcile.skipped', 'no-stores');
            return [];
        }

        const stairs = (stairStore.getAll() as any[]).filter(s => s.topLevelId === levelId);
        span.setAttribute('pryzm.reconcile.candidate_stairs', stairs.length);
        if (stairs.length === 0) return [];

        const carves: StairOpeningCarve[] = [];
        for (const stair of stairs) {
            // triggerRebuild deferred — ONE rebuild for the whole set, below.
            const carve = carveStairOpening(ctx, stair as StairFootprintSource, { triggerRebuild: false });
            if (carve) carves.push(carve);
        }

        if (carves.length > 0) {
            // The carves may in principle land on different slabs when a level hosts
            // several; rebuild each host once, not once per opening.
            for (const hostId of new Set(carves.map(c => c.hostSlabId))) {
                slabStore.triggerRebuild(hostId);
            }
            console.log(
                `[StairSlabOpeningReconciler] slab ${slabId} on level "${levelId}" — ` +
                `carved ${carves.length} stair opening(s) in ${new Set(carves.map(c => c.hostSlabId)).size} rebuild(s)`,
            );
        }
        span.setAttribute('pryzm.reconcile.carved', carves.length);
        return carves;
    } finally {
        span.end();
    }
}

/**
 * The before/after record of ONE stair's opening reconcile, sufficient to make the
 * void change part of the SAME undo unit as the stair mutation that caused it
 * (`undoStairOpeningReconcile`). `before === null` means the reconcile CARVED a new
 * opening; `after === null` never happens today (a reconcile never deletes — see the
 * L-581 lesson: deleting a void on a failed measure is catastrophic) but is kept in
 * the shape so a future legitimate remove path can reuse the same undo helper.
 */
export interface StairOpeningReconcile {
    readonly openingId: string;
    /** Deep-cloned opening state BEFORE the reconcile; null = did not exist. */
    readonly before: Record<string, any> | null;
    /** Deep-cloned opening state AFTER the reconcile; null = does not exist. */
    readonly after: Record<string, any> | null;
}

function profilesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function readOpening(openingStore: any, id: string): any {
    return openingStore.get?.(id) ?? openingStore.getById?.(id) ?? null;
}

/**
 * §FIX-STAIR-MOVE-STRANDS-VOID (review C-02) — a stair MOVED or PARAMETRICALLY
 * changed after creation. `carveStairOpening` is idempotent by `opening-stair-<id>`,
 * so on its own it leaves the auto-carved void at the OLD footprint forever. This
 * function updates-or-recarves the opening KEYED BY THE SAME ID:
 *
 *   • no opening yet          → delegate to `carveStairOpening` (a move can bring a
 *                               stair under a slab it never had a void in).
 *   • opening exists, footprint
 *     unchanged               → strict no-op (returns null; the void is untouched —
 *                               a rename/fire-rating edit must never rebuild a slab).
 *   • opening exists, footprint
 *     changed                 → update the SAME opening in place (never mint a second
 *                               void — that is the pre-W1-1 double-carve bug) and
 *                               rebuild old + new host slabs.
 *
 * Returns the before/after record the calling command must keep for its undo(), or
 * null when nothing changed.
 */
export function reconcileStairOpening(
    ctx: CommandContext,
    stair: StairFootprintSource,
    opts: { triggerRebuild?: boolean } = {},
): StairOpeningReconcile | null {
    const span = _tracer().startSpan('pryzm.stair.reconcile-opening', {
        attributes: { 'pryzm.stair.id': stair.id, 'pryzm.level.id': stair.topLevelId },
    });
    try {
        const stores = ctx.stores as any;
        const slabStore = stores.slabStore;
        const openingStore = stores.openingStore;
        if (!slabStore || !openingStore) {
            span.setAttribute('pryzm.reconcile.skipped', 'no-stores');
            return null;
        }

        const openingId = stairAutoOpeningId(stair.id);
        const existing = readOpening(openingStore, openingId);

        if (!existing) {
            // Same as the create direction: carve if (and only if) a slab is above.
            const carve = carveStairOpening(ctx, stair, opts);
            if (!carve) return null;
            const after = readOpening(openingStore, openingId);
            span.setAttribute('pryzm.reconcile.outcome', 'carved');
            return { openingId, before: null, after: structuredClone(after) };
        }

        const candidates = slabStore.getAll().filter((s: any) => s.levelId === stair.topLevelId);
        if (candidates.length === 0) {
            // The host slab is gone (cannot result from a stair move) — leave the
            // existing void alone rather than guess.
            span.setAttribute('pryzm.reconcile.skipped', 'no-slab-on-top-level');
            return null;
        }

        const rect = computeStairFootprintRect({
            shape: stair.shape as any,
            width: stair.width,
            treadDepth: stair.treadDepth,
            startPosition: stair.startPosition,
            flights: stair.flights as any,
            landings: stair.landings as any,
        });
        if (!rect) {
            // Never delete a void on a failed measure (L-581): warn and leave it.
            console.warn(`[StairSlabOpeningReconciler] degenerate footprint for stair ${stair.id} — existing opening left untouched`);
            span.setAttribute('pryzm.reconcile.skipped', 'degenerate-footprint');
            return null;
        }

        const cx = (rect[0].x + rect[1].x + rect[2].x + rect[3].x) / 4;
        const cz = (rect[0].z + rect[1].z + rect[2].z + rect[3].z) / 4;
        const host = resolveHostSlab(candidates, cx, cz);
        const profile = rect.map(p => worldXZToSlabLocal(p, host.position));

        const unchanged =
            host.id === existing.hostId &&
            existing.levelId === stair.topLevelId &&
            profilesEqual(profile, existing.profile);
        if (unchanged) {
            // Footprint-unchanged edit (name, fire rating, …): the void is NOT touched.
            span.setAttribute('pryzm.reconcile.outcome', 'unchanged');
            return null;
        }

        const before = structuredClone(existing);
        const updates = { hostId: host.id, parentId: host.id, levelId: stair.topLevelId, profile };
        if (typeof openingStore.update === 'function') {
            openingStore.update(openingId, updates);
        } else {
            // Test doubles / minimal stores: replace under the SAME id.
            openingStore.remove?.(openingId);
            openingStore.add({ ...existing, ...updates });
        }
        const after = structuredClone(readOpening(openingStore, openingId) ?? { ...existing, ...updates });

        if (opts.triggerRebuild !== false) {
            for (const hostId of new Set([before.hostId, host.id])) {
                if (slabStore.getById?.(hostId)) slabStore.triggerRebuild(hostId);
            }
        }

        span.setAttribute('pryzm.reconcile.outcome', 'updated');
        span.setAttribute('pryzm.opening.id', openingId);
        span.setAttribute('pryzm.slab.id', host.id);
        return { openingId, before, after };
    } finally {
        span.end();
    }
}

/**
 * Revert ONE `reconcileStairOpening` result — called from the OWNING command's
 * undo() so the void change reverts inside the SAME undo unit as the stair
 * mutation. No-ops on null (the reconcile changed nothing).
 */
export function undoStairOpeningReconcile(
    ctx: CommandContext,
    rec: StairOpeningReconcile | null,
): void {
    if (!rec) return;
    const stores = ctx.stores as any;
    const openingStore = stores.openingStore;
    const slabStore = stores.slabStore;
    if (!openingStore) return;

    const current = readOpening(openingStore, rec.openingId);
    try {
        if (rec.before === null) {
            // The reconcile carved a fresh opening — undo removes it (mirrors
            // removeStairOpenings, including the side indexes).
            if (current) {
                openingStore.remove?.(rec.openingId);
                try { ctx.bimManager.unregisterElement?.(rec.openingId); } catch { /* side-index only */ }
                try { elementRegistry.unregister(rec.openingId); } catch { /* side-index only */ }
            }
        } else if (typeof openingStore.update === 'function' && current) {
            openingStore.update(rec.openingId, {
                hostId: rec.before.hostId,
                parentId: rec.before.parentId,
                levelId: rec.before.levelId,
                profile: rec.before.profile,
            });
        } else {
            if (current) openingStore.remove?.(rec.openingId);
            openingStore.add(structuredClone(rec.before));
        }
    } catch (err) {
        console.warn('[StairSlabOpeningReconciler] reconcile undo failed (non-fatal):', err);
    }

    const hosts = new Set<string>();
    if (rec.before?.hostId) hosts.add(rec.before.hostId);
    if (rec.after?.hostId) hosts.add(rec.after.hostId);
    for (const hostId of hosts) {
        if (slabStore?.getById?.(hostId)) slabStore.triggerRebuild(hostId);
    }
}

/**
 * Undo the carves a command performed, restoring the pre-command state.
 * Mirrors `DeleteStairCommand`'s heal path so a slab undo never leaves an orphan
 * opening whose host slab is gone.
 */
export function removeStairOpenings(ctx: CommandContext, carves: readonly StairOpeningCarve[]): void {
    if (carves.length === 0) return;
    const stores = ctx.stores as any;
    const openingStore = stores.openingStore;
    const slabStore = stores.slabStore;
    if (!openingStore) return;

    for (const { openingId } of carves) {
        try {
            openingStore.remove?.(openingId);
            ctx.bimManager.unregisterElement?.(openingId);
            elementRegistry.unregister(openingId);
        } catch (err) {
            console.warn('[StairSlabOpeningReconciler] opening cleanup failed (non-fatal):', err);
        }
    }
    // The host slabs are being removed by the same undo in the slab direction, so a
    // rebuild is only needed for hosts that still exist.
    for (const hostId of new Set(carves.map(c => c.hostSlabId))) {
        if (slabStore?.getById?.(hostId)) slabStore.triggerRebuild(hostId);
    }
}
