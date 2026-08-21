import {
    Command, CommandContext, CommandType,
    CommandValidationResult, CommandResult, SerializedCommand,
} from '../types';
import { windowStore } from '@pryzm/geometry-window';
import { WindowOpening, WindowOpeningSchema } from '@pryzm/geometry-window';
import { wallOccupancyStore } from '@pryzm/geometry-wall';
// ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — C83's IMPOSSIBLE gate and its INADVISABLE
// advisory, IMPORTED rather than restated, for the same reason `curvedLeafRefusal` is
// exported from that package: both directions of a panel/geometry mismatch shipped here on
// 2026-08-18, and a shared gate is the only thing that closes it. The command consults the
// exact function the builder's geometry obeys.
import { windowRevealRefusal, windowRevealAdvisory, isRevealAuthored } from '@pryzm/geometry-window';
// §OPENING-PROFILE (L-1252) — the ONE gate the builders obey, so the panel's refusal and
// the geometry cannot disagree about which hosts can carry a curved void.
import { openingProfileRefusal, isRectangularProfile } from '@pryzm/geometry-wall';

/**
 * D4 — UpdateWindowParameterCommand
 *
 * Applies an arbitrary parameter patch to a WindowOpening in the rich
 * WindowStore and propagates compatible fields to the legacy WallStore so
 * both stores remain in sync (§03 two-store sync rule).
 *
 * §WIN-AUDIT-2026 P-EXEC-PREV (mirrors DOOR P2 #8):
 *   `prev` is captured at execute() time from the live store snapshot.
 *
 * §WIN-AUDIT-2026 P-CAN-EXEC-VALIDATE:
 *   `canExecute()` runs `WindowOpeningSchema.safeParse(merged)` so validation
 *   failures surface as `{ ok: false, reason }`.
 *
 * §WIN-AUDIT-2026 M2 deep-freeze:
 *   Both `patch` and the captured `prev` are deeply frozen so callers cannot
 *   mutate the historical record (e.g. nested arrays in `columnRatios`).
 */
function deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        const v = (obj as Record<string, unknown>)[key];
        if (v && typeof v === 'object') deepFreeze(v);
    }
    return Object.freeze(obj);
}

export class UpdateWindowParameterCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_WINDOW_PARAMETER;
    timestamp: number = Date.now();
    targetIds: string[];

    private prev: Partial<WindowOpening>;
    private prevCapturedAtExecute = false;

    constructor(
        private windowId: string,
        private patch: Partial<WindowOpening>,
        prev: Partial<WindowOpening> = {},
    ) {
        this.targetIds = [windowId];
        this.patch = deepFreeze({ ...patch });
        this.prev  = deepFreeze({ ...prev });
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        const current = windowStore.getById(this.windowId);
        if (!current) {
            return { ok: false, reason: `Window not found: ${this.windowId}` };
        }
        const merged = { ...current, ...this.patch };
        const parsed = WindowOpeningSchema.safeParse(merged);
        if (!parsed.success) {
            return { ok: false, reason: `Invalid window patch: ${parsed.error.issues.map(i => i.message).join('; ')}` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const current = windowStore.getById(this.windowId);
        if (!current) {
            return { success: false, affectedElementIds: [], info: [`Window not found: ${this.windowId}`] };
        }
        // §FIX-WINDOW-OOB-OPENING-RESTORE (L-82): clamp dimensional fields to the
        // host wall BEFORE writing, so the window frame (windowStore) and its wall
        // opening (wallStore) receive the SAME in-bounds values and stay consistent.
        // Without this, a width/height/offset/sill edit past the wall extent
        // orphaned the opening — the wall stopped being cut and the window could
        // neither recover nor be deleted. The clamp may add fields the caller did
        // not send (e.g. a too-wide width forces the offset inward), so prev is
        // captured over the EFFECTIVE patch keys — keeping the derived shift undoable.
        // ── §OPENING-PROFILE (L-1252) — CHANGING THE SHAPE OF AN OPENING THAT ALREADY EXISTS ──
        //
        // ⭐ THIS IS THE HALF THE MODE BAR CANNOT REACH. The bar authors NEW openings; the founder
        // has 85 windows already placed, and an authoring-only capability reads as broken.
        //
        // Two things have to happen that a plain field patch does not do:
        //   1. REFUSE what the host cannot carry — the same predicate the builders obey, so a
        //      curved host declines with the reason and the live alternative (C16 CA-18) instead
        //      of the panel reporting success over a wall that kept its rectangle.
        //   2. SQUARE THE BOX for `circular`. C86 §10.1 PR-8 has no radius field — the width IS
        //      the diameter — so flipping an existing 1.2 x 1.5 window to Circular must carry the
        //      height with it, or the very next validation refuses the user's own record.
        const _profilePatch = this._resolveProfilePatch(context, current);
        if (typeof _profilePatch === 'string') {
            // ⛔ A REFUSAL, NOT A SILENT NO-OP. `success:false` with the reason is what lets the
            // panel surface it; returning success here would be the "committed ≠ reachable"
            // defect wearing a green tick.
            return { success: false, affectedElementIds: [], info: [_profilePatch] };
        }

        // ── ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — C83, ON THE MUTATION PATH ────
        //
        // The founder's standing direction separates IMPOSSIBLE from INADVISABLE from FINE
        // and forbids auto-editing. A splay steep enough that the two reveals MEET leaves the
        // glazing with zero area — IMPOSSIBLE — and the refusal names BOTH the angle and the
        // dimension that makes it degenerate, so the user knows which of the two to change.
        //
        // ⛔ IT REFUSES; IT DOES NOT CLAMP. A silently-clamped reveal produces a window whose
        // glazing is invisible and whose Properties panel reports success — from the user's
        // side, indistinguishable from one that worked. `success: false` carrying the reason
        // is what lets the panel surface it, exactly as the profile refusal above does.
        const _revealRefusal = this._resolveRevealRefusal(context, current, _profilePatch);
        if (_revealRefusal) {
            return { success: false, affectedElementIds: [], info: [_revealRefusal] };
        }

        const patch = this._clampPatchToWall(context, current, _profilePatch);

        if (!this.prevCapturedAtExecute) {
            const captured: Partial<WindowOpening> = {};
            for (const key of Object.keys(patch) as (keyof WindowOpening)[]) {
                (captured as any)[key] = current[key];
            }
            this.prev = deepFreeze(captured);
            this.prevCapturedAtExecute = true;
        }

        windowStore.update(this.windowId, patch);
        this._syncWallStore(context, patch);
        // §FEAT-WINDOW-REVEAL — an INADVISABLE reveal SUCCEEDS AND SAYS SO. `_revealAdvisory`
        // is null on every other edit, so no existing path gains an `info` line.
        return this._revealAdvisory
            ? { success: true, affectedElementIds: [this.windowId], info: [this._revealAdvisory] }
            : { success: true, affectedElementIds: [this.windowId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!windowStore.has(this.windowId)) {
            return { success: false, affectedElementIds: [], info: [`Window not found for undo: ${this.windowId}`] };
        }
        windowStore.update(this.windowId, this.prev);
        this._syncWallStore(context, this.prev);
        return { success: true, affectedElementIds: [this.windowId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            payload: { windowId: this.windowId, patch: this.patch, prev: this.prev },
            version: 2,
        };
    }

    /**
     * §FEAT-WINDOW-REVEAL — the INADVISABLE note for the edit currently executing, or null.
     * Set by {@link _resolveRevealRefusal}; read once by `execute`.
     */
    private _revealAdvisory: string | null = null;

    /**
     * ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — the C83 IMPOSSIBLE gate for a reveal edit.
     *
     * Returns the refusal, or `null`. A patch touching none of the trigger fields returns
     * `null` immediately, so every pre-existing edit reaches exactly its previous code.
     *
     * ⚠ **THE GATE IS ASKED ABOUT THE MERGED RECORD, NEVER ABOUT THE PATCH.** Splay angles
     * and the opening's own size compose: "set the left jamb to 40°" is fine on a 1.8 m
     * window and degenerate on a 0.4 m one, and a patch carrying only the angle cannot be
     * judged alone. This is the same reason `canExecute` parses `{...current, ...patch}`.
     *
     * ⚠ **AND THAT IS WHY `width` / `height` ARE IN THE TRIGGER SET.** SHRINKING a window
     * can make an already-authored splay degenerate. A gate keyed only on the reveal fields
     * would pass that edit and produce the zero-glass window by the back door — the same
     * class of hole as validating a patch instead of a record.
     *
     * ⚠ **NO HOST WALL ⇒ SKIPPED, NOT FAILED.** The reveal run is half the wall thickness,
     * so with no wall there is no run and no measurable question. Refusing on a missing
     * lookup is the refusal-without-an-escape-hatch shape L-942 records.
     */
    private _resolveRevealRefusal(
        context: CommandContext,
        current: WindowOpening,
        patch: Partial<WindowOpening>,
    ): string | null {
        const REVEAL_TRIGGERS = [
            'revealProjection', 'revealSplayHead', 'revealSplaySill',
            'revealSplayJambLeft', 'revealSplayJambRight',
            'width', 'height',
        ] as const;
        if (!REVEAL_TRIGGERS.some(k => k in patch)) return null;

        const merged = { ...current, ...patch } as WindowOpening;
        if (!isRevealAuthored(merged as never)) return null;

        const wall = context.stores?.wallStore?.getById?.(current.wallId);
        const thickness = (wall as { thickness?: number } | undefined)?.thickness;
        if (typeof thickness !== 'number' || !(thickness > 0)) return null;

        const refusal = windowRevealRefusal(merged as never, thickness);
        if (refusal) return refusal;

        // INADVISABLE is CARRIED, never enforced — stashed so `execute` can put it on the
        // successful result's `info`. "Always ASK, never auto-edit": this is the ASK's raw
        // material. 🔴 The affordance that turns it into an actual QUESTION (a confirm card,
        // the way a destructive capability gets one) is NOT built — L-1927.
        this._revealAdvisory = windowRevealAdvisory(merged as never, thickness);
        return null;
    }

    /**
     * §FIX-WINDOW-OOB-OPENING-RESTORE (L-82) — return a copy of `patch` whose
     * dimensional fields are clamped so the frame span stays inside the host wall.
     * A colour-only / type-only edit (no dimensional field) is returned untouched,
     * as is any patch when the host wall cannot be resolved. When clamping DOES
     * fire, every dimensional field the clamp changed relative to the CURRENT
     * record is written back — including fields the caller did not send (e.g. a
     * too-wide width forces the offset inward), so the frame never exceeds the wall.
     */
    private _clampPatchToWall(
        context: CommandContext,
        current: WindowOpening,
        patch: Partial<WindowOpening>,
    ): Partial<WindowOpening> {
        const dimKeys = ['offset', 'width', 'height', 'sillHeight'] as const;
        if (!dimKeys.some(k => k in patch)) return patch;

        const wall = context.stores?.wallStore?.getById?.(current.wallId);
        if (!wall) return patch;

        const clamped = wallOccupancyStore.clampToWall(wall, {
            offset:     (patch.offset     ?? current.offset)     as number,
            width:      (patch.width      ?? current.width)      as number,
            height:     (patch.height     ?? current.height)     as number,
            sillHeight: (patch.sillHeight ?? current.sillHeight) as number,
        });
        if (!clamped.clamped) return patch;

        const out: Partial<WindowOpening> = { ...patch };
        for (const k of dimKeys) {
            // Write a clamped dimension when the caller sent it OR when the clamp
            // had to move it away from its current value to keep the frame in-bounds.
            if (k in patch || (clamped as any)[k] !== (current as any)[k]) {
                (out as any)[k] = (clamped as any)[k];
            }
        }
        return out;
    }

    /**
     * §OPENING-PROFILE (L-1252) — validate a profile change and carry its consequences.
     *
     * Returns the effective patch, or a REFUSAL STRING when the change cannot be made good.
     * A patch that does not touch `openingProfile` is returned untouched, so every existing
     * edit keeps its exact previous behaviour.
     */
    private _resolveProfilePatch(
        context: CommandContext,
        current: WindowOpening,
    ): Partial<WindowOpening> | string {
        const patch = this.patch;
        if (!('openingProfile' in patch)) return patch;

        const nextProfile = patch.openingProfile;
        const out: Partial<WindowOpening> = { ...patch };

        // A circle's bounding box is square, and `width` is the diameter. Carrying the height
        // here — rather than asking the user to set it — is the C84 EI-3 rule applied to an EDIT:
        // the panel offered the profile, so the pipeline makes the offer good.
        if (!isRectangularProfile(nextProfile) && nextProfile === 'circular') {
            const w = (patch.width ?? current.width) as number;
            out.width  = w;
            out.height = w;
        }

        const wall = context.stores?.wallStore?.getById?.(current.wallId);
        const reason = openingProfileRefusal({
            profile:    nextProfile,
            width:      (out.width      ?? current.width)      as number,
            height:     (out.height     ?? current.height)     as number,
            sillHeight: (out.sillHeight ?? current.sillHeight) as number,
            host:       wall ?? null,
        });
        return reason ?? out;
    }

    private _syncWallStore(context: CommandContext, delta: Partial<WindowOpening>): void {
        try {
            const ws = context.stores.wallStore;
            if (!ws.getWindow(this.windowId)) return;
            ws.updateWindow(this.windowId, delta as any);

            // ── §OPENING-PROFILE (L-1252) — THE HOP `updateWindow` CANNOT MAKE ───────────
            //
            // ⛔ MEASURED, NOT ASSUMED: `WallStore.updateWindow` copies exactly FOUR fields onto
            // `wall.openings[]` — width, height, sillHeight, offset. A profile change would write
            // the windowStore, report success, and leave the WALL still cutting a rectangle: the
            // frame and the void diverge (C86 §11 #1), and the panel shows a circle the model
            // does not have.
            //
            // ⭐ `updateOpening` is the sanctioned public route that DOES reach the wall record —
            // it replaces the whole `Opening`, and `cloneOpening` is a spread, so the new field
            // survives. Using it here rather than widening `updateWindow`'s field list keeps this
            // lane out of `WallStore.ts`, which another lane holds.
            if (delta && 'openingProfile' in (delta as Record<string, unknown>)) {
                const win = ws.getWindow(this.windowId);
                const wall = win ? ws.getById?.(win.wallId) : null;
                const existing = wall?.openings?.find(
                    (o: { elementId?: string; id?: string }) =>
                        o.elementId === this.windowId || o.id === win?.openingId,
                );
                if (wall && existing) {
                    ws.updateOpening(wall.id, {
                        ...existing,
                        openingProfile: (delta as Record<string, unknown>).openingProfile,
                    } as never);
                }
            }
        } catch (err) {
            // §HONESTY — this used to be silent. The wall store holds a MIRROR of the
            // window opening; if the mirror write fails the two stores disagree and the
            // wall renders the OLD opening while the property panel shows the new one.
            // That divergence must not look identical to a successful sync.
            console.warn(
                `[UpdateWindowParameterCommand] wall-store mirror write FAILED for ${this.windowId} — ` +
                `wall geometry now disagrees with the window store.`,
                err,
            );
        }
    }
}
