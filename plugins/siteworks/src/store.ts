// SiteworksStore — the siteworks family's ONE authority.
// C116 §2 · ADR-0384 · C84 EI-1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ EXACTLY ONE STORE, DECLINED IN ADVANCE RATHER THAN CLEANED UP LATER
// ═══════════════════════════════════════════════════════════════════════════════
//
// C84 §1 measures FIVE rival representations per element family, and rows 2 and 3 —
// the plugin DTO twin and the legacy geometry store — are the pair that keeps
// diverging. `plugins/wall/src/handlers/MoveWall.ts` REFUSES `wall.move` in its own
// words because *"it writes the detached plugin wall store that nothing renders,
// exports or persists"*.
//
// C116 §2 took the one chance a brand-new family has: **no plugin DTO twin, no
// `core-app-model` store, no `packages/stores` entry.** This class IS the authority,
// built once by `PluginRegistry` and reached at `runtime.stores.siteworks`. C84 EI-1
// ("one authority per family, and it is NAMED") therefore holds BY CONSTRUCTION, not
// by discipline — there is no second record for it to drift from.
//
// ⭐ AND THE SINGLE STORE IS WHAT BUYS ONE CTRL+Z. C116 §2 records that `pool` spans
// four stores and must therefore use `produceMultiStoreCommand` or its patches route
// to nothing. One store keeps *"lay out a masterplan"* a single `produceCommand` →
// one Immer patch pair → one undo entry, which is the entire reason §6a makes the
// create verb a BATCH.
//
// ⛔ NOTHING DERIVED IS STORED HERE. The swept ring of a linear surface and the area
// of any surface are FUNCTIONS (`@pryzm/geometry-siteworks`), computed on demand.
// Storing either would be a cache — a second answer to a question the geometry
// already answers (C84 EI-9) — and it would go stale on the next `setWidth`.

import { Store } from '@pryzm/plugin-sdk';
import type { Siteworks, SiteworksRole } from '@pryzm/plugin-sdk';

/** The element record, as the L0 schema defines it. */
export type SiteworksData = Siteworks;

/** The record view handed to handlers via `ctx.stores.siteworks`. */
export type SiteworksState = Record<string, SiteworksData>;

export class SiteworksStore extends Store<SiteworksData> {
    constructor() {
        // ⛔ THIS STRING MUST EQUAL `registration.storeKey`. If it does not,
        // `CommandBus.buildContext` throws "required store 'siteworks' is missing from
        // HandlerContext.stores" BEFORE anything mutates — registered and
        // undispatchable, the trap that hid pool, lift, lighting, section and
        // bathroomPod (C116 §4).
        super('siteworks');
    }

    ids(): readonly string[] {
        return [...this.state.keys()];
    }

    get(id: string): Readonly<SiteworksData> | undefined {
        return this.state.get(id);
    }

    /** Every surface seated on a given storey. O(N). */
    byLevel(levelId: string): readonly SiteworksData[] {
        const out: SiteworksData[] = [];
        for (const s of this.state.values()) if (s.levelId === levelId) out.push(s);
        return out;
    }

    /**
     * Every surface in a given role — roads, or parking, or footways.
     *
     * ⭐ A SCAN, NOT AN INDEX, and deliberately so: a role index would be a SECOND
     * copy of a fact the record already carries, and it could disagree with the first
     * (C84 EI-9). A site has tens of surfaces, not thousands.
     */
    byRole(role: SiteworksRole): readonly SiteworksData[] {
        const out: SiteworksData[] = [];
        for (const s of this.state.values()) if (s.role === role) out.push(s);
        return out;
    }
}
