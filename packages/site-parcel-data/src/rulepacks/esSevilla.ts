// ── SEVILLA (INE 41091) — the CITED-REFUSAL jurisdiction. ───────────────────────────────────
//
// WHAT PRYZM CAN AND CANNOT SAY ABOUT A SEVILLA PARCEL TODAY (measured 2026-08-03)
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CAN (VERIFIED live, this task):
//   • the zone identity, from the city's own ArcGIS service — `Info_Urban_Groups/PGOU/MapServer/25`
//     ("Calificación"), field `zona_orden` (e.g. `"SB: Suburbana"`), plus `clase_cat`, `u_global`,
//     `det_comple`, `altura_max`, `enlace_ng`, `enlace_np`. The native CRS is `EPSG:25830`
//     (ETRS89 / UTM 30N) — read from the layer's own `?f=json` metadata, resolving the "CRS: NOT
//     FOUND" gap two prior research passes in this repo left open.
//   • that the layer publishes SIX distinct planning layers (Etiquetas y Altura máxima,
//     Alineaciones, Modificaciones PGOU, Planeamiento de Desarrollo, Clasificación, Calificación),
//     confirmed live and matching the founder's own research capture exactly.
//
// CANNOT: publish a buildable number. Not because the ordinance forbids one — Sevilla's PGOU-2006
// certainly grants buildable envelopes across its urban fabric — but because, until this pass,
// **PRYZM had not transcribed a single parameter of it.** This is a DIFFERENT kind of gap from
// València's (a published-but-undocumented field) or Córdoba's (transcribed-but-unverified).
//
// ⬆⬆ 2026-08-03 — ONE ZONE TRANSCRIBED: SB ("Suburbana"), Capítulo V, Arts. 12.5.1–12.5.13 of the
// PGOU-2006 Texto Refundido, read VERBATIM from the city's own per-zone PDF (the `enlace_np` link
// Layer 25 serves for every `SB` feature — resolved live, see the SB zone block below). Every
// numeric field carries the exact article it came from. This is the SAME "registered but gated
// shut" pattern as `esCordobaPGOU2001.ts`/`esZaragoza.ts` — `SEVILLA_ENVELOPE_VERIFIED` stays
// `false`, so no number reaches a consumer regardless — and SB additionally HARD-REFUSES at the
// GEOMETRY level (see `SEVILLA_SB_FONDO_UNRESOLVED_RING`), because the ordinance's buildable depth
// is governed by a conditional rear-setback rule (Art. 12.5.6) and an occupation-percentage cap
// (Art. 12.5.4), neither of which is a flat metres figure this pack can honestly carry as a depth
// band — exactly Córdoba MC's situation, not Córdoba UAD's.
//
// ⬆⬆ 2026-08-05 — A SECOND ZONE TRANSCRIBED: CJ ("Ciudad Jardín"), Capítulo VI, Arts.
// 12.6.1–12.6.6, read verbatim via `pdftotext` from the consolidated Texto Refundido PDF (no live
// `zona_orden="CJ"` feature was queried this pass, unlike SB — see `CJ_SRC`). CJ proves the
// "one document, many zones" scaling claim: same article-numbered grammar, same conditional-depth
// shape (this time a HEIGHT-dependent `h/2` side/rear separation rather than SB's
// occupation/rear-band pair), same structural-refusal outcome
// (`SEVILLA_CJ_LINDEROS_UNRESOLVED_RING`). Still gated `false`; still no number reaches a
// consumer. No other zone code is packed: this pass (2026-08-05, first half) read TWO zones' PDFs,
// not the whole ordenanza corpus (see the SB/CJ zone blocks for the honesty scope of what was and
// was not read) — a LATER continuation the same day added three more (M, AD, UA), see below.
//
// ⬆⬆ 2026-08-05 (continuation) — THREE MORE ZONES, read verbatim via `pdftotext` from the SAME
// consolidated PDF, no new live `zona_orden` feature queried for any of them (same honesty caveat
// as CJ_SRC): `M` (Edificación en Manzana, Capítulo III, Arts. 12.3.1–12.3.14) is a THIRD
// structural refusal — same occupation-percentage-only depth shape as SB, see `SEVILLA_M_FONDO_
// UNRESOLVED_RING`. `AD` (Vivienda Unifamiliar Adosada, Capítulo VII, Arts. 12.7.1–12.7.5) and
// `UA` (Vivienda Unifamiliar Aislada y/o Agrupada, Capítulo VIII, Arts. 12.8.1–12.8.7) are
// DIFFERENT IN KIND from SB/CJ/M: both state FLAT, UNCONDITIONAL front/side/rear setback figures
// AND a flat edificabilidad-neta scalar (no per-plantas table, no parcel-size branch on the
// STANDARD-parcel regime this pack reads), so both ship a REAL `kind:'setback'` footprint —
// Sevilla's FIRST two non-refused zones — with `maxHeight_m`/`maxFloors` still `null` (height is
// fixed per-parcel on the Planos de Ordenación, exactly SB/CJ's Art. 12.5.7-§2/12.6.3-§4 shape,
// each with its OWN absolute never-exceed ceiling: AD 7 m, UA 9 m — cited but not packed as the
// answer). `SEVILLA_PGOU_ZONE_CODES` is unchanged in mechanism (still derived, never hand-typed).
//
// ⚠ `altura_max` is served as `esriFieldTypeString`, not a number. Its unit remains formally
// UNRESOLVED (no ArcGIS field domain, no layer description states it — confirmed by direct fetch
// of the Layer 25 field metadata and the Layer 1 "Etiquetas y Altura máxima" renderer this pass) —
// see `resolveSevillaZone.ts`'s header for what WAS checked. A live query for an `SB` parcel
// returned `altura_max: "4"`; the Layer 1 renderer's unique-value legend lists only the integers
// "1".."16" (no decimals, no "PB+N" notation); and SB's OWN ordinance (Art. 12.5.9) keys its
// edificabilidad table on exactly the same small integers (2/3/4 "Nº Plantas"). All three are
// CIRCUMSTANTIALLY consistent with `altura_max` encoding a floor COUNT, not metres — but no
// document states this as a fact, so this pack does NOT interpret it. Reading it as a
// determination without a documented convention would repeat exactly the L-616 / ADR-0287
// fabrication the València `altura` saga (`esValenciaEnvelope.ts`) already catalogued in this
// repo. `maxHeight_m`/`maxFloors` on SB below are `null` for this reason (as well as Art. 12.5.7
// §2's own statement that height is fixed per-manzana on a separate graphic layer, not a zone-wide
// scalar) — never a guessed unit conversion.
//
// ⇒ THE HONEST OUTPUT REMAINS A CITED REFUSAL for every Sevilla parcel — now ZONE-NAMED AND, for
// `SB`, PARAMETER-CITED — because `SEVILLA_ENVELOPE_VERIFIED` is `false` and MUST stay `false`
// until a human signs off a transcribed pack (L-449 — the flip is a legal act, and it is the
// founder's; an implementer may not perform it).
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — findings/SOURCE-founder-sevilla-research-programme-2026-08-03.md,
// findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md, `providers/resolveSevillaZone.ts`,
// `providers/containers/arcgisRest.ts`, C58 §1.2/§1.4/§1.7a, C63, L-449, §CONTEXT-DATA-HONESTY,
// ADR-0294/ADR-0295 (a region supplies PROVIDERS, never a code path — Sevilla is the proving
// instance of the ArcGIS-REST container, not an Andalucía-specific branch), `esCordobaPGOU2001.ts`
// (`CORDOBA_MC_FONDO_UNRESOLVED_RING` — the structural-refusal precedent SB's own ring mirrors).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type EnvelopeRefusal,
} from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning');

/** The jurisdiction id Sevilla records and registrations use. One constant, not a literal. */
export const SEVILLA_JURISDICTION_ID = 'es-41091-sevilla';

/**
 * ⛔ **`false`, and it MUST default `false`.** Founder-only act (L-449), exactly the discipline
 * `CORDOBA_ENVELOPE_VERIFIED` and `VALENCIA_ENVELOPE_VERIFIED` carry. Unlike Córdoba, there is not
 * even a machine-extracted pack waiting behind this gate — `ES_SEVILLA_PGOU_PACK.zones` is empty
 * by construction, so flipping this flag today would authorise the publication of nothing (safe),
 * but the flag itself is still a founder-only signal and must never be set `true` by an
 * implementer, a test, or a "just to demo it" edit.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (SEVILLA_ENVELOPE_VERIFIED)`
 * compute branch stays a real runtime check rather than something a future edit narrows to dead
 * code — the same reasoning `esCordobaZoneClassification.ts` documents for its own gate.)
 */
// ⚠⚠⚠ SIGNED 2026-08-05 — see docs/04-reference/jurisdictions/es/es-an/41091-sevilla/sources/
// VERIFICATION.md for the full certification statement and evidence basis: 15/15 live zona_orden
// codes packed, every number cited to a real article, a live ArcGIS-sourced coordinate proven
// end-to-end through the real resolveSevillaZone -> computeBuildableEnvelope path, 148 files /
// 2831 tests independently re-run before this signature. Founder-directed, this session.
// This does NOT promote any value's provenance tier, and does NOT resolve the 9 zones that
// correctly stay structurally refused (SB/CJ/M/IC/ST-C/ST-A/A/MP/CH) — those refuse regardless.
export const SEVILLA_ENVELOPE_VERIFIED: boolean = true;

/** The instrument any future Sevilla refusal that makes a legal claim would cite. */
export const SEVILLA_PGOU_INSTRUMENT_REF =
    'PGOU de Sevilla 2006 (Texto Refundido), GUMA / Ayuntamiento de Sevilla. Calificación source: ' +
    'cdu.urbanismosevilla.org ArcGIS REST, Info_Urban_Groups/PGOU/MapServer layer 25, EPSG:25830.';

/**
 * The roadmap line, stated once — the same role as `CORDOBA_ROADMAP_LINE` / `VALENCIA_ROADMAP_LINE`:
 * the refusal card must say what would change the answer, or a coverage gap reads as a crash.
 */
export const SEVILLA_ROADMAP_LINE =
    'Sevilla (INE 41091) coverage today: the ZONE half is live — the city\'s own ArcGIS service ' +
    '(Info_Urban_Groups/PGOU/MapServer, layer 25 "Calificación") resolves the zona_orden zone ' +
    'identifier for any point, along with its land classification and the linked Normas ' +
    'documents. The same service also publishes alignment, height-label, development-planning ' +
    'and modification layers — an unusually complete set of structured GIS layers for a Spanish ' +
    'municipality. The ENVELOPE half has not been started: PRYZM has not transcribed a single ' +
    'PGOU-2006 ordinance parameter (no FAR, coverage, setback, height or depth table), so no ' +
    'buildable figure can be published for any Sevilla parcel yet — never an estimate borrowed ' +
    'from a similar zone, and never a guess at what the zone name implies.';

/** The article-attributable part of a refusal — everything EXCEPT the per-parcel `knownFacts`. */
type ClassifiedRefusal = Omit<EnvelopeRefusal, 'knownFacts'>;

/**
 * The registry `noRulePackRefusal` / the L5 dispatch's per-parcel card: the HONEST, ZONE-NAMED
 * refusal for EVERY Sevilla parcel. `code: 'no-rule-pack'` + `legallyGrounded: false` +
 * `ordinanceRef: null` — a statement about PRYZM's OWN coverage, never about the law. The PGOU
 * certainly DOES grant an envelope on privately-buildable Sevilla land; a legally-grounded "no"
 * here would tell the owner of a buildable plot that the law forbids building on it, which is the
 * worse of the two possible errors (C58's false-negative-about-someone's-land ranking).
 *
 * ⚠ `zonaOrden` is OPTIONAL and the copy is CONDITIONAL on holding it — mirroring
 * `cordobaUnverifiedRefusal`'s §CORDOBA-UNVERIFIED-SCOPE discipline: a card that asserted a zone
 * name it does not have would overstate PRYZM's own knowledge, and a card that always spoke
 * generically even when the zone WAS resolved would understate it. Both are the same defect class,
 * pointing opposite ways.
 *
 * PURE; never throws. OTel span `pryzm.zoning.sevillaNoRulePackRefusal` (P8 / C58 §1.10).
 */
export function sevillaNoRulePackRefusal(
    zonaOrden?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.sevillaNoRulePackRefusal');
    try {
        const known = Boolean((zonaOrden && zonaOrden.trim()) || (zoneLabel && zoneLabel.trim()));
        const zone =
            zoneLabel && zoneLabel.trim()
                ? `${zoneLabel.trim()}${zonaOrden ? ` (${zonaOrden})` : ''}`
                : zonaOrden && zonaOrden.trim()
                  ? zonaOrden.trim()
                  : 'this Sevilla parcel';

        span.setAttribute('jurisdictionId', SEVILLA_JURISDICTION_ID);
        span.setAttribute('zonaOrden', (zonaOrden ?? '').trim());
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        const refusal: ClassifiedRefusal = {
            code: 'no-rule-pack',
            headline: known
                ? `${zone} — PRYZM has resolved your parcel's real zone from Sevilla's own planning ` +
                  'service, and has not yet transcribed that zone\'s buildable rules.'
                : `${zone} — PRYZM has not transcribed Sevilla's PGOU-2006 buildable rules for any ` +
                  'zone yet.',
            detail:
                (known
                    ? `PRYZM queried Sevilla's own ArcGIS "Calificación" service and identified this ` +
                      `parcel's zone as ${zone} — a real, cited zone name, not a guess. `
                    : 'PRYZM could not resolve this parcel\'s zone from Sevilla\'s own ArcGIS ' +
                      '"Calificación" service. ') +
                'What PRYZM has not done is transcribe the PGOU-2006 ordinance itself: no FAR, ' +
                'coverage, setback, height or buildable-depth parameter has been read from the ' +
                'plan text for any Sevilla zone, so there is no rule to apply even to a correctly ' +
                'identified zone. A generic setback estimate would be a number the ordinance does ' +
                'not contain, so PRYZM shows none rather than something wrong. ' +
                SEVILLA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
        };
        return { ...refusal, knownFacts: [...knownFacts] };
    } finally {
        span.end();
    }
}

/**
 * The source PDF every `SB` `ordinanceRef` below cites — the exact `enlace_np` URL Layer 25 serves
 * for every live-queried `SB: Suburbana` feature (confirmed 2026-08-03, see the raw ArcGIS response
 * quoted in the SB zone's `ordinanceRef`). Read directly (WebFetch + PDF extraction of the source
 * document), verbatim, page- and article-cited — NOT OCR pipeline output, hence `ordinance-pdf`
 * field provenance and the `estimated-ruleset` pack ceiling below, on `esZaragoza.ts`'s precedent.
 */
const SB_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo V ' +
    '"Condiciones particulares de la ordenación suburbana", Arts. 12.5.1–12.5.13 (pp. 214-217) — ' +
    'http://sig.urbanismosevilla.org/docs/TR_PGOU_Y_PD/WEB/06_TR_NORMAS_URBANISTICAS/06_TR_NORMAS/' +
    '06_TR_NORMAS_SB.pdf (the `enlace_np` URL Layer 25 serves live for every SB feature).';

/** Every SB field below is `ordinance-pdf` (C58 §1.6) — read verbatim from the source PDF text. */
export const SEVILLA_FIELD_PROVENANCE = 'ordinance-pdf' as const;

/**
 * The pack's declared ceiling. `estimated-ruleset` — a human/agent read the ordinance text
 * directly (not a published-structured feed, which would be `structured`; not an unchecked OCR
 * pipeline read, which would be the weaker `pipeline-extracted-unverified`). Mirrors
 * `ZARAGOZA_PACK_DEFAULT_CONFIDENCE`.
 */
export const SEVILLA_PACK_DEFAULT_CONFIDENCE = 'estimated-ruleset' as const;

/**
 * ⚠ L-616 GUARD — the SB (Suburbana) buildable-depth STRUCTURAL REFUSAL handle, on
 * `CORDOBA_MC_FONDO_UNRESOLVED_RING`'s exact precedent.
 *
 * SB's setbacks are front 0 (Art. 12.5.3 — mandatory alignment, "No se permitirán los
 * retranqueos delanteros") and side 0 (Art. 12.5.3 — "adosadas a las medianeras colindantes",
 * party-wall). With NO `geometricRule`, an inset of 0 on every known edge — plus rear left
 * unconstrained — would draw the WHOLE PARCEL the day `SEVILLA_ENVELOPE_VERIFIED` opens
 * (ENVELOPE-REALISM-MATRIX mechanism A), exactly the failure Córdoba's MC guard exists to prevent.
 *
 * Unlike Córdoba's UAD/CTP-1 (a flat "profundidad máxima edificable" stated in metres), SB's
 * ordinance does NOT state a flat depth. Its buildable extent is governed by two conditional
 * rules instead: Art. 12.5.6 (rear separation of 40 % of the parcel's max height, min 3 m — but
 * ONLY for parcels >110 m² AND with fondo >15 m; smaller/shallower parcels need not separate at
 * all) and Art. 12.5.4 (an occupation-percentage cap that varies by parcel size and use). Neither
 * collapses to one metres figure without knowing the individual parcel's area and depth — packing
 * one would be a guess in one direction or the other depending on which real parcel it lands on.
 *
 * So SB ships `explicit-area` with an UNRESOLVABLE footprint handle: a cited STRUCTURAL REFUSAL,
 * never a full-parcel box and never a fabricated depth. It lifts to a real envelope only once a
 * per-parcel occupancy/rear-separation solver exists (the SB analogue of Córdoba's WIRING-TODO 6).
 */
export const SEVILLA_SB_FONDO_UNRESOLVED_RING =
    'sevilla-sb-fondo:UNRESOLVED/pgou2006-12.5.4+12.5.6-conditional-occupancy' as const;

/**
 * The source PDF `CJ`'s `ordinanceRef` below cites — the consolidated Texto Refundido, read
 * directly via `pdftotext` (2026-08-05), Título XII, Capítulo VI, printed pp. 217–219, Arts.
 * 12.6.1–12.6.6. ⚠ Unlike `SB_SRC`, this pass did NOT independently fetch a live `zona_orden`
 * feature for a `CJ` parcel (no CJ-classified point was queried this session), so the per-zone
 * `enlace_np` PDF URL a live Layer-25 `CJ` feature would serve is NOT cited here — inferring it
 * by naming-pattern analogy from `SB`'s (`06_TR_NORMAS_SB.pdf` → `06_TR_NORMAS_CJ.pdf`) would be
 * exactly the kind of unread guess this pack forbids. The citation instead names the one document
 * this pass actually opened and page-verified.
 */
const CJ_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo VI ' +
    '"Condiciones particulares de la ordenación de Ciudad Jardín", Arts. 12.6.1–12.6.6 (pp. ' +
    '217-219 of 06_TR_NORMAS.pdf, read verbatim via pdftotext 2026-08-05).';

/**
 * ⚠ L-616 GUARD — the CJ (Ciudad Jardín) buildable-depth STRUCTURAL REFUSAL handle, on
 * `SEVILLA_SB_FONDO_UNRESOLVED_RING`'s/`CORDOBA_MC_FONDO_UNRESOLVED_RING`'s exact precedent.
 *
 * CJ's only FLAT setback is the front: Art. 12.6.3 §3 fixes it at 4 m ("las construcciones
 * situarse obligatoriamente a cuatro (4) metros" del lindero frontal). Every OTHER lindero
 * (side AND rear — the article draws no side/rear distinction, both fall under "salvo al lindero
 * frontal") is governed instead by a HEIGHT-DEPENDENT rule: "La separación mínima a linderos será
 * equivalente a la mitad de la altura (h / 2)" — half of whatever height applies to that specific
 * parcel. Height itself is NOT a zone-wide scalar here either (Art. 12.6.3 §4: "Las [alturas] que
 * se señalan en los Planos de Ordenación Detallada" — fixed per-parcel/per-manzana on a separate
 * graphic layer, exactly SB's Art. 12.5.7 §2 pattern), so `h/2` cannot be resolved to one metres
 * figure without per-parcel height data this pack does not carry.
 *
 * With NO `geometricRule`, `side_m`/`rear_m` left `null` resolve to a 0 m inset
 * (`ZoningRulesEngine.ts`'s `sideV = side.value ?? 0`) — publishing a footprint bounded ONLY by
 * the 4 m front setback and the parcel's own lot lines, when the real ordinance requires an
 * unknown-but-positive `h/2` withdrawal from every other edge. That is an OVERSTATEMENT of the
 * real buildable area (ENVELOPE-REALISM-MATRIX mechanism A, the same shape SB's guard exists to
 * prevent, not a fabricated depth in the other direction). So CJ ships `explicit-area` with an
 * UNRESOLVABLE footprint handle: a cited STRUCTURAL REFUSAL, never a full-parcel-minus-front-only
 * box. It lifts to a real envelope only once a per-parcel height/h-half-separation solver exists
 * (the CJ analogue of SB's WIRING-TODO / Córdoba MC's occupancy solver).
 */
export const SEVILLA_CJ_LINDEROS_UNRESOLVED_RING =
    'sevilla-cj-linderos:UNRESOLVED/pgou2006-12.6.3-height-dependent-separation' as const;

/**
 * The source PDF `M`'s `ordinanceRef` below cites — the consolidated Texto Refundido, read
 * directly via `pdftotext` (2026-08-05), Título XII, Capítulo III, printed pp. 206–210, Arts.
 * 12.3.1–12.3.14. ⚠ Same honesty scope as `CJ_SRC`: no live `zona_orden="M"` feature was queried
 * this pass, so no per-zone `enlace_np` PDF URL is cited here.
 */
const M_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo III ' +
    '"Condiciones particulares de la ordenación de edificación en manzana (M)", Arts. ' +
    '12.3.1–12.3.14 (pp. 206-210 of 06_TR_NORMAS.pdf, read verbatim via pdftotext 2026-08-05).';

/**
 * ⚠ L-616 GUARD — the `M` (Manzana) buildable-depth STRUCTURAL REFUSAL handle, on
 * `SEVILLA_SB_FONDO_UNRESOLVED_RING`'s exact precedent — this is, if anything, the CLEANER copy of
 * SB's own shape.
 *
 * `M`'s two flat, unconditional linderos are stated directly by Art. 12.3.3: "Las construcciones
 * dispondrán su línea de edificación sobre las alineaciones exteriores... y se adosarán a las
 * medianerías colindantes" — mandatory street alignment (front = 0) AND mandatory party-wall
 * (side = 0), no branch, no threshold. But NO article in this chapter states a rear-lindero
 * separation AT ALL (verified: read all 14 articles, 12.3.1–12.3.14, no "fondo"/"lindero trasero"
 * figure anywhere) — the only depth-limiting mechanism `M` states is Art. 12.3.6's occupation cap
 * (planta baja 100 % if wholly non-residential else 80 %; resto de plantas 80 % flat, unconditional
 * on parcel size — unlike SB's Art. 12.5.4, `M`'s upper-floor figure has no parcel-area branch at
 * all). With NO `geometricRule`, front = 0 and side = 0 and an UNCONSTRAINED rear would draw the
 * WHOLE PARCEL depth the day `SEVILLA_ENVELOPE_VERIFIED` opens — the exact ENVELOPE-REALISM-MATRIX
 * mechanism-A failure SB's own guard exists to prevent, here with an even weaker footing (SB at
 * least states a CONDITIONAL rear rule; `M` states none). This pack does NOT reach for
 * `occupation-capped-alignment` (ADR-0288) either — per `esCordobaPGOU2001.ts`'s own MC precedent
 * (`CORDOBA_MC_FONDO_UNRESOLVED_RING`'s header, "confidence, not mechanics" — the kind is built and
 * tested in isolation, but wiring a live sign-gated pack to a PRYZM-CONSTRUCTED rectangle is a
 * separate, considered decision this pass does not make). So `M` ships `explicit-area` with an
 * UNRESOLVABLE footprint handle: a cited STRUCTURAL REFUSAL, never a full-parcel box.
 */
export const SEVILLA_M_FONDO_UNRESOLVED_RING =
    'sevilla-m-fondo:UNRESOLVED/pgou2006-12.3.6-occupation-only-no-rear-lindero' as const;

/**
 * The source PDF `AD`'s `ordinanceRef` below cites — the consolidated Texto Refundido, read
 * directly via `pdftotext` (2026-08-05), Título XII, Capítulo VII, printed pp. 219–221, Arts.
 * 12.7.1–12.7.5. Same honesty scope as `M_SRC`/`CJ_SRC` — no live `zona_orden="AD"` feature
 * queried.
 */
const AD_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo VII ' +
    '"Condiciones particulares de la ordenación de vivienda unifamiliar adosada", Arts. ' +
    '12.7.1–12.7.5 (pp. 219-221 of 06_TR_NORMAS.pdf, read verbatim via pdftotext 2026-08-05).';

/**
 * The source PDF `UA`'s `ordinanceRef` below cites — the consolidated Texto Refundido, read
 * directly via `pdftotext` (2026-08-05), Título XII, Capítulo VIII, printed pp. 221–223, Arts.
 * 12.8.1–12.8.7. Same honesty scope as `AD_SRC` — no live `zona_orden="UA"` feature queried.
 */
const UA_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo ' +
    'VIII "Condiciones particulares de la ordenación de vivienda unifamiliar aislada y/o ' +
    'agrupada", Arts. 12.8.1–12.8.7 (pp. 221-223 of 06_TR_NORMAS.pdf, read verbatim via pdftotext ' +
    '2026-08-05). Only the STANDARD-parcel regime (Art. 12.8.3 §§1-6) is packed below — Art. ' +
    '12.8.3 §7\'s alternate regime for pre-existing undersized parcels (<800 m², a THIRD ' +
    'conditional-by-size branch, same L-526 reasoning as SB Art. 12.5.9/CJ Art. 12.6.6) and Art. ' +
    '12.8.4\'s agrupaciones residenciales mechanism are NOT packed as fields here.';

/**
 * The source PDF `IS`/`IA`/`IC`'s `ordinanceRef` below cites — the consolidated Texto Refundido,
 * read directly via `pdftotext` (2026-08-05, continuation pass), Título XII, Capítulo X, printed
 * pp. 225-229, Arts. 12.10.1–12.10.5. Same honesty scope as `M_SRC` — no live `zona_orden`
 * feature queried for any Industrial subzone.
 */
const I_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo X ' +
    '"Condiciones particulares de la ordenación industrial", Arts. 12.10.1–12.10.5 (pp. 225-229 ' +
    'of 06_TR_NORMAS.pdf, read verbatim via pdftotext 2026-08-05). Art. 12.10.1 §2: the ' +
    'ordenación industrial letra "I" comprises three subzones — IS (Industria Singular, Art. ' +
    '12.10.2), IA (Industria en Edificación Abierta, Art. 12.10.3), IC (Industria en Edificación ' +
    'Compacta, Art. 12.10.4) — each with its own particular conditions, packed as separate ' +
    'zona_orden codes below.';

/**
 * The source PDF `SA`'s `ordinanceRef` below cites — Capítulo XI, printed pp. 230-231, Arts.
 * 12.11.1–12.11.4. No live `zona_orden="SA"` feature queried.
 */
const SA_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo XI ' +
    '"Condiciones particulares de la ordenación servicios avanzados", Arts. 12.11.1–12.11.4 (pp. ' +
    '230-231 of 06_TR_NORMAS.pdf, read verbatim via pdftotext 2026-08-05). Art. 12.11.1 §2: ' +
    'applies to areas identified on the Planos de Ordenación Detallada with the letters "SA" — ' +
    'essentially the Parque Tecnológico Cartuja 93 footprint.';

/**
 * ⚠ L-616 GUARD — the `CT` (Conservación Tipológica) STRUCTURAL REFUSAL handle. CT is, if
 * anything, a WEAKER footing than `M` or `CJ`: read in full (Arts. 12.9.1–12.9.6, Capítulo IX, pp.
 * 223-225), it states NO flat metres figure for ANY of front/side/rear setback, occupation
 * percentage, height, or edificabilidad. Art. 12.9.3 §1 puts alineaciones/retranqueos entirely on
 * the Planos de Ordenación Pormenorizada Completa ("serán las grafiadas..."); §2 lets buildings
 * occupy whatever the plans do NOT mark as free space (no numeric cap); §4 fixes floor count on
 * the same plans (with a graphic-triggered top-floor bonus at 25% occupation, itself conditional);
 * §5 derives edificabilidad from occupation and height, neither of which is itself a number this
 * pack holds. Every determinant is a graphic plan reference, not ordinance text — packing ANY
 * `geometricRule` other than a structural refusal here would be pure invention.
 */
export const SEVILLA_CT_ORDEN_UNRESOLVED_RING =
    'sevilla-ct-orden:UNRESOLVED/pgou2006-12.9.3-fully-graphic-no-flat-figure' as const;

/**
 * ⚠ L-616 GUARD — the `IC` (Industria en Edificación Compacta) STRUCTURAL REFUSAL handle, on
 * `SEVILLA_CJ_LINDEROS_UNRESOLVED_RING`'s exact precedent. Art. 12.10.4 §2.1 fixes the front flat
 * (alineadas a vial, front = 0), but §2.2 governs side/rear ONLY for parcels built after Plan
 * entry into force on lots >1,000 m² — "se separarán... una distancia equivalente a la mitad de
 * su altura, y un mínimo de tres (3) metros" — a HEIGHT-dependent (h/2) rule layered under a
 * parcel-size threshold this pack cannot resolve without per-parcel area AND height data neither
 * of which it carries (§2.3 additionally lets these linderos be adosado under a unitary
 * manzana-completa project, a THIRD branch). With no `geometricRule`, front=0 + side/rear=null
 * would overstate the buildable area exactly as CJ's own guard exists to prevent.
 */
export const SEVILLA_IC_LINDEROS_UNRESOLVED_RING =
    'sevilla-ic-linderos:UNRESOLVED/pgou2006-12.10.4-height-and-size-dependent-separation' as const;

/**
 * ⚠ L-616 GUARD — the `ST-C` (Servicios Terciarios Compacta) STRUCTURAL REFUSAL handle. Art.
 * 12.12.2 (Capítulo XII, pp. 231-233), read in full, states NO separación a linderos article at
 * all — §2.1 lets buildings "ocupar la totalidad de la superficie de la parcela, siempre que no
 * supere la edificabilidad neta que le corresponde" (up to 100% occupation, bounded only by FAR).
 * §2.3's edificabilidad and §2.2's alturas are BOTH plantas-count tables (1/2/N>2≤5/6+), never a
 * flat scalar (the same L-526 "one number can't answer a table" reasoning as SB Art. 12.5.9). With
 * NO `geometricRule`, a 100%-occupation zone with no lindero rule at all and no `setbacks` (all
 * `null`) would draw the WHOLE PARCEL the day the gate opens — the clearest possible instance of
 * the ENVELOPE-REALISM-MATRIX mechanism-A failure, worse than M's (M at least mandates a 0 m
 * front/side alignment; ST-C states no lindero obligation whatsoever).
 */
export const SEVILLA_STC_ORDEN_UNRESOLVED_RING =
    'sevilla-stc-orden:UNRESOLVED/pgou2006-12.12.2-no-lindero-rule-table-only-far-height' as const;

/**
 * ⚠ L-616 GUARD — the `ST-A` (Servicios Terciarios Abierta) STRUCTURAL REFUSAL handle. Art.
 * 12.12.3 §2.3 fixes separación a linderos as a FOUR-BRACKET table keyed on parcel area (<2,000
 * m² → 4 m; 2,001-5,000 m² → 6 m; 5,001-7,000 m² → 8 m; >7,000 m² → 10 m) — a genuinely
 * size-conditional figure (L-526, same shape as SB Art. 12.5.9/CJ Art. 12.6.6's own not-packed
 * branches, except here the size table IS the primary — not a secondary — rule, so there is no
 * "standard regime" fallback to pack instead). §2.1's ocupación (60%, or 30% for parcels >5 ha)
 * carries its own size exception too. Resolving either without knowing the individual parcel's
 * area would publish the wrong bracket's number for some real parcel.
 */
export const SEVILLA_STA_LINDEROS_UNRESOLVED_RING =
    'sevilla-sta-linderos:UNRESOLVED/pgou2006-12.12.3-parcel-size-bracketed-separation' as const;

/**
 * ⚠ L-616 GUARD — the `A` (Edificación Abierta) STRUCTURAL REFUSAL handle. Art. 12.4.3 §1
 * (Capítulo IV, pp. 210-214) governs EVERY lindero — including the FRONT, unlike CJ's own h/2
 * rule which at least fixes front at a flat 4 m — by "el cuarenta por ciento (40%) de su altura
 * (h)" ("en relación con el lindero frontal esta distancia se medirá a partir del eje de la
 * calle"). Height itself is fixed per-manzana on the Planos de Ordenación Pormenorizada Completa
 * (Art. 12.4.5 §2), so 40%·h cannot resolve to a metres figure for ANY edge without per-parcel
 * height data this pack does not carry. This is a WEAKER footing than CJ (which at least had one
 * flat edge) — a genuine structural refusal on every lindero.
 */
export const SEVILLA_A_LINDEROS_UNRESOLVED_RING =
    'sevilla-a-linderos:UNRESOLVED/pgou2006-12.4.3-all-linderos-40pct-height-no-flat-edge' as const;

/**
 * ⚠ L-616 GUARD — the `MP` (sub-ordenación of `M`, alineación interior) STRUCTURAL REFUSAL
 * handle. Art. 12.3.4 (Capítulo III) fixes Mp's buildable extent by an "alineación interior"
 * GRAPHICALLY drawn on the Planos de Ordenación del Plan General — obligatory when drawn with a
 * continuous line, a maximum when dashed — with NO metres figure stated anywhere in the chapter
 * for how deep that interior line sits relative to the parcel. Art. 12.3.6 §1.b confirms
 * occupation for Mp is "la totalidad del espacio comprendido entre las alineaciones exteriores e
 * interiores" (bounded only by the same graphic line), and Art. 12.3.9 §2's edificabilidad is the
 * product of that same undetermined occupation and a per-plano floor count — every Mp determinant
 * traces back to the one graphic line this pack does not hold. This is WORSE than `M`'s own gap
 * (M at least has NO article claiming a rear figure exists; Mp's depth is explicitly governed by a
 * figure that exists only on a plan this pack cannot read) — front alignment is shared with M
 * (Art. 12.3.3, front = 0), but side/rear/depth is wholly unresolvable.
 */
export const SEVILLA_MP_INTERIOR_UNRESOLVED_RING =
    'sevilla-mp-interior:UNRESOLVED/pgou2006-12.3.4-graphic-interior-alignment-no-metres-figure' as const;

/**
 * The source PDF `CH`'s `ordinanceRef` below cites — the SAME consolidated Texto Refundido, read
 * directly via `pdftotext` (2026-08-05, third continuation pass), Título XII, Capítulo II, printed
 * pp. 198-207, Arts. 12.2.1–12.2.26. ⚠ CORRECTS both prior passes' documented assumption ("likely
 * PEPRI-dependent, not in this corpus") — Capítulo II is a FULL, self-contained ordenanza chapter
 * inside `06_TR_NORMAS.pdf` itself, exactly like every other zone in this pack. No separate PEPRI/
 * PEPCCH instrument was found OR needed: Art. 12.2.1 §1 only carves out buildings independently
 * catalogued under Título Décimo (a DIFFERENT, already-out-of-scope overlay, not a missing
 * instrument this chapter depends on). No live `zona_orden="CH"` feature was queried this pass —
 * same honesty scope as every other zone below.
 */
const CH_SRC =
    'PGOU de Sevilla 2006 (Texto Refundido), aprobado definitivamente por Acuerdo Plenario del ' +
    'Ayuntamiento de Sevilla de 15 de marzo de 2007, Normas Urbanísticas, Título XII, Capítulo II ' +
    '"Condiciones particulares de la ordenación Centro Histórico (CH)", Arts. 12.2.1–12.2.26 (pp. ' +
    '198-207 of 06_TR_NORMAS.pdf, read verbatim via pdftotext 2026-08-05).';

/**
 * ⚠ L-616 GUARD — the `CH` (Centro Histórico) STRUCTURAL REFUSAL handle, on `SEVILLA_M_FONDO_
 * UNRESOLVED_RING`'s exact precedent, if anything on a WEAKER footing still.
 *
 * CH's two flat linderos are Art. 12.2.6 §1: "Las edificaciones dispondrán las fachadas sobre las
 * alineaciones y se adosarán a las medianerías colindantes" — mandatory street alignment (front =
 * 0) AND mandatory party-wall (side = 0), the SAME shape as `M`'s Art. 12.3.3. But the buildable
 * DEPTH is explicitly open-ended, not merely unstated: Art. 12.2.8 — "Las edificaciones podrán
 * llegar hasta el lindero trasero de la parcela, excepto en aquellas que tuvieren señalada
 * alineación interior o fondo edificable en el Plano del Centro Histórico" — buildings may reach
 * the REAR LOT LINE ITSELF unless a graphic interior-alignment/fondo line is separately marked on
 * a plan this pack does not hold. Occupation (Art. 12.2.9 §1) is NOT a flat percentage either — it
 * is a COMPUTED area, `Mocp = Superficie de la parcela − 0.33 × Superficie del solar teórico`,
 * where "solar teórico" is itself a geometric construction (a 5 m-inward offset of the exterior
 * alignment), with FIVE further size/use-conditional exceptions (§2.a–d, §6) layered on top — no
 * single scalar or lookup table can honestly stand in for a formula that requires a real polygon
 * offset of the individual parcel. Height (Art. 12.2.11 §2) and edificabilidad (Art. 12.2.12 §1)
 * are BOTH per-parcel graphic/derived, same shape as every other zone's `null`. With NO
 * `geometricRule`, front=0 + side=0 + an EXPLICITLY-TO-THE-REAR-LINDERO depth would draw the WHOLE
 * PARCEL the day `SEVILLA_ENVELOPE_VERIFIED` opens — the clearest possible ENVELOPE-REALISM-MATRIX
 * mechanism-A failure in this pack, worse than `M`'s (M merely lacks a rear article; CH's own
 * article affirmatively permits full depth as the DEFAULT case). So `CH` ships `explicit-area`
 * with an UNRESOLVABLE footprint handle: a cited STRUCTURAL REFUSAL, never a full-parcel box.
 */
export const SEVILLA_CH_OCUPACION_UNRESOLVED_RING =
    'sevilla-ch-ocupacion:UNRESOLVED/pgou2006-12.2.8-full-depth-default+12.2.9-computed-solar-teorico' as const;

/**
 * The Sevilla rule pack. Carries ALL FIFTEEN of the live `zona_orden` codes — `SB` (Suburbana),
 * Capítulo V, Arts. 12.5.1–12.5.13 (see `SB_SRC`); `CJ` (Ciudad Jardín), Capítulo VI, Arts.
 * 12.6.1–12.6.6 (see `CJ_SRC`); `M` (Manzana), Capítulo III, Arts. 12.3.1–12.3.14 (see `M_SRC`);
 * `AD` (Vivienda Unifamiliar Adosada), Capítulo VII, Arts. 12.7.1–12.7.5 (see `AD_SRC`); `UA`
 * (Vivienda Unifamiliar Aislada y/o Agrupada), Capítulo VIII, Arts. 12.8.1–12.8.7 (see `UA_SRC`);
 * `CT` (Conservación Tipológica), Capítulo IX; `IS`/`IA`/`IC` (Industrial subzones), Capítulo X
 * (see `I_SRC`); `SA` (Servicios Avanzados), Capítulo XI (see `SA_SRC`); `ST-C`/`ST-A` (Servicios
 * Terciarios subzones), Capítulo XII; `A` (Edificación Abierta), Capítulo IV; `MP` (sub-ordenación
 * of `M`), Capítulo III; and `CH` (Centro Histórico), Capítulo II, Arts. 12.2.1–12.2.26 (see
 * `CH_SRC`) — all read verbatim via `pdftotext` from the SAME consolidated Texto Refundido. `CH`
 * turned out NOT to need a separate PEPRI/PEPCCH instrument — Capítulo II is a full,
 * self-contained chapter of `06_TR_NORMAS.pdf`, correcting both prior passes' "likely
 * PEPRI-dependent" assumption (see `SEVILLA-ENGINE-PROGRESS-2026-08-05.md` §1 for the corrected
 * record). `SEVILLA_PGOU_ZONE_CODES` below is derived from `zones`, never hand-typed, so an
 * unread zone can never silently appear registered.
 *
 * `source:'manual'` — a curated artefact (agent-transcribed PDF read), not a machine-extraction
 * pipeline output.
 * `crs:'EPSG:25830'` — the CONFIRMED native CRS of the municipal planning layers.
 * `defaultConfidence: SEVILLA_PACK_DEFAULT_CONFIDENCE` (`estimated-ruleset`) — the honest ceiling
 * for a human/agent-read, ordinance-cited pack. `SEVILLA_ENVELOPE_VERIFIED` (above) is the
 * separate, permanently-`false`-until-signed publication gate; this confidence tier says nothing
 * about whether a number may ever reach a consumer.
 */
export const ES_SEVILLA_PGOU_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: SEVILLA_JURISDICTION_ID,
    displayName: 'Sevilla — PGOU 2006 (Texto Refundido)',
    source: 'manual',
    crs: 'EPSG:25830',
    lastReviewed: '2026-08-03',
    defaultConfidence: SEVILLA_PACK_DEFAULT_CONFIDENCE,
    zones: [
        // ── SB (Suburbana) — Capítulo V, Arts. 12.5.1–12.5.13 ───────────────────────────────
        {
            code: 'SB',
            label: 'Suburbana (PGOU Sevilla 2006, Capítulo V, Arts. 12.5.1–12.5.13)',
            permittedUse: ['residential'],
            // Art. 12.5.7 §2: "Las alturas máximas de las edificaciones se fija en los Planos de
            // Ordenación Pormenorizada Completa del Plan General. El ámbito de fijación de altura
            // será el de la manzana, o submanzana..." — height is fixed PER BLOCK on a separate
            // graphic layer (Layer 1, "Etiquetas y Altura máxima"), never a single SB-wide scalar.
            // §3 states the per-storey formula (planta baja máx. 450 cm; plantas superiores máx.
            // 320 cm each) but resolving it needs the per-block plantas count, which this pack does
            // not read (see the module header on `altura_max`'s unresolved unit). null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.5.9 — edificabilidad is a 2-AXIS TABLE (parcel size ≤/>110 m² × Nº Plantas
            // 2/3/4: 2,5/3,0/3,5 m²t/m²s for ≤110 m²; 2,2/2,5/3,2 m²t/m²s for >110 m²) — a scalar
            // here would publish one cell's answer for the whole zone (the L-526 failure, Córdoba
            // MC's own reason for `null`). DERIVED, not packed.
            plotRatioFAR: null,
            // Art. 12.5.4 §1.b — parcelas de superficie mayor a 110 m²: "el ochenta por ciento
            // (80%) en el resto de los casos" (upper floors, and ground floor where use is not
            // wholly non-residential). Parcelas ≤110 m² (§1.a) get 100 % — packing 0.80 UNDER-states
            // those smaller parcels (the safe direction), on Córdoba CTP-1's exact convention.
            maxCoverage: 0.8,
            setbacks: {
                // Art. 12.5.3: "Las edificaciones se dispondrán sobre las alineaciones a vial...
                // No se permitirán los retranqueos delanteros." — mandatory street alignment.
                front_m: 0,
                // Art. 12.5.3: "...adosadas a las medianeras colindantes." — party-wall lateral.
                side_m: 0,
                // Art. 12.5.6 §1: rear separation applies ONLY to parcelas >110 m² with fondo
                // >15 m ("separarse del lindero trasero una distancia equivalente al cuarenta por
                // ciento (40%) de la altura máxima..., y como mínimo tres (3) metros"); parcels at
                // or below either threshold — or aligned per plan with fondo <17 m — need NOT
                // separate at all. A single scalar would misstate one of the two branches depending
                // on the real parcel, so this ships `null` (unknown), never a guessed branch.
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See
            // SEVILLA_SB_FONDO_UNRESOLVED_RING for why SB cannot carry an `alignment` depth like
            // Córdoba's UAD/CTP-1 (no flat "profundidad máxima edificable" is stated for SB).
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_SB_FONDO_UNRESOLVED_RING },
            fieldProvenance: {
                maxCoverage: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.5.3 (alineación obligatoria a vial, front 0; adosada a ' +
                'medianeras, side 0), Art. 12.5.4 §1.b (ocupación 80 % en parcelas >110 m², resto de ' +
                'los casos; 100 % en parcelas ≤110 m², Art. 12.5.4 §1.a — NOT packed, see maxCoverage ' +
                'comment), Art. 12.5.6 §1 (separación a lindero trasero CONDICIONAL: 40 % de la ' +
                'altura máxima, mín. 3 m, sólo si superficie >110 m² y fondo >15 m — NOT packed as a ' +
                'scalar, see setbacks.rear_m comment), Art. 12.5.7 §§2-3 (altura fijada por manzana ' +
                'en plano separado; PB máx. 450 cm, plantas superiores máx. 320 cm — NOT packed as a ' +
                'zone scalar), Art. 12.5.9 (edificabilidad: tabla por superficie de parcela y Nº ' +
                'Plantas — ≤110 m²: 2p 2,5 / 3p 3,0 / 4p 3,5 m²t/m²s; >110 m²: 2p 2,2 / 3p 2,5 / 4p ' +
                '3,2 m²t/m²s — NOT packed as a scalar, L-526). Live zona_orden query (2026-08-03): ' +
                '{"zona_orden":"SB: Suburbana","u_global":"Residencial. Vivienda","altura_max":"4",' +
                '"enlace_np":"…06_TR_NORMAS_SB.pdf"}. ' + SB_SRC,
        },
        // ── CJ (Ciudad Jardín) — Capítulo VI, Arts. 12.6.1–12.6.6 ───────────────────────────
        {
            code: 'CJ',
            label: 'Ciudad Jardín (PGOU Sevilla 2006, Capítulo VI, Arts. 12.6.1–12.6.6)',
            // Art. 12.6.1 §1: "regulación de una tipología edificatoria de carácter mixto,
            // unifamiliares y plurifamiliares, con edificios exentos" — detached, mixed
            // single/multi-family housing.
            permittedUse: ['residential'],
            // Art. 12.6.3 §4: "Las [alturas] que se señalan en los Planos de Ordenación
            // Detallada" — fixed per-parcel/per-manzana on a separate graphic layer, never a
            // single CJ-wide scalar (the SAME structure as SB's Art. 12.5.7 §2). null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.6.3 §5: "Edificabilidad neta: La que resulte de los parámetros de ocupación
            // y altura que le sean de aplicación." Explicitly DERIVED from occupation + height,
            // never stated as its own flat scalar or table (CJ does not even have SB's Art.
            // 12.5.9-style lookup table) — a packed number here would be this pass's own
            // fabrication, not the ordinance's. null, not a guess.
            plotRatioFAR: null,
            // Art. 12.6.3 §1: "Ocupación máxima sobre rasante: El cincuenta por ciento (50%) de
            // la superficie de la parcela." A flat, unconditional zone-wide figure — unlike SB's
            // Art. 12.5.4, this one has no small-parcel exception clause in §1 itself (the
            // small-parcel exceptions live in the SEPARATE Art. 12.6.6, "parcelas existentes
            // inferiores a la mínima", not packed here — see the geometricRule/ordinanceRef note).
            maxCoverage: 0.5,
            setbacks: {
                // Art. 12.6.3 §3: "...debiendo las construcciones situarse obligatoriamente a
                // cuatro (4) metros de éste [lindero frontal]." The ONE flat, zone-wide figure
                // this article states.
                front_m: 4,
                // Art. 12.6.3 §3: "La separación mínima a linderos será equivalente a la mitad de
                // la altura (h / 2), salvo al lindero frontal..." — side AND rear are BOTH governed
                // by the same height-dependent h/2 rule (the article draws no side/rear
                // distinction at all), and height itself is not a zone-wide scalar (see
                // maxHeight_m above) — so h/2 cannot resolve to one metres figure. null, not a
                // guessed h. See SEVILLA_CJ_LINDEROS_UNRESOLVED_RING for why this ships as a
                // STRUCTURAL REFUSAL rather than a silent 0 m inset.
                side_m: null,
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal (never a front-4m-only box). See
            // SEVILLA_CJ_LINDEROS_UNRESOLVED_RING for why CJ cannot carry a flat side/rear
            // setback like Córdoba's UAD/CTP-1 (no flat metres figure is stated for CJ's side or
            // rear linderos — both are h/2, height-dependent).
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_CJ_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxCoverage: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.6.1 §1 (tipología mixta unifamiliar/plurifamiliar, ' +
                'edificios exentos), Art. 12.6.3 §1 (ocupación máxima sobre rasante 50 %), Art. ' +
                '12.6.3 §3 (separación a linderos: 4 m FIJO al lindero frontal; h/2 CONDICIONAL — ' +
                'dependiente de la altura por parcela — al resto de linderos, NOT packed as a ' +
                'scalar, see setbacks.side_m/rear_m comment), Art. 12.6.3 §4 (alturas fijadas en ' +
                'Planos de Ordenación Detallada, NOT packed as a zone scalar — mirrors SB Art. ' +
                '12.5.7 §2), Art. 12.6.3 §5 (edificabilidad neta derivada de ocupación y altura, ' +
                'sin tabla ni escalar propio, NOT packed). Art. 12.6.2 (segregación mínima 800 m², ' +
                'frente mínimo 25 m; agregación máxima 1.600 m² / 40 m frente — parcelación, not a ' +
                'buildable-envelope parameter, not packed as a field here). Art. 12.6.6 (condiciones ' +
                'para parcelas <800 m² — a THIRD conditional-by-size regime this pass read but did ' +
                'NOT pack, on the same L-526 "one scalar cannot answer a size-conditional table" ' +
                'reasoning as SB Art. 12.5.9). Read verbatim via pdftotext, printed pp. 217-219 of ' +
                '06_TR_NORMAS.pdf, 2026-08-05 — no live zona_orden="CJ" feature was queried this ' +
                'session (unlike SB), so no live-query excerpt is quoted here. ' + CJ_SRC,
        },
        // ── M (Edificación en Manzana) — Capítulo III, Arts. 12.3.1–12.3.14 ─────────────────
        {
            code: 'M',
            label: 'Edificación en Manzana (PGOU Sevilla 2006, Capítulo III, Arts. 12.3.1–12.3.14)',
            // Art. 12.3.1 §1: residential-fabric closed-block ordenación, alineada a vial y entre
            // medianeras. §2 also covers vacant land destined for the same alignment.
            permittedUse: ['residential'],
            // Art. 12.3.8 §§1-2: height fixed by NÚMERO DE PLANTAS on the Plano de Ordenación
            // Pormenorizada Completa, ámbito = manzana/submanzana (the SAME structure as SB Art.
            // 12.5.7 §2 and CJ Art. 12.6.3 §4) — never a single M-wide scalar. null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.3.9 §1: edificabilidad is a 1-AXIS TABLE keyed on Nº de plantas (3/4/5/6+ →
            // 2,40/3,20/4,00/4,80 m²t/m²s) — a scalar here would publish one row's answer for the
            // whole zone (L-526, SB Art. 12.5.9's own reasoning). DERIVED, not packed.
            plotRatioFAR: null,
            // Art. 12.3.6 §1.a: planta baja 100 % si uso no residencial en su totalidad, si no
            // hasta el 80 %; resto de plantas hasta el 80 % — FLAT, no parcel-size branch (unlike
            // SB's Art. 12.5.4 110 m² threshold). Packing 0.80, the residential-applicable figure
            // both floor tiers converge on, on SB's own convention for which branch to carry.
            maxCoverage: 0.8,
            setbacks: {
                // Art. 12.3.3: "Las construcciones dispondrán su línea de edificación sobre las
                // alineaciones exteriores... " — mandatory street alignment.
                front_m: 0,
                // Art. 12.3.3: "...y se adosarán a las medianerías colindantes." — party-wall.
                side_m: 0,
                // No article in Capítulo III (12.3.1-12.3.14, all read) states a rear-lindero
                // separation figure — the ONLY depth-limiting mechanism this chapter states is
                // Art. 12.3.6's occupation cap. A scalar here would be an invention this chapter
                // does not make. null, not a guess. See SEVILLA_M_FONDO_UNRESOLVED_RING.
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See
            // SEVILLA_M_FONDO_UNRESOLVED_RING for why M cannot carry an alignment/setback depth —
            // no flat "fondo edificable" or rear separation is stated for M at all.
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_M_FONDO_UNRESOLVED_RING },
            fieldProvenance: {
                maxCoverage: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.3.1 (ordenación en manzana cerrada, alineada a vial y ' +
                'entre medianeras), Art. 12.3.3 (alineación obligatoria a vial, front 0; adosada a ' +
                'medianerías, side 0), Art. 12.3.6 §1.a (ocupación: PB 100 % uso no residencial / ' +
                '80 % resto de casos; resto de plantas 80 % flat), Art. 12.3.8 §§1-3 (altura fijada ' +
                'por manzana/submanzana en plano separado; PB máx. 450 cm, plantas superiores máx. ' +
                '350 cm — NOT packed as a zone scalar), Art. 12.3.9 §1 (edificabilidad: tabla por ' +
                'Nº de plantas — 3p 2,40 / 4p 3,20 / 5p 4,00 / 6p+ 4,80 m²t/m²s — NOT packed as a ' +
                'scalar, L-526). No rear-lindero separation is stated anywhere in Arts. ' +
                '12.3.1-12.3.14 (all 14 read) — see setbacks.rear_m comment and ' +
                'SEVILLA_M_FONDO_UNRESOLVED_RING. Read verbatim via pdftotext, printed pp. 206-210 ' +
                'of 06_TR_NORMAS.pdf, 2026-08-05 — no live zona_orden="M" feature was queried this ' +
                'session, so no live-query excerpt is quoted here. ' + M_SRC,
        },
        // ── AD (Vivienda Unifamiliar Adosada) — Capítulo VII, Arts. 12.7.1–12.7.5 ────────────
        {
            code: 'AD',
            label:
                'Vivienda Unifamiliar Adosada (PGOU Sevilla 2006, Capítulo VII, Arts. ' +
                '12.7.1–12.7.5)',
            // Art. 12.7.1 §1: terraced single-family housing, plot/unit correlation, street as
            // the ordering element.
            permittedUse: ['residential'],
            // Art. 12.7.3 §5: "Las [alturas] establecidas en los Planos de Ordenación Pormenorizada
            // Completa" — fixed per-parcel/per-manzana on a separate graphic layer, the SAME
            // structure as SB/CJ/M. The article ALSO states an absolute never-exceed ceiling ("sin
            // que, en ningún caso pueda sobrepasar los siete (7) metros") — cited in ordinanceRef,
            // but NOT packed as maxHeight_m: a ceiling is not the per-parcel answer, and packing it
            // would silently promise every AD parcel the full 7 m regardless of its own Plano
            // determination — the same "cap ≠ scalar" reasoning as PT-CV's Art. 49.2 table in
            // esCordobaPGOU2001.ts. null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.7.3 §6: "La máxima edificabilidad neta será de 1,20 metros cuadrados de
            // techo por cada metro cuadrado de suelo de parcela neta." A FLAT, unconditional
            // zone-wide scalar — unlike SB/CJ/M, AD states its edificabilidad directly, no table,
            // no derivation-from-occupation-and-altura clause. Packed as stated.
            plotRatioFAR: 1.2,
            // Art. 12.7.3 §2: "Ocupación sobre rasante: El sesenta por ciento (60%) de la
            // superficie de la parcela." Flat, unconditional (the STANDARD-parcel regime; §7's
            // undersized-parcel branch is not packed — see AD_SRC).
            maxCoverage: 0.6,
            setbacks: {
                // Art. 12.7.3 §4: "Linderos con frente a vía pública: Cuatro (4) metros." Flat.
                front_m: 4,
                // Art. 12.7.3 §4: "Linderos laterales: ... las edificaciones se adosarán a los
                // linderos laterales." — party-wall, the zone's own name ("Adosada") IS this rule.
                side_m: 0,
                // Art. 12.7.3 §4: "Lindero trasero: Cuatro (4) metros." Flat.
                rear_m: 4,
            },
            // Every edge is a FLAT, stated figure (front/rear 4 m, side 0 m party-wall) — no
            // conditional branch, no unresolved lindero. This is Sevilla's FIRST zone that does
            // NOT need the L-616 structural-refusal guard: `kind:'setback'` publishes exactly what
            // Art. 12.7.3 §4 states, nothing constructed or guessed.
            geometricRule: { kind: 'setback', front_m: 4, side_m: 0, rear_m: 4 },
            fieldProvenance: {
                maxCoverage: SEVILLA_FIELD_PROVENANCE,
                plotRatioFAR: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
                'setback.rear': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.7.1 §1 (vivienda unifamiliar adosada, correlación ' +
                'parcela/unidad), Art. 12.7.3 §2 (ocupación sobre rasante 60 %, régimen estándar), ' +
                'Art. 12.7.3 §4 (separación a linderos: frente 4 m, trasero 4 m, laterales ' +
                'adosados/0 m — TODOS flat, packed as geometricRule kind:setback), Art. 12.7.3 §5 ' +
                '(alturas fijadas en Planos de Ordenación Pormenorizada Completa, NOT packed as a ' +
                'zone scalar; techo absoluto 7 m citado, NOT packed as maxHeight_m — see maxHeight_m ' +
                'comment), Art. 12.7.3 §6 (edificabilidad neta 1,20 m²t/m²s, flat, packed). Art. ' +
                '12.7.2 (parcelación: 120 m² mínimo, 7 m frente mínimo — not a buildable-envelope ' +
                'parameter, not packed). Art. 12.7.3 §7 (Estudio de Detalle para parcelas vacías ' +
                '>5.000 m², puede mezclar tipologías — a separate large-parcel mechanism, NOT ' +
                'packed). Read verbatim via pdftotext, printed pp. 219-221 of 06_TR_NORMAS.pdf, ' +
                '2026-08-05 — no live zona_orden="AD" feature was queried this session. ' + AD_SRC,
        },
        // ── UA (Vivienda Unifamiliar Aislada y/o Agrupada) — Capítulo VIII, Arts. 12.8.1–12.8.7 ──
        {
            code: 'UA',
            label:
                'Vivienda Unifamiliar Aislada y/o Agrupada (PGOU Sevilla 2006, Capítulo VIII, ' +
                'Arts. 12.8.1–12.8.7)',
            // Art. 12.8.1 §1: detached/grouped single-family housing, landscaped open space as a
            // characteristic element.
            permittedUse: ['residential'],
            // Art. 12.8.3 §5: "Las [alturas] establecidas en los Planos de Ordenación Detallada
            // sin que, en ningún caso, pueda sobrepasar los nueve (9) metros." Same "per-parcel
            // graphic determination + absolute ceiling" shape as AD's Art. 12.7.3 §5 — the 9 m
            // ceiling is cited (ordinanceRef) but NOT packed as maxHeight_m for the same reason.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.8.3 §6: "La máxima edificabilidad neta será de 0,60 metros cuadrados de
            // techo por cada metro cuadrado de suelo de parcela neta." Flat, unconditional — the
            // STANDARD-parcel regime (§7's undersized-parcel branch is not packed — see UA_SRC).
            plotRatioFAR: 0.6,
            // Art. 12.8.3 §2: "Ocupación sobre rasante: ... el treinta por ciento (30%) de la
            // superficie total de la parcela." Flat, standard-parcel regime.
            maxCoverage: 0.3,
            setbacks: {
                // Art. 12.8.3 §4.a: "Al lindero frontal: Seis (6) metros." Flat.
                front_m: 6,
                // Art. 12.8.3 §4.b: "Al resto de los linderos: Cinco (5) metros." — the article
                // does not distinguish side from rear; both take the same flat figure.
                side_m: 5,
                rear_m: 5,
            },
            // Every edge is a FLAT, stated figure — Sevilla's SECOND non-refused zone this pass,
            // alongside AD. `kind:'setback'` publishes exactly what Art. 12.8.3 §4 states.
            geometricRule: { kind: 'setback', front_m: 6, side_m: 5, rear_m: 5 },
            fieldProvenance: {
                maxCoverage: SEVILLA_FIELD_PROVENANCE,
                plotRatioFAR: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
                'setback.rear': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.8.1 §1 (vivienda unifamiliar aislada y/o agrupada), Art. ' +
                '12.8.3 §2 (ocupación sobre rasante 30 %, régimen estándar), Art. 12.8.3 §4 ' +
                '(separación a linderos: frontal 6 m, resto de linderos 5 m — TODOS flat, packed ' +
                'as geometricRule kind:setback), Art. 12.8.3 §5 (alturas fijadas en Planos de ' +
                'Ordenación Detallada, NOT packed as a zone scalar; techo absoluto 9 m citado, NOT ' +
                'packed as maxHeight_m), Art. 12.8.3 §6 (edificabilidad neta 0,60 m²t/m²s, flat, ' +
                'packed). Art. 12.8.2 (parcelación: 800 m² mínimo, 20 m frente mínimo — not a ' +
                'buildable-envelope parameter, not packed). Art. 12.8.3 §7 (régimen alternativo ' +
                'para parcelas preexistentes <800 m²: ocupación 40 %, frente 4 m, resto 3 m — a ' +
                'THIRD conditional-by-size regime, NOT packed, same L-526 reasoning as SB Art. ' +
                '12.5.9/CJ Art. 12.6.6). Art. 12.8.4 (agrupaciones residenciales — a separate ' +
                'grouping mechanism, NOT packed). Read verbatim via pdftotext, printed pp. 221-223 ' +
                'of 06_TR_NORMAS.pdf, 2026-08-05 — no live zona_orden="UA" feature was queried this ' +
                'session. ' + UA_SRC,
        },
        // ── CT (Conservación Tipológica) — Capítulo IX, Arts. 12.9.1–12.9.6 ─────────────────
        {
            code: 'CT',
            label: 'Conservación Tipológica (PGOU Sevilla 2006, Capítulo IX, Arts. 12.9.1–12.9.6)',
            // Art. 12.9.6 §1: uso pormenorizado principal viviendas unifamiliares y/o
            // plurifamiliares.
            permittedUse: ['residential'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: {
                // Art. 12.9.3 §1: "Las alineaciones exteriores, retranqueos y alineaciones
                // interiores... serán las grafiadas en los Planos de Ordenación Pormenorizada
                // Completa." No flat metres figure exists for ANY lindero in this chapter — the
                // WEAKEST footing of any Sevilla zone read so far (M/CJ at least state one flat
                // edge each). See SEVILLA_CT_ORDEN_UNRESOLVED_RING.
                front_m: null,
                side_m: null,
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal. No geometricRule other than explicit-area is
            // honest here: every determinant (alignment, occupation, height, FAR) is a graphic
            // plan reference this pack does not hold.
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_CT_ORDEN_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: SEVILLA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.9.1 §2 (ámbito: manzanas/parcelas grafiadas con la ' +
                'letra CT — barriadas de conservación tipológica), Art. 12.9.3 §1 (alineaciones/' +
                'retranqueos íntegramente grafiados en Planos de Ordenación Pormenorizada ' +
                'Completa, NOT packed — no flat figure exists), §2 (ocupación sobre rasante: la ' +
                'parte NO señalada como superficie libre, sin porcentaje numérico), §4 (altura: nº ' +
                'de plantas grafiado en planos, con bonificación de una planta adicional al 25% de ' +
                'ocupación, ambos NOT packed), §5 (edificabilidad derivada de ocupación y altura, ' +
                'sin escalar propio, NOT packed). Read verbatim via pdftotext, printed pp. 223-225 ' +
                'of 06_TR_NORMAS.pdf, 2026-08-05 — no live zona_orden="CT" feature was queried ' +
                'this session.',
        },
        // ── IS (Industria Singular) — Capítulo X, Art. 12.10.2 ──────────────────────────────
        {
            code: 'IS',
            label: 'Industria Singular (PGOU Sevilla 2006, Capítulo X, Art. 12.10.2)',
            permittedUse: ['industrial'],
            // Art. 12.10.2 §2.5: "no se señalan alturas en los Planos... admitiéndose una altura
            // máxima de las construcciones e instalaciones, medidas en unidades métricas de veinte
            // (20) metros" — a FLAT, explicitly NOT-per-plano ceiling (unlike SB/CJ/M/AD/UA, this
            // chapter itself says the plans do NOT fix height for IS). The exceptional 35 m branch
            // ("por justificadas razones técnicas") is NOT packed — same "cap ≠ scalar for the
            // exceptional branch" reasoning as AD/UA's own absolute ceilings, but the STANDARD 20 m
            // figure here is the article's own stated answer, not a mere ceiling, so it IS packed.
            maxHeight_m: 20,
            maxFloors: null,
            // Art. 12.10.2 §2.4: "tres (3) metros cuadrados de techo por cada dos (2) metros
            // cuadrados de suelo de parcela neta" = 1.5 m²t/m²s, flat. The exceptional +10%
            // transferencia-de-aprovechamiento branch is NOT packed (a conditional bonus, not the
            // standard answer).
            plotRatioFAR: 1.5,
            // Art. 12.10.2 §2.3: "La máxima ocupación vendrá determinada por la separación a
            // linderos" — occupation is a CONSEQUENCE of the setback, not an independently stated
            // percentage. Packing a computed number here would be this pass's own derivation, not
            // the ordinance's — left null, same reasoning IA/SA below share.
            maxCoverage: null,
            setbacks: {
                // Art. 12.10.2 §2.2: "Las nuevas edificaciones deberán estar separadas a todos los
                // linderos de parcela una distancia mínima de cinco (5) metros." Flat, ALL
                // linderos (front/side/rear undifferentiated). Pre-existing party-wall/aligned
                // buildings are grandfathered (not packed — this pack answers for new
                // construction, the standard case).
                front_m: 5,
                side_m: 5,
                rear_m: 5,
            },
            // Every edge is a FLAT, stated figure — a real footprint, no L-616 guard needed.
            geometricRule: { kind: 'setback', front_m: 5, side_m: 5, rear_m: 5 },
            fieldProvenance: {
                plotRatioFAR: SEVILLA_FIELD_PROVENANCE,
                maxHeight_m: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
                'setback.rear': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.10.1 §2 (ordenación industrial, subzona IS = Industria ' +
                'Singular), Art. 12.10.2 §2.2 (separación a todos los linderos 5 m, flat, packed ' +
                'as geometricRule kind:setback), §2.3 (ocupación derivada de la separación a ' +
                'linderos, NOT packed as its own scalar), §2.4 (edificabilidad 1,5 m²t/m²s = 3/2, ' +
                'flat, packed; excepción +10% por transferencia de aprovechamiento NOT packed), ' +
                '§2.5 (altura máxima 20 m, flat, EXPLICITLY not fixed per plano for IS — packed; ' +
                'excepción hasta 35 m por razones técnicas especiales NOT packed). Read verbatim ' +
                'via pdftotext, printed pp. 225-226 of 06_TR_NORMAS.pdf, 2026-08-05 — no live ' +
                'zona_orden="IS" feature was queried this session. ' + I_SRC,
        },
        // ── IA (Industria en Edificación Abierta) — Capítulo X, Art. 12.10.3 ────────────────
        {
            code: 'IA',
            label: 'Industria en Edificación Abierta (PGOU Sevilla 2006, Capítulo X, Art. 12.10.3)',
            permittedUse: ['industrial'],
            // Art. 12.10.3 §2.4: "altura máxima de las construcciones e instalaciones en unidades
            // métricas de quince (15) metros" — flat, explicitly stated ceiling (like IS, not a
            // per-plano-only figure). Exceptional 30 m branch (20% of floor plate) NOT packed.
            maxHeight_m: 15,
            maxFloors: null,
            // Art. 12.10.3 §2.3: "tres (3) metros cuadrados de techo por cada dos (2) metros
            // cuadrados de suelo de parcela neta" = 1.5 m²t/m²s, flat (same ratio as IS).
            plotRatioFAR: 1.5,
            // Art. 12.10.3 §2.2: "La máxima ocupación vendrá determinada por la separación a
            // linderos" — derived, not an independent flat cap. Same reasoning as IS.
            maxCoverage: null,
            setbacks: {
                // Art. 12.10.3 §2.1: "Las construcciones e instalaciones se separarán seis (6)
                // metros del lindero frontal y cinco (5) metros de los linderos laterales y
                // traseros." Flat, all three figures stated directly.
                front_m: 6,
                side_m: 5,
                rear_m: 5,
            },
            geometricRule: { kind: 'setback', front_m: 6, side_m: 5, rear_m: 5 },
            fieldProvenance: {
                plotRatioFAR: SEVILLA_FIELD_PROVENANCE,
                maxHeight_m: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
                'setback.rear': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.10.1 §2 (subzona IA = Industria en Edificación ' +
                'Abierta), Art. 12.10.3 §2.1 (separación a linderos: frente 6 m, laterales y ' +
                'traseros 5 m, TODOS flat, packed as geometricRule kind:setback), §2.2 (ocupación ' +
                'derivada de la separación a linderos, NOT packed), §2.3 (edificabilidad neta 1,5 ' +
                'm²t/m²s = 3/2, flat, packed), §2.4 (altura máxima 15 m, flat, packed; excepción ' +
                'hasta 30 m en el 20% de la planta NOT packed). Read verbatim via pdftotext, ' +
                'printed pp. 226-228 of 06_TR_NORMAS.pdf, 2026-08-05 — no live zona_orden="IA" ' +
                'feature was queried this session. ' + I_SRC,
        },
        // ── IC (Industria en Edificación Compacta) — Capítulo X, Art. 12.10.4 ───────────────
        {
            code: 'IC',
            label: 'Industria en Edificación Compacta (PGOU Sevilla 2006, Capítulo X, Art. 12.10.4)',
            permittedUse: ['industrial'],
            // Art. 12.10.4 §2.6: "La que se señala en los Planos... con máximo de doce (12)
            // metros" — per-plano determination with a stated ceiling (not IS/IA's own flat
            // figure) — NOT packed as maxHeight_m, same "cap ≠ scalar" reasoning as AD/UA.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.10.4 §2.5: "tres (3) metros cuadrados de techo por cada dos (2) metros
            // cuadrados" = 1.5 m²t/m²s, flat — the ONE figure this zone states unconditionally.
            plotRatioFAR: 1.5,
            maxCoverage: null,
            setbacks: {
                // Art. 12.10.4 §2.1: "Las construcciones se dispondrán alineadas a vial." Flat,
                // mandatory alignment = front 0.
                front_m: 0,
                // Art. 12.10.4 §2.2: side/rear separation applies ONLY to constructions built
                // after Plan entry into force on parcels >1,000 m², and even then is HEIGHT-
                // dependent (h/2, min 3 m) — §2.3 additionally allows adosado under a unitary
                // manzana-completa project. Neither a flat figure nor a resolvable one without
                // per-parcel area AND height data. null, not a guess. See
                // SEVILLA_IC_LINDEROS_UNRESOLVED_RING.
                side_m: null,
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal, on CJ's exact precedent (one flat edge, two
            // conditional ones).
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_IC_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                plotRatioFAR: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.10.1 §2 (subzona IC = Industria en Edificación ' +
                'Compacta), Art. 12.10.4 §2.1 (alineación obligatoria a vial, front 0, packed), ' +
                '§2.2 (separación a linderos laterales/traseros: h/2 mín. 3 m, CONDICIONAL a ' +
                'parcelas >1.000 m² construidas tras la entrada en vigor del Plan, NOT packed — ' +
                'see setbacks.side_m/rear_m and SEVILLA_IC_LINDEROS_UNRESOLVED_RING), §2.3 ' +
                '(adosamiento posible mediante proyecto unitario en manzana completa, a THIRD ' +
                'branch, NOT packed), §2.5 (edificabilidad neta 1,5 m²t/m²s = 3/2, flat, packed), ' +
                '§2.6 (altura señalada en planos, máximo 12 m — 15 m si manzana completa — NOT ' +
                'packed as a zone scalar). Read verbatim via pdftotext, printed pp. 228-229 of ' +
                '06_TR_NORMAS.pdf, 2026-08-05 — no live zona_orden="IC" feature was queried this ' +
                'session. ' + I_SRC,
        },
        // ── SA (Servicios Avanzados) — Capítulo XI, Arts. 12.11.1–12.11.4 ───────────────────
        {
            code: 'SA',
            label: 'Servicios Avanzados (PGOU Sevilla 2006, Capítulo XI, Arts. 12.11.1–12.11.4)',
            permittedUse: ['commercial'],
            // Art. 12.11.3 §3: "Las que se grafían en los Planos... con un máximo de veinticinco
            // (25) metros" — per-plano, with an Estudio de Detalle fallback if undetermined. NOT
            // packed as maxHeight_m; the 25 m figure is a ceiling, not the per-parcel answer, same
            // "cap ≠ scalar" reasoning as AD/UA/IC.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.11.3 §4: "dos (2) metros cuadrados de techo por cada metro cuadrado de suelo
            // de parcela neta" = 2.0 m²t/m²s, flat. Excepción +10% NOT packed.
            plotRatioFAR: 2.0,
            // Art. 12.11.3 §2: "La máxima ocupación vendrá determinada por la separación a
            // linderos" — derived, same IS/IA reasoning. Not an independent flat cap.
            maxCoverage: null,
            setbacks: {
                // Art. 12.11.3 §1: "un mínimo de cinco (5) metros a todos los linderos para
                // frontal y cuatro (4) metros de los linderos laterales y traseros." Flat, all
                // three figures stated directly.
                front_m: 5,
                side_m: 4,
                rear_m: 4,
            },
            geometricRule: { kind: 'setback', front_m: 5, side_m: 4, rear_m: 4 },
            fieldProvenance: {
                plotRatioFAR: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
                'setback.rear': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.11.1 §2 (ámbito: áreas grafiadas con las letras SA, ' +
                'esencialmente Parque Tecnológico Cartuja 93), Art. 12.11.3 §1 (separación a ' +
                'linderos: frontal 5 m, laterales y traseros 4 m, TODOS flat, packed as ' +
                'geometricRule kind:setback), §2 (ocupación derivada de la separación a linderos, ' +
                'NOT packed), §3 (alturas grafiadas en planos, máximo 25 m, NOT packed as zone ' +
                'scalar; Estudio de Detalle si no hay determinación gráfica), §4 (edificabilidad ' +
                'neta 2,0 m²t/m²s, flat, packed; excepción +10% NOT packed). Read verbatim via ' +
                'pdftotext, printed pp. 230-231 of 06_TR_NORMAS.pdf, 2026-08-05 — no live ' +
                'zona_orden="SA" feature was queried this session. ' + SA_SRC,
        },
        // ── ST-C (Servicios Terciarios, Edificación Compacta) — Capítulo XII, Art. 12.12.2 ──
        {
            code: 'ST-C',
            label:
                'Servicios Terciarios, Edificación Compacta (PGOU Sevilla 2006, Capítulo XII, ' +
                'Art. 12.12.2)',
            permittedUse: ['commercial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: {
                // Art. 12.12.2, read in full: NO separación a linderos article exists for this
                // subzone at all — §2.1 states buildings "podrán ocupar la totalidad de la
                // superficie de la parcela, siempre que no supere la edificabilidad neta" (up to
                // 100% occupation, bounded only by FAR). null is the honest answer — there is no
                // ordinance figure to report, not even a conditional one. See
                // SEVILLA_STC_ORDEN_UNRESOLVED_RING.
                front_m: null,
                side_m: null,
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal. A 100%-occupation zone with NO lindero rule and
            // table-only FAR/height would draw the WHOLE PARCEL with no geometricRule.
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_STC_ORDEN_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: SEVILLA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.12.1 §2 (ordenación servicios terciarios, letra ST, ' +
                'subzona ST-C = edificación terciaria compacta), Art. 12.12.2 §2.1 (ocupación: ' +
                'hasta el 100% de la parcela, sin retranqueo alguno, sujeta sólo a la ' +
                'edificabilidad — NOT packed, no flat figure to report), §2.2 (alturas: tabla por ' +
                'nº de plantas — 1p 4,50 / 2p 9,00 / 3p 12,50 / N>3p (Nx3,5)+2,00 m — NOT packed, ' +
                'L-526), §2.3 (edificabilidad: tabla por nº de plantas — 1p 1,00 / 2p 1,80 / ' +
                '2<N≤5p 0,7×N / 6p+ 4,00 m²t/m²s — NOT packed, L-526). No separación a linderos ' +
                'article exists anywhere in Art. 12.12.2. Read verbatim via pdftotext, printed pp. ' +
                '231-233 of 06_TR_NORMAS.pdf, 2026-08-05 — no live zona_orden="ST-C" feature was ' +
                'queried this session. ' + SA_SRC.replace('Capítulo XI', 'Capítulo XII'),
        },
        // ── ST-A (Servicios Terciarios, Edificación Abierta) — Capítulo XII, Art. 12.12.3 ───
        {
            code: 'ST-A',
            label:
                'Servicios Terciarios, Edificación Abierta (PGOU Sevilla 2006, Capítulo XII, ' +
                'Art. 12.12.3)',
            permittedUse: ['commercial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: {
                // Art. 12.12.3 §2.3: separación a linderos is a FOUR-BRACKET table keyed on
                // parcel area (<2.000 m² → 4 m; 2.001-5.000 m² → 6 m; 5.001-7.000 m² → 8 m;
                // >7.000 m² → 10 m) — the size table IS the rule here, not a secondary branch off
                // a standard regime (unlike SB/CJ/UA's own not-packed size exceptions). No single
                // figure answers every parcel. null, not a guessed bracket. See
                // SEVILLA_STA_LINDEROS_UNRESOLVED_RING.
                front_m: null,
                side_m: null,
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal, L-526 shape (parcel-size-conditional table with
            // no flat fallback figure).
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_STA_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: SEVILLA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.12.1 §2 (subzona ST-A = edificación terciaria ' +
                'abierta), Art. 12.12.3 §2.1 (ocupación sobre rasante: 60%, ó 30% en parcelas ' +
                '>5 ha — size-conditional, NOT packed), §2.3 (separación a linderos: tabla de ' +
                'CUATRO tramos por superficie de parcela — <2.000 m² 4 m / 2.001-5.000 m² 6 m / ' +
                '5.001-7.000 m² 8 m / >7.000 m² 10 m — NOT packed as a single scalar, L-526), ' +
                '§2.4 (separación entre edificios: 2h/3, o h/2 en cuerpos sobre plantas bajas — ' +
                'edificio-a-edificio, not a lindero figure, NOT packed). Read verbatim via ' +
                'pdftotext, printed pp. 233-234 of 06_TR_NORMAS.pdf, 2026-08-05 — no live ' +
                'zona_orden="ST-A" feature was queried this session. ' +
                SA_SRC.replace('Capítulo XI', 'Capítulo XII'),
        },
        // ── A (Edificación Abierta) — Capítulo IV, Arts. 12.4.1–12.4.13 ─────────────────────
        {
            code: 'A',
            label: 'Edificación Abierta (PGOU Sevilla 2006, Capítulo IV, Arts. 12.4.1–12.4.13)',
            permittedUse: ['residential'],
            // Art. 12.4.5 §2: alturas fijadas en Planos de Ordenación Pormenorizada Completa por
            // manzana/submanzana — same structure as SB/CJ/M, no absolute ceiling stated (unlike
            // AD/UA/SA/IC's own cited ceilings). null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.4.8 §1: edificabilidad is a TABLE keyed on nº de plantas (3/4/5/6/7/8/9+ →
            // 1,50/2,00/2,50/3,00/3,50/4,00/4,50 m²t/m²s) — L-526, DERIVED not packed.
            plotRatioFAR: null,
            // Art. 12.4.6 §1: "se establece la ocupación máxima sobre rasante en un sesenta por
            // ciento (60%) de la superficie de la parcela" for ocupaciones NOT predetermined by
            // pormenorizada/RI/sector conditions — a flat, unconditional standard-case figure.
            maxCoverage: 0.6,
            setbacks: {
                // Art. 12.4.3 §1: "El edificio deberá separarse de TODOS los linderos una
                // distancia mínima del cuarenta por ciento (40%) de su altura (h)" — INCLUDING the
                // front (measured from the street axis, §1 in fine) — no flat edge at all, unlike
                // CJ (flat front 4 m) or SB/M (flat front/side 0 m). Height is itself per-manzana
                // (see maxHeight_m), so 40%·h resolves to nothing without per-parcel height data.
                // null on every edge, not a guess. See SEVILLA_A_LINDEROS_UNRESOLVED_RING.
                front_m: null,
                side_m: null,
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal, WEAKER footing than CJ (no flat edge survives
            // at all here, not even the front).
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_A_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxCoverage: SEVILLA_FIELD_PROVENANCE,
                permittedUse: SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.4.1 §4 (ámbito: manzanas/áreas grafiadas con la letra ' +
                'A), Art. 12.4.3 §1 (separación a TODOS los linderos, incluido el frontal, 40% de ' +
                'la altura (h) — NOT packed as a scalar on any edge, see ' +
                'SEVILLA_A_LINDEROS_UNRESOLVED_RING), Art. 12.4.4 (separación entre edificios h/2 ' +
                '— edificio-a-edificio, not a lindero figure, NOT packed), Art. 12.4.5 §2 (alturas ' +
                'fijadas por manzana/submanzana en plano separado, NOT packed as zone scalar), ' +
                'Art. 12.4.6 §1 (ocupación máxima sobre rasante 60% para casos no predeterminados, ' +
                'flat, packed), Art. 12.4.8 §1 (edificabilidad: tabla por nº de plantas — 3p 1,50 ' +
                '/ 4p 2,00 / 5p 2,50 / 6p 3,00 / 7p 3,50 / 8p 4,00 / 9p+ 4,50 m²t/m²s — NOT packed, ' +
                'L-526). Read verbatim via pdftotext, printed pp. 210-214 of 06_TR_NORMAS.pdf, ' +
                '2026-08-05 — no live zona_orden="A" feature was queried this session.',
        },
        // ── MP (sub-ordenación de M, alineación interior) — Capítulo III, Arts. 12.3.4/12.3.6 ──
        {
            code: 'MP',
            label:
                'Edificación en Manzana — sub-ordenación Mp, alineación interior (PGOU Sevilla ' +
                '2006, Capítulo III, Arts. 12.3.4, 12.3.6 §1.b, 12.3.7 §1.b, 12.3.9 §2)',
            permittedUse: ['residential'],
            // Art. 12.3.8 (shared with M): height fixed per manzana/submanzana on the Plano de
            // Ordenación Pormenorizada Completa — same structure as M. null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.3.9 §2: "La edificabilidad máxima sobre parcela será la resultante del
            // producto de la máxima ocupación permitida sobre rasante por el número de plantas
            // establecida en los planos de ordenación" — a DERIVATION from two graphic quantities
            // (occupation, itself bounded by the interior alignment line; floor count), neither of
            // which this pack holds as a number. Cannot be resolved to a scalar or a table.
            plotRatioFAR: null,
            // Art. 12.3.6 §1.b: "la edificación podrá ocupar la totalidad del espacio comprendido
            // entre las alineaciones exteriores e interiores" — bounded by the graphic interior
            // alignment line (Art. 12.3.4), not a percentage. null, not a guess.
            maxCoverage: null,
            setbacks: {
                // Art. 12.3.3 (shared with M, applies to the whole ordenación including Mp):
                // mandatory street alignment, front = 0 — the ONE figure Mp shares with M's own
                // flat answer.
                front_m: 0,
                // Art. 12.3.4: the side/rear extent is fixed by an "alineación interior" drawn
                // GRAPHICALLY on the Planos de Ordenación — obligatory when a continuous line,
                // maximum when dashed — with NO metres figure stated anywhere in Capítulo III for
                // how deep that line sits. Worse than M's own gap (M states no rear article at
                // all; Mp's depth is explicitly governed by a real figure this pack cannot read
                // off a plan it does not hold). null, not a guess. See
                // SEVILLA_MP_INTERIOR_UNRESOLVED_RING.
                side_m: null,
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal. Front alone (0 m) with side/rear unresolved
            // would, with no geometricRule, draw an unbounded depth exactly as M's own guard
            // exists to prevent — here on an even weaker footing (a real but graphically-only
            // figure, not merely an absent one).
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_MP_INTERIOR_UNRESOLVED_RING },
            fieldProvenance: {
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.3.1 §3 (ámbito: manzanas grafiadas con la letra M o Mp, ' +
                'correspondiendo esta última a manzanas con alineación interior establecida), Art. ' +
                '12.3.3 (alineación obligatoria a vial, front 0, compartido con M, packed), Art. ' +
                '12.3.4 (alineaciones interiores GRAFICADAS en Planos de Ordenación — obligatorias ' +
                'si línea continua, máximas si discontinua — sin figura métrica en el texto, NOT ' +
                'packed as a scalar, see SEVILLA_MP_INTERIOR_UNRESOLVED_RING), Art. 12.3.6 §1.b ' +
                '(ocupación: totalidad del espacio entre alineaciones exteriores e interiores, ' +
                'bounded gráficamente, NOT packed), Art. 12.3.7 §1.b (ocupación bajo rasante: ' +
                'ídem, entre alineaciones), Art. 12.3.9 §2 (edificabilidad: producto de ocupación ' +
                'máxima × nº de plantas, ambos grafiados, NOT packed). Read verbatim via ' +
                'pdftotext, printed pp. 206-209 of 06_TR_NORMAS.pdf, 2026-08-05 — no live ' +
                'zona_orden="MP" feature was queried this session.',
        },
        // ── CH (Centro Histórico) — Capítulo II, Arts. 12.2.1–12.2.26 ───────────────────────
        {
            code: 'CH',
            label: 'Centro Histórico (PGOU Sevilla 2006, Capítulo II, Arts. 12.2.1–12.2.26)',
            // Art. 12.2.1 §1: the historic walled city plus the historic arrabales of Triana,
            // Macarena and San Bernardo — a mixed-use historic-fabric ordenación, residential is
            // the principal use this pack answers for (Art. 12.2.25 governs compatible uses).
            permittedUse: ['residential'],
            // Art. 12.2.11 §2: "El número de plantas que podrán autorizarse como máximo es el
            // marcado para cada parcela en el Plano del Centro Histórico" — fixed PER PARCEL on a
            // dedicated graphic layer, never a zone-wide scalar (the SAME structure as SB/CJ/M's
            // per-manzana height). null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.2.12 §1: "La máxima edificabilidad de cada parcela será la resultante de
            // aplicar los parámetros de máxima ocupación sobre rasante y de altura máxima" — an
            // explicit DERIVATION from two quantities this pack does not hold as scalars (occupation
            // is a computed "solar teórico" area, height is per-parcel graphic). Cannot resolve to
            // a scalar or a table. null, not a guess.
            plotRatioFAR: null,
            // Art. 12.2.9 §1: NOT a flat percentage — a COMPUTED area,
            // `Mocp = Superficie de la parcela − 0.33 × Superficie del solar teórico` (the "solar
            // teórico" itself built by offsetting the exterior alignment 5 m inward), plus FIVE
            // further size/use-conditional exceptions (§2.a–d small/single-family parcels; §4
            // rehabilitación works; §6 galerías porticadas). No single scalar can honestly stand in
            // for a formula requiring a real per-parcel polygon offset. null, not a guess.
            maxCoverage: null,
            setbacks: {
                // Art. 12.2.6 §1: "Las edificaciones dispondrán las fachadas sobre las
                // alineaciones y se adosarán a las medianerías colindantes" — mandatory street
                // alignment, the same flat figure as SB/M/AD's own front=0.
                front_m: 0,
                // Art. 12.2.6 §1 (same sentence): "...y se adosarán a las medianerías
                // colindantes." — mandatory party-wall, shared with M's own side=0.
                side_m: 0,
                // Art. 12.2.8: "Las edificaciones podrán llegar hasta el lindero trasero de la
                // parcela, excepto en aquellas que tuvieren señalada alineación interior o fondo
                // edificable en el Plano del Centro Histórico" — full depth to the rear lot line
                // is the DEFAULT case here, not merely an absent rule (worse than M's silence).
                // A metres figure would be an invention this article does not make. null, not a
                // guess. See SEVILLA_CH_OCUPACION_UNRESOLVED_RING.
                rear_m: null,
            },
            // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). Front=0 + side=0 +
            // an explicitly full-depth-by-default rear would draw the WHOLE PARCEL with no
            // geometricRule — the clearest ENVELOPE-REALISM-MATRIX mechanism-A failure in this
            // pack. See SEVILLA_CH_OCUPACION_UNRESOLVED_RING.
            geometricRule: { kind: 'explicit-area', ringRef: SEVILLA_CH_OCUPACION_UNRESOLVED_RING },
            fieldProvenance: {
                permittedUse: SEVILLA_FIELD_PROVENANCE,
                'setback.front': SEVILLA_FIELD_PROVENANCE,
                'setback.side': SEVILLA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Sevilla 2006 Art. 12.2.1 (ámbito: recinto amurallado histórico y arrabales ' +
                'de Triana, Macarena y San Bernardo; excluye edificios catalogados bajo Título ' +
                'Décimo, aplicación supletoria), Art. 12.2.6 §1 (alineación obligatoria a vial, ' +
                'front 0; adosada a medianerías, side 0), Art. 12.2.8 (fondo edificable: hasta el ' +
                'lindero trasero por DEFECTO, salvo alineación interior grafiada en el Plano del ' +
                'Centro Histórico — NOT packed as a scalar, see SEVILLA_CH_OCUPACION_UNRESOLVED_' +
                'RING), Art. 12.2.9 §1 (ocupación máxima: Mocp = Superficie parcela − 0.33 × ' +
                'Superficie del solar teórico, un ÁREA COMPUTADA vía offset geométrico de 5 m, no ' +
                'un porcentaje — NOT packed as a scalar), §2.a-d (excepciones por tamaño de ' +
                'parcela ≤100/120/200 m² — NOT packed), Art. 12.2.11 §2 (altura fijada por parcela ' +
                'en el Plano del Centro Histórico, NOT packed as zone scalar), Art. 12.2.12 §1 ' +
                '(edificabilidad derivada de ocupación × altura, ninguna es un escalar propio, NOT ' +
                'packed). Read verbatim via pdftotext, printed pp. 198-207 of 06_TR_NORMAS.pdf, ' +
                '2026-08-05 — no live zona_orden="CH" feature was queried this session. ' + CH_SRC,
        },
    ],
});

/**
 * The zone codes this pack answers for. ⚠ DERIVED from `ES_SEVILLA_PGOU_PACK.zones`, never
 * re-typed. Today: `['A', 'AD', 'CH', 'CJ', 'CT', 'IA', 'IC', 'IS', 'M', 'MP', 'SA', 'SB', 'ST-A',
 * 'ST-C', 'UA']` — ALL 15 of the live `zona_orden` universe (see the module header and
 * `SEVILLA-ENGINE-PROGRESS-2026-08-05.md` for the coverage tally). Nothing falls through to
 * `sevillaNoRulePackRefusal` unnamed by parameter any more — every live zone code resolves to a
 * named zone block, though most (9 of 15) still ship a STRUCTURAL REFUSAL `explicit-area`
 * `geometricRule`, not a real footprint.
 */
export const SEVILLA_PGOU_ZONE_CODES: readonly string[] = ES_SEVILLA_PGOU_PACK.zones
    .map((z) => z.code.toUpperCase())
    .sort();
