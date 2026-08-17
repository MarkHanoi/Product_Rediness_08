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
import type { Patch } from 'immer';
import { computeStairFootprintRect, worldXZToSlabLocal } from '@pryzm/geometry-stair';
import { pointInPolygonXY } from '@pryzm/geometry-kernel';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { producePatchedSlice, applyPatchesToSlice } from '../PatchSnapshot';
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

// ─── §FIX-STAIR-VOID-WRONG-SLAB (L-949) ──────────────────────────────────────
//
// THE DEFECT THIS SECTION EXISTS TO CLOSE, founder-measured:
//   "I was expecting the slab to have a void, but it doesn't … I see a rectangle
//    for cutting the slab, but it doesn't really cut."
//
// The void WAS created. Into the WRONG SLAB:
//   [CreateStairCommand] Auto-opening opening-stair-… created on slab
//                        slab-dup-cmd-dup-fp-…-0-0
//   [SlabFragmentBuilder] opening holes slabId="slab-dup-…-0-0" count=2
// …while the slabs the founder clicks are two OTHER ids. The CSG ran; it cut a
// slab nobody was looking at, so the slab the stair passes through stayed solid
// and only the opening's outline was drawn on it.
//
// `resolveHostSlab` used to pick the candidate whose `position` was NEAREST the
// footprint centroid, and NEVER asked whether the footprint was INSIDE the slab.
// Nearest-centre is only correct for convex, well-separated slabs. It fails on
// the founder's model for two compounding reasons:
//
//   1. The building is L-SHAPED, so a slab's centroid can lie OUTSIDE its own
//      footprint — in the notch of the L — and a smaller or DUPLICATED slab's
//      centre is then nearer to the stair than the centre of the slab the stair
//      truly stands on.
//   2. `SlabData.position` is (0,0,0) for every slab authored through SlabTool /
//      CreateSlabCommand (SlabFragmentBuilder's own comment: "data.position.x/z
//      is always 0 … the centroid of the polygon IS the desired world pivot"),
//      so on a normal project "nearest centre" degenerates to "nearest the
//      project origin" — i.e. a tie between all slabs, won by whichever the
//      store happens to list first.
//
// The determination is now CONTAINMENT (C15: the host of a hosted element is
// determined, not guessed).
//
// ── WHICH PROBE, AND WHY (the choice is on the record, not implicit) ──────────
//
// PRIMARY PROBE = THE FOOTPRINT CENTRE. It is the architecturally meaningful
// point: the void exists so the stair has clear headroom where it passes through
// the slab, and where it passes through is where its centre is. A centre inside
// slab S means the stair stands on S, whatever its corners do.
//
// FALLBACK PROBE = THE FOUR FOOTPRINT CORNERS, and only when the centre is
// inside nothing. A stair whose centre sits just off a slab edge while its body
// overhangs onto the slab is a REAL architectural condition (a stair landing
// against an opening, a run starting at a slab edge). Refusing there would turn
// "the centre missed" into "no void at all" — a regression with a containment
// argument attached. So the corner count breaks the tie among candidates that
// contain no centre, and the centre outranks ANY number of corners.
//
// NOT ATTEMPTED, deliberately: true polygon-clipping of the footprint against
// each slab (largest overlap AREA wins). It would decide the same host in every
// case these five probe points decide, at the cost of a polygon-boolean per
// candidate per carve, and the cases where it differs are cases where the answer
// is genuinely ambiguous and a human should be asked. Slab `holes` are likewise
// not subtracted: a stair standing over an existing hole is a void inside a void
// and needs its own decision, not a silent one taken here.
//
// ── WHY "NO OUTLINE" IS NOT "DOES NOT CONTAIN" (§L-942) ──────────────────────
// A slab can carry a parametric `sketch` instead of a static `polygon`, and
// resolving one needs `WallFaceResolver` (and would make this module import
// `SlabFragmentBuilder` — geometry-slab depends on command-registry, so that
// edge is a module-load cycle, not merely heavy). Such a slab's outline is
// UNKNOWN, and unknown is not "outside": treating it as a non-container would
// make every sketch-backed slab refuse. Candidates with no resolvable outline
// are therefore kept as a separate bucket and, only when NO measured candidate
// contains anything, the legacy nearest-centre rule picks among THOSE — never
// among candidates measured and ruled out.

/** The centre outranks any number of corners: 4 corners can never reach 100. */
const CENTRE_PROBE_WEIGHT = 100;

/** How the host was determined — recorded on the span so a carve can be audited. */
type HostSlabBasis =
    /** The footprint CENTRE is inside this slab. */
    | 'contains-centre'
    /** The centre is inside no slab; this slab holds the most footprint CORNERS. */
    | 'overlaps-corners'
    /** No candidate outline was resolvable; legacy nearest-centre among those. */
    | 'no-outline-nearest-centre';

interface HostSlabResolution {
    /** null ⇒ every candidate outline was measurable and none contains the stair. */
    readonly host: any | null;
    readonly basis: HostSlabBasis | 'none-contains';
    /** Ids of the candidates whose outline WAS measurable — what the refusal can cite. */
    readonly measuredIds: readonly string[];
}

/**
 * The slab's outline as stored: `SlabData.polygon` is `{x, y}` with `y` carrying
 * worldZ, expressed relative to `slab.position`. Returns null when the slab has
 * no static polygon (sketch-backed or legacy record) — UNKNOWN, not empty.
 *
 * A polygon with no `position` to anchor it is ALSO unknown, not "at the origin":
 * assuming (0,0) would place the outline somewhere it may not be and then rule
 * the stair out against that fiction. Unmeasurable is the honest verdict, and it
 * routes the slab to the nearest-centre escape hatch instead of a false refusal.
 */
function slabOutline(slab: any): ReadonlyArray<{ x: number; y: number }> | null {
    const poly = slab?.polygon;
    if (!Array.isArray(poly) || poly.length < 3) return null;
    const pos = slab?.position;
    if (typeof pos?.x !== 'number' || typeof pos?.z !== 'number') return null;
    return poly;
}

/**
 * Is world-XZ point `p` inside `slab`'s outline? The world→slab-local conversion
 * is `worldXZToSlabLocal` — literally the same function that writes the opening
 * profile below, so the probe and the carve can never disagree about the frame.
 * The predicate is the canonical C73 §3.1 body (`pointInPolygonXY`), not a rival.
 */
function slabContains(
    slab: any,
    outline: ReadonlyArray<{ x: number; y: number }>,
    p: { x: number; z: number },
): boolean {
    const local = worldXZToSlabLocal(p, slab.position);
    return pointInPolygonXY(local.x, local.y, outline);
}

function distance2ToCentre(slab: any, cx: number, cz: number): number {
    const dx = (slab?.position?.x ?? 0) - cx;
    const dz = (slab?.position?.z ?? 0) - cz;
    return dx * dx + dz * dz;
}

/** Nearest slab `position` — the pre-L-949 rule, now only a TIEBREAK / escape hatch. */
function nearestByCentre(slabs: readonly any[], cx: number, cz: number): any {
    let host = slabs[0];
    let bestD2 = Infinity;
    for (const s of slabs) {
        const d2 = distance2ToCentre(s, cx, cz);
        if (d2 < bestD2) { bestD2 = d2; host = s; }
    }
    return host;
}

/**
 * Choose which slab on the stair's top level hosts the void — BY CONTAINMENT of
 * the stair's plan footprint, per the header above. Extracted so all three
 * reconcile directions (stair-side carve, slab-side reconcile, stair-move
 * update) pick the SAME slab given the same inputs; a fix applied to one
 * direction and not the others is the drift this module exists to prevent.
 *
 * `rect` is the stair footprint's four world-XZ corners; `cx`/`cz` its centre.
 */
function resolveHostSlab(
    candidates: readonly any[],
    rect: ReadonlyArray<{ x: number; z: number }>,
    cx: number,
    cz: number,
): HostSlabResolution {
    const measuredIds: string[] = [];
    const unmeasured: any[] = [];
    let best: any = null;
    let bestScore = 0;
    let bestD2 = Infinity;

    for (const slab of candidates) {
        const outline = slabOutline(slab);
        if (!outline) { unmeasured.push(slab); continue; }
        measuredIds.push(slab.id);

        let score = slabContains(slab, outline, { x: cx, z: cz }) ? CENTRE_PROBE_WEIGHT : 0;
        for (const corner of rect) if (slabContains(slab, outline, corner)) score++;
        if (score === 0) continue;

        // Ties (stacked or overlapping slabs that both contain the stair) are a
        // legitimate place for nearest-centre — it is a tiebreak here, never the
        // determination.
        const d2 = distance2ToCentre(slab, cx, cz);
        if (score > bestScore || (score === bestScore && d2 < bestD2)) {
            best = slab; bestScore = score; bestD2 = d2;
        }
    }

    if (best) {
        return {
            host: best,
            basis: bestScore >= CENTRE_PROBE_WEIGHT ? 'contains-centre' : 'overlaps-corners',
            measuredIds,
        };
    }
    if (unmeasured.length > 0) {
        // Escape hatch: outlines we could not read are not outlines we ruled out.
        return { host: nearestByCentre(unmeasured, cx, cz), basis: 'no-outline-nearest-centre', measuredIds };
    }
    return { host: null, basis: 'none-contains', measuredIds };
}

/** The refusal, said out loud — never "carve the closest one and hope". */
function warnNoContainingSlab(
    stair: StairFootprintSource,
    resolution: HostSlabResolution,
    cx: number,
    cz: number,
    consequence: string,
): void {
    console.warn(
        `[StairSlabOpeningReconciler] stair ${stair.id}: NO slab on top level "${stair.topLevelId}" ` +
        `contains its footprint (centre x=${cx.toFixed(3)} z=${cz.toFixed(3)}; neither the centre nor any ` +
        `footprint corner falls inside ${resolution.measuredIds.length} measured slab(s): ` +
        `${resolution.measuredIds.join(', ')}). ${consequence} Carving the NEAREST slab instead would cut a ` +
        `void through a slab the stair does not pass through — that is the L-949 defect.`,
    );
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
        const resolution = resolveHostSlab(candidates, rect, cx, cz);
        if (!resolution.host) {
            // §FIX-STAIR-VOID-WRONG-SLAB — the honest answer, in the same
            // vocabulary as `no-slab-on-top-level` above: NOT an error, and NOT
            // a licence to carve the closest slab.
            warnNoContainingSlab(stair, resolution, cx, cz, 'No opening carved.');
            span.setAttribute('pryzm.carve.skipped', 'no-containing-slab-on-top-level');
            span.setAttribute('pryzm.carve.candidates', candidates.length);
            return null;
        }
        const host = resolution.host;
        span.setAttribute('pryzm.carve.host_basis', resolution.basis);

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
 * The undo record of ONE stair's opening reconcile, sufficient to make the void
 * change part of the SAME undo unit as the stair mutation that caused it
 * (`undoStairOpeningReconcile`).
 *
 * G-NEW-05: the undo capture is Immer `produceWithPatches` (via the package's
 * `PatchSnapshot` landing zone), NOT a structuredClone before/after snapshot —
 * `inversePatches` applied to the post-reconcile record restore the
 * pre-reconcile record byte-equal (pinned by
 * `__tests__/stairOpeningReconcileUndoRoundtrip.test.ts`).
 *
 * `kind === 'carved'` means the reconcile CREATED the opening (undo removes it;
 * `inversePatches` is empty). A reconcile never DELETES an opening — see the
 * L-581 lesson: deleting a void on a failed measure is catastrophic — so there
 * is deliberately no 'removed' kind; a future legitimate remove path must add
 * one explicitly rather than inherit it silently.
 */
export interface StairOpeningReconcile {
    readonly openingId: string;
    /** 'carved' = the opening did not exist before; 'updated' = fields changed in place. */
    readonly kind: 'carved' | 'updated';
    /** Immer inverse patches restoring the pre-reconcile opening record ('updated' only). */
    readonly inversePatches: readonly Patch[];
    /** Host slabs (old + new, deduped) to rebuild on undo so the renderer sees the healed void. */
    readonly rebuildHostIds: readonly string[];
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
            span.setAttribute('pryzm.reconcile.outcome', 'carved');
            // A carve needs no patches: undo is "remove the opening we minted".
            return { openingId, kind: 'carved', inversePatches: [], rebuildHostIds: [carve.hostSlabId] };
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
        // §FIX-STAIR-VOID-WRONG-SLAB — the SAME determination as the carve path.
        // Fixing one direction and leaving the other on nearest-centre is exactly
        // the drift this module's single-owner design exists to prevent.
        const resolution = resolveHostSlab(candidates, rect, cx, cz);
        if (!resolution.host) {
            // The stair was moved off every slab on its top level. Leave the
            // existing void where it is (L-581: never delete or relocate a void
            // on a failed measure) rather than relocate it into a slab the stair
            // does not pass through.
            warnNoContainingSlab(stair, resolution, cx, cz, 'Existing opening left untouched.');
            span.setAttribute('pryzm.reconcile.skipped', 'no-containing-slab-on-top-level');
            return null;
        }
        const host = resolution.host;
        span.setAttribute('pryzm.reconcile.host_basis', resolution.basis);
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

        // G-NEW-05 undo capture: produceWithPatches over the existing record.
        // `inversePatches` applied to the post-state restore exactly the four
        // fields this reconcile may touch — the mandated replacement for the
        // prohibited structuredClone before/after snapshot.
        const updates = { hostId: host.id, parentId: host.id, levelId: stair.topLevelId, profile };
        const { inversePatches } = producePatchedSlice(
            existing as Record<string, any>,
            (draft) => {
                draft.hostId = updates.hostId;
                draft.parentId = updates.parentId;
                draft.levelId = updates.levelId;
                draft.profile = updates.profile;
            },
        );
        const rebuildHostIds = [...new Set([existing.hostId as string, host.id as string])];

        if (typeof openingStore.update === 'function') {
            openingStore.update(openingId, updates);
        } else {
            // Test doubles / minimal stores: replace under the SAME id.
            openingStore.remove?.(openingId);
            openingStore.add({ ...existing, ...updates });
        }

        if (opts.triggerRebuild !== false) {
            for (const hostId of rebuildHostIds) {
                if (slabStore.getById?.(hostId)) slabStore.triggerRebuild(hostId);
            }
        }

        span.setAttribute('pryzm.reconcile.outcome', 'updated');
        span.setAttribute('pryzm.opening.id', openingId);
        span.setAttribute('pryzm.slab.id', host.id);
        return { openingId, kind: 'updated', inversePatches, rebuildHostIds };
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
        if (rec.kind === 'carved') {
            // The reconcile carved a fresh opening — undo removes it (mirrors
            // removeStairOpenings, including the side indexes).
            if (current) {
                openingStore.remove?.(rec.openingId);
                try { ctx.bimManager.unregisterElement?.(rec.openingId); } catch { /* side-index only */ }
                try { elementRegistry.unregister(rec.openingId); } catch { /* side-index only */ }
            }
        } else if (current) {
            // G-NEW-05: apply the Immer inverse patches to the CURRENT record —
            // this reconstructs the pre-reconcile record byte-equal (the round-trip
            // pin), replacing the prohibited structuredClone(before) restore.
            const prev = applyPatchesToSlice(current as Record<string, any>, rec.inversePatches);
            if (typeof openingStore.update === 'function') {
                openingStore.update(rec.openingId, {
                    hostId: prev.hostId,
                    parentId: prev.parentId,
                    levelId: prev.levelId,
                    profile: prev.profile,
                });
            } else {
                openingStore.remove?.(rec.openingId);
                openingStore.add(prev);
            }
        } else {
            // The opening vanished outside this undo unit — there is no post-state
            // to invert from. Say so rather than invent a record.
            console.warn(
                `[StairSlabOpeningReconciler] undo: opening ${rec.openingId} no longer exists — nothing restored`,
            );
        }
    } catch (err) {
        console.warn('[StairSlabOpeningReconciler] reconcile undo failed (non-fatal):', err);
    }

    for (const hostId of rec.rebuildHostIds) {
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
