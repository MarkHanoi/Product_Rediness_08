/**
 * MoveBoundaryLineCommand — move the setting-out line and CARRY WHAT IS ON IT,
 * as ONE undo unit, naming everything that could not follow.
 *
 * §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7920..L-7926) · **C106 §3** · ADR-0348 ·
 * C84 §EI-PROP (a dependent ADAPTS or REFUSES BY NAME) · C72 §9.1 · C74 ·
 * C81 (a cascade is ONE undo) · C16 (command authoring) · C03 §2.1 · P6 · P8.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S SENTENCE, AND THE THREE THINGS IT ACTUALLY REQUIRES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   "if the user moves the boundary line and this line had slabs and walls, they
 *    should move, adapt, propagate with all elements!!"
 *
 * 1. **The dependents must MOVE** — through commands that reach their AUTHORITATIVE
 *    stores, not the detached plugin DTO mirrors (`MoveWall.ts` refuses `wall.move`
 *    in its own words for exactly that reason).
 * 2. **It must cost ONE Ctrl+Z** — a user gesture is one history entry (C81).
 * 3. **Whatever did NOT move must be SAID** — C84 EI-PROP. A partial cascade that
 *    does not name what it skipped is worse than none, because "nothing moved" and
 *    "nothing should have moved" reach the user as the same value (C78 §1.4).
 *
 * ─── ONE UNDO, VIA `STRUCTURAL_CASCADE` — NOT `CompositeCommand` ───────────────
 * ⛔ `CompositeCommand` (L-2401) returns `success: true` **unconditionally in both
 * directions** and counts children *attempted*, not *landed*. Building on it would
 * mean telling the user a forty-element cascade undid cleanly when half of it did
 * not. `SetLevelHeightCommand` (ADR-0345) refused it for the same reason and this
 * command follows that precedent exactly.
 *
 * Instead the children are dispatched with `source: 'STRUCTURAL_CASCADE'` from INSIDE
 * this command's `execute()`. `CommandManagerImpl` (§L-874-ONE-UNDO) folds them into
 * the spawning gesture's `HistoryEntry.structuralChildren`: they revert and replay
 * WITH it, so one boundary-line drag costs one Ctrl+Z. That is the mechanism
 * `SlabWallConnectivityService` and `WallMoveReweldService` already use; nothing new
 * is invented here.
 *
 * ─── AND IT COUNTS WHAT **LANDED**, NOT WHAT IT ATTEMPTED ──────────────────────
 * Every child is executed through the command manager and its result is read; the
 * line's own new vertices are then RE-READ back out of the store. `success` is
 * `landed === attempted`. `SetLevelHeightCommand` learnt this the hard way —
 * `updateLevel()` returns `void` and silently no-ops on an unknown id — and the same
 * hazard exists here for every child.
 *
 * ─── WHY THIS IS A COMMAND-REGISTRY COMMAND AND NOT A PLUGIN HANDLER ───────────
 * A plugin handler can only write plugin DTO stores. The dependents live in the
 * geometry stores that the fragment builders, the 2-D plan projector, the IFC
 * exporter and persistence read, and there is no update bridge between the two in
 * either direction (`MoveWall.ts`, `elementMove.ts`). A propagation written against
 * the DTO stores would report success and change nothing a user can see — the exact
 * defect `wall.move` now refuses rather than commits.
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
import { DOMEventBus } from '@pryzm/event-bus';
import {
    planBoundaryLineMove,
    summariseBoundaryLineRefusals,
    type BoundaryLineAdaptation,
    type BoundaryLineData,
    type BoundaryLineMovePlan,
} from '@pryzm/geometry-boundary-line';
import {
    BOUNDARY_LINE_DEPENDENT_ADAPTERS,
    type DependentBefore,
} from './boundaryLineDependentAdapters';

const _bus = new DOMEventBus();

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/** Sub-millimetre. Below this a vertex "change" is float noise, not an edit. */
const EPSILON_M = 1e-6;

/** A plain world point. */
interface P3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface MoveBoundaryLinePayload {
    readonly boundaryLineId: string;
    /**
     * The line's vertices AFTER the edit, in world coordinates.
     *
     * ⚠ ABSOLUTE, NOT A DELTA, AND DELIBERATELY SO. A boundary-line edit is not always
     * a translation — the founder's modes include dragging one vertex, and re-shaping
     * a rectangle into a different rectangle. An absolute array expresses every one of
     * those; a delta expresses only the rigid case and would silently discard the rest.
     */
    readonly vertices: readonly P3[];
}

/**
 * The narrowest read/write surface this command needs from whatever holds boundary
 * lines. The plugin's `BoundaryLineStore` satisfies it structurally.
 *
 * ⚠ RESOLVED LAZILY FROM THE RUNTIME, the idiom `CreateVerticalCirculationCommand`
 * already uses for `liftStore`. `packages/command-registry` sits at L2 and the store
 * is built by `PluginRegistry` at L7, so an import would invert a layer. A structural
 * port cannot.
 */
interface BoundaryLineStoreLike {
    getState(): Map<string, BoundaryLineData> | ReadonlyMap<string, BoundaryLineData>;
    setState?(next: Map<string, BoundaryLineData>): void;
}

/** One child this command executed, with enough to reverse it. */
interface ExecutedChild {
    readonly elementId: string;
    readonly family: string;
    readonly command: Command;
}

export class MoveBoundaryLineCommand implements Command {
    /**
     * ⚠ THE FULL FOOTPRINT, because the cascade really does write all of these and
     * `CommandManagerImpl` snapshots ONLY the declared stores. Declaring fewer would
     * mean a failed cascade rolls back the line and leaves half the building moved —
     * the C16 CA-6 / §U-B6 hazard, in its most visible possible form.
     */
    readonly affectedStores = [
        'boundaryLine',
        'wall',
        'slab',
        'column',
        'beam',
        'curtainWall',
        'handrail',
        'stair',
        'furniture',
        'plumbing',
        'lighting',
    ] as const;

    readonly id: string;
    readonly type = CommandType.MOVE_BOUNDARY_LINE;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly payload: MoveBoundaryLinePayload;

    /** Snapshot — C01 §2.2. Captured in execute(), consumed by undo(). */
    private _prevLine: BoundaryLineData | null = null;
    private _children: ExecutedChild[] = [];
    private _plan: BoundaryLineMovePlan | null = null;

    constructor(payload: MoveBoundaryLinePayload) {
        this.id = `cmd-move-boundary-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.boundaryLineId];
    }

    describe(): string {
        const n = this._plan?.adapt.length ?? 0;
        return n > 0 ? `Move boundary line (${n} element${n === 1 ? '' : 's'} follow)` : 'Move boundary line';
    }

    // ── Validation ──────────────────────────────────────────────────────────

    canExecute(context: CommandContext): CommandValidationResult {
        const line = this._readLine(context);
        if (!line) {
            return { ok: false, reason: `Boundary line "${this.payload.boundaryLineId}" not found.` };
        }
        const v = this.payload.vertices;
        if (!Array.isArray(v) || v.length < 2) {
            return { ok: false, reason: 'A boundary line needs at least 2 vertices.' };
        }
        // ⛔ THE VERTEX COUNT MAY NOT CHANGE HERE. Every attachment stores a
        // `segmentIndex`, so adding or removing a vertex RENUMBERS the segments and
        // silently re-anchors half the dependents to the wrong edge. Editing the
        // topology is a different gesture, and it must detach first. Refusing with
        // both numbers is C74: never clamp, never guess.
        if (v.length !== line.vertices.length) {
            return {
                ok: false,
                reason:
                    `This boundary line has ${line.vertices.length} vertices and the edit supplies `
                    + `${v.length}. Adding or removing a vertex renumbers the segments that ${line.attachments.length} `
                    + `attached element(s) are anchored to. Detach them first, or move the existing vertices.`,
            };
        }
        for (const p of v) {
            if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(p?.z)) {
                return { ok: false, reason: 'Every boundary-line vertex must be a finite {x,y,z} point.' };
            }
        }
        // The edited line must still be a line. Checked BEFORE any mutation so a
        // degenerate drag refuses instead of stranding every dependent on a segment
        // with no direction.
        let longest = 0;
        const n = line.closed ? v.length : v.length - 1;
        for (let i = 0; i < n; i++) {
            const a = v[i]!;
            const b = v[(i + 1) % v.length]!;
            longest = Math.max(longest, Math.hypot(b.x - a.x, b.z - a.z));
        }
        if (longest < 0.001) {
            return {
                ok: false,
                reason:
                    `That edit collapses the boundary line — its longest segment would be `
                    + `${(longest * 1000).toFixed(2)} mm, and 1 mm is the minimum. Nothing was moved.`,
            };
        }
        return { ok: true };
    }

    // ── Execute ─────────────────────────────────────────────────────────────

    execute(context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.boundary_line.move', (span) => {
            try {
                const store = this._store(context);
                const prev = this._readLine(context);
                if (!store || !prev) {
                    return {
                        success: false,
                        affectedElementIds: [],
                        error: `Boundary line "${this.payload.boundaryLineId}" not found.`,
                    };
                }

                // C01 §2.2 — snapshot BEFORE any mutation.
                this._prevLine = structuredClone(prev) as BoundaryLineData;
                this._children = [];

                const next: BoundaryLineData = {
                    ...(structuredClone(prev) as BoundaryLineData),
                    vertices: this.payload.vertices.map((p) => ({ x: p.x, y: p.y, z: p.z })),
                };

                // ── 1 · the PLAN, computed before anything moves ─────────────
                // Pure, and therefore identical to what the tests assert. It decides
                // per attachment: adapt (and exactly where to), refuse by name,
                // unresolved, or unclassified.
                const plan = planBoundaryLineMove(prev, next);
                this._plan = plan;
                span.setAttribute('pryzm.boundary_line.attempted', plan.attempted);
                span.setAttribute('pryzm.boundary_line.adapt', plan.adapt.length);

                // ── 2 · the line itself ──────────────────────────────────────
                this._writeLine(context, next);

                // ── 3 · the dependents, as STRUCTURAL_CASCADE children ───────
                // Each is a real Command executed through the manager, so it lands in
                // THIS gesture's history entry (§L-874-ONE-UNDO) and costs no extra
                // Ctrl+Z. `landed` counts what the manager reported succeeded.
                let landed = 0;
                const failed: string[] = [];
                const noAdapter: string[] = [];
                const affected: string[] = [this.payload.boundaryLineId];

                for (const a of plan.adapt) {
                    const adapter = BOUNDARY_LINE_DEPENDENT_ADAPTERS[a.family];
                    if (!adapter) {
                        // Unreachable while `boundaryLineAdapterCoverage.test.ts` is
                        // green — and handled anyway, because an unreachable branch that
                        // silently continues is how a coverage gap becomes invisible.
                        noAdapter.push(`${a.family} (${a.elementId})`);
                        continue;
                    }
                    const before = this._readBefore(context, a);
                    const child = adapter(a, before);
                    if (!child) {
                        // ⛔ NOT A SKIP. The adapter could not build a command because
                        // the element's CURRENT state was unreadable — an id that no
                        // longer resolves, or a record without the geometry the family
                        // is supposed to have. Counted and reported.
                        failed.push(`${a.family} ${a.elementId} (its current geometry could not be read)`);
                        continue;
                    }
                    const ok = this._runChild(context, child);
                    if (ok) {
                        landed++;
                        this._children.push({ elementId: a.elementId, family: a.family, command: child });
                        affected.push(a.elementId);
                    } else {
                        failed.push(`${a.family} ${a.elementId}`);
                    }
                }

                // ── 4 · verify the LINE landed, by RE-READING it ─────────────
                // The L-2401 lesson in one block: never trust a write. A store whose
                // `setState` is absent or whose key changed under us would otherwise
                // report a perfect cascade over a line that never moved.
                const readBack = this._readLine(context);
                const lineLanded =
                    !!readBack
                    && readBack.vertices.length === next.vertices.length
                    && readBack.vertices.every(
                        (p, i) =>
                            Math.abs(p.x - next.vertices[i]!.x) < EPSILON_M
                            && Math.abs(p.z - next.vertices[i]!.z) < EPSILON_M,
                    );

                _bus.emit('update-project-ui', {});
                _bus.emit('bim-boundary-line-updated', { id: this.payload.boundaryLineId });
                _bus.emit('ai-model-update', { model: '' });

                span.setAttribute('pryzm.boundary_line.landed', landed);
                span.setAttribute('pryzm.boundary_line.line_landed', lineLanded);

                // ── 5 · the report a PERSON reads ────────────────────────────
                const info: string[] = [];
                if (!lineLanded) {
                    info.push('⚠ The boundary line itself did not move — its store did not accept the write.');
                }
                if (plan.adapt.length > 0) {
                    info.push(`Moved ${landed} of ${plan.adapt.length} attached element(s).`);
                }
                if (failed.length > 0) {
                    info.push(`⚠ Did not land: ${failed.join(', ')}.`);
                }
                if (noAdapter.length > 0) {
                    info.push(
                        `⚠ No adapter is registered for: ${noAdapter.join(', ')}. `
                        + `Their family claims to follow a boundary line and nothing can carry it (C106 §3.4).`,
                    );
                }
                // ⭐ THE HALF THE FOUNDER'S ASK TURNS ON: everything that did not move,
                // named, with the reason. `summariseBoundaryLineRefusals` returns null
                // when there is nothing to say, so a clean move prints no warning.
                const refusals = summariseBoundaryLineRefusals(plan);
                if (refusals) info.push(refusals);

                return {
                    success: lineLanded && landed === plan.adapt.length,
                    affectedElementIds: affected,
                    info,
                    ...(lineLanded && landed === plan.adapt.length
                        ? {}
                        : {
                            error:
                                `${landed} of ${plan.adapt.length} attached element(s) moved with the `
                                + `boundary line. See the details for which did not.`,
                        }),
                };
            } finally {
                span.end();
            }
        });
    }

    // ── Undo ────────────────────────────────────────────────────────────────

    /**
     * ⭐ CHILDREN FIRST, IN REVERSE — they mutated last, so they revert first. Then the
     * line. Exactly the order `CommandManagerImpl` uses for `structuralChildren`, and
     * the same order `SetLevelHeightCommand` reverses in.
     *
     * ⚠ And it COUNTS WHAT LANDED. A child whose element was deleted between execute
     * and undo cannot be reverted; saying "undone" would be the `CompositeCommand`
     * lie (L-2401). `success` is `landed === attempted`, and the message says the
     * fraction.
     */
    undo(context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.boundary_line.move.undo', (span) => {
            try {
                let landed = 0;
                const attempted = this._children.length;
                for (let i = this._children.length - 1; i >= 0; i--) {
                    const c = this._children[i]!;
                    try {
                        const r = c.command.undo?.(context);
                        if (r?.success !== false) landed++;
                    } catch {
                        // Swallowed and COUNTED, never swallowed and forgotten: one
                        // child that throws must not abort the rest of the reversal and
                        // leave the model half-undone.
                    }
                }
                let lineRestored = false;
                if (this._prevLine) {
                    this._writeLine(context, this._prevLine);
                    const back = this._readLine(context);
                    lineRestored =
                        !!back
                        && back.vertices.length === this._prevLine.vertices.length
                        && back.vertices.every(
                            (p, i) =>
                                Math.abs(p.x - this._prevLine!.vertices[i]!.x) < EPSILON_M
                                && Math.abs(p.z - this._prevLine!.vertices[i]!.z) < EPSILON_M,
                        );
                }

                _bus.emit('update-project-ui', {});
                _bus.emit('bim-boundary-line-updated', { id: this.payload.boundaryLineId });

                span.setAttribute('pryzm.boundary_line.undo.landed', landed);
                const success = lineRestored && landed === attempted;
                return {
                    success,
                    affectedElementIds: [this.payload.boundaryLineId, ...this._children.map((c) => c.elementId)],
                    ...(success
                        ? {}
                        : {
                            error:
                                `Undo restored ${landed} of ${attempted} moved element(s)`
                                + `${lineRestored ? '' : ' and could not restore the boundary line itself'}.`,
                        }),
                };
            } finally {
                span.end();
            }
        });
    }

    serialize(): SerializedCommand {
        return {
            id: this.id,
            type: this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version: 1,
            payload: {
                boundaryLineId: this.payload.boundaryLineId,
                vertices: this.payload.vertices.map((p) => ({ x: p.x, y: p.y, z: p.z })),
            },
        } as SerializedCommand;
    }

    // ── Store access ────────────────────────────────────────────────────────

    private _store(context: CommandContext): BoundaryLineStoreLike | null {
        // 1. Injected on the context, when a host wires it there.
        const injected = (context.stores as unknown as { boundaryLineStore?: BoundaryLineStoreLike })
            .boundaryLineStore;
        if (injected) return injected;
        // 2. The composed runtime — the production route. `PluginRegistry` builds
        //    exactly one `BoundaryLineStore` and `composeRuntime` exposes it here.
        //    Resolved LAZILY, the idiom `CreateVerticalCirculationCommand` uses for
        //    `liftStore`, because L2 may not import the L7 registry that constructs it.
        const rt = (globalThis as unknown as {
            window?: { runtime?: { stores?: Record<string, BoundaryLineStoreLike> } };
        }).window?.runtime;
        return rt?.stores?.['boundaryLine'] ?? null;
    }

    private _readLine(context: CommandContext): BoundaryLineData | null {
        const s = this._store(context);
        if (!s) return null;
        return (s.getState().get(this.payload.boundaryLineId) as BoundaryLineData | undefined) ?? null;
    }

    private _writeLine(context: CommandContext, next: BoundaryLineData): void {
        const s = this._store(context);
        if (!s) return;
        const state = s.getState();
        // `Store.getState()` returns the LIVE map in this codebase's plugin store, so
        // setting into it is the write. `setState` is called too when the port offers
        // it, so a store that returns a copy still lands. Whichever happened, the
        // caller RE-READS to find out — this method promises nothing.
        (state as Map<string, BoundaryLineData>).set?.(this.payload.boundaryLineId, next);
        if (s.setState) s.setState(new Map(state as Map<string, BoundaryLineData>));
    }

    /**
     * The dependent's CURRENT geometry, read from the authoritative store — the
     * `prevBaseLine` / `prevPolygon` an exact undo needs.
     *
     * ⚠ READ, NOT REMEMBERED. `UpdateWallBaselineCommand`'s own header says
     * `prevBaseLine` is *"the ONLY input that lets undo restore the pre-move
     * position"*, and a value carried in the payload from a UI layer can be stale by
     * the time the command runs.
     */
    private _readBefore(context: CommandContext, a: BoundaryLineAdaptation): DependentBefore {
        const st = context.stores as unknown as Record<string, { getById?: (id: string) => unknown } | undefined>;
        const pick = (key: string): Record<string, unknown> | null =>
            (st[key]?.getById?.(a.elementId) as Record<string, unknown> | undefined) ?? null;

        switch (a.family) {
            case 'wall': {
                const w = pick('wallStore');
                const bl = w?.['baseLine'] as [P3, P3] | undefined;
                return bl && bl.length === 2 ? { span: { start: bl[0], end: bl[1] } } : {};
            }
            case 'slab': {
                const s = pick('slabStore');
                const poly = s?.['boundary'] as ReadonlyArray<{ x: number; y?: number; z?: number }> | undefined;
                return poly ? { polygon: poly } : {};
            }
            default:
                // Every other adapter builds its command from the PLAN alone (an
                // absolute position, or a delta), so it needs no before-state. Returning
                // `{}` is therefore correct rather than lossy — and the adapters that DO
                // need one return `null` without it, which is counted and reported.
                return {};
        }
    }

    private _runChild(context: CommandContext, child: Command): boolean {
        const mgr = context.commandManager as unknown as {
            execute?: (c: Command, opts?: { source?: string }) => unknown;
        } | undefined;
        try {
            if (mgr?.execute) {
                // ⭐ `STRUCTURAL_CASCADE` IS WHAT BUYS THE SINGLE UNDO.
                // `CommandManagerImpl` (§L-874-ONE-UNDO) attaches children spawned from
                // inside an executing command to that gesture's `structuralChildren`
                // instead of pushing them as their own history entries.
                const r = mgr.execute(child, { source: 'STRUCTURAL_CASCADE' }) as
                    | { success?: boolean }
                    | undefined;
                return r?.success !== false;
            }
            // No manager (unit tests, headless hosts): execute directly so the
            // propagation is still measurable. It costs the STRUCTURAL_CASCADE
            // composition, which is a property of the manager, not of the cascade —
            // stated rather than hidden, because a test that runs this branch is NOT
            // testing the one-undo claim.
            const r = child.execute(context);
            return r.success !== false;
        } catch {
            return false;
        }
    }
}
