// ── València (INE 46250) — the CITED-REFUSAL jurisdiction. ────────────────────────────────
//
// WHAT PRYZM CAN AND CANNOT SAY ABOUT A VALÈNCIA PARCEL TODAY (measured 2026-08-01)
// ---------------------------------------------------------------------------------
// CAN (VERIFIED live, via the national Catastro path that already routes here):
//   • the referencia catastral, by identifier join — not by a pin guess. Measured at
//     lon −0,3670 / lat 39,4640 → `6618617YJ2761H`, «CL ALMIRANTE CADARSO 33 VALENCIA»
//   • the INE municipality, composed from Catastro's own `<cp>46</cp>`+`<cm>250</cm>` = 46250,
//     through the EXISTING `composeIneCode()` — routed from the DATA, never from a name
//   • the zone identity, from the municipality's own ArcGIS service (`OPENDATA/
//     UrbanismoEInfraestructuras/MapServer/231`, 21 210 polygons: `califi`, `tipoca`, `origen`)
//   • independently, the municipal parcel layer 216 publishes `refcat` directly — so València
//     has TWO routes to a parcel and needs no licence for either
//
// CANNOT: publish a buildable number. For ONE reason, and it is not a coverage excuse —
// it is what the ordinance itself says.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// THE BLOCKER IS A GRAPHIC SHEET CALLED **PLANO C**, AND NO SIGNATURE MOVES IT
// ══════════════════════════════════════════════════════════════════════════════════════════
// The PGOU *Normas Urbanísticas* (mayo 1991) HAVE been sourced, read and transcribed — see
// `esValenciaPgou.ts`, with article and verbatim quote per parameter. The transcription is
// GOOD. It still yields no envelope, because every envelope-determining parameter in the
// residential zones is defined as a function of a number **graphed on Plano C**:
//
//   • Art. 6.19.1 (ENS): «La altura de cornisa máxima … se establece en función del número de
//     plantas **grafiado en el Plano C** … Hc = 4,80 + 2,90 Np»
//   • Art. 6.18.2 (ENS): «La profundidad edificable será la señalada **en el Plano C**.»
//   • Art. 6.25.1 (EDA): the same shape at a different intercept — «Hc = 5,30 + 2,90 Np»
//   • Art. 6.30.1 (UFA): «en función del número de plantas **grafiado en el Plano C**»
//
// PRYZM DOES NOT HOLD PLANO C. It is not published as a REST layer (checked: the 70-layer
// `UrbanismoEInfraestructuras` catalogue has no plantas / profundidad / altura layer).
//
// ⚠⚠ THEREFORE `Hc = 4,80 + 2,90·Np` WITH A GUESSED Np IS NOT A CONSERVATIVE ESTIMATE — IT IS
// A FABRICATED DETERMINATION. This is L-616 mechanism-A verbatim: a missing constraint
// OVERSTATES. The founder pre-committed to this before the text was read ("If PRYZM cannot read
// Plano C, ENS height is CONSTRUCTED-INPUT-MISSING and must REFUSE, not guess. Do not pack a
// representative Np."), and the primary source confirms the instruction exactly.
//
// ⚠ AND THE 20 m DEPTH FALLBACK DOES NOT RESCUE IT. Art. 6.18.2's «Caso de no indicarse ésta,
// no se podrá rebasar los 20 metros» is CONDITIONAL on Plano C not graphing a depth — a fact
// PRYZM cannot observe. Packing 20 m would silently assert "Plano C graphs no depth here",
// a claim about a document we have not read, and it can err in BOTH directions. The
// hypothesised "depth is STATED even without Plano C" asymmetry WAS TESTED AND DOES NOT EXIST
// (`sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md` §2 F11).
//
// ⇒ THE HONEST OUTPUT IS A CITED REFUSAL, AND THAT IS A SHIPPABLE ANSWER, NOT A GAP.
// The ratified position is *"100 % of parcels get either a computed envelope or a legally-cited
// refusal"*. Barcelona ships refusals for clau 18; Murcia ships them for its delegated 67 %.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — C58 §1.2/§1.4/§1.7a · C63 · ADR-0270 · L-449 · L-616 · L-656 · L-661 ·
// docs/04-reference/jurisdictions/es/es-vc/46250-valencia/sources/.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning');

/** The jurisdiction id València records and registrations use. One constant, not a literal. */
export const VALENCIA_JURISDICTION_ID = 'es-46250-valencia';

/**
 * Is a signed, transcribed València envelope rule pack available?
 *
 * ⛔ **`false`, and it is NOT the founder's signature that is missing — it is PLANO C.**
 *
 * This gate is deliberately DIFFERENT in kind from Murcia's. Murcia's `false` meant *"the
 * numbers are transcribed and a human has not yet signed the transcription"* — a signature
 * would have lifted it. **València's `false` cannot be lifted by a signature at all**, because
 * there is no number to sign: Arts. 6.18.2 / 6.19.1 / 6.25.1 / 6.30.1 define the envelope as a
 * function of a value graphed on a sheet PRYZM does not hold.
 *
 * ⚠ **DO NOT FLIP THIS TO SHIP A DEMO.** Flipping it authorises nothing, because
 * `ES_VALENCIA_PGOU_PACK.zones` is EMPTY — by construction, not by omission. A future author
 * who fills the pack with a "representative" Np and then flips this would be publishing the
 * L-616 failure with a founder's name on it.
 *
 * **WHAT WOULD ACTUALLY MOVE IT** (in order of leverage):
 * 1. **Plano C**, as data — the *número de plantas* + *profundidad edificable* per block. This
 *    is the whole city. See §R1 of the verification file.
 * 2. A **validated parse of layer 212's `altura` field** (§VALENCIA-ALTURA-LEAD below), which
 *    is a proxy for Plano C — ENGINEERING, and separately signable.
 * 3. Neither of the above is a transcription task, so neither is discharged by reading more of
 *    the ordinance.
 *
 * L-449: the flip is a legal act and it is the founder's. An implementer may not perform it.
 */
export const VALENCIA_ENVELOPE_VERIFIED = false as const;

/**
 * §VALENCIA-ALTURA-LEAD — the most promising route to a València envelope, recorded so it is
 * not lost, and fenced so it is not mistaken for a result.
 *
 * `OPENDATA/UrbanismoEInfraestructuras/MapServer/212` (*PGOU - Alineaciones*, 21 975 polygons)
 * carries a field **`altura`**. An earlier pass measured **65,5 % of ROWS** as a bare storey
 * count (`3`, `13`) and read that as the size of the lead.
 *
 * ⚠⚠ **RE-MEASURED BY AREA ON 2026-08-01, AND THE LEAD IS 2,4× SMALLER THAN THE ROW COUNT
 * SUGGESTED.** All 21 975 polygons downloaded with geometry in EPSG:25830 and shoelace-summed
 * (4 213,7 ha total):
 *
 * | `altura` value class | share of layer AREA |
 * |---|---|
 * | bare integer **in 1…30** — the only plausible storey counts | **27,13 %** |
 * | bare integer **`0`** — 4 195 polygons, the LARGEST single bucket | **34,13 %** |
 * | bare integer > 30 (`2000`, `538650`, `2650406`) | 0,28 % |
 * | `<=n` / `Max n` bounded | 6,63 % |
 * | protection-derived (`PROTEGIDO*`, `BIC`, `BRL`, `PROT_*`) | 6,07 % |
 * | absolute floorspace (`10235m2t`) · FAR (`0.8m2t/m2s`) · metres (`13m`) | 2,40 % |
 * | delegated / deferred (`PPARCIAL`, `DIFERIDO A5`, `ORD_DET`, `NORMATIVA`) | 1,49 % |
 * | true junk (`-+-`, `_`, `+-`) | 18,38 % |
 * | unrecognised (`S=39600.65m2s`, `EC`, `M15b`, `ET=1999210`) | 2,14 % |
 *
 * ⚠⚠⚠ **THE `0` BUCKET IS THE FINDING, AND IT IS A §CONTEXT-DATA-HONESTY TRAP IN ITS PUREST
 * FORM.** 4 195 polygons — **34,13 % of the layer's area, more than the entire plausible bucket**
 * — carry the literal value `0`. A parcel cannot be lawfully built to zero storeys, so `0` here
 * is a SENTINEL, not a measurement: it is "not applicable / not set", i.e. **UNKNOWN**. C58 §1.7a
 * and L-616 are explicit that `null` means unknown and **`0` never does**. A parser that trusted
 * `^\d+$` would publish either a zero-height envelope on a third of València or, worse, coerce
 * the sentinel to a default and publish a fabricated one.
 *
 * ⇒ **The honest size of this lead is 27,13 % of layer 212's area, not 65,5 %.** Every future
 * estimate must start from that number.
 *
 * ⚠ IT IS A LEAD, NOT AN UNLOCK, FOR THREE FURTHER INDEPENDENT REASONS — each sufficient on its own:
 * 1. **The field mixes at least FOUR units.** `13` (storeys), `13m` (metres), `0.8m2t/m2s`
 *    (FAR) and `10235m2t` (absolute floorspace) all live in the same `esriFieldTypeString`.
 *    Reading `13m` as 13 storeys gives `4,80 + 2,90·12 = 39,6 m` for a 13 m building — a
 *    THREEFOLD overstatement. A wrong unit is a wrong KIND (ADR-0270), not a wrong number.
 * 2. **That `altura` IS Art. 6.19.1's «número de plantas grafiado en el Plano C» is an
 *    INFERENCE.** Nothing in the service documents the field. Even granted it, the −1
 *    convention must be established for the FIELD, not merely for the article.
 * 3. **The layer is ALIGNMENTS, and its extent is not the extent that matters.** Layer 212 covers
 *    4 213,7 ha; the L-656 private-buildable denominator is 1 874,9 ha. **The overlap has NOT
 *    been measured** — it needs a spatial join, not an attribute query. So even the 27,13 % is a
 *    share of the WRONG denominator for a coverage claim, and is quoted here only as the size of
 *    the parsing problem.
 *
 * ⚠ Protection-derived rows are EXISTING-BUILDING-DERIVED, the same `not-the-rule-kind` shape as
 * Murcia's `RB`/`RU`, and a parser must not coerce them to a number.
 */
export const VALENCIA_ALTURA_LEAD_MEASURED_AT = '2026-08-01' as const;

/**
 * The layer-212 `altura` measurement, as data so a test can pin it.
 *
 * ⚠ `plausibleStoreyPctOfLayerArea` is the ONLY figure here that could ever become coverage, and
 * it is a share of LAYER 212's area — **not** of the L-656 private-buildable denominator, which
 * would require a spatial join nobody has run. Do not promote it.
 */
export const VALENCIA_ALTURA_FIELD_MEASURE = {
    layerId: 212,
    polygons: 21975,
    layerAreaHa: 4213.7,
    /** Bare integer in 1…30 — the only values that could be a *número de plantas*. */
    plausibleStoreyPctOfLayerArea: 27.13,
    /** ⚠ The literal value `0`, on 4 195 polygons. A SENTINEL for unknown, never a storey count. */
    zeroSentinelPctOfLayerArea: 34.13,
    /**
     * Values that are not a storey count under ANY reading — junk 18,38 · protection 6,07 ·
     * floorspace/FAR/metres 2,40 · unrecognised 2,14 · delegated 1,49 · blank 1,24 · >30 0,28 ·
     * fuera de ordenación 0,01. ⚠ EXCLUDES the 6,63 % `<=n`/`Max n` bounded class, which IS a
     * storey statement but a BOUND rather than a value (the L-616 distinction).
     */
    notAStoreyCountPctOfLayerArea: 32.01,
    /** `<=n` / `Max n` — a real storey BOUND. A bound is not a determination. */
    boundedStoreyPctOfLayerArea: 6.63,
    /** ⚠ Has the layer been spatially joined to the buildable denominator? It has not. */
    joinedToBuildableDenominator: false,
} as const;

/**
 * The roadmap line, stated once. Same role as `MURCIA_ROADMAP_LINE`: the refusal card must say
 * what would change the answer, or the user cannot tell a coverage gap from a crash.
 */
export const VALENCIA_ROADMAP_LINE =
    'València coverage today: the PARCEL half is live and keyless — the national Catastro path ' +
    'resolves the referencia catastral and the official boundary, and the municipality ' +
    'independently publishes the cadastral reference on its own parcel layer, so there are two ' +
    'routes and neither needs a licence. The ZONING half is live too: the city\'s own ArcGIS ' +
    'service returns the calificación, its grade and — unusually — the governing plan instrument ' +
    'as a column, so PRYZM can name the document that orders a parcel without a second query. ' +
    'The ENVELOPE half is where the limit sits, and for València the limit is unusually sharp. ' +
    'The general plan\'s Normas Urbanísticas have been sourced and transcribed article by ' +
    'article; the transcription is complete and quoted verbatim. It still yields no number, ' +
    'because the plan does not put the numbers in its text: Arts. 6.18 and 6.19 define the ' +
    'buildable depth and the cornice height as functions of a storey count and a depth GRAPHED ' +
    'ON A DRAWING — the Plano C sheets — and that drawing is not published as data. So this is ' +
    'not a transcription gap and no amount of further reading closes it. What closes it is ' +
    'Plano C itself, as data; PRYZM will publish a València envelope on the day it holds that ' +
    'sheet, and not one day earlier.';

/**
 * THE HONESTY-GATE refusal: returned for EVERY València parcel.
 *
 * `code: 'no-rule-pack'` + `legallyGrounded: false` + `ordinanceRef: null` — a statement about
 * PRYZM's COVERAGE, not about the law. The distinction is load-bearing: the PGOU certainly DOES
 * grant an envelope on this urban land, so a legal "no" would tell the owner of a perfectly
 * buildable plot that the law forbids building on it. That is the opposite error and it is worse.
 *
 * ⚠ It is NOT `source-data-unavailable`: nothing failed to fetch. Catastro answered, the
 * municipal service answered, and the ordinance was read. Stamping a transient code here would
 * offer a RETRY affordance that could never succeed, because no number of retries digitises a
 * 1991 drawing (the L-574 / §L-590c reasoning).
 *
 * ⚠ It is NOT `derived-plan` either — that code is a claim about the LAW (`legallyGrounded:
 * true`), and it is reserved for parcels whose `origen` names a non-`PGOU*` instrument. Whether
 * a given València parcel is in that class is knowable from the GIS but is NOT decided here;
 * conflating the two would overstate what this refusal establishes. See the note in
 * `esValenciaPgou.ts` §DELEGATION-UNMEASURED.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaNoRulePackRefusal` (P8 / C58 §1.10).
 *
 * @param zoneCode  the live `califi` value, if the municipal service was reached.
 * @param zoneLabel a human designation, if one is held.
 * @param knownFacts L-553 — short "label: value" facts, so the card is never a blank panel.
 */
export function valenciaNoRulePackRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.valenciaNoRulePackRefusal');
    try {
        const zone =
            zoneLabel && zoneLabel.trim()
                ? `${zoneLabel.trim()}${zoneCode ? ` (${zoneCode})` : ''}`
                : zoneCode && zoneCode.trim()
                  ? `Zone ${zoneCode}`
                  : 'This València parcel';

        span.setAttribute('jurisdictionId', VALENCIA_JURISDICTION_ID);
        span.setAttribute('zoneCode', (zoneCode ?? '').trim());
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            code: 'no-rule-pack',
            headline:
                `${zone} — PRYZM has identified your land precisely and has read the governing ` +
                'ordinance, but the ordinance sets this parcel\'s limits on a drawing PRYZM does ' +
                'not hold, so it will not publish a buildable figure.',
            detail:
                'The parcel itself is fully established from the Spanish Dirección General del ' +
                'Catastro: its referencia catastral and its official boundary are read live from the ' +
                'national INSPIRE services, by identifier — not inferred from a map pin. The zone is ' +
                'established too, from the city\'s own planning service. What is missing is neither ' +
                'the parcel nor the zone nor the ordinance: the PGOU\'s Normas Urbanísticas have been ' +
                'read and transcribed, and they state that the maximum cornice height and the ' +
                'buildable depth are set by a storey count and a depth GRAPHED ON THE PLANO C SHEETS, ' +
                'which the city does not publish as data. Every route to a number from here runs ' +
                'through a value PRYZM would have to invent. Rather than show an estimated or proxied ' +
                'figure that would look like a determination, PRYZM shows none. ' +
                VALENCIA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}