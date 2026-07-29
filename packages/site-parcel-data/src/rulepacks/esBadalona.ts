// Envelope Phase 2 (cont.) — Badalona (INE 08015): the THIRD Catalan municipality.
// Mirrors esLHospitalet.ts exactly. Same AMB fabric, same instrument (PGM-1976), same Catalonia-wide
// MUC zone source (S3) as Barcelona + L'Hospitalet — so the router predicate (S2, `badalonaBbox.ts`),
// this registration (S5) and one dispatcher branch (L5) are the whole engineering cost.
//
// ⚠⚠⚠ THE HONESTY GATE IS THE POINT. "Same instrument" is NOT "same numbers". The Art. 242.2
// buildable-DEPTH construction is metropolitan (derives depth from the real cadastral block), so its
// GEOMETRY would transfer. But NOT metropolitan / NOT verified for Badalona: (1) WHICH claus appear
// here + whether each maps to Barcelona's rule shape (Badalona layers its own *modificacions* over
// the PGM); (2) the HEIGHT tables (*alçada reguladora*) + *ample oficial* street widths Barcelona's
// packs key on — those are `es-08019-barcelona` data. Reusing `ES_BARCELONA_ENSANCHE_PACK` here would
// stamp Barcelona's jurisdiction id, height table + citations onto Badalona land — a confident
// MIS-CITATION, the exact harm §CONTEXT-DATA-HONESTY forbids.
//
// ⇒ Until a Spanish-planning-literate human verifies (per clau) that Badalona's numbers + geometry
//    equal Barcelona's — and signs `sources/VERIFICATION.md` — `BADALONA_ENVELOPE_VERIFIED` is
//    `false` and the dispatcher renders a CITED REFUSAL for every Badalona parcel, never a borrowed
//    Barcelona envelope. Same discipline as L'Hospitalet + Córdoba.
//
// PURITY: L2-pure. Data + string builders. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — ENVELOPE-REPLICATION-STANDARD.md, ENVELOPE-IMPLEMENTATION-PLAN.md §1 Phase 2,
// C58 §1.2/§1.4/§1.5/§1.7a, C60 §3, ADR-0271 (Art. 242.2), §CONTEXT-DATA-HONESTY.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/** The jurisdiction id Badalona uses — the INE municipal code (playbook §2, folder identity). */
export const BADALONA_JURISDICTION_ID = 'es-08015-badalona';

/**
 * ⚠⚠⚠ THE HONESTY GATE. `false` until a human verifies — PER CLAU — that Badalona's zoning
 * parameters (depth rule shape, height table, FAR, coverage) genuinely equal the Barcelona pack they
 * would reuse, and signs `sources/VERIFICATION.md` (mirrored in a C23 AIArtefact `humanApproval`).
 *
 * While `false`, `applyBadalonaZoningThenFallback` dispatches `badalonaUnverifiedRefusal` for EVERY
 * Badalona parcel and no numeric envelope is produced. Router + registration + dispatcher are all
 * WIRED + reachable — that is what Phase 2 proves — but the ANSWER is an honest cited refusal.
 *
 * ⚠ FLIPPING THIS TO `true` IS A LEGAL ACT, NOT A CODE CHANGE (see esLHospitalet.ts for the exact
 * checklist: confirm claus + rule shape via MUC + the municipal *text refós*; source Badalona's own
 * height/street-width tables; author an `es-08015-badalona` pack cited to Badalona). Do NOT flip it
 * to make a demo work.
 *
 * (Typed `boolean`, not the literal `false`, so a `if (BADALONA_ENVELOPE_VERIFIED)` compute branch is
 * not narrowed away as dead code while the gate is closed.)
 */
export const BADALONA_ENVELOPE_VERIFIED: boolean = false;

/** The instrument every Badalona refusal that makes a claim about the law cites. */
export const BADALONA_PGM_INSTRUMENT_REF =
    'PGM-1976 (Pla General Metropolità de Barcelona, aprovat definitivament 14-07-1976), the ' +
    'metropolitan instrument governing Badalona, as consolidated by the municipality\'s own ' +
    '*modificacions puntuals* (Ajuntament de Badalona). Zoning (clau) source: Generalitat de ' +
    'Catalunya MUC (Mapa Urbanístic de Catalunya).';

/**
 * C60 §3 — the honest one-line statement of WHAT PRYZM covers in Badalona and its limits, kept
 * beside the copy that cites it so the two cannot drift.
 */
export const BADALONA_ROADMAP_LINE =
    'Badalona coverage today: the jurisdiction is ROUTED (its parcels resolve their clau from the ' +
    'same Catalan MUC as Barcelona, and the metropolitan PGM-1976 Art. 242.2 depth construction ' +
    'applies here as across the AMB), but PRYZM has NOT yet verified that any individual clau\'s ' +
    'numbers — height, FAR, coverage — equal Barcelona\'s, and the *alçada reguladora* / official-' +
    'street-width tables are municipality-specific. Rather than borrow a Barcelona figure onto ' +
    'Badalona land, PRYZM shows a cited refusal until that per-clau verification is signed. Points ' +
    'outside this municipality fall back to their own jurisdiction, never to a borrowed Badalona number.';

/**
 * THE HONESTY-GATE refusal: shown for EVERY Badalona parcel while `BADALONA_ENVELOPE_VERIFIED` is
 * false. `code: 'no-rule-pack'`, `legallyGrounded: false`, `ordinanceRef: null` — a statement about
 * PRYZM's verification status, NOT about the law (the PGM DOES grant an envelope here; PRYZM has
 * simply not verified it may reuse Barcelona's transcription of it). Same shape as L'Hospitalet.
 */
export function badalonaUnverifiedRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const zone =
        zoneLabel && zoneLabel.trim()
            ? `${zoneLabel.trim()}${zoneCode ? ` (clau ${zoneCode})` : ''}`
            : zoneCode && zoneCode.trim()
              ? `clau ${zoneCode}`
              : 'this Badalona parcel';
    return {
        code: 'no-rule-pack',
        headline:
            `${zone} — PRYZM routes Badalona and shares Barcelona's metropolitan ordinance, but has ` +
            "not yet verified that this zone's numbers equal Barcelona's, so it will not publish a figure.",
        detail:
            'Badalona is governed by the same metropolitan plan as Barcelona (PGM-1976) and its zoning ' +
            'is read from the same Catalan MUC, so the parcel is correctly identified and the Art. 242.2 ' +
            'buildable-depth CONSTRUCTION would apply. But PRYZM has NOT verified, clau by clau, that ' +
            "Badalona's height, FAR and coverage match the Barcelona rule pack — and Barcelona's " +
            '*alçada reguladora* and official-street-width tables are Barcelona\'s own, not Badalona\'s. ' +
            'Reusing a Barcelona number here would be a confident mis-citation on another ' +
            'municipality\'s land, so PRYZM shows none rather than something wrong. ' + BADALONA_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
