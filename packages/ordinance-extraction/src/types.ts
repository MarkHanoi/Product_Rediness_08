// @pryzm/ordinance-extraction — the shared type vocabulary (C58 §2.2 fields +
// C23 provenance). Pure data: Zod + inferred types, no I/O.
//
// Strategic context — docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md §2/§3.

import { z } from 'zod';
import {
    type ExtractionProvenance,
    type FieldProvenance,
    type EnvelopeConfidence,
} from '@pryzm/schemas';

/**
 * The buildable-envelope fields the pipeline extracts (C58 §2.2). Pan-Spanish /
 * pan-jurisdiction vocabulary — the Catalan↔Castilian term map is an adapter
 * concern, not a new field set (`ORDINANCE-EXTRACTION-PIPELINE.md` §1):
 *   - `maxHeight_m`     — altura / alçada reguladora, in metres.
 *   - `maxFloors`       — nº de plantas (storeys, PB+n → n+1).
 *   - `maxFAR`          — edificabilidad neta/bruta (m²t/m²s).
 *   - `maxCoverage`     — ocupación máxima, a fraction in [0,1].
 *   - `minParcelArea_m2`— parcela mínima (m²).
 *   - `setback.front|side|rear` — retranqueos / separacions (m).
 */
export const ExtractableFieldSchema = z.enum([
    'maxHeight_m',
    'maxFloors',
    'maxFAR',
    'maxCoverage',
    'minParcelArea_m2',
    'setback.front',
    'setback.side',
    'setback.rear',
]);
export type ExtractableField = z.infer<typeof ExtractableFieldSchema>;

/**
 * How a verification gate ruled on a value. `flag` NEVER auto-accepts — it routes
 * to a human (Stage 5). `not-applicable` = the gate had nothing to check (e.g. an
 * arithmetic check on a field with no redundant sibling), which is distinct from
 * `pass` and must never be read as one.
 */
export const GateVerdictSchema = z.enum(['pass', 'flag', 'not-applicable']);
export type GateVerdict = z.infer<typeof GateVerdictSchema>;

/**
 * The stable machine name of each gate — used to key `crossChecks` provenance
 * strings (`"arithmetic:pass"`, `"range:flag"`, …) so a human sees which check
 * spoke. A closed vocabulary because a typo'd gate name is a silent no-check.
 */
export const GateNameSchema = z.enum([
    'supersession',
    'dual-pass',
    'arithmetic',
    'range',
    'locale',
    'algorithm',
    // `regime` classifies the parcel's LEGAL basis before anything is extracted —
    // some regimes (German §34/§35) define no numeric envelope at all, and their
    // cited refusal is a positive answer (see `gates/regimeGate.ts`).
    'regime',
    // `coherence` checks one extracted parameter against ANOTHER extracted
    // parameter of the same envelope (e.g. FAR ≤ coverage × floors), rather than
    // checking a value against its own source text. It is therefore a whole-
    // envelope gate, not a per-value one (see `envelope/coherence.ts`).
    'coherence',
    // `containment` asks whether a span a model CLAIMS to have quoted is actually
    // in the source document — the anti-FABRICATION check ported from NREL
    // COMPASS's `sentence_ngram_containment` (see `gates/containment.ts`). Added
    // to this CLOSED vocabulary rather than passed as a free string, because "a
    // typo'd gate name is a silent no-check" is this enum's whole reason to exist.
    'containment',
    // `qualifier` asks whether every semantic qualifier present in the cited span
    // survived into the emitted claim — the anti-OMISSION check COMPASS does NOT
    // have, and the executable form of E4 control 8 (see `gates/qualifierSurvival.ts`).
    'qualifier',
]);
export type GateName = z.infer<typeof GateNameSchema>;

/** One gate's ruling on one value, with a human-readable reason. */
export interface GateResult {
    readonly gate: GateName;
    readonly verdict: GateVerdict;
    /** One line a human reads: what the gate checked and what it found. */
    readonly detail: string;
    /** The provenance token appended to `ExtractionProvenance.crossChecks`. */
    readonly token: string;
}

/**
 * When the extractor detects the value is NOT a stored number but a RULE
 * (`ORDINANCE-EXTRACTION-PIPELINE.md` §2 Stage 4, L-590g §5), it emits this
 * instead of a fabricated number:
 *   - `derived`    — "resultante de aplicar los parámetros" (Córdoba IND-1 ocupación).
 *   - `on-drawing` — the base value lives on a plànol ("segons plànol O 1.2").
 */
export const NonNumericRuleSchema = z.enum(['derived', 'on-drawing']);
export type NonNumericRule = z.infer<typeof NonNumericRuleSchema>;

/**
 * ONE pass's raw read of ONE field (Stage 3). Two of these (Pass A OCR-then-LLM,
 * Pass B direct-vision) feed the dual-pass agreement gate.
 *
 * `value: null` + a `rule` is the honest "this is an algorithm, not a number"
 * read; `value: null` + no `rule` is "absent / could not read".
 */
export interface ExtractionCandidate {
    readonly field: ExtractableField;
    /** The numeric value, or null (algorithm / absent / unreadable). */
    readonly value: number | null;
    /** Present IFF the value is a rule, not a number. */
    readonly rule?: NonNumericRule;
    /** The zone/subzone the value is attributed to (attribution is load-bearing). */
    readonly zoneCode: string;
    /** The raw string the model read, kept for the locale gate + human review. */
    readonly rawText: string;
    /** Which pass produced this (`'A'` OCR-then-extract, `'B'` direct-vision). */
    readonly pass: 'A' | 'B';
}

/**
 * The pipeline's output for ONE field (task item 3): the value, its attribution,
 * the source, the article, the C23 crop reference, the confidence tier, and every
 * gate's ruling. This is what a city agent / the runtime consumes.
 *
 * ⚠ `confidence` is ALWAYS `pipeline-extracted-unverified` until a human signs off
 * (see `confidence.ts` — the no-silent-graduation lock). The pipeline cannot mint
 * a higher tier itself.
 */
export interface ExtractedField {
    readonly field: ExtractableField;
    /** The accepted value, or null (algorithm / routed-to-human / refused). */
    readonly value: number | null;
    /** Present IFF `value` is null because the ordinance states a rule. */
    readonly rule?: NonNumericRule;
    readonly fieldProvenance: FieldProvenance; // always 'pipeline-extracted' here
    readonly confidence: EnvelopeConfidence; // always 'pipeline-extracted-unverified'
    /** The zone/subzone the value is attributed to. */
    readonly zoneCode: string;
    /** The full C23 provenance (documentId, page, cropRef, article, gates…). */
    readonly provenance: ExtractionProvenance;
    /** Every gate that ran on this field, in order. */
    readonly gates: readonly GateResult[];
    /**
     * Did the field auto-accept? `true` ONLY when every applicable gate passed.
     * `false` routes to human verification (Stage 5) — the value is still carried
     * (so the human sees a pre-fill), but it must NOT ship un-reviewed.
     */
    readonly autoAccepted: boolean;
    /** Why it did not auto-accept (empty when it did) — the flagged gate details. */
    readonly flags: readonly string[];
}

/**
 * The result of running the pipeline over one document: the supersession verdict
 * (Stage 0) and the per-field results. When `extracted` is empty and
 * `supersession.shouldExtract` is false, the document was REFUSED before
 * extraction — an honest, cited non-result, never a silent empty.
 */
export interface DocumentExtractionResult {
    readonly documentId: string;
    readonly cityId: string;
    readonly supersession: SupersessionResult;
    readonly extracted: readonly ExtractedField[];
}

/** Re-exported here so consumers import one module. */
export type { ExtractionProvenance, FieldProvenance, EnvelopeConfidence };

/**
 * The Stage-0 supersession verdict (structural — see `gates/supersessionGate.ts`).
 * Declared here to avoid a cycle between `types` and `gates`.
 */
export interface SupersessionResult {
    readonly status: import('@pryzm/schemas').SupersessionStatus;
    /** Gate the whole document: false ⇒ never fetch/extract (Stage 0). */
    readonly shouldExtract: boolean;
    readonly detail: string;
    /** A caveat to attach to every extracted field (e.g. under-appeal). */
    readonly caveat: string | null;
}
