import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot } from './wallSnapshotUtils';
// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) — the SINGLE rake gate, shared with
// WallDataSchema / WallStore.update / WallStore.addOpening / WallOccupancyStore.
import { rakeAuthorability } from '@pryzm/geometry-wall';

export interface UpdateWallSystemTypeInput {
    wallId: string;
    systemTypeId: string | null;
    layers: any[] | null;
    thickness?: number;
}

/**
 * Assigns a wall system type (or clears it) to a single wall.
 *
 * Contract §01 §2.1 — Must go through CommandManager, never wallStore.update() directly.
 * Contract §01 §2.7 — No direct builder calls; rebuild triggered via
 *   wallStore.updateWall() → emit('update') → subscriber → wallFragmentBuilder.updateWall().
 */
export class UpdateWallSystemTypeCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_SYSTEM_TYPE;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: any = null;

    constructor(private input: UpdateWallSystemTypeInput) {
        this.targetIds = [input.wallId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };

        // ── §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) ───────────────────────
        //
        // `WallStore.update` REFUSES a non-vertical rake on a LAYERED wall, and
        // refuses it by THROWING. Reported from production 2026-08-09: switching a
        // raked wall to a layered type produced
        //   `[CommandManager] FATAL ERROR DURING EXECUTION WallSchemaError:
        //    [WallStore.update] §WALL-RAKE rejected … not supported on a LAYERED wall`
        // and the user read it as "layered walls are broken".
        //
        // The refusal was correct (ADR-0310: layer thicknesses are authored
        // PERPENDICULAR to the face, and the raked footprint that honours that —
        // t/sin θ per layer — was not implemented). Delivering it as a crash was not.
        //
        // ── §FEAT-RAKE-LAYERED (founder 2026-08-18) — THE REFUSAL NARROWED ────
        // `t / sin θ` IS implemented now, so a raked wall taking a layered type is
        // ordinarily FINE and this gate lets it through. What is still refused is a
        // raked LAYERED wall that HOSTS AN OPENING, because that body is built by
        // `buildLayeredWallSegmentsAroundOpenings` (per-layer boxes around the void)
        // which has no shear. Nothing here decides that — `rakeAuthorability` does,
        // and it is still the single gate.
        //
        // `canExecute` is the declared pre-flight gate for exactly this and already
        // carries a human-readable `reason`, so the refusal arrives as an ordinary
        // validation failure the UI can show. The store's throw stays as defence in
        // depth for any path that skips validation.
        //
        // Asked against the MERGED next state, not the input: the rake lives on the
        // existing record while the layers arrive in the patch, so neither half
        // alone can see the combination — the same reasoning WallStore.update
        // documents for checking `nextState`.
        //
        // `openings` comes from the RECORD and is now passed — but ONLY when the
        // incoming stack is layered, and that conditional is load-bearing:
        //   · it must be passed for a LAYERED stack, or the moment the
        //     `hosted-openings` arm lifts (Lane Z1) a raked layered opening-hosting
        //     wall would sail through here and render VERTICAL. A gate that holds only
        //     because a NEIGHBOURING gate happens to hold is not a gate.
        //   · it must NOT be passed for a SINGLE-layer stack, or the `hosted-openings`
        //     arm fires on a question nobody asked. That arm guards a RAKE WRITE; this
        //     command writes a TYPE. Refusing "give this raked wall a monolithic type"
        //     because the wall has a window is an over-refusal on an unrelated axis.
        // So the openings dimension is admitted exactly where the LAYERED arm needs it.
        const nextLayers = this.input.layers ?? undefined;
        const rake = rakeAuthorability({
            rakeAngleDeg: (wall as { rakeAngleDeg?: number }).rakeAngleDeg,
            layers:       nextLayers,
            curve:        (wall as { curve?: unknown }).curve,
            openings:     (nextLayers?.length ?? 0) > 1
                ? (wall as { openings?: unknown[] }).openings
                : undefined,
        } as Parameters<typeof rakeAuthorability>[0]);
        if (!rake.ok) {
            return {
                ok: false,
                reason:
                    `This wall is angled (raked), so it cannot take this wall type — ` +
                    `set its Vertical Angle back to 90° first, remove its openings, or pick a ` +
                    `single-layer type. ${rake.reason ?? ''}`,
            };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        this.prevSnapshot = serializeWallSnapshot(wall);

        const nextState: any = {
            ...serializeWallSnapshot(wall),
            systemTypeId: this.input.systemTypeId ?? null,
            layers: this.input.layers ?? null
        };
        if (this.input.thickness !== undefined) {
            nextState.thickness = this.input.thickness;
        }

        ctx.stores.wallStore.updateWall(nextState);
        return { success: true, affectedElementIds: [this.input.wallId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        // restoreSnapshot() preserves metadata.version (no audit-trail drift).
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
        return { success: true, affectedElementIds: [this.input.wallId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.input
        };
    }
}
