// §RACORIENT145 — bulk curtain-wall PANEL type/material change, one kitchen…
// one PANEL, a level, or the whole project, in one undo step.
//
// FOUNDER'S ASK, verbatim: "I need this also to work for … curtain wall panels
// … RAC examples … 'change all west-facing curtain panels to spider point-fix
// glazing' … or 'change all west-facing curtain panels to a MATERIAL — any
// from the materials list'." This is that capability's EXECUTOR: TWO change
// kinds (TYPE, MATERIAL) over FOUR scope kinds, mirroring the shape
// §RACKITCHEN127 and §FEAT-WALL-TYPE-BATCH both already established.
//
// DESIGN (the same three house rules, again, applied to panels):
//
//  1. REUSE, not rival. Per panel this instantiates the existing
//     `ReplacePanelTypeCommand` — the single-panel command that ALREADY
//     snapshots `panelType` / `materialId` / `materialOverride` for undo and
//     already receives a REAL `context.stores.curtainPanelStore` (verified by
//     `CurtainReplacePanelIsDead.test.ts`'s own header: the LEGACY
//     CommandManager path — which is what a plugin bridge handler runs
//     through — populates it correctly; the NEW bus-context path does not,
//     and that is a SEPARATE, pre-existing defect, L-1054, this lane does not
//     need to touch because it never routes through that path). There is no
//     second "retype/re-material one panel" implementation here.
//
//  2. ONE undo entry. The batch is a single Command on the history stack;
//     undo() replays each child's undo in reverse order.
//
//  3. §CONTEXT-DATA-HONESTY partial-failure policy. Every panel the scope
//     resolves to is changed; a vanished panel is skipped WITH a reason;
//     "Changed N of M panels' <target> to <value> — K skipped: <reason>"
//     (C84 EI-7: `affectedElementIds` names every panel actually touched); a
//     scope matching ZERO panels is a visible NO-OP via `canExecute`
//     (C74 / CA-18 — refuses by name, stating the scope, never silently).
//
// SCOPE — mirrors §RACKITCHEN127's proven shape, `{kind:'element'|'level'|
// 'project'}`, PLUS a fourth `'ids'` arm carrying an EXPLICIT pre-resolved id
// list. That fourth arm is where COMPASS scoping lands: a curtain wall's
// facing is computed by the θ-threaded `FacadeOrientationService`
// (`@pryzm/spatial-index`, extended by this lane to classify curtain walls —
// see FacadeOrientationService.ts), which is editor-side/live-store-singleton
// machinery this command deliberately does NOT reach into — exactly the
// discipline `SetWallSideFinishBatchCommand` already established: the
// ORIENTATION SELECTION happens upstream, and the command receives the ids it
// selected. A panel's host-cannot-be-resolved case (an orphaned panel whose
// curtain wall no longer exists) is refused/skipped BY NAME at THAT upstream
// hop (`resolveOrientationScopeByHost`, @pryzm/ai-host) — never silently
// classified — mirroring §CHAT-ORIENTATION-HOSTED-OPENINGS (L-10946) exactly:
// a panel has no facade of its own, it inherits its curtain wall's.
//
// LEVEL scope reuses that SAME host-derivation machinery
// (`resolveLevelScopeByHost`, @pryzm/ai-host — already a dependency of this
// package) rather than forking a second "which level is this panel on" rule:
// a panel carries no `levelId` of its own (`CurtainPanelData` has none), so
// its level is its curtain wall's, and a panel whose curtain wall has VANISHED
// is skipped by name, not silently excluded as "not on this level" (the same
// distinction `HostedOpeningScope.ts`'s header draws for windows and doors).
//
// TYPE resolution: `panelType` is validated against `VALID_PANEL_TYPES` (the
// live union `ReplacePanelTypeCommand`/`isValidPanelType` already validate
// against) — an unknown type refuses NAMING every real one, never guesses.
//
// MATERIAL resolution: `materialRef` reuses `resolveKitchenMaterialRef`
// (§RACKITCHEN127) VERBATIM — the SAME 4-tier forgiving ladder
// (id → name → case-insensitive → unambiguous word subset) over the SAME
// `STANDARD_MATERIAL_LIBRARY` C100 master catalogue. The name is historical
// (it shipped for kitchen surfaces first); the resolver and the catalogue it
// reads are both already generic, so importing it here is REUSE, not a fork —
// a second "resolve a STANDARD_MATERIAL_LIBRARY ref" ladder is exactly the
// two-sources-of-truth defect this package's other reuses (resolveCatalogueRef
// itself) exist to prevent.
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
import { ReplacePanelTypeCommand } from './ReplacePanelTypeCommand';
import { isValidPanelType, VALID_PANEL_TYPES, type PanelType } from '@pryzm/geometry-curtain-wall';
// ⛔ LEAF IMPORT, NOT THE BARREL (§L-12366). Importing '@pryzm/ai-host' here
// closes a real cross-package cycle: ai-host/DimensionFamilies.ts → @pryzm/geometry-stair
// → StairTool.ts → @pryzm/command-registry → this file → back into ai-host's barrel,
// landing on DIMENSION_FAMILIES/PROBE_ELEMENT_KINDS mid-initialisation and throwing
// 'Cannot access PROBE_ELEMENT_KINDS before initialization'. That poisoned every
// ai-host vitest run and both chat gates for two lanes. The subpath export
// './intents/hosted-opening-scope' exists precisely so this module can be reached
// without evaluating the barrel — see the repo rule: NO BARREL ACCESS AT MODULE LOAD.
import { resolveLevelScopeByHost, type LevelBearingRow } from '@pryzm/ai-host/intents/hosted-opening-scope';
// §RACORIENT145 — REUSED verbatim, not forked. See the header note above.
import { resolveKitchenMaterialRef } from '../furniture/BulkUpdateKitchenMaterialCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

export type CurtainPanelBatchScope =
    | { readonly kind: 'element'; readonly elementId: string }
    | { readonly kind: 'level'; readonly levelId: string }
    | { readonly kind: 'project' }
    /** Pre-resolved explicit id list — where an ORIENTATION-scoped ask lands
     *  after the upstream compass hop (see the module header). */
    | { readonly kind: 'ids'; readonly panelIds: readonly string[] };

export type CurtainPanelBatchChange =
    | { readonly kind: 'type'; readonly panelType: string }
    | { readonly kind: 'material'; readonly materialRef: string };

export interface BulkUpdateCurtainPanelsInput {
    readonly scope: CurtainPanelBatchScope;
    readonly change: CurtainPanelBatchChange;
}

/** One skipped panel, with the human-readable refusal it produced. */
export interface CurtainPanelBatchSkip {
    readonly panelId: string;
    readonly reason: string;
}

export class BulkUpdateCurtainPanelsCommand implements Command {
    readonly affectedStores = ['curtainPanel'] as const;
    id = crypto.randomUUID();
    type = CommandType.BULK_UPDATE_CURTAIN_PANELS;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: ReplacePanelTypeCommand[] = [];
    /** Refusals from the last execute() — exposed for callers that want detail. */
    private _skipped: CurtainPanelBatchSkip[] = [];
    /** Grouped scope-resolution notes (host-unresolvable panels), separate from
     *  per-panel execution skips because they name a COUNT of panels the scope
     *  stage itself excluded, not a `ReplacePanelTypeCommand.canExecute` verdict. */
    private _scopeNotes: string[] = [];

    constructor(private input: BulkUpdateCurtainPanelsInput) {
        this.targetIds = input.scope.kind === 'element' ? [input.scope.elementId] : [];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly CurtainPanelBatchSkip[] { return this._skipped; }

    // ── Internals ────────────────────────────────────────────────────────────

    private _resolveChange(): { panelType?: PanelType; materialId?: string } | { error: string } {
        const change = this.input.change;
        if (change.kind === 'type') {
            if (!isValidPanelType(change.panelType)) {
                return {
                    error:
                        `'${change.panelType}' is not a known curtain-panel type. ` +
                        `Valid values: ${VALID_PANEL_TYPES.join(', ')}`,
                };
            }
            return { panelType: change.panelType };
        }
        const hit = resolveKitchenMaterialRef(change.materialRef);
        if (hit === null) {
            return {
                error:
                    `I don't know a material called "${change.materialRef}". The materials I can ` +
                    `resolve are the project's C100 material library (e.g. by id or name — "marble", ` +
                    `"oak", "composite decking").`,
            };
        }
        return { materialId: hit.id };
    }

    /** Resolve the panel ids the scope reaches, plus any scope-level notes
     *  (grouped host-unresolvable exclusions). Never throws. */
    private _resolvePanelIds(ctx: CommandContext): { ids: string[]; notes: string[]; error?: string } {
        const store = ctx.stores.curtainPanelStore;
        if (!store) {
            return { ids: [], notes: [], error: 'The curtain-panel store is not available in this session.' };
        }
        const all = store.getAll();
        const scope = this.input.scope;

        if (scope.kind === 'element') {
            return { ids: all.some((p) => p.id === scope.elementId) ? [scope.elementId] : [], notes: [] };
        }
        if (scope.kind === 'ids') {
            const known = new Set(all.map((p) => p.id));
            return { ids: [...new Set(scope.panelIds)].filter((id) => known.has(id)), notes: [] };
        }
        if (scope.kind === 'project') {
            return { ids: all.map((p) => p.id), notes: [] };
        }

        // scope.kind === 'level' — a panel has no levelId of its own
        // (CurtainPanelData carries none); its level is its HOST curtain
        // wall's, exactly like a window/door's level is its host wall's
        // (§FIX-HOSTED-LEVEL-SCOPE, L-1201). Reused, not re-derived.
        const cwStore = ctx.stores.curtainWallStore as { getById?: (id: string) => { levelId?: string } | undefined } | undefined;
        const rows: readonly LevelBearingRow[] = all.map((p) => ({ id: p.id, wallId: p.curtainWallId }));
        const res = resolveLevelScopeByHost(
            'curtain panel',
            rows,
            scope.levelId,
            `level "${scope.levelId}"`,
            (wallId) => {
                if (cwStore?.getById === undefined) return null;
                const cw = cwStore.getById(wallId);
                return cw === undefined ? undefined : (cw.levelId ?? undefined);
            },
        );
        if (res.kind === 'refused') return { ids: [], notes: [], error: res.error };
        return {
            ids: [...res.ids],
            notes: res.skipped.map((s) => `${s.count}× ${s.kind} excluded from the level scope: ${s.reason}`),
        };
    }

    private _child(panelId: string, value: { panelType?: PanelType; materialId?: string }, currentType: PanelType): ReplacePanelTypeCommand {
        return new ReplacePanelTypeCommand({
            panelId,
            // ReplacePanelTypeCommand always requires a type; a MATERIAL-only
            // change re-states the panel's CURRENT type so the write is a
            // genuine no-op on that field (mirrors BulkUpdateKitchenMaterialCommand
            // spreading the live kitchenConfig rather than a bare patch).
            newPanelType: value.panelType ?? currentType,
            ...(value.materialId !== undefined ? { materialId: value.materialId } : {}),
        });
    }

    private _changeLabel(change: CurtainPanelBatchChange, resolved: { panelType?: PanelType; materialId?: string }): string {
        return change.kind === 'type'
            ? `type "${resolved.panelType}"`
            : `material "${change.materialRef}" (${resolved.materialId})`;
    }

    // ── Command surface ──────────────────────────────────────────────────────

    canExecute(ctx: CommandContext): CommandValidationResult {
        const resolved = this._resolveChange();
        if ('error' in resolved) return { ok: false, reason: resolved.error };

        const { ids, error } = this._resolvePanelIds(ctx);
        if (error !== undefined) return { ok: false, reason: error };
        if (ids.length === 0) {
            const scope = this.input.scope;
            return {
                ok: false,
                reason:
                    scope.kind === 'project'
                        ? 'There are no curtain-wall panels in this project to change.'
                        : scope.kind === 'element'
                            ? `Panel "${scope.elementId}" was not found.`
                            : scope.kind === 'level'
                                ? `There are no curtain-wall panels on that level.`
                                : 'No curtain-wall panels matched — nothing was changed.',
            };
        }

        const store = ctx.stores.curtainPanelStore!;
        const refusals: string[] = [];
        let acceptable = 0;
        for (const panelId of ids) {
            const panel = store.get(panelId);
            if (!panel) { refusals.push(`panel ${panelId}: no longer in the model`); continue; }
            const v = this._child(panelId, resolved, panel.panelType).canExecute(ctx);
            if (v.ok) acceptable++;
            else refusals.push(childRefusalText(v.reason, 'ReplacePanelTypeCommand.canExecute', `panel ${panelId}`));
        }

        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} panel${ids.length === 1 ? '' : 's'} can take the ` +
                    `${this._changeLabel(this.input.change, resolved)} — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.curtainWall.bulkUpdatePanels', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];
                this._scopeNotes = [];

                const resolved = this._resolveChange();
                if ('error' in resolved) {
                    span.setAttribute('pryzm.curtainWall.panelBatch.unresolvedChange', true);
                    return { success: false, affectedElementIds: [], info: [resolved.error] };
                }

                const { ids, notes, error } = this._resolvePanelIds(ctx);
                this._scopeNotes = notes;
                if (error !== undefined) {
                    return { success: false, affectedElementIds: [], info: [error] };
                }
                this.targetIds = [...ids];

                const store = ctx.stores.curtainPanelStore;
                const affected: string[] = [];
                for (const panelId of ids) {
                    const panel = store?.get(panelId);
                    if (!panel) {
                        this._skipped.push({ panelId, reason: 'the panel is no longer in the model' });
                        continue;
                    }
                    const child = this._child(panelId, resolved, panel.panelType);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ panelId, reason: childRefusalText(v.reason, 'ReplacePanelTypeCommand.canExecute', `panel ${panelId}`) });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(panelId);
                    } else {
                        this._skipped.push({ panelId, reason: childRefusalText(r.info?.[0], 'ReplacePanelTypeCommand.execute', `panel ${panelId}`) });
                    }
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                const reasonLines = [...reasonCounts.entries()].map(([reason, count]) => `${count}× ${reason}`);

                const summary =
                    `Changed ${changed} of ${total} curtain-wall panel${total === 1 ? '' : 's'} to ` +
                    `${this._changeLabel(this.input.change, resolved)}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.curtainWall.panelBatch.total', total);
                span.setAttribute('pryzm.curtainWall.panelBatch.changed', changed);
                span.setAttribute('pryzm.curtainWall.panelBatch.skipped', skippedCount);
                span.setAttribute('pryzm.curtainWall.panelBatch.changeKind', this.input.change.kind);
                span.setAttribute('pryzm.curtainWall.panelBatch.scope', this.input.scope.kind);

                return {
                    success: changed > 0,
                    affectedElementIds: affected,
                    info: [summary, ...reasonLines, ...this._scopeNotes],
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
        // §RACORIENT145 — `ReplacePanelTypeCommand.{execute,undo}` both report
        // `[panelId, panel.curtainWallId]` (the curtain wall is included so its
        // OWN subscribers know to re-render). Spreading that raw pair here
        // would report the shared curtain-wall id ONCE PER PANEL — inconsistent
        // with `execute()` above, which names only the panel ids it touched.
        // `targetIds[0]` is the child's own panel id (set in its constructor),
        // so this stays byte-consistent with the forward direction.
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

    static deserialize(serialized: SerializedCommand): BulkUpdateCurtainPanelsCommand {
        return new BulkUpdateCurtainPanelsCommand(serialized.payload as BulkUpdateCurtainPanelsInput);
    }
}
