// EL SAUZAL (INE 38041, Tenerife, Canarias) — Normativa Urbanística, Título X Capítulo Tercero
// (Zona Residencial, Tipología Ciudad Jardín), the ONE zone family this transcription can cite.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS READ, AND WHY THIS IS NOT THE CANARIAS SIPU `EDIF` PATTERN
// ═════════════════════════════════════════════════════════════════════════════════════════════
// El Sauzal's SIPU package (opendata.sitcan.es, `planeamiento-urbanistico-de-el-sauzal`) ships NO
// `EDIF.mdb` — the file `esCanariasSipu.ts` / `esTeldePgo2003.ts` machinery is built around. Its
// ZUSO package (`02SIST/ZUSO.shp` + `.dbf`) carries only `ETIQUETA, CODIGO, ETIPLAN, TXTPLAN,
// OBS, PDF, CAPA` — a zoning-USE geometry layer, no numeric column at all (confirmed by a proper
// DBF header parse, not a grep — see `resolveElSauzalZone.ts`). So the numeric envelope in this
// file comes from a DIFFERENT document entirely: the PGOU's own "Normativa Urbanística"
// (Revisión del PGO de El Sauzal, Adaptación a las DOG y DOT, Aprobación Definitiva —
// Subsanación Deficiencias COTMAC octubre 2010; downloaded from
// `https://eadmin.elsauzal.es/publico/descargar/278052`, 340 pages, `pdftotext -layout` read
// 2026-08-03), NOT the standalone "Ordenanzas Municipales de Edificación y Urbanización" (ENERO
// 2007 text, re-approved BOP 077/21 28/06/2021, `https://www.elsauzal.es/wp-content/uploads/
// 2021/10/ORDENANZAS-MUNICIPALES-DE-EDIFICACION-Y-URBANIZACION.pdf`). That second document was
// read in full too (61 pages) and is GENERIC/DEFINITIONAL ONLY — it defines what "retranqueo",
// "altura de edificación", "fondo edificable" MEAN (Art. 1.2: "los parámetros urbanísticos … se
// refieren a los establecidos en estas Ordenanzas"), but states no per-zone numbers itself; the
// actual figures live in the Normativa's Título X, exactly as Título X Art. 10.1 says: "condiciones
// particulares que junto con las generales reguladoras de la edificación (Ordenanzas Municipales
// de Edificación y Urbanización) … ordenan la edificación".
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY ONLY "CIUDAD JARDÍN" (`RE-ViUf-*`) IS PACKED, AND `RE-ViCo-*` / EVERYTHING ELSE IS NOT
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Título X has THREE typology chapters — Capítulo 1 "Edificación Cerrada", Capítulo 2 "Edificación
// Abierta", Capítulo 3 "Ciudad Jardín" — and Art. 10.1 states EVERY area's actual typology
// assignment is decided by a per-area "fichero de ordenación anexo a estas Normas Urbanísticas"
// (repeated verbatim at Arts. 10.10.5, 10.15, 10.16, 10.21, 10.25, 10.31, 10.32). ⚠⚠ THAT ANNEX
// WAS NOT FOUND IN THE 340-PAGE PDF READ: the extracted body runs Título I → VI (p.1-94), then
// Título X Capítulos 1-3 (p.137-149), then jumps straight to Título XI (p.151) — no fichero pages
// were present in the text this session could extract. See `EL_SAUZAL_FICHERO_ANEXO_GAP` below.
//
// Only ONE typology-to-code correspondence is stated IN THE ARTICLE TEXT ITSELF, not merely
// inferred from a missing annex: Art. 10.24.1 — "Su uso principal es el Residencial en la
// modalidad de vivienda unifamiliar" for Ciudad Jardín — and the `ZUSO.dbf` `ETIQUETA` family
// `RE-ViUf-*` literally encodes "REsidencial-VIvienda-UFamiliar". `RE-ViCo-*` ("VIvienda-COlectiva")
// could belong to EITHER Capítulo 1 (Edificación Cerrada, whose own Art. 10.2 also states "uso
// caracterísitico … el Residencial" with no unifamiliar/colectiva distinction) OR Capítulo 2
// (Edificación Abierta, likewise undifferentiated) — resolving which requires the missing fichero,
// so `RE-ViCo-*` is deliberately NOT packed here (see `EL_SAUZAL_ZONE_CODES` — it names ONLY the
// 17 `RE-ViUf-N` codes actually present in `ZUSO.dbf`, N = 1..17).
//
// ⚠ EVEN THE `RE-ViUf-*` ↔ CIUDAD JARDÍN BINDING IS AN INFERENCE FROM ARTICLE TEXT + GIS-LABEL
// NAMING, NOT A CONFIRMED DIRECT CROSS-REFERENCE TABLE — the honest gap is recorded, never hidden,
// exactly the discipline Zaragoza's §ZGZ-TRAVESIA-GAP and Córdoba's named gaps use.
//
// ⛔⛔ THIS IS NOT AN AUTHORISATION. `EL_SAUZAL_ENVELOPE_VERIFIED` is `false` and NOTHING in this
// file may flip it — a signature is a founder act (L-449); a model flipping it is the L-677
// defect. `siteDispatch.ts` is DELIBERATELY NOT WIRED for El Sauzal in this change: two other
// agents are concurrently editing that file for Telde/Sevilla, and — more importantly — the
// `RE-ViUf` ↔ Ciudad Jardín correspondence above is an inference this transcription cannot
// upgrade past `estimated-ruleset` without the fichero anexo, so wiring dispatch today would add
// surface area without adding anything a human could sign off on faster.
//
// PURITY: L2-pure. Data + a Zod-parsed pack. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — ADR-0279, C58 §1.4/§1.6/§1.7a, §CONTEXT-DATA-HONESTY,
// `resolveElSauzalZone.ts`, `elSauzalBbox.ts`, Zaragoza's `esZaragoza.ts` / `esAragon.ts`
// (the structural + honesty-gate template this file follows).

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type EnvelopeRefusal,
} from '@pryzm/schemas';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning.el-sauzal');

/** The INE-code-derived jurisdiction id, matching the `es-<INE>-<slug>` convention every sibling
 * pack (`ZARAGOZA_JURISDICTION_ID`, `TELDE_JURISDICTION_ID`) uses. */
export const EL_SAUZAL_JURISDICTION_ID = 'es-38041-el-sauzal';

/**
 * ⚠ THE HONESTY GATE. `false` — and stays `false` until a Spanish-planning-literate human (a)
 * locates and reads the "fichero de ordenación anexo" Título X repeatedly defers to, confirming
 * or correcting the `RE-ViUf-*` ↔ Ciudad Jardín typology binding, and (b) signs
 * `sources/VERIFICATION.md` for El Sauzal. See the header for exactly what is and is not
 * established today.
 */
export const EL_SAUZAL_ENVELOPE_VERIFIED: boolean = false;

/** The source every `ordinanceRef` below cites for the numeric Ciudad Jardín parameters. */
const SRC_NORMATIVA =
    'Revisión del PGO de El Sauzal, Adaptación a las DOG y DOT — Normativa Urbanística, ' +
    'Aprobación Definitiva (Subsanación Deficiencias COTMAC octubre 2010), Título X: ' +
    '"Condiciones Particulares de las Tipologías Edificatorias", Capítulo Tercero: "Condiciones ' +
    'Particulares de la Zona Residencial en Tipología Ciudad Jardín" (pp.147-149). Downloaded ' +
    'from https://eadmin.elsauzal.es/publico/descargar/278052, read via pdftotext -layout, ' +
    '2026-08-03 — human/agent-transcribed verbatim, article-cited, NOT machine-OCR pipeline output.';

/** The source the generic definitional articles (retranqueo/altura/fondo meanings) come from. */
const SRC_ORDENANZAS =
    'Ordenanzas Municipales de Edificación y Urbanización de El Sauzal (texto ENERO 2007, ' +
    're-aprobado BOP 077/21, 28/06/2021) — ' +
    'https://www.elsauzal.es/wp-content/uploads/2021/10/ORDENANZAS-MUNICIPALES-DE-EDIFICACION-Y-URBANIZACION.pdf, ' +
    'read via pdftotext -layout, 2026-08-03. GENERIC/DEFINITIONAL ONLY — carries no per-zone numbers.';

/**
 * ⭐ THE NAMED, NOT HIDDEN, GAP. Título X's own text (Arts. 10.1, 10.10.5, 10.15, 10.16, 10.21,
 * 10.25, 10.31, 10.32) repeatedly defers final per-area figures to a "fichero de ordenación
 * anexo a estas Normas Urbanísticas" this transcription did not find in the 340-page PDF body
 * (Título VI ends at p.94 of the extracted text; Título X's three chapters run p.137-149; Título
 * XI starts immediately after — no annex/fichero pages appeared in what `pdftotext` extracted).
 * Until that annex is read, the generic Capítulo Tercero parameters below are the ONLY citable
 * figures for `RE-ViUf-*`, and any of the 17 codes MAY carry a per-area override this pack does
 * not know about. Packing the generic figures (rather than refusing outright) mirrors Zaragoza's
 * A1/4.1 fixed-scalar treatment: the ordinance states these as the default UNLESS the fichero
 * says otherwise, which is a real, citable statement — not a guess.
 */
export const EL_SAUZAL_FICHERO_ANEXO_GAP =
    'Título X (Arts. 10.1, 10.10.5, 10.15, 10.16, 10.21, 10.25, 10.31, 10.32) repeatedly defers ' +
    'to a per-area "fichero de ordenación anexo a estas Normas Urbanísticas" for the FINAL figure ' +
    'on each zone. That annex was NOT present in the 340-page PDF body this session extracted ' +
    '(Título VI ends p.94; Título X Cap.1-3 run p.137-149; Título XI begins immediately after). ' +
    'The Capítulo Tercero (Ciudad Jardín) parameters packed here are the ORDINANCE-STATED ' +
    'GENERIC DEFAULT for the typology, per Art. 10.25\'s unconditional phrasing (unlike Art. ' +
    '10.15\'s Edificación Abierta, which explicitly says "salvo … fichero" in the same sentence, ' +
    'Art. 10.25 states the Ciudad Jardín figures with no such qualifier) — but ANY specific ' +
    '`RE-ViUf-N` area MAY carry an unread fichero override. Never silently applied past this ' +
    'caveat, never silently omitted from the record.';

/**
 * ⭐ THE SECOND NAMED GAP: the `RE-ViUf` ↔ "Ciudad Jardín" (Título X Capítulo 3) correspondence
 * is an INFERENCE, not a confirmed direct cross-reference. See the file header's "WHY ONLY
 * CIUDAD JARDÍN" section for the full reasoning (Art. 10.24.1's "vivienda unifamiliar" binding +
 * the ETIQUETA's own naming).
 */
export const EL_SAUZAL_TYPOLOGY_BINDING_INFERENCE =
    'RE-ViUf-* is bound to Título X Capítulo Tercero (Ciudad Jardín) by inference: Art. 10.24.1 ' +
    'states Ciudad Jardín\'s principal use is "Residencial en la modalidad de vivienda ' +
    'unifamiliar", and ZUSO.dbf\'s ETIQUETA family "RE-ViUf" reads as REsidencial-VIvienda-' +
    'UFamiliar — a naming match, not a confirmed fichero cross-reference. RE-ViCo-* ' +
    '("VIvienda-COlectiva") is NOT packed for exactly the same reason it cannot be resolved the ' +
    'same way: both Capítulo 1 (Edificación Cerrada) and Capítulo 2 (Edificación Abierta) state ' +
    'an undifferentiated "uso característico … Residencial" with no unifamiliar/colectiva split ' +
    'in the article text itself.';

/** The 17 `RE-ViUf-N` codes actually present in `ZUSO.dbf`'s `ETIQUETA` column (N = 1..17). */
export const EL_SAUZAL_ZONE_CODES = Array.from(
    { length: 17 },
    (_, i) => `RE-ViUf-${i + 1}`,
) as readonly string[];

/**
 * The pack's declared ceiling (C58 §1.6). `estimated-ruleset` — never higher: the figures are a
 * human/agent-transcribed GENERIC typology default (Art. 10.25), not a per-area fichero reading,
 * and the typology binding itself is an inference (see the two named gaps above).
 */
export const EL_SAUZAL_PACK_DEFAULT_CONFIDENCE = 'estimated-ruleset' as const;

/** Every field in this pack is `ordinance-pdf` — a human/agent read and typed it from real text. */
const P = 'ordinance-pdf' as const;

const CIUDAD_JARDIN_ORDINANCE_REF =
    'Art. 10.24 (definición, ámbito y uso principal: vivienda unifamiliar); Art. 10.25 ' +
    '(parámetros: superficie normativa mínima de parcela 400 m², diámetro del círculo ' +
    'inscribible mínimo 15 m, edificabilidad neta máxima 0,60 m²/m², altura máxima en número de ' +
    'plantas sobre rasante: 2 plantas (8,44 m) medidas respecto al "perfil característico", ' +
    'ocupación normativa máxima 33 %); Art. 10.27 (separaciones mínimas a linderos: laterales y ' +
    'posterior ≥ 3 m, frontal ≥ 5 m); Art. 10.31 (altura reguladora máxima, fórmula H máx. = ' +
    '1,40 + 3,80 + 3,24·(n−1), n = 2 ⇒ 8,44 m — confirms Art. 10.25\'s stated figure); Art. ' +
    '10.32 (longitud máxima horizontal de fachada 30 m, salvo determinación expresa en los ' +
    'cuadros de tipologías y en la tabla resumen [not modelled — a per-area override, see ' +
    'EL_SAUZAL_FICHERO_ANEXO_GAP]). ' +
    SRC_NORMATIVA +
    ' Generic definitions (retranqueo, altura de edificación, fondo edificable) per ' +
    SRC_ORDENANZAS;

/** One shared zone template — every `RE-ViUf-N` code carries the SAME cited generic figures. */
function ciudadJardinZone(code: string) {
    return {
        code,
        label: `El Sauzal, ${code} — Zona Residencial, Tipología Ciudad Jardín (Normativa Urbanística Art. 10.24-10.32)`,
        permittedUse: ['residential'] as const,
        maxHeight_m: 8.44,
        maxFloors: 2,
        plotRatioFAR: 0.6,
        maxCoverage: 0.33,
        setbacks: { front_m: 5, side_m: 3, rear_m: 3 },
        geometricRule: null,
        fieldProvenance: {
            maxHeight: P,
            maxFloors: P,
            maxFAR: P,
            maxCoverage: P,
            'setback.front': P,
            'setback.side': P,
            'setback.rear': P,
            permittedUse: P,
        },
        ordinanceRef: CIUDAD_JARDIN_ORDINANCE_REF,
    };
}

/**
 * El Sauzal pack: the 17 `RE-ViUf-N` "Ciudad Jardín" zones, and ONLY those — every other
 * `ZUSO.dbf` ETIQUETA (RE-ViCo-*, CO-*, IE-*, IN-In, TE-Co, …) resolves `ok: true` from
 * `resolveElSauzalZone` but is NOT in this pack, so it falls to `elSauzalNoRulePackRefusal`
 * rather than to a guessed number.
 */
export const ES_EL_SAUZAL_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: EL_SAUZAL_JURISDICTION_ID,
    displayName: 'El Sauzal — PGOU Normativa Urbanística, Título X Cap.3 (Ciudad Jardín / RE-ViUf)',
    source: 'manual',
    crs: 'EPSG:32628',
    lastReviewed: '2026-08-03',
    defaultConfidence: EL_SAUZAL_PACK_DEFAULT_CONFIDENCE,
    zones: EL_SAUZAL_ZONE_CODES.map(ciudadJardinZone),
});

/**
 * A named, cited refusal for an El Sauzal parcel that resolved to a REAL `ZUSO.dbf` zone but
 * either (a) is not in `EL_SAUZAL_ZONE_CODES` (e.g. `RE-ViCo-7`, `CO-ElPt-1` — resolved, real,
 * un-packed) or (b) IS packed but the honesty gate is shut (`EL_SAUZAL_ENVELOPE_VERIFIED` false).
 * Mirrors `zaragozaNoRulePackRefusal` / `canariasNoRulePackRefusal` — never a bare "not found".
 */
export function elSauzalNoRulePackRefusal(
    zoneCode: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.elSauzalNoRulePackRefusal');
    try {
        span.setAttribute('jurisdictionId', EL_SAUZAL_JURISDICTION_ID);
        if (zoneCode) span.setAttribute('zoneCode', zoneCode);
        const zone = zoneCode ? `Zone "${zoneCode}"` : 'This El Sauzal parcel';
        const packed = zoneCode != null && EL_SAUZAL_ZONE_CODES.includes(zoneCode);
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            code: 'no-rule-pack',
            headline: !EL_SAUZAL_ENVELOPE_VERIFIED
                ? packed
                    ? `${zone} — PRYZM has identified your land and resolved it against El ` +
                      "Sauzal's own SIPU zoning geometry, offline. A cited Ciudad Jardín " +
                      'ruleset exists for this zone, but no human has signed off the ' +
                      'transcription, so PRYZM will not publish a buildable figure.'
                    : `${zone} — PRYZM has identified your land and resolved it against El ` +
                      "Sauzal's own SIPU zoning geometry, offline. This zone falls outside the " +
                      'packed Ciudad Jardín (RE-ViUf-*) family this transcription covers, so ' +
                      'PRYZM will not publish a buildable figure.'
                : `${zone} carries no packed ruleset in El Sauzal's jurisdiction contract.`,
            detail: packed
                ? 'Título X, Capítulo Tercero (Ciudad Jardín, Arts. 10.24-10.32) of the PGOU ' +
                  'Normativa Urbanística states the generic parameters for this typology, but ' +
                  'Título X repeatedly defers the FINAL per-area figure to a "fichero de ' +
                  'ordenación anexo" this transcription did not find, and the RE-ViUf ↔ Ciudad ' +
                  'Jardín typology binding itself is an inference from article text, not a ' +
                  'confirmed cross-reference (see EL_SAUZAL_FICHERO_ANEXO_GAP and ' +
                  'EL_SAUZAL_TYPOLOGY_BINDING_INFERENCE in esElSauzal.ts). No height, ' +
                  'buildability, occupation or setback is published here — never an estimate, ' +
                  'never a proxy figure — until a Spanish-planning-literate human reads the ' +
                  'annex and signs sources/VERIFICATION.md.'
                : 'The parcel is established from El Sauzal\'s own SIPU ZUSO shapefile ' +
                  '(ETIQUETA), read offline from a committed extract of the municipality\'s own ' +
                  'published package. Its governing typology (Edificación Cerrada / Abierta / ' +
                  'other) requires the unread "fichero de ordenación anexo" (see ' +
                  'EL_SAUZAL_FICHERO_ANEXO_GAP in esElSauzal.ts) and PRYZM will not guess it.',
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}
