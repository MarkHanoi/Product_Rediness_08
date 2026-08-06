/**
 * UpdateStairRailingCommand — §FIX-STAIR-RAILING-TYPE-PICKER
 * ==========================================================
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 *
 * §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) wired a "Railing Type" picker for the
 * STANDALONE handrail family (`handrailStore` / `UpdateHandrailCommand`). A stair's
 * railing is a DIFFERENT element: `elementType: 'stair-railing'`, semantic
 * `'stair-railing'`, living in `StairRailingStore`. Nothing routed to it — no
 * property-panel widget, no `element.changeType` branch, and, critically, NO UPDATE
 * COMMAND AT ALL. `CommandType.UPDATE_STAIR_RAILING` had been declared in the enum
 * since the railing sub-system was authored and no command ever implemented it, so
 * even a correct dispatch had nowhere to land. Selecting a stair railing showed
 * "Element Type —" and no picker (the founder's report).
 *
 * ── WHY A NEW COMMAND RATHER THAN REUSE ──────────────────────────────────────
 *
 * `UpdateHandrailCommand` was the reuse candidate and it does not fit: it validates
 * and writes `ctx.stores.handrailStore`, a different store holding a different record
 * shape (`HandrailData` has a `baseLine`; `StairRailingConfig` has a `stairId` + a
 * `side` and derives its path from the host stair's flights). Pointing it at the
 * railing store would mean a second record shape inside one command — the
 * "detached store" class of bug ADR-0105 exists to prevent. The UNIFORM SURFACE is
 * still reused: this command is reached through `element.changeType`, exactly like
 * every other family, and the type CATALOGUE is reused too (`handrailTypeStore` —
 * see `StairRailingTypeMapping`). Only the store-owning command is new, which is the
 * ADR-0105 invariant: one command per geometry store.
 *
 * ── REBUILD + UNDO ───────────────────────────────────────────────────────────
 *
 * `StairRailingStore.update()` emits 'bim-stair-railing-updated', which
 * `StairRailingBuilder` now listens to (it did not before — see that file), so the
 * railing mesh rebuilds from the new construction form. Undo restores the EXACT
 * pre-image via `restoreSnapshot`, because a merge cannot unset `typeId` on a
 * railing that had never been individually typed (C03 §4.5).
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import type { StairRailingConfig } from '@pryzm/geometry-stair';

export interface UpdateStairRailingPayload {
    id: string;
    /** `HandrailTypeDefinition.id` this railing was materialised from. */
    typeId?: string;
    railingType?: StairRailingConfig['railingType'];
    topRailHeight?: number;
    handrailHeight?: number;
    balusterShape?: StairRailingConfig['balusterShape'];
    balusterWidth?: number;
    balusterSpacing?: number;
    postAtStart?: boolean;
    postAtEnd?: boolean;
    material?: string;
}

/** Guard rails on the numeric fields, so a bad type can never write NaN geometry. */
const RAIL_HEIGHT_MIN = 0.3;
const RAIL_HEIGHT_MAX = 2.5;

export class UpdateStairRailingCommand implements Command {
    readonly affectedStores = ['stair-railing'] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.UPDATE_STAIR_RAILING;
    readonly timestamp = Date.now();
    readonly targetIds: string[];

    private prevSnapshot?: StairRailingConfig;

    constructor(private payload: UpdateStairRailingPayload) {
        this.targetIds = [payload.id];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const store = ctx.stores.stairRailingStore;
        if (!store) return { ok: false, reason: 'StairRailingStore not available in command context' };
        if (!store.get(this.payload.id)) return { ok: false, reason: `Stair railing "${this.payload.id}" not found` };

        const h = this.payload.topRailHeight;
        if (h !== undefined && !(Number.isFinite(h) && h >= RAIL_HEIGHT_MIN && h <= RAIL_HEIGHT_MAX)) {
            return { ok: false, reason: `topRailHeight must be between ${RAIL_HEIGHT_MIN} m and ${RAIL_HEIGHT_MAX} m` };
        }
        const hh = this.payload.handrailHeight;
        if (hh !== undefined && !(Number.isFinite(hh) && hh >= RAIL_HEIGHT_MIN && hh <= RAIL_HEIGHT_MAX)) {
            return { ok: false, reason: `handrailHeight must be between ${RAIL_HEIGHT_MIN} m and ${RAIL_HEIGHT_MAX} m` };
        }
        // A zero / negative baluster width or spacing renders as an invisible or an
        // exploded balustrade with no error anywhere — refuse instead of writing it.
        const bw = this.payload.balusterWidth;
        if (bw !== undefined && !(Number.isFinite(bw) && bw > 0)) {
            return { ok: false, reason: 'balusterWidth must be a finite number greater than 0' };
        }
        const bs = this.payload.balusterSpacing;
        if (bs !== undefined && !(Number.isFinite(bs) && bs > 0)) {
            return { ok: false, reason: 'balusterSpacing must be a finite number greater than 0' };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = ctx.stores.stairRailingStore;
        const railing = store?.get(this.payload.id);
        if (!store || !railing) {
            return { success: false, affectedElementIds: [], info: [`Stair railing "${this.payload.id}" not found`] };
        }

        this.prevSnapshot = structuredClone(railing);

        const updates: Partial<StairRailingConfig> = {};
        const p = this.payload;
        if (p.typeId          !== undefined) updates.typeId          = p.typeId;
        if (p.railingType     !== undefined) updates.railingType     = p.railingType;
        if (p.topRailHeight   !== undefined) updates.topRailHeight   = p.topRailHeight;
        if (p.handrailHeight  !== undefined) updates.handrailHeight  = p.handrailHeight;
        if (p.balusterShape   !== undefined) updates.balusterShape   = p.balusterShape;
        if (p.balusterWidth   !== undefined) updates.balusterWidth   = p.balusterWidth;
        if (p.balusterSpacing !== undefined) updates.balusterSpacing = p.balusterSpacing;
        if (p.postAtStart     !== undefined) updates.postAtStart     = p.postAtStart;
        if (p.postAtEnd       !== undefined) updates.postAtEnd       = p.postAtEnd;
        if (p.material        !== undefined) updates.material        = p.material;

        // store.update() emits 'bim-stair-railing-updated' → StairRailingBuilder
        // rebuilds this railing's mesh (§01 §4: builder isolation — no direct call).
        store.update(this.payload.id, updates);

        return { success: true, affectedElementIds: [this.payload.id], info: ['Stair railing updated'] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };
        const store = ctx.stores.stairRailingStore;
        if (!store) return { success: false, affectedElementIds: [], info: ['StairRailingStore not available'] };
        // EXACT pre-image, not a merge: undoing the first-ever type apply must UNSET
        // `typeId`, or the railing keeps claiming a type it no longer carries.
        store.restoreSnapshot(this.payload.id, this.prevSnapshot);
        return { success: true, affectedElementIds: [this.payload.id], info: ['Stair railing update undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
