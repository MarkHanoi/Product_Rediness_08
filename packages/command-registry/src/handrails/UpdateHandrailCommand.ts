import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { HandrailData, Point3D } from '@pryzm/core-app-model';
import { serializeHandrailSnapshot, deserializeHandrailSnapshot } from '@pryzm/core-app-model';

export interface UpdateHandrailPayload {
    id: string;
    height?: number;
    thickness?: number;
    materialColor?: string;
    baseOffset?: number;
    fillType?: string;
    railProfile?: string;
    /**
     * §FIX-MOVE-SLAB-AND-HANDRAIL (Gate G7) — the handrail's two-point baseline.
     *
     * This is what made handrail MOVE a "double lie" (enabled + inert on BOTH surfaces):
     * the 3-D gizmo refused the drag with "handrail geometry is defined by path points —
     * use the Plan View move tool", the Plan View move tool never implemented it, and the
     * claim itself was false. `HandrailData.baseLine` is `[Point3D, Point3D]` — a LINE, the
     * same shape as beam and curtain-wall. This command owns the GEOMETRY `handrailStore`
     * (the one HandrailFragmentBuilder + the plan projector + persistence read), so it is
     * the right place for the positional field; it simply never carried one.
     *
     * Bus route: `handrail.moveBaseLine` (initBusHandlers) — a DISTINCT type, per the L-220
     * `plumbing.moveFixture` precedent, so no plugin handler on a detached DTO store can
     * shadow it.
     */
    baseLine?: [Point3D, Point3D];
}

export class UpdateHandrailCommand implements Command {
    readonly affectedStores = ["handrail"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.UPDATE_HANDRAIL;
    readonly timestamp = Date.now();
    targetIds: string[];
    private prevSnapshot: string | undefined;

    constructor(private payload: UpdateHandrailPayload) {
        this.targetIds = [payload.id];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const handrail = ctx.stores.handrailStore.getById(this.payload.id);
        if (!handrail) return { ok: false, reason: 'Handrail not found' };

        if (this.payload.height !== undefined) {
            if (this.payload.height < 0.3 || this.payload.height > 2.5) {
                return { ok: false, reason: 'Handrail height must be between 0.3 m and 2.5 m' };
            }
        }

        // §FIX-MOVE-SLAB-AND-HANDRAIL (G7) — reject a malformed baseline LOUDLY rather than
        // writing NaN endpoints into the geometry store (which renders as an invisible or
        // exploded rail with no error anywhere).
        const bl = this.payload.baseLine;
        if (bl !== undefined) {
            const ok = Array.isArray(bl) && bl.length === 2 && bl.every(
                (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
            );
            if (!ok) return { ok: false, reason: 'baseLine must be exactly two finite {x,y,z} points' };
            if (Math.hypot(bl[1].x - bl[0].x, bl[1].z - bl[0].z) < 1e-6) {
                return { ok: false, reason: 'baseLine endpoints are coincident — the handrail would be degenerate' };
            }
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = ctx.stores.handrailStore;
        const handrail = store.getById(this.payload.id);
        if (!handrail) return { success: false, affectedElementIds: [] };

        this.prevSnapshot = serializeHandrailSnapshot(handrail);

        const updates: Partial<HandrailData> = {};
        if (this.payload.height       !== undefined) updates.height       = this.payload.height;
        if (this.payload.thickness    !== undefined) updates.thickness    = this.payload.thickness;
        if (this.payload.materialColor !== undefined) updates.materialColor = this.payload.materialColor;
        if (this.payload.baseOffset   !== undefined) updates.baseOffset   = this.payload.baseOffset;
        if (this.payload.fillType     !== undefined) updates.fillType     = this.payload.fillType as any;
        if (this.payload.railProfile  !== undefined) updates.railProfile  = this.payload.railProfile as any;
        // §FIX-MOVE-SLAB-AND-HANDRAIL (G7) — deep-clone: the store keeps the reference, and a
        // shared array would let a later caller mutate the committed record in place (and
        // would make the ring-buffer inverse patch restore the NEW endpoints — a no-op undo).
        if (this.payload.baseLine !== undefined) {
            updates.baseLine = [
                { ...this.payload.baseLine[0] },
                { ...this.payload.baseLine[1] },
            ];
        }

        store.update(this.payload.id, updates);

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        const restored = deserializeHandrailSnapshot(this.prevSnapshot);
        ctx.stores.handrailStore.restoreSnapshot(this.payload.id, restored);
        return { success: true, affectedElementIds: [this.payload.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
