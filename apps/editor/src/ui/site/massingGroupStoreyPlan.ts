// ADR-0383 S7 / §4a (lane MP-UI, 2026-09-09) — WHAT "TAKE THIS BLOCK TO N STOREYS" MEANS, RESOLVED
// BY THE SURFACE, AS THE ORCHESTRATOR RULED.
//
// ADR-0383 §4 / §4a / D5 / D7 · C16 CA-2 · C114 §6a · C58 §1.4 · C84 EI-9 ·
// §BASE-OFFSET-IS-ABSOLUTE (L-13286) · §WHOSE-FOOTPRINT-IS-THE-SLAB (L-13296).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THE SURFACE RESOLVES THE STOREYS AND THE HANDLER ONLY APPLIES THEM
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADR-0383 §4 first declared the payload as `{ groupId, targetStoreys, mintedIds[], startStoreyId? }`.
// The implementing lane raised that as unsatisfiable and the orchestrator agreed (§4a, 2026-09-09):
//
//   > *"deciding WHICH storeys to add needs BIM level elevations, which the space-envelope store
//   >  does not hold. Reading them inside the handler would make it multi-store and cost the
//   >  one-`produceCommand`/one-Ctrl-Z property this family exists for."*
//
// So the payload is `{ groupId, targetStoreys, added: [{ spaceEnvelopeId, levelId, baseOffset,
// height }] }` and **this module is the resolver**. Same division `buildEnvelopeAuthoringPlan`
// already uses: the planner decides, the verb executes.
//
// ⛔ IDS ARE MINTED BY THE CALLER (C16 CA-2). `execute()` runs again on redo, so an id minted inside
// a handler differs the second time and orphans every reference to it. This function TAKES the
// minted ids and refuses when it is handed too few, rather than inventing the shortfall.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE FOUR RULES THIS FILE CALLS RATHER THAN RE-IMPLEMENTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// [[same-rule-two-implementations]] has recurred seven times in this repository, so:
//   1. *"which storeys can an envelope be seated on, what are they called, and how tall"* →
//      `describeSeatableStoreys` (`envelopeAuthoringPlan.ts:382`), the ONE producer whose own
//      header says *"a surface that computed its own labels would be a second answer"*. ⛔ No
//      second height ladder and no second `elevation >= 0` filter here.
//   2. *"how many storeys may one gesture mint"* → `AUTHORING_MAX_STOREYS`, the same ceiling the
//      envelope batch carries. ⛔ Not a second constant.
//   3. *"what is in this group"* → `MassingGroup`, from `readMassingGroups`. ⛔ No second store read.
//   4. *"what does a storey read as"* → the group's own rows. ⛔ No second level reader.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ WHICH RING A GROWN STOREY COPIES — RULED, AND THIS FILE ONLY REPORTS IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §4a(b): **the TOP-seated member's ring**, because you stack onto what is there and copying the
// ground ring would silently undo a set-back the designer already drew.
//
// ⛔ THE PAYLOAD DOES NOT CARRY THE RING — §4a's shape is `{ spaceEnvelopeId, levelId, baseOffset,
// height }`, so the HANDLER performs the copy. This module therefore does NOT choose the ring; it
// reports the choice so the surface can disclose it. ⚠ That is one rule described in two places,
// which is the shape this repository keeps failing, and it is tolerable here only because one side
// is a SENTENCE and the other is the ACT. **When S4 lands, a cross-check test must pin that the
// handler copies the ring this module names.** Recorded as owed rather than assumed away.
//
// ⛔ AND THE DISCLOSURE IS CONDITIONAL, NOT CONSTANT. §4a(b): *"disclose only when the ambiguity is
// REAL … a message the user must dismiss on every press is a message they stop reading."* When
// every ring in the group matches, `ringAssumption` is `null` and the surface says nothing.
//
// PURE: no DOM, no THREE, no bus, no store, no clock, no RNG, no module state. Never throws.

import { trace } from '@opentelemetry/api';
import { polygonSignedAreaOrdinates } from '@pryzm/geometry-kernel';
import {
    describeSeatableStoreys,
    AUTHORING_MAX_STOREYS,
} from './envelopeAuthoringPlan';
import type { AdoptLevelCandidate, AdoptHeightSource } from './adoptProposalAsEnvelope';
import type { MassingGroup, MassingGroupStorey } from './massingGroupRoster';

const _tracer = trace.getTracer('pryzm.site.massingGroupStoreyPlan');

/** The verb this plan dispatches. ⛔ ONE name, in ONE place — see the header's rename note. */
export const MASSING_GROUP_SET_STOREYS_VERB = 'spaceEnvelope.group.setStoreys';

/** One storey the verb will ADD, exactly as ADR-0383 §4a shapes it. */
export interface MassingGroupAddedStorey {
    /** Minted by the CALLER (C16 CA-2). */
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    /**
     * Metres above the **PROJECT datum** — an ABSOLUTE seat, taken straight from the storey's
     * elevation. ⛔ §BASE-OFFSET-IS-ABSOLUTE (L-13286): adding the storey elevation to a relative
     * offset counts it twice and produced a false *"your building is too tall"* refusal.
     */
    readonly baseOffset: number;
    readonly height: number;
}

/** The payload of `spaceEnvelope.group.setStoreys`. ⛔ Built HERE and nowhere else. */
export interface MassingGroupSetStoreysPayload {
    readonly groupId: string;
    readonly targetStoreys: number;
    /** ⛔ EMPTY on a shrink — the handler removes from the top and needs no geometry to do it. */
    readonly added: readonly MassingGroupAddedStorey[];
}

/** Why the surface could not describe the change. Closed — a new arm is a type error at every switch. */
export type MassingGroupStoreyRefusalReason =
    /** The target equals what is already there. Not an error; there is simply nothing to do. */
    | 'no-change'
    /** Not a whole number, or below zero. */
    | 'not-a-count'
    /**
     * ⛔ ZERO IS REFUSED, AND IT IS NOT PEDANTRY: it would remove every storey of the building — a
     * DELETE wearing a resize's name. An empty group is not representable (ADR-0383 D2), so "take
     * this block to 0 storeys" has no result that can be written; the verb that destroys a building
     * is `spaceEnvelope.delete`.
     *
     * ⭐ AND THIS ARM EXISTS BECAUSE THE HANDLER HAS IT. `SetMassingGroupStoreysHandler.canExecute`
     * refuses `target < 1` in the same words. Without this arm the surface would render a confident
     * plan sentence for 0 and the dispatch would be refused underneath it — the exact
     * [[same-rule-two-implementations]] outcome where the button's label and the store's contents
     * are two different answers. Found by reading the handler rather than by testing my own side.
     */
    | 'zero-storeys'
    /** The ungrouped bucket has no `group.id`, so no group verb can address it. */
    | 'ungrouped'
    /** More storeys than one gesture may mint — the same ceiling the envelope batch carries. */
    | 'above-batch-limit'
    /**
     * ⭐ D5's PROJECT-WIDE refusal: *"you asked for 4 storeys, this project has 1"*. Identical for
     * every group, so proceeding would build every block wrong.
     */
    | 'not-enough-storeys'
    /** The caller minted fewer envelope ids than storeys to add. A wiring fault, surfaced not swallowed. */
    | 'too-few-ids';

export interface MassingGroupStoreyRefusal {
    readonly ok: false;
    readonly reason: MassingGroupStoreyRefusalReason;
    /** ⛔ Plain language, and it names the way out where one exists. Never a bare code. */
    readonly statement: string;
}

/** How a grown storey inherits its footprint, when that choice is VISIBLE. */
export interface MassingGroupRingAssumption {
    /** The storey whose ring the new storeys copy — §4a(b), the TOP-seated member. */
    readonly fromLevelLabel: string;
    readonly fromAreaM2: number;
    /** The ground ring PRYZM did NOT copy, named so the alternative is a choice the user can see. */
    readonly groundLevelLabel: string;
    readonly groundAreaM2: number;
    readonly sentence: string;
}

export interface MassingGroupStoreyPlan {
    readonly ok: true;
    readonly command: typeof MASSING_GROUP_SET_STOREYS_VERB;
    readonly payload: MassingGroupSetStoreysPayload;
    /** `'grow' | 'shrink'` — the direction, for the sentence and for a span. ONE verb, both ways. */
    readonly direction: 'grow' | 'shrink';
    readonly currentStoreys: number;
    /** Storeys to be added (grow) or removed from the top (shrink). Always positive. */
    readonly delta: number;
    /** The storeys a SHRINK would remove, top-first. Empty on a grow. ⛔ Named, never a count alone. */
    readonly removing: readonly MassingGroupStorey[];
    /** `null` when every ring in the group matches — see the header. */
    readonly ringAssumption: MassingGroupRingAssumption | null;
    /** `true` when any added storey's height had to be ASSUMED. The surface admits it before the click. */
    readonly anyHeightAssumed: boolean;
    /** Plain language: what will change, where, and what it is not. */
    readonly statement: string;
}

export type MassingGroupStoreyResult = MassingGroupStoreyPlan | MassingGroupStoreyRefusal;

export interface MassingGroupStoreyInput {
    readonly group: MassingGroup;
    /** The project's storeys, from the SAME `readLevelCandidates` every other surface reads. */
    readonly levels: readonly AdoptLevelCandidate[];
    /** The ordinance figures, for the height ladder's second rung. `null` ⇒ not published. */
    readonly ordinance: {
        readonly maxHeightM: number | null;
        readonly maxFloors: number | null;
    };
    readonly targetStoreys: number;
    /** One envelope id per storey to ADD, minted by the CALLER (C16 CA-2). */
    readonly mintedIds: readonly string[];
}

const isWholeNonNegative = (n: number): boolean =>
    typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n >= 0;

/** Ring area through the kernel's ONE shoelace (C73). ⛔ Never a second area routine. */
function ringAreaM2(ring: readonly Readonly<{ x: number; z: number }>[] | null): number | null {
    if (ring === null || ring.length < 3) return null;
    return Math.abs(polygonSignedAreaOrdinates(ring.length, (i) => ring[i]!.x, (i) => ring[i]!.z));
}

const storeyLabel = (s: MassingGroupStorey): string =>
    s.levelName ?? `${s.levelId} (a storey this project does not have)`;

/** Do the top and ground rings differ enough that the copy CHANGES the building? */
const RING_AREA_EPSILON_M2 = 0.5;

/**
 * ⭐ RESOLVE "TAKE THIS BLOCK TO N STOREYS" INTO THE VERB'S PAYLOAD. Pure; total; never throws.
 *
 * ⛔ IT DISPATCHES NOTHING (P6). It describes a change; the surface presses the button.
 */
export function buildMassingGroupStoreyPlan(
    input: MassingGroupStoreyInput,
): MassingGroupStoreyResult {
    const span = _tracer.startSpan('pryzm.site.buildMassingGroupStoreyPlan');
    try {
        const { group, targetStoreys: target } = input;

        // ⛔ THE UNGROUPED BUCKET IS NOT A GROUP. It has no `group.id`, so no group verb can name
        // it. Saying so is the honest reading; offering a control that would dispatch against
        // `null` is the [[refusing-half-needs-its-escape-hatch]] shape inverted.
        if (group.groupId === null) {
            span.setAttribute('pryzm.groupStorey.refusal', 'ungrouped');
            return {
                ok: false,
                reason: 'ungrouped',
                statement:
                    'These envelopes are not part of a named block, so PRYZM cannot change their storey '
                    + 'count as a group. Every envelope in a project starts ungrouped; blocks are created '
                    + 'when you draw more than one profile on a parcel.',
            };
        }

        if (!isWholeNonNegative(target)) {
            span.setAttribute('pryzm.groupStorey.refusal', 'not-a-count');
            return {
                ok: false,
                reason: 'not-a-count',
                statement: 'A storey count has to be a whole number of storeys, zero or more.',
            };
        }

        if (target < 1) {
            // ⭐ THE SAME REFUSAL THE HANDLER MAKES, IN THE SAME WORDS, one layer earlier — so the
            // user reads it before the press rather than after a dispatch that silently did nothing.
            span.setAttribute('pryzm.groupStorey.refusal', 'zero-storeys');
            return {
                ok: false,
                reason: 'zero-storeys',
                statement:
                    `A building has at least one storey — 0 would remove every storey of ${group.label}, `
                    + 'which is a delete wearing a resize’s name. Nothing was changed. Delete the '
                    + 'block if that is what you meant.',
            };
        }

        const current = group.storeyCount;
        if (target === current) {
            span.setAttribute('pryzm.groupStorey.refusal', 'no-change');
            return {
                ok: false,
                reason: 'no-change',
                statement: `${group.label} already has ${current} storey${current === 1 ? '' : 's'}. Nothing to change.`,
            };
        }

        if (target > AUTHORING_MAX_STOREYS) {
            span.setAttribute('pryzm.groupStorey.refusal', 'above-batch-limit');
            return {
                ok: false,
                reason: 'above-batch-limit',
                statement:
                    `PRYZM builds at most ${AUTHORING_MAX_STOREYS} storeys in one gesture, and you asked for `
                    + `${target}. Nothing was changed. Take ${group.label} up in stages if you need more.`,
            };
        }

        // ─── SHRINK ────────────────────────────────────────────────────────────────────────────
        // ⛔ `added` is EMPTY (§4a) — the handler removes from the top and needs no geometry.
        if (target < current) {
            const delta = current - target;
            // Top-first: the storeys that go are the highest ones, and they are NAMED rather than
            // counted. A user pressing a number should be able to read which drawings vanish.
            const removing = [...group.storeys].slice(target).reverse();
            const names = removing.map(storeyLabel).join(', ');
            span.setAttribute('pryzm.groupStorey.direction', 'shrink');
            span.setAttribute('pryzm.groupStorey.delta', delta);
            return {
                ok: true,
                command: MASSING_GROUP_SET_STOREYS_VERB,
                payload: { groupId: group.groupId, targetStoreys: target, added: [] },
                direction: 'shrink',
                currentStoreys: current,
                delta,
                removing: Object.freeze(removing),
                ringAssumption: null,
                anyHeightAssumed: false,
                statement:
                    `${group.label} goes from ${current} to ${target} storey${target === 1 ? '' : 's'}. `
                    + `PRYZM removes ${delta} envelope${delta === 1 ? '' : 's'} from the top — ${names}. `
                    + 'One undo puts them back.',
            };
        }

        // ─── GROW ──────────────────────────────────────────────────────────────────────────────
        const delta = target - current;

        // ⭐ THE ONE STOREY PRODUCER. Labels, elevations and the height ladder all come from here.
        const seatable = describeSeatableStoreys(input.levels, input.ordinance);
        const occupied = new Set(group.storeys.map((s) => s.levelId));
        // The group's own top elevation. A storey at or below it is not "stacking onto what is
        // there" — it is filling a gap, which is a different gesture and not this verb's.
        let topElevation = Number.NEGATIVE_INFINITY;
        for (const s of group.storeys) {
            if (s.elevationM !== null && s.elevationM > topElevation) topElevation = s.elevationM;
        }
        const free = seatable.filter((s) => !occupied.has(s.levelId)
            && (topElevation === Number.NEGATIVE_INFINITY || s.elevation > topElevation));

        if (free.length < delta) {
            // ⭐ D5 — a PROJECT-WIDE refusal. It is identical for every group, so proceeding would
            // build every block wrong. ⛔ And it names the way out, because a refusal whose "yes"
            // branch is unreachable is a regression with a citation attached
            // ([[refusing-half-needs-its-escape-hatch]], L-942).
            span.setAttribute('pryzm.groupStorey.refusal', 'not-enough-storeys');
            return {
                ok: false,
                reason: 'not-enough-storeys',
                statement:
                    `${group.label} needs ${delta} more storey${delta === 1 ? '' : 's'} to reach ${target}, and `
                    + `this project has ${free.length} free storey${free.length === 1 ? '' : 's'} above it. `
                    + 'Nothing was changed. Add the storeys to the project first, then set the block to '
                    + `${target}.`,
            };
        }

        if (input.mintedIds.length < delta) {
            // A wiring fault in the CALLER, surfaced rather than swallowed — minting here would
            // break redo (C16 CA-2), and proceeding with fewer would build a shorter building than
            // the number the user typed.
            span.setAttribute('pryzm.groupStorey.refusal', 'too-few-ids');
            return {
                ok: false,
                reason: 'too-few-ids',
                statement:
                    `PRYZM needs ${delta} new envelope ids to take ${group.label} to ${target} storeys and was `
                    + `given ${input.mintedIds.length}. Nothing was changed — this is a gap in PRYZM's wiring, `
                    + 'not a refusal about your design.',
            };
        }

        const chosen = free.slice(0, delta);
        const added: MassingGroupAddedStorey[] = chosen.map((s, i) => ({
            spaceEnvelopeId: input.mintedIds[i]!,
            levelId: s.levelId,
            // ⛔ ABSOLUTE, straight off the storey — never elevation + a relative offset (L-13286).
            baseOffset: s.elevation,
            height: s.heightM,
        }));
        const assumed: AdoptHeightSource = 'assumed-3m';
        const anyHeightAssumed = chosen.some((s) => s.heightSource === assumed);

        // ─── §4a(b) — the ring disclosure, ONLY when the choice changes the building ────────────
        const sorted = group.storeys;                        // already lowest-first from the reader
        const ground = sorted[0] ?? null;
        const top = sorted.length > 0 ? sorted[sorted.length - 1]! : null;
        let ringAssumption: MassingGroupRingAssumption | null = null;
        if (ground !== null && top !== null && ground.spaceEnvelopeId !== top.spaceEnvelopeId) {
            const topArea = ringAreaM2(top.ring);
            const groundArea = ringAreaM2(ground.ring);
            if (topArea !== null && groundArea !== null
                && Math.abs(topArea - groundArea) > RING_AREA_EPSILON_M2) {
                ringAssumption = {
                    fromLevelLabel: storeyLabel(top),
                    fromAreaM2: topArea,
                    groundLevelLabel: storeyLabel(ground),
                    groundAreaM2: groundArea,
                    sentence:
                        `The new storeys copy the footprint of ${storeyLabel(top)} (${topArea.toFixed(0)} m²), `
                        + `which is the highest storey ${group.label} currently has — not the ground floor's `
                        + `${groundArea.toFixed(0)} m². PRYZM stacks onto what is there, so a set-back you have `
                        + 'already drawn is kept rather than undone. Drag the new faces if you want the '
                        + 'ground footprint instead.',
                };
            }
        }

        const where = chosen.map((s) => s.label).join(', ');
        span.setAttribute('pryzm.groupStorey.direction', 'grow');
        span.setAttribute('pryzm.groupStorey.delta', delta);
        span.setAttribute('pryzm.groupStorey.ringDisclosed', ringAssumption !== null);
        return {
            ok: true,
            command: MASSING_GROUP_SET_STOREYS_VERB,
            payload: { groupId: group.groupId, targetStoreys: target, added: Object.freeze(added) },
            direction: 'grow',
            currentStoreys: current,
            delta,
            removing: [],
            ringAssumption,
            anyHeightAssumed,
            statement:
                `${group.label} goes from ${current} to ${target} storey${target === 1 ? '' : 's'}. `
                + `PRYZM adds ${delta} envelope${delta === 1 ? '' : 's'} on ${where}. `
                + (anyHeightAssumed
                    ? 'At least one of those storeys carries no height in the model, so PRYZM assumed 3 m — '
                      + 'that is an assumption, not a figure from your project. '
                    : '')
                + 'One undo removes them again.',
        };
    } finally {
        span.end();
    }
}
