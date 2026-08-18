// §FEAT-WINDOW-PARAMETRIC-CREATE (ADR-0315, founder ask #3) — create windows
// ACROSS a wall SET parametrically, in ONE undo step:
//   "create a window in the middle of every wall segment"
//   "create 2 windows in all the wall segments"
//   "create a 1x2m window every 3 meters in the walls on the ground floor"
//
// DESIGN (the batch-family house rules):
//   1. REUSE, not rival — per window this instantiates the proven
//      `CreateWallOpeningCommand` (ADD_OPENING): the SAME child the plan tools
//      and generative executors ride, carrying the §OCCUPANCY canPlace gate
//      (§03-4.8), hosted door/window store mirroring, the semantic graph and
//      mark generation. This file only computes WHERE.
//   2. ONE undo entry — undo() replays each created opening's undo in reverse.
//   3. §CONTEXT-DATA-HONESTY — per-window refusals are recorded and grouped:
//      occupancy conflicts, too-short walls, a host whose rake is unbuildable
//      (§RAKE-HOSTED-OPENING: a raked host is FINE now — only curved/layered/
//      out-of-range rakes drop), curved
//      handling via the centreline length. "Created N of M planned windows —
//      K skipped: <reason>". All-skipped = visible no-op via canExecute.
//
// PLACEMENT MATH (offset = the opening's START along the centreline, per
// WallOccupancyStore "frame span [offset, offset+width]"):
//   • mode 'count' N: centres at L·(i+1)/(N+1), i=0..N-1 — N=1 is the exact
//     middle ("in the middle of the wall segment").
//   • mode 'spacing' S: centres at k·S, k=1.. while the span stays inside the
//     margins — the §WINDOW-CORNER-OVERFLOW rule: windows are CAPPED to the
//     segment (a window that would poke past the end is skipped, never bent
//     around the corner).
//   • EDGE_MARGIN_M keeps every span clear of junction mitres.
//   • Self-collisions are real collisions: children execute sequentially, so
//     each canPlace sees the openings this very batch just added.
//
// P8: execute() carries an OpenTelemetry span.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { trace, type Tracer } from '@opentelemetry/api';
import { wallCentrelineLength, rakeAuthorability } from '@pryzm/geometry-wall';
import { CreateWallOpeningCommand } from '../walls/CreateWallOpeningCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** Clearance kept between an opening span and each wall end (junction mitres). */
export const WINDOW_EDGE_MARGIN_M = 0.15;

export type WindowPlacementMode =
    | { readonly kind: 'count'; readonly count: number }
    | { readonly kind: 'spacing'; readonly spacingM: number };

export interface CreateWindowsParametricBatchInput {
    /** `'all'` = every wall in the project (ALL levels), or an explicit id list
     *  (selection / level scopes resolved by the caller). */
    wallIds: string[] | 'all';
    mode: WindowPlacementMode;
    /** Window width in metres (the founder's "1x2m" = width 1, height 2). */
    width: number;
    /** Window height in metres. */
    height: number;
    /** Sill height in metres (default 0.9 — the plan tool's convention). */
    sillHeight?: number;
    /** Optional window system type id, forwarded to the child. */
    systemTypeId?: string;
}

export interface WindowParametricSkip {
    wallId: string;
    reason: string;
}

interface WallRecordLike {
    readonly id: string;
    readonly rakeAngleDeg?: number;
    readonly curve?: unknown;
    readonly layers?: ReadonlyArray<unknown>;
    readonly openings?: ReadonlyArray<unknown>;
}

export class CreateWindowsParametricBatchCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_WINDOWS_PARAMETRIC_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    private executedChildren: CreateWallOpeningCommand[] = [];
    private _skipped: WindowParametricSkip[] = [];
    private _created = 0;
    private _planned = 0;

    constructor(private input: CreateWindowsParametricBatchInput) {
        this.targetIds = input.wallIds === 'all' ? [] : [...input.wallIds];
    }

    get skipped(): readonly WindowParametricSkip[] { return this._skipped; }
    /** Planned/created counts from the most recent execute() — the chat's
     *  preview card asks canExecute + planCount() BEFORE confirming. */
    get createdCount(): number { return this._created; }

    /** How many windows this input PLANS across the resolved walls — used by
     *  the chat's Confirm card ("This will create 24 windows on 12 walls"). */
    planCount(ctx: CommandContext): number {
        let planned = 0;
        for (const w of this._resolveWalls(ctx, /*recordSkips*/ false)) {
            planned += this._offsetsFor(w).offsets.length;
        }
        return planned;
    }

    private _resolveWalls(ctx: CommandContext, recordSkips: boolean): WallRecordLike[] {
        const store = ctx.stores.wallStore as unknown as {
            getAll(): WallRecordLike[];
            getById?(id: string): WallRecordLike | undefined;
        };
        if (this.input.wallIds === 'all') return store.getAll();
        const out: WallRecordLike[] = [];
        for (const id of new Set(this.input.wallIds)) {
            const w = store.getById?.(id);
            if (w !== undefined) out.push(w);
            else if (recordSkips) this._skipped.push({ wallId: id, reason: 'wall not found' });
        }
        return out;
    }

    /** Window START offsets for one wall, honest about why any were dropped. */
    private _offsetsFor(w: WallRecordLike): { offsets: number[]; dropReason: string | null } {
        // §RAKE-HOSTED-OPENING (founder 2026-08-18) — a RAKED host no longer drops.
        // This branch used to read `code === 'hosted-openings'` and return
        // *"wall is raked — hosted openings do not tilt yet (C15)"*. They tilt now:
        // the wall's carve and the window's leaf ride one shear about the wall base
        // (see `WallRake.ts` §RAKE-HOSTED-OPENING). Since this command is a
        // whole-wall window generator, that stale drop was the difference between
        // "batch-glaze this leaning facade" working and silently producing nothing.
        //
        // The gate is still consulted, and still drops — for the reasons that
        // SURVIVED. A curved raked wall (or one raked out of range) cannot be built,
        // so planning windows into it would promise geometry nobody can render.
        const rake = rakeAuthorability({
            rakeAngleDeg: w.rakeAngleDeg,
            curve: w.curve,
            layers: undefined,
            openings: [{}],
        } as Parameters<typeof rakeAuthorability>[0]);
        if (!rake.ok) {
            return { offsets: [], dropReason: `wall cannot hold its angle (rake): ${rake.reason ?? rake.code}` };
        }

        let length: number;
        try {
            length = wallCentrelineLength(w as unknown as Parameters<typeof wallCentrelineLength>[0]);
        } catch {
            return { offsets: [], dropReason: 'wall length could not be measured' };
        }
        if (!Number.isFinite(length) || length <= 0) {
            return { offsets: [], dropReason: 'wall length could not be measured' };
        }

        const width = this.input.width;
        const usable = length - 2 * WINDOW_EDGE_MARGIN_M;
        if (usable < width) {
            return { offsets: [], dropReason: `wall too short (${length.toFixed(2)}m) for a ${width}m window` };
        }

        const centres: number[] = [];
        if (this.input.mode.kind === 'count') {
            const n = this.input.mode.count;
            for (let i = 0; i < n; i++) centres.push((length * (i + 1)) / (n + 1));
        } else {
            const s = this.input.mode.spacingM;
            for (let c = s; c + width / 2 <= length - WINDOW_EDGE_MARGIN_M; c += s) centres.push(c);
        }

        // §WINDOW-CORNER-OVERFLOW — cap to the segment: any span leaving the
        // margins is dropped (count mode can over-ask on a short wall).
        const offsets = centres
            .map((c) => c - width / 2)
            .filter((o) => o >= WINDOW_EDGE_MARGIN_M && o + width <= length - WINDOW_EDGE_MARGIN_M);
        const dropped = centres.length - offsets.length;
        return {
            offsets,
            dropReason: offsets.length === 0
                ? `no window fits — wall ${length.toFixed(2)}m, window ${width}m`
                : dropped > 0
                    ? `${dropped} of ${centres.length} did not fit and were capped to the segment`
                    : null,
        };
    }

    private _child(wallId: string, offset: number): CreateWallOpeningCommand {
        return new CreateWallOpeningCommand({
            wallId,
            openingData: {
                type: 'window',
                offset,
                width: this.input.width,
                height: this.input.height,
                sillHeight: this.input.sillHeight ?? 0.9,
                ...(this.input.systemTypeId !== undefined ? { systemTypeId: this.input.systemTypeId } : {}),
            },
        });
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const { width, height, mode } = this.input;
        if (!Number.isFinite(width) || width <= 0 || width > 10) {
            return { ok: false, reason: `Window width must be a positive number of metres (got ${width}).` };
        }
        if (!Number.isFinite(height) || height <= 0 || height > 10) {
            return { ok: false, reason: `Window height must be a positive number of metres (got ${height}).` };
        }
        const sill = this.input.sillHeight ?? 0.9;
        if (!Number.isFinite(sill) || sill < 0) {
            return { ok: false, reason: `Sill height must be ≥ 0 (got ${sill}).` };
        }
        if (mode.kind === 'count' && (!Number.isInteger(mode.count) || mode.count < 1 || mode.count > 50)) {
            return { ok: false, reason: `The per-wall window count must be a whole number between 1 and 50.` };
        }
        if (mode.kind === 'spacing' && (!Number.isFinite(mode.spacingM) || mode.spacingM < this.input.width)) {
            return {
                ok: false,
                reason:
                    `The spacing (${mode.kind === 'spacing' ? mode.spacingM : ''}m) must be at least the window ` +
                    `width (${width}m), or the windows would overlap.`,
            };
        }

        this._skipped = [];
        const walls = this._resolveWalls(ctx, true);
        if (walls.length === 0) {
            return {
                ok: false,
                reason: this.input.wallIds === 'all'
                    ? 'There are no walls in this project to put windows in.'
                    : 'None of the requested walls exist any more.',
            };
        }
        let planned = 0;
        const reasons: string[] = this._skipped.map((s) => `Wall ${s.wallId}: ${s.reason}`);
        for (const w of walls) {
            const { offsets, dropReason } = this._offsetsFor(w);
            planned += offsets.length;
            if (dropReason !== null) reasons.push(dropReason);
        }
        if (planned === 0) {
            return {
                ok: false,
                reason:
                    `No window fits on any of the ${walls.length} wall${walls.length === 1 ? '' : 's'} — ` +
                    `${reasons[0] ?? 'nothing to place'}.`,
            };
        }
        return { ok: true, warnings: reasons.length > 0 ? reasons : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.window.parametricCreate.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];
                this._created = 0;
                this._planned = 0;

                const walls = this._resolveWalls(ctx, true);
                this.targetIds = walls.map((w) => w.id);
                const affected: string[] = [];

                for (const w of walls) {
                    const { offsets, dropReason } = this._offsetsFor(w);
                    if (offsets.length === 0) {
                        if (dropReason !== null) this._skipped.push({ wallId: w.id, reason: dropReason });
                        continue;
                    }
                    if (dropReason !== null) this._skipped.push({ wallId: w.id, reason: dropReason });
                    for (const offset of offsets) {
                        this._planned++;
                        const child = this._child(w.id, offset);
                        const v = child.canExecute(ctx);
                        if (!v.ok) {
                            // Occupancy conflicts (existing doors/windows) land here.
                            // §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8) — the child's
                            // canPlace refusals now arrive with their [OCC_*] identity inside
                            // `v.reason` (canPlaceRefusalText). A child that refuses with NO
                            // reason is named as an absence — never handed a manufactured
                            // verdict sentence ('placement refused') that hides the
                            // under-reporting validator.
                            this._skipped.push({ wallId: w.id, reason: v.reason ?? '(no reason stated by the child command)' });
                            continue;
                        }
                        const r = child.execute(ctx);
                        if (r.success) {
                            this.executedChildren.push(child);
                            this._created++;
                            affected.push(...r.affectedElementIds);
                        } else {
                            this._skipped.push({ wallId: w.id, reason: r.info?.[0] ?? 'execution refused' });
                        }
                    }
                }

                const skippedCount = this._skipped.length;
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const summary =
                    `Created ${this._created} of ${this._planned} planned window${this._planned === 1 ? '' : 's'} ` +
                    `across ${walls.length} wall${walls.length === 1 ? '' : 's'}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skip${skippedCount === 1 ? '' : 's'}` : '');

                span.setAttribute('pryzm.window.parametric.planned', this._planned);
                span.setAttribute('pryzm.window.parametric.created', this._created);
                span.setAttribute('pryzm.window.parametric.skipped', skippedCount);
                span.setAttribute('pryzm.window.parametric.mode', this.input.mode.kind);
                span.setAttribute('pryzm.window.parametric.scope', this.input.wallIds === 'all' ? 'all' : 'ids');

                return {
                    success: this._created > 0,
                    affectedElementIds: [...new Set(affected)],
                    info: [summary, ...reasonLines],
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
        // Reverse order — each child removes its own opening + hosted mirrors.
        const affected: string[] = [];
        for (let i = this.executedChildren.length - 1; i >= 0; i--) {
            const child = this.executedChildren[i];
            if (!child) continue; // noUncheckedIndexedAccess — in range by construction
            const r = child.undo(ctx);
            if (r.success) affected.push(...r.affectedElementIds);
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

    static deserialize(serialized: SerializedCommand): CreateWindowsParametricBatchCommand {
        return new CreateWindowsParametricBatchCommand(
            serialized.payload as CreateWindowsParametricBatchInput,
        );
    }
}
