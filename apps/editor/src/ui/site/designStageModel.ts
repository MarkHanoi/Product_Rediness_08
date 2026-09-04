// §RESI-ORCH-DESIGN-STAGE (lane RESI-ORCH, 2026-09-04) — STR §1/§19: *"where am I, and what can I
// do from here?"*, on the far side of the parcel hand-off.
//
// ── THE GAP THIS CLOSES, STATED EXACTLY ────────────────────────────────────────────────────
// PRYZM already has a staged, reducer-driven "where am I" model — `engine/views/siteEntryModel.ts`,
// `SiteEntryStage = 'world' | 'country' | 'city' | 'parcel'` — and it is good. It also STOPS ONE
// STAGE TOO EARLY: `site.entry.select-parcel` is *"THE hand-off"*, and every one of the founder's
// design stages begins on its far side. So a user who has selected a parcel is told, forever, that
// they are at stage "parcel", with nothing said about the ten things that happen next.
//
// ── ⛔ WHY THIS IS A SECOND LADDER AND NOT FIVE MORE MEMBERS OF `SiteEntryStage` ────────────
// The obvious move — widen that union to nine — is wrong, and the type system says so out loud.
// `SITE_ENTRY_ALTITUDE_M` and `SITE_ENTRY_PITCH_DEG` are `Record<SiteEntryStage, number>`: EVERY
// member of that union must name a CAMERA ALTITUDE, because that ladder's whole job is descending
// the globe. "Requirements" has no altitude. Adding it would force an invented number into a table
// whose entries are all real, and a fabricated 1200 m for "BIM" would then fly the camera somewhere
// on a stage change. Two ladders that MEET at `parcel` is the honest model: one descends the world,
// one ascends the design.
//
// ── ⛔ THE STAGE IS DERIVED, NEVER STORED, AND THAT IS THE WHOLE SAFETY PROPERTY ────────────
// A stored stage is a claim that can outlive its evidence: a project could sit at "BIM" with no
// walls in it, because someone clicked "next" once. Every value here is computed from what actually
// exists in the model this instant, so *"you are at BIM"* is unfalsifiable-by-construction — it
// cannot be asserted about a project with no authored storey. This is `designMeasurement.ts`'s rule
// (measure `null`, never `0`, so an empty project cannot read as compliant) applied to progress
// instead of to area.
//
// ── ⛔ FAILURE IS NOT EMPTINESS, AND IT GETS ITS OWN ARM ────────────────────────────────────
// When the model-measurement join FAILS, PRYZM does not know what is authored. Reporting "you are
// at Massing" would then be an assertion that the project is empty — manufactured out of a
// measurement error. `measurementFailed` therefore suppresses every evidence-based stage and states
// the failure instead. Same defect family as §CONTEXT-DATA-HONESTY, one abstraction up.
//
// PURE: no store, no DOM, no I/O, no clock. Never throws.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.designStageModel');

/**
 * The founder's five design stages, in order. Closed: a sixth must be added HERE, with its entry
 * evidence and its unavailable reason, and the type error at every `switch` is the feature.
 */
export type DesignStage = 'massing' | 'requirements' | 'layout' | 'bim' | 'detail';

export const DESIGN_STAGES: readonly DesignStage[] = Object.freeze([
    'massing', 'requirements', 'layout', 'bim', 'detail',
] as const);

/** The label the user reads. Short on purpose — this renders as a strip, not a paragraph. */
export const DESIGN_STAGE_LABEL: Readonly<Record<DesignStage, string>> = Object.freeze({
    massing: 'Massing',
    requirements: 'Requirements',
    layout: 'Layout',
    bim: 'BIM',
    detail: 'Detail',
});

/** What each stage IS, so a user can tell why they would want to be there. */
export const DESIGN_STAGE_MEANING: Readonly<Record<DesignStage, string>> = Object.freeze({
    massing: 'What can legally and physically be built on this parcel, as a volume.',
    requirements: 'What the building has to contain — rooms, areas, adjacencies.',
    layout: 'Where those spaces go, as alternatives you compare rather than one answer.',
    bim: 'The building as real elements — walls, slabs, openings — that quantities come from.',
    detail: 'Materials, openings, finishes and the drawings that carry them.',
});

/**
 * The EVIDENCE each stage is decided from. Every field is a fact some existing producer already
 * owns; nothing here is a new measurement.
 *
 * ⚠ `measurementFailed` is FIRST among equals — read the header. When it is true, none of the
 * counts below mean anything, and pretending otherwise reports an empty project.
 */
export interface DesignStageInputs {
    /** A committed C19 parcel boundary exists. Without it there is no site at all. */
    readonly hasCommittedParcel: boolean;
    /** An `ok` determination with a real buildable footprint (not a refusal, not a degenerate ring). */
    readonly hasResolvedEnvelope: boolean;
    /** A user-proposed ground-floor plate or a study massing is on the ground (§5 / §MANUALENV159). */
    readonly hasMassingProposal: boolean;
    /**
     * A declared programme / brief exists (§8's requirements table).
     *
     * ⛔ TRI-STATE, AND `null` IS NOT A CONVENIENCE. `false` asserts *"this project has declared no
     * programme"* — a finding. `null` says *"the surface asking cannot see a programme store from
     * here"* — an admission about PRYZM. The envelope card genuinely cannot read one today, and
     * passing `false` from there would print a finding about the user's project derived from a gap
     * in PRYZM's own wiring. That is the §CONTEXT-DATA-HONESTY conflation (failure and emptiness
     * rendering as one value) at the level of a stage rather than a number.
     */
    readonly hasProgramme: boolean | null;
    /** Storeys carrying authored elements — `DesignMeasurement.designedStoreyCount`. */
    readonly designedStoreyCount: number;
    /** Any room with a real area. */
    readonly hasRooms: boolean;
    /** ⛔ The model-measurement join threw this session. Failure, NOT an empty model. */
    readonly measurementFailed: boolean;
}

/** How a stage renders. `done` and `current` are both REACHED; `available` is the next honest step. */
export type DesignStageState = 'done' | 'current' | 'available' | 'unavailable';

export interface DesignStageStatus {
    readonly stage: DesignStage;
    readonly label: string;
    readonly state: DesignStageState;
    /**
     * Non-empty on EVERY arm. A reached stage says what it means; an unavailable one says what is
     * missing. ⛔ An empty string here would re-create the greyed-control-with-no-explanation that
     * `SiteEntryPanel` was built to end (*"an unavailable action renders greyed WITH its reason
     * printed"*) — this module copies that rule rather than reinventing it.
     */
    readonly reason: string;
}

const MEASURE_FAILED =
    'PRYZM could not read the authored model this session, so it cannot say whether this stage has '
    + 'been reached. This is a failure to measure — NOT a finding that nothing is drawn.';

const NO_PARCEL =
    'No parcel is committed yet. Every design stage starts from a plot, so this one cannot be '
    + 'reached until one is selected or drawn.';

const NO_ENVELOPE =
    'PRYZM has not resolved a buildable envelope for this parcel, so there is nothing to design '
    + 'inside. Until it does, anything drawn here would be unchecked against the ordinance.';

/**
 * ⛔ THE EVIDENCE FOR EACH STAGE, AND NOTHING ELSE DECIDES IT. Each predicate answers "does this
 * stage's OWN artefact exist?" — never "did the user click past the previous one".
 *
 * A consequence worth stating because it looks like a bug and is not: a project can have reached
 * BIM while `requirements` is unreached (someone generated from a footprint without declaring a
 * programme). The strip then shows a REACHED stage after an unreached one, which is the truth about
 * that project. Forcing monotonicity would mean either claiming a programme that does not exist or
 * denying a building that does.
 */
function reached(stage: DesignStage, i: DesignStageInputs): boolean {
    switch (stage) {
        case 'massing':
            return i.hasResolvedEnvelope || i.hasMassingProposal;
        case 'requirements':
            // Only an explicit TRUE reaches this stage. `null` — "PRYZM cannot see" — is not
            // evidence of arrival, and must never be coerced to either boolean.
            return i.hasProgramme === true;
        case 'layout':
            // A layout exists once rooms do — rooms are the layout's artefact, whether they were
            // generated, sketched or derived from walls.
            return i.hasRooms;
        case 'bim':
            return i.designedStoreyCount > 0;
        case 'detail':
            // Deliberately NOT modelled from evidence yet: PRYZM has no "is this detailed?" signal
            // that is not a guess (a material assignment is not detailing). Claiming it from
            // storey count would make every generated shell read as a detailed building.
            return false;
    }
}

/** Why a stage cannot be reached yet — the specific missing thing, never a generic "not yet". */
function whyUnavailable(stage: DesignStage, i: DesignStageInputs): string {
    if (i.measurementFailed) return MEASURE_FAILED;
    if (!i.hasCommittedParcel) return NO_PARCEL;
    switch (stage) {
        case 'massing':
            return NO_ENVELOPE;
        case 'requirements':
            return i.hasProgramme === null
                // ⛔ AN ADMISSION ABOUT PRYZM, NOT A FINDING ABOUT THE PROJECT. The programme table
                // exists (`dataworkbench/ProgrammePanel.ts`) but nothing joins it to this surface,
                // so "no programme declared" would be a claim this card has no standing to make.
                ? 'PRYZM cannot read a declared programme from this panel, so it cannot say whether '
                    + 'this stage has been reached. The programme table lives in the Data Workbench '
                    + 'and is not joined to the site card yet — this is a gap in PRYZM, not a '
                    + 'statement about your project.'
                : 'No programme is declared for this project yet — no rooms, areas or adjacencies '
                    + 'have been stated, so there is nothing for a layout to satisfy.';
        case 'layout':
            return 'No rooms exist yet. A layout is the arrangement of spaces, so PRYZM has nothing '
                + 'to arrange or to compare alternatives of.';
        case 'bim':
            return 'No storey carries an authored building element yet, so there is no building to '
                + 'take quantities from.';
        case 'detail':
            return 'PRYZM has no measurement of how detailed a design is, so it will not claim this '
                + 'stage has been reached. Materials, openings and finishes are edited from the model '
                + 'itself — this strip simply does not pretend to track it.';
    }
}

/**
 * THE furthest stage actually reached, or `null` when none is — which is the honest answer for a
 * project that has a parcel and nothing else, and for one whose measurement failed.
 *
 * Pure; total; never throws.
 */
export function currentDesignStage(inputs: DesignStageInputs): DesignStage | null {
    if (inputs.measurementFailed) return null;
    let furthest: DesignStage | null = null;
    for (const s of DESIGN_STAGES) {
        if (reached(s, inputs)) furthest = s;
    }
    return furthest;
}

/**
 * The whole strip, one status per stage. Pure; total; never throws.
 *
 * ⭐ `available` marks the FIRST unreached stage whose evidence could plausibly be produced next —
 * the *"what can I do from here"* half of §19. It is offered on at most one stage, because offering
 * five next steps is the same as offering none.
 */
export function describeDesignStages(inputs: DesignStageInputs): readonly DesignStageStatus[] {
    const span = _tracer.startSpan('pryzm.site.describeDesignStages');
    try {
        const current = currentDesignStage(inputs);
        const currentIndex = current === null ? -1 : DESIGN_STAGES.indexOf(current);
        let offeredNext = false;

        const out = DESIGN_STAGES.map<DesignStageStatus>((stage, index) => {
            const isReached = !inputs.measurementFailed && reached(stage, inputs);
            if (isReached) {
                return {
                    stage,
                    label: DESIGN_STAGE_LABEL[stage],
                    state: index === currentIndex ? 'current' : 'done',
                    reason: DESIGN_STAGE_MEANING[stage],
                };
            }
            // The next honest step: the EARLIEST unreached stage, offered once, and only when the
            // model is readable and a parcel exists — otherwise the true next step is upstream of
            // this strip entirely (select a parcel; fix the measurement), and pointing at a design
            // stage would send the user to the wrong place.
            //
            // `detail` is never offered: `reached('detail')` is hard-false because PRYZM has no
            // measurement of detailing, and offering a step whose completion can never be detected
            // is a control that can only ever look unfinished.
            const canOffer =
                !offeredNext
                && !inputs.measurementFailed
                && inputs.hasCommittedParcel
                && stage !== 'detail';
            if (canOffer) {
                offeredNext = true;
                return {
                    stage,
                    label: DESIGN_STAGE_LABEL[stage],
                    state: 'available',
                    // ⚠ `available` carries the MISSING THING as its reason, not an encouragement.
                    // "Do this next" without "because X does not exist yet" is how a user ends up
                    // clicking a control that then refuses.
                    reason: whyUnavailable(stage, inputs),
                };
            }
            return {
                stage,
                label: DESIGN_STAGE_LABEL[stage],
                state: 'unavailable',
                reason: whyUnavailable(stage, inputs),
            };
        });

        span.setAttribute('pryzm.designStage.current', current ?? 'none');
        span.setAttribute(
            'pryzm.designStage.reachedCount',
            out.filter((s) => s.state === 'done' || s.state === 'current').length,
        );
        return out;
    } finally {
        span.end();
    }
}
