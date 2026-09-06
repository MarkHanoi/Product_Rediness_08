// §PL-ENVELOPE-AUTHORING (lane PL-ENVELOPE-AUTHORING, 2026-09-06) — STR-RESIDENTIAL-DESIGN-
// ORCHESTRATOR §25.2 / §25.6 · C114 §6a / §12 · C83 §1.2 · C16 CA-2 · P6.
//
// THE FOUNDER'S ASK, verbatim and in order:
//   · *"I shall be able to CREATE THE ENVELOPE — using the new category for envelopes as defined
//      in the contract C114"*
//   · *"THE ENVELOPE ELEMENT SHOULD BE LIKE A ROOM — LIKE A SLAB IN 3D VIEW — the user can define
//      the perimeter … then it would EXTRUDE"*
//   · *"the user here can define the NUMBER OF FLOOR LEVELS — of course limited to the parcel law
//      and the surface — and check against the requirements of the parcel"*
//
// This module is the ARITHMETIC AND THE DECISION for that gesture, and nothing else: it decides
// which storeys are used, how tall each envelope is, what each is named, what is REFUSED and what
// is merely ADVISED. It draws nothing, it stores nothing and it dispatches nothing.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ N STOREYS = N `level` ENVELOPES = ONE `spaceEnvelope.batch.create` = ONE Ctrl+Z
// ══════════════════════════════════════════════════════════════════════════════════════════════
// C114 §6a: there is no singular `spaceEnvelope.create`, and the batch verb IS the create path
// *"even for ONE envelope … so no caller can reach for the wrong one and ship N undo entries for
// one gesture"*. "Extrude by a level count" is therefore not a taller prism — a space envelope is
// SEATED ON A STOREY and its height is measured from that storey's datum (C114 §10), so four
// floors are four records, each on its own `levelId`, minted in ONE batch.
//
// ⭐ `adoptProposalAsEnvelope.ts` IS THE PROVEN SIBLING AND IS REUSED, NOT RIVALLED. That module
// already turns ONE study plate into ONE ground-floor envelope; its level reader
// (`readLevelCandidates`), its candidate type and its height ladder (`resolveStoreyHeight`, which
// this lane EXTRACTED out of it rather than copying) are imported here. What is genuinely new is
// only: N storeys instead of one, an arbitrary ring instead of a solved plate, and the storey-count
// verdict below.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE STOREY-COUNT VERDICT IS AN ADVISORY, NOT A REFUSAL — AND THAT IS THE CONTRACT, NOT A GAP
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The lane brief asks for *"refuse or warn with BOTH numbers"*. C114 §12 decides WHICH, and calls
// the row *"⭐ the decisive one"*:
//
//   > "A **level envelope outside the maximum buildable volume** — INADVISABLE / ADVISORY —
//   >  reported, never refused. The maximum buildable volume is a **STUDY, not a permit**
//   >  (C58/C74/C75). Refusing an architect's edit on the authority of a study PRYZM computed
//   >  would tell a professional they may not draw something they may well be entitled to build."
//
// C114 §14c re-affirms that this row is UNCHANGED while `room ⊂ level` became enforcement. So
// asking for five storeys where PRYZM derived four is **ADVISED WITH BOTH NUMBERS AND BUILT** —
// never refused, and ⛔ never silently clamped to four, which would answer a question the user did
// not ask and hide the disagreement.
//
// What IS refused is different in kind: PRYZM will not INVENT A STOREY to hold an envelope. That
// is not a judgement about the user's design at all — it is an admission that the project has no
// such level to seat a record on, and it carries both numbers too (asked vs available).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AN UNKNOWN ORDINANCE DOES NOT BLOCK AUTHORING
// ══════════════════════════════════════════════════════════════════════════════════════════════
// At the founder's own Córdoba parcel the card correctly reads *"PRYZM has not transcribed this
// Córdoba ordenanza's buildable rules … not an error"*. With `maxFloors: null` this planner emits
// NO advisory and NO refusal about storey count — the envelope is authorable and its compliance is
// reported as UNKNOWN by the surface, never fabricated as compliant (C58 §1.4 / L-616: *"an UNKNOWN
// constraint drawn as zero or unbounded is an overstatement on real land"*).
//
// PURE: no store, no DOM, no THREE, no bus, no clock, no RNG (ids are minted by the CALLER —
// C16 CA-2: `execute()` runs again on REDO, so an id minted near the handler would differ the
// second time). Never throws. Deterministic.

import { trace } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';
import {
    resolveStoreyHeight,
    type AdoptHeightSource,
    type AdoptLevelCandidate,
} from './adoptProposalAsEnvelope';

const _tracer = trace.getTracer('pryzm.site.envelopeAuthoringPlan');

/** A ring below this cannot bound an area — the same floor the L0 schema enforces. */
export const AUTHORING_MIN_RING_VERTICES = 3;

/** The most storeys one gesture may mint. A guard against a pasted `1e9`, not a design limit. */
export const AUTHORING_MAX_STOREYS = 40;

/** Why the gesture could not produce a plan. Closed — a new arm is a type error at every switch. */
export type EnvelopeAuthoringRefusalReason =
    /** No footprint ring to extrude: nothing solved, nothing drawn. */
    | 'no-footprint-ring'
    /** The storey field was empty or not a number. */
    | 'storeys-not-a-number'
    /** Zero, negative, or not a whole number of storeys. */
    | 'storeys-not-positive'
    /** More storeys than one gesture may mint. */
    | 'storeys-above-batch-limit'
    /** The project has no storeys at all. */
    | 'no-levels'
    /** Every storey sits below the datum — there is no ground floor to start from. */
    | 'no-ground-level'
    /** ⭐ Fewer storeys exist than were asked for. PRYZM does not create one to hold a number. */
    | 'not-enough-storeys'
    /** The caller minted fewer ids than storeys. A wiring fault, surfaced rather than swallowed. */
    | 'too-few-ids';

/**
 * ⭐ THE STOREY-COUNT DISAGREEMENT — REPORTED, BUILT ANYWAY. See the header: C114 §12 rules this
 * ADVISORY because the permitted storey count is a STUDY. Both numbers are carried as VALUES so
 * the surface renders them rather than parsing them back out of prose.
 */
export interface EnvelopeAuthoringAdvisory {
    readonly code: 'exceeds-permitted-storeys';
    readonly askedStoreys: number;
    readonly permittedStoreys: number;
    readonly statement: string;
}

/** The exact `spaceEnvelope.batch.create` spec shape (C114 §6), spelled locally so this module
 *  needs no import from the plugin it consumes — the bus is the boundary. */
export interface AuthoredEnvelopeSpec {
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    readonly footprint: readonly { readonly x: number; readonly y: 0; readonly z: number }[];
    readonly baseOffset: 0;
    readonly height: number;
    readonly role: 'level';
    readonly withinId: null;
    readonly name: string;
}

/** One storey of the plan, so a surface can list what it is about to create BEFORE the click. */
export interface AuthoredStoreyRow {
    readonly levelId: string;
    readonly label: string;
    readonly elevation: number;
    readonly heightM: number;
    readonly heightSource: AdoptHeightSource;
}

export interface EnvelopeAuthoringPlan {
    readonly ok: true;
    readonly command: 'spaceEnvelope.batch.create';
    readonly payload: { readonly envelopes: readonly AuthoredEnvelopeSpec[] };
    readonly storeys: readonly AuthoredStoreyRow[];
    /** The footprint area every storey carries, m² — passed IN, never re-derived here. */
    readonly footprintAreaM2: number;
    /**
     * The total floor area this gesture will declare as intended, m² — `footprintAreaM2 × storeys`.
     * ⚠ It is stated so the user sees it BEFORE creating, and it is the number the live BRUT check
     * will measure against the allowance afterwards.
     */
    readonly totalIntendedM2: number;
    /** `null` when the ordinance published no storey count, or the ask is within it. */
    readonly advisory: EnvelopeAuthoringAdvisory | null;
    /** Plain language: what will be created, on which storeys, how tall, and what it is NOT. */
    readonly statement: string;
}

export interface EnvelopeAuthoringRefusal {
    readonly ok: false;
    readonly reason: EnvelopeAuthoringRefusalReason;
    readonly statement: string;
}

export type EnvelopeAuthoringResult = EnvelopeAuthoringPlan | EnvelopeAuthoringRefusal;

export interface EnvelopeAuthoringInput {
    /**
     * The footprint ring, scene-XZ metres — the SAME frame as the parcel ring and the envelope's
     * `insetPolygon`. Supplied by the caller from ONE producer; this module never solves a ring.
     */
    readonly ring: readonly Pt[] | null | undefined;
    /**
     * That ring's area, m², from the same producer that supplied the ring.
     * ⛔ NOT RECOMPUTED HERE — a second area routine is how a card comes to state a figure the
     * scene disagrees with (C84 EI-9). `null` when the producer could not state one.
     */
    readonly ringAreaM2: number | null;
    /** What the ring IS, in the user's words — printed, so the plan names its own provenance. */
    readonly ringSourceLabel: string;
    /** Straight off a text field, so `unknown` on purpose: it is CLASSIFIED here, never trusted. */
    readonly requestedStoreys: unknown;
    /** The ordinance figures, as the ONE parcel-law model states them. `null` ⇒ not published. */
    readonly ordinance: {
        readonly maxHeightM: number | null;
        readonly maxFloors: number | null;
    };
    /** The project's storeys (`readLevelCandidates(bimManager.getLevels())`). */
    readonly levels: readonly AdoptLevelCandidate[];
    /** One `spaceEnvelope_<ulid>` per storey, minted by the CALLER (C16 CA-2). */
    readonly mintedIds: readonly string[];
}

const isWholePositive = (n: number): boolean => Number.isFinite(n) && n > 0 && Number.isInteger(n);

/** The storeys an envelope may be seated on, lowest first. Below-datum storeys are excluded —
 *  the same datum rule `pickGroundLevel` applies, extended from "the ground one" to "the stack". */
export function seatableStoreys(
    levels: readonly AdoptLevelCandidate[],
): readonly AdoptLevelCandidate[] {
    return [...levels]
        .filter((l) => l.elevation >= -0.01)
        .sort((a, b) => (a.elevation - b.elevation) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const labelOf = (l: AdoptLevelCandidate): string =>
    l.name ?? `storey at ${l.elevation.toFixed(2)} m`;

/**
 * ⭐ BUILD THE PLAN. Pure; total; never throws.
 *
 * @param input everything the decision needs, all of it supplied by ONE producer per figure.
 */
export function buildEnvelopeAuthoringPlan(
    input: EnvelopeAuthoringInput,
): EnvelopeAuthoringResult {
    const span = _tracer.startSpan('pryzm.site.buildEnvelopeAuthoringPlan');
    try {
        const ring = Array.isArray(input.ring) ? input.ring : null;
        if (ring === null || ring.length < AUTHORING_MIN_RING_VERTICES) {
            span.setAttribute('pryzm.authoring.refusal', 'no-footprint-ring');
            return {
                ok: false,
                reason: 'no-footprint-ring',
                statement:
                    'There is no footprint to extrude. PRYZM has not solved a buildable footprint for '
                    + 'this parcel and you have not fitted a ground-floor plate, so there is no ring to '
                    + 'make an envelope from. This is a gap in what PRYZM has — NOT a finding that '
                    + 'nothing may be built.',
            };
        }

        const rawStoreys = typeof input.requestedStoreys === 'number'
            ? input.requestedStoreys
            : typeof input.requestedStoreys === 'string' && input.requestedStoreys.trim() !== ''
                ? Number(input.requestedStoreys)
                : NaN;
        if (!Number.isFinite(rawStoreys)) {
            span.setAttribute('pryzm.authoring.refusal', 'storeys-not-a-number');
            return {
                ok: false,
                reason: 'storeys-not-a-number',
                statement: 'Enter how many floor levels the envelope should have — a whole number of storeys.',
            };
        }
        if (!isWholePositive(rawStoreys)) {
            span.setAttribute('pryzm.authoring.refusal', 'storeys-not-positive');
            return {
                ok: false,
                reason: 'storeys-not-positive',
                statement:
                    `A building has a whole number of storeys, and at least one — ${String(input.requestedStoreys)} `
                    + 'is not one. Nothing was created.',
            };
        }
        if (rawStoreys > AUTHORING_MAX_STOREYS) {
            span.setAttribute('pryzm.authoring.refusal', 'storeys-above-batch-limit');
            return {
                ok: false,
                reason: 'storeys-above-batch-limit',
                statement:
                    `You asked for ${rawStoreys} storeys; PRYZM mints at most ${AUTHORING_MAX_STOREYS} envelopes in `
                    + 'one gesture, so that one undo can still remove the whole thing. Nothing was created. '
                    + 'This is a limit on the GESTURE, not a statement about what this parcel allows.',
            };
        }
        const asked = rawStoreys;

        if (input.levels.length === 0) {
            span.setAttribute('pryzm.authoring.refusal', 'no-levels');
            return {
                ok: false,
                reason: 'no-levels',
                statement:
                    'This project has no storeys yet, so there is nothing to seat a level envelope on. '
                    + 'Create a level first; PRYZM will not invent one.',
            };
        }
        const seatable = seatableStoreys(input.levels);
        if (seatable.length === 0) {
            span.setAttribute('pryzm.authoring.refusal', 'no-ground-level');
            return {
                ok: false,
                reason: 'no-ground-level',
                statement:
                    `Every one of the ${input.levels.length} storeys in this project sits below the datum, so `
                    + 'there is no ground floor to start the envelope from. Add a storey at or above 0 m.',
            };
        }
        if (seatable.length < asked) {
            // ⛔ BOTH NUMBERS, and the fix named. This is NOT a judgement about the design — it is
            // an admission that the model has nowhere to put the record.
            span.setAttribute('pryzm.authoring.refusal', 'not-enough-storeys');
            return {
                ok: false,
                reason: 'not-enough-storeys',
                statement:
                    `You asked for ${asked} floor levels, but this project has ${seatable.length} storey`
                    + `${seatable.length === 1 ? '' : 's'} at or above the datum to seat them on. PRYZM will `
                    + 'not create a storey to hold a number. Add the missing levels first, then create the '
                    + `envelope — nothing was created. ⚠ This is about the MODEL, not the ordinance: it says `
                    + 'nothing about how many floors this parcel permits.',
            };
        }
        const used = seatable.slice(0, asked);
        if (input.mintedIds.length < asked) {
            span.setAttribute('pryzm.authoring.refusal', 'too-few-ids');
            return {
                ok: false,
                reason: 'too-few-ids',
                statement:
                    `PRYZM was handed ${input.mintedIds.length} element id(s) for ${asked} storeys, so it did `
                    + 'not create anything. This is a gap in PRYZM\'s wiring, not a refusal about your design.',
            };
        }

        // ⛔ The area is the CALLER's figure, echoed — never recomputed (see `ringAreaM2`).
        const footprintAreaM2 = input.ringAreaM2 !== null && Number.isFinite(input.ringAreaM2)
            ? input.ringAreaM2
            : 0;

        const footprint = ring.map((p) => ({ x: p.x, y: 0 as const, z: p.z }));

        const storeys: AuthoredStoreyRow[] = [];
        const envelopes: AuthoredEnvelopeSpec[] = [];
        let assumedHeights = 0;
        for (let i = 0; i < used.length; i++) {
            const level = used[i]!;
            const { heightM, heightSource } = resolveStoreyHeight(level, input.ordinance);
            if (heightSource === 'assumed-3m') assumedHeights++;
            const label = labelOf(level);
            storeys.push({
                levelId: level.id,
                label,
                elevation: level.elevation,
                heightM,
                heightSource,
            });
            envelopes.push({
                spaceEnvelopeId: input.mintedIds[i]!,
                levelId: level.id,
                footprint,
                baseOffset: 0,
                height: heightM,
                role: 'level',
                withinId: null,
                // ⭐ The NAME carries the honesty, because it is the one field that follows an
                // element into every panel: a storey whose height PRYZM assumed says so here.
                name: heightSource === 'assumed-3m'
                    ? `Level envelope · ${label} · ${footprintAreaM2.toFixed(0)} m² · height assumed`
                    : `Level envelope · ${label} · ${footprintAreaM2.toFixed(0)} m²`,
            });
        }

        // ── The ADVISORY (never a refusal — see the header and C114 §12). ─────────────────────
        const permitted = input.ordinance.maxFloors;
        const advisory: EnvelopeAuthoringAdvisory | null =
            permitted !== null && Number.isFinite(permitted) && permitted > 0 && asked > permitted
                ? {
                    code: 'exceeds-permitted-storeys',
                    askedStoreys: asked,
                    permittedStoreys: permitted,
                    statement:
                        `You asked for ${asked} floor levels; the study PRYZM solved for this parcel derives `
                        + `${permitted} — ${asked - permitted} more than the ordinance figure. PRYZM is telling `
                        + 'you, not stopping you: the permitted storey count is a STUDY, not a permit, and an '
                        + 'architect may well be entitled to draw this. It is created as INTENT and reported '
                        + 'against the study, never as it.',
                }
                : null;

        const totalIntendedM2 = footprintAreaM2 * asked;
        const heightNote = assumedHeights === 0
            ? ''
            : ` ⚠ ${assumedHeights} of the ${asked} storey height${assumedHeights === 1 ? ' was' : 's were'} `
              + 'ASSUMED at 3.0 m, because neither the storey record nor the ordinance supplied one — each such '
              + 'envelope says so in its name.';
        const statement =
            `Creates ${asked} level envelope${asked === 1 ? '' : 's'} of ${footprintAreaM2.toFixed(0)} m² each — `
            + `${used.map((l) => labelOf(l)).join(', ')} — from ${input.ringSourceLabel}. `
            + `${totalIntendedM2.toFixed(0)} m² of intended floor area in total. It records what you INTEND to `
            + 'build; it is not the permitted envelope and does not change it. One undo removes all of it.'
            + heightNote;

        span.setAttribute('pryzm.authoring.storeys', asked);
        span.setAttribute('pryzm.authoring.advisory', advisory !== null);
        span.setAttribute('pryzm.authoring.assumedHeights', assumedHeights);
        return {
            ok: true,
            command: 'spaceEnvelope.batch.create',
            payload: { envelopes },
            storeys,
            footprintAreaM2,
            totalIntendedM2,
            advisory,
            statement,
        };
    } finally {
        span.end();
    }
}
