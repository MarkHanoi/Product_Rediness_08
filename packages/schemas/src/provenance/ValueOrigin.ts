// C75 §1 / §2 — the five-value provenance vocabulary, and the UNKNOWN-with-reason
// record that is NOT one of the five.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// C75 §0 Finding 2, measured 2026-08-12: `originDetail`, `derivationStatus` and
// `detectionMethod` all read **0 hits** in `packages/schemas`. Every `origin:` in
// `src/elements/*` is a geometric `Vec3` — a point, not a provenance. The only
// element-level provenance in the system (`RoomDetectionMethod`) lives in
// `packages/room-topology`, outside L0 entirely, which is C75 §4.d: invisible to
// the exporters, the renderer and the AI host. C75 §2.4 requires the fix land
// HERE, in the layer every consumer already reads.
//
// C75 §7.3 asks for a five-value type "built from the §0 Finding 3 idioms rather
// than a new invention". The three borrowed idioms are named at their use sites
// below:
//   • DataConfidence.ts (ADR-0280)  — UNKNOWN carries a typed REASON, so "we do
//                                     not know" is a value with a cause.
//   • LandBasis.ts (C63 §3.2)       — a member that must never be silently read
//                                     as a concrete one is excluded BY TYPE
//                                     (`KnownLandBasis`), not by convention.
//   • BuildableEnvelope (C58/C64)   — a refusal names WHICH thing was unknown.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE DOES **NOT** DO — stated so absence is never inferred
// ─────────────────────────────────────────────────────────────────────────────
//  • It does not score confidence. C62 / `DomainConfidence` owns *how sure*;
//    C75 owns *where it came from*, and C75 §1.3 forbids one field encoding both.
//    Nothing here wraps, widens or duplicates a C62 type.
//  • It does not classify persistence. ADR-0319 (AUTHORITATIVE /
//    DERIVED-BUT-CAUSAL / DERIVED-INCIDENTAL) is a sibling axis; C75 §2.9
//    forbids restating it here.
//  • It does not attach itself to any element kind. Retrofitting the element
//    schemas is `check-provenance-coverage`'s ratchet (C75 §3), and that gate is
//    UNBUILT — no coverage may be inferred from this file existing.
//  • It defines no export mapping. C75 §5 records that as UNPROVEN and the
//    largest open risk: provenance that stops at the export boundary protects
//    nothing downstream.
//
// LAYERING — L0-pure (P5): Zod + plain TS only. Zero I/O, zero THREE, zero DOM,
// and no OpenTelemetry span (a span is I/O and would break purity — the same
// reasoning recorded at the head of `site/metadata/DataConfidence.ts`).
//
// Strategic context — docs/02-decisions/contracts/C75-PROVENANCE.md,
// docs/02-decisions/adrs/ADR-0324-ai-same-loop.md.

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// §1.1 — THE FIVE. Verbatim from C75 §1.1.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **C75 §1.1 — MUST.** Every provenance-bearing value carries exactly one of
 * these five. They are **not** a quality ranking; they are five different
 * statements about *who or what produced the value*.
 *
 *  - `authored`    — a human stated it. A user drew the polygon, typed the
 *                    height, chose the type. ⛔ **The only value the system may
 *                    never invent** (C75 §1.1, §2.2).
 *  - `observed`    — read from an external source of record, unmodified. An IFC
 *                    import, a cadastral parcel, a DXF layer. The system did not
 *                    compute it; it received it.
 *  - `computed`    — derived deterministically from inputs the system holds, by a
 *                    rule that would produce the same output again. Topology
 *                    detection, a slab from a boundary, a quantity takeoff.
 *  - `inferred`    — produced by a non-deterministic or judgement-bearing
 *                    process: AI generation, heuristic repair, a defaulted
 *                    assumption. **Plausible, not entailed.**
 *  - `regenerated` — previously one of the above, then re-derived by a later pass
 *                    that may have overwritten an earlier value. **Carries what
 *                    it replaced** (C75 §2.7; see {@link ValueProvenanceSchema}'s
 *                    `replaced`).
 *
 * ⛔ **C75 §1.2 — MUST NOT.** These may not be collapsed, aliased, or extended
 * per package. In particular **`computed` and `inferred` are never merged**: the
 * distinction between *entailed by the inputs* and *plausibly guessed from them*
 * is the entire subject of C75, and C75 §0 Finding 4 is exactly that merge
 * happening in code (`RoomDetectionEngine.ts:454` repairs a ring, then stamps the
 * result with the same origin as a genuinely traced one).
 *
 * ⚠ **There is no `unknown` member, and its absence is the design.** C75 §1.4
 * makes UNKNOWN a *value with a reason*, not a sixth origin — because a sixth
 * member would immediately become the thing a `??` defaults to, which is the
 * §2.1 defect wearing a different label. Unknown origin is
 * {@link ValueProvenanceSchema} with `origin: null` and a
 * {@link ProvenanceUnknownReason}; the type system routes you there because
 * `null` is not a `ValueOrigin`.
 */
export const ValueOriginSchema = z.enum([
    'authored',
    'observed',
    'computed',
    'inferred',
    'regenerated',
]);
export type ValueOrigin = z.infer<typeof ValueOriginSchema>;

/**
 * The five in the order C75 §1.1 states them. Exported for exhaustive iteration
 * (a gate enumerating the vocabulary, a UI listing the legend).
 *
 * ⚠ **This is a declaration ORDER, not a strength ORDER, and no code may treat
 * the index as a rank.** C75 §1.1 says the five are "not a quality ranking" in
 * its first sentence. `LAND_BASIS_BREADTH` deliberately carries a rank because
 * breadth of land genuinely is monotone; origin is not — an `observed` cadastral
 * figure and an `authored` user override are different claims, not stronger and
 * weaker ones, and C75 §2.6 constrains only what a consumer may *say*, never an
 * ordering it may compute.
 */
export const VALUE_ORIGINS: readonly ValueOrigin[] = Object.freeze(
    ValueOriginSchema.options,
);

/**
 * The origins a system pass may legitimately WRITE about work it just did.
 *
 * ⭐ The `KnownLandBasis` idiom (C63 §3.2), pointed at C75 §2.2 rather than at a
 * denominator: `authored` is excluded **by type**, so a generation, repair,
 * import or migration path that takes this type cannot stamp a human's authorship
 * onto machine output — the error is unrepresentable at that call site rather
 * than detected by a gate afterwards (C75 §2.8's preference order:
 * *unrepresentable > runtime check > gate > convention*).
 *
 * A path that genuinely records a human decision takes {@link ValueOrigin} and
 * writes `'authored'` deliberately, which is the point: it must be a decision,
 * never a fallthrough.
 */
export type SystemWritableOrigin = Exclude<ValueOrigin, 'authored'>;

/**
 * **C75 §2.2 — MUST.** Where a value must be supplied for the model to be usable,
 * the supplied value is **`inferred`**, never `authored` and never `computed`.
 * Named as a constant so a defaulting site can cite the rule at the literal
 * instead of re-deciding it: a default is plausible, not entailed.
 */
export const DEFAULTED_VALUE_ORIGIN: SystemWritableOrigin = 'inferred';

// ─────────────────────────────────────────────────────────────────────────────
// §1.4 — UNKNOWN IS A VALUE, NOT A BLANK.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WHY a value's origin is not known. The ADR-0280 / `UnknownReason` idiom
 * (`site/metadata/DataConfidence.ts`) applied to provenance: a missing origin is
 * never a bare blank, it is `null` **plus one of these**, so a consumer can tell
 * an un-recorded origin from an un-recordable one.
 *
 * ⚠ A **separate closed set** from C62's `UnknownReason` rather than a reuse of
 * it, and deliberately so. C62's members answer *why is the VALUE missing*
 * (`authority-does-not-publish`, `outside-coverage`, `license-restriction`) —
 * facts about a data source. These answer *why is the ORIGIN missing*, which is
 * mostly a fact about **our own history**: a snapshot written before the field
 * existed, a producer that never had a place to say it. Folding them together
 * would force one list to answer two questions and would put C75 in the business
 * of editing a vocabulary C62 owns (C75 §1.3, C69 §3.2 — a second copy becomes a
 * rival list).
 *
 *  - `not-recorded`        — the producer had a place to state the origin and did
 *                            not. A gap in a live path.
 *  - `predates-provenance` — the record was written before this field existed.
 *                            **The migration reason** (C75 §2.5): an old snapshot
 *                            is not evidence about origin in either direction.
 *                            `roomSnapshotUtils.ts:156` is exactly this case and
 *                            currently answers `'auto-topology'` instead.
 *  - `producer-not-instrumented`
 *                          — the producing path exists but does not yet write
 *                            provenance at all. ⚠ Distinct from `not-recorded`
 *                            for the reason `basis-not-declared` is distinct from
 *                            `basis-unknown` in `LandBasis.ts`: one is a value
 *                            missing from an instrumented path, the other is a
 *                            path with no instrumentation. They close differently
 *                            — one is a bug, the other is unbuilt work.
 *  - `source-did-not-state`— an external source of record supplied the value and
 *                            said nothing about where IT got it. A fact about the
 *                            source, not about us; no engineering closes it.
 *  - `lost-in-transform`   — an import, merge, round-trip or format conversion
 *                            dropped a provenance the system once held. Named so
 *                            a LOSS is never filed as an absence: the two have
 *                            different fixes.
 *  - `conflicting-records` — two sources claimed different origins and no rule
 *                            ranks them. ⚠ A **positive finding**, not a missing
 *                            input — the `basis-mismatch` distinction. Collapsing
 *                            it into `not-recorded` throws away the one fact we
 *                            actually established.
 */
export const ProvenanceUnknownReasonSchema = z.enum([
    'not-recorded',
    'predates-provenance',
    'producer-not-instrumented',
    'source-did-not-state',
    'lost-in-transform',
    'conflicting-records',
]);
export type ProvenanceUnknownReason = z.infer<typeof ProvenanceUnknownReasonSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// THE RECORD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The provenance of one value: **either** one of the five with the detail that
 * justifies it, **or** an explicit unknown carrying its reason.
 *
 * ⭐ `origin` is `.nullable()` and NOT `.optional()`, and that is the whole
 * mechanism. An optional field lets a consumer write `rec.origin ?? 'observed'`
 * and be back at C75 §4.a in one keystroke; a nullable one makes `null` a value
 * the type forces you to handle, and the cross-field refinement below makes an
 * unreasoned `null` unparseable. Use {@link unknownProvenance} to build one.
 *
 * ⛔ **C75 §2.5 — the DEFAULT of this schema is UNKNOWN, never a member of the
 * five.** `.default(...)` on any provenance field must point at
 * {@link unknownProvenance}, so the migration path that adds provenance to an
 * existing schema does not itself become a second site that invents it. §2.5 and
 * §2.1 are the same rule.
 *
 * Fields:
 *  - `origin`        — one of the five, or `null` for "not known".
 *  - `unknownReason` — REQUIRED when `origin` is `null`, FORBIDDEN otherwise
 *                      (refined below). C75 §1.4: unknown is a value with a cause.
 *  - `detail`        — free text naming the actual producer: the command, the
 *                      rule-pack article, the model id, the importing format.
 *                      This is what C75 §0 Finding 2 measured as `originDetail`
 *                      and found 0 of. **Required on `inferred`** — see the
 *                      refinement; an inference without a stated reason is C75
 *                      §4.c, the console-only substitution, wearing a field.
 *  - `replaced`      — **C75 §2.7.** What a `regenerated` pass overwrote:
 *                      required there, forbidden elsewhere. One level deep, not
 *                      recursive — the full chain is `ProvenanceEdge`'s job (C23),
 *                      and a second lineage graph here would be a rival to it.
 *  - `recordedAt`    — when the provenance was RECORDED (not when the value was
 *                      produced). Optional; ADR-0319 owns the audit timestamps
 *                      and this does not restate them.
 */
export const ValueProvenanceSchema = z.object({
    origin: ValueOriginSchema.nullable(),
    unknownReason: ProvenanceUnknownReasonSchema.optional(),
    detail: z.string().min(1).optional(),
    replaced: z
        .object({
            origin: ValueOriginSchema.nullable(),
            detail: z.string().min(1).optional(),
        })
        .optional(),
    recordedAt: z.string().datetime({ offset: true }).optional(),
})
    .superRefine((p, ctx) => {
        // §1.4 — an unknown origin without a reason is a blank, which is the
        // thing the contract forbids.
        if (p.origin === null && p.unknownReason === undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['unknownReason'],
                message:
                    'C75 §1.4 — an unknown origin MUST carry a reason. A blank is not a value: ' +
                    'use unknownProvenance(reason) rather than leaving the cause out.',
            });
        }
        // …and a stated origin with an unknown-reason is two answers to one
        // question. Reject rather than pick, per the `conflicting-records` logic.
        if (p.origin !== null && p.unknownReason !== undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['unknownReason'],
                message:
                    `C75 §1.4 — origin '${p.origin}' is stated AND an unknownReason is set. ` +
                    'These are contradictory claims; record one.',
            });
        }
        // §2.2/§2.3 — an inference must say what it inferred FROM. Without this,
        // 'inferred' degrades into the same opaque stamp 'auto-topology' was.
        if (p.origin === 'inferred' && p.detail === undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['detail'],
                message:
                    "C75 §2.3 — origin 'inferred' MUST state its reason in `detail`. " +
                    'A repair, default or guess that does not say what it did is recorded ' +
                    'only to the console, and the console is not the model.',
            });
        }
        // §2.7 — regeneration carries what it replaced. This is the most
        // expensive defect in the contract and the hardest to detect after the
        // fact: a user's decision overwritten with no trace.
        if (p.origin === 'regenerated' && p.replaced === undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['replaced'],
                message:
                    "C75 §2.7 — origin 'regenerated' MUST carry what it replaced. " +
                    'A regeneration that leaves no trace of the prior value is indistinguishable ' +
                    'from one that never overwrote anything.',
            });
        }
        if (p.origin !== 'regenerated' && p.replaced !== undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['replaced'],
                message:
                    `C75 §2.7 — \`replaced\` is set but origin is '${String(p.origin)}', not 'regenerated'. ` +
                    'A value that overwrote another IS regenerated; say so.',
            });
        }
    });
export type ValueProvenance = z.infer<typeof ValueProvenanceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTORS — the honest default is a one-liner, so it is the cheap path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **The canonical way to say "we do not know where this came from".** The
 * `unknownEnvelope` idiom (ADR-0280) at provenance: it keeps C75 §1.4 a
 * one-liner at every call site, because a rule that costs more to obey than to
 * break is a rule that gets broken — `roomSnapshotUtils.ts:156` chose
 * `|| 'auto-topology'` over eight lines of honesty.
 *
 * This is what every `??` on the C75 ledger should become.
 */
export function unknownProvenance(reason: ProvenanceUnknownReason): ValueProvenance {
    return { origin: null, unknownReason: reason };
}

/**
 * The **default** for a provenance field added to an existing schema (C75 §2.5):
 * an old record is not evidence about origin in either direction, so it records
 * `predates-provenance` and nothing more.
 *
 * ⚠ Deliberately a FUNCTION, not a frozen constant handed to `.default()`. Zod
 * `.default()` with a shared object reference hands every parse the same mutable
 * instance; a factory cannot be aliased into a shared record by accident.
 */
export function provenancePredatingTheField(): ValueProvenance {
    return unknownProvenance('predates-provenance');
}

/**
 * A provenance field for a schema being retrofitted: **optional, and defaulting
 * to UNKNOWN-with-reason** (C75 §2.5). Existing snapshots parse unchanged and
 * land on `predates-provenance` rather than on a member of the five.
 *
 * Use this rather than `ValueProvenanceSchema.optional()` at retrofit sites — it
 * is the difference between a snapshot that reads "origin not known, because it
 * predates the field" and one that reads nothing at all.
 */
export const RetrofittedProvenanceSchema = ValueProvenanceSchema.default(
    provenancePredatingTheField,
);

/**
 * Record a value the system produced. `authored` is not accepted — the parameter
 * type is {@link SystemWritableOrigin}, so this constructor cannot mint a human
 * decision (C75 §2.2). `detail` is required, not optional: the point of
 * recording an origin is that a reader can find the producer.
 */
export function systemProvenance(
    origin: SystemWritableOrigin,
    detail: string,
): ValueProvenance {
    return { origin, detail };
}

/**
 * Record a human decision. Separate from {@link systemProvenance} and taking no
 * origin parameter, so `'authored'` appears in exactly one constructor and a
 * grep for it finds every site that claims a user acted.
 */
export function authoredProvenance(detail?: string): ValueProvenance {
    return detail === undefined ? { origin: 'authored' } : { origin: 'authored', detail };
}

/**
 * **C75 §2.7.** Record an overwrite, carrying the prior provenance. Takes the
 * previous {@link ValueProvenance} rather than a bare origin string so a
 * `null`-origin prior survives the overwrite as a `null` — a regeneration over a
 * value of unknown origin must not report that it replaced a known one.
 */
export function regeneratedProvenance(
    prior: ValueProvenance,
    detail: string,
): ValueProvenance {
    return {
        origin: 'regenerated',
        detail,
        replaced: prior.detail === undefined
            ? { origin: prior.origin }
            : { origin: prior.origin, detail: prior.detail },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// READING — §2.6, the one rule about consumers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is this value's origin known at all? The narrowing predicate, so a consumer
 * reaches an origin only by having handled the unknown case.
 */
export function hasKnownOrigin(
    p: ValueProvenance,
): p is ValueProvenance & { origin: ValueOrigin } {
    return p.origin !== null;
}

/**
 * **C75 §2.6 — MUST NOT.** May a consumer describe this value as the user's?
 *
 * Only `authored` earns that claim. ⚠ Note what this function does **not** do:
 * it does not rank, tint or gate rendering. C75 §5 leaves display entirely out of
 * scope and §2.6 constrains only *claims*, so rendering an `inferred` wall
 * identically to an `authored` one is permitted — telling the user it is theirs
 * is not.
 */
export function mayBePresentedAsAuthored(p: ValueProvenance): boolean {
    return p.origin === 'authored';
}

/**
 * A short human-readable statement of origin, for a chat answer, tooltip or
 * export note. Never renders an unknown as a blank or as a guess — the C75 §4.i
 * anti-pattern is a blank cell.
 */
export function describeProvenance(p: ValueProvenance): string {
    if (p.origin === null) {
        return `origin not known (${p.unknownReason ?? 'no reason recorded'})`;
    }
    const base = p.detail === undefined ? p.origin : `${p.origin} — ${p.detail}`;
    if (p.origin === 'regenerated' && p.replaced) {
        return `${base}; replaced ${p.replaced.origin ?? 'a value of unknown origin'}`;
    }
    return base;
}
