/**
 * §CWWELD169 (L-12800..) — BATCHED, UNDOABLE wrapper for the CW↔CW move
 * re-weld cascade `CurtainWallMoveReweldService` (@pryzm/geometry-curtain-wall)
 * dispatches when a curtain-wall move opens a partner's junction.
 *
 * Mirrors `CascadeWallBaselineCommand.ts` (this package, `walls/`) at the
 * ARCHITECTURAL level — one Command on the undo stack for N re-seated
 * elements, C16 §8.6 — but composes `UpdateCurtainWallCommand` PER ENTRY
 * rather than writing `curtainWallStore` directly, the same way
 * `BulkUpdateCurtainWallParameterCommand.ts` (this directory, §CWPROPS152)
 * composes it for a parameter batch. Two reasons this command reuses that
 * child instead of re-implementing a snapshot/restore pair:
 *
 *   1. `UpdateCurtainWallCommand` IS the proven write path the property panel
 *      and §CWPROPS152's bulk command already use — the SAME path re-derives
 *      `gridSystem` when a spacing value changes (irrelevant to a baseline
 *      move, but the point is there is only ONE place that logic lives) and
 *      fires the SAME `bim-curtainwall-updated` announcement the Project
 *      Browser / Schedule panel / frustum culling already listen for
 *      (§CWLEVEL149). A re-weld that wrote the store directly would rebuild
 *      geometry correctly and leave every one of those listeners stale.
 *   2. Undo composes for free: each child's own `undo()` restores its FULL
 *      pre-mutation snapshot via `store.set()` (§01 §2.2), so replaying the
 *      children in reverse cannot leave a half-restored wall behind — the
 *      same argument `BulkUpdateCurtainWallParameterCommand`'s header makes.
 *
 * §CWWELD169 SCOPE — this command only ever receives curtain-wall entries
 * (see `CurtainWallMoveReweld.ts`'s module doc for which joint kinds the
 * engine that produces them closes). It has no opinion on walls.
 *
 * C84 EI-7 — `affectedElementIds` is the MEASURED write set: exactly the
 * curtain walls whose child actually executed, never the requested set.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { Point3D } from '@pryzm/core-app-model';
import { childRefusalText } from '../refusal/childRefusalText';
import { UpdateCurtainWallCommand } from './UpdateCurtainWallCommand';

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

export interface CascadeCurtainWallBaselineEntry {
    curtainWallId: string;
    newBaseLine: [Point3D, Point3D];
}

export interface CascadeCurtainWallBaselineInput {
    /** Each entry mutates one curtain wall; applied atomically in execute(). */
    entries: CascadeCurtainWallBaselineEntry[];
    /** Free-form tag ("move-reweld") for diagnostics/inspector display. */
    cause?: string;
}

/**
 * §CWWELD169 — cross-service structural-cascade latch, mirroring
 * `isCascadeWallBaselineApplying` exactly. `CurtainWallMoveReweldService`
 * consults this before treating a store 'update' as a fresh user move, so its
 * OWN cascade writes do not re-enter and re-cascade themselves.
 */
let _cascadeApplyDepth = 0;

export function isCascadeCurtainWallBaselineApplying(): boolean {
    return _cascadeApplyDepth > 0;
}

export class CascadeCurtainWallBaselineCommand implements Command {
    // C84 EI-7 — the child (`UpdateCurtainWallCommand`) writes ONLY
    // `curtainWallStore` for a `baseLine`-only update (no `levelId` is ever
    // passed, so the bimManager spatial-registration branch never runs).
    readonly affectedStores = ['curtainWall'] as const;
    readonly id: string;
    readonly type = CommandType.CASCADE_CURTAIN_WALL_BASELINE;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly entries: CascadeCurtainWallBaselineEntry[];
    private readonly cause: string;

    /** Children that actually EXECUTED — undo replays these in reverse,
     *  mirroring `BulkUpdateCurtainWallParameterCommand.executedChildren`. */
    private executedChildren: UpdateCurtainWallCommand[] = [];

    constructor(input: CascadeCurtainWallBaselineInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.entries = input.entries.map(e => ({
            curtainWallId: e.curtainWallId,
            newBaseLine: [{ ...e.newBaseLine[0] }, { ...e.newBaseLine[1] }],
        }));
        this.cause = input.cause ?? 'cascade';
        this.targetIds = this.entries.map(e => e.curtainWallId);
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const store = ctx.stores.curtainWallStore;
        if (!store) return { ok: false, reason: 'CurtainWallStore not available' };

        const missing: string[] = [];
        const refusals: string[] = [];
        let acceptable = 0;
        for (const e of this.entries) {
            const cw = store.get(e.curtainWallId);
            if (!cw) { missing.push(e.curtainWallId); continue; }
            const child = new UpdateCurtainWallCommand({
                id: e.curtainWallId, updates: { baseLine: e.newBaseLine },
            });
            const v = child.canExecute(ctx);
            if (v.ok) acceptable++;
            else refusals.push(childRefusalText(v.reason, 'UpdateCurtainWallCommand.canExecute', `curtain wall ${e.curtainWallId}`));
        }
        if (missing.length > 0) {
            return {
                ok: false,
                reason: 'CURTAIN_WALL_NOT_FOUND',
                blockingIssues: missing.map(id => `CURTAIN_WALL_NOT_FOUND: ${id}`),
            };
        }
        if (acceptable === 0 && this.entries.length > 0) {
            return {
                ok: false,
                reason: `None of the ${this.entries.length} re-weld entries can be applied` +
                    (refusals.length > 0 ? ` — ${refusals[0]}` : ''),
                blockingIssues: refusals,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.curtainWall.cascadeBaseline', (span) => {
            try {
                span.setAttribute('pryzm.cascade.cause', this.cause);
                span.setAttribute('pryzm.cascade.entries', this.entries.length);
                const r = this._execute(ctx);
                span.setAttribute('pryzm.cascade.success', r.success);
                span.setAttribute('pryzm.cascade.affected', r.affectedElementIds.length);
                return r;
            } finally {
                span.end();
            }
        });
    }

    private _execute(ctx: CommandContext): CommandResult {
        this.executedChildren = [];
        const store = ctx.stores.curtainWallStore;
        if (!store) return { success: false, affectedElementIds: [], info: ['CurtainWallStore not available'] };

        const affected: string[] = [];
        const skipped: string[] = [];
        _cascadeApplyDepth++;
        try {
            for (const e of this.entries) {
                const cw = store.get(e.curtainWallId);
                if (!cw) {
                    skipped.push(`${e.curtainWallId}: curtain wall no longer in the model`);
                    continue;
                }
                const child = new UpdateCurtainWallCommand({
                    id: e.curtainWallId, updates: { baseLine: e.newBaseLine },
                });
                const v = child.canExecute(ctx);
                if (!v.ok) {
                    skipped.push(childRefusalText(v.reason, 'UpdateCurtainWallCommand.canExecute', `curtain wall ${e.curtainWallId}`));
                    continue;
                }
                const r = child.execute(ctx);
                if (r.success) {
                    this.executedChildren.push(child);
                    affected.push(e.curtainWallId);
                } else {
                    skipped.push(childRefusalText(r.info?.[0], 'UpdateCurtainWallCommand.execute', `curtain wall ${e.curtainWallId}`));
                }
            }
        } finally {
            _cascadeApplyDepth--;
        }

        return {
            success: affected.length > 0,
            affectedElementIds: affected,
            ...(skipped.length > 0 ? { info: skipped } : {}),
        };
    }

    undo(ctx: CommandContext): CommandResult {
        const restored: string[] = [];
        _cascadeApplyDepth++;
        try {
            for (let i = this.executedChildren.length - 1; i >= 0; i--) {
                const child = this.executedChildren[i];
                if (!child) continue;
                const r = child.undo(ctx);
                if (r.success) restored.push(child.targetIds[0]!);
            }
        } finally {
            _cascadeApplyDepth--;
        }
        this.executedChildren = [];
        return { success: true, affectedElementIds: restored };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version: 1,
            payload: { cause: this.cause, entries: this.entries },
        };
    }

    static deserialize(serialized: SerializedCommand): CascadeCurtainWallBaselineCommand {
        return new CascadeCurtainWallBaselineCommand(serialized.payload as CascadeCurtainWallBaselineInput);
    }
}
