// CARTAGENA (INE 30016, Región de Murcia) — the CITED-REFUSAL jurisdiction, on Sevilla SB's
// structural-refusal precedent.
//
// WHAT PRYZM CAN AND CANNOT SAY ABOUT A CARTAGENA PARCEL TODAY (measured 2026-08-04)
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CAN (VERIFIED live, this session — see `docs/04-reference/jurisdictions/es/es-mc/30016-cartagena/
// findings/CAPABILITY-RESEARCH-2026-08-04.md`):
//   • the zone identity + block-specific coefficient, from the city's own LIVE WMS
//     (`ide.cartagena.es/wms_RPG0/wmservice.aspx`, layer `Manzanas`) on the CURRENTLY-VALID R0
//     (1987) plan — `resolveCartagenaZone.ts`. The 2012 revision (`R1`) is court-annulled
//     (STSJ Murcia 2015, upheld TS 2016); R0 re-entered force automatically and is the sole
//     currently-valid instrument.
//   • height (in plantas/storeys), edificabilidad (FAR) and, for Vc1/Vc2, ocupación (coverage) —
//     read verbatim from Título Cuarto of the 1987 Normas (`ExtDoc/PLDOC/2001-0001/Normas/
//     Título 4.htm`, registration `2001-0001` — a distinct, non-annulled text from the annulled
//     `2008-0001`).
//
// CANNOT: publish a buildable FOOTPRINT. Every zone packed below states "retranqueos a vial
// obligatorios" (mandatory street setbacks) WITHOUT quantifying them in the base rule, or states
// no setback at all — exactly Sevilla SB's `SEVILLA_SB_FONDO_UNRESOLVED_RING` situation (Art.
// 12.5.6's conditional rear separation), not Zaragoza's "flat scalar stated" case. A front=0/
// side=0 assumption here would be a GUESS, not a reading — Título 4 never states either is zero.
// So every zone below ships `geometricRule: { kind: 'explicit-area', ringRef: UNRESOLVED }`: a
// hard structural refusal, never a fabricated full-parcel box (ADR-0270, the same guard Córdoba
// MC and Sevilla SB use).
//
// ⇒ THE HONEST OUTPUT REMAINS A CITED REFUSAL for every Cartagena parcel — now ZONE-NAMED AND
// PARAMETER-CITED for height/FAR/coverage — because `CARTAGENA_ENVELOPE_VERIFIED` is `false` and
// MUST stay `false` until a human signs off a transcribed pack (L-449).
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — `docs/04-reference/jurisdictions/es/es-mc/30016-cartagena/findings/
// CAPABILITY-RESEARCH-2026-08-04.md`, `providers/resolveCartagenaZone.ts`,
// `providers/containers/wmsGetFeatureInfo.ts`, C58 §1.2/§1.4/§1.7a, L-449, §CONTEXT-DATA-HONESTY,
// `esSevilla.ts` (`SEVILLA_SB_FONDO_UNRESOLVED_RING` — the structural-refusal precedent every zone
// below mirrors).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type EnvelopeRefusal,
} from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning');

/** The jurisdiction id Cartagena records and registrations use. One constant, not a literal. */
export const CARTAGENA_JURISDICTION_ID = 'es-30016-cartagena';

/**
 * ⛔ **`false`, and it MUST default `false`.** Founder-only act (L-449). Unlike Sevilla/Murcia,
 * there is a full, live, structured zone-identity pipeline behind this gate — but the FOOTPRINT
 * question (setback) is genuinely unresolved in the source text for every packed zone, so flipping
 * this flag would still authorise nothing beyond the height/FAR/coverage citation already on the
 * refusal card.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (CARTAGENA_ENVELOPE_VERIFIED)`
 * compute branch stays a real runtime check — the same reasoning `esSevilla.ts` documents.)
 */
export const CARTAGENA_ENVELOPE_VERIFIED: boolean = false;

/** The instrument any Cartagena refusal that makes a legal claim cites. */
export const CARTAGENA_PGMO_INSTRUMENT_REF =
    'Plan General Municipal de Ordenación de Cartagena de 1987 (Matrícula R0-PGMO, aprobación ' +
    'definitiva 9-abril-1987, BORM 14-abril-1987) — CURRENTLY VALID. The 2012 revision ' +
    '(expediente 2008-0001, "R1") was declared null by the Tribunal Superior de Justicia de ' +
    'Murcia (20-mayo-2015), upheld by the Tribunal Supremo (15-junio-2016); R0 re-entered force ' +
    'automatically. Zone source: ide.cartagena.es/wms_RPG0/wmservice.aspx (layer Manzanas), EPSG ' +
    'per service default. Ordinance source: urbanismo.cartagena.es/ExtDoc/PLDOC/2001-0001/Normas/ ' +
    'Título 4.htm (Título Cuarto, registration 2001-0001 — distinct from the annulled 2008-0001).';

/** The roadmap line, stated once — the same role as `SEVILLA_ROADMAP_LINE`. */
export const CARTAGENA_ROADMAP_LINE =
    'Cartagena (INE 30016) coverage today: the ZONE half is live — the city\'s own WMS ' +
    '(ide.cartagena.es/wms_RPG0, layer Manzanas) resolves the currently-valid Norma urbanística ' +
    '(zone code + block-specific coefficient, sometimes a precomputed max buildable area) for any ' +
    'point on the CURRENTLY VALID 1987 plan. Height, edificabilidad (FAR) and, for some zones, ' +
    'ocupación are read verbatim from the plan\'s own Título Cuarto. What is NOT published: the ' +
    'setback needed to place a real footprint — the ordinance states street setbacks are ' +
    'mandatory without quantifying them in the base rule. So no buildable figure can be published ' +
    'for any Cartagena parcel yet — never an estimate, never a guessed front/side/rear triple.';

/** The article-attributable part of a refusal — everything EXCEPT the per-parcel `knownFacts`. */
type ClassifiedRefusal = Omit<EnvelopeRefusal, 'knownFacts'>;

/**
 * The registry `noRulePackRefusal` / the L5 dispatch's per-parcel card: the HONEST, ZONE-NAMED,
 * PARAMETER-CITED refusal for EVERY Cartagena parcel. Mirrors `sevillaNoRulePackRefusal`'s
 * §CORDOBA-UNVERIFIED-SCOPE discipline: a card that asserted a zone/parameter it does not have
 * would overstate PRYZM's own knowledge; a card that always spoke generically even when the zone
 * WAS resolved would understate it.
 *
 * PURE; never throws. OTel span `pryzm.zoning.cartagenaNoRulePackRefusal` (P8 / C58 §1.10).
 */
export function cartagenaNoRulePackRefusal(
    zoneCode?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.cartagenaNoRulePackRefusal');
    try {
        const packed = zoneCode != null && CARTAGENA_ZONE_CODES.includes(zoneCode);
        const zone = zoneCode ? `Zone "${zoneCode}"` : 'This Cartagena parcel';

        span.setAttribute('jurisdictionId', CARTAGENA_JURISDICTION_ID);
        if (zoneCode) span.setAttribute('zoneCode', zoneCode);
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        const refusal: ClassifiedRefusal = {
            code: 'no-rule-pack',
            headline: packed
                ? `${zone} — PRYZM has identified your land and resolved it against Cartagena's ` +
                  'own live planning geometry (currently-valid 1987 plan). Height and buildability ' +
                  'ratio are cited, but no human has signed off the transcription, and the ' +
                  'setback needed to place a footprint is not published, so PRYZM will not draw ' +
                  'a buildable envelope.'
                : zoneCode
                  ? `${zone} — PRYZM resolved a zone code this transcription does not yet cover.`
                  : `${zone} — PRYZM could not resolve a zone from Cartagena's own planning geometry.`,
            detail: packed
                ? 'Título Cuarto of the 1987 PGMO (currently valid — the 2012 revision was court-' +
                  'annulled) states this zone\'s height and edificabilidad (buildability ratio), ' +
                  'but requires "retranqueos a vial obligatorios" (mandatory street setbacks) ' +
                  'without stating a metres figure in the base rule. PRYZM will not guess a ' +
                  'setback to draw a footprint — no height, buildability, occupation or setback ' +
                  'triple is published here until a Spanish-planning-literate human resolves the ' +
                  'setback question and signs sources/VERIFICATION.md.'
                : 'PRYZM queried Cartagena\'s own live WMS (ide.cartagena.es/wms_RPG0, layer ' +
                  'Manzanas, the currently-valid 1987 plan) and either could not resolve a zone at ' +
                  'this point, or resolved a code this transcription does not yet cover. ' +
                  CARTAGENA_ROADMAP_LINE,
            ordinanceRef: packed ? CARTAGENA_PGMO_INSTRUMENT_REF : null,
            legallyGrounded: false,
        };
        return { ...refusal, knownFacts: [...knownFacts] };
    } finally {
        span.end();
    }
}

/** The source Título 4 text every `ordinanceRef` below cites (fetched + transcribed 2026-08-04). */
const TITULO_4_SRC =
    'Cartagena PGMO 1987, Título Cuarto: "Normas particulares de suelo urbano" — ' +
    'urbanismo.cartagena.es/ExtDoc/PLDOC/2001-0001/Normas/Título 4.htm — human/agent-transcribed ' +
    'verbatim, article-cited, 2026-08-04.';

/** Every field below is `ordinance-pdf` (C58 §1.6) — read verbatim from the source HTML text. */
const P = 'ordinance-pdf' as const;

/**
 * ⚠ L-616 GUARD — structural refusal (never a full-parcel box). Every packed zone's setback is
 * genuinely unresolved (Título 4 requires "retranqueos a vial obligatorios" without a metres
 * figure) — mirrors `SEVILLA_SB_FONDO_UNRESOLVED_RING` exactly.
 */
export const CARTAGENA_FONDO_UNRESOLVED_RING =
    'cartagena-titulo4:UNRESOLVED/pgmo1987-art4.2.2-4.2.3-retranqueos-not-quantified' as const;

/** One shared zone-record builder — every packed Cartagena code carries a cited Título 4 reading. */
function cartagenaZone(params: {
    code: string;
    label: string;
    articleRef: string;
    maxHeight_m: number | null;
    maxFloors: number | null;
    plotRatioFAR: number | null;
    maxCoverage: number | null;
}) {
    return {
        code: params.code,
        label: params.label,
        permittedUse: ['residential'] as const,
        maxHeight_m: params.maxHeight_m,
        maxFloors: params.maxFloors,
        plotRatioFAR: params.plotRatioFAR,
        maxCoverage: params.maxCoverage,
        // ⚠ NOT 0/0/0 — a false "no setback needed" reading. Título 4 states setbacks ARE
        // required, just not quantified; null is the honest "unknown", never a fabricated zero.
        setbacks: { front_m: null, side_m: null, rear_m: null },
        geometricRule: { kind: 'explicit-area', ringRef: CARTAGENA_FONDO_UNRESOLVED_RING },
        fieldProvenance: {
            maxHeight: P,
            maxFloors: P,
            maxFAR: P,
            maxCoverage: P,
            permittedUse: P,
        },
        ordinanceRef: `${params.articleRef}. ${TITULO_4_SRC}`,
    };
}

/**
 * The Cartagena pack. Carries THREE transcribed zones — `Vc1`, `Vc2` (Vial Colectivo grados 1-2)
 * and `Vu1` (Vial Unifamiliar grado 1) — the cleanest, most-complete readings from Título 4 sampled
 * this session. `Vc3` (callejero-indexed height, no fixed value), `Cc`/`Ac`/`Au`/`Ai`/`E` families
 * are DELIBERATELY NOT packed: this pass read the Vc/Vu articles, not the whole Título 4 corpus.
 * `CARTAGENA_ZONE_CODES` is derived from `zones`, never hand-typed.
 */
export const ES_CARTAGENA_PGMO1987_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: CARTAGENA_JURISDICTION_ID,
        displayName: 'Cartagena — PGMO 1987 (Título Cuarto, vigente)',
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-08-04',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            cartagenaZone({
                code: 'Vc1',
                label: 'Vial Colectivo, Grado 1º (PGMO 1987 Art. 4.2.2)',
                articleRef: 'Art. 4.2.2 §3: parcela mínima 120 m², ancho lindero frontal mín. 7 m, ' +
                    'edificabilidad 1,4 m²/m² (salvo índice específico en planos), altura máxima ' +
                    '2 plantas, ocupación máxima 70%, retranqueos a vial obligatorios (no ' +
                    'cuantificados en la norma base)',
                maxHeight_m: null, // stated in plantas only — no metres figure in the base rule.
                maxFloors: 2,
                plotRatioFAR: 1.4,
                maxCoverage: 0.70,
            }),
            cartagenaZone({
                code: 'Vc2',
                label: 'Vial Colectivo, Grado 2º (PGMO 1987 Art. 4.2.2)',
                articleRef: 'Art. 4.2.2 §3: parcela mínima 120 m², ancho lindero frontal mín. 7 m, ' +
                    'edificabilidad 2,1 m²/m², altura máxima 3 plantas, ocupación máxima 70%, ' +
                    'retranqueos a vial obligatorios (no cuantificados en la norma base)',
                maxHeight_m: null,
                maxFloors: 3,
                plotRatioFAR: 2.1,
                maxCoverage: 0.70,
            }),
            cartagenaZone({
                code: 'Vu1',
                label: 'Vial Unifamiliar, Grado 1º (PGMO 1987 Art. 4.2.3)',
                articleRef: 'Art. 4.2.3 §3: parcela mínima 120 m², ancho lindero frontal mín. 8 m, ' +
                    'edificabilidad 0,7 m²/m², altura máxima 1-2 plantas; ocupación y ' +
                    'retranqueos no cuantificados en la norma base',
                maxHeight_m: null,
                maxFloors: 2,
                plotRatioFAR: 0.7,
                maxCoverage: null,
            }),
        ],
    });

/**
 * The zone codes this pack answers for. ⚠ DERIVED from `ES_CARTAGENA_PGMO1987_PACK.zones`, never
 * re-typed.
 */
export const CARTAGENA_ZONE_CODES: readonly string[] = ES_CARTAGENA_PGMO1987_PACK.zones
    .map((z) => z.code)
    .sort();
