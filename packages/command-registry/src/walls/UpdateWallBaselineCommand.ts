import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Point3D } from '@pryzm/core-app-model';
import { serializeWallSnapshot } from './wallSnapshotUtils';
// §FIX-WALL-SHRINK-REFIT (W2-1) — the wall-side use of the ALREADY-EXISTING
// opening gate. See the policy note on `planOpeningRefit`.
import { wallOccupancyStore } from '@pryzm/geometry-wall';
import type { Opening, WallData } from '@pryzm/geometry-wall';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface UpdateWallBaselineInput {
    wallId: string;
    /** New baseline as plain Point3D pair (Phase B DTO migration). */
    newBaseLine: [Point3D, Point3D];
    /**
     * Optional: supply the baseLine state BEFORE the change so that undo works
     * correctly even when the store has already been updated by a live drag.
     * If omitted, execute() reads it from the store at execution time.
     */
    prevBaseLine?: [Point3D, Point3D];
}

/**
 * UpdateWallBaselineCommand
 *
 * Moves one or both endpoints of a wall by directly setting a new baseLine.
 * Used by WallEndpointController after an endpoint drag gesture completes.
 *
 * Undo restores the previous baseLine snapshot.
 *
 * Contract compliance:
 *   §01 §2.1: Mutations only via WallStore.update().
 *   §01 §2.3: Full wall snapshot stored for undo — preserves metadata.version
 *             via restoreSnapshot() (FIX-1 / M2 / M11).
 */
export class UpdateWallBaselineCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_WALL_BASELINE;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly wallId: string;
    private readonly newBaseLine: [Point3D, Point3D];

    // Constructor-supplied prevBaseLine (for live-drag paths where the store is
    // already at the new position before execute() is called).
    private readonly ctorPrevBaseLine: [Point3D, Point3D] | null;

    // §M2/M11 FIX: Full wall snapshot captured in execute() so that undo can
    // use wallStore.restoreSnapshot() (which preserves metadata.version) rather
    // than wallStore.update() (which increments metadata.version on every undo,
    // corrupting the audit trail).
    private prevSnapshot: any = null;

    /**
     * §FIX-WALL-SHRINK-REFIT (W2-1) — the PRE-CLAMP openings this command moved
     * so they would stay inside the shortened wall.
     *
     * This exists because `WallStore.restoreSnapshot()` restores baseLine /
     * height / thickness / layers / metadata but **NOT `openings`** — openings
     * have their own mutation API (`_updateImpl` deletes a direct `openings`
     * write outright). So `prevSnapshot` alone cannot undo a relocation, and
     * without this record an undo would put the wall back at 6 m while leaving
     * the door at the offset the 3 m wall forced on it. Silent data loss on the
     * undo path is the same defect as silent data loss on the edit path.
     */
    private relocated: Opening[] = [];

    private executed = false;

    constructor(input: UpdateWallBaselineInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.wallId = input.wallId;
        // Phase B DTO migration: Point3D is a plain object — use spread for isolation.
        this.newBaseLine = [
            { ...input.newBaseLine[0] },
            { ...input.newBaseLine[1] },
        ];
        // Capture caller-supplied snapshot if provided (prevents undo capturing the
        // already-updated store state when a live drag has run before execute()).
        this.ctorPrevBaseLine = input.prevBaseLine
            ? [{ ...input.prevBaseLine[0] }, { ...input.prevBaseLine[1] }]
            : null;
        this.targetIds = [input.wallId];
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.wallId);
        if (!wall) {
            return { ok: false, reason: 'WALL_NOT_FOUND', blockingIssues: [`WALL_NOT_FOUND: ${this.wallId}`] };
        }
        // Phase B DTO migration: Point3D has no distanceTo() — compute manually.
        const dx = this.newBaseLine[1].x - this.newBaseLine[0].x;
        const dy = this.newBaseLine[1].y - this.newBaseLine[0].y;
        const dz = this.newBaseLine[1].z - this.newBaseLine[0].z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 0.1) {
            return { ok: false, reason: 'WALL_TOO_SHORT', blockingIssues: ['WALL_TOO_SHORT: minimum 0.1m'] };
        }

        // §FIX-WALL-SHRINK-REFIT (W2-1, EV-03 R-1) — the pre-flight half of the
        // opening gate. Until now the ONLY validation here was WALL_NOT_FOUND
        // and len < 0.1, so shortening a 6 m wall to 1.5 m left its 0.9 m door
        // at offset 2.0 — entirely off the end of its host, with no clamp, no
        // refusal and no event (EXECUTED probe, EV-03 §2.1).
        //
        // Declining HERE rather than only in execute() is the shape
        // `WallOccupancyStore.canPlace` already established for the raked-host
        // refusal (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH, L-812): a deliberate POLICY
        // REFUSAL must reach the user through the channel built for declines,
        // not as a fatal error out of a command body. execute() re-asks the same
        // gate as defence in depth for any path that skips canExecute.
        //
        // Only the wall's LENGTH matters to the fit, and length is
        // orientation-independent, so the §FT4 endpoint normalisation that
        // execute() performs cannot change this verdict.
        const refit = wallOccupancyStore.planOpeningRefit(
            { ...wall, baseLine: this.newBaseLine } as WallData,
        );
        if (!refit.ok) {
            return {
                ok: false,
                reason: 'OPENING_DOES_NOT_FIT',
                blockingIssues: refit.refusals.map(r => `OPENING_DOES_NOT_FIT: ${r.reason}`),
            };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.executed) {
            return { success: false, affectedElementIds: [], info: ['Command already executed'] };
        }
        const wall = ctx.stores.wallStore.getById(this.wallId);
        if (!wall) {
            return { success: false, affectedElementIds: [], info: [`Wall ${this.wallId} not found`] };
        }

        // §M2/M11 FIX: Capture a full wall snapshot for undo.
        // If the caller supplied ctorPrevBaseLine (live-drag path), the store
        // already holds the post-drag baseLine — so we serialize the current store
        // state but override the baseLine field with the pre-drag value so that
        // restoreSnapshot() on undo reverts to the correct pre-drag position.
        // If no ctorPrevBaseLine was supplied, the store still holds the original
        // position and we serialize it as-is.
        const serialized = serializeWallSnapshot(wall);
        if (this.ctorPrevBaseLine) {
            serialized.baseLine = [
                { x: this.ctorPrevBaseLine[0].x, y: this.ctorPrevBaseLine[0].y, z: this.ctorPrevBaseLine[0].z },
                { x: this.ctorPrevBaseLine[1].x, y: this.ctorPrevBaseLine[1].y, z: this.ctorPrevBaseLine[1].z },
            ];
        }
        this.prevSnapshot = serialized;

        // §FT4 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): normalise newBaseLine direction to match
        // the stored baseLine direction before calling wallStore.update().
        //
        // Root cause: the drag path (registerTransformDragHandler / MovePlanToolHandler) recomputes
        // the two baseLine endpoints in world space.  In certain drag directions or snap combinations
        // the computed [0]/[1] endpoints are in reversed order relative to the stored baseLine.
        // For walls without hosted elements this is harmless — the wall is geometrically symmetric.
        // For walls that host doors or windows, WallStore.update() throws BaselineReversalError
        // because opening offsets are measured from endpoint [0]; swapping endpoints would corrupt
        // every opening position — the guard is CORRECT and must remain in WallStore.
        //
        // Fix: compute the dot product of the incoming and stored XZ direction vectors.
        // If negative (endpoints reversed), swap [0] and [1] in a local effectiveBaseLine before
        // passing it to wallStore.update().  The reversal is invisible to the user — the wall moves
        // to exactly the intended position, hosted elements stay correctly offset.
        //
        // effectiveBaseLine is a local variable so this.newBaseLine (the immutable constructor
        // input) is never mutated — undo replay and serialize() are unaffected.
        let effectiveBaseLine: [Point3D, Point3D] = this.newBaseLine;
        {
            const storedBL = wall.baseLine as ReadonlyArray<{ x: number; y?: number; z: number }> | undefined;
            if (storedBL && storedBL.length >= 2) {
                const sDx = storedBL[1].x - storedBL[0].x;
                const sDz = storedBL[1].z - storedBL[0].z;
                const nDx = this.newBaseLine[1].x - this.newBaseLine[0].x;
                const nDz = this.newBaseLine[1].z - this.newBaseLine[0].z;
                // XZ-plane dot product (walls are horizontal; Y is wall height, not sweep direction).
                const dot = sDx * nDx + sDz * nDz;
                if (dot < 0) {
                    // Endpoints are in reversed order — swap to preserve hosted-opening offset correctness.
                    effectiveBaseLine = [
                        { x: this.newBaseLine[1].x, y: this.newBaseLine[1].y, z: this.newBaseLine[1].z },
                        { x: this.newBaseLine[0].x, y: this.newBaseLine[0].y, z: this.newBaseLine[0].z },
                    ];
                    console.log(
                        `[UpdateWallBaselineCommand] §FT4: endpoints swapped for wall ${this.wallId}` +
                        ` (dot=${dot.toFixed(3)}) — BaselineReversalError avoided, hosted elements preserved.`,
                    );
                }
            }
        }

        // §FIX-WALL-SHRINK-REFIT (W2-1, EV-03 R-1) — re-ask the opening gate with
        // the NORMALISED baseline, as the last line of defence for any caller
        // that dispatched without canExecute(). Same gate, same sentence.
        //
        // The refusal is delivered in the shape this command ALREADY uses for
        // "the store refused this move because of hosted openings" (the
        // BaselineReversalError catch immediately below): leave the wall in its
        // pre-drag state, force a rebuild so the visually-translated wallGroup
        // snaps back, toast, and return success:false. One policy, one shape —
        // a wall edit never damages a hosted opening, and never deletes one.
        const refit = wallOccupancyStore.planOpeningRefit(
            { ...wall, baseLine: effectiveBaseLine } as WallData,
        );
        if (!refit.ok) {
            const reason = refit.refusals.map(r => r.reason).join('; ');
            console.warn(
                `[UpdateWallBaselineCommand] §FIX-WALL-SHRINK-REFIT refusing baseline update for ` +
                `wall ${this.wallId}: ${reason} — leaving wall in pre-drag state.`,
            );
            try {
                _bus.emit('bim-wall-updated', { id: this.wallId }); // F.events.17
            } catch { /* DOM event must never throw past this guard */ }
            try {
                const toast = window.showAppToast as ((m: string, t?: string) => void) | undefined;
                toast?.(`Wall is too small for its openings — ${reason}`, 'error');
            } catch { /* showAppToast is optional */ }
            return {
                success: false,
                affectedElementIds: [this.wallId],
                info: [`OPENING_DOES_NOT_FIT: ${reason}`],
                error: `OPENING_DOES_NOT_FIT: ${reason}`,
            };
        }

        // §WALL-SYSTEM-AUDIT-2026 — RESILIENT BASELINE UPDATE
        // Guard against any throw from wallStore.update() (e.g.
        // BaselineReversalError when a wall hosts openings, schema validation,
        // or invariant assertions).  Without this catch the exception bubbles
        // to CommandManager.execute() which calls restoreSnapshot() on the
        // ENTIRE WallStore — re-emitting bim-wall-updated for every wall and
        // visually snapping the dragged wall back to its old position even
        // though the user's intent was clear.
        //
        // On failure we DO NOT update the store (data stays consistent) but we
        // also force a rebuild of THIS wall so the wallGroup geometry — which
        // was visually translated by WallTransformController during the live
        // drag — is restored to the canonical baseLine[0] position.  We then
        // surface the failure to the caller (success: false) so the gizmo
        // controller can show a toast / re-select state without leaving the
        // wall stranded mid-air.
        try {
            // §VIEW-DIRTY-CHECK §2.2: pass _renderVersion so the builder's dirty check
            // sees a version bump and rebuilds. updateWall() auto-increments for callers
            // that go through it, but this command uses the lower-level update() API.
            //
            // §R5-FIX (snap-back + stale highlight): also reset _sourceBaseLine to the
            // new position.  WallJoinResolver.resolveLevel() seeds each wall's resolver
            // from  `_sourceBaseLine ?? baseLine`  (WallJoinResolver.ts §SOURCE-BL-FIX).
            // If _sourceBaseLine still holds the PRE-DRAG coordinates after a 3D-gizmo
            // move, the resolver re-trims the wall back to the old join position on the
            // VERY NEXT flush (e.g. when the user draws a new element).  This causes both:
            //   (a) the wall geometry to snap back to the original position, and
            //   (b) wallGroup.userData.baseLine to be overwritten with old coords before
            //       the 2-frame re-highlight fires → highlight appears at old position.
            // Resetting _sourceBaseLine = newBaseLine tells the resolver "the user
            // intentionally moved this wall; compute joins from the NEW position".
            ctx.stores.wallStore.update(this.wallId, {
                baseLine: effectiveBaseLine,
                _renderVersion: (wall._renderVersion ?? 0) + 1,
                _sourceBaseLine: [
                    { x: effectiveBaseLine[0].x, y: effectiveBaseLine[0].y, z: effectiveBaseLine[0].z },
                    { x: effectiveBaseLine[1].x, y: effectiveBaseLine[1].y, z: effectiveBaseLine[1].z },
                ],
            } as any);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(
                `[UpdateWallBaselineCommand] wallStore.update rejected for wall ${this.wallId}: ${reason} — leaving wall in pre-drag state.`,
            );
            // Force a rebuild of this wall only so the visually-displaced
            // wallGroup snaps back into agreement with the still-current store.
            try {
                _bus.emit('bim-wall-updated', { id: this.wallId }); // F.events.17
            } catch { /* DOM event must never throw past this guard */ }
            // Toast UI surface (best-effort — keeps command layer headless).
            try {
                const toast = window.showAppToast as ((m: string, t?: string) => void) | undefined;
                toast?.('Wall move was rejected — try moving without hosted openings, or undo first.', 'error');
            } catch { /* showAppToast is optional */ }
            // Mark NOT executed so undo() short-circuits — there is nothing to revert.
            return {
                success: false,
                affectedElementIds: [this.wallId],
                info: [`Wall baseline update rejected: ${reason}`],
                error: reason,
            };
        }

        // §FIX-WALL-SHRINK-REFIT (W2-1) — the wall is now shorter; pull any
        // opening that fell outside it back inside. `refit.relocations` only
        // ever carries POSITION changes (offset / sillHeight): an opening whose
        // authored width or height no longer fits was refused above, so nothing
        // reaching here can be silently narrowed.
        //
        // Applied AFTER the store update, and through `updateOpening` — the
        // sanctioned opening-mutation API — so the store's own `clampToWall`
        // (WallStore.updateWindow) sees the NEW wall and agrees, `childrenIds`
        // stays in sync with `openings` (§WALL-AUDIT-2026-M8), and the hosted
        // door/window record moves with its opening instead of desyncing.
        this.relocated = [];
        for (const r of refit.relocations) {
            const next: Opening = {
                ...r.opening,
                offset:     r.next.offset,
                sillHeight: r.next.sillHeight,
            };
            try {
                ctx.stores.wallStore.updateOpening(this.wallId, next);
                this.relocated.push(r.opening);   // PRE-clamp record, for undo
                console.log(
                    `[UpdateWallBaselineCommand] §FIX-WALL-SHRINK-REFIT re-clamped ${r.opening.type} ` +
                    `${r.opening.elementId ?? r.opening.id} on wall ${this.wallId}: ` +
                    `offset ${r.opening.offset.toFixed(3)} → ${r.next.offset.toFixed(3)} m`,
                );
            } catch (err) {
                console.warn(
                    `[UpdateWallBaselineCommand] §FIX-WALL-SHRINK-REFIT could not re-clamp opening ` +
                    `${r.opening.id} on wall ${this.wallId}:`, err,
                );
            }
        }

        this.executed = true;
        return { success: true, affectedElementIds: [this.wallId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || !this.prevSnapshot) {
            return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };
        }
        // §M2/M11 FIX: Use restoreSnapshot() so metadata.version is preserved
        // (no audit-trail drift). The snapshot's baseLine is a plain {x,y,z} tuple;
        // WallStore.cloneWallData() reconstructs THREE.Vector3 via new THREE.Vector3().copy(v).
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);

        // §FIX-WALL-SHRINK-REFIT (W2-1) — restoreSnapshot does NOT carry
        // `openings` (see the `relocated` field doc), so any opening this
        // command moved must be put back explicitly. Ordered AFTER the snapshot
        // restore so the wall is already back at its original length when the
        // store re-runs its own clamp — which is then a no-op, because these are
        // exactly the offsets that fitted before the edit.
        for (const opening of this.relocated) {
            try {
                ctx.stores.wallStore.updateOpening(this.wallId, opening);
            } catch (err) {
                console.warn(
                    `[UpdateWallBaselineCommand] §FIX-WALL-SHRINK-REFIT undo could not restore ` +
                    `opening ${opening.id} on wall ${this.wallId}:`, err,
                );
            }
        }
        this.relocated = [];

        this.executed = false;
        return { success: true, affectedElementIds: [this.wallId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload: {
                wallId:      this.wallId,
                newBaseLine: [
                    { x: this.newBaseLine[0].x, y: this.newBaseLine[0].y, z: this.newBaseLine[0].z },
                    { x: this.newBaseLine[1].x, y: this.newBaseLine[1].y, z: this.newBaseLine[1].z },
                ],
            },
        };
    }
}
