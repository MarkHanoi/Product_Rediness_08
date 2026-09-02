// @pryzm/ordinance-extraction — the DOCUMENT → CLAIM spine vocabulary.
//
// ⛔ THE ONE RULE THIS FILE EXISTS TO ENCODE (spec §20): **AI INTERPRETS,
// DETERMINISTIC COMPUTES.** What comes out of a document is a CLAIM carrying
// evidence, an extraction method, a confidence tier and a validation state. It is
// NEVER a fact, and it may NEVER graduate by any automatic path. A pipeline that
// lets an extracted number reach a buildable-envelope calculation unlabelled is
// the single failure this whole wave exists to prevent.
//
// The six stages are `acquire → read → STRUCTURE → interpret → VERIFY → attribute`
// and FOUR of them already existed on 2026-08-09. This spine adds STRUCTURE
// (`structure/`), the retrieve-then-verify half of INTERPRET (`spine/readers.ts`)
// and the CLAIM producer (`spine/claimProducer.ts`), and reuses everything else
// unchanged — `pipeline.ts`'s orchestrator, all nine gates, and the attribution
// layer. It is an EXTENSION of `@pryzm/ordinance-extraction`, not a rival of it.
//
// Pure data + types: no I/O, no THREE, no DOM (P5-consistent; L2 leaf).

import { type RuleProvenance, type ValidationState } from '@pryzm/schemas';
import { type ExtractableField, type GateResult } from '../types.js';

/**
 * HOW a candidate value was physically obtained. The brief requires every claim to
 * carry its extraction method, and the E1a `RuleDerivation` vocabulary is too
 * coarse to say it (see `tierLock.ts` for why the spine still stamps
 * `AI_EXTRACTED` regardless — and why that is the CONSERVATIVE choice, not a
 * flattering one).
 *
 *   - `table-reconstruction` — read from a `CanonicalTable` cell whose column was
 *                              resolved by page GEOMETRY. No model involved.
 *   - `text-grammar`         — parsed out of prose by a deterministic
 *                              `JurisdictionGrammar`. No model involved.
 *   - `ai-span-retrieval`    — a model was asked to QUOTE the governing span; the
 *                              quote was containment-verified and then parsed
 *                              deterministically. The model never produced the number.
 */
export type ExtractionMethod = 'table-reconstruction' | 'text-grammar' | 'ai-span-retrieval';

/**
 * The EVIDENCE behind one claim — the thing a human re-reads to accept or reject
 * it. `span` is VERBATIM and in the source language: a paraphrase cannot be
 * reviewed (the same rule the RASE annotation and the attribution layer's
 * `EvidenceCitation.verbatim` already keep).
 */
export interface ClaimEvidence {
    /** The exact text the value was read from. Never a paraphrase, never trimmed. */
    readonly span: string;
    /** The document id the citation names. */
    readonly documentId: string;
    /** 1-based page, as a human turns to it. */
    readonly page: number;
    /** The governing heading/§/article where the structure layer found one. */
    readonly section: string | null;
    /**
     * For a table read: `"<header cell> @ row <key>"` — which COLUMN of which ROW.
     * The Luzern trap is a column mis-attribution, so the column must be nameable
     * in the evidence or the claim cannot be audited.
     */
    readonly cell: string | null;
    readonly method: ExtractionMethod;
    /** Model/retriever id for `ai-span-retrieval`, else the deterministic reader's id. */
    readonly reader: string;
    /** How the source text was obtained — the containment threshold rode on it. */
    readonly digitisation: string;
}

/** The parcel/zone the document is being read FOR. */
export interface ZoneContext {
    /** ISO-3166-1 alpha-2, uppercase — the `RuleSourceRef.country` seat. */
    readonly country: string;
    /** The key that selects this zone's row/section in the document (Luzern: "10"). */
    readonly zoneKey: string;
    /** A human label where the source provides one, else null. */
    readonly zoneLabel: string | null;
    /** Publishing authority, for `RuleSourceRef.authority`. */
    readonly authority: string;
    /** Dataset/instrument name, for `RuleSourceRef.dataset`. */
    readonly dataset: string;
    /** The plan id within the dataset, or null. */
    readonly planId: string | null;
}

/**
 * The validity window a claim asserts, and WHAT it is a claim about (R3).
 * `'ingestion'` is the honest default for a value read out of a PDF: unless the
 * caller can cite the instrument's legal in-force axis, the window is versioned by
 * when PRYZM read it, and a point-in-time evaluator must NOT treat it as answering
 * "was this in force on date D".
 */
export interface ClaimValidity {
    readonly basis: 'legal' | 'ingestion';
    /** ISO `YYYY-MM-DD`. */
    readonly from: string;
    /** ISO `YYYY-MM-DD`, or null = currently in force. */
    readonly to: string | null;
}

/**
 * ONE tier-4 claim. `provenance` is the FROZEN L0 `RuleProvenance` narrowed so
 * tiers 1/2/3 are not merely discouraged but UNCONSTRUCTIBLE — see
 * `tierLock.ts`.
 */
export interface ExtractedClaim {
    /** Canonical parameter name (see `claimProducer.ts` PARAMETER_NAMES). */
    readonly parameter: string;
    /** The envelope field this claim populates, in the package's own vocabulary. */
    readonly field: ExtractableField;
    /** The value. Never null here: an absent value is a `NothingFound`, not a claim. */
    readonly value: number;
    readonly unit: string | null;
    readonly zoneKey: string;
    readonly evidence: ClaimEvidence;
    /** Tier 4 · AI_EXTRACTED · in-document-text. Enforced in the type AND at runtime. */
    readonly provenance: ExtractionClaimProvenance;
    /**
     * ALWAYS `'not-checked'` — the L0 `ValidationState` member that means UNVALIDATED.
     * No new vocabulary is minted for this (control 2): `'not-checked'` already
     * carries exactly the meaning, and the only members above it
     * (`human-reviewed`, `authority-confirmed`) are reachable only through a
     * recorded human event, never from here.
     */
    readonly validationState: Extract<ValidationState, 'not-checked'>;
    /** Every gate that ran, in order — including containment and qualifier survival. */
    readonly gates: readonly GateResult[];
    /** True only when every applicable gate passed. NEVER a licence to publish. */
    readonly autoAccepted: boolean;
    /** Why it did not auto-accept (empty when it did). */
    readonly flags: readonly string[];
}

/**
 * The FROZEN L0 provenance record, narrowed to what an extraction spine may emit.
 *
 * ⛔ THE TIER LOCK, AT THE TYPE LEVEL. `confidence.tier` is the literal `4` and
 * `derivation` is the literal `'AI_EXTRACTED'`, so an `ExtractedClaim` carrying
 * tier 1, 2, 3 or 5 does not compile. The runtime guard in `tierLock.ts` closes
 * the same door for values that arrive as `unknown` (parsed JSON, a test's forged
 * record, a future caller with an `as` cast).
 */
export type ExtractionClaimProvenance = Omit<RuleProvenance, 'derivation' | 'confidence'> & {
    readonly derivation: 'AI_EXTRACTED';
    readonly confidence: { readonly tier: 4; readonly note?: string };
};

/**
 * WHY a parameter the spine looked for produced no claim. ⚠ EVERY ONE OF THESE IS
 * A SUCCESSFUL RUN. They are the honest empties, and they are reported as data —
 * control 9, at the pipeline level: "we ran and found nothing" is a different
 * answer from "we could not run", and both are different from zero.
 *   - `not-in-document`        — the parameter is simply not stated.
 *   - `zone-not-in-document`   — the document does not contain this zone at all.
 *   - `table-not-reconstructed`— the value is in a grid Layer 3 could not
 *                                confidently reconstruct. ⭐ The number may well be
 *                                on the page; we refuse to guess WHICH column it is in.
 *   - `no-span-retrieved`      — the retriever returned nothing for this parameter.
 *   - `span-not-contained`     — a span came back but the document does not contain
 *                                it: a fabrication, refused.
 *   - `span-not-parseable`     — the span is genuine but holds no parseable number.
 *   - `stated-as-rule`         — the ordinance points at a drawing/algorithm. A
 *                                POSITIVE answer, never an absence.
 *   - `no-reader-for-field`    — neither a table schema nor a grammar in this
 *                                jurisdiction can read this parameter. A gap in
 *                                PRYZM, stated as such rather than as a silence.
 */
export type NothingFoundReason =
    | 'not-in-document'
    | 'zone-not-in-document'
    | 'table-not-reconstructed'
    | 'no-span-retrieved'
    | 'span-not-contained'
    | 'span-not-parseable'
    | 'stated-as-rule'
    | 'no-reader-for-field';

/** One parameter the spine sought and did not claim, with its reason. */
export interface NothingFound {
    readonly field: ExtractableField;
    readonly parameter: string;
    readonly reason: NothingFoundReason;
    readonly detail: string;
    /** The evidence looked at, when there was any (a withheld table, a rejected span). */
    readonly evidence: ClaimEvidence | null;
}

/**
 * WHY the spine could not run at all. ⚠ THESE ARE NOT EMPTIES. A failed run
 * tells you nothing about the document; an empty run tells you the document does
 * not say it. Collapsing them is the `failure ≠ absence` defect
 * (L-422/457/467/469, §CONTEXT-DATA-HONESTY) at the pipeline's outermost seam.
 */
export type SpineFailureReason =
    | 'no-pages' // the document produced no pages to read
    | 'no-text-layer' // opened, but zero characters: this is an OCR input, not a text one
    | 'no-document-id' // nothing citeable — a value with no address is not a value
    | 'invalid-zone-context' // the caller supplied no zone to read the document FOR
    // ⭐ ADDED 2026-09-02 (lane E8-SPINE) FOR A MEASURED FALSE-CLEAN, not for
    // symmetry. Running the spine over the REAL Marseille PLUi règlement
    // (34,584,817 bytes, fetched live) with no FR reader configured returned
    // `ran · claims 0 · nothingFound 0` — a CLEAN EMPTY RUN. That reads as "we
    // read the document and it states nothing", when the truth is "PRYZM has no
    // reader for this jurisdiction and never looked". Those are opposite facts and
    // the outermost seam was collapsing them — the exact `failure ≠ absence`
    // defect (control 9) this spine exists to prevent, one level above where it was
    // being guarded.
    | 'no-reader-configured'
    | 'internal-error'; // an unexpected error, contained rather than thrown

/** The spine RAN. Claims may still be empty — that is an answer, not a failure. */
export interface DocumentClaimSuccess {
    readonly ok: true;
    readonly kind: 'ran';
    readonly documentId: string;
    readonly zone: ZoneContext;
    readonly claims: readonly ExtractedClaim[];
    /** Every parameter sought and not claimed, each with its typed reason. */
    readonly nothingFound: readonly NothingFound[];
    /** Grids Layer 3 refused to trust, with the page and the reason. Never silent. */
    readonly withheldTables: readonly { page: number; detail: string }[];
}

/**
 * The spine was legally REFUSED before extraction — a superseded instrument
 * (Stage 0) or a legal regime that defines no numeric envelope (German §34/§35).
 * ⭐ A POSITIVE PRODUCT ANSWER carrying a citation, not a failure and not an empty.
 */
export interface DocumentClaimRefusal {
    readonly ok: false;
    readonly kind: 'refused';
    readonly documentId: string;
    readonly zone: ZoneContext;
    /** The cited reason a user should read. */
    readonly detail: string;
    /** Which gate refused: `supersession` or `regime`. */
    readonly refusedBy: 'supersession' | 'regime';
}

/** The spine COULD NOT RUN. Says nothing about the document's content. */
export interface DocumentClaimFailure {
    readonly ok: false;
    readonly kind: 'failed';
    readonly documentId: string;
    readonly zone: ZoneContext | null;
    readonly reason: SpineFailureReason;
    readonly detail: string;
}

/**
 * The spine's three-valued outcome. The three are DISTINCT ON PURPOSE and a
 * consumer must handle all three: `ran` with zero claims ≠ `refused` ≠ `failed`.
 */
export type DocumentClaimOutcome =
    | DocumentClaimSuccess
    | DocumentClaimRefusal
    | DocumentClaimFailure;
