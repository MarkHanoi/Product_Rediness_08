// §RESI-ORCH-ADOPT (lane RESI-ORCH, 2026-09-04) — the R5 edge the plan said did not exist:
// *"a chosen massing option → proposed envelope → …"*. The user's proposed ground-floor plate
// (§5, a SESSION study) becomes a real, undoable, persisted LEVEL ENVELOPE element (C114) through
// the ordinary command bus. This module builds the payload; it dispatches nothing.
//
// ── WHY THIS IS A CONSUMPTION OF C114, NOT A RIVAL TO IT ────────────────────────────────────
// `plugins/space-envelope` owns the family: its schema, its store, its ONE create verb
// (`spaceEnvelope.batch.create`, C114 §6a — the batch verb even for one envelope, so one gesture
// is one undo entry). This module only speaks that verb's payload. It mints nothing the plugin
// recomputes (`footprintAreaM2`, `volumeM3` — C114 §5 says a payload that supplies them is not
// believed), and it never passes `role: 'maximumBuildable'` — the proposal is what the user
// INTENDS, which is exactly what a level envelope records (`standing: 'design-intent'`).
//
// ── ⛔ THE GROUND FLOOR IS THE GROUND FLOOR, NOT THE ACTIVE LEVEL ────────────────────────────
// The §5 proposal is by definition a GROUND-floor plate. Seating it on whatever storey happens to
// be active would put "the ground floor you asked for" on level 3 because that is where the user
// last clicked. So the target storey is the lowest level whose elevation is not below the datum —
// and when no such storey exists, this REFUSES with the reason rather than inventing a level.
//
// ── ⛔ THE HEIGHT NAMES ITS SOURCE ───────────────────────────────────────────────────────────
// A space envelope must have a positive height (schema). The ladder is: the storey's own recorded
// floor-to-floor → the ordinance's max height ÷ derived storeys → 3.0 m ASSUMED. The third rung is
// a synthesised value, and §ENVELOPE-SITE-DATA forbids synthesising a missing value SILENTLY — so
// the source travels with the spec and the statement prints it, and the envelope's NAME carries it
// too, because the name is the one field that follows the element into every panel.
//
// ── ⭐ CHOOSING A DIFFERENT MASSING OPTION *REPLACES*, IT DOES NOT ACCUMULATE ────────────────
// §KEEPING-A-MASSING-OPTION-ACCUMULATES-INSTEAD-OF-REPLACING (L-13038, 2026-09-07). Founder:
// *"WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE SHALL BE REMOVED."* Every press used to
// mint a rival on the same storey, and the room solver then refused to guess between them — a
// correct refusal about a state the user never meant to create.
//
// So this planner now takes WHAT IS ALREADY ON THE STOREY and returns the ids to supersede with
// the creation, in ONE `spaceEnvelope.batch.create` (C114 §6a — one gesture, one Ctrl+Z; a
// separate delete would be a second ring entry). ⛔ THE JUDGEMENT IS NOT MADE HERE: whether an
// existing envelope is PRYZM's own generated plate or the user's drawing is
// `levelEnvelopeSupersession.ts`'s single rule, keyed on `provenance` and never on the name.
//
// PURE: no store, no DOM, no bus, no clock, no RNG (the id is minted by the CALLER — C16 CA-2:
// `execute()` runs again on REDO, so an id minted anywhere near the handler would differ the
// second time). Never throws.

import { trace } from '@opentelemetry/api';
import {
    regeneratedProvenance,
    systemProvenance,
    type ValueProvenance,
} from '@pryzm/schemas/provenance';
import type { TargetFootprintProposal } from './targetFootprintAreaSolver';
import {
    resolveLevelEnvelopeSupersession,
    type ExistingLevelEnvelope,
    type LevelEnvelopeReadResult,
} from './levelEnvelopeSupersession';

const _tracer = trace.getTracer('pryzm.site.adoptProposalAsEnvelope');

/** A storey datum as `bimManager.getLevels()` returns it (fields optional — it is `unknown[]`). */
export interface AdoptLevelCandidate {
    readonly id: string;
    readonly name: string | null;
    readonly elevation: number;
    /** Floor-to-floor (m); `null` when the record carries none. */
    readonly height: number | null;
}

/** How the envelope's height was decided — printed, never hidden. */
export type AdoptHeightSource = 'level-record' | 'derived-floor-to-floor' | 'assumed-3m';

export type AdoptRefusalReason =
    /** No proposal is live (withdrawn, refused, or stale against a re-solved envelope). */
    | 'no-proposal'
    /** The project has no storeys at all. */
    | 'no-levels'
    /** Every storey is below the datum — there is no ground floor to seat a ground-floor plate on. */
    | 'no-ground-level'
    /**
     * §L-13038 — PRYZM could not READ what is already on the storey. ⛔ Creating anyway is what
     * produced three rivals; an unreadable store is not an empty one (§CONTEXT-DATA-HONESTY).
     */
    | 'envelopes-unreadable'
    /**
     * §L-13038 — the storey already carries a level envelope PRYZM cannot prove it generated.
     * Refusing protects a hand-drawn or hand-edited volume from a silent delete (C58 §1.19).
     */
    | 'rival-envelope-not-generated';

/** The exact `spaceEnvelope.batch.create` spec shape (C114 §6), spelled locally so this module
 *  needs no import from the plugin it consumes — the bus is the boundary. */
export interface AdoptEnvelopeSpec {
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    readonly footprint: readonly { readonly x: number; readonly y: 0; readonly z: number }[];
    readonly baseOffset: 0;
    readonly height: number;
    readonly role: 'level';
    readonly withinId: null;
    readonly name: string;
    /**
     * §L-13038 — WHO made this envelope, carried into the record so a LATER press can tell this
     * plate from a volume the architect drew. `computed` when it is the first on its storey,
     * `regenerated` (carrying what it replaced, C75 §2.7) when it supersedes one.
     */
    readonly provenance: ValueProvenance;
}

export interface AdoptProposalPlan {
    readonly ok: true;
    readonly command: 'spaceEnvelope.batch.create';
    readonly payload: {
        readonly envelopes: readonly [AdoptEnvelopeSpec];
        /**
         * §L-13038 — the level envelopes this creation REPLACES, removed in the same command so
         * the swap is ONE undo (C114 §6a). Empty when the storey was clear.
         */
        readonly supersedes: readonly string[];
    };
    readonly level: AdoptLevelCandidate;
    readonly heightSource: AdoptHeightSource;
    readonly heightM: number;
    /** §L-13038 — what is being replaced, as VALUES, so a surface renders them without parsing prose. */
    readonly replaces: readonly ExistingLevelEnvelope[];
    /** Plain language: what will be created, on which storey, at what height and why that height. */
    readonly statement: string;
}

export interface AdoptProposalRefusal {
    readonly ok: false;
    readonly reason: AdoptRefusalReason;
    readonly statement: string;
}

export type AdoptProposalResult = AdoptProposalPlan | AdoptProposalRefusal;

const ASSUMED_HEIGHT_M = 3;

/**
 * §PL-ENVELOPE-AUTHORING (2026-09-06) — ONE storey's height, and WHERE it came from.
 *
 * ⭐ EXTRACTED, NOT COPIED. `buildAdoptProposalPlan` below held this ladder inline; the
 * multi-storey authoring planner (`envelopeAuthoringPlan.ts`) needs the identical decision
 * once PER STOREY. A second ladder would be the C84 EI-9 defect — two answers to *"how tall
 * is a storey PRYZM was not told the height of?"* that drift the first time either changes —
 * so the block MOVED here and its caller now reads it. Every string is byte-identical to the
 * one `adoptProposalAsEnvelope.spec.ts` already pins.
 *
 * ⛔ THE THIRD RUNG IS A SYNTHESISED VALUE AND SAYS SO. §ENVELOPE-SITE-DATA forbids filling a
 * missing measurement with a plausible constant SILENTLY (C58 §1.4 / L-616): `assumed-3m`
 * travels with the decision, into the statement AND into the element's name, because the name
 * is the one field that follows an element into every panel.
 *
 * PURE: no store, no DOM, no I/O. Never throws.
 */
export interface StoreyHeightDecision {
    readonly heightM: number;
    readonly heightSource: AdoptHeightSource;
    /** Plain language, ready to drop into a sentence after "the height is …". */
    readonly heightWhy: string;
}

export function resolveStoreyHeight(
    level: Pick<AdoptLevelCandidate, 'height'>,
    ordinance: { readonly maxHeightM: number | null; readonly maxFloors: number | null },
): StoreyHeightDecision {
    let heightM: number;
    let heightSource: AdoptHeightSource;
    if (level.height !== null && level.height > 0) {
        heightM = level.height;
        heightSource = 'level-record';
    } else if (
        ordinance.maxHeightM !== null && ordinance.maxHeightM > 0
        && ordinance.maxFloors !== null && ordinance.maxFloors > 0
    ) {
        heightM = ordinance.maxHeightM / ordinance.maxFloors;
        heightSource = 'derived-floor-to-floor';
    } else {
        heightM = ASSUMED_HEIGHT_M;
        heightSource = 'assumed-3m';
    }
    const heightWhy = heightSource === 'level-record'
        ? `the storey's own recorded floor-to-floor (${heightM.toFixed(2)} m)`
        : heightSource === 'derived-floor-to-floor'
            ? `the ordinance's max height ÷ its derived storey count (${heightM.toFixed(2)} m — an even division for study, not a regulated storey height)`
            : `an ASSUMED ${ASSUMED_HEIGHT_M.toFixed(1)} m, because neither the storey nor the ordinance supplied one`;
    return { heightM, heightSource, heightWhy };
}

/** Normalise `bimManager.getLevels()`'s `unknown[]` into candidates. Records without a string id
 *  and a finite elevation are dropped — a storey PRYZM cannot place is not a storey to seat on. */
export function readLevelCandidates(raw: unknown): readonly AdoptLevelCandidate[] {
    if (!Array.isArray(raw)) return [];
    const out: AdoptLevelCandidate[] = [];
    for (const r of raw) {
        if (typeof r !== 'object' || r === null) continue;
        const rec = r as Record<string, unknown>;
        const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : null;
        const elevation = typeof rec.elevation === 'number' && Number.isFinite(rec.elevation) ? rec.elevation : null;
        if (id === null || elevation === null) continue;
        const height = typeof rec.height === 'number' && Number.isFinite(rec.height) && rec.height > 0 ? rec.height : null;
        const name = typeof rec.name === 'string' && rec.name.length > 0 ? rec.name : null;
        out.push({ id, name, elevation, height });
    }
    return out;
}

/** The lowest storey at or above the datum. `null` when there is none. Pure. */
export function pickGroundLevel(levels: readonly AdoptLevelCandidate[]): AdoptLevelCandidate | null {
    let best: AdoptLevelCandidate | null = null;
    for (const l of levels) {
        if (l.elevation < -0.01) continue;
        if (best === null || l.elevation < best.elevation) best = l;
    }
    return best;
}

/**
 * §L-13038 — the detail every plate this planner produces carries in its provenance. ONE string,
 * so the create arm and the replace arm cannot describe the same producer two ways (C84 EI-8a).
 */
const PLATE_PROVENANCE_DETAIL =
    'fitted inside the permitted footprint by the target-area / massing-option solver, and kept by '
    + 'the user from the buildable-envelope card';

/**
 * Build the plan. Pure; total; never throws.
 *
 * @param proposal   the LIVE proposal (already passed `resolveLiveTargetFootprintProposal`), or null
 * @param levels     the project's storeys
 * @param ordinance  the card's derived height figures, for the second rung of the height ladder
 * @param mintedId   the `spaceEnvelope_<ulid>` id the CALLER minted (C16 CA-2)
 * @param existing   §L-13038 — what is ALREADY in the space-envelope store, as the READ returned
 *                   it. ⛔ Required, and it is the read RESULT rather than a bare array, because
 *                   *"the store could not be read"* and *"the storey is empty"* must not arrive
 *                   here as the same value — the first refuses, the second creates.
 */
export function buildAdoptProposalPlan(
    proposal: TargetFootprintProposal | null,
    levels: readonly AdoptLevelCandidate[],
    ordinance: { readonly maxHeightM: number | null; readonly maxFloors: number | null },
    mintedId: string,
    existing: LevelEnvelopeReadResult,
): AdoptProposalResult {
    const span = _tracer.startSpan('pryzm.site.buildAdoptProposalPlan');
    try {
        if (proposal === null) {
            span.setAttribute('pryzm.adopt.refusal', 'no-proposal');
            return {
                ok: false,
                reason: 'no-proposal',
                statement: 'There is no live proposal to adopt. Fit a ground-floor area first — a withdrawn or '
                    + 'refused proposal has no geometry to make an element from.',
            };
        }
        if (levels.length === 0) {
            span.setAttribute('pryzm.adopt.refusal', 'no-levels');
            return {
                ok: false,
                reason: 'no-levels',
                statement: 'This project has no storeys yet, so there is nothing to seat a level envelope on. '
                    + 'Create a level first; PRYZM will not invent one.',
            };
        }
        const level = pickGroundLevel(levels);
        if (level === null) {
            span.setAttribute('pryzm.adopt.refusal', 'no-ground-level');
            return {
                ok: false,
                reason: 'no-ground-level',
                statement: `Every one of the ${levels.length} storeys in this project sits below the datum, so `
                    + 'there is no ground floor to seat a ground-floor plate on. Add a storey at or above 0 m.',
            };
        }

        // ⭐ §L-13038 — WHAT IS ALREADY ON THIS STOREY, asked AFTER the storey is known and never
        // before: the supersession is scoped to the storey this option targets, so every other
        // storey is untouched by construction rather than by care.
        if (!existing.readable) {
            span.setAttribute('pryzm.adopt.refusal', 'envelopes-unreadable');
            return { ok: false, reason: 'envelopes-unreadable', statement: existing.text };
        }
        const onStorey = existing.rows.filter((e) => e.levelId === level.id);
        const supersession = resolveLevelEnvelopeSupersession(onStorey);
        if (supersession.kind === 'blocked') {
            span.setAttribute('pryzm.adopt.refusal', 'rival-envelope-not-generated');
            return {
                ok: false,
                reason: 'rival-envelope-not-generated',
                statement: supersession.sentence,
            };
        }
        const supersedes = supersession.kind === 'replace' ? supersession.ids : [];
        const replaces = supersession.kind === 'replace' ? supersession.targets : [];

        const { heightM, heightSource, heightWhy } = resolveStoreyHeight(level, ordinance);

        const levelLabel = level.name ?? `storey at ${level.elevation.toFixed(2)} m`;
        const achieved = proposal.achievedAreaM2.toFixed(0);
        const name = heightSource === 'assumed-3m'
            ? `Proposed ground floor · ${achieved} m² · height assumed`
            : `Proposed ground floor · ${achieved} m²`;

        // ⛔ C75 §2.7 — A REPLACEMENT CARRIES WHAT IT REPLACED. The prior taken is the first
        // target's: every target passed `isReplaceableByGeneratedMassing`, so they are all
        // PRYZM's own output and the first is representative of what was overwritten. The COUNT
        // is in the detail, so an N > 1 heal is not reported as a single swap.
        const prior = replaces[0]?.provenance ?? null;
        const provenance: ValueProvenance = prior === null
            ? systemProvenance('computed', PLATE_PROVENANCE_DETAIL)
            : regeneratedProvenance(
                prior,
                `${PLATE_PROVENANCE_DETAIL}; replaced ${replaces.length} generated level `
                + `envelope${replaces.length === 1 ? '' : 's'} on this storey`,
            );

        const spec: AdoptEnvelopeSpec = {
            spaceEnvelopeId: mintedId,
            levelId: level.id,
            footprint: proposal.ring.map((p) => ({ x: p.x, y: 0 as const, z: p.z })),
            baseOffset: 0,
            height: heightM,
            role: 'level',
            withinId: null,
            name,
            provenance,
        };

        span.setAttribute('pryzm.adopt.heightSource', heightSource);
        span.setAttribute('pryzm.adopt.levelId', level.id);
        span.setAttribute('pryzm.adopt.supersedes', supersedes.length);
        // ⭐ THE REPLACEMENT HALF COMES FIRST, AND IT COMES FROM ONE PRODUCER. A user about to
        // lose an envelope must read that before the verb that creates the new one — and the
        // sentence is `resolveLevelEnvelopeSupersession`'s, never a second copy of it here.
        const statement = supersession.kind === 'replace'
            ? `${supersession.sentence} In its place: ONE level envelope of ${achieved} m² on `
              + `${levelLabel}, ${heightM.toFixed(2)} m high — the height is ${heightWhy}. It records what `
              + 'you INTEND to build; it is not the permitted envelope and does not change it.'
            : `Creates ONE level envelope of ${achieved} m² on ${levelLabel}, ${heightM.toFixed(2)} m high — `
              + `the height is ${heightWhy}. It records what you INTEND to build; it is not the permitted `
              + `envelope and does not change it. One undo removes it.`;
        return {
            ok: true,
            command: 'spaceEnvelope.batch.create',
            payload: { envelopes: [spec], supersedes },
            level,
            heightSource,
            heightM,
            replaces,
            statement,
        };
    } finally {
        span.end();
    }
}
