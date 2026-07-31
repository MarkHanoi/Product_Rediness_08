// ADR-0279 §2 / DK gap G3+G6 — `PlacementEvidence`: the JURISDICTION-AGNOSTIC vocabulary for
// "here is a piece of geometry, and here is what makes it legally binding (or not)".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — geometry production is NOT legal-status production
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The DK placement resolver (`rulepacks/dkEnvelopePlacement.ts`) asks one question per tier: "may I
// draw a building here?" The answer has TWO independent halves that jurisdictions source from
// completely different places:
//
//   1. WHERE the geometry is        → `geometrySource`     (a GIS layer / a construction / a survey)
//   2. WHAT MAKES IT BINDING        → `legalStatusSource`  (metadata / plan text / statute)
//
// Collapsing them is the mistake this module exists to prevent. Denmark is the FIRST jurisdiction
// where `legalStatusSource = 'metadata'` — the municipality publishes machine-readable booleans
// (`bygkunifelt` / `bygvejledende`) that DECLARE bindingness on the feature itself. That is a rare
// and valuable property; most jurisdictions do not have it:
//
//   • Denmark  — `metadata`   : the WFS feature carries the binding flags (PROVEN, this module).
//   • Madrid   — `statute`    : bindingness comes from the PGOUM's Norma Zonal articles, not the GIS.
//   • Germany  — `plan_text`  : the B-Plan's textliche Festsetzungen say which lines bind.
//   • Sweden   — *Byggrätt*   ) all three still to be probed; the point of this abstraction is that
//   • Finland  — *Rakennusala*) the resolver does not change when they land, only the producer that
//   • Norway   — *Byggegrense*) populates these fields does.
//
// So `legalStatusSource` is POPULATED FROM EVIDENCE, NEVER ASSUMED. A producer that cannot say
// where a legal status came from must emit `legalStatus: 'unknown'` — not a guess with a source
// label attached, which would launder an inference into a citation (C58 §1.4, §1.6).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §UNKNOWN-HAS-THREE-CAUSES — the honesty extension to the founder's interface
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `legalStatus: 'unknown'` is not one state. Measured on the Danish national byggefelt set
// (n = 57,035, 2026-07-31) it has three legally distinct causes with very different remedies:
//
//   • `not-declared`        (6,101 = 10.7%) — the municipality declared NEITHER flag. The lokalplan
//                                             TEXT decides. Remedy: read the PDF (G5).
//   • `metadata-conflict`   (  179 =  0.3%) — the municipality declared BOTH. The record contradicts
//                                             itself. Remedy: ask the municipality. NEVER infer.
//   • `metadata-unavailable`(  205 =  0.4%) — the flags are NULL. `null` is not `false`. Remedy: retry
//                                             / re-ingest; this may be a publication gap, not a legal one.
//
// A single `'unknown'` would make "the plan is silent", "the data is broken" and "we did not receive
// the field" the same value — the exact §CONTEXT-DATA-HONESTY failure class (L-422/457/467/469) this
// codebase keeps re-learning. So the cause rides along as a closed union.
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no clock, no RNG. Data shapes + total functions only.
// This module is deliberately NOT in `packages/schemas` (P5 is about purity, but the L0 contract
// surface is ADR-governed and this vocabulary is not yet ratified); it is package-local and pure,
// and promoting it to L0 is a follow-up ADR once a second jurisdiction consumes it.
//
// Strategic context — ADR-0279 (five-slot envelope onboarding) §2/§6, C57 §1.5 (FetchOutcome),
// C58 §1.2/§1.4/§1.6, docs/04-reference/jurisdictions/dk/DENMARK-GAP-ROADMAP.md G3/G6/G11.

import type { Pt } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// GEOMETRY — carried WITH its coordinate frame, so an unprojected ring cannot reach the engine
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The coordinate frame a piece of evidence geometry is expressed in.
 *
 * ⚠ THIS FIELD IS A SAFETY INTERLOCK, not documentation. Plandata publishes in EPSG:25832 (ETRS89 /
 * UTM 32N) while the engine consumes scene-XZ metres. Those are both "metres" and both plausible
 * magnitudes, so a mix-up produces a plausible-looking wrong building rather than an error — the
 * worst failure mode. The tier-1 adapter therefore REFUSES anything that is not `'scene-xz'`
 * (`byggefeltEvidence.ts::dkByggefeltFromEvidence`), which makes the mistake unrepresentable rather
 * than merely discouraged.
 */
export type EvidenceCrs = 'EPSG:25832' | 'EPSG:4326' | 'scene-xz';

/**
 * One polygon of evidence geometry: an outer ring plus any holes.
 *
 * Holes are CARRIED, not dropped. A byggefelt with an interior hole is a real published statement
 * ("build in this field, but not in this courtyard"), and silently flattening it to the outer ring
 * would over-state the buildable area — the L-616 direction of error. Consumers that cannot honour
 * a hole must REFUSE (the tier-1 adapter does exactly that).
 */
export interface EvidencePolygon {
    readonly kind: 'polygon';
    /** The outer ring, in `crs`. Closed or open; consumers must not assume. */
    readonly outer: readonly Pt[];
    /** Interior holes, in `crs`. Empty for the common case. NEVER silently discarded. */
    readonly holes: readonly (readonly Pt[])[];
    readonly crs: EvidenceCrs;
}

/** One polyline of evidence geometry (a building line / byggelinje / Baugrenze). */
export interface EvidenceLineString {
    readonly kind: 'lineString';
    readonly line: readonly Pt[];
    readonly crs: EvidenceCrs;
}

export type EvidenceGeometry = EvidencePolygon | EvidenceLineString;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PROVENANCE AXES
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * WHERE THE GEOMETRY CAME FROM — independent of what makes it binding.
 *
 *  - `official_gis` — read from an authority's published GIS layer (a WFS feature). The coordinates
 *                     are the authority's own.
 *  - `derived`      — CONSTRUCTED by PRYZM (a depth band, an offset, a study). The coordinates are
 *                     ours; only the parameters may be cited.
 *  - `survey`       — from a measured site survey supplied by the user.
 */
export type GeometrySource = 'official_gis' | 'derived' | 'survey';

/**
 * WHETHER THE GEOMETRY BINDS.
 *
 *  - `binding`      — the authority states construction is CONSTRAINED to / by this geometry.
 *  - `illustrative` — the authority states this geometry is ADVISORY (vejledende / informativ). It is
 *                     still real published evidence and ranks above nothing, but it may not place a
 *                     footprint. ⚠ An explicit advisory declaration is a DETERMINATION, not a gap —
 *                     never "upgrade" it by heuristic (see `§DO-NOT-RECLASSIFY-ADVISORY` below).
 *  - `unknown`      — no determination is available. See `LegalStatusUnknownCause` — the cause is
 *                     load-bearing and must be carried.
 */
export type LegalStatus = 'binding' | 'illustrative' | 'unknown';

/**
 * WHERE THE LEGAL STATUS CAME FROM. Populated FROM EVIDENCE, never assumed (module header).
 *
 *  - `metadata`  — a machine-readable field on the feature itself declares it (Denmark's
 *                  `bygkunifelt`/`bygvejledende`). The strongest and rarest form.
 *  - `plan_text` — a clause in the plan document says so (Germany's textliche Festsetzungen). Requires
 *                  a citation to the clause.
 *  - `statute`   — a general legal instrument says so for this class of geometry (Madrid's Norma
 *                  Zonal articles). Requires a citation to the article.
 *
 * There is deliberately NO `'inferred'` / `'heuristic'` member. If PRYZM guessed, the status is
 * `'unknown'` and there is no source — a guess with a provenance label is worse than no answer.
 */
export type LegalStatusSource = 'metadata' | 'plan_text' | 'statute';

/** WHICH INSTRUMENT speaks. Distinct from `legalStatusSource`, which is *where we read it*. */
export type EvidenceAuthority = 'plan' | 'regulation' | 'metadata';

/**
 * §UNKNOWN-HAS-THREE-CAUSES — why no legal determination is available. See the module header for the
 * measured national distribution and the distinct remedy each cause implies.
 */
export type LegalStatusUnknownCause =
    /** The authority declared no binding either way. The plan TEXT is the remedy (DK gap G5). */
    | 'not-declared'
    /** The authority's own metadata is SELF-CONTRADICTORY (e.g. binding AND advisory both true).
     *  ⚠ REFUSE TO INFER — this is a QA finding to route back to the authority, not a tie to break. */
    | 'metadata-conflict'
    /** The declaring field is NULL/absent in the response. `null` is NOT `false` — this may be a
     *  publication or ingestion gap rather than a legal statement, so it is retryable in a way
     *  `not-declared` is not. */
    | 'metadata-unavailable';

/** A pointer to the document that carries the determination. Never fabricated (DK gap G11). */
export interface EvidenceCitation {
    /** Human-readable document identity, e.g. `'Lokalplan 12-002 (Silkeborg)'`. */
    readonly document: string;
    /** The clause, where one is known — e.g. `'§7.2'`. Absent when the source is feature metadata. */
    readonly article?: string;
    /** A resolvable URL to the document itself (Denmark's `doklink`). */
    readonly url?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// CONFIDENCE — an ORDINAL ranking weight, and honest about being one
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ `PlacementEvidence.confidence` IS A RANKING WEIGHT, NOT A PROBABILITY. It exists to order a
 * ranked evidence list deterministically; it is NOT calibrated against outcomes and must never be
 * multiplied into an area, a height, or presented to a user as a percentage.
 *
 * The scale is ordinal and its ONE empirical anchor is the measured national self-contradiction rate
 * of Danish byggefelt metadata — 179 / 57,035 = 0.31% (2026-07-31) — which is why an explicitly
 * declared binding flag is weighted below 1.0: municipal data entry is demonstrably imperfect.
 * Everything else is a deliberate, documented ORDERING choice.
 */
export const EVIDENCE_CONFIDENCE = Object.freeze({
    /** An authority's machine-readable field declares this binding, unambiguously. */
    BINDING_DECLARED: 0.95,
    /** A plan clause / statute states bindingness (needs a text read, so slightly weaker than a flag). */
    BINDING_CITED: 0.9,
    /** The authority explicitly declared the geometry ADVISORY. Real evidence, may not place. */
    ILLUSTRATIVE_DECLARED: 0.6,
    /** Real official geometry, but no legal determination at all — the plan text must decide. */
    UNKNOWN_NOT_DECLARED: 0.3,
    /** The declaring field was null/absent — retryable, so ranked below a settled non-declaration. */
    UNKNOWN_METADATA_UNAVAILABLE: 0.2,
    /** The metadata contradicts itself. Ranked LAST: a self-contradictory record is the weakest
     *  possible basis for placing a building, weaker than an honest silence. */
    UNKNOWN_METADATA_CONFLICT: 0.1,
} as const);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE EVIDENCE RECORD
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One piece of placement evidence: a geometry, and what (if anything) makes it binding.
 *
 * The resolver consuming these MUST NOT care WHY something is binding — that is the whole point of
 * the split. It reads `legalStatus`; `legalStatusSource` / `authority` / `citation` exist so a human
 * (and the G11 evidence chain) can audit the determination afterwards.
 */
export interface PlacementEvidence {
    readonly geometry: EvidenceGeometry;
    readonly geometrySource: GeometrySource;
    readonly legalStatus: LegalStatus;
    /**
     * WHERE the legal status was read from. `null` iff `legalStatus === 'unknown'` — there is no
     * source for a non-determination, and inventing one would be the laundering this module forbids.
     */
    readonly legalStatusSource: LegalStatusSource | null;
    readonly authority: EvidenceAuthority;
    readonly citation?: EvidenceCitation;
    /** ⚠ An ORDINAL ranking weight — see `EVIDENCE_CONFIDENCE`. Not a probability. */
    readonly confidence: number;
    /**
     * §UNKNOWN-HAS-THREE-CAUSES. Non-null iff `legalStatus === 'unknown'`; names WHICH of the three
     * legally distinct causes applies, because each has a different remedy.
     */
    readonly unknownCause: LegalStatusUnknownCause | null;
    /**
     * Stable identity of the source feature, for the G11 evidence chain and for QA routing.
     * `sourceLayer` + `featureId` together identify the record to re-fetch or report upstream.
     */
    readonly featureId: string | null;
    readonly sourceLayer: string;
    /**
     * TRUE when this record's own metadata is internally inconsistent and PRYZM has REFUSED to
     * resolve it. Such records are emitted (never dropped — a silent drop is an invisible data
     * quality problem) but can never place a footprint. Collected by `collectEvidenceConflicts`.
     */
    readonly hasMetadataConflict: boolean;
    /**
     * Human-readable statement of the determination, for the audit trail / QA output. Describes what
     * the source said and what was concluded — never a justification for a guess.
     */
    readonly determination: string;
    /**
     * Which part of a multi-part source geometry this is (0-based), and how many parts there were.
     * A MultiPolygon byggefelt becomes N evidence records sharing one citation; a consumer that can
     * only take ONE ring (the `explicit-area` primitive) must refuse rather than silently pick part 0.
     */
    readonly partIndex: number;
    readonly partCount: number;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RANKING + QA — total, pure, deterministic
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Ordering rank of a legal status: binding beats illustrative beats unknown. */
function statusRank(s: LegalStatus): number {
    return s === 'binding' ? 2 : s === 'illustrative' ? 1 : 0;
}

/**
 * Rank an evidence list strongest-first: `legalStatus`, then `confidence`, then a STABLE tiebreak on
 * (featureId, partIndex) so the same input always yields the same order — a resolver whose answer
 * depends on WFS response ordering is not reproducible, and reproducibility is what makes a refusal
 * auditable (C58 §1.1).
 *
 * PURE — returns a new array; the input is not mutated.
 */
export function rankPlacementEvidence(
    evidence: readonly PlacementEvidence[],
): readonly PlacementEvidence[] {
    return [...evidence].sort((a, b) => {
        const byStatus = statusRank(b.legalStatus) - statusRank(a.legalStatus);
        if (byStatus !== 0) return byStatus;
        const byConfidence = b.confidence - a.confidence;
        if (byConfidence !== 0) return byConfidence;
        const byId = (a.featureId ?? '').localeCompare(b.featureId ?? '');
        if (byId !== 0) return byId;
        return a.partIndex - b.partIndex;
    });
}

/**
 * The strongest BINDING evidence in a list, or null when nothing binds.
 *
 * ⚠ Returns null — not the best available — when no entry is `binding`. Falling back to the
 * strongest illustrative record would be the §NO-SILENT-FALLBACK failure: an advisory geometry
 * quietly promoted to a footprint. The caller must handle the null.
 */
export function strongestBindingEvidence(
    evidence: readonly PlacementEvidence[],
): PlacementEvidence | null {
    const ranked = rankPlacementEvidence(evidence);
    const best = ranked[0];
    return best !== undefined && best.legalStatus === 'binding' ? best : null;
}

/**
 * §DO-NOT-RECLASSIFY-ADVISORY — collect the records whose metadata CONTRADICTS ITSELF, as a QA
 * output rather than a silent resolution.
 *
 * These are records the authority published with mutually exclusive declarations. PRYZM refuses to
 * pick a winner (there is no principled basis to; the municipality must fix its record), so they are
 * surfaced here for routing upstream. A conflicted record still exists as evidence with
 * `legalStatus: 'unknown'` — it is neither dropped nor resolved.
 *
 * PURE.
 */
export function collectEvidenceConflicts(
    evidence: readonly PlacementEvidence[],
): readonly PlacementEvidence[] {
    return rankPlacementEvidence(evidence.filter((e) => e.hasMetadataConflict));
}
