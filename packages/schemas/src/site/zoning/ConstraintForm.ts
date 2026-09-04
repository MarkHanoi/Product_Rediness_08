// §CONSTRAINT-FORM — the SIX forms a planning constraint takes. C58 §1.2/§1.4, C62, C74 §0, C75.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND THE TRANSMISSION THAT CAUSED IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder transmission, Spain field-level pass, captured in
// `docs/04-reference/jurisdictions/es/ES-FOUNDER-FIELD-LEVEL-PASS.md` §5:
//
//     "This isn't missing information. It's LEGAL COMPUTATION."
//
//     IF zone=CH-2 AND use=residential AND parcel_area<=200m² THEN occupancy_ground=80% ELSE 70%
//     IF floors=3 THEN height <= 10.50m
//     IF parcel.frontage > X THEN a different building-depth rule
//
// ⭐ "So the canonical constraint model must support SIX forms, not one":
//
//     scalar `15 m` · formula `0.5 × street width` · conditional `IF use=X THEN …`
//     geometric `POLYGON` · linear `LINESTRING` · document-derived `article 7.3.4`
//
// A real Andalusian norm — "maximum edificability 1.5 / 2.0 / 2.5 / 3.0 m²t/m²s DEPENDING ON THE
// NUMBER OF FLOORS" — is not expressible as a nullable number, and the failure mode when you try is
// not an error: it is a PLAUSIBLE WRONG ANSWER. Someone picks one of the four, or averages them,
// and a number no article supports is printed over a real parcel. That is the defect this file
// exists to make unrepresentable.
//
// ⚠ THIS IS NOT SPAIN-SPECIFIC AND MUST NOT LAND IN A COUNTRY ADAPTER. France's `39.02` height
// polygon is `geometric`; its `marge de recul` is `linear`; "H ≤ L/2 de la voie" is `formula`; a
// R151-12 qualitative rule is `document-derived`. The Netherlands' `bouwvlak` is `geometric`. The
// founder's instruction on the five-state model applies verbatim here: build it ONCE, in the
// shared vocabulary. (`FR-FOUNDER-REACHABILITY-BOUNDARY.md` §13 ⭐.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS NOT — and the seam it names rather than replaces
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. ⛔ NOT a rival to `SiteIntelRule` (E1a). That schema ALREADY holds both halves — a scalar in
//     `provenance.value` (`number | string | boolean | null`) and everything else in
//     `body: JsonValue`, commented "scalar/conditional expression when not a bare value". The
//     problem is that `body` is an UNTYPED JSON blob: it cannot say WHICH of the six forms a rule
//     is, cannot list the facts it needs without walking it, and cannot be rendered or refused on.
//     This file TYPES that blob's shape. An E1a rule may carry a `ConstraintValue` in `body`; the
//     envelope, provenance, validity and confidence axes stay exactly where they are.
//  2. ⛔ NOT a rival to `RuleState`. That says what PRYZM COULD RECOVER about a rule; this says what
//     SHAPE the recovered rule has. They compose in one direction, stated once in
//     `ruleStatusForResolution` below: resolving a constraint YIELDS a `RuleState` status.
//  3. ⛔ NOT a JSON-Logic evaluator, and deliberately not. `rulepacks/declarative/` (L2) already
//     walks JSON-Logic bodies (`collectConditionVars`, `assertKnownFacts`, `evaluateZoneParameter`)
//     and owns the closed fact vocabulary. Minting a second evaluator is the drift this repo has
//     paid for repeatedly (§GREP-FOR-THE-EXISTING-SOLVER-FIRST). What L0 adds is the TYPED form
//     and a total, three-valued resolution over it — not a second expression language.
//  4. ⛔ NOT a geometry library. Rings and lines are carried as coordinate arrays for TRANSPORT and
//     CLASSIFICATION only; area, intersection and clipping remain the engine's job (P5).
//
// P5 PURITY: Zod + pure total functions. Zero I/O, zero THREE, zero DOM, zero clock, zero RNG —
// `tools/ga-gate/check-domain-purity.ts` hard-fails otherwise. Same inputs → identical output.
//
// C67/C68: neither binds — no bus command, no element kind, no `*Data` field, no property-panel
// row. This is a site/zoning data shape. The PR that RENDERS a constraint on a panel is bound.

import { z } from 'zod';

import { PtSchema, type Pt } from '../types.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SIX FORMS
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * §CONSTRAINT-FORM — the founder's six, in his order.
 *
 * ⚠ THE MEMBERSHIP IS THE POINT, not the spelling: five of the six are things a `number | null`
 * field silently destroys. `scalar` is the only form the old model could hold, which is why every
 * other form used to arrive as `null` — and `null` is where `failure` and `empty` became the same
 * value (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
 *
 *   - `scalar`           — `15 m`. A published number. The only form needing no further work.
 *   - `formula`          — `0.5 × street width`. A number that DOES NOT EXIST until a site fact is
 *                          supplied. ⚠ Not a missing value: an UNEVALUATED one.
 *   - `conditional`      — `IF use=X THEN … ELSE …`. The Andalusian case. Several stated values,
 *                          exactly one of which binds — and which one is a function of site facts.
 *   - `geometric`        — a POLYGON. The rule drawn: a `bouwvlak`, a French `39.02` height
 *                          polygon, a plan-masse sector. Authoritative geometry — CONSUME it,
 *                          never re-derive it (STR §9 P1).
 *   - `linear`           — a LINESTRING. A rule that is a LINE, not an area: an alignment, a
 *                          French `marge de recul`, a build-to line. ⚠ Kept separate from
 *                          `geometric` because the ENGINE treats them differently — a line
 *                          constrains a façade, a polygon constrains a footprint, and buffering
 *                          one into the other is an interpretation, not a conversion.
 *   - `document-derived` — `article 7.3.4`. The rule exists, is cited, and is NOT reducible to any
 *                          of the five above. ⚠ THIS IS AN ANSWER, NOT A FAILURE — it is the form
 *                          a legally qualitative rule takes (`RuleState` status `qualitative`).
 */
export const ConstraintFormSchema = z.enum([
    'scalar',
    'formula',
    'conditional',
    'geometric',
    'linear',
    'document-derived',
]);
export type ConstraintForm = z.infer<typeof ConstraintFormSchema>;

/**
 * Which forms yield a NUMBER once site facts are supplied. The others are answers of a different
 * kind and must never be coerced into one — a polygon is not a metre, and an article is not a cap.
 */
export function constraintFormIsNumeric(f: ConstraintForm): boolean {
    return f === 'scalar' || f === 'formula' || f === 'conditional';
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PREDICATES — the `IF` half, typed
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** The comparators a planning condition actually uses. Closed: an unknown operator is a parse error. */
export const ConstraintComparatorSchema = z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in']);
export type ConstraintComparator = z.infer<typeof ConstraintComparatorSchema>;

/** A fact value a site can supply. No null: an ABSENT fact is absent from the map, never null-valued. */
export const ConstraintFactSchema = z.union([z.number(), z.string(), z.boolean()]);
export type ConstraintFact = z.infer<typeof ConstraintFactSchema>;

/**
 * One condition over one named site fact — `parcel_area <= 200`, `use = 'residential'`.
 *
 * ⚠ `fact` IS AN OPEN STRING HERE, ON PURPOSE. The CLOSED fact vocabulary lives at L2
 * (`rulepacks/declarative/factVocabulary.ts`, with `assertKnownFacts`), and L0 cannot import L2.
 * Duplicating the vocabulary here would create two lists that drift; the layer that owns the
 * vocabulary keeps owning the validation. What L0 guarantees is that the fact is NAMED and
 * ENUMERABLE (`constraintInputs`) — which is what makes "we cannot evaluate this, and here is
 * exactly what is missing" expressible at all.
 */
export const ConstraintPredicateSchema = z.object({
    fact: z.string().min(1),
    op: ConstraintComparatorSchema,
    operand: z.union([
        z.number(),
        z.string(),
        z.boolean(),
        z.array(z.union([z.number(), z.string()])).min(1),
    ]),
});
export type ConstraintPredicate = z.infer<typeof ConstraintPredicateSchema>;

/**
 * `coefficient × input + constant` — the AFFINE reduction of a formula.
 *
 * ⭐ WHY A TYPED SPECIAL CASE INSTEAD OF AN EXPRESSION LANGUAGE: `0.5 × street width`,
 * `H ≤ L/2 de la voie`, `attic ≤ 50 % of the floor below` are all affine in one site fact, and they
 * are the overwhelming majority of real formula rules. Typing that shape lets the common case
 * EVALUATE with no parser, and — the load-bearing half — lets everything else be carried with
 * `affine: null`, which resolves to a NAMED "carried but not reducible" outcome rather than
 * silently dropping. Building a general expression language instead would have made the
 * un-evaluable case look identical to the un-authored one.
 */
export const AffineReductionSchema = z.object({
    coefficient: z.number().finite(),
    /** The single named site fact the formula scales. */
    input: z.string().min(1),
    constant: z.number().finite().default(0),
});
export type AffineReduction = z.infer<typeof AffineReductionSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONSTRAINT VALUE — recursive, because `conditional` branches to another constraint
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** One `WHEN … THEN …` arm of a conditional. Predicates are conjunctive (all must hold). */
export interface ConstraintCase {
    readonly when: readonly ConstraintPredicate[];
    readonly then: ConstraintValue;
}

export type ConstraintValue =
    | { readonly form: 'scalar'; readonly value: number | string; readonly unit: string | null }
    | {
          readonly form: 'formula';
          /** The rule VERBATIM, in the source language. Never a paraphrase — a paraphrase cannot be reviewed. */
          readonly expression: string;
          readonly inputs: readonly string[];
          readonly unit: string | null;
          readonly affine: AffineReduction | null;
      }
    | {
          readonly form: 'conditional';
          readonly cases: readonly ConstraintCase[];
          /**
           * The `ELSE` arm, or **null when the instrument states none**.
           * ⚠⚠ A NULL `otherwise` IS NOT A ZERO AND NOT AN UNBOUNDED. It means the ordinance
           * enumerated its cases and we fell off the end — which is a hole in OUR reading, not a
           * grant of freedom (L-616: an UNKNOWN constraint drawn as zero-or-unbounded is an
           * OVERSTATEMENT on real land). `resolveConstraint` returns `no-matching-case`, never a value.
           */
          readonly otherwise: ConstraintValue | null;
      }
    | {
          readonly form: 'geometric';
          /** Closed ring, EPSG-agnostic scene coordinates. Carried for transport; the engine does the maths. */
          readonly ring: readonly Pt[];
          /** What the polygon MEANS — `'buildable-footprint'`, `'height-zone'`, `'exclusion'`. */
          readonly role: string;
      }
    | {
          readonly form: 'linear';
          readonly line: readonly Pt[];
          /** `'setback-line'`, `'build-to-alignment'`, `'frontage'`. */
          readonly role: string;
      }
    | {
          readonly form: 'document-derived';
          /** The rule VERBATIM. Never summarised, never normalised, never numeric. */
          readonly text: string;
          /** `"art. 7.3.4"`, `"UC 4.2"` — the article within the cited document, or null. */
          readonly article: string | null;
      };

/**
 * Zod schema for {@link ConstraintValue}. `z.lazy` + an explicit `z.ZodType` annotation is the
 * package's established recursion pattern (`siteintel/json.ts` `JsonValueSchema`,
 * `view/view-template.ts` `FilterConditionSchema`) — followed rather than re-invented.
 */
export const ConstraintValueSchema: z.ZodType<ConstraintValue> = z.lazy(() =>
    z.discriminatedUnion('form', [
        z.object({
            form: z.literal('scalar'),
            value: z.union([z.number(), z.string()]),
            unit: z.string().min(1).nullable().default(null),
        }),
        z.object({
            form: z.literal('formula'),
            expression: z.string().min(1),
            inputs: z.array(z.string().min(1)).readonly(),
            unit: z.string().min(1).nullable().default(null),
            affine: AffineReductionSchema.nullable().default(null),
        }),
        z.object({
            form: z.literal('conditional'),
            cases: z
                .array(
                    z.object({
                        when: z.array(ConstraintPredicateSchema).min(1).readonly(),
                        then: ConstraintValueSchema,
                    }),
                )
                .min(1)
                .readonly(),
            otherwise: ConstraintValueSchema.nullable().default(null),
        }),
        z.object({
            form: z.literal('geometric'),
            ring: z.array(PtSchema).min(3).readonly(),
            role: z.string().min(1),
        }),
        z.object({
            form: z.literal('linear'),
            line: z.array(PtSchema).min(2).readonly(),
            role: z.string().min(1),
        }),
        z.object({
            form: z.literal('document-derived'),
            text: z.string().min(1),
            article: z.string().min(1).nullable().default(null),
        }),
    ]),
) as z.ZodType<ConstraintValue>;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT A CONSTRAINT NEEDS — enumerable, so "we cannot evaluate this" can name its own cause
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Every named site fact this constraint depends on, recursively; sorted and de-duplicated so the
 * output is deterministic and comparable across runs.
 *
 * ⭐ THIS IS THE FUNCTION THAT TURNS A BLOCKER INTO A WORK ITEM. "We cannot compute the envelope"
 * and "we cannot compute the envelope because we do not have `street_width`" are the same failure
 * with wildly different value: the second is a ticket. It is also the join to `RuleReachability` —
 * a constraint whose only missing input is DERIVABLE from national geometry is 🔵, not a data gap
 * (the founder's §5.1 frontage correction, encoded).
 */
export function constraintInputs(v: ConstraintValue): readonly string[] {
    const out = new Set<string>();
    const walk = (c: ConstraintValue): void => {
        switch (c.form) {
            case 'formula':
                for (const i of c.inputs) out.add(i);
                if (c.affine !== null) out.add(c.affine.input);
                break;
            case 'conditional':
                for (const k of c.cases) {
                    for (const p of k.when) out.add(p.fact);
                    walk(k.then);
                }
                if (c.otherwise !== null) walk(c.otherwise);
                break;
            default:
                break;
        }
    };
    walk(v);
    return [...out].sort();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// RESOLUTION — three-valued, because a fact we do not have is not a fact that is false
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Why a constraint produced no scalar. Each member is a DIFFERENT remedy, which is the whole
 * reason they are not one `null`:
 *   - `missing-facts`           — supply the facts (often OUR derivation backlog: 🔵).
 *   - `no-matching-case`        — re-read the instrument; our case list is incomplete. ⚠ NOT "no limit".
 *   - `formula-not-reducible`   — the formula is carried verbatim and needs a human or a richer
 *                                 reduction. The rule is NOT lost; it is un-evaluated.
 *   - `predicate-not-evaluable` — ⚠ THE PACK IS MIS-AUTHORED, not the data missing: a predicate
 *                                 compares incompatible things (a string against a numeric
 *                                 threshold, an `in` against a non-list). Its own bucket because
 *                                 the remedy is a PACK EDIT, and because the alternative — folding
 *                                 it into `missing-facts` — would send someone hunting for data
 *                                 that is already in hand.
 */
export const ConstraintIndeterminacySchema = z.enum([
    'missing-facts',
    'no-matching-case',
    'formula-not-reducible',
    'predicate-not-evaluable',
]);
export type ConstraintIndeterminacy = z.infer<typeof ConstraintIndeterminacySchema>;

export type ConstraintResolution =
    /** A number (or a coded string) with its unit. The only outcome a solver may multiply. */
    | { readonly kind: 'scalar'; readonly value: number | string; readonly unit: string | null }
    /**
     * ⭐ SEVERAL STATED VALUES REMAIN LIVE because the deciding facts are unknown — the Andalusian
     * `1.5 / 2.0 / 2.5 / 3.0` case exactly. **This is the founder's `alternative` state**, reached
     * from the other half of the model, and the join is the point: a conditional whose facts are
     * missing is NOT an unknown, it is a bounded set of legally stated readings.
     * ⚠ NEVER average these, and never silently take the first: each is a distinct legal reading.
     */
    | { readonly kind: 'branch-undetermined'; readonly branches: readonly ConstraintValue[]; readonly missing: readonly string[] }
    | { readonly kind: 'indeterminate'; readonly reason: ConstraintIndeterminacy; readonly missing: readonly string[] }
    /** A polygon, a line, or an article. A real answer, in a form that is not a number. */
    | { readonly kind: 'non-scalar'; readonly form: 'geometric' | 'linear' | 'document-derived' };

/** Three-valued truth: a predicate over a fact we do not hold is UNKNOWN, never false. */
type Trivalent = 'true' | 'false' | 'unknown';

function evalPredicate(p: ConstraintPredicate, facts: Readonly<Record<string, ConstraintFact>>): Trivalent {
    if (!Object.prototype.hasOwnProperty.call(facts, p.fact)) return 'unknown';
    const a = facts[p.fact];
    if (a === undefined) return 'unknown';
    const b = p.operand;
    if (p.op === 'in') {
        if (!Array.isArray(b)) return 'unknown';
        return b.some((x) => x === a) ? 'true' : 'false';
    }
    if (Array.isArray(b)) return 'unknown';
    if (p.op === 'eq') return a === b ? 'true' : 'false';
    if (p.op === 'ne') return a !== b ? 'true' : 'false';
    // Ordered comparisons are NUMERIC ONLY. Comparing a string to a number is not a false
    // condition, it is a mis-authored rule — and reporting it as `unknown` surfaces the authoring
    // bug instead of quietly taking the ELSE branch.
    if (typeof a !== 'number' || typeof b !== 'number') return 'unknown';
    switch (p.op) {
        case 'lt':
            return a < b ? 'true' : 'false';
        case 'lte':
            return a <= b ? 'true' : 'false';
        case 'gt':
            return a > b ? 'true' : 'false';
        case 'gte':
            return a >= b ? 'true' : 'false';
    }
}

/** Conjunction under three-valued logic: any FALSE ⇒ false; else any UNKNOWN ⇒ unknown; else true. */
function evalCase(
    when: readonly ConstraintPredicate[],
    facts: Readonly<Record<string, ConstraintFact>>,
): { readonly verdict: Trivalent; readonly missing: readonly string[]; readonly unevaluable: boolean } {
    const missing: string[] = [];
    let sawUnknown = false;
    let unevaluable = false;
    for (const p of when) {
        const v = evalPredicate(p, facts);
        if (v === 'false') return { verdict: 'false', missing: [], unevaluable: false };
        if (v === 'unknown') {
            sawUnknown = true;
            // UNKNOWN has two causes with two different remedies: the fact is absent (get the
            // data), or the fact is present and the comparison is nonsense (fix the pack).
            if (Object.prototype.hasOwnProperty.call(facts, p.fact)) unevaluable = true;
            else missing.push(p.fact);
        }
    }
    return { verdict: sawUnknown ? 'unknown' : 'true', missing, unevaluable };
}

/**
 * Resolve a constraint against the site facts we hold. **Pure, total, deterministic.**
 *
 * CASE ORDER IS NORMATIVE — first non-false match wins, mirroring how an ordinance's own
 * enumeration reads. Re-ordering an authored pack's cases changes the legal answer, so it is a
 * pack edit, never an optimisation.
 *
 * ⚠ THE INVARIANT: this function NEVER invents a value. There is no default, no zero, no
 * "unbounded", and no first-branch fallback when the facts are missing. Every path that cannot
 * produce a number returns a NAMED reason instead — which is the entire difference between this
 * and the `number | null` field it replaces.
 */
export function resolveConstraint(
    v: ConstraintValue,
    facts: Readonly<Record<string, ConstraintFact>> = {},
): ConstraintResolution {
    switch (v.form) {
        case 'scalar':
            return { kind: 'scalar', value: v.value, unit: v.unit };

        case 'geometric':
        case 'linear':
        case 'document-derived':
            return { kind: 'non-scalar', form: v.form };

        case 'formula': {
            if (v.affine === null) {
                const missing = v.inputs.filter(
                    (i) => !Object.prototype.hasOwnProperty.call(facts, i),
                );
                // A formula with every input in hand but no reduction is CARRIED, not lost — and
                // saying so is different from saying we lack data.
                return {
                    kind: 'indeterminate',
                    reason: missing.length > 0 ? 'missing-facts' : 'formula-not-reducible',
                    missing: [...missing].sort(),
                };
            }
            const needed = constraintInputs(v);
            const missing = needed.filter((i) => !Object.prototype.hasOwnProperty.call(facts, i));
            if (missing.length > 0) {
                return { kind: 'indeterminate', reason: 'missing-facts', missing };
            }
            const x = facts[v.affine.input];
            if (typeof x !== 'number') {
                return { kind: 'indeterminate', reason: 'formula-not-reducible', missing: [] };
            }
            return {
                kind: 'scalar',
                value: v.affine.coefficient * x + v.affine.constant,
                unit: v.unit,
            };
        }

        case 'conditional': {
            const live: ConstraintValue[] = [];
            const missing = new Set<string>();
            let unevaluable = false;
            for (const c of v.cases) {
                const r = evalCase(c.when, facts);
                if (r.verdict === 'false') continue;
                if (r.verdict === 'true' && live.length === 0) {
                    // First definite match, with no undetermined case ahead of it: it binds.
                    return resolveConstraint(c.then, facts);
                }
                for (const f of r.missing) missing.add(f);
                if (r.unevaluable) unevaluable = true;
                live.push(c.then);
            }
            // ⚠ A MIS-AUTHORED PACK IS REPORTED AS MIS-AUTHORED, ahead of any bounded set. The
            // branch list of a pack whose predicates do not type-check is not trustworthy either,
            // so presenting one as an honest "alternative" would dress an authoring bug as law.
            if (unevaluable) {
                return { kind: 'indeterminate', reason: 'predicate-not-evaluable', missing: [] };
            }
            if (live.length === 0) {
                return v.otherwise !== null
                    ? resolveConstraint(v.otherwise, facts)
                    : // ⚠ Fell off the end of an enumeration. Our reading is incomplete; the law is
                      // not silent. Never a zero, never an unbounded (L-616).
                      { kind: 'indeterminate', reason: 'no-matching-case', missing: [] };
            }
            const branches = v.otherwise !== null ? [...live, v.otherwise] : live;
            // ⚠ ONE live branch and no stated ELSE is NOT an alternative. The two readings are
            // "this value" and "the instrument says nothing" — the second cannot be printed beside
            // the first as a legal option, so this is our gap, named by the facts it is waiting on.
            // (`RuleState`'s `alternative` arm requires ≥2 alternatives for exactly this reason.)
            if (branches.length < 2) {
                return { kind: 'indeterminate', reason: 'missing-facts', missing: [...missing].sort() };
            }
            return { kind: 'branch-undetermined', branches, missing: [...missing].sort() };
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE JOIN — one direction, stated once, so no lane re-derives it
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Which `RuleState` STATUS a resolution yields. The two halves of the shared vocabulary meet here
 * and nowhere else — a consumer that re-derives this mapping inline is how three spellings appear.
 *
 *   - `scalar`                 → `resolved`     — a parameter arrived.
 *   - `branch-undetermined`    → `alternative`  — ⭐ named legal readings, no unique one. NOT unknown.
 *   - `non-scalar` (document)  → `qualitative`  — the rule is real and legally non-numeric.
 *   - `non-scalar` (geo/lin)   → `resolved`     — drawn geometry IS the authoritative answer; the
 *                                                 engine consumes it (STR §9 P1). Reporting a
 *                                                 `bouwvlak` as "unresolved" because it is not a
 *                                                 metre would discard the strongest source we have.
 *   - `indeterminate`          → `unrecovered`  — OURS. The `failure` label is the caller's to set
 *                                                 from `reason` (`missing-facts` is usually
 *                                                 `semantic` or a derivation we owe; only the
 *                                                 caller knows which rung the trace stopped on).
 *
 * ⚠ THIS RETURNS ONLY THE DISCRIMINATOR, never a whole `RuleState`. A `RuleState` requires a
 * citation (`ref`), and this function has no source in scope — manufacturing one would produce an
 * uncited claim about the law, which the `RuleState` header forbids on every arm including refusals.
 */
export function ruleStatusForResolution(
    r: ConstraintResolution,
): 'resolved' | 'alternative' | 'qualitative' | 'unrecovered' {
    switch (r.kind) {
        case 'scalar':
            return 'resolved';
        case 'branch-undetermined':
            return 'alternative';
        case 'non-scalar':
            return r.form === 'document-derived' ? 'qualitative' : 'resolved';
        case 'indeterminate':
            return 'unrecovered';
    }
}
