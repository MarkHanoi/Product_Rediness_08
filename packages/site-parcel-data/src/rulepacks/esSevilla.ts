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
// band — exactly Córdoba MC's situation, not Córdoba UAD's. No other zone code is packed: this
// pass read ONE zone's PDF, not the whole ordenanza corpus (see the SB zone block for the honesty
// scope of what was and was not read).
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
export const SEVILLA_ENVELOPE_VERIFIED: boolean = false;

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
 * The Sevilla rule pack. Carries ONE transcribed zone — `SB` (Suburbana), Capítulo V, Arts.
 * 12.5.1–12.5.13, read verbatim from the city's own per-zone PDF (see `SB_SRC`). Every OTHER
 * `zona_orden` value Layer 25 can return (`MC`, `CH`, `CT`, etc. — the founder captures' own
 * unresolved "zona_orden universe" question) is DELIBERATELY NOT packed: this pass read one
 * zone's ordinance text, not the whole PGOU-2006 corpus, and `SEVILLA_PGOU_ZONE_CODES` below is
 * derived from `zones`, never hand-typed, so an unread zone can never silently appear registered.
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
    ],
});

/**
 * The zone codes this pack answers for. ⚠ DERIVED from `ES_SEVILLA_PGOU_PACK.zones`, never
 * re-typed. Today: `['SB']` — the one zone whose ordinance text has been read. Every other Layer
 * 25 `zona_orden` value falls through to `sevillaNoRulePackRefusal` unnamed by parameter, exactly
 * as before this pass.
 */
export const SEVILLA_PGOU_ZONE_CODES: readonly string[] = ES_SEVILLA_PGOU_PACK.zones
    .map((z) => z.code.toUpperCase())
    .sort();
