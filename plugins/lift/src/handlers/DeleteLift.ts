// DeleteLiftHandler — deleting a lift HEALS EVERY FLOOR PLATE IT PENETRATED.
//
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700, L-5706) · C104 §8 · ADR-0325 · C16 §3
//
// ═══════════════════════════════════════════════════════════════════════════════
// "AN ORPHANED HOLE IN A FLOOR PLATE IS WORSE THAN NO FEATURE." — the pool ticket.
// A LIFT LEAVES ONE PER STOREY.
// ═══════════════════════════════════════════════════════════════════════════════
//
// THE DELETE IS A RECONCILIATION, NOT A FIRE-AND-FORGET. It removes the lift, its
// enclosure sides, its N landing doors and its five cabin parts, **and it closes the
// void in every slab the shaft passed through** — all in ONE undo entry.
//
// The precedent is not hypothetical and it is not flattering. `DeleteStairCommand`
// contains ZERO references to openings: `CreateStairCommand` punches a void in the
// slab above it and correctly removes it on `undo()`, but DELETING the stair leaves
// the void punched through the floor plate forever, and nothing reaps it
// (`OpeningCleanupHandler` listens for `bim-level-removed` / `bim-slab-removed`,
// never `bim-stair-removed`). `DeletePoolHandler` exists to not repeat that.
//
// ⭐ A LIFT MAKES THE SAME BUG N TIMES WORSE. The stair leaves one hole; a lift
// serving ten storeys would leave TEN, stacked vertically — which is, precisely, a
// lift shaft with no lift in it. So the heal below runs per penetrated slab, and it
// matches by GEOMETRY rather than by index, for the reason the pool records: removing
// "the last hole" or "hole[i]" is wrong the moment a slab carries a second lift, a
// stair void or a pool.
//
// There is no generic "when X is deleted also delete Y" registry in PRYZM to lean on
// (`plugins/cross` explicitly refuses delete cascades), so the cascade is written
// HERE, explicitly, in the one command that owns it.

import {
    produceMultiStoreCommand,
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
} from '@pryzm/plugin-sdk';
import { buildLiftAssembly, BUILT_IN_LIFT_TYPES, type ServedLevel } from '@pryzm/geometry-lift';
import { LiftNotFoundError } from '../errors.js';
import type { LiftCompoundsState, LiftPartsState } from '../store.js';

export interface DeleteLiftPayload {
    readonly liftId: string;
    /**
     * The served levels, as the create saw them. OPTIONAL: supplied by the caller
     * when it has them, so the heal can reconstruct the exact void loops.
     *
     * ⚠ WHEN ABSENT, THE HEAL FALLS BACK TO REMOVING VOIDS THAT MATCH THE SHAFT
     * FOOTPRINT AT ANY ELEVATION — see `_healableLoops`. That fallback is stated
     * rather than hidden because it is weaker: it matches on XZ only, so two lifts
     * with identical footprints stacked in plan at different elevations would be
     * indistinguishable to it. The tool always supplies the levels; the fallback
     * exists for a delete reached from a generic element-delete path that does not
     * carry them.
     */
    readonly servedLevels?: readonly ServedLevel[];
}

type LiftHandlerStores = Readonly<
    {
        lift: LiftCompoundsState;
        liftPart: LiftPartsState;
        wall: Record<string, unknown>;
        curtainwall: Record<string, unknown>;
        door: Record<string, unknown>;
        slab: Record<string, { holes?: { x: number; y: number; z: number }[][] }>;
    } & Record<string, unknown>
>;

/**
 * Two loops are the same loop if their vertices match to within a tolerance. Exact
 * float equality would be brittle across a persist/reload round-trip.
 *
 * `ignoreY` supports the weaker fallback described on `DeleteLiftPayload`.
 */
const EPS = 1e-6;
function sameLoop(
    a: readonly { x: number; y: number; z: number }[],
    b: readonly { x: number; y: number; z: number }[],
    ignoreY = false,
): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const p = a[i]!;
        const q = b[i]!;
        if (Math.abs(p.x - q.x) > EPS || Math.abs(p.z - q.z) > EPS) return false;
        if (!ignoreY && Math.abs(p.y - q.y) > EPS) return false;
    }
    return true;
}

// eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: mirrors
// CreateLift — six stores is the truthful declaration; see the rationale there.
export class DeleteLiftHandler implements CommandHandler<DeleteLiftPayload, LiftHandlerStores> {
    readonly type = 'lift.delete';

    /** The same six stores the create touched — the delete must be able to undo it. */
    // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6, see above.
    readonly affectedStores = ['lift', 'liftPart', 'wall', 'curtainwall', 'door', 'slab'] as const;

    canExecute(ctx: HandlerContext<LiftHandlerStores>, cmd: DeleteLiftPayload): ValidationResult {
        if (!ctx.stores.lift[cmd.liftId]) {
            return { valid: false, reason: `lift not found: ${cmd.liftId}` };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<LiftHandlerStores>, cmd: DeleteLiftPayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const lift = ctx.stores.lift[cmd.liftId];
            if (!lift) throw new LiftNotFoundError(cmd.liftId);

            // The lift's children come from ITS OWN RECORD's `childrenIds` — no O(N)
            // scan of every wall/door in the project looking for `parentId === liftId`,
            // and no guessing. This is why the assembly link is stored on BOTH ends
            // (C103 §2 / ADR-0124 §3).
            const childIds = new Set(lift.childrenIds);

            // ── Reconstruct the void loops this lift punched. ───────────────────
            // Same input, same pure function, same polygons — `buildLiftAssembly` is
            // deterministic, so re-running it is how the delete knows EXACTLY which
            // loops to remove without storing a copy of them that could drift.
            const { loops, exactY } = this._healableLoops(lift, cmd.servedLevels);

            // Per penetrated slab, the surviving holes.
            const healed = new Map<string, unknown[]>();
            for (const slabId of lift.penetratedSlabIds) {
                const slab = ctx.stores.slab[slabId];
                if (!slab) continue; // the slab is already gone; nothing to heal.
                const before = slab.holes ?? [];
                const after = before.filter(
                    (loop) => !loops.some((mine) => sameLoop(loop, mine, !exactY)),
                );
                healed.set(slabId, after as unknown[]);
            }

            const out = produceMultiStoreCommand(
                {
                    lift: ctx.stores.lift,
                    liftPart: ctx.stores.liftPart,
                    wall: ctx.stores.wall,
                    curtainwall: ctx.stores.curtainwall,
                    door: ctx.stores.door,
                    slab: ctx.stores.slab,
                },
                {
                    lift: (d) => {
                        delete (d as Record<string, unknown>)[cmd.liftId];
                    },
                    liftPart: (d) => {
                        const draft = d as Record<string, unknown>;
                        for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
                    },
                    wall: (d) => {
                        const draft = d as Record<string, unknown>;
                        // ⭐ The HOST wall is NOT a child and is NOT deleted. A
                        // wall-hosted lift borrows a wall; it does not own it.
                        for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
                    },
                    curtainwall: (d) => {
                        const draft = d as Record<string, unknown>;
                        for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
                    },
                    door: (d) => {
                        const draft = d as Record<string, unknown>;
                        for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
                    },
                    slab: (d) => {
                        const draft = d as Record<string, { holes?: unknown[] }>;
                        // ── HEAL EVERY PENETRATED FLOOR PLATE ──────────────────
                        // Whole-array replace (same reason as CreateLift — a deep
                        // patch does not survive the legacy undo adapter). Every
                        // floor the shaft passed through closes up.
                        for (const [slabId, after] of healed) {
                            const s = draft[slabId];
                            if (s) s.holes = after;
                        }
                    },
                },
            );

            return {
                forward: out.forward,
                inverse: out.inverse,
                nextStates: out.nextStates,
            };
        }); // withHandlerSpan — CA-14 / C10 §2
    }

    /**
     * The void loops this lift punched, re-derived from the pure assembly.
     *
     * `exactY` reports which of the two matching regimes applies, so the caller can
     * say so rather than silently using the weaker one:
     *   - `true`  — the caller supplied the served levels, so each loop carries its
     *               real elevation and matching is exact in all three axes.
     *   - `false` — no levels supplied; only the XZ footprint is known, so matching
     *               ignores Y. See the `DeleteLiftPayload.servedLevels` docstring.
     */
    private _healableLoops(
        lift: LiftCompoundsState[string],
        servedLevels: readonly ServedLevel[] | undefined,
    ): { loops: { x: number; y: number; z: number }[][]; exactY: boolean } {
        const exactY = Array.isArray(servedLevels) && servedLevels.length > 0;
        const levels: ServedLevel[] = exactY
            ? [...servedLevels!]
            : lift.servedLevelIds.map((id) => ({ levelId: id, elevation: 0, slabId: undefined }));

        const systemType = BUILT_IN_LIFT_TYPES.find((t) => t.id === lift.typeId);
        const asm = buildLiftAssembly(
            {
                id: lift.id,
                levelId: lift.levelId,
                origin: lift.origin,
                rotation: lift.rotation,
                enclosureType: lift.enclosureType,
                ...(lift.hostWallId ? { hostWallId: lift.hostWallId } : {}),
                ...(lift.shaftWidth !== undefined ? { shaftWidth: lift.shaftWidth } : {}),
                ...(lift.shaftDepth !== undefined ? { shaftDepth: lift.shaftDepth } : {}),
                ...(lift.shaftWallThickness !== undefined
                    ? { shaftWallThickness: lift.shaftWallThickness }
                    : {}),
                ...(lift.doorWidth !== undefined ? { doorWidth: lift.doorWidth } : {}),
            },
            {
                // Placeholder ids: this call is used ONLY for its geometry. The ids
                // never leave this function.
                enclosureIds: ['a', 'b', 'c', 'd'],
                landingDoorIds: levels.map((_, i) => `d${i}`),
                cabinPartIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
            },
            // Give every level a slab id so the assembly emits a loop for each; the
            // loops are all we read.
            levels.map((l) => ({ ...l, slabId: l.slabId ?? `probe-${l.levelId}` })),
            systemType,
        );
        return { loops: asm.slabVoids.map((v) => [...v.loop]), exactY };
    }
}
