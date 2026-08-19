import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { HandrailData, Point3D } from '@pryzm/core-app-model';
import { serializeHandrailSnapshot, deserializeHandrailSnapshot } from '@pryzm/core-app-model';

export interface UpdateHandrailPayload {
    id: string;
    height?: number;
    thickness?: number;
    /**
     * §C100-HANDRAIL-MATERIAL-ID — the explicit user OVERRIDE (C100 §2.1's one
     * legal role for a hex), with an explicit way to REMOVE it.
     *
     * ⛔ `null` MEANS "CLEAR THE OVERRIDE", AND IT HAD TO BE EXPRESSIBLE.
     * `undefined` already means "do not touch this field" — every line in
     * `execute` is guarded `!== undefined` — so before this there was NO WAY to
     * remove an override at all. That was a live defect the moment the catalogue
     * stopped shipping hexes: retyping a railing to a catalogue type wrote the new
     * `materialId` and LEFT the old hex, which by C100 §2.1 step 1 SHADOWS the
     * reference. The railing kept its previous colour permanently while its
     * geometry changed — a half-applied type, which is L-623's exact shape.
     */
    materialColor?: string | null;
    baseOffset?: number;
    fillType?: string;
    railProfile?: string;
    /**
     * §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — the two remaining fields a RAILING TYPE
     * carries that this payload could not express. `HandrailTypeDefinition` declares
     * `railDiameter` and `postSpacing`, `HandrailData` stores both, and
     * HandrailFragmentBuilder reads both — but the update command stopped at
     * height/thickness/fillType/railProfile, so swapping a railing to e.g. "Stainless
     * Steel Handrail" would have applied a partial type (right profile, wrong rail
     * diameter and post spacing). A materialised type must be materialised WHOLE.
     */
    railDiameter?: number;
    postSpacing?: number;
    /**
     * §FEAT-HANDRAIL-TYPE-LIBRARY-20 (C95 D5) — the infill members, for the SAME
     * reason L-623 added `railDiameter` / `postSpacing` directly above: a
     * materialised type must be materialised WHOLE.
     *
     * ⛔ THIS IS A ONE-SIDED-FIX GUARD, NOT AN EXTRA. `CreateHandrailCommand` now
     * carries these four, so a railing CREATED as "Timber Picket Railing" gets its
     * 38 mm pickets at the 100 mm-sphere pitch. Had only creation been widened, a
     * railing RETYPED to the same catalogue entry would have kept generic 20 mm
     * balusters at 0.11 m — one shared defect turned into a per-path divergence,
     * which is worse than the defect (C84 EI-9). Both paths move together.
     */
    balusterShape?: 'rectangular' | 'round';
    balusterWidth?: number;
    balusterSpacing?: number;
    infillMaxGap?: number;
    /**
     * §C100-HANDRAIL-MATERIAL-ID (C100 §2.1) — the MASTER material reference.
     * A retype MUST move this, or the railing keeps the previous material while
     * its geometry changes: a half-applied type, which is L-623's defect shape.
     */
    materialId?: string;
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

        // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — reject a non-finite / negative rail
        // diameter or post spacing rather than writing NaN into the geometry store (which
        // renders as an invisible or exploded rail with no error anywhere). `postSpacing`
        // MAY be 0 — the built-in "Stair Handrail" type declares exactly that (no posts).
        if (this.payload.railDiameter !== undefined
            && !(Number.isFinite(this.payload.railDiameter) && this.payload.railDiameter > 0)) {
            return { ok: false, reason: 'railDiameter must be a finite number greater than 0' };
        }
        if (this.payload.postSpacing !== undefined
            && !(Number.isFinite(this.payload.postSpacing) && this.payload.postSpacing >= 0)) {
            return { ok: false, reason: 'postSpacing must be a finite number >= 0' };
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
        // `null` clears the override; a string sets it; `undefined` leaves it alone.
        // Writing `undefined` INTO `updates` is deliberate and does work here:
        // `HandrailStore.update` is `Object.assign(clone, updates)`, which copies own
        // enumerable keys INCLUDING ones whose value is undefined — measured, not
        // assumed (HandrailStore.ts:56-66, declared 'merge' in legacyStoreUpdateSemantics).
        if (this.payload.materialColor !== undefined) {
            updates.materialColor = this.payload.materialColor === null
                ? undefined
                : this.payload.materialColor;
        }
        if (this.payload.baseOffset   !== undefined) updates.baseOffset   = this.payload.baseOffset;
        if (this.payload.fillType     !== undefined) updates.fillType     = this.payload.fillType as any;
        if (this.payload.railProfile  !== undefined) updates.railProfile  = this.payload.railProfile as any;
        // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — see the payload doc: a railing type is
        // materialised into the record, so every field the type declares must be written.
        if (this.payload.railDiameter !== undefined) updates.railDiameter = this.payload.railDiameter;
        if (this.payload.postSpacing  !== undefined) updates.postSpacing  = this.payload.postSpacing;
        // §FEAT-HANDRAIL-TYPE-LIBRARY-20 — the four infill fields, written by the
        // same rule. `serializeHandrailSnapshot` is a plain JSON round-trip with no
        // field whitelist (measured), so undo restores them without further work.
        if (this.payload.balusterShape   !== undefined) updates.balusterShape   = this.payload.balusterShape;
        if (this.payload.balusterWidth   !== undefined) updates.balusterWidth   = this.payload.balusterWidth;
        if (this.payload.balusterSpacing !== undefined) updates.balusterSpacing = this.payload.balusterSpacing;
        if (this.payload.infillMaxGap    !== undefined) updates.infillMaxGap    = this.payload.infillMaxGap;
        if (this.payload.materialId      !== undefined) updates.materialId      = this.payload.materialId;
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
