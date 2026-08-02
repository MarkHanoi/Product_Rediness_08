// ── MURCIA — the ANCHO-DE-CALLE height tables (PGOU Arts. 5.3.3 · 5.5.3 · 5.7.3 · 5.9.3). ────────
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHY IT IS NOT A SECOND SOLVER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `geometry/streetWidth.ts` (L-537 / ADR-0275) states its own contract: it is region-agnostic, it
// "takes rings and returns metres", and a new region supplies "(a) its own parcel/block source that
// can produce a block ring, (b) **its own height table keyed on street width**, and (c) optionally
// its own declared-width override list — none of which touch this file."
//
// **THIS FILE IS MURCIA'S (b), AND NOTHING ELSE.** It is the exact analogue of
// `bcnAlcadaReguladora.ts` for a different ordinance. It introduces NO new geometry, NO second
// measurement path, and NO Murcia branch anywhere in `ZoningRulesEngine` — per-city special-casing
// in the engine is the parallel wiring P1 forbids, and the width itself is produced by the shared
// module every Spanish city will use.
//
// It also REUSES `effectiveBandEdgeGuard_m` rather than declaring a second guard. That constant
// prices the gap between a GIS-measured frontage distance and the legally-declared figure it
// stands in for — a property of the MEASUREMENT TECHNIQUE, not of Barcelona. A second, free-to-
// disagree constant is precisely what `bcnAlcadaReguladora.ts` warns against in its own header.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SOURCE — filed in the repo, and re-readable (L-676)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// «PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA — Texto Refundido. diciembre 2012. VOLUMEN 11 —
// NORMAS URBANÍSTICAS», 205 pp. Filed at
//   docs/04-reference/jurisdictions/es/es-mc/30030-murcia/corpus/pdf/
//     PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf
//   SHA-256 ab71c65151571815ac1a1f63adb44c62969cff74a0d6448802da8098036594ab
// Every quote below was read from that file, and all four articles are BYTE-IDENTICAL in the
// municipality's second published consolidation (`corpus/INDEX.md` §2 — the supersession diff).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ PROVENANCE — THE TABLE IS STATED, THE WIDTH IS CONSTRUCTED, AND THEY MUST NOT BLUR
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADR-0271 exists to keep exactly this distinction (Barcelona's *profunditat edificable* is
// constructed and says so). Applied here:
//   • the BANDS below are `ordinance-pdf` — a human read them in the municipality's own normative
//     PDF and quoted them verbatim;
//   • the WIDTH fed in is `estimated` whenever it came from `measureStreetWidths` — a
//     frontage-to-frontage distance derived from published geometry, NOT the *ancho oficial*.
// So a resolution carries BOTH, separately, in `widthProvenance`. A consumer that renders the
// height without the width's tier would present a constructed input as a stated one, which is the
// L-459 failure. **`MURCIA_ANCHO_FIELD_PROVENANCE` is about the TABLE and never about the width.**
//
// ⚠ NOTHING HERE PUBLISHES AN ENVELOPE. SIG-MU1 authorises the 14 transcribed calificaciones on
// non-delegated soil and expressly does NOT authorise "resolving the street-width blocker" or "any
// number for the … REFUSED calificaciones" (`sources/VERIFICATION.md`). `RC` / base `RM` / `RN` /
// `RD1`'s third storey stay REFUSED until a founder signs SIG-MU2. This module is the pure half of
// that unlock, built so the signature is a one-line act rather than a code change.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock, no RNG. OTel span on the one
// exported resolver (P8 / C58 §1.10).
//
// Contracts: C58 §1.1/§1.4/§1.9/§1.12 · C63 · ADR-0270 · ADR-0271 · ADR-0275 · L-526 · L-586.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { effectiveBandEdgeGuard_m } from './bcnAlcadaReguladora.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The tier of the BANDS in this file. Never the tier of the width fed into them. */
export const MURCIA_ANCHO_FIELD_PROVENANCE = 'ordinance-pdf' as const;

/** Where the street width came from. The resolution echoes it so a caller cannot lose it. */
export type MurciaWidthProvenance =
    /** `measureStreetWidths` — frontage-to-frontage from published geometry. CONSTRUCTED. */
    | 'measured-geometry'
    /** An *ancho oficial* from a municipal street database. Murcia publishes none today. */
    | 'declared-official';

/** The calificaciones whose height is keyed on the street section. */
export type MurciaAnchoZone = 'RC' | 'RM' | 'RN' | 'RD1';

/**
 * One row of an ancho-de-calle table.
 *
 * ⚠ INCLUSIVITY IS ENCODED PER EDGE AND IT IS NOT PEDANTRY. The plan is not uniform: Art. 5.3.3
 * says *«calles MENORES DE 4 metros»* while Art. 5.7.3 says *«calles MENORES O IGUALES A 4
 * metros»*. At exactly 4.00 m `RC` gives 3 plantas and `RN` gives 2. A table that normalised the
 * comparison would publish one storey too many on every 4 m `RN` street in the pedanías.
 */
export interface MurciaAnchoBand {
    /** Lower bound in metres, or `null` for unbounded below. */
    readonly lo_m: number | null;
    /** Is `lo_m` itself inside this band? */
    readonly loInclusive: boolean;
    /** Upper bound in metres, or `null` for unbounded above. */
    readonly hi_m: number | null;
    /** Is `hi_m` itself inside this band? */
    readonly hiInclusive: boolean;
    readonly floors: number;
    readonly height_m: number;
    /**
     * Metres the TOP storey must be set back from the alineación, or `null` when the band grants
     * full floors. ⚠ A band with a value here does NOT grant `floors` full storeys — the last one
     * is recessed, and a consumer that extrudes `floors × footprint` would overstate the GFA.
     */
    readonly topStoreySetback_m: number | null;
    /** The article's own words for this row. INV-3: never paraphrased. */
    readonly quote: string;
}

/**
 * ⚠ THE OVERLAP AT EXACTLY 8.00 m IS THE ORDINANCE'S, NOT OURS.
 *
 * Art. 5.3.3 reads *«3 plantas (10 m) en calles de 4 a 8 metros»* and *«4 plantas (13 m) en calles
 * de 8 metros o mayor ancho»*. Both rows claim 8.00 m. We do not invent a tie-break: **Art. 1.1.4
 * supplies one**, and it is the plan's own rule of construction —
 *
 *   «…si existiere duda o imprecisión se estimará condicionante la interpretación más favorable a
 *    la menor edificabilidad…»
 *
 * — so an exact 8.00 m resolves DOWN, to 3 plantas, and the resolution says it did
 * (`ambiguityResolvedDown`). Resolving UP would publish a storey the plan declines to grant, which
 * is L-616 mechanism-A in miniature.
 */
export const MURCIA_ART_1_1_4_MENOR_EDIFICABILIDAD =
    'PGOU de Murcia, Art. 1.1.4 (Interpretación): «…si existiere duda o imprecisión se estimará ' +
    'condicionante la interpretación más favorable a la menor edificabilidad…»';

/** Art. 5.3.3 — `RC`, Casco Antiguo de Pedanía. */
export const MURCIA_RC_ANCHO_TABLE: ReadonlyArray<MurciaAnchoBand> = Object.freeze([
    {
        lo_m: null, loInclusive: false, hi_m: 4, hiInclusive: false,
        floors: 2, height_m: 7, topStoreySetback_m: null,
        quote: '2 plantas (7 m) en calles menores de 4 metros.',
    },
    {
        lo_m: 4, loInclusive: true, hi_m: 8, hiInclusive: true,
        floors: 3, height_m: 10, topStoreySetback_m: null,
        quote: '3 plantas (10 m) en calles de 4 a 8 metros..',
    },
    {
        lo_m: 8, loInclusive: true, hi_m: null, hiInclusive: false,
        floors: 4, height_m: 13, topStoreySetback_m: null,
        quote: '4 plantas (13 m) en calles de 8 metros o mayor ancho..',
    },
]);

/**
 * Art. 5.5.3 — base `RM`, Manzana Cerrada Tradicional.
 *
 * The first three rows are word-for-word Art. 5.3.3's. The FOURTH — *«5 plantas (16 m) en Ejes
 * Comerciales con sección mayor de 12 metros»* — is NOT in this table, deliberately: it needs a
 * second input (is this frontage an *Eje Comercial*?) that is a graphed classification, not a
 * width. It is handled by `ejeComercial` on the resolver's options, and when that input is absent
 * the resolver REFUSES rather than silently applying the 4-planta row to a street that may
 * qualify for 5. See `MURCIA_RM_EJE_COMERCIAL_BAND`.
 *
 * ⚠ `RM1` / `RM2` are NOT here. They are the two named subzones that ESCAPE the table entirely
 * («Se exceptúan de esta regla las manzanas calificadas RM1 y RM2…») and are already packed in
 * `esMurciaPgou2012.ts` at 8 pl/25 m and 5 pl/16 m. Routing them here would re-derive a stated
 * value from a constructed one — strictly worse.
 */
export const MURCIA_RM_ANCHO_TABLE: ReadonlyArray<MurciaAnchoBand> = MURCIA_RC_ANCHO_TABLE;

/** Art. 5.5.3's Eje-Comercial row. Requires the graphed classification AND a section > 12 m. */
export const MURCIA_RM_EJE_COMERCIAL_BAND: MurciaAnchoBand = Object.freeze({
    lo_m: 12, loInclusive: false, hi_m: null, hiInclusive: false,
    floors: 5, height_m: 16, topStoreySetback_m: null,
    quote: '5 plantas (16 m) en Ejes Comerciales con sección mayor de 12 metros.',
});

/**
 * Art. 5.7.3 — `RN`, Núcleo Rural Adaptado.
 *
 * ⚠ Note the boundary: *«menores o iguales a 4»* / *«mayores de 4»* — a clean partition, and the
 * OPPOSITE inclusivity to Art. 5.3.3 at the same 4 m figure. And the 3-planta row's top storey is
 * RECESSED 3 m, so it is not a third full floor.
 */
export const MURCIA_RN_ANCHO_TABLE: ReadonlyArray<MurciaAnchoBand> = Object.freeze([
    {
        lo_m: null, loInclusive: false, hi_m: 4, hiInclusive: true,
        floors: 2, height_m: 7, topStoreySetback_m: null,
        quote: '2 plantas (7 m) en calles menores o iguales a 4 metros.',
    },
    {
        lo_m: 4, loInclusive: false, hi_m: null, hiInclusive: false,
        floors: 3, height_m: 10, topStoreySetback_m: 3,
        quote: '3 plantas (10 m) en calles mayores de 4 metros, con la tercera planta retranqueada ' +
            'un mínimo de 3 metros respecto a las líneas de fachadas.',
    },
]);

/**
 * Art. 5.9.3 — `RD1`'s conditional third storey.
 *
 * `RD1` is ALREADY PACKED at 2 plantas / 7 m (`esMurciaPgou2012.ts`), which is the unconditional
 * floor. This table only adds what a width unlocks on top of it, and the extra storey is recessed
 * 3 m — so it is an allowance, not a third full floor.
 */
export const MURCIA_RD1_ANCHO_TABLE: ReadonlyArray<MurciaAnchoBand> = Object.freeze([
    {
        lo_m: null, loInclusive: false, hi_m: 8, hiInclusive: false,
        floors: 2, height_m: 7, topStoreySetback_m: null,
        quote: 'En la subzona RD1, sin aplicación del anterior índice de edificabilidad, la altura ' +
            'máxima será de 2 plantas (7 metros de altura de cornisa)',
    },
    {
        lo_m: 8, loInclusive: true, hi_m: null, hiInclusive: false,
        floors: 3, height_m: 10, topStoreySetback_m: 3,
        quote: 'salvo en calles de 8 metros de ancho o superior, donde se permitirá una tercera ' +
            'planta retranqueada 3 metros de la alineación exterior de fachada.',
    },
]);

/** The table + its governing article, by calificación. */
export const MURCIA_ANCHO_TABLES: ReadonlyMap<
    MurciaAnchoZone,
    { readonly article: string; readonly bands: ReadonlyArray<MurciaAnchoBand> }
> = new Map([
    ['RC', { article: 'Art. 5.3.3', bands: MURCIA_RC_ANCHO_TABLE }],
    ['RM', { article: 'Art. 5.5.3', bands: MURCIA_RM_ANCHO_TABLE }],
    ['RN', { article: 'Art. 5.7.3', bands: MURCIA_RN_ANCHO_TABLE }],
    ['RD1', { article: 'Art. 5.9.3', bands: MURCIA_RD1_ANCHO_TABLE }],
] as const);

/** What resolving a width against a Murcia table yields. */
export type MurciaAnchoResolution =
    | {
          readonly ok: true;
          readonly zone: MurciaAnchoZone;
          readonly article: string;
          readonly floors: number;
          readonly height_m: number;
          /** ⚠ Non-null ⇒ the TOP storey is recessed. `floors × footprint` would overstate GFA. */
          readonly topStoreySetback_m: number | null;
          readonly band: MurciaAnchoBand;
          /** Echoed so a consumer cannot render the height without the width's tier (ADR-0271). */
          readonly widthProvenance: MurciaWidthProvenance;
          /** TRUE when two rows claimed the width and Art. 1.1.4 chose the lower. */
          readonly ambiguityResolvedDown: boolean;
          /** The citation to print when `ambiguityResolvedDown`, else `null`. */
          readonly ambiguityRef: string | null;
      }
    | {
          readonly ok: false;
          readonly zone: MurciaAnchoZone;
          readonly article: string;
          /**
           * `bad-input`          — not a usable positive finite width.
           * `band-edge`          — the width sits within the effective guard of a boundary, so a
           *                        MEASURED value cannot choose the storey band. The bands are
           *                        steps: one metre is a whole storey here.
           * `needs-eje-comercial`— base `RM` on a section > 12 m, with no answer to "is this
           *                        frontage a graphed Eje Comercial?". Applying the 4-planta row
           *                        would silently deny a storey the plan may grant; applying the
           *                        5-planta row would grant one it may not. Both are claims we
           *                        cannot make, so we make neither.
           * `no-band`            — the width fell outside every row (a table gap). Recorded rather
           *                        than clamped to the nearest row.
           */
          readonly reason: 'bad-input' | 'band-edge' | 'needs-eje-comercial' | 'no-band';
          /** Candidate heights straddling the edge, for an honest "we cannot say" message. */
          readonly straddles: readonly number[];
      };

/** Does `w` fall inside `b`? Inclusivity is per edge and is read from the band, never assumed. */
function withinBand(w: number, b: MurciaAnchoBand): boolean {
    if (b.lo_m !== null && (b.loInclusive ? w < b.lo_m : w <= b.lo_m)) return false;
    if (b.hi_m !== null && (b.hiInclusive ? w > b.hi_m : w >= b.hi_m)) return false;
    return true;
}

/** Every finite boundary in a table — the values a measured width must not sit on top of. */
function bandEdges(bands: ReadonlyArray<MurciaAnchoBand>): number[] {
    const out = new Set<number>();
    for (const b of bands) {
        if (b.lo_m !== null) out.add(b.lo_m);
        if (b.hi_m !== null) out.add(b.hi_m);
    }
    return [...out].sort((a, b) => a - b);
}

/**
 * Resolve a Murcia street width to the storeys/height its calificación's table grants.
 *
 * PURE (same input ⇒ byte-identical output), never throws. OTel span
 * `pryzm.zoning.resolveMurciaAnchoDeCalle` (P8 / C58 §1.10).
 *
 * ⚠ IT NEVER CLAMPS TO THE NEAREST BAND AND NEVER PICKS A DEFAULT WIDTH. An unusable input returns
 * `ok: false`, which the caller renders as a cited refusal. A fabricated width would silently move
 * every envelope across 8.81 % of Murcia's buildable land — the L-526 failure verbatim.
 *
 * @param zone     the calificación whose table governs.
 * @param width_m  the street section in metres.
 * @param opts.widthProvenance  where `width_m` came from. `measured-geometry` (the default) engages
 *   the band-edge guard; `declared-official` skips it, because an official width is exact by
 *   definition and may legitimately sit ON an edge. **Murcia publishes no official width today**
 *   (`corpus/RETRIEVAL-LOG.md` §3), so passing `declared-official` currently asserts a source that
 *   does not exist — it is here for the day one appears, not as a way around the guard.
 * @param opts.measurementSpread_m  the measurement's OWN error bar
 *   (`StreetWidthMeasurement.spread_m`). Widens the guard when larger; never narrows it (L-586).
 * @param opts.ejeComercial  base-`RM` only: is this frontage a graphed *Eje Comercial*? `null`/
 *   omitted means UNKNOWN, which refuses above 12 m rather than guessing.
 */
export function resolveMurciaAnchoDeCalle(
    zone: MurciaAnchoZone,
    width_m: number,
    opts: {
        widthProvenance?: MurciaWidthProvenance;
        measurementSpread_m?: number | null;
        ejeComercial?: boolean | null;
    } = {},
): MurciaAnchoResolution {
    const span = tracer.startSpan('pryzm.zoning.resolveMurciaAnchoDeCalle');
    try {
        const entry = MURCIA_ANCHO_TABLES.get(zone)!;
        const article = entry.article;
        const widthProvenance: MurciaWidthProvenance = opts.widthProvenance ?? 'measured-geometry';
        span.setAttribute('zone', zone);
        span.setAttribute('widthProvenance', widthProvenance);

        if (typeof width_m !== 'number' || !Number.isFinite(width_m) || width_m <= 0) {
            span.setAttribute('resultFields', 'bad-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, zone, article, reason: 'bad-input', straddles: [] };
        }
        span.setAttribute('width_m', width_m);

        // The Eje-Comercial fork FIRST: above 12 m, base RM's answer depends on a classification
        // this function was not given, and no width can substitute for it.
        if (zone === 'RM' && withinBand(width_m, MURCIA_RM_EJE_COMERCIAL_BAND)) {
            if (opts.ejeComercial === true) {
                span.setAttribute('resultFields', 'eje-comercial');
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    ok: true, zone, article,
                    floors: MURCIA_RM_EJE_COMERCIAL_BAND.floors,
                    height_m: MURCIA_RM_EJE_COMERCIAL_BAND.height_m,
                    topStoreySetback_m: MURCIA_RM_EJE_COMERCIAL_BAND.topStoreySetback_m,
                    band: MURCIA_RM_EJE_COMERCIAL_BAND,
                    widthProvenance, ambiguityResolvedDown: false, ambiguityRef: null,
                };
            }
            if (opts.ejeComercial !== false) {
                span.setAttribute('resultFields', 'needs-eje-comercial');
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    ok: false, zone, article, reason: 'needs-eje-comercial',
                    straddles: [13, MURCIA_RM_EJE_COMERCIAL_BAND.height_m],
                };
            }
            // ejeComercial === false ⇒ the ordinary table governs; fall through.
        }

        // ── The band-edge guard. The bands are STEPS: at 8 m an RC parcel moves 10 m → 13 m, a
        // whole storey, so a measurement that cannot tell which side it is on must not choose.
        const guard = effectiveBandEdgeGuard_m(opts.measurementSpread_m);
        if (widthProvenance === 'measured-geometry') {
            const edge = bandEdges(entry.bands).find((e) => Math.abs(width_m - e) < guard);
            if (edge !== undefined) {
                const straddles = entry.bands
                    .filter((b) => withinBand(edge - guard / 2, b) || withinBand(edge + guard / 2, b))
                    .map((b) => b.height_m);
                span.setAttribute('resultFields', 'band-edge');
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    ok: false, zone, article, reason: 'band-edge',
                    straddles: [...new Set(straddles)].sort((a, b) => a - b),
                };
            }
        }

        const matches = entry.bands.filter((b) => withinBand(width_m, b));
        if (matches.length === 0) {
            span.setAttribute('resultFields', 'no-band');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, zone, article, reason: 'no-band', straddles: [] };
        }
        // Art. 1.1.4 — doubt resolves toward the LESSER edificabilidad, so on an overlap take the
        // row granting the fewest storeys. Deterministic and cited, never "the first match".
        const chosen = matches.reduce((a, b) => (b.floors < a.floors ? b : a));
        const ambiguityResolvedDown = matches.length > 1;
        span.setAttribute('resultFields', 'band');
        span.setAttribute('floors', chosen.floors);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true, zone, article,
            floors: chosen.floors,
            height_m: chosen.height_m,
            topStoreySetback_m: chosen.topStoreySetback_m,
            band: chosen,
            widthProvenance,
            ambiguityResolvedDown,
            ambiguityRef: ambiguityResolvedDown ? MURCIA_ART_1_1_4_MENOR_EDIFICABILIDAD : null,
        };
    } finally {
        span.end();
    }
}
