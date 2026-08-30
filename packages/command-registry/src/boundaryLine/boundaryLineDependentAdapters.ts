// boundaryLineDependentAdapters — HOW each dependent family is actually carried.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7920) · C106 §3.4 · C84 §EI-PROP.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE TABLE SAYS **WHETHER**; THIS FILE SAYS **HOW**. THEY ARE CHECKED AGAINST
//    EACH OTHER, AND THAT IS THE POINT.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `BOUNDARY_LINE_FAMILY_RULES` (`@pryzm/geometry-boundary-line`) is a pure verdict
// table: it can say a family PROPAGATES without anything existing that can move it.
// C84 EI-PROP is explicit that such a row is WORSE than a SILENT one — *"wiring a
// family whose builder cannot consult the datum would produce a PROPAGATES row that
// propagates nothing — a false verdict on the ledger"*.
//
// So every PROPAGATES row must have an adapter here, and
// `boundaryLineAdapterCoverage.test.ts` fails in BOTH directions: a verdict with no
// adapter, and an adapter for a family the table does not carry. A cell cannot be
// claimed and unexecutable, and it cannot be executable and unclaimed.
//
// ─── WHY LEGACY COMMANDS AND NOT BUS VERBS ─────────────────────────────────────
// Because the bus verbs do not all reach the AUTHORITATIVE store, and one of them
// says so itself. `plugins/wall/src/handlers/MoveWall.ts` REFUSES `wall.move`:
//
//   > "wall.move writes the detached plugin wall store that nothing renders, exports
//   >  or persists, and no production surface dispatches it."
//
// `elementMove.ts` had to mint DISTINCT verb names (`slab.movePolygon`,
// `handrail.moveBaseLine`) so plugin handlers could not shadow the ones that do reach
// it — and each of those bridges to a legacy command. Dispatching the legacy commands
// directly skips a hop that exists only to work around a name collision, and it is
// what makes STRUCTURAL_CASCADE composition possible: the children must be `Command`
// instances for `CommandManagerImpl` to fold them into ONE history entry (C81).
//
// ⭐ CORRECTED §LIGHT121 (L-11900) — this paragraph used to read "IT ALSO REACHES
// ONE FAMILY THE BUS CANNOT. `lighting` has `MoveLightingCommand` and NO
// `MOVE_COMMAND_BY_TYPE` row (Gate G7)." `lighting` now HAS a `MOVE_COMMAND_BY_TYPE`
// row (`lighting.moveFixture`, the same L-220 distinct-verb pattern as
// `plumbing.moveFixture`) — the founder's "no move icon" report is what surfaced
// the gap. That does not weaken the reasoning THIS FILE stands on: dispatching
// `Command` instances directly (not bus verbs) is still what lets
// `CommandManagerImpl` fold the boundary line's move and every dependent's move
// into ONE undo entry (C81) — a bus round-trip per dependent could not do that.
// The exception this paragraph named is closed; the reason for the pattern is not.

import { trace, type Tracer } from '@opentelemetry/api';
import type { Command } from '../types';
import type { BoundaryLineAdaptation } from '@pryzm/geometry-boundary-line';
import { UpdateWallBaselineCommand } from '../walls/UpdateWallBaselineCommand';
import { UpdateSlabPolygonCommand } from '../slabs/UpdateSlabPolygonCommand';
import { UpdateColumnCommand } from '../columns/UpdateColumnCommand';
import { UpdateBeamCommand } from '../beam/UpdateBeamCommand';
import { UpdateCurtainWallCommand } from '../curtainwall/UpdateCurtainWallCommand';
import { UpdateHandrailCommand } from '../handrails/UpdateHandrailCommand';
import { MoveStairCommand } from '../stair/MoveStairCommand';
import { UpdateFurnitureParametersCommand } from '../furniture/UpdateFurnitureParametersCommand';
import { MovePlumbingCommand } from '../plumbing/MovePlumbingCommand';
import { MoveLightingCommand } from '../lighting/MoveLightingCommand';

/** A plain world point. */
interface P3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * What the adapter needs to know about the dependent BEFORE the move, so it can
 * build a command whose undo is exact.
 *
 * ⭐ `prev` IS NOT OPTIONAL FOR LINE FAMILIES. `UpdateWallBaselineCommand` takes BOTH
 * `newBaseLine` and `prevBaseLine`, and its own header says `prevBaseLine` is *"the
 * ONLY input that lets undo restore the pre-move position"* — omitting it yields a
 * half-undoable step that reports success. The dispatcher reads `prev` out of the
 * authoritative store immediately before building the command, so it is the real
 * previous value rather than a remembered one.
 */
export interface DependentBefore {
    /** LINE families: the two endpoints as they are NOW. */
    readonly span?: { readonly start: P3; readonly end: P3 };
    /** POINT families: the position as it is NOW. */
    readonly position?: P3;
    /** AREA families: the polygon as it is NOW, in whatever convention its store uses. */
    readonly polygon?: ReadonlyArray<{ readonly x: number; readonly y?: number; readonly z?: number }>;
}

/**
 * Build the child command that carries ONE dependent, or `null` when the
 * before-state this adapter needs is missing.
 *
 * ⛔ RETURNING `null` IS NOT A SILENT SKIP. The dispatcher counts every `null` and
 * reports it to the user as an unresolved dependent with its own sentence. A skip
 * that reads as coverage is precisely what C84 EI-PROP-c calls *"worse than no
 * handler"*.
 */
export type BoundaryLineDependentAdapter = (
    a: BoundaryLineAdaptation,
    before: DependentBefore,
) => Command | null;

const line = (a: BoundaryLineAdaptation): { start: P3; end: P3 } | null => a.span ?? null;

// ── P8 / C10 §2 ───────────────────────────────────────────────────────────────
//
// Same tracer idiom as `DeleteElementsBatchCommand.ts` / `moveReweldPreflight.ts`
// in this package (C84 EI-9: one tracer authority per package, not a second
// wrapper).
//
// The span sits on the ADAPTATION, not on `adaptedFamilies()`. `adaptedFamilies()`
// is a keys read the coverage test calls; tracing it would satisfy the gate and
// tell an operator nothing. What an operator actually needs from a boundary-line
// move is WHICH family was asked to follow and WHETHER it produced a command —
// and per the doc comment above, `null` is a REPORTED unresolved dependent, never
// a silent skip, so `carried` is emitted as its own attribute rather than left to
// be inferred from an absent span.
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

function traced(
    family: string,
    fn: BoundaryLineDependentAdapter,
): BoundaryLineDependentAdapter {
    return (a, before) =>
        _tracer().startActiveSpan('pryzm.boundaryLine.adaptDependent', (span) => {
            try {
                span.setAttribute('pryzm.boundaryLine.family', family);
                span.setAttribute('pryzm.boundaryLine.elementId', a.elementId);
                const cmd = fn(a, before);
                span.setAttribute('pryzm.boundaryLine.carried', cmd !== null);
                return cmd;
            } finally {
                span.end();
            }
        });
}

/** Wrap every adapter in the table without changing its identity or key set. */
function tracedAdapters(
    table: Record<string, BoundaryLineDependentAdapter>,
): Record<string, BoundaryLineDependentAdapter> {
    const out: Record<string, BoundaryLineDependentAdapter> = {};
    for (const [family, fn] of Object.entries(table)) out[family] = traced(family, fn);
    return out;
}

/**
 * ⚠ THE SLAB CONVENTION IS `{x, y}` WHERE `y` IS WORLD **Z**, and it is written down
 * here because it is the single most likely mis-wire in this file.
 * `UpdateSlabPolygonPayload.polygon` documents it in as many words: *"Points use
 * `{ x, y }` where `y` maps to world Z (the 2D polygon convention used throughout the
 * slab subsystem)."* Passing `{x, z}` would type-check against nothing and silently
 * place every slab on the X axis.
 */
function translateSlabPolygon(
    poly: ReadonlyArray<{ x: number; y?: number; z?: number }>,
    d: { dx: number; dz: number },
): { x: number; y: number }[] {
    return poly.map((p) => ({
        x: p.x + d.dx,
        // Read defensively: a slab polygon may arrive as `{x,y}` (canonical) or as
        // `{x,z}` from a caller that used the world convention. Both are translated by
        // dz on the same axis, because in this store both spell world Z.
        y: (p.z !== undefined ? p.z : (p.y ?? 0)) + d.dz,
    }));
}

/**
 * The adapters, keyed by the family key `BOUNDARY_LINE_FAMILY_RULES` uses.
 *
 * ⚠ ALIASES ARE SPELLED OUT rather than normalised, deliberately: `curtain-wall` and
 * `curtainwall` are two spellings the repository genuinely carries (`elementMove.ts`
 * lists both), and mapping them here — where the coverage test can see both — is
 * safer than a normalising function that could quietly absorb a THIRD spelling nobody
 * declared.
 */
export const BOUNDARY_LINE_DEPENDENT_ADAPTERS: Readonly<Record<string, BoundaryLineDependentAdapter>> =
    Object.freeze(tracedAdapters({
        wall: (a, before) => {
            const s = line(a);
            if (!s || !before.span) return null;
            return new UpdateWallBaselineCommand({
                wallId: a.elementId,
                newBaseLine: [s.start, s.end],
                // The pre-move baseline, READ FROM THE STORE by the dispatcher. Without
                // it the move is half-undoable and still reports success.
                prevBaseLine: [before.span.start, before.span.end],
            });
        },

        slab: (a, before) => {
            if (!a.delta || !before.polygon || before.polygon.length < 3) return null;
            return new UpdateSlabPolygonCommand({
                slabId: a.elementId,
                polygon: translateSlabPolygon(before.polygon, a.delta),
                // ⛔ `holes` is OMITTED, never passed as `[]`. The command PRESERVES
                // existing holes on omission and REPLACES them with `[]` if an empty
                // array is passed — i.e. it would silently delete every opening in the
                // slab. `CreatePoolHandler` records the same trap for the same command.
            });
        },

        column: (a) => {
            if (!a.position) return null;
            return new UpdateColumnCommand({
                id: a.elementId,
                // `levelId` is NOT permitted in this payload (the command says so); a
                // boundary-line move is horizontal, so there is nothing to send.
                updates: { position: a.position },
            });
        },

        beam: (a) => {
            const s = line(a);
            if (!s) return null;
            return new UpdateBeamCommand({
                beamId: a.elementId,
                // ⚠ `startSupportId` / `endSupportId` are deliberately UNTOUCHED — see
                // the named remainder on the beam row in BOUNDARY_LINE_FAMILY_RULES.
                updates: { startPoint: s.start, endPoint: s.end },
            });
        },

        'curtain-wall': (a) => curtainWall(a),
        curtainwall: (a) => curtainWall(a),

        handrail: (a) => handrail(a),
        railing: (a) => handrail(a),

        stair: (a) => stair(a),
        stairs: (a) => stair(a),

        furniture: (a) => {
            if (!a.position) return null;
            return new UpdateFurnitureParametersCommand({
                id: a.elementId,
                position: a.position,
            });
        },

        plumbing: (a) => plumbing(a),
        plumbingfixture: (a) => plumbing(a),

        // §LIGHT121 (L-11900) — this adapter used to be "THE FAMILY WITH NO BUS ROUTE";
        // `lighting.moveFixture` now exists (`MOVE_COMMAND_BY_TYPE` carries the row and
        // both drag surfaces dispatch it). The adapter is UNCHANGED: it dispatches the
        // command directly like every other family here, which is what folds the
        // dependent's move into the boundary line's ONE undo entry (C81).
        lighting: (a) => {
            if (!a.position) return null;
            return new MoveLightingCommand({ elementId: a.elementId, to: a.position });
        },
    }));

function curtainWall(a: BoundaryLineAdaptation): Command | null {
    const s = line(a);
    if (!s) return null;
    return new UpdateCurtainWallCommand({
        id: a.elementId,
        // `CurtainWallData.baseLine: [Point3D, Point3D]` — measured, a LINE family.
        updates: { baseLine: [s.start, s.end] },
    }) as unknown as Command;
}

function handrail(a: BoundaryLineAdaptation): Command | null {
    const s = line(a);
    if (!s) return null;
    // `HandrailData.baseLine` is `[Point3D, Point3D]` — a LINE, not "path points". The
    // opposite claim stood in `elementMove.ts` for months and was measured FALSE there;
    // this adapter inherits the corrected reading rather than the old comment.
    return new UpdateHandrailCommand({ id: a.elementId, baseLine: [s.start, s.end] }) as unknown as Command;
}

function stair(a: BoundaryLineAdaptation): Command | null {
    if (!a.delta) return null;
    // ⭐ A DELTA, NOT A POSITION — and that is what makes the stair's slab void follow.
    // `MoveStairCommand` re-reconciles the auto-carved opening in the slab, floor and
    // ceiling it pierces (§STAIR-VOID-FOLLOWS-SPAN, L-1532). A hand-written position
    // write would move the flight and leave the hole behind.
    return new MoveStairCommand({ stairId: a.elementId, delta: { x: a.delta.dx, y: 0, z: a.delta.dz } });
}

function plumbing(a: BoundaryLineAdaptation): Command | null {
    if (!a.position) return null;
    return new MovePlumbingCommand({ id: a.elementId, to: a.position });
}

/** Every family this file can carry. The coverage test compares it to the table. */
export function adaptedFamilies(): readonly string[] {
    return Object.keys(BOUNDARY_LINE_DEPENDENT_ADAPTERS);
}
