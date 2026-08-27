// §CWPROPS152 — bulk curtain-wall PARAMETER change (mullion size, panel
// thickness, post spacing, transom spacing), one wall, a level, the whole
// project, or an explicit pre-resolved id list, in one undo step.
//
// FOUNDER'S ASK, verbatim: *"important request via RAC - i thought that was in
// place - and it should be for all curtain walls properties; e.g: Make mullion
// size of all curtain walls in ground level to 0.06 meters / I want to
// potentially do the same for all attributes / U-Lines (columns) ... V-Lines
// (rows) ... Post Spacing (m) 1.5 / Transom Spacing (m) 5 / Mullion Size (m)
// 0.03 / Panel Thickness (m) 0.019 ..."*. This is that capability's EXECUTOR.
//
// DESIGN — the SAME shape §RACORIENT145's `BulkUpdateCurtainPanelsCommand`
// (this directory) established for PANEL type/material, applied one level up
// to the WALL's own numeric parameters. This command does not invent a rival
// shape; it mirrors:
//
//  1. REUSE, not rival. Per wall this instantiates the EXISTING
//     `UpdateCurtainWallCommand` — the single-wall command that is already the
//     PROVEN authoritative write path for exactly these four fields. C87
//     §13.6 CW-Mul-1 records that *Post Spacing* / *Transom Spacing* were
//     DELIVERED 2026-08-19 "routed through `wall.updateCurtainWall` →
//     `UpdateCurtainWallCommand` — the one verb that reaches the authoritative
//     geometry record", and that command ALSO re-derives `gridSystem` inside
//     the same `store.update()` when a spacing value changes (§CW-4 / C87
//     §13.6, `UpdateCurtainWallCommand.ts:99-165`) — the grid regen this
//     capability needs is therefore not re-implemented here, it is INHERITED
//     by composition. There is no second "resize the grid" implementation in
//     this file.
//  2. ONE undo entry. The batch is a single Command on the history stack;
//     undo() replays each child's own full-snapshot undo in reverse order —
//     `UpdateCurtainWallCommand.undo()` restores the ENTIRE pre-mutation
//     record via `store.set()` (§01 §2.2), including the pre-edit
//     `gridSystem`, so a batch undo cannot leave a half-regridded wall behind.
//  3. §CONTEXT-DATA-HONESTY partial-failure policy. Every wall the scope
//     resolves to is changed; a vanished wall is skipped WITH a reason;
//     "Changed N of M curtain walls' <parameter> to <value> — K skipped:
//     <reason>" (C84 EI-7: `affectedElementIds` names every wall actually
//     touched — see the note on `affectedStores` below); a scope matching
//     ZERO walls is a visible NO-OP via `canExecute` (C74 / CA-18 — refuses by
//     name, stating the scope, never silently).
//
// PARAMETER VALIDATION — the key is checked against
// `CURTAIN_WALL_PARAMETER_KEYS` (@pryzm/geometry-curtain-wall,
// `CurtainWallParameterConstraints.ts`, §CWPROPS152), a CLOSED, four-member
// set (`mullionSize`, `panelThickness`, `gridXSpacing`, `gridYSpacing`) — an
// unknown key refuses NAMING every real one, never a guess. The VALUE is
// checked against that same module's bounds (restated from
// `PropertyDescriptorGenerator.ts`'s own NUMBER-row min/max, C84 EI-1), which
// is also this capability's answer to a UNIT mistake: a bare number typed in
// the wrong unit ("set mullion size to 30" meaning 30 mm) reads as 30 METRES
// (this module's documented convention — see the constraints file's header)
// and is refused by name against the 0.01–0.5 m bound, never silently applied
// as a 100× geometry error.
//
// SCOPE — mirrors `BulkUpdateCurtainPanelsCommand`'s proven shape,
// `{kind:'element'|'level'|'project'}`, plus a fourth `'ids'` arm carrying an
// EXPLICIT pre-resolved id list (where COMPASS/facade scoping lands — the
// θ-threaded `FacadeOrientationService`, `@pryzm/spatial-index`, is
// editor-side/live-store-singleton machinery this command deliberately does
// NOT reach into; the orientation SELECTION happens upstream and this command
// receives the ids it selected, exactly the discipline
// `BulkUpdateCurtainPanelsCommand`'s own header states).
//
// LEVEL scope is SIMPLER here than the panel command's: a curtain wall carries
// its OWN `levelId` directly (`CurtainWallTypes.ts:20`) — unlike a panel, which
// has none and must hop through its host. So this command filters
// `curtainWallStore.getAll()` by `levelId` directly; it does not need
// `resolveLevelScopeByHost` (@pryzm/ai-host) at all, and carries no dependency
// on that package (kept out deliberately — see the module-level note in this
// lane's report about `@pryzm/ai-host` being mid-edit by a concurrent lane at
// the time of writing).
//
// ⚠ THE LEVEL MUST SURVIVE THIS WRITE (§CWLEVEL149 coordination). This command
// NEVER includes `levelId` in the `updates` object it hands to
// `UpdateCurtainWallCommand` — only the one parameter key being changed. Since
// `CurtainWallStore.update()` is a SHALLOW merge (`{ ...existing, ...updates }`,
// `CurtainWallStore.ts:369-374`) and `UpdateCurtainWallCommand` only triggers
// its spatial re-registration when `updates.levelId` is present and differs
// from the snapshot, an omitted `levelId` leaves the record's storey
// untouched, at both the store layer and the command layer. This is asserted
// by an executed test in this lane (`bulkUpdateCurtainWallParameter.test.ts`),
// not merely assumed — see this lane's report for what was and was not
// verified this way.
//
// `CommandType.BULK_UPDATE_CURTAIN_WALL_PARAMETER` (types.ts) and the
// deserialize dispatch row (`apps/editor/src/engine/CommandRegistry.ts`) were
// both added in this lane once the earlier blocker (those two files were
// dirty, mid-edit by concurrent lanes §RACORIENT145/§RACSIDE144) cleared —
// both lanes committed during this one's session. A project SAVE → RELOAD
// round-trip through the central registry is therefore wired, not merely this
// command's own `static deserialize()` for direct callers.
//
// P8 — execute() carries an OpenTelemetry span.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { trace, type Tracer } from '@opentelemetry/api';
import { childRefusalText } from '../refusal/childRefusalText';
import { UpdateCurtainWallCommand } from './UpdateCurtainWallCommand';
import {
    CURTAIN_WALL_PARAMETER_KEYS,
    isCurtainWallParameterKey,
    checkCurtainWallParameter,
    unknownCurtainWallParameterRefusal,
    type CurtainWallParameterKey,
} from '@pryzm/geometry-curtain-wall';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

export type CurtainWallParameterBatchScope =
    | { readonly kind: 'element'; readonly elementId: string }
    | { readonly kind: 'level'; readonly levelId: string }
    | { readonly kind: 'project' }
    /** Pre-resolved explicit id list — where an ORIENTATION/facade-scoped ask
     *  lands after the upstream compass hop (see the module header). */
    | { readonly kind: 'ids'; readonly curtainWallIds: readonly string[] };

export interface BulkUpdateCurtainWallParameterInput {
    readonly scope: CurtainWallParameterBatchScope;
    readonly parameter: string;
    readonly value: number;
}

/** One skipped wall, with the human-readable refusal it produced. */
export interface CurtainWallParameterBatchSkip {
    readonly curtainWallId: string;
    readonly reason: string;
}

export class BulkUpdateCurtainWallParameterCommand implements Command {
    // C84 EI-7 — the MEASURED write set. `UpdateCurtainWallCommand` writes
    // only `curtainWallStore` for the fields this command ever passes (it
    // never sets `levelId`, so the bimManager spatial-registration branch
    // never runs — see the module header).
    readonly affectedStores = ['curtainWall'] as const;
    id = crypto.randomUUID();
    type = CommandType.BULK_UPDATE_CURTAIN_WALL_PARAMETER;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateCurtainWallCommand[] = [];
    private _skipped: CurtainWallParameterBatchSkip[] = [];

    constructor(private input: BulkUpdateCurtainWallParameterInput) {
        this.targetIds = input.scope.kind === 'element' ? [input.scope.elementId] : [];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly CurtainWallParameterBatchSkip[] { return this._skipped; }

    // ── Internals ────────────────────────────────────────────────────────────

    private _resolveChange(): { key: CurtainWallParameterKey; value: number } | { error: string } {
        const { parameter, value } = this.input;
        if (!isCurtainWallParameterKey(parameter)) {
            return { error: unknownCurtainWallParameterRefusal(parameter) };
        }
        const violation = checkCurtainWallParameter(parameter, value);
        if (violation !== null) return { error: violation.message };
        return { key: parameter, value };
    }

    /** Resolve the curtain-wall ids the scope reaches. Never throws. */
    private _resolveIds(ctx: CommandContext): { ids: string[]; error?: string } {
        const store = ctx.stores.curtainWallStore;
        if (!store) {
            return { ids: [], error: 'The curtain-wall store is not available in this session.' };
        }
        const all = store.getAll();
        const scope = this.input.scope;

        if (scope.kind === 'element') {
            return { ids: all.some((cw) => cw.id === scope.elementId) ? [scope.elementId] : [] };
        }
        if (scope.kind === 'ids') {
            const known = new Set(all.map((cw) => cw.id));
            return { ids: [...new Set(scope.curtainWallIds)].filter((id) => known.has(id)) };
        }
        if (scope.kind === 'project') {
            return { ids: all.map((cw) => cw.id) };
        }
        // scope.kind === 'level' — a curtain wall carries its OWN levelId
        // (unlike a panel), so this is a direct filter, no host hop needed.
        return { ids: all.filter((cw) => cw.levelId === scope.levelId).map((cw) => cw.id) };
    }

    private _child(id: string, key: CurtainWallParameterKey, value: number): UpdateCurtainWallCommand {
        // Only the ONE key being changed is ever in `updates` — deliberately
        // never `levelId` (see the module header's level-survival note).
        return new UpdateCurtainWallCommand({ id, updates: { [key]: value } as any });
    }

    // ── Command surface ──────────────────────────────────────────────────────

    canExecute(ctx: CommandContext): CommandValidationResult {
        const resolved = this._resolveChange();
        if ('error' in resolved) return { ok: false, reason: resolved.error };

        const { ids, error } = this._resolveIds(ctx);
        if (error !== undefined) return { ok: false, reason: error };
        if (ids.length === 0) {
            const scope = this.input.scope;
            return {
                ok: false,
                reason:
                    scope.kind === 'project'
                        ? 'There are no curtain walls in this project to change.'
                        : scope.kind === 'element'
                            ? `Curtain wall "${scope.elementId}" was not found.`
                            : scope.kind === 'level'
                                ? `There are no curtain walls on that level.`
                                : 'No curtain walls matched — nothing was changed.',
            };
        }

        const store = ctx.stores.curtainWallStore;
        const refusals: string[] = [];
        let acceptable = 0;
        for (const id of ids) {
            const cw = store.get(id);
            if (!cw) { refusals.push(`curtain wall ${id}: no longer in the model`); continue; }
            const v = this._child(id, resolved.key, resolved.value).canExecute(ctx);
            if (v.ok) acceptable++;
            else refusals.push(childRefusalText(v.reason, 'UpdateCurtainWallCommand.canExecute', `curtain wall ${id}`));
        }

        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} curtain wall${ids.length === 1 ? '' : 's'} can take the ` +
                    `${resolved.key} change to ${resolved.value} — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.curtainWall.bulkUpdateParameter', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const resolved = this._resolveChange();
                if ('error' in resolved) {
                    span.setAttribute('pryzm.curtainWall.parameterBatch.unresolvedChange', true);
                    return { success: false, affectedElementIds: [], info: [resolved.error] };
                }

                const { ids, error } = this._resolveIds(ctx);
                if (error !== undefined) {
                    return { success: false, affectedElementIds: [], info: [error] };
                }
                this.targetIds = [...ids];

                const store = ctx.stores.curtainWallStore;
                const affected: string[] = [];
                const childInfo: string[] = [];
                for (const id of ids) {
                    const cw = store?.get(id);
                    if (!cw) {
                        this._skipped.push({ curtainWallId: id, reason: 'the curtain wall is no longer in the model' });
                        continue;
                    }
                    const child = this._child(id, resolved.key, resolved.value);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ curtainWallId: id, reason: childRefusalText(v.reason, 'UpdateCurtainWallCommand.canExecute', `curtain wall ${id}`) });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(id);
                        // §CW-4 / C84 EI-6 — a per-wall regrid loss notice
                        // (discarded hand-inserted grid lines) is forwarded
                        // VERBATIM, never dropped, deduplicated so N walls
                        // hitting the SAME notice do not repeat it N times.
                        for (const line of r.info ?? []) {
                            if (!childInfo.includes(line)) childInfo.push(line);
                        }
                    } else {
                        this._skipped.push({ curtainWallId: id, reason: childRefusalText(r.info?.[0], 'UpdateCurtainWallCommand.execute', `curtain wall ${id}`) });
                    }
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                const reasonLines = [...reasonCounts.entries()].map(([reason, count]) => `${count}× ${reason}`);

                const summary =
                    `Changed ${changed} of ${total} curtain wall${total === 1 ? '' : 's'}' ` +
                    `${resolved.key} to ${resolved.value}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.curtainWall.parameterBatch.total', total);
                span.setAttribute('pryzm.curtainWall.parameterBatch.changed', changed);
                span.setAttribute('pryzm.curtainWall.parameterBatch.skipped', skippedCount);
                span.setAttribute('pryzm.curtainWall.parameterBatch.parameter', resolved.key);
                span.setAttribute('pryzm.curtainWall.parameterBatch.scope', this.input.scope.kind);

                return {
                    success: changed > 0,
                    affectedElementIds: affected,
                    info: [summary, ...reasonLines, ...childInfo],
                };
            } catch (err) {
                span.recordException(err as Error);
                throw err;
            } finally {
                span.end();
            }
        });
    }

    undo(ctx: CommandContext): CommandResult {
        const affected: string[] = [];
        for (let i = this.executedChildren.length - 1; i >= 0; i--) {
            const child = this.executedChildren[i];
            if (!child) continue; // noUncheckedIndexedAccess — index is in range by construction
            const r = child.undo(ctx);
            if (r.success) affected.push(child.targetIds[0]!);
        }
        return { success: true, affectedElementIds: affected };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.input,
        };
    }

    static deserialize(serialized: SerializedCommand): BulkUpdateCurtainWallParameterCommand {
        return new BulkUpdateCurtainWallParameterCommand(serialized.payload as BulkUpdateCurtainWallParameterInput);
    }
}

/** Re-exported for callers that want the vocabulary without a second import
 *  path (e.g. the plugin-side handler's payload validator). */
export { CURTAIN_WALL_PARAMETER_KEYS };
