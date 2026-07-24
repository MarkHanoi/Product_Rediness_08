// Córdoba (INE 14021) — PGOU-2001 REFUSAL VOCABULARY + the VERIFICATION GATE.
//
// This is the Córdoba analogue of `esBarcelonaZoneClassification.ts`: a LEGAL classification table
// + the coverage-gap card, PLUS one thing Barcelona does not need — the machine-extraction
// VERIFICATION GATE. It produces no numbers. Its whole job is to let a Córdoba parcel return an
// HONEST, CITED refusal instead of a fabricated envelope, in three distinct situations:
//
//   1. THE VERIFICATION GATE (the one that matters most here). Every number in
//      `ES_CORDOBA_PGOU2001_PACK` is MACHINE-OCR'd and `pipeline-extracted-unverified` — no human
//      has checked it against the source. Until `sources/VERIFICATION.md` is signed, PRYZM must not
//      render ANY of those numbers, not even for a covered subzone (PAS-1…MC-4). The honest output
//      is `cordobaUnverifiedRefusal`, and `CORDOBA_ENVELOPE_VERIFIED` is the single flag that lifts
//      it. ⚠ A wrong number here is OUR pipeline's error (we OCR'd it), which is exactly why the
//      default is refusal (ProvenanceFlags.ts `pipeline-extracted-unverified`; §CONTEXT-DATA-HONESTY).
//
//   2. THE LEGALLY-GROUNDED "no" families (`cordobaZoneRefusalFor`). Some calificación families are a
//      cited "no envelope by a zone rule": their buildability is fixed by ANOTHER document PRYZM does
//      not hold. These would refuse even AFTER verification, because verifying the OCR of the packed
//      subzones says nothing about them.
//
//   3. THE COVERAGE GAP (`cordobaNoRulePackRefusal`). A privately-buildable Córdoba parcel with no
//      authored pack — the unbindable families and the ≈ one-in-ten pilot parcels that carry no
//      calificación in the join — plus the C60 §3 statement of the 2-district pilot scope.
//
// PURITY: L2-pure. Data + string builders. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — esCordobaPGOU2001.ts (WIRING-TODO), findings/ORDENANZA-PACK-SPEC.md §3/§4,
// C58 §1.2/§1.3/§1.4/§1.7a, C60 §3, ORDINANCE-EXTRACTION-PIPELINE.md §3, §CONTEXT-DATA-HONESTY.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/**
 * ⚠⚠⚠ THE HONESTY GATE. `false` until a human signs `sources/VERIFICATION.md` (pack WIRING-TODO 3)
 * AND that sign-off is mirrored in a C23 AIArtefact `humanApproval` (no-silent-graduation).
 *
 * While this is `false`, `applyCordobaZoningThenFallback` dispatches `cordobaUnverifiedRefusal` for
 * EVERY Córdoba parcel and no numeric envelope is ever produced — the machine-extracted numbers in
 * `ES_CORDOBA_PGOU2001_PACK` stay LABELS the pack self-describes with, never values a user sees.
 *
 * ⚠ FLIPPING THIS TO `true` IS A LEGAL ACT, NOT A CODE CHANGE. It asserts that a Spanish-planning-
 * literate human has checked every value in OCR-EXTRACTION-RESULTS.md §2 against the source crop.
 * Do not flip it to make a demo work.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (CORDOBA_ENVELOPE_VERIFIED)`
 * compute branch is not narrowed away as dead code while the gate is closed.)
 */
export const CORDOBA_ENVELOPE_VERIFIED: boolean = false;

/** The instrument every Córdoba refusal that makes a claim about the law cites. */
export const CORDOBA_PGOU_INSTRUMENT_REF =
    'PGOU-Córdoba-2001 (Plan General de Ordenación, Texto Refundido Oct. 2002), Gerencia de ' +
    'Urbanismo, Ayuntamiento de Córdoba. Calificación source: COACo GeoServer `coaco:ordenanzas`.';

/**
 * C60 §3 — the honest one-line statement of WHAT PRYZM covers in Córdoba and its limits, kept
 * beside the copy that cites it so the two cannot drift. Names the 2-district pilot scope AND the
 * machine-extracted-unverified status, because both bound the promise.
 */
export const CORDOBA_ROADMAP_LINE =
    'Córdoba coverage today: the PGOU-2001 ordenanzas for the SUR and NOROESTE districts only — a ' +
    '2-district pilot (COACo `coaco:distritos` has exactly two features, ≈ the historic centre), ' +
    'NOT the whole municipality. And every value in it is machine-read (OCR) from the scanned ' +
    'ordinance PDFs and NOT yet human-verified, so PRYZM publishes no buildable figure for any ' +
    'Córdoba parcel until that verification is signed. Outside the two districts, a click falls ' +
    'back to the national SIU land classification, never a borrowed pilot number.';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// (2) THE LEGALLY-GROUNDED "no" FAMILIES — `refusalFor`
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠ THE FAMILY KEYS ARE A FORWARD CONTRACT, now set to the LIVE COACo tokens. The dispatcher
// resolves a `subzone` from `coaco:ordenanzas.link` basename + the `ordenanza` family name (pack
// WIRING-TODO 5, `resolveCordobaSubzone`). The tokens below were GUESSED in the first commit; they
// are now the values the CORDOBA-DATA-RECON-SPIKE §3a / CORDOBA-ORDINANCE-REGISTRY confirmed against
// the live layer — `Uso Comercial`/`O_COMERCIAL`, `CTP1-Campo de la Verdad`/`O_PTC`, `Elemento
// protegido`/`O_EP` — plus the `subzoneCodeFromLink` parse of each (`O_PTC`→`PTC`, …) so the
// classifier matches whichever form the resolver hands it. Because the VERIFICATION GATE refuses the
// whole pilot today, nothing routes through here in production yet — but the classification is
// correct and permanent: these families refuse even AFTER the packed subzones are verified, because
// their envelope lives in a document PRYZM does not hold.

/** The article-attributable part of a refusal — everything EXCEPT the per-parcel `knownFacts`. */
type ClassifiedRefusal = Omit<EnvelopeRefusal, 'knownFacts'>;

interface FamilyClassification {
    /** The COACo `ordenanza` / `O_*` tokens this row covers (forward contract; see note above). */
    readonly ordenanzas: readonly string[];
    readonly refusal: ClassifiedRefusal;
}

const FAMILY_CLASSIFICATIONS: readonly FamilyClassification[] = [
    // CTP1-Campo de la Verdad — the envelope is defined in the Conjunto Histórico **Tomo VI**, a
    // document PRYZM does not hold. Only its parcelación borrows from CTP; the buildability does not.
    {
        // Live COACo tokens (recon §3a): family `CTP1-Campo de la Verdad`, link `O_PTC.pdf` → `PTC`.
        ordenanzas: ['CTP1-Campo de la Verdad', 'O_PTC', 'PTC'],
        refusal: {
            code: 'derived-plan',
            headline:
                'Campo de la Verdad (CTP-1) — buildability is fixed by the Conjunto Histórico ' +
                'special plan (Tomo VI), which PRYZM does not hold.',
            detail:
                'This parcel’s calificación borrows the CTP-1 parcelación, but its buildable ' +
                'envelope is NOT the CTP-1 zone rule: the PGOU delegates it to the Conjunto ' +
                'Histórico ordination (Tomo VI), a per-ámbito document PRYZM has not ingested. ' +
                'There is no generic zone parameter to apply, and inventing one would manufacture ' +
                'a number the ordinance does not contain.',
            ordinanceRef:
                'PGOU-Córdoba-2001, CTP-1 (Colonia Tradicional Popular) → Conjunto Histórico, ' +
                'Tomo VI. ' + CORDOBA_PGOU_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // Uso Comercial — a USE overlay, not a form zone: it defers to the underlying calificación or a
    // Plan Parcial for the envelope. There is no single commercial envelope to state.
    {
        // Live COACo tokens (recon §3a): family `Uso Comercial`, link `O_COMERCIAL.pdf` → `COMERCIAL`.
        ordenanzas: ['Uso Comercial', 'O_COMERCIAL', 'COMERCIAL'],
        refusal: {
            code: 'derived-plan',
            headline:
                'Uso Comercial — a use overlay with no envelope of its own; it defers to the ' +
                'underlying zone or a Plan Parcial.',
            detail:
                'The commercial qualification governs USE, not building form: the PGOU sets the ' +
                'buildable envelope from the underlying calificación or from an approved Plan ' +
                'Parcial for the sector, a different document per site. PRYZM holds no single ' +
                'commercial envelope to encode and refuses rather than borrow one from a ' +
                'neighbouring zone.',
            ordinanceRef:
                'PGOU-Córdoba-2001, Uso Comercial (overlay → underlying zone / Plan Parcial). ' +
                CORDOBA_PGOU_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // Elemento protegido — a preservation regime. The "envelope" is the EXISTING building fixed by
    // the Catálogo de protección, not a new development entitlement. A refusal, never a pack.
    {
        // Live COACo tokens (recon §3a): family `Elemento protegido`, link `O_EP.pdf` → `EP`.
        ordenanzas: ['Elemento protegido', 'O_EP', 'EP'],
        refusal: {
            code: 'derived-plan',
            headline:
                'Elemento protegido — a preservation regime; the buildable envelope is the ' +
                'existing protected building, fixed by the Catálogo, not a new entitlement.',
            detail:
                'This parcel carries a protected element (Catálogo de protección). Its allowable ' +
                'building form is the existing structure under the preservation ordination, not a ' +
                'zone-parameter envelope, so there is no new buildable volume to compute. PRYZM ' +
                'declines rather than draw a development envelope the preservation regime forbids.',
            ordinanceRef:
                'PGOU-Córdoba-2001, Catálogo — Elemento protegido (régimen de protección). ' +
                CORDOBA_PGOU_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
];

/** ordenanza-token → refusal. Built once; asserts disjointness at module load. */
const FAMILY_REFUSALS_BY_ORDENANZA: ReadonlyMap<string, ClassifiedRefusal> = (() => {
    const m = new Map<string, ClassifiedRefusal>();
    for (const c of FAMILY_CLASSIFICATIONS) {
        for (const o of c.ordenanzas) {
            if (m.has(o)) {
                throw new Error(
                    `[site-parcel-data] Córdoba ordenanza "${o}" is classified twice — two legal ` +
                        'reasons for the same family is a transcription error.',
                );
            }
            m.set(o, c.refusal);
        }
    }
    return m;
})();

/** The ordenanza tokens this table refuses on legal grounds. Exported for tests + the future resolver. */
export const CORDOBA_LEGALLY_REFUSED_ORDENANZAS: readonly string[] = [
    ...FAMILY_REFUSALS_BY_ORDENANZA.keys(),
];

/**
 * The registry `refusalFor`: the refusal for a Córdoba subzone whose family has a cited LEGAL reason
 * for having no zone envelope, or `null` if this table makes no such claim (then the coverage-gap
 * `noRulePackRefusal` answers). `null` never means "buildable" — it means this table is silent.
 *
 * ⚠ Uso Industrial (`O_INDUSTRIAL`; subzone-unbindable, ocupación DERIVED) and Unifamiliar Aislada
 * (`O_UAS1`; its ordinance content is RECOVERED — CORDOBA-ORDINANCE-REGISTRY §6 — but a pilot parcel
 * still cannot be bound to a UAS-1..6 subzone: the calificación gives the family name only) are
 * deliberately NOT here: those are COVERAGE gaps, not legal "no"s, so they fall through to
 * `noRulePackRefusal` — filing them as legal classifications would assert the ordinance refuses an
 * envelope on land that is in fact buildable (the false-negative-about-someone's-land error).
 */
export function cordobaZoneRefusalFor(
    subzone: string,
    _harmonisedCode?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal | null {
    const row = FAMILY_REFUSALS_BY_ORDENANZA.get(subzone);
    if (!row) return null;
    return { ...row, knownFacts: [...knownFacts] };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// (3) THE COVERAGE-GAP CARD — `noRulePackRefusal`
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The registry `noRulePackRefusal`: the card shown on a privately-buildable Córdoba parcel PRYZM has
 * no pack for — the unbindable families (Uso Industrial, Unifamiliar Aislada) and the ≈ one-in-ten
 * pilot parcels with a blank ordenanza — stating the 2-district pilot scope (C60 §3).
 *
 * ⚠ `legallyGrounded: false` and `ordinanceRef: null` — a statement about PRYZM's coverage, never
 * about the law. Rendering it as a legal "no envelope" would tell an owner their buildable plot
 * cannot be built on (the worst error in the set — a false negative about their land).
 */
export function cordobaNoRulePackRefusal(
    subzone: string,
    subzoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const named =
        subzoneLabel && subzoneLabel.trim()
            ? `${subzoneLabel.trim()} (${subzone})`
            : subzone && subzone.trim()
              ? subzone
              : 'this parcel';
    return {
        code: 'no-rule-pack',
        headline: `${named} — PRYZM has no buildable-envelope rule for this Córdoba parcel yet.`,
        detail:
            'This is a coverage gap, not an error. Either the parcel carries no calificación in ' +
            'the COACo join, or its family (e.g. Uso Industrial, Unifamiliar Aislada) is one the ' +
            'pilot deliberately does not pack — its subzone cannot be bound, or its content is in ' +
            'a document PRYZM does not hold. A generic setback estimate would be a number the ' +
            'ordinance does not contain, so PRYZM shows none rather than something wrong. ' +
            CORDOBA_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// (1) THE VERIFICATION GATE — `cordobaUnverifiedRefusal` (the honesty gate the dispatcher enforces)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE HONESTY-GATE refusal: shown for EVERY Córdoba parcel — including one in a fully-PACKED subzone
 * (PAS-1…MC-4) — while `CORDOBA_ENVELOPE_VERIFIED` is false. It is what makes "the pack is registered
 * but renders no number" TRUE.
 *
 * ⚠ Distinct from the coverage gap on purpose: here PRYZM DOES hold machine-read rules for the
 * subzone, so "we have not encoded this zone" would be false. What it lacks is a HUMAN who has
 * verified the OCR against the source — a wrong number would be OUR pipeline's error. So it states
 * exactly that, and withholds the number until sign-off.
 *
 * `code: 'no-rule-pack'`, `legallyGrounded: false`, `ordinanceRef: null` — a statement about PRYZM's
 * verification status, never about the law. (The enum carries no dedicated `unverified` code; this
 * is the honest fit and the copy carries the precise meaning.)
 */
export function cordobaUnverifiedRefusal(
    subzone?: string | null,
    subzoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const zone =
        subzoneLabel && subzoneLabel.trim()
            ? `${subzoneLabel.trim()}${subzone ? ` (${subzone})` : ''}`
            : subzone && subzone.trim()
              ? subzone
              : 'this Córdoba parcel';
    return {
        code: 'no-rule-pack',
        headline:
            `${zone} — PRYZM has machine-read this zone's rules from the ordinance, but no human ` +
            'has verified them yet, so it will not publish a figure.',
        detail:
            'PRYZM extracted the PGOU-2001 parameters for this zone by OCR from the scanned ' +
            'ordinance PDFs. Those values are MACHINE-EXTRACTED and UNVERIFIED ' +
            '(pipeline-extracted-unverified): no Spanish-planning-literate reviewer has yet checked ' +
            'them against the source. Because a wrong number here would be PRYZM’s own extraction ' +
            'error — not the publisher’s — PRYZM withholds the figure until that human verification ' +
            'is signed off, rather than render an unchecked buildable envelope. ' +
            CORDOBA_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
