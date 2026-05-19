import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { Point3D } from '@pryzm/core-app-model';
import { serializeWallSnapshot } from './wallSnapshotUtils';

/**
 * One per-wall mutation in a cascade batch.
 *
 * `prevBaseLine` is optional and reserved for callers that want to override the
 * snapshot baseline (e.g. when the store was already mutated outside the
 * command). Today's only caller — SlabWallConnectivityService — invokes this
 * command BEFORE mutating the store, so the prev value is read from the store
 * inside execute().
 */
export interface CascadeWallBaselineEntry {
    wallId: string;
    newBaseLine: [Point3D, Point3D];
    prevBaseLine?: [Point3D, Point3D];
}

export interface CascadeWallBaselineInput {
    /** Each entry mutates one wall; all entries are applied atomically in execute(). */
    entries: CascadeWallBaselineEntry[];
    /** Free-form tag (e.g. "slab-connectivity") for diagnostics / inspector display. */
    cause?: string;
}

/**
 * §WALL-AUDIT-2026-W1: CascadeWallBaselineCommand
 *
 * BATCHED, UNDOABLE wrapper for structural cascades that must trim/extend the
 * baseLine of MULTIPLE walls in a single user-facing operation.
 *
 * Background
 * ----------
 * SlabWallConnectivityService keeps the corners of a "By Pick Walls" slab
 * topologically welded: when the user drags one wall, the service snaps the
 * endpoints of the predecessor / successor walls (and the moved wall itself)
 * to the new corner intersections. Previously the service called
 * `wallStore.update()` directly — a structural mutation outside the command
 * pipeline. The cascade was reversible ONLY because CreateWallCommand happened
 * to capture a neighbour-baseline snapshot for its own undo. If the service
 * were ever invoked from any other path, the cascade became silently
 * irreversible (audit §01 §2.1, §08).
 *
 * This command makes the cascade architecturally undoable: it captures a full
 * WallData snapshot of every affected wall (using the same `serializeWallSnapshot`
 * + `wallStore.restoreSnapshot` machinery as UpdateWallBaselineCommand, so
 * `metadata.version` is preserved on undo per FIX-1 / M2 / M11) and applies all
 * mutations atomically.
 *
 * Contract compliance
 * -------------------
 * §01 §2.1 — All mutations go through `wallStore.update()` inside execute().
 * §01 §2.3 — Full snapshots captured for every entry; undo uses
 *            `restoreSnapshot()` so version numbers do not drift.
 * §08      — Cascade is undoable; no neighbour mutation escapes the pipeline.
 *
 * Note: the service still falls back to the legacy direct-update path when no
 * commandManager has been injected (e.g. very early bootstrap, tests). That
 * code path is unchanged from the pre-W1 behaviour.
 */
export class CascadeWallBaselineCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type = CommandType.CASCADE_WALL_BASELINE;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly entries: CascadeWallBaselineEntry[];
    private readonly cause: string;

    /**
     * One full WallData snapshot per affected wall, indexed by wallId.
     * Captured during execute() so undo can `restoreSnapshot()` and preserve
     * metadata.version (no audit-trail drift — same pattern as
     * UpdateWallBaselineCommand).
     */
    private prevSnapshots: Map<string, any> = new Map();

    private executed = false;

    constructor(input: CascadeWallBaselineInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        // Deep-copy each entry's points so post-construction mutation of the
        // caller's array cannot poison the command's payload.
        this.entries = input.entries.map(e => ({
            wallId: e.wallId,
            newBaseLine: [{ ...e.newBaseLine[0] }, { ...e.newBaseLine[1] }],
            prevBaseLine: e.prevBaseLine
                ? [{ ...e.prevBaseLine[0] }, { ...e.prevBaseLine[1] }]
                : undefined,
        }));
        this.cause = input.cause ?? 'cascade';
        this.targetIds = this.entries.map(e => e.wallId);
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wallStore = ctx.stores.wallStore;
        const missing: string[] = [];
        const tooShort: string[] = [];
        for (const e of this.entries) {
            if (!wallStore.getById(e.wallId)) {
                missing.push(e.wallId);
                continue;
            }
            const dx = e.newBaseLine[1].x - e.newBaseLine[0].x;
            const dy = e.newBaseLine[1].y - e.newBaseLine[0].y;
            const dz = e.newBaseLine[1].z - e.newBaseLine[0].z;
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.1) {
                tooShort.push(e.wallId);
            }
        }
        if (missing.length > 0) {
            return {
                ok: false,
                reason: 'WALL_NOT_FOUND',
                blockingIssues: missing.map(id => `WALL_NOT_FOUND: ${id}`),
            };
        }
        if (tooShort.length > 0) {
            return {
                ok: false,
                reason: 'WALL_TOO_SHORT',
                blockingIssues: tooShort.map(id => `WALL_TOO_SHORT: ${id} minimum 0.1m`),
            };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.executed) {
            return { success: false, affectedElementIds: [], info: ['Command already executed'] };
        }

        const wallStore = ctx.stores.wallStore;

        // Phase 1 — capture snapshots BEFORE any mutation. If any entry's wall
        // disappeared between canExecute() and execute(), abort cleanly without
        // touching the store (no partial cascade).
        for (const e of this.entries) {
            const wall = wallStore.getById(e.wallId);
            if (!wall) {
                return {
                    success: false,
                    affectedElementIds: [],
                    info: [`Wall ${e.wallId} disappeared between canExecute and execute`],
                };
            }
            const snapshot = serializeWallSnapshot(wall);
            // If the caller supplied prevBaseLine (live-drag scenarios where
            // the store is already at the new value), override the snapshot
            // baseLine so undo restores the pre-cascade position.
            if (e.prevBaseLine) {
                snapshot.baseLine = [
                    { x: e.prevBaseLine[0].x, y: e.prevBaseLine[0].y, z: e.prevBaseLine[0].z },
                    { x: e.prevBaseLine[1].x, y: e.prevBaseLine[1].y, z: e.prevBaseLine[1].z },
                ];
            }
            this.prevSnapshots.set(e.wallId, snapshot);
        }

        // Phase 2 — apply all mutations. _renderVersion bumped per entry so the
        // builder dirty-check (§VIEW-DIRTY-CHECK §2.2) sees a real change.
        for (const e of this.entries) {
            const wall = wallStore.getById(e.wallId);
            const baseVersion = (wall?._renderVersion ?? 0) + 1;
            wallStore.update(e.wallId, {
                baseLine: e.newBaseLine,
                _renderVersion: baseVersion,
            } as any);
        }

        this.executed = true;
        return { success: true, affectedElementIds: [...this.targetIds] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || this.prevSnapshots.size === 0) {
            return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };
        }
        const wallStore = ctx.stores.wallStore;
        // Restore in REVERSE order so any in-store hooks that observe
        // dependent walls see the same final state as before execute().
        const restored: string[] = [];
        for (const e of [...this.entries].reverse()) {
            const snap = this.prevSnapshots.get(e.wallId);
            if (snap) {
                wallStore.restoreSnapshot(snap);
                restored.push(e.wallId);
            }
        }
        this.executed = false;
        return { success: true, affectedElementIds: restored };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload: {
                cause: this.cause,
                entries: this.entries.map(e => ({
                    wallId: e.wallId,
                    newBaseLine: [
                        { x: e.newBaseLine[0].x, y: e.newBaseLine[0].y, z: e.newBaseLine[0].z },
                        { x: e.newBaseLine[1].x, y: e.newBaseLine[1].y, z: e.newBaseLine[1].z },
                    ],
                })),
            },
        };
    }
}
