// SpaceEnvelopeStore — the space envelope's ONE authority.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §2 · C84 EI-1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ EXACTLY ONE STORE, DECLINED IN ADVANCE RATHER THAN CLEANED UP LATER
// ═══════════════════════════════════════════════════════════════════════════════
//
// C84 §1 measures FIVE rival representations per element family, and rows 2 and 3 —
// the plugin DTO store and the legacy geometry store — are the pair that keeps
// diverging. `plugins/wall/src/handlers/MoveWall.ts` REFUSES `wall.move` in its own
// words because *"it writes the detached plugin wall store that nothing renders,
// exports or persists"*.
//
// C114 §2a took the one chance a brand-new family has: **no plugin DTO twin and no
// `roomStore` mirror.** This class IS the authority, built once by `PluginRegistry`
// and reachable at `runtime.stores.spaceEnvelope`. C84 EI-1 ("one authority per
// family, and it is NAMED") therefore holds by CONSTRUCTION, not by discipline —
// there is no second record for it to drift from.
//
// ⛔ THE ROOM MIRROR IS THE ONE THAT WOULD HAVE BEEN TEMPTING, AND ADR-0380 D1 GIVES
// THE MEASURED REASON IT IS FORBIDDEN: `RoomTopologyObserver` discharges suppressed
// commits on `resume()` (C84 EI-7e), so after any wall undo room boundaries are
// RECOMPUTED from the post-undo wall set. A wall-free volume placed in the room store
// would be recomputed away by the room detector — and that recompute is the CORRECT
// behaviour of that subsystem, which is precisely why this family must stay out of it.
//
// ─── WHAT LIVES HERE ────────────────────────────────────────────────────────────
// The envelope's own record and nothing else. `withinId` is a REFERENCE to another
// envelope, not ownership: deleting a level envelope does not delete the room
// envelopes inside it (C114 §8). Adjacency and stacking are NOT stored at all —
// they are functions of two prisms, and storing a derived predicate is a cache
// (C84 EI-9, ADR-0380 D3).

import { Store } from '@pryzm/plugin-sdk';
import type { SpaceEnvelope } from '@pryzm/plugin-sdk';
import { massingGroupMembers } from './groupMembership.js';

/** The element record, as the L0 schema defines it. */
export type SpaceEnvelopeData = SpaceEnvelope;

/** The record view handed to handlers via `ctx.stores.spaceEnvelope`. */
export type SpaceEnvelopesState = Record<string, SpaceEnvelopeData>;

export class SpaceEnvelopeStore extends Store<SpaceEnvelopeData> {
    constructor() {
        super('spaceEnvelope');
    }

    ids(): readonly string[] {
        return [...this.state.keys()];
    }

    get(id: string): Readonly<SpaceEnvelopeData> | undefined {
        return this.state.get(id);
    }

    /** Every envelope seated on a given storey. O(N). */
    byLevel(levelId: string): readonly SpaceEnvelopeData[] {
        const out: SpaceEnvelopeData[] = [];
        for (const e of this.state.values()) if (e.levelId === levelId) out.push(e);
        return out;
    }

    /** Every envelope in a given authored role. */
    byRole(role: string): readonly SpaceEnvelopeData[] {
        const out: SpaceEnvelopeData[] = [];
        for (const e of this.state.values()) if (e.role === role) out.push(e);
        return out;
    }

    /**
     * The envelopes declared to sit WITHIN `id`.
     *
     * ⭐ A SCAN, NOT AN INDEX, AND DELIBERATELY SO. The edge is stored on the CHILD
     * (`withinId`), which is the direction C84 EI-PROP-d requires — the record must
     * hold an edge to walk. Answering from the PARENT's side is therefore O(N), and
     * that is acceptable: a project has tens of level envelopes, not thousands. The
     * alternative is a `childIds` array on the parent, which would be a SECOND copy
     * of one relationship and could disagree with the first (C84 EI-9).
     */
    childrenOf(id: string): readonly SpaceEnvelopeData[] {
        const out: SpaceEnvelopeData[] = [];
        for (const e of this.state.values()) if (e.withinId === id) out.push(e);
        return out;
    }

    /**
     * ⭐ Every envelope belonging to one massing group — ADR-0383 D1 / S1.
     *
     * ⭐ A SCAN, NOT AN INDEX, AND FOR EXACTLY THE REASON `childrenOf` GIVES. The edge
     * is stored on the MEMBER (`group`), which is the direction C84 EI-PROP-d requires
     * — the record must hold the edge to walk. Answering from the GROUP's side is
     * therefore O(N), and that is acceptable: a master plan has a handful of blocks and
     * tens of storeys, not thousands of records. The alternative is a `memberIds` array
     * held somewhere per group, which would be a SECOND copy of one relationship and
     * could disagree with the first (C84 EI-9) — and per ADR-0383 D1 there is nowhere
     * for it to live, because a group is deliberately not an element and not a store.
     *
     * ⛔ `null` IS A REAL ARGUMENT, NOT A MISSING ONE: it answers *"which envelopes are
     * UNGROUPED"*, which is its own bucket under ADR-0383 D3 and the bucket every
     * envelope written before that ADR sits in. Passing `null` deliberately is how the
     * single-building flow stays byte-identical; a second hand-rolled
     * `filter(e => e.group === null)` somewhere else would be the same rule with two
     * implementations, which is this repository's most-repeated defect.
     */
    byGroup(groupId: string | null): readonly SpaceEnvelopeData[] {
        // ⛔ THE PREDICATE LIVES IN `groupMembership.ts` AND IS CALLED, NOT RE-TYPED. It was one
        // expression here until the three `spaceEnvelope.group.*` verbs needed it too and could not
        // reach this method: a handler receives the plain `SpaceEnvelopesState` record, never this
        // instance. Re-typing it there would have been exactly the two-implementations defect this
        // method's own doc warns about, arriving by a route the warning did not anticipate.
        return massingGroupMembers(this.state.values(), groupId);
    }
}
