// LiftCompoundStore / LiftPartStore — pure DTO stores for the lift compound system.
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700) · C104 · ADR-0325
//
// Mirrors `plugins/pool/src/store.ts`: THREE-free, self-contained, validation at the
// handler boundary.
//
// NOTE ON STORE OWNERSHIP (C03 §3.2 — one owner per slice). The lift's SHAFT WALLS
// live in the WALL store, its GLASS sides live in the CURTAIN-WALL store, its
// LANDING DOORS live in the DOOR store, and the VOIDS it punches live on the SLAB
// records. None of them is copied in here. That is the whole point: a lift landing
// door IS a door, so it must be in the door store, where the schedule (C28), the IFC
// exporter (C25), the material dispatcher and the plan-view symbol builder will all
// find it. The lift record owns them by `childrenIds`, not by containment.
//
// ⭐ SO WHAT IS THE `liftPart` STORE FOR? The CABIN parts, and ONLY those — the five
// records that have no existing family to belong to, for the reasons
// `LiftPartTypes.ts` sets out (they are not level-bound, and a car floor counted as
// floor area is a data-integrity defect). One new family, exactly as the pool minted
// exactly one (`water`). If a sixth kind of part turns out to fit an existing family,
// it belongs in that family's store, not here.

import { Store } from '@pryzm/plugin-sdk';
import type { LiftCompound, LiftPart, LiftPartKind } from '@pryzm/geometry-lift';

export type LiftCompoundData = LiftCompound;
export type LiftPartData = LiftPart;

/** Per-store record views handed to handlers via `ctx.stores.lift` / `.liftPart`. */
export type LiftCompoundsState = Record<string, LiftCompoundData>;
export type LiftPartsState = Record<string, LiftPartData>;

export class LiftCompoundStore extends Store<LiftCompoundData> {
    constructor() {
        super('lift');
    }

    ids(): readonly string[] {
        return [...this.state.keys()];
    }

    get(id: string): Readonly<LiftCompoundData> | undefined {
        return this.state.get(id);
    }

    /** Every lift ANCHORED on a given level (its base level). O(N). */
    byLevel(levelId: string): readonly LiftCompoundData[] {
        const out: LiftCompoundData[] = [];
        for (const l of this.state.values()) if (l.levelId === levelId) out.push(l);
        return out;
    }

    /**
     * Every lift that SERVES a given level — which is a different question from
     * `byLevel` and is the one a floor plan actually asks. A lift anchored on the
     * ground floor still puts a landing door on storey 7, and a plan of storey 7
     * that only looked at `levelId` would draw nothing.
     */
    servingLevel(levelId: string): readonly LiftCompoundData[] {
        const out: LiftCompoundData[] = [];
        for (const l of this.state.values()) {
            if (l.servedLevelIds.includes(levelId)) out.push(l);
        }
        return out;
    }

    /**
     * Every lift hosted in a given wall — the reverse index the WALL needs when it
     * is deleted. A wall cannot vanish out from under a wall-hosted lift and leave
     * it claiming a host that is gone.
     */
    byHostWall(wallId: string): readonly LiftCompoundData[] {
        const out: LiftCompoundData[] = [];
        for (const l of this.state.values()) if (l.hostWallId === wallId) out.push(l);
        return out;
    }

    /** Every lift whose shaft voids a given slab — the slab's reverse index. */
    byPenetratedSlab(slabId: string): readonly LiftCompoundData[] {
        const out: LiftCompoundData[] = [];
        for (const l of this.state.values()) {
            if (l.penetratedSlabIds.includes(slabId)) out.push(l);
        }
        return out;
    }
}

export class LiftPartStore extends Store<LiftPartData> {
    constructor() {
        super('liftPart');
    }

    ids(): readonly string[] {
        return [...this.state.keys()];
    }

    get(id: string): Readonly<LiftPartData> | undefined {
        return this.state.get(id);
    }

    /**
     * The cabin parts of a given lift, in `LIFT_PART_CYCLE_ORDER`. This is the
     * query the Tab drill-in and the property inspector both read, so it lives here
     * once rather than being re-derived by each of them in a different order.
     */
    byLift(liftId: string): readonly LiftPartData[] {
        const out: LiftPartData[] = [];
        for (const p of this.state.values()) if (p.liftId === liftId) out.push(p);
        return out;
    }

    /** One named part of one lift — what "select the cabin ceiling alone" resolves through. */
    partOfKind(liftId: string, kind: LiftPartKind): Readonly<LiftPartData> | undefined {
        for (const p of this.state.values()) {
            if (p.liftId === liftId && p.kind === kind) return p;
        }
        return undefined;
    }
}
