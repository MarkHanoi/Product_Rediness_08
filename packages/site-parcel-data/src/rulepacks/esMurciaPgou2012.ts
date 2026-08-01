// ── MURCIA (INE 30030) — PGOU, Normas Urbanísticas, Texto Refundido diciembre 2012. ─────────
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SOURCE, AND ITS AUTHORITY STATUS — read this before trusting one number
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Document : «PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA — Texto Refundido. diciembre 2012.
//             VOLUMEN 11 — NORMAS URBANÍSTICAS», Ayuntamiento de Murcia, Concejalía de Urbanismo
//             y Vivienda. 205 pp, born-digital (not a scan), page furniture on every page reading
//             "PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA. TR diciembre 2012 / VOL 11 - NN UU".
// Retrieved: http://urbanismo.murcia.es/infourb/documentos/
//              Normas_Urbanísticas_del_Plan_General_Texto_Refundido_diciembre_de_2012.pdf
//            (2026-08-01, HTTP 200, 2 352 553 bytes). Embedded PDF title: `TR PG vol_11 NN
//            UU.signed.pdf` — i.e. the municipality's own SIGNED consolidation artefact.
//
// ⚠ AUTHORITY STATUS, STATED HONESTLY AND NOT OVERSOLD:
//   • This is a *Texto Refundido* — a CONSOLIDATION of the PGOU as revised, published by the
//     planning authority itself on its own urbanismo portal. It is the working normative text.
//   • It carries NO "documento sin valor normativo" disclaimer. That was checked, not assumed:
//     the strings «sin valor normativo» and «valor normativo» appear ZERO times in the 205 pp.
//   • It is NOT the BORM gazette publication of the approval resolution. The BORM reference for
//     the approval of the PGOU revision is **NOT-LOCATED-IN-SOURCE**: the consolidated text
//     mentions "BORM" exactly once, and only in Disposición Transitoria Tercera, referring to the
//     publication of the *aprobación inicial* — never citing its own approval instrument.
//     ⇒ RECORDED AS `not-located-in-source`, NOT as "does not exist". A confident citation to an
//     approval instrument we have not read is exactly the anachronistic-citation failure the
//     Barcelona work had to re-sign. We cite the document we actually read, and nothing more.
//   • A SECOND, MORE RECENT consolidation exists and was also retrieved:
//     https://www.murcia.es/documents/2423107/2455459/
//       normas_urbanisticas_adaptadas_legislacion_regional.pdf — «NORMAS URBANÍSTICAS REFUNDIDAS
//     ADAPTADAS A LS REG. act. 28_02_2017», 196 pp, "Documento adaptado al Decreto Legislativo
//     1/2005". It is the version linked from the municipality's public *Normas Urbanísticas* page.
//     ⚠ EVERY ARTICLE QUOTED BELOW WAS TAKEN FROM THE 2012 TR. Whether the 2017 re-edition alters
//     any of them is UNVERIFIED and is a named pre-signature task (see NEXT.md). Do not assume
//     concordance.
//
// Art. 1.1.1.2 (verbatim): «La vigencia de este Plan general se iniciará el día siguiente a la
// publicación del acuerdo de su aprobación definitiva, y mantendrá su vigencia indefinidamente,
// salvo posterior revisión o sustitución por un nuevo planeamiento definitivamente aprobado.»
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PACK IS FOR, AND WHY IT CANNOT COVER MURCIA
// ══════════════════════════════════════════════════════════════════════════════════════════════
// MEASURED, on the municipality's own published geometry (23 066 in-force calificación polygons
// from `Murcia:pgou_alineaciones`, joined to `Murcia:pgou_sectores` for `clase_suelo`; areas by
// shoelace in EPSG:25830; denominator = PRIVATE BUILDABLE land per L-656, 75.145 km²):
//
//     PGOU-DIRECT   24.800 km²   33.0 %
//     DELEGATED     50.345 km²   67.0 %      ← to a Plan Parcial / PERI / ED / prior instrument
//
// So two thirds of Murcia's buildable land is NOT governed by the articles below, and no amount
// of transcription reaches it. That is the CEILING of this city, and it is the same shape as
// Barcelona's 62.8 % `PD*` finding — not a coverage gap in PRYZM.
//
// The delegation is stated by the plan in its own words, and each branch has its own article:
//   • Art. 6.2.2.3 — suelo urbanizable: «Los planes parciales o especiales desarrollarán la
//     ordenación de acuerdo con las determinaciones vinculantes asignadas a su sector en la ficha
//     correspondiente al mismo.»                                                    (20.5 % of buildable)
//   • Arts. 5.25.3.3 and 5.26.3.3 — the *calificación genérica* codes, VERBATIM: «el alcance de
//     los códigos de calificación zonal de los suelos edificables dentro del ámbito, reflejados en
//     los planos, se reduce a las condiciones de uso y tipología de las edificaciones, **pero no a
//     los parámetros definitorios de la altura o edificabilidad**. En ocasiones se recurre en los
//     planos a indicaciones de calificación genérica (RX, RJ, RS, UC, IP, TC, GP, AE)…»
//     Art. 6.5.1: «Dentro de la ordenación **orientativa** que reflejan los planos … los terrenos
//     genéricamente destinados a los usos globales … de las zonas ZG, ZI, ZT y ZP se califican
//     respectivamente con los códigos GP, IP, TC y AE.»                             (30.2 % of buildable)
//   • Arts. 5.24.5 / 5.24.6 — RR / TR / IR / GR, remitted by name to the convalidated prior
//     instrument.                                                                  (11.2 % of buildable)
//   • Arts. 5.24 / 5.25 / 5.26 / 6.6 — ámbitos UA, UH, UM, UE, UD, TA, TM, P*.       (5.1 % of buildable)
//
// ⇒ THE EXISTING CITED REFUSALS ARE CORRECT ANSWERS, NOT GAPS, AND THEY STAY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FOUR-STATE CLASSIFICATION — the method is EXTRACTION-PROTOCOL.md, and it is mandatory
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every parameter below is classified STATED / CONSTRUCTED / NOT-THE-RULE-KIND / UNKNOWN. The
// two-state "value or unknown" collapse produces wrong engines:
//   • CONSTRUCTED is ENGINEERING, not transcription. Murcia's per-street-width height tables
//     (Arts. 5.3.3, 5.5.3, 5.7.3) and the MZ *edificabilidad* (Art. 5.6.3.2) are algorithms over
//     an input PRYZM does not hold for Murcia. No signature turns them into a number, so their
//     zones are REFUSED here rather than packed at a guessed street width.
//   • NOT-THE-RULE-KIND is a FINDING. MC/MG/RM/RD1 have no per-parcel FAR **by design** — the
//     envelope is fixed by alineación + profundidad edificable + altura, so a null FAR is the
//     ordinance working, not a hole. RB/RU/RT-(a) are regulated against the EXISTING building, so
//     they have no greenfield envelope at all.
//   • `no-limit` is its own finding and lives in `MURCIA_NO_LIMIT_FINDINGS`. It is NEVER encoded
//     as a large number and never as 0 (C58 §1.7a; L-616).
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. OTel span on the one exported
// resolver (P8 / C58 §1.10).
//
// Strategic context — C58 §1.2/§1.4/§1.7a/§1.11, C60, C63, L-656, ADR-0270 (rule KIND), and
// docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/claus/EXTRACTION-PROTOCOL.md.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type ZoningRule,
} from '@pryzm/schemas';
import { MURCIA_JURISDICTION_ID } from './esMurciaEnvelope.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The one citation stem every value in this pack hangs from. */
export const MURCIA_PGOU_SOURCE =
    'PGOU de Murcia — Normas Urbanísticas, Texto Refundido diciembre 2012, Volumen 11 ' +
    '(Ayuntamiento de Murcia, Concejalía de Urbanismo y Vivienda; urbanismo.murcia.es, ' +
    'archivo firmado «TR PG vol_11 NN UU.signed.pdf»)';

/**
 * ⚠ NOT the BORM approval reference — we do not hold one.
 *
 * Recorded as its own constant so no reader mistakes the CONSOLIDATION we read for the GAZETTE
 * INSTRUMENT we did not. "Not located" is not "does not exist" (EXTRACTION-PROTOCOL §3).
 */
export const MURCIA_PGOU_BORM_REFERENCE = 'not-located-in-source' as const;

/**
 * The honesty tier for every value here.
 *
 * `ordinance-pdf` — a human read the article in the municipality's own born-digital normative PDF
 * and quoted it verbatim into `ordinanceRef`. That is strictly ABOVE Córdoba's machine-extracted
 * `pipeline-extracted`, and strictly BELOW an official determination.
 */
export const MURCIA_FIELD_PROVENANCE = 'ordinance-pdf' as const;

/** The four legal situations a parameter can be in. Never two. */
export type MurciaParameterState =
    /** A scalar written in the text. Quote it and ship it. */
    | 'stated'
    /** The ordinance gives a PROCEDURE, not a figure. Engineering, never transcription. */
    | 'constructed'
    /** The land is regulated by a different mechanism, so the field has no value BY DESIGN. */
    | 'not-the-rule-kind'
    /** Genuinely not held. */
    | 'unknown';

/** At what spatial unit a parameter is fixed. A sector FAR shown as a parcel FAR is a category error. */
export type MurciaGranularity = 'parcel' | 'block' | 'sector' | 'municipality';

/** One calificación's classification record — the machine-readable form of the dossier table. */
export interface MurciaCalificacionClassification {
    /** The calificación code as Murcia publishes it in `Murcia:pgou_alineaciones.calificacion`. */
    readonly code: string;
    /** Official designation, verbatim from the chapter heading. */
    readonly label: string;
    /** The governing chapter/article of the Normas Urbanísticas. */
    readonly article: string;
    /** ADR-0270 / C58 §2.2 — the wrong KIND is a wrong SHAPE, not a wrong number. */
    readonly ruleKind: 'setback' | 'alignment' | 'block-derived-alignment' | 'tiered-occupation' | 'coverage-and-far' | 'existing-building-derived';
    readonly granularity: MurciaGranularity;
    readonly height: MurciaParameterState;
    readonly depthOrSetback: MurciaParameterState;
    readonly far: MurciaParameterState;
    readonly coverage: MurciaParameterState;
    /** Does this pack publish an envelope for the code, or a cited refusal? */
    readonly packed: boolean;
    /** Why, in one line, with the article that decides it. */
    readonly note: string;
}

/**
 * THE CALIFICACIÓN TABLE. Every row is a legal reading, and every `packed:false` row names the
 * article that makes the refusal correct rather than lazy.
 *
 * ⚠ Share-of-buildable-land figures live in the dossier (`ENVELOPE.md`), not here — they are a
 * MEASUREMENT over a mutable published layer, and baking a percentage into L2-pure rule data
 * would make it silently stale.
 */
export const MURCIA_CALIFICACION_CLASSIFICATION: readonly MurciaCalificacionClassification[] = [
    // ── PACKED — every envelope-determining parameter STATED at parcel granularity. ──────────
    {
        code: 'MC', label: 'Centro Histórico de Murcia', article: 'Art. 5.2.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: true,
        note: 'Alineación a vial + profundidad 15 m + 5 plantas/16 m. No per-parcel FAR by design — ' +
            'the envelope IS the alignment band. ⚠ The 6-plantas/19 m exception applies only to streets ' +
            'GRAPHED with an axis line on the 1/2.000 sheets, which PRYZM does not hold: UNKNOWN, not applied.',
    },
    {
        code: 'MG', label: 'Zona Gran Vía', article: 'Art. 5.4.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: true,
        note: 'Altura OBLIGATORIA (not merely maximum) 9 plantas/28 m on the Gran Vía frontage; ' +
            'profundidad 15 m. The corner/opposite-frontage reductions in 5.4.3.2 depend on which ' +
            'façade a parcel presents, which PRYZM does not resolve: the packed value is the ' +
            'Gran-Vía-frontage case and the pack says so.',
    },
    {
        code: 'RM1', label: 'Manzana Cerrada Tradicional, subzona RM1', article: 'Art. 5.5.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: true,
        note: 'RM1 is one of the two named subzones that ESCAPE the street-width table: ' +
            '«RM1: Altura máxima 8 plantas, equivalente a 25 m.»',
    },
    {
        code: 'RM2', label: 'Manzana Cerrada Tradicional, subzona RM2', article: 'Art. 5.5.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: true,
        note: '«RM2:Altura máxima 5 plantas, equivalente a 16 m.» (sic — no space in the source).',
    },
    {
        code: 'RD', label: 'Vivienda Unifamiliar Adosada', article: 'Art. 5.9.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'stated', coverage: 'not-the-rule-kind',
        packed: true,
        note: 'FAR 1,3 m²/m², 2 plantas/7 m, front 3 m, rear ½·altura ≥3 m (= 3,5 m at the stated 7 m), ' +
            'sides medianera. No ocupación stated — the envelope is FAR-and-setback governed.',
    },
    {
        code: 'RD1', label: 'Vivienda Unifamiliar Adosada (sin retranqueo de fachada)', article: 'Art. 5.9.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: true,
        note: 'A DIFFERENT KIND from RD, not a different number: «no será obligatorio el retranqueo de ' +
            'la fachada … El fondo máximo edificable será de 15 metros», and the FAR is expressly ' +
            'disapplied — «sin aplicación del anterior índice de edificabilidad». ⚠ The third storey on ' +
            'streets ≥8 m is CONSTRUCTED (street width) and is NOT applied.',
    },
    {
        code: 'RF', label: 'Vivienda Unifamiliar Aislada', article: 'Art. 5.10.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'constructed', coverage: 'stated',
        packed: true,
        note: 'Ocupación 40 %, 2 plantas/7 m, 4 m to public-road boundaries and 3 m to the rest. FAR is ' +
            'CONSTRUCTED — «Edificabilidad neta: La que resulte de los parámetros de ocupación y altura» ' +
            '— so it is left null and derived by the engine, never transcribed as 0,80.',
    },
    {
        code: 'RG', label: 'Vivienda Unifamiliar Aislada en Gran Parcela', article: 'Art. 5.11.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'constructed', coverage: 'stated',
        packed: true,
        note: 'Ocupación 30 %, 2 plantas/7 m, 6 m to public road and 5 m to the rest. The conditional ' +
            'third storey (≤30 % of the footprint, set back ≥2 m) is a partial-storey allowance and is ' +
            'NOT packed as a third full floor.',
    },
    {
        code: 'RH', label: 'Vivienda Unifamiliar en Transición a Huerta', article: 'Art. 5.12.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'stated',
        packed: true,
        note: 'Ocupación 20 % AND an absolute 200 m² footprint cap; 2 plantas/7 m; 5 m front and rear, ' +
            '≥2 m per side. ⚠ The 200 m² cap and the 0,5 m²/m² sub-800 m² rule are parcel-SIZE dependent ' +
            'and are recorded in MURCIA_PARCEL_SIZE_CONDITIONS, not folded into the pack.',
    },
    {
        code: 'RL', label: 'Agrupaciones Lineales Residenciales', article: 'Art. 5.14.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'stated', coverage: 'not-the-rule-kind',
        packed: true,
        note: '⚠⚠ AN INTERIM REGIME, AND THE PACK MUST SAY SO. Art. 5.14.3 is headed «Condiciones de ' +
            'edificación y usos ANTES DE LA APROBACIÓN DE PLANES ESPECIALES»; Art. 5.14.2 remits the ' +
            'ordering to a Plan Especial de Adecuación Urbanística at the same 0,25 m²/m² ceiling. So ' +
            'these numbers hold only while no PE has been approved for the ámbito, and PRYZM cannot ' +
            'check that. RL is the single largest calificación on buildable land — treat this caveat as ' +
            'load-bearing, not decorative.',
    },
    {
        code: 'IC', label: 'Parcela Industrial Compacta', article: 'Art. 5.18.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'not-the-rule-kind', depthOrSetback: 'stated', far: 'stated', coverage: 'stated',
        packed: true,
        note: 'FAR 1,0; 4 m façade retranqueo then total occupation of the remainder. Height is EXPRESSLY ' +
            'UNLIMITED — «La altura será libre y sujeta a las necesidades de la propia industria» — a ' +
            'FINDING recorded in MURCIA_NO_LIMIT_FINDINGS, encoded as null, never as a big number.',
    },
    {
        code: 'IX', label: 'Parcela Industrial Exenta', article: 'Art. 5.19.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'not-the-rule-kind', depthOrSetback: 'stated', far: 'stated', coverage: 'stated',
        packed: true,
        note: 'Ocupación 70 %, FAR 0,7, 5 m to all boundaries. Height expressly libre (see findings).',
    },
    {
        code: 'IG', label: 'Gran Parcela Industrial', article: 'Art. 5.20.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'not-the-rule-kind', depthOrSetback: 'stated', far: 'stated', coverage: 'stated',
        packed: true,
        note: 'Ocupación 60 %, FAR 0,6, 10 m to all boundaries. Height expressly libre (see findings).',
    },
    {
        code: 'AJ', label: 'Usos Singulares en Parcela Ajardinada', article: 'Art. 5.23.3',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'stated', far: 'stated', coverage: 'stated',
        packed: true,
        note: 'Retranqueo 15 m to every boundary, ocupación 30 %, FAR 0,4, 2 plantas/7 m. ⚠ Murcia\'s own ' +
            'layer labels some AJ polygons «(zona genérica)», but AJ is NOT in the Arts. 5.25.3.3 / ' +
            '5.26.3.3 generic list (RX, RJ, RS, UC, IP, TC, GP, AE), and Art. 5.23.3 states every ' +
            'parameter. Packed — and the tension is recorded rather than hidden.',
    },

    // ── REFUSED — CONSTRUCTED on an input PRYZM does not hold for Murcia. ────────────────────
    {
        code: 'RC', label: 'Casco Antiguo de Pedanía', article: 'Art. 5.3.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'Depth 15 m and alineación are STATED, but height is a STREET-WIDTH TABLE: «2 plantas (7 m) ' +
            'en calles menores de 4 metros. 3 plantas (10 m) en calles de 4 a 8 metros.. 4 plantas (13 m) ' +
            'en calles de 8 metros o mayor ancho..» PRYZM holds no Murcia street-width source. Packing one ' +
            'width would publish one street\'s answer for the whole zone — the L-526 failure verbatim.',
    },
    {
        code: 'RM', label: 'Manzana Cerrada Tradicional (base zone)', article: 'Art. 5.5.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'Same street-width table as RC, plus a 5-plantas/16 m case for Ejes Comerciales with a ' +
            'section >12 m — an additional graphed condition PRYZM does not hold. Only the named RM1/RM2 ' +
            'subzones escape it, and only those are packed.',
    },
    {
        code: 'RN', label: 'Núcleo Rural Adaptado', article: 'Art. 5.7.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'stated', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'Depth 15 m stated; height 2 plantas (≤4 m streets) / 3 plantas with a 3 m top-floor ' +
            'setback (>4 m streets) — street-width CONSTRUCTED. The alternative Estudio-de-Detalle route ' +
            'at 1 m²/m² is delegated by its own terms.',
    },
    {
        code: 'MZ', label: 'Bloque Conformando Manzana', article: 'Art. 5.6.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'unknown', far: 'constructed', coverage: 'unknown',
        packed: false,
        note: '⚠ THE MOST TEMPTING ROW IN THE TABLE, AND IT MUST STAY REFUSED. Height IS stated ' +
            '(8 plantas/25 m). But the FAR is an ALGORITHM — «la edificabilidad no superará el índice de ' +
            '2\'66 m2/m2 de superficie de parcela más semiancho de calles contiguas limitadas a un ancho ' +
            'máximo de 10 metros» — over a street width PRYZM does not hold; and the footprint is ' +
            'expressly delegated: «La ocupación, la separación a linderos públicos y privados y la ' +
            'ordenación volumétrica se determinarán mediante la redacción y aprobación del ' +
            'correspondiente Estudio de Detalle.» A height with no footprint is not an envelope.',
    },

    // ── REFUSED — NOT-THE-RULE-KIND: regulated against the EXISTING building. ────────────────
    {
        code: 'RB', label: 'Bloque Aislado', article: 'Art. 5.8.3',
        ruleKind: 'existing-building-derived', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'not-the-rule-kind', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'There is NO greenfield envelope here BY DESIGN. Both permitted routes are measured against ' +
            'the building that already stands: renovation «exactamente con los mismos parámetros … ' +
            'actualmente existente», or an Estudio de Detalle «sin superar la edificabilidad actual del ' +
            'edificio existente», capped at 8 plantas. A vacant RB parcel has no stated buildability.',
    },
    {
        code: 'RU', label: 'Proyectos Unitarios a Conservar', article: 'Art. 5.15.3',
        ruleKind: 'existing-building-derived', granularity: 'parcel',
        height: 'not-the-rule-kind', depthOrSetback: 'not-the-rule-kind', far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'A preservation regime: «respetará los parámetros de la edificación preexistente en ' +
            'superficie edificable, altura y ocupación». The envelope IS the existing building.',
    },
    {
        code: 'RT', label: 'Enclaves Terciarios', article: 'Art. 5.21.3',
        ruleKind: 'existing-building-derived', granularity: 'parcel',
        height: 'stated', depthOrSetback: 'unknown', far: 'constructed', coverage: 'unknown',
        packed: false,
        note: 'Three cases, none packable: (a) existing commercial use keeps its existing edificabilidad; ' +
            '(b) between party walls, conditions are «las mismas que las de las fincas colindantes» — a ' +
            'NEIGHBOUR-derived rule PRYZM cannot evaluate; (c) FAR 1,3 but «se ordenará a través de ' +
            'Estudio de Detalle». Height is also neighbour-relative (≤1 storey above abutting buildings, ' +
            'never >8 plantas).',
    },
    {
        code: 'MX', label: 'Ejes Mixtos', article: 'Art. 5.22.3',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'stated', far: 'stated', coverage: 'stated',
        packed: false,
        note: 'Fondo 20 m (planta baja) / 15 m (upper) and a 4 m soportal retranqueo are STATED, but the ' +
            'height depends on WHICH FRONTAGE a parcel presents — 5 plantas/16 m to the eje viario ' +
            'principal, 3 plantas/10 m to a vía secundaria — and PRYZM does not classify Murcia frontages. ' +
            'Sub-case (b) Enclaves Terciarios states FAR 2,0 / ocupación 60 % / 4 m retranqueo but gives ' +
            'its storey counts with NO metre equivalent, so its height in metres is UNKNOWN.',
    },
] as const;

/**
 * NO-LIMIT FINDINGS — recorded separately, never encoded as a number.
 *
 * «no limit» is a real legal answer and is NOT the same as UNKNOWN. Encoding it as `null` in the
 * pack is correct (the engine must not clamp), but the reason has to survive, or a later reader
 * will "fix" the null with an estimate.
 */
export const MURCIA_NO_LIMIT_FINDINGS: readonly { code: string; article: string; quote: string }[] = [
    { code: 'IC', article: 'Art. 5.18.3', quote: 'La altura será libre y sujeta a las necesidades de la propia industria.' },
    { code: 'IX', article: 'Art. 5.19.3', quote: 'La altura de las edificaciones será libre, en función de los requerimientos de la actividad que se pretenda desarrollar.' },
    { code: 'IG', article: 'Art. 5.20.3', quote: 'La altura de las edificaciones será libre, en función de los requerimientos de la actividad que se pretenda desarrollar.' },
] as const;

/**
 * PARCEL-SIZE-CONDITIONAL rules the flat `ZoningRule` shape cannot express.
 *
 * These are STATED values that switch on parcel area or frontage. Folding them into a single
 * scalar would publish the wrong branch for half the parcels, so they are recorded here and
 * surfaced as prose rather than silently applied.
 */
export const MURCIA_PARCEL_SIZE_CONDITIONS: readonly {
    code: string; article: string; condition: string; quote: string;
}[] = [
    {
        code: 'RH', article: 'Art. 5.12.3',
        condition: 'absolute footprint cap, all parcel sizes',
        quote: 'La ocupación de la parcela por edificación no será mayor del 20% de la misma, y en ningún caso superará los 200 m2 de superficie en planta.',
    },
    {
        code: 'RH', article: 'Art. 5.12.3',
        condition: 'parcels under the 800 m² minimum',
        quote: 'En parcelas inferiores a 800 m2 la edificabilidad no podrá superar 0,5 m2/m2.',
    },
    {
        code: 'RL', article: 'Art. 5.14.3',
        condition: 'absolute built-area cap',
        quote: 'El índice de edificabilidad de la finca será de 0,25 m2/m2, sin poder superarse una superficie máxima construida de 300 m2.',
    },
    {
        code: 'RL', article: 'Art. 5.14.3',
        condition: 'floor for titles predating 31 Jan 2001',
        quote: 'En los supuestos de fincas con título anterior a 31 de enero de 2001 se podrá edificar 100 m2 aunque de la aplicación del índice de edificabilidad sobre la superficie de la parcela resulte una edificabilidad inferior.',
    },
] as const;

const P = MURCIA_FIELD_PROVENANCE;

/** Provenance stamp for an alignment zone (front is the alineación, not a setback). */
const alignProv = {
    maxHeight: P, maxFloors: P, permittedUse: P, 'geometricRule.buildableDepth': P,
} as const;

/** Provenance stamp for a setback zone. */
const setbackProv = {
    maxHeight: P, maxFloors: P, permittedUse: P,
    'setback.front': P, 'setback.side': P, 'setback.rear': P,
} as const;

/**
 * THE PACK. 14 zones, every one of them a Título 5 Cap. 2–23 ordinance whose envelope-determining
 * parameters are STATED at PARCEL granularity in the Normas Urbanísticas.
 *
 * `source:'manual'` — a curated artefact read from the normative PDF; Murcia publishes no numeric
 * buildable parameter as a WFS attribute (verified against `DescribeFeatureType`, not against one
 * response: the schema carries only calificacion / descripcion / uso_global / sector / actuacion /
 * url / url2 / f_inicial / f_fin / text).
 *
 * `crs:'EPSG:25830'` — the native CRS of `Murcia:pgou_alineaciones`.
 *
 * ⚠ `defaultConfidence: 'estimated-ruleset'` DELIBERATELY UNDERSTATES until sign-off. These are
 * human-read verbatim transcriptions, which would justify a higher tier — but the tier is a claim
 * about VERIFICATION, and `MURCIA_ENVELOPE_VERIFIED` is false. Raising it is part of the signature,
 * not part of the transcription.
 */
export const ES_MURCIA_PGOU2012_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: MURCIA_JURISDICTION_ID,
        displayName: 'Murcia — PGOU Normas Urbanísticas (TR diciembre 2012)',
        source: 'manual',
        crs: 'EPSG:25830',
        lastReviewed: '2026-08-01',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            // ── ALIGNMENT ZONES — alineación a vial + profundidad edificable. ────────────────
            {
                code: 'MC',
                label: 'Centro Histórico de Murcia (MC) — PGOU Art. 5.2.3',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 16,
                maxFloors: 5,
                plotRatioFAR: null,   // NOT-THE-RULE-KIND: envelope = alineación + fondo + altura.
                maxCoverage: null,    // NOT-THE-RULE-KIND (see above).
                setbacks: { front_m: 0, side_m: 0, rear_m: null },
                geometricRule: {
                    kind: 'alignment', alignTo: 'street', alignmentOffset_m: 0,
                    sideTreatment: 'party-wall', buildableDepth_m: 15,
                },
                fieldProvenance: alignProv,
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.2.3 «Condiciones de la Edificación»: ` +
                    '«La edificación será alineada a vial, sin permitir retranqueos laterales ni ' +
                    'frontales. Profundidad edificable máxima: 15 metros.» / «Altura máxima 5 plantas, ' +
                    'equivalente a una altura de cornisa de 16 metros». ⚠ The 6-plantas/19 m exception ' +
                    'for streets graphed with an axis line on the 1/2.000 sheets is NOT applied — that ' +
                    'graphic is not held. Where the PECHA regulates height specifically, the PECHA prevails.',
            },
            {
                code: 'MG',
                label: 'Zona Gran Vía (MG) — PGOU Art. 5.4.3',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 28,
                maxFloors: 9,
                plotRatioFAR: null,
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: 0, rear_m: null },
                geometricRule: {
                    kind: 'alignment', alignTo: 'street', alignmentOffset_m: 0,
                    sideTreatment: 'party-wall', buildableDepth_m: 15,
                },
                fieldProvenance: alignProv,
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.4.3: «La edificación será alineada a vial. ` +
                    'Profundidad edificable máxima: 15 metros.» / «Altura obligatoria: 9 plantas, ' +
                    'equivalentes a 28 m. en los puntos de edificación con fachada a la Gran Vía.» ' +
                    '⚠ This is the GRAN-VÍA-FRONTAGE case. The reduced heights of Art. 5.4.3.2 for ' +
                    'corner parcels and for façades opposite the Centro Histórico depend on which frontage ' +
                    'a parcel presents, which PRYZM does not resolve.',
            },
            {
                code: 'RM1',
                label: 'Manzana Cerrada Tradicional, subzona RM1 — PGOU Art. 5.5.3',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 25,
                maxFloors: 8,
                plotRatioFAR: null,
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: 0, rear_m: null },
                geometricRule: {
                    kind: 'alignment', alignTo: 'street', alignmentOffset_m: 0,
                    sideTreatment: 'party-wall', buildableDepth_m: 15,
                },
                fieldProvenance: alignProv,
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.5.3: «La edificación coincidirá con la alineación y ` +
                    'no se permitirán retranqueos, ni frontales, ni laterales.» / «El fondo máximo ' +
                    'edificable será de 15 metros.» / «RM1: Altura máxima 8 plantas, equivalente a 25 m.» ' +
                    'Parcela mínima 150 m² con frente mínimo 7 m.',
            },
            {
                code: 'RM2',
                label: 'Manzana Cerrada Tradicional, subzona RM2 — PGOU Art. 5.5.3',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 16,
                maxFloors: 5,
                plotRatioFAR: null,
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: 0, rear_m: null },
                geometricRule: {
                    kind: 'alignment', alignTo: 'street', alignmentOffset_m: 0,
                    sideTreatment: 'party-wall', buildableDepth_m: 15,
                },
                fieldProvenance: alignProv,
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.5.3: fondo máximo edificable 15 m, alineación ` +
                    'obligatoria sin retranqueos; «RM2:Altura máxima 5 plantas, equivalente a 16 m.» ' +
                    '(quoted verbatim, including the missing space in the source).',
            },
            {
                code: 'RD1',
                label: 'Vivienda Unifamiliar Adosada sin retranqueo (RD1) — PGOU Art. 5.9.3',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: null,   // Expressly disapplied for RD1 — a FINDING, not a gap.
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: 0, rear_m: null },
                geometricRule: {
                    kind: 'alignment', alignTo: 'street', alignmentOffset_m: 0,
                    sideTreatment: 'party-wall', buildableDepth_m: 15,
                },
                fieldProvenance: alignProv,
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.9.3: «En la subzona RD1 no será obligatorio el ` +
                    'retranqueo de la fachada confrontante a vial. El fondo máximo edificable será de 15 ' +
                    'metros.» / «En la subzona RD1, sin aplicación del anterior índice de edificabilidad, ' +
                    'la altura máxima será de 2 plantas (7 metros de altura de cornisa)». ⚠ The third ' +
                    'storey allowed on streets ≥8 m wide is NOT applied — that is a street-width ' +
                    'construction and PRYZM holds no Murcia street-width source.',
            },

            // ── SETBACK ZONES ───────────────────────────────────────────────────────────────
            {
                code: 'RD',
                label: 'Vivienda Unifamiliar Adosada (RD) — PGOU Art. 5.9.3',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: 1.3,
                maxCoverage: null,   // No ocupación stated for RD — FAR-and-setback governed.
                // side 0 = medianera (adosada en hilera entre medianeras), an ASSERTED zero, not an
                // unknown: the typology is defined by the party wall. rear = ½·altura, min 3 m; at the
                // stated 7 m that is 3,5 m.
                setbacks: { front_m: 3, side_m: 0, rear_m: 3.5 },
                fieldProvenance: { ...setbackProv, maxFAR: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.9.3: «El índice de edificabilidad será de 1,3 m2 por ` +
                    'm2 de parcela. El número máximo de plantas será de dos (2), sin que en ningún caso se ' +
                    'puedan sobrepasar los 7 metros de altura de cornisa.» / «La alineación de la fachada ' +
                    'confrontante a vial se dispondrá a un mínimo de 3 m. de la alineación exterior.» / ' +
                    '«Del lindero trasero estará separada una distancia equivalente a la mitad de la ' +
                    'altura, sin que en ningún caso esta distancia pueda ser inferior a 3 metros.» ' +
                    'Parcela mínima 90 m², lindero frontal 6 m. Sides are medianeras (edificación en hilera).',
            },
            {
                code: 'RF',
                label: 'Vivienda Unifamiliar Aislada (RF) — PGOU Art. 5.10.3',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: null,   // CONSTRUCTED: «la que resulte de los parámetros de ocupación y altura».
                maxCoverage: 0.4,
                setbacks: { front_m: 4, side_m: 3, rear_m: 3 },
                fieldProvenance: { ...setbackProv, maxCoverage: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.10.3: «La separación mínima a linderos confrontantes ` +
                    'con viario público será de cuatro (4) metros y de tres (3) metros al resto de ' +
                    'linderos.» / «La ocupación máxima será del 40% de la superficie de la parcela.» / ' +
                    '«Altura de la edificación: 2 plantas (7 m) planta baja más una.» Parcela mínima ' +
                    '500 m² / 15 m de frente (300 m² / 10 m para títulos anteriores al 23-10-1998). ' +
                    '⚠ FAR is left null on purpose — the article CONSTRUCTS it («Edificabilidad neta: La ' +
                    'que resulte de los parámetros de ocupación y altura»), it does not state it.',
            },
            {
                code: 'RG',
                label: 'Vivienda Unifamiliar Aislada en Gran Parcela (RG) — PGOU Art. 5.11.3',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: null,   // CONSTRUCTED, as RF.
                maxCoverage: 0.3,
                setbacks: { front_m: 6, side_m: 5, rear_m: 5 },
                fieldProvenance: { ...setbackProv, maxCoverage: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.11.3: «La separación mínima a los linderos será de 6 m. ` +
                    'al confrontante con el viario público y de 5 m. al resto de linderos.» / «La ocupación ' +
                    'máxima será del 30% de la superficie de la parcela.» / «2 plantas (7 m) planta baja ' +
                    'más una, con posibilidad de una tercera siempre que ésta no ocupe más del 30% de la ' +
                    'ocupación de la edificación, y retranqueada al menos 2 m.» — the conditional partial ' +
                    'third storey is NOT packed as a full floor. Parcela mínima 1.000 m² / 20 m de frente.',
            },
            {
                code: 'RH',
                label: 'Vivienda Unifamiliar en Transición a Huerta (RH) — PGOU Art. 5.12.3',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: null,
                maxCoverage: 0.2,
                // Aislada case: 5 m front and rear; laterals ≥2 m each with the pair summing ≥6 m — the
                // per-edge minimum is 2 m and the pair constraint is recorded, not silently averaged.
                setbacks: { front_m: 5, side_m: 2, rear_m: 5 },
                fieldProvenance: { ...setbackProv, maxCoverage: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.12.3: «la edificación se retranqueará como mínimo 5 m. ` +
                    'del lindero frontal y 5 m. del posterior; y podrá estar separada de manera distinta ' +
                    'respecto a los linderos laterales siempre que la suma de las separaciones a ambos ' +
                    'linderos sea como mínimo de 6 m, y ninguna de las separaciones sea inferior a 2 m.» / ' +
                    '«La ocupación de la parcela por edificación no será mayor del 20% de la misma, y en ' +
                    'ningún caso superará los 200 m2 de superficie en planta.» / «El número máximo de ' +
                    'plantas será de 2 (7 m)». Parcela mínima 800 m² / 16 m. ⚠ The absolute 200 m² ' +
                    'footprint cap and the 0,5 m²/m² rule for sub-800 m² parcels are parcel-SIZE ' +
                    'conditional (MURCIA_PARCEL_SIZE_CONDITIONS) and are not folded into these scalars.',
            },
            {
                code: 'RL',
                label: 'Agrupaciones Lineales Residenciales (RL) — PGOU Art. 5.14.3 (INTERIM regime)',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: 0.25,
                maxCoverage: null,
                setbacks: { front_m: 5, side_m: 7.5, rear_m: 5 },
                fieldProvenance: { ...setbackProv, maxFAR: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.14.3 «Condiciones de edificación y usos ANTES DE LA ` +
                    'APROBACIÓN DE PLANES ESPECIALES»: «Con carácter general, la altura máxima será de 2 ' +
                    'plantas (7 metros).» / «El índice de edificabilidad de la finca será de 0,25 m2/m2, ' +
                    'sin poder superarse una superficie máxima construida de 300 m2.» / «La edificación ' +
                    'deberá situarse a 5 metros de la alineación de la vía pública y del lindero ' +
                    'posterior, y a 7\'5 metros de los linderos laterales.» Parcela mínima 1 tahúlla con ' +
                    '30 m de fachada. ⚠⚠ INTERIM: Art. 5.14.2 remits the definitive ordering to a Plan ' +
                    'Especial de Adecuación Urbanística («El índice de edificabilidad máximo del ámbito ' +
                    'será de 0,25 m2/m2»). These conditions hold only while no such PE has been approved ' +
                    'for the ámbito, and PRYZM cannot verify that. Art. 5.14.3.3 also requires a cesión ' +
                    'leaving the boundary 7 m from the axis of the confronting camino, which reduces the ' +
                    'net parcel BEFORE these setbacks apply.',
            },
            {
                code: 'IC',
                label: 'Parcela Industrial Compacta (IC) — PGOU Art. 5.18.3',
                permittedUse: ['industrial'],
                maxHeight_m: null,   // NO-LIMIT FINDING — «la altura será libre». Never a number.
                maxFloors: null,
                plotRatioFAR: 1.0,
                maxCoverage: 1.0,    // «se admitirá la total ocupación del solar» beyond the 4 m line.
                setbacks: { front_m: 4, side_m: 0, rear_m: 0 },
                fieldProvenance: { ...setbackProv, maxFAR: P, maxCoverage: P, maxHeight: P, maxFloors: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.18.3: «Las nuevas construcciones … deberán observar un ` +
                    'retranqueo de la fachada edificable de cuatro (4) metros» / «A partir de la nueva ' +
                    'alineación de fachada se admitirá la total ocupación del solar.» / «La edificabilidad ' +
                    'no superará 1 m2/1m2 de parcela neta.» / «La altura será libre y sujeta a las ' +
                    'necesidades de la propia industria.» ⚠ Height is EXPRESSLY UNLIMITED — a finding ' +
                    'recorded in MURCIA_NO_LIMIT_FINDINGS, encoded as null, never as a large number. ' +
                    'Parcela mínima 100 m² / 6 m de frente.',
            },
            {
                code: 'IX',
                label: 'Parcela Industrial Exenta (IX) — PGOU Art. 5.19.3',
                permittedUse: ['industrial'],
                maxHeight_m: null,   // NO-LIMIT FINDING.
                maxFloors: null,
                plotRatioFAR: 0.7,
                maxCoverage: 0.7,
                setbacks: { front_m: 5, side_m: 5, rear_m: 5 },
                fieldProvenance: { ...setbackProv, maxFAR: P, maxCoverage: P, maxHeight: P, maxFloors: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.19.3: «La ocupación en planta no superará el 70% de la ` +
                    'superficie de parcela neta, con separación mínima a linderos de 5 metros.» / «La ' +
                    'altura de las edificaciones será libre, en función de los requerimientos de la ' +
                    'actividad que se pretenda desarrollar. La edificabilidad no superará el índice de ' +
                    '0,7 m2/m2 sobre parcela neta.» Parcela mínima 2.000 m².',
            },
            {
                code: 'IG',
                label: 'Gran Parcela Industrial (IG) — PGOU Art. 5.20.3',
                permittedUse: ['industrial'],
                maxHeight_m: null,   // NO-LIMIT FINDING.
                maxFloors: null,
                plotRatioFAR: 0.6,
                maxCoverage: 0.6,
                setbacks: { front_m: 10, side_m: 10, rear_m: 10 },
                fieldProvenance: { ...setbackProv, maxFAR: P, maxCoverage: P, maxHeight: P, maxFloors: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.20.3: «La ocupación en planta no superará el 60% de la ` +
                    'superficie de parcela neta, con separación mínima a linderos de 10 m.» / «La altura ' +
                    'de las edificaciones será libre … La edificabilidad no podrá superar el índice de ' +
                    '0,6 m2/m2 sobre parcela neta.» Parcela mínima 7.000 m². Auxiliary buildings ≤150 m² ' +
                    'and ≤7 m, set back ≥5 m, count towards the edificabilidad.',
            },
            {
                code: 'AJ',
                label: 'Usos Singulares en Parcela Ajardinada (AJ) — PGOU Art. 5.23.3',
                permittedUse: ['mixed'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: 0.4,
                maxCoverage: 0.3,
                setbacks: { front_m: 15, side_m: 15, rear_m: 15 },
                fieldProvenance: { ...setbackProv, maxFAR: P, maxCoverage: P },
                ordinanceRef:
                    `${MURCIA_PGOU_SOURCE}, Art. 5.23.3: «El retranqueo mínimo a lindero será de 15 ` +
                    'metros.» / «La ocupación máxima de parcela será del 30%.» / «El índice de ' +
                    'edificabilidad máxima que se establece es de 0,4 m2/m2 y la altura de edificación 2 ' +
                    'plantas, equivalentes a 7 metros de altura.» Parcela mínima 5.000 m², de la que al ' +
                    'menos el 50 % se destina a verde privado. ⚠ Where several singular uses are split ' +
                    'across separate buildings on one parcel, Art. 5.23.3 requires an Estudio de Detalle ' +
                    'to order the volumes.',
            },
        ],
    });

/** Fast lookup, built once. Keyed by the pack's zone `code`. */
const ZONE_BY_CODE: ReadonlyMap<string, ZoningRule> = new Map(
    ES_MURCIA_PGOU2012_PACK.zones.map((z) => [z.code.toUpperCase(), z]),
);

/** Classification lookup, built once. */
const CLASS_BY_CODE: ReadonlyMap<string, MurciaCalificacionClassification> = new Map(
    MURCIA_CALIFICACION_CLASSIFICATION.map((c) => [c.code.toUpperCase(), c]),
);

/**
 * Sub-variant calificación codes Murcia publishes that resolve to a packed base zone.
 *
 * ⚠ THIS MAP IS AN EXPLICIT ALLOW-LIST, NOT A PREFIX HEURISTIC, AND THAT IS THE POINT. Murcia's
 * layer carries ~120 distinct calificación strings, many of them one-off local variants
 * (`RB-Ch6`, `RF-Eg1`, `IX-VJ2`, `RCJ`, `RDe`…). Stripping suffixes with a regex would silently
 * assert that a variant carries its base zone's numbers — a claim the ordinance nowhere makes.
 * A variant that is not listed here resolves to NO pack, which produces a cited refusal.
 * Only variants whose OWN `descripcion` in the live layer is the base zone's designation, and for
 * which the Normas name no separate condition, are listed.
 */
const PACKED_VARIANTS: ReadonlyMap<string, string> = new Map([
    // Murcia's layer labels these verbatim "Vivienda Unifamiliar Aislada" — the RF ordinance.
    ['RF1', 'RF'],
    // Layer designation "Parcela Industrial Exenta" — the IX ordinance, terrain-suffixed.
    ['IXT', 'IX'],
]);

/**
 * The calificación codes this pack answers for — the registry's `packsByZone` key set.
 *
 * ⚠ DERIVED FROM `ES_MURCIA_PGOU2012_PACK.zones`, NEVER RE-TYPED. A hand-written list is a second
 * source of truth that can silently disagree with the pack it claims to describe; deriving it means
 * adding a zone registers it and removing one de-registers it, with no edit here and no drift.
 * Sorted so the registry's iteration order (and therefore `registeredPackZoneCodes`, which the C60
 * coverage probe reads) is stable across builds.
 *
 * ⚠⚠ REGISTRATION IS NOT AUTHORISATION. Listing these codes makes the pack *reachable* by the
 * registry — it does NOT publish a number for any of them. `MURCIA_ENVELOPE_VERIFIED` is `false`,
 * and the L5 Murcia dispatch (`murciaEnvelopeDisposition`) refuses every parcel before the registry
 * is ever consulted. Same shape as Córdoba's `CORDOBA_PGOU2001_ZONE_CODES`, and for the same reason:
 * wire it so it is SIGNABLE, and let the signature — not the wiring — be the legal act.
 */
export const MURCIA_PGOU2012_ZONE_CODES: readonly string[] = ES_MURCIA_PGOU2012_PACK.zones
    .map((z) => z.code.toUpperCase())
    .sort();

/**
 * The sub-variant codes the live layer publishes that this pack also answers for, via
 * `PACKED_VARIANTS`. Registered SEPARATELY from `MURCIA_PGOU2012_ZONE_CODES` so the count of
 * *transcribed calificaciones* (14) stays legible and is never inflated by aliases — the coverage
 * claim in `RATE.md` §ENVELOPE is about the 14, not about 16.
 */
export const MURCIA_PGOU2012_VARIANT_ZONE_CODES: readonly string[] = [...PACKED_VARIANTS.keys()].sort();

/** What a Murcia calificación resolves to under the transcribed PGOU. */
export type MurciaPgouResolution =
    | { readonly ok: true; readonly zone: ZoningRule; readonly classification: MurciaCalificacionClassification | null; readonly matchedCode: string }
    | { readonly ok: false; readonly reason: 'no-calificacion' | 'not-packed'; readonly classification: MurciaCalificacionClassification | null };

/**
 * Resolve a live Murcia `calificacion` string to a transcribed PGOU zone, or say why not.
 *
 * PURE (given the same input the answer is byte-identical); never throws. OTel span
 * `pryzm.zoning.resolveMurciaPgouZone` (P8 / C58 §1.10).
 *
 * ⚠ IT NEVER FALLS BACK TO A NEIGHBOURING ZONE. An unrecognised code returns `not-packed`, which
 * the caller renders as a cited refusal. Guessing here would be the L-616 failure — a plausible
 * number is worse than none, because it claims a rigour we have not earned.
 */
export function resolveMurciaPgouZone(
    calificacion: string | null | undefined,
): MurciaPgouResolution {
    const span = tracer.startSpan('pryzm.zoning.resolveMurciaPgouZone');
    try {
        const raw = (calificacion ?? '').trim().toUpperCase();
        if (raw === '') {
            span.setAttribute('resultFields', 'no-calificacion');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-calificacion', classification: null };
        }
        const code = PACKED_VARIANTS.get(raw) ?? raw;
        const classification = CLASS_BY_CODE.get(code) ?? null;
        const zone = ZONE_BY_CODE.get(code);
        span.setAttribute('calificacion', raw);
        span.setAttribute('resolvedCode', code);
        if (!zone) {
            span.setAttribute('resultFields', 'not-packed');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'not-packed', classification };
        }
        span.setAttribute('resultFields', 'zone');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, zone, classification, matchedCode: code };
    } finally {
        span.end();
    }
}

/**
 * The classification record for a calificación, if one has been read and reasoned about.
 *
 * Returns `null` for a code no human has classified — which is NOT "the code is unregulated". It
 * is "we have not read this one", and callers must render it as such.
 */
export function murciaCalificacionClassification(
    calificacion: string | null | undefined,
): MurciaCalificacionClassification | null {
    const raw = (calificacion ?? '').trim().toUpperCase();
    if (raw === '') return null;
    return CLASS_BY_CODE.get(PACKED_VARIANTS.get(raw) ?? raw) ?? null;
}
