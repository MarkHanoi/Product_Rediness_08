// Zaragoza (INE 50297) — PGOU 2024 (texto refundido, aprobado 27-03-2024), Título Cuarto,
// GRADO A1 SUBGRADOS 3.1 / 3.2 / 4.1 / 4.2 — the four closed-block ordenanza subzones whose
// aprovechamiento articles have now been TRANSCRIBED, verbatim, page-cited.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE IS, AND WHAT IT IS NOT
// ═════════════════════════════════════════════════════════════════════════════════════════════
// `esAragon.ts` records that Zaragoza's blocker MOVED (§ZGZ-SUBGRADO): the calificación layer
// publishes the full subgrado (A1/3.1, A1/3.2, A1/4.1, A1/4.2 — the four article selectors this
// pack answers for), and what was missing was the TRANSCRIPTION of arts. 4.1.12 / 4.1.13 / 4.1.15
// / 4.1.17. That transcription now exists (`TR2024_Tomo_12_Normas_Titulo_Cuarto.pdf`, verbatim,
// page-cited, pp.147-154). This file turns it into a curated `JurisdictionZoningContract`, on
// exactly the Córdoba precedent (`esCordobaPGOU2001.ts`): REGISTERED, but gated shut.
//
// ⛔⛔ THIS IS NOT AN AUTHORISATION. `ZARAGOZA_ENVELOPE_VERIFIED` (declared in `esAragon.ts` —
// ONE gate, imported here and by `registry.ts`, never redeclared: a second `false as const` in
// this file would be the exact duplicate-gate hazard `envelopeAuthorisation.ts`'s
// `ENVELOPE_PUBLICATION_GATES` throws on at load if two declarations ever claimed one
// jurisdiction) stays `false` until a Spanish-planning-literate human signs a
// `sources/VERIFICATION.md` for Zaragoza. Nothing in this file may flip it. A signature is a
// founder act (L-449); a model flipping it is the L-677 defect, restated verbatim in `esAragon.ts`.
//
// GRADO 1 / GRADO 2 ARE OUT OF SCOPE, ON PURPOSE. Art. 4.1.2 §1 confirms Grado 1 is regulated
// GRAPHICALLY (the `Textos_Altura_Edificable` point layer) — a different pipeline (a live-resolved
// `explicit-area` declaration, the Madrid NZ 1 shape), not a parameter pack. Only Grados 2/3/4,
// which the ordinance states as coefficients, are packable here — and of those, only the four
// SUBGRADOS the transcription covers (3.1, 3.2, 4.1, 4.2) are packed. Any other subgrado this
// municipality's calificación may carry is deliberately NOT in `ZARAGOZA_ZONE_CODES` and falls
// through to `zaragozaNoRulePackRefusal` (`esAragon.ts`), never to a guessed number.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE GEOMETRY — WHY `alignment`, NOT `block-derived-alignment`
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Art. 4.1.1 states closed-block alignment is mandatory (façade to the alineación de fachada) and
// Art. 4.1.3 states the buildable depth is measured "desde la alineación de la fachada del
// edificio" — a FLAT SCALAR fondo mínimo/máximo, not Barcelona's Art. 242.2 block-solved shape.
// `blockDerivedDepth.ts` / `blockRing.ts` are therefore the wrong tool here (per the transcription
// agent's own read); the honest shape is the plain `kind: 'alignment'` `GeometricRule`, exactly the
// pattern Córdoba's CTP-1 and UAD-1/2/3 already ship: build ON the alineación (offset 0), party
// walls on the laterals (adosada/medianera closed-block fabric), and a `buildableDepth_m` clip.
//
// All four subgrados state "plantas alzadas [fondo] máx. 15m" (Art. 4.1.12 §A1/3.1; "igual que en
// el grado A1-4.1" for 4.2) with a 7,50 m FALLBACK MINIMUM per Art. 4.1.3 where nothing more
// specific is graphically ordered. The pack ships the STATED MAXIMUM (15 m) as `buildableDepth_m`
// — the conservative, cited figure — never the 7,50 m floor, which would UNDER-state a parcel the
// ordinance grants more depth on, and never an unbounded depth, which would OVER-state one (L-616).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE HEIGHT TABLE — CONSTRUCTED FROM `measureStreetWidths` FOR 3.1/3.2, FIXED FOR 4.1/4.2
// ═════════════════════════════════════════════════════════════════════════════════════════════
// A1/3.1 and A1/3.2 key their altura máxima / edificabilidad on the "ancho de calle" MEASURED
// BETWEEN PARCEL ALIGNMENTS — precisely what `geometry/streetWidth.ts`'s
// `measureStreetWidths`/`governingStreetWidth` already computes (frontage-to-frontage across a
// street from cadastral parcel boundaries, banded by width). This file supplies Zaragoza's OWN
// table (per the module's own stated contract — "a new region supplies its own height table keyed
// on street width"), the same shape as `bcnAlcadaReguladora.ts` (Barcelona) and
// `esMurciaAnchoDeCalle.ts` (Murcia). It reuses `effectiveBandEdgeGuard_m` rather than declaring a
// second guard constant — that constant prices the MEASUREMENT TECHNIQUE, not any one city.
//
// A1/4.1 and A1/4.2 carry NO street-width table at all: Art. 4.1.15/4.1.17 state a FIXED B+2 /
// 10 m height and a FIXED 1,15 m²/m² edificabilidad, so those two zones ship the numbers directly
// as scalars — implementing a table lookup for a constant would be manufacturing structure the
// ordinance does not have.
//
// ⚠⚠ §ZGZ-TRAVESIA-GAP — A1/3.2's THIRD BAND IS DELIBERATELY NOT IMPLEMENTED, AND THIS IS A NAMED
// GAP, NOT AN OVERSIGHT. Art. 4.1.13 adds a THIRD height band (B+4, 16,50 m, edificabilidad 2,60
// m²/m²) for parcels fronting a named "Travesía de Casetas y Santa Isabel" street — but WHICH
// streets carry that designation is a LOOKUP PROBLEM the transcription did not resolve: neither the
// ordinance text quoted nor any GIS street-naming layer inspected so far names the qualifying
// streets. Guessing would silently grant a storey (and +0,50/+1,00 m²/m²) the ordinance may not
// grant on that parcel — the exact L-616 mechanism. So `ZARAGOZA_A1_3_WIDTH_BANDS` below carries
// ONLY the two bands A1/3.2 shares with A1/3.1 (<12 m / ≥12 m); the travesía band is recorded in
// `ZARAGOZA_A1_3_2_TRAVESIA_GAP` as a named, cited absence, never silently applied and never
// silently omitted from the record.
//
// PURITY: L2-pure. Data + pure resolvers + spans. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — C58 §1.2/§1.4/§1.6/§1.7a, ADR-0270 (`alignment`), ADR-0275
// (`streetWidth.ts`'s region-agnostic contract), §CONTEXT-DATA-HONESTY, `esAragon.ts`
// (§ZGZ-SUBGRADO, the honesty gate), `esCordobaPGOU2001.ts` (the structural template).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';
import { effectiveBandEdgeGuard_m } from './bcnAlcadaReguladora.js';
import { ZARAGOZA_JURISDICTION_ID } from './esAragon.js';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * The source document every ordinanceRef below cites. Approved 27-03-2024; every figure below was
 * VERBATIM, page-cited transcribed from it (pp.147-154), not machine-OCR'd — hence `ordinance-pdf`
 * field provenance and an `estimated-ruleset` pack ceiling (see `ZARAGOZA_PACK_DEFAULT_CONFIDENCE`),
 * never `pipeline-extracted-unverified`: a human/agent read and typed these values from the text.
 */
const SRC =
    'PGOU de Zaragoza 2024 (texto refundido, aprobado 27-03-2024), Normas Urbanísticas, Título ' +
    'Cuarto — TR2024_Tomo_12_Normas_Titulo_Cuarto.pdf. Human/agent-transcribed verbatim from the ' +
    'ordinance text, page-cited; NOT machine-OCR pipeline output.';

/** Every field in this pack is `ordinance-pdf` (C58 §1.6) — a human/agent transcribed it. */
export const ZARAGOZA_FIELD_PROVENANCE = 'ordinance-pdf' as const;

/**
 * The pack's declared ceiling (`RulePackDefaultConfidence`, C58 §1.6). `estimated-ruleset` —
 * NEVER higher. This is transcribed ordinance text, curated by a human/agent read, not a
 * published-structured feed (which would be `structured`) and not a machine-OCR pipeline read no
 * human has checked (which would be the WEAKER `pipeline-extracted-unverified`, Córdoba/Madrid's
 * tier). `capEnvelopeConfidenceToPackDefault` (`ProvenanceFlags.ts`) means no solve built from this
 * pack may ever be labelled `structured` or `authoritative`, whatever `ZoningRulesEngine` derives.
 */
export const ZARAGOZA_PACK_DEFAULT_CONFIDENCE = 'estimated-ruleset' as const;

/**
 * §ZGZ-TRAVESIA-GAP — Art. 4.1.13's third height band, NAMED AND NOT IMPLEMENTED.
 *
 * Art. 4.1.13 (A1/3.2, Travesías de Casetas y Santa Isabel) adds a B+4 / 16,50 m / 2,60 m²/m² band
 * for street frontages the ordinance calls a "Travesía de Casetas y Santa Isabel" — a NAMED set of
 * streets, not a width threshold. WHICH streets qualify is unresolved: no GIS street-naming layer
 * or ordinance annex inspected during transcription enumerates the qualifying frontages. Applying
 * the band without that list would be a guess that can only ever OVER-grant (an extra storey +
 * 0,50–1,00 m²/m² of edificabilidad on a parcel that may not qualify) — the L-616 mechanism. So
 * A1/3.2 ships with ONLY the two bands it shares with A1/3.1, and this constant is the citable
 * record of the omission for the day someone resolves the street list.
 */
export const ZARAGOZA_A1_3_2_TRAVESIA_GAP =
    'Art. 4.1.13 states a THIRD height band (B+4, 16,50 m, edificabilidad 2,60 m²/m²) for parcels ' +
    'fronting a named "Travesía de Casetas y Santa Isabel" street, on top of the same <12 m / ' +
    '≥12 m bands A1/3.1 uses. WHICH streets carry that designation is a lookup PRYZM has not ' +
    'resolved from the ordinance text or from any GIS street-naming layer inspected so far, so ' +
    'this pack ships A1/3.2 with the two shared bands ONLY. The third band is a KNOWN, NAMED GAP ' +
    '— never silently applied and never silently dropped from the record.';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ZGZ-A1-3-WIDTH-TABLE — Art. 4.1.12's ancho-de-calle band, shared verbatim by Art. 4.1.13.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One row of the A1/3.1 (and A1/3.2's shared) ancho-de-calle table. */
export interface ZaragozaA13Band {
    /** Inclusive lower bound of the ancho-de-calle band, metres. */
    readonly minWidth_m: number;
    /** EXCLUSIVE upper bound, metres. `Infinity` on the top band. */
    readonly maxWidth_m: number;
    /** Storeys ABOVE the planta baja — the "+N" in "B+N". */
    readonly floorsAboveGround: number;
    /** Alçada máxima, metres. */
    readonly height_m: number;
    /** Edificabilidad, m²t/m²s. */
    readonly far: number;
}

/**
 * Art. 4.1.12 (A1/3.1) — the two ancho-de-calle bands. Art. 4.1.13 (A1/3.2) states the SAME two
 * bands verbatim, plus the travesía third band this pack does not implement (see
 * `ZARAGOZA_A1_3_2_TRAVESIA_GAP`). Sharing one table constant for both subzones is deliberate: the
 * two rows are byte-identical across both articles, and a second copy would be a second statement
 * of one fact that could silently drift (the L-422/457/467/469 family, restated here).
 */
export const ZARAGOZA_A1_3_WIDTH_BANDS: ReadonlyArray<ZaragozaA13Band> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 12, floorsAboveGround: 2, height_m: 10.5, far: 1.6 },
    { minWidth_m: 12, maxWidth_m: Infinity, floorsAboveGround: 3, height_m: 13.5, far: 2.1 },
]);

/** What resolving a measured/official street width against the A1/3.* table yields. */
export type ZaragozaA13Resolution =
    | {
          readonly ok: true;
          readonly band: ZaragozaA13Band;
          readonly height_m: number;
          readonly floorsAboveGround: number;
          readonly far: number;
      }
    | {
          readonly ok: false;
          /**
           * `bad-input`  — not a usable positive finite width.
           * `band-edge`  — the width sits within the effective guard of the 12 m boundary, so a
           *                MEASURED value cannot decide which band governs (a metre here is a
           *                whole storey and +0,50 m²/m²).
           */
          readonly reason: 'bad-input' | 'band-edge';
          /** The two candidate heights straddling the edge, for an honest "we cannot say" message. */
          readonly straddles: readonly number[];
      };

/**
 * Resolve the A1/3.1 / A1/3.2 ancho-de-calle band from a street width.
 *
 * PURE, deterministic, never throws. Refuses near the 12 m band edge rather than let measurement
 * noise pick a storey and 0,50 m²/m² of edificabilidad — the same discipline
 * `resolveAlcadaReguladora` (Barcelona) and `resolveMurciaAnchoDeCalle` (Murcia) apply, reusing the
 * SAME `effectiveBandEdgeGuard_m` rather than a Zaragoza-specific tolerance.
 *
 * @param width_m  the ancho de calle, metres. Pass `governingStreetWidth(...)?.width_m` from
 *   `geometry/streetWidth.ts` for the constructed (measured) case.
 * @param opts.trustedOfficialWidth  TRUE only when `width_m` came from a declared official figure,
 *   not a measurement — an official width is exact by definition and may sit ON the edge.
 * @param opts.measurementSpread_m  `StreetWidthMeasurement.spread_m` — widens the guard when it
 *   exceeds the default; never narrows it (L-586).
 *
 * P8 — emits `pryzm.zoning.resolveZaragozaA13Height`.
 */
export function resolveZaragozaA13Height(
    width_m: number,
    opts: {
        readonly trustedOfficialWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): ZaragozaA13Resolution {
    const span = tracer.startSpan('pryzm.zoning.resolveZaragozaA13Height');
    try {
        if (typeof width_m !== 'number' || !Number.isFinite(width_m) || width_m <= 0) {
            span.setAttribute('resultFields', 'bad-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'bad-input', straddles: [] };
        }
        span.setAttribute('width_m', width_m);

        const bandFor = (w: number): ZaragozaA13Band =>
            ZARAGOZA_A1_3_WIDTH_BANDS.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
            ZARAGOZA_A1_3_WIDTH_BANDS[ZARAGOZA_A1_3_WIDTH_BANDS.length - 1]!;

        if (!opts.trustedOfficialWidth) {
            const guard = effectiveBandEdgeGuard_m(opts.measurementSpread_m);
            const low = bandFor(Math.max(0.000001, width_m - guard));
            const high = bandFor(width_m + guard);
            if (low.height_m !== high.height_m) {
                span.setAttribute('resultFields', 'band-edge');
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    ok: false,
                    reason: 'band-edge',
                    straddles: [low.height_m, high.height_m],
                };
            }
        }

        const band = bandFor(width_m);
        span.setAttribute('resultFields', 'band');
        span.setAttribute('floorsAboveGround', band.floorsAboveGround);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, band, height_m: band.height_m, floorsAboveGround: band.floorsAboveGround, far: band.far };
    } finally {
        span.end();
    }
}

/**
 * §ZGZ-CORNER-WEIGHTED-EP — Art. 4.1.12's corner-lot weighted edificabilidad,
 * `ep = (1,60·l1 + 2,10·l2) / (l1 + l2)`, generalised to N frontages so the SAME function serves
 * A1/3.1's two-band corner case and (once the travesía gap closes) A1/3.2's three-band one, without
 * a second formula appearing later and silently drifting from this one.
 *
 * @param frontages  one entry per street frontage the parcel has: its length (`length_m`, metres —
 *   `StreetWidthMeasurement.edgeLength_m` from `geometry/streetWidth.ts`) and the `far` its
 *   governing band grants (from `resolveZaragozaA13Height`). Order does not matter.
 * @returns the length-weighted mean edificabilidad, or `null` for no frontages / non-positive
 *   total length (never divides by zero, never guesses a single-frontage answer for a corner).
 */
export function zaragozaA13WeightedEdificabilidad(
    frontages: ReadonlyArray<{ readonly length_m: number; readonly far: number }>,
): number | null {
    const span = tracer.startSpan('pryzm.zoning.zaragozaA13WeightedEdificabilidad');
    try {
        const totalLength = frontages.reduce((sum, f) => sum + f.length_m, 0);
        if (frontages.length === 0 || !(totalLength > 0)) {
            span.setAttribute('resultFields', 'no-frontage');
            span.setStatus({ code: SpanStatusCode.OK });
            return null;
        }
        const weighted = frontages.reduce((sum, f) => sum + f.far * f.length_m, 0) / totalLength;
        span.setAttribute('frontageCount', frontages.length);
        span.setAttribute('weightedFar', weighted);
        span.setStatus({ code: SpanStatusCode.OK });
        return weighted;
    } finally {
        span.end();
    }
}

/**
 * §ZGZ-MISSING-CONSTRAINTS — the constraint FAMILIES PRYZM does not model for Zaragoza, named as
 * DATA, not prose (ADR-0293's `OpenTopIndicativeRecord.missingConstraints` shape — see
 * `openTopIndicative.ts`). Each entry can only ever REDUCE a buildable envelope, which is what
 * makes any solid built from this pack an UPPER BOUND rather than a closed box.
 *
 * ⚠ MEASURED AS AN ABSENCE OF WIRING, NOT AS A CITY-SPECIFIC RISK SURVEY. Nobody has done the
 * systematic per-Zaragoza sweep Balears got (`BALEARS_MISSING_CONSTRAINTS`, 6 families,
 * `resolveBalearsMuib.ts`). What IS verifiable by reading this codebase is narrower and still
 * real: none of `resolveCatalunyaFloodOverlay.ts` (flood), `resolveBarcelonaHeritageOverlay.ts`
 * (heritage) or the Barcelona AESA airport-servitude geometry mention or cover Zaragoza — every
 * constraint layer PRYZM has ever wired is Catalunya/Balears-scoped. So for THIS jurisdiction the
 * honest claim is "PRYZM models zero constraint layers here", not "these six are the only gap".
 *
 * ⛔ `coastal` IS DELIBERATELY ABSENT. Zaragoza is 300 km from the sea; carrying Balears's coastal
 * entry here would be citing a risk the city cannot have, which is the same dishonesty in the
 * opposite direction (a manufactured family, not a real one).
 */
export const ZARAGOZA_MISSING_CONSTRAINTS: readonly string[] = Object.freeze([
    'heritage — municipal Catálogo de Bienes Catalogados / BIC declarations (Conjunto Histórico ' +
        'del Casco Antiguo, La Aljafería, La Seo, Basílica del Pilar and others) — not modelled; ' +
        'no Zaragoza heritage layer is wired anywhere in this codebase',
    'flood — Ebro river ARPSI flood zones under the Plan de Gestión del Riesgo de Inundación de ' +
        'la Demarcación Hidrográfica del Ebro — not modelled; `resolveCatalunyaFloodOverlay.ts` ' +
        'covers Catalunya only',
    'airport — servidumbres aeronáuticas around Aeropuerto de Zaragoza (LEZG, joint civil/' +
        'military) — not modelled; unlike Barcelona (AESA KMZ, wired), no equivalent geometry is ' +
        'wired for Zaragoza',
    'environmental — Red Natura 2000 riparian sites along the Ebro (e.g. ZEC Sotos y Galachos del ' +
        'Ebro) reaching into the municipal boundary — not modelled',
    ZARAGOZA_A1_3_2_TRAVESIA_GAP,
]);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ZGZ-STATIC-PACK — the four subgrados as a curated `JurisdictionZoningContract`.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// A1/3.1 and A1/3.2 ship `maxHeight_m` / `maxFloors` / `plotRatioFAR` as `null` — a per-street-width
// TABLE, not a scalar (the MC-1..4 / RC / RM / RN convention: a scalar here would publish one
// street's answer for the whole subzone, the L-526 failure). `resolveZaragozaA13Height` above is
// what a future per-parcel resolver reads once the L5 dispatch can measure a Zaragoza block ring.
//
// A1/4.1 and A1/4.2 ship FIXED scalars — Arts. 4.1.15/4.1.17 state B+2 / 10 m / 1,15 m²/m² with NO
// street-width table at all.
//
// `maxCoverage` on all four is the PLANTAS ALZADAS figure (50 % on every subgrado) — the value that
// governs the buildable footprint ABOVE the planta baja, the same convention Córdoba's MC/CTP-1
// packs use (their `maxCoverage` is likewise the upper-floor figure, not the planta-baja one). The
// sótano/semisótano (100 %) and planta baja (75 %) figures are STATED in `ordinanceRef` for the
// record but are NOT modelled — `ZoningRuleSchema` carries one coverage scalar, not a per-storey
// table, and the upper-floor figure is the one that shapes the above-ground massing this pack
// produces envelopes for.

/** The 4 subgrados this pack answers for. */
export const ZARAGOZA_ZONE_CODES = ['A1/3.1', 'A1/3.2', 'A1/4.1', 'A1/4.2'] as const;
export type ZaragozaZoneCode = (typeof ZARAGOZA_ZONE_CODES)[number];

/** The shared closed-block alignment geometry every subgrado in this pack uses (Art. 4.1.1/4.1.3). */
const CLOSED_BLOCK_ALIGNMENT_15M = {
    kind: 'alignment' as const,
    alignTo: 'street' as const,
    alignmentOffset_m: 0,
    sideTreatment: 'party-wall' as const,
    buildableDepth_m: 15,
};

const NULL_SETBACKS = { front_m: null, side_m: null, rear_m: null };

export const ES_ZARAGOZA_PGOU2024_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: ZARAGOZA_JURISDICTION_ID,
        displayName: 'Zaragoza — PGOU 2024, Grado A1 (subgrados 3.1/3.2/4.1/4.2)',
        source: 'manual',
        crs: 'EPSG:25830',
        lastReviewed: '2026-08-03',
        defaultConfidence: ZARAGOZA_PACK_DEFAULT_CONFIDENCE,
        zones: [
            // ── A1/3.1 — Art. 4.1.12 (p.147-149) ────────────────────────────────────────────
            {
                code: 'A1/3.1',
                label: 'Zaragoza, Grado A1 subgrado 3.1 (PGOU 2024 Art. 4.1.12)',
                permittedUse: ['residential'],
                // Art. 4.1.12 — TABLE keyed on ancho de calle (see ZARAGOZA_A1_3_WIDTH_BANDS /
                // resolveZaragozaA13Height): <12 m → B+2/10,50 m/1,60; ≥12 m → B+3/13,50 m/2,10.
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: null,
                // Ocupación: sótano/semisótano 100 %, planta baja 75 %, PLANTAS ALZADAS 50 % — the
                // value packed (see the block comment above).
                maxCoverage: 0.5,
                setbacks: NULL_SETBACKS,
                // Fondo: plantas alzadas máx. 15 m (Art. 4.1.12); fondo mínimo 7,50 m per Art.
                // 4.1.3 applies only where nothing more specific is graphically ordered — the
                // pack ships the STATED 15 m maximum, never the 7,50 m floor (see the header).
                geometricRule: CLOSED_BLOCK_ALIGNMENT_15M,
                fieldProvenance: {
                    maxCoverage: ZARAGOZA_FIELD_PROVENANCE,
                    permittedUse: ZARAGOZA_FIELD_PROVENANCE,
                    'alignment.depth': ZARAGOZA_FIELD_PROVENANCE,
                },
                ordinanceRef:
                    'PGOU Zaragoza 2024, Art. 4.1.1 (alineación obligatoria a manzana cerrada), ' +
                    'Art. 4.1.3 (fondo mínimo 7,50 m donde no se ordene gráficamente; área de ' +
                    'movimiento por planta), Art. 4.1.12 (A1/3.1): parcela mínima 150 m² / 7 m ' +
                    'fachada [not modelled — no parcela-mínima field in the schema]; ocupación ' +
                    'sótano/semisótano 100 %, planta baja 75 %, plantas alzadas 50 % [only the ' +
                    '50 % plantas-alzadas figure is packed as maxCoverage]; fondo plantas alzadas ' +
                    'máx. 15 m; altura máxima por ancho de calle: <12 m → B+2, 10,50 m, ' +
                    'edificabilidad 1,60 m²/m²; ≥12 m → B+3, 13,50 m, edificabilidad 2,10 m²/m² ' +
                    '[TABLE, not packed as a scalar — see resolveZaragozaA13Height]; +1 planta ' +
                    'disponible vía estudio de detalle (Art. 4.1.6) [documented exception, NOT ' +
                    'implemented]; planta baja máx. 4,50 m; plantas alzadas mín. 2,80 m [not ' +
                    'modelled]; parcela esquina: ep = (1,60·l1 + 2,10·l2)/(l1+l2) [see ' +
                    'zaragozaA13WeightedEdificabilidad]. ' + SRC,
            },
            // ── A1/3.2 — Art. 4.1.13 (Travesías de Casetas y Santa Isabel, p.148-150) ───────
            {
                code: 'A1/3.2',
                label: 'Zaragoza, Grado A1 subgrado 3.2 — Travesías de Casetas y Santa Isabel (PGOU 2024 Art. 4.1.13)',
                permittedUse: ['residential'],
                // Same TABLE shape as A1/3.1 — Art. 4.1.13 states the same two bands verbatim.
                // ⚠ The travesía THIRD band is a NAMED GAP, not implemented — see
                // ZARAGOZA_A1_3_2_TRAVESIA_GAP.
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: null,
                maxCoverage: 0.5,
                setbacks: NULL_SETBACKS,
                geometricRule: CLOSED_BLOCK_ALIGNMENT_15M,
                fieldProvenance: {
                    maxCoverage: ZARAGOZA_FIELD_PROVENANCE,
                    permittedUse: ZARAGOZA_FIELD_PROVENANCE,
                    'alignment.depth': ZARAGOZA_FIELD_PROVENANCE,
                },
                ordinanceRef:
                    'PGOU Zaragoza 2024, Art. 4.1.1, Art. 4.1.3, Art. 4.1.13 (A1/3.2): same parcela ' +
                    'mínima / ocupación / fondo as A1/3.1 (Art. 4.1.12); altura máxima por ancho de ' +
                    'calle shares A1/3.1\'s two bands (<12 m → B+2, 10,50 m, 1,60 m²/m²; ≥12 m → ' +
                    'B+3, 13,50 m, 2,10 m²/m²) PLUS a THIRD band for named "Travesía de Casetas y ' +
                    'Santa Isabel" frontages (B+4, 16,50 m, edificabilidad 2,60 m²/m², ep = ' +
                    '(2,60·l1 + 2,10·l2 + 1,60·l3)/(l1+l2+l3)) — ⚠ KNOWN GAP: which streets qualify ' +
                    'as "Travesía de Casetas y Santa Isabel" is UNRESOLVED (no ordinance annex or ' +
                    'GIS street-naming layer inspected names them), so this pack ships the two ' +
                    'shared bands ONLY and omits the third — see ZARAGOZA_A1_3_2_TRAVESIA_GAP. ' +
                    SRC,
            },
            // ── A1/4.1 — Art. 4.1.15 (p.150-152) — FIXED height/edificabilidad, no table ────
            {
                code: 'A1/4.1',
                label: 'Zaragoza, Grado A1 subgrado 4.1 (PGOU 2024 Art. 4.1.15)',
                permittedUse: ['residential'],
                // Art. 4.1.15 — FIXED B+2, no street-width table.
                maxHeight_m: 10,
                maxFloors: 3, // planta baja + 2 plantas alzadas = 3 storeys total (B+2)
                plotRatioFAR: 1.15,
                // Ocupación: sótano 100 % (colectiva/equipamiento) or 75 % (unifamiliar); planta
                // baja 75 %; PLANTAS ALZADAS 50 % — the value packed.
                maxCoverage: 0.5,
                setbacks: NULL_SETBACKS,
                // Fondo: plantas alzadas máx. 15 m, fondo mínimo 7,50 m per Art. 4.1.3 — same
                // shape as A1/3.1.
                geometricRule: CLOSED_BLOCK_ALIGNMENT_15M,
                fieldProvenance: {
                    maxHeight: ZARAGOZA_FIELD_PROVENANCE,
                    maxFloors: ZARAGOZA_FIELD_PROVENANCE,
                    maxFAR: ZARAGOZA_FIELD_PROVENANCE,
                    maxCoverage: ZARAGOZA_FIELD_PROVENANCE,
                    permittedUse: ZARAGOZA_FIELD_PROVENANCE,
                    'alignment.depth': ZARAGOZA_FIELD_PROVENANCE,
                },
                ordinanceRef:
                    'PGOU Zaragoza 2024, Art. 4.1.1, Art. 4.1.3, Art. 4.1.15 (A1/4.1): parcela ' +
                    'mínima 120 m² / 6 m fachada (600 m² / 15 m para vivienda colectiva) [not ' +
                    'modelled]; ocupación sótano 100 % (colectiva/equipamiento) o 75 % ' +
                    '(unifamiliar), planta baja 75 %, plantas alzadas 50 % [50 % packed as ' +
                    'maxCoverage]; fondo plantas alzadas máx. 15 m, fondo mínimo 7,50 m (Art. ' +
                    '4.1.3); altura máxima FIJA B+2 (10 m), sin tabla por ancho de calle; ' +
                    'edificabilidad FIJA 1,15 m²/m². ' + SRC,
            },
            // ── A1/4.2 — Art. 4.1.17 (p.153-154) — "igual que en el grado A1-4.1" ──────────
            {
                code: 'A1/4.2',
                label: 'Zaragoza, Grado A1 subgrado 4.2 (PGOU 2024 Art. 4.1.17)',
                permittedUse: ['residential'],
                // Art. 4.1.17 — "Las mismas [alturas] que en el grado A1-4.1": FIXED B+2, no table.
                maxHeight_m: 10,
                maxFloors: 3, // B+2 = planta baja + 2
                plotRatioFAR: 1.15,
                // Ocupación: sótano/semisótano/planta baja 75 %; PLANTAS ALZADAS 50 % — packed.
                maxCoverage: 0.5,
                setbacks: NULL_SETBACKS,
                // Fondo: "Igual que en el grado A1-4.1" — Art. 4.1.3, plantas alzadas máx. 15 m.
                geometricRule: CLOSED_BLOCK_ALIGNMENT_15M,
                fieldProvenance: {
                    maxHeight: ZARAGOZA_FIELD_PROVENANCE,
                    maxFloors: ZARAGOZA_FIELD_PROVENANCE,
                    maxFAR: ZARAGOZA_FIELD_PROVENANCE,
                    maxCoverage: ZARAGOZA_FIELD_PROVENANCE,
                    permittedUse: ZARAGOZA_FIELD_PROVENANCE,
                    'alignment.depth': ZARAGOZA_FIELD_PROVENANCE,
                },
                ordinanceRef:
                    'PGOU Zaragoza 2024, Art. 4.1.1, Art. 4.1.3, Art. 4.1.17 (A1/4.2): parcela ' +
                    'mínima igual que A1/4.1; ocupación sótano/semisótano/planta baja 75 %, ' +
                    'plantas alzadas 50 % [50 % packed as maxCoverage]; fondo "igual que en el ' +
                    'grado A1-4.1" (Art. 4.1.3, plantas alzadas máx. 15 m); alturas "las mismas ' +
                    'que en el grado A1-4.1" — FIJA B+2 (10 m); edificabilidad FIJA 1,15 m²/m²; ' +
                    'densidad: unidades ≤ superficie edificable / 138 [NOT modelled — ' +
                    'ZoningRuleSchema carries no unit-density field]. ' + SRC,
            },
        ],
    });

/**
 * §ZGZ-A13-RESOLVED-PACK — turn ONE resolved ancho-de-calle band into a one-zone rule pack.
 *
 * A1/3.1 and A1/3.2 have no single height (`resolveZaragozaA13Height` above resolves the band for
 * a MEASURED street width) — this mirrors `murciaAnchoResolvedPack` (`esMurciaAnchoDeCalle.ts`)
 * exactly, down to why a per-parcel pack is not a hack: the ordinance's own numbers are only
 * knowable once a width has been measured for THIS parcel, and folding that into a
 * schema-validated `JurisdictionZoningContract` keeps `computeBuildableEnvelope` unchanged and
 * ignorant of Zaragoza.
 *
 * @param zoneCode  `'A1/3.1'` or `'A1/3.2'` — the resolved subgrado carries which article governs.
 * @param resolved  an `ok: true` `ZaragozaA13Resolution` from `resolveZaragozaA13Height`.
 * @param widthProvenanceNote  the CONSTRUCTED-width authority string from the street-width
 *   provider. It must REACH THE USER, so it is folded into `ordinanceRef` — never left in a log.
 */
export function zaragozaA13ResolvedPack(
    zoneCode: Extract<ZaragozaZoneCode, 'A1/3.1' | 'A1/3.2'>,
    resolved: Extract<ZaragozaA13Resolution, { ok: true }>,
    widthProvenanceNote: string,
): JurisdictionZoningContract {
    const article = zoneCode === 'A1/3.1' ? 'Art. 4.1.12' : 'Art. 4.1.13';
    const travesiaNote = zoneCode === 'A1/3.2' ? ` ${ZARAGOZA_A1_3_2_TRAVESIA_GAP}` : '';
    return JurisdictionZoningContractSchema.parse({
        jurisdictionId: ZARAGOZA_JURISDICTION_ID,
        displayName: `Zaragoza — PGOU 2024 ${article} (ancho de calle, resolved per parcel)`,
        source: 'manual',
        crs: 'EPSG:25830',
        lastReviewed: '2026-08-03',
        // §OPEN-TOP-INDICATIVE publishes AT THIS TIER and no higher — `authoritative` is unreachable.
        defaultConfidence: ZARAGOZA_PACK_DEFAULT_CONFIDENCE,
        zones: [{
            code: zoneCode,
            label: `${zoneCode} — PGOU 2024 ${article} (altura por ancho de calle)`,
            permittedUse: ['residential'],
            maxHeight_m: resolved.height_m,
            maxFloors: resolved.floorsAboveGround + 1, // + planta baja, matching Murcia's convention.
            plotRatioFAR: resolved.far,
            maxCoverage: 0.5, // plantas alzadas — see the block comment on the static A1/3.1 zone.
            setbacks: NULL_SETBACKS,
            geometricRule: CLOSED_BLOCK_ALIGNMENT_15M,
            fieldProvenance: {
                maxHeight: ZARAGOZA_FIELD_PROVENANCE,
                maxFloors: ZARAGOZA_FIELD_PROVENANCE,
                maxFAR: ZARAGOZA_FIELD_PROVENANCE,
                maxCoverage: ZARAGOZA_FIELD_PROVENANCE,
                permittedUse: ZARAGOZA_FIELD_PROVENANCE,
                'alignment.depth': ZARAGOZA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                `PGOU de Zaragoza 2024, ${article}: ancho de calle ${resolved.band.minWidth_m}` +
                `–${Number.isFinite(resolved.band.maxWidth_m) ? resolved.band.maxWidth_m : '∞'} m ` +
                `→ B+${resolved.floorsAboveGround}, ${resolved.height_m} m, edificabilidad ` +
                `${resolved.far} m²/m². Plantas alzadas máx. 15 m fondo (Art. 4.1.3).` +
                `${travesiaNote} ⚠ STREET WIDTH: ${widthProvenanceNote} ${SRC}`,
        }],
    });
}
