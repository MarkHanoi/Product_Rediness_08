// Envelope Phase 2 (cont.) — Sant Boi de Llobregat (INE 08200): the FOURTH Catalan municipality.
// Mirrors esBadalona.ts exactly. Same AMB fabric, same instrument (PGM-1976), same Catalonia-wide
// MUC zone source (S3) as Barcelona + L'Hospitalet + Badalona — so the router predicate (S2,
// `santBoiBbox.ts`), this registration (S5) and one dispatcher branch (L5) are the whole engineering cost.
//
// ⚠⚠⚠ THE HONESTY GATE IS THE POINT. "Same instrument" is NOT "same numbers". The Art. 242.2
// buildable-DEPTH construction is metropolitan (derives depth from the real cadastral block), so its
// GEOMETRY would transfer. But NOT metropolitan / NOT verified for Sant Boi: (1) WHICH claus appear
// here + whether each maps to Barcelona's rule shape (Sant Boi layers its own *modificacions* over
// the PGM); (2) the HEIGHT tables (*alçada reguladora*) + *ample oficial* street widths Barcelona's
// packs key on — those are `es-08019-barcelona` data. Reusing `ES_BARCELONA_ENSANCHE_PACK` here would
// stamp Barcelona's jurisdiction id, height table + citations onto Sant Boi land — a confident
// MIS-CITATION, the exact harm §CONTEXT-DATA-HONESTY forbids.
//
// ⇒ Until a Spanish-planning-literate human verifies (per clau) that Sant Boi's numbers + geometry
//    equal Barcelona's — and signs `sources/VERIFICATION.md` — `SANT_BOI_ENVELOPE_VERIFIED` is
//    `false` and the dispatcher renders a CITED REFUSAL for every Sant Boi parcel, never a borrowed
//    Barcelona envelope. Same discipline as L'Hospitalet + Badalona + Córdoba.
//
// PURITY: L2-pure. Data + string builders. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — ENVELOPE-REPLICATION-STANDARD.md, ENVELOPE-IMPLEMENTATION-PLAN.md §1 Phase 2,
// C58 §1.2/§1.4/§1.5/§1.7a, C60 §3, ADR-0271 (Art. 242.2), §CONTEXT-DATA-HONESTY.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/** The jurisdiction id Sant Boi uses — the INE municipal code (playbook §2, folder identity). */
export const SANT_BOI_JURISDICTION_ID = 'es-08200-sant-boi';

/**
 * ⚠⚠⚠ THE HONESTY GATE. `false` until a human verifies — PER CLAU — that Sant Boi's zoning
 * parameters (depth rule shape, height table, FAR, coverage) genuinely equal the Barcelona pack they
 * would reuse, and signs `sources/VERIFICATION.md` (mirrored in a C23 AIArtefact `humanApproval`).
 *
 * While `false`, `applySantBoiZoningThenFallback` dispatches `santBoiUnverifiedRefusal` for EVERY
 * Sant Boi parcel and no numeric envelope is produced. Router + registration + dispatcher are all
 * WIRED + reachable — that is what Phase 2 proves — but the ANSWER is an honest cited refusal.
 *
 * ⚠ FLIPPING THIS TO `true` IS A LEGAL ACT, NOT A CODE CHANGE (see esBadalona.ts for the exact
 * checklist: confirm claus + rule shape via MUC + the municipal *text refós*; source Sant Boi's own
 * height/street-width tables; author an `es-08200-sant-boi` pack cited to Sant Boi). Do NOT flip it
 * to make a demo work.
 *
 * (Typed `boolean`, not the literal `false`, so a `if (SANT_BOI_ENVELOPE_VERIFIED)` compute branch is
 * not narrowed away as dead code while the gate is closed.)
 */
export const SANT_BOI_ENVELOPE_VERIFIED: boolean = false;

/** The instrument every Sant Boi refusal that makes a claim about the law cites. */
export const SANT_BOI_PGM_INSTRUMENT_REF =
    'PGM-1976 (Pla General Metropolità de Barcelona, aprovat definitivament 14-07-1976), the ' +
    'metropolitan instrument governing Sant Boi de Llobregat, as consolidated by the ' +
    'municipality\'s own *modificacions puntuals* (Ajuntament de Sant Boi de Llobregat). Zoning ' +
    '(clau) source: Generalitat de Catalunya MUC (Mapa Urbanístic de Catalunya).';

/**
 * C60 §3 — the honest one-line statement of WHAT PRYZM covers in Sant Boi and its limits, kept
 * beside the copy that cites it so the two cannot drift.
 */
export const SANT_BOI_ROADMAP_LINE =
    'Sant Boi de Llobregat coverage today: the jurisdiction is ROUTED (its parcels resolve their ' +
    'clau from the same Catalan MUC as Barcelona, and the metropolitan PGM-1976 Art. 242.2 depth ' +
    'construction applies here as across the AMB), but PRYZM has NOT yet verified that any ' +
    'individual clau\'s numbers — height, FAR, coverage — equal Barcelona\'s, and the *alçada ' +
    'reguladora* / official-street-width tables are municipality-specific. Rather than borrow a ' +
    'Barcelona figure onto Sant Boi land, PRYZM shows a cited refusal until that per-clau ' +
    'verification is signed. Points outside this municipality fall back to their own jurisdiction, ' +
    'never to a borrowed Sant Boi number.';

/**
 * §AMB-PGM-SCOPE (2026-07-31) — SANT BOI HAS THE THINNEST EVIDENCE BASE OF THE FOUR.
 *
 * The PGM NNUU declare their per-municipality overrides via numbered footnotes on each base article
 * (`NN. Veure modificació per al Municipi de <X> a la pàg. <P>`), and the *Modificacions* annex
 * reproduces each one under its municipality's own heading. Read positionally:
 *
 *   • **Sant Boi has NO standalone modification section in the annex at all.**
 *   • It appears exactly ONCE in the whole compendium, inside a JOINT four-municipality instrument:
 *     «Modificació puntual del **Sistema Aeroportuari** del PGM, als termes municipals del Prat de
 *     Llobregat, **Sant Boi de Llobregat**, Viladecans i Gavà» (Acord del Govern 06-03-2001, DOGC
 *     núm. 3361 de 03/04/01) — a *sistema general* (Arts. 186–190), NOT a zone.
 *
 * ⇒ No zone/envelope article carries a Sant Boi modification, so the metropolitan Art. 327/328
 *   tables and the Art. 242.2 depth construction are the best available reading here. The refusal
 *   nonetheless stands, for the same two reasons as L'Hospitalet:
 *
 *   1. **THE BLOCKER IS AN INPUT.** Art. 327.2 keys its table to the *ample oficial del carrer*;
 *      PRYZM holds an official-width source for Barcelona only. The bands are STEPS, so a measured
 *      frontage gap would fabricate a storey (L-459 / L-525a).
 *   2. **THE SOURCE CANNOT CERTIFY AN ABSENCE** — and for Sant Boi that bites hardest, because a
 *      single joint-instrument mention is exactly what a NON-EXHAUSTIVE compendium («no hi figuren
 *      totes les modificacions … només aquelles que s'han considerat més rellevants») looks like
 *      when it is under-reporting. Silence about Sant Boi is weak evidence, not strong evidence.
 *
 * See `esAmbPgmScope.ts` and `docs/04-reference/jurisdictions/es/es-ct/AMB-PGM-SCOPE-MAP.md`.
 */
export const SANT_BOI_PGM_SCOPE_FINDING =
    'PGM scope map (2026-07-31): Sant Boi has no standalone modification section in the ' +
    'metropolitan compendium, and appears in it exactly once — inside a joint four-municipality ' +
    'modification of the airport SYSTEM (Prat, Sant Boi, Viladecans, Gavà; DOGC núm. 3361 de ' +
    '03/04/01), not of any zone. No zone or envelope article carries a Sant Boi modification. That ' +
    'makes the metropolitan Art. 327/328 tables the best available reading — but the height still ' +
    'cannot be published, because Art. 327.2 keys the table to the *ample oficial del carrer* and ' +
    'PRYZM holds an official-width source for Barcelona only. And because the compendium is ' +
    'expressly non-exhaustive, near-total silence about Sant Boi is weak evidence of an absence, ' +
    'not strong evidence.';

/**
 * THE HONESTY-GATE refusal: shown for EVERY Sant Boi parcel while `SANT_BOI_ENVELOPE_VERIFIED` is
 * false. `code: 'no-rule-pack'`, `legallyGrounded: false`, `ordinanceRef: null` — a statement about
 * PRYZM's verification status, NOT about the law (the PGM DOES grant an envelope here; PRYZM has
 * simply not verified it may reuse Barcelona's transcription of it). Same shape as Badalona.
 */
export function santBoiUnverifiedRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const zone =
        zoneLabel && zoneLabel.trim()
            ? `${zoneLabel.trim()}${zoneCode ? ` (clau ${zoneCode})` : ''}`
            : zoneCode && zoneCode.trim()
              ? `clau ${zoneCode}`
              : 'this Sant Boi de Llobregat parcel';
    return {
        code: 'no-rule-pack',
        headline:
            `${zone} — PRYZM routes Sant Boi de Llobregat and shares Barcelona's metropolitan ` +
            "ordinance, but has not yet verified that this zone's numbers equal Barcelona's, so it " +
            'will not publish a figure.',
        detail:
            'Sant Boi de Llobregat is governed by the same metropolitan plan as Barcelona (PGM-1976) ' +
            'and its zoning is read from the same Catalan MUC, so the parcel is correctly identified ' +
            'and the Art. 242.2 buildable-depth CONSTRUCTION would apply. But PRYZM has NOT verified, ' +
            "clau by clau, that Sant Boi's height, FAR and coverage match the Barcelona rule pack. " +
            'Reusing a Barcelona number here would be a confident mis-citation on another ' +
            "municipality's land, so PRYZM shows none rather than something wrong. " +
            SANT_BOI_PGM_SCOPE_FINDING +
            ' ' +
            SANT_BOI_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
