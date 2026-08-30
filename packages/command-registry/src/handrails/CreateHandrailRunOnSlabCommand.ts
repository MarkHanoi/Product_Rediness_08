/**
 * CreateHandrailRunOnSlabCommand — §FIX-HANDRAIL-BY-SLAB (L-1103, C95 §15.4).
 *
 * ─── THE FOUNDER'S REPORT, AND WHAT WAS ACTUALLY WRONG ──────────────────────
 * *"Handrail BY SLAB doesn't work. The same happened with curtain walls. Walls
 * work correctly."*
 *
 * The railing's By Slab was a CANVAS GESTURE: `RailingPlanToolHandler.onClick`
 * saw `mode === 'byslab'` and asked `readSelectedSlabOutline()`, which reads
 * `window.selectionManager.selectedObject` AT CLICK TIME.
 *
 * ⛔ THAT GATE CAN NEVER BE TRUE. `ToolManager.activateTool()` runs
 * `this.selectionManager.setEnabled(false)` as part of activating ANY tool
 * (`packages/input-host/src/ToolManager.ts:550`), which clears the selection.
 * So by the time the railing tool is active and the user can click, there is no
 * selected slab — and there is no way to acquire one, because the active tool
 * consumes the clicks that would select it. Every By Slab attempt hit the
 * `no slab is selected` refusal, including the ones where the user HAD selected
 * the slab first. This is the [[unsatisfiable-gate]] shape: the useful question
 * is not *"why does it refuse?"* but *"can this condition ever hold?"* — and the
 * answer was no, for every user, always.
 *
 * ─── WHY A COMMAND ON A `slabId`, AND NOT A BETTER GESTURE ──────────────────
 * The founder named the reference: **the wall works.** So this mirrors what the
 * wall actually does rather than inventing a third shape. Wall's By Slab is NOT a
 * canvas gesture either — `ToolsAreaLayout._execWallBySlab` dispatches
 * `wall.create-on-all-slabs` with a `{ slabId }` payload, sourced from a snapshot
 * taken BEFORE activation (`_bySlabCapture`) or from an explicit pick-a-slab
 * mode that re-enables selection. The click never enters it.
 *
 * A `slabId`-taking command has three properties the gesture form cannot have:
 *   1. it is independent of `selectionManager` state, so it cannot regress into
 *      the unsatisfiable gate above;
 *   2. it works from EITHER surface — the 3-D `HandrailTool` has no mode
 *      awareness at all, so By Slab was not merely broken in 3-D, it was absent
 *      (C84 EI-3: the bar OFFERED four modes 3-D never accepted);
 *   3. it is exactly the entry point R8 needs — *"create a railing on the edge of
 *      this slab"* from chat resolves a slab id, not a pair of screen clicks.
 *
 * ─── IT DOES NOT WRITE THE STORE ITSELF ─────────────────────────────────────
 * The whole body delegates to `CreateHandrailRunCommand`, which delegates to
 * `CreateHandrailCommand`. There is still exactly ONE handrail creation authority
 * (C84 EI-1/EI-9): a by-slab guard's records are byte-identical to a hand-drawn
 * one's, take the same semantic edges, and undo through the same path.
 *
 * ─── THE RUN IS BUILT ONCE, AND REUSED ON REDO ──────────────────────────────
 * Segment ids are minted on the FIRST `execute` and the built run is cached, so a
 * redo recreates the SAME ids rather than minting new ones — the id-pool rule
 * `CreateCurtainWallsFromSlabCommand` states at its §2.6 / #4. Without it, undo
 * then redo would leave the history referring to ids that no longer exist.
 *
 * ─── HOSTING ────────────────────────────────────────────────────────────────
 * Every record carries `hostId = slabId` and `hostKind = 'slab'` (C95 §15.1), so
 * the model can answer *"which railings guard this slab?"* — the question the
 * stair half of that field was added for. It is the same field, so no new
 * vocabulary is minted (C84 EI-8).
 *
 * CONTRACTS: C11 (creation pipeline) · C16 §8.6 (one gesture = one undo entry) +
 * CA-18 (refuse by name) · C03 §4.6 U-2 (`affectedStores`) · C84 EI-1/EI-3/EI-9 ·
 * C95 §15.1/§15.4.
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
import { CreateHandrailRunCommand, type HandrailRunSegmentSpec } from './CreateHandrailRunCommand';

// P8 / C10 §2 — same tracer idiom as `DeleteElementsBatchCommand.ts` /
// `moveReweldPreflight.ts` in this package (C84 EI-9: one tracer authority per
// package, never a second wrapper).
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/**
 * The geometric + visual fields a by-slab run carries, resolved by the CALLER
 * from the armed railing type.
 *
 * ⛔ NO `systemTypeId` / `typeId`, for the reason `CreateHandrailRunCommand`
 * states verbatim: `HandrailData` carries no type reference, a railing type is
 * MATERIALISED into the record. A reference field here would be a second, rival
 * answer to "what type is this railing?" that nothing reads (C84 EI-9).
 */
export interface CreateHandrailRunOnSlabData {
    /** The slab whose boundary becomes the guard. */
    readonly slabId: string;
    readonly height: number;
    readonly thickness: number;
    /**
     * Optional override. Absent ⇒ the SLAB's own level, which is the right default
     * and the only one that cannot put a guard on a different storey from the
     * thing it guards.
     */
    readonly levelId?: string;
    readonly baseOffset?: number;
    readonly fillType?: string;
    readonly railProfile?: string;
    readonly railDiameter?: number;
    readonly postSpacing?: number;
    readonly balusterShape?: 'rectangular' | 'round';
    readonly balusterWidth?: number;
    readonly balusterSpacing?: number;
    readonly infillMaxGap?: number;
    readonly materialColor?: string;
    readonly materialId?: string;
    /** Human label for logs / history. */
    readonly label?: string;
}

/** The shape this command needs from a slab record — nothing more. */
interface SlabBoundaryRecord {
    readonly polygon?: ReadonlyArray<{ x: number; y: number }>;
    readonly position?: { x: number; y: number; z: number };
    readonly levelId?: string;
}

/** The minimum edge a run segment may have, mirroring `handrailRunGenerators`. */
const MIN_SEGMENT_M = 0.1;

/**
 * The slab's boundary in WORLD X/Z.
 *
 * ⚠ `polygon` is stored in the slab's LOCAL frame as `{x, y}` — a 2-D outline
 * where `y` is the plan-Z axis — and `position` is its world origin. Curtain
 * wall's from-slab command does the identical `p.x + pos.x` / `p.y + pos.z`
 * lift; getting it wrong puts the guard at the world origin instead of on the
 * slab, which is a silent, plausible-looking wrong answer.
 */
export function slabWorldRing(slab: SlabBoundaryRecord | undefined): Array<{ x: number; z: number }> | null {
    const polygon = slab?.polygon;
    if (!polygon || polygon.length < 3) return null;
    const origin = slab?.position ?? { x: 0, y: 0, z: 0 };
    return polygon.map((p) => ({ x: p.x + origin.x, z: p.y + origin.z }));
}

/**
 * The ring → closed-loop segments, with each vertex posted exactly ONCE.
 *
 * ⛔ DELIBERATELY NOT AN IMPORT OF `@pryzm/geometry-handrail`'s
 * `slabOutlineSegments`. That function returns `HandrailRunSegment` objects that
 * carry geometry types this package does not otherwise need, and the join rule it
 * encodes is four lines long. What matters is that the RULE is the same one, and
 * it is asserted against the geometry package by
 * `__tests__/HandrailBySlab.test.ts` rather than assumed — a comment is not a
 * synchronisation mechanism (C84 §8.d).
 *
 * The rule (C95 §D4): a closed loop of N vertices yields N segments; segment 0
 * suppresses its start post because the LAST segment's end post already stands on
 * that vertex, and every later segment suppresses its start post because its
 * predecessor's end post stands there. One post per vertex, no coincident pairs.
 */
export function closedRingSegments(
    ring: ReadonlyArray<{ x: number; z: number }>,
    mintId: (i: number) => string,
): HandrailRunSegmentSpec[] {
    // A ring that repeats its first point as its last would mint a zero-length
    // closing edge; drop the duplicate rather than emit a degenerate segment.
    let pts = ring;
    if (pts.length >= 2) {
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-9) pts = pts.slice(0, -1);
    }
    if (pts.length < 3) return [];

    const out: HandrailRunSegmentSpec[] = [];
    for (let i = 0; i < pts.length; i++) {
        const start = pts[i]!;
        const end = pts[(i + 1) % pts.length]!;
        if (Math.hypot(end.x - start.x, end.z - start.z) < MIN_SEGMENT_M) continue;
        out.push({
            id: mintId(out.length),
            start: { x: start.x, z: start.z },
            end: { x: end.x, z: end.z },
            // EVERY segment of a CLOSED loop suppresses its start post — including
            // the first, whose vertex is posted by the last segment's end post.
            suppressStartPost: true,
        });
    }
    return out;
}

export class CreateHandrailRunOnSlabCommand implements Command {
    readonly affectedStores = ['handrail', 'level'] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_HANDRAIL_RUN_ON_SLAB;
    timestamp = Date.now();
    targetIds: string[] = [];

    /**
     * The delegate, built on first `execute` and REUSED thereafter so redo
     * recreates the same element ids (§2.6 / #4).
     */
    private _run: CreateHandrailRunCommand | null = null;

    constructor(private readonly data: CreateHandrailRunOnSlabData) {}

    /** Diagnostic seam: how many segments the slab's boundary would produce. */
    segmentCountFor(ctx: CommandContext): number {
        const built = this._buildSegments(ctx, () => 'probe');
        return built?.length ?? 0;
    }

    private _slab(ctx: CommandContext): SlabBoundaryRecord | undefined {
        const store = (ctx.stores as { slabStore?: { getById?: (id: string) => unknown } } | undefined)?.slabStore;
        return store?.getById?.(this.data.slabId) as SlabBoundaryRecord | undefined;
    }

    private _buildSegments(ctx: CommandContext, mintId: (i: number) => string): HandrailRunSegmentSpec[] | null {
        const ring = slabWorldRing(this._slab(ctx));
        if (!ring) return null;
        return closedRingSegments(ring, mintId);
    }

    /**
     * ⚠ EVERY refusal below NAMES the mechanism and the live alternative (C16
     * CA-18). A By Slab that returns silently is what the founder experienced —
     * a console warning the user never sees is not a refusal, it is a no-op.
     */
    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!this.data.slabId) {
            return {
                ok: false,
                reason:
                    'Handrail BY SLAB refused — no slab was named. Select a slab before ' +
                    'activating the railing tool, or pick one when prompted.',
            };
        }
        const slab = this._slab(ctx);
        if (!slab) {
            return {
                ok: false,
                reason:
                    `Handrail BY SLAB refused — no slab '${this.data.slabId}' exists in the slab store. ` +
                    'Draw a slab first, or guard the edge by hand with Linear / Orthogonal.',
            };
        }
        if (!slab.polygon || slab.polygon.length < 3) {
            return {
                ok: false,
                reason:
                    `Handrail BY SLAB refused — slab '${this.data.slabId}' has no boundary polygon of at ` +
                    'least 3 points, so it has no edge to guard.',
            };
        }
        const levelId = this.data.levelId ?? slab.levelId;
        if (!levelId) {
            return {
                ok: false,
                reason:
                    `Handrail BY SLAB refused — slab '${this.data.slabId}' is on no level, so the guard has ` +
                    'no elevation to sit at. A railing is never placed at an assumed Y.',
            };
        }
        const segments = this._buildSegments(ctx, (i) => `probe-${i}`);
        if (!segments || segments.length === 0) {
            return {
                ok: false,
                reason:
                    `Handrail BY SLAB refused — slab '${this.data.slabId}' produced no edge of at least ` +
                    `${MIN_SEGMENT_M} m. Nothing was created.`,
            };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.handrail.createRunOnSlab', (span) => {
            try {
                span.setAttribute('pryzm.handrail.slabId', this.data.slabId);
                const r = this._execute(ctx);
                // A BY-SLAB run that produced no segments refuses with a reason
                // (see the `success: false` arm below) — so `success` and the
                // segment count are both emitted: an empty ring and a missing
                // level are two different failures wearing the same result.
                span.setAttribute('pryzm.handrail.success', r.success);
                span.setAttribute('pryzm.handrail.elements', r.affectedElementIds.length);
                return r;
            } finally {
                span.end();
            }
        });
    }

    private _execute(ctx: CommandContext): CommandResult {
        if (!this._run) {
            const slab = this._slab(ctx);
            const levelId = this.data.levelId ?? slab?.levelId;
            const segments = this._buildSegments(ctx, () => crypto.randomUUID());
            if (!segments || segments.length === 0 || !levelId) {
                return {
                    success: false,
                    affectedElementIds: [],
                    info: [this.canExecute(ctx).reason ?? 'Handrail BY SLAB refused.'],
                };
            }
            this._run = new CreateHandrailRunCommand({
                segments,
                height: this.data.height,
                thickness: this.data.thickness,
                levelId,
                baseOffset: this.data.baseOffset,
                fillType: this.data.fillType,
                railProfile: this.data.railProfile,
                railDiameter: this.data.railDiameter,
                postSpacing: this.data.postSpacing,
                balusterShape: this.data.balusterShape,
                balusterWidth: this.data.balusterWidth,
                balusterSpacing: this.data.balusterSpacing,
                infillMaxGap: this.data.infillMaxGap,
                materialColor: this.data.materialColor,
                materialId: this.data.materialId,
                // C95 §15.1 — the guard is HOSTED BY the slab it guards.
                hostId: this.data.slabId,
                hostKind: 'slab',
                label: this.data.label ?? 'Handrail by slab',
            });
        }
        const res = this._run.execute(ctx);
        this.targetIds = [...res.affectedElementIds];
        return res;
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this._run) return { success: true, affectedElementIds: [] };
        return this._run.undo(ctx);
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.data as unknown as Record<string, unknown>,
        };
    }
}
