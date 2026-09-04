// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-NATIONAL-REGISTRATION (lane ENVELOPE-IBERIA, 2026-09-04) — PORTUGAL, REGISTERED.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠⚠ THE DEFECT THIS CLOSES, MEASURED ON THIS BRANCH RATHER THAN FEARED.
// -----------------------------------------------------------------------------------------
// Portugal appeared in NO row of `registry.ts` `REGISTRATIONS`. That is not a coverage gap; it is
// the §L-663 FABRICATION defect, live over the whole country:
//
//   `apps/editor/src/ui/site/siteDispatch.ts` → `applyEstimatedZoning`
//     → `refuseEstimateInsideRegisteredJurisdiction`
//        → `resolveRegisteredJurisdictionAt(lat, lon)` → `{ kind: 'none' }`
//        → `return false`  // "genuinely uncovered land — the estimate is honest here"
//     → `dispatchEnvelope(…, 'estimated-default')`
//
// so a click anywhere on Portuguese soil published the GENERIC ESTIMATED TRIPLE — 3,0 / 1,5 / 3,0 m
// setbacks, FAR 2,00, coverage 50 % — on land PRYZM has read no article about. That is the exact
// defect §L-663 was written for, the exact defect the Balears registration closed for Mallorca
// (`esBalearsMuib.ts`, L-680) and the Telde registration closed for Gran Canaria (§L-663 again),
// and it stood unaddressed for the whole of MAINLAND Portugal (~89 100 km²; PORTUGAL_BBOX is the
// Continente routing constant, so the Açores and Madeira are outside this registration too).
//
// It stood unaddressed even though the Portuguese chain was BUILT: `countryAdapters/pt/` resolves a
// real CRUS zone identity live, and `ptPortoPdmDraft.ts` carries a founder-SIGNED, article-pinned
// transcription of the Porto PDM. None of it was REACHABLE from the estimate chokepoint, because
// the chokepoint asks the REGISTRY and the registry had never heard of Portugal
// (§committed-is-not-reachable — four fixes in one session that ran nowhere).
//
// MEASURED BEFORE (2026-09-03, `tools/envelope-slot-coverage/measurePt.ts --frame both --n 120`):
// `resolveRegisteredJurisdictionAt` returned `'none'` for **120 / 120** probed Portuguese points —
// every one of them exposed to the triple. See `out/pt.slots.md`.
//
// ── WHAT THIS REGISTRATION IS, AND WHAT IT IS NOT ────────────────────────────────────────────
// It is the Catalonia/Balears shape: `packsByZone` EMPTY BY CONSTRUCTION, `noRulePackRefusal`
// carrying a CITED statement of what actually governs the land and what PRYZM does not yet hold.
// It delivers ANSWER CORRECTNESS, not envelope coverage. Portugal has 308 municípios, each with
// its own PDM regulamento; there is no shared national instrument to transcribe, so no national
// pack can ever exist here and `packsByZone` is empty for the same reason Catalonia's is.
//
// ⛔ REGISTRATION IS NOT AUTHORISATION. This id is listed in
// `envelopeAuthorisation.ts` → `UNGATED_AUTHORISED_JURISDICTIONS` on the CÓRDOBA-MUNICIPAL
// precedent — *"publishes refusals only; it carries no numeric envelope to authorise"* — NOT
// because anyone signed anything. The moment a Portuguese pack exists it gets its OWN gate at its
// OWN registration at `extentResolution: 'municipal'`, which out-ranks this one by §JURISDICTION-SPECIFICITY.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-SPILL-CLOSED-BY-POLYGON — and why this registration does NOT route on the bbox alone.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `PORTUGAL_BBOX` is 36.9–42.2 °N × −9.6–−6.1 °E. A rectangle cannot follow the Raia, so it claims
// a wide band of SPAIN — Ourense, Zamora, Salamanca, Cáceres, Badajoz, Huelva. Registering
// Portugal on the bbox alone would have been a REGRESSION for Spain and not merely a wrong
// citation: `refuseEstimateInsideRegisteredJurisdiction` runs BEFORE `applySiuGuardedEstimate`, so
// a Portuguese claim over Extremadura would have SUPPRESSED Spain's own SIU land-class guard
// (§ES-SIU-GUARD, demo gap G5) and answered Spanish land with a Portuguese instrument.
//
// `registry.ts`'s own §EXTENT-SPILLS-A-BORDER paragraph says this cannot be fixed because *"PRYZM
// holds no municipal or national boundary geometry, and inventing one is the fabrication this
// whole subsystem exists to refuse."* ⭐ **THAT PARAGRAPH IS NOW STALE.** Lane BOUNDARY-WAVE landed
// `packages/site-parcel-data/src/jurisdiction/data/nationalBoundaries.json` — real, licensed,
// sha256-pinned national polygons for 26 countries including **PRT (17 rings)** — and
// `resolveNationalJurisdiction()` is a PURE, synchronous, never-throwing point-in-polygon walk with
// a MEASURED positional tolerance (1500 m) that REFUSES inside it rather than guessing a side.
// Nothing is invented: the geometry is a cited dataset, and the refusal band is measured.
//
// So this registration's `contains` is the CONJUNCTION — bbox pre-filter AND the polygon claiming
// `PRT`. The spill is closed by DATA, exactly as the header said a fix would have to be.
//
// ⚠ THE MEASURED, DELIBERATE HOLE, recorded so it is not mistaken for solved: inside 1500 m of the
// Spanish border (and beyond the 2000 m coastal tolerance out to sea) the resolver REFUSES, so this
// registration does not claim, so such a point still reaches `applyEstimatedZoning`. That is
// UNCHANGED behaviour, not a new hole — and it is the right trade: a 1.5 km strip keeps the
// estimate it already had, while the rest of the Continente stops being fabricated over. Closing the strip needs
// finer boundary geometry, not a wider rectangle.
//
// PURITY: L2-pure. Data + pure lookups. No I/O.
//
// Strategic context — C58 §1.5 (a new jurisdiction is a DATA addition, never an engine edit),
// C63 (the ENVELOPE axis), §L-663, L-680 (Balears), `docs/04-reference/jurisdictions/pt/NEXT.md`.

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { isInPortugal } from '../parcelProviders/dgtParcelProvider.js';
import { resolveNationalJurisdiction } from '../jurisdiction/nationalJurisdictionResolver.js';

/** The national Portuguese registration id. Mirrors `nl-bestemmingsplan`'s instrument-named shape. */
export const PT_PDM_JURISDICTION_ID = 'pt-pdm';

/**
 * ⛔ §EXTENT-CLAIM-TOTALITY (L-677) — WHY THIS IS **NOT** `PORTUGAL_BBOX`.
 *
 * `registeredExtentTotality.test.ts` enforces one invariant over the whole registry: **a
 * registration may never ADVERTISE more land than it CLAIMS.** `extent` is what the C60 §2
 * coverage globe DRAWS; `contains` is what the §L-663 chokepoint ASKS. If `contains` is TIGHTER
 * than `extent`, a point inside the drawn box is unclaimed, `resolveRegisteredJurisdictionAt`
 * answers `'none'`, and `applyEstimatedZoning` publishes the generic triple — the Córdoba hole,
 * silently.
 *
 * Every other registration escapes the question by making `extent` and `contains` the same
 * rectangle. This one cannot: its predicate is a POLYGON, so `PORTUGAL_BBOX` would advertise the
 * Atlantic (its SW corner 36.9,−9.6 is open ocean) and a wide band of Spain, neither of which the
 * predicate claims. That is exactly the forbidden direction.
 *
 * ⭐ SO THE BOX IS NARROWED, WHICH THE TEST'S OWN TEXT SANCTIONS: *"The opposite direction
 * (`contains` wider than `extent`) is NOT tested as a failure here: it costs one extra cited
 * refusal on land the globe did not advertise, which is the safe sign."* This box is the largest
 * axis-aligned rectangle found INSIDE the Portuguese national polygon by a search whose every
 * candidate was verified on a **61 × 61 = 3 721-point lattice** (the totality test samples 121).
 * `contains` still claims the whole country, so nothing is left unclaimed — the globe simply
 * under-draws.
 *
 * ⚠ THE COST, STATED: the globe draws the INLAND SPINE of Portugal and NOT Lisboa or Porto,
 * because no axis-aligned rectangle can hold either coastal city without also holding sea. That is
 * a globe-rendering loss, not a coverage loss — both cities are claimed by `contains` and both are
 * pinned in `ptNationalRegistration.test.ts`. Fixing it properly means teaching `JurisdictionExtent`
 * to carry a polygon (or a list of boxes), which is a registry-wide change this lane does not own;
 * it is REPORTED rather than worked around.
 */
export const PT_NATIONAL_EXTENT = {
    minLat: 37.7,
    maxLat: 41.5,
    minLon: -8.5,
    maxLon: -7.6,
};

/**
 * PURE: does the national boundary dataset claim this point for **Portugal**?
 *
 * The bbox is asked first only because it is cheap; the POLYGON decides, and a refusal (border
 * tolerance, offshore, ambiguous) is a NO. "We cannot say which country this is" must never become
 * "Portugal", which is precisely the direction §EXTENT-SPILLS-A-BORDER fails in.
 */
export function isInPortugalByBoundary(lat: number, lon: number): boolean {
    if (!isInPortugal(lat, lon)) return false;
    const v = resolveNationalJurisdiction(lat, lon);
    return v.ok && v.iso3 === 'PRT';
}

/**
 * What the entry UI may honestly promise in Portugal. Every clause is a MEASURED fact from
 * `docs/04-reference/jurisdictions/pt/` — nothing here is aspirational.
 */
export const PT_NATIONAL_ANSWER_SUMMARY =
    'Everywhere on mainland Portugal, PRYZM resolves the planning qualification of your point live ' +
    'from the DGT\'s national CRUS (Carta do Regime de Uso do Solo) — the classificação e ' +
    'qualificação do solo in the PDM\'s own Planta de Ordenamento wording, the município, the PDM\'s ' +
    'publication date and its registo/depósito reference. PRYZM publishes NO buildable figure here: ' +
    'Portugal\'s numeric parameters (índice de edificação, cércea, profundidade, afastamentos) are ' +
    'set by each of the 308 municípios\' own PDM regulamento, as PDFs — there is no national ' +
    'structured source, and CRUS itself carries no numeric column. Every parcel therefore receives a ' +
    'refusal that NAMES the instrument governing that land, never an estimate.';

/**
 * The coverage-gap refusal for any Portuguese zone no pack answers for.
 *
 * ⚠ `legallyGrounded: false` — this is a statement about PRYZM'S COVERAGE, not about the law. The
 * ordinance almost certainly DOES grant an envelope on «Solo Urbano – Espaços centrais»; we have
 * simply not transcribed that município's regulamento. Marking it `true` would tell a user the law
 * forbids building on their perfectly buildable plot, which is the inversion `registry.ts`'s
 * three-outcome header exists to forbid.
 *
 * ⚠ It states no number and cites no article, because at national granularity there is none to
 * cite: `ordinanceRef` names the LEVEL at which Portuguese envelopes are set, which is a true
 * statement about the legal system and not a citation dressed up as one.
 */
export function ptNationalNoRulePackRefusal(
    zoneCode: string,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const named = (zoneLabel ?? zoneCode ?? '').trim();
    return {
        code: 'no-rule-pack',
        headline: 'Portugal — the governing PDM is identified; its numbers are not yet encoded.',
        detail:
            (named.length > 0
                ? `This parcel is qualified «${named}» in its município's Plano Diretor Municipal, `
                : 'This parcel is qualified by its município\'s Plano Diretor Municipal, ') +
            'read live from the DGT national CRUS. In Portugal the buildable parameters — índice de ' +
            'edificação, cércea, profundidade máxima and afastamentos — are set article by article in ' +
            'that município\'s own PDM regulamento, published as a PDF; CRUS serves the qualification ' +
            'but carries no numeric column, and there is no national structured equivalent. PRYZM has ' +
            'not transcribed this município\'s regulamento, so it declines to state a figure rather ' +
            'than estimate one.',
        ordinanceRef:
            'Regime Jurídico dos Instrumentos de Gestão Territorial (DL 80/2015) + DR 15/2015 — ' +
            'buildable parameters are set by the municipal PDM regulamento, not by any national ' +
            'instrument. Qualification source: DGT CRUS (Carta do Regime de Uso do Solo).',
        knownFacts: [...knownFacts],
        legallyGrounded: false,
    };
}
