// §KEEPING-A-MASSING-OPTION-ACCUMULATES-INSTEAD-OF-REPLACING (lane MASSING-REPLACE, L-13038,
// 2026-09-07) — the ONE decision behind *"when I select another massing option the previous one
// shall be removed"*, and the ONE thing that decision is not allowed to do.
//
// C58 §1.19 · C75 §1.1 / §2.2 / §2.6 · C114 §6a / §8 · C16 · P6.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S SENTENCE, AND THE PRODUCT'S OWN ANSWER TO IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder: *"WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE SHALL BE REMOVED."*
//
// Three presses of "Keep this as a level envelope" left three level envelopes on Ground, and the
// room solver then said, correctly:
//
//   *"3 level envelopes are candidates (Proposed ground floor · 431 m², Proposed ground floor ·
//    301 m², Proposed ground floor · 144 m²), so PRYZM cannot tell which one the rooms belong
//    inside. … PRYZM will not choose for you: the choice decides which envelope every room is
//    constrained to, and a wrong guess would look exactly like a right one."*
//
// ⛔ THAT REFUSAL IS NOT THE DEFECT AND MUST NOT BE TOUCHED (C58 §1.13,
// §RAC-FREEFORM-PLUS-HARD-STOPPERS). It is refusing a state the user never meant to create. This
// module exists so the state is never created — the refusal keeps firing, but only when someone
// has deliberately authored genuinely rival storeys.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE ONE THING REPLACEMENT MAY NEVER DO: DESTROY WHAT THE USER DREW
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A generated massing plate replacing another generated massing plate is obviously right. Silently
// deleting a volume the architect drew or hand-edited is not — it is the C58 §1.19 clause 3
// distinction (an AUTHORED envelope is its own provenance kind and may never be mistaken for a
// solved one) applied to a destructive gesture rather than to a label.
//
// So the question this module answers is *"did PRYZM make this, provably?"*, and the authority is
// `provenance` (C75), never the NAME. Name-matching would be the §L-836 defect shape — a rule that
// a rename satisfies — and it would delete an envelope the user had renamed to something similar.
//
// ⭐ THE THREE-ARM SPLIT IS THE WHOLE POINT, AND `unknown` SITS WITH `authored`, NOT WITH
// `computed`. C75 §1.4 makes UNKNOWN a value with a reason, and §CONTEXT-DATA-HONESTY is this
// repo's most-repeated lesson: a record whose origin PRYZM does not know is NOT a record PRYZM
// knows it made. An envelope saved before provenance was recorded on this family therefore BLOCKS
// the replacement and says so, rather than being swept away on the strength of a `??`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-DRAW-ON-THE-SITE-VIEWS (lane ENVELOPE-DRAW, 2026-09-07, R8) — A SECOND RULE, NOT A
// WIDER ONE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The user's OWN authoring (the create panel on the Parcel Law tab and the site views, and the
// perimeter drawn on a site view) asks a DIFFERENT question of the same store: *"may my new envelope
// replace the one I made earlier on this storey?"* The answer is `isReplaceableByOwnAuthoring` —
// true ONLY for `authored` — carried as `OWN_AUTHORING_RULE`. The generated-massing rule is NOT
// widened by it: a generated plate still never destroys a drawing, and a drawing does not yet sweep
// away a generated plate either (that is an open founder decision, refused with the route out).
// ONE resolver, two rules, two voices — the sentence always says WHO made what it replaces.
//
// PURE: no store of its own, no DOM, no bus, no clock, no RNG. Never throws.

import { trace } from '@opentelemetry/api';
import {
    describeProvenance,
    hasKnownOrigin,
    type ValueProvenance,
} from '@pryzm/schemas/provenance';
import type { SpaceEnvelopeReadHandle } from './intendedAreaChannel';

const _tracer = trace.getTracer('pryzm.site.levelEnvelopeSupersession');

/**
 * One `role: 'level'` envelope already in the store, as this decision needs it.
 *
 * `provenance` is `null` when the record carries no readable provenance object at all — a
 * DIFFERENT fact from a provenance that records an unknown origin, and both are kept apart here
 * because they have different causes (a record that predates the field vs. a read that did not
 * reach it).
 */
export interface ExistingLevelEnvelope {
    readonly id: string;
    readonly levelId: string;
    /** The authored name, trimmed; `null` when the record carries none. Never invented. */
    readonly name: string | null;
    /** `SpaceEnvelope.footprintAreaM2`; `null` when unreadable. ⛔ Never a gross floor area. */
    readonly footprintAreaM2: number | null;
    readonly provenance: ValueProvenance | null;
}

/** What a new level envelope on this storey should do about what is already there. */
export type LevelEnvelopeSupersession =
    /** Nothing is on the storey — create, and replace nothing. */
    | { readonly kind: 'none' }
    /**
     * Every level envelope on the storey is one PRYZM provably generated, so the new one
     * REPLACES them — in one command, one patch pair, one undo (C114 §6a).
     */
    | {
        readonly kind: 'replace';
        readonly ids: readonly string[];
        readonly targets: readonly ExistingLevelEnvelope[];
        /** What the replacement will do, in the user's words. Stated BEFORE the click. */
        readonly sentence: string;
    }
    /**
     * At least one level envelope on the storey is the user's own, or of an origin PRYZM cannot
     * establish. ⛔ NOTHING is created and NOTHING is deleted: refusing with a reason is the
     * correct answer, and it is strictly better than either destroying the drawing or minting the
     * fourth rival that started this.
     */
    | {
        readonly kind: 'blocked';
        readonly blockers: readonly ExistingLevelEnvelope[];
        readonly sentence: string;
    };

/** Reading the store can FAIL, and a failure is not an empty storey. */
export type LevelEnvelopeReadResult =
    | { readonly readable: true; readonly rows: readonly ExistingLevelEnvelope[] }
    | { readonly readable: false; readonly reason: 'no-store' | 'store-threw'; readonly text: string };

const NO_STORE_TEXT =
    'This runtime exposes no space-envelope store, so PRYZM cannot see what is already on the '
    + 'storey. Nothing was created — creating blind is how three rival envelopes ended up on one '
    + 'floor. This is a gap in PRYZM\'s wiring, not a refusal about your design.';
const STORE_THREW_TEXT =
    'Reading the space-envelope store failed, so PRYZM cannot see what is already on the storey. '
    + 'Nothing was created and nothing was deleted. This is a failure to read — NOT a finding that '
    + 'the storey is empty.';

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Every `role: 'level'` envelope in the store, with the provenance the decision below needs.
 *
 * ⚠ THE SAME READ SHAPE `collectIntendedAreas` USES, and deliberately the same handle type: one
 * channel, so the fold that reports intended area and the gesture that replaces an envelope
 * cannot disagree about what is in the store (C84 EI-9).
 *
 * @param store  `runtime.stores.spaceEnvelope`, or `null`/`undefined` when the runtime has none
 */
export function readLevelEnvelopes(
    store: SpaceEnvelopeReadHandle | null | undefined,
): LevelEnvelopeReadResult {
    const span = _tracer.startSpan('pryzm.site.readLevelEnvelopes');
    try {
        if (!store || typeof store.getState !== 'function') {
            span.setAttribute('pryzm.supersede.read', 'no-store');
            return { readable: false, reason: 'no-store', text: NO_STORE_TEXT };
        }
        let state: ReadonlyMap<string, unknown>;
        try {
            state = store.getState();
        } catch {
            span.setAttribute('pryzm.supersede.read', 'store-threw');
            return { readable: false, reason: 'store-threw', text: STORE_THREW_TEXT };
        }
        const rows: ExistingLevelEnvelope[] = [];
        for (const raw of state.values()) {
            if (!isRec(raw)) continue;
            if (raw.role !== 'level') continue;
            const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
            const levelId = typeof raw.levelId === 'string' && raw.levelId.length > 0 ? raw.levelId : null;
            if (id === null || levelId === null) continue;
            const name = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : null;
            const areaRaw = raw.footprintAreaM2;
            const footprintAreaM2 = typeof areaRaw === 'number' && Number.isFinite(areaRaw) ? areaRaw : null;
            // The provenance object as the schema stores it. A record carrying none reads `null`
            // — which BLOCKS below, exactly as an authored one does.
            const p = raw.provenance;
            const provenance = isRec(p) && ('origin' in p) ? (p as unknown as ValueProvenance) : null;
            rows.push({ id, levelId, name, footprintAreaM2, provenance });
        }
        span.setAttribute('pryzm.supersede.levelEnvelopes', rows.length);
        return { readable: true, rows: Object.freeze(rows) };
    } finally {
        span.end();
    }
}

/**
 * **The rule.** May PRYZM replace this envelope with a freshly generated one?
 *
 * ⭐ ONLY A KNOWN, NON-`authored` ORIGIN QUALIFIES. `computed` (a plate the massing/target solver
 * fitted) and `regenerated` (a plate that already replaced one) are PRYZM's own work. `authored`
 * is the user's and is protected by C75 §2.6. `inferred` and `observed` are neither of those
 * things and are not PRYZM's massing output either, so they block — the conservative direction is
 * the correct one when the cost of being wrong is a destroyed drawing.
 *
 * ⛔ A NULL PROVENANCE, OR ONE WITH NO KNOWN ORIGIN, BLOCKS. See the header.
 */
export function isReplaceableByGeneratedMassing(p: ValueProvenance | null): boolean {
    if (p === null) return false;
    if (!hasKnownOrigin(p)) return false;
    return p.origin === 'computed' || p.origin === 'regenerated';
}

/**
 * **The sibling rule — §ENVELOPE-DRAW-ON-THE-SITE-VIEWS (lane ENVELOPE-DRAW, 2026-09-07), R8.**
 * May the user's OWN authoring gesture replace this envelope?
 *
 * ⭐ ONLY `authored` QUALIFIES. This is the founder's L-13038 ruling (*"when I select another the
 * previous shall be removed"*) applied to his own authoring: pressing Create on the same storey a
 * second time, or drawing a second perimeter, REPLACES the envelope that same gesture made — stated
 * before the click, one undo. What it does NOT do is widen `isReplaceableByGeneratedMassing`: a
 * generated plate may still never destroy a drawing, and this rule is used ONLY by the authoring
 * route (`buildEnvelopeAuthoringPlan`), never by the massing-option adopt path.
 *
 * ⛔ `computed` / `regenerated` (PRYZM's own plates) BLOCK here, deliberately and conservatively.
 * Whether the user's drawing may sweep away a plate PRYZM fitted is a founder decision the lane
 * did not have; until it is made, the refusal names the plate and the way out (delete it, or keep
 * it and draw on another storey), which is strictly better than destroying either silently.
 * ⛔ A NULL PROVENANCE, OR ONE WITH NO KNOWN ORIGIN, BLOCKS — the same §CONTEXT-DATA-HONESTY rule
 * as the generated-massing sibling: a record PRYZM cannot attribute is not one it may delete.
 */
export function isReplaceableByOwnAuthoring(p: ValueProvenance | null): boolean {
    if (p === null) return false;
    if (!hasKnownOrigin(p)) return false;
    return p.origin === 'authored';
}

/**
 * WHICH rule decides a replacement, and how its sentences read. The two rules differ in who is
 * asking — PRYZM's massing solver, or the user's own authoring control — and the sentence must say
 * which, or a user reads "PRYZM generated" about a perimeter they drew.
 */
export interface SupersessionRule {
    /** May this envelope be replaced by the thing about to be created? */
    readonly replaceable: (p: ValueProvenance | null) => boolean;
    /** Ends "…already on this storey (names), which …" / "…all of which …" — e.g. `PRYZM generated`. */
    readonly replacedClause: string;
    /** Ends "This storey already carries a level envelope … (names)" — takes `one` for grammar. */
    readonly blockedClause: (one: boolean) => string;
    /** Why the blocker blocks, in this rule's voice. A full sentence. */
    readonly blockedWhy: string;
    /** The way out, after "Nothing was created and nothing was deleted." */
    readonly blockedRoute: string;
}

/** The default — §L-13038's massing-option adopt. Sentences byte-identical to the original. */
export const GENERATED_MASSING_RULE: SupersessionRule = Object.freeze({
    replaceable: isReplaceableByGeneratedMassing,
    replacedClause: 'PRYZM generated',
    blockedClause: () => 'PRYZM cannot prove it generated',
    blockedWhy:
        'an envelope you drew or edited by hand is your work, and replacing it silently would destroy '
        + 'an edit nothing warned you about.',
    blockedRoute:
        'Delete the one you do not want yourself and press again, and PRYZM will put this option in '
        + 'its place.',
});

/** The authoring route's rule — §ENVELOPE-DRAW R8. Only what the user authored is replaced. */
export const OWN_AUTHORING_RULE: SupersessionRule = Object.freeze({
    replaceable: isReplaceableByOwnAuthoring,
    replacedClause: 'you authored earlier from this control',
    blockedClause: (one: boolean) => one ? 'that is not your own authoring' : 'that are not your own authoring',
    blockedWhy:
        'this control replaces only what it authored; a plate PRYZM fitted from a massing option, or '
        + 'an envelope whose origin PRYZM cannot establish, is not swept away by your drawing.',
    blockedRoute:
        'Delete the one you do not want yourself, or create the envelope on a storey that does not '
        + 'carry it, and press again.',
});

/** How an envelope reads in a sentence: its name, or its area, or — last — its id. */
export function describeLevelEnvelope(e: ExistingLevelEnvelope): string {
    if (e.name !== null) {
        return e.footprintAreaM2 === null
            ? e.name
            : `${e.name} · ${e.footprintAreaM2.toFixed(0)} m²`;
    }
    return e.footprintAreaM2 === null
        ? e.id
        : `${e.footprintAreaM2.toFixed(0)} m² (unnamed)`;
}

/**
 * Decide what a new generated level envelope does about the ones already on its storey.
 *
 * @param onStorey the level envelopes seated on the TARGET storey — already filtered by the
 *                 caller, because the storey is the caller's decision (`pickGroundLevel`) and
 *                 re-deciding it here would be a second answer to that question.
 */
export function resolveLevelEnvelopeSupersession(
    onStorey: readonly ExistingLevelEnvelope[],
    rule: SupersessionRule = GENERATED_MASSING_RULE,
): LevelEnvelopeSupersession {
    const span = _tracer.startSpan('pryzm.site.resolveLevelEnvelopeSupersession');
    try {
        if (onStorey.length === 0) {
            span.setAttribute('pryzm.supersede.kind', 'none');
            return { kind: 'none' };
        }
        span.setAttribute('pryzm.supersede.rule', rule === GENERATED_MASSING_RULE ? 'generated-massing' : 'own-authoring');
        const blockers = onStorey.filter((e) => !rule.replaceable(e.provenance));
        if (blockers.length > 0) {
            span.setAttribute('pryzm.supersede.kind', 'blocked');
            span.setAttribute('pryzm.supersede.blockers', blockers.length);
            const one = blockers.length === 1;
            const named = blockers.map((b) => `${describeLevelEnvelope(b)} — ${
                b.provenance === null
                    ? 'no origin recorded on the record at all'
                    : describeProvenance(b.provenance)
            }`).join('; ');
            return {
                kind: 'blocked',
                blockers: Object.freeze([...blockers]),
                sentence:
                    `This storey already carries ${one ? 'a level envelope' : `${blockers.length} level envelopes`} `
                    + `${rule.blockedClause(one)} (${named}). ⛔ PRYZM will not delete `
                    + `${one ? 'it' : 'them'}: ${rule.blockedWhy} Nothing was `
                    + `created and nothing was deleted. ${rule.blockedRoute}`,
            };
        }
        span.setAttribute('pryzm.supersede.kind', 'replace');
        span.setAttribute('pryzm.supersede.targets', onStorey.length);
        const names = onStorey.map(describeLevelEnvelope).join(', ');
        const one = onStorey.length === 1;
        return {
            kind: 'replace',
            ids: Object.freeze(onStorey.map((e) => e.id)),
            targets: Object.freeze([...onStorey]),
            sentence: one
                ? `Replaces the level envelope already on this storey (${names}), which ${rule.replacedClause}. `
                  + 'The replacement is ONE undo — Ctrl+Z brings the previous one back.'
                : `Replaces the ${onStorey.length} level envelopes already on this storey (${names}), all of `
                  + `which ${rule.replacedClause}. The replacement is ONE undo — Ctrl+Z brings them all back.`,
        };
    } finally {
        span.end();
    }
}
