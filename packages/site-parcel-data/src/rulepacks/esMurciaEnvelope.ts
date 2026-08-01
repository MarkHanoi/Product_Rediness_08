// ── Murcia (INE 30030) — the CITED-REFUSAL jurisdiction. ─────────────────────────────────
//
// WHAT PRYZM CAN AND CANNOT SAY ABOUT A MURCIA PARCEL TODAY (measured 2026-07-31)
// ------------------------------------------------------------------------------
// CAN (all VERIFIED live, via the national Catastro path that already routes here):
//   • the referencia catastral, by identifier join — not by a pin guess
//   • the official parcel geometry + the OFFICIAL registry area (INSPIRE `cp:areaValue`)
//   • the INE municipality, composed from Catastro's own `<cp>`+`<cm>` — routed from the
//     DATA, never from a caller-supplied country
//   • existing buildings: footprints + floors above/below ground (INSPIRE
//     `bu-ext2d:numberOfFloorsAboveGround`, the "ALTURAS" input), or a corroborated VACANT
//
// ⚠ THIS HEADER WAS STALE AND IS NOW CORRECTED. It used to say "PRYZM holds NO transcribed
// Murcia ordinance — no zoning layer has been located on a municipal GIS". BOTH halves of
// that are false as of 2026-08-01:
//   • the municipal GeoServer IS located and IS read live at the point (`resolveMurciaZoning`
//     → `/api/es/murcia-pgou`), giving calificación + ámbito + clase de suelo + validity;
//   • the PGOU *Normas Urbanísticas* (Texto Refundido diciembre 2012) HAVE been sourced and
//     transcribed — see `esMurciaPgou2012.ts`, 14 zones with article + verbatim quote.
//
// CANNOT, still: publish a buildable number. For two different reasons, and keeping them
// apart is the whole point:
//   (a) on land the PGOU orders DIRECTLY, the numbers exist but the TRANSCRIPTION IS UNSIGNED
//       (`MURCIA_ENVELOPE_VERIFIED` is false). A coverage statement about PRYZM.
//   (b) on land the PGOU DELEGATES — measured at 67.0 % of the 75.145 km² of private buildable
//       land — the general plan is the WRONG INSTRUMENT and no signature changes that. A legal
//       statement, and the one that caps this city.
//
// ⇒ THE HONEST OUTPUT IS A CITED REFUSAL, AND THAT IS A SHIPPABLE ANSWER, NOT A GAP.
// The ratified position is *"100 % of parcels get either a computed envelope or a legally-
// cited refusal"*. Barcelona already ships refusals for clau 18 on exactly this reasoning.
//
// ⚠⚠ DO NOT "FILL IN" A NUMBER HERE TO MAKE A DEMO LOOK BETTER. L-616 shipped a massing
// that ignored a FAR ceiling (~5× over) and drew an unknown setback as ZERO. A competitor
// screening report on this same parcel published an edificabilidad of ~262 m² openly
// labelled a *"proxy PGOU — verificar ficha"*; an UNCITED number from PRYZM would be worse
// than their proxy, not better, because it would claim a rigour we have not earned.
// UNKNOWN ≠ 0 and UNKNOWN ≠ a permissive default.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/** The jurisdiction id Murcia records and registrations use. One constant, not a literal. */
export const MURCIA_JURISDICTION_ID = 'es-30030-murcia';

/**
 * Is a signed, transcribed Murcia envelope rule pack available?
 *
 * ✍ **SIGNED — founder (repo owner), 2026-08-01.** The L-449 gate is a legal act and it has
 * been exercised: *"I sign up all: now"*, given after the measured coverage, the delegation
 * split and the badge precondition were put in front of the founder. The flip travels WITH the
 * signature, never ahead of it — recorded in
 * `docs/04-reference/jurisdictions/es/es-mc/30030-murcia/sources/VERIFICATION.md`.
 *
 * **WHAT THE SIGNATURE AUTHORISES** — publishing a computed envelope on the **23.51 %** of
 * Murcia's buildable land (denominator: 75.145 M m², L-656 — buildable land, not all land, not
 * clicks) where a packed calificación sits on NON-delegated soil, at confidence
 * `estimated-ruleset`, cited to the PGOU *Texto Refundido* dic-2012, Volumen 11.
 *
 * **WHAT IT DOES NOT AUTHORISE — equally binding:**
 * - the **67 %** delegated to partial plans: those keep their legally-grounded `derived-plan`
 *   refusal (Arts. 5.25.3.3 / 5.26.3.3 — a zonal code inside a delegating *ámbito* governs use
 *   and typology *«pero no a los parámetros definitorios de la altura o edificabilidad»*).
 *   ⚠ This includes the founder's own parcel `3481104XH6038S` (ámbito TA-379 → Plan Parcial
 *   CR-5). Signing does NOT unlock it, and a test pins that;
 * - the **11 calificaciones that refuse**, each already cited;
 * - promoting the tier above `estimated-ruleset`. ⚠ `authoritative` is UNREACHABLE — no
 *   production path assigns it, and a constructed determination is capped at 0.70 on ENVELOPE.
 *
 * **PRECONDITION DISCHARGED:** the C58 badge defect (`cf45531e`) is fixed — a pack's declared
 * confidence and its verification gate now REACH the user, so a signed pack can no longer
 * surface machine-read numbers under a chip that overstates them. Signing before that landed
 * would have made the screen LESS honest than refusing.
 *
 * ⚠ **KNOWN LIMIT ACCEPTED AT SIGNING (L-674):** the cited document is **not yet in the repo**
 * — `urbanismo.murcia.es` returns **HTTP 403** to automated requests (measured 2026-08-01; the
 * BCNROC pattern). The per-parameter verbatim quotes therefore cannot be re-read from
 * `corpus/pdf/` the way Barcelona's DOGC 4893 can. Founder is fetching it by hand.
 *
 * ⚠⚠ **DO NOT flip this back on a hunch.** Reverting is a legal act too: it withdraws a
 * published determination. Route a reversal through the founder, exactly as the flip was.
 */
export const MURCIA_ENVELOPE_VERIFIED = true as const;

/**
 * DERIVED-PLAN MARKERS observable in a Spanish cadastral address string.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────
 * GENOME TEST 01 (Madrid → València) §4.2 recorded the single most important structural
 * finding of the Spanish planning-genome work: **a layer-shaped discovery engine cannot
 * see an attribute-shaped concept.** Madrid publishes derived plans as a LAYER; València
 * publishes them as a FIELD VALUE (`origen`: PGOU | PE2020 | PRI1108 | PEPRI2076 …). The
 * recommendation was to build a *value-vocabulary classifier* before city #3.
 *
 * Murcia turns out to publish the same concept in a THIRD shape: inside the **cadastral
 * address string** returned by the national OVC reverse-geocode. The parcel
 * `3481104XH6038S` returns, verbatim:
 *
 *     PL U.A. 5ª DEL P.P. CR-5  P1 MURCIA (CHURRA) (MURCIA)
 *
 * — i.e. *Unidad de Actuación 5ª* of *Plan Parcial CR-5*. All five nearest parcels carry
 * the same marker. That is a routing signal available NATIONALLY, from a service PRYZM
 * already calls, for every Spanish municipality, with no municipal GIS at all.
 *
 * ── WHAT IT IS AND IS NOT ────────────────────────────────────────────────────────────
 * ⚠ This detects a STRING. It is evidence that a derived instrument is associated with the
 * parcel's address; it is **ASSERTED-UNVERIFIED**, not VERIFIED, that the instrument
 * governs the envelope. Establishing that needs the instrument itself. So it is used to
 * ENRICH a refusal — naming the document a user should look for — and NEVER to produce a
 * number or to upgrade a refusal to `legallyGrounded: true`.
 *
 * Prefix taxonomies (`PP`/`PE`/`PERI`/`PRI`/`UA`/`ED`/`MP`) are how Spanish planning
 * instruments are coded, so this generalises beyond Murcia — which is exactly the reusable
 * shape GENOME TEST 01 §B2 asked for.
 */
export interface DerivedPlanMarker {
    /** The instrument family abbreviation as written, e.g. `P.P.`, `U.A.`. */
    readonly kind: string;
    /** Human name of the family, in Spanish planning terms. */
    readonly family: string;
    /** The identifier that follows it, e.g. `CR-5`, `5ª`. Null when none was written. */
    readonly ref: string | null;
    /** The exact substring matched, so a reader can check the claim against the source. */
    readonly matched: string;
}

interface MarkerRule {
    readonly re: RegExp;
    readonly kind: string;
    readonly family: string;
}

/**
 * Ordered longest-first so `P.P.` is not swallowed by a looser pattern. Every family here
 * is a statutory Spanish instrument name, not a Murcia-specific token — the same discipline
 * `roles.ts` applies in `tools/spanish-genome-probe`.
 */
const MARKER_RULES: readonly MarkerRule[] = [
    { re: /\bP\.?\s?E\.?R\.?I\.?\s*([A-Z0-9ºª\-/]*)/i, kind: 'PERI', family: 'Plan Especial de Reforma Interior' },
    { re: /\bP\.?\s?E\.?\s*([A-Z0-9ºª\-/]*)/i, kind: 'PE', family: 'Plan Especial' },
    { re: /\bP\.?\s?P\.?\s*([A-Z0-9ºª\-/]*)/i, kind: 'PP', family: 'Plan Parcial' },
    { re: /\bU\.?\s?A\.?\s*([A-Z0-9ºª\-/]*)/i, kind: 'UA', family: 'Unidad de Actuación' },
    { re: /\bU\.?\s?E\.?\s*([A-Z0-9ºª\-/]*)/i, kind: 'UE', family: 'Unidad de Ejecución' },
    { re: /\bE\.?\s?D\.?\s*([A-Z0-9ºª\-/]*)/i, kind: 'ED', family: 'Estudio de Detalle' },
];

/**
 * Detect derived-plan markers in a cadastral address string. PURE; never throws.
 * Returns `[]` when the address names no instrument — which is the common case for ordinary
 * street addresses and is a real answer, not a failure.
 */
export function detectDerivedPlanMarkers(address: string | null | undefined): DerivedPlanMarker[] {
    if (!address || address.trim().length === 0) return [];
    const out: DerivedPlanMarker[] = [];
    const seen = new Set<string>();
    for (const rule of MARKER_RULES) {
        const m = address.match(rule.re);
        if (!m || m[0] == null) continue;
        const matched = m[0].trim();
        if (matched.length === 0) continue;
        const refRaw = m[1] ? m[1].trim() : '';
        // A bare "PE" inside a word is noise; require the match to sit on a token boundary
        // and to carry either punctuation or a reference.
        if (!/[.\s]/.test(matched) && refRaw.length === 0) continue;
        const key = `${rule.kind}:${refRaw}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            kind: rule.kind,
            family: rule.family,
            ref: refRaw.length > 0 ? refRaw : null,
            matched,
        });
    }
    return out;
}

/**
 * The roadmap line, stated once. Same role as `CORNELLA_ROADMAP_LINE`: the refusal card must
 * say what would change the answer, or the user cannot tell a coverage gap from a crash.
 */
export const MURCIA_ROADMAP_LINE =
    'Murcia coverage today: the PARCEL half is complete and live — the national Catastro path ' +
    'resolves the referencia catastral, the official boundary, the official area and the ' +
    'existing buildings with their floor counts, all keyless. The ZONING half is live too: ' +
    "Murcia's own municipal planning service is read at the point, giving the calificación, its " +
    'official designation, the ámbito, the land class and the record\'s validity interval — but ' +
    'it publishes no numeric buildable parameter as an attribute. The ENVELOPE half is where the ' +
    'limit sits, and it has two distinct halves of its own. For land the general plan orders ' +
    'DIRECTLY, the PGOU Normas Urbanísticas (Texto Refundido diciembre 2012) have now been ' +
    'sourced and transcribed article by article, and what is missing is only the human signature ' +
    'on that transcription. For land the general plan DELEGATES — measured at two thirds of ' +
    "Murcia's private buildable area — no signature helps: the governing document is the partial " +
    'plan, the PERI or the estudio de detalle named for that ámbito, and PRYZM does not hold it. ' +
    'That is why a parcel inside a Plan Parcial stays a refusal even after the general plan is ' +
    'signed off.';

/**
 * THE HONESTY-GATE refusal: returned for EVERY Murcia parcel while
 * `MURCIA_ENVELOPE_VERIFIED` is false.
 *
 * `code: 'no-rule-pack'` + `legallyGrounded: false` + `ordinanceRef: null` — a statement
 * about PRYZM's COVERAGE, not about the law. This distinction is load-bearing and must not
 * be softened: the ordinance almost certainly DOES grant an envelope on this urban land, so
 * claiming a legal "no" would tell the owner of a perfectly buildable plot that the law
 * forbids building on it. That is the opposite error, and it is worse.
 *
 * It is NOT `source-data-unavailable` either: nothing failed to fetch. Catastro answered
 * completely. Stamping a transient code here would offer a RETRY affordance that could
 * never succeed, because no number of retries transcribes an ordinance (the L-574 /
 * §L-590c reasoning).
 *
 * @param derivedPlans markers found in the parcel's cadastral address (see
 *        `detectDerivedPlanMarkers`). Purely additive: they sharpen the prose and name the
 *        document to look for. They NEVER add a number and never change `legallyGrounded`.
 */
export function murciaNoRulePackRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
    derivedPlans: readonly DerivedPlanMarker[] = [],
): EnvelopeRefusal {
    const zone =
        zoneLabel && zoneLabel.trim()
            ? `${zoneLabel.trim()}${zoneCode ? ` (${zoneCode})` : ''}`
            : zoneCode && zoneCode.trim()
              ? `Zone ${zoneCode}`
              : 'This Murcia parcel';

    const instrument = derivedPlans
        .map((d) => `${d.family}${d.ref ? ` ${d.ref}` : ''}`)
        .join(' · ');

    const derivedSentence =
        derivedPlans.length > 0
            ? ' ⚠ The cadastral address Catastro returns for this parcel names a DERIVED planning ' +
              `instrument — ${instrument} — so the detailed buildable parameters are set by that ` +
              'document, not by the general plan\'s base ordinance. Any figure quoted from a general-plan ' +
              'zone table alone would therefore be citing the wrong instrument. PRYZM has read the ' +
              'address string, which is why it can name the document; it has NOT read the document, ' +
              'which is why it publishes no number from it.'
            : '';

    return {
        code: 'no-rule-pack',
        headline: `${zone} — PRYZM has identified your land precisely, but holds no transcribed Murcia ordinance, so it will not publish a buildable figure.`,
        detail:
            'The parcel itself is fully established from the Spanish Dirección General del Catastro: ' +
            'its referencia catastral, its official boundary, its officially registered area and any ' +
            'existing buildings with their floor counts are read live from the national INSPIRE ' +
            'services, by identifier — not inferred from a map pin. What PRYZM does NOT hold is a ' +
            'buildable figure it may publish for this particular calificación: Murcia\'s planning ' +
            'service exposes the zone identity but no machine-readable height, buildability, ' +
            'occupation or setback, and no verified article of the governing plan covers this code.' +
            derivedSentence +
            ' Rather than show an estimated or proxied number that would look like a determination, ' +
            'PRYZM shows none. ' +
            MURCIA_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
