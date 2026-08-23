// BoundaryLinePropagation — WHEN THE BOUNDARY LINE MOVES, WHAT FOLLOWS IT.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7904..L-7907) · **C106 §3** ·
// C84 §EI-PROP (a dependent ADAPTS or REFUSES BY NAME) · ADR-0344 · ADR-0348 ·
// C72 §9.1 (the three verdicts) · C74 (an honest refusal is an answer).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S ASK, VERBATIM, AND WHY THIS FILE IS A TABLE RATHER THAN A LOOP
// ═══════════════════════════════════════════════════════════════════════════════
//
//   "if the user moves the boundary line and this line had slabs and walls, they
//    should move, adapt, propagate with all elements!!"
//
// Lane LEVEL36 solved the same shape for LEVELS (ADR-0345) and its finding is the
// one binding lesson here: ⭐ *the level is a host, and what cannot follow it is
// NAMED.* A partial cascade that does not say what it skipped is worse than none —
// the model silently disagrees with itself, and the user cannot tell "nothing moved"
// from "nothing should have moved" (C78 §1.4, the two facts arriving as one value).
//
// So this module produces a PLAN, not an effect. Every attachment lands in exactly
// one of three buckets, and the REFUSED bucket carries a sentence a person can read.
// Nothing is dropped, and nothing is silent — `plan.attempted` is the input count and
// `adapt.length + refused.length + unresolved.length === attempted` is asserted by a
// test that would fail on any leak.
//
// ─── PURE, AND THAT IS THE POINT ────────────────────────────────────────────────
// This planner performs NO mutation and reads NO store. It is `(prevLine, nextLine)
// → plan`, so the verdict a test asserts is byte-for-byte the verdict production
// computes. The DISPATCHER (`MoveBoundaryLineCommand`, `packages/command-registry`)
// is the only thing that executes it, and it re-reads every write back rather than
// trusting it (L-2401).

import { trace, type Tracer } from '@opentelemetry/api';
import type {
    BoundaryLineAttachment,
    BoundaryLineData,
    DependentShape,
    Vec3XYZ,
} from './BoundaryLineTypes';
import { anchorDisplacement, poseOnBoundaryLine, spanOnBoundaryLine } from './BoundaryLineGeometry';

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/geometry-boundary-line', '0.1.0');
}

/** C72 §9.1 — the only three verdicts a dependent may receive. */
export type PropagationVerdict = 'PROPAGATES' | 'REFUSES' | 'SILENT';

/**
 * One family's row in the boundary-line host-move table.
 *
 * ⚠ `moveVerb` is the bus type `apps/editor/src/engine/transforms/elementMove.ts`
 * already names for that family in `MOVE_COMMAND_BY_TYPE` — *the ONE table of "which
 * bus command moves element type X"*. It is COPIED here as a string because L2 may
 * not import L7, and `boundaryLineMoveTableAgreesWithElementMove.spec.ts` (L7)
 * asserts the two agree, in BOTH directions. ⭐ A copied constant that is compared is
 * safe; a copied constant that is merely written down is the defect this repo logs
 * most often, so the comparison ships with the copy, in the same commit.
 */
export interface BoundaryLineFamilyRule {
    /** Lower-case family key, spelled as `normaliseMoveType()` spells it. */
    readonly family: string;
    readonly verdict: PropagationVerdict;
    /** How the dependent is re-seated. Absent when the verdict is not PROPAGATES. */
    readonly shape?: DependentShape;
    /**
     * The bus verb `MOVE_COMMAND_BY_TYPE` names for this family.
     *
     * WARNING: ABSENCE IS MEANINGFUL AND IS NOT THE SAME AS "does not move". A
     * PROPAGATES row with NO `moveVerb` is a family that HAS a legacy COMMAND reaching
     * its authoritative store but NO bus route and no gizmo branch -- `lighting` is
     * exactly that, and the row says so. Reading absence as "cannot follow" is the
     * mistake this table's first draft made; see the lighting row.
     */
    readonly moveVerb?: string;
    /**
     * REQUIRED when the verdict is REFUSES: the sentence the user reads. C16 CA-18 —
     * name the reason, and where there is one, the route back to success.
     */
    readonly reason?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE PER-FAMILY TABLE (C106 §3.3) — NORMATIVE. **NO CELL IS `SILENT`.**
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Membership was decided by ONE measured question, the same shape LEVEL36 used:
 * **does `MOVE_COMMAND_BY_TYPE` name a bus verb that reaches this family's
 * AUTHORITATIVE store?** A family with such a verb can be carried by re-invoking it.
 * A family without one cannot, and wiring it anyway would produce a PROPAGATES row
 * that propagates nothing — a FALSE verdict on the ledger, which C84 EI-PROP says is
 * worse than the SILENT cell it replaces.
 *
 * ⚠ "authoritative" is load-bearing and was measured, not assumed. `wall.move` and
 * `slab.updatePolygon` both EXIST and both write the DETACHED plugin DTO store that
 * nothing renders, exports or persists — `plugins/wall/src/handlers/MoveWall.ts`
 * refuses for exactly that reason, in its own words. The verbs below are the ones
 * `elementMove.ts` names *after* that correction (`slab.movePolygon`,
 * `handrail.moveBaseLine` — the L-220 distinct-verb pattern), i.e. the ones that
 * reach the geometry store the builders, the plan projector, the IFC exporter and
 * persistence read.
 */
export const BOUNDARY_LINE_FAMILY_RULES: readonly BoundaryLineFamilyRule[] = Object.freeze([
    // -- ADAPTS ------------------------------------------------------------------
    // Every row below was verified TWICE: the bus verb exists in
    // `MOVE_COMMAND_BY_TYPE`, and a legacy command with a MEASURED payload writes the
    // family's AUTHORITATIVE geometry store. `boundaryLineDependentAdapters.ts`
    // (`packages/command-registry`) holds the second half, and its coverage test fails
    // if a PROPAGATES row has no adapter -- which is what stops this table claiming a
    // cell nothing can execute.
    { family: 'wall', verdict: 'PROPAGATES', shape: 'line', moveVerb: 'wall.updateBaseline' },
    { family: 'slab', verdict: 'PROPAGATES', shape: 'area', moveVerb: 'slab.movePolygon' },
    { family: 'column', verdict: 'PROPAGATES', shape: 'point', moveVerb: 'column.update' },
    // `BeamData.startPoint` / `.endPoint` -- measured, a LINE family.
    // WARNING, NAMED REMAINDER: `startSupportId` / `endSupportId` are NOT re-solved. A
    // beam whose columns rode the same line still meets them; a beam whose supports did
    // not move now spans differently. That is a bounded, STATED gap (C106 §3.5), not a
    // silence -- re-running support assignment is `AssignBeamSupportsCommand`'s job,
    // never a boundary line's.
    { family: 'beam', verdict: 'PROPAGATES', shape: 'line', moveVerb: 'beam.update' },
    { family: 'curtain-wall', verdict: 'PROPAGATES', shape: 'line', moveVerb: 'wall.updateCurtainWall' },
    { family: 'curtainwall', verdict: 'PROPAGATES', shape: 'line', moveVerb: 'wall.updateCurtainWall' },
    { family: 'handrail', verdict: 'PROPAGATES', shape: 'line', moveVerb: 'handrail.moveBaseLine' },
    { family: 'railing', verdict: 'PROPAGATES', shape: 'line', moveVerb: 'handrail.moveBaseLine' },
    { family: 'furniture', verdict: 'PROPAGATES', shape: 'point', moveVerb: 'furniture.updateParameters' },
    { family: 'plumbing', verdict: 'PROPAGATES', shape: 'point', moveVerb: 'plumbing.moveFixture' },
    { family: 'plumbingfixture', verdict: 'PROPAGATES', shape: 'point', moveVerb: 'plumbing.moveFixture' },
    // STAIR PROPAGATES HERE AND REFUSES FOR A LEVEL, AND THAT IS NOT A CONTRADICTION.
    // ADR-0345 refuses a stair on a level-HEIGHT change because the storey gap it spans
    // changed, which invalidates its riser count -- a re-SOLVE, not a translate. A
    // boundary-line move is a horizontal displacement in XZ: the rise is untouched, so
    // the stair goes with it through the same `MoveStairCommand` the 3-D gizmo already
    // dispatches (and which re-reconciles its slab void). Two hosts, two questions, two
    // answers; flattening them would be the wrong kind of consistency.
    { family: 'stair', verdict: 'PROPAGATES', shape: 'point', moveVerb: 'stair.move' },
    { family: 'stairs', verdict: 'PROPAGATES', shape: 'point', moveVerb: 'stair.move' },
    // LIGHTING -- A CORRECTION, RECORDED RATHER THAN QUIETLY MADE.
    //
    // The first draft of this table REFUSED lighting and quoted
    // `MOVE_UNSUPPORTED_REASON.lighting` from `elementMove.ts` verbatim: "Lighting
    // fixtures have no move command on any surface yet -- tracked under Gate G7."
    // THAT SENTENCE IS TRUE OF THE BUS AND FALSE OF THE COMMAND LAYER, and the
    // difference decides this cell.
    //
    // MEASURED 2026-08-23:
    // `packages/command-registry/src/lighting/MoveLightingCommand.ts` EXISTS, takes
    // `{ elementId, to: {x,y,z} }`, and writes the lighting store. What is missing is a
    // `MOVE_COMMAND_BY_TYPE` row and a 3-D gizmo branch -- i.e. no SURFACE dispatches
    // it. `MoveBoundaryLineCommand` dispatches COMMANDS, not bus verbs, so it reaches
    // the one that exists. `moveVerb` is therefore ABSENT on this row, and its absence
    // is the honest statement that lighting has no bus route yet.
    //
    // Copying the refusal without re-measuring would have shipped a REFUSES cell for a
    // family that can follow perfectly well -- the inverse of the "PROPAGATES row that
    // propagates nothing" C84 warns about, and just as wrong.
    { family: 'lighting', verdict: 'PROPAGATES', shape: 'point' },

    // -- REFUSES, EACH WITH ITS MEASURED REASON ----------------------------------
    // These are not gaps. C84 EI-PROP-b: an honest refusal is a valid answer, and for a
    // whole class of cells it is the TARGET state. Nine of the thirteen below are cells
    // that MUST refuse -- adapting them would itself be the defect.
    {
        family: 'door',
        verdict: 'REFUSES',
        reason:
            'A door is HOSTED in a wall (C15) - its position is an OFFSET along that wall, not a '
            + 'world point. It moves when its host wall moves. Attach the WALL to the boundary '
            + 'line and the door rides it.',
    },
    {
        family: 'window',
        verdict: 'REFUSES',
        reason:
            'A window is HOSTED in a wall (C15) - its position is an OFFSET along that wall, not '
            + 'a world point. It moves when its host wall moves. Attach the WALL to the boundary '
            + 'line and the window rides it.',
    },
    // -- The C79 cause-vocabulary trio -------------------------------------------
    // MEASURED, AND THE SAME MEASUREMENT FOR ALL THREE. `UpdateRoofBoundaryCommand`,
    // `UpdateCeilingBoundaryCommand` and `UpdateFloorBoundaryCommand` each REQUIRE
    //     cause: { wallId: string; kind: 'wall-moved' | 'wall-removed' }
    // and each documents it as "Why this write happened. Named, never inferred (C79
    // §4.4 / C75)." A boundary line is not a wall and has no `wallId`. Passing a
    // fabricated one to satisfy the type would write FALSE PROVENANCE into the record --
    // it would tell every later reader that a wall moved when none did, which is worse
    // than the element not following. The fix is a `boundary-line-moved` member on that
    // cause union, which is C79's contract to amend and not this lane's to force.
    {
        family: 'roof',
        verdict: 'REFUSES',
        reason:
            'A roof re-projects only through UpdateRoofBoundaryCommand, whose `cause` must name a '
            + 'WALL that moved (C79 §4.4 - named, never inferred). A boundary line is not a wall, '
            + 'and inventing a wall id would write false provenance. Move the roof directly, or '
            + 'attach the walls it sits on.',
    },
    {
        family: 'ceiling',
        verdict: 'REFUSES',
        reason:
            'A ceiling re-projects only through UpdateCeilingBoundaryCommand, whose `cause` must '
            + 'name a WALL that moved (C79 §4.4 - named, never inferred). A boundary line is not a '
            + 'wall, and inventing a wall id would write false provenance. Attach the walls that '
            + 'bound the ceiling instead.',
    },
    {
        family: 'floor',
        verdict: 'REFUSES',
        reason:
            'A floor finish re-projects only through UpdateFloorBoundaryCommand, whose `cause` '
            + 'must name a WALL that moved (C79 §4.4 - named, never inferred). A boundary line is '
            + 'not a wall, and inventing a wall id would write false provenance. Attach the walls '
            + 'that bound the floor instead.',
    },
    {
        family: 'room',
        verdict: 'REFUSES',
        // Not "cannot" -- "must not". A room's polygon carries `detectionMethod`, i.e.
        // it records that it was DERIVED from its bounding walls. Writing it from a
        // boundary line would make two authorities over one polygon (C84 EI-9), and the
        // next re-detect would silently overwrite whichever one lost.
        reason:
            'A room BOUNDARY is DERIVED from its bounding walls and records that in '
            + '`detectionMethod`. Writing it from a boundary line would create a second authority '
            + 'over one polygon. A room follows because its WALLS follow - attach those.',
    },
    {
        family: 'grid',
        verdict: 'REFUSES',
        reason:
            'A structural grid is a DATUM - other elements are set out FROM it. Moving a grid '
            + 'because a construction line moved would invert that hierarchy and silently '
            + 'relocate everything dimensioned off it. Move the grid deliberately instead.',
    },
    {
        family: 'level',
        verdict: 'REFUSES',
        reason:
            'A level is a vertical DATUM and a host in its own right; its move is owned by '
            + 'SetLevelHeightCommand (ADR-0345). A horizontal boundary line has no authority '
            + 'over it.',
    },
    {
        family: 'pool',
        verdict: 'REFUSES',
        reason:
            'A pool is a COMPOUND (ADR-0124 §3): its walls, floor slab and water belong to it, '
            + 'and the hole it cut belongs to a host slab. Translating one member would tear the '
            + 'assembly apart. Move the pool itself, which moves all of it.',
    },
    {
        family: 'balcony',
        verdict: 'REFUSES',
        reason:
            'A balcony is a COMPOUND (C103 §2): its plate, finish and railings are DERIVED from '
            + 'one polygon and from the host wall it cantilevers off. Translating a member would '
            + 'break that derivation. Move the balcony, or move its host wall.',
    },
    {
        family: 'lift',
        verdict: 'REFUSES',
        reason:
            'A lift is a COMPOUND (C104 §2) whose shaft voids a slab on every storey it serves. '
            + 'Translating it without re-cutting those voids would leave holes in mid-air. '
            + 'Re-place the lift instead.',
    },
    {
        family: 'annotation',
        verdict: 'REFUSES',
        reason:
            'An annotation belongs to a VIEW, not to model geometry (C101). It is re-placed when '
            + 'the view is re-issued, not when a model line moves.',
    },
    {
        family: 'dimension',
        verdict: 'REFUSES',
        reason:
            'A dimension MEASURES elements; it is regenerated from whatever they now are (C101). '
            + 'Translating it would make it report a length it never measured.',
    },
]);

/** The rule for a family, or `null` when the family is not in the table at all. */
export function boundaryLineRuleFor(family: string): BoundaryLineFamilyRule | null {
    const key = (family ?? '').toLowerCase().trim();
    return BOUNDARY_LINE_FAMILY_RULES.find((r) => r.family === key) ?? null;
}

/** Every family the table says will follow a boundary-line move. */
export function boundaryLineAdaptingFamilies(): readonly string[] {
    return BOUNDARY_LINE_FAMILY_RULES.filter((r) => r.verdict === 'PROPAGATES').map((r) => r.family);
}

/** Every family the table refuses BY NAME. */
export function boundaryLineRefusingFamilies(): readonly string[] {
    return BOUNDARY_LINE_FAMILY_RULES.filter((r) => r.verdict === 'REFUSES').map((r) => r.family);
}

// ─── The plan ────────────────────────────────────────────────────────────────

/** One dependent that WILL be carried, and exactly where to. */
export interface BoundaryLineAdaptation {
    readonly elementId: string;
    readonly family: string;
    readonly shape: DependentShape;
    /**
     * The bus verb that would commit it, when the family has one. OPTIONAL -- see the
     * `moveVerb` note on `BoundaryLineFamilyRule`. The DISPATCHER keys on `family`,
     * never on this, precisely so a family with no bus route is still carried.
     */
    readonly moveVerb?: string;
    /** POINT shape: where the element goes. */
    readonly position?: Vec3XYZ;
    /** LINE shape: both endpoints, re-seated from the anchor pair. */
    readonly span?: { start: Vec3XYZ; end: Vec3XYZ };
    /** AREA shape: the rigid displacement its whole polygon rides. */
    readonly delta?: { dx: number; dy: number; dz: number };
}

/** One dependent that will NOT be carried, and the sentence saying why. */
export interface BoundaryLineRefusal {
    readonly elementId: string;
    readonly family: string;
    readonly reason: string;
}

/**
 * The whole answer for one boundary-line move.
 *
 * ⛔ `unresolved` is NOT a silent bucket. It holds attachments whose GEOMETRY could
 * not be evaluated — a degenerate segment, or a segment index the new line no longer
 * has because the user deleted vertices. Each carries a reason and is reported to the
 * user exactly as a refusal is. It is separate from `refused` only because the two
 * have different fixes: a refusal is a design fact about the family, an unresolved is
 * a fact about THIS line right now.
 */
export interface BoundaryLineMovePlan {
    readonly boundaryLineId: string;
    /** Input count. `adapt + refused + unresolved` MUST equal this. */
    readonly attempted: number;
    readonly adapt: readonly BoundaryLineAdaptation[];
    readonly refused: readonly BoundaryLineRefusal[];
    readonly unresolved: readonly BoundaryLineRefusal[];
    /**
     * ⭐ A DEPENDENT WHOSE FAMILY IS NOT IN THE TABLE AT ALL. This is the ONLY way a
     * cell can be `SILENT`, and it is surfaced rather than skipped: an unknown family
     * arriving here means someone added an element family and did not give it a row,
     * which C84 EI-PROP-a makes a merge-blocking omission. It reads to the user as a
     * refusal; it reads to the developer as a missing row.
     */
    readonly unclassified: readonly BoundaryLineRefusal[];
}

/**
 * Plan the move. PURE — reads no store, mutates nothing, and is a total function of
 * its two arguments.
 *
 * P8: emits `pryzm.boundary_line.plan_move`.
 */
export function planBoundaryLineMove(
    prev: BoundaryLineData,
    next: BoundaryLineData,
): BoundaryLineMovePlan {
    return _tracer().startActiveSpan('pryzm.boundary_line.plan_move', (span) => {
        try {
            const adapt: BoundaryLineAdaptation[] = [];
            const refused: BoundaryLineRefusal[] = [];
            const unresolved: BoundaryLineRefusal[] = [];
            const unclassified: BoundaryLineRefusal[] = [];

            for (const att of prev.attachments as readonly BoundaryLineAttachment[]) {
                const rule = boundaryLineRuleFor(att.elementKind);

                if (!rule) {
                    unclassified.push({
                        elementId: att.elementId,
                        family: att.elementKind,
                        reason:
                            `"${att.elementKind}" has no row in the boundary-line host-move table, so `
                            + `whether it should follow is UNDECIDED — not "no". C84 EI-PROP-a requires a `
                            + `row before this family may be attached.`,
                    });
                    continue;
                }

                if (rule.verdict !== 'PROPAGATES') {
                    refused.push({
                        elementId: att.elementId,
                        family: rule.family,
                        // A REFUSES row without a reason is unreachable — the table's own
                        // test asserts every one carries one — but the fallback is stated
                        // rather than asserted, because a crash inside a refusal renderer
                        // turns a refusal into a crash.
                        reason: rule.reason ?? `${rule.family} does not follow a boundary line.`,
                    });
                    continue;
                }

                const shape = rule.shape ?? 'point';
                const verb = rule.moveVerb;

                if (shape === 'line') {
                    if (!att.end) {
                        unresolved.push({
                            elementId: att.elementId,
                            family: rule.family,
                            reason:
                                `${rule.family} is a LINE element and its attachment names only a start `
                                + `anchor, so its far end has nowhere to go. Re-attach it with both ends.`,
                        });
                        continue;
                    }
                    const span2 = spanOnBoundaryLine(next, att);
                    if (!span2) {
                        unresolved.push({
                            elementId: att.elementId,
                            family: rule.family,
                            reason: _degenerateReason(rule.family, att),
                        });
                        continue;
                    }
                    adapt.push({
                        elementId: att.elementId,
                        family: rule.family,
                        shape,
                        moveVerb: verb,
                        span: span2,
                    });
                    continue;
                }

                if (shape === 'area') {
                    const delta = anchorDisplacement(prev, next, att);
                    if (!delta) {
                        unresolved.push({
                            elementId: att.elementId,
                            family: rule.family,
                            reason: _degenerateReason(rule.family, att),
                        });
                        continue;
                    }
                    adapt.push({
                        elementId: att.elementId,
                        family: rule.family,
                        shape,
                        moveVerb: verb,
                        delta,
                    });
                    continue;
                }

                // POINT
                const position = poseOnBoundaryLine(next, att);
                if (!position) {
                    unresolved.push({
                        elementId: att.elementId,
                        family: rule.family,
                        reason: _degenerateReason(rule.family, att),
                    });
                    continue;
                }
                adapt.push({
                    elementId: att.elementId,
                    family: rule.family,
                    shape,
                    moveVerb: verb,
                    position,
                    delta: anchorDisplacement(prev, next, att) ?? undefined,
                });
            }

            span.setAttribute('pryzm.boundary_line.attempted', prev.attachments.length);
            span.setAttribute('pryzm.boundary_line.adapt', adapt.length);
            span.setAttribute('pryzm.boundary_line.refused', refused.length);
            span.setAttribute('pryzm.boundary_line.unresolved', unresolved.length);
            span.setAttribute('pryzm.boundary_line.unclassified', unclassified.length);

            return {
                boundaryLineId: prev.id as unknown as string,
                attempted: prev.attachments.length,
                adapt,
                refused,
                unresolved,
                unclassified,
            };
        } finally {
            span.end();
        }
    });
}

function _degenerateReason(family: string, att: BoundaryLineAttachment): string {
    return (
        `${family} is anchored to segment ${att.segmentIndex} of the boundary line, and that `
        + `segment no longer has a length or no longer exists after the edit — so there is no `
        + `direction to place it against. Undo the edit, or re-attach the element to a segment `
        + `that survived.`
    );
}

/**
 * ⭐ ONE SENTENCE A PERSON CAN READ, naming every family that did NOT follow.
 *
 * This is C84 EI-PROP-a's *"arrives as a declared finding, never as silence"* made
 * concrete: the command puts this in `result.info` and both surfaces render it. A
 * `console.warn` is not a refusal — it is a refusal nobody reads.
 *
 * Returns `null` when everything followed, so a caller can omit the line entirely
 * rather than print "0 elements did not move", which reads as a warning.
 */
export function summariseBoundaryLineRefusals(plan: BoundaryLineMovePlan): string | null {
    const all = [...plan.refused, ...plan.unresolved, ...plan.unclassified];
    if (all.length === 0) return null;
    const byFamily = new Map<string, { count: number; reason: string }>();
    for (const r of all) {
        const cur = byFamily.get(r.family);
        if (cur) cur.count += 1;
        else byFamily.set(r.family, { count: 1, reason: r.reason });
    }
    const parts: string[] = [];
    for (const [family, { count, reason }] of byFamily) {
        parts.push(`${count} ${family}${count === 1 ? '' : 's'} — ${reason}`);
    }
    return `⚠ ${all.length} attached element(s) did NOT move: ${parts.join(' · ')}`;
}
