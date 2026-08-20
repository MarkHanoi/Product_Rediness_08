// ─── §STAIR-PIERCES-EVERY-HORIZONTAL-HOST (L-1431) ───────────────────────────
//
// FOUNDER-REPORTED, PRODUCTION:
//
//   "STAIR CREATION — FIRST THE STAIR CREATES AN OPENING ON THE SLAB — BUT NOT
//    ON THE FLOOR FINISH — THIS NEEDS TO BE AUTOMATIC."
//
// ── THE MEASUREMENT, BEFORE THE FIX (2026-08-20, lane STAIR1) ────────────────
//
// The founder's log declares the create's undo scope as `[stair, opening, slab]`
// — no floor store in it. THAT DECLARATION IS HONEST. The floor-finish hole was
// not "created but unsnapshotted"; it was **NEVER CREATED**:
//
//   • `floor` and `slab` are SEPARATE ELEMENT FAMILIES with separate contracts
//     (C89 = floor finish / IfcCovering; C92 = structural slab / IfcSlab) and
//     separate authorities (`FloorStore` in `core-app-model` vs `SlabStore` in
//     `geometry-slab`). C89 §2 names `FloorStore` the single authority for the
//     finish. The finish is NOT a layer of the slab — `FloorData.hostSlabId` is
//     an OPTIONAL binding between two independent records.
//   • The floor family HAS a void mechanism already: `FloorData.serviceHoles[]`,
//     rendered by `FloorPanelBuilder._buildShapeWithHoles`, written through
//     `FloorStore.addServiceHole` / `removeServiceHole`.
//   • ⭐ `grep -rn "addServiceHole"` over `packages plugins apps src` returned
//     **ONE hit — its own definition.** ZERO callers. The mechanism existed and
//     nothing in the repo had ever used it.
//   • Ceiling is the same shape a third time: `CeilingData.holeElements[]` with
//     `addHoleElement` / `removeHoleElement`.
//
// So the auto-opening keyed on ONE named host family, and the other two horizontal
// families were never consulted.
//
// ── THE SECOND AXIS, RELAYED FROM LANE RAC2 AND CONFIRMED HERE ───────────────
//
// `carveStairOpening` filtered `slabStore.getAll().filter(s => s.levelId ===
// stair.topLevelId)`. `LevelTraversalPolicy.canTraverse` returns `ok: true` with
// a WARNING when a stair skips levels. So a Ground->L5 stair is ACCEPTED and its
// ~15 m run passes through four INTACT decks. Reachable by hand today: pick a
// Top level more than one storey up.
//
// ⭐ THE TWO ARE ONE DEFECT WEARING TWO HATS: the opening set was ENUMERATED
// ("the slab, on the top level") where it must be DERIVED ("every horizontal host
// the stair actually passes through"). C04 §3.1.2a names this shape — an
// enumeration cannot cover a generic verb — and it is the most repeated defect in
// this repo. Fixing only the family axis leaves the level axis armed, so this
// module derives BOTH:
//
//     hosts = { h : h.family ∈ HORIZONTAL_HOST_PIERCERS
//                 ∧ h.levelId ∈ levelsTheStairRisesThrough(base, top)
//                 ∧ h.outline CONTAINS the stair footprint }
//
// Adding a fourth horizontal family is ONE registry entry — never a new branch in
// `CreateStairCommand`.
//
// ── WHAT THIS MODULE DOES **NOT** OWN, AND WHY (declared, not hidden) ────────
//
// ⛔ **The SLAB family is NOT registered here.** `StairSlabOpeningReconciler`
// owns it and keeps owning it. That is not an oversight and not a special case
// smuggled back in: a slab's void is a first-class `opening` ELEMENT in
// `openingStore` with its own id convention (`stairAutoOpeningId`), its own Immer
// undo patches, its own slab-side symmetry (`CreateSlabCommand` reconciling
// stairs that predate the slab) and its own delete-heal in `DeleteStairCommand`.
// The floor and ceiling voids are embedded arrays on the host record with none of
// that. Registering slab here would mean either a second implementation of the
// opening lifecycle — the exact drift `StairSlabOpeningReconciler`'s header
// exists to forbid — or rewriting that lifecycle tonight while the founder is
// testing. **The slab's LEVEL axis therefore remains top-level-only and is filed
// as L-1433, not silently claimed as fixed here.** This module closes the FAMILY
// axis on both new families and the LEVEL axis for both of them.
//
// ⛔ **MOVE / PARAMETER-CHANGE DOES NOT YET FOLLOW THESE VOIDS — L-1432.**
// `MoveStairCommand` and `UpdateStairParametersCommand` call
// `reconcileStairOpening`, which is the SLAB reconciler and knows nothing about
// this registry. So a stair moved after creation strands its floor-finish and
// ceiling voids at the OLD footprint — the same shape as
// §FIX-STAIR-MOVE-STRANDS-VOID, which that reconciler exists to have closed for
// slabs. It is stated here rather than left blank: the CREATE gesture the founder
// reported is closed, the MOVE gesture is NOT, and the delete heals whatever was
// actually cut (found by id, never re-derived) so the two cannot compound into an
// orphan. The fix is a `reconcile` on `HorizontalHostPiercer` — unpierce the old
// id, pierce the new profile — and it belongs with L-1432, not smuggled in
// half-done tonight.
//
// ⛔ No true polygon clipping, and host `serviceHoles` / `holeElements` are not
// subtracted — the same two refusals `StairSlabOpeningReconciler` declares
// (C98 §14 R5), for the same reasons, so the two host resolutions cannot disagree
// about what "contains" means.

import { trace, type Tracer } from '@opentelemetry/api';
import { computeStairFootprintRect } from '@pryzm/geometry-stair';
import { pointInPolygonXY } from '@pryzm/geometry-kernel';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import type { CommandContext } from '../types';
import type { StairFootprintSource } from './StairSlabOpeningReconciler';

let _tracerCache: Tracer | null = null;
function _tracer(): Tracer {
    if (!_tracerCache) _tracerCache = trace.getTracer('pryzm.command-registry.stair');
    return _tracerCache;
}

/** World-XZ. The one frame this module reasons in — see `hostOutline` below. */
interface XZ { x: number; z: number }

/**
 * One horizontal host, normalised out of whatever its family stores.
 * `outline` is WORLD XZ, or null when the record cannot be measured (a
 * sketch-backed or legacy boundary). Null is UNKNOWN, never "empty" — the
 * distinction C74 exists for.
 */
export interface HorizontalHost {
    readonly id: string;
    readonly levelId: string;
    readonly outline: readonly XZ[] | null;
}

/** One family's knowledge of how to list, pierce and un-pierce its records. */
export interface HorizontalHostPiercer {
    /** Element family, as C84/C85-C99 name it. Used in ids, spans and logs. */
    readonly family: string;
    /** Human name for refusal text. */
    readonly label: string;
    /** Every record of this family on `levelId`, or [] when the store is absent. */
    list(ctx: CommandContext, levelId: string): HorizontalHost[];
    /**
     * Cut `profileWorld` out of `hostId`, under `pierceId`.
     * Returns false when the store refused; the caller records nothing then.
     * MUST be idempotent under `pierceId` — a re-run may not double-cut.
     */
    pierce(ctx: CommandContext, hostId: string, pierceId: string, profileWorld: readonly XZ[]): boolean;
    /** Remove the pierce again (undo). Never throws. */
    unpierce(ctx: CommandContext, hostId: string, pierceId: string): void;
    /**
     * Every void in this family that `stairId` cut, found by the id convention
     * alone — the L-298 lesson (the create and the delete are different command
     * instances with no shared field, so the id convention is their ONLY link).
     * A scan, not a guess: it can only ever match voids this module minted.
     */
    findPierces(ctx: CommandContext, stairId: string): StairHostPierce[];
}

/**
 * The id of the void a stair cuts in ONE host. Keyed by host, not by level, so a
 * level carrying two floor finishes gets two independent voids and neither can
 * shadow the other. `DeleteStairCommand`'s heal and this module's undo both
 * derive it from the same function — the L-298 lesson, applied to two more
 * families.
 */
export function stairHostPierceId(stairId: string, family: string, hostId: string): string {
    return `${stairHostPiercePrefix(stairId, family)}${hostId}`;
}

/** The prefix every void this stair cut in this family shares — the find key. */
export function stairHostPiercePrefix(stairId: string, family: string): string {
    return `pierce-stair-${stairId}-${family}-`;
}

/** The record one pierce leaves behind, sufficient to undo it exactly. */
export interface StairHostPierce {
    readonly family: string;
    readonly hostId: string;
    readonly pierceId: string;
    readonly levelId: string;
}

// ─── The derived level set ───────────────────────────────────────────────────

/** Elevation comparisons are C73 §1 tolerant — a deck 0.1 mm above the base is the base. */
const ELEV_EPS = 1e-4;

/**
 * ⭐ THE LEVEL AXIS, DERIVED. Every level whose deck the stair rises THROUGH or
 * lands ON: `baseElevation < elevation <= topElevation`.
 *
 * The base level's own deck is EXCLUDED — the stair stands on it; piercing it
 * would cut the floor out from under the bottom riser. The top level's deck is
 * INCLUDED, which is the case the old top-level-only filter already handled and
 * the only one it handled.
 *
 * Returns `[topLevelId]` — today's behaviour, unchanged — when the level table
 * cannot be read or either endpoint is missing from it. That is a fallback to the
 * previously-shipped behaviour, not a guess dressed as a measurement, and it is
 * reported on the span as `level_basis: 'fallback-top-only'`.
 */
export function stairPiercedLevelIds(
    ctx: CommandContext,
    stair: { readonly topLevelId: string; readonly baseLevelId?: string },
): { levelIds: string[]; basis: 'derived-span' | 'fallback-top-only' } {
    const fallback = { levelIds: [stair.topLevelId], basis: 'fallback-top-only' as const };
    const wallStore = (ctx.stores as any)?.wallStore;
    if (typeof wallStore?.getLevels !== 'function') return fallback;
    if (!stair.baseLevelId) return fallback;

    const levels = wallStore.getLevels() as Array<{ id: string; elevation: number }>;
    if (!Array.isArray(levels) || levels.length === 0) return fallback;

    const base = levels.find(l => l.id === stair.baseLevelId);
    const top = levels.find(l => l.id === stair.topLevelId);
    if (!base || !top || typeof base.elevation !== 'number' || typeof top.elevation !== 'number') {
        return fallback;
    }
    // A stair authored downward is the same set of decks, read the other way.
    const lo = Math.min(base.elevation, top.elevation);
    const hi = Math.max(base.elevation, top.elevation);

    const ids = levels
        .filter(l => typeof l.elevation === 'number'
            && l.elevation > lo + ELEV_EPS
            && l.elevation <= hi + ELEV_EPS)
        .sort((a, b) => a.elevation - b.elevation)
        .map(l => l.id);

    // The top deck is the one deck that must always be in the set. If the level
    // table disagrees with the stair's own endpoints, trust the stair.
    if (!ids.includes(stair.topLevelId)) ids.push(stair.topLevelId);
    return { levelIds: ids, basis: 'derived-span' };
}

// ─── Containment — ONE rule, shared by every family ──────────────────────────

/**
 * Which hosts of one family, on one level, does the stair footprint pass through?
 *
 * The rule is `StairSlabOpeningReconciler`'s, deliberately: the CENTRE outranks
 * any number of CORNERS, and a host whose outline cannot be measured is UNKNOWN
 * rather than "outside". The one difference is that this returns EVERY containing
 * host rather than a single winner — a level may legitimately carry several floor
 * finishes (one per room) and a stair landing that straddles two of them must
 * pierce both. Picking a winner there would leave a real void half-cut.
 */
function hostsContainingFootprint(
    hosts: readonly HorizontalHost[],
    rect: readonly XZ[],
    cx: number,
    cz: number,
): { hits: HorizontalHost[]; measured: number; unmeasured: number } {
    const hits: HorizontalHost[] = [];
    let measured = 0;
    let unmeasured = 0;

    for (const host of hosts) {
        const outline = host.outline;
        if (!outline || outline.length < 3) { unmeasured++; continue; }
        measured++;
        const poly = outline.map(p => ({ x: p.x, y: p.z }));
        if (pointInPolygonXY(cx, cz, poly)) { hits.push(host); continue; }
        if (rect.some(c => pointInPolygonXY(c.x, c.z, poly))) hits.push(host);
    }
    return { hits, measured, unmeasured };
}

// ─── The registry ────────────────────────────────────────────────────────────

/**
 * FLOOR FINISH (C89). `FloorData.boundary.polygon` is WORLD XZ — unlike a slab
 * polygon it carries no `position` offset, confirmed at
 * `FloorPanelBuilder._buildShapeWithHoles`, which feeds boundary and hole
 * vertices into the SAME `THREE.Shape` with no transform between them. So the
 * stair footprint can be written into `serviceHoles[].polygon` unchanged, and the
 * probe and the cut are in one frame by construction.
 */
const floorFinishPiercer: HorizontalHostPiercer = {
    family: 'floor',
    label: 'floor finish',

    list(ctx, levelId) {
        const store = (ctx.stores as any)?.floorStore;
        if (typeof store?.getAll !== 'function') return [];
        return (store.getAll() as any[])
            .filter(f => f?.levelId === levelId)
            .map(f => ({
                id: f.id as string,
                levelId,
                outline: Array.isArray(f?.boundary?.polygon) && f.boundary.polygon.length >= 3
                    ? (f.boundary.polygon as XZ[])
                    : null,
            }));
    },

    pierce(ctx, hostId, pierceId, profileWorld) {
        const store = (ctx.stores as any)?.floorStore;
        if (typeof store?.addServiceHole !== 'function') return false;
        const existing = store.getById?.(hostId);
        // Idempotent by id — a redo, or a second reconcile pass, must not double-cut.
        if (existing?.serviceHoles?.some((h: any) => h.id === pierceId)) return true;
        const updated = store.addServiceHole(hostId, {
            id: pierceId,
            elementId: pierceId,
            // 'floor-hatch' is the closest member of the authored `FloorHoleSubType`
            // enum: a deliberate opening in the finish that people pass through. It
            // is NOT 'generic' — a void with a known cause should say what caused it.
            subType: 'floor-hatch',
            shape: 'polygon',
            polygon: profileWorld.map(p => ({ x: p.x, z: p.z })),
            label: 'Stair opening',
        });
        return updated !== undefined;
    },

    unpierce(ctx, hostId, pierceId) {
        const store = (ctx.stores as any)?.floorStore;
        try { store?.removeServiceHole?.(hostId, pierceId); } catch { /* side-effect-free undo */ }
    },

    findPierces(ctx, stairId) {
        const store = (ctx.stores as any)?.floorStore;
        if (typeof store?.getAll !== 'function') return [];
        const prefix = stairHostPiercePrefix(stairId, 'floor');
        const out: StairHostPierce[] = [];
        for (const f of store.getAll() as any[]) {
            for (const h of (f?.serviceHoles ?? []) as any[]) {
                if (typeof h?.id === 'string' && h.id.startsWith(prefix)) {
                    out.push({ family: 'floor', hostId: f.id, pierceId: h.id, levelId: f.levelId });
                }
            }
        }
        return out;
    },
};

/**
 * CEILING (C88). Same shape as floor: a world-XZ boundary polygon and an embedded
 * hole array. A stair rising through a level pierces the ceiling BELOW that
 * level's deck as surely as it pierces the deck, and nothing had ever cut one.
 */
const ceilingPiercer: HorizontalHostPiercer = {
    family: 'ceiling',
    label: 'ceiling',

    list(ctx, levelId) {
        const store = (ctx.stores as any)?.ceilingStore;
        if (typeof store?.getAll !== 'function') return [];
        return (store.getAll() as any[])
            .filter(c => c?.levelId === levelId)
            .map(c => ({
                id: c.id as string,
                levelId,
                outline: Array.isArray(c?.boundary?.polygon) && c.boundary.polygon.length >= 3
                    ? (c.boundary.polygon as XZ[])
                    : null,
            }));
    },

    pierce(ctx, hostId, pierceId, profileWorld) {
        const store = (ctx.stores as any)?.ceilingStore;
        if (typeof store?.addHoleElement !== 'function') return false;
        const existing = store.getById?.(hostId);
        if (existing?.holeElements?.some((h: any) => h.id === pierceId)) return true;
        return store.addHoleElement(hostId, {
            id: pierceId,
            elementId: pierceId,
            subType: 'access-hatch',
            shape: 'polygon',
            polygon: profileWorld.map(p => ({ x: p.x, z: p.z })),
            label: 'Stair opening',
        }) === true;
    },

    unpierce(ctx, hostId, pierceId) {
        const store = (ctx.stores as any)?.ceilingStore;
        try { store?.removeHoleElement?.(hostId, pierceId); } catch { /* side-effect-free undo */ }
    },

    findPierces(ctx, stairId) {
        const store = (ctx.stores as any)?.ceilingStore;
        if (typeof store?.getAll !== 'function') return [];
        const prefix = stairHostPiercePrefix(stairId, 'ceiling');
        const out: StairHostPierce[] = [];
        for (const c of store.getAll() as any[]) {
            for (const h of (c?.holeElements ?? []) as any[]) {
                if (typeof h?.id === 'string' && h.id.startsWith(prefix)) {
                    out.push({ family: 'ceiling', hostId: c.id, pierceId: h.id, levelId: c.levelId });
                }
            }
        }
        return out;
    },
};

/**
 * ⭐ THE REGISTRY. A fourth horizontal family joins by appending ONE entry.
 * ⛔ Nothing downstream may branch on `family` — if it needs to, the branch
 * belongs on the piercer.
 */
export const HORIZONTAL_HOST_PIERCERS: readonly HorizontalHostPiercer[] = [
    floorFinishPiercer,
    ceilingPiercer,
];

// ─── The verb ────────────────────────────────────────────────────────────────

/**
 * Pierce every horizontal host (of every registered family, on every level the
 * stair rises through) whose plan outline contains the stair footprint.
 *
 * Returns the pierces performed, so the calling command can reverse them in its
 * own `undo()` — the void change is part of the SAME undo unit as the stair
 * mutation that caused it (C03 U-2 / P6).
 *
 * NEVER throws: a family whose store is absent contributes nothing, which is the
 * correct answer for a project with no floor finishes.
 */
export function pierceStairHorizontalHosts(
    ctx: CommandContext,
    stair: StairFootprintSource & { readonly baseLevelId?: string },
): StairHostPierce[] {
    const span = _tracer().startSpan('pryzm.stair.pierce-horizontal-hosts', {
        attributes: { 'pryzm.stair.id': stair.id },
    });
    try {
        const rect = computeStairFootprintRect({
            shape: stair.shape as any,
            width: stair.width,
            treadDepth: stair.treadDepth,
            startPosition: stair.startPosition,
            flights: stair.flights as any,
            landings: stair.landings as any,
        });
        if (!rect) {
            // Same refusal as the slab reconciler: a degenerate footprint cuts nothing.
            span.setAttribute('pryzm.pierce.skipped', 'degenerate-footprint');
            return [];
        }

        const cx = (rect[0].x + rect[1].x + rect[2].x + rect[3].x) / 4;
        const cz = (rect[0].z + rect[1].z + rect[2].z + rect[3].z) / 4;

        const { levelIds, basis } = stairPiercedLevelIds(ctx, stair);
        span.setAttribute('pryzm.pierce.level_basis', basis);
        span.setAttribute('pryzm.pierce.level_count', levelIds.length);

        const pierces: StairHostPierce[] = [];
        for (const levelId of levelIds) {
            for (const piercer of HORIZONTAL_HOST_PIERCERS) {
                let hosts: HorizontalHost[];
                try {
                    hosts = piercer.list(ctx, levelId);
                } catch (err: any) {
                    console.warn(
                        `[StairHorizontalHostPiercing] ${piercer.family}.list failed on level "${levelId}" ` +
                        `(non-fatal): ${err?.message}`,
                    );
                    continue;
                }
                if (hosts.length === 0) continue;

                const { hits, measured, unmeasured } = hostsContainingFootprint(hosts, rect, cx, cz);
                if (hits.length === 0) {
                    // The honest answer, in the same vocabulary the slab reconciler
                    // uses: NOT an error, and NOT a licence to cut the nearest one.
                    if (measured > 0) {
                        console.log(
                            `[StairHorizontalHostPiercing] stair ${stair.id}: no ${piercer.label} on level ` +
                            `"${levelId}" contains its footprint (centre x=${cx.toFixed(3)} z=${cz.toFixed(3)}; ` +
                            `${measured} measured, ${unmeasured} unmeasurable). No void cut in this family here.`,
                        );
                    }
                    continue;
                }

                for (const host of hits) {
                    const pierceId = stairHostPierceId(stair.id, piercer.family, host.id);
                    let ok = false;
                    try {
                        ok = piercer.pierce(ctx, host.id, pierceId, rect);
                    } catch (err: any) {
                        console.warn(
                            `[StairHorizontalHostPiercing] ${piercer.family}.pierce failed for host ${host.id} ` +
                            `(non-fatal): ${err?.message}`,
                        );
                    }
                    if (!ok) continue;

                    try { ctx.bimManager?.registerElement?.(pierceId, levelId); } catch { /* side index */ }
                    try { elementRegistry.registerSemantic(pierceId, 'opening'); } catch { /* redo path */ }
                    pierces.push({ family: piercer.family, hostId: host.id, pierceId, levelId });
                }
            }
        }

        span.setAttribute('pryzm.pierce.count', pierces.length);
        if (pierces.length > 0) {
            console.log(
                `[StairHorizontalHostPiercing] stair ${stair.id} pierced ${pierces.length} horizontal host(s) ` +
                `across ${levelIds.length} level(s): ` +
                pierces.map(p => `${p.family}:${p.hostId}`).join(', '),
            );
        }
        return pierces;
    } finally {
        span.end();
    }
}

/**
 * Every horizontal-host void `stairId` cut, across every registered family.
 * `DeleteStairCommand` uses it to HEAL: the delete does not need to remember what
 * the create did, because the id convention says it.
 *
 * ⭐ The DELETE side needs no snapshot, and deliberately keeps none. These voids
 * are DERIVED from the stair's own footprint, so an undo that restores the stair
 * re-derives them byte-identically by re-running `pierceStairHorizontalHosts`.
 * Snapshotting a derived value is how a stale copy gets restored over a live one.
 * (Consequence, stated: a hand-edited stair void is not preserved across
 * delete/undo. These voids are not hand-editable today; if they ever become so,
 * this decision must be revisited, not silently inherited.)
 */
export function findStairHorizontalHostPierces(
    ctx: CommandContext,
    stairId: string,
): StairHostPierce[] {
    const out: StairHostPierce[] = [];
    for (const piercer of HORIZONTAL_HOST_PIERCERS) {
        try {
            out.push(...piercer.findPierces(ctx, stairId));
        } catch (err: any) {
            console.warn(
                `[StairHorizontalHostPiercing] ${piercer.family}.findPierces failed (non-fatal): ${err?.message}`,
            );
        }
    }
    return out;
}

/**
 * Reverse `pierceStairHorizontalHosts` — called from the OWNING command's
 * `undo()`, so the voids close in the same undo unit that removes the stair.
 */
export function unpierceStairHorizontalHosts(
    ctx: CommandContext,
    pierces: readonly StairHostPierce[],
): void {
    if (pierces.length === 0) return;
    const byFamily = new Map(HORIZONTAL_HOST_PIERCERS.map(p => [p.family, p]));
    for (const pierce of pierces) {
        const piercer = byFamily.get(pierce.family);
        if (!piercer) {
            // A family was removed from the registry while an undo record referencing
            // it was still on the stack. Say so — the void stays, and it is visible.
            console.warn(
                `[StairHorizontalHostPiercing] undo: no piercer registered for family ` +
                `"${pierce.family}" — void ${pierce.pierceId} left in host ${pierce.hostId}`,
            );
            continue;
        }
        piercer.unpierce(ctx, pierce.hostId, pierce.pierceId);
        try { ctx.bimManager?.unregisterElement?.(pierce.pierceId); } catch { /* side index */ }
        try { elementRegistry.unregister(pierce.pierceId); } catch { /* side index */ }
    }
}
