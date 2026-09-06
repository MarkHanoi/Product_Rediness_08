// §RESI-ORCH-MASSING-OPTIONS (lane RESI-ORCH, 2026-09-04) — STR §7: *"generate MULTIPLE massing
// options, each with the reason it exists."*
//
// ── WHAT THIS IS, STATED NARROWLY, BECAUSE THE ALTERNATIVE IS THE DEFECT ────────────────────
// The spec's §7 asks for geometry families — I / L / U / irregular-L / non-90°. **PRYZM cannot
// solve those on a real parcel today** (`RESI-ORCHESTRATOR-PLAN` §1 §7: *"There is no
// `MassingOption` type anywhere"*, and the polygon boolean work that an L or a courtyard needs
// does not exist in this repo). So this module does **not** claim them. It enumerates the ONE
// massing decision PRYZM can actually solve and cite today, which is also the decision the
// ordinance actually constrains:
//
//     ⭐ HOW MUCH OF THE PERMITTED FOOTPRINT DO YOU COVER, AND THEREFORE HOW MANY STOREYS DOES
//        REACHING THE PERMITTED FLOOR AREA TAKE?
//
// Four coverage options — the whole permitted plate, three quarters, a half, a third — each one a
// real ring, each one carrying the storeys it would need, the floor area that realises, the
// ordinance figures it was measured against, and its own limitations. That is a genuine trade-off
// a designer makes on the first day, and every number in it is derived from a figure already on
// the card.
//
// ⛔ **NAMING A FAMILY PRYZM CANNOT SOLVE WOULD BE `[[fake-more-capable-than-real]]`.** An "L-shaped
// option" produced by eroding a rectangle is a rectangle with a label on it, and the user cannot
// tell. The families are therefore named for what they ARE — coverage fractions of the permitted
// plate — and `MASSING_FAMILIES_NOT_YET_SOLVED` states in the product's own words which shapes are
// missing, so a reader is told about the gap rather than sold around it.
//
// ⭐ **AMENDED 2026-09-06 (lane PL-MASSING-OPTIONS, STR §25.3). EVERYTHING ABOVE STILL HOLDS FOR THE
//    COVERAGE FAMILIES; ITS PREMISE ABOUT SHAPES NO LONGER HOLDS, AND THE PARAGRAPH IS CORRECTED IN
//    PLACE RATHER THAN LEFT TO ROT.**
// The header above justified naming no shape families on one measured fact — *"the polygon boolean
// work that an L or a courtyard needs does not exist in this repo"*. **It exists now.**
// `@pryzm/geometry-kernel` ships `intersectPolygons2D` (§C73-POLY-BOOLEAN / GE-05), oracle-pinned
// concave∩concave, and an intersection is precisely the operator a shape family needs, because
// `template ∩ buildableFootprint ⊆ buildableFootprint` **by construction** — so a shape produced
// that way can never over-state what may be built. That containment is a property of the operator,
// not of a check someone remembered to write.
//
// So this module now enumerates **TWO KINDS of option**, and they answer different questions:
//   • **COVERAGE families** (below) — *how much of the permitted plate do you cover?* They need no
//     input beyond the envelope, so they are always available.
//   • **SHAPE families** (`massingShapeOptions.ts`) — *given a ground-floor area you have named,
//     what BUILDINGS fit, and which one is better sited?* I · L · U · non-orthogonal L, each with
//     sun, orientation, overlooking, outlook, street frontage and forecourt as COMPUTED numbers.
//     They require a target area, and they say so instead of appearing empty.
//
// ⛔ THE OLD DISCIPLINE IS NOT RELAXED, IT IS EXTENDED. A non-orthogonal L is REFUSED BY NAME on a
// plot whose own boundaries are orthogonal, because there would be no angle to derive it from —
// see `MassingShapeRefusalReason.no-non-orthogonal-frame`. Inventing one would be the same defect
// this header was written to prevent, wearing the founder's vocabulary instead of a rectangle's.
//
// ── ⛔ NO AGGREGATE SCORE, NO RECOMMENDED OPTION, AND THAT IS THE DESIGN ─────────────────────
// The floor-plan layer's `ScoredHouseLayoutOption` ranks by a weighted sum because a layout has
// measurable habitability constraints to rank against. A massing choice does not: whether a
// two-storey full-plate house is better than a four-storey quarter-plate one is the ARCHITECT's
// judgement about light, garden, cost, privacy and taste, and PRYZM has no standing to hold it.
// A single number labelled "score" would launder that judgement into an authority. So each option
// carries its axes as FACTS with their meanings, ordered by coverage — a deterministic ordering,
// not a ranking claim — and the human picks. *Guide the human; do not replace the human.*
//
// ── ⛔ NOTHING IS EVER CLAMPED TO FIT, AND NOTHING IS FALSELY REFUSED EITHER ─────────────────
// `RESI-ORCHESTRATOR-PLAN` §6 risk 2 names the first half exactly: *"an option that looks reasoned
// but was clamped to fit is the [[confident-register-rows-are-the-wrong-ones]] defect."* When a
// plate needs more storeys than the ordinance permits, this module states BOTH counts, states what
// the plate yields at the permitted cap, and states the shortfall in m². It never quietly shrinks
// the answer and presents it as what was asked for.
//
// ⚠ THE SECOND HALF IS EASY TO GET WRONG IN THE OPPOSITE DIRECTION, and this module deliberately
// does not. That shortfall is a `warning`, NOT an `error`, and the option is NOT marked refused: a
// smaller plate inside the permitted footprint is perfectly legal, and trading floor area for
// garden is a decision an architect is entitled to make. Withdrawing it would be a FALSE REFUSAL —
// [[bulk-vs-query-endpoint-false-refusals]] — removing a legitimate design on PRYZM's authority
// rather than on the ordinance's. Exactly ONE condition produces an `error` here: PRYZM could not
// produce the plate at all.
//
// ── THE PLATE IS THE SAME PLATE THE USER COULD TYPE ─────────────────────────────────────────
// Every ring here comes from `solveTargetFootprintArea` — the §5 solver, which itself wraps
// `insetPolygonPerEdge`, the ONE erosion in this repo (§GREP-FOR-THE-EXISTING-SOLVER-FIRST). So an
// option and a hand-typed target of the same area produce the same geometry, and picking an option
// hands back a real `TargetFootprintProposal` that the existing scene draws and the existing adopt
// step can commit. No second geometry path, no second store, no second undo shape.
//
// ── PURITY, RESTATED HONESTLY 2026-09-06 ────────────────────────────────────────────────────
// This header used to read *"PURE: no store, no DOM, no THREE, no I/O, no clock, no RNG."* Two of
// those are now qualified and the line is corrected rather than left standing:
//   • **NO DOM, NO THREE, NO I/O, NO CLOCK, NO RNG — still absolute.**
//   • **STORE: exactly two module-level reads, and only when the caller OMITS the corresponding
//     input.** `targetGroundFloorAreaM2` and `siting` are three-valued (value / `null` / omitted);
//     omitted means *"read the live site"*, via `massingSitingContext.ts`, which is the ONE place
//     those reads live. Pass both explicitly — as every test here does — and this function is as
//     pure as it ever was, and byte-deterministic on its arguments alone.
// A header that claims a purity the body does not have is the same defect class as a gate that
// claims an enforcement it does not perform.

import { trace } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';
import {
    solveTargetFootprintArea,
    type TargetFootprintProposal,
} from './targetFootprintAreaSolver';
import {
    enumerateMassingShapes,
    MASSING_SHAPE_LABEL,
    type MassingShapeFamily,
    type MassingShapeAxisKey,
    type MassingShapeNote,
    type MassingShapeOutcome,
    type MassingSitingContext,
} from './massingShapeOptions';
import {
    resolveLiveMassingSitingContext,
    resolveLiveTargetGroundFloorAreaM2,
} from './massingSitingContext';

const _tracer = trace.getTracer('pryzm.site.massingOptionModel');

/**
 * The four COVERAGE options. CLOSED: a fifth is added HERE with its fraction, its label and its
 * meaning, and the type error at every table is the feature.
 */
export type MassingCoverageFamily =
    | 'full-plate'
    | 'three-quarter-plate'
    | 'half-plate'
    | 'third-plate';

/**
 * Every family an option may belong to — the coverage fractions above, plus the SHAPE families
 * (`massingShapeOptions.ts`) added for STR §25.3.
 */
export type MassingOptionFamily = MassingCoverageFamily | MassingShapeFamily;

/**
 * ⚠ THE COVERAGE FAMILIES ONLY, and the name is kept for its callers. Shape families are
 * `MASSING_SHAPE_FAMILIES`; they are enumerated on a different question and are not
 * interchangeable with these.
 */
export const MASSING_OPTION_FAMILIES: readonly MassingCoverageFamily[] = Object.freeze([
    'full-plate', 'three-quarter-plate', 'half-plate', 'third-plate',
] as const);

/** The fraction of the PERMITTED buildable footprint each COVERAGE family covers. */
export const MASSING_FAMILY_COVERAGE: Readonly<Record<MassingCoverageFamily, number>> = Object.freeze({
    'full-plate': 1,
    'three-quarter-plate': 0.75,
    'half-plate': 0.5,
    'third-plate': 1 / 3,
});

export const MASSING_FAMILY_LABEL: Readonly<Record<MassingCoverageFamily, string>> = Object.freeze({
    'full-plate': 'Full plate',
    'three-quarter-plate': 'Three-quarter plate',
    'half-plate': 'Half plate',
    'third-plate': 'Third plate',
});

/** What choosing this family MEANS on the ground — the trade the user is actually making. */
export const MASSING_FAMILY_MEANING: Readonly<Record<MassingCoverageFamily, string>> = Object.freeze({
    'full-plate':
        'Build across the whole permitted footprint. The fewest storeys for a given floor area, and '
        + 'the least open ground left on the plot.',
    'three-quarter-plate':
        'Give up a quarter of the permitted footprint. A modest amount of open ground, at the cost of '
        + 'a taller building for the same floor area.',
    'half-plate':
        'Build on half the permitted footprint. Substantial open ground and a markedly taller building '
        + 'for the same floor area.',
    'third-plate':
        'A compact tower-like plate on a third of the permitted footprint. The most open ground, and '
        + 'the most storeys for a given floor area.',
});

/**
 * The fold's caveat — WHAT THE LIST ABOVE IS, and what it still is not.
 *
 * ⭐ REWRITTEN 2026-09-06. It used to read *"They do NOT yet include L-shaped, U-shaped, courtyard
 * or non-orthogonal massings — PRYZM cannot solve those on a real parcel boundary today, and it
 * will not draw a rectangle and call it an L."* Every clause of that was true when written and the
 * last clause is still the governing rule — but the capability claim is now FALSE, and a product
 * telling a user it cannot do the thing it just did is the same defect as the reverse, pointed the
 * other way. What remains unsolved is named instead of the whole sentence being deleted.
 */
export const MASSING_FAMILIES_NOT_YET_SOLVED =
    'The first options vary how much of the permitted footprint you cover; the shape options are '
    + 'real I, L, U and non-orthogonal outlines fitted inside it. PRYZM still will not draw a '
    + 'rectangle and call it an L: a non-orthogonal L is refused on a plot whose own boundaries are '
    + 'square, and every shape is clipped to the permitted footprint rather than approximated onto '
    + 'it. Not yet offered: courtyards enclosed on all four sides, and shapes that step in plan '
    + 'between storeys.';

/** The caveat shown when shape options were withheld for want of a target ground-floor area. */
export const MASSING_SHAPES_NEED_A_TARGET_AREA =
    'Shape options — I, L, U and non-orthogonal L, each scored for sun, orientation, overlooking, '
    + 'outlook, street frontage and forecourt — are NOT shown because no target ground-floor area '
    + 'has been set. Type one in "Propose a ground floor" above and generate again; a shape needs an '
    + 'area to be a shape of.';

/** A coded reason attached to one option. Mirrors `LayoutLimitation` in the floor-plan layer:
 *  a machine code the renderer keys on, a severity, and one plain sentence carrying BOTH numbers
 *  wherever two exist. A renderer must never key on the prose. */
export interface MassingLimitation {
    readonly code:
        /**
         * ⭐ Reaching the permitted floor area on this plate needs more storeys than are permitted.
         *
         * ⚠ SEVERITY `warning`, NOT `error`, AND THE DISTINCTION IS LOAD-BEARING. This option is
         * perfectly legal — a smaller plate inside the permitted footprint always is. What it
         * cannot do is USE the whole floor-area allowance, and that is a trade-off the architect is
         * entitled to make (more garden, less floor area), not a violation. Calling it an error
         * would be a FALSE REFUSAL — the [[bulk-vs-query-endpoint-false-refusals]] shape — and it
         * would remove a legitimate design from the list on PRYZM's authority rather than on the
         * ordinance's. The shortfall is printed with both numbers; the decision stays with the user.
         */
        | 'storeys-exceed-cap'
        /** No storey count was derived, so there is no permitted floor area to distribute. */
        | 'gfa-not-derived'
        /** No maximum height was derived, so no height can be stated for this option. */
        | 'height-not-derived'
        /** The erosion could not produce this coverage on this shape — a shape problem, not a legal one. */
        | 'plate-unreachable'
        /** The plate is a uniform erosion, not a shaping rule the ordinance made. */
        | 'shape-approximated'
        /** ⭐ The SHAPE families' own caveats, carried through verbatim (§RESI-ORCH-MASSING-SHAPES). */
        | MassingShapeNote['code']
        /** A shape family could not be produced at all — the shape engine's typed refusal. */
        | 'shape-family-refused';
    readonly severity: 'error' | 'warning';
    readonly text: string;
}

/** One comparable fact about an option. `normalised` drives a bar; `display` is the real figure. */
export interface MassingScoreAxis {
    readonly key:
        | 'coverage' | 'open-ground' | 'storeys' | 'gfa-realised' | 'storey-headroom'
        /** ⭐ The SHAPE families' computed siting axes (§RESI-ORCH-MASSING-SHAPES). */
        | MassingShapeAxisKey
        /**
         * ⭐ STR §25.2's arithmetic, on the option that names a ground-floor area: *"The maximum
         * total buildable area BRUT is 320. We should let the user know that only in first floor he
         * will be able to build 120 sqm."*
         */
        | 'upper-floors-remaining';
    readonly label: string;
    /**
     * 0..1 for a bar, or `null` when the axis is not derivable from what this parcel actually
     * published. ⛔ NEVER 0 as a stand-in for "unknown" — that is the one substitution
     * `designMeasurement.ts` exists to forbid, and a 0-length bar reads as a measured worst case.
     */
    readonly normalised: number | null;
    /** The real figure in its own units, or `null`. Never "0" for an unknown. */
    readonly display: string | null;
    /** What the number MEANS. Deliberately not "higher is better" — see the header. */
    readonly meaning: string;
}

export interface MassingOption {
    /** Stable and derived from the family alone — no RNG, no index, no clock. A re-render of the
     *  same envelope yields the same ids, so a pick survives a repaint. */
    readonly id: string;
    readonly family: MassingOptionFamily;
    readonly label: string;
    /** The plate, ready to hand to `setTargetFootprintProposal`. `null` only when refused. */
    readonly proposal: TargetFootprintProposal | null;
    readonly footprintAreaM2: number | null;
    /** 0..1 of the permitted footprint actually achieved (not the target fraction). */
    readonly coverageOfPermitted: number | null;
    /** Storeys needed to realise the PERMITTED floor area on this plate. `null` when no GFA. */
    readonly storeysToRealisePermittedGfa: number | null;
    /** Floor area this option actually realises within the storey cap. `null` when not derivable. */
    readonly realisedGfaM2: number | null;
    /** Building height at the storey count, or `null`. Derived by even division — see the text. */
    readonly heightM: number | null;
    readonly limitations: readonly MassingLimitation[];
    readonly scores: readonly MassingScoreAxis[];
    /** Plain language: what this option IS and why it looks like this. */
    readonly statement: string;
    /**
     * `true` iff any limitation is an `error` — which today means exactly one thing: PRYZM could
     * not produce this plate at all (`plate-unreachable`).
     *
     * ⛔ A REFUSED OPTION IS SHOWN, NEVER HIDDEN. The user is entitled to know that a shape they
     * might have wanted is out of reach and why; silently shipping three options where four were
     * enumerated would make an absence indistinguishable from a design decision.
     *
     * ⛔ AND A FLOOR-AREA SHORTFALL IS NOT A REFUSAL — see `storeys-exceed-cap`.
     */
    readonly refused: boolean;
}

export interface MassingOptionInputs {
    /** `BuildableEnvelope.insetPolygon`, scene-XZ metres. */
    readonly permittedRing: readonly Pt[];
    /** The card's ONE producer of this number (`permittedStudyFigures`) — never re-derived here. */
    readonly permittedFootprintM2: number;
    /** The card's permitted GFA (`footprint × storeys`), already `null` when storeys were not derived. */
    readonly permittedGfaM2: number | null;
    readonly maxFloors: number | null;
    readonly maxHeightM: number | null;
    /** The committed parcel's area, for the open-ground axis. `null` when unknown. */
    readonly parcelAreaM2: number | null;
    /**
     * ⭐ THE TARGET GROUND-FLOOR AREA the SHAPE families are solved against — the founder's
     * *"180 sqm brut in ground floor"*.
     *
     * ⚠ THREE-VALUED, AND THE THREE ARE DIFFERENT ANSWERS:
     *   • a number     → solve the shapes against it;
     *   • `null`       → there is no target; the shape families are withheld and the fold's caveat
     *                    says so. Used by tests to keep the enumerator pure;
     *   • **omitted**  → read the LIVE §5 target-area channel (`targetFootprintAreaState`, through
     *                    its own staleness gate). This is the production path, and it is the ONE
     *                    place this otherwise-pure module reads a store — declared here rather than
     *                    hidden, because a hidden store read is how two surfaces come to disagree.
     */
    readonly targetGroundFloorAreaM2?: number | null;
    /**
     * The site facts the shape families are SCORED against — lat/lon for the real sun raycast, and
     * the neighbouring buildings for overlooking and outlook.
     *
     * ⚠ SAME THREE-VALUED CONVENTION as `targetGroundFloorAreaM2`: a value is used verbatim, `null`
     * means "no siting data, withhold those axes", and OMITTING it reads the live site
     * (`resolveLiveMassingSitingContext`).
     */
    readonly siting?: MassingSitingContext | null;
    /** Override the shape engine's assumed wing depth (metres). Omit for its stated default. */
    readonly wingDepthM?: number;
}

export type MassingOptionSet =
    | { readonly ok: true; readonly options: readonly MassingOption[]; readonly caveat: string }
    | { readonly ok: false; readonly reason: 'no-permitted-footprint'; readonly text: string };

/** Two plates within this many m² of each other are the same plate. An erosion on a small or
 *  awkward ring can collapse two coverage targets onto one geometry, and shipping the same
 *  rectangle twice under two names is a fake choice. */
const DEDUPE_TOLERANCE_M2 = 1;

/**
 * THE enumerator. Pure; total; deterministic; never throws.
 *
 * ⭐ ORDERED BY COVERAGE, DESCENDING. That is a stable presentation order, NOT a ranking — see the
 * header for why this module refuses to rank.
 */
export function enumerateMassingOptions(inputs: MassingOptionInputs): MassingOptionSet {
    const span = _tracer.startSpan('pryzm.site.enumerateMassingOptions');
    try {
        const permitted = Number.isFinite(inputs.permittedFootprintM2) ? inputs.permittedFootprintM2 : 0;
        if (inputs.permittedRing.length < 3 || !(permitted > 0)) {
            span.setAttribute('pryzm.massing.refusal', 'no-permitted-footprint');
            return {
                ok: false,
                reason: 'no-permitted-footprint',
                text:
                    'PRYZM has not solved a buildable footprint for this parcel, so there is nothing to '
                    + 'generate massing options inside. Every option here is a fraction of the permitted '
                    + 'footprint; without one, each would be a guess wearing four different labels.',
            };
        }

        const out: MassingOption[] = [];
        const seenAreas: number[] = [];
        for (const family of MASSING_OPTION_FAMILIES) {
            const fraction = MASSING_FAMILY_COVERAGE[family];
            const solved = solveTargetFootprintArea({
                permittedRing: inputs.permittedRing,
                permittedAreaM2: permitted,
                targetAreaM2: permitted * fraction,
            });
            const option = solved.ok
                ? buildOption(family, solved, inputs, permitted)
                : buildUnreachableOption(family, permitted, solved.statement);

            // ⛔ DEDUPE ON THE ACHIEVED AREA, not on the requested fraction. Two targets that
            // erode to the same ring are ONE option; presenting them twice manufactures a choice
            // the geometry did not offer.
            const area = option.footprintAreaM2;
            if (area !== null) {
                if (seenAreas.some((a) => Math.abs(a - area) <= DEDUPE_TOLERANCE_M2)) continue;
                seenAreas.push(area);
            }
            out.push(option);
        }

        // ── ⭐ THE SHAPE FAMILIES (STR §25.3) ─────────────────────────────────────────────────
        // Appended AFTER the coverage families, deliberately: the coverage list answers a question
        // that needs no input, so it is what a user sees before they have decided anything. The
        // shapes answer *"given the area I named, what buildings fit?"* and cannot exist before
        // that area does.
        const target = inputs.targetGroundFloorAreaM2 === undefined
            ? resolveLiveTargetGroundFloorAreaM2(permitted)
            : inputs.targetGroundFloorAreaM2;
        const siting = inputs.siting === undefined
            ? resolveLiveMassingSitingContext()
            : inputs.siting;

        let caveat = MASSING_FAMILIES_NOT_YET_SOLVED;
        if (target === null || !(target > 0)) {
            // ⛔ WITHHELD, AND SAID SO. Emitting four refused shape cards here would bury the ONE
            // action that unblocks them under four repetitions of the same sentence; the caveat
            // slot already renders on every computed fold and names the action instead.
            caveat = MASSING_SHAPES_NEED_A_TARGET_AREA;
            span.setAttribute('pryzm.massing.shapesWithheld', 'no-target-area');
        } else {
            const shapes = enumerateMassingShapes({
                buildableRing: inputs.permittedRing,
                buildableAreaM2: permitted,
                targetAreaM2: target,
                siting,
                ...(inputs.wingDepthM !== undefined ? { wingDepthM: inputs.wingDepthM } : {}),
            });
            for (const outcome of shapes) {
                // ⛔ A REFUSED SHAPE IS LISTED, NOT DROPPED — the same rule the coverage families
                // follow. A user who asked for an L is entitled to know that PRYZM refused to
                // invent a non-orthogonal one, and why.
                out.push(buildShapeOption(outcome, inputs, permitted, target));
            }
            span.setAttribute('pryzm.massing.shapeCount', shapes.length);
        }

        span.setAttribute('pryzm.massing.optionCount', out.length);
        span.setAttribute('pryzm.massing.refusedCount', out.filter((o) => o.refused).length);
        return Object.freeze({
            ok: true,
            options: Object.freeze(out),
            caveat,
        });
    } finally {
        span.end();
    }
}

/** The `plate-unreachable` arm — the erosion could not make this coverage on this shape. */
function buildUnreachableOption(
    family: MassingCoverageFamily,
    permitted: number,
    solverStatement: string,
): MassingOption {
    return Object.freeze({
        id: `massing-${family}`,
        family,
        label: MASSING_FAMILY_LABEL[family],
        proposal: null,
        footprintAreaM2: null,
        coverageOfPermitted: null,
        storeysToRealisePermittedGfa: null,
        realisedGfaM2: null,
        heightM: null,
        limitations: Object.freeze([{
            code: 'plate-unreachable' as const,
            severity: 'error' as const,
            // The solver's own sentence, verbatim — one wording for one fact (C84 EI-8a).
            text: solverStatement,
        }]),
        scores: Object.freeze([]),
        statement:
            `PRYZM could not produce a plate covering ${(MASSING_FAMILY_COVERAGE[family] * 100).toFixed(0)} % `
            + `of the ${permitted.toFixed(0)} m² permitted footprint on this shape. The option is shown `
            + `refused rather than dropped, so the absence is a stated finding and not a gap in the list.`,
        refused: true,
    });
}

/** The normal arm. Every derived figure names what it was derived from. */
function buildOption(
    family: MassingCoverageFamily,
    proposal: TargetFootprintProposal,
    inputs: MassingOptionInputs,
    permitted: number,
): MassingOption {
    const area = proposal.achievedAreaM2;
    const coverage = area / permitted;
    const limitations: MassingLimitation[] = [];

    if (family !== 'full-plate') {
        limitations.push({
            code: 'shape-approximated',
            severity: 'warning',
            text:
                `This plate is a uniform erosion of the permitted footprint, ${proposal.insetM.toFixed(2)} m `
                + 'on every edge. It is a STUDY of how much ground you cover — not a setback or shaping '
                + 'rule the ordinance made, and not a shape PRYZM is recommending.',
        });
    }

    // ── STOREYS: how many does realising the PERMITTED floor area take on THIS plate? ──
    const permittedGfa = inputs.permittedGfaM2;
    let storeysNeeded: number | null = null;
    let realisedGfa: number | null = null;
    if (permittedGfa === null || !(permittedGfa > 0)) {
        limitations.push({
            code: 'gfa-not-derived',
            severity: 'warning',
            text:
                'No maximum floor area was derived for this zone (the storey count is not known), so PRYZM '
                + 'cannot say how many storeys this plate would need. The footprint below is still real; the '
                + 'storey figure is withheld rather than guessed.',
        });
    } else {
        // ⛔ THE CEIL IS TAKEN AGAINST THE PLATE'S UPPER MEASUREMENT BOUND, NOT ITS NOMINAL AREA,
        // AND THIS IS NOT A FUDGE.
        //
        // `solveTargetFootprintArea` states its own accuracy: it hits a target to within
        // `max(0.25 m², 0.25 % of the target)`. So a "half plate" of a 1,000 m² footprint comes back
        // as 499 m², not 500 — inside its stated tolerance, and correct. Dividing a 3,000 m²
        // allowance by the nominal 499 gives 6.01, and a bare `Math.ceil` turns a sub-square-metre
        // measurement wobble into A WHOLE EXTRA STOREY. The user would read "7 storeys" for a plate
        // that plainly needs six, and the number would flip between renders of the same parcel.
        //
        // ⭐ The margin is the PRODUCER'S OWN DOCUMENTED ERROR, not a constant chosen because it
        // made a case come out right ([[tolerance-from-measured-error-not-the-test]]). If the
        // solver's tolerance changes, this line is wrong in a way its own comment will say out loud.
        // `realisedGfaM2` below still uses the ACTUAL area — the margin decides how many storeys
        // are needed, never how much floor they yield.
        const plateToleranceM2 = Math.max(0.25, area * 0.0025);
        storeysNeeded = Math.ceil(permittedGfa / (area + plateToleranceM2));
        const cap = inputs.maxFloors;
        if (cap !== null && cap > 0 && storeysNeeded > cap) {
            // ⛔ STATED WITH BOTH NUMBERS. Never silently shrunk to fit — see the header. And
            // never marked an ERROR: see the `storeys-exceed-cap` doc comment for why a shortfall
            // is a trade-off the user may take, not an option PRYZM is entitled to withdraw.
            realisedGfa = area * cap;
            limitations.push({
                code: 'storeys-exceed-cap',
                severity: 'warning',
                text:
                    `Reaching the permitted ${permittedGfa.toFixed(0)} m² of floor area on a `
                    + `${area.toFixed(0)} m² plate would take ${storeysNeeded} storeys. The ordinance permits `
                    + `${cap}. PRYZM does not shrink the answer to fit: at ${cap} storeys this plate yields `
                    + `${realisedGfa.toFixed(0)} m², which is ${(permittedGfa - realisedGfa).toFixed(0)} m² `
                    + 'less than the parcel permits. Choosing this option means accepting that shortfall.',
            });
        } else {
            realisedGfa = area * storeysNeeded;
        }
    }

    // ── HEIGHT: only from a DERIVED maximum, and only by a NAMED even division. ──
    let heightM: number | null = null;
    const effectiveStoreys = storeysNeeded === null
        ? null
        : inputs.maxFloors !== null && inputs.maxFloors > 0
            ? Math.min(storeysNeeded, inputs.maxFloors)
            : storeysNeeded;
    if (inputs.maxHeightM === null || !(inputs.maxHeightM > 0)
        || inputs.maxFloors === null || !(inputs.maxFloors > 0)) {
        limitations.push({
            code: 'height-not-derived',
            severity: 'warning',
            text:
                'The rule pack derived no maximum height (or no storey count) for this zone, so PRYZM will '
                + 'not state a height for this option. A height divided out of numbers PRYZM does not have '
                + 'would look exactly like one it read from the ordinance.',
        });
    } else if (effectiveStoreys !== null) {
        heightM = effectiveStoreys * (inputs.maxHeightM / inputs.maxFloors);
    }

    const scores = buildScores(inputs, {
        area, coverage, storeysNeeded, effectiveStoreys, realisedGfa, permittedGfa,
    });

    const refused = limitations.some((l) => l.severity === 'error');
    const openGround = inputs.parcelAreaM2 !== null && inputs.parcelAreaM2 > 0
        ? inputs.parcelAreaM2 - area
        : null;

    const statement =
        `${MASSING_FAMILY_MEANING[family]} `
        + `This plate is ${area.toFixed(0)} m² — ${(coverage * 100).toFixed(0)} % of the `
        + `${permitted.toFixed(0)} m² permitted footprint`
        + (openGround !== null ? `, leaving ${openGround.toFixed(0)} m² of the plot unbuilt` : '')
        + '. '
        + (storeysNeeded === null
            ? 'PRYZM cannot say how many storeys it would take to reach the permitted floor area, because '
              + 'no floor area was derived for this zone.'
            : effectiveStoreys !== null && effectiveStoreys < storeysNeeded
                ? `Reaching the permitted floor area would take ${storeysNeeded} storeys; the ordinance permits `
                  + `${inputs.maxFloors}.`
                : `Reaching the permitted floor area takes ${storeysNeeded} storey${storeysNeeded === 1 ? '' : 's'}`
                  + (heightM !== null
                      ? `, about ${heightM.toFixed(1)} m tall (the permitted height divided evenly between the `
                        + 'permitted storeys — a study figure, not a regulated storey height).'
                      : '.'))
        + ' A STUDY of what fits, not a permit.';

    return Object.freeze({
        id: `massing-${family}`,
        family,
        label: MASSING_FAMILY_LABEL[family],
        proposal,
        footprintAreaM2: area,
        coverageOfPermitted: coverage,
        storeysToRealisePermittedGfa: storeysNeeded,
        realisedGfaM2: realisedGfa,
        heightM,
        limitations: Object.freeze(limitations),
        scores,
        statement,
        refused,
    });
}

/**
 * The comparable axes. ⛔ Each `meaning` says what the number IS; none says which end is better.
 * That judgement belongs to the person looking at the parcel, not to this module (see the header).
 */
function buildScores(
    inputs: MassingOptionInputs,
    v: {
        area: number;
        coverage: number;
        storeysNeeded: number | null;
        effectiveStoreys: number | null;
        realisedGfa: number | null;
        permittedGfa: number | null;
    },
): readonly MassingScoreAxis[] {
    const cap = inputs.maxFloors !== null && inputs.maxFloors > 0 ? inputs.maxFloors : null;
    const parcel = inputs.parcelAreaM2 !== null && inputs.parcelAreaM2 > 0 ? inputs.parcelAreaM2 : null;
    const openGround = parcel === null ? null : Math.max(0, parcel - v.area);
    return Object.freeze([
        {
            key: 'coverage' as const,
            label: 'Footprint used',
            normalised: Math.min(1, v.coverage),
            display: `${(v.coverage * 100).toFixed(0)} % · ${v.area.toFixed(0)} m²`,
            meaning: 'How much of the permitted buildable footprint this option builds on.',
        },
        {
            key: 'open-ground' as const,
            label: 'Open ground',
            normalised: parcel === null || openGround === null ? null : Math.min(1, openGround / parcel),
            display: openGround === null ? null : `${openGround.toFixed(0)} m² of the plot left unbuilt`,
            meaning: 'How much of the whole plot stays unbuilt — garden, yard, parking or setback.',
        },
        {
            key: 'storeys' as const,
            label: 'Storeys needed',
            normalised: v.storeysNeeded === null || cap === null
                ? null
                : Math.min(1, v.storeysNeeded / cap),
            display: v.storeysNeeded === null
                ? null
                : `${v.storeysNeeded}${cap === null ? '' : ` of ${cap} permitted`}`,
            meaning: 'Storeys required to reach the permitted floor area on this plate.',
        },
        {
            key: 'gfa-realised' as const,
            label: 'Floor area realised',
            normalised: v.realisedGfa === null || v.permittedGfa === null || !(v.permittedGfa > 0)
                ? null
                : Math.min(1, v.realisedGfa / v.permittedGfa),
            display: v.realisedGfa === null
                ? null
                : `${v.realisedGfa.toFixed(0)} m²`
                  + (v.permittedGfa === null ? '' : ` of ${v.permittedGfa.toFixed(0)} m² permitted`),
            meaning: 'Floor area this option actually achieves within the permitted storey count.',
        },
        {
            key: 'storey-headroom' as const,
            label: 'Storeys left over',
            normalised: v.effectiveStoreys === null || cap === null
                ? null
                : Math.max(0, Math.min(1, (cap - v.effectiveStoreys) / cap)),
            display: v.effectiveStoreys === null || cap === null
                ? null
                : `${Math.max(0, cap - v.effectiveStoreys)}`,
            meaning: 'Permitted storeys this option does not use — room to grow, or to give away.',
        },
    ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// §RESI-ORCH-MASSING-SHAPES — the SHAPE families, mapped onto the card's option shape.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turn one shape-engine outcome into a `MassingOption` the shipped card already knows how to draw.
 *
 * ⛔ IT MINTS NO SECOND CHANNEL. A produced shape becomes a real `TargetFootprintProposal`, so
 * picking it writes the SAME session slot a typed target writes, the SAME scene draws it, and the
 * SAME adopt step commits it. That is why this adapter exists at all instead of the shape engine
 * emitting cards of its own: two proposal channels is how a card and a scene come to disagree about
 * which plate is on the ground.
 */
function buildShapeOption(
    outcome: MassingShapeOutcome,
    inputs: MassingOptionInputs,
    permitted: number,
    target: number,
): MassingOption {
    if (!outcome.ok) {
        // ⭐ A REFUSED FAMILY IS AN OPTION CARD WITH NO PICK BUTTON, exactly like `plate-unreachable`.
        // `severity: 'error'` ⇒ `refused: true` ⇒ the card renders it greyed with its reason and
        // without a control that could only fail.
        return Object.freeze({
            id: `massing-shape-${outcome.family}`,
            family: outcome.family,
            label: MASSING_SHAPE_LABEL[outcome.family],
            proposal: null,
            footprintAreaM2: null,
            coverageOfPermitted: null,
            storeysToRealisePermittedGfa: null,
            realisedGfaM2: null,
            heightM: null,
            limitations: Object.freeze([{
                code: 'shape-family-refused' as const,
                severity: 'error' as const,
                // The shape engine's own sentence, verbatim — one wording for one fact (C84 EI-8a).
                text: outcome.text,
            }]),
            scores: Object.freeze([]),
            statement:
                `PRYZM did not produce a ${MASSING_SHAPE_LABEL[outcome.family]} for a `
                + `${target.toFixed(0)} m² ground floor on this outline. The family is shown refused rather `
                + `than dropped, so the absence is a stated finding and not a gap in the list.`,
            refused: true,
        });
    }

    const c = outcome.candidate;
    const area = c.areaM2;

    // The plate, on the ONE proposal channel.
    // ⚠ `insetM: 0` IS A FACT, NOT A PLACEHOLDER. That field means "the uniform erosion distance
    // that produced this ring"; a shape is not an erosion, so the honest value is zero erosion, and
    // no sentence built here claims otherwise. (The `shape-approximated` limitation, which DOES
    // print an inset distance, belongs to the coverage families and is never attached to a shape.)
    const proposal: TargetFootprintProposal = {
        ok: true,
        ring: c.ring.map((p) => ({ x: p.x, z: p.z })),
        achievedAreaM2: area,
        targetAreaM2: target,
        permittedAreaM2: permitted,
        insetM: 0,
        statement: c.statement,
    };

    const limitations: MassingLimitation[] = c.notes.map((n) => ({
        code: n.code,
        severity: n.severity,
        text: n.text,
    }));

    // ── STOREYS + GFA on THIS footprint, by the same arithmetic the coverage families use ──
    const permittedGfa = inputs.permittedGfaM2;
    let storeysNeeded: number | null = null;
    let realisedGfa: number | null = null;
    if (permittedGfa === null || !(permittedGfa > 0)) {
        limitations.push({
            code: 'gfa-not-derived',
            severity: 'warning',
            text:
                'No maximum floor area was derived for this zone (the storey count is not known), so PRYZM '
                + 'cannot say how many storeys this shape would need. The footprint is still real; the '
                + 'storey figure is withheld rather than guessed.',
        });
    } else {
        // The SAME margin rule the coverage arm documents: the ceil is taken against the plate's
        // upper measurement bound so a sub-square-metre solve wobble cannot buy a whole storey.
        const plateToleranceM2 = Math.max(0.25, area * 0.0025);
        storeysNeeded = Math.ceil(permittedGfa / (area + plateToleranceM2));
        const cap = inputs.maxFloors;
        if (cap !== null && cap > 0 && storeysNeeded > cap) {
            realisedGfa = area * cap;
            limitations.push({
                code: 'storeys-exceed-cap',
                severity: 'warning',
                text:
                    `Reaching the permitted ${permittedGfa.toFixed(0)} m² of floor area on a `
                    + `${area.toFixed(0)} m² footprint would take ${storeysNeeded} storeys. The ordinance `
                    + `permits ${cap}. PRYZM does not shrink the answer to fit: at ${cap} storeys this shape `
                    + `yields ${realisedGfa.toFixed(0)} m², which is `
                    + `${(permittedGfa - realisedGfa).toFixed(0)} m² less than the parcel permits. Choosing `
                    + `this shape means accepting that shortfall.`,
            });
        } else {
            realisedGfa = area * storeysNeeded;
        }
    }

    let heightM: number | null = null;
    const effectiveStoreys = storeysNeeded === null
        ? null
        : inputs.maxFloors !== null && inputs.maxFloors > 0
            ? Math.min(storeysNeeded, inputs.maxFloors)
            : storeysNeeded;
    if (inputs.maxHeightM !== null && inputs.maxHeightM > 0
        && inputs.maxFloors !== null && inputs.maxFloors > 0
        && effectiveStoreys !== null) {
        heightM = effectiveStoreys * (inputs.maxHeightM / inputs.maxFloors);
    } else {
        limitations.push({
            code: 'height-not-derived',
            severity: 'warning',
            text:
                'The rule pack derived no maximum height (or no storey count) for this zone, so PRYZM will '
                + 'not state a height for this shape. A height divided out of numbers PRYZM does not have '
                + 'would look exactly like one it read from the ordinance.',
        });
    }

    // ── ⭐ STR §25.2's arithmetic, on the very card where the ground floor was chosen ──
    // *"The maximum total buildable area BRUT is 320. We should let the user know that only in first
    // floor he will be able to build 120 sqm."*
    const remainingAbove = permittedGfa === null || !(permittedGfa > 0)
        ? null
        : Math.max(0, permittedGfa - area);
    const floorsAbove = remainingAbove === null || !(area > 0)
        ? null
        : remainingAbove / area;

    const scores: MassingScoreAxis[] = [
        ...c.reasons.map((r) => ({
            key: r.key,
            label: r.label,
            normalised: r.normalised,
            display: r.display,
            meaning: r.meaning,
        })),
        {
            key: 'upper-floors-remaining' as const,
            label: 'Left for the floors above',
            normalised: remainingAbove === null || permittedGfa === null || !(permittedGfa > 0)
                ? null
                : Math.min(1, remainingAbove / permittedGfa),
            display: remainingAbove === null
                ? null
                : `${remainingAbove.toFixed(0)} m² of ${(inputs.permittedGfaM2 ?? 0).toFixed(0)} m² BRUT`
                  + (floorsAbove === null ? '' : ` — about ${floorsAbove.toFixed(1)} more floors of this shape`),
            meaning:
                'Permitted floor area still unspent after this ground floor. This is the number to allocate '
                + 'to the first floor and above; PRYZM does not spend it for you.',
        },
    ];

    const statement =
        `${c.statement}`
        + (remainingAbove === null
            ? ' PRYZM cannot say what is left for the floors above, because no maximum floor area was '
              + 'derived for this zone.'
            : ` Taking ${area.toFixed(0)} m² on the ground leaves ${remainingAbove.toFixed(0)} m² of the `
              + `${(inputs.permittedGfaM2 ?? 0).toFixed(0)} m² total allowance for the floors above.`);

    return Object.freeze({
        id: `massing-shape-${c.family}`,
        family: c.family,
        label: c.label,
        proposal,
        footprintAreaM2: area,
        coverageOfPermitted: permitted > 0 ? area / permitted : null,
        storeysToRealisePermittedGfa: storeysNeeded,
        realisedGfaM2: realisedGfa,
        heightM,
        limitations: Object.freeze(limitations),
        scores: Object.freeze(scores),
        statement,
        // ⛔ A SHAPE THAT WAS PRODUCED IS NEVER REFUSED. Its notes are all `warning` by construction
        // (the engine reserves `error` for a family it could not build, which takes the arm above),
        // and a shortfall against the floor-area allowance is a trade the architect may take — the
        // same false-refusal argument the coverage arm's header makes.
        refused: false,
    });
}
