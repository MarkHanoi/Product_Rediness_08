import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import { createId } from '@pryzm/schemas';
// §SLAB-REGION-CURVED — shared, curve-aware region tracer. The plan-view overlay
// previously read each wall as a single straight baseLine chord and dropped the
// `curve` descriptor, so a region bounded by a curved/filleted wall never closed.
// Delegating to the same tracer the 3D tool uses fixes curved-wall regions here too.
import { findRegionAtPoint as traceRegionAtPoint } from '@pryzm/geometry-slab';
// §REGION-HOST-ATTRIBUTION (founder, 2026-08-12) — a region-created slab must HOLD
// HOST REFERENCES to the walls that bound it, exactly as a pick-walls slab does.
// Clicking inside four walls EXPRESSES A RELATIONSHIP ("the floor of this room"), not
// a coincidental quadrilateral; before this the ring's wall ids were discarded in
// transit and the slab silently failed to follow its walls. See SlabRegionTracer.
import { traceRegionSketchAtPoint, type SlabSketch } from '@pryzm/geometry-slab';
// The sketch is attached through the COMMAND LAYER (C03/P6 — commands are the only
// mutation path), so it is undoable and SlabDependencyTracker re-registers the
// wall→slab dependencies from its own 'bim-slab-updated' listener.
// §BRIDGE-EXPORTS (2026-08-12) — the UpdateSlabSketchCommand dispatch is a
// typed-world → legacy-commandManager bridge, so it lives in the ONE authorised
// bridge file (initBusHandlers.ts) rather than as a scattered legacy call site here.
import { attachSlabSketchViaLegacyBridge } from '../../initBusHandlers';
// §FEAT-SLAB-DRAW-MODES (founder 2026-08-06) — "During SLAB creation … I want the
// SAME OPTIONS as during WALL creation — ORTHO, LINEAR, CURVE". The polyline slab
// now authors its boundary through the ONE shared path model that the floor-finish
// and ceiling tools already use, so the ortho constraint and the 3-click arc
// gesture are literally the same code, not a fourth transcription of them.
import { BoundaryPathAuthor, type BoundaryDrawMode } from '@pryzm/geometry-slab';
// The surface-independent mode store — NOT a picker instance and NOT `window`
// (P4). See activeSlabDrawMode.ts for why (two panels each build their own picker).
import { resolveActiveSlabDrawMode } from './activeSlabDrawMode';
// §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — the OTHER "mode" axis: WHICH
// GESTURE the user chose. It used to be read off `window.slabTool.toolMode`, i.e.
// across a surface boundary from the 3D tool's transient private state, and any
// unrecognised value — 'NONE' included — collapsed to 'polyline'. See that module's
// header; it is L-699's cure for roof, applied to the axis slab never got one for.
import { resolveActiveSlabFamilyMode } from './activeSlabFamilyMode';
// §FIX-REGION-BOUNDARY-SOURCES — the ONE assembler for "what encloses this point".
// Walls were never the whole answer: the founder's garden is bounded OUTSIDE by the
// PARCEL BOUNDARY and a terrace/podium is bounded by a SLAB EDGE. Adding those inline
// here would be the third instance of the C84 EI-9 defect this issue has already
// produced twice, so a new source is added in that module, once, for every consumer.
import {
    assembleRegionBoundary,
    describeRegionBoundaryCounts,
    type RegionBoundaryCounts,
} from '@pryzm/geometry-slab/region-boundary';

const SLAB_FILL_COLOR   = '#64748b';
const SLAB_EDGE_COLOR   = '#475569';
const SLAB_CLOSE_COLOR  = 'rgba(71,85,105,0.4)';
const SLAB_CROSSHAIR_COLOR = '#475569';
const CROSSHAIR_RADIUS  = 6;   // px — radius of the "dot" at cursor before first click
const CROSSHAIR_TICK    = 10;  // px — length of each tick arm

const REGION_FILL_COLOR   = 'rgba(0,120,212,0.18)';
const REGION_STROKE_COLOR = 'rgba(0,120,212,0.8)';
const REGION_NO_STROKE    = 'rgba(200,80,80,0.6)';

type SlabPlanMode = '2point' | 'polyline' | 'region' | 'hollow' | 'pickWalls';

// ── Lightweight 2D point (world XZ plane) ────────────────────────────────────
interface V2 { x: number; y: number; }

export class SlabPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _slabPoints: WorldPoint[] = [];
    private _cursorPt: WorldPoint | null = null;

    /** Region mode: the detected closed-wall polygon (world XZ), or null. */
    private _candidateRegion: V2[] | null = null;

    /**
     * §REGION-HOST-ATTRIBUTION — the parametric sketch for {@link _candidateRegion},
     * whose edges reference the walls the ring was traced along. Held alongside the
     * ring (rather than re-derived at commit) so the sketch and the polygon are
     * provably the SAME trace — re-tracing at commit could pick a different region if
     * the cursor moved between hover and click.
     */
    private _candidateSketch: SlabSketch | null = null;

    /**
     * §FIX-REGION-CLICK-SELF-SUFFICIENT (L-959) — the last region REFUSAL, shown on
     * the overlay until the user moves somewhere that DOES resolve. Held rather than
     * drawn once, because a toast can be missed and the cursor does not necessarily
     * move after a click: without this the only surviving trace of the refusal is a
     * console line the founder was never going to read mid-gesture.
     */
    private _refusalHint: string | null = null;

    /**
     * §FIX-REGION-BOUNDARY-SOURCES — what the last search actually looked at, so a
     * REFUSAL can name its INPUTS and not merely its conclusion. "13 wall(s) were
     * searched" is exactly what made L-959's successor diagnosable in one round trip;
     * as the edge set widens, the message must widen with it or the next failure is
     * as opaque as the first was.
     */
    private _lastBoundaryCounts: RegionBoundaryCounts | null = null;

    /**
     * §FEAT-SLAB-DRAW-MODES — the shared linear/ortho/curved path state machine.
     * Owns the boundary ONLY while the polyline family is active; the 2-point,
     * region, hollow and pick-walls modes keep their own (unchanged) gestures.
     */
    private readonly _author = new BoundaryPathAuthor();

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        this._candidateSketch = null;
        this._refusalHint = null;
        this._author.reset();
        // §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — PRINT BOTH AXES.
        // This line used to print `drawMode` alone, so the founder's console read
        // `drawMode=linear` and looked like the mode had been set — while the axis
        // that was actually wrong (the GESTURE) went unreported. A diagnostic that
        // names only the axis that is not the problem costs a debugging session.
        console.log(
            '[SlabPlanToolHandler] activated — overlay ready, waiting for first click',
            `gesture=${this._familyMode()}`,
            `constraint=${this._constraintMode()}`,
        );
    }

    deactivate(): void {
        this._clearOverlay();
        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        this._candidateSketch = null;
        this._refusalHint = null;
        this._author.reset();
        this._ctx        = null;
        console.log('[SlabPlanToolHandler] deactivated');
    }

    /**
     * §T-B1 (DAILY-USE-AUDIT 2026-05-20) — opt-in stroke-preservation per the
     * `PlanToolHandler.hasActiveStroke?()` contract. The overlay's mouse-leave
     * path suspends focus instead of deactivating when this returns true, so
     * the user's partial polygon survives a temporary excursion to the toolbar.
     */
    hasActiveStroke(): boolean {
        return this._slabPoints.length > 0 || this._author.isDrawing;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;

        if (this._familyMode() === 'region') {
            this._candidateRegion = this._findRegionAtPoint(pt.worldX, pt.worldZ);
            // Moving somewhere that DOES resolve retires the refusal — a stale
            // "no region here" sitting over a region that is now highlighted would be
            // the same misattribution the refusal exists to end.
            if (this._candidateRegion) this._refusalHint = null;
        }

        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        // ── Region mode: the CLICK resolves its own region ───────────────────
        if (this._familyMode() === 'region') {
            // §FIX-REGION-CLICK-SELF-SUFFICIENT (L-959) — RE-TRACE AT THE CLICK POINT.
            //
            // This used to commit `this._candidateRegion`, which only `onMouseMove`
            // ever set. That made the gesture depend on HOVER STATE SURVIVING UNTIL
            // THE CLICK — and it does not. MEASURED: hover sets the candidate, one
            // activate/deactivate cycle nulls it (`deactivate()` clears it by
            // design), and the click then sees `null` and builds nothing.
            //
            // ⭐ THAT CYCLE IS L-956'S OWN CHURN, ONE LAYER UP.
            // `ToolManager.deactivateAllInternal()` runs at the head of EVERY
            // `activateTool` call, and the plan overlay deactivates + reactivates its
            // handler on each one. L-956 moved the GESTURE into a surface-independent
            // store so it survives that churn; `_candidateRegion` never got the same
            // treatment. **Fixing the mode moved the victim, not the churn.** Any
            // per-instance state a plan handler carries across a hover→click gesture
            // is exposed to it; the mode was merely the first one anyone noticed.
            //
            // WHY RE-TRACE rather than persist the candidate or suppress the churn:
            // a click already knows where it is, so the hover dependency was never
            // earned. Re-tracing is immune to EVERY cause of a lost candidate, not
            // just the one measured here, and it needs no new store and no change to
            // `ToolManager`'s shared deactivation — whose blast radius is every tool.
            // It also makes the ring and the sketch provably one trace AT THE CLICK
            // POINT: before this, a cursor that moved between hover and click
            // committed the region the user was no longer pointing at.
            //
            // COST: one extra trace per click. The hover path already traces on every
            // mousemove, so a trace is demonstrably cheap enough to run at pointer
            // rate; once more on click is nothing.
            const region = this._findRegionAtPoint(pt.worldX, pt.worldZ);
            this._candidateRegion = region;
            this._cursorPt = pt;

            if (region && region.length >= 3) {
                this._slabPoints = region.map(v => ({
                    worldX: v.x,
                    worldZ: v.y,
                    screenX: 0,
                    screenY: 0,
                }));
                this._commitSlab();
            } else {
                this._refuseRegion(pt, region);
            }
            return;
        }

        // ── 2-point rectangle mode ────────────────────────────────────────────
        if (this._familyMode() === '2point') {
            if (this._slabPoints.length === 0) {
                this._slabPoints = [pt];
                this._cursorPt = pt;
                this._drawPreview();
                console.log('[SlabPlanToolHandler] 2-point slab first corner set',
                    `worldX=${pt.worldX.toFixed(3)} worldZ=${pt.worldZ.toFixed(3)}`);
                return;
            }

            if (this._slabPoints.length === 1) {
                const first = this._slabPoints[0];
                this._slabPoints = this._rectangleFromCorners(first, pt);
                this._cursorPt = pt;
                this._drawPreview();
                console.log('[SlabPlanToolHandler] 2-point slab second corner set — committing rectangle');
                this._commitSlab();
                return;
            }
        }

        // ── POLYLINE family (LINEAR / ORTHO / CURVED) ─────────────────────────
        // §FEAT-SLAB-DRAW-MODES — the shared author applies the wall tool's ortho
        // constraint, or runs the wall tool's 3-click arc gesture, and yields the
        // boundary vertices. LINEAR is bit-identical to the old behaviour.
        if (this._familyMode() === 'polyline') {
            const drawMode = this._constraintMode();
            const outcome  = this._author.click(drawMode, { x: pt.worldX, z: pt.worldZ });
            this._syncPointsFromAuthor();
            this._cursorPt = pt;
            this._drawPreview();
            // L-956 — `(mode=linear)` was the line that misled the founder's report:
            // it names the CONSTRAINT while the reader is asking about the GESTURE.
            console.log(
                `[SlabPlanToolHandler] ${outcome} (gesture=polyline constraint=${drawMode})`,
                `worldX=${pt.worldX.toFixed(3)} worldZ=${pt.worldZ.toFixed(3)}`,
                `total: ${this._slabPoints.length}`,
            );
            return;
        }

        // ── Hollow mode (unchanged raw polygon gesture) ───────────────────────
        this._slabPoints.push(pt);
        this._cursorPt = pt;
        this._drawPreview();
        console.log(
            `[SlabPlanToolHandler] point ${this._slabPoints.length} added`,
            `worldX=${pt.worldX.toFixed(3)} worldZ=${pt.worldZ.toFixed(3)}`,
        );
    }

    onDoubleClick(_pt: WorldPoint): void {
        const mode = this._familyMode();
        console.log(`[SlabPlanToolHandler] double-click — mode=${mode} points=${this._slabPoints.length}`);
        if (mode === '2point' || mode === 'region') return;
        // §FEAT-SLAB-DRAW-MODES — a PENDING ARC MIDPOINT blocks closing, so a
        // double-click cannot eat the arc's END click (the same rule the floor and
        // ceiling handlers apply).
        if (mode === 'polyline') {
            if (this._author.canClose()) this._commitSlab();
            return;
        }
        if (this._slabPoints.length >= 3) this._commitSlab();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        const mode = this._familyMode();

        if (mode === '2point' || mode === 'region') {
            if (e.key === 'Backspace' && this._slabPoints.length > 0) {
                this._slabPoints.pop();
                this._drawPreview();
                return true;
            }
            return false;
        }

        if (mode === 'polyline') {
            if (e.key === 'Enter' && this._author.canClose()) {
                e.preventDefault();
                this._commitSlab();
                return true;
            }
            if (e.key === 'Backspace' && this._author.undo()) {
                this._syncPointsFromAuthor();
                this._drawPreview();
                return true;
            }
            return false;
        }

        if (e.key === 'Enter' && this._slabPoints.length >= 3) {
            e.preventDefault();
            this._commitSlab();
            return true;
        }
        if (e.key === 'Backspace' && this._slabPoints.length > 0) {
            this._slabPoints.pop();
            this._drawPreview();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        this._candidateSketch = null;
        this._refusalHint = null;
        this._author.reset();
        this._clearOverlay();
    }

    redraw(): void {
        this._drawPreview();
    }

    // ─── commit ──────────────────────────────────────────────────────────────

    private _commitSlab(): void {
        const c = this._ctx;
        if (!c || this._slabPoints.length < 3) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[SlabPlanToolHandler] ViewDefinition.spatial.levelId missing', c.viewDef.id);
            return;
        }

        const poly = this._slabPoints;
        const minX = poly.reduce((m, p) => Math.min(m, p.worldX), Infinity);
        const maxX = poly.reduce((m, p) => Math.max(m, p.worldX), -Infinity);
        const minZ = poly.reduce((m, p) => Math.min(m, p.worldZ), Infinity);
        const maxZ = poly.reduce((m, p) => Math.max(m, p.worldZ), -Infinity);

        const systemTypeId = window.slabTool?.getSystemTypeId?.();
        const slabType     = systemTypeId
            ? window.slabSystemTypeStore?.getById?.(systemTypeId) // TODO(TASK-08)
            : null;
        const thickness = slabType?.totalThickness ?? 0.25;
        const slabId    = createId('slab');

        // §REGION-HOST-ATTRIBUTION — captured BEFORE the async create resolves, because
        // the reset at the foot of this method clears `_candidateSketch` synchronously.
        const regionSketch = this._familyMode() === 'region' ? this._candidateSketch : null;

        window.runtime?.bus?.executeCommand('slab.create', {
            id:       slabId,
            ifcGuid:  crypto.randomUUID(),
            width:    Math.max(0.01, maxX - minX),
            depth:    Math.max(0.01, maxZ - minZ),
            thickness,
            // §02 §1.2: position must be {0,0,0}. SlabFragmentBuilder adds the polygon
            // centroid to the position for the pivot — passing the centroid here would
            // double-offset every vertex and misplace the slab.
            position: { x: 0, y: 0, z: 0 },
            levelId,
            // §FIX-SLAB-ZERO-AREA (C11 §7.0): the PRYZM3 CreateSlab handler validates
            // the boundary via signedAreaXZ() — area in the X-Z plane. The legacy §FT1
            // bridge / SlabStore, however, read the polygon as {x,y} with y=worldZ.
            // The two consumers disagree on which axis carries the depth coordinate.
            // Supplying worldZ in BOTH y and z satisfies both: x-z area is non-zero
            // (handler passes) and x-y is the legacy plan polygon (3D mesh builds).
            // TODO(C11 §7.4): unify on a single world-Vec3 convention {x,y:0,z} and
            // translate in the §FT1 bridge — tracked as SLAB-BOUNDARY-CONVENTION.
            polygon:  poly.map(p => ({ x: p.worldX, y: p.worldZ, z: p.worldZ })),
        })?.then(() => {
            console.log('[SlabPlanToolHandler] slab created', slabId);

            // §REGION-HOST-ATTRIBUTION — attach the parametric sketch so the slab
            // FOLLOWS the walls that bound it, closing the gap with pick-walls.
            //
            // WHY A SECOND COMMAND rather than a `sketch` field on `slab.create`: the
            // bus `CreateSlabPayload` (`plugins/slab/src/handlers/CreateSlab.ts`) has no
            // sketch field, and that handler is deliberately NOT the authoritative
            // writer here — the §FT1 `slab.created` bridge in `initTools.ts` performs
            // the real `slabStore.add`. `UpdateSlabSketchCommand` is the ONE command
            // documented to mutate `SlabData.sketch` (§01 §2.2), it is undoable
            // (§01 §2.3), and `SlabDependencyTracker` re-registers the wall→slab
            // dependencies from the `bim-slab-updated` event it causes (§03 §3.2).
            // Widening the bus payload instead would mean writing the sketch in
            // `plugins/slab`, which is a separate, larger change.
            if (regionSketch && regionSketch.outerLoop.edges.length >= 3) {
                const res = attachSlabSketchViaLegacyBridge({ slabId, sketch: regionSketch });
                if (res.success) {
                    console.log(
                        `[SlabPlanToolHandler] §REGION-HOST-ATTRIBUTION sketch attached to ${slabId} — `
                        + `slab now follows its host walls.`,
                    );
                } else if (res.error === 'commandManager unavailable') {
                    // Loud, not silent: without this the slab is a coincidental
                    // quadrilateral again, which is exactly the defect being closed.
                    console.warn(
                        '[SlabPlanToolHandler] §REGION-HOST-ATTRIBUTION commandManager '
                        + 'unavailable — region slab created WITHOUT host references. It '
                        + 'will NOT follow its walls.',
                    );
                } else {
                    console.warn(
                        '[SlabPlanToolHandler] §REGION-HOST-ATTRIBUTION UpdateSlabSketchCommand '
                        + `failed for ${slabId}: ${res.error ?? 'unknown'} — slab will NOT follow its walls.`,
                    );
                }
            }

            if (systemTypeId && slabType && Array.isArray(slabType.layers) && slabType.layers.length > 0) {
                // §FIX-SLAB-UPDATE-ID (C11 §7.0): UpdateSlabHandler.canExecute
                // checks `cmd.id` (`plugins/slab/src/handlers/UpdateSlab.ts:37`).
                // The tool previously sent `slabId` → `cmd.id` undefined → every
                // post-create layer update was rejected "slab id is required".
                window.runtime?.bus?.executeCommand('slab.update', {
                    id: slabId,
                    systemTypeId,
                    layers:    structuredClone(slabType.layers),
                    thickness: slabType.totalThickness,
                })?.catch((e: unknown) => console.error('[SlabPlanToolHandler] slab.update (layers) failed:', e));
            }
        })?.catch((e: unknown) => console.error('[SlabPlanToolHandler] slab.create failed:', e));

        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        this._candidateSketch = null;
        this._refusalHint = null;
        this._author.reset();
        this._clearOverlay();
    }

    /**
     * §FIX-REGION-CLICK-SELF-SUFFICIENT (L-959) — A REFUSAL IS A CORRECT ANSWER.
     *
     * The founder clicked repeatedly on a region the tool had already traced and got
     * **no slab, no error and no reason.** The old else-arm wrote one `console.log`
     * and stopped, and that line said *"no closed wall region detected at cursor"* —
     * which was not merely quiet, it was WRONG: a region HAD been detected on hover
     * and then wiped. A diagnostic that misattributes the cause sends the reader to
     * look for the wrong problem, which is worse than saying nothing.
     *
     * The rule this follows is `WallRake.ts`'s: a refusal is a correct answer, and it
     * must carry the MEASUREMENT that produced it, never a bare "failed". So the two
     * distinguishable ways a region click can fail get two different answers:
     *
     *   • NO loop encloses the point       — the walls here do not close.
     *   • A loop closes but is DEGENERATE  — fewer than 3 distinct vertices.
     *
     * Surfaced on the shared `pryzm:toast` channel, which is precisely what
     * `StairPathPlanToolHandler` was given for the identical defect ("No stair, no
     * toast, no error — the tool just silently did nothing").
     */
    private _refuseRegion(pt: WorldPoint, region: V2[] | null): void {
        const at = `(${pt.worldX.toFixed(2)}, ${pt.worldZ.toFixed(2)})`;
        // §FIX-REGION-BOUNDARY-SOURCES — name EVERY source searched, not just walls.
        // The previous text said "13 wall(s) were searched", which was true and was
        // precisely what revealed that slabs and the parcel boundary were not in the
        // search at all. A refusal that names its inputs is worth more than one that
        // names its conclusion — so this list grows whenever the edge set does.
        const searched = this._lastBoundaryCounts
            ? describeRegionBoundaryCounts(this._lastBoundaryCounts)
            : 'nothing (the boundary search did not run)';

        const message = region === null
            ? `No enclosed region at this point. The boundaries around ${at} do not `
              + `close a loop — searched ${searched}. Check for gaps at wall junctions, `
              + `or draw the boundary by hand with Polyline.`
            : `The region at ${at} is degenerate — it closed with ${region.length} `
              + `distinct point(s), and a slab needs 3. Check for duplicate or `
              + `zero-length walls at that junction.`;

        console.warn(`[SlabPlanToolHandler] §FIX-REGION-CLICK-SELF-SUFFICIENT region click REFUSED — ${message}`);
        // F.events.15 — the shared toast channel the stair handlers already use.
        window.runtime?.events?.emit('pryzm:toast', { message, severity: 'warning' });

        // …and say it on the overlay too, where the user's eyes already are.
        this._refusalHint = message;
        this._drawPreview();
    }

    // ─── region detection (shared curve-aware tracer) ────────────────────────

    /**
     * Find the minimal closed wall loop containing the point (worldX, worldZ).
     * Returns the loop vertices as V2[] (XZ world coords), or null if none found.
     *
     * §SLAB-REGION-CURVED — delegates to @pryzm/geometry-slab's shared tracer,
     * which tessellates curved/filleted walls (curve.control) into Bézier chords
     * so an arc boundary closes and the region polygon follows the curve. The old
     * inline tracer read each wall as a single straight baseLine chord and dropped
     * the curve, so curved-wall regions never closed.
     */
    /**
     * Gather every boundary source the editor has loaded and hand them to the ONE
     * assembler. This is the only place the stores are read; the assembler is the only
     * place they are turned into edges.
     */
    private _boundaryEdgeSet() {
        const rt = window.runtime as
            | { siteModelStore?: { getParcelBoundary?: () => { polygon?: { x: number; z: number }[] } | null } }
            | undefined;
        let parcelBoundary: { x: number; z: number }[] | null = null;
        try {
            parcelBoundary = rt?.siteModelStore?.getParcelBoundary?.()?.polygon ?? null;
        } catch {
            // A boundary that cannot be read is ABSENT, and the refusal says ABSENT
            // rather than silently searching a smaller world (§CONTEXT-DATA-HONESTY).
            parcelBoundary = null;
        }
        return assembleRegionBoundary({
            // §REGION-LEVEL-SCOPE (L-1192) — the storey this PLAN VIEW shows, which is
            // the storey the slab will be created on (`_commitSlab` reads the same
            // field). Reading it from the ViewDefinition rather than from a global
            // active-level is what makes the search and the commit provably the same
            // storey — the C84 EI-9 property this gesture has now lost three times.
            // `undefined` here disables scoping rather than guessing a level; the
            // refusal then says so out loud.
            activeLevelId: this._ctx?.viewDef.spatial?.levelId ?? null,
            walls: (window.wallStore?.getAll?.() ?? []) as never, // TODO(TASK-08)
            slabs: (window.slabStore?.getAll?.() ?? []) as never, // TODO(TASK-08)
            // §FEAT-REGION-CURTAIN-WALL (L-1125) — a curtain wall encloses space, so it
            // bounds a region. Without this source the tracer walked a graph with a HOLE
            // where the glazing stood and refused a region the user can plainly see.
            curtainWalls: (
                (window as unknown as { curtainWallStore?: { getAll?: () => unknown[] } })
                    .curtainWallStore?.getAll?.() ?? []
            ) as never, // TODO(TASK-08)
            parcelBoundary,
        });
    }

    private _findRegionAtPoint(wx: number, wz: number): V2[] | null {
        // §FIX-REGION-BOUNDARY-SOURCES — ONE edge set, assembled ONCE, for BOTH the
        // hover preview and the click commit. Both already call this function, so
        // widening it here is what makes them provably the same search — the C84 EI-9
        // property L-956 (gesture) and L-959 (region) each lost in turn.
        const { segments, counts } = this._boundaryEdgeSet();
        this._lastBoundaryCounts = counts;
        const walls = segments as ReadonlyArray<{
            // §REGION-HOST-ATTRIBUTION — the wall id was ALWAYS on these records; only
            // this local type omitted it, so the tracer could not carry it to the
            // sketch and the region slab silently failed to follow its walls.
            id?: string;
            baseLine?: ReadonlyArray<{ x: number; z: number }> | null;
            // §FIX-REGION-RING-PRETRIM-FRAME — the wall records ALWAYS carried this;
            // only the types omitted it, which is why the tracer traced the wrong arc.
            _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> | null;
            curve?: { control?: { x: number; z: number } | null; segments?: number } | null;
        }>; // TODO(TASK-08)

        // §REGION-HOST-ATTRIBUTION — ONE trace produces BOTH the ring and the sketch,
        // so the polygon committed and the host references attached are provably the
        // same region. `traceRegionSketchAtPoint` performs the identical walk as
        // `traceRegionAtPoint`; the ring geometry is unchanged.
        const traced = traceRegionSketchAtPoint(walls, wx, wz);
        if (traced) {
            this._candidateSketch = traced.sketch;
            const a = traced.attribution;
            if (a.freeEdges > 0) {
                // A fallback is a MEASUREMENT, not a gap (§CONTEXT-DATA-HONESTY):
                // say how many edges will NOT follow their wall, and why.
                console.log(
                    `[SlabPlanToolHandler] §REGION-HOST-ATTRIBUTION region traced: `
                    + `${a.hostEdges} host-referenced edge(s) across ${a.hostWallIds.length} wall(s), `
                    + `${a.freeEdges} free edge(s) `
                    + `(curved=${a.curvedFallbacks}, no-wall-id=${a.missingIdFallbacks}, `
                    + `ambiguous=${a.ambiguousFallbacks}). Free edges do NOT follow a wall.`,
                    // L-959 cost a round trip because this line named neither WHERE it
                    // traced nor WHAT it searched, so a hover success and a click
                    // refusal could not be compared. Both now print both.
                    `at=(${wx.toFixed(2)}, ${wz.toFixed(2)})`,
                    `searched=[${describeRegionBoundaryCounts(counts)}]`,
                );
            }
            return traced.ring.length >= 3 ? traced.ring : null;
        }
        this._candidateSketch = null;

        // Region genuinely absent — keep the original call as the single answer path
        // so "no region" stays exactly the answer it always was.
        const ring = traceRegionAtPoint(walls, wx, wz);
        return ring && ring.length >= 3 ? ring : null;
    }

    // ─── drawing ─────────────────────────────────────────────────────────────

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const mode = this._familyMode();

        // ── Region mode: draw detected region fill + cursor ───────────────────
        if (mode === 'region') {
            this._drawRegionPreview(ctx, planCanvas, cssW, cssH);
            return;
        }

        if (!this._cursorPt && this._slabPoints.length === 0) return;

        ctx.save();

        const previewPoints = this._getPreviewPoints();
        const screenPts = previewPoints.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));
        const committedScreenPts = this._slabPoints.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));
        const curSc     = this._cursorPt
            ? planCanvas.worldToScreen(this._cursorPt.worldX, this._cursorPt.worldZ)
            : null;
        // §FEAT-SLAB-DRAW-MODES — the trailing run: one point (linear), the
        // ortho-constrained point, or the whole tessellated arc.
        const trailSc = mode === '2point'
            ? []
            : this._trailingPoints().map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));

        // ── 1. Translucent polygon fill (3+ points) ───────────────────────
        if (screenPts.length >= 3) {
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = SLAB_FILL_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            for (const p of trailSc) ctx.lineTo(p.sx, p.sy);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // ── 2. Polygon edge (placed points) ──────────────────────────────
        if (screenPts.length >= 2) {
            ctx.setLineDash([6, 3]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = SLAB_EDGE_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 3. Rubber-band run: last point → (ortho point | arc | cursor) ──
        if (trailSc.length > 0 && committedScreenPts.length >= 1) {
            const last = committedScreenPts[committedScreenPts.length - 1];
            ctx.setLineDash([5, 4]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = SLAB_EDGE_COLOR;
            ctx.beginPath();
            ctx.moveTo(last.sx, last.sy);
            for (const p of trailSc) ctx.lineTo(p.sx, p.sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 4. Closing-edge ghost (trail end → first point, 3+ points) ────
        if (trailSc.length > 0 && screenPts.length >= 3) {
            const tail = trailSc[trailSc.length - 1];
            ctx.setLineDash([3, 3]);
            ctx.lineWidth   = 1;
            ctx.strokeStyle = SLAB_CLOSE_COLOR;
            ctx.beginPath();
            ctx.moveTo(tail.sx, tail.sy);
            ctx.lineTo(screenPts[0].sx, screenPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 5. Placed-point dots ─────────────────────────────────────────
        ctx.fillStyle = SLAB_EDGE_COLOR;
        for (const p of committedScreenPts) {
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── 5b. Pending arc-midpoint marker (CURVED mode) ────────────────
        const arcMid = this._author.pendingArcMidpoint;
        if (mode === 'polyline' && arcMid) {
            const m = planCanvas.worldToScreen(arcMid.x, arcMid.z);
            ctx.fillStyle = SLAB_EDGE_COLOR;
            ctx.beginPath();
            ctx.arc(m.sx, m.sy, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── 6. Cursor crosshair ──────────────────────────────────────────
        if (curSc) this._drawCrosshair(ctx, curSc.sx, curSc.sy, screenPts.length >= 2);

        // ── 7. Hint text ──────────────────────────────────────────────────
        this._drawHint(ctx, this._hintText(mode, committedScreenPts.length, arcMid !== null), cssW, cssH);
        ctx.restore();
    }

    /** Draw the region-mode overlay: detected region fill + cursor crosshair + hint. */
    private _drawRegionPreview(
        ctx: CanvasRenderingContext2D,
        planCanvas: PlanToolDrawContext['planCanvas'],
        cssW: number,
        cssH: number,
    ): void {
        ctx.save();

        const hasRegion = this._candidateRegion && this._candidateRegion.length >= 3;

        // ── Region polygon ────────────────────────────────────────────────────
        if (hasRegion && this._candidateRegion) {
            const screenPts = this._candidateRegion.map(v =>
                planCanvas.worldToScreen(v.x, v.y),
            );

            // Fill
            ctx.fillStyle = REGION_FILL_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            ctx.closePath();
            ctx.fill();

            // Stroke
            ctx.strokeStyle = REGION_STROKE_COLOR;
            ctx.lineWidth   = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            ctx.closePath();
            ctx.stroke();
        }

        // ── Cursor crosshair ──────────────────────────────────────────────────
        if (this._cursorPt) {
            const { sx, sy } = planCanvas.worldToScreen(this._cursorPt.worldX, this._cursorPt.worldZ);
            const color = hasRegion ? REGION_STROKE_COLOR : REGION_NO_STROKE;
            ctx.strokeStyle = color;
            ctx.fillStyle   = color;
            ctx.lineWidth   = 1.5;

            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(sx, sy, CROSSHAIR_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.moveTo(sx - CROSSHAIR_TICK, sy); ctx.lineTo(sx - CROSSHAIR_RADIUS - 1, sy);
            ctx.moveTo(sx + CROSSHAIR_RADIUS + 1, sy); ctx.lineTo(sx + CROSSHAIR_TICK, sy);
            ctx.moveTo(sx, sy - CROSSHAIR_TICK); ctx.lineTo(sx, sy - CROSSHAIR_RADIUS - 1);
            ctx.moveTo(sx, sy + CROSSHAIR_RADIUS + 1); ctx.lineTo(sx, sy + CROSSHAIR_TICK);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Hint text ─────────────────────────────────────────────────────────
        // §FIX-REGION-CLICK-SELF-SUFFICIENT (L-959) — a refusal outranks the generic
        // prompt. "Move cursor inside a closed wall region" told the founder to do
        // the thing he had just done.
        const hint = this._refusalHint
            ? this._refusalHint
            : hasRegion
                ? 'Click to create slab from detected region'
                : 'Move cursor inside a closed wall region';
        this._drawHint(ctx, hint, cssW, cssH);

        ctx.restore();
    }

    private _drawCrosshair(
        ctx: CanvasRenderingContext2D,
        sx: number,
        sy: number,
        filledDot: boolean,
    ): void {
        ctx.strokeStyle = SLAB_CROSSHAIR_COLOR;
        ctx.lineWidth   = 1.5;

        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, CROSSHAIR_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(sx - CROSSHAIR_TICK, sy);
        ctx.lineTo(sx - CROSSHAIR_RADIUS - 1, sy);
        ctx.moveTo(sx + CROSSHAIR_RADIUS + 1, sy);
        ctx.lineTo(sx + CROSSHAIR_TICK, sy);
        ctx.moveTo(sx, sy - CROSSHAIR_TICK);
        ctx.lineTo(sx, sy - CROSSHAIR_RADIUS - 1);
        ctx.moveTo(sx, sy + CROSSHAIR_RADIUS + 1);
        ctx.lineTo(sx, sy + CROSSHAIR_TICK);
        ctx.stroke();

        if (filledDot) {
            ctx.fillStyle = SLAB_EDGE_COLOR;
            ctx.beginPath();
            ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private _drawHint(
        ctx: CanvasRenderingContext2D,
        hint: string,
        _cssW: number,
        cssH: number,
    ): void {
        ctx.font         = 'bold 11px system-ui, sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';

        const metrics  = ctx.measureText(hint);
        const padX = 6, padY = 4;
        const tx = 12, ty = cssH - 12;

        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = '#ffffff';
        ctx.fillRect(tx - padX, ty - metrics.actualBoundingBoxAscent - padY, metrics.width + padX * 2, metrics.actualBoundingBoxAscent + padY * 2);
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.fillText(hint, tx, ty);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }

    /**
     * §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — WHICH GESTURE is running.
     *
     * ⚠ THIS IS NOT `_constraintMode()`, AND CONFLATING THE TWO IS L-956 ITSELF.
     * This axis is the GESTURE (2-point / polyline / region / hollow / pick-walls);
     * `_constraintMode()` is how a polyline click LANDS (linear / ortho / curved).
     * They are orthogonal, they were both called "mode", and the activation log
     * printed only the second — so the founder's console read `drawMode=linear` and
     * looked like the gesture had been set when it had not.
     *
     * This used to read `window.slabTool?.toolMode` — the 3D tool INSTANCE's
     * transient private state — and map everything it did not recognise, including
     * `'NONE'` and `undefined`, onto `'polyline'`. `'NONE'` is the state
     * `ToolManager.deactivateAllInternal()` drives `SlabTool` into at the head of
     * EVERY `activateTool` call, and `exitSketchMode()` leaves `#sketch-hud` on
     * screen, so the HUD went on prompting "By Region Slab: Click an enclosed
     * region" while this handler had silently become a polyline tool.
     *
     * The gesture is now read from the surface-independent store recorded at
     * activation, exactly as L-699 cured the identical defect for roof. Neither
     * surface is authoritative over the other and neither can silently narrow it.
     */
    private _familyMode(): SlabPlanMode {
        return resolveActiveSlabFamilyMode();
    }

    /**
     * §FEAT-SLAB-DRAW-MODES — the polyline CONSTRAINT, read fresh on every
     * interaction (the `WallModePicker.getActiveMode()` contract), so the user can
     * switch mid-draw without re-activating the tool.
     *
     * Defaults to LINEAR when the user never opened the picker — a slab activated
     * from the flat create-panel list therefore behaves exactly as it did before
     * this change, rather than silently acquiring a constraint nobody chose.
     */
    private _constraintMode(): BoundaryDrawMode {
        return resolveActiveSlabDrawMode();
    }

    /** Mirror the shared author's vertices into the commit/preview point list. */
    private _syncPointsFromAuthor(): void {
        this._slabPoints = this._author.points.map(v => ({
            worldX: v.x, worldZ: v.z, screenX: 0, screenY: 0,
        })) as WorldPoint[];
    }

    private _getPreviewPoints(): WorldPoint[] {
        if (this._familyMode() === '2point' && this._slabPoints.length === 1 && this._cursorPt) {
            return this._rectangleFromCorners(this._slabPoints[0], this._cursorPt);
        }
        return this._slabPoints;
    }

    /**
     * §FEAT-SLAB-DRAW-MODES — the vertices between the last committed point and
     * the cursor. LINEAR gives the cursor; ORTHO gives the 90°-constrained point
     * the click would actually commit (so the ghost never lies about where the
     * segment lands); CURVED with a pending midpoint gives the tessellated arc.
     */
    private _trailingPoints(): WorldPoint[] {
        if (!this._cursorPt) return [];
        if (this._familyMode() !== 'polyline') return [this._cursorPt];
        return this._author
            .previewTail(this._constraintMode(), { x: this._cursorPt.worldX, z: this._cursorPt.worldZ })
            .map(v => ({ worldX: v.x, worldZ: v.z, screenX: 0, screenY: 0 })) as WorldPoint[];
    }

    /**
     * §FEAT-SLAB-DRAW-MODES — the overlay hint. The polyline family now NAMES the
     * active constraint, so the founder's screenshot ("Polyline Slab: Points: 2")
     * can no longer be the whole story the UI tells about the mode it is in.
     */
    private _hintText(mode: SlabPlanMode, placed: number, arcPending: boolean): string {
        if (mode === '2point') {
            return placed === 0
                ? 'Click first slab corner'
                : 'Click opposite corner to create slab  ·  Backspace to restart';
        }
        if (mode === 'polyline') {
            const drawMode = this._constraintMode();
            if (drawMode === 'curved' && placed > 0) {
                return arcPending
                    ? 'Curved · Click the arc END point  ·  Backspace to re-pick the midpoint'
                    : `Curved · Click the arc MIDPOINT${placed >= 3 ? '  ·  Enter to close slab' : ''}`;
            }
            const label = drawMode === 'ortho' ? 'Orthogonal' : drawMode === 'curved' ? 'Curved' : 'Linear';
            if (placed === 0) return `${label} · Click to start slab polygon`;
            if (placed < 3)   return `${label} · ${3 - placed} more point${3 - placed !== 1 ? 's' : ''} needed`;
            return `${label} · Dbl-click or Enter to close slab  ·  Backspace to undo`;
        }
        if (placed === 0) return 'Click to start slab polygon';
        if (placed < 3)   return `${3 - placed} more point${3 - placed !== 1 ? 's' : ''} needed`;
        return 'Dbl-click or Enter to close slab  ·  Backspace to undo';
    }

    private _rectangleFromCorners(a: WorldPoint, b: WorldPoint): WorldPoint[] {
        return [
            a,
            { ...a, worldX: b.worldX },
            b,
            { ...a, worldZ: b.worldZ },
        ];
    }
}
