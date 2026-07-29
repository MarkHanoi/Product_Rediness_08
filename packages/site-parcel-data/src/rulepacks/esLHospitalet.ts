// Envelope Phase 2 — L'Hospitalet de Llobregat (INE 08101): the SECOND Catalan municipality.
//
// WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT
// ---------------------------------------------------
// ENVELOPE-IMPLEMENTATION-PLAN §1 Phase 2 is the "cheapest possible proof" that onboarding a city
// is a DATA addition at five slots (S1 parcel provider, S2 router predicate, S3 zone source, S4
// rule pack, S5 registration) + one L5 dispatcher branch — no engine/UI edit. L'Hospitalet sits in
// the SAME AMB fabric as Barcelona, governed by the SAME instrument (PGM-1976, the Pla General
// Metropolità), and its zoning (clau) is served by the SAME Catalonia-wide MUC source Barcelona
// already uses (S3). So the router predicate (S2, `lhospitaletBbox.ts`), this registration (S5)
// and one dispatcher branch (L5) are the whole engineering cost.
//
// ⚠⚠⚠ THE HONESTY GATE IS THE POINT. "Same instrument" is NOT "same numbers". The Art. 242.2
// buildable-DEPTH construction (`block-derived-alignment`) is genuinely metropolitan — it derives
// the depth from the real cadastral block, not from a municipality's table — so its GEOMETRY would
// transfer. But two things are NOT metropolitan and NOT verified for L'Hospitalet:
//   1. WHICH claus appear here and whether each maps to the same rule shape as Barcelona's (each
//      AMB municipality layers its own *modificacions puntuals* over the PGM);
//   2. the HEIGHT tables (Art. 327/328 *alçada reguladora*) and the *ample oficial* street widths
//      Barcelona's packs key on — those are `es-08019-barcelona` data, cited to Barcelona.
// Reusing `ES_BARCELONA_ENSANCHE_PACK` for an L'Hospitalet parcel would stamp Barcelona's
// jurisdiction id, Barcelona's height table and Barcelona's citations onto another municipality's
// land — a confident MIS-CITATION, the exact harm ProvenanceFlags + §CONTEXT-DATA-HONESTY forbid.
//
// ⇒ Until a Spanish-planning-literate human verifies (per clau) that L'Hospitalet's numbers and
//    geometry genuinely equal Barcelona's — and signs `sources/VERIFICATION.md` —
//    `LHOSPITALET_ENVELOPE_VERIFIED` is `false` and the dispatcher renders a CITED REFUSAL for
//    every L'Hospitalet parcel, never a borrowed Barcelona envelope. This is the same discipline
//    that keeps Córdoba's machine-OCR'd pack refusing and Barcelona's 22a unregistered: an absent
//    number costs nothing; a confident wrong one costs credibility.
//
// PURITY: L2-pure. Data + string builders. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — ENVELOPE-REPLICATION-STANDARD.md (§0 "same instrument ≠ same numbers", §5
// honesty), ENVELOPE-IMPLEMENTATION-PLAN.md §1 Phase 2, C58 §1.2/§1.4/§1.5/§1.7a, C60 §3,
// ADR-0271 (Art. 242.2), §CONTEXT-DATA-HONESTY.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/** The jurisdiction id L'Hospitalet uses — the INE municipal code (playbook §2, folder identity). */
export const LHOSPITALET_JURISDICTION_ID = 'es-08101-hospitalet';

/**
 * ⚠⚠⚠ THE HONESTY GATE. `false` until a human verifies — PER CLAU — that L'Hospitalet's zoning
 * parameters (depth rule shape, height table, FAR, coverage) genuinely equal the Barcelona pack
 * they would reuse, and signs `sources/VERIFICATION.md` (mirrored in a C23 AIArtefact
 * `humanApproval` — no-silent-graduation).
 *
 * While this is `false`, `applyLHospitaletZoningThenFallback` dispatches `lhospitaletUnverifiedRefusal`
 * for EVERY L'Hospitalet parcel and no numeric envelope is ever produced. The router + registration +
 * dispatcher are all WIRED and reachable — that is what Phase 2 proves — but the ANSWER is an honest
 * cited refusal, because asserting L'Hospitalet == Barcelona without verification would be fabrication.
 *
 * ⚠ FLIPPING THIS TO `true` IS A LEGAL ACT, NOT A CODE CHANGE. It requires: (a) confirming which
 * L'Hospitalet claus exist and their rule shape (MUC + the municipal *text refós*), (b) sourcing
 * L'Hospitalet's own height/street-width tables (Barcelona's do NOT transfer), and (c) authoring an
 * `es-08101-hospitalet` pack (or an explicit per-clau equivalence ruling) so the reused geometry is
 * cited to L'Hospitalet, not to Barcelona. Do NOT flip it to make a demo work.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (LHOSPITALET_ENVELOPE_VERIFIED)`
 * compute branch is not narrowed away as dead code while the gate is closed.)
 */
export const LHOSPITALET_ENVELOPE_VERIFIED: boolean = false;

/** The instrument every L'Hospitalet refusal that makes a claim about the law cites. */
export const LHOSPITALET_PGM_INSTRUMENT_REF =
    'PGM-1976 (Pla General Metropolità de Barcelona, aprovat definitivament 14-07-1976), the ' +
    "metropolitan instrument governing L'Hospitalet de Llobregat, as consolidated by the " +
    "municipality's own *modificacions puntuals* (Ajuntament de L'Hospitalet). Zoning (clau) " +
    'source: Generalitat de Catalunya MUC (Mapa Urbanístic de Catalunya).';

/**
 * C60 §3 — the honest one-line statement of WHAT PRYZM covers in L'Hospitalet and its limits, kept
 * beside the copy that cites it so the two cannot drift. Names both the pilot status and the reason
 * the Barcelona numbers are not simply borrowed.
 */
export const LHOSPITALET_ROADMAP_LINE =
    "L'Hospitalet de Llobregat coverage today: the jurisdiction is ROUTED (its parcels resolve their " +
    'clau from the same Catalan MUC as Barcelona, and the metropolitan PGM-1976 Art. 242.2 depth ' +
    'construction applies here as it does across the AMB), but PRYZM has NOT yet verified that any ' +
    "individual clau's numbers — height, FAR, coverage — equal Barcelona's, and the *alçada " +
    'reguladora* / official-street-width tables are municipality-specific. Rather than borrow a ' +
    "Barcelona figure onto L'Hospitalet land, PRYZM shows a cited refusal until that per-clau " +
    'verification is signed. Points outside this municipality fall back to their own jurisdiction, ' +
    'never to a borrowed L\'Hospitalet number.';

/**
 * THE HONESTY-GATE refusal: shown for EVERY L'Hospitalet parcel while `LHOSPITALET_ENVELOPE_VERIFIED`
 * is false. It is what makes "the jurisdiction is wired but renders no number" TRUE.
 *
 * ⚠ `code: 'no-rule-pack'`, `legallyGrounded: false`, `ordinanceRef: null` — a statement about
 * PRYZM's verification status, NOT about the law. It must NEVER read as a legal "no envelope
 * applies here": that would tell an owner the ordinance forbids building on a buildable AMB plot
 * (a false negative about their land — the worst error in the set). The PGM DOES grant an envelope
 * here; PRYZM has simply not verified that it may reuse Barcelona's transcription of it. (The
 * refusal enum carries no dedicated `unverified` code; `no-rule-pack` is the honest fit and the
 * copy carries the precise meaning, exactly as Córdoba's unverified refusal does.)
 */
export function lhospitaletUnverifiedRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const zone =
        zoneLabel && zoneLabel.trim()
            ? `${zoneLabel.trim()}${zoneCode ? ` (clau ${zoneCode})` : ''}`
            : zoneCode && zoneCode.trim()
              ? `clau ${zoneCode}`
              : "this L'Hospitalet parcel";
    return {
        code: 'no-rule-pack',
        headline:
            `${zone} — PRYZM routes L'Hospitalet and shares Barcelona's metropolitan ordinance, but ` +
            "has not yet verified that this zone's numbers equal Barcelona's, so it will not publish a figure.",
        detail:
            "L'Hospitalet de Llobregat is governed by the same metropolitan plan as Barcelona " +
            '(PGM-1976) and its zoning is read from the same Catalan MUC, so the parcel is correctly ' +
            'identified and the Art. 242.2 buildable-depth CONSTRUCTION would apply. But PRYZM has ' +
            "NOT verified, clau by clau, that L'Hospitalet's height, FAR and coverage match the " +
            "Barcelona rule pack — and Barcelona's *alçada reguladora* and official-street-width " +
            "tables are Barcelona's own, not L'Hospitalet's. Reusing a Barcelona number here would be " +
            'a confident mis-citation on another municipality\'s land, so PRYZM shows none rather than ' +
            'something wrong. ' + LHOSPITALET_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
