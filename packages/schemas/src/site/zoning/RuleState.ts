// §RULE-STATE — the SHARED per-rule state vocabulary. C58 §1.2/§1.4/§1.13, C62, C74 §0, C75.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND THE ONE SENTENCE THAT CAUSED IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder transmission, 2026-09-03, captured verbatim in
// `docs/04-reference/jurisdictions/fr/FR-FOUNDER-REACHABILITY-BOUNDARY.md` §1:
//
//     "Don't make the solver ask 'Do I have height?'. Make it ask
//      'What is the STATE of the height rule?'"
//
// Everything in this file is that sentence applied. A nullable numeric field can express exactly
// two things — a number, and the absence of one — and the absence is where every honesty failure
// this repository has paid for lives (§CONTEXT-DATA-HONESTY, L-422/457/467/469: *failure and empty
// are the same value*). The cure is not a better null. It is to stop asking a yes/no question.
//
// ⚠ THIS IS DELIBERATELY NOT FRANCE-SPECIFIC, AND THAT IS THE POINT. The founder's five states,
// the NSW brief's `A / B / C / D / E / F1 / F2` status taxonomy (`NSW-ENVELOPE-BUILD-PROMPT.md`
// §11) and the Netherlands master's identical `A–F2` (`NL-ENVELOPE-MASTER-PROMPT.md` §12, audited
// in `NL-DATA-GAP-AUDIT.md` §1.10) are THE SAME SHAPE described three times. Three lanes were each
// about to mint it inside their own country adapter. §RECONCILIATION below is the single mapping;
// there is no fourth vocabulary and no per-country spelling.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS NOT — the composition rules, which are load-bearing
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. ⛔ NOT a rival to `EnvelopeConfidence`. That is a property of a WHOLE `BuildableEnvelope`
//     ("how strong is this determination"). This is a property of ONE RULE at ONE parcel ("what
//     kind of answer does this rule admit here"). A parcel can hold a `resolved` height and an
//     `unrecovered` emprise inside a single `estimated-ruleset` envelope. **A state is not a
//     confidence, and a confidence is not a signature** (C58 §1.2, §ENVELOPE-CONFIDENCE-LADDER).
//  2. ⛔ NOT a rival to `FieldProvenance`. A `resolved` rule CARRIES one — `provenance` is a
//     required field of the `resolved` arm precisely so the two compose instead of competing.
//  3. ⛔ NOT a rival to `EnvelopeRefusalCode`. That names why an ENVELOPE has no volume. This
//     names why a RULE has no number. `refused` here does not imply a refused envelope: a zone
//     with `no-limit-stated` height still yields an envelope from its other rules.
//  4. ⛔ NOT a rival to `FetchOutcome`. That is transport (did the source answer). This is
//     epistemic (can the answer be recovered at all). A `transient` fetch maps to `unrecovered`
//     with failure `inaccessible`; a durable `absent` does NOT — see §F1-VS-F2.
//
// P5 PURITY: Zod + pure total functions only. Zero I/O, zero THREE, zero DOM, zero clock, zero
// RNG — `tools/ga-gate/check-domain-purity.ts` hard-fails otherwise. The reducers below are pure
// deterministic folds and take no OpenTelemetry span, the documented L0 carve-out this package
// already relies on for `authorityOutranks` (C62) and `renormalizedOverall` (C63).
//
// C67/C68 APPLICABILITY, STATED SO NOBODY HAS TO GUESS: C68 §4 binds a PR that registers a bus
// command (no), adds an element KIND (no), or adds a user-visible attribute to an ELEMENT RECORD —
// "a new field on a `*Data` schema, a new property-panel row, or a new value in an existing type's
// layer/enum vocabulary" (no: this is a site/zoning data shape, it touches no `*Data` element
// schema, registers no command, and adds no property-panel row). C67's control plane is likewise
// not engaged. Neither binds. When a UI later RENDERS these states on a panel, that PR does.
//
// Strategic context — C58 §1.2/§1.4/§1.13, C62 (confidence/provenance), C74 §0 (reported identity
// must equal performed work), C75 (provenance), ADR-0377 (`HeightDatum`),
// `docs/04-reference/jurisdictions/fr/FR-FOUNDER-REACHABILITY-BOUNDARY.md` §1/§4/§9.

import { z } from 'zod';

// ⚠ COMPOSED, NEVER RE-DECLARED (C84 EI-9). The E1a per-rule LEGAL ADDRESS
// (`country/authority/dataset/plan_id/object_id/document/article/page`) is already ratified and
// frozen in `siteintel/provenance.ts`; the FR audit calls it "our F1–F8 `RuleSourceRef`". A
// three-field lookalike was drafted here first and DELETED on discovering it — a second spelling of
// a legal citation is exactly the drift this file exists to prevent, and `RuleSourceRefSchema`
// already carries strictly more than the founder's `{source, article}` pair.
import { RuleSourceRefSchema } from '../../siteintel/provenance.js';
import { FieldProvenanceSchema } from './ProvenanceFlags.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// AXIS 1 — REACHABILITY: what kind of answer this rule ADMITS in this jurisdiction
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * §RULE-REACHABILITY — the founder's five states, verbatim in meaning and in order.
 *
 * ⚠ THIS IS A PROPERTY OF THE RULE-IN-ITS-DATA-ESTATE, NOT OF ONE PARCEL'S ANSWER. It says what
 * the BEST deterministic pipeline could ever achieve for this rule here — the ceiling. The
 * `RuleState` below says what was ACTUALLY achieved at this parcel — the reading. Two different
 * facts, deliberately two fields: a rule that is `extractable` but was not extracted is a PRYZM
 * backlog item; a rule that is `undeterminable` and was not answered is a correct refusal, and
 * putting them in one field would make a build queue indistinguishable from a hard boundary.
 *
 *   - 🟢 `source-complete` — an authoritative MACHINE-READABLE value exists. A published numeric
 *                           field, or explicit authoritative geometry (a drawn `39.02` height
 *                           polygon, a Dutch `bouwvlak`, an NSW HOB raster). Read it; do not
 *                           derive it. This is the only state where PRYZM adds no interpretation.
 *   - 🔵 `derivable`       — authoritative GEOMETRY/DATA exists and **PRYZM CALCULATES the value
 *                           from it.** Parcel area, frontage edges, terrain slope, neighbour
 *                           heights, distances. ⚠ THE CLASSIFICATION THAT MOVES MOST WORK: the
 *                           founder's §5.1 correction re-classified French frontage OUT of "the
 *                           government doesn't publish it" and INTO this state. A `derivable`
 *                           rule is NOT a data gap and must never be reported as one — it is an
 *                           unbuilt computation over data we already hold, i.e. OUR backlog.
 *   - 🟡 `extractable`     — the authoritative value EXISTS, in XML / structured text / PDF prose
 *                           / a dimension on a plan graphique. Recoverable by a deterministic
 *                           extraction pipeline, not by a query. Where the moat is.
 *   - 🟠 `interpretive`    — the rule EXISTS and requires legal or semantic INTERPRETATION before
 *                           it yields a parameter: which datum "hauteur" is measured from, how two
 *                           overlays interact, what an OAP implies for a volume. The document is
 *                           in hand and reading it is not enough.
 *   - 🔴 `undeterminable`  — **no authoritative dataset can answer the question, and none will.**
 *                           RNU→PAU membership, an ABF opinion, a future consent decision, legal
 *                           mitoyenneté, a numeric value for a genuinely qualitative rule. ⚠ NOT
 *                           "hard": IMPOSSIBLE. Adding sources does not move this state. PRYZM
 *                           REFUSES here, and refusing is the correct answer, not a failure.
 */
export const RuleReachabilitySchema = z.enum([
    'source-complete',
    'derivable',
    'extractable',
    'interpretive',
    'undeterminable',
]);
export type RuleReachability = z.infer<typeof RuleReachabilitySchema>;

/**
 * The reachability ladder, **strongest → weakest**. The ONE ordered statement, in L0, next to the
 * enum — the same discipline (and the same reason) as `ENVELOPE_CONFIDENCE_ORDER`: an ordering
 * that only one layer can see is not an ordering of the vocabulary.
 *
 * ⚠ THE ORDER IS NORMATIVE. `source-complete` > `derivable` because reading a published number
 * beats computing one, even a computation we trust: the publisher is accountable for theirs.
 * `derivable` > `extractable` because a deterministic computation over reference geometry is
 * repeatable in a way an extraction from prose is not. `interpretive` sits below `extractable`
 * because getting the words out is strictly easier than settling what they mean.
 */
export const RULE_REACHABILITY_ORDER = [
    'source-complete',
    'derivable',
    'extractable',
    'interpretive',
    'undeterminable',
] as const satisfies readonly RuleReachability[];

/** Ladder position (0 = strongest). Pure + total by construction. */
export function ruleReachabilityRank(r: RuleReachability): number {
    return RULE_REACHABILITY_ORDER.indexOf(r);
}

/**
 * Is this reachability state one PRYZM can close by BUILDING something?
 *
 * ⚠ THE MOST CONSEQUENTIAL PREDICATE IN THIS FILE, because it separates a roadmap from a wall.
 * `derivable` / `extractable` / `interpretive` are all work WE have not done — a computation not
 * written, a parser not built, a semantic not seated. `undeterminable` is not work; no amount of
 * engineering closes it. `source-complete` needs nothing. A coverage report that lumps the middle
 * three in with `undeterminable` tells a founder the country is unreachable when the truth is
 * that we have not written the code — the exact over-pessimism the founder's transmission was
 * sent to correct (§0: "very little is truly unreachable").
 */
export function isClosableByBuilding(r: RuleReachability): boolean {
    return r === 'derivable' || r === 'extractable' || r === 'interpretive';
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// AXIS 2 — WHICH RULE. The ratified parameter ids, not a free string.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The envelope parameter this state is about, keyed by the ids of
 * `docs/01-strategy/STR-ENVELOPE-PARAMETER-REFERENCE.md` — the ratified spelling. A closed enum
 * rather than a string for the same reason `EnvelopeRefusalCode` is closed: these are aggregated
 * into coverage figures, and a typo would silently open a second, invisible bucket.
 *
 * ⚠ `D1` (floor-area limit) IS A MEMBER, AND ITS PRESENCE IS A CORRECTION. Four shipped texts said
 * "France has no D1 at all". COS is dead (repealed by the 2014/2015 reforms, Légifrance
 * `LEGIARTI000029593965`); `surface de plancher` is ALIVE and floor-area-affecting rules can still
 * bind in a given PLU. `D1` is NULLABLE per jurisdiction — it is never ABSENT from the vocabulary.
 * Deleting the key would throw away a legitimate constraint because it lost its old name
 * (FR-FOUNDER-REACHABILITY-BOUNDARY §6).
 */
export const EnvelopeParameterKeySchema = z.enum([
    // A — physical facts about the site
    'A1', // parcel polygon
    'A2', // height reference datum
    'A3', // frontage classification per edge
    'A4', // right-of-way width per frontage
    'A5', // terrain surface
    'A6', // adjacent building heights / party-wall positions
    // B — the instrument
    'B1', // governing instrument + version + in-force date
    'B2', // zone code
    'B3', // subzone
    'B4', // ordered overlay stack
    'B5', // site-specific override flag
    // C — the shape of the volume
    'C1', // ordering type
    'C2', // maximum height
    'C3', // maximum storeys
    'C4', // footprint limit (ratio or depth)
    'C5', // setbacks per frontage type
    'C6', // shaping constraints (planes, offset surfaces)
    // D — the quantum
    'D1', // floor-area limit  ⚠ see the note above — nullable, never absent
    'D2', // floor-area exclusion rules
    'D3', // bonuses and increments
    // E — the resolution rules
    'E1', // multi-frontage resolution
    'E2', // height / storey precedence
    'E3', // overlay conflict order
    'E4', // prescriptive vs discretionary
    'E5', // quantum trimming policy
]);
export type EnvelopeParameterKey = z.infer<typeof EnvelopeParameterKeySchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// AXIS 3 — WHY A VALUE DID NOT ARRIVE. The founder's six labels, verbatim.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * §FAILURE-TAXONOMY — the six labels the founder specifies for the 100-parcel audit
 * (FR-FOUNDER-REACHABILITY-BOUNDARY §11), kept verbatim so the audit's output and the runtime's
 * output are the same vocabulary and can be compared without a translation table.
 *
 *   - `missing-source`  — no authoritative source carries this rule at this point at all.
 *   - `inaccessible`    — the source EXISTS and could not be retrieved (404, TLS, auth, dead
 *                         URLFIC, a partition that will not download). ⚠ THE ONLY LABEL THAT MAY
 *                         BE TRANSIENT, and therefore the only one a retry can clear.
 *   - `pdf`             — the value is in a PDF and no extractor read it.
 *   - `graphic`         — the value is encoded VISUALLY (a `5m` dimension against a road line on a
 *                         plan graphique). Reachable, not structured; the founder's "biggest
 *                         technical grey area".
 *   - `semantic`        — the words were recovered and their MEANING was not settled: which datum,
 *                         which of two regimes, how an exception applies.
 *   - `discretionary`   — the rule is real and admits no deterministic value: an authority decides.
 *                         ⚠ Reaching this label is NOT a pipeline failure. It is the pipeline
 *                         working and the answer being "a person decides". Counting it as a defect
 *                         is how a correct refusal gets mistaken for a bug.
 */
export const RuleExtractionFailureSchema = z.enum([
    'missing-source',
    'inaccessible',
    'pdf',
    'graphic',
    'semantic',
    'discretionary',
]);
export type RuleExtractionFailure = z.infer<typeof RuleExtractionFailureSchema>;

/**
 * §F1-VS-F2 (first half) — was a MECHANISM for this rule found in the governing instrument?
 *
 * ⚠ THIS FIELD EXISTS SOLELY TO KEEP F1 SEPARATE FROM EVERYTHING ELSE, and the NL and NSW audits
 * both name that separation as their open GAP (`NL-DATA-GAP-AUDIT.md` §1.10 rows F1/F2 — "one code
 * covers both"; `NSW-ENVELOPE-BUILD-PROMPT.md` §11/§13 — "F1 and F2 remain separate statuses").
 *
 *   - `present` — the instrument HAS a mechanism for this rule (a `39.02` polygon exists, an
 *                 article is titled "Hauteur"), and the VALUE did not come out. A pure extraction
 *                 failure: the `failure` label says which rung the ladder stopped on.
 *   - `absent`  — **F1 EXACTLY.** The plan was read and carries NO envelope mechanism for this
 *                 rule. ⚠ THIS IS A GAP, NOT A NULL. It means one of two things and we cannot yet
 *                 tell which: either the plan really is silent (and something else governs), or
 *                 our reading missed it. Both are OURS. It must never be rendered as "the law sets
 *                 no limit" — that is the F2 claim, and asserting it from `absent` is a false
 *                 statement about someone's land.
 *   - `unknown` — we never got far enough to say (the document was never opened).
 */
export const RuleMechanismPresenceSchema = z.enum(['present', 'absent', 'unknown']);
export type RuleMechanismPresence = z.infer<typeof RuleMechanismPresenceSchema>;

/**
 * §F1-VS-F2 (second half) — WHY there is deliberately no number, when the absence is CORRECT.
 *
 * Every member here is `legallyGrounded: true` — a statement about the LAW, never about PRYZM's
 * coverage. That is the entire difference from `unrecovered`, and it is why they are separate arms
 * of the union rather than a flag on one arm.
 *
 *   - `rule-not-applicable`   — **F2 EXACTLY.** The rule has no subject on this land: water,
 *                               rail corridor, public system, an NSW RE1 reservation. The correct
 *                               null. ⚠ NOT A GAP — and merging it with F1 corrupts every coverage
 *                               figure in both directions at once (it inflates the numerator with
 *                               land we never answered for, and it inflates the denominator with
 *                               questions that were never asked).
 *   - `no-limit-stated`       — the instrument APPLIES here and deliberately states no limit for
 *                               this parameter. ⚠⚠ THIS IS NOT "UNBOUNDED", AND A SOLVER MUST NOT
 *                               READ IT AS ONE. L-616 is the standing precedent: an UNKNOWN
 *                               constraint drawn as zero-or-unbounded is an OVERSTATEMENT on real
 *                               land. Other rules still bind; this one is simply silent.
 *   - `requires-determination`— 🔴 the founder's `{"rule":"PAU","status":"refused","reason":"RNU"}`.
 *                               The law is knowable and the DECISION is not: RNU→PAU membership,
 *                               an ABF opinion, legal mitoyenneté, a future consent. **REFUSE.
 *                               NEVER INFER.** No dataset closes this and no retry helps.
 */
export const RuleAbsenceBasisSchema = z.enum([
    'rule-not-applicable',
    'no-limit-stated',
    'requires-determination',
]);
export type RuleAbsenceBasis = z.infer<typeof RuleAbsenceBasisSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE STATE ITSELF — the founder's JSON shape, typed
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠ THE `ref` FIELD ON EVERY ARM IS THE E1a `RuleSourceRefSchema`, IMPORTED WHOLE.
 *
 * **Every arm carries one, including the refusals.** A refusal with no citation is an unsourced
 * claim about the law, and the UI must say so exactly as it does for an uncited number — the
 * `EnvelopeRefusal.ordinanceRef` discipline (C58 §1.3), restated per-rule.
 *
 * The founder's shapes print `source` + `article`; the E1a record carries eight fields
 * (`country/authority/dataset/plan_id/object_id/document/article/page`), of which only the first
 * three are required and the rest thin out honestly to `null`. That is a superset, so the
 * founder's shape is expressible and the citation vocabulary stays singular.
 *
 * NON-RIVALRY with the E1a confidence model, stated so a reader does not have to infer it:
 * `SiteIntelConfidenceTier` is a six-tier PROJECTION of `derivation × valueLocation × source-kind ×
 * validation-event` — how a value that EXISTS came to be known. `RuleReachability` is the ceiling
 * of the data estate for a rule whose value may not exist in machine form at all, and `RuleState`
 * is what was actually obtained. Tier 6 (`uncertain-missing`) is the single tier that touches this
 * space, and it collapses F1, F2, qualitative and alternative into one bucket — which is precisely
 * the gap this union opens up, not a duplication of it.
 */

/**
 * §RULE-STATE — what PRYZM can say about ONE rule at ONE parcel. Five arms, and every one of them
 * is a DIFFERENT CLAIM that a nullable number would have flattened into `null`.
 *
 * The founder's four JSON shapes map 1:1 onto four of them (`resolved` / `qualitative` /
 * `alternative` / `refused`); the fifth (`unrecovered`) is the one his shapes leave implicit and
 * that this repository has been bitten by five times — *we did not get the value, and that is
 * about US, not about the law*.
 *
 * ⚠ THE INVARIANT THAT MAKES THIS WORTH TYPING: `unrecovered` is the ONLY arm that is a statement
 * about PRYZM. Every other arm is a statement about the instrument. A UI may therefore colour the
 * union by arm and be correct by construction, and a coverage reducer may count `unrecovered`
 * against us and be correct by construction — neither has to re-derive the distinction, which is
 * precisely the re-derivation that drifted in L-422/457/467/469.
 */
export const RuleStateSchema = z.discriminatedUnion('status', [
    /**
     * 🟢/🔵 An authoritative parameter was recovered. `{ rule, status:'resolved', value, unit,
     * datum, source, article }` — the founder's first shape.
     */
    z.object({
        rule: EnvelopeParameterKeySchema,
        status: z.literal('resolved'),
        reachability: RuleReachabilitySchema,
        /** The recovered value. Numeric for C2/C3/C4/D1; string/structured for C1/E4. */
        value: z.union([z.number(), z.string()]),
        /** `"m"`, `"storeys"`, `"ratio"`, `"m2"` — never omitted for a numeric value. */
        unit: z.string().min(1).nullable().default(null),
        /**
         * For a VERTICAL parameter, the plane the number is measured from — the `HeightDatum`
         * discriminant name (ADR-0377), or null where the parameter has no datum.
         * ⚠ A height with an unresolved datum is NOT `resolved`: it is `unrecovered` with failure
         * `semantic`, because a number on an unknown plane cannot be multiplied into a volume.
         */
        datum: z.string().min(1).nullable().default(null),
        /** Composes with C58 §1.6 — this does NOT replace `FieldProvenance`, it carries one. */
        provenance: FieldProvenanceSchema,
        ref: RuleSourceRefSchema,
    }),

    /**
     * 🟠 The rule EXISTS and is legally NON-NUMERIC. `{ rule, status:'qualitative', text, article }`.
     *
     * ⭐ THE HONEST THIRD ANSWER, AND THE SOURCE ITSELF LICENSES IT. CNIG PLU 2025 carries explicit
     * codes for exactly this: `39.97` qualitative height, `38.97` qualitative emprise, `40.97`
     * qualitative volumetry. France's R151-12 makes non-numeric rules legally valid. So
     * `QUALITATIVE RULE` is not a euphemism for `UNKNOWN` — it is what the instrument says, and
     * reporting it as unknown understates our reading of a document we read correctly.
     *
     * ⚠ THE TEXT IS QUOTED VERBATIM AND NEVER PARAPHRASED, and no arm of this union converts it to
     * a number. A qualitative rule silently rendered as a numeric limit is the worst failure in
     * this family: it manufactures an entitlement out of a sentence that grants none.
     */
    z.object({
        rule: EnvelopeParameterKeySchema,
        status: z.literal('qualitative'),
        reachability: RuleReachabilitySchema,
        /** The rule, VERBATIM. Never summarised, never normalised, never numeric. */
        text: z.string().min(1),
        ref: RuleSourceRefSchema,
    }),

    /**
     * 🟡 The rule offers NAMED ALTERNATIVES and the instrument does not say which binds here.
     * `{ rule, status:'alternative', alternatives:[...] }`. CNIG `38.98` / `39.98` / `40.98`.
     *
     * ⚠ NOT A RANGE, AND NOT AN AVERAGE. Each alternative is a distinct legal reading; picking one
     * is a determination PRYZM has not made, and interpolating between them produces a number no
     * article supports. A consumer may show all of them, or the tightest as a bound clearly
     * labelled as such — never a single unlabelled figure. This is the NL master's class **C**
     * (bounded underdetermined): honest bounds, no unique geometry.
     */
    z.object({
        rule: EnvelopeParameterKeySchema,
        status: z.literal('alternative'),
        reachability: RuleReachabilitySchema,
        alternatives: z.array(z.string().min(1)).min(2),
        ref: RuleSourceRefSchema,
    }),

    /**
     * ⚠ THE PRYZM-SIDE ARM. The rule applies (or may apply) and **we did not recover its value.**
     * This is the ONLY arm that is a statement about our coverage, and `legallyGrounded` is
     * therefore false for it, always, by construction (see `isRuleLegallyGrounded`).
     *
     * `mechanism: 'absent'` here is **F1** — plan read, no envelope mechanism found, a GAP.
     * It is NOT `refused`/`rule-not-applicable` (**F2**), which asserts the law is silent by
     * design. Telling an owner "the law sets no limit" when the truth is "we did not find it"
     * is a false negative about their land, which L-553 ranks as the worst error in the set.
     */
    z.object({
        rule: EnvelopeParameterKeySchema,
        status: z.literal('unrecovered'),
        reachability: RuleReachabilitySchema,
        failure: RuleExtractionFailureSchema,
        mechanism: RuleMechanismPresenceSchema,
        /** Where the trace stopped — the document, page, partition or endpoint. */
        stoppedAt: z.string().min(1).nullable().default(null),
        ref: RuleSourceRefSchema,
    }),

    /**
     * 🔴 / F2 — no number will be produced, and that is the CORRECT answer.
     * `{ rule:'PAU', status:'refused', reason:'RNU' }` — the founder's fourth shape.
     *
     * `basis` carries which of the three correct absences this is; all three are
     * `legallyGrounded: true`. ⚠ `requires-determination` earns NO retry affordance — a retry
     * never produces a legal fact nobody publishes (the `regime-undetermined` precedent, ADR-0274).
     */
    z.object({
        rule: EnvelopeParameterKeySchema,
        status: z.literal('refused'),
        reachability: RuleReachabilitySchema,
        basis: RuleAbsenceBasisSchema,
        /** One line the reader sees first — e.g. "RNU commune: PAU membership is not published." */
        reason: z.string().min(1),
        ref: RuleSourceRefSchema,
    }),
]);
export type RuleState = z.infer<typeof RuleStateSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PREDICATES — the distinctions, stated ONCE so no consumer re-derives them
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Did the instrument give us an ANSWER of some kind (a number, a sentence, or a set)? */
export function isRuleAnswered(s: RuleState): boolean {
    return s.status === 'resolved' || s.status === 'qualitative' || s.status === 'alternative';
}

/**
 * Is this a statement about the LAW (`true`) or about PRYZM's coverage (`false`)?
 *
 * The exact seam `EnvelopeRefusal.legallyGrounded` draws at the envelope level, drawn here at the
 * rule level. Total by construction: only `unrecovered` is false.
 */
export function isRuleLegallyGrounded(s: RuleState): boolean {
    return s.status !== 'unrecovered';
}

/**
 * **F1** — the plan exists and carries no envelope mechanism for this rule. A GAP, and ours.
 * Kept a named predicate rather than an inline check because the NL and NSW audits both record
 * the F1/F2 merge as their open defect, and an inline check is how it merges again.
 */
export function isF1PlanNoMechanism(s: RuleState): boolean {
    return s.status === 'unrecovered' && s.mechanism === 'absent';
}

/** **F2** — a correct null: the rule has no subject on this land. NOT a gap. */
export function isF2CorrectNull(s: RuleState): boolean {
    return s.status === 'refused' && s.basis === 'rule-not-applicable';
}

/**
 * Is this state one a RETRY could change? Exactly one combination qualifies, and the narrowness is
 * the point: `unrecovered` + `inaccessible`. Offering a retry anywhere else loops for ever — the
 * `regime-undetermined` / `no-plan-at-point` lesson (ADR-0274, STRUCTURAL-SEAM-4).
 */
export function isRuleRetryable(s: RuleState): boolean {
    return s.status === 'unrecovered' && s.failure === 'inaccessible';
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE COVERAGE REDUCER — the founder's question, computed the one honest way
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The result of `ruleRecovery`. Every field is a COUNT plus one derived rate, so a reader can
 * always reconstruct the arithmetic rather than trusting the rate.
 */
export interface RuleRecoveryReport {
    /** `resolved` — an authoritative parameter arrived, with its address. */
    readonly resolved: number;
    /** `qualitative` — a real, legally non-numeric answer. Answered, NOT resolved. */
    readonly qualitative: number;
    /** `alternative` — a real answer with no unique reading. Answered, NOT resolved. */
    readonly alternative: number;
    /** `unrecovered` — OUR gap. F1 is the subset with `mechanism: 'absent'`. */
    readonly unrecovered: number;
    /** F1 — plan read, no mechanism found. A subset of `unrecovered`, reported separately. */
    readonly f1PlanNoMechanism: number;
    /** F2 — correct null. **EXCLUDED FROM THE DENOMINATOR.** */
    readonly f2CorrectNull: number;
    /** `refused` with `no-limit-stated` — the instrument is deliberately silent. In-denominator. */
    readonly noLimitStated: number;
    /** 🔴 `requires-determination` — the hard boundary. In-denominator: it IS an answer. */
    readonly requiresDetermination: number;
    /** Failure counts by the founder's six labels, over `unrecovered` only. */
    readonly failures: Readonly<Record<RuleExtractionFailure, number>>;
    /**
     * The questions that were actually ASKED: every state except F2 correct-nulls.
     *
     * ⚠ THE ONE PIECE OF ARITHMETIC THIS FILE EXISTS TO GET RIGHT. A rule with no subject on this
     * land was never a question, so counting it as one understates recovery on land where the law
     * simply had nothing to say; counting it as RECOVERED overstates it. It is excluded, not
     * scored. This is what "merging F1 and F2 corrupts every coverage figure" means in code.
     */
    readonly denominator: number;
    /**
     * `resolved / denominator` — **the founder's number**: "of the rules that apply to a random
     * parcel, what percentage can PRYZM recover as an authoritative parameter without human
     * judgement?" Null when the denominator is 0 (no question was asked — not "0%").
     *
     * ⚠ `qualitative` and `alternative` are deliberately NOT in this numerator. They are honest
     * answers and they are not authoritative PARAMETERS; folding them in would answer a different,
     * easier question while wearing this one's name.
     */
    readonly parameterRecoveryRate: number | null;
    /**
     * `(resolved + qualitative + alternative + requiresDetermination + noLimitStated) /
     * denominator` — the share of asked questions PRYZM answered CORRECTLY in any honest form,
     * including by refusing where refusal is right. Reported alongside, never instead: the two
     * numbers answer different questions and a single figure hides which one is being claimed.
     */
    readonly honestAnswerRate: number | null;
}

const EMPTY_FAILURES: Readonly<Record<RuleExtractionFailure, number>> = Object.freeze({
    'missing-source': 0,
    inaccessible: 0,
    pdf: 0,
    graphic: 0,
    semantic: 0,
    discretionary: 0,
});

/**
 * Fold a set of rule states into the coverage report above. Pure, total, order-independent.
 *
 * ⚠ IT REFUSES TO PRODUCE A RATE FROM AN EMPTY DENOMINATOR (returns `null`, never `0`). A 0% that
 * means "nothing was asked" and a 0% that means "everything failed" are the same value printed
 * two ways, and this file exists because that collapse keeps costing us.
 */
export function ruleRecovery(states: readonly RuleState[]): RuleRecoveryReport {
    const failures: Record<RuleExtractionFailure, number> = { ...EMPTY_FAILURES };
    let resolved = 0;
    let qualitative = 0;
    let alternative = 0;
    let unrecovered = 0;
    let f1 = 0;
    let f2 = 0;
    let noLimitStated = 0;
    let requiresDetermination = 0;

    for (const s of states) {
        switch (s.status) {
            case 'resolved':
                resolved += 1;
                break;
            case 'qualitative':
                qualitative += 1;
                break;
            case 'alternative':
                alternative += 1;
                break;
            case 'unrecovered':
                unrecovered += 1;
                failures[s.failure] += 1;
                if (s.mechanism === 'absent') f1 += 1;
                break;
            case 'refused':
                if (s.basis === 'rule-not-applicable') f2 += 1;
                else if (s.basis === 'no-limit-stated') noLimitStated += 1;
                else requiresDetermination += 1;
                break;
        }
    }

    const denominator = states.length - f2;
    const honest = resolved + qualitative + alternative + requiresDetermination + noLimitStated;

    return {
        resolved,
        qualitative,
        alternative,
        unrecovered,
        f1PlanNoMechanism: f1,
        f2CorrectNull: f2,
        noLimitStated,
        requiresDetermination,
        failures: Object.freeze(failures),
        denominator,
        parameterRecoveryRate: denominator > 0 ? resolved / denominator : null,
        honestAnswerRate: denominator > 0 ? honest / denominator : null,
    };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §RECONCILIATION — the ONE mapping of the three briefs' taxonomies onto this vocabulary
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The NSW brief's and the Netherlands master's `A / B / C / D / E / F1 / F2` answer-determinacy
 * letters (`NSW-ENVELOPE-BUILD-PROMPT.md` §11, `NL-ENVELOPE-MASTER-PROMPT.md` §12), stated once
 * against this union so **no lane mints a third spelling**. Both briefs describe the same shape;
 * `NL-DATA-GAP-AUDIT.md` §1.10 already ruled "extend the existing vocabulary, do not mint a rival",
 * and named F1/F2 as the single missing piece — which `mechanism` and `basis` now supply.
 *
 * ⚠ THIS IS A DOCUMENTATION CONSTANT, NOT A RUNTIME TRANSLATOR, and deliberately so. A live
 * letter→state function would invite a caller to store the LETTER and translate on read, which
 * re-opens the drift the single vocabulary closes (the `certified`/`constructed-amber` lesson,
 * C63 §3.2 / L-664: historic names are recorded in prose, never exported as live aliases).
 */
export const ANSWER_DETERMINACY_RECONCILIATION = Object.freeze({
    /** Fully determined (+ signature, which is `EnvelopeConfidence`'s job, not this union's). */
    A: 'status: resolved',
    /** Determined WITH CONDITIONS — resolved, with the conditions carried as caveats. */
    B: 'status: resolved (conditions carried by the consumer; not a separate state)',
    /** Bounded underdetermined — honest bounds, no unique geometry. */
    C: 'status: alternative',
    /** Requires legal interpretation. */
    D: "status: refused, basis: 'requires-determination' — or reachability: 'interpretive'",
    /** Source missing. */
    E: "status: unrecovered, failure: 'missing-source' | 'inaccessible'",
    /** Plan exists, no envelope mechanism — A GAP. */
    F1: "status: unrecovered, mechanism: 'absent'",
    /** Correct null — NOT a gap. Excluded from the coverage denominator. */
    F2: "status: refused, basis: 'rule-not-applicable'",
} as const);
