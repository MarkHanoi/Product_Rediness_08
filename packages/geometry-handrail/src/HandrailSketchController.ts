/**
 * HandrailSketchController — ONE handrail authoring gesture, for BOTH surfaces.
 *
 * ═══ WHAT THIS CLOSES — L-1106 / C95 §15.13, a live C84 EI-3 breach ═════════
 *
 * `elementCreationMatrix`'s `railing` row declares `views: ['plan','3d']` for all
 * SEVEN modes, and `activateHandrailTool` shows the `DrawingModeBar` in either
 * view. The plan surface implemented all seven. The 3-D `HandrailTool` was 255
 * lines with **no `mode` anywhere**: it resolved the armed TYPE and ignored the
 * armed MODE. So in 3-D the bar offered **Square / Circular / Ellipse**, the user
 * picked one, and the next two clicks drew a straight line. *The UI offered and
 * the pipeline did not accept* — for 3 of 7 modes, on one surface, live.
 *
 * ═══ WHY A CONTROLLER, AND NOT "ADD THE MODES TO `HandrailTool`" ════════════
 *
 * ⛔ C95 §15.13 forbids the obvious fix BY NAME: adding modes to `HandrailTool`
 * mints a SECOND gesture implementation beside `RailingPlanToolHandler`'s, which
 * is precisely the plan/3-D divergence §10.1 records for this family and which
 * §15.2 spent a lane closing. Two implementations of "what does CURVED mean?"
 * would diverge on the first bug fixed in one of them.
 *
 * ⭐ THE SHAPE IS `stair-path`'s, WHICH THE CREATION MATRIX ALREADY NAMES AS THE
 * DUAL-VIEW REFERENCE IMPLEMENTATION: ONE controller over ONE config store, with
 * a thin plan handler and a thin 3-D handler that differ ONLY in how a pointer
 * event becomes a world point and how a ghost is drawn. `StairPathToolController`
 * lives in `@pryzm/geometry-stair`; this lives in `@pryzm/geometry-handrail`;
 * `StairSketchCoordinateProvider` is to stair what {@link HandrailSketchHost} is
 * here.
 *
 * ⚠ AND THIS FAMILY HAS ALREADY PAID ONCE FOR COPYING THE WRONG HALF. By Slab
 * mirrored the wall's PILL, LABEL, `S` ACCELERATOR and REFUSAL MESSAGE and NONE
 * of its mechanism, and never worked (L-1103). What is copied here is the
 * mechanism: the state machine, the commit, the id shape, the field set.
 *
 * ═══ WHAT IS SURFACE-SPECIFIC AND WHAT IS NOT ═══════════════════════════════
 *
 *   surface-specific │ pointer event → world XZ · how the ghost is painted
 *   THIS FILE        │ which mode · vertex accumulation · ortho constraint · arc
 *                    │ construction · loop generation · post suppression ·
 *                    │ refusal thresholds · the readout string · the commit
 *
 * MODES, restated so the mapping is checkable:
 *   linear / ortho / curved — a chained POLYLINE. Each committed segment is one
 *       handrail; the endpoint becomes the next start. Interior vertices carry ONE
 *       post (`suppressStartPost`).
 *   square / circular / ellipse — CLOSED RUNS from ONE two-click gesture, so they
 *       commit as a single `CreateHandrailRunCommand`: one undo entry, one post per
 *       vertex including at the closure point.
 *   byslab — an ACTION on a slab id, surface-independent by construction
 *       (C95 §15.12 / L-1103). Not a gesture; the click merely triggers it.
 *
 * CONTRACTS: C84 EI-3 (UI offers ⇒ pipeline accepts) · C84 EI-9 · C95 §15.13 ·
 * C11 · C16 §8.6.
 */

import {
    applyOrthoConstraint,
    curvedRunVertices,
    isHandrailLoopMode,
    loopSegmentsForMode,
    segmentsFromVertices,
    type HandrailRunPoint,
    type HandrailRunSegment,
} from './handrailRunGenerators';
import { resolveActiveHandrailDrawMode, type HandrailDrawMode } from './handrailAuthoring';
import { resolveArmedHandrailSpec, type ResolvedHandrailSpec } from './handrailSpec';
import {
    dispatchHandrailRun,
    executeHandrailBySlab,
    type HandrailBySlabOutcome,
    type HandrailDispatcher,
} from './handrailCommit';

/** Everything a surface must paint, computed ONCE here so both surfaces agree. */
export interface HandrailSketchPreviewState {
    /** The vertices the CURRENT gesture would commit, in world XZ. */
    readonly pts: readonly HandrailRunPoint[];
    /** True for the closed-loop modes, so the surface joins last→first. */
    readonly closed: boolean;
    readonly mode: HandrailDrawMode;
    readonly spec: ResolvedHandrailSpec;
    /** The HUD line — type, mode, length/perimeter, and WHAT TO CLICK NEXT. */
    readonly readout: string;
}

/** The surface-specific half: how a ghost is painted, and where it is cleared. */
export interface HandrailSketchPreviewPort {
    render(state: HandrailSketchPreviewState): void;
    clear(): void;
}

/** The seam the controller is constructed over. Everything else is in this file. */
export interface HandrailSketchHost {
    /** `'plan'` or `'3d'` — appears in every console line so logs name the surface. */
    readonly surface: string;
    /** The command dispatcher, resolved LIVE (a plan ctx is re-supplied on activate). */
    dispatcher(): HandrailDispatcher | null | undefined;
    /** The level the run belongs to; `null` REFUSES by name rather than guessing. */
    levelId(): string | null;
    readonly preview: HandrailSketchPreviewPort;
    /** Optional — lets a surface offer the pick-a-slab flow when nothing is named. */
    onBySlab?(outcome: HandrailBySlabOutcome): void;
}

export class HandrailSketchController {
    /** The polyline vertices placed so far (linear / ortho / curved chaining). */
    private _chain: HandrailRunPoint[] = [];
    /** First gesture point of a CLOSED-loop mode (centre, or first corner). */
    private _loopAnchor: HandrailRunPoint | null = null;
    /** CURVED mode's clicked mid-point, awaiting its end point. */
    private _arcMid: HandrailRunPoint | null = null;
    /**
     * True once THIS polyline run has committed at least one segment.
     *
     * ⛔ THIS IS NOT `_chain.length > 1`, AND THE DIFFERENCE IS A REAL DEFECT THE
     * REACHABILITY SUITE CAUGHT BEFORE IT SHIPPED. After a commit the chain is
     * re-seeded to `[end]` so the next segment starts where the last finished — so
     * its length is 1 both before the FIRST click-pair and after every subsequent
     * one. Deriving "is this the head of the run?" from the chain length therefore
     * answered `true` every time, every segment kept its start post, and a chained
     * polyline grew a DOUBLED POST at every interior vertex: exactly the defect
     * `suppressStartPost` exists to prevent, reintroduced by the one place that
     * could not see it. The flag is explicit because the chain length is ambiguous.
     */
    private _runStarted = false;
    private _cursor: HandrailRunPoint | null = null;

    constructor(private readonly _host: HandrailSketchHost) {}

    /** True while a gesture is part-way through — the surface uses it to redraw. */
    get inProgress(): boolean {
        return this._chain.length > 0 || this._loopAnchor !== null;
    }

    /** Re-read on every interaction — a mid-run mode switch must take effect NOW. */
    mode(): HandrailDrawMode {
        return resolveActiveHandrailDrawMode();
    }

    reset(): void {
        this._chain = [];
        this._loopAnchor = null;
        this._arcMid = null;
        this._cursor = null;
        this._runStarted = false;
    }

    cancel(): void {
        this.reset();
        this._host.preview.clear();
    }

    onMouseMove(pt: HandrailRunPoint): void {
        this._cursor = pt;
        if (this.inProgress) this.redraw();
    }

    /** Finish the polyline without starting a new one from its end. */
    onDoubleClick(): void {
        this.cancel();
    }

    redraw(): void {
        if (!this.inProgress) return;
        const state = this.previewState();
        if (state.pts.length < 2) { this._host.preview.clear(); return; }
        this._host.preview.render(state);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // The gesture
    // ─────────────────────────────────────────────────────────────────────────

    onClick(pt: HandrailRunPoint): void {
        const mode = this.mode();

        if (mode === 'byslab') {
            const outcome = executeHandrailBySlab(undefined, this._host.dispatcher() ?? undefined);
            if (outcome.ok) this._host.preview.clear();
            this._host.onBySlab?.(outcome);
            return;
        }

        if (isHandrailLoopMode(mode)) {
            if (!this._loopAnchor) {
                this._loopAnchor = pt;
                return;
            }
            this._commitLoop(mode, this._loopAnchor, pt);
            return;
        }

        // ── Polyline family: linear / ortho / curved ──────────────────────────
        if (this._chain.length === 0) {
            this._chain.push(pt);
            return;
        }

        const anchor = this._chain[this._chain.length - 1]!;

        if (mode === 'curved') {
            // Three clicks per curved segment: start (already placed), MID, end —
            // the boundary tools' "arc through a clicked midpoint" gesture.
            if (!this._arcMid) {
                this._arcMid = pt;
                return;
            }
            const verts = curvedRunVertices(anchor, this._arcMid, pt);
            this._arcMid = null;
            if (verts.length < 2) {
                console.warn(
                    `[handrail/${this._host.surface}] curved segment REFUSED — its chord is under ` +
                    'the 0.1 m minimum CreateHandrailCommand accepts. Nothing was created; the ' +
                    'start point is kept so you can re-aim.',
                );
                this._host.preview.clear();
                return;
            }
            this._commitOpenRun(verts, /* startsAtChainHead */ !this._runStarted);
            this._chain = [verts[verts.length - 1]!];
            this._host.preview.clear();
            return;
        }

        const end = mode === 'ortho' ? applyOrthoConstraint(anchor, pt) : pt;
        if (Math.hypot(end.x - anchor.x, end.z - anchor.z) < 0.1) {
            console.warn(
                `[handrail/${this._host.surface}] segment REFUSED — under the 0.1 m minimum ` +
                'CreateHandrailCommand accepts. Nothing was created; the start point is kept.',
            );
            return;
        }
        this._commitOpenRun([anchor, end], /* startsAtChainHead */ !this._runStarted);
        // Chain: the endpoint becomes the next start, exactly as the wall tool does.
        this._chain = [end];
        this._host.preview.clear();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Commit
    // ─────────────────────────────────────────────────────────────────────────

    private _levelId(): string | null {
        const levelId = this._host.levelId();
        if (!levelId) {
            console.error(
                `[handrail/${this._host.surface}] REFUSED — no active level id, so there is no ` +
                'level to place the handrail on. Nothing was created.',
            );
            return null;
        }
        return levelId;
    }

    /**
     * Commit an OPEN run of segments produced by one click.
     *
     * `startsAtChainHead` says whether the run's first vertex is the very first
     * vertex of the whole polyline: only then does that vertex need its own post.
     * Every subsequent commit's first vertex is already posted by the segment that
     * ended there, so it suppresses — which is what keeps a chained polyline from
     * growing a doubled post at every click.
     */
    private _commitOpenRun(vertices: readonly HandrailRunPoint[], startsAtChainHead: boolean): void {
        const levelId = this._levelId();
        if (!levelId) return;
        const { segments, droppedDegenerate } = segmentsFromVertices(vertices, false);
        if (droppedDegenerate > 0) {
            console.warn(
                `[handrail/${this._host.surface}] ${droppedDegenerate} degenerate sub-segment(s) ` +
                'dropped — each was under the 0.1 m minimum. The rest of the run was created.',
            );
        }
        if (segments.length === 0) return;

        const adjusted: HandrailRunSegment[] = segments.map((s, i) => ({
            ...s,
            suppressStartPost: i === 0 ? !startsAtChainHead : true,
        }));
        const created = dispatchHandrailRun(
            this._host.dispatcher(), adjusted, levelId, 'Handrail run', this._host.surface,
        );
        // From here on this run OWNS its head vertex, so every later commit
        // suppresses its start post. Set after the dispatch, not before, so a
        // refused dispatch does not claim a post nobody placed.
        if (created.length > 0) this._runStarted = true;
    }

    private _commitLoop(
        mode: 'square' | 'circular' | 'ellipse',
        first: HandrailRunPoint,
        second: HandrailRunPoint,
    ): void {
        const levelId = this._levelId();
        if (!levelId) return;
        const { segments } = loopSegmentsForMode(mode, first, second);
        this._loopAnchor = null;
        this._host.preview.clear();
        if (segments.length === 0) {
            console.warn(
                `[handrail/${this._host.surface}] ${mode} handrail REFUSED — the gesture is too ` +
                'small to form a loop (each axis must exceed 0.2 m and every chord 0.1 m). ' +
                'Nothing was created.',
            );
            return;
        }
        dispatchHandrailRun(
            this._host.dispatcher(), segments, levelId, `${mode} handrail run`, this._host.surface,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Preview — computed here, PAINTED by the surface
    // ─────────────────────────────────────────────────────────────────────────

    /** The vertices the CURRENT gesture would commit, plus the HUD readout. */
    previewState(): HandrailSketchPreviewState {
        const mode = this.mode();
        const spec = resolveArmedHandrailSpec();
        const { pts, closed } = this._previewVertices(mode);
        return { pts, closed, mode, spec, readout: this._readout(mode, spec, pts, closed) };
    }

    private _previewVertices(mode: HandrailDrawMode): { pts: HandrailRunPoint[]; closed: boolean } {
        const cp = this._cursor;
        if (!cp) return { pts: [], closed: false };

        if (isHandrailLoopMode(mode)) {
            if (!this._loopAnchor) return { pts: [], closed: false };
            const { segments } = loopSegmentsForMode(mode, this._loopAnchor, cp);
            const pts = segments.map((s) => s.start);
            return { pts, closed: pts.length >= 3 };
        }

        const anchor = this._chain[this._chain.length - 1];
        if (!anchor) return { pts: [], closed: false };
        if (mode === 'curved' && this._arcMid) {
            return { pts: curvedRunVertices(anchor, this._arcMid, cp), closed: false };
        }
        const end = mode === 'ortho' ? applyOrthoConstraint(anchor, cp) : cp;
        return { pts: [anchor, end], closed: false };
    }

    private _readout(
        mode: HandrailDrawMode,
        spec: ResolvedHandrailSpec,
        pts: readonly HandrailRunPoint[],
        closed: boolean,
    ): string {
        if (pts.length < 2) return `${spec.typeName} · ${mode}`;
        if (closed) {
            let perim = 0;
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i]!;
                const b = pts[(i + 1) % pts.length]!;
                perim += Math.hypot(b.x - a.x, b.z - a.z);
            }
            return `${spec.typeName} · ${mode} loop: ${perim.toFixed(2)} m, ${pts.length} segments — click to place`;
        }
        let len = 0;
        for (let i = 1; i < pts.length; i++) {
            len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
        }
        const next = mode === 'curved' && !this._arcMid ? 'click the arc mid-point' : 'click end point';
        return `${spec.typeName} · ${mode}: ${len.toFixed(2)} m — ${next}`;
    }
}
