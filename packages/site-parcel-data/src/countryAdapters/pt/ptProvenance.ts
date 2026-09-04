// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-PROVENANCE (lane ENVELOPE-IBERIA, 2026-09-04) — doctrine §0.1, THE PER-VALUE PROVENANCE
// BLOCK: "every emitted value carries value + unit · instrument + version + date in force ·
// article · derivation_method · inputs · retrieved_at · confidence · refusal_reason".
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ EXTENDS THE RATIFIED VOCABULARY; MINTS NO RIVAL. C58 §1.6 already has `FieldProvenance`
// (WHERE a number came from: published-structured / ordinance-pdf / pipeline-extracted /
// estimated) and C58 §1.2 has `EnvelopeConfidence` (the tier of the DETERMINATION). The doctrine
// adds two axes those do not carry:
//   • `derivation_method` — HOW the value was obtained from its source (direct / table-lookup /
//     computed / interpolated / inferred). Orthogonal to the source kind: a human-transcribed
//     `ordinance-pdf` value can be `direct` (Art. 32.º says "índice = 1") or `inferred` (C1 read
//     off typology language — doctrine step 8 says C1 is ALWAYS inferred).
//   • a per-VALUE three-state `confidence` (resolved / assumed / unresolved) whose `unresolved`
//     member BLOCKS the envelope (doctrine §0.2). `EnvelopeConfidence` labels the whole
//     determination; this labels one parameter, and one `unresolved` parameter is enough to refuse.
// Each block therefore CARRIES a `fieldProvenance: FieldProvenance` — the ratified seat — and adds
// the two axes beside it.
//
// ⛔ WHERE THIS SHOULD LIVE, AND WHY IT DOES NOT YET. The right seat is `packages/schemas/src/site/
// zoning/ProvenanceFlags.ts` as a C58 §1.6 amendment (a `derivationMethod` + `valueConfidence` on
// the per-field record). `packages/schemas/**` is NOT this lane's to edit, so the block is a
// PT-local composition here and the amendment is REPORTED in the doctrine scorecard
// (`docs/04-reference/jurisdictions/pt/PT-DOCTRINE-SCORECARD.md`). When the seat lands, this
// module becomes a re-export — never a second definition.
//
// PURITY: L2-pure. Types + pure helpers. No I/O.

import type { FieldProvenance } from '@pryzm/schemas';

/** Doctrine §0.1 — HOW the value was obtained from its instrument. */
export type PtDerivationMethod = 'direct' | 'table-lookup' | 'computed' | 'interpolated' | 'inferred';

/**
 * Doctrine §0.1 — the per-VALUE confidence. `unresolved` BLOCKS the envelope (§0.2); `assumed`
 * travels onto the output as an assumption (§0.4 — never present a discretionary outcome as an
 * entitlement); `resolved` is the only member a determination may rest on silently.
 */
export type PtValueConfidence = 'resolved' | 'assumed' | 'unresolved';

/** The instrument line every value cites — instrument + version + date in force + ARTICLE. */
export interface PtInstrumentRef {
    readonly instrument: string;
    /** The version / act reference (e.g. `Aviso n.º 12773/2021`), or null where not in hand. */
    readonly version: string | null;
    /** ISO date the cited version entered into force, or null where not in hand. */
    readonly dateInForce: string | null;
    /** ⛔ "A number without an article is not [a valid product]" (§0). Never empty. */
    readonly article: string;
}

/** One emitted value with its full doctrine §0.1 block. `T` is `number` unless stated. */
export interface PtProvenancedValue<T = number> {
    readonly value: T;
    readonly unit: string;
    readonly instrument: PtInstrumentRef;
    readonly derivationMethod: PtDerivationMethod;
    /** The named inputs the value was derived from (parameter keys, layer names, measured facts). */
    readonly inputs: readonly string[];
    /** ISO timestamp the source was read, or null for a purely computed value. */
    readonly retrievedAt: string | null;
    readonly confidence: PtValueConfidence;
    /** Mandatory when `confidence === 'unresolved'`; null otherwise. */
    readonly refusalReason: string | null;
    /** The RATIFIED C58 §1.6 seat this block composes with (never replaces). */
    readonly fieldProvenance: FieldProvenance;
    /** Doctrine §0.4 — the stated basis of any `assumed` reading. Empty for `resolved`. */
    readonly assumptions: readonly string[];
}

/** Build a RESOLVED value. Refuses (throws) an empty article — a value without its article is a bug. */
export function ptResolved<T>(
    value: T,
    unit: string,
    instrument: PtInstrumentRef,
    derivationMethod: PtDerivationMethod,
    inputs: readonly string[],
    fieldProvenance: FieldProvenance,
    retrievedAt: string | null = null,
): PtProvenancedValue<T> {
    assertArticle(instrument);
    return {
        value, unit, instrument, derivationMethod, inputs, retrievedAt,
        confidence: 'resolved', refusalReason: null, fieldProvenance, assumptions: [],
    };
}

/** Build an ASSUMED value — the basis is mandatory and travels with it (§0.4). */
export function ptAssumed<T>(
    value: T,
    unit: string,
    instrument: PtInstrumentRef,
    derivationMethod: PtDerivationMethod,
    inputs: readonly string[],
    fieldProvenance: FieldProvenance,
    assumptions: readonly string[],
    retrievedAt: string | null = null,
): PtProvenancedValue<T> {
    assertArticle(instrument);
    if (assumptions.length === 0) {
        throw new Error('ptAssumed: an assumed value must state its basis (doctrine §0.4)');
    }
    return {
        value, unit, instrument, derivationMethod, inputs, retrievedAt,
        confidence: 'assumed', refusalReason: null, fieldProvenance, assumptions,
    };
}

/** Build an UNRESOLVED value — `value` is null by construction; the reason is mandatory (§0.2). */
export function ptUnresolved(
    unit: string,
    instrument: PtInstrumentRef,
    inputs: readonly string[],
    refusalReason: string,
): PtProvenancedValue<null> {
    assertArticle(instrument);
    if (refusalReason.trim().length === 0) {
        throw new Error('ptUnresolved: refusal_reason is mandatory when confidence is unresolved (doctrine §0.1)');
    }
    return {
        value: null, unit, instrument, derivationMethod: 'direct', inputs, retrievedAt: null,
        confidence: 'unresolved', refusalReason, fieldProvenance: 'estimated', assumptions: [],
    };
}

/**
 * Doctrine §0.2 — "Any parameter at `unresolved` BLOCKS the envelope. Emit the refusal instead."
 * Returns the refusal reasons of every unresolved value (empty ⇒ nothing blocks).
 */
export function ptBlockingReasons(
    values: ReadonlyArray<PtProvenancedValue<unknown>>,
): readonly string[] {
    return values
        .filter((v) => v.confidence === 'unresolved')
        .map((v) => v.refusalReason ?? `${v.instrument.article}: unresolved (no reason recorded)`);
}

/** Every assumption carried by a set of values, de-duplicated, for the output's `assumptions`. */
export function ptCollectAssumptions(
    values: ReadonlyArray<PtProvenancedValue<unknown>>,
): readonly string[] {
    const out: string[] = [];
    for (const v of values) for (const a of v.assumptions) if (!out.includes(a)) out.push(a);
    return out;
}

function assertArticle(ref: PtInstrumentRef): void {
    if (ref.article.trim().length === 0 || ref.instrument.trim().length === 0) {
        throw new Error('PtInstrumentRef: instrument and article are mandatory — a number without an article is not a product (doctrine §0)');
    }
}
