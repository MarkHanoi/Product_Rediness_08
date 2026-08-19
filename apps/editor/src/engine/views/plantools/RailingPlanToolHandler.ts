/**
 * RailingPlanToolHandler — §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18).
 *
 * THE FOUNDER, in substance:
 *   "I would like PARITY WITH THE WALL ELEMENT. The railing is conceptually really
 *    similar to the wall … I want it created in the same way: once the user clicks
 *    it should have the same UI/UX as the wall's authoring panel. The user could
 *    select from a number of railings and decide whether they want to create
 *    railing BY LINE, ORTHO, CURVED, BY SLAB and add SQUARE, CIRCULAR, ELLIPSE."
 *
 * WHAT THIS FILE WAS, MEASURED (C95 §10.1)
 * ─────────────────────────────────────────────────────────────────────────────
 * A two-click line tool with `DEFAULT_HEIGHT = 1.1` and `DEFAULT_THICK = 0.05`
 * hard-coded at the top, importing no `handrailTypeStore` and holding no selected
 * type: **it could not express any catalogue type at all**. Meanwhile the 3-D
 * `HandrailTool` resolved every field from the selected type and defaulted height
 * to **1.0**. One question — "what handrail did the user ask for?" — with two
 * answers, chosen by which VIEW the user happened to be in. That is C84 EI-9, and
 * the two literals are DELETED here rather than re-synchronised, because a comment
 * is not a synchronisation mechanism (C84 §8.d).
 *
 * WHAT IT DISPATCHES, AND WHY NOT THE BUS
 * ─────────────────────────────────────────────────────────────────────────────
 * It executes `CreateHandrailCommand` / `CreateHandrailRunCommand` through
 * `ctx.commandManager` — the DI slot the overlay already populates and the same
 * L2 path the 3-D tool, the IFC importer and the project loader use (C95 §4.2 —
 * *"the live path is legacy"*).
 *
 * ⚠ THIS IS A DELIBERATE CHANGE OF PATH AND IT IS THE ONLY ONE THAT CARRIES THE
 * TYPE. The previous dispatch was `runtime.bus.executeCommand('handrail.create')`,
 * whose payload is `{id, levelId, hostId, path, shape, height, diameter,
 * materialId}` (`plugins/handrail/src/handlers/CreateHandrail.ts`) — it has NO
 * slot for `fillType`, `railProfile`, `postSpacing`, `baseOffset`, `materialColor`
 * or any baluster field, and the `.created` bridge that mirrors it into the
 * authoritative legacy store hard-codes `fillType: 'baluster'` and `baseOffset: 0`
 * (C95 §5, D4/D6). Routing a catalogue type through that path would have SILENTLY
 * dropped most of it — the very EI-2 defect this lane exists to close — so the
 * type-carrying path is used instead. Two further consequences, both good:
 *   • the write no longer lands in the plugin DTO store, which has ZERO production
 *     readers and leaks monotonically because nothing dispatches `handrail.delete`
 *     (C95 §4.3 / delta #8);
 *   • the record is byte-identical to the 3-D tool's, which is what EI-9 asked for.
 * `check:commandmanager` scans `packages/` and `plugins/` only — `apps/` is
 * excluded by that gate's own scope — so this adds nothing to its count.
 *
 * MODES
 * ─────────────────────────────────────────────────────────────────────────────
 * Declared ONCE in `elementCreationMatrix`'s `railing` row (which spreads the
 * wall's own `WALL_DRAW_MODES`), rendered by the shared `DrawingModeBar`, stored
 * in `activeHandrailAuthoring` and RE-READ on every click so a switch applies to
 * the very next segment without destroying the vertices already placed.
 *
 *   linear / ortho / curved — a chained POLYLINE. Each committed segment is one
 *       handrail, exactly as each committed wall segment is one wall, and the
 *       endpoint becomes the next start. Interior vertices carry ONE post
 *       (`suppressStartPost`), which the wall tool has no equivalent of because
 *       walls do not have posts.
 *   byslab / square / circular / ellipse — CLOSED RUNS from one gesture, so they
 *       commit as a single `CreateHandrailRunCommand`: one undo entry, and one
 *       post per vertex including at the closure point.
 *
 * CONTRACTS: C11 (creation pipeline) · C16 §8.6 + CA-18 · C84 EI-2/EI-3/EI-9 ·
 * C95 §D4/§D5 · C82 (the controls added here are declared in the creation matrix).
 */

import { createId } from '@pryzm/schemas';
import {
    CreateHandrailCommand,
    CreateHandrailRunCommand,
    CreateHandrailRunOnSlabCommand,
    type HandrailRunSegmentSpec,
} from '@pryzm/command-registry';
import { handrailTypeStore, type HandrailTypeDefinition } from '@pryzm/core-app-model/stores';
import { applyOrthoConstraint, curvedRunVertices, isHandrailLoopMode, loopSegmentsForMode, segmentsFromVertices, type HandrailRunPoint, type HandrailRunSegment } from '@pryzm/geometry-handrail';
import {
    resolveActiveHandrailDrawMode,
    resolveActiveHandrailTypeId,
    resolveHandrailBySlabTarget,
    type HandrailDrawMode,
} from './activeHandrailAuthoring';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const STROKE = '#f59e0b';
const FILL_A = 'rgba(245,158,11,0.10)';

/**
 * The fallback geometry when NO catalogue type is armed.
 *
 * ⛔ NOT a rival default set. These are the values `CreateHandrailCommand`'s own
 * callers have always used when no type is selected — `HandrailTool`'s
 * `typeDef?.height ?? 1.0` / `typeDef?.thickness ?? 0.05` — reproduced here so the
 * two surfaces agree on the un-typed case too. The old plan-only `1.1` is gone.
 */
const UNTYPED_HEIGHT = 1.0;
const UNTYPED_THICKNESS = 0.05;

/** Every geometric field a handrail record needs, resolved from the armed type. */
interface ResolvedHandrailSpec {
    readonly typeId: string | undefined;
    readonly typeName: string;
    readonly height: number;
    readonly thickness: number;
    readonly baseOffset: number;
    readonly fillType?: string;
    readonly railProfile?: string;
    readonly railDiameter?: number;
    readonly postSpacing?: number;
    readonly balusterShape?: 'rectangular' | 'round';
    readonly balusterWidth?: number;
    readonly balusterSpacing?: number;
    readonly infillMaxGap?: number;
    readonly materialColor?: string;
    /** §C100-HANDRAIL-MATERIAL-ID — the MASTER material the type references. */
    readonly materialId?: string;
}

/**
 * THE ONE resolution of "what handrail did the user ask for?", shared by the
 * preview and the commit so the ghost can never describe a rail the command will
 * not build.
 */
export function resolveArmedHandrailSpec(
    typeId: string | undefined = resolveActiveHandrailTypeId(),
): ResolvedHandrailSpec {
    const def: HandrailTypeDefinition | undefined = typeId
        ? handrailTypeStore.getById(typeId)
        : undefined;
    if (!def) {
        return {
            typeId: undefined,
            typeName: 'Default Handrail',
            height: UNTYPED_HEIGHT,
            thickness: UNTYPED_THICKNESS,
            baseOffset: 0,
        };
    }
    return {
        typeId: def.id,
        typeName: def.name,
        height: def.height,
        thickness: def.thickness,
        baseOffset: def.baseOffset,
        fillType: def.fillType,
        railProfile: def.railProfile,
        railDiameter: def.railDiameter,
        postSpacing: def.postSpacing,
        balusterShape: def.balusterShape,
        balusterWidth: def.balusterWidth,
        balusterSpacing: def.balusterSpacing,
        infillMaxGap: def.infillMaxGap,
        materialColor: def.materialColor,
        materialId: def.materialId,
    };
}

const toRunPoint = (p: WorldPoint): HandrailRunPoint => ({ x: p.worldX, z: p.worldZ });

export class RailingPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
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
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._reset();
    }

    deactivate(): void {
        this._clearOverlay();
        this._reset();
        this._ctx = null;
    }

    private _reset(): void {
        this._chain = [];
        this._loopAnchor = null;
        this._arcMid = null;
        this._cursor = null;
        this._runStarted = false;
    }

    /** Re-read on every interaction — a mid-run mode switch must take effect now. */
    private _mode(): HandrailDrawMode {
        return resolveActiveHandrailDrawMode();
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        if (this._chain.length > 0 || this._loopAnchor) this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        const mode = this._mode();

        if (mode === 'byslab') {
            this._commitBySlab();
            return;
        }

        if (isHandrailLoopMode(mode)) {
            if (!this._loopAnchor) {
                this._loopAnchor = toRunPoint(pt);
                return;
            }
            this._commitLoop(mode, this._loopAnchor, toRunPoint(pt));
            return;
        }

        // ── Polyline family: linear / ortho / curved ──────────────────────────
        if (this._chain.length === 0) {
            this._chain.push(toRunPoint(pt));
            return;
        }

        const anchor = this._chain[this._chain.length - 1]!;

        if (mode === 'curved') {
            // Three clicks per curved segment: start (already placed), MID, end —
            // the boundary tools' "arc through a clicked midpoint" gesture.
            if (!this._arcMid) {
                this._arcMid = toRunPoint(pt);
                return;
            }
            const verts = curvedRunVertices(anchor, this._arcMid, toRunPoint(pt));
            this._arcMid = null;
            if (verts.length < 2) {
                console.warn(
                    '[RailingPlanToolHandler] curved segment REFUSED — its chord is under the ' +
                    '0.1 m minimum CreateHandrailCommand accepts. Nothing was created; the ' +
                    'start point is kept so you can re-aim.',
                );
                this._clearOverlay();
                return;
            }
            this._commitOpenRun(verts, /* startsAtChainHead */ !this._runStarted);
            this._chain = [verts[verts.length - 1]!];
            this._clearOverlay();
            return;
        }

        const end = mode === 'ortho' ? applyOrthoConstraint(anchor, toRunPoint(pt)) : toRunPoint(pt);
        if (Math.hypot(end.x - anchor.x, end.z - anchor.z) < 0.1) {
            console.warn(
                '[RailingPlanToolHandler] segment REFUSED — under the 0.1 m minimum ' +
                'CreateHandrailCommand accepts. Nothing was created; the start point is kept.',
            );
            return;
        }
        this._commitOpenRun([anchor, end], /* startsAtChainHead */ !this._runStarted);
        // Chain: the endpoint becomes the next start, exactly as the wall tool does.
        this._chain = [end];
        this._clearOverlay();
    }

    onDoubleClick(_pt: WorldPoint): void {
        // Finish the polyline without starting a new one from its end.
        this._reset();
        this._clearOverlay();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        return false;
    }

    cancel(): void {
        this._reset();
        this._clearOverlay();
    }

    redraw(): void {
        if (this._chain.length > 0 || this._loopAnchor) this._drawPreview();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Commit
    // ─────────────────────────────────────────────────────────────────────────

    private _levelId(): string | null {
        const levelId = this._ctx?.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error(
                '[RailingPlanToolHandler] REFUSED — ViewDefinition.spatial.levelId is missing, ' +
                'so there is no level to place the handrail on. Nothing was created.',
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
                `[RailingPlanToolHandler] ${droppedDegenerate} degenerate sub-segment(s) dropped ` +
                '— each was under the 0.1 m minimum. The rest of the run was created.',
            );
        }
        if (segments.length === 0) return;

        const adjusted: HandrailRunSegment[] = segments.map((s, i) => ({
            ...s,
            suppressStartPost: i === 0 ? !startsAtChainHead : true,
        }));
        this._dispatchRun(adjusted, levelId, 'Handrail run');
        // From here on this run OWNS its head vertex, so every later commit
        // suppresses its start post. Set after the dispatch, not before, so a
        // refused dispatch does not claim a post nobody placed.
        this._runStarted = true;
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
        this._clearOverlay();
        if (segments.length === 0) {
            console.warn(
                `[RailingPlanToolHandler] ${mode} handrail REFUSED — the gesture is too small ` +
                'to form a loop (each axis must exceed 0.2 m and every chord 0.1 m). ' +
                'Nothing was created.',
            );
            return;
        }
        this._dispatchRun(segments, levelId, `${mode} handrail run`);
    }

    /**
     * BY SLAB — kept as a MODE branch only for the programmatic path (RAC, or a
     * caller that arms the mode directly). The interactive route no longer needs a
     * canvas click at all: the bar's By Slab pill is an ACTION that runs
     * {@link executeHandrailBySlab} immediately, exactly as wall's does.
     *
     * ⛔ IT NO LONGER READS THE LIVE SELECTION. See §FIX-HANDRAIL-BY-SLAB (L-1103)
     * on `executeHandrailBySlab` — the tool's own activation had already cleared it.
     */
    private _commitBySlab(): void {
        const result = executeHandrailBySlab(undefined, this._ctx?.commandManager);
        if (result.ok) this._clearOverlay();
    }

    /**
     * ONE gesture, ONE command, ONE undo entry — and, for a single segment, the
     * ordinary `CreateHandrailCommand` so a plain two-click rail takes exactly the
     * path it always did.
     */
    private _dispatchRun(
        segments: readonly HandrailRunSegment[],
        levelId: string,
        label: string,
    ): void {
        const cm = this._ctx?.commandManager;
        if (!cm) {
            console.error(
                '[RailingPlanToolHandler] REFUSED — no commandManager on the plan tool context, ' +
                'so the handrail cannot be created through the command path. Nothing was created ' +
                'and nothing was written directly to a store.',
            );
            return;
        }
        const spec = resolveArmedHandrailSpec();
        const shared = {
            height: spec.height,
            thickness: spec.thickness,
            baseOffset: spec.baseOffset,
            fillType: spec.fillType,
            railProfile: spec.railProfile,
            railDiameter: spec.railDiameter,
            postSpacing: spec.postSpacing,
            balusterShape: spec.balusterShape,
            balusterWidth: spec.balusterWidth,
            balusterSpacing: spec.balusterSpacing,
            infillMaxGap: spec.infillMaxGap,
            materialColor: spec.materialColor,
            materialId: spec.materialId,
            levelId,
        };

        if (segments.length === 1) {
            const only = segments[0]!;
            const id = createId('handrail');
            cm.execute(new CreateHandrailCommand({
                id,
                start: only.start,
                end: only.end,
                suppressStartPost: only.suppressStartPost,
                ...shared,
            }));
            console.log(
                `[RailingPlanToolHandler] handrail ${id} created — type "${spec.typeName}", ` +
                `mode "${this._mode()}".`,
            );
            return;
        }

        const specs: HandrailRunSegmentSpec[] = segments.map((s) => ({
            id: createId('handrail'),
            start: s.start,
            end: s.end,
            suppressStartPost: s.suppressStartPost,
        }));
        cm.execute(new CreateHandrailRunCommand({ segments: specs, label, ...shared }));
        console.log(
            `[RailingPlanToolHandler] ${label} — ${specs.length} segment(s) as ONE undo entry, ` +
            `type "${spec.typeName}", mode "${this._mode()}".`,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Preview
    // ─────────────────────────────────────────────────────────────────────────

    /** The vertices the CURRENT gesture would commit, used by the preview only. */
    private _previewVertices(): { pts: HandrailRunPoint[]; closed: boolean } {
        const mode = this._mode();
        const cursor = this._cursor;
        if (!cursor) return { pts: [], closed: false };
        const cp = toRunPoint(cursor);

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

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        const { pts, closed } = this._previewVertices();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        if (pts.length < 2) return;

        ctx.save();

        const screen = pts.map((p) => planCanvas.worldToScreen(p.x, p.z));
        const spec = resolveArmedHandrailSpec();
        const ppu = planCanvas.getPixelsPerUnit();
        const thickPx = Math.max(2, spec.thickness * ppu);

        // Body band — the armed type's actual thickness, so the ghost describes the
        // rail the command will build rather than a fixed 50 mm stand-in.
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = FILL_A;
        ctx.lineWidth = thickPx;
        ctx.strokeStyle = FILL_A;
        ctx.beginPath();
        ctx.moveTo(screen[0]!.sx, screen[0]!.sy);
        for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i]!.sx, screen[i]!.sy);
        if (closed) ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = STROKE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen[0]!.sx, screen[0]!.sy);
        for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i]!.sx, screen[i]!.sy);
        if (closed) ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Post markers — the preview shows WHERE THE POSTS WILL BE, which is the
        // only way the closure-join behaviour is visible before committing.
        ctx.fillStyle = STROKE;
        for (const s of screen) {
            ctx.beginPath();
            ctx.arc(s.sx, s.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        const mode = this._mode();
        let readout: string;
        if (closed) {
            let perim = 0;
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i]!;
                const b = pts[(i + 1) % pts.length]!;
                perim += Math.hypot(b.x - a.x, b.z - a.z);
            }
            readout = `${spec.typeName} · ${mode} loop: ${perim.toFixed(2)} m, ${pts.length} segments — click to place`;
        } else {
            let len = 0;
            for (let i = 1; i < pts.length; i++) {
                len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
            }
            const next = mode === 'curved' && !this._arcMid ? 'click the arc mid-point' : 'click end point';
            readout = `${spec.typeName} · ${mode}: ${len.toFixed(2)} m — ${next}`;
        }
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(245,158,11,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(readout, 12, cssH - 12);

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}

/**
 * §FIX-HANDRAIL-BY-SLAB (L-1103) — `readSelectedSlabOutline()` USED TO LIVE HERE
 * AND IS DELETED, NOT DEPRECATED.
 *
 * It read `window.selectionManager.selectedObject` to find the slab. That is the
 * exact read the tool's own activation had already invalidated
 * (`ToolManager.activateTool` → `selectionManager.setEnabled(false)`), so it
 * returned `null` on every By-Slab attempt. Leaving it in place as a second,
 * losing answer to "which slab are we guarding?" is C84 EI-9 — the shape that
 * costs a family a week — so the read now happens in exactly one place,
 * `resolveHandrailBySlabTarget()` in `activeHandrailAuthoring`, which prefers the
 * PRE-ACTIVATION snapshot. The ring construction (local `{x,y}` + `position`,
 * re-wound to CCW so segment order and post ownership do not depend on how the
 * slab was drawn) moved with it, into `slabWorldRing` on
 * `CreateHandrailRunOnSlabCommand`.
 */


/** What {@link executeHandrailBySlab} did, so the caller can offer the pick flow. */
export interface HandrailBySlabOutcome {
    /** True only when handrails were actually created. */
    readonly ok: boolean;
    /**
     * `'no-slab'` — nothing to guard was named, so the caller should ASK
     * (pick-a-slab), not report a failure. Every other value is a real refusal
     * whose `reason` is already user-facing.
     */
    readonly kind: 'created' | 'no-slab' | 'refused' | 'no-dispatch';
    readonly reason?: string;
    readonly createdIds?: readonly string[];
}

/**
 * §FIX-HANDRAIL-BY-SLAB (L-1103) — THE ONE BY-SLAB EXECUTOR, for every surface.
 *
 * ─── THE DEFECT THIS REPLACES ───────────────────────────────────────────────
 * Founder, from a live session: *"Handrail by slab doesn't work. The same
 * happened with curtain walls. Walls work correctly."*
 *
 * By Slab used to be a canvas GESTURE: the plan handler waited for a click and
 * then asked `readSelectedSlabOutline()` for the LIVE selection. But
 * `ToolManager.activateTool()` runs `selectionManager.setEnabled(false)` while
 * activating ANY tool, which clears `selectedObject` — so at click time there was
 * never a selection, and the tool consuming the clicks meant one could never be
 * acquired either. The guard was UNSATISFIABLE: not flaky, never true. Selecting
 * the slab first did not help, because the act of choosing the railing tool threw
 * that selection away.
 *
 * ─── WHY THIS SHAPE ─────────────────────────────────────────────────────────
 * The founder named the reference — the WALL works — so this mirrors what the
 * wall does rather than inventing a third answer. Wall's By Slab is not a gesture
 * either: `ToolsAreaLayout._execWallBySlab` dispatches a command with a
 * `{ slabId }` payload, taken from a snapshot captured BEFORE activation, and
 * when there is no snapshot it enters an explicit pick-a-slab mode that
 * re-enables selection. Both halves are mirrored here, and the id resolution
 * lives in `activeHandrailAuthoring` so the plan handler, the 3-D tool and RAC
 * all read the same answer (L-98).
 *
 * ⚠ IT DISPATCHES A COMMAND, NEVER A STORE WRITE (P6/C11): the run is built by
 * `CreateHandrailRunOnSlabCommand` → `CreateHandrailRunCommand` →
 * `CreateHandrailCommand`, so a by-slab guard's records are byte-identical to a
 * hand-drawn rail's and ONE Ctrl+Z removes the whole perimeter (C16 §8.6).
 *
 * ⚠ `hostId`/`hostKind` are set by the command, not here — a guard created on a
 * slab is HOSTED BY that slab (C95 §15.1), which is what lets the model answer
 * "which railings guard this slab?" and what a future slab-delete cascade needs.
 */
export function executeHandrailBySlab(
    slabId?: string,
    commandManager?: { execute(cmd: unknown): unknown },
): HandrailBySlabOutcome {
    const target = slabId ?? resolveHandrailBySlabTarget();
    if (!target) {
        // NOT an error: the user has simply not said WHICH slab. The caller offers
        // the pick flow, exactly as wall's By Slab does with no pre-selection.
        return {
            ok: false,
            kind: 'no-slab',
            reason: 'No slab named for BY SLAB — ask the user to pick one.',
        };
    }

    const cm = (commandManager
        ?? (window as unknown as { commandManager?: { execute(cmd: unknown): unknown } }).commandManager) as
        | { execute(cmd: unknown): { success?: boolean; affectedElementIds?: string[]; info?: string[] } }
        | undefined;
    if (!cm?.execute) {
        console.error(
            '[handrail/by-slab] REFUSED — no commandManager is reachable, so the guard cannot be ' +
            'created through the command path. Nothing was created and nothing was written directly ' +
            'to a store.',
        );
        return { ok: false, kind: 'no-dispatch', reason: 'No command dispatcher available.' };
    }

    const spec = resolveArmedHandrailSpec();
    const cmd = new CreateHandrailRunOnSlabCommand({
        slabId: target,
        height: spec.height,
        thickness: spec.thickness,
        baseOffset: spec.baseOffset,
        fillType: spec.fillType,
        railProfile: spec.railProfile,
        railDiameter: spec.railDiameter,
        postSpacing: spec.postSpacing,
        balusterShape: spec.balusterShape,
        balusterWidth: spec.balusterWidth,
        balusterSpacing: spec.balusterSpacing,
        infillMaxGap: spec.infillMaxGap,
        materialColor: spec.materialColor,
        materialId: spec.materialId,
        label: `Handrail by slab — ${spec.typeName}`,
    });

    const res = cm.execute(cmd) as { success?: boolean; affectedElementIds?: string[]; info?: string[] } | undefined;

    // ⚠ A DISPATCHER THAT RETURNS NOTHING IS NOT A REFUSAL. `CommandManagerImpl`
    // returns a `CommandResult`, but the `execute` seam is typed loosely and other
    // dispatchers (and test doubles) return `void`. Reading "no result" as "it
    // failed" would print a REFUSED line over a command that ran — reporting the
    // opposite of what happened, which is worse than saying nothing. The command
    // has already logged its own refusal by name if there was one.
    if (res === undefined) {
        return { ok: true, kind: 'created', reason: 'Dispatched; the dispatcher reported no result.' };
    }

    const created = res?.affectedElementIds ?? [];
    if (res?.success && created.length > 0) {
        console.log(
            `[handrail/by-slab] ${created.length} handrail(s) created on slab ${target} — ` +
            `type "${spec.typeName}", ONE undo entry.`,
        );
        return { ok: true, kind: 'created', createdIds: created };
    }
    const reason = (res?.info ?? []).join('; ') || `Slab ${target} produced no guard.`;
    console.warn(`[handrail/by-slab] REFUSED — ${reason}`);
    return { ok: false, kind: 'refused', reason };
}
