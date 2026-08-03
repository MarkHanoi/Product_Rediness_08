// THE COMMON ENVELOPE SCHEMA — the shape every jurisdiction's rule adapter must produce.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS, AND WHY IT IS NOT A NEW RULE MODEL
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Madrid has the PARAMETERS and cannot say WHICH OF 179 CORPORA GOVERNS. Those are two different
// problems and they have been fused in every prior Madrid pass, which is why every pass ended in
// the same place. This adapter separates them:
//
//   • the GEOMETRY problem — turn `spacm_*` attributes into a rule the SHIPPED engine can solve;
//   • the ROUTING problem — decide whether we are entitled to apply that rule to this parcel.
//
// ⭐ **THE ROUTING GUARD IS THE POINT OF THIS ADAPTER, NOT A SIDE-CONDITION ON IT.** A selector
// that returns two instruments has not selected. The adapter must be right about when NOT to draw,
// and it is scored on that first.
//
// ⛔ **NO NEW GEOMETRY ENGINE.** `rules.grammar` names a `GeometricRule` KIND that already exists
// in `@pryzm/schemas` — `setback` (§L-591), `alignment`, `block-derived-alignment`,
// `tiered-occupation`, `explicit-area` — and `requiresBlockRing()` already dispatches on the
// zone's own rule. Adding a Madrid-shaped solver would be a second composition root for zoning.
//
// ⚠ THE ENVELOPE FIELD IS DELIBERATELY NOT A SOLID. This adapter never returns geometry. It
// returns the RULE plus the reasons the rule may or may not be applied; solving is the engine's
// job and the separation is what lets the routing guard veto before any geometry is constructed.
//
// PURE — no I/O, no clock, no randomness. Every function is total and never throws.
//
// Governance: C58 §1.3/§1.4/§1.7a/§1.11/§1.14.4 · C63 · ADR-0270 (rule KIND ≠ rule number) ·
// ADR-0283 (UNKNOWN is a valid product state) · ADR-0287 (refuse when uncertainty can change the
// legal outcome) · ADR-0293 (per-dimension tiering; open-top envelopes) · L-449 · L-616 · L-656.

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §MADRID-SPACM-PORT (L-681) — WHERE THIS CAME FROM, AND WHY IT MOVED
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Authored as `tools/madrid-envelope-engine/schema.ts` and PORTED here VERBATIM. Nothing about the
// rules changed in the move — the Boadilla proof parcel `4228504VK2742N` yields a byte-identical
// record before and after, which `tools/madrid-envelope-engine/proveParcel.ts` re-runs on demand.
// The move exists because a rule adapter living under `tools/` is unreachable from the app and
// obeys no layer rule; `@pryzm/site-parcel-data` is L2 and depends only on `@pryzm/schemas` (L0),
// which is exactly the dependency set this file already had.
//
// ⚠ §MADRID-SPACM-P8 — WHICH EXPORTS CARRY AN OTel SPAN, AND WHICH DELIBERATELY DO NOT.
// P8 ("every new exported function adds ≥1 span") is honoured on every function that makes a
// DECISION. The four `Parameter` CONSTRUCTORS below (`unknown` / `published` / `contradicted` /
// `wrongKind`) and the `isKnown` predicate carry none, and that is a measured choice rather than
// an omission: they are algebraic constructors invoked 9–12 times per ordinance row inside the
// already-spanned `adaptSpacmRow`, so instrumenting them would emit ~200 k spans over the 19,833-row
// capital layer while telling a reader nothing the parent span does not already carry. The same
// judgement `registry.ts` makes — it spans the resolution functions, not the data.

import { trace } from '@opentelemetry/api';
import type { GeometricRule } from '@pryzm/schemas';

const _tracer = trace.getTracer('pryzm.zoning');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE VALUE WRAPPER — why every number is boxed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * How a single parameter arrived, per dimension (ADR-0293 tiers each dimension separately —
 * a record may have a `published` height and an `unknown` depth, and averaging those into one
 * confidence badge is what makes a coverage gap look like a determination).
 */
export type ValueProvenance =
    /** Read directly from a field the competent authority publishes. The only tier that can ship. */
    | 'published-attribute'
    /** Derived by PRYZM from published attributes, by an arithmetic that is stated. */
    | 'derived'
    /** ⛔ The field was absent, null, or a sentinel. NEVER a number. */
    | 'unknown'
    /** ⛔ Two published fields disagree. Neither may be used. See `Contradiction`. */
    | 'contradicted'
    /** ⛔ The field carried a value that is not of this parameter's KIND (ADR-0270). */
    | 'wrong-kind';

/**
 * A parameter, with its provenance welded on.
 *
 * ⚠⚠ **`value: null` AND `provenance: 'unknown'` IS THE ONLY WAY TO SAY "MISSING", AND THERE IS NO
 * WAY TO SAY IT WITH A ZERO.** This is the single most expensive lesson in the dossier: València
 * publishes `altura = 0` on a third of its alignment layer, and a parser trusting `^\d+$` would
 * have shipped zero-height envelopes across the city; Madrid's own `NM_RTR_FRNT` carries 7,225
 * literal zeros. A zero setback and an unrecorded setback are the same bytes and opposite facts.
 * The type makes the honest state cheap and the dishonest state unrepresentable.
 */
export interface Parameter<T = number> {
    readonly value: T | null;
    readonly provenance: ValueProvenance;
    /** The publisher's field this came from — `NM_ALTURA`, `UUBV_NM_ED`. Null when derived. */
    readonly sourceField: string | null;
    /** Why it is `unknown` / `contradicted` / `wrong-kind`. Null only when a value is present. */
    readonly note: string | null;
}

/** The honest absence. Use this instead of `0`, instead of a default, instead of a guess. */
export function unknown<T = number>(sourceField: string | null, note: string): Parameter<T> {
    return { value: null, provenance: 'unknown', sourceField, note };
}

/** A value read straight off a published field. */
export function published<T = number>(value: T, sourceField: string): Parameter<T> {
    return { value, provenance: 'published-attribute', sourceField, note: null };
}

/**
 * Two published fields disagree.
 *
 * ⛔ **DO NOT AVERAGE. DO NOT SILENTLY PREFER ONE.** Madrid carries 1,224 rows where `NM_ALTURA`
 * and `NM_N_PLTA` imply an impossible storey height — worst, MAJADAHONDA *"VIVIENDA UNIFAMILIAR
 * AISLADA"*, `NM_ALTURA=85` with `NM_PLANTAS=2` = **42.5 m per storey**. Preferring `NM_ALTURA`
 * publishes an 85 m detached house; preferring `NM_N_PLTA` publishes a number the ordinance's own
 * other column contradicts. Both are determinations we are not entitled to make (ADR-0287: no
 * conservative branch exists when the error is two-sided).
 */
export function contradicted<T = number>(sourceField: string, note: string): Parameter<T> {
    return { value: null, provenance: 'contradicted', sourceField, note };
}

/** The field held a value of the wrong KIND — a code where a quantity was expected (ADR-0270). */
export function wrongKind<T = number>(sourceField: string, note: string): Parameter<T> {
    return { value: null, provenance: 'wrong-kind', sourceField, note };
}

/** Is this parameter usable in a determination? Only one provenance qualifies as a value. */
export function isKnown<T>(p: Parameter<T>): boolean {
    return p.value !== null && (p.provenance === 'published-attribute' || p.provenance === 'derived');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE GRAMMAR — which geometric OPERATION this zone is regulated by
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The envelope grammar. **A grammar is a KIND, not a number** (ADR-0270): erode-from-every-edge
 * and project-a-band-from-one-edge are different operations, and coercing one into the other
 * loses the constraint entirely rather than approximating it.
 *
 * ⛔ **NEVER FORCE A GRAMMAR.** `unknown` is a first-class member and it is the correct answer
 * whenever the published parameters do not determine one. A forced grammar is not a rough
 * envelope — it is a confident envelope of the wrong shape, on exactly the parcels where the
 * shape matters most.
 */
export type EnvelopeGrammar =
    /** `NM_RTR_*` + a height. Detached/suburban fabric. Solves as `kind: 'setback'` (§L-591). */
    | 'setback'
    /** `NM_FDO_MX_ED` + a height. Façade on the street line, buildable DEPTH from it. */
    | 'alignment'
    /** `NM_OCP_MX` + a height, with no setbacks and no depth. A coverage cap, not a shape. */
    | 'occupation'
    /** Industrial fabric — recorded distinctly because its parameter set is systematically thinner. */
    | 'industrial'
    /** ⛔ The published parameters determine no grammar. The honest answer, and a common one. */
    | 'unknown';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE REFUSAL — and why it is a first-class result rather than an error
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Why the adapter declined. **Every member names a DIFFERENT fact about the world**, and
 * collapsing any two of them turns a coverage gap into a legal claim or vice versa
 * (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
 */
export type RefusalReason =
    // ── ROUTING (the adapter's raison d'être) ────────────────────────────────────────────────
    /** ⛔ The parcel sits inside a development ámbito — a per-site instrument PRYZM does not hold. */
    | 'development-ambito-governs'
    /** ⛔ `DS_FIG_DES` is null: the instrument's CLASS is unpublished, so its regime is unknowable. */
    | 'instrument-class-unpublished'
    /** ⛔ The `(municipality, name)` key resolves to MORE THAN ONE instrument. Two ≠ a selection. */
    | 'instrument-key-ambiguous'
    /** ⛔ The routing token is not in any recognised vocabulary. UNKNOWN — never the base plan. */
    | 'routing-token-unrecognised'
    // ── LAND CLASS ───────────────────────────────────────────────────────────────────────────
    /** The ordinance itself grants no private envelope here (viario, zonas verdes, equipamiento). */
    | 'public-system'
    /** Not urban land: the general plan grants no urban buildability on this classification. */
    | 'not-urban-land'
    // ── PARAMETERS ───────────────────────────────────────────────────────────────────────────
    /** ⛔ Published fields contradict each other. See `contradictions[]` for which. */
    | 'parameters-contradict'
    /** No published parameter set determines a grammar — the zone states nothing solvable. */
    | 'no-grammar-determined'
    /** A grammar was determined and a parameter it REQUIRES is unknown. */
    | 'required-parameter-unknown'
    // ── PROVENANCE ───────────────────────────────────────────────────────────────────────────
    /** ⛔ The number exists but is derived from EXISTING BUILDINGS, not from the plan (ADR-0270). */
    | 'value-is-existing-derived'
    /** ⛔ The number is the publisher's own ESTIMATE. It carries no article, so it cannot be cited. */
    | 'value-is-publisher-estimate'
    /** ⛔ The number's unit token is undocumented. An unknown unit is an unknown quantity. */
    | 'value-unit-undocumented'
    // ── GATE ─────────────────────────────────────────────────────────────────────────────────
    /** ⛔ `MADRID_ENVELOPE_VERIFIED` is false. The L-449 human legal gate is unsigned. */
    | 'verification-gate-closed';

/** A single refusal, carrying enough to render a card a user can act on. */
export interface Refusal {
    readonly reason: RefusalReason;
    /** Is this a statement about the LAW (`true`) or about PRYZM's coverage (`false`)? */
    readonly legallyGrounded: boolean;
    /** One line, in the user's terms. Never a stack trace, never a field name alone. */
    readonly headline: string;
    /** The governing citation where one exists, `null` where the refusal is about our data. */
    readonly ordinanceRef: string | null;
    /**
     * ⚠ Would a RETRY plausibly change this? Only a transient input failure earns `true`. A
     * routing ambiguity never clears on a second attempt, and offering the affordance sends the
     * user round a loop for ever (the L-574 / §L-590c reasoning).
     */
    readonly retryable: boolean;
}

/** Two published fields that cannot both be true. Recorded, never resolved by the adapter. */
export interface Contradiction {
    readonly fields: readonly string[];
    readonly detail: string;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE RECORD
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Where a rule came from, at document granularity. Every envelope must cite source + doc + field. */
export interface Provenance {
    /** The service or endpoint. `idem.comunidad.madrid` (regional) vs `sigma.madrid.es` (municipal). */
    readonly source: string;
    /** The layer / typeName the row was read from. */
    readonly dataset: string;
    /** The publisher's own primary key for the row, so a claim is traceable to one record. */
    readonly recordId: string | number | null;
    /** The governing DOCUMENT — `DS_DOCU` + `DS_PLANEAM_GRAL`, e.g. "PLAN GENERAL / MATRIZ". */
    readonly document: string | null;
    /** The statute lineage — `DS_LEY`, e.g. "CM Ley 9/2001, E Ley 6/1998". */
    readonly statute: string | null;
    /** The BOCM publication date, where published. */
    readonly published: string | null;
    /** ⚠ Every field this record actually read. A citation that cannot name its fields is a claim. */
    readonly fields: readonly string[];
}

/** The parametric rule set, each dimension independently tiered (ADR-0293). */
export interface EnvelopeRules {
    readonly height_m: Parameter;
    readonly storeys: Parameter;
    readonly occupationPct: Parameter;
    readonly depth_m: Parameter;
    readonly setbackFront_m: Parameter;
    readonly setbackSide_m: Parameter;
    readonly setbackRear_m: Parameter;
    readonly plotRatioFAR: Parameter;
    readonly minFrontage_m: Parameter;
}

/**
 * ONE PARCEL'S ANSWER — a rule, or a reason there is none. Never both empty.
 *
 * ⚠ `refusals` is an ARRAY and it is not short-circuited: a parcel can be inside a development
 * ámbito AND have contradictory parameters, and a user who fixes one wants to know about the
 * other. Reporting the first reason found makes the second invisible.
 */
export interface CommonEnvelopeRecord {
    readonly parcel: {
        readonly id: string | null;
        /** ⚠ Null until a Catastro join runs. The regional corpus contains NO PARCELS. */
        readonly cadastralRef: string | null;
        readonly area_m2: number | null;
    };
    readonly municipality: {
        /** ⚠ THE 3-DIGIT KEY. `CD_MUNICIPIO` is INE-5 with `28` STRIPPED — `'079'`, not `'28079'`. */
        readonly code: string;
        readonly name: string;
        /** The INE-5 code, composed rather than stored, for joins outside this corpus. */
        readonly ine5: string;
    };
    readonly planningInstrument: {
        readonly name: string | null;
        /** `DS_DOCU` — PLAN GENERAL / NORMAS SUBSIDIARIAS / … */
        readonly documentType: string | null;
        /** `DS_FIG_DES` — Plan Parcial / Estudio Detalle / … ⚠ null on 52.8 % of AMBITO rows. */
        readonly figure: string | null;
        /** Is this the BASE general plan, or a development instrument overriding it? */
        readonly isDerived: boolean;
    };
    readonly zoningCode: {
        readonly code: string | null;
        readonly label: string | null;
        readonly soilClass: string | null;
    };
    readonly rules: EnvelopeRules;
    readonly grammar: EnvelopeGrammar;
    readonly provenance: Provenance;
    /**
     * ⚠⚠ **CONSTRAINTS THAT ARE KNOWN TO EXIST AND ARE NOT HELD.** Every Madrid envelope is an
     * OPEN TOP with a stated reason (ADR-0293): the AESA Barajas aeronautical obstacle surfaces,
     * heritage catalogues and flood zones all constrain DOWNWARD, and a solid that ignores a
     * downward constraint OVER-states — L-616's ratified rule that a SOLID must intersect ALL
     * derived constraints.
     */
    readonly missingConstraints: readonly string[];
    readonly contradictions: readonly Contradiction[];
    readonly refusals: readonly Refusal[];
    /**
     * The rule handed to the SHIPPED solver, or `null` when we refuse.
     *
     * ⭐ Typed as `@pryzm/schemas`' own `GeometricRule` on purpose: if this adapter ever emits a
     * shape the shipped engine cannot solve, it is a COMPILE error here rather than a runtime
     * `undefined` on a compliance number.
     */
    readonly envelope: GeometricRule | null;
}

/**
 * May this record produce a drawn envelope? One predicate, derived — never a stored flag.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.madridSpacm.isDrawable`.
 */
export function isDrawable(r: CommonEnvelopeRecord): boolean {
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.isDrawable');
    try {
        const drawable = r.refusals.length === 0 && r.envelope !== null && r.grammar !== 'unknown';
        span.setAttribute('grammar', r.grammar);
        span.setAttribute('refusalCount', r.refusals.length);
        span.setAttribute('drawable', drawable);
        return drawable;
    } finally {
        span.end();
    }
}
